import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type AuditFinding = {
  ruleId: string;
  path: string;
  nodeTextDigest: string;
};

type AuditReport = {
  ok: boolean;
  findings: AuditFinding[];
  violations: Array<{ code: string }>;
};

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const AUDIT_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts/i18n/audit-language-platform.mjs');

const writeFixtureFile = (root: string, relativePath: string, content: string) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const platformModuleSources = (includeOrphanLocale = false) => {
  const localeRows: Array<Record<string, any>> = [
    {
      canonicalLocale: 'en-US',
      languageCode: 'en',
      englishName: 'English',
      chineseName: '英语',
      nativeLabel: 'English',
      aliases: ['en', 'en-*', 'en_*'],
      direction: 'ltr',
      adapters: { antDesign: 'en_US', dayjs: 'en', intl: 'en-US', report: 'en_US' },
      formatting: {
        listSeparator: ', ',
        twoItemConjunction: ' and ',
        manyItemConjunction: ', and ',
      },
      contentCapability: { status: 'native', contentLanguage: 'en' },
      fallbacks: { documentationLocale: 'en-US', documentationUrl: '/en', legalLocale: 'en-US' },
      environment: { titleKey: 'TITLE_EN', loginSubtitleKey: 'LOGIN_EN' },
    },
    {
      canonicalLocale: 'zh-CN',
      languageCode: 'zh',
      englishName: 'Chinese',
      chineseName: '中文',
      nativeLabel: '简体中文',
      aliases: ['zh', 'zh-*', 'zh_*'],
      direction: 'ltr',
      adapters: { antDesign: 'zh_CN', dayjs: 'zh-cn', intl: 'zh-CN', report: 'zh_CN' },
      formatting: { listSeparator: '、', twoItemConjunction: '和', manyItemConjunction: '和' },
      contentCapability: { status: 'native', contentLanguage: 'zh' },
      fallbacks: { documentationLocale: 'zh-CN', documentationUrl: '/', legalLocale: 'en-US' },
      environment: { titleKey: 'TITLE_ZH', loginSubtitleKey: 'LOGIN_ZH' },
    },
  ];
  if (includeOrphanLocale) {
    localeRows.push({
      canonicalLocale: 'fr-FR',
      languageCode: 'fr',
      englishName: 'French',
      chineseName: '法语',
      nativeLabel: 'Français',
      aliases: ['fr', 'fr-*', 'fr_*'],
      direction: 'ltr',
      adapters: { antDesign: 'fr_FR', dayjs: 'fr', intl: 'fr-FR', report: 'fr_FR' },
      formatting: { listSeparator: ', ', twoItemConjunction: ' et ', manyItemConjunction: ' et ' },
      contentCapability: undefined,
      fallbacks: { documentationLocale: 'en-US', documentationUrl: '/en', legalLocale: 'en-US' },
      environment: { titleKey: 'TITLE_FR', loginSubtitleKey: 'LOGIN_FR' },
    });
  }

  const contentRows = [
    {
      languageCode: 'en',
      englishName: 'English',
      nativeLabel: 'English',
      authoring: { enabled: true, requiredForSave: true },
      reading: { enabled: true, priority: ['en'] },
      serviceQuery: { status: 'native', resolvedLanguage: 'en', disclosure: 'none' },
    },
    {
      languageCode: 'zh',
      englishName: 'Chinese',
      nativeLabel: '简体中文',
      authoring: { enabled: true, requiredForSave: false },
      reading: { enabled: true, priority: ['zh', 'en'] },
      serviceQuery: { status: 'native', resolvedLanguage: 'zh', disclosure: 'none' },
    },
  ];

  const resources = [
    {
      resourceId: 'fixture-resource',
      scope: 'classification',
      required: true,
      baseLanguage: 'en',
      identityStrategy: 'tree-index-path-with-id-assertion',
      cacheRevision: 'fixture-1',
      provenance: { status: 'verified' },
      runtimeAssets: {
        en: { language: 'en', fileName: 'fixture-en.json' },
        zh: { language: 'zh', fileName: 'fixture-zh.json' },
      },
      localizations: {
        en: { status: 'native', assetLanguage: 'en', deliveryStatus: 'project-reviewed' },
        zh: { status: 'native', assetLanguage: 'zh', deliveryStatus: 'project-reviewed' },
      },
    },
  ];

  const capabilities = localeRows
    .filter(({ contentCapability }) => contentCapability?.contentLanguage)
    .map((locale) => {
      const content = contentRows.find(
        ({ languageCode }) => languageCode === locale.contentCapability?.contentLanguage,
      )!;
      return {
        appLocale: locale.canonicalLocale,
        contentLanguage: locale.contentCapability?.contentLanguage,
        uiCatalog: 'native',
        contentReading: 'native',
        contentAuthoring: 'native',
        serviceQuery: content.serviceQuery,
        referenceResources: [
          {
            resourceId: 'fixture-resource',
            status: 'native',
            requestedLanguage: content.languageCode,
            resolvedLanguage: content.languageCode,
            deliveryStatus: 'project-reviewed',
          },
        ],
      };
    });

  return {
    'src/services/general/localeRegistry.ts': `
      export const LOCALE_REGISTRY = ${JSON.stringify(localeRows)};
      export const SUPPORTED_APP_LOCALES = LOCALE_REGISTRY.map(({ canonicalLocale }) => canonicalLocale);
      export const CANONICAL_SOURCE_APP_LOCALE = 'en-US';
    `,
    'src/services/general/contentLanguageRegistry.ts': `
      export const CONTENT_LANGUAGE_REGISTRY = ${JSON.stringify(contentRows)};
      export const SUPPORTED_CONTENT_LANGUAGES = CONTENT_LANGUAGE_REGISTRY.map(({ languageCode }) => languageCode);
      export const AUTHORING_CONTENT_LANGUAGES = CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.enabled).map(({ languageCode }) => languageCode);
      export const REQUIRED_CONTENT_LANGUAGES = CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.requiredForSave).map(({ languageCode }) => languageCode);
      export const CANONICAL_CONTENT_LANGUAGE = 'en';
      export const TRANSLATION_SOURCE_CONTENT_LANGUAGE = 'zh';
    `,
    'src/services/referenceResources/manifest.ts': `
      export const REFERENCE_RESOURCE_MANIFEST = ${JSON.stringify(resources)};
      export const REQUIRED_REFERENCE_RESOURCE_IDS = ['fixture-resource'];
    `,
    'src/services/general/localeCapabilities.ts': `
      export const LOCALE_CAPABILITY_MATRIX = ${JSON.stringify(capabilities)};
    `,
  };
};

const initializeFixture = (includeOrphanLocale = false) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiangong-language-platform-audit-'));
  Object.entries(platformModuleSources(includeOrphanLocale)).forEach(([relativePath, content]) =>
    writeFixtureFile(root, relativePath, content),
  );
  writeFixtureFile(
    root,
    'scripts/i18n/language-hardcoding-allowlist.json',
    `${JSON.stringify({
      schemaVersion: 'tiangong.i18n-language-hardcoding-allowlist.v2',
      entries: [],
    })}\n`,
  );
  return root;
};

const runAudit = (root: string, args: string[] = []) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', AUDIT_SCRIPT, '--root', root, '--format', 'json', ...args],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );

describe('language platform audit', () => {
  it('passes the repository registry, manifest, capability, and exact allowlist gate', () => {
    const result = runAudit(REPOSITORY_ROOT, ['--check']);
    expect(result.status).toBe(0);
    expect((JSON.parse(result.stdout) as AuditReport).ok).toBe(true);
  });

  it('fails closed when a registry locale lacks content and capability rows', () => {
    const root = initializeFixture(true);
    try {
      const result = runAudit(root, ['--scope', 'structure', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(1);
      expect(report.violations.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['invalid-locale-content-capability', 'capability-locale-coverage']),
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('accepts an explicitly declared content-reading fallback derived by the capability matrix', () => {
    const root = initializeFixture();
    try {
      const contentPath = path.join(root, 'src/services/general/contentLanguageRegistry.ts');
      fs.writeFileSync(
        contentPath,
        fs.readFileSync(contentPath, 'utf8').replace('"priority":["en"]', '"priority":["zh"]'),
      );
      const capabilityPath = path.join(root, 'src/services/general/localeCapabilities.ts');
      fs.writeFileSync(
        capabilityPath,
        fs
          .readFileSync(capabilityPath, 'utf8')
          .replace('"contentReading":"native"', '"contentReading":"declared-fallback"'),
      );
      const result = runAudit(root, ['--scope', 'structure', '--check']);
      expect(result.status).toBe(0);
      expect((JSON.parse(result.stdout) as AuditReport).ok).toBe(true);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects overlapping canonical and alias ownership across locales', () => {
    const root = initializeFixture();
    try {
      const registryPath = path.join(root, 'src/services/general/localeRegistry.ts');
      fs.writeFileSync(
        registryPath,
        fs
          .readFileSync(registryPath, 'utf8')
          .replace('"aliases":["zh","zh-*","zh_*"]', '"aliases":["zh","zh-*","zh_*","en-*"]'),
      );

      const result = runAudit(root, ['--scope', 'structure', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(1);
      expect(report.violations.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['locale-identifier-conflict', 'locale-identifier-roundtrip']),
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects duplicate report adapters and adapters that cannot round-trip to their owner', () => {
    const root = initializeFixture();
    try {
      const registryPath = path.join(root, 'src/services/general/localeRegistry.ts');
      fs.writeFileSync(
        registryPath,
        fs.readFileSync(registryPath, 'utf8').replace('"report":"zh_CN"', '"report":"en_US"'),
      );

      const result = runAudit(root, ['--scope', 'structure', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(1);
      expect(report.violations.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['duplicate-locale-adapter', 'locale-adapter-roundtrip']),
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('finds a direct const string used as a local language comparison alias', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        "const EN = 'en';\nexport const label = (lang: string) => lang === EN ? 'English' : 'Other';\n",
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual([
        expect.objectContaining({ path: 'src/feature.ts', ruleId: 'language-equality' }),
      ]);
      expect(report.violations.map(({ code }) => code)).toContain('unapproved-language-hardcoding');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('scans runtime config and shared i18n test infrastructure for fixed language defaults', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'config/config.ts',
        "export const config = { locale: { default: 'zh-CN' } };\n",
      );
      writeFixtureFile(
        root,
        'tests/helpers/i18n/fixture.ts',
        "export const format = (locale = 'en-US') => locale;\n",
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'config/config.ts', ruleId: 'language-default' }),
          expect.objectContaining({
            path: 'tests/helpers/i18n/fixture.ts',
            ruleId: 'language-default',
          }),
        ]),
      );
      expect(report.violations.map(({ code }) => code)).toContain('unapproved-language-hardcoding');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('finds logical locale fallbacks and static language metadata in exported HTML documents', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        [
          'export const buildReport = (runtimeLocale?: string, runtimeDirection?: string) => {',
          "  const locale = runtimeLocale || 'ja-JP';",
          "  const language = runtimeLocale ?? 'it-IT';",
          '  const staticLanguageDocument = `<!DOCTYPE html><html lang=it-IT dir="${runtimeDirection}"><body>${locale}</body></html>`;',
          '  const staticDirectionDocument = `<!DOCTYPE html><html lang="${runtimeLocale}" dir=rtl><body>${language}</body></html>`;',
          "  const concatenatedDocument = '<html lang=\"en-US\">' + runtimeLocale + '</html>';",
          '  return `${staticLanguageDocument}${staticDirectionDocument}${concatenatedDocument}`;',
          '};',
          '',
        ].join('\n'),
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings.map(({ path, ruleId }) => ({ path, ruleId }))).toEqual([
        { path: 'src/feature.ts', ruleId: 'language-default' },
        { path: 'src/feature.ts', ruleId: 'language-default' },
        { path: 'src/feature.ts', ruleId: 'embedded-html-language-attribute' },
        { path: 'src/feature.ts', ruleId: 'embedded-html-language-attribute' },
        { path: 'src/feature.ts', ruleId: 'embedded-html-language-attribute' },
      ]);
      expect(report.violations.map(({ code }) => code)).toContain('unapproved-language-hardcoding');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('accepts registry-derived HTML metadata and ignores business strings and HTML fragments', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        [
          'export const buildReport = (runtimeLocale?: string, businessValue?: string) => {',
          '  const locale = runtimeLocale ?? DEFAULT_SERVICE_APP_LOCALE;',
          "  const browserPreference = runtimeLocale ?? 'Use browser preference';",
          "  const translatedValue = translations?.[runtimeLocale] ?? '';",
          "  const missingTranslation = translations?.[runtimeLocale] ?? 'unknown';",
          "  const country = businessValue ?? 'fr';",
          '  const definition = getLocaleDefinition(locale);',
          '  const fragment = \'<div lang="en-US" dir="ltr">English</div>\';',
          "  const prose = 'Use the fr business code for France.';",
          '  const document = `<!DOCTYPE html><html lang="${definition.canonicalLocale}" dir="${definition.direction}"><body>${fragment}:${prose}:${country}</body></html>`;',
          '  return `${document}:${browserPreference}:${translatedValue}:${missingTranslation}`;',
          '};',
          '',
        ].join('\n'),
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual([]);
      expect(report.ok).toBe(true);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('reports visible JSX placeholder strings without flagging technical string attributes', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.tsx',
        [
          'export const Feature = () => (',
          '  <input',
          "    placeholder='Enter text'",
          "    data-testid='codex-e2e-input'",
          "    id='process-name'",
          "    name='processName'",
          "    aria-controls='process-name-options'",
          '  />',
          ');',
          '',
        ].join('\n'),
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual([
        expect.objectContaining({
          path: 'src/feature.tsx',
          ruleId: 'visible-jsx-string-prop',
        }),
      ]);
      expect(report.violations.map(({ code }) => code)).toContain('unapproved-language-hardcoding');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('accepts a catalog-backed JSX placeholder expression', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.tsx',
        "export const Feature = ({ placeholder }: { placeholder: string }) => <input placeholder={placeholder} data-testid='input' />;\n",
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual([]);
      expect(report.ok).toBe(true);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('does not resolve an indirect const that shadows an outer static language alias', () => {
    const root = initializeFixture();
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        [
          "const EN = 'en';",
          'export const label = (lang: string) => {',
          '  const EN = getRuntimeLanguage();',
          "  return lang === EN ? 'English' : 'Other';",
          '};',
          '',
        ].join('\n'),
      );

      const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
      const report = JSON.parse(result.stdout) as AuditReport;
      expect(result.status).toBe(0);
      expect(report.findings).toEqual([]);
      expect(report.ok).toBe(true);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('requires an exact digest waiver and rejects it as unused after the node disappears', () => {
    const root = initializeFixture();
    const allowlistPath = 'scripts/i18n/language-hardcoding-allowlist.json';
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        "export const label = (locale: string) => locale === 'zh-CN' ? '中文' : 'English';\n",
      );
      const discovery = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const discoveryReport = JSON.parse(discovery.stdout) as AuditReport;
      expect(discovery.status).toBe(0);
      expect(discoveryReport.violations.map(({ code }) => code)).toContain(
        'unapproved-language-hardcoding',
      );
      expect(discoveryReport.findings).toHaveLength(1);

      const finding = discoveryReport.findings[0];
      writeFixtureFile(
        root,
        allowlistPath,
        `${JSON.stringify(
          {
            schemaVersion: 'tiangong.i18n-language-hardcoding-allowlist.v2',
            entries: [
              {
                ruleId: finding.ruleId,
                path: finding.path,
                nodeTextDigest: finding.nodeTextDigest,
                maxMatches: 1,
                ownerIssue: '#635',
                reason: 'Fixture debt is intentionally owned by the page cleanup issue.',
                status: 'temporary',
                expiresOn: '2099-12-31',
              },
            ],
          },
          null,
          2,
        )}\n`,
      );

      const approved = runAudit(root, ['--scope', 'hardcoding', '--check']);
      expect(approved.status).toBe(0);
      expect((JSON.parse(approved.stdout) as AuditReport).ok).toBe(true);

      writeFixtureFile(
        root,
        'src/feature.ts',
        'export const label = (locale: string) => getLanguageDisplayName(locale);\n',
      );
      const stale = runAudit(root, ['--scope', 'hardcoding', '--check']);
      const staleReport = JSON.parse(stale.stdout) as AuditReport;
      expect(stale.status).toBe(1);
      expect(staleReport.violations.map(({ code }) => code)).toContain('unused-allowlist-entry');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects prose expiry conditions and unknown permanent contracts', () => {
    const root = initializeFixture();
    const allowlistPath = 'scripts/i18n/language-hardcoding-allowlist.json';
    try {
      writeFixtureFile(
        root,
        'src/feature.ts',
        "export const label = (locale: string) => locale === 'zh-CN' ? '中文' : 'English';\n",
      );
      const discovery = runAudit(root, ['--scope', 'hardcoding', '--mode', 'report']);
      const finding = (JSON.parse(discovery.stdout) as AuditReport).findings[0];
      const baseEntry = {
        ruleId: finding.ruleId,
        path: finding.path,
        nodeTextDigest: finding.nodeTextDigest,
        maxMatches: 1,
        ownerIssue: '#635',
        reason: 'Fixture debt is intentionally owned by the page cleanup issue.',
      };

      writeFixtureFile(
        root,
        allowlistPath,
        `${JSON.stringify({
          schemaVersion: 'tiangong.i18n-language-hardcoding-allowlist.v2',
          entries: [
            {
              ...baseEntry,
              status: 'temporary',
              expiresOn: 'Remove when the resolver lands.',
            },
          ],
        })}\n`,
      );
      const proseExpiry = runAudit(root, ['--scope', 'hardcoding', '--check']);
      expect(proseExpiry.status).toBe(1);
      expect(
        (JSON.parse(proseExpiry.stdout) as AuditReport).violations.map(({ code }) => code),
      ).toContain('invalid-allowlist-entry');

      writeFixtureFile(
        root,
        allowlistPath,
        `${JSON.stringify({
          schemaVersion: 'tiangong.i18n-language-hardcoding-allowlist.v2',
          entries: [
            {
              ...baseEntry,
              status: 'permanent-contract',
              permanentContract: 'free-form-exception',
            },
          ],
        })}\n`,
      );
      const unknownContract = runAudit(root, ['--scope', 'hardcoding', '--check']);
      expect(unknownContract.status).toBe(1);
      expect(
        (JSON.parse(unknownContract.stdout) as AuditReport).violations.map(({ code }) => code),
      ).toContain('invalid-allowlist-entry');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  describe('controlled native batch fixture locale contract', () => {
    const workerPath = 'scripts/e2e/batch-allocation-native-worker.cjs';
    const allowlistPath = 'scripts/i18n/language-hardcoding-allowlist.json';
    const fixtureSource = "export const context = { locale: 'en-US' };\n";
    const fixtureEntry = () => {
      const document = JSON.parse(
        fs.readFileSync(path.join(REPOSITORY_ROOT, allowlistPath), 'utf8'),
      );
      const entry = document.entries.find(
        (candidate: Record<string, unknown>) =>
          candidate.permanentContract === 'controlled-native-batch-fixture-locale',
      );
      expect(entry).toBeDefined();
      return entry;
    };
    const writeAllowlist = (root: string, entry: Record<string, unknown>) =>
      writeFixtureFile(
        root,
        allowlistPath,
        JSON.stringify({
          schemaVersion: 'tiangong.i18n-language-hardcoding-allowlist.v2',
          entries: [entry],
        }),
      );

    it('accepts only the exact single synthetic browser locale node', () => {
      const root = initializeFixture();
      try {
        writeFixtureFile(root, workerPath, fixtureSource);
        writeAllowlist(root, fixtureEntry());
        const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
        const report = JSON.parse(result.stdout) as AuditReport;
        expect(result.status).toBe(0);
        expect(report.ok).toBe(true);
        expect(report.findings).toEqual([
          expect.objectContaining({ path: workerPath, ruleId: 'language-default' }),
        ]);
      } finally {
        fs.rmSync(root, { force: true, recursive: true });
      }
    });

    it.each([
      ['owner', { ownerIssue: '#1397' }],
      ['path', { path: 'scripts/e2e/other-native-worker.cjs' }],
      ['rule', { ruleId: 'language-equality' }],
      ['digest', { nodeTextDigest: '0'.repeat(64) }],
      ['match count', { maxMatches: 2 }],
    ])('rejects a changed permanent-contract %s', (_label, override) => {
      const root = initializeFixture();
      try {
        writeFixtureFile(root, workerPath, fixtureSource);
        writeAllowlist(root, { ...fixtureEntry(), ...override });
        const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
        const report = JSON.parse(result.stdout) as AuditReport;
        expect(result.status).toBe(1);
        expect(report.violations.map(({ code }) => code)).toContain('invalid-allowlist-entry');
      } finally {
        fs.rmSync(root, { force: true, recursive: true });
      }
    });

    it.each([
      ['export const context = {};\n', 'unused-allowlist-entry'],
      [
        "export const contexts = [{ locale: 'en-US' }, { locale: 'en-US' }];\n",
        'stale-allowlist-entry',
      ],
      ["export const context = { locale: 'zh-CN' };\n", 'unapproved-language-hardcoding'],
    ])('rejects changed fixture node cardinality or language: %s', (source, violation) => {
      const root = initializeFixture();
      try {
        writeFixtureFile(root, workerPath, source);
        writeAllowlist(root, fixtureEntry());
        const result = runAudit(root, ['--scope', 'hardcoding', '--check']);
        const report = JSON.parse(result.stdout) as AuditReport;
        expect(result.status).toBe(1);
        expect(report.violations.map(({ code }) => code)).toContain(violation);
      } finally {
        fs.rmSync(root, { force: true, recursive: true });
      }
    });
  });
});
