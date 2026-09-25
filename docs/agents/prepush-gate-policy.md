---
title: next Pre-Push Gate Policy
docType: contract
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when changing pre-push gate behavior
  - when deciding protected-branch parity expectations
  - when checking the intended trigger policy for `pnpm prepush:gate`
whenToUpdate:
  - when hook or CI trigger behavior changes
  - when protected-branch policy changes
  - when the rollout contract becomes inaccurate
checkPaths:
  - docs/agents/prepush-gate-policy.md
  - docs/agents/repo-validation.md
  - .husky/pre-push
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - playwright.config.ts
  - scripts/e2e/**
  - docker/e2e/**
  - tests/e2e/i18n/**
  - scripts/docpact
  - scripts/docpact-gate.js
  - scripts/prepush-gate-receipt.cjs
  - scripts/release/**
  - scripts/test-runner.cjs
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/typescript-native-parser.*
  - scripts/reference-data/**
  - .github/workflows/**
lastReviewedAt: 2026-09-25
lastReviewedCommit: 4aa4e7c91c261a3b9bead1572c8b1d326abe4332
lastReviewedNote: 'Reviewed Process site-label delivery: source, locale, manifest, and test changes remain covered by the existing Docpact and pre-push gates; trigger policy is unchanged.'
---

# Pre-Push Gate Policy

> Status: design and rollout contract. Current runtime truth is intentionally not duplicated here; read `docs/agents/repo-validation.md`, `.husky/pre-push`, and the active workflows for the live behavior.

## Purpose

Define the intended trigger policy for the existing local docpact gate and `pnpm prepush:gate` command without changing the quality bar.

## Exact Gate Command

Adding `--prepare-only` to a deterministic release command's `--apply` mode defers only PR creation to the workspace controller. It retains the same candidate composition, Docpact/static checks, checked push and exact remote-SHA verification. The returned proposal is submission evidence; it does not replace the dev Release PR gate or the main promotion proof.

```bash
pnpm docpact:gate
```

`pnpm docpact:gate` resolves the `docpact` CLI through `scripts/docpact`, so local pushes do not depend on bare `docpact` being available on `PATH`.

```bash
pnpm prepush:gate
```

The full gate runs LCIA verification, `pnpm reference-data:check`, lint/type checks, complete coverage, and the unchanged 100% coverage assertion in that order. Reference-data verification fails before the expensive suite when the source manifest, evidence, content-addressed filenames, generated registry, or gzip outputs drift.

`pnpm prepush:gate:agent` enables the same gate with compact agent output. Jest writes its complete stdout/stderr and structured result JSON under `.local/test-logs/**`; the console contains only stage starts, failed suites/assertions, and final summaries. The reusable Release Gate enables this mode and uploads those files as a seven-day CI artifact even on failure, so compact output does not discard diagnostic evidence.

Production-effective workflows separately run `pnpm reference-data:production:check`. This read-only gate includes reproducibility verification and then rejects any required resource without an `official`/`project-reviewed` native asset for every registry language or without explicit production clearance. It is not part of the normal pre-push gate because tracked rights blockers may remain while reviewed work is integrated on `dev`.

`pnpm release:static-preflight` owns the tracked static release boundary by checking all locale artifacts and production reference-data contracts. It does not claim browser execution; `pnpm release:preflight` remains a compatibility alias. A local push whose source or destination has `main` semantics (`main`, `master`, `hotfix/*`, `promote/*`, `release/*`, or equivalent `codex/` names) runs this static preflight between Docpact and the full test gate. A push to `dev` remains governed by Docpact plus the full test gate only.

The deterministic release commands preserve this split by construction. `release:to-dev` rejects main-semantic branch names and requires a safe release-line alignment: either current `main` is an ancestor of `dev`, or current `main` is an exact two-parent promotion whose second parent remains in `dev` history and whose tree is identical to that parent. It proves that only `package.json.version` and bounded Docpact review metadata changed while `pnpm-lock.yaml` remains byte-identical, preflights both the version candidate's `dev`-relative paths and the complete `main`-to-candidate path set, commits the composed candidate, and delegates transport to `push:checked --gate-profile release-candidate`. That profile rechecks Docpact plus static release contracts, while the exact deterministic Release PR into `dev` owns one non-browser static/full gate. `release:promote-dev-to-main` pins the merged `dev` candidate and uses `push:checked --gate-profile immutable-promotion`; its local push and main-target PR verify structure and the dev proof instead of repeating candidate acceptance. A direct main hotfix is a distinct path: its PR body carries an exact Issue/main-base/head marker, current main must be an ancestor, package version must remain unchanged, and the required main-candidate check runs static readiness plus one clean-runner full gate on that exact head. The only automatic transport retry remains the argument-free `push:retry` when the immediately preceding checked push created a new exact-intent receipt.

Playwright semantic localization proof remains separate from `prepush:gate`. Focused local diagnosis uses `pnpm e2e:dev`; exact committed qualification uses the repository-owned `e2e:env:install` / read-only `e2e:env:doctor` / `e2e:release` controller. Keeping both outside the routine hook prevents local pushes from requiring Docker, browsers, production credentials, or production data. The credential-free/read-only hermetic GitHub workflow is manually dispatched for an open business PR or chosen ref when change risk warrants browser evidence; release PR, promotion, and publication do not require it. The full authenticated closure belongs exclusively to an explicitly authorized local operator session.

Local semantic qualification writes only an ignored proof path supplied with `--proof`. Compute its key with `pnpm e2e:qualification:key`, generate with `pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json`, and verify with `pnpm release:proof:verify --proof <path>`. Manual GitHub qualification performs the same sequence without proof-cache reuse and uploads a short-lived artifact; no proof file is committed or reviewed as source.

Docs-impact screenshot execution is an isolated workspace tooling surface. Next contributes only the exact source commit's declarative `config/docs-capture/profile.v1.json`; the workspace package owns profile validation, plan compilation, secret-file handling, read-only actions, Playwright capture, and access classification. This proof does not join the routine pre-push/release gate and does not change semantic E2E's `screenshot: off`, trace, video, or auth-artifact policy.

Routine locale and pre-push checks validate the external-proof contract without requiring a browser artifact in the checkout. Exact browser execution is an operator-selected business-PR-stage qualification, not a release enforcement condition. If a local operator supplies external authenticated evidence to the explicit production-readiness command, current backend, raw `pnpm-lock.yaml`, `pnpm-workspace.yaml`, runtime assets, semantic tests, and route/source digests must match exactly. pnpm does not store the root application version in its lockfile, so no lock normalization is allowed.

Qualification reuse is content-addressed and computed from current inputs; it is never granted through a tracked digest compatibility or waiver file. The closed simulator uses its fixed non-production backend profile, so deployment-only `.env` drift does not invalidate semantic proof. Source, harness, shared-helper, Git mode/type, or pinned browser-environment drift does. A behavior-key hit still passes proof verification before reuse.

## Scope

This document owns the intended trigger policy only.

It does not own:

- the canonical proof bar
- the current live hook behavior
- the current CI implementation details
- scoped locale preparation and historical German compatibility gates; active locale proof is documented in `docs/agents/repo-validation.md`, while frozen German history is retained under `docs/plans/i18n-de-DE/`

## Target Trigger Rules

| Surface | Target rule |
| --- | --- |
| local `pre-push` hook | ordinary delivery pushes run Docpact first and the full local gate last; exact deterministic release-candidate and immutable-promotion branches may use their repo-owned reduced profiles, which run Docpact plus static release preflight and defer the non-browser release gate to the exact dev Release PR |
| non-mutating or deletion-only push | skip the checkpoint and both gates because no candidate content is being delivered; a checked push remains branch-update-only and rejects deletion before any gate |
| same-push transport retry | permit the repo-owned retry helper only when a managed original push failed after its hook completed and the ignored bounded receipt proves the exact clean HEAD, branch, ref update, remote, toolchain, dependency tree, gate inputs, and Docpact base are unchanged |
| ordinary GitHub branch pushes | do not run broad duplicate remote test jobs or the Playwright browser matrix |
| PRs into `dev` | ordinary PRs rely on local full test-gate evidence and focused proof, while the lightweight `ai-doc-lint` PR job supplies executed, exact-head Docpact CI for workspace merge verification; do not duplicate the full suite remotely. A marker-bound deterministic Release PR also runs the reusable non-browser Release Gate and emits a 30-day proof bound to the main baseline, dev base/head/tree, version, PR, workflow run, attempt, and artifact |
| PRs into `main` | keep the required compatibility check name `Main Candidate / Release Gate`, but verify only that the head is the exact tree-identical merge of the proved dev candidate, the main baseline has not drifted, and the bound dev release proof remains valid; do not rerun candidate tests or browsers |
| `dev -> main` promotion candidate | use `release:to-dev` so the version PR preflights the complete current-`main` to candidate path set and owns the non-browser release gate; after it merges, the immutable promotion rechecks identity and reuses that proof |
| semantic E2E `workflow_dispatch` | remains an optional credential-free/read-only hermetic qualification for an operator-selected open business PR or exact SHA; it never receives production credentials, authorizes production writes, or becomes a release prerequisite |
| local authenticated semantic E2E | run `e2e:release` only in an explicitly authorized operator session with a protected runtime-only credential file, archived clean candidate, verified local-bundle/production-backend targeting, explicit authenticated/write/evidence options, and exact cleanup |
| canonical post-merge `main` pushes | read `package.json.version`; require the exact main merge, promotion merge, dev Release PR, main/dev bases, candidate tree, version, successful aggregate job, run attempt, unexpired artifact, and payload all to match; normal pushes fail fast and require a new dev candidate when proof is absent or invalid, then create or verify the matching `v*` tag and continue publication without rerunning candidate acceptance |
| unchanged-version `main` workflow hotfix pushes | skip release when the matching `v*` tag already points to an older `main` commit |
| manual release tags or `workflow_dispatch` recovery on `main` commits | remain supported for recovery/backfill releases and always run the full reusable Release Gate before deploy/release |

## Adoption Conditions

- the hook accepts an already-active exact Node.js 24.19.0 from `PATH`; it falls back to local NVM only when the active Node is absent or has another version, and fails clearly if Node 24.19.0 is still unavailable
- hook behavior and release-gate behavior must match the documented policy
- every normal release must have exactly one valid aggregate gate for its exact dev candidate; promotion and publication may only reuse the bound proof
- branch policy must stay aligned with `dev -> main`
- any coverage collection exclusions must be explicit, reviewed, and paired with focused verification of the affected user-visible wrapper flows
- data workflow fixture expansions stay under the existing `tests/**` docpact trigger; they do not change the protected-branch gate policy unless the actual hook, CI command, or coverage bar changes
- semantic E2E keeps its local candidate frontend on a loopback URL, derives locales from registries, disables screenshot/trace/video/auth artifacts, and keeps every semantic E2E GitHub Actions run credential-free/read-only
- docs-impact capture remains on-demand and isolated from semantic E2E; workspace tooling owns its external absolute mode-`0600` account file, mandatory run-scoped origin, non-auth mutation guard, and explicit next-docs output roots, while Next owns only the source-bound profile consumed from the exact rendered commit
- an authorized local production-data run is rejected before Docker when host `CI` or `GITHUB_ACTIONS` is set; after the local check passes, the controller clears only those image-inherited markers at container runtime and still requires `E2E_AUTHENTICATED=true`, `E2E_ALLOW_PRODUCTION_DATA=true`, and the exact one-process confirmation token; `E2E_WRITE_VERIFIED_EVIDENCE=true` separately opts into tracked evidence. It writes its intent ledger before create; cleanup verifies the production row UUID, authenticated owner, and all five multilingual-field markers across registry authoring languages before exact-ID deletion, then proves `created=cleaned` and `leaked=0`
- Header Umi `SelectLang` remains `reload={false}` so same-document locale refresh and delayed old-response race behavior stay browser-verifiable
- historical German review commands may remain explicit compatibility gates, but active locale/context/quality/correction/activation and `pnpm prepush:gate` must never read ignored confirmation files

## Short Rule Summary

- keep one authoritative full gate
- do not require an NVM-managed copy of Node 24.19.0 when the runner or operator already has that exact runtime active on `PATH`
- for ordinary delivery, let the existing push hook own the single full-gate execution after the final controlled tracked change; deterministic release-candidate and promotion pushes use only their restricted structural/static profiles because the dev Release PR owns aggregate acceptance
- use manual full-gate execution only when a no-push handoff needs the evidence
- use `pnpm push:checked <normal git push arguments>` for the final managed push; its ordinary Git hook runs both authoritative gates and returns a private gate-bound payload to the wrapper
- an already-up-to-date push supplies no ref updates, and a raw deletion-only push supplies no new candidate content, so the hook skips checkpoint collection and both gates; a managed no-op succeeds only with a private nonce-bound no-update acknowledgement, while checked ref deletion is rejected before any gate, and neither path can activate a retry receipt
- normalize the normal Git source spelling `HEAD` to the current exact branch only when its SHA equals the immutable checkpoint; reject every other ineligible checked ref shape before Docpact or the full gate, rather than reporting a deterministic transport-shape error after expensive validation
- hook completion alone never creates a reusable receipt: a successful managed original push leaves no receipt, and only a non-zero original push after a valid hook payload activates an ignored, one-hour, bounded single-push-intent receipt under `.local/prepush-gate/`
- the checked-push session directory and nonce remain private to the hook coordinator and are removed from Docpact and test-gate subprocess environments, so nested tests or helper pushes cannot forge the outer session's successful-gate payload
- after that uncertain or failed transport, use `pnpm push:retry` with no arguments; remote, ref, and commit come only from the receipt, and any operator-supplied target argument is rejected
- when the original checked transport fails after both gates passed, the wrapper prints the exact standalone next action `Next: pnpm push:retry`
- the helper rechecks the remote/refspec, HEAD/tree/branch, clean worktree, Node/pnpm, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, installed pnpm layout and dependency tree, hook/gate inputs, and resolved Docpact base before it internally performs the receipt-bound exact-SHA `--no-verify` transport; this internal helper call is the only bypass authority
- if the remote already equals the receipt-bound target SHA, the helper clears the receipt and succeeds idempotently without another push or gate run
- a successful helper transport deletes the receipt; a retry transport failure may retain it only while the remote remains at the bound pre-push SHA and the one-hour TTL is valid, and a pre-transport verification outage performs no push and leaves the bounded receipt available until verification recovers or the TTL expires; expiry, malformed state, controlled-input drift, or any other verified remote state fails closed and invalidates it
- never invoke `git push --no-verify` or `HUSKY=0` manually; a missing or invalidated receipt requires a new managed push and hook-owned gate run
- run the lightweight docpact gate before the full local test gate so governed-doc review failures surface early
- before a `dev -> main` promotion, require the dev Release PR non-browser proof; the main-target PR and post-merge workflow accept it only for structurally matching unchanged-tree merges and fail closed instead of rerunning the complete gate. Treat an explicitly marked, unchanged-version main hotfix as a separate exact-head full-gate path, never as a promotion-proof fallback
- protect the actual local and release gates
- keep one logical full-suite qualification for each canonical release candidate: the exact dev Release PR runs it and emits the proof; normal promotion/main paths never fall back to another aggregate run when proof identity cannot be established. The aggregate command runs the receipt suite once in an isolated no-coverage Jest process and every remaining suite once through a coverage-enabled coordinator with exactly two workers and a `512MB` per-worker idle-memory recycle boundary, so do not precede it with a second standalone `test:ci` or coverage run
- under Jest 30, the native threshold continues to enforce 100% statements, functions, and lines. `test:coverage:assert-full` excludes only Babel/Istanbul `if` alternate slots that have no source coordinates, fails closed for every other malformed map, and independently requires 100% of every source-mapped branch; raw synthetic-slot percentages are not a replacement baseline
- keep agent/CI console output bounded to stage, failure item, and final summary lines while preserving full Jest logs and structured results under `.local/test-logs/**` for artifact upload
- avoid spending GitHub Actions minutes on ordinary push-triggered test jobs
- keep semantic E2E independent from `prepush:gate` and release proof: routine PR/dev/release events do not trigger browser work, an operator may run one hermetic credential-free qualification while the business PR remains open, and only an explicitly authorized local operator run may close the authenticated 50-ID digest-bound proof
- keep routine locale/pre-push validation structural and deterministic; revalidate current semantic evidence file hashes only in the explicit production-readiness gate
- keep publication automation in the same `main` push workflow, but create the tag only after exact dev-candidate proof verification; reserve a fresh aggregate run for explicit tag or `workflow_dispatch` recovery, not a normal main-push fallback
- use `workflow_dispatch` with an existing `v*` tag when a release needs to be recovered with newer workflow code
- make draft creation single-writer before parallel Electron publication, fail closed when more than one release uses the tag, and verify the exact cross-platform asset set after every matrix run
- reproduce Umi-generating focused tests, coverage commands, and `pnpm prepush:gate` serially on one workstation when they are needed; the full gate already contains the complete test inventory and unchanged 100% `src/**` coverage
- keep `100%` coverage on every tracked file, and treat any direct-collection exclusions as a reviewed exception rather than a default pattern
