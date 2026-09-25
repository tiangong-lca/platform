---
title: next Supabase Environment And Database Workflow
docType: guide
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when choosing the correct environment for frontend validation
  - when deciding whether a change belongs here, in `database-engine`, or in `edge-functions`
  - when checking webhook secret rules
whenToUpdate:
  - when frontend environment-selection rules change
  - when repo ownership boundaries around Supabase behavior change
  - when the workflow for shared dev versus main validation changes
checkPaths:
  - docs/agents/supabase-branching.md
  - config/supabaseEnv.ts
  - src/services/**
  - docker/**
  - scripts/e2e/**
  - playwright.config.ts
  - tests/e2e/i18n/**
lastReviewedAt: 2026-09-25
lastReviewedCommit: 4aa4e7c91c261a3b9bead1572c8b1d326abe4332
lastReviewedNote: 'Reviewed Process site-label delivery: the frontend reads existing Process JSON fields and uses the existing search_processes RPC; database ownership and environment policy are unchanged.'
---

# Supabase Environment And Database Workflow

> Purpose: exact ownership and environment rules for frontend work that touches Supabase-related behavior.

## Use When

- choosing the correct environment for frontend validation
- deciding whether a change belongs here, in `database-engine`, or in `edge-functions`
- checking webhook secret rules

## Do Not Use For

- authoring schema migrations
- editing Supabase branch config
- defining database truth

## Ownership Split

| Repo | Owns |
| --- | --- |
| `database-engine` | schema truth, migrations, seeds, Supabase config, branch-governance workflow, database-side preview behavior |
| `tiangong-lca-next` | frontend env selection, app-side Supabase clients, frontend validation |
| `edge-functions` | Edge Function runtime code |

## Environment Contract

| Need                             | Command           |
| -------------------------------- | ----------------- |
| shared persistent `dev`          | `pnpm start`      |
| explicit shared persistent `dev` | `pnpm start:dev`  |
| explicit `main` verification     | `pnpm start:main` |

Rules:

- routine feature and fix work starts from Git `dev` and targets `dev`
- do not infer the working trunk from GitHub default-branch UI alone
- explicit `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` values supplied by the build environment override repository env-file defaults. For `REACT_APP_ENV=dev`, a runtime value that exactly equals the selected main-file default is treated as Umi's preloaded `.env` value and replaced by the corresponding `.env.development*` value; a distinct per-key runtime value remains explicit. Selected files otherwise remain fallback configuration, not an immutable deployment target
- closed semantic qualification builds with `REACT_APP_ENV=qualification` and `docker/e2e/qualification.env`; this fixed `.invalid` target is intercepted completely and is never a production or deployable backend identity
- do not create ad-hoc Supabase clients outside `src/services/**`
- OAuth consent and grant management use the shared Supabase client under `src/services/auth/oauth.ts`. Next owns the `/oauth/consent` bridge/page, the bounded byte-preserved opaque authorization-handle boundary, getClaims-based session check, safe callback navigation, and user grant list/revoke presentation. Connected Applications contains no API-key history or compatibility provisioning action, and account password/email changes use only Supabase Auth with no Cognito bridge. `database-engine` owns OAuth server configuration and client-capability enforcement; environment operators register separate exact redirect URIs and client IDs for Dev and production
- the shared shipped client defaults to `db.schema = api`; non-core reads use Database-owned query facades and mutations use established command/Edge boundaries
- browser startup reads `api.qry_system_status()` once before authentication through `src/services/general/systemStatus.ts`; `APP_RUNTIME_CONFIG_ENABLED` defaults to enabled, and only an explicit case-insensitive `false` skips the RPC and continues with the normal status; maintenance and verification phases render the localized app-shell boundary, while an unavailable or malformed control response fails open to normal startup and is checked again only after a full page refresh
- direct relation access is fail-closed through `src/services/supabase/public.ts` and is limited to `processes`, `flows`, `contacts`, `sources`, `unitgroups`, `flowproperties`, `lciamethods`, `lifecyclemodels`, and `ilcd`; callers must not broaden this list to regain access to implementation tables
- test-only Supabase clients used by live data workflows must select `public` explicitly before reading a core entity; mocks must implement the same schema-selection step
- `docker/volumes/functions/**` does not transfer Edge runtime ownership to Next: it is generated only by `docker/pull-edge-functions.sh --ref <40-character-commit-sha>`, must match that exact Edge tree plus its source receipt, and must delete files absent from the source commit
- national-carbon process-flow graph cache reads go through `src/services/nationalCarbonGraphCache/objects.ts` and its signed object bundle; the frontend no longer owns a public cache base URL override and local direct-read debugging paths should not be reintroduced without a new runtime ownership decision
- ordered-dataset shaping in `src/services/**` stays an app-side boundary even when it mirrors backend schema names
- canonical Process/Flow TIDAS scalar shaping also stays in that boundary: serializers convert valid year and percentage form values to their required JSON scalar types, while create/update/create-version reject affected non-empty values that cannot be represented canonically before calling dataset commands
- AI校验 calls authenticated `ai_suggest` only through `src/services/general/aiSuggestion.ts`: Next enqueues current Process/Flow TIDAS JSON, polls the returned requester-scoped job with a bounded schedule, and consumes only the exact versioned advisory result. Edge owns request validation and public projection, `database-engine` owns durable queue/RPC truth, and the generic Rust `ai-worker` owns rule/model execution. Next never queries worker tables or receives service credentials and internal diagnostics.
- TIDAS package task reconciliation in `src/services/tidasPackage/taskCenter.ts` may coalesce local aliases by backend `workerJobId` or package `jobId`, adopt backend timestamps, and make one authenticated package-detail read for a terminal historical row whose bounded Worker-list outcome is absent. It does not poll imports individually or read private storage locators; `database-engine` remains authoritative for mutable-scope cache lifecycle, fresh Worker job creation, package contents, artifact authorization, and signed links
- persisted Calculation Bundle and release readback go through `src/services/lcaReleases/**`: private bundle reads forward the current user session, public current-release and Process projections may be anonymous, and neither path accepts a service-role credential or exposes private object locators
- ResultSet create/list/get, closure checks, closure artifacts, result-package commands, publication reads, and the unified data-product task feed go through `src/services/dataProducts/**` and authenticated `app_data_product_commands`. Database owns ResultSet identity and ResultSet-to-closure/task joins; Next keeps `resultSetId` as URL/workbench context and derives lifecycle presentation from safe projections without adding a frontend status store. Closure requests preserve exact LCIA method `{ id, version }` identities from the reviewed static catalog, and Next consumes actor-bound curated closure, artifact-lifecycle, signed-download, and `task-summary.v2` projections rather than worker rows or private artifact locators. Signed artifact responses are navigation targets only: Next must not proxy, fetch, or buffer the artifact bytes.
- Node-loaded smoke workflows may call shared service helpers; runtime fallbacks such as locale detection still belong in `src/services/**` and do not create database schema or Edge runtime ownership
- app-side service errors must remain distinguishable from successful empty results so localized pages can render truthful error and retry states; this presentation contract does not move schema, authorization, or Edge ownership into Next
- review queue services forward the full-text query, display mode and exact target type to the Database-owned v4 RPCs. Search reuses the exact dataset version's existing search_text projection; deployment requires the v4 migration, while v3 remains available for older clients. Database applies their intersection before count and pagination and validates values; Next owns the controls, compatible-option presentation, state reset, and matching 50-row UI default.
- dataset review submission calls the stable `app_dataset_submit_review` command with only table, ID, and version; Next sends no Gate run, checksum, or revision assertion. The separate `admin_review_quality_diagnostic` Edge function accepts only Review Admin start/read actions, derives scope server-side, and returns informational report state that cannot authorize or block review transitions.
- Contact, FlowProperty, Source, and UnitGroup keyword searches call only their exact allowlisted Hybrid Edge Functions through the shared app-side helper. Next forwards the current user JWT and optional state/team scope, but never decides team membership; the Edge layer validates and forwards request shape, and `database-engine` remains authoritative for `tg`/`co`/`my`/`te` visibility, Semantic/Hybrid RPCs, derivative queues, and HNSW indexes
- Process keyword searches call `search_processes` through `src/services/processes/api.ts`, pass explicit query terms, and use no app-side ILIKE field filter. The `public_plus_owner_draft` picker asks the database for actor-owned state-zero drafts and public rows separately; database-engine owns actor/state eligibility, latest-version selection, workflow metadata, and `search_text` index constraints
- LCA solve, result-query, and contribution-path requests use the shared `LcaScope` contract from `src/services/lca/scope.ts`. The default snapshot family is `full_library`; `data_product` is the only alternate value. Deployment names and cache namespaces are not valid LCA scope values, and persisted task recovery normalizes historical non-canonical values before resubmission
- the authenticated production-backed semantic localization E2E is an explicit test-only exception to the shipped `src/services/**` placement rule: direct development mode serves the worktree with `pnpm start:main`, while release mode builds and serves the archived clean commit inside its isolated container; both verify the selected Supabase origin against tracked `main`, authenticate as the runtime test user, never use a service-role key, and may create/delete only the exact UUID/version `codex-e2e` process recorded in the primary plus externally mounted recovery ledger. Closed qualification is a separate credential-free simulator and never reads tracked `main` environment configuration
- production-backed browser proof classifies only the exact reviewed `list_task_feed` and `list_publications` payloads as read-only data-product commands; the shared function path or a POST method alone never establishes a read-only boundary
- ordinary PR and `dev` browser jobs receive no production credentials and perform no writes; the production-backed closure is manual-only, requires `E2E_ALLOW_PRODUCTION_DATA=true`, and must finish with `created=cleaned` and `leaked=0`

## Common Scenarios

### Scoped online-backend exception: Next #1008

The user explicitly approved a single exception for workspace #963: implement against the currently running Main backend before the normal candidate commits complete formal Git promotion. Database `470e66157fc0b363c3360ba952f75280cfa1ff73` (only two additive search migrations) and Edge `08b19d7b841395e5d16096ff5258d7ac405c9b6f` (three search functions) were deployed and read back; [the coordination evidence](https://github.com/tiangong-lca/workspace/issues/963#issuecomment-5508734216) records exact artifacts, ACLs, tests and rollback.

This permits this delivery's exact generated mirror and consumer contract; it is not a standing waiver of the review/promote-first rule below. The shared Dev environment is not redirected to Production. Routine frontend merge/release still needs the matching backend contract in its selected environment; formal review, promotion and root integration remain tracked separately.

Release follow-up: the Edge authentication/order corrections at `5d0dd0078a438513d8d2484d2c211def7a0d0cda` are included in Main merge `cb2b34210366bdc1f7ca93a23863d6b2a9931c02` and deployed to Dev/Main before this consumer release. That release pinned the reviewed source. The paired `data.sql` is generated only from the exact Database migration rebuild described in `docker/README.md`; it includes the API/private/archive boundaries and static capability catalogs needed by those functions, without copying production data. Existing self-hosted database volumes must use Database-owned migrations, not replay the fresh-install snapshot.

Current self-hosted pairing for Next #1042 uses reviewed Edge `ceff9c4893e6fa9ab2b6e163c57b9d6428cbde37` and Database `fc743392d4ce256b5de1f6409a8ab7e90ec30614` (migration head `20260909120000`). Matched V2 entrypoints forward visibility/team and Process-type context; omitted/latest requests retain legacy RPC arguments and Edge fallback as qualified by Edge #407/PR408 and #409/PR410, integrated through workspace #1021/#1022 / PR1023. The generated initializer preserves three constrained executors, the source default-function ACL, fresh queue storage and its Database-owned fence; it does not translate PG17 administrative-only memberships into PG15 runtime membership. The generator and pinned PG15/Auth restore procedure are owned by `docker/README.md`. Existing volumes still use Database migrations.

The Process/Flow Hybrid services keep the current user JWT and data-source/state scope, request the fixed 200-candidate matched mode, and reject an old backend that does not acknowledge that contract. Process forwards the selected dataset type; Flow forwards only normalized type, input-direction, and classification filters. Public `tg`/`co` views preserve an optional institution team, while `te` resolves the current user's team and fails closed to an acknowledged empty result when none is available. Next does not authorize those filters and does not retry silently against a latest-only API; Edge validates the request and `database-engine` owns visibility, adaptive exact/HNSW routing, and threshold fallback.

| Scenario | Correct workflow |
| --- | --- |
| app-only change | work in this repo, use `dev`, validate here |
| ordered-dataset shaping or validation normalization under `src/services/**` | keep the change in this repo, validate here, and escalate only if schema truth or Edge runtime behavior must change |
| foundation-dataset Hybrid Search entrypoint | change Next pages/services here, pair it with the matching Edge route and database RPC revisions, validate against a non-production environment, and preserve UUID/empty-query behavior |
| Process keyword search or strict calculation picker scope | change the app-side request here, pair it with the matching database v2 RPC revision, and validate public plus owner-draft results against a non-production environment; do not add direct app-side field filtering |
| translation-backed validation save flow such as `translate_text` retries, English supplementation, or save-while-checking continuity | keep the frontend control flow in this repo; escalate only if the Edge runtime contract itself must change |
| schema-related feature | start in `database-engine`, validate the database branch there, then validate this repo against the relevant environment |
| database schema-boundary cutover | pair the exact Database and Edge revisions, default shipped RPC calls to `api`, route only the nine public core entities through `publicEntity()`, audit every literal RPC against the Database facade catalog, and run the schema-boundary plus data-workflow proof |
| self-hosted Edge Function mirror refresh | first review and promote the owning Edge commit, then run the Next helper with that full SHA, verify byte-for-byte parity/source receipt/stale deletion, and require a no-diff second run |
| `main` investigation or hotfix verification | use `pnpm start:main` only for that scoped task |
| semantic localization release evidence | use fixed non-production configuration for closed qualification; run the separate authenticated local candidate against tracked `main` only when production-backed evidence is explicitly required, with user credentials and exact `codex-e2e` ledger cleanup, never schema/admin authority |

## Database-Side Webhook Secrets

Database-triggered Edge Function calls do not read this repo's frontend env files.

They depend on branch-specific Vault secrets on the active Supabase branch:

- `project_url`
- `project_secret_key`
- `project_x_key` only for legacy `generate_flow_embedding()` compatibility

Do not hardcode branch URLs or service keys in app code, SQL, or dumped baseline files.
