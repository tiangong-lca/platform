---
title: next Testing Patterns Reference
docType: reference
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when choosing between unit, component, and integration tests in this repo
  - when shaping new Jest tests or reusing existing helpers
  - when a testing workflow change may affect reusable patterns
whenToUpdate:
  - when repo-standard test patterns change
  - when helper ownership or recommended commands change
  - when the current pattern guidance becomes misleading
checkPaths:
  - docs/agents/testing-patterns.md
  - docs/agents/repo-validation.md
  - docs/agents/testing-troubleshooting.md
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - tests/helpers/**
  - tests/data-workflows/**
  - tests/e2e/i18n/**
  - scripts/i18n/**
  - scripts/test-runner.cjs
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/prepush-gate-receipt.cjs
  - scripts/typescript-native-parser.*
  - scripts/e2e/**
  - scripts/release/**
  - docker/e2e/**
  - playwright.config.ts
  - package.json
  - .github/workflows/build.yml
  - .github/workflows/release-gate.yml
  - .github/workflows/release-readiness.yml
lastReviewedAt: 2026-09-16
lastReviewedCommit: 740173082e261a5dcd0b2bd53b42fc6f4742da51
lastReviewedNote: 'Reviewed for Platform #1086 after independent root review: pinned CLI generates the complete deployment bundle and only its terminal file fallback changes to404. Staging checks bundle and .edgeone parents before invalidating old routes; rejected symlink targets retain external files. Verification checks every staged file without depth/count truncation and requires real root,404,robots and consent documents. All24artifact regressions pass, including repeated builds, actual compiled routes, high/deep inventories, absent boundary documents and symlink side effects. Provider404 behavior remains unverified until production deployment; no authentication, domain, region, CLI dependency or application routing change is claimed.'
---

# Testing Patterns Reference

> Purpose: reusable test-selection rules, structure rules, and template patterns for this repo.

## Test Type Decision

| Use this test type | When                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| unit               | logic lives mostly in one function, utility, or service module        |
| component          | UI behavior depends on render state, props, or local interactions     |
| integration        | behavior crosses page, service, auth, routing, or provider boundaries |

## Global Rules

- prefer semantic queries such as `getByRole`, `findByText`, and `waitFor`
- mock services before render
- keep test setup close to the behavior being proved
- prefer existing helpers over one-off fixtures
- do not add snapshots when explicit assertions are clearer
- component tests that mock Ant Design feedback must expose the v6 `App.useApp()` contract; do not let test setup fall back to static `message`, `Modal`, or `notification` APIs. Shared mocks consume `Descriptions.items` and `Select.options` only, so removed member-style APIs cannot remain hidden in tests
- use a real antd 6 Form store for representative `Form.List` submission contracts. The shared browser-like `MessageChannel` and `ResizeObserver` test shims must have no persistent native handle, fixed sleep, or production fallback
- browser assertions for Ant Design surfaces use accessibility roles or project-owned classes passed through public semantic `classNames`; do not assert `.ant-drawer-content`, `.ant-modal-content`, or another private DOM class
- keep `tests/e2e/i18n/pro-components-surface-registry.ts` as the one-to-one inventory for shipped Pro Components JSX instances. Every instance belongs to exactly one family with live evidence paths; generated `.umi*` trees are excluded, and representative toolbar, nested-table, selector, form, layout, and overlay states extend existing Playwright declarations so the qualification case count does not drift
- make mocks for stateful hooks preserve the identity of returned API objects across parent rerenders; update methods on the stable object instead of returning a fresh placeholder on each render
- pair shared hook mocks with a direct rerender regression that proves both object identity and the callable API the consumer relies on
- when mount and user actions can call the same async loader, guard the in-flight request outside render-state closures and prove that an action fired before the first response does not start a second request or let a later empty response overwrite valid data
- test release workflow policy at the contract boundary: parse or inspect the reusable gate and caller workflows, assert exact base/head wiring, and prove publication dependencies rather than invoking production actions
- test branch-sensitive push gates with isolated temporary Git remotes so `dev`, `main`, and main-semantic source branches prove their different command sequences without contacting a real repository
- release-helper fixtures must enforce the actual `gh` contract: list by bare branch, return explicit head owner/repository metadata, create direct repository heads without an organization prefix, and read the exact multiline `--body-file` contents while the owned temporary file exists. Prove `--apply --prepare-only` still prepares and pushes the exact version/promotion candidate, emits its submission proposal, and never invokes PR creation; malformed identity, ambiguous remotes and failed preflight must remain fail-closed.
- schedule known process-heavy Jest suites first when that lowers cold-run tail latency, but preserve Jest discovery and the complete inventory. Keep Jest's own failure/duration/file-size order within each priority group and lock the selected paths with a sequencer contract test
- for process-heavy Git/pnpm contract suites, build one immutable seed only when setup dominates runtime, then copy a separate repository and bare remote for every test case and rebind `origin` to that case. Never share mutable refs, receipts, gate logs, or transport state between tests
- retain parallel unit execution on macOS, but start Jest workers with concurrent recompilation and Maglev disabled and recycle a unit worker after it crosses `512MB`; this avoids the documented Node 24/V8 stale-left-trimmed-pointer failure while allowing the slow-first suites to overlap ordinary work
- test release-orchestration commands with temporary Git repositories plus fake `gh`/`pnpm`/Docpact executables: assert one JSON stdout document, exact remote/base/head/version identities, independent candidate and cumulative `main`-to-`dev` path evaluation, bounded review-only fixed-point behavior, branch-sensitive checked-push delegation, idempotent PR reuse, and stable fail-closed drift codes without creating real GitHub resources; additionally run a real Docpact canary in an isolated exact-`dev` clone to prove the current governed-document closure and metadata-only mutation boundary
- keep semantic E2E specs anywhere below `tests/e2e/i18n/**`; qualification discovery must recurse through nested directories, exclude only the dedicated harness-control spec, and fail closed when the discovered, executed, or designed-skip totals drift
- when testing Umi config-time environment selection, model both the already-populated `process.env` and each selected env file. Prove exact main-file defaults are decontaminated for Dev, distinct and partial explicit overrides retain priority, missing selected values fall back safely, and qualification ignores ambient deployment values
- when a Table/ProTable dependency upgrade appears to change the first request in one browser, first compare the page unit request and service fallback. If both intentionally use the same default, correct the browser fixture to that one exact RPC body; add `defaultSortOrder` only when the product truly owns a different initial order
- when a browser assertion compares several rectangles inside an opening Drawer, Modal, or responsive toolbar, read all rectangles in one in-page evaluation and poll the complete invariant. Sort by rendered coordinates when the contract is visual order; sequential locator `boundingBox()` calls can sample different animation frames, and DOM order is not a horizontal-layout contract
- Jest 30/jsdom 26 owns non-configurable `window` and `location` objects. Pass mock `Location` methods through `src/utils/browserNavigation.ts`, pass nullable event-target/storage/window inputs to pure runtime helpers, and use `history.pushState` for URL state; never delete or redefine the jsdom globals. jest-dom 7 style expectations use computed normalized colors such as `rgb(...)`, not named-color serialization
- Jest 30's Babel report may add an alternate slot without source coordinates for an `if` that has no `else`. Keep Babel coverage for Umi/esbuild source-map fidelity; let Jest enforce 100% statements/functions/lines, then let `test:coverage:assert-full` exclude only that exact source-less `if` alternate shape and require 100% of every source-mapped branch. Any other missing map, mismatched path count, invalid hit count, or uncovered source-mapped branch fails closed
- continuation receipts for the shared release/qualification controller must bind the generated `-main` or `-qualification` image tag, qualification boolean, offline policy, and external proof path. Argument-free resume reuses those values; it must finalize a resumed qualification into the same proof destination rather than returning a raw release result

## Reusable Helpers

| Helper area                     | Use for                              |
| ------------------------------- | ------------------------------------ |
| `tests/helpers/mockBuilders.ts` | structured mock objects              |
| `tests/helpers/testData.ts`     | reusable data fixtures               |
| `tests/helpers/testUtils.tsx`   | render wrappers and common providers |

## Unit Pattern

1. isolate one function or service boundary
2. build the minimum input
3. assert outputs and side effects explicitly
4. cover the real branch conditions, not just the happy path

Validation-specific rule:

- page-specific SDK-code adapters under `src/pages/*/sdkValidation.ts` and shared helpers under `src/pages/Utils/validation/**` should default to direct unit tests
- ordered-dataset scalar normalizers should directly prove empty, valid, legacy string, boundary, and invalid inputs; each create/update/create-version save gate should also prove that invalid non-empty values do not reach validation or persistence
- wrapper components that mainly coordinate drawers, forms, or modal jumps should keep behavior coverage through focused component or integration tests instead of artificial branch forcing

Toolchain-specific rule:

- keep TypeScript `7.0.2` as the only direct compiler/API implementation; command-contract tests must reject a TS6 alias, a `tsc6`/compat command, or a non-repository compiler entrypoint
- for an upgraded package that Jest maps to a test double, launch a child Node test through normal package resolution and assert the real installed manifest plus representative runtime behavior. The TIDAS SDK contract must cover all seven dataset factories, `validateEnhanced`, and the normalized failure envelope at exact version `0.2.0`
- keep every `typescript/unstable/*` import inside `scripts/typescript-native-parser.mjs` and `scripts/typescript-native-parser.d.mts`. Adapter proof must cover source replacement without stale AST state, traversal and parent/text ranges, TSX guards, syntactic diagnostics, JSON parsing, and clean process exit
- use Oxlint for unused and deprecated API correctness and Prettier for formatting only. Keep the focused repo-local `tiangong/no-invalid-this` rule until Oxlint provides a native equivalent, and prove it rejects module-level `this`. Tests must reject reintroducing ESLint, the standalone deprecated scanner, or a Prettier organize-imports plugin

## Integration Pattern

1. render the real page or route-level surface
2. mock only external dependencies
3. drive the user flow through the visible UI
4. assert the user-visible result plus the key service interaction

Special cases:

- repo integration matrix pattern: use when one service path branches by source, type, or permission
- permission and URL-state pattern: use when behavior depends on auth, query params, or navigation state
- data workflow fixture pattern: keep each `tests/data-workflows/fixtures/result/**` expected-result file aligned with its same-scope `fixtures/data/**` payload, workflow lib default path, and unit proof; the fixture relationship map lives in `tests/data-workflows/fixtures/result/README.md`
- strict command-contract pattern: type the complete client payload, assert its exact serialized shape at the service boundary, and preserve versioned dataset identities as `{ id, version }` rather than weakening tests to identifier-only fixtures
- canonical async-task pattern: create multiple local projections for one backend worker/package identity, resolve queue and poll promises out of order, and assert one retained task, one poller, backend timestamps, and error delivery to the retained identity
- escalate to E2E only when browser-only behavior cannot be proved in Jest

## Component Pattern

1. render the component with realistic props
2. keep providers minimal but sufficient
3. assert the contract the parent relies on

## Localization Pattern

1. prove leaf-file topology and canonical key parity across every supported locale
2. compare placeholder names, occurrence counts, plural/select selectors, offsets, nesting, and per-branch coverage rather than translated word order
3. audit production literal message IDs and enumerate the exact members of each computed-ID family
4. require either a proven closed-world producer or a localized unknown-value fallback at every runtime-open boundary
5. build a compact context manifest from callsites, adjacent states, route/view ownership, source locales, glossary, style, fallbacks, ICU, and technical-token evidence; `BLOCKED_CONTEXT` must be zero before activation
6. translate and independently review high-risk lanes with automated evidence; this workflow has no Pilot, catalog approval, or delta approval state
7. represent every changed existing translation with an exact tracked correction dossier and verify the affected closure; uncertain wording may remain unchanged as a non-blocking candidate
8. preserve the frozen Issue #601/#602/#606 German confirmation boundary as historical compatibility evidence only; active German uses the same automated correction and activation gate as other registry locales
9. cross-check locale inventory with route/view inventory so component-local maps, media/error states, static pages, redirects, and query views cannot hide outside catalog parity
10. validate each edit with the narrowest proof that covers its risk; accumulate coherent locale work into batch audits rather than running lint, build, coverage, or the repository full gate for every message
11. bind the repository full gate to the final committed controlled checkpoint and use `push:checked` so the ordinary hook owns that one execution; only a failed transport after successful gates may activate the exact-intent receipt consumed by argument-free `push:retry`
12. prove in a clean runner that active locale/context/quality/correction/activation commands do not read `.local/**confirmation*`; historical German checker fixtures stay outside that dependency path
13. derive UI, content, service-query, and reference-resource expectations from their typed registries/Manifest; a new active locale must enter the same parameterized tests and fail closed on any missing capability or unowned language hardcoding. A unit test may repeat the current locale list only when its adjacent name or comment declares an intentional fail-closed product-contract snapshot that forces explicit review of additions, removals, labels, and order
14. bind route/view semantics to stable executable assertion IDs, not prose-only planned assertions; routine checks validate the tracked 50-ID/locale/browser/cleanup structure, while explicit production readiness additionally requires current route, test, source, backend, package, and runtime-asset bindings
15. make the semantic evidence reporter resolve formatting from the repository-owned evidence path and write repository-canonical JSON directly even when the actual destination is an external container mount; verify those raw bytes with the same canonical checker, then generate every locale summary in one invocation following the explicit `context -> structuralValidation -> quality -> activation` graph
16. run the isolated double-generation check after generator or evidence-input changes; both consecutive runs must preserve the exact Git diff so stale or non-canonical checked-in summaries fail before publication
17. keep browser proof outside the repository and identify it from behavior-affecting inputs; never maintain or imply release reuse by committing generated hashes or compatibility records

Browser semantic E2E pattern:

- use `@playwright/test` `1.62.1` through `playwright.config.ts` and keep specs/helpers under `tests/e2e/i18n/**`
- use `pnpm e2e:dev` for a dirty/focused worktree loop; it serves the candidate with `pnpm start:main` and must still reject a non-loopback Playwright base URL
- a dirty credential-free qualification diagnostic must compile `REACT_APP_ENV=qualification`, serve that candidate on loopback, and run Playwright with `E2E_EXTERNAL_SERVER=true`; do not combine qualification simulator flags with the `start:main` bundle because its real backend target must be rejected by readiness
- use `pnpm e2e:release` for exact committed browser qualification: require a clean commit, export only the Next candidate, build/serve the production bundle inside the digest-pinned image, and never mount the parent workspace, Git metadata, host dependencies, or browser profiles
- normal release orchestration keeps browser qualification earlier and separate: run the manual hermetic workflow on the open business PR when change risk warrants it, then `release:to-dev --apply` uses a restricted structural/static push and the exact generated Release PR into `dev` runs one non-browser Release Gate before merge
- local proof uses `e2e:qualification:key`, `e2e:qualify -- --proof <ignored-path>`, and `release:proof:verify -- --proof <path>`; qualification builds with its fixed `.invalid` backend profile, root version-only and deployment `.env` changes preserve the key, while source, qualification config, shared helpers, Git mode/type, or browser-environment changes invalidate it
- release-workflow unit fixtures must prove release-to-dev and promotion invoke only their exact restricted push profiles, never invoke browser qualification or write tracked proof, and still cover composed-candidate preflight failure, unexpected untracked files, immutable promotion identity, main-baseline binding, direct ancestry, tree-identical promotion, changed-tree rejection, and the rule that no failed preflight path reaches push or PR creation
- publication-workflow contract tests must prove normal main pushes fail closed on an invalid dev proof without selecting a full-gate fallback, while explicit tag/dispatch recovery selects one full aggregate; every tag, draft, web, Electron, and verification job still names each direct prerequisite and requires its result to be `success`
- finish environment, identity, browser-launch, bundle/login, backend, optional role-neutral auth, recovery-ledger, and test-discovery preflight before fixture intent; preserve the sanitized original cause in structured diagnostics
- serialize commands that mutate release-E2E runtime state; allow argument-free resume only for the exact HMAC-bound one-hour receipt issued before fixture intent, revalidate all candidate/environment/source/image/argument bindings, and rerun preflight; never reuse a browser pass, failed assertion, fixture phase, or cleanup result
- reproduce a race with an exact read-only scope such as `--project chromium --grep <pattern> --repeat-each 5`; the controller rejects repetition for a full matrix, production mutation, or verified evidence
- keep the global rendered-candidate probe and require every new login page/context to await the shared route-specific visible marker before interaction; use a bounded readiness timeout, never a fixed sleep, broader action timeout, disabled retry accounting, or relaxed `failOnFlakyTests`
- retain the 15-second assertion budget for public/CI semantics, but allow the explicitly authenticated production-backed closure 45 seconds for remote Process drawers; this scoped budget must not weaken routine browser checks
- derive locale and authoring-language loops from `LOCALE_REGISTRY` and `CONTENT_LANGUAGE_REGISTRY`; never copy the current locale list into a spec or reporter
- run the complete 50-route/view matrix in Chromium, require every target-declared semantic scenario in the evidence record, and run the critical selector, team authoring, and process lifecycle scenarios in Chromium, Firefox, and WebKit
- keep every semantic E2E GitHub Actions invocation credential-free and read-only; `workflow_dispatch` runs the hermetic content-addressed qualification for an operator-selected open business PR or exact SHA, while routine PR/dev/release events do not trigger or require it; host `CI` or `GITHUB_ACTIONS` must fail production-data mode before Docker, and only an accepted local operator run may clear the image-inherited markers inside the container while still requiring `E2E_AUTHENTICATED=true` plus the two write guards (`E2E_ALLOW_PRODUCTION_DATA=true` and the exact one-process confirmation token); verified evidence is a separate explicit opt-in
- write an ignored UUID-scoped `codex-e2e` intent ledger before create; before delete, fetch the exact production row and verify its exact ILCD UUID path, authenticated owner, and per-language marker pairs at all five exact multilingual field paths
- delete only verified exact-ID row versions and fail unless `created=cleaned` and `leaked=0`; an absent or unverifiable attempted row is not successful cleanup evidence
- keep Header Umi `SelectLang` at `reload={false}` and prove locale switching within the same document: URL/document identity persist, mounted locale state refreshes, and a delayed old-locale reference response cannot overwrite the current selection
- stage deliberately stale IndexedDB/localStorage fixtures on a same-origin static document before navigating to the tested deep link, and send menu-dismissal keys to the visible menu/trigger rather than ambient page focus; Firefox may retry one exact navigation only after its known cancellation failed to commit that target
- disable screenshot, trace, video, and persisted/uploaded auth state; evidence contains only non-secret assertion results and content digests
- treat adding a registry locale or changing a bound route/source/test, raw `pnpm-lock.yaml`, or `pnpm-workspace.yaml` install policy as evidence invalidation, not as a request to reuse the old result; a root `package.json.version`-only release may reuse dependency identity because pnpm does not encode that version in its lockfile
- when the user explicitly authorizes skipping E2E for an additive production request-guard expansion, bind only `tests/e2e/i18n/production-request-guard.ts` and its paired `tests/unit/e2e/productionRequestGuard.test.ts` proof to exact old/new digest pairs under `reviewed-read-only-request-guard-expansion`, require focused unit proof for every added read-only endpoint, and fail closed on any later digest drift
- when a release owner explicitly authorizes skipping the full authenticated E2E rerun for a promotion, record one owner-Issue-bound `user-authorized-release-candidate-e2e-skip` identity covering the complete `config`, `src`, `tests/unit`, and package manifest trees; require the full pre-push gate, permit it only for source and unit-test bindings, and fail closed on any candidate-tree drift

Release Gate proof pattern:

- emit release proof only after every exact dev Release PR non-browser gate step succeeds, and bind repository, dev PR number, main baseline, dev base, candidate commit/tree/version, workflow path, run ID, run attempt, and artifact name in one short-lived artifact; browser qualification is deliberately outside this scope
- resolve promotion reuse from the dev merge itself: require exactly two parents, first-parent equality with the gated dev base, second-parent equality with the gated candidate, and equal merge/candidate trees before consulting GitHub metadata
- resolve publication reuse through both merges: require the main merge's first parent to equal the proof-bound main baseline, its second parent to equal the verified dev merge, and all promotion/release/candidate trees to remain equal
- require exactly one matching merged dev PR and main PR, a successful readiness workflow and named aggregate job, one unexpired artifact, and a byte-parsed payload whose identity fields all match; do not trust artifact naming alone
- fail closed on missing, ambiguous, expired, mismatched, unavailable, direct, squash, or rebase identity during a normal promotion/main release; use a fresh full aggregate only for explicit tag or recovery-dispatch events
- classify a direct main hotfix only when its PR carries the exact Issue/main-base/head marker, current main is an ancestor, and package version is unchanged; stale marker, divergent base, or version drift must fail before the fresh exact-head gate starts

Documentation capture profile pattern:

- keep only source-version facts under `config/docs-capture/**`: runtime/readiness, login/identity, allowed auth/session mutations, denial probes, and stable locator policy
- let the workspace compiler fail closed when the exact render-target profile is missing or incompatible
- prefer role, label, text, and test-id locators; the current profile intentionally rejects CSS
- never add the generic executor, account secret handling, dynamic origin, screenshot output, or Draft/evidence policy to Next; those belong to workspace tooling
- use a synthetic local Chromium canary only as cross-repo workspace proof after the exact Next profile and render-target commit are bound

Scope-closure provider qualification pattern:

- run `scripts/qualification/scope-closure-next-qualification.mjs` only from a clean tracked commit and let it export that commit into a temporary detached worktree
- require explicit isolated-non-production confirmation and loopback frontend/backend targets; reject production fingerprints before browser startup
- exercise the real Data Processing browser route across every relevant authenticated role plus anonymous routing, and prove all four artifact states, direct document navigation, bounded format presentation, integrity/expiry metadata, and localized expired guidance
- emit only the exact Worker-owned provider result schema and Next-owned consumer leaves; never include URLs, object locators, response payloads, credentials, cookies, or tokens
- rerun with the same run ID and commit and require byte-identical canonical JSON before aggregator handoff

Gate-bootstrap pattern:

- when a hook supports both `PATH` and a version manager, test the already-correct active runtime while the version-manager fallback is deliberately unusable; the hook must not replace a compatible runner-provided runtime
- test no-update, deletion-only, `HEAD`-source, tag, and multi-ref push shapes explicitly: deletion/no-update must not spend the gate budget, an exact `HEAD` branch push may proceed, and every other ineligible checked update must fail before either gate
- bind compiler, linter, formatter, Jest, sequencer, runner, and native-parser inputs into the gate checkpoint. A committed drift in any bound input must change the digest and invalidate an existing transport receipt
- when a long in-band coverage run reproducibly crashes the native runtime, isolate any operational suite that imports no `src/**`, then qualify the smallest useful fixed worker pool with a documented per-worker idle-memory recycle boundary on the affected platform; lock the exact selection/exclusion and worker contract in the isolated suite, and let the single coordinator retain the global 100% source threshold across worker replacements

## Focused Command Shapes

Canonical baseline and proof ownership stays with `DEV.md` and `docs/agents/repo-validation.md`. Use this file only for focused command shapes that support the test pattern you already chose.

| Need | Command shape |
| --- | --- |
| focused unit or component run | `pnpm test:ci tests/unit/<scope>/ --runInBand --testTimeout=10000 --no-coverage` |
| focused integration run | `pnpm test:ci tests/integration/<feature>/ --runInBand --testTimeout=20000 --no-coverage` |
| TypeScript 7/Oxlint command, installed SDK, and adapter contract | `pnpm test:ci tests/unit/config/toolchainCommandContract.test.ts tests/unit/config/installedTidasSdkContract.test.ts tests/unit/scripts/typescriptNativeParser.test.ts --runInBand --no-coverage` |
| slow-first and receipt-fixture contract | `pnpm test:ci tests/unit/scripts/slowJestSequencer.test.ts tests/unit/scripts/prepushGateReceipt.test.ts --runInBand --no-coverage` |
| focused semantic localization browser proof | `pnpm e2e:dev <Playwright arguments>` |
| exact-candidate release browser proof | `pnpm e2e:env:doctor` then `pnpm e2e:release <release options>` |
| open-handle debug | `pnpm test:ci <file> --runInBand --detectOpenHandles --no-coverage` |
| active German runtime assembly | `pnpm i18n:de:audit` |
| active locale context and quality | `pnpm i18n:context:check --locale <canonical-locale>` then `pnpm i18n:locale:quality:check --locale <canonical-locale>` |
| one-shot canonical locale summaries | `pnpm i18n:locale:artifacts:write` then `pnpm i18n:locale:artifacts:idempotence`; the isolated idempotence clone must reproduce generator-required remote refs such as `origin/main` |
| canonical semantic evidence format | `pnpm i18n:evidence:canonical:check --path <artifact>` |
| language platform and hardcoding | `pnpm i18n:platform:audit` then `pnpm i18n:hardcoding:audit` |
| all-active-locale activation | `pnpm i18n:locale:all:check` |
| existing-translation correction overlay | `pnpm i18n:corrections:check` |
| historical Issue #606 snapshot only | `pnpm i18n:de:delta:review:check` |
| final managed push | `pnpm push:checked <normal-git-push-args>` |
| receipt-bound transport retry | `pnpm push:retry` |
| compact agent full gate | `pnpm prepush:gate:agent` (full logs under `.local/test-logs/**`) |

- run Umi-generating focused tests, coverage commands, and `pnpm prepush:gate` serially because they share `.umi-test`; finish focused diagnosis before the one final full gate

## Skip And TODO Policy

- do not leave permanent `it.skip` without a tracked reason
- if a test cannot be written because of an infrastructure blocker, document the blocker in the owning doc or task record

## Pre-Delivery Checklist

- correct test type chosen
- existing helpers reused where possible
- focused suites passed
- async leaks checked when the failure mode suggests it
- related testing docs updated if workflow rules changed

## Workflow guard fixtures (platform #1055)

Inline release-admission guards stay workflow-owned. Focused tests extract the exact `run:` block from the workflow file and execute it against fixture git remotes (insteadOf-mapped bare upstream, fixture `GITHUB_*` environment) instead of re-implementing the shell logic; see `tests/unit/scripts/buildReleaseContextGuard.test.ts`.
