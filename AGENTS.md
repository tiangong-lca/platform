---
title: next Repo Contract
docType: contract
scope: repo
status: active
authoritative: true
owner: next
language: en
whenToUse:
  - when the task may change shipped frontend behavior, repo rules, validation, or documentation ownership
  - when routing work from the workspace root into this repo
  - when deciding which document owns a rule, command, or decision
whenToUpdate:
  - when repo facts, branch rules, quality gates, or documentation ownership change
  - when a command, environment rule, or repo boundary becomes inaccurate
  - when the current documentation system becomes redundant or ambiguous
checkPaths:
  - AGENTS.md
  - DEV.md
  - README.md
  - README_CN.md
  - .docpact/**/*.yaml
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - docs/agents/**
  - .github/PULL_REQUEST_TEMPLATE/*.md
  - package.json
  - playwright.config.ts
  - config/docs-capture/**
  - scripts/e2e/**
  - scripts/release/**
  - scripts/qualification/**
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/test-runner.cjs
  - scripts/prepush-gate-receipt.cjs
  - scripts/typescript-native-parser.*
  - docker/e2e/**
  - tests/e2e/i18n/**
  - .nvmrc
  - .husky/pre-push
  - .github/workflows/**
lastReviewedAt: 2026-09-26
lastReviewedCommit: 735da3b6957955f81e71f44d31389aa3cc6caa3f
lastReviewedNote: 'Reviewed for Platform #1111: the released TIDAS SDK 0.3.1 replaces 0.2.0 and adds mapper-independent Process review-array qualification; repository ownership, bootstrap, branch, and delivery rules are unchanged.'
related:
  - .docpact/config.yaml
  - docs/agents/repo-validation.md
  - docs/agents/repo-architecture.md
  - DEV.md
---

## Repo Contract

`tiangong-lca-next` owns shipped frontend behavior for TianGong LCA: routes, pages, UI components, app-side services, static resource consumption, and local product packaging surfaces.

Start here when the task may change what users see, how the frontend talks to the backend, how the repo is validated, or how repo documentation is organized.

## Documentation System Principles

This repository treats documentation as an information system, not as narrative writing.

Required principles:

- single source of truth: one rule has one owning document
- one document, one job: each document solves one problem clearly
- conclusion first: put purpose, rules, steps, and boundaries before background
- no redundant prose: keep facts, rules, commands, exceptions, and validation; remove filler
- no ambiguity: prefer explicit conditions and exact actions over vague guidance
- executable commands: any documented command must run as written
- verifiable rules: readers must be able to tell whether they followed the rule correctly
- rules before explanation: operational content comes before rationale
- stable structure: same document type uses the same section order where practical
- reference instead of duplication: when a rule already has an owner, link to it instead of restating it

## Documentation Roles

| Document | Owns | Does not own |
| --- | --- | --- |
| `AGENTS.md` | repo contract, documentation principles, branch and delivery rules, hard boundaries | deep implementation details, large reference material |
| `DEV.md` | local bootstrap and the shortest repeatable work loop | repo contract, branch policy, proof matrix |
| `.docpact/config.yaml` | machine-readable repo facts, routing intents, lint rules, governed-doc inventory | prose explanations and narrative summaries |
| `docs/agents/repo-validation.md` | minimum proof by change type and PR validation note shape | bootstrap, business logic details |
| `docs/agents/repo-architecture.md` | compact repo mental model and stable path map | execution checklists and present-state testing facts |
| `docs/agents/test_todo_list.md` | current testing execution state | long-term testing strategy |
| `docs/agents/supabase-branching.md` | frontend environment selection and database ownership workflow | schema truth |
| `docs/agents/public-classifications-gz-usage.md` | classification asset read path and file mapping | repo-wide workflow rules |
| `docs/agents/lcia-calculation-evidence.md` | reviewed LCIA bundle, cache trust, factor coverage, and calculation-evidence contract | Worker or Edge implementation truth |
| `docs/agents/util_calculate.md`, `docs/agents/team_management.md`, `docs/agents/data_audit_instruction.md` | narrow business or domain references | repo contract or bootstrap workflow |

Additional governed source docs, not part of the default first-load surface:

| Document | Owns | Does not own |
| --- | --- | --- |
| `README.md` and `README_CN.md` | repo landing context and high-level product overview | repo contract, proof bar, or branch policy truth |
| `docs/agents/i18n-language-delivery-goal.md` | reusable end-to-end Goal for adding or backfilling one context-grounded product language while converging all active locales across UI, content, reference resources, selector, validation, release, and workspace handoff | current runtime source truth, language-specific translation payloads/evidence, reference-resource source files, or active task status |
| `docs/agents/testing-patterns.md` | reusable test-selection and test-structure patterns | minimum proof bar or current queue state |
| `docs/agents/testing-troubleshooting.md` | shortest recovery path for failing or hanging tests | strategy or canonical proof requirements |
| `docs/agents/prepush-gate-policy.md` | intended protected-branch and pre-push rollout contract | live hook/runtime truth |
| `docs/agents/test_improvement_plan.md` | long-term testing strategy and reopen conditions | current operational queue or proof baseline |
| `docs/agents/contribution-path-analysis-design.md` and `docs/agents/lca-analysis-visualization-plan.md` | scoped design references for analysis features | current runtime truth or active delivery state |
| `.github/PULL_REQUEST_TEMPLATE/feature-to-dev.md` and `.github/PULL_REQUEST_TEMPLATE/promote-dev-to-main.md` | branch-specific PR note shape and handoff prompts | canonical proof rules or repo branch policy truth |

## Load Order

Read in this order:

1. `AGENTS.md`
2. `.docpact/config.yaml`
3. `docs/agents/repo-validation.md` or `docs/agents/repo-architecture.md`
4. the narrow source doc that owns the current subject

Do not start from additional governed source docs, proposal docs, or README-level material unless the core contract surface is insufficient for the current task.

## Operational Pointers

- local bootstrap and canonical day-to-day commands live in `DEV.md`
- minimum proof and protected-branch gate expectations live in `docs/agents/repo-validation.md`
- path-level ownership, routing intents, governed-doc inventory, and lint rules live in `.docpact/config.yaml`
- app-shell support, branding/package surfaces, and local-stack path mapping live in `docs/agents/repo-architecture.md`
- the compiler/tooling track is TypeScript `7.0.2` only: `pnpm tsc` checks the web project and `pnpm tsc:electron` checks the Electron project; there is no TypeScript 6 compatibility alias or `tsc6` command
- the UI runtime is one exact React `19.2.8`, React DOM `19.2.8`, Ant Design `6.6.2`, icons `6.3.4`, and ProComponents `3.1.14-6` generation. Umi's global ConfigProvider and App own theme plus feedback context for every route; there is no Ant Design 5 patch, split ProComponents package, legacy component-member API, or static feedback fallback. ProComponents v3 remains exact-pinned while upstream publishes it as a prerelease, and the existing `skipLibCheck: true` is the bounded declaration-quality exception rather than an application-typecheck bypass
- `scripts/typescript-native-parser.mjs` plus its `scripts/typescript-native-parser.d.mts` declaration are the sole allowed `typescript/unstable/*` import boundary; repository source-analysis consumers import that adapter, and a TypeScript upgrade must preserve its focused AST/traversal/diagnostic contract tests
- Oxlint owns JavaScript/TypeScript correctness, including unused and deprecated API diagnostics. The repo-local `tiangong/no-invalid-this` Oxlint plugin preserves the one legacy rule that Oxlint does not yet implement natively. Prettier remains the formatter but no longer organizes imports; do not reintroduce ESLint, a standalone deprecated-API scanner, or a Compiler-API formatting plugin
- Jest `30.5.0` uses the repository slow-first sequencer to start the three known process-heavy contract suites early without changing discovery or the test inventory. The pre-push receipt suite builds one reusable seed but copies an isolated repository and bare remote for every test case
- on macOS, the shared Jest runner disables concurrent recompilation and Maglev after the documented Node 24/V8 `ClearStaleLeftTrimmedPointerVisitor` crash reproduced inside those optimization tiers; the unit stage retains its 25% worker pool and `512MB` idle-memory recycle boundary without serializing the suite
- locale identity and runtime adapters live in `src/services/general/localeRegistry.ts`; shared topology, canonical-message ownership, and dynamic-message audit rules live in `docs/plans/i18n-de-DE/manifest.json` plus the owning audit commands documented in `docs/agents/repo-validation.md`
- the reusable autonomous Goal for adding or backfilling one product language lives in `docs/agents/i18n-language-delivery-goal.md`; it preserves Umi's native flag icons, separates UI/content/reference-resource capabilities, audits every active registry locale, requires official-first classification/location localization, and keeps country/region variants outside the single-language product contract
- semantic localization E2E uses `playwright.config.ts` and `tests/e2e/i18n/**`; direct focused work uses `pnpm e2e:dev`, while exact committed qualification uses the repository-owned `e2e:env:install` / `e2e:env:doctor` / `e2e:release` controller against an archived clean commit and an isolated production bundle without mounting the parent workspace; the GitHub qualification is credential-free/read-only, hermetic, manually dispatched on an open business PR or chosen ref when change risk warrants browser evidence, and is not part of release proof
- scope-closure qualification uses the executable adapter at `scripts/qualification/scope-closure-next-qualification.mjs`; it exports the exact clean commit to an isolated worktree, permits loopback targets only, and emits the Worker-owned provider result schema without sensitive browser data
- documentation screenshots use the source-bound declarative profile at `config/docs-capture/profile.v1.json`; it records only this exact source version's runtime/readiness, login/identity, auth-mutation, denial-probe, and stable-locator facts. The generic executor, credentials, dynamic origin, process lifecycle, and evidence decisions belong to workspace tooling.
- the shared Header keeps Umi `SelectLang` mounted with `reload={false}` so locale changes refresh the current document in place; browser proof must cover same-document identity plus stale-reference-response race rejection
- the unified-German historical review record lives in `docs/plans/i18n-de-DE/README.md`; Pilot/catalog/delta confirmations validate only their frozen snapshots, while current `de-DE` copy is governed by the tracked baseline and automated correction overlay in `docs/plans/i18n/corrections.json` plus the shared context/quality/activation gate
- repo-local documentation maintenance is enforced locally by the pre-push docpact gate; `.github/workflows/ai-doc-lint.yml` is manual-dispatch fallback
- dataset-validation adapters live in `src/pages/*/sdkValidation.ts`; shared localized validation helpers live in `src/pages/Utils/validation/**`
- `tests/package-contracts/installedTidasSdk.contract.test.mjs` resolves the real installed `@tiangong-lca/tidas-sdk` `0.4.0` package outside Jest's SDK mapper and protects all seven dataset factories, the normalized `validateEnhanced` error envelope, singleton/ordered Process review acceptance, and required Process general-comment validation
- data workflow result fixture relationships live in `tests/data-workflows/fixtures/result/README.md`; proof selection stays in `docs/agents/repo-validation.md`
- run Umi-generating focused tests, coverage, and `pnpm prepush:gate` serially; for ordinary delivery, use focused proof during iteration and let the push hook own the one full gate after the final controlled tracked change. Run manual hermetic browser qualification on the open business PR before merge or release-to-dev when the change risk warrants it, so a failure can be fixed on that same PR. Deterministic release/promotion pushes use only their repo-owned restricted profiles because the exact dev Release PR owns the non-browser release gate. The hook skips no-update and raw deletion-only pushes, accepts `HEAD` only as the current exact branch source, and rejects other ineligible checked ref shapes before any expensive gate.
- new dependencies require human approval
- the application host's crawler and response boundary is `public/robots.txt`, `public/404.html`, `public/edgeone.json`, plus the shell `metas` in `config/config.ts`; the host is noindex by design while crawling stays allowed, and unknown paths must answer 404 rather than the application shell. The deploy bundle carries the pinned CLI's generated `.edgeone/routes.json`, whose terminal fallback is corrected to serve `public/404.html` with status 404; `scripts/edgeone` stages, corrects and verifies it, and both deploy workflows run that preparation before the deploy step
- production-writing E2E requires a host without `CI` or `GITHUB_ACTIONS`; only after that check may the controller clear image-inherited CI markers for the local container. Authenticated mode plus two write guards remain mandatory: `E2E_ALLOW_PRODUCTION_DATA=true` and `E2E_PRODUCTION_WRITE_CONFIRMATION=I_AUTHORIZE_ONE_CODEX_E2E_PRODUCTION_PROCESS`; verified tracked evidence additionally requires `E2E_WRITE_VERIFIED_EVIDENCE=true`. Before create it writes an intent ledger, and before delete it verifies the production row's UUID, authenticated owner, and all five multilingual fields across every registry authoring language, then proves `created=cleaned` and `leaked=0`

## Minimal Execution Facts

Keep these entry-level facts in `AGENTS.md`. Use `DEV.md` and `docs/agents/repo-validation.md` for the full command matrix and proof details.

- package manager: repository-pinned `pnpm` `11.24.0`; install with `pnpm install --frozen-lockfile`
- Node baseline: exact `24.19.0` via `.nvmrc`; use `nvm install` and `nvm use`
- UI baseline: exact React `19.2.8`, antd `6.6.2`, icons `6.3.4`, and ProComponents `3.1.14-6`; `pnpm-workspace.yaml` collapses Umi's published fallback metadata to this one native generation
- shared dev environment: `pnpm start` (`pnpm start:dev` is equivalent); it selects `.env.development*` over exact Umi-preloaded main-file defaults while retaining distinct explicit per-key build overrides
- explicit main-environment run: `pnpm start:main`
- default lint gate: `pnpm lint` (Oxlint correctness, Prettier formatting, and native TypeScript 7 web typecheck)
- Electron TypeScript 7 check: `pnpm tsc:electron`
- deterministic locale audit: `pnpm i18n:audit`
- language registry/Manifest contract audit: `pnpm i18n:platform:audit`
- business-language hardcoding audit: `pnpm i18n:hardcoding:audit`
- governed classification/location asset check: `pnpm reference-data:check`; regenerate only through `pnpm reference-data:write`; production publication must also pass `pnpm reference-data:production:check`
- locale-specific context/quality/activation proof: `pnpm i18n:locale:activation:check --locale <canonical-locale>`
- all-active-locale activation proof: `pnpm i18n:locale:all:check`
- production-readiness gate (expected to fail while owned blockers remain): `pnpm i18n:locale:all:production:check`
- existing-translation correction proof: `pnpm i18n:corrections:check`
- local documentation gate before push: `pnpm docpact:gate`, backed by `scripts/docpact` for local CLI discovery
- default CI-style test entry: `pnpm test`; slow-first scheduling changes start order only and preserves the complete suite inventory
- direct semantic localization E2E: `pnpm e2e:dev` (`pnpm test:e2e:i18n` remains the CI-compatible alias)
- exact-candidate local release E2E: `pnpm e2e:env:install`, `pnpm e2e:env:doctor`, then `pnpm e2e:release`
- exact-candidate scope-closure proof: `pnpm test:qualification:scope-closure:browser --output <result.json> --run-id <uuid>` with the documented non-production confirmation and loopback backend environment
- build when shipped behavior, branding/package surfaces, or static assets change: `pnpm build`
- protected-branch parity gate: `pnpm prepush:gate`
- static release preflight: `pnpm release:static-preflight` (`release:preflight` is a compatibility alias); this validates tracked locale/reference contracts but does not claim browser execution
- optional content-addressed browser qualification: dispatch `.github/workflows/i18n-semantic-e2e.yml` for the chosen business-PR ref, or run `pnpm e2e:qualification:key` then `pnpm e2e:qualify --proof .local/e2e-release/qualification-proof.json`; verify with `pnpm release:proof:verify --proof <path>`
- preferred normal version-bump PR into `dev`: `pnpm --silent release:to-dev --version <x.y.z> --issue <number> --apply`
- preferred normal merged-candidate promotion into `main`: `pnpm --silent release:promote-dev-to-main --release-pr <merged-dev-pr-number> --issue <number> --apply`
- omit `--apply` from either release command for a read-only plan; do not replace the normal path with manual version editing, branch/commit/push assembly, or direct `gh pr create`
- `release:to-dev --apply` changes only version metadata and bounded Docpact review metadata; its restricted local push runs Docpact plus static preflight and never runs browsers or writes proof into the branch
- the exact marker-bound Release PR into `dev` runs one non-browser Release Gate before merge and emits an external proof for later main checks; it does not run or require browser E2E
- every `main`-target promotion PR keeps the required `Main Candidate / Release Gate` check but verifies only immutable lineage, unchanged tree/main baseline, and the exact dev proof; it does not rerun the aggregate
- an explicitly marked direct `main` hotfix keeps that required check name but must bind its Issue, current main base, and exact PR head, preserve package version, and pass one fresh clean-runner non-browser full gate
- automatic release review independently checks the verified version-only `dev` candidate and the complete `main`-to-candidate promotion range, then records only Docpact `review_or_update` evidence; every uncovered, stale, semantic-document, dependency, or other package change fails closed
- release-line validation accepts either direct `main` ancestry in `dev` or an exact two-parent `main` promotion whose second parent remains in `dev` history and whose tree is unchanged; every other divergence requires governed reconciliation
- app-side Supabase and API access belongs only in `src/services/**`
- Supabase OAuth consent enters at `/oauth/consent`, crosses the reviewed EdgeOne-to-hash bridge with one bounded RFC3986-unreserved opaque `authorization_id` preserved byte-for-byte while dot-only path segments are rejected, verifies identity with `getClaims()`, and accepts callback URLs only from Supabase authorization responses over HTTPS or loopback HTTP; Account → Connected apps is the sole integration surface, with no API-key history or compatibility provisioning action
- startup runtime-config loading is enabled by default; set the build-time `APP_RUNTIME_CONFIG_ENABLED=false` only when the system-status RPC must be bypassed and normal startup forced

## Ownership Boundaries

The authoritative path-level ownership map lives in `.docpact/config.yaml`.

At a human-readable level, this repo owns shipped frontend/runtime behavior plus repo-local governance and bootstrap docs.

This repo does not own:

- database schema, migrations, seeds, or Supabase branch governance
- Edge Function runtime behavior
- public docs-site content
- generic docs-impact screenshot execution, account-secret handling, dynamic port allocation, and Draft/evidence policy
- solver or compute-engine internals
- root workspace integration after merge

Route those tasks to:

- `database-engine` for schema truth and Supabase branch governance
- `edge-functions` for Edge runtime and API orchestration behavior
- `next-docs` for public docs-site content
- `worker` for solver and compute behavior
- `lca-workspace` for root integration after merge

## Branch And Delivery Facts

- GitHub default branch: `main`
- true daily trunk: `dev`
- routine branch base: `dev`
- routine PR base: `dev`
- promote path: `dev -> main`
- normal versioned releases must use `release:to-dev` followed, after that PR merges, by `release:promote-dev-to-main`; manual release-PR assembly is reserved for an explicitly diagnosed unsupported/recovery case and must preserve the same fail-closed gates
- marker-bound version PRs targeting `dev` run the non-browser Release Gate against their exact base/head and retain proof only after the complete gate succeeds; their restricted local push runs Docpact and static preflight, while browser E2E remains a separate manual business-PR-stage decision
- promotion PRs targeting `main` verify the exact dev proof and tree-identical promotion; the deterministic promotion push also runs only Docpact and static preflight. A marked direct main hotfix instead proves exact base/head, unchanged version, static readiness, and the full non-browser gate
- canonical version-changing `main` pushes reuse that dev proof only when the exact dev and main two-parent merges, main/dev bases, candidate tree/version, successful job, run attempt, and unexpired artifact payload all match; any direct, squash, rebase, ambiguous, expired, unavailable, or mismatched case fails before publication and requires a new dev candidate
- canonical `main` branch pushes create or verify the matching `v*` tag only after proof verification, then deploy the web app and build draft Electron releases in the same workflow run
- canonical `main` branch pushes whose `package.json` is unchanged and whose matching `v*` tag already points to an older `main` commit skip release instead of requiring a version bump
- manual `v*` tag pushes and `workflow_dispatch` runs for an existing `v*` tag whose target commit is already on `main` remain supported for recovery/backfill releases and always run the full reusable Release Gate

Do not infer daily workflow from GitHub default-branch UI alone.

## Documentation Update Rules

Use the role table in this file as the update map.

- if a machine-readable repo fact or governed-doc rule changes, update `.docpact/config.yaml` in the same change
- if a human-readable repo contract, branch rule, or hard boundary changes, update `AGENTS.md`
- if bootstrap, proof, architecture, or narrow workflow guidance changes, update only the document that owns that subject
- if a document is governed but not in the default first-load surface, route to it on demand instead of duplicating its rules into `AGENTS.md` or `DEV.md`
- do not copy the same rule into multiple docs just to make it easier to find

## Hard Boundaries

- do not author schema or migration truth here
- do not add a TypeScript 6 compatibility package or import `typescript/unstable/*` outside `scripts/typescript-native-parser.mjs` and `scripts/typescript-native-parser.d.mts`
- do not add an Ant Design 5 compatibility patch, an antd 4/5 dependency override, split `@ant-design/pro-*` imports, legacy `Descriptions.Item`/`Select.Option`-style APIs, or context-free static feedback calls
- do not enable Umi/Mako `forkTSChecker` until that path is proved compatible with the TypeScript 7 package, whose CommonJS root no longer exposes the legacy Compiler API; the qualified production build remains the current Webpack path plus repo-owned `pnpm tsc`
- do not hand-edit `docker/volumes/functions/**`; refresh it via `docker/pull-edge-functions.sh --ref <reviewed-40-character-edge-commit>`, keep the generated source-revision receipt, and review the complete delete-aware mirror diff
- do not create ad-hoc Supabase clients outside `src/services/**`
- do not pass documentation screenshot credentials on the command line, persist browser profiles/storage state, or treat missing/invalid credentials as verified authorization denial
- do not use the screenshot executor for data creation or mutation; only the explicit authentication/session exchange may use non-GET requests
- do not treat a merged repo PR here as workspace-delivery complete if the root repo still needs a submodule bump
- do not remove the application host's noindex boundary, convert `robots.txt` into a disallow list, or reintroduce a path-based fallback that answers the application shell for unknown paths; app routes are hash-routed, so no valid route depends on such a fallback

## Workspace Integration

A merged PR in `tiangong-lca-next` is repo-complete, not delivery-complete.

If the change must ship through the workspace:

1. merge the child PR into `tiangong-lca-next`
2. promote or select an eligible child SHA according to workspace policy
3. update the `lca-workspace` submodule pointer deliberately
