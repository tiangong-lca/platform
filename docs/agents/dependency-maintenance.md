---
title: Platform Dependency Maintenance
docType: guide
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when reviewing dependency proposals or changing monitoring and ordinary dependency CI
whenToUpdate:
  - when discovery scope, grouping, validation or activation prerequisites change
checkPaths:
  - patches/**
  - .github/dependabot.yml
  - .github/workflows/dependency-pr.yml
  - docs/agents/dependency-maintenance.md
lastReviewedAt: 2026-10-30
lastReviewedCommit: 2cadf125f9ebaad6a35b27e35a88b444416320bd
lastReviewedNote: 'Reviewed Platform #1372: approved scoped Axios graph and exact redirect-callback patch preserve URI repairs, toolchain, supported consumers and unchanged full qualification requirements; baseline differences and raw/vendor audit boundaries remain explicit.'
related:
  - ../../AGENTS.md
  - repo-validation.md
  - prepush-gate-policy.md
---

# Dependency maintenance

Dependabot monitors the single root pnpm graph on Wednesdays at 05:00 and GitHub Actions at 05:20, in Asia/Shanghai. Both version-update entries target `dev`, use a seven-day cooldown, and initially permit two npm proposals and one Actions proposal. Related native UI/Umi generation, Supabase client, test runtime, compiler/lint and desktop tool patch/minor updates are grouped. Package majors and other packages remain individually visible. Pre-1.0 and prerelease adoption still require an explicit compatibility decision.

Keep the reviewed React/Ant Design/ProComponents generation, internal SDK, TypeScript adapter boundary, pnpm overrides, isolated linker, public-hoist patterns and lifecycle-script decisions intact. A proposal that outgrows an exact override or prerelease pin needs reviewed compatibility work; do not broaden policy merely to make installation pass. Embedded executable versions and toolchain/image identities remain separately governed. Preserve full-SHA Actions references when updating them.

## Ordinary dependency checks

Keep Node type proposals on the Node 24 LTS line: the npm entry ignores only `@types/node` versions `>=25.0.0`, leaving 24.x minor/patch updates eligible under the existing cooldown. Revisit this ceiling only after explicit approval of a later runtime major, including a security fix that requires that decision. Security alerts remain enabled. This does not change runtime pins or `actions/setup-node` versions; Dev-only configuration is not activated until it reaches the default branch through the existing release policy.

`dependency-pr.yml` runs for relevant dependency, package-policy, runtime-selector and workflow paths in PRs targeting `dev` or `main`, including human-authored changes. It checks out the exact head with `fetch-depth: 0`, uses the existing pinned pnpm/Node setup, installs the frozen graph and runs the unchanged `pnpm prepush:gate`. Complete history and the `origin/main` and `origin/dev` refs are required by the locale audit, frozen German review and correction provenance contracts. Checkout fetches that history before removing its credentials; the candidate stays bound to its exact SHA. Full Jest logs remain available as a seven-day artifact. Manual runs have independent run identities; newer PR commits cancel only superseded runs for that PR.

Marked Dev Release PRs and Main candidates from `dev`, `codex/promote-*` or `codex/hotfix-*` defer to their existing exact Release Candidate or Main Candidate validation owner. The dependency job is skipped for those phases, not reported as proof. Existing candidate checks still reject invalid marker, lineage, version or head evidence; no protected gate is bypassed. Ordinary dependency proposals and human maintenance PRs outside those protected phases run the new job, including unmarked Main security proposals. This avoids a second aggregate execution on deterministic release/promotion/hotfix candidates.

The selected Action baseline is pnpm/setup3.1.1, setup-node7.1.0 and upload-artifact7.0.2, each pinned to its verified executable commit. The ordinary dependency workflow also has a bounded `action-compatibility` job with the same phase-selection predicate. It runs setup-node before verifying its exact Node24.19.0 runtime, then pnpm/setup before verifying Node24.19.0/pnpm11.24.0. Both source-bound receipts reject a changed product manifest/lock/install policy and record the installed Node binary identity. This probe does not install the product or run a second aggregate gate. It uploads only its two JSON receipts as a seven-day ZIP and requires a service artifact ID/digest. Hosted qualification must independently download that actual artifact, check ZIP integrity, exact receipt contents and source/tool/graph identities; an upload acknowledgement alone is not roundtrip proof. Existing release/browser artifact paths, archive behavior and admission guards stay intact.

This workflow has read-only repository access, no production/deployment credentials and no publication command. It does not call `release:static-preflight`, manufacture a Release PR marker. The separate credential-free `semantic-qualification` job runs the complete canonical browser qualification with the same protected-phase exclusion, except the separately opted-in exact Main hotfix described below. The existing `ci.yml` remains Manual Web Deploy and has no PR trigger. The new check does not replace any required release or main-candidate check. Unrelated feature paths gain no automatic dependency workflow.

Preserve the canonical gate's complete inventory and 100% source coverage. Follow [the validation guide](repo-validation.md) for affected package, parser, UI, desktop and browser proof. Run Umi-generating commands serially. Use focused proof while iterating; the final checked push owns the one local aggregate gate. The aggregate dependency job proves source compatibility. The separate browser job supplies only the exact synthetic qualification it actually executes; neither grants production locale, reference-resource or deployment readiness.

## Default branch and release boundary

Dependabot reads its configuration from default `main`; a file left only on `dev` is not activation evidence. A workflow-only default-branch bootstrap may use the existing explicitly marked direct main-hotfix route: bind the tracked Issue, exact current Main base and candidate head, retain the package version, and satisfy the unchanged static/full Main Candidate gate. Merge must be followed by a separate `main -> dev` backmerge before delivery is complete. This is not a versioned Release PR or permission to bypass a failed readiness gate.

The existing Build/release resolver skips a later Main push when its package version is unchanged and the matching version tag already identifies the earlier release. Record the exact current tag/base/head skip evidence for the actual candidate; this configuration does not change that resolver or authorize tag, publication or deployment operations.

Security proposals use the default branch. Dev-targeted version options do not configure that separate security path. Triage Main security work through the existing supported hotfix/backmerge contracts; a Dependabot branch is not itself a marked hotfix, and green ordinary CI does not grant release eligibility.

## Deferred ecosystems and acceptance

Docker/Compose updater activation is deferred until owned image inputs have scoped build/runtime qualification. That follow-up must preserve immutable application/E2E image identities, their pnpm/Node and native dependencies, and the existing packaging/qualification gates. No Docker or Compose monitoring is enabled here.

The Edge runtime owns Deno/URL-import compatibility. The local `docker/volumes/functions/**` tree is a generated mirror; npm-root discovery does not cover its raw URLs or authorize editing it. Inventory supported imports and qualify updates in the owning Edge repository, then refresh this mirror only through the reviewed full-commit helper and source-revision receipt. This change does not claim Deno, raw-URL, mirror or image coverage.

Automatic merging is disabled for this rollout. Proposal discovery is allowed, but do not adopt a bot proposal while an independent merger remains enabled without a verified live Dependabot exclusion, including queued work. Native GitHub automatic-merge state alone does not establish that exclusion. Once authorized, use the workspace controller's existing-PR preview and bound continuation; preserve useful proposal context and exact Issue ownership, and never create a duplicate PR to work around intake.

Verify dependency graph/security settings and the first actual hosted updater job and candidate lockfile separately. A merged configuration, missing PR or local pass is not discovery-success evidence. Keep operational prerequisites and current validation in the owning Issue; exact root integration remains separate.

Reference: [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Installed Supabase and browser qualification

Issue #1315 normally composes original proposal #1277 and advances only the six Supabase JavaScript packages to locked `2.118.0`. Product `0.0.141`, SDK `0.5.0`, Zod `4.5.4`, TypeScript `7.0.2`, Node/pnpm, Actions and all unrelated resolutions stay intact. Existing service-object mocks remain useful unit isolation; they do not qualify an installed SDK.

`tests/unit/config/installedSupabaseContract.test.ts` launches native Node contracts outside Jest mappers. They exercise installed HTTP serialization, real RS256/JWKS validation, error classes, aborts, Storage bytes and the actual shared client plus claims, public-schema, task, auth, recovery, OAuth, Storage preview and startup-deadline consumers. A paired synthetic baseline corpus records the Functions Blob MIME and supplied-FormData ordering fixes plus the winning-session refresh change; capability tests do not stand in for browser storage or native BroadcastChannel proof. Installed auth-js `2.118.0` defaults to `lock = null`, and the product supplies no lock override, so the browser scenario exercises that real lockless path; it does not claim Web Locks coverage. Explicit locale and observed tab visibility bind the fixture before the real SDK refresh timer and login actions, without manufacturing Auth events.

The ordinary dependency workflow's one `semantic-qualification` job runs unchanged `e2e:qualify` and `release:proof:verify` against the archived exact candidate and existing digest-pinned images. It runs all three browsers, including the actual application two-tab held-refresh/foreign-session/sign-out scenario, and all existing harness controls. Reviewed discovery is 29 canonical cases per browser: Chromium executes 29, Firefox/WebKit each execute 14 and retain the existing 15 designed skips. Four harness controls per browser yield 99 discovered cases, 69 executed and 30 designed skips. No additional aggregate gate, credentials, production lane or release requirement is introduced.

The resource observer snapshots preexisting Docker identities and context, source/tree, manifest/image labels, exact checkout output mounts, installed tools and measured runner capacity before qualification. Always-run recovery re-inspects exact fresh owned resources before deletion; final verification checks their absence and preserves preexisting/shared resources. No generic label prune or BuildKit pruning is permitted. Unattributable builder cache remains explicitly retained. The unchanged canonical browser smoke has no owner label or output mount: normal `--rm` completion plus complete inventory proves no survivor, but an ambiguous failed/cancelled survivor is retained and cleanup verification fails. A terminated hosted runner may prevent always-run recovery; absence of a receipt is not cleanup proof.

Only selected credential-free JSON proof/diagnostic/resource files enter the seven-day ZIP; environment, auth state, screenshots, traces and video are excluded. Actual acceptance requires both canonical execution and resource closure, service artifact ID/digest, independent download/ZIP verification, raw canonical report hash and exact source/tool/image bindings. Local tests of the observer or workflow are not Docker capacity, browser or hosted cleanup evidence. Main promotion, release and root-integration holds remain unchanged.

## Maintained dependency patches and Main hotfix qualification

`patches/@rc-component__portal@2.2.1.patch` is an exact native pnpm patch for the installed latest-stable Portal lifecycle defect. `pnpm-workspace.yaml` registers it and the lock binds its SHA256; both CJS/ESM hooks, Portal wiring and declarations are maintained together. Shared Escape registration, ancestry and callbacks publish only at commit. Logical Escape ancestry is separate from DOM append ordering; nested priority, committed opening epochs, all-active fanout, omitted callbacks and both IME gates retain focused consumer contracts. This is not a determination of either historical #1354 failure's cause.

`patches/http-cache-semantics@4.3.0.patch` maintains the installed Node tooling policy used by `cacheable-request@7.0.4`. Immediate reuse and unsuccessful error fallback respect response reuse restrictions and URI, host, method and Vary selection. Stale extensions cannot override `no-cache`, stale `must-revalidate`, or shared `proxy-revalidate` / `s-maxage`. Published successful-304 behavior, the shared Set-Cookie lifetime heuristic without public/immutable opt-in, and the documented `ignoreCargoCult` option remain intact. Set-Cookie alone is not a protocol prohibition on ordinary client-authorized stale reuse.

The cache patch compares directive names without case, retains the first occurrence, preserves complete values and quoted extension boundaries, and keeps formatted values opaque through serialization. Retained raw response headers govern legacy reconstruction; maps are normalized when raw Cache-Control is absent. Its malformed-input choices are local conservative policies: invalid numeric/must/proxy arguments refuse storage, invalid public/immutable arguments grant no cache permission, and ambiguous quotes or CR/LF also require validation of existing entries. Pragma applies only without Cache-Control. These rules do not claim complete HTTP compliance or that every refusal is required by RFC 9111. An old artifact that already lost intent remains conservatively revalidated.

`tests/unit/config/installedAuditContract.test.ts` runs the native installed-package suites outside Jest mappers. The cache regressions exercise the real installed parent under synthetic transport, including failed validation, Vary, directive/codec boundaries, legacy data and valid positive controls. Other cohort contracts cover real parser/build callers, archive and HTTP fixtures, plus Mako Less/PostCSS worker execution and cleanup. Their temporary two-CPU discovery fixture is restored immediately after module loading and proves bounded compatibility rather than default-capacity operation. Qualification of application behavior, images, browsers and hosted resource closure stays with the existing proof owners. On an upstream update, review the equivalent behavior and rerun these contracts before retiring the cache patch; audit/version clearance alone is insufficient.

`patches/decode-uri-component@0.2.2.patch` backports the complete decoding core and single-pass replacement from upstream [0.5.1](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.1), while retaining the original callable CommonJS export, string TypeError and plus-to-space conversion. Umi history's `query-string@6.14.1` caller requires that CommonJS function; a direct ESM override is not a compatible substitute. The two upstream fixes replace recursive malformed-byte partitioning and repeated whole-string replacement. Emitted escapes are no longer decoded again, and replacement-dollar syntax becomes literal output. These intentional malformed-input corrections must not be reverted to reproduce old fallback output. Valid Unicode, encoded plus, legacy uppercase BOM/truncated-C2 behavior and query/fragment contracts remain covered by the installed URI regressions.

The URI patch retains package version `0.2.2`, so a version-based audit can still report GHSA-vcc3-ghjq-m6fr and GHSA-qr28-fpjm-wq7f. Preserve that unfiltered result and bind remediation to the exact installed patch and actual caller proof; do not falsify the version, suppress alerts or infer a vulnerability-free graph. Retiring this patch requires a supported upstream dependency/module transition, both upstream fixes, and the CJS/query/history, ESM/native-browser and current-source qualification described in the validation guide.

The exact `@umijs/plugins@4.7.24>axios` override selects the maintained `0.34.0` line with its approved `proxy-from-env@1.1.0` transitive dependency. This is a reviewed exception to the parent's exact `0.27.2` pin, not a global Axios override or Axios 1 migration. Umi's real generated request facade and its public types must resolve the selected package. Preserve the separate compiled Axios copy in Umi utilities as explicitly owned audit debt; changing the normal graph does not repair that vendor copy.

`patches/axios@0.34.0.patch` restores the published `beforeRedirect` response argument and the existing runtime request-details argument. The unpatched dispatcher passed only options and broke callbacks that destructured response headers. Forward all three arguments to the configured hook while leaving the proxy callback and its order unchanged; do not import unrelated Axios 1 transport policy. Retire the patch only when a supported upstream version preserves those callbacks and passes the actual redirect/proxy/error regressions.

Axios consumer proof distinguishes upstream behavior changes from existing Umi behavior. Nested query serialization, explicit text responses, falsy bodies, XSRF forwarding, network errors, cancellation, streamed size limits and synchronous interceptor recovery require real caller comparisons. Do not enable cross-origin XSRF tokens or introduce global limits to imitate old defaults. Same-origin destination credentials, changed-origin stripping, proxy-only credentials and `no_proxy` transitions use dummy credentials and owned loopback endpoints. The existing shared-instance overlap of Umi's temporary per-call interceptors remains explicit; this dependency repair does not claim per-call isolation or change that policy.

Maintained patch files are dependency-image inputs. Both Docker frozen installs copy `patches/` before installation, and the generated dependency and candidate build contexts carry each declared patch. Patch-free generated contexts still contain an empty directory for the same Docker instruction. The source reader accepts plain top-level pnpm mapping keys and an empty or two-space block scalar `patchedDependencies` map; ordinary plain, single-quoted and double-quoted entries are supported. Richer, escaped, duplicate or noncanonical forms fail closed. Declared paths must remain below `patches/`, be regular tracked stage-0 `100644` files without symlink components, and match the exact locked SHA256.

The sorted package/path/hash inventory and its digest bind dependency-image tags and labels, candidate manifest version 6, build/runtime verification, qualification keys and the resource observer. Missing, changed, untracked or lock-mismatched bytes fail before cache reuse. The in-container evidence reporter accepts the same manifest version without requiring Git; retained version-5 manifests cannot qualify the new source. External semantic evidence formats, assertion identities, browser inventories and execution budgets are unchanged.

Use pinned `pnpm patch <exact-package>@<version> --edit-dir <owned-directory>` for a registered maintained package, then `pnpm patch-commit <owned-directory> --patches-dir patches`; edit only that extraction. Never edit installed `node_modules`, suppress patch errors or enable unused patches. Frozen installation must prove the exact patch and unchanged unrelated lock graph. On a later upstream update, review the equivalent fix and rerun CJS, ESM/native-browser and current-source semantic proof before retiring the patch; keep the behavioral regressions. [pnpm patch documentation](https://pnpm.io/11.x/cli/patch) defines the maintained mechanism.

For a deliberately selected Main hotfix, the PR body additionally carries exactly one standalone semantic opt-in comment:

```text
<!-- tiangong-next-main-semantic:v1 issue=ISSUE main-base=40_HEX_BASE candidate=40_HEX_HEAD version=X.Y.Z -->
```

The separate browser job first checks canonical same-repository identity, an open Main PR on `codex/hotfix-*`, exact checkout/current fetched Main/base/head/version, one authoritative existing hotfix marker and one matching semantic marker. It reuses the bound Main context validator; missing, duplicate, quoted, malformed or stale markers fail before installation. Forks are refused for the protected Main hotfix opt-in; ordinary fork proposals retain their existing successful-job path. Unknown events are refused. Ordinary qualification requires both aggregate and Action jobs to succeed; this protected hotfix route instead requires both to be explicitly skipped, with the unchanged Main Candidate gate retaining aggregate ownership. Failed/cancelled dependencies never admit either path.

This opt-in reuses the complete existing canonical 99-case job with 45-second default expectations/navigation, zero retries and unchanged test-specific budgets, resource observer, cleanup verification and artifact acknowledgement. It adds no aggregate, secret, permission, publication or deployment capability, and is separate from release proof. A source change invalidates old proof; inspect the actual exact-head artifact and resource receipts. Local installed contracts, a skipped job and the marker itself do not establish browser qualification.
