---
title: Study workbench consumer contract
docType: contract
scope: repo
status: active
authoritative: true
owner: next
language: en
whenToUse:
  - implementing authenticated Study, exact report review, or named recipient routes
whenToUpdate:
  - Study route, codec, identity, lightweight editing, or report presentation boundaries change
checkPaths:
  - src/pages/Study/**
  - src/services/study/**
  - vendor/study-contract/**
  - config/routes.ts
  - tests/unit/pages/Study/**
  - tests/unit/services/study/**
lastReviewedAt: '2026-11-04'
lastReviewedCommit: 'd8be42ff848d5f45de70fb20aa545ed526f90b40'
lastReviewedNote: 'Platform #1437: reviewed view.v2/renderer2.0.0 independent null/coverage semantics, exact supplied reasonCodes and non-LCIA evidence, strict current exports and explicit unchanged1.0/view.v1 preview; actual P4 producer/consumer qualification remains separate. Existing gates, ownership and release authority are unchanged.'
related:
  - repo-architecture.md
  - repo-validation.md
  - study-report-renderer-contract.md
---

# Study workbench

Platform owns authenticated `/studies`, `/study-report?id=<reportRevisionId>&hash=<contentHash>` and `/study-share?id=<shareId>`. Existing AuthGuard, application admission, Supabase session and layout remain authoritative. `/studies?id=<studyId>&view=<overview|model|results|reports>` uses the shared finite route-view registry. A reviewer can open an exact report independently of core Study access; a named share performs only resource-action, projection and download calls for that share.

## Service and ownership boundary

All API calls stay in `src/services/study`. The service invokes `app_lca_study`, snapshots the admitted identity generation, captures the current bearer session and discards responses after admission, actor or captured-bearer changes, including a switch away and back to the original actor. Mounted views also invalidate synchronously on bearer changes, including same-actor client switches; the auth callback performs no asynchronous work. A concurrent token refresh can therefore require a fresh read. No authentication credential is persisted by this feature. Pending mutation bodies are held only in the bounded same-tab journal described below. Exact contained Edge V2, V3 and V4 public codecs live in `vendor/study-contract`; their unchanged manifests and licenses record producer identity. The adjacent Platform `.d.mts` adapters only resolve the original declarations. Tests verify artifact provenance separately from application code coverage. Vendored artifacts are protocol inputs, not a second editable schema.

Each request and response passes the owning codec's strict parser and operation-specific bindings. Frozen JSON artifacts additionally require exact byte size and SHA-256 before decoding. Narrow presentation guards read only the supplied model/fact fields; the browser does not recreate model fingerprints, calculation contracts, numerical analysis, review policy or authorization. Legacy solve, comparison, hotspot and latest-dataset services are not Study sources.

## Views and editing

Overview reads the selected frozen StudyRevision's goal, functional unit, boundary and exact source identities. Model/evidence reads a selected preparation's `inputArtifactRef` and shows its frozen instances, exchanges, connections, cutoffs, source documents and quality findings. The process display is bounded to 64 instances; full supplied exchanges remain in the paged table. Results show exact Worker-provided canonical values, units, coverage, provenance and comparability. Null remains unknown; partial coverage is a characterized subtotal. Supplied facts never become a browser-computed ranking.

Lightweight editing is restricted to eligible non-reference exchange amounts. A frozen predecessor must belong to the displayed preparation. Current V2 capabilities and V4 `corePermissions.write` gate the workflow; each actual operation is still reauthorized by the server. Creating a new ScenarioRevision copies the predecessor overrides and replaces only the selected amount override. Preparation uses the exact new scenario revision/hash, then successful preparation permits freeze with expected revision/hash and submission of a Run with its exact input hash and calculation-contract reference. Frozen predecessors are not saved or changed. Unsupported reference, parameter or provider editing has no control.

Writes persist the exact parsed request/schema/request ID/idempotency key before dispatch in an actor/client/origin/workflow-bound `sessionStorage` journal. Verified current `getClaims()` identity and the existing admission generation bind both dispatch and explicit recovery. Recovery captures actor, OAuth client, bearer and admission generation before reading the journal and retains that exact identity through dispatch; asynchronous journal/claims work cannot rebind the original payload or key to a replacement session. A synchronous Auth listener invalidates a switch away and back, and every temporary listener is released. One unresolved request blocks that workflow/resource, not unrelated Studies. UI scenario/preparation/freeze/Run stages all pass the same `study:<id>` context. No credential, automatic replay or background job queue is stored. A same-tab reload offers explicit recovery of the exact original request; server state, receipts, retention and current rights remain authoritative. The workbench retains the recovered request/result for the admitted Study mount, including recovery from its header. Reselecting the original frozen preparation and non-reference exchange restores the exact predecessor, amount, new scenario and preparation only after matching original overrides, source revision/hash, profile and contract; fresh reads use recovered IDs, never a latest resource. Preparation/freeze recovery permits the next explicit stage without replaying a completed stage or inventing a key. A foreign selection or changed source fails closed; identity/Study changes discard this ephemeral handoff.

The journal allows at most eight current/retired records and 256 KiB per current record. Its schema, checksum, operation metadata, identity, origin, workflow and known resource bindings are validated before any recovery POST. Corrupt, unsupported and impossible-future records fail closed and remain inspectable; elapsed client time never expires a valid intent or mints a new key. Session storage and its checksum detect accidental corruption within browser-owner trust; they do not authenticate a malicious browser owner or same-origin script. The journal lasts only for that browser tab's session and is not cross-device durable state.

Persisted `dispatching` marks crash/reload uncertainty. Transport failures, timeouts, invalid responses, 5xx and earlier unfinished dispatches set sticky `everAmbiguous`. A later FORBIDDEN/conflict does not prove an earlier attempt uncommitted. A validated success for the exact request clears the pending record. Only a never-ambiguous, validated nonretryable rejection offers explicit local retirement: the current target is read again under the same identity, and the original request/key/audit identity is retained in a retired record before a fresh intent is allowed. Retirement is not server cancellation, undo or a claim of no server effect. Identity changes hide other actors'/clients' records and clear visible response state.

## Reports, review and shares

Report controls use V4 resource actions and current report state. Comments bind revision/content hash; decisions bind the exact predecessor review and declare internal review, with no independent-certification claim. The UI disables author self-approval and the server enforces the policy. Explicit OAuth client delegation binds one decision, predecessor, content and expiry; the browser does not invent human approval or consume delegation as a direct actor.

Finalization sends the exact revision, content hash, review-state hash, profile and accepted review IDs from current state. Exports bind current finalization/review state. Named sharing binds one exact report/export, registered recipient identity, summary disclosure policy and expiry. Roles offered for membership come only from `allowedMemberRoles`; there is no user discovery or roster endpoint. Every mutation remains subject to server authorization and CAS.

The report projection and its recorded validity/review snapshot are displayed separately from current online state. Platform's private preview entrypoint shares the validated content/table/chart/escaping implementation with the standalone renderer, but supplies honest online framing without an export ID, receipt or verification claim. The portable export API uses its exact artifact version. Online preview explicitly dispatches retained1.0.0 and current2.0.0 recorded projections without changing their version or bytes. Renderer2.0.0 exports reject1.0.0 projections; independently pinned P2/P3 packages and historical exports are not repinned or regenerated for preview. The fixed English report reading language remains governed by the renderer contract; app controls use every active locale catalog.

Named recipients receive only `share.view` and `share.download` projections. They are not given core Study tabs, model/facts reads, source membership or an anonymous URL. Download reauthorizes and checks exact bundle size/hash before creating a temporary download of the persisted `lca.study-export-bundle.v2` JSON bytes. It preserves the reference's `application/json` media type and uses a `.json` filename. The captured actor/client/bearer/admission identity is reverified after asynchronous SHA-256 and immediately before the DOM click; stale identity prevents the effect. Temporary object URLs are released even when browser dispatch fails. This integrity check is not represented as independently trusted receipt verification. Revocation/expiry governs subsequent online access and cannot recall downloaded copies.

## Required proof

Focused service/component tests cover exact codec/version binding, permission denial, original-key retry, journal/claims/digest identity races, exact JSON bundle media/filename, header/card recovery handoff and next-stage continuity, CAS/predecessor identity, immutable editing, null/partial facts, isolated report/share paths and account-switch stale replies. The retained renderer1.0.0 projection fixture and old artifact pins remain unchanged. Current renderer2.0.0 export identity, strict old-version rejection and old/current online preview compatibility require explicit proof. Keep full existing test/coverage, build, Docpact and all-active-locale gates.

Controlled component/HTTP fixtures are development proof only. Delivery additionally requires the installed CLI and actual authenticated owned non-production Edge/Database/Worker stack to demonstrate the same durable identities, independently expected amount-change result, unchanged predecessors, review/finalization transitions, named-recipient denial/revoke/expiry, keyboard/narrow/long-table/bounded-model layouts and failure/recovery. Production operations or runtime enablement are not authorized by this contract.
