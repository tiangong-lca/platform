---
title: next Testing Strategy
docType: design
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when deciding whether this repo needs new testing strategy work
  - when evaluating long-term testing direction beyond the current queue state
  - when strategy assumptions for repo tests change
whenToUpdate:
  - when the long-term testing strategy changes
  - when reopen conditions for strategy work change
  - when this strategy no longer matches the maintained testing model
checkPaths:
  - docs/agents/test_improvement_plan.md
  - docs/agents/test_todo_list.md
  - docs/agents/repo-validation.md
  - .oxlintrc.json
  - .prettierignore
  - .prettierrc.js
  - .ncurc.json
  - jsconfig.json
  - tsconfig*.json
  - jest.config.cjs
  - tests/**
  - playwright.config.ts
  - scripts/e2e/**
  - scripts/release/**
  - scripts/jest-sequencer.cjs
  - scripts/oxlint-plugin-tiangong.mjs
  - scripts/test-runner.cjs
  - scripts/prepush-gate-receipt.cjs
  - scripts/typescript-native-parser.*
  - docker/e2e/**
  - .github/workflows/i18n-semantic-e2e.yml
  - .github/workflows/release-gate.yml
  - .github/workflows/release-readiness.yml
  - .github/workflows/build.yml
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - Dockerfile.app
lastReviewedAt: 2026-09-25
lastReviewedCommit: c60e9eb2ca1a4053207fb680f73887f761f736ea
lastReviewedNote: 'Reviewed Process save/review regression coverage; synthetic serializer and component cases fit the existing unit/component strategy without changing its longer-term plan.'
---

# Testing Strategy

> Long-term testing strategy. Use `docs/agents/test_todo_list.md` for current operational state.

## Strategic State

- current strategy is maintenance, not expansion for its own sake
- full closure already exists; the job is to preserve it while the codebase changes
- dependency installation is a governed proof input: the repository pins Node `24.19.0`, pnpm `11.24.0`, and TypeScript `7.0.2`, requires a frozen lock, keeps isolated linking with only the reviewed Umi/Babel public-hoist patterns, collapses Umi fallback metadata to one exact React 19 / antd 6 / ProComponents 3 generation through narrow overrides, decides every lifecycle build explicitly, and validates clean-install plus dependency-identity drift through focused contracts before the final gate
- CI bootstrap provenance is part of the same proof: every owned `pnpm/setup` invocation uses the reviewed peeled executable v2.0.2 commit SHA rather than an annotated-tag object or movable major tag
- the released TIDAS SDK consumer is protected by a child Node contract outside Jest's module mapper; it resolves the real installed `0.2.0` package and exercises all seven dataset factories plus the normalized `validateEnhanced` error envelope so mocked application suites cannot hide a package incompatibility
- add integration-test expansion only when it reduces real product risk
- validation-heavy surfaces such as process-editor SDK guidance, multilingual field checks, and review jump targets should prefer behavior-level tests over snapshot growth
- shared validation adapters and helper modules should stay unit-heavy; do not expand wrapper-only branch testing unless the user-visible contract actually changes
- data workflow smoke coverage should grow through paired data/result fixtures and workflow-lib unit proof only when the workflow phase or backend-facing assertion changes
- localization quality should combine deterministic topology, context, terminology-token, route-view, fallback, correction, and activation gates with a separately produced semantic/route/E2E proof; the deterministic structural artifact must not present itself as independent semantic review, and delivery does not create a human translation-approval state
- the localization semantic E2E layer is deliberately bounded: 58 stable route/view assertion IDs, a Chromium full matrix, three-browser critical scenarios, registry-derived locale/content-language loops, and external digest-bound evidence that invalidates itself when a locale, covered input, or executable dependency lock changes
- production-backed E2E uses a local candidate frontend and an explicitly authorized local operator trust boundary; GitHub Actions provides a manually dispatched credential-free hermetic qualification for an open business PR or chosen ref when browser evidence is warranted. Host `CI`/`GITHUB_ACTIONS` rejects production-data mode before Docker; an authorized local closure still requires authenticated mode, two explicit production-write guards, a separate verified-evidence opt-in, intent before create, UUID/owner/five-field marker verification before delete, and `created=cleaned`, `leaked=0`
- exact committed browser qualification treats environment setup as productized test infrastructure: a pinned-image installer, read-only doctor, archived clean candidate, one cached production build, ordered pre-fixture checks, phase-coded diagnostics, and exact one-hour continuation remove repeated environment exploration without weakening browser or cleanup evidence
- semantic-harness qualification is content-addressed credential-free proof run manually on the open business PR before `release:to-dev` when risk warrants it; it builds against a fixed `.invalid` backend profile and intercepts every backend request, so deployment-target `.env` is not part of the semantic identity. Canonical discovery recursively includes nested `tests/e2e/i18n/**` specs and pins the complete executed/designed-skip closure, while the key also covers shared helpers plus Git mode/type. `release:to-dev --apply` and every later release stage run no browser and write no browser proof
- browser/UI race repair remains a focused loop (`e2e:dev` with one project/spec/grep plus explicit readiness states); only after focused repeat stability should an operator spend the complete release matrix, and no blanket retry or fixed sleep may substitute for first-attempt release proof
- Jest/jsdom dependency upgrades keep browser globals platform-owned: navigation mutations cross one explicit `Location` boundary, SSR/storage/event-target branches accept explicit inputs, and tests never delete or redefine `window`/`location`
- Jest 30 coverage keeps the established 100% product contract by separating source-mapped executable branches from Babel/Istanbul's new source-less synthetic `if` alternates. The normalizer is fail-closed for every other unmapped shape and has direct positive, missed-branch, and malformed-map contracts
- same-document locale behavior is a first-class browser risk: Header Umi `SelectLang` stays `reload={false}`, and proof covers retained document identity plus stale-reference-response race rejection
- clean-runner localization tests should prove that active locale and full-gate commands pass with private confirmation files absent; generated private fixtures remain limited to historical German compatibility-checker tests
- proof should be risk-proportional and scoped-first: micro-edits use focused checks, coherent batches use subsystem audits, and the repository full gate runs once for the final committed controlled checkpoint
- documentation screenshot capture is a separate, on-demand product-evidence workflow: Next supplies only the source-bound product profile and stable locators, while workspace owns profile compilation, plan/security/access, run-scoped base-origin logic, and the synthetic Chromium canary outside the semantic localization proof and release matrix
- gate ownership should prevent duplicate work: a normal delivery uses the push hook as the single full-gate owner, while a no-push handoff may run it manually instead
- gate eligibility should be decided before gate execution: exact current-branch and `HEAD` source spellings may proceed, raw deletion/no-update shapes spend no test budget, and invalid checked ref shapes fail before Docpact or the full suite
- release-risk gates should be split by repair cost: operator-selected browser evidence runs while the business PR is still open, so failures stay on that PR; the generated release-candidate push runs only structural/static proof, and the exact dev Release PR runs the non-browser static/full gate. A successful dev Release PR emits proof bound to the main/dev bases, candidate head/tree/version, PR, run attempt, and artifact; immutable promotion/main stages verify it instead of repeating the gate
- deterministic release orchestration should fail before transport on version scope, cumulative Docpact review, and composed-candidate static preflight; it must not generate browser proof. Release-line proof accepts direct ancestry or only a tree-identical two-parent promotion whose second parent remains in `dev`, while promotion retains the exact merged `dev` SHA and the original main baseline
- each production release candidate should have one non-browser proof owner: the exact dev Release PR runs `prepush:gate` once. Browser qualification remains a separate manual signal and is never consumed by release proof. Normal promotion PR/push paths fail closed on absent or mismatched release proof rather than creating a late fallback; an explicitly marked, unchanged-version main hotfix is a separate exact-head candidate and owns one clean-runner full gate; explicit recovery events may also run a fresh non-browser gate
- generated localization evidence should be canonical and idempotent at its source: the reporter resolves repository formatting independently of its ignored/external destination, one dependency-ordered invocation produces every tracked locale summary, and a double-generation check proves the second run leaves the exact Git diff unchanged
- agent and CI consoles should remain bounded to stages, failures, and final summaries while complete Jest stdout/stderr and structured results remain available under `.local/test-logs/**` and as short-lived Release Gate artifacts
- semantic proof reuse should follow computed behavior boundaries rather than mutable source records: an external proof may be reused only after its content key and closure validate against the current candidate; there is no tracked receipt, compatibility map, or waiver state

## Operating Principles

- every touched behavior ships with matching proof
- current-state queue data belongs in `test_todo_list.md`
- make strategy changes explicit
- keep focused Umi-generating tests, coverage, and full gates serial; shared generated state makes parallel execution invalid evidence
- keep data workflow fixture relationships explicit so expected-result Markdown remains reviewable instead of becoming an opaque snapshot set
- keep semantic localization browser evidence credential-free and non-visual: screenshots, traces, videos, and persisted auth artifacts are disabled; the workspace-owned docs-impact capture engine is the only documentation-image surface and never changes those release-E2E defaults
- dead branches should be removed instead of defended by artificial tests

## Integration Testing North Star

Add integration tests when they protect one of these:

- route-level user workflows
- auth and permission boundaries
- service wiring across providers or pages
- regression-prone shared UI behavior

## Reopen Strategy Work Only When

- current tests stop protecting important workflows
- repeated incidents show a missing integration boundary
- the validation system changes enough that the current model becomes misleading

## Done Definition

The strategy is working when:

- full closure remains intact
- test additions track real product risk
- current-state docs stay small because the queue stays closed
