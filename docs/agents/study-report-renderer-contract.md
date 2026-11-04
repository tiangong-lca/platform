---
title: Study report renderer contract
docType: contract
scope: repo
status: active
authoritative: true
owner: next
language: en
whenToUse:
  - implementing or consuming the independently packed Study report view
whenToUpdate:
  - view schema, renderer resources, package or consumer proof changes
checkPaths:
  - src/standalone/studyReport/**
  - scripts/study-report/**
  - tests/unit/standalone/**
  - tests/fixtures/study-report/**
  - .github/workflows/build.yml
  - .github/workflows/study-report.yml
  - tests/unit/config/studyReportWorkflow.test.ts
lastReviewedAt: '2026-11-04'
lastReviewedCommit: 'd8be42ff848d5f45de70fb20aa545ed526f90b40'
lastReviewedNote: 'Platform #1437: reviewed view.v2/renderer2.0.0 independent null/coverage semantics, exact supplied reasonCodes and non-LCIA evidence, strict current exports and explicit unchanged1.0/view.v1 preview; actual P4 producer/consumer qualification remains separate. Existing gates, ownership and release authority are unchanged.'
related:
  - repo-architecture.md
  - repo-validation.md
---

# Study report renderer v1

`src/standalone/studyReport/viewModel.ts` owns current strict `lca.study-report-view.v2` and renderer `2.0.0`, with explicit retained `view.v1` / renderer1.0.0 online-preview compatibility. This view protocol owns presentation only. Edge W09 owns authorized projections and detached export receipts; Worker owns numerical facts; CLI owns independently trusted verification and installed delivery. P1 request shapes and this fixture implementation do not enable report export.

## Input and numerical limits

Every field is required; extra keys fail. The view carries exact report, Study, Run, method and fact provenance; plain text; supplied table/chart selections; sources, assumptions, cutoffs, limitations and historical validity/review state. `methodRef:null` is valid for non-LCIA facts, including supplied inventory/activity quantities and parameter assignments, with their supplied unit. Evidence says only "No LCIA method" and never infers a fact kind. The producer supplies exact parameter/evaluation/statistic labels, algorithm/settings evidence, undefined reasons and limitations in the existing typed text fields. `runs` contains actual Run provenance; an analysis-local evaluation identity belongs in its supplied context, never an invented Run. A method reference identifies category provenance; a relative delta can retain that reference with dimensionless unit `1`. Worker and the Edge claim verifier own quantity semantics. A chart requires one method identity (including null) and one unit, but its selection does not establish scientific comparability. No ranking, delta, aggregation, conversion, solver or authorization decision is computed here.

The view is bounded to 2,000,000 UTF-8 bytes, 32 Runs/methods/sections/tables/charts, 2,048 facts, 2,048 citations, 512 cutoffs, 128 assumptions and 64 chart facts. See the executable validator for individual text/reference bounds. Text is escaped data: angle brackets and URL-like strings are preserved as literal text, without creating elements, executable code or navigable URLs. Control characters and byte/field bounds still fail; unknown fields remain rejected. Accepted long tokens wrap inside the page, grid and chart tracks; tables scroll inside their bounded region.

`canonicalValue` is a string or null. Numeric strings are at most 64 characters, with the canonical decimal/exponent spelling agreed with the Worker facts producer: zero is `0`, no plus/leading zeros/trailing fractional zeros, lowercase `e`, nonzero exponent with absolute value at most 324. This is a spelling check, not numerical recomputation or another content hash protocol. The exact string is displayed without a Number round-trip. View.v2 separates numeric availability from characterization coverage: null is displayed as "No numeric value" and may retain complete, partial or unknown coverage; a numeric value with unknown coverage still fails. Every v2 fact requires `reasonCodes:string[]` (empty when no reason), bounded to32 nonempty strings of at most128 characters under the existing text/control rules. Exact supplied codes are visibly displayed separately from coverage, without interpreting, translating, deriving or recomputing them. The producer/claim verifier owns their fidelity. Retained view.v1 still requires null if and only if coverage is unknown and its preview shows "Unknown". Partial values are labeled characterized subtotals. A Number conversion is used only for SVG geometry; nonfinite, underflowed or subpixel values show explicit not-plottable text while preserving the original supplied value.

Timestamp validation checks the declared local calendar/time and numeric offset independently, preserving the original fractional precision and offset string. It does not compare an offset-local wall clock with UTC or reserialize signed input.

## Rendering and trust

`renderReport(view, context): Promise<string>` uses portable Web standards only, including Web Crypto for fixed CSP resource hashes. It reads no clock, random source, filesystem, environment, credentials or network. All dates are supplied. `renderReportBody` retains export framing and requires a real RenderContext. The internal `content.ts` module shares only validated semantic content/table/chart/escaping presentation with Platform’s separate online preview; it is not a new public renderer API. The preview has no export identity, receipt or exporter-verification claim. Renderer2.0.0 is a new artifact and versioned export identity; independently pinned renderer1.0.0 P2/P3 artifacts and their frozen HTML remain unchanged. The default validator and both export entrypoints require the current renderer version. The validator can explicitly select `1.0.0` only for retained presentation compatibility; Platform online preview dispatches the exact recorded version without mutating the projection. This does not let renderer2.0.0 export a1.0.0 projection or claim the old artifact identity. Controls only filter/reorder already supplied facts and expand evidence. Any facts absent from the supplied tables appear in an implicit additional-facts table, derived only from the already approved view projection. This does not mutate the 32-entry user table array or add numerical claims. Supplied and implicit table DOM IDs use disjoint namespaces.

W10's renderer copy is English. Its document `lang` and `dir` come from the shared typed locale registry's English entry, generated into the portable `documentLanguage.ts` module by `pnpm study-report:language:write`. The package build rejects stale generated metadata. Host/browser language never changes this fixed-copy renderer's document language, and the standalone artifact imports no application locale runtime. Additional report languages require a separately reviewed view/copy contract.

RenderContext is separate from hashed projection bytes: exact `exportId`, `projectionHash`, and historical `verificationAtGeneration`. It contains no report HTML hash or recursive resource aggregate. Historical exporter verification text never authenticates the file or grants current access. No public key, signature or embedded trust flag is accepted. Every file explains that its detached receipt must be checked by an independently trusted CLI/official viewer, that later withdrawals are unavailable offline, and that downloads cannot be recalled. W09 must render the same exact artifact and sign a detached manifest covering actual `report.html`, `projection.json` and fixed renderer resources. CLI verifies those exact bytes or reproduces and compares them; authenticating only hidden projection bytes is insufficient.

HTML is self-contained, with no automatic requests, remote fonts/images, scripts, service workers, dynamic imports, shell bridge or persistent actions. CSP allows only the exact inline stylesheet/runtime hashes. Citations display typed identity, version and permitted digest, never raw source payload or a downloadable locator.

## Artifact and release

`pnpm study-report:build` emits the current `study-report-renderer-2.0.0.tgz` and `dist-study-report/package`, an independent dependency-free ESM/types/static-resource package, its file size/SHA-256 manifest, deterministic ustar/gzip archive and detached archive digest receipt. Manifest files exclude the manifest itself; the detached archive receipt binds it. Source commit, dirty state and source digest are explicit. `--release` rejects a dirty checkout. A checksum/local build alone does not establish release provenance.

The canonical Build/release workflow builds from its exact qualified source and preserves the archive/manifest as a bounded Actions artifact. It neither npm publishes this private application nor attaches a public release asset. Public distribution still requires an owner-approved immutable release attachment and CLI pinning of independently obtained source/archive/manifest identities. CLI bundles those qualified bytes, without sibling source imports or runtime code download. Real W09/installed-CLI acceptance remains required; fixture package proof must never be reported as completed P2 delivery.

The dedicated `study-report.yml` PR workflow qualifies relevant renderer, package, fixture, locale-registry and dependency inputs for Dev/Main. It checks out the exact PR head with read-only permissions, installs the existing frozen dependency graph, builds in clean release mode, runs focused protocol/workflow and independent-package tests, and executes the packed-HTML Chromium suite. Before upload, it verifies actual archive/manifest bytes and binds the browser proof to the same clean source, source digest and artifact hashes. The seven-day artifact contains only that package/manifest/receipt and synthetic browser proof. This workflow grants no deployment, publication or production-operation authority and leaves the existing full pre-push and release gates intact.

## Proof

- `pnpm test:ci --runInBand --runTestsByPath tests/unit/standalone/studyReport.test.ts` checks strict schema, precision, escaping, historical state and deterministic HTML.
- `pnpm study-report:test:package` checks reproducible archives, complete file identities and an actual independent Node consumer outside the source directory.
- `pnpm study-report:test:browser` opens actual packed HTML in fresh online/offline desktop/mobile Chromium contexts, including supplied parameter amounts, statistic units, undefined-value reasons and exact current renderer framing. It observes request/API attempts, CSP violations, sockets and service workers, and exercises keyboard filter/order, disclosure, horizontal-table containment, maximal accepted unbroken tokens, literal script/image/URL text, 32 supplied tables plus remaining facts, and exact values. Proof/screenshots remain ignored under `.local/study-report`; this test is separate from routine pre-push, production browser tests and release qualification.

Package proof joins the normal pre-push gate; the existing application gates and localization contracts remain unchanged. No new dependency is introduced.
