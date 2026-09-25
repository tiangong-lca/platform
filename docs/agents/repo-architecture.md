---
title: next Repo Architecture Notes
docType: guide
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when you need a compact mental model before editing routes, pages, services, or static resources
  - when deciding which layer owns a behavior change
  - when a path is mentioned without enough context to know its role
whenToUpdate:
  - when major route, runtime, or service layers move
  - when stable path ownership changes
  - when the current map becomes misleading
checkPaths:
  - docs/agents/repo-architecture.md
  - .docpact/config.yaml
  - config/**
  - src/**
  - public/**
  - docker/**
  - scripts/e2e/**
  - playwright.config.ts
  - config/docs-capture/**
  - tests/e2e/i18n/**
lastReviewedAt: 2026-09-25
lastReviewedCommit: 4aa4e7c91c261a3b9bead1572c8b1d326abe4332
lastReviewedNote: 'Reviewed Process site-label delivery: the Process service derives display-only site evidence from existing row JSON and the page renders it within the established page/service boundary.'
related:
  - ../AGENTS.md
  - ../.docpact/config.yaml
  - ./repo-validation.md
---

## Repo Shape

This repo is a Umi `4.7.9` React 19 SPA on one native Ant Design `6.6.2` / ProComponents 3 generation, with service-first data access, an Electron `44.1.0` packaging surface, cache-backed static resources, and strict validation gates.

## Stable Path Map

| Path group | Role |
| --- | --- |
| `config/routes.ts` | route tree and route-family entrypoints |
| `config/config.ts` | Umi runtime config |
| `config/defaultSettings.ts`, `config/branding.ts`, `config/proxy.ts`, `config/oneapi.json` | app-shell defaults, branding, dev proxy, and support config |
| `config/supabaseEnv.ts` | frontend env selection; standard Dev replaces Umi-preloaded values that exactly match main-file defaults with `.env.development*`, distinct explicit build values retain priority, and qualification selects a fixed non-production profile |
| `src/app.tsx` | runtime layout, auth redirect, cache monitors, and Umi-global antd 6 ConfigProvider/App theme synchronization |
| `src/access.ts`, `src/global.tsx`, `src/requestErrorConfig.ts`, `src/contexts/**` | app-shell access control, request behavior, shared runtime state, and the global App feedback registrar used by non-component callers |
| `src/pages/**` | route-level product pages |
| `src/pages/*/sdkValidation.ts`, `src/pages/Utils/validation/**` | page-level SDK-code adapters plus shared localized validation messages, detail mapping, and form-support helpers |
| `src/components/**` | shared UI and reusable flows |
| `src/services/**` | app-side Supabase/API access, ordered-dataset shaping, typed locale normalization and runtime fallback for Node-loaded services, explicit anonymous-route policy, and service logic |
| `src/services/general/tidasScalarStorage.ts` | canonical TIDAS year/percentage scalar normalization and the Process/Flow save-boundary issue format |
| `src/services/general/aiSuggestion.ts` | authenticated AI suggestion enqueue, bounded polling, terminal validation, and versioned result decoding |
| `src/services/dataProducts/**` | authenticated data-product commands, closure-check projections, result-package requests, and the curated `task-summary.v2` feed consumed by the global task center |
| `src/locales/**` | UI strings; every supported locale follows one canonical message manifest, with leaf topology, key ownership, placeholders, and dynamic families kept aligned |
| `src/global.less`, `src/style/**`, `src/manifest.json`, `src/service-worker.js`, `src/utils/appUrl.ts`, `src/utils/browserNavigation.ts`, `src/utils/ruleVerification.ts`, `src/typings.d.ts` | browser shell support, global styling, explicit navigation side-effect boundaries, and support utilities |
| `public/**` | generated or reviewed static resource bundles consumed by the app, including the EdgeOne OAuth path rewrite and no-store hash-history consent bridge |
| `public/robots.txt`, `public/404.html`, `public/edgeone.json` | the application host's crawler and response boundary: crawling is deliberately allowed so crawlers can read noindex, the shell and the unknown-path document are noindex, and this file also owns the OAuth path rewrite and response headers |
| `scripts/reference-data/**` | deterministic classification/location generation and fail-closed evidence validation |
| `scripts/e2e/**`, `docker/e2e/**` | test-only exact-candidate release-E2E orchestration, deterministic closed-simulator backend profile, isolated environment, static server, preflight, diagnostics, and bounded continuation |
| `scripts/qualification/**`, `playwright.closure-download.config.ts`, `tests/browser/**` | test-only exact-commit scope-closure Next adapter and loopback browser contract accepted by the Worker provider aggregator |
| `playwright.config.ts`, `tests/e2e/i18n/**` | test-only semantic localization browser matrix, guarded production fixture ledger, and non-secret evidence reporter |
| `config/docs-capture/profile.v1.json` | source-bound product adapter facts consumed and validated by workspace-owned documentation capture tooling: runtime/readiness, login/identity, auth mutation allowlist, denial marker, and locator policy |
| `icons/**` | packaged app icons and release assets |
| other `docker/**` paths | self-hosted sync helpers and exact-revision, delete-aware mirrors; Edge function mirror provenance lives in `docker/volumes/functions/.source-revision.json` |
| `electron/**` | desktop packaging surface |

## Runtime Model

Use this default read path:

`route -> page/component -> service -> backend or static resource`

Rules:

- route and page components orchestrate
- process exchange creation initializes direction from its input/output entrypoint through ProForm `initialValues`, including reopening after a manual direction change. Exchange create/edit read the current complete form store when synchronizing reference selection and saving, so multilingual names are retained while dynamic `Form.List` fields register.
- service modules own app-side data access
- `src/utils/browserNavigation.ts` owns the thin `Location.assign`/`reload`/`replace` side-effect boundary. Runtime callers always pass the real `window.location`; tests pass an explicit mock `Location` or mock this module and must not redefine jsdom's global `window` or `location`
- Account Basic Information reads current profile metadata through `supabase.auth.getUser()` and writes `display_name` plus the optional, trimmed, 200-character `organization` string through `supabase.auth.updateUser()`. The page may refresh the session after a successful write, but organization remains descriptive profile data and must never control frontend access or backend authorization
- Account Connected Applications lists and revokes Supabase OAuth grants only. It contains no API-key history, password reauthentication form, Cognito provisioning action, or Cognito password/email synchronization helper; Supabase Auth is the sole account identity and credential owner
- Process and Flow ordered-dataset serializers normalize TIDAS year values to bounded integers and percentage values to canonical strings. Their create, update, and create-version service paths reject non-empty affected scalars that cannot be represented canonically before invoking persistence; unrelated invalid-draft behavior remains unchanged
- the startup system-status service treats `APP_RUNTIME_CONFIG_ENABLED` as a build-time emergency bypass: loading remains enabled by default, and only an explicit case-insensitive `false` returns the normal status without starting the Supabase RPC or its timeout
- UI copy changes must update every supported locale and the deterministic canonical-message audit; one message key owns one concept and one UI role
- a new locale may land reviewed leaf modules before activation, but it must not gain a top-level `src/locales/<locale>.ts` entry until manifest parity and the locale-specific review gate are complete
- language behavior is split across typed owners: `localeRegistry.ts` owns UI locale/adapters, `contentLanguageRegistry.ts` owns TIDAS/ILCD reading and authoring plus service-query resolution, `referenceResources/manifest.ts` owns classification/location availability and provenance, and `localeCapabilities.ts` is the derived joined view. The current canonical UI keys are `zh-CN`, `en-US`, `de-DE`, and `fr-FR`; business consumers and parameterized capability tests discover them from the registries. A fixed locale array may appear only in an explicitly labeled fail-closed product-contract test whose purpose is to force deliberate review when that snapshot changes
- app locale, content language, service-query language, and reference-resource language are separate boundaries. Content reading priorities, backend-query fallbacks, and reference-resource delivery states are declared independently; a native reference overlay exists only after its exact structure/evidence gate passes. Documentation, legal, and public-doc surfaces keep their separately disclosed fallbacks
- Process and Flow AI校验 keeps the existing `AISuggestion` diff/field-acceptance UI, while `src/services/general/aiSuggestion.ts` owns the asynchronous transport. It submits the current TIDAS JSON to authenticated Edge `ai_suggest`, polls the returned requester-scoped job with a bounded progressive interval, accepts only `ai.tidas_suggestion.result.v1` `complete`/`partial` results, and fails closed on malformed, failed, cancelled, blocked, aborted, or timed-out jobs. Next never reads `worker_jobs` directly and does not receive queue payloads, leases, diagnostics, or model credentials.
- anonymous SPA entry is limited to login/recovery plus `/oauth/consent`. The consent page is not anonymous product access: it accepts exactly one bounded RFC3986-unreserved opaque `authorization_id` without normalization, rejects delimiter/control/duplicate/oversized and dot-only path-segment input, verifies the current session through `getClaims()`, and preserves only a same-origin relative consent path across login before retrieving or deciding authorization. Root/Welcome, every other configured application route, case variants, and unmatched paths require the ordinary session guard. Authenticated unmatched paths may render the localized 404. Role gates defer missing-session decisions to that global redirect, then enforce their role only after a user exists. Localization route/view coverage records this access context but never broadens it
- query-, hash-, path-, loading-, empty-, error-, and retry-driven visible states belong to the locale catalog just like the default page view; pages and reusable components must not hide service failures behind a successful empty state
- LCIA result transport state and calculation-evidence trust state are separate: a failed or pending result query renders its own state and cannot be reinterpreted as missing or mismatched evidence; only a successfully returned numerical result enters the fail-closed evidence validator
- Contact, FlowProperty, Source, and UnitGroup keyword searches use `src/services/general/hybridSearch.ts` and their four allowlisted Hybrid Edge Functions. UUID-mention and empty-keyword list paths remain on their existing RPCs. The shared service forwards the current user JWT plus query/filter/paging and optional state/team context, returns Team Data as a genuine empty result when no team is selected, and preserves transport/auth/mapping failures as `success: false` instead of presenting them as empty data
- Process keyword searches use the indexed `search_processes` RPC and pass explicit escaped query terms without app-side field filtering. The `public_plus_owner_draft` calculation picker enables the database-owned actor-draft mode for its personal branch, requiring owner `state_code=0` rows regardless of team/review workflow metadata, then merges that result with public state-100 rows. Database migrations own the `search_text` lexical source and its PGroonga index
- Process list rows carry nullable `model_version` alongside `model_id`. LifecycleModel actions resolve the exact owner version as `model_version ?? process.version`; null remains the legacy same-version fallback, while an explicit version must never be replaced with the latest LifecycleModel revision. LifecycleModel result submodels are queried with each submodel reference's own Process version rather than the parent Model version
- LifecycleModel view and edit surfaces hydrate lightweight `json_tg.xflow` nodes from each referenced Process's exact ID and version through the shared compatibility normalizer. The editor calculates and validates against that hydrated graph, but save planning reconciles untouched compatibility and editor-only fields back to the stored graph representation; explicit graph edits remain persistent
- computed message IDs must belong to an exact enumerated family that either proves a closed-world producer or implements a localized runtime fallback before an unknown value is formatted; opaque backend diagnostics are not locale keys
- static bundles are read through consuming services, not directly by pages
- governed classification/location bundles are generated from `reference-resource-manifest.json`, one stable base per resource, and scoped language overlays; `generatedManifest.ts`, gzip assets, cache revisions, prewarm lists, coverage, and digests are derived outputs verified by `pnpm reference-data:check`
- cache monitors live near runtime setup, not inside feature pages
- documentation capture is an evidence adapter, not application runtime or semantic E2E: it uses a fresh browser context, never persists storage state, blocks non-auth mutations, and may write only below caller-declared documentation asset roots
- language options, labels, resolver priorities, service-query adapters, static resource files, and cache revisions are derived from their owning registry or manifest. `pnpm i18n:platform:audit` verifies exact registry joins and `pnpm i18n:hardcoding:audit` fails closed on unowned language literals outside a narrow, issue-owned adapter allowlist
- shared service code that can be loaded by Node smoke scripts must tolerate a missing initialized Umi runtime and fall back without crossing the `src/services/**` data boundary
- structured non-React content, such as the TIDAS import report descriptor, belongs in a typed pure module that consumes the registry's exact adapter topology; UI components render the descriptor instead of duplicating locale branches
- authenticated semantic localization E2E serves the candidate frontend on loopback with the existing `main` environment configuration. Direct development mode uses `pnpm start:main`; release mode exports a clean commit, builds and serves its static production bundle in the isolated container, and receives only a read-only tracked-main environment proof plus an optional protected users file and exact recovery-ledger mount. Credential-free qualification instead compiles the fixed `.invalid` profile and installs the semantic backend simulator for both candidate readiness and test contexts, so it never contacts tracked-main or production. The test-only Supabase boundary remains under `tests/e2e/**`, uses a supplied user session only for authenticated mode, and may touch only the exact UUID-scoped `codex-e2e` tuple recorded in its ignored ledger; shipped app-side data access remains in `src/services/**`

### Version-aware Process/Flow Hybrid Search

`src/services/general/hybridVersions.ts` validates the opt-in `versionScope: matched` acknowledgement and complete, unique `id/version` identities. Process/Flow services request `version_scope: matched` and `match_count: 200`; Process forwards its selected dataset type, while Flow forwards normalized type, input-direction, and classification filters. Public `tg`/`co` views preserve an optional institution `tid`; selected-team `te` views resolve the current user's team and return a genuine empty result before Edge invocation when no team is available. Next forwards these bounds but never decides membership or visibility. A missing acknowledgement, malformed identity, duplicate exact row, authentication failure or transport failure is not a successful empty search. A genuinely acknowledged empty page returns success with explicit paging/total metadata. Individual display-mapping failures preserve the validated exact key rather than dropping the whole page or substituting the latest version.

Main Process/Flow tables and their existing pickers retain version-qualified row/selection keys. Detail and reference actions keep the returned version; the client does not collapse rows by ID or rerank by the number of versions.

Edge owns rewrite -> normalized English `semantic_query_en` -> embedding. Database owns each bounded lexical/semantic recall, exact-version fusion/hydration and `tg/co/ex/my/te` visibility. Original multilingual full-text input remains intact; English vector input does not restrict authored full-text languages. Portal's separate state-100/200 allowlist must not be copied over Next's authorized personal/team scopes.

The self-hosted mirror remains generated from one exact canonical Edge tree and receipt. The single online-backend exception for this delivery is recorded in `supabase-branching.md` and workspace #963; normal environment selection and promotion policy are unchanged.

The companion self-hosted `data.sql` is a generated fresh-install artifact, not schema truth or an in-place upgrade. Its sync helper requires a reviewed Database commit and an isolated migration-only local rebuild, preserves all five application schemas plus queue metadata, and copies only constrained executor/extension grants, the Database-owned Auth synchronization trigger, OAuth pre-request configuration and allowlisted bootstrap catalogs. It never copies Auth users, OAuth registrations or business datasets. PostgreSQL 15 compatibility filtering removes only unsupported PG17 ACL syntax, not function bodies; the normal pinned Auth/Storage services still own managed-schema migrations. See `docker/README.md` for the source and restore procedure.

### National Carbon Organization Screen

The fifth screen uses the process-only v5 snapshot decoded and cached by `src/services/nationalCarbonDashboard/api.ts`. It has no dataset-scope switch and does not derive or request LifecycleModel metrics. Its four cards show registered units, organization-attributed published/reviewing processes, and platform review experts. The middle row contains a Top 10 unit chart, the full unit reporting table, and regional open-process distribution. The table slices the returned `organizations` array into ten-row client pages; page changes never trigger RPCs. Review-only and zero-data units remain in this table, not the Top 10 chart.

Region counts come from the database and include open processes without a unit. Names use the existing locale-aware location service; unknown codes remain visible, and a name-resource failure shows a diagnostic plus codes, not an empty dataset result. Global and unspecified locations have separate summary rows. The daily heatmap is labelled “每日数据动态” (Daily data activity) and consumes only `dailyActivity` / `dataset_version_activity_count`, with the existing square-cell layout. Database counts each retained Process version on its creation and latest-modification dates in Asia/Shanghai, once per version/day. The yearly total sums those version-days; it is not a count of unique versions or all edit operations. NULL dates contribute nothing, deletions remove counts, and later edits replace the previous modification date. The service rejects older creation-only snapshots rather than mislabelling them. Database-engine owns deduplication, state predicates, reviewer-role membership, and current-profile attribution.

### TIDAS Package Export Task Identity

`src/services/tidasPackage/taskCenter.ts` owns the authenticated user's local UI projection for TIDAS package exports. The backend `workerJobId` is the canonical execution identity and `jobId` is the canonical package-request identity. Queue responses, persisted local aliases, polling results, and Worker refreshes that share either identity must reconcile into one visible task, retain the earliest local presentation identity, and adopt authoritative backend timestamps and lifecycle state. Local submission time and localStorage aliases must never replace backend identity, revive a removed alias, or make an old completed package appear to be a new export.

### Data Product Closure Preflight And Task Feed

The closure-check and result-package command path is:

`src/pages/DataProcessing/index.tsx -> src/services/dataProducts/{resultSets,closure,api}.ts -> app_data_product_commands`

The task-center recovery path is:

`src/components/LcaTaskCenter/index.tsx -> src/services/dataProducts/taskCenter.ts -> app_data_product_commands:list_task_feed`

`ResultSet` is the durable user-facing workflow identity. Data Processing creates or selects it before new work begins, keeps `resultSetId` in the stable URL, and derives the visible completeness, calculation, publication, and next-action states from authoritative task/publication projections rather than persisting a second frontend lifecycle. The same context filters closure history, generated packages, preview choices, and publications. Task Center links carry `resultSetId` back to the same workbench so closing a tab never strands a running check or calculation. Existing closure/package links without a ResultSet remain readable during additive rollout, but new closure requests bind the selected ResultSet.

Next owns scope selection, command orchestration, curated closure-issue presentation, artifact-state presentation, task-summary rendering, inline Task Center closure-detail recovery, and ResultSet continuation navigation. Expanding a `lcia.scope_closure_check` task resolves its safe `closureCheckId` through `get_closure_check`, keeps lifecycle polling and artifact expiry client-bounded, and exposes only role-specific signed downloads allowed by the task capability projection; it does not decode raw worker or storage data. Next maps the backend's typed artifact states to explicit preparing, available, expired, failed, and unavailable UI states, keeps the bounded human XLSX action separate from the complete machine-result manifest action, and navigates directly to short-lived signed URLs without fetching or buffering artifact bytes. Requested LCIA methods cross the command boundary as the complete stable set of exact `{ id, version }` identities derived from the reviewed static catalog; `defaultImpactCategory` only chooses the initially displayed result and never narrows or invalidates that calculation scope. Next must not collapse methods to identifier-only strings or maintain a second calculation-profile identity. Result-package generation remains unavailable until the selected closure check reports `passed`, a `valid` certificate, a `complete` scan, and matching scope/policy evidence; the backend revalidates those facts when it accepts `create_build`.

The repo-owned qualification adapter runs this actual page from an exact clean detached commit with a loopback-only backend contract. It proves the established anonymous, standard-user, admin/owner, and Data Product Manager route boundary plus artifact lifecycle, metadata, direct-navigation, and localized 410 behavior. Its provider-owned record contributes only Next consumer assertions; root and Worker orchestration remain authoritative for cross-provider aggregation and release qualification.

The global task center consumes only the whitelisted `task-summary.v2` projection for `lcia.scope_closure_check` and `lcia_result.package_build`, including the safe ResultSet identity and server-curated continuation link. It must not decode raw worker rows, payloads, diagnostics, artifact locators, or infer domain validity from worker status. A closure execution failure is not an empty domain-issue result: the workbench renders the safe task-summary error, stable closure worker error code, and job identity in a separate failure state, and loads curated closure issues only after a `passed` or `blocked` completion. The Data Processing artifact projection similarly exposes only semantic role/format/filename, integrity, size, lifecycle/expiry, and signed-download metadata; it never exposes bucket or object paths. Database, Edge, and Worker remain authoritative for task state, closure evidence, artifacts, and authorization.

### Review Submission And Review Admin Quality Diagnostic

Process, Flow, Source, and Contact review submission use the same stable command boundary as the other dataset types:

`src/pages/Processes/Components/edit.tsx -> src/pages/Utils/review.tsx -> src/services/reviews/api.ts -> app_dataset_submit_review`

Before calling that command, the Process editor validates the current saved record for TIDAS SDK validity, at least one exchange, and exactly one quantitative reference. Process, Flow, Source, and Contact then recursively validate their existing reference chains through the same reference-access, rule-verification, and referenced-version checks. Any blocking reference-chain issue prevents submission and is shown through the review-specific validation surface. The submit action does not calculate the full matrix, inspect Worker jobs, or require completeness or numerical-stability evidence. Database remains authoritative for authentication, workflow state, target identity, idempotency, and transactional invariants.

Every dataset editor keeps its drawer mounted and visibly busy for the complete save, validation, and review-command transaction. The editor disables close actions while that transaction is pending, reloads the owning list and closes only after the review command succeeds, and remains open after validation or submission failure so the user can inspect and retry the draft.

Review Admin has a separate manual quality-diagnostic path:

`src/pages/Review/Components/ReviewQualityDiagnostic.tsx -> src/services/reviews/api.ts -> admin_review_quality_diagnostic`

The browser may start a diagnostic or read the latest/server-identified run, but it never chooses the dataset scope. Database and Worker evaluate one server-owned snapshot of pending reviews and return joint completeness and numerical-stability sections. Next renders the run state, scope counts, findings, and structured details as informational evidence. It never interprets `clear`, `findings`, `not_evaluable`, or runtime failure as permission to enable or disable assignment, approval, rejection, or any other review transition.

The diagnostic is visible only to `review-admin`, starts only after an explicit click, and may refresh an active run. It creates no frontend Batch entity, waiver, risk-acceptance action, browser checksum, or revision identity. Historical review-submit Gate/task-center readers remain compatibility surfaces for already-running or retained legacy jobs only; new Process submissions must not enqueue them.

### Unified Root And Reference Review

All seven dataset edit surfaces expose one `Submit Review` label and submit without completeness or numerical-stability Gate evidence. Process performs its current-record checks above, while Process, Flow, Source, and Contact perform the recursive reference-chain checks above. The browser never chooses Root versus Reference: Database resolves that from the exact target and current rejected-reference relations.

Review Management consumes the central v4 review projection with keyword search over the exact dataset version's existing search_text. Search/clear/repeat refreshes use ProTable parameters, reset selection and expansion, and reject stale responses; failures display the shared localized request error. Its top-level pagination contains every matching Root and Reference as an independent row; Database owns tab membership, display-mode and exact target-type filtering, ordering, total count, and bounded pagination over that flat set. Display mode selects model/process rows, all other types, or all rows; combining it with a data type uses intersection semantics. The UI resets to page one and clears incompatible type/selection state when a filter changes, and top-level pages default to 50 rows. Only Process and Lifecycle Model Root rows can expand, and their relationship child table remains unfiltered and renders current References matching the same tab. Readable rows retain their own actions, so a Reference does not depend on a parent Root being present in the current page.

Batch selection is one Root/Reference selection model. A top-level Reference can be selected directly. Selecting an expandable Process or Lifecycle Model Root loads and auto-selects its current-tab References, deduplicates a Reference shared by multiple Roots, preserves independently selected References, and disables submission while child loading is incomplete or failed. Selecting another Root type does not issue a child query. Removing a Root removes only the References that are no longer selected manually or through another Root. Simple Root and Reference reviews expose only approve/reject actions; Review Member approval has no opinion field and rejection requires a reason. Reviewer outcomes are advice, so the UI must not infer the Admin result from their votes.

Each readable Root or Reference row offers a view icon backed by the existing read-only Contact, Source, Unit Group, Flow Property, Flow, Process, or Lifecycle Model drawer. Rejection reasons remain in owner notifications and do not change dataset detail pages. Existing Contact `Sync to Open Data` behavior remains a separate entrypoint.

### Calculation Bundle And Release Readback

The persisted calculation read path is:

`src/pages/DataProcessing/CalculationBundlePanel.tsx -> src/services/lcaReleases/api.ts -> authenticated Edge projection -> signed Calculation Bundle artifacts`

The public release read path is:

`src/pages/DataProcessing/index.tsx -> src/components/LcaReleaseReadPanel/index.tsx -> src/services/lcaReleases/api.ts -> public current-release projection`

Next owns read orchestration, release dataset identity display, directional LCI/LCIA rendering, integrity checks before parsing preview shards or saving downloads, and fresh signed-download requests. The product download surface groups LCIA XLSX/CSV as result files, LCI Parquet/CSV as advanced data, and the manifest plus whole-bundle ZIP as audit evidence. Canonical `.ndjson.gz` shards remain available to the preview reader but are not enumerated as ordinary downloads. Verified downloads are saved through a local Blob instead of a cross-origin download anchor. The Calculation Bundle read requires the current user session. A public release projection may be anonymous only after Database and Edge expose it as the current published release. Next never approves or publishes a release, receives a service-role credential, or treats a private storage locator as public data.

## Current Hotspots

- lifecycle-model and calculation-adjacent UI: `src/services/lifeCycleModels/**`, `src/services/lca/**`, `src/services/lcaReleases/**`, `src/services/workerJobs/**`, `src/components/LcaReleaseReadPanel/**`, `src/components/LcaTaskCenter/**`, `src/pages/DataProcessing/CalculationBundlePanel.tsx`, `src/pages/Processes/Analysis/**`
- dataset validation, localized field guidance, and review jump targets: `src/pages/*/sdkValidation.ts`, `src/pages/Utils/validation/**`, `src/pages/Processes/sdkValidationUi.ts`, `src/pages/Processes/Components/**`, `src/components/ValidationIssueModal/index.tsx`, `src/components/LangTextItem/form.tsx`, `src/pages/Utils/review.tsx`
- review, team, and system-management flows: `src/pages/Review/**`, `src/pages/ManageSystem/**`, `src/pages/Teams/**`
- governed reference sources and outputs: `src/services/referenceResources/**`, `scripts/reference-data/**`, `public/classifications/**`, `public/locations/**`
- other cache-backed static resources: `public/lciamethods/**`, `public/maps/**`

## Cross-Repo Boundaries

- `database-engine` owns schema truth and Supabase branch governance
- `edge-functions` owns Edge runtime behavior, including the Review Admin `admin_review_quality_diagnostic` boundary and compatibility-only legacy review-submit routes
- `next-docs` owns public docs-site content
- `worker` owns the joint pending-review completeness and numerical-stability diagnostic internals and report production; its outcome does not control review workflow state
- `lca-workspace` owns root delivery completion after merge

## Common Misreads

- GitHub default branch `main` is not the daily trunk
- `docker/volumes/functions/**` is a generated exact-Edge-revision mirror, not a primary edit surface; refresh it only through the delete-aware helper and retain its source receipt
- app-side data access does not belong outside `src/services/**`
- a merged child PR does not finish workspace delivery
- this host is an authenticated application, not a public content site: the shell and the unknown-path document are noindex, and `public/robots.txt` keeps crawling allowed on purpose so crawlers can read that directive; public documentation and data entry points live on other hosts

The self-hosted snapshot tools keep the generated Edge tree and Database initializer paired. `docker/scripts/export-snapshot-bootstrap.sql` projects constrained roles and source ACL boundaries; `export-snapshot-queue-bootstrap.sql` recreates extension-owned empty queue storage and the Database-owned visibility fence after schema restoration. Runtime/backend semantics remain in their owning repositories.

## Example data catalog

`/exampledata` is an authenticated sibling of `/tgdata` and redirects to its Models page. Its parent route sets `hideInMenu: true` to hide the entire Example Data menu group while retaining direct access to every route and all existing functionality. Remove that flag to show the menu again. Both sections reuse the same seven dataset pages, columns, search, detail, version, copy, and export controls. `getDataSource` maps the new section to `ex`; version lists enforce `state_code=-1`, while database queries own list/search scope before pagination and latest-version selection. Switching scope remounts list tables so rows from the previous section cannot remain visible. Example originals expose the same read-only actions as open data; copies use the existing personal draft creation path. Portal and anonymous routes keep their existing boundaries.

All new TIDAS ZIP import helpers submit `root_closure_v2` asynchronously after signed upload. Import tasks use the Task Center's five-second `app_worker_jobs` list refresh and its bounded `result.importResult` projection as the primary result path. They have no per-import polling. A terminal historical row without that additive projection performs at most one `tidas_package_jobs` detail read per authenticated owner session and recovers only the bounded outcome, summary and artifact-availability metadata; repeated list refreshes do not fan out again. Full success is green, partial import is orange, and no-success, interrupted, unavailable-result or runtime failure is red. Worker owns completeness: when every record passes after exact review-field result filtering, whole-package import includes orphan records and allows zero roots; otherwise root-group fallback leaves isolated records unimported. Reused records count as covered, including all-existing packages. List errors retain the last backend state, and queued/running tasks remain in progress until a terminal result exists.

`ImportTidasPackage/ImportResult.tsx` presents one report-download icon beside the Task Center row's View icon, matching the export download action. A user click calls `tidas_package_jobs` to obtain a fresh signed URL, fetches the JSON import report, and downloads a browser-generated JSON with multilingual guidance, a file-grouped issue sample, truncation flags, and the untouched backend report. V1 and v2 reports retain their distinct import semantics; v2 issue, root, and skipped-record arrays may be bounded samples. The expanded Task Center detail retains file name, data scope, root count and the four execution stages. When a bounded import summary is available, it additionally shows total, newly imported, exact-existing skipped, not-imported, successful-root and blocked-root counts; partial outcomes add localized report guidance. The row retains phase/progress and diagnostics. Publication-time availability flags disable known absent reports but downloads revalidate live expiry/access. Unknown availability for historical tasks remains requestable.

TIDAS Task Center retains backend start, finish and update timestamps through list refresh and local recovery. Finished package duration uses start-to-finish time (legacy records fall back to created/update time); readback never stamps a new business update time. The combined LCA/package list orders by creation time and task ID. Overlapping list requests for one authenticated owner share a refresh. Running-to-terminal reconciliation persists the terminal state before dispatching `tidas-package-imported` and an optional enqueue callback once when newly inserted data exists, including data retained after interruption. Restored running imports use the same reconciliation; owner changes discard pending callbacks and late responses. Export polling remains unchanged.
