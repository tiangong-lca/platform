---
title: Platform Browser Support Contract
docType: contract
scope: repo
status: active
authoritative: true
owner: next
language: en
whenToUse:
  - when selecting supported browser versions or updating their frozen snapshot
  - when changing Umi, Babel, CSS, polyfill or minifier targets
  - when qualifying the shared web and Electron renderer bundle
whenToUpdate:
  - when the rolling support policy, exact version snapshot or qualification boundary changes
  - when a compiler consumer or browser compatibility data changes
checkPaths:
  - config/browserSupport.ts
  - config/plugins/babelTargets.ts
  - config/config.ts
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - tests/unit/config/protocolBabel.test.ts
  - docs/agents/browser-support-contract.md
lastReviewedAt: 2026-11-19
lastReviewedCommit: 16fe119589303764bc420c1abec74b24be9fac90
lastReviewedNote: 'Platform #1543 reviewed the Playwright and Jest source identities, pinned Node and Corepack image assembly, and browser gates on the Dev compiler toolchain delivered in #1542.'
related:
  - ../../AGENTS.md
  - repo-architecture.md
  - repo-validation.md
  - dependency-maintenance.md
---

# Browser support

`config/browserSupport.ts` is the machine-readable source for the reviewed date, next review date, browser inventory, exact test candidates, and compilation floors. This contract owns the policy and evidence boundaries. An inventory entry or source compatibility declaration is not a passing browser qualification receipt.

## Supported policy

At each review, select the last two stable Chrome and Edge major releases, the last two stable Firefox majors and latest patches of all Mozilla-maintained ESR branches, and the current and previous actually released Safari majors at their applicable latest patches. iPhone and iPad require the corresponding iOS/iPadOS versions, with actual device/OS/browser identity recorded. Review at least quarterly; pin the resolved snapshot in source instead of consulting a live release feed during a build. New snapshots use official vendor evidence and communicate retirements before adoption.

Firefox's legacy-OS ESR line is explicit. A native Linux execution can establish its engine behavior but cannot establish a supported Windows or macOS legacy-host pairing. The workspace's native CPU support contract does not authorize rejecting web clients by CPU architecture. Other browser shells and embedded WebViews require identified engine versions and reviewed capability evidence before a formal support claim.

Older clients may continue to work. Do not add a blanket user-agent gate or silently change features based only on an imprecise browser name. Required capabilities must retain their existing guarded behavior; transpiling JavaScript does not supply missing Web APIs, storage, transport or CSS behavior. Firefox ESR 115 does not supply native Ed25519. Current Platform downloads and report reading use SHA-256 and do not call the contained independent signature-verifier exports. Keep their runtime limitation explicit; unsupported independent verification is neither successful verification nor a reason to infer failure of an unrelated active workflow. If a future client starts using those exports, requalify its support floor and trust contract first.

## Shared artifact and compilation

Both web brands and the Electron renderer consume the same SPA configuration. Preserve the existing Electron version and project its embedded Chromium into the shared Chrome compilation floor when it is older than the web support floor. This conservative floor does not enlarge the formal web support promise. Apple OS patch identities and browser data compatibility buckets are distinct; the iOS target may conservatively include an earlier WebKit bucket where the dataset has coarser version granularity.

`config/config.ts` supplies the derived engine map to Umi. The registered local `babelTargets` plugin forwards the effective map through `modifyBabelPresetOpts` into the existing nested `presetEnv.targets`, preserving all other preset options. It rejects conflicting targets or forced legacy transforms. Umi's source/TS/extra Babel loaders must consume this hook in development and production; top-level loader targets alone are insufficient proof. The separate normal MFSU development dependency build omits that Umi hook, so its supported `mfsu.chainWebpack` callback forwards the same map into the existing Umi preset tuples of its three Babel rules, preserving their identities, other options and cache policy. Qualify that fallback against actual installed MFSU configuration, not a reconstructed main-app rule. No filename exception is required when the effective targets already omit the broad function-name transform. Vendored protocol sources, declarations, licenses and manifests remain immutable inputs.

Umi's generated polyfill feature and PostCSS derive their targets from the same reviewed map. Pin and qualify the browser-data packages actually loaded by those consumers; empty or newer-only expansion of a supported floor is a defect, not an implicit policy change. The JS/CSS esbuild minifiers receive an explicit derived browser list including iOS while retaining Umi's existing conservative `es2015` emit floor. Keep JavaScript syntax transforms, polyfills, CSS compatibility and minifier behavior separately observable. Cache flags and the existing publisher are outside this change.

The standalone report renderer has its own packaging contract. A passing raw renderer build does not prove SPA compilation, and an SPA test does not replace offline report qualification. Existing Electron/native platform release requirements remain in force.

## Required evidence

The validation guide owns command selection and existing aggregate/release gates. Installed-toolchain tests must check actual effective Babel plugin selection and nested targets, real Umi loader construction in both modes, generated polyfill imports, Browserslist/PostCSS floor expansion, explicit minifier inputs and the Electron mapping. When retiring an exception, compare the exact six contained modules and unrelated controls with and without it under the final target policy, including raw source maps.

For source/target/dependency adoption, preserve source-bound baseline/candidate data for both brands, ordered module/plugin settings, generated polyfills, complete raw artifact inventories and explained deltas. Candidate repeat and ordinary-production outputs must match exactly; baseline output equality is not expected after a global target change. Use the existing canonical semantic qualification and scoped brand/Study/report checks rather than treating the timing or a tiny compiler fixture as semantic proof.

Actual floor/current browser runs must bind official binary/version provenance, the served candidate bytes, harness identity, scenarios and failures. Patched Playwright Firefox/WebKit and mobile viewport emulation are complementary tests; they do not prove vendor Firefox, branded Safari or an actual iPhone/iPad. A different Safari major or mobile simulator patch cannot be silently substituted for the promised minimum. Record every unavailable device/platform pair explicitly and obtain the necessary resources or an explicit scope decision before claiming complete policy qualification.

For a later targets-only refresh on the same Umi version, stop the dev server, run `pnpm exec max mfsu remove`, then restart normally. Umi's federation snapshot key does not include imported targets, so restarting alone can reuse the preceding dependency output. The supported command removes the current MFSU cache snapshot without changing cache policy or requiring a broad node_modules/cache deletion. The Umi version change in this adoption independently invalidates its prior snapshot.

The delivery Issue owns the current acceptance matrix and evidence links. No unrun browser, live backend behavior, scientific result, old-host support or production permission may be inferred from configuration or a passing subset. The approved policy is not permission to enable Babel caching or change the publishing path.
