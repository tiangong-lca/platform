---
title: next Testing Execution State
docType: guide
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when checking the current operational testing state
  - when deciding whether a coverage queue is active
  - when validating the latest known full-coverage baseline
whenToUpdate:
  - when the verified baseline run changes
  - when the active queue state changes
  - when present-state testing facts become stale
checkPaths:
  - docs/agents/test_todo_list.md
  - package.json
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - playwright.config.ts
  - scripts/e2e/**
  - scripts/release/**
  - docker/e2e/**
  - tests/e2e/i18n/**
  - .github/workflows/i18n-semantic-e2e.yml
  - tests/**
  - scripts/test-runner.cjs
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/prepush-gate-receipt.cjs
  - scripts/typescript-native-parser.*
  - scripts/test-coverage-report.js
  - .github/workflows/build.yml
  - .github/workflows/release-gate.yml
  - .github/workflows/release-readiness.yml
lastReviewedAt: 2026-09-19
lastReviewedCommit: 814d6c29b70a5d7e4a3da04aed6fe97e9a09dd2d
lastReviewedNote: 'Reviewed Platform #1046 whole-package result fixtures: valid rootless and all-existing packages remain completed from list results; partial/failed colors, metadata, four stages and report-on-click remain covered. Existing bootstrap, ownership, test strategy and gate policy are unchanged.'
---

# Testing Execution State

> Source of truth for the current operational testing state. Use this file for present-state execution facts, not for long-term strategy.

## Checked-In Reference Baseline

- reference full run: `pnpm prepush:gate`
- verified commit: `c498d0f5e777555f99a56685160596a66b54c2eb`
- suites: `413`
- tests: `5690`
- tracked source files: `462`
- coverage: `100%` statements, branches, functions, and lines

This is a checked-in reference, not a per-PR execution ledger. A delivery's post-commit, hook-owned full-gate result belongs in its PR validation evidence; update this section when the reference counts, coverage policy, or queue state materially changes.

## Current State

- repo is in full-closure maintenance mode
- there is no active ordered coverage queue right now
- touched code must stay at full closure
- Issue #914 implements one TypeScript `7.0.2` compiler/API track, the repository-owned native parser adapter, and Oxlint in place of ESLint plus the standalone deprecated-API scanner. A small repo-local Oxlint plugin retains the legacy `no-invalid-this` contract that native Oxlint does not yet support. No TypeScript 6 alias or `tsc6` path is part of the candidate; Prettier remains formatting-only and no longer organizes imports.
- Issue #938 exact-pins Node `24.19.0`, pnpm `11.23.0`, TypeScript `7.0.2`, and released `@tiangong-lca/tidas-sdk` `0.2.0`; the frozen graph contains no TypeScript below 7, `ts-to-zod`, or `@typescript/vfs`. A child Node package contract bypasses the Jest SDK mapper and proves all seven dataset factories plus the normalized validation error envelope without reopening a coverage queue.
- Issue #946 advances only the active package-manager contract to exact pnpm `11.24.0`; RED/GREEN resolver and identity proofs preserve Node `24.19.0`, TypeScript `7.0.2`, SDK `0.2.0`, the byte-identical dependency lock, and the closed coverage queue.
- Issue #924 established the complete UI runtime on exact React/React DOM `19.2.8`, antd 6, and ProComponents `3.1.14-6`; Issue #982 advances the current reviewed patch line to antd `6.6.2` and icons `6.3.4`. Package contracts reject React 18, antd 4/5, ProComponents 2, split Pro imports, CommonJS antd deep imports, removed member-style APIs, and stale antd-6 icon pins; real antd 6 Form.List tests preserve registered-field submission, while App/theme registrar tests preserve global feedback and dark/light CSS-variable updates without a production or test-only static fallback. The one reviewed Ant Design CLI performance finding remains the four-language selector's intentional `virtual={false}` semantic-DOM contract, not an open optimization queue.
- Issue #982 upgrades every compatible direct dependency to the 2026-08-31 registry latest except the intentional Node-24 `@types/node@24.13.3` line, while retaining exact Node `24.19.0`, pnpm `11.24.0`, TypeScript `7.0.2`, React `19.2.8`, and TIDAS SDK `0.2.0`. Jest `30.5.0` discovers the same explicit 445-file inventory, the real installed SDK and 47 data-workflow suites pass, Umi `4.7.9` produces the production bundle, Electron `44.1.0` produces the local arm64 DMG, and the digest-pinned Playwright `1.62.1` controller contract remains closed. The first upgraded qualification exposed an incorrect fixture that expected name sorting even though the page and service intentionally default to `modified_at desc`; the fixture now asserts that established contract without a product behavior change. A later full run exposed a cross-frame Drawer geometry artifact: toolbar rectangles are now sampled atomically and evaluated in rendered order while retaining exact count, alignment, containment, non-overlap, and tooltip proof. The first final gate then exposed Jest 30/jsdom 26's non-configurable browser globals and jest-dom 7 color normalization: runtime navigation now crosses one explicit `Location` boundary, SSR/storage/event-target branches use explicit inputs, and tests no longer redefine `window`/`location` or depend on named-color serialization. The same live recovery path exposed and repaired receipt validation/finalization so argument-free resume retains `main` versus `qualification`, offline policy, and the external proof path. Lock deduplication introduces no new audit advisory relative to `origin/dev` and reduces the advisory count from 83 to 62; remaining advisories are upstream/transitive and create no silent waiver.
- Issue #982 also preserves the full-coverage contract under Jest 30: Jest natively enforces 100% statements/functions/lines, while the fail-closed repository report excludes only Babel/Istanbul `if` alternate slots with no source coordinates and proves all 16,884 source-mapped branches plus all 483 tracked files at 100%. A source-mapped miss or any other malformed branch map still fails the gate.
- Issue #914 also adds deterministic slow-first Jest scheduling without changing discovery or the suite inventory. Its pre-push receipt fixture builds one seed, then copies a separate repository and bare remote for every test so receipt, branch, and transport mutations remain isolated.
- Issue #914's first Linux Release Gate exposed a real publication-loader race: mount initialization and an immediate Publication-tab action could start overlapping requests, letting a later empty response replace valid rows. The loader now has a render-independent in-flight guard and a deterministic deferred-response regression.
- the focused receipt-suite implementation measurement improved from `118.78s` real time for 38 tests to `105.77s` for 40 tests on the same local command path, with a later focused repeat at `111.87s` real time showing expected host variance. The final same-machine `npm test` candidate, including the publication-race and macOS V8 mitigations, passed 411 unit suites / 5,725 tests plus 14 integration suites / 67 tests in `123.83s` real time, versus the exact `dev` baseline of 408 / 5,707 plus 14 / 67 in `157.78s`: `33.95s` and `21.5%` faster despite 3 additional suites and 18 additional unit tests.
- Issue #799 adds focused TIDAS task-center coverage for duplicate queue aliases, persisted alias hydration, canonical backend timestamps, one active poller, and post-coalescing failure routing; it creates no open coverage queue
- deterministic release-command coverage proves JSON purity, non-mutating dry-run, static preflight before transport, rejection of unexpected untracked files, exact version fields, restricted checked-push profiles, idempotent PR reuse, immutable promotion identity, independent version-candidate and cumulative `main`-to-candidate Docpact preflight, bounded automatic review, and the invariant that the local release-to-dev command never runs browsers or writes tracked proof
- Issue #845 closes the release proof-reuse publication gap: every tag, draft, web, Electron, and final-verification job overrides only the intentional skipped-ancestor propagation with `!cancelled()` while requiring each direct prerequisite to succeed. The deterministic release fixtures also accept the normal tree-identical two-parent promotion after `dev` advances and reject any changed promotion tree; this creates no open coverage queue.
- Issue #693 moves profile validation, generic visual-plan, account-secret, run-scoped origin, output-containment, access classification, and capture compatibility proof to workspace tooling.
- Issue #748 adds a git-tracked scope-closure qualification adapter for the Next owner. Its isolated Chromium flow proves preparing, available, expired, and unavailable presentation; direct document navigation for bounded XLSX and machine-readable manifests; integrity/expiry metadata; localized 410 rerun guidance; and anonymous, standard-user, administrator, owner, and data-product-manager routing without production targets or mutation.
- locale topology, message ownership, ICU placeholders, and dynamic families are additionally protected by `pnpm i18n:audit`
- active German pins the accepted 2,737-message catalog/runtime state at `c26f306e82ac66f50a56aafe8f89ea96c0b0c67d`; post-baseline existing-message changes use the tracked automated correction overlay, while Issue #601/#602/#606 confirmations retain frozen-history semantics only
- active locale proof uses `i18n:audit`, the registry/Manifest and hardcoding audits, registry-driven context/quality, `i18n:corrections:check`, and all-locale activation; focused proof stays in the edit loop, and each delivery gets one post-commit full gate through `push:checked`
- Issue #635 adds a separate Playwright semantic localization proof surface: `pnpm test:e2e:i18n` derives all locale/content-language expectations from registries, now binds 58 stable route/view assertion IDs including OAuth consent, runs Chromium across the complete matrix, and requires the login/selector, team authoring, and process lifecycle critical scenarios in Chromium, Firefox, and WebKit
- semantic E2E GitHub Actions is credential-free/read-only and manual through `workflow_dispatch`: an operator selects an open business PR or exact SHA when its change risk warrants the content-addressed hermetic qualification, including the complete Chromium matrix and Firefox/WebKit critical scenarios; it is absent from routine PR/dev/release triggers, while authenticated candidate-local/production-backend closure is restricted to an explicitly authorized local operator session with authenticated mode, both production-write guards, and an explicit verified-evidence opt-in
- Issue #654 adds `e2e:env:install`, read-only `e2e:env:doctor`, exact-candidate `e2e:release`, argument-free bounded `e2e:release:resume`, owned cleanup, and focused `e2e:dev`; release mode archives only a clean Next commit, uses a digest-pinned container and cached production build, performs all safe checks before fixture intent, and never mounts the workspace
- canonical qualification discovery is recursive: nested specs cannot escape the fail-closed executed/designed-skip inventory, and all 50 assertion IDs remain mandatory
- semantic evidence formatting resolves repository-owned Prettier configuration even when the output is an ignored local or external artifact path
- Issue #660 keeps production-data E2E fail-closed on real CI hosts while allowing an authorized local run to override only the release image's inherited `CI`/`GITHUB_ACTIONS` markers before the unchanged in-container authorization and ledger checks
- authenticated local evidence remains external to Git and must prove all 50 assertion IDs plus exact `created=cleaned` and `leaked=0`; adding a registry locale invalidates older evidence rather than shrinking coverage
- Header locale switching now keeps Umi `SelectLang` at `reload={false}`; focused proof covers same-document identity, URL retention, live reference-label refresh, and rejection of a delayed old-locale response
- clean-checkout active German and new-locale suites require zero confirmation-file dependencies; only explicit historical compatibility tests may exercise generated private fixtures
- pre-push receipt coverage includes a setup-node-style active Node 24 with an unusable NVM install, so runner bootstrap cannot exit before the repo-owned hook coordinator
- Issue #688 makes semantic evidence and locale summaries deterministic at the writer boundary: evidence is emitted in canonical JSON, all locale summaries are generated once in dependency order, and the isolated double-generation check requires the second run to preserve the exact Git diff
- Issue #688 also adds compact Agent/CI full-gate output while retaining complete Jest stdout/stderr and structured results under `.local/test-logs/**`; the Release Gate uploads those files for seven days on success or failure
- qualification identity is content-addressed from behavior inputs, shared helpers, Git mode/type, and the browser environment; its fixed `.invalid` simulator profile excludes deployment-only `.env`, the manual workflow always executes without proof-cache reuse, and no tracked receipt, evidence, compatibility, or waiver hash file exists
- exact marker-bound dev Release PRs run the non-browser reusable Release Gate against their exact base/head and emit a 30-day proof only after static/full tests succeed; generated candidate/promotion local pushes use restricted Docpact-plus-static profiles
- the main promotion PR and canonical version-changing `main` push reuse that dev proof only when both exact two-parent merges, main/dev bases, candidate tree/version, successful job, run attempt, and artifact payload all match; direct/squash/rebase merges, changed trees, expired or missing proof, or API failure fail closed and require a new dev candidate, while explicit manual tag and recovery dispatch events may run a fresh full Release Gate
- an explicitly marked direct main hotfix must match its tracked Issue, current main base, and exact PR head, keep `package.json.version` unchanged, and pass one fresh static/full clean-runner gate; focused fixtures reject stale markers, non-ancestral bases, and version drift
- release qualification delegates the complete Jest inventory to one `prepush:gate` lane on the exact dev Release PR; tag creation waits for proof verification, normal later stages never repeat candidate acceptance, and no release stage runs or requires browser E2E
- Issue #819 keeps the exact complete coverage inventory on two workers but requires a `512MB` idle-memory recycle boundary and full managed-gate proof; lower boundaries that force collection around the normal instrumented worker footprint are not an accepted optimization
- a failed managed transport may be retried without repeating the full gate only through the ignored, exact-intent, one-hour receipt and argument-free `pnpm push:retry`; any controlled-input drift requires a fresh managed push and gate
- checked-push eligibility now accepts the normal exact-branch `HEAD` spelling and fails every other invalid ref shape before gates; raw deletion-only pushes skip gates, so branch cleanup cannot spend the full-suite budget
- Issue #606 plus the merged clean-runner assertions now has 87-test focused proof across the release service, Calculation Bundle panel, public release panel, Data Processing integration, Process integration, and locale inventory; the final branch-wide proof remains owned by the push hook
- dataset SDK validation adapters, shared localized validation helpers, and validation-report navigation now ride on the maintained full-closure baseline
- Issue #910 adds focused TIDAS scalar normalization, Process/Flow serializer, and six save-entrypoint regression coverage; it creates no open coverage queue
- data workflow smoke fixtures now pair `fixtures/data/**` input JSON with `fixtures/result/**` expected-result Markdown; the current relationship map is in `tests/data-workflows/fixtures/result/README.md`
- the SPA-external static HTML inventory asserted by `tests/unit/services/general/publicRoutePolicy.test.ts` now also covers the hosted not-found document `/404.html`, alongside maintenance, OAuth consent and the legal pages: the application host answers unknown paths with that document instead of the application shell
- file-level coverage collection currently excludes a small set of UI orchestration wrappers from direct collection, including the canvas-heavy national carbon dashboard wallboard shell and the Review Admin quality-diagnostic report panel; the latter retains focused component proof for latest-report loading, explicit manual start, non-blocking active state, report rendering, and retryable runtime failure. If that list changes, re-check save, validation, navigation, highlighting, diagnostic-report, or visual screenshot flows before treating the baseline as settled

## Reopen Conditions

Reopen an execution queue only when at least one of these becomes true:

- a touched source file drops below full closure
- a new source file is added without full proof
- a workflow or tooling change invalidates the current baseline
- a shared test helper regression forces a temporary exception queue

## Execution Order When Reopened

1. fix the touched file first
2. batch only adjacent files that share one mock, fixture, or harness
3. fix infrastructure blockers before creating speculative queue entries
4. rerun the smallest proof that confirms the gap is closed

## Reporting Workflow

- use `pnpm test:coverage:report` as the default coverage review artifact
- use `node scripts/test-coverage-report.js --full` only when the full ordered file list is required
- treat this file as the owner of current testing state, not of testing strategy

## Update Rules

- workflow or baseline changed: update this file and `docs/agents/repo-validation.md`
- long-term strategy changed: update `docs/agents/test_improvement_plan.md`
- keep current-state facts here; move rationale and long-term goals elsewhere
