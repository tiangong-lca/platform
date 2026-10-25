#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ROOT_ENV_FILE="${REPO_ROOT}/.env"
DOCKER_ENV_FILE="${REPO_ROOT}/docker/.env"
WORKER_ENV_FILE="$(cd -- "${REPO_ROOT}/.." && pwd)/worker/.env"
LEGACY_WORKER_ENV_FILE="$(cd -- "${REPO_ROOT}/.." && pwd)/tiangong-lca-worker/.env"
LEGACY_CALCULATOR_ENV_FILE="$(cd -- "${REPO_ROOT}/.." && pwd)/tiangong-lca-calculator/.env"

DEFAULT_INPUT_FILE="${REPO_ROOT}/docker/volumes/db/init/data.sql"
DEFAULT_OUTPUT_FILE="${REPO_ROOT}/docker/volumes/db/init/data_desensitized.sql"

INPUT_FILE="${DEFAULT_INPUT_FILE}"
OUTPUT_FILE="${DEFAULT_OUTPUT_FILE}"
IN_PLACE=0
CREATE_BACKUP=1
STRICT=0
QUIET=0
PRINT_REMOTE_DB_URL=0

lookup_env_key_from_file() {
  local env_file="$1"
  local key="$2"
  awk -v key="${key}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line = $0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      pattern = "^[[:space:]]*" key "[[:space:]]*="
      if (line ~ pattern) {
        sub(pattern, "", line)
        sub(/^[[:space:]]*/, "", line)
        print line
        exit
      }
    }
  ' "${env_file}" 2>/dev/null || true
}

trim_wrapping_quotes() {
  local val="$1"
  val="${val%$'\r'}"
  if [[ "${val}" == \"*\" && "${val}" == *\" ]]; then
    val="${val#\"}"
    val="${val%\"}"
  elif [[ "${val}" == \'*\' && "${val}" == *\' ]]; then
    val="${val#\'}"
    val="${val%\'}"
  fi
  printf '%s' "${val}"
}

resolve_remote_db_url() {
  local candidate="${REMOTE_DB_URL:-${SUPABASE_REMOTE_DB_URL:-${SUPABASE_DB_URL:-${CONN:-}}}}"
  local env_file=""
  local key=""

  candidate="$(trim_wrapping_quotes "${candidate}")"
  if [[ -n "${candidate}" ]]; then
    printf '%s' "${candidate}"
    return 0
  fi

  for env_file in "${DOCKER_ENV_FILE}" "${ROOT_ENV_FILE}" "${WORKER_ENV_FILE}" "${LEGACY_WORKER_ENV_FILE}" "${LEGACY_CALCULATOR_ENV_FILE}"; do
    [[ -f "${env_file}" ]] || continue
    for key in REMOTE_DB_URL SUPABASE_REMOTE_DB_URL SUPABASE_DB_URL CONN; do
      candidate="$(lookup_env_key_from_file "${env_file}" "${key}")"
      candidate="$(trim_wrapping_quotes "${candidate}")"
      if [[ -n "${candidate}" ]]; then
        printf '%s' "${candidate}"
        return 0
      fi
    done
  done

  return 0
}

show_help() {
  cat <<'EOF'
Data.sql Desensitization Script

Usage:
  desensitize_data.sql.sh [options]

Options:
  -i, --input FILE      Input SQL file. Default: docker/volumes/db/init/data.sql
  -o, --output FILE     Output SQL file. Default: docker/volumes/db/init/data_desensitized.sql
      --in-place        Overwrite input file directly.
      --no-backup       Do not create backup file.
      --strict          Exit non-zero if sensitive patterns remain after replacement.
      --print-remote-db-url
                         Print the resolved REMOTE_DB_URL from shell env / .env lookup and exit.
  -q, --quiet           Reduce log output.
  -h, --help            Show this help.

Examples:
  ./docker/desensitize_data.sql.sh
  ./docker/desensitize_data.sql.sh --in-place --no-backup --strict
  ./docker/desensitize_data.sql.sh -i /tmp/raw.sql -o /tmp/safe.sql
  ./docker/desensitize_data.sql.sh --print-remote-db-url
EOF
}

log() {
  if [[ "${QUIET}" != "1" ]]; then
    echo "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[desensitize] --input requires a file path" >&2
        exit 1
      fi
      INPUT_FILE="${2}"
      shift 2
      ;;
    -o|--output)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "[desensitize] --output requires a file path" >&2
        exit 1
      fi
      OUTPUT_FILE="${2}"
      shift 2
      ;;
    --in-place)
      IN_PLACE=1
      shift
      ;;
    --no-backup)
      CREATE_BACKUP=0
      shift
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    --print-remote-db-url)
      PRINT_REMOTE_DB_URL=1
      shift
      ;;
    -q|--quiet)
      QUIET=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "[desensitize] unknown option: $1" >&2
      show_help >&2
      exit 1
      ;;
  esac
done

RESOLVED_REMOTE_DB_URL="$(resolve_remote_db_url)"
if [[ -n "${RESOLVED_REMOTE_DB_URL}" ]]; then
  export REMOTE_DB_URL="${RESOLVED_REMOTE_DB_URL}"
fi

if [[ "${PRINT_REMOTE_DB_URL}" == "1" ]]; then
  printf '%s\n' "${REMOTE_DB_URL:-}"
  exit 0
fi

if [[ -z "${INPUT_FILE}" ]]; then
  echo "[desensitize] input file is required" >&2
  exit 1
fi

if [[ "${IN_PLACE}" == "1" ]]; then
  OUTPUT_FILE="${INPUT_FILE}"
fi

if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "[desensitize] input file does not exist: ${INPUT_FILE}" >&2
  exit 1
fi

OUTPUT_DIR="$(dirname -- "${OUTPUT_FILE}")"
mkdir -p "${OUTPUT_DIR}"

VALIDATOR="${SCRIPT_DIR}/scripts/validate-sql-egress.cjs"
if [[ ! -f "${VALIDATOR}" ]] || ! command -v node >/dev/null 2>&1; then
  echo "[desensitize] Node.js and the SQL target validator are required" >&2
  exit 1
fi

# Keep the temporary file beside its destination so the final rename is atomic.
TMP_FILE="$(mktemp "${OUTPUT_DIR}/.data-sql.XXXXXX")"
trap 'rm -f "${TMP_FILE}"' EXIT

log "[desensitize] replacing sensitive patterns..."

# 1) x_key values in embedded JSON payloads.
# 2) apikey values that start with sb_secret_ in embedded JSON payloads.
# 3) any remaining sb_secret_* tokens in plain SQL text.
sed -E \
  -e 's/"x_key"[[:space:]]*:[[:space:]]*"[^"]*"/"x_key":"edge-functions-key"/g' \
  -e 's/"apikey"[[:space:]]*:[[:space:]]*"sb_secret_[^"]*"/"apikey":"edge-functions-key"/g' \
  -e 's/sb_secret_[A-Za-z0-9._-]+/sb_secret_REDACTED/g' \
  "${INPUT_FILE}" > "${TMP_FILE}"

# Outbound-target validation applies to default and strict invocations alike.
# No backup or destination is changed before all checks have passed.
node "${VALIDATOR}" "${TMP_FILE}"

leftover_sb_secret="$(grep -nE 'sb_secret_[A-Za-z0-9._-]+' "${TMP_FILE}" | grep -v 'sb_secret_REDACTED' || true)"
leftover_x_key="$(grep -nE '"x_key"[[:space:]]*:[[:space:]]*"[^"]*"' "${TMP_FILE}" | grep -v '"x_key":"edge-functions-key"' || true)"

if [[ -n "${leftover_sb_secret}" || -n "${leftover_x_key}" ]]; then
  echo "[desensitize] warning: sensitive credential patterns remain; values are not logged" >&2
  if [[ "${STRICT}" == "1" ]]; then
    exit 2
  fi
fi

if [[ "${CREATE_BACKUP}" == "1" ]]; then
  BACKUP_FILE="${INPUT_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp -- "${INPUT_FILE}" "${BACKUP_FILE}"
  log "[desensitize] backup created: ${BACKUP_FILE}"
fi

node -e 'const fs = require("node:fs"); fs.chmodSync(process.argv[1], fs.statSync(fs.existsSync(process.argv[2]) ? process.argv[2] : process.argv[3]).mode & 0o777);' "${TMP_FILE}" "${OUTPUT_FILE}" "${INPUT_FILE}"
mv -f -- "${TMP_FILE}" "${OUTPUT_FILE}"

log "[desensitize] done: ${OUTPUT_FILE}"
