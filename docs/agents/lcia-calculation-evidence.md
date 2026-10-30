---
title: LCIA Method Bundle and Calculation Evidence Contract
docType: contract
scope: repo
status: active
authoritative: true
owner: next
language: en
whenToUse:
  - when changing the frontend LCIA method cache or calculation
  - when consuming Worker LCIA calculation evidence
  - when changing private-draft LCA analysis scope
whenToUpdate:
  - when the static LCIA bundle changes
  - when Worker calculation evidence schemas change
  - when LCIA gap semantics or publication gates change
checkPaths:
  - public/lciamethods/cache_manifest.json
  - scripts/validate-lcia-cache.cjs
  - src/services/lciaMethods/**
  - src/components/LCIACacheMonitor/**
  - src/pages/Processes/Components/lcaCalculationEvidenceNotice.tsx
  - src/services/lca/**
  - src/services/lcaReleases/**
  - src/pages/DataProcessing/CalculationBundlePanel.tsx
  - src/components/LcaReleaseReadPanel/**
  - src/services/processes/api.ts
  - .github/workflows/ci.yml
  - .github/workflows/build.yml
lastReviewedAt: 2026-10-30
lastReviewedCommit: 1c3851aedd44e795cffc84b852fa2f5a55ce38e2
lastReviewedNote: 'Platform #1378: reviewed authenticated exact-version published HDF5 query consumption, frozen metadata, bounded preparation/cursors, source-switch cancellation and pinned release downloads. Existing locale, coverage, backend authority and promotion gates remain applicable; runtime proof is recorded in the task.'
---

# LCIA Method Bundle and Calculation Evidence Contract

## Reviewed static bundle

The frontend and Worker share one immutable LCIA bundle. Its relative manifest path is `lciamethods/cache_manifest.json`; the client cannot choose another path or base URL. The current manifest uses `lcia.static_cache_bundle.v1`, bundle version `1.2.4`, and contains exactly 25 method identities.

Run `pnpm lcia-cache:generate` only when intentionally regenerating the reviewed manifest. Run `pnpm lcia-cache:verify` for normal validation. Both commands execute `scripts/validate-lcia-cache.cjs` with a 512 MiB V8 heap cap. Validation recomputes the exact list, factor, method, identity, source-snapshot, and raw-manifest hashes and checks the frontend's pinned raw-manifest hash. CI, the local pre-push gate, and the release gate run verification before any web or Electron publication.

The bundle has one verified identity alias:

- canonical method ID: `503699e0-eca9-4089-8bf8-e0f49c93e578`
- artifact locator ID: `9ec743ea-6b00-400d-a53b-61547a3fc03c`
- version: `01.01.000`

Calculations and evidence use the canonical method ID. Artifact URLs use the locator ID. Do not rewrite one into the other without the manifest alias evidence. UI selectors and `public_plus_owner_draft` Worker v2 requests use canonical IDs; legacy `current_user`, `all_data`, and `open_data` or published-result requests translate canonical IDs back to artifact locator IDs. Metadata readers accept either identity and normalize rendered result references to canonical IDs while preserving locator-based filenames and URIs.

## Browser cache trust

`list.json` and `flow_factors.json.gz` are read as raw bytes. Byte size and SHA-256 must match the reviewed manifest before parsing or writing to IndexedDB. A cached entry with a missing or different digest is evicted and downloaded once. If the replacement does not match, the calculation fails closed and no numeric result is trusted. Browser-cache metadata has its own schema version and is not the LCIA bundle version.

## Calculation semantics

Coverage is counted per exchange × LCIA method using the key dimensions `method_id`, `method_version`, `flow_uuid`, exact Flow version, and `direction`. The existing evidence matrix retains its compatibility shape.

- The calculation amount is `meanAmount`; `resultingAmount` is retained only as evidence.
- A missing factor is incomplete coverage, never an implicit zero.
- An explicit finite zero factor remains a valid numeric result.
- Nonregional calculation selects exactly one source default per exact method/Flow version/direction. `public/lciamethods/nonregional_defaults.json` is the byte-identical prepared mapping from Worker #344 (`d5ed7b76d96aa6640371fdba12076e129240e01f11e360d374b65fb89f9c3373`), bound to this immutable bundle and Data commit `367642d7994e0e75188e7e241fb2a4b85ffff62f`. Worker owns its XML verification/generator. Regional alternatives are never added together; unexplained duplicate families fail source integrity.
- Exchange location is optional and does not select regional factors in this nonregional profile. Missing exact-version factors do not clear other method totals or block calculation. Source quality and scientific eligibility remain separate concerns.
- Non-finite exchange amounts and factors are invalid evidence.
- A list/factor hash mismatch, unknown method identity, or unavailable SHA-256 implementation returns no trusted numeric result.

Frontend-generated evidence is stored in `LCIAResults/common:other` under the TianGong LCIA evidence extension. The process ordered/unordered transformations must preserve this field.

## Worker evidence v2

Only `lca.calculation_evidence.v2` can establish service-result completeness. Its `lcia_method_factor_source` must be `lca.method_factor_source.snapshot.v2` and must match the pinned bundle path, raw manifest hash, bundle version, source snapshot, method manifest, method identity manifest, factor manifest, and method count.

`lcia_factor_coverage` is the single embedded truth source and uses `lcia.method_factor_coverage.matrix.v1`. It must include source, method, factor, and method-identity hashes; `count_unit=exchange_method_pair`; the four key dimensions; global counts; exactly one unique row for each of the 25 reviewed method identities; the same non-empty exchange observation count in every method row; and an evidence artifact when any pair is unmatched, invalid, or unsupported. Every count and derived aggregate must be a non-negative JavaScript safe integer. Global counts must equal the sum of method rows, and the global pair total must equal the per-method pair total times 25. A parallel coverage matrix, a missing identity hash, or any mismatch fails closed. Version 1 evidence remains displayable as legacy evidence but can never be labeled complete.

Frontend inline gap evidence uses `lcia-uncharacterized-jsonl:v1`; Worker v2 evidence must use the external artifact format `lcia-uncharacterized-jsonl:v2`. Raw Worker/S3 artifact URLs are not trusted browser download links. Until Edge provides an authenticated or signed projection, the UI hides the production URL, shows immutable artifact hash/count, and permits downloading the evidence JSON. Explicit development loopback URLs may remain clickable. The UI retains localized failure and source-mismatch notices, but does not render an incomplete-coverage banner, gap counter, or replacement warning. Exchange × method gaps describe characterization coverage and are retained as evidence; their presence alone is not a calculation exception. This display rule does not alter evidence validation, numeric handling, or the backend coverage status.

Result-query state is not evidence state. A pending or failed Edge query shows only its calculation/query status and must not substitute absent response evidence with static Process evidence or label the transport failure as method-source drift. After a numerical service response succeeds, the returned calculation evidence is still mandatory and is validated fail closed; a successful response without valid evidence remains a genuine trust failure.

## Private-draft analysis scope

`public_plus_owner_draft` means exactly:

- all `state_code=100` process rows; plus
- all authenticated-owner `state_code=0` rows, regardless of `team_id` or `review_id` workflow metadata.

Both normal listing and keyword search use that exact predicate. Ownership is determined by `user_id`; `team_id` and `review_id` describe collaboration workflow and do not revoke an owner's readable draft from calculation scope. This scope is separate from LCIA method provenance: access to a private process or FP/UG does not publish it and does not make an LCIA factor canonical.

## Persisted Calculation Bundle And Release Readback

`tiangong.calculation-bundle.v1/v2` is the private, package-level read model for Worker-produced LCI, LCIA, coverage, and calculation evidence. Data Processing loads it by package identity through the authenticated user session. It does not reconstruct complete LCI or LCIA files in the browser. Process-axis and fixed process-range artifacts select the exact records to display; parsed preview artifacts must match their declared byte size and SHA-256 before their NDJSON is trusted. Oversized chunks are not parsed inline.

Product downloads use the same integrity boundary: each click resolves a fresh authenticated bundle projection, requires its role, media type, stored byte size, and SHA-256 to match the displayed immutable metadata, fetches the short-lived signed URL without credentials, and only then exposes a local Blob for saving. Legacy downloads retain LCIA XLSX/CSV, LCI Parquet/CSV, the manifest, and the old audit ZIP; it does not list every canonical shard. A `401`, `403`, `404`, or `410` object response refreshes the projection once and retries; other network, size, or digest failures create no local file. The UI must not rely on cross-origin `<a download>` behavior, because browsers may navigate to the signed object instead of downloading it, and keeps a failed action visible for manual secure-link refresh.

Published release readback is a separate sanitized projection. It becomes anonymously readable only when Database marks one release current and Edge exposes its release, validation, artifact, and source-Process identity projection. A source Process maps to the exact Unit Process plus generated LifecycleModel and Result Process UUID/version identities. The Unit Process package remains result-free; the Model/Result package carries the LCI exchanges and LCIA results without changing TIDAS schema.

Next is never a publication authority. It cannot approve, publish, supersede, or repair a release, receives no service-role credential, and does not receive private storage object locators. Each download action requests a fresh short-lived URL; visible artifact byte size, SHA-256, profile, and format remain the immutable evidence used for readback and independent verification.

## FP/UG release handoff

Keeping BAFU flow properties and unit groups private is compatible with this contract. A later publication review must name exact FP/UG IDs and versions, the reviewed bundle manifest hash, method source evidence, conversion decisions, and affected method coverage. Factor presence alone is not evidence that an FP/UG is suitable for public release.

New Calculation Bundles are ready independently of optional export jobs. The export panel defaults to Parquet and only an explicit Generate action enqueues. Status polling continues only for queued/running/waiting/stale work; terminal states and read failures stop polling. Refresh reads status without retrying. CSV is independently gzipped and bounded per file (250,000 rows, 64 MiB serialized CSV); audit files reuse canonical evidence. Pages contain at most 20 member links plus an export manifest. Each download refreshes authorization and rechecks the same Worker job, package, Bundle hash, source manifest hash and file hash/size/media type before saving verified bytes. Package/format changes discard stale in-flight responses.

Data Processing opens process results from the result list using an exact process ID and version, with LCIA shown first. A requested version absent from the bundle never falls back to another process. Method labels and units come from the reviewed exact-version catalog and alias mapping. Process and flow names use the existing authenticated-readable dataset service with explicit versions, a panel-scoped bounded cache, and at most six concurrent reads per batch. LCI metadata is limited to the visible 25-row page plus the reference flow. Missing names retain exact identifiers and allow retry without changing result values; the displayed dataset reference quantity is not a new normalization of those values. Technical hashes and diagnostics remain in collapsed evidence panels. Closure status translations and the new-calculation affordance preserve existing execution gating.

## Published numerical artifact view

The original Process published-results tab consumes the exact release-bound query envelope. Its units, names, method versions and reference quantity come from frozen artifact metadata, never the current static method catalog. It does not reinterpret the persisted numeric evidence as a new calculation input. LCIA zero, negative and small finite values remain numeric; sparse LCI omits exact zero without conflating filtering/pagination with scientific absence.
