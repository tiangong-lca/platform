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
  - .github/dependabot.yml
  - .github/workflows/dependency-pr.yml
  - docs/agents/dependency-maintenance.md
lastReviewedAt: 2026-10-26
lastReviewedCommit: b843976e312c00fb38db8e4d40c64c760ba25834
lastReviewedNote: 'Platform #1315: reviewed native navigation-aware identity observation at b1fa7a6d after hosted380 Chromium context-loss failure. Fresh non-null generation and exact stored owner are observed atomically before/after held-response release; existing45s authenticated/15s public budget,120s test limit, routes and dispatch/logout checks remain.160 focused checks, lint, types and locale checks pass.380 hosted result remains68pass/1fail/30skip with separate verified cleanup success. New ordinary full checked push and real three-browser qualification remain Main-owned; workflow/runtime/package/coverage/release policies are unchanged.'
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

This workflow has read-only repository access, no production/deployment credentials and no publication command. It does not call `release:static-preflight`, manufacture a Release PR marker. The separate credential-free `semantic-qualification` job runs the complete canonical browser qualification with the same protected-phase exclusion. The existing `ci.yml` remains Manual Web Deploy and has no PR trigger. The new check does not replace any required release or main-candidate check. Unrelated feature paths gain no automatic dependency workflow.

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
