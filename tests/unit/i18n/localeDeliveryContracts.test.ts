import { LOCALE_CAPABILITY_MATRIX } from '@/services/general/localeCapabilities';
import { SUPPORTED_APP_LOCALES } from '@/services/general/localeRegistry';
import { REFERENCE_RESOURCE_MANIFEST } from '@/services/referenceResources/manifest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_LOCALES,
  flattenExecutableRouteAssertions,
  flattenExecutableViewVariants,
  getLocaleMessage,
} from '../../e2e/i18n/contracts';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const DELIVERY_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts/i18n/locale-delivery.mjs');

const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8'));

describe('shared locale delivery contracts', () => {
  it('generates every locale artifact twice without inheriting source Git state', () => {
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }).trim();
    const gitIndex = execFileSync('git', ['rev-parse', '--git-path', 'index'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(
      execFileSync(process.execPath, ['scripts/i18n/check-artifact-idempotence.mjs'], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_DIR: gitDir,
          GIT_INDEX_FILE: path.resolve(REPOSITORY_ROOT, gitIndex),
          GIT_WORK_TREE: REPOSITORY_ROOT,
        },
        timeout: 180_000,
      }),
    ).toContain('"artifactGenerations":2');
  }, 190_000);

  it('covers every registry locale and mandatory route view without granting anonymous access', () => {
    const coverage = readJson('docs/plans/i18n/route-view-coverage.json');
    expect(coverage.supportedLocales).toEqual(SUPPORTED_APP_LOCALES);

    expect(coverage.schemaVersion).toBe('tiangong.i18n-route-view-coverage.v4');
    const familyRows = coverage.routeFamilies.flatMap((family: any) =>
      family.routes.map((route: string) => ({
        ...family,
        route,
        executableAssertionId: family.executableAssertionIds[route],
      })),
    );
    const coverageRows = [...coverage.rows, ...familyRows];
    const expectedEvidencePath = '.local/e2e-release/semantic-e2e-evidence.json';
    expect(coverage.proofPolicy).toEqual(
      expect.objectContaining({
        status: 'ci-required',
        assertionSemantics: expect.stringContaining('never execution evidence'),
        evidenceContract: expect.objectContaining({
          schemaVersion: 'tiangong.i18n-semantic-e2e-evidence.v2',
          schemaPath: 'docs/plans/i18n/semantic-e2e-evidence.schema.json',
          evidencePath: expectedEvidencePath,
          requiredAssertionCount: 58,
          requiredLocales: SUPPORTED_APP_LOCALES,
          requiredBrowsers: ['chromium', 'firefox', 'webkit'],
          target: { frontend: 'candidate-local', backend: 'production' },
          productionData: expect.objectContaining({
            markerPrefix: 'codex-e2e',
            exactCreated: 1,
            requireCreatedAndCleaned: true,
            maximumLeaked: 0,
          }),
        }),
        browserProof: {
          status: 'external-artifact',
          ownerIssue: '#867',
          requiredAt: 'dev-release-candidate-gate',
          storage: 'ignored-local-or-github-actions-artifact',
          executedEvidence: [],
        },
      }),
    );
    expect(
      fs.existsSync(path.join(REPOSITORY_ROOT, 'docs/plans/i18n/semantic-e2e-evidence.json')),
    ).toBe(false);
    expect(coverageRows).toHaveLength(58);
    const executableAssertionIds = coverageRows.map(
      ({ executableAssertionId }: any) => executableAssertionId,
    );
    expect(new Set(executableAssertionIds).size).toBe(58);
    expect(
      executableAssertionIds.every((assertionId: string) =>
        /^rv\.[a-z0-9][a-z0-9.-]+$/u.test(assertionId),
      ),
    ).toBe(true);
    expect(Object.keys(coverage.executableTargets).sort()).toEqual(
      [...executableAssertionIds].sort(),
    );
    const executableAssertions = flattenExecutableRouteAssertions(coverage);
    expect(executableAssertions).toHaveLength(58);
    expect(APP_LOCALES).toEqual(SUPPORTED_APP_LOCALES);
    expect(new Set(executableAssertions.map(({ target }) => JSON.stringify(target))).size).toBe(58);
    const authenticatedAssertions = executableAssertions.filter(
      ({ target }) =>
        target.kind !== 'declared-static-fallback' && target.session === 'authenticated',
    );
    expect(authenticatedAssertions.length).toBeGreaterThan(30);
    expect(
      authenticatedAssertions.every(({ requiredScenarios }) =>
        requiredScenarios.includes('anonymous-protection'),
      ),
    ).toBe(true);
    expect(
      executableAssertions
        .filter(
          ({ target }) =>
            target.kind === 'declared-static-fallback' || target.session !== 'authenticated',
        )
        .every(({ requiredScenarios }) => !requiredScenarios.includes('anonymous-protection')),
    ).toBe(true);
    expect(
      executableAssertions
        .filter(({ proofScope }) => proofScope === 'internal-localization')
        .every(({ pageOwnedMessageIds }) => pageOwnedMessageIds.length > 0),
    ).toBe(true);
    const executableViewVariants = flattenExecutableViewVariants(coverage);
    expect(executableViewVariants.map(({ assertionId }) => assertionId)).toEqual([
      'vv.welcome.overview',
      'vv.welcome.carbon-footprint-guide',
      'vv.team.base',
      'vv.team.create',
      'vv.team.edit',
      'vv.process.drawer-edit',
      'vv.process.drawer-view',
      'vv.process.required-optional',
      'vv.process.required-enabled',
      'vv.data-processing.builds',
      'vv.data-processing.preview',
      'vv.data-processing.publication',
    ]);
    const viewStateRegistry = readJson(coverage.viewStateRegistry.sourcePath);
    expect(coverage.viewStateRegistry.schemaVersion).toBe(viewStateRegistry.schemaVersion);
    expect(coverage.viewStateRegistry.usages.map(({ registryId }: any) => registryId)).toEqual(
      viewStateRegistry.registries.map(({ id }: any) => id),
    );
    for (const usage of coverage.viewStateRegistry.usages) {
      const registry = viewStateRegistry.registries.find(({ id }: any) => id === usage.registryId);
      expect(usage.variantIds).toEqual(registry.variants.map(({ id }: any) => id));
    }
    expect(
      executableAssertions.every((assertion) => {
        const { target } = assertion;
        if (JSON.stringify(target).includes('body')) {
          return false;
        }
        if (target.kind === 'declared-static-fallback') {
          return (
            assertion.proofScope === 'declared-fallback-observed' &&
            target.expectedPathname === assertion.route &&
            target.exactVisibleText.length > 0
          );
        }
        if (
          !target.navigate.hashPath.startsWith('/') ||
          !target.expected.hashPath.startsWith('/') ||
          typeof target.navigate.hashQuery !== 'object' ||
          typeof target.expected.hashQuery !== 'object'
        ) {
          return false;
        }
        if (target.kind === 'role-boundary') {
          return (
            assertion.proofScope === 'access-boundary-observed' &&
            target.session === 'authenticated' &&
            target.boundary.selector !== 'body'
          );
        }
        const scopeMatchesTarget =
          assertion.proofScope === 'access-boundary-observed'
            ? target.session === 'anonymous' && target.kind === 'configured-redirect'
            : assertion.proofScope === 'internal-localization';
        return (
          scopeMatchesTarget &&
          target.visible.kind === 'locale-messages' &&
          target.visible.messageIds.length > 0
        );
      }),
    ).toBe(true);
    const executableMessageIds = executableAssertions.flatMap(({ target }) => {
      if (target.kind === 'declared-static-fallback') {
        return [];
      }
      return target.kind === 'role-boundary'
        ? target.boundary.messageIds
        : target.visible.messageIds;
    });
    expect(
      APP_LOCALES.every((locale) =>
        executableMessageIds.every((messageId) => getLocaleMessage(locale, messageId).length > 0),
      ),
    ).toBe(true);
    const routeViews = coverageRows.map(({ route, viewState }: any) => `${route}::${viewState}`);
    expect(routeViews).toEqual(
      expect.arrayContaining([
        '/::redirect-to-welcome',
        '/welcome::overview',
        '/welcome?view=carbon-footprint::carbon-footprint-guide',
        '/user/login::login-and-register',
        '/user/login/password_forgot::password-forgot',
        '/user/login/password_reset::password-reset',
        '/dashboard/national-carbon::national-carbon-dashboard',
        '/terms_of_use.html::static-legal-English-fallback',
        '/privacy_notice.html::static-legal-English-fallback',
        '*::not-found',
      ]),
    );
    expect(
      coverageRows.every(
        ({
          blockedContext,
          component,
          copySources,
          accessContext,
          proof,
          targetCoverage,
          trigger,
          unownedStaticContent,
          visibleStates,
        }: any) =>
          blockedContext === 0 &&
          unownedStaticContent === 0 &&
          Boolean(component) &&
          Boolean(trigger) &&
          Boolean(accessContext) &&
          copySources.sourcePaths.length > 0 &&
          visibleStates.length > 0 &&
          Boolean(targetCoverage) &&
          Boolean(proof),
      ),
    ).toBe(true);
    expect(
      coverageRows.every(
        ({ proof }: any) =>
          [
            'internal-localization',
            'access-boundary-observed',
            'declared-fallback-observed',
          ].includes(proof.requiredEvidenceScope) &&
          Array.isArray(proof.plannedBrowserAssertions) &&
          proof.plannedBrowserAssertions.length > 0 &&
          proof.browserAssertions === undefined,
      ),
    ).toBe(true);
    expect(
      coverageRows.every(
        ({ targetCoverage }: any) =>
          targetCoverage.localeScope === 'all-registry-locales' &&
          targetCoverage.missingContent === 0,
      ),
    ).toBe(true);

    const routeSource = fs.readFileSync(
      path.join(REPOSITORY_ROOT, coverage.sourceRouteConfig),
      'utf8',
    );
    const configuredPaths = [
      ...new Set(
        [...routeSource.matchAll(/\bpath:\s*['"]([^'"]+)['"]/gu)].map((match) => match[1]),
      ),
    ].sort();
    const coveredConfiguredPaths = [
      ...new Set(
        coverageRows
          .map(({ route }: any) => route.split(/[?#]/u)[0])
          .filter((route: string) => configuredPaths.includes(route)),
      ),
    ].sort();
    expect(configuredPaths).toHaveLength(55);
    expect(coveredConfiguredPaths).toEqual(configuredPaths);

    const forgotPassword = coverage.rows.find(
      ({ route }: any) => route === '/user/login/password_forgot',
    );
    const resetPassword = coverage.rows.find(
      ({ route }: any) => route === '/user/login/password_reset',
    );
    expect(forgotPassword.visibleStates).toEqual(
      expect.arrayContaining(['prefill-loading', 'prefill-unavailable-form-fallback']),
    );
    expect(resetPassword.visibleStates).toEqual(
      expect.arrayContaining(['session-loading', 'session-unavailable', 'request-new-link-action']),
    );

    const evidenceSchema = readJson('docs/plans/i18n/semantic-e2e-evidence.schema.json');
    expect(evidenceSchema).toEqual(
      expect.objectContaining({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
        required: expect.arrayContaining([
          'generatedAt',
          'runId',
          'candidate',
          'target',
          'digests',
        ]),
        properties: expect.objectContaining({
          schemaVersion: { const: 'tiangong.i18n-semantic-e2e-evidence.v2' },
          status: { const: 'verified' },
          candidate: expect.objectContaining({
            additionalProperties: false,
            required: [
              'configTreeDigest',
              'observedHeadCommit',
              'packageManifestDigest',
              'sourceTreeDigest',
              'unitTestTreeDigest',
            ],
          }),
          target: expect.objectContaining({
            additionalProperties: false,
            required: ['frontend', 'backend', 'proof'],
            properties: expect.objectContaining({
              proof: expect.objectContaining({
                additionalProperties: false,
                required: expect.arrayContaining([
                  'backendObservedOriginSha256',
                  'backendObservedPublishableKeySha256',
                  'backendTrackedOriginSha256',
                  'backendTrackedPublishableKeySha256',
                  'candidateEnvironmentSha256',
                  'trackedMainEnvironmentSha256',
                ]),
                properties: expect.objectContaining({
                  observer: { const: 'chromium-auth-request' },
                  freshPlaywrightServer: { const: true },
                }),
              }),
            }),
          }),
          digests: expect.objectContaining({
            additionalProperties: false,
            required: ['dependencyLock', 'pnpmWorkspace', 'runtimeAssets', 'tests', 'sources'],
          }),
          assertions: expect.objectContaining({ minItems: 58, maxItems: 58 }),
          productionData: expect.objectContaining({
            required: ['markerPrefix', 'created', 'cleaned', 'leaked'],
            properties: expect.objectContaining({
              created: { type: 'integer', const: 1 },
              cleaned: { type: 'integer', const: 1 },
            }),
          }),
        }),
      }),
    );
    expect(evidenceSchema.$defs.assertion.required).toContain('scenarios');
    expect(evidenceSchema.$defs.assertion.required).toContain('scenarioCoverage');

    const playwrightConfig = fs.readFileSync(
      path.join(REPOSITORY_ROOT, 'playwright.config.ts'),
      'utf8',
    );
    expect(playwrightConfig).toMatch(/reuseExistingServer:\s*false/u);
    expect(playwrightConfig).not.toMatch(/reuseExistingServer:\s*!process\.env\.CI/u);
    expect(playwrightConfig).toContain("process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'");
    expect(playwrightConfig).toMatch(/serviceWorkers:\s*'block'/u);
    expect(playwrightConfig).toContain('failOnFlakyTests: Boolean(process.env.CI)');

    const reporter = fs.readFileSync(
      path.join(REPOSITORY_ROOT, 'tests/e2e/i18n/evidence-reporter.ts'),
      'utf8',
    );
    expect(reporter).toContain("const VERIFIED_EVIDENCE_OPT_IN = 'E2E_WRITE_VERIFIED_EVIDENCE'");
    expect(reporter).toContain("observer: 'chromium-auth-request'");
    expect(reporter).toContain('backendObservedOriginSha256');
    expect(reporter).toContain('backendObservedPublishableKeySha256');
    expect(reporter).toContain("dependencyLock: digestFiles(['pnpm-lock.yaml'])[0]");
    expect(reporter).toContain("pnpmWorkspace: digestFiles(['pnpm-workspace.yaml'])[0]");
    expect(reporter).toContain('runtimeAssets: digestFiles(runtimeAssetPaths())');
    expect(reporter).toContain("'tests/data-workflows/data-workflow-paths.ts'");
    expect(reporter).toContain("'tests/data-workflows/workflows/workflow-shared.ts'");
    expect(reporter).toContain("'tests/unit/e2e/productionDataLedger.test.ts'");
    expect(reporter).toContain('captureExecutionInputs(config.rootDir)');
    expect(reporter).toContain('executionInputDigest(finalExecutionInputs)');
    expect(reporter).toContain('parseEvidenceAnnotations(result.annotations)');
    expect(reporter).toContain('hasCompleteScenarioCoverage(requiredScenarios, scenarioCoverage)');
    expect(reporter).toContain('hasExactProductionDataClosure(');
    expect(reporter).toContain('scenarioCoverage');
    expect(reporter).toContain('executableViewVariants: coverage.executableViewVariants');
    expect(reporter).toContain('viewStateRegistry: coverage.viewStateRegistry');
    const localeDelivery = fs.readFileSync(DELIVERY_SCRIPT, 'utf8');
    expect(localeDelivery).toContain('executableViewVariants: coverage.executableViewVariants');
    expect(localeDelivery).toContain('viewStateRegistry: coverage.viewStateRegistry');
    expect(localeDelivery).toContain('playwrightTestDirectory(root) !== semanticE2ERoot');
    expect(localeDelivery).toContain("'tests/data-workflows/data-workflow-paths.ts'");
    expect(localeDelivery).toContain("'tests/data-workflows/workflows/workflow-shared.ts'");
    expect(localeDelivery).toContain(
      'Semantic E2E digest root must be a non-empty repository directory matching Playwright testDir.',
    );
    expect(localeDelivery).toContain('{ requireCurrentBindings: requireCurrentSemanticEvidence }');
    expect(localeDelivery).not.toContain(
      "evidence.candidate.sourceTreeDigest !== digestTree(root, 'src')",
    );
    expect(localeDelivery).not.toContain(
      "evidence.candidate.unitTestTreeDigest !== digestTree(root, 'tests/unit')",
    );
  });

  it.each(SUPPORTED_APP_LOCALES)(
    '%s has complete generated dossiers, derived route evidence, and digest-bound structural validation',
    (locale) => {
      const context = readJson(`docs/plans/i18n-${locale}/context-manifest.json`);
      const structuralValidation = readJson(`docs/plans/i18n-${locale}/structural-validation.json`);
      const quality = readJson(`docs/plans/i18n-${locale}/quality-manifest.json`);
      const activation = readJson(`docs/plans/i18n-${locale}/locale-activation-manifest.json`);
      const semanticRouteAndE2EReady = false;
      const capability = LOCALE_CAPABILITY_MATRIX.find(({ appLocale }) => appLocale === locale)!;
      const expectedReferenceBlockerIds = REFERENCE_RESOURCE_MANIFEST.filter((resource) => {
        const localized = capability.referenceResources.find(
          ({ resourceId }) => resourceId === resource.resourceId,
        );
        const deliveryBlocked =
          localized?.status !== 'native' ||
          (localized.deliveryStatus !== 'official' &&
            localized.deliveryStatus !== 'project-reviewed');
        return (
          resource.required &&
          (deliveryBlocked ||
            (resource.structureSource.usageTerms as { productionStatus?: string })
              .productionStatus !== 'ready')
        );
      }).map(({ resourceId }) => resourceId);
      const referenceResourcesReady = expectedReferenceBlockerIds.length === 0;

      expect(context.schemaVersion).toBe('tiangong.i18n-locale-context.v2');
      expect(context.messageDossiers).toEqual(
        expect.objectContaining({
          messageCount: expect.any(Number),
          completeCount: expect.any(Number),
          blockedCount: 0,
          highRiskMessageCount: expect.any(Number),
          highRiskMessageDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
      expect(context.messageDossiers.messageCount).toBeGreaterThan(0);
      expect(context.messageDossiers.completeCount).toBe(context.messageDossiers.messageCount);
      expect(context.typedContentDossiers).toEqual(
        expect.objectContaining({
          registryLocaleCount: SUPPORTED_APP_LOCALES.length,
          targetContentUnitCount: 5,
          blockedContextCount: 0,
        }),
      );
      expect(context.routeViewCoverage.derivedEvidence).toEqual(
        expect.objectContaining({
          configuredRouteCount: 55,
          coveredConfiguredRouteCount: 55,
          browserProof: expect.objectContaining({
            status: 'external-artifact',
            ownerIssue: '#867',
            inventoryOnly: false,
            executedEvidenceCount: 0,
            evidenceSchemaVersion: 'tiangong.i18n-semantic-e2e-evidence.v2',
            proofStorage: 'ignored-local-or-github-actions-artifact',
            requiredAt: 'dev-release-candidate-gate',
            routeCoverageContractDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
            requiredAssertionCount: 58,
            contractReady: true,
            evidencePresent: false,
            ready: false,
          }),
          blockedDerivedStateCount: 0,
          unownedVisibleLiteralCount: 0,
        }),
      );
      const executionEvidence =
        context.routeViewCoverage.derivedEvidence.browserProof.executionEvidence;
      expect(Boolean(executionEvidence)).toBe(semanticRouteAndE2EReady);
      expect(executionEvidence?.assertionCount ?? 0).toBe(semanticRouteAndE2EReady ? 58 : 0);
      expect(executionEvidence?.leakedDataCount ?? 0).toBe(0);
      expect(context.inventory).toEqual(
        expect.objectContaining({
          routeViewRowCount: context.routeViewCoverage.derivedEvidence.rowEvidence.length,
          configuredRouteCount: 55,
          coveredConfiguredRouteCount: 55,
        }),
      );
      expect(context.routeViewCoverage.requiredRouteViews).toEqual([
        '/',
        '/welcome',
        '/welcome?view=carbon-footprint',
      ]);
      expect(context.routeViewCoverage.derivedEvidence.anonymousRoutePolicy).toEqual(
        expect.objectContaining({
          allowedPaths: [
            '/user/login',
            '/user/login/password_forgot',
            '/user/login/password_reset',
            '/oauth/consent',
          ],
          defaultAccess: 'authenticated-session-required',
          unknownPathAccess: 'authenticated-session-required',
        }),
      );
      expect(quality.automatedChecks).toEqual(
        expect.objectContaining({
          everyMessageDossierComplete: true,
          typedContentTopologyComplete: true,
          allHighRiskMessageStructuresValidated: true,
          semanticRouteAndE2EContractReady: true,
          semanticRouteAndE2EReady,
          semanticRouteAndE2EOwnerIssue: '#867',
          humanTranslationReviewRequired: false,
        }),
      );
      expect(quality.automatedChecks.semanticRouteAndE2EReady).toBe(semanticRouteAndE2EReady);
      expect(structuralValidation.schemaVersion).toBe('tiangong.i18n-structural-validation.v1');
      expect(structuralValidation.validationLanes).toHaveLength(1);
      expect(
        structuralValidation.validationLanes.every(
          ({ executionEvidence, findings, result }: any) =>
            result === 'passed' &&
            findings.length === 0 &&
            executionEvidence.findingCount === 0 &&
            executionEvidence.executor ===
              'scripts/i18n/locale-delivery.mjs#executeStructuralValidationLane' &&
            Object.values(executionEvidence.checks).every(Boolean),
        ),
      ).toBe(true);
      expect(quality.structuralValidation).toEqual(
        expect.objectContaining({
          validatedMessageCount: context.messageDossiers.messageCount,
          validatedModuleCount: 32,
          blockedItems: 0,
          semanticReviewPerformed: false,
        }),
      );
      expect(activation).toEqual(
        expect.objectContaining({
          schemaVersion: 'tiangong.i18n-locale-activation.v2',
          locale,
          checks: expect.objectContaining({
            platformContractValid: true,
            languageHardcodingPassed: true,
            fallbackContractPassed: true,
            referenceResourcesReady,
            semanticRouteAndE2EContractReady: true,
            semanticRouteAndE2EReady,
            productionActivationReady: referenceResourcesReady && semanticRouteAndE2EReady,
          }),
          referenceResourceBlockers: expect.any(Array),
        }),
      );
      expect(
        activation.referenceResourceBlockers.map(({ resourceId }: any) => resourceId).sort(),
      ).toEqual(expectedReferenceBlockerIds.sort());
      expect(
        activation.referenceResourceBlockers.every(({ ownerIssue }: any) => ownerIssue === '#634'),
      ).toBe(true);
      for (const resource of REFERENCE_RESOURCE_MANIFEST.filter(
        ({ required, structureSource }) =>
          required &&
          (structureSource.usageTerms as { productionStatus?: string }).productionStatus !==
            'ready',
      )) {
        expect(activation.referenceResourceBlockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              resourceId: resource.resourceId,
              usageTermsStatus: resource.structureSource.usageTerms.status,
              usageTermsProductionStatus: 'blocked',
              reason: expect.stringContaining('usage terms are'),
            }),
          ]),
        );
      }
      expect(activation.productionActivationBlockers).toHaveLength(
        activation.referenceResourceBlockers.length + (semanticRouteAndE2EReady ? 0 : 1),
      );
      const semanticProofBlocker = activation.productionActivationBlockers.find(
        ({ blockerId }: any) => blockerId === 'semantic-route-and-e2e-proof',
      );
      expect(Boolean(semanticProofBlocker)).toBe(!semanticRouteAndE2EReady);
      expect(semanticProofBlocker?.ownerIssue ?? null).toBe(
        semanticRouteAndE2EReady ? null : '#867',
      );
    },
  );

  it.each(SUPPORTED_APP_LOCALES)('%s reconstructs an individual dossier on demand', (locale) => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        DELIVERY_SCRIPT,
        'dossier',
        '--locale',
        locale,
        '--message',
        'pages.login.passwordReset.sessionUnavailable',
        '--check',
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.dossier).toEqual(
      expect.objectContaining({
        messageId: 'pages.login.passwordReset.sessionUnavailable',
        ownerModule: 'pages',
        canonicalEnglish: 'This password reset link is invalid or has expired. Request a new link.',
        candidateDecision: expect.objectContaining({ risk: 'high' }),
      }),
    );
    expect(output.dossier.translations).toEqual(
      expect.objectContaining(
        Object.fromEntries(
          SUPPORTED_APP_LOCALES.map((supportedLocale) => [supportedLocale, expect.any(String)]),
        ),
      ),
    );
  });

  it('declares independent UI, content, service-query, reference-data, and boundary fallbacks for every registry locale', () => {
    const contract = readJson('docs/plans/i18n/fallback-contract.json');
    const mandatorySurfaces = [
      'ui-locale',
      'documentation',
      'legal',
      'content-language',
      'service-query-language',
      'classification-reference-data',
      'location-reference-data',
      'service-errors',
      'TIDAS-import-report',
      'environment-branding',
    ];

    expect(contract.schemaVersion).toBe('tiangong.i18n-fallback-contract.v3');
    expect(contract.rows).toHaveLength(SUPPORTED_APP_LOCALES.length * mandatorySurfaces.length);

    SUPPORTED_APP_LOCALES.forEach((locale) => {
      const localeRows = contract.rows.filter(
        ({ requestedLocale }: any) => requestedLocale === locale,
      );
      expect(localeRows.map(({ surface }: any) => surface)).toEqual(mandatorySurfaces);

      const capability = LOCALE_CAPABILITY_MATRIX.find(({ appLocale }) => appLocale === locale);
      expect(capability).toBeDefined();

      const uiLocale = localeRows.find(({ surface }: any) => surface === 'ui-locale');
      expect(uiLocale).toEqual(
        expect.objectContaining({
          resolvedLocale: locale,
          capabilityStatus: 'native',
          disclosure: 'none',
        }),
      );

      const contentLanguage = localeRows.find(({ surface }: any) => surface === 'content-language');
      expect(contentLanguage).toEqual(
        expect.objectContaining({
          resolvedLocale: capability?.contentLanguage,
          capabilityStatus: capability?.contentReading,
          disclosure: 'none',
        }),
      );

      const serviceQuery = localeRows.find(
        ({ surface }: any) => surface === 'service-query-language',
      );
      const serviceUsesFallback = capability?.serviceQuery.status === 'declared-fallback';
      expect(serviceQuery).toEqual(
        expect.objectContaining({
          resolvedLocale: capability?.serviceQuery.resolvedLanguage,
          capabilityStatus: capability?.serviceQuery.status,
          usedFallback: serviceUsesFallback,
          disclosure: capability?.serviceQuery.disclosure,
          userDisclosure: capability?.serviceQuery.disclosure === 'user-visible',
        }),
      );

      const assertReferenceSurface = (
        surface: 'classification-reference-data' | 'location-reference-data',
        scope: 'classification' | 'location',
      ) => {
        const referenceRow = localeRows.find(
          ({ surface: rowSurface }: any) => rowSurface === surface,
        );
        const resourceIds = REFERENCE_RESOURCE_MANIFEST.filter(
          ({ scope: resourceScope }) => resourceScope === scope,
        ).map(({ resourceId }) => resourceId);
        const resourceCapabilities = capability?.referenceResources.filter(({ resourceId }) =>
          resourceIds.includes(resourceId),
        );

        expect(resourceCapabilities).not.toHaveLength(0);
        expect(referenceRow).toEqual(
          expect.objectContaining({
            userDisclosure: false,
            resources: resourceCapabilities?.map((resourceCapability) => ({
              resourceId: resourceCapability.resourceId,
              resolvedLocale: resourceCapability.resolvedLanguage ?? null,
              capabilityStatus: resourceCapability.status,
              deliveryStatus: resourceCapability.deliveryStatus ?? null,
              usedFallback: resourceCapability.status === 'development-base',
              disclosure: resourceCapability.status === 'development-base' ? 'diagnostic' : 'none',
              ownerIssue: resourceCapability.ownerIssue ?? null,
            })),
          }),
        );
        expect(referenceRow).not.toHaveProperty('capabilityStatus');
        expect(referenceRow).not.toHaveProperty('deliveryStatus');
      };

      assertReferenceSurface('classification-reference-data', 'classification');
      assertReferenceSurface('location-reference-data', 'location');

      const reportLocale = locale.replace('-', '_');
      const report = localeRows.find(({ surface }: any) => surface === 'TIDAS-import-report');
      expect(report).toEqual(
        expect.objectContaining({
          resolvedLocale: reportLocale,
          urlOrPayload: `human_summary.${reportLocale} and readme_markdown.${reportLocale}`,
        }),
      );
    });
  });

  it.each(SUPPORTED_APP_LOCALES)(
    '%s active activation check is CI-safe and confirmation-free',
    (locale) => {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', DELIVERY_SCRIPT, 'activation', '--locale', locale, '--check'],
        {
          cwd: REPOSITORY_ROOT,
          encoding: 'utf8',
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          action: 'activation',
          locale,
          privateConfirmationDependencies: [],
        }),
      );
      expect(`${result.stdout}\n${result.stderr}`).not.toContain('.local/');
    },
  );

  it('keeps production readiness strict when external semantic proof is absent', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        DELIVERY_SCRIPT,
        'activation',
        '--locale',
        'en-US',
        '--check',
        '--require-production-ready',
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not production-ready');
    expect(result.stderr).toContain('#867');
    expect(result.stderr).toContain('.local/e2e-release/semantic-e2e-evidence.json');
    expect(result.stderr).not.toContain('rights-clearance-required');
    expect(result.stderr).not.toContain('file-specific-owner-confirmation-required');
  });

  it('keeps semantic proof outside tracked source and ignores its canonical local path', () => {
    const coverage = readJson('docs/plans/i18n/route-view-coverage.json');
    const evidencePath = coverage.proofPolicy.evidenceContract.evidencePath;
    expect(evidencePath).toBe('.local/e2e-release/semantic-e2e-evidence.json');
    expect(
      execFileSync('git', ['check-ignore', evidencePath], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
      }).trim(),
    ).toBe(evidencePath);
    expect(
      fs.existsSync(
        path.join(REPOSITORY_ROOT, 'docs/plans/i18n/semantic-harness-qualification-receipt.json'),
      ),
    ).toBe(false);
  });

  it('requires the production locale gate in the release workflow', () => {
    const releaseWorkflow = fs.readFileSync(
      path.join(REPOSITORY_ROOT, '.github/workflows/release-gate.yml'),
      'utf8',
    );
    expect(releaseWorkflow).toContain('pnpm release:static-preflight');

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['release:preflight']).toBe('pnpm release:static-preflight');
    expect(packageJson.scripts['release:static-preflight']).toContain('pnpm i18n:locale:all:check');
    expect(packageJson.scripts['release:static-preflight']).toContain(
      'pnpm reference-data:production:check',
    );
    expect(packageJson.scripts['release:static-preflight']).not.toContain(
      'i18n:locale:all:production:check',
    );

    const manualWorkflow = fs.readFileSync(
      path.join(REPOSITORY_ROOT, '.github/workflows/ci.yml'),
      'utf8',
    );
    expect(manualWorkflow).toContain('pnpm i18n:locale:all:check');
    expect(manualWorkflow).toContain('pnpm reference-data:production:check');
  });
});
