#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  loadQualificationClosureContract,
  qualificationAssertionFailures,
  qualificationCleanupFailures,
  qualificationCoverageFailures,
  qualificationReportFailures,
  readQualificationReportReceipt,
} = require('./qualification-closure.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const RUNTIME_ROOT = path.join(REPOSITORY_ROOT, '.local/e2e-release');
const RUNS_ROOT = path.join(RUNTIME_ROOT, 'runs');
const BUILD_ROOT = path.join(RUNTIME_ROOT, 'build');
const RECEIPT_PATH = path.join(RUNTIME_ROOT, 'continuation-receipt.json');
const RECEIPT_KEY_PATH = path.join(RUNTIME_ROOT, 'continuation-receipt.key');
const INVOCATION_LOCK_PATH = path.join(RUNTIME_ROOT, 'invocation.lock');
const ENVIRONMENT_MANIFEST_PATH = path.join(RUNTIME_ROOT, 'environment-manifest.json');
const DEFAULT_QUALIFICATION_PROOF_PATH = path.join(RUNTIME_ROOT, 'qualification-proof.json');
const QUALIFICATION_PROOF_SCHEMA_VERSION = 'tiangong.semantic-harness-qualification.v6';
const ENVIRONMENT_CONTRACT_RELATIVE_PATH = 'docker/e2e/environment.json';
const DOCKERFILE_RELATIVE_PATH = 'docker/e2e/Dockerfile';
const QUALIFICATION_ENVIRONMENT_RELATIVE_PATH = 'docker/e2e/qualification.env';
const OFFICIAL_MAIN_ENVIRONMENT_PATH = 'config/environments/main.env';
const DEPENDENCY_LOCK_RELATIVE_PATH = 'pnpm-lock.yaml';
const PNPM_WORKSPACE_RELATIVE_PATH = 'pnpm-workspace.yaml';
const RECEIPT_TTL_MS = 60 * 60 * 1000;
const RECEIPT_SCHEMA_VERSION = 6;
const MANIFEST_SCHEMA_VERSION = 5;
const REPORT_SCHEMA_VERSION = 2;
const CANONICAL_REPOSITORY = 'tiangong-lca/platform';
const IMAGE_LABEL = 'org.tiangong.lca.next.release-e2e';
const ENVIRONMENT_IMAGE_LABEL = 'org.tiangong.lca.next.release-e2e-environment';
const DEFAULT_RECOVERY_LEDGER_PATH = path.join(
  os.homedir(),
  '.local/state/tiangong-lca-next/e2e-production-ledger.json',
);
// Foreign repository bindings must never redirect qualification git reads; runtime
// account configuration (GIT_CONFIG_COUNT/GIT_CONFIG_PARAMETERS and
// GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n> pairs) is preserved for the known root.
const GIT_REPOSITORY_BINDING_KEYS = [
  'GIT_CONFIG',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
];

function boundGitEnvironment(root, environment = process.env) {
  const bound = { ...environment };
  GIT_REPOSITORY_BINDING_KEYS.forEach((key) => delete bound[key]);
  // The known root gets an explicit work tree so inherited core.worktree or
  // core.bare bindings cannot redirect qualification reads.
  bound.GIT_WORK_TREE = root;
  return bound;
}

const EXIT = Object.freeze({
  INPUT: 2,
  ENVIRONMENT: 10,
  CANDIDATE: 20,
  SAFETY: 30,
  BROWSER: 40,
  FINALIZATION: 50,
});

class ReleaseE2EError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'ReleaseE2EError';
    this.exitCode = options.exitCode ?? EXIT.FINALIZATION;
    this.failureCode = options.failureCode ?? 'E2E_UNCLASSIFIED_FAILURE';
    this.phase = options.phase ?? 'finalization';
    this.retryable = Boolean(options.retryable);
    this.receiptEligible = Boolean(options.receiptEligible);
    this.nextCommand = options.nextCommand;
    this.details = options.details;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, stableJson(child)]),
  );
}

function jsonText(value) {
  return `${JSON.stringify(stableJson(value), null, 2)}\n`;
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, jsonText(value), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function writePrivateFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, value, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function writeBuildFile(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, value, { encoding: 'utf8', mode });
  fs.chmodSync(filePath, mode);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function lockRetryCommand(command) {
  return {
    clean: 'pnpm e2e:env:clean',
    'check-qualification': 'pnpm release:proof:verify',
    install: 'pnpm e2e:env:install',
    qualify: 'pnpm e2e:qualify',
    resume: 'pnpm e2e:release:resume',
    run: 'pnpm e2e:release',
  }[command];
}

function acquireInvocationLock(command, lockPath = INVOCATION_LOCK_PATH) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = readJson(path.join(lockPath, 'owner.json'));
      } catch {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs < 30_000) {
          throw new ReleaseE2EError(
            'Another release E2E command is acquiring the invocation lock.',
            {
              exitCode: EXIT.ENVIRONMENT,
              failureCode: 'E2E_INVOCATION_LOCKED',
              phase: 'coordination',
              retryable: true,
              nextCommand: lockRetryCommand(command),
            },
          );
        }
      }
      if (owner && processIsRunning(owner.pid)) {
        throw new ReleaseE2EError('Another release E2E command is already active.', {
          details: {
            activeCommand: owner.command,
            activePid: owner.pid,
            startedAt: owner.startedAt,
          },
          exitCode: EXIT.ENVIRONMENT,
          failureCode: 'E2E_INVOCATION_LOCKED',
          phase: 'coordination',
          retryable: true,
          nextCommand: lockRetryCommand(command),
        });
      }
      fs.rmSync(lockPath, { force: true, recursive: true });
      continue;
    }

    const nonce = crypto.randomUUID();
    writePrivateJson(path.join(lockPath, 'owner.json'), {
      command,
      hostname: os.hostname(),
      nonce,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        const owner = readJson(path.join(lockPath, 'owner.json'));
        if (owner.nonce === nonce) fs.rmSync(lockPath, { force: true, recursive: true });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    };
  }
  throw new ReleaseE2EError('Unable to acquire the release E2E invocation lock.', {
    exitCode: EXIT.ENVIRONMENT,
    failureCode: 'E2E_INVOCATION_LOCK_FAILED',
    phase: 'coordination',
    retryable: true,
    nextCommand: lockRetryCommand(command),
  });
}

function executableExists(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return !result.error && result.status === 0;
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return {
    status: result.status ?? 1,
    stderr: String(result.stderr || ''),
    stdout: String(result.stdout || ''),
  };
}

function runStreaming(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    env: options.env ?? process.env,
    stdio: ['ignore', 2, 2],
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function git(args, options = {}) {
  return runCapture('git', args, {
    ...options,
    env: boundGitEnvironment(REPOSITORY_ROOT, options.env ?? process.env),
  }).stdout.trim();
}

function gitShow(relativePath) {
  // Raw stdout is preserved (no trim) so original file content and newlines survive.
  return runCapture('git', ['show', `HEAD:${relativePath}`], {
    env: boundGitEnvironment(REPOSITORY_ROOT),
  }).stdout;
}

function lockedDependencyVersion(packageName, repositoryRoot = REPOSITORY_ROOT) {
  const output = runCapture(
    'pnpm',
    ['list', '--lockfile-only', '--depth=0', '--json', packageName],
    { cwd: repositoryRoot },
  ).stdout;
  let projects;
  try {
    projects = JSON.parse(output);
  } catch (error) {
    throw new ReleaseE2EError('pnpm did not return a valid locked dependency inventory.', {
      cause: error,
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_DEPENDENCY_LOCK_INVALID',
      phase: 'candidate',
    });
  }
  const candidates = (Array.isArray(projects) ? projects : [projects]).flatMap((project) =>
    ['dependencies', 'devDependencies', 'optionalDependencies']
      .map((section) => project?.[section]?.[packageName]?.version)
      .filter((version) => typeof version === 'string' && version.length > 0),
  );
  if (new Set(candidates).size !== 1) {
    throw new ReleaseE2EError(`pnpm lock has no unique ${packageName} version.`, {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_DEPENDENCY_LOCK_AMBIGUOUS',
      phase: 'candidate',
    });
  }
  return candidates[0];
}

function digestCommittedTree(relativeDirectory) {
  const paths = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', relativeDirectory])
    .split(/\r?\n/u)
    .filter(Boolean)
    .sort();
  if (paths.length === 0) {
    throw new ReleaseE2EError(`Candidate snapshot directory is empty: ${relativeDirectory}`, {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_CANDIDATE_TREE_EMPTY',
      phase: 'candidate',
    });
  }
  const entries = paths.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath))),
  }));
  return sha256(`${JSON.stringify(entries)}\n`);
}

function commandHelp() {
  return [
    'Deterministic Tiangong Next release E2E controller',
    '',
    'Usage:',
    '  pnpm e2e:env:install [--format json] [--output <path>]',
    '  pnpm e2e:env:doctor [--format json] [--output <path>]',
    '  pnpm e2e:release [options]',
    '  pnpm e2e:qualification:key [--format human|json] [--output <path>]',
    '  pnpm e2e:qualify [--offline] [--proof <path>] [--format human|json]',
    '  pnpm release:proof:verify [--proof <path>] [--format human|json]',
    '  pnpm e2e:release:resume',
    '  pnpm e2e:env:clean [--purge-images]',
    '  pnpm e2e:dev [Playwright arguments]',
    '',
    'Release options:',
    '  --authenticated                 Validate a role-neutral UI login identity.',
    '  --allow-production-data         Authorize one guarded fixture create/delete lifecycle.',
    '  --write-verified-evidence       Persist full authenticated release evidence.',
    '  --users-env-file <path>         Read credentials from a protected runtime-only env file.',
    '  --role <name>                   Select a credential entry; defaults to user.',
    '  --recovery-ledger <path>        Absolute crash-recovery ledger path outside the candidate.',
    '  --project <name>                Focus one browser project (diagnostic scope only).',
    '  --spec <path>                   Focus one spec path (diagnostic scope only).',
    '  --grep <pattern>                Focus matching tests (diagnostic scope only).',
    '  --repeat-each <1-5>             Repeat a focused read-only scope to reproduce a race.',
    '  --offline                       Never pull; fail if the pinned image/cache is unavailable.',
    '  --proof <path>                  Read or write the external qualification proof.',
    '  --format human|json             Keep stdout human-readable or emit one JSON object.',
    '  --output <path>                 Also write the sanitized controller report.',
    '',
    'Resume intentionally accepts no options. It revalidates the exact one-hour receipt, clean',
    'candidate, environment, image, and original arguments, then reruns preflight.',
  ].join('\n');
}

function takeValue(argv, index, flag, inlineValue) {
  if (inlineValue !== undefined) return { nextIndex: index, value: inlineValue };
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new ReleaseE2EError(`Missing value for --${flag}.`, {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_MISSING_OPTION_VALUE',
      phase: 'input',
      nextCommand: 'pnpm e2e:release --help',
    });
  }
  return { nextIndex: index + 1, value };
}

function parseOptions(command, argv) {
  if (command === 'resume' && argv.length > 0) {
    throw new ReleaseE2EError(
      'Resume accepts no arguments; it reuses the exact saved invocation.',
      {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_RESUME_ARGUMENTS_FORBIDDEN',
        phase: 'input',
        nextCommand: 'pnpm e2e:release:resume',
      },
    );
  }
  const options = {
    allowProductionData: false,
    authenticated: false,
    format: 'human',
    grep: undefined,
    help: false,
    offline: false,
    output: undefined,
    proof: undefined,
    project: undefined,
    purgeImages: false,
    recoveryLedger: DEFAULT_RECOVERY_LEDGER_PATH,
    repeatEach: undefined,
    role: 'user',
    spec: undefined,
    usersEnvFile: undefined,
    writeVerifiedEvidence: false,
  };
  const allowedFlags = {
    clean: new Set(['format', 'help', 'output', 'purge-images']),
    'check-qualification': new Set(['format', 'help', 'output', 'proof']),
    doctor: new Set(['format', 'help', 'output']),
    install: new Set(['format', 'help', 'offline', 'output']),
    'qualification-key': new Set(['format', 'help', 'output']),
    qualify: new Set(['format', 'help', 'offline', 'output', 'proof']),
    resume: new Set(),
    run: new Set([
      'allow-production-data',
      'authenticated',
      'format',
      'grep',
      'help',
      'offline',
      'output',
      'project',
      'recovery-ledger',
      'repeat-each',
      'role',
      'spec',
      'users-env-file',
      'write-verified-evidence',
    ]),
  };
  const commandFlags = allowedFlags[command];
  if (!commandFlags) {
    throw new ReleaseE2EError(`Unknown command: ${command}`, {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_UNKNOWN_COMMAND',
      phase: 'input',
    });
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new ReleaseE2EError(`Unexpected positional argument: ${argument}`, {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_UNEXPECTED_ARGUMENT',
        phase: 'input',
        nextCommand: `pnpm e2e:${command === 'run' ? 'release' : `env:${command}`} --help`,
      });
    }
    const separator = argument.indexOf('=');
    const flag = argument.slice(2, separator === -1 ? undefined : separator);
    const inlineValue = separator === -1 ? undefined : argument.slice(separator + 1);
    if (!commandFlags.has(flag)) {
      throw new ReleaseE2EError(`Option --${flag} is not valid for ${command}.`, {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_OPTION_NOT_ALLOWED',
        phase: 'input',
      });
    }
    if (
      inlineValue !== undefined &&
      [
        'allow-production-data',
        'authenticated',
        'help',
        'offline',
        'purge-images',
        'write-verified-evidence',
      ].includes(flag)
    ) {
      throw new ReleaseE2EError(`Boolean option --${flag} does not accept a value.`, {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_BOOLEAN_OPTION_VALUE_FORBIDDEN',
        phase: 'input',
      });
    }
    if (flag === 'authenticated') options.authenticated = true;
    else if (flag === 'allow-production-data') options.allowProductionData = true;
    else if (flag === 'write-verified-evidence') options.writeVerifiedEvidence = true;
    else if (flag === 'offline') options.offline = true;
    else if (flag === 'purge-images') options.purgeImages = true;
    else if (
      [
        'format',
        'output',
        'project',
        'proof',
        'spec',
        'grep',
        'users-env-file',
        'role',
        'recovery-ledger',
        'repeat-each',
      ].includes(flag)
    ) {
      const { nextIndex, value } = takeValue(argv, index, flag, inlineValue);
      index = nextIndex;
      const property =
        {
          'users-env-file': 'usersEnvFile',
          'recovery-ledger': 'recoveryLedger',
          'repeat-each': 'repeatEach',
        }[flag] ?? flag;
      options[property] = value;
    } else {
      throw new ReleaseE2EError(`Unknown option: --${flag}`, {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_UNKNOWN_OPTION',
        phase: 'input',
        nextCommand: 'pnpm e2e:release --help',
      });
    }
  }

  if (!['human', 'json'].includes(options.format)) {
    throw new ReleaseE2EError('--format must be human or json.', {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_INVALID_FORMAT',
      phase: 'input',
    });
  }
  return options;
}

function validateRunOptions(options) {
  if (options.allowProductionData && !options.authenticated) {
    throw new ReleaseE2EError('--allow-production-data requires --authenticated.', {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_PRODUCTION_DATA_REQUIRES_AUTH',
      phase: 'input',
    });
  }
  if (options.writeVerifiedEvidence && !options.allowProductionData) {
    throw new ReleaseE2EError(
      '--write-verified-evidence requires --authenticated and --allow-production-data.',
      {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_EVIDENCE_REQUIRES_FULL_CLOSURE',
        phase: 'input',
      },
    );
  }
  const focused = Boolean(options.project || options.spec || options.grep);
  if (focused && options.writeVerifiedEvidence) {
    throw new ReleaseE2EError('Focused diagnostic scopes cannot write verified release evidence.', {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_FOCUSED_EVIDENCE_FORBIDDEN',
      phase: 'input',
    });
  }
  if (options.project && !['chromium', 'firefox', 'webkit'].includes(options.project)) {
    throw new ReleaseE2EError('--project must be chromium, firefox, or webkit.', {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_INVALID_BROWSER_PROJECT',
      phase: 'input',
    });
  }
  if (options.repeatEach !== undefined) {
    const repeatEach = Number(options.repeatEach);
    if (!Number.isInteger(repeatEach) || repeatEach < 1 || repeatEach > 5) {
      throw new ReleaseE2EError('--repeat-each must be an integer from 1 through 5.', {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_INVALID_REPEAT_COUNT',
        phase: 'input',
      });
    }
    const exactDiagnosticScope = Boolean(options.spec || options.grep);
    if (!exactDiagnosticScope || options.allowProductionData) {
      throw new ReleaseE2EError(
        '--repeat-each is limited to a focused read-only diagnostic scope.',
        {
          exitCode: EXIT.INPUT,
          failureCode: 'E2E_REPEAT_SCOPE_UNSAFE',
          phase: 'input',
        },
      );
    }
    options.repeatEach = repeatEach;
  }
  if (!path.isAbsolute(options.recoveryLedger)) {
    throw new ReleaseE2EError('--recovery-ledger must resolve to an absolute path.', {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_INVALID_RECOVERY_PATH',
      phase: 'input',
    });
  }
}

function assertLocalOperatorHostEnvironment(options, environment = process.env) {
  if (!options.allowProductionData) return;
  if (environment.CI || environment.GITHUB_ACTIONS) {
    throw new ReleaseE2EError(
      'Production-data release E2E is forbidden when the host is CI or GitHub Actions.',
      {
        exitCode: EXIT.SAFETY,
        failureCode: 'E2E_PRODUCTION_DATA_FORBIDDEN_IN_HOST_CI',
        phase: 'safety',
      },
    );
  }
}

function loadEnvironmentContractFromWorkingTree(repositoryRoot = REPOSITORY_ROOT) {
  const contractPath = path.join(repositoryRoot, ENVIRONMENT_CONTRACT_RELATIVE_PATH);
  const raw = fs.readFileSync(contractPath, 'utf8');
  const contract = JSON.parse(raw);
  if (
    contract.schemaVersion !== 1 ||
    contract.playwrightVersion !== '1.62.1' ||
    contract.nodeMajor !== 24 ||
    contract.nodeVersion !== '24.19.0' ||
    !/^node:24[.]19[.]0-bookworm-slim@sha256:[a-f0-9]{64}$/u.test(String(contract.nodeImage)) ||
    !String(contract.playwrightImage).includes('@sha256:')
  ) {
    throw new ReleaseE2EError('The release E2E environment contract is unsupported or unpinned.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_ENVIRONMENT_CONTRACT_INVALID',
      phase: 'environment',
    });
  }
  return { contract, raw, sha256: sha256(raw) };
}

function dockerEngineVersion() {
  const result = runCapture('docker', ['info', '--format', '{{json .ServerVersion}}'], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    throw new ReleaseE2EError('Docker is installed but its engine is not reachable.', {
      cause: new Error(result.stderr.trim() || 'docker info failed'),
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_DOCKER_ENGINE_UNAVAILABLE',
      phase: 'environment',
      retryable: true,
      nextCommand: 'pnpm e2e:env:doctor',
    });
  }
  return result.stdout.trim().replace(/^"|"$/gu, '');
}

function inspectImage(reference) {
  const result = runCapture('docker', ['image', 'inspect', reference], { allowFailure: true });
  if (result.status !== 0) return undefined;
  const images = JSON.parse(result.stdout);
  return images[0];
}

function assertHostPrerequisites() {
  if (process.versions.node !== '24.19.0') {
    throw new ReleaseE2EError(
      `Node.js 24.19.0 is required to launch release E2E; found ${process.version}.`,
      {
        exitCode: EXIT.ENVIRONMENT,
        failureCode: 'E2E_HOST_NODE_VERSION_MISMATCH',
        phase: 'environment',
        nextCommand: 'nvm use 24.19.0',
      },
    );
  }
  if (!executableExists('git')) {
    throw new ReleaseE2EError('Git is required on the host.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_GIT_MISSING',
      phase: 'environment',
    });
  }
  if (!executableExists('docker')) {
    throw new ReleaseE2EError('Docker is required on the host.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_DOCKER_MISSING',
      phase: 'environment',
    });
  }
  if (!executableExists('pnpm')) {
    throw new ReleaseE2EError('pnpm is required on the host.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_PNPM_MISSING',
      phase: 'environment',
    });
  }
  return {
    dockerServerVersion: dockerEngineVersion(),
    gitVersion: git(['--version']),
    nodeVersion: process.version,
    pnpmVersion: runCapture('pnpm', ['--version'], {
      env: boundGitEnvironment(REPOSITORY_ROOT),
    }).stdout.trim(),
  };
}

function ensureBaseImage(environment, options = {}) {
  const existing = inspectImage(environment.contract.playwrightImage);
  if (existing) return { imageId: existing.Id, reused: true };
  if (options.offline || options.readOnly) {
    throw new ReleaseE2EError('The pinned Playwright image is not installed locally.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_PINNED_IMAGE_MISSING',
      phase: 'environment',
      retryable: true,
      nextCommand: 'pnpm e2e:env:install',
    });
  }
  const status = runStreaming('docker', ['pull', environment.contract.playwrightImage]);
  if (status !== 0) {
    throw new ReleaseE2EError('Pulling the pinned Playwright image failed.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_PINNED_IMAGE_PULL_FAILED',
      phase: 'environment',
      retryable: true,
      nextCommand: 'pnpm e2e:env:install',
    });
  }
  const installed = inspectImage(environment.contract.playwrightImage);
  if (!installed) {
    throw new ReleaseE2EError('Docker did not retain the pinned Playwright image.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_PINNED_IMAGE_VERIFY_FAILED',
      phase: 'environment',
    });
  }
  return { imageId: installed.Id, reused: false };
}

function dependencyImageIdentity(environment) {
  const packageJsonRaw = fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'));
  const dependencyLockRaw = fs.readFileSync(
    path.join(REPOSITORY_ROOT, DEPENDENCY_LOCK_RELATIVE_PATH),
  );
  const pnpmWorkspaceRaw = fs.readFileSync(
    path.join(REPOSITORY_ROOT, PNPM_WORKSPACE_RELATIVE_PATH),
  );
  const dockerfileRaw = fs.readFileSync(path.join(REPOSITORY_ROOT, DOCKERFILE_RELATIVE_PATH));
  const packageJsonSha256 = sha256(packageJsonRaw);
  const dependencyLockSha256 = sha256(dependencyLockRaw);
  const pnpmWorkspaceSha256 = sha256(pnpmWorkspaceRaw);
  const dockerfileSha256 = sha256(dockerfileRaw);
  const identitySha256 = sha256(
    jsonText({
      dependencyLockSha256,
      dockerfileSha256,
      environmentSha256: environment.sha256,
      packageJsonSha256,
      pnpmWorkspaceSha256,
    }),
  );
  const tag = `tiangong-lca-next-e2e-dependencies:${identitySha256.slice(0, 24)}`;
  return {
    dependencyLockRaw,
    dependencyLockSha256,
    dockerfileRaw,
    dockerfileSha256,
    packageJsonRaw,
    packageJsonSha256,
    pnpmWorkspaceRaw,
    pnpmWorkspaceSha256,
    tag,
  };
}

function dependencyImageMatches(image, identity, environment) {
  const labels = image?.Config?.Labels ?? {};
  return (
    labels[ENVIRONMENT_IMAGE_LABEL] === 'true' &&
    labels['org.tiangong.lca.next.dependency-lock-sha256'] === identity.dependencyLockSha256 &&
    labels['org.tiangong.lca.next.package-json-sha256'] === identity.packageJsonSha256 &&
    labels['org.tiangong.lca.next.pnpm-workspace-sha256'] === identity.pnpmWorkspaceSha256 &&
    labels['org.tiangong.lca.next.environment-sha256'] === environment.sha256 &&
    labels['org.tiangong.lca.next.dockerfile-sha256'] === identity.dockerfileSha256
  );
}

function ensureDependencyImage(environment, options = {}) {
  const identity = dependencyImageIdentity(environment);
  const existing = inspectImage(identity.tag);
  if (existing && dependencyImageMatches(existing, identity, environment)) {
    return { imageId: existing.Id, imageTag: identity.tag, reused: true };
  }
  if (existing) {
    throw new ReleaseE2EError('The local dependency image has mismatched identity labels.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_DEPENDENCY_IMAGE_COLLISION',
      phase: 'environment',
    });
  }
  if (options.readOnly) {
    throw new ReleaseE2EError('The exact lockfile dependency image is not installed locally.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_DEPENDENCY_IMAGE_MISSING',
      phase: 'environment',
      retryable: true,
      nextCommand: 'pnpm e2e:env:install',
    });
  }

  const directory = path.join(RUNTIME_ROOT, 'environment-build');
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    writeBuildFile(path.join(directory, 'package.json'), identity.packageJsonRaw, 0o600);
    writeBuildFile(
      path.join(directory, DEPENDENCY_LOCK_RELATIVE_PATH),
      identity.dependencyLockRaw,
      0o600,
    );
    writeBuildFile(
      path.join(directory, PNPM_WORKSPACE_RELATIVE_PATH),
      identity.pnpmWorkspaceRaw,
      0o600,
    );
    writeBuildFile(path.join(directory, 'Dockerfile'), identity.dockerfileRaw, 0o600);
    const args = [
      'build',
      '--file',
      path.join(directory, 'Dockerfile'),
      '--target',
      'dependencies',
      '--tag',
      identity.tag,
      '--label',
      `${ENVIRONMENT_IMAGE_LABEL}=true`,
      '--label',
      `org.tiangong.lca.next.dependency-lock-sha256=${identity.dependencyLockSha256}`,
      '--label',
      `org.tiangong.lca.next.package-json-sha256=${identity.packageJsonSha256}`,
      '--label',
      `org.tiangong.lca.next.pnpm-workspace-sha256=${identity.pnpmWorkspaceSha256}`,
      '--label',
      `org.tiangong.lca.next.environment-sha256=${environment.sha256}`,
      '--label',
      `org.tiangong.lca.next.dockerfile-sha256=${identity.dockerfileSha256}`,
      '--build-arg',
      `PLAYWRIGHT_IMAGE=${environment.contract.playwrightImage}`,
    ];
    if (options.offline) args.push('--network=none');
    args.push(directory);
    const status = runStreaming('docker', args);
    if (status !== 0) {
      throw new ReleaseE2EError('Installing the exact lockfile dependency image failed.', {
        exitCode: EXIT.ENVIRONMENT,
        failureCode: 'E2E_DEPENDENCY_IMAGE_BUILD_FAILED',
        phase: 'environment',
        retryable: true,
        nextCommand: 'pnpm e2e:env:install',
      });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const built = inspectImage(identity.tag);
  if (!built || !dependencyImageMatches(built, identity, environment)) {
    throw new ReleaseE2EError('The installed dependency image failed identity verification.', {
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_DEPENDENCY_IMAGE_VERIFY_FAILED',
      phase: 'environment',
    });
  }
  return { imageId: built.Id, imageTag: identity.tag, reused: false };
}

function runEnvironmentBrowserSmoke(imageTag) {
  const source = [
    "const { chromium, firefox, webkit } = require('@playwright/test');",
    '(async () => {',
    '  const versions = {};',
    '  for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {',
    '    const browser = await browserType.launch();',
    '    try { versions[name] = browser.version(); } finally { await browser.close(); }',
    '  }',
    '  process.stdout.write(JSON.stringify(versions));',
    '})().catch((error) => { console.error(error); process.exitCode = 1; });',
  ].join('\n');
  const result = runCapture(
    'docker',
    ['run', '--rm', '--init', '--ipc=host', '--network=none', imageTag, 'node', '-e', source],
    { allowFailure: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new ReleaseE2EError('The pinned environment could not launch every browser.', {
      cause: new Error(result.stderr.trim() || 'browser smoke container failed'),
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_ENVIRONMENT_BROWSER_LAUNCH_FAILED',
      phase: 'environment',
      retryable: true,
      nextCommand: 'pnpm e2e:env:install',
    });
  }
  try {
    const versions = JSON.parse(result.stdout);
    if (
      !versions ||
      ['chromium', 'firefox', 'webkit'].some((browserName) => !versions[browserName])
    ) {
      throw new Error('browser version inventory is incomplete');
    }
    return versions;
  } catch (error) {
    throw new ReleaseE2EError('The browser smoke result was not valid JSON.', {
      cause: error,
      exitCode: EXIT.ENVIRONMENT,
      failureCode: 'E2E_ENVIRONMENT_BROWSER_RESULT_INVALID',
      phase: 'environment',
      nextCommand: 'pnpm e2e:env:install',
    });
  }
}

function requireCleanCommittedCandidate() {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) {
    throw new ReleaseE2EError(
      'Release E2E requires a clean committed Next candidate. Use e2e:dev for dirty work.',
      {
        exitCode: EXIT.CANDIDATE,
        failureCode: 'E2E_CANDIDATE_DIRTY',
        phase: 'candidate',
        nextCommand: 'pnpm e2e:dev',
      },
    );
  }
  const branchResult = runCapture('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    allowFailure: true,
    env: boundGitEnvironment(REPOSITORY_ROOT),
  });
  return {
    branch: branchResult.status === 0 ? branchResult.stdout.trim() : undefined,
    commit: git(['rev-parse', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
  };
}

function createCandidateBuildContext(candidate, environment, runId, options = {}) {
  const directory = path.join(BUILD_ROOT, runId);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const archivePath = path.join(directory, 'candidate.tar');
  const archiveResult = spawnSync(
    'git',
    ['archive', '--format=tar', `--output=${archivePath}`, candidate.commit],
    { cwd: REPOSITORY_ROOT, stdio: ['ignore', 2, 2] },
  );
  if (archiveResult.error || archiveResult.status !== 0) {
    throw new ReleaseE2EError('Exporting the exact candidate archive failed.', {
      cause: archiveResult.error,
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_CANDIDATE_ARCHIVE_FAILED',
      phase: 'candidate',
      retryable: true,
      receiptEligible: true,
    });
  }

  const packageJsonRaw = gitShow('package.json');
  const dependencyLockRaw = gitShow(DEPENDENCY_LOCK_RELATIVE_PATH);
  const pnpmWorkspaceRaw = gitShow(PNPM_WORKSPACE_RELATIVE_PATH);
  const dockerfileRaw = gitShow(DOCKERFILE_RELATIVE_PATH);
  const environmentRaw = gitShow(ENVIRONMENT_CONTRACT_RELATIVE_PATH);
  const buildVerifierRaw = gitShow('scripts/e2e/verify-build-input.cjs');
  const packageJson = JSON.parse(packageJsonRaw);
  const pinnedPnpmVersion = /^pnpm@([^+]+)(?:\+.+)?$/u.exec(packageJson.packageManager ?? '')?.[1];
  const hostPnpmVersion = runCapture('pnpm', ['--version'], {
    env: boundGitEnvironment(REPOSITORY_ROOT),
  }).stdout.trim();
  if (!pinnedPnpmVersion || hostPnpmVersion !== pinnedPnpmVersion) {
    throw new ReleaseE2EError('Host pnpm does not match the committed package-manager pin.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_PNPM_VERSION_MISMATCH',
      phase: 'candidate',
    });
  }
  const lockedPlaywright = lockedDependencyVersion('@playwright/test');
  if (lockedPlaywright !== environment.contract.playwrightVersion) {
    throw new ReleaseE2EError('pnpm lock Playwright does not match the pinned container.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_PLAYWRIGHT_VERSION_MISMATCH',
      phase: 'candidate',
    });
  }
  const committedEnvironment = JSON.parse(environmentRaw);
  if (
    committedEnvironment.playwrightImage !== environment.contract.playwrightImage ||
    committedEnvironment.nodeImage !== environment.contract.nodeImage
  ) {
    throw new ReleaseE2EError('Committed and controller environment identities differ.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_ENVIRONMENT_IDENTITY_MISMATCH',
      phase: 'candidate',
    });
  }

  const frontendTarget = options.qualification ? 'qualification' : 'main';
  const manifest = {
    kind: 'tiangong-next-release-e2e-candidate',
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    repository: {
      canonical: CANONICAL_REPOSITORY,
      packageName: packageJson.name,
    },
    candidate: {
      archiveSha256: sha256(fs.readFileSync(archivePath)),
      commit: candidate.commit,
      dependencyLockSha256: sha256(dependencyLockRaw),
      evidenceIdentity: {
        configTreeDigest: digestCommittedTree('config'),
        observedHeadCommit: candidate.commit,
        packageManifestDigest: sha256(packageJsonRaw),
        sourceTreeDigest: digestCommittedTree('src'),
        unitTestTreeDigest: digestCommittedTree('tests/unit'),
      },
      packageJsonSha256: sha256(packageJsonRaw),
      packageVersion: packageJson.version,
      pnpmWorkspaceSha256: sha256(pnpmWorkspaceRaw),
      sourceDateEpoch: Number(git(['show', '-s', '--format=%ct', candidate.commit])),
      tree: candidate.tree,
    },
    environment: {
      contractSha256: sha256(environmentRaw),
      dockerfileSha256: sha256(dockerfileRaw),
      frontendTarget,
      nodeMajor: committedEnvironment.nodeMajor,
      nodeImage: committedEnvironment.nodeImage,
      nodeVersion: committedEnvironment.nodeVersion,
      playwrightImage: committedEnvironment.playwrightImage,
      playwrightVersion: committedEnvironment.playwrightVersion,
    },
    sources: {
      containerRunnerTree: git(['rev-parse', 'HEAD:scripts/e2e']),
      dockerTree: git(['rev-parse', 'HEAD:docker/e2e']),
      e2eTree: git(['rev-parse', 'HEAD:tests/e2e/i18n']),
      playwrightConfigSha256: sha256(gitShow('playwright.config.ts')),
    },
  };
  const manifestText = jsonText(manifest);
  const manifestSha256 = sha256(manifestText);
  const imageTag = `tiangong-lca-next-e2e:${candidate.tree.slice(0, 12)}-${manifest.environment.contractSha256.slice(0, 12)}-${frontendTarget}`;

  writeBuildFile(path.join(directory, 'package.json'), packageJsonRaw, 0o600);
  writeBuildFile(path.join(directory, DEPENDENCY_LOCK_RELATIVE_PATH), dependencyLockRaw, 0o600);
  writeBuildFile(path.join(directory, PNPM_WORKSPACE_RELATIVE_PATH), pnpmWorkspaceRaw, 0o600);
  writeBuildFile(path.join(directory, 'Dockerfile'), dockerfileRaw, 0o600);
  writeBuildFile(path.join(directory, 'environment.json'), environmentRaw, 0o600);
  writeBuildFile(path.join(directory, 'verify-build-input.cjs'), buildVerifierRaw, 0o600);
  writeBuildFile(path.join(directory, 'candidate-manifest.json'), manifestText, 0o600);

  return { directory, imageTag, manifest, manifestSha256 };
}

function candidateImageMatches(image, context) {
  const labels = image?.Config?.Labels ?? {};
  return (
    labels[IMAGE_LABEL] === 'true' &&
    labels['org.tiangong.lca.next.candidate-tree'] === context.manifest.candidate.tree &&
    labels['org.tiangong.lca.next.manifest-sha256'] === context.manifestSha256
  );
}

function ensureCandidateImage(context, environment, options = {}) {
  const existing = inspectImage(context.imageTag);
  if (existing && candidateImageMatches(existing, context)) {
    return { imageId: existing.Id, reused: true };
  }
  if (existing) {
    throw new ReleaseE2EError('A local candidate image tag has mismatched identity labels.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_CANDIDATE_IMAGE_COLLISION',
      phase: 'candidate-build',
    });
  }
  const args = [
    'build',
    '--file',
    path.join(context.directory, 'Dockerfile'),
    '--tag',
    context.imageTag,
    '--label',
    `${IMAGE_LABEL}=true`,
    '--label',
    `org.tiangong.lca.next.candidate-tree=${context.manifest.candidate.tree}`,
    '--label',
    `org.tiangong.lca.next.manifest-sha256=${context.manifestSha256}`,
    '--build-arg',
    `PLAYWRIGHT_IMAGE=${environment.contract.playwrightImage}`,
    '--build-arg',
    `E2E_FRONTEND_ENV=${context.manifest.environment.frontendTarget}`,
  ];
  if (options.offline) args.push('--network=none');
  args.push(context.directory);
  const status = runStreaming('docker', args);
  if (status !== 0) {
    throw new ReleaseE2EError('Building the isolated production candidate image failed.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_CANDIDATE_BUILD_FAILED',
      phase: 'candidate-build',
      retryable: true,
      receiptEligible: true,
      nextCommand: 'pnpm e2e:release:resume',
    });
  }
  const built = inspectImage(context.imageTag);
  if (!built || !candidateImageMatches(built, context)) {
    throw new ReleaseE2EError('The built candidate image failed identity verification.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_CANDIDATE_IMAGE_VERIFY_FAILED',
      phase: 'candidate-build',
      receiptEligible: true,
    });
  }
  return { imageId: built.Id, reused: false };
}

function assertProtectedCredentialFile(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ReleaseE2EError('The users env path is not a regular file.', {
      exitCode: EXIT.SAFETY,
      failureCode: 'E2E_CREDENTIAL_FILE_INVALID',
      phase: 'authentication',
    });
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new ReleaseE2EError('The users env file must not be readable by group or others.', {
      exitCode: EXIT.SAFETY,
      failureCode: 'E2E_CREDENTIAL_FILE_PERMISSIONS',
      phase: 'authentication',
      nextCommand: `chmod 600 ${resolved}`,
    });
  }
  return resolved;
}

function playwrightArguments(options) {
  if (options.qualification) {
    return ['tests/e2e/i18n'];
  }
  const args = [];
  if (options.spec) args.push(options.spec);
  if (options.project) args.push(`--project=${options.project}`);
  if (options.grep) args.push(`--grep=${options.grep}`);
  if (options.repeatEach) args.push(`--repeat-each=${options.repeatEach}`);
  return args;
}

function qualificationInputSha256(repositoryRoot = REPOSITORY_ROOT) {
  const pathPrefixes = [
    'src',
    'public',
    'config',
    'tests/e2e/i18n',
    'tests/data-workflows/workflows/workflow-shared.ts',
    'scripts/e2e',
    'scripts/i18n/check-semantic-evidence-format.mjs',
    'scripts/i18n/semantic-evidence-format.ts',
    'docker/e2e',
    '.github/workflows/release-gate.yml',
    'playwright.config.ts',
    '.nvmrc',
    'tsconfig.json',
    'docs/plans/i18n/route-view-coverage.json',
    'docs/plans/i18n/semantic-e2e-evidence.schema.json',
  ];
  const trackedEntries = runCapture('git', ['ls-files', '--stage', '-z', '--', ...pathPrefixes], {
    cwd: repositoryRoot,
    env: boundGitEnvironment(repositoryRoot),
  })
    .stdout.split('\0')
    .filter(Boolean)
    .filter(
      (line) =>
        ![OFFICIAL_MAIN_ENVIRONMENT_PATH, 'config/environments/hosted-dev.env'].some((file) =>
          line.endsWith(`\t${file}`),
        ),
    )
    .map((line) => {
      const match = /^([0-7]{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/u.exec(line);
      if (!match || match[3] !== '0') {
        throw new ReleaseE2EError('Qualification inputs contain an unsupported Git index entry.', {
          exitCode: EXIT.CANDIDATE,
          failureCode: 'E2E_QUALIFICATION_GIT_ENTRY_INVALID',
          phase: 'candidate',
        });
      }
      const [, mode, objectId, , file] = match;
      const type = mode === '120000' ? 'symlink' : mode === '160000' ? 'gitlink' : 'blob';
      let contents;
      if (type === 'symlink') {
        contents = Buffer.from(fs.readlinkSync(path.join(repositoryRoot, file)), 'utf8');
      } else if (type === 'gitlink') {
        contents = Buffer.from(objectId, 'utf8');
      } else {
        contents = fs.readFileSync(path.join(repositoryRoot, file));
      }
      return { mode, path: file, sha256: sha256(contents), type };
    })
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json')));
  delete packageJson.version;
  const packageManagerPaths = [DEPENDENCY_LOCK_RELATIVE_PATH, PNPM_WORKSPACE_RELATIVE_PATH];
  if (fs.existsSync(path.join(repositoryRoot, '.npmrc'))) packageManagerPaths.push('.npmrc');
  const packageEntries = runCapture(
    'git',
    ['ls-files', '--stage', '--', 'package.json', ...packageManagerPaths],
    { cwd: repositoryRoot, env: boundGitEnvironment(repositoryRoot) },
  )
    .stdout.trim()
    .split(/\r?\n/u)
    .map((line) => {
      const match = /^([0-7]{6}) [0-9a-f]+ 0\t(.+)$/u.exec(line);
      if (!match) throw new Error(`Invalid package Git index entry: ${line}`);
      return { mode: match[1], path: match[2], type: 'blob' };
    });
  const packageEntry = (packagePath) => {
    const entry = packageEntries.find(({ path: entryPath }) => entryPath === packagePath);
    if (!entry) throw new Error(`Missing tracked qualification input: ${packagePath}`);
    return entry;
  };
  const entries = [...trackedEntries];
  entries.push({
    ...packageEntry('package.json'),
    path: 'package.json#without-version',
    sha256: sha256(jsonText(packageJson)),
  });
  for (const packageManagerPath of packageManagerPaths) {
    entries.push({
      ...packageEntry(packageManagerPath),
      sha256: sha256(fs.readFileSync(path.join(repositoryRoot, packageManagerPath))),
    });
  }
  return sha256(jsonText(entries));
}

function qualificationIdentity(repositoryRoot = REPOSITORY_ROOT) {
  const inputSha256 = qualificationInputSha256(repositoryRoot);
  const environmentContractSha256 = loadEnvironmentContractFromWorkingTree(repositoryRoot).sha256;
  return {
    schemaVersion: 'tiangong.semantic-harness-qualification-identity.v2',
    inputSha256,
    environmentContractSha256,
    proofKey: sha256(
      jsonText({
        qualificationProofSchemaVersion: QUALIFICATION_PROOF_SCHEMA_VERSION,
        inputSha256,
        environmentContractSha256,
      }),
    ),
  };
}

function resolveQualificationProofPath(proofPath) {
  return path.resolve(proofPath || DEFAULT_QUALIFICATION_PROOF_PATH);
}

function assertExternalProofPath(proofPath) {
  const relativePath = path.relative(REPOSITORY_ROOT, proofPath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) return;
  const ignored = runCapture('git', ['check-ignore', '--quiet', '--', relativePath], {
    allowFailure: true,
    env: boundGitEnvironment(REPOSITORY_ROOT),
  });
  if (ignored.status !== 0) {
    throw new ReleaseE2EError(
      'Qualification proof output must be outside Git or under an ignored runtime path.',
      {
        exitCode: EXIT.INPUT,
        failureCode: 'E2E_QUALIFICATION_PROOF_PATH_TRACKED',
        phase: 'input',
        details: { proofPath },
        nextCommand: 'pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json',
      },
    );
  }
}

function validateQualificationProof(proof, expectedIdentity = qualificationIdentity()) {
  const contract = loadQualificationClosureContract(REPOSITORY_ROOT);
  const exactKeys = (value, keys) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
  const closureFailures = [
    ...qualificationCoverageFailures(proof?.coverage, contract),
    ...qualificationAssertionFailures(proof, contract),
    ...qualificationCleanupFailures(proof?.cleanup),
  ];
  if (
    !exactKeys(proof, [
      'schemaVersion',
      'status',
      'generatedAt',
      'proofKey',
      'candidate',
      'qualificationInputSha256',
      'environmentContractSha256',
      'environmentManifestSha256',
      'browsers',
      'assertionIds',
      'assertionBrowsers',
      'coverage',
      'cleanup',
      'externalRequests',
      'productionWrites',
      'diagnostics',
    ]) ||
    !exactKeys(proof?.candidate, ['commit', 'tree']) ||
    !exactKeys(proof?.coverage, Object.keys(contract.coverage)) ||
    !exactKeys(proof?.cleanup, ['created', 'cleaned', 'leaked']) ||
    !exactKeys(proof?.diagnostics, [
      'retainedOutsideGit',
      'runResultSha256',
      'qualificationReportSha256',
    ])
  ) {
    closureFailures.push('proof-shape');
  }
  if (
    proof?.schemaVersion !== QUALIFICATION_PROOF_SCHEMA_VERSION ||
    proof.status !== 'qualified' ||
    typeof proof.generatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(proof.generatedAt) ||
    !Number.isFinite(Date.parse(proof.generatedAt)) ||
    closureFailures.length > 0 ||
    proof.productionWrites !== 0 ||
    proof.externalRequests !== 0 ||
    proof.qualificationInputSha256 !== expectedIdentity.inputSha256 ||
    proof.environmentContractSha256 !== expectedIdentity.environmentContractSha256 ||
    proof.proofKey !== expectedIdentity.proofKey ||
    !/^[0-9a-f]{64}$/u.test(proof.environmentManifestSha256 || '') ||
    !/^[0-9a-f]{40}$/u.test(proof.candidate?.commit || '') ||
    !/^[0-9a-f]{40}$/u.test(proof.candidate?.tree || '') ||
    proof.diagnostics?.retainedOutsideGit !== true ||
    !/^[0-9a-f]{64}$/u.test(proof.diagnostics?.runResultSha256 || '') ||
    !/^[0-9a-f]{64}$/u.test(proof.diagnostics?.qualificationReportSha256 || '') ||
    !Array.isArray(proof.browsers) ||
    proof.browsers.length !== contract.browsers.length ||
    proof.browsers.some(
      (browser, index) =>
        !exactKeys(browser, ['name', 'version']) ||
        browser.name !== contract.browsers[index] ||
        typeof browser?.version !== 'string' ||
        !/^\d+(?:\.\d+){0,3}$/u.test(browser.version),
    )
  ) {
    throw new ReleaseE2EError(
      'The external semantic qualification proof is missing, stale, or incomplete.',
      {
        exitCode: EXIT.CANDIDATE,
        failureCode: 'E2E_QUALIFICATION_PROOF_INVALID',
        phase: 'candidate',
        details: { closureFailures },
        nextCommand: 'pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json',
      },
    );
  }
  return proof;
}

function readQualificationProof(options) {
  const proofPath = resolveQualificationProofPath(options.proof);
  if (!fs.existsSync(proofPath)) {
    throw new ReleaseE2EError('A current external semantic qualification proof is required.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_QUALIFICATION_PROOF_MISSING',
      phase: 'candidate',
      details: { proofPath },
      nextCommand: `pnpm e2e:qualify --proof ${proofPath}`,
    });
  }
  let proofInput;
  try {
    proofInput = readJson(proofPath);
  } catch (error) {
    throw new ReleaseE2EError('The external semantic qualification proof cannot be read.', {
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_QUALIFICATION_PROOF_INVALID',
      phase: 'candidate',
      details: { errorCode: error instanceof SyntaxError ? 'INVALID_JSON' : error?.code },
      nextCommand: 'pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json',
    });
  }
  const proof = validateQualificationProof(proofInput);
  const currentCandidate = {
    commit: git(['rev-parse', 'HEAD^{commit}']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
  };
  return {
    ...proof,
    proofPath,
    verification: {
      currentCandidate,
      reuseScope:
        proof.candidate.commit === currentCandidate.commit
          ? 'exact-candidate'
          : 'behavior-equivalent',
    },
  };
}

function receiptOptions(options) {
  return {
    allowProductionData: options.allowProductionData,
    authenticated: options.authenticated,
    grep: options.grep,
    offline: options.offline,
    proof: options.proof ? path.resolve(options.proof) : undefined,
    project: options.project,
    qualification: Boolean(options.qualification),
    recoveryLedger: path.resolve(options.recoveryLedger),
    repeatEach: options.repeatEach,
    role: options.role,
    spec: options.spec,
    usersEnvFile: options.usersEnvFile ? path.resolve(options.usersEnvFile) : undefined,
    writeVerifiedEvidence: options.writeVerifiedEvidence,
  };
}

function credentialReceiptBinding(options) {
  if (!options.authenticated) return undefined;
  const credentialPath = path.resolve(
    options.usersEnvFile ?? path.join(REPOSITORY_ROOT, '.env.users.local'),
  );
  const protectedPath = assertProtectedCredentialFile(credentialPath);
  return { path: protectedPath, sha256: sha256(fs.readFileSync(protectedPath)) };
}

function unsignedReceipt(receipt) {
  const { integrity: _integrity, ...payload } = receipt;
  return payload;
}

function receiptHmac(receipt, key) {
  return crypto
    .createHmac('sha256', key)
    .update(jsonText(unsignedReceipt(receipt)))
    .digest('hex');
}

function createReceipt(input, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new ReleaseE2EError('A 32-byte continuation receipt key is required.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_KEY_INVALID',
      phase: 'finalization',
    });
  }
  const now = Date.now();
  const activatedAt = input.previousReceipt?.activatedAt ?? new Date(now).toISOString();
  const expiresAt =
    input.previousReceipt?.expiresAt ?? new Date(now + RECEIPT_TTL_MS).toISOString();
  const receipt = {
    kind: 'tiangong-next-release-e2e-continuation-receipt',
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    activatedAt,
    expiresAt,
    candidate: {
      commit: input.manifest.candidate.commit,
      dependencyLockSha256: input.manifest.candidate.dependencyLockSha256,
      pnpmWorkspaceSha256: input.manifest.candidate.pnpmWorkspaceSha256,
      tree: input.manifest.candidate.tree,
    },
    environment: {
      contractSha256: input.manifest.environment.contractSha256,
      sourceIdentitySha256: sha256(jsonText(input.manifest.sources)),
      trackedMainEnvironmentSha256: sha256(
        fs.readFileSync(input.runtimeInputs.trackedMainEnvironmentPath),
      ),
    },
    image: {
      id: input.imageId,
      tag: input.imageTag,
    },
    invocation: receiptOptions(input.options),
    runtimeCredential: credentialReceiptBinding(input.options),
    failedPhase: input.error.phase,
    failureCode: input.error.failureCode,
  };
  return {
    ...receipt,
    integrity: {
      algorithm: 'hmac-sha256',
      digest: receiptHmac(receipt, key),
    },
  };
}

function validateReceipt(receipt, now = Date.now(), key) {
  if (
    receipt?.kind !== 'tiangong-next-release-e2e-continuation-receipt' ||
    receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
    receipt.integrity?.algorithm !== 'hmac-sha256' ||
    !/^[0-9a-f]{64}$/u.test(receipt.integrity?.digest ?? '') ||
    !Buffer.isBuffer(key) ||
    key.length !== 32
  ) {
    throw new ReleaseE2EError('The continuation receipt has an unsupported shape.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_INVALID',
      phase: 'resume',
    });
  }
  const expectedDigest = Buffer.from(receiptHmac(receipt, key), 'hex');
  const actualDigest = Buffer.from(receipt.integrity.digest, 'hex');
  if (!crypto.timingSafeEqual(expectedDigest, actualDigest)) {
    throw new ReleaseE2EError('The continuation receipt integrity check failed.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_INTEGRITY_FAILED',
      phase: 'resume',
    });
  }
  if (
    !receipt.candidate ||
    !/^[0-9a-f]{40}$/u.test(receipt.candidate.commit ?? '') ||
    !/^[0-9a-f]{40}$/u.test(receipt.candidate.tree ?? '') ||
    !/^[0-9a-f]{64}$/u.test(receipt.candidate.dependencyLockSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(receipt.candidate.pnpmWorkspaceSha256 ?? '') ||
    !receipt.environment ||
    !/^[0-9a-f]{64}$/u.test(receipt.environment.contractSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(receipt.environment.sourceIdentitySha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(receipt.environment.trackedMainEnvironmentSha256 ?? '') ||
    !receipt.image ||
    !(receipt.image.id === 'not-built' || /^sha256:[0-9a-f]{64}$/u.test(receipt.image.id ?? '')) ||
    !receipt.invocation ||
    typeof receipt.invocation.qualification !== 'boolean' ||
    (receipt.invocation.proof !== undefined && !path.isAbsolute(receipt.invocation.proof)) ||
    !new RegExp(
      `^tiangong-lca-next-e2e:[0-9a-f]{12}-[0-9a-f]{12}-${
        receipt.invocation.qualification ? 'qualification' : 'main'
      }$`,
      'u',
    ).test(receipt.image.tag ?? '') ||
    !['candidate-build', 'candidate-server', 'preflight'].includes(receipt.failedPhase) ||
    typeof receipt.failureCode !== 'string'
  ) {
    throw new ReleaseE2EError('The continuation receipt has an unsupported shape.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_INVALID',
      phase: 'resume',
    });
  }
  const activatedAt = Date.parse(receipt.activatedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  if (
    !Number.isFinite(activatedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt - activatedAt !== RECEIPT_TTL_MS ||
    now < activatedAt - 300_000
  ) {
    throw new ReleaseE2EError('The continuation receipt timestamp is invalid.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_CLOCK_INVALID',
      phase: 'resume',
    });
  }
  if (now > expiresAt) {
    throw new ReleaseE2EError('The one-hour continuation receipt has expired.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_EXPIRED',
      phase: 'resume',
      nextCommand: 'pnpm e2e:release',
    });
  }
  return receipt;
}

function invalidateReceipt() {
  fs.rmSync(RECEIPT_PATH, { force: true });
  fs.rmSync(RECEIPT_KEY_PATH, { force: true });
}

function makeRunId(candidate) {
  return `${new Date().toISOString().replace(/[:.]/gu, '-')}-${candidate.commit.slice(0, 12)}`;
}

function prepareRuntimeInputs(context, options, runDirectory) {
  fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const inputDirectory = path.join(context.directory, 'runtime-input');
  fs.mkdirSync(inputDirectory, { recursive: true, mode: 0o700 });
  const trackedMainEnvironmentPath = path.join(inputDirectory, 'tracked-main.env');
  let trackedMainEnvironment;
  try {
    trackedMainEnvironment = options.qualification
      ? fs.readFileSync(path.join(REPOSITORY_ROOT, QUALIFICATION_ENVIRONMENT_RELATIVE_PATH), 'utf8')
      : `${git(['show', `origin/main:${git(['ls-tree', '--name-only', 'origin/main', '--', OFFICIAL_MAIN_ENVIRONMENT_PATH]) ? OFFICIAL_MAIN_ENVIRONMENT_PATH : '.env'}`])}\n`;
  } catch (error) {
    throw new ReleaseE2EError('The selected E2E backend environment is unavailable.', {
      cause: error,
      exitCode: EXIT.CANDIDATE,
      failureCode: 'E2E_TRACKED_MAIN_ENVIRONMENT_UNAVAILABLE',
      phase: 'preflight',
      nextCommand: 'git fetch origin main',
    });
  }
  writeBuildFile(trackedMainEnvironmentPath, trackedMainEnvironment, 0o600);

  let usersEnvFile;
  if (options.authenticated) {
    const selected = options.usersEnvFile ?? path.join(REPOSITORY_ROOT, '.env.users.local');
    try {
      usersEnvFile = assertProtectedCredentialFile(selected);
    } catch (error) {
      if (error instanceof ReleaseE2EError) throw error;
      throw new ReleaseE2EError('Authenticated release E2E requires a protected users env file.', {
        cause: error,
        exitCode: EXIT.SAFETY,
        failureCode: 'E2E_CREDENTIAL_FILE_MISSING',
        phase: 'authentication',
      });
    }
  }

  const recoveryLedger = path.resolve(options.recoveryLedger);
  fs.mkdirSync(path.dirname(recoveryLedger), { recursive: true, mode: 0o700 });
  if (fs.existsSync(recoveryLedger)) {
    throw new ReleaseE2EError(
      'An unresolved production-data recovery ledger exists; refusing a new run.',
      {
        exitCode: EXIT.SAFETY,
        failureCode: 'E2E_RECOVERY_LEDGER_EXISTS',
        phase: 'preflight',
        nextCommand: `Inspect ${recoveryLedger} before retrying.`,
      },
    );
  }
  return { recoveryLedger, trackedMainEnvironmentPath, usersEnvFile };
}

function dockerRunArguments(context, options, runDirectory, runtimeInputs) {
  const containerRecoveryLedger = `/e2e-recovery/${path.basename(runtimeInputs.recoveryLedger)}`;
  const environment = {
    ...(options.allowProductionData ? { CI: '', GITHUB_ACTIONS: '' } : {}),
    E2E_ALLOW_PRODUCTION_DATA: String(options.allowProductionData),
    E2E_AUTHENTICATED: String(options.authenticated || options.qualification),
    E2E_AUTH_ROLE: options.role,
    E2E_BACKEND_TARGET: 'production',
    E2E_BASE_URL: 'http://127.0.0.1:8000',
    E2E_CANDIDATE_MANIFEST_PATH: '/opt/tiangong-e2e/candidate-manifest.json',
    E2E_ENVIRONMENT_CONTRACT_PATH: '/opt/tiangong-e2e/environment.json',
    E2E_EVIDENCE_PATH: '/e2e-output/semantic-e2e-evidence.json',
    E2E_EXTERNAL_SERVER: 'true',
    E2E_PLAYWRIGHT_ARGS_JSON: JSON.stringify(playwrightArguments(options)),
    E2E_QUALIFICATION: String(Boolean(options.qualification)),
    E2E_QUALIFICATION_RESULT_PATH: '/e2e-output/semantic-harness-qualification.json',
    E2E_PRODUCTION_WRITE_CONFIRMATION: options.allowProductionData
      ? 'I_AUTHORIZE_ONE_CODEX_E2E_PRODUCTION_PROCESS'
      : '',
    E2E_RECOVERY_LEDGER_PATH: containerRecoveryLedger,
    E2E_RELEASE_MODE: 'true',
    E2E_RUNTIME_DIR: '/tmp/tiangong-next-e2e-runtime',
    E2E_TRACKED_MAIN_ENV_PATH: '/e2e-input/tracked-main.env',
    E2E_USERS_ENV_FILE: options.authenticated ? '/e2e-input/users.env' : '',
    E2E_WRITE_VERIFIED_EVIDENCE: String(options.writeVerifiedEvidence),
  };
  const args = [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '--label',
    `${IMAGE_LABEL}=true`,
    '--volume',
    `${runDirectory}:/e2e-output`,
    '--volume',
    `${runtimeInputs.trackedMainEnvironmentPath}:/e2e-input/tracked-main.env:ro`,
    '--volume',
    `${path.dirname(runtimeInputs.recoveryLedger)}:/e2e-recovery`,
  ];
  if (runtimeInputs.usersEnvFile) {
    args.push('--volume', `${runtimeInputs.usersEnvFile}:/e2e-input/users.env:ro`);
  }
  for (const [key, value] of Object.entries(environment)) {
    args.push('--env', `${key}=${value}`);
  }
  args.push(context.imageTag);
  return args;
}

function readContainerResult(runDirectory) {
  const resultPath = path.join(runDirectory, 'run-result.json');
  try {
    return readJson(resultPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    const errorCode = error instanceof SyntaxError ? 'INVALID_JSON' : error?.code;
    throw new ReleaseE2EError('The isolated E2E result could not be read by the host operator.', {
      cause: new Error(errorCode || 'READ_FAILED'),
      details: { containerResult: resultPath, errorCode },
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_CONTAINER_RESULT_UNREADABLE',
      phase: 'artifact-handoff',
    });
  }
}

function runRelease(options, state = {}) {
  validateRunOptions(options);
  assertLocalOperatorHostEnvironment(options);
  const prerequisites = assertHostPrerequisites();
  const environment = loadEnvironmentContractFromWorkingTree();
  const candidate = requireCleanCommittedCandidate();
  if (!state.qualificationBootstrap) readQualificationReceipt();
  if (state.receipt) {
    if (
      candidate.commit !== state.receipt.candidate.commit ||
      candidate.tree !== state.receipt.candidate.tree
    ) {
      throw new ReleaseE2EError(
        'The current candidate no longer matches the continuation receipt.',
        {
          exitCode: EXIT.FINALIZATION,
          failureCode: 'E2E_RECEIPT_CANDIDATE_DRIFT',
          phase: 'resume',
          nextCommand: 'pnpm e2e:release',
        },
      );
    }
  }
  const baseImage = ensureBaseImage(environment, { offline: options.offline });
  const dependencyImage = ensureDependencyImage(environment, { offline: options.offline });
  const environmentBrowsers = runEnvironmentBrowserSmoke(dependencyImage.imageTag);
  const runId = makeRunId(candidate);
  let context;
  try {
    context = createCandidateBuildContext(candidate, environment, runId, options);
  } catch (error) {
    fs.rmSync(path.join(BUILD_ROOT, runId), { recursive: true, force: true });
    throw error;
  }
  const runDirectory = path.join(RUNS_ROOT, runId);
  let candidateImage;
  let runtimeInputs;
  try {
    if (state.receipt) {
      const sourceIdentitySha256 = sha256(jsonText(context.manifest.sources));
      if (
        context.manifest.candidate.dependencyLockSha256 !==
          state.receipt.candidate.dependencyLockSha256 ||
        context.manifest.candidate.pnpmWorkspaceSha256 !==
          state.receipt.candidate.pnpmWorkspaceSha256 ||
        context.manifest.environment.contractSha256 !== state.receipt.environment.contractSha256 ||
        sourceIdentitySha256 !== state.receipt.environment.sourceIdentitySha256 ||
        context.imageTag !== state.receipt.image.tag
      ) {
        throw new ReleaseE2EError('Receipt-bound source or environment identity drifted.', {
          exitCode: EXIT.FINALIZATION,
          failureCode: 'E2E_RECEIPT_IDENTITY_DRIFT',
          phase: 'resume',
          nextCommand: 'pnpm e2e:release',
        });
      }
    }
    runtimeInputs = prepareRuntimeInputs(context, options, runDirectory);
    if (
      state.receipt &&
      sha256(fs.readFileSync(runtimeInputs.trackedMainEnvironmentPath)) !==
        state.receipt.environment.trackedMainEnvironmentSha256
    ) {
      throw new ReleaseE2EError('The receipt-bound tracked-main backend identity changed.', {
        exitCode: EXIT.FINALIZATION,
        failureCode: 'E2E_RECEIPT_BACKEND_DRIFT',
        phase: 'resume',
        nextCommand: 'pnpm e2e:release',
      });
    }
    candidateImage = ensureCandidateImage(context, environment, { offline: options.offline });
    if (
      state.receipt &&
      state.receipt.image.id !== 'not-built' &&
      candidateImage.imageId !== state.receipt.image.id
    ) {
      throw new ReleaseE2EError('The receipt-bound candidate image identity changed.', {
        exitCode: EXIT.FINALIZATION,
        failureCode: 'E2E_RECEIPT_IMAGE_DRIFT',
        phase: 'resume',
        nextCommand: 'pnpm e2e:release',
      });
    }
    const dockerStatus = runStreaming(
      'docker',
      dockerRunArguments(context, options, runDirectory, runtimeInputs),
    );
    const containerResult = readContainerResult(runDirectory);
    if (dockerStatus !== 0 || containerResult?.status !== 'passed') {
      const exitCode = [10, 20, 30, 40, 50].includes(dockerStatus)
        ? dockerStatus
        : (containerResult?.exitCode ?? EXIT.BROWSER);
      const preFixture = Boolean(containerResult) && containerResult.fixtureIntentCreated !== true;
      const phase = containerResult?.phase ?? 'container-transport';
      const receiptEligible = preFixture && ['preflight', 'candidate-server'].includes(phase);
      const containerErrorChain = containerResult?.error?.chain;
      const originalMessage = Array.isArray(containerErrorChain)
        ? containerErrorChain.at(-1)?.message
        : undefined;
      throw new ReleaseE2EError(
        originalMessage ||
          containerResult?.error?.message ||
          'The isolated release E2E container failed.',
        {
          details: {
            containerErrorChain,
            containerResult: path.join(runDirectory, 'run-result.json'),
          },
          exitCode,
          failureCode: containerResult?.failureCode ?? 'E2E_CONTAINER_FAILED',
          phase,
          retryable: receiptEligible,
          receiptEligible,
          nextCommand: receiptEligible ? 'pnpm e2e:release:resume' : containerResult?.nextCommand,
        },
      );
    }
    invalidateReceipt();
    return {
      artifacts: {
        containerResult: path.join(runDirectory, 'run-result.json'),
        preflightReport: path.join(runDirectory, 'preflight-report.json'),
        qualificationReport: options.qualification
          ? path.join(runDirectory, 'semantic-harness-qualification.json')
          : undefined,
        releaseEvidence: options.writeVerifiedEvidence
          ? path.join(runDirectory, 'semantic-e2e-evidence.json')
          : undefined,
      },
      candidate: context.manifest.candidate,
      environment: {
        baseImageId: baseImage.imageId,
        candidateImageId: candidateImage.imageId,
        candidateImageReused: candidateImage.reused,
        dependencyImageId: dependencyImage.imageId,
        dependencyImageReused: dependencyImage.reused,
        dockerServerVersion: prerequisites.dockerServerVersion,
        environmentBrowsers,
        manifestSha256: context.manifestSha256,
      },
      runDirectory,
      runId,
      scope: options.project || options.spec || options.grep ? 'focused' : 'full',
    };
  } catch (error) {
    if (error instanceof ReleaseE2EError && error.receiptEligible) {
      const image = inspectImage(context.imageTag);
      const receiptKey = crypto.randomBytes(32);
      const receipt = createReceipt(
        {
          error,
          imageId: image?.Id ?? candidateImage?.imageId ?? 'not-built',
          imageTag: context.imageTag,
          manifest: context.manifest,
          options,
          previousReceipt: state.receipt,
          runtimeInputs,
        },
        receiptKey,
      );
      writePrivateFile(RECEIPT_KEY_PATH, `${receiptKey.toString('base64')}\n`);
      writePrivateJson(RECEIPT_PATH, receipt);
    } else {
      invalidateReceipt();
    }
    throw error;
  } finally {
    fs.rmSync(context.directory, { recursive: true, force: true });
  }
}

function finalizeQualification(result, options) {
  const runDirectory = path.resolve(result.runDirectory);
  const qualificationReportPath = path.join(runDirectory, 'semantic-harness-qualification.json');
  let preflight;
  let containerResult;
  let receipt;
  try {
    if (!fs.lstatSync(runDirectory).isDirectory())
      throw new Error('Artifact run is not a directory.');
    for (const [filePath, basename] of [
      [result.artifacts.preflightReport, 'preflight-report.json'],
      [result.artifacts.containerResult, 'run-result.json'],
      [qualificationReportPath, 'semantic-harness-qualification.json'],
    ]) {
      if (
        path.resolve(filePath) !== path.join(runDirectory, basename) ||
        !fs.lstatSync(filePath).isFile()
      ) {
        throw new Error('Qualification artifacts must be regular files from the same run.');
      }
    }
    preflight = readJson(result.artifacts.preflightReport);
    containerResult = readJson(result.artifacts.containerResult);
    receipt = readQualificationReportReceipt(qualificationReportPath);
  } catch (error) {
    throw new ReleaseE2EError('The canonical semantic qualification artifacts are unavailable.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_QUALIFICATION_ARTIFACT_INVALID',
      phase: 'finalization',
      details: { errorCode: error?.code || 'INVALID_ARTIFACT' },
    });
  }
  const discovery = preflight.checks?.find?.(
    ({ id }) => id === 'environment.playwright-discovery',
  )?.summary;
  const contract = loadQualificationClosureContract(REPOSITORY_ROOT);
  const cleanup = Object.fromEntries(
    ['created', 'cleaned', 'leaked'].map((key) => [key, containerResult?.cleanup?.[key]]),
  );
  const qualification = receipt.qualification;
  const closureFailures = [
    ...qualificationReportFailures(qualification, contract),
    ...qualificationCleanupFailures(cleanup),
  ];
  if (containerResult?.qualificationReportSha256 !== receipt.qualificationReportSha256) {
    closureFailures.push('qualification-report-digest');
  }
  for (const [name, artifact, kind] of [
    ['run-result', containerResult, 'tiangong-next-release-e2e-run-result'],
    ['preflight', preflight, 'tiangong-next-release-e2e-preflight-report'],
  ]) {
    if (
      artifact?.kind !== kind ||
      artifact?.schemaVersion !== 2 ||
      artifact?.status !== 'passed' ||
      artifact?.candidate?.commit !== result.candidate.commit ||
      artifact?.candidate?.tree !== result.candidate.tree
    ) {
      closureFailures.push(`${name}-identity-status`);
    }
  }
  if (containerResult?.exitCode !== 0 || containerResult?.preflight?.status !== 'passed') {
    closureFailures.push('run-result-exit-preflight');
  }
  if (discovery?.fullListedTests !== contract.coverage.discoveredCases) {
    closureFailures.push('discovery-canonical-cases');
  }
  if (discovery?.listedTests !== contract.coverage.qualificationDiscoveredCases) {
    closureFailures.push('discovery-qualification-cases');
  }
  if (closureFailures.length > 0) {
    throw new ReleaseE2EError('Semantic harness qualification closure is incomplete.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_QUALIFICATION_INCOMPLETE',
      phase: 'finalization',
      details: { closureFailures },
    });
  }
  const identity = qualificationIdentity();
  const proof = {
    schemaVersion: QUALIFICATION_PROOF_SCHEMA_VERSION,
    status: 'qualified',
    generatedAt: new Date().toISOString(),
    proofKey: identity.proofKey,
    candidate: {
      commit: result.candidate.commit,
      tree: result.candidate.tree,
    },
    qualificationInputSha256: identity.inputSha256,
    environmentContractSha256: identity.environmentContractSha256,
    environmentManifestSha256: result.environment.manifestSha256,
    browsers: ['chromium', 'firefox', 'webkit'].map((name) => ({
      name,
      version: result.environment.environmentBrowsers[name],
    })),
    assertionIds: qualification.assertionIds,
    assertionBrowsers: qualification.assertionBrowsers,
    coverage: contract.coverage,
    cleanup,
    externalRequests: qualification.externalRequests,
    productionWrites: qualification.productionWrites,
    diagnostics: {
      retainedOutsideGit: true,
      runResultSha256: sha256(fs.readFileSync(result.artifacts.containerResult)),
      qualificationReportSha256: receipt.qualificationReportSha256,
    },
  };
  const proofPath = resolveQualificationProofPath(options.proof);
  assertExternalProofPath(proofPath);
  writePrivateJson(proofPath, proof);
  return { ...result, qualificationProof: proofPath, proofKey: proof.proofKey };
}

function runQualification(options, state = {}) {
  const qualificationOptions = {
    ...options,
    allowProductionData: false,
    authenticated: false,
    qualification: true,
    recoveryLedger: path.join(RUNTIME_ROOT, 'qualification-recovery-ledger.json'),
    role: 'user',
    writeVerifiedEvidence: false,
  };
  const result = runRelease(qualificationOptions, {
    ...state,
    qualificationBootstrap: true,
  });
  return finalizeQualification(result, qualificationOptions);
}

function runDoctor(options) {
  const prerequisites = assertHostPrerequisites();
  const environment = loadEnvironmentContractFromWorkingTree();
  const image = ensureBaseImage(environment, { readOnly: true });
  const dependencyImage = ensureDependencyImage(environment, { readOnly: true });
  const browserVersions = runEnvironmentBrowserSmoke(dependencyImage.imageTag);
  return {
    checks: [
      { id: 'host.git', status: 'passed', summary: prerequisites.gitVersion },
      { id: 'host.node', status: 'passed', summary: prerequisites.nodeVersion },
      {
        id: 'host.docker-engine',
        status: 'passed',
        summary: prerequisites.dockerServerVersion,
      },
      {
        id: 'environment.contract',
        status: 'passed',
        summary: environment.sha256,
      },
      { id: 'environment.pinned-image', status: 'passed', summary: image.imageId },
      {
        id: 'environment.lockfile-dependencies',
        status: 'passed',
        summary: dependencyImage.imageId,
      },
      {
        id: 'environment.browser-launch',
        status: 'passed',
        summary: browserVersions,
      },
    ],
    nextCommand: 'pnpm e2e:release',
  };
}

function runInstall(options) {
  const prerequisites = assertHostPrerequisites();
  const environment = loadEnvironmentContractFromWorkingTree();
  const image = ensureBaseImage(environment, { offline: options.offline });
  const dependencyImage = ensureDependencyImage(environment, { offline: options.offline });
  const browserVersions = runEnvironmentBrowserSmoke(dependencyImage.imageTag);
  const manifest = {
    kind: 'tiangong-next-release-e2e-installed-environment',
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    contractSha256: environment.sha256,
    dockerServerVersion: prerequisites.dockerServerVersion,
    imageId: image.imageId,
    imageReference: environment.contract.playwrightImage,
    dependencyImageId: dependencyImage.imageId,
    dependencyImageTag: dependencyImage.imageTag,
    browserVersions,
  };
  writePrivateJson(ENVIRONMENT_MANIFEST_PATH, manifest);
  return {
    environmentManifest: ENVIRONMENT_MANIFEST_PATH,
    imageId: image.imageId,
    dependencyImageId: dependencyImage.imageId,
    browserVersions,
    reused: image.reused,
    dependencyImageReused: dependencyImage.reused,
    nextCommand: 'pnpm e2e:env:doctor',
  };
}

function runClean(options) {
  const recoveryLedgerPreserved = fs.existsSync(DEFAULT_RECOVERY_LEDGER_PATH);
  let removedImages = [];
  if (options.purgeImages && executableExists('docker')) {
    dockerEngineVersion();
    const listed = [IMAGE_LABEL, ENVIRONMENT_IMAGE_LABEL]
      .map(
        (label) =>
          runCapture('docker', ['image', 'ls', '--quiet', '--filter', `label=${label}=true`])
            .stdout,
      )
      .join('\n');
    removedImages = [...new Set(listed.split(/\s+/u).filter(Boolean))];
    if (removedImages.length > 0) {
      const status = runStreaming('docker', ['image', 'rm', ...removedImages]);
      if (status !== 0) {
        throw new ReleaseE2EError('Removing project-owned candidate images failed.', {
          exitCode: EXIT.FINALIZATION,
          failureCode: 'E2E_CLEAN_IMAGE_FAILED',
          phase: 'clean',
        });
      }
    }
  }
  fs.rmSync(RUNTIME_ROOT, { recursive: true, force: true });
  return {
    recoveryLedgerPreserved,
    removedImages,
    summary: 'Removed only tiangong-next release E2E local runtime state.',
    nextCommand: recoveryLedgerPreserved
      ? 'Inspect the preserved recovery ledger before the next production-data run.'
      : 'pnpm e2e:env:install',
  };
}

function readReceiptKey() {
  try {
    return Buffer.from(fs.readFileSync(RECEIPT_KEY_PATH, 'utf8').trim(), 'base64');
  } catch (error) {
    throw new ReleaseE2EError('The continuation receipt key is missing or unreadable.', {
      cause: error,
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_KEY_INVALID',
      phase: 'resume',
      nextCommand: 'pnpm e2e:release',
    });
  }
}

function resumeRelease() {
  if (!fs.existsSync(RECEIPT_PATH)) {
    throw new ReleaseE2EError('No active release E2E continuation receipt exists.', {
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_RECEIPT_MISSING',
      phase: 'resume',
      nextCommand: 'pnpm e2e:release',
    });
  }
  let receipt;
  try {
    const receiptKey = readReceiptKey();
    receipt = validateReceipt(readJson(RECEIPT_PATH), Date.now(), receiptKey);
    const options = {
      ...parseOptions('run', []),
      ...receipt.invocation,
      format: 'human',
      output: undefined,
    };
    const currentCredential = credentialReceiptBinding(options);
    if (JSON.stringify(currentCredential) !== JSON.stringify(receipt.runtimeCredential)) {
      throw new ReleaseE2EError('The receipt-bound runtime credential input changed.', {
        exitCode: EXIT.FINALIZATION,
        failureCode: 'E2E_RECEIPT_CREDENTIAL_DRIFT',
        phase: 'resume',
        nextCommand: 'pnpm e2e:release',
      });
    }
    return options.qualification
      ? runQualification(options, { receipt })
      : runRelease(options, { receipt });
  } catch (error) {
    if (error instanceof ReleaseE2EError && !error.receiptEligible && error.phase === 'resume') {
      invalidateReceipt();
    }
    throw error;
  }
}

function redactString(value, sensitiveValues = []) {
  let redacted = value;
  for (const sensitive of sensitiveValues.filter((entry) => typeof entry === 'string' && entry)) {
    redacted = redacted.split(sensitive).join('[REDACTED]');
  }
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]');
  redacted = redacted.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?/gu,
    '[REDACTED_TOKEN]',
  );
  return redacted;
}

function sanitize(value, sensitiveValues = [], key = '') {
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey &&
    !normalizedKey.includes('sha256') &&
    /password|secret|token|authorization|cookie|credential|api.?key|publishable.?key/u.test(
      normalizedKey,
    )
  ) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') return redactString(value, sensitiveValues);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, sensitiveValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, sensitiveValues, childKey),
      ]),
    );
  }
  return value;
}

function errorChain(error) {
  const chain = [];
  let current = error;
  while (current instanceof Error && chain.length < 5) {
    chain.push({ message: current.message, name: current.name });
    current = current.cause;
  }
  return chain;
}

function humanSummary(report) {
  const lines = [`${report.command}: ${report.status}`];
  if (report.failureCode) lines.push(`Failure: ${report.failureCode} (${report.phase})`);
  if (report.result?.runDirectory) lines.push(`Output: ${report.result.runDirectory}`);
  if (report.error?.message) lines.push(`Reason: ${report.error.message}`);
  if (report.nextCommand) lines.push(`Next: ${report.nextCommand}`);
  return `${lines.join('\n')}\n`;
}

function emitReport(report, options) {
  const sanitized = sanitize(report);
  const outputPath = options.output ? path.resolve(options.output) : undefined;
  if (outputPath) writePrivateJson(outputPath, sanitized);
  if (options.format === 'json') process.stdout.write(jsonText(sanitized));
  else process.stdout.write(humanSummary(sanitized));
}

function execute(command, options) {
  if (command === 'doctor') return runDoctor(options);
  if (command === 'qualification-key') return qualificationIdentity();
  if (command === 'check-qualification') return readQualificationProof(options);
  const releaseLock = acquireInvocationLock(command);
  try {
    if (command === 'install') return runInstall(options);
    if (command === 'qualify') return runQualification(options);
    if (command === 'run') return runRelease(options);
    if (command === 'resume') return resumeRelease();
    if (command === 'clean') return runClean(options);
    throw new ReleaseE2EError(`Unknown command: ${command}`, {
      exitCode: EXIT.INPUT,
      failureCode: 'E2E_UNKNOWN_COMMAND',
      phase: 'input',
    });
  } finally {
    releaseLock();
  }
}

function main(argv = process.argv.slice(2)) {
  const startedAtMs = Date.now();
  const command = argv[0];
  let options = { format: 'human', output: undefined };
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${commandHelp()}\n`);
    return 0;
  }
  try {
    options = parseOptions(command, argv.slice(1));
    if (options.help) {
      process.stdout.write(`${commandHelp()}\n`);
      return 0;
    }
    const result = execute(command, options);
    const finishedAtMs = Date.now();
    const report = {
      kind: 'tiangong-next-release-e2e-controller-report',
      schemaVersion: REPORT_SCHEMA_VERSION,
      command,
      durationMs: finishedAtMs - startedAtMs,
      finishedAt: new Date(finishedAtMs).toISOString(),
      nextCommand: result.nextCommand,
      result,
      startedAt: new Date(startedAtMs).toISOString(),
      status: 'passed',
    };
    emitReport(report, options);
    return 0;
  } catch (error) {
    const normalized =
      error instanceof ReleaseE2EError
        ? error
        : new ReleaseE2EError(error instanceof Error ? error.message : String(error), {
            cause: error instanceof Error ? error : undefined,
          });
    const finishedAtMs = Date.now();
    const report = {
      kind: 'tiangong-next-release-e2e-controller-report',
      schemaVersion: REPORT_SCHEMA_VERSION,
      command,
      durationMs: finishedAtMs - startedAtMs,
      error: {
        chain: errorChain(normalized),
        message: normalized.message,
      },
      details: normalized.details,
      exitCode: normalized.exitCode,
      failureCode: normalized.failureCode,
      finishedAt: new Date(finishedAtMs).toISOString(),
      nextCommand: normalized.nextCommand,
      phase: normalized.phase,
      retryable: normalized.retryable,
      startedAt: new Date(startedAtMs).toISOString(),
      status: 'failed',
    };
    emitReport(report, options);
    return normalized.exitCode;
  }
}

module.exports = {
  EXIT,
  MANIFEST_SCHEMA_VERSION,
  RECEIPT_SCHEMA_VERSION,
  QUALIFICATION_PROOF_SCHEMA_VERSION,
  ReleaseE2EError,
  acquireInvocationLock,
  assertLocalOperatorHostEnvironment,
  commandHelp,
  createReceipt,
  dockerRunArguments,
  finalizeQualification,
  jsonText,
  loadEnvironmentContractFromWorkingTree,
  lockedDependencyVersion,
  parseOptions,
  playwrightArguments,
  readContainerResult,
  redactString,
  sanitize,
  sha256,
  stableJson,
  receiptHmac,
  validateReceipt,
  qualificationIdentity,
  qualificationInputSha256,
  validateQualificationProof,
  validateRunOptions,
};

if (require.main === module) {
  process.exitCode = main();
}
