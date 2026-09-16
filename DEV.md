---
title: next Development Bootstrap
docType: guide
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when setting up the repo locally
  - when checking the canonical local commands
  - when resetting the shortest safe work loop after time away
whenToUpdate:
  - when bootstrap commands change
  - when the default local work loop changes
  - when the owning doc pointers become stale
checkPaths:
  - DEV.md
  - AGENTS.md
  - .docpact/config.yaml
  - package.json
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - playwright.config.ts
  - config/docs-capture/**
  - scripts/e2e/**
  - scripts/release/**
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/test-runner.cjs
  - scripts/prepush-gate-receipt.cjs
  - scripts/typescript-native-parser.*
  - docker/e2e/**
  - tests/e2e/i18n/**
  - .github/workflows/i18n-semantic-e2e.yml
  - .github/workflows/release-gate.yml
  - .github/workflows/release-readiness.yml
  - .github/workflows/build.yml
  - .nvmrc
lastReviewedAt: 2026-09-16
lastReviewedCommit: 483f2ea90f7b1b214853574527d150274b4c5f8d
lastReviewedNote: 'Reviewed for Platform #1076: the default work loop now names what a hosting-boundary build must leave behind, so DEV.md agrees with the implemented crawler and unknown-path behavior in public/robots.txt, public/404.html, public/edgeone.json and the shell metas. No bootstrap step, command, prerequisite or release flow changed.'
---

# Development Bootstrap

> Purpose: local setup and the shortest safe work loop for this repo. Repo contract and document ownership live in `AGENTS.md`; minimum proof lives in `docs/agents/repo-validation.md`.

## Use When

- setting up the repo locally
- checking the canonical local commands
- resetting your local work loop after time away

## Do Not Use For

- deciding branch policy
- deciding minimum proof for a change
- deciding which document owns a rule

## Prerequisites

- Node.js `24.19.0`
- Corepack with the repository-pinned `pnpm` `11.24.0`
- local shell configured so `nvm install` and `nvm use` honor `.nvmrc`

## Bootstrap

```bash
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
```

`pnpm install --frozen-lockfile` installs the exact dependency graph from the committed `pnpm-lock.yaml`. The project keeps pnpm's isolated linker and exposes only the narrow `@babel/*` and `umi` compatibility patterns recorded in `pnpm-workspace.yaml`; do not broaden them or enable `shamefully-hoist`. Narrow overrides collapse Umi's published React 18 / antd 4 / ProComponents 2 fallback metadata to the repository's one reviewed React 19 / antd 6 / ProComponents 3 generation. Run a non-frozen `pnpm install` only when intentionally changing dependencies, and commit the resulting lockfile update.

The direct development browser harness uses `@playwright/test` `1.62.1`. Install its browser engines only when using `pnpm e2e:dev` or `pnpm test:e2e:i18n` directly on the host:

```bash
pnpm exec playwright install chromium firefox webkit
```

Hermetic browser qualification does not use host browser binaries, host `node_modules`, Umi/MFSU caches, or the parent workspace. It requires the repo Node.js `24` launcher plus Git and a running Docker engine; the idempotent installer owns the pinned Playwright image and all E2E-specific runtime dependencies:

```bash
pnpm e2e:env:install
pnpm e2e:env:doctor
```

`e2e:env:doctor` is read-only and never pulls, builds, authenticates, or writes production data. A missing image exits early with the exact installer command.

## Default Work Loop

1. `nvm use`
2. `pnpm start`
3. make the scoped change
4. run focused validation
5. run `pnpm lint`
6. run `pnpm build` when the change affects shipped behavior or static assets. A build that touches the hosting boundary must leave `dist/robots.txt` and `dist/404.html` present, the noindex meta in `dist/index.html`, and the OAuth consent rewrite plus its headers in `dist/edgeone.json`
7. commit the final controlled tracked change and run `pnpm push:checked origin <branch>`; its ordinary hook owns the one full gate. Do not pass a reduced gate profile manually; the deterministic release commands own those restricted profiles.

If no push will occur and a standalone handoff needs final evidence, run `pnpm docpact:gate` and then `pnpm prepush:gate` manually instead. Do not also push the same unchanged checkpoint merely to repeat those gates.

## Canonical Commands

| Task | Command |
| --- | --- |
| start shared `dev` env | `pnpm start` |
| explicit shared `dev` env | `pnpm start:dev` |
| explicit `main` env | `pnpm start:main` |
| sync the self-hosted Edge mirror from one reviewed commit | `./docker/pull-edge-functions.sh --ref <40-character-commit-sha>` |
| local docpact gate | `pnpm docpact:gate` |
| lint + typecheck | `pnpm lint` |
| native TypeScript 7 web typecheck | `pnpm tsc` |
| native TypeScript 7 Electron typecheck | `pnpm tsc:electron` |
| shared CI-style test runner | `pnpm test` |
| direct/focused semantic localization E2E development | `pnpm e2e:dev <Playwright arguments>` (`pnpm test:e2e:i18n` remains the CI-compatible alias) |
| scope-closure adapter unit proof | `pnpm test:qualification:scope-closure:unit` |
| scope-closure loopback browser proof | `pnpm test:qualification:scope-closure:browser` (normally invoked by the exact-commit adapter) |
| install the isolated release E2E environment | `pnpm e2e:env:install` |
| read-only release E2E environment diagnosis | `pnpm e2e:env:doctor` |
| run an exact committed release candidate | `pnpm e2e:release <release options>` |
| resume one exact pre-fixture failure | `pnpm e2e:release:resume` (no arguments) |
| clean project-owned release E2E runtime state | `pnpm e2e:env:clean` (`--purge-images` is opt-in) |
| focused Jest suite | `pnpm test:ci <jest-args>` |
| data workflow unit proof | `pnpm test:data-workflows:unit` |
| focused live data workflow | `pnpm test:workflows --<workflow> <workflow-args>` |
| live API smoke workflows | `pnpm test:api:smoke <workflow-args>` |
| full coverage | `pnpm test:coverage` |
| strict full-coverage assertion | `pnpm test:coverage:assert-full` |
| coverage report + queue summary | `pnpm test:coverage:report` |
| deterministic locale audit | `pnpm i18n:audit` |
| language registry/Manifest contract audit | `pnpm i18n:platform:audit` |
| business-language hardcoding audit | `pnpm i18n:hardcoding:audit` |
| verify generated reference-resource assets and manifest | `pnpm reference-data:check` |
| require every governed reference resource to have native reviewed assets and explicit production clearance | `pnpm reference-data:production:check` (fails while rights or delivery blockers remain) |
| regenerate reference-resource assets and manifest from reviewed sources | `pnpm reference-data:write` |
| audit one registry locale | `pnpm i18n:locale:audit --locale <canonical-locale>` |
| generate every locale's canonical context, structural-validation, quality, and activation artifacts once in dependency order | `pnpm i18n:locale:artifacts:write` |
| prove two consecutive locale-artifact generations preserve the exact Git diff | `pnpm i18n:locale:artifacts:idempotence` (its isolated clone reproduces generator-required remote refs, including tracked `origin/main`) |
| verify an external semantic-evidence artifact is in canonical repository format | `pnpm i18n:evidence:canonical:check --path <artifact>` |
| check one locale's context and quality | `pnpm i18n:context:check --locale <canonical-locale>` then `pnpm i18n:locale:quality:check --locale <canonical-locale>` |
| check tracked existing-translation corrections | `pnpm i18n:corrections:check` |
| check one locale's activation boundary | `pnpm i18n:locale:activation:check --locale <canonical-locale>` |
| check every active locale's activation boundary | `pnpm i18n:locale:all:check` |
| require every active locale to be production-ready | `pnpm i18n:locale:all:production:check` (fails while any owned blocker remains) |
| run the static release preflight (no browser claim) | `pnpm release:static-preflight` (`release:preflight` is a compatibility alias) |
| preferred version-bump PR into `dev` | `pnpm --silent release:to-dev --version <x.y.z> --issue <number> --apply` |
| preferred immutable `dev -> main` promotion after the version PR merges | `pnpm --silent release:promote-dev-to-main --release-pr <merged-dev-pr-number> --issue <number> --apply` |
| compute the semantic qualification identity key | `pnpm e2e:qualification:key` |
| qualify the semantic release harness locally without production access | `pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json` |
| verify an external qualification proof | `pnpm release:proof:verify --proof <path>` |
| manually qualify a business PR/ref in GitHub | `gh workflow run i18n-semantic-e2e.yml --repo tiangong-lca/platform --ref <workflow-branch> -f ref=<business-pr-branch-or-sha>` |
| enforce active German runtime assembly | `pnpm i18n:de:audit` |
| validate the historical Issue #606 snapshot only | `pnpm i18n:de:delta:review:check` |
| validate the historical Issue #601 Pilot only | `pnpm i18n:de:pilot` |
| build | `pnpm build` |
| local full test gate | `pnpm prepush:gate` |
| compact agent/CI full gate with complete retained logs | `pnpm prepush:gate:agent` |
| final managed push | `pnpm push:checked <normal-git-push-args>` |
| retry one receipt-bound failed transport | `pnpm push:retry` |
| repo AI-doc lint | `scripts/docpact validate-config --root . --strict && scripts/docpact lint --root . --base <base> --head <head> --mode enforce` |

The repository has one TypeScript track: the direct `typescript` dependency is exact-pinned to `7.0.2`, and every compiler entry uses that package. There is no TypeScript 6 alias or `tsc6` fallback. Repository-owned source analysis uses `scripts/typescript-native-parser.mjs`; that file and `scripts/typescript-native-parser.d.mts` are the only places allowed to import `typescript/unstable/*`. Run the adapter contract tests after every TypeScript upgrade.

The TIDAS consumer is exact-pinned to released `@tiangong-lca/tidas-sdk` `0.2.0`. The focused installed-package contract launches Node outside the Jest module mapper, exercises all seven dataset factories, and verifies `validateEnhanced` plus its normalized failure envelope; keep that proof with dependency/toolchain upgrades so the SDK mock cannot hide a package incompatibility.

Both application and release-E2E Node container sources retain exact Node `24.19.0` tags plus immutable multi-architecture digests. The E2E environment contract and candidate manifest additionally bind the pinned Node image reference; never replace either digest with a movable tag-only source.

Every owned GitHub Actions pnpm bootstrap uses the repository-reviewed, peeled executable `pnpm/setup` v2.0.2 commit SHA, while its inputs pin pnpm `11.24.0` and Node `24.19.0`. Preserve the readable version comment, but never replace the commit SHA with an annotated-tag object or moving major tag.

`pnpm lint` runs Oxlint, Prettier verification, and the native TypeScript 7 web typecheck. Oxlint owns unused and deprecated API correctness; the repo-local `tiangong/no-invalid-this` plugin preserves the legacy strict-context rule that Oxlint does not yet provide natively. Prettier owns formatting only and does not organize imports.

The qualified production bundle remains Umi's current Webpack path followed by the repo-owned TypeScript checks. Do not enable the optional Umi/Mako `forkTSChecker` path until its dependencies are proved compatible with TypeScript 7; the TypeScript 7 package's CommonJS root intentionally does not expose the legacy JavaScript Compiler API that this optional path currently expects.

The UI dependency track is exact-pinned to React/React DOM `19.2.8`, antd `6.6.2`, icons `6.3.4`, and ProComponents `3.1.14-6`. Umi `4.7.9` supplies the single global ConfigProvider and App; `src/app.tsx` owns initial/dynamic theme synchronization, while `src/contexts/AntdAppContext.tsx` registers its feedback API for non-component callers. Do not restore antd 5 render patches, split ProComponents packages, static `message`/`Modal`/`notification` calls, or legacy component-member APIs. `skipLibCheck: true` remains only because the exact ProComponents prerelease still publishes invalid external declaration references; web source remains strict and must pass `pnpm tsc`.

The reviewed test and packaging majors are Jest / `jest-environment-jsdom` / `@jest/test-sequencer` `30.5.0`, `@testing-library/jest-dom` `7.0.1`, Electron `44.1.0`, and `npm-check-updates` `23.1.0`. Jest 30 proof must preserve the explicit test inventory and slow-first sequencer, Electron publication remains on the four supported 64-bit targets, and the package manifest's canonical GitHub repository metadata must remain available to electron-builder from both normal checkouts and Git worktrees.

`pnpm test` still discovers and executes the complete Jest inventory. The repository sequencer starts the three known process-heavy suites first, while preserving Jest's normal ordering within the remaining group. The pre-push receipt contract builds one reusable seed and gives every test its own copied repository and bare remote; never share mutable Git state between cases.

On macOS, the Jest child process disables V8 concurrent recompilation and Maglev after the documented Node 24 `ClearStaleLeftTrimmedPointerVisitor` crash reproduced while those optimization tiers were active. The unit stage also keeps its 25% worker pool with Jest's `512MB` idle-memory recycle boundary, so the mitigation does not turn the complete suite into a serial run.

For the normal deterministic flow, select browser evidence before `release:to-dev`, while the relevant business/fix PR is still open. When the change risk warrants it, dispatch `i18n-semantic-e2e.yml` for that PR branch or exact SHA; it always runs the credential-free hermetic qualification, including the complete Chromium route/view matrix and Firefox/WebKit critical scenarios, so a failure can be fixed on the same PR. This is an operator-selected acceptance signal, not an unavoidable release check.

`release:to-dev --apply` changes only `package.json.version` plus bounded Docpact review metadata and requires `pnpm-lock.yaml` to remain byte-identical. Its generated candidate push runs Docpact plus `release:static-preflight`; it does not run browsers and never writes proof into the branch. The exact resulting Release PR into `dev` runs the reusable non-browser Release Gate—static contracts and the full Jest gate—then emits an external proof bound to both branch bases, candidate head/tree/version, PR, run, attempt, and artifact. The immutable promotion push, main promotion PR, and normal version-changing main publication verify candidate identity and that proof without running browser E2E. A direct main hotfix is explicitly marker-bound to its tracked Issue, current main base, and exact PR head, must preserve package version, and runs one clean-runner static/full gate on that head. Canonical E2E discovery still recursively includes nested spec directories whenever manual qualification is invoked; unknown simulator requests, external origins, and production writes fail that qualification.

Qualification builds with the fixed non-production profile in `docker/e2e/qualification.env`; it never reads or connects to the deployment target in `.env` or `origin/main:.env`. Its identity covers behavior-affecting source, public assets, config, shared E2E helpers, Git entry mode/type, runtime contracts, and the browser environment contract. Deployment-only `.env` and root release-version metadata are excluded. Manual GitHub qualification always executes and stores proof only as a 30-day Actions artifact; local proof lives under ignored `.local/e2e-release/**`. Source branches contain no qualification receipt, semantic evidence record, digest compatibility file, or proof hash update.

After explicit user authorization, an operator runs the complete authenticated closure from a clean committed candidate. The runtime-only users file must be mode `0600`; `--role` selects a credential entry but does not impose a global business-role requirement:

```bash
chmod 600 .env.users.local
pnpm e2e:release \
  --authenticated \
  --allow-production-data \
  --write-verified-evidence \
  --users-env-file .env.users.local
```

The controller first refuses this production-data command when the host has `CI` or `GITHUB_ACTIONS` set. After that local-operator check passes, it clears only the release image's inherited CI markers at container runtime so the unchanged in-container production-write guards can validate the explicit authorization. This command shape remains forbidden in semantic E2E GitHub Actions; the optional manual workflow uses only the credential-free/read-only hermetic qualification.

The authenticated production-data closure remains an explicit local operator diagnostic and is not a normal release prerequisite. Merge the deterministic dev Release PR only after its non-browser Release Readiness proof succeeds, then create the `dev -> main` Promote PR from that immutable merged candidate. The promotion check verifies the dev proof without obtaining production credentials, write authority, or a browser run.

## Preferred Release PR Flow

Use these commands for every normal versioned release. They replace manual package-version editing, release branch/commit/push assembly, and direct PR creation.

1. Preview the version-to-`dev` plan without changing Git or GitHub:

   ```bash
   pnpm --silent release:to-dev --version <x.y.z> --issue <number>
   ```

2. Apply that exact plan only after any operator-selected manual browser qualification for the open business PR is complete. This composes the version and bounded Docpact evidence, runs the restricted structural/static candidate push, and creates or reuses the Release PR targeting `dev`. That PR runs the one non-browser release gate:

   ```bash
   pnpm --silent release:to-dev --version <x.y.z> --issue <number> --apply
   ```

3. After the returned `dev` PR is merged, preview the immutable promotion using that merged PR number:

   ```bash
   pnpm --silent release:promote-dev-to-main --release-pr <merged-dev-pr-number> --issue <number>
   ```

4. Apply the promotion plan. This structurally verifies the immutable candidate and creates or reuses the proof-only PR targeting `main`:

   ```bash
   pnpm --silent release:promote-dev-to-main --release-pr <merged-dev-pr-number> --issue <number> --apply
   ```

For workspace-managed delivery, add `--prepare-only` to either `--apply` command. The helper still composes and pushes the exact candidate through every structural, Docpact and restricted push gate, then returns `status: ready_for_submission` and `pr_proposal` without creating a PR. Save the proposal body verbatim to a file and pass its repository, base, head and title through the workspace controller's current `task submit` surface; use its immutable-promote route for the main promotion. Confirm the submitted PR head equals `pr_proposal.expected_head` and preserve the embedded release marker. Start each owning executable task through the controller before preparing it. When an exact matching open PR already exists, the helper returns that PR without creating another one.

The push remote must identify one fetch/push repository. Canonical HTTPS and SSH URLs may differ only in transport; account-specific transport belongs in scoped Git configuration. Direct `tiangong-lca/platform` heads use a bare branch name, while personal forks use `owner:branch` when creating the PR. PR lookup uses a bare branch and verifies returned head repository/owner metadata before reuse. Multiple URLs, conflicting explicit owners, a different repository under the canonical owner, missing PR identity or a full bounded result stop the helper. An opaque personal-fork remote requires an explicit `--head-owner`; that override cannot bypass a known mismatch or ambiguous fetch/push destination.

The commands create or reuse PRs but never merge them. Merge the dev Release PR only after its non-browser gate passes; the later main check is expected to be proof/identity-only and must fail closed if the candidate or main baseline drifted. Browser E2E is not evaluated by either release PR. Use a manual release-assembly path only for an explicitly diagnosed unsupported or recovery case; document why the deterministic command could not represent the release, and preserve its version-only, immutable-candidate, and managed-gate guarantees.

Both release commands default to read-only planning when `--apply` is omitted. `--apply` is the only mode that creates branches, commits, pushes, or pull requests. Their stdout is one schema-versioned JSON document; preflight, managed-gate, and Docpact output is retained under `.local/release-automation/`. The version-to-dev command proves that only `package.json.version` and bounded Docpact review metadata changed; `pnpm-lock.yaml` must remain byte-identical because pnpm does not encode the root package version there. It independently checks the version candidate's `dev`-relative paths and the complete `main`-to-candidate promotion paths, then resolves only active Docpact `missing-review` findings whose mode is `review_or_update`, to a bounded fixed point. The composed commit must pass `release:static-preflight` before the checked push. Any dependency, lockfile, document-body, uncovered, stale, missing, untracked, or unsupported change stops the command. Release-line validation accepts direct `main` ancestry in `dev`; after a normal promotion, it also accepts the exact two-parent `main` merge only when its second parent remains in `dev` history and the merge tree equals that promoted parent. The promotion command pins the exact merged dev SHA and requires the dev Release PR's bound proof; its main-candidate check does not repeat browser or full-suite acceptance. Both commands reuse a matching open PR and fail closed on version, branch, main-baseline, proof, or dev-candidate drift.

## Command Rules

- `pnpm start` and `pnpm start:dev` are equivalent. Both select `.env.development*` when Umi has preloaded exact main-file defaults; a distinct explicit `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` supplied by the shell/build remains higher priority per key
- Edge mirror refresh accepts only a full reviewed commit SHA, records the resolved source in `docker/volumes/functions/.source-revision.json`, deletes stale mirror files, and must be rerun once with no resulting tracked change before handoff
- documentation capture is a separate local operator workflow: this repository supplies only `config/docs-capture/profile.v1.json`, stable semantic locators, and its exact UI runtime
- the generic Playwright engine, private credential pointer, dynamic loopback origin, access report, and screenshot outputs are owned by the workspace docs-impact tooling; they must not be copied into this repository or its release-E2E surfaces
- the workspace wrapper must load the profile from the same exact Next commit that it starts as the render target; a profile from current `main` must not control a historical UI
- the profile is declarative and contains no account values, ports, browser state, output paths, or executable screenshot code
- changing a profile locator, login contract, authorization probe, readiness path, or runtime command requires the workspace v2 compiler tests and an authorized end-to-end canary
- use `pnpm start:main` only when the task explicitly requires the `main` environment
- direct semantic E2E development is configured by `playwright.config.ts`, runs from `tests/e2e/i18n/**`, and serves the local worktree with `pnpm start:main`; `E2E_BASE_URL` must remain a loopback URL
- release E2E accepts only a clean committed Next candidate, exports it with `git archive`, builds one production bundle in the digest-pinned Playwright image, serves that immutable bundle internally, and never mounts `lca-workspace`, `.git`, unrelated submodules, host dependencies, or browser profiles
- release preflight verifies the environment/candidate identities, writable isolated storage, all three browser launches, bundle/login readiness, production backend target, optional role-neutral login, recovery-ledger safety, and Playwright discovery before production fixture intent/create
- only one install/run/resume/clean invocation may mutate project-owned E2E state at a time; a dead owner lock is recovered automatically, while a live owner fails early instead of racing shared build/runtime/ledger state
- a failed build, server, or preflight phase may activate one ignored one-hour HMAC-bound continuation receipt; argument-free `pnpm e2e:release:resume` revalidates the exact commit/tree/lock/environment/source/image/arguments and reruns preflight, while browser results and production-fixture phases are never reused
- race diagnosis may add `--project <browser> --spec <path>` or `--grep <pattern> --repeat-each <1-5>`; repeat is accepted only for a focused read-only scope and cannot write verified evidence
- diagnostics retain the sanitized original error chain and emit stable phase/check IDs, coarse exit classes (`2`, `10`, `20`, `30`, `40`, `50`), cleanup state, output path, and one exact next command
- semantic E2E GitHub Actions is credential-free and read-only: `i18n-semantic-e2e.yml` is dispatched manually for a chosen business-PR branch or exact SHA when browser evidence is warranted, runs the hermetic content-addressed qualification including the three-browser critical scenarios, and is never triggered or required by routine PR/dev/release events
- the full authenticated closure runs only in an explicitly authorized local operator session with runtime credentials and `E2E_AUTHENTICATED=true`; the host controller refuses production-data mode when `CI` or `GITHUB_ACTIONS` is set, then an accepted local run overrides the image-inherited markers to empty inside the container; production write still requires both `E2E_ALLOW_PRODUCTION_DATA=true` and the exact one-process confirmation token, while tracked evidence additionally requires `E2E_WRITE_VERIFIED_EVIDENCE=true`; never move that closure or its credentials into a semantic E2E GitHub job
- before any create, authenticated E2E writes a UUID-scoped `codex-e2e` intent ledger; before any delete, it must read the production row and verify the UUID, authenticated owner, and exact marker coverage for all five multilingual fields across every registry authoring language
- use one protected `E2E_RECOVERY_LEDGER_PATH` per active invocation; recovery may proceed from the external copy alone after a crash, but a primary ledger without the configured recovery copy fails closed so a stale teardown cannot adopt another run
- teardown deletes only the verified exact-ID rows, records created/cleaned counts, and must prove `created=cleaned` and `leaked=0`
- shared Header language switching uses Umi `SelectLang` with `reload={false}`; semantic proof must retain the same document identity while refreshing locale-dependent state and reject a delayed old-locale reference response
- never persist or upload credentials, auth state, screenshots, traces, or video; the digest-bound semantic evidence contains assertions and non-secret digests only
- prefer `pnpm test:ci <jest-args>` over stacking flags after `pnpm test`
- use `pnpm test:workflows --processes:create --frontend-url <url> --supabase-url <url> --supabase-publishable-key <key>` for one live data workflow script; use `--processes:all` or `--teams:all` when a full workflow suite is needed
- run `pnpm test:api:smoke <workflow-args>` only with a target Supabase environment and configured test users; inspect its summary because child workflow failures are reported without making the command exit non-zero
- ordinary local pushes run the Husky pre-push hook, which runs `pnpm docpact:gate` first and `pnpm prepush:gate` last; main-semantic pushes additionally run static `release:preflight`. No-update and raw deletion-only pushes skip gates, normal exact-branch `HEAD` refspecs are accepted, and every other ineligible checked ref shape fails before Docpact/full tests. Only the deterministic release commands may select the exact release-candidate or immutable-promotion profile, which validates its generated branch/state/path identity and runs Docpact plus static preflight without the full gate
- exact marker-bound Release PRs targeting `dev` run the reusable clean-runner non-browser Release Gate: static contracts plus the complete Jest gate. Promotion PRs targeting `main` and normal version-changing post-merge publication verify the resulting exact proof and unchanged-tree merge chain. A marked unchanged-version main hotfix runs one exact-head clean-runner static/full gate instead; none of these paths run or require browser E2E
- the hook keeps an already-active exact Node.js 24.19.0 from `PATH`, including a CI `setup-node` runtime; it sources local NVM and runs `nvm use 24.19.0` only when the active Node is absent or has another version
- treat `pnpm prepush:gate` as the authoritative local test gate
- during normal delivery, use `pnpm push:checked <normal-git-push-args>` and do not run the full gate manually immediately before its ordinary hook repeats it; focused proof belongs in the edit loop and the hook owns the final committed checkpoint
- ignored local evidence and GitHub metadata do not invalidate repository full-gate evidence; a controlled tracked change, relevant Node/dependency change, or gate/configuration change does
- after a controlled active-locale change, regenerate that locale's tracked artifacts, run the shared audit/context/quality/correction/activation checks, and keep `BLOCKED_CONTEXT`, unowned route views, topology drift, ICU drift, and undeclared corrections at zero
- treat `src/services/referenceResources/reference-resource-manifest.json` plus `src/services/referenceResources/data/**` as the editable source of truth for classification and location reference data; run `pnpm reference-data:write` after an approved source, overlay, or review change and commit the resulting content-addressed assets and generated manifest together
- use `pnpm reference-data:check` for read-only reproducibility proof; the command is also part of `pnpm prepush:gate`
- production-effective workflows additionally run `pnpm reference-data:production:check`; the normal development/pre-push gate intentionally reports but does not waive unresolved rights-clearance blockers
- `pnpm i18n:de:audit` uses the same tracked automated activation boundary as every active registry locale; `i18n:de:pilot`, review, and delta commands validate only their frozen Issue #601/#602/#606 snapshots and are never active-release or full-gate inputs
- active locale commands and clean-runner proof must pass with `.local/**confirmation*` absent; historical reviewer forms and identity remain outside Git and GitHub
- a successful managed push leaves no retry receipt; only a non-zero transport result after both hook gates passed activates the ignored, one-hour, exact-intent receipt used by argument-free `pnpm push:retry`
- a raw `git push` still runs the hook but cannot create that bounded recovery receipt; never invoke `git push --no-verify` or `HUSKY=0` manually
- run `pnpm test:ci`, coverage commands, and `pnpm prepush:gate` serially because they regenerate shared `.umi-test` state; do not add broad test/coverage runs around a full gate that already contains coverage

## If You Need More Than This File

- repo rules, branch facts, and minimal execution summary: `AGENTS.md`
- path and doc routing: `.docpact/config.yaml`
- minimum proof: `docs/agents/repo-validation.md`
- frontend mental model: `docs/agents/repo-architecture.md`
- branding, packaging, and local-stack surfaces: `docs/agents/repo-architecture.md`
- narrow source docs: the owning file under `docs/agents/**`
- additional governed source docs only after the core contract surface is insufficient: `README*`, testing references, rollout notes, PR templates, and proposal docs
