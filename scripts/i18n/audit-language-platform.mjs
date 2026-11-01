#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from '../typescript-native-parser.mjs';

const REPORT_SCHEMA_VERSION = 'tiangong.i18n-language-platform-audit.v1';
const ALLOWLIST_SCHEMA_VERSION = 'tiangong.i18n-language-hardcoding-allowlist.v2';
const DEFAULT_ALLOWLIST = 'scripts/i18n/language-hardcoding-allowlist.json';
const AUDIT_SCRIPT_PATH = 'scripts/i18n/audit-language-platform.mjs';

const PERMANENT_ALLOWLIST_CONTRACTS = {
  'frozen-german-delivery-evidence': (entry) =>
    entry.ownerIssue === '#601' &&
    /^scripts\/i18n\/(?:audit-german-(?:candidate|pilot)|german-(?:frozen-review-check|offline-review|runtime-(?:activation|delta-review|policy)))[.]mjs$/u.test(
      entry.path,
    ),
  'german-correction-ledger-boundary': (entry) =>
    entry.ownerIssue === '#606' && entry.path === 'scripts/i18n/locale-delivery.mjs',
  'standalone-icu-canonical-default': (entry) =>
    entry.ownerIssue === '#633' && entry.path === 'scripts/i18n/icu-message-parser.cjs',
  'controlled-native-batch-fixture-locale': (entry) =>
    entry.ownerIssue === '#1396' &&
    entry.path === 'scripts/e2e/batch-allocation-native-worker.cjs' &&
    entry.ruleId === 'language-default' &&
    entry.nodeTextDigest === 'fcdfc12193489dc23c2190f0d381989dd2722d69e2af08553d0013b77633bd61' &&
    entry.maxMatches === 1,
};

const PLATFORM_MODULES = {
  locale: 'src/services/general/localeRegistry.ts',
  content: 'src/services/general/contentLanguageRegistry.ts',
  capability: 'src/services/general/localeCapabilities.ts',
  reference: 'src/services/referenceResources/manifest.ts',
};
const GENERATED_REFERENCE_RESOURCE_MANIFEST =
  'src/services/referenceResources/generatedManifest.ts';

const SOURCE_OF_TRUTH_PATHS = new Set([
  PLATFORM_MODULES.locale,
  PLATFORM_MODULES.content,
  PLATFORM_MODULES.capability,
  PLATFORM_MODULES.reference,
  GENERATED_REFERENCE_RESOURCE_MANIFEST,
]);

const EQUALITY_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const LOGICAL_FALLBACK_OPERATORS = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

// Keep this deliberately narrow: these attributes render user-facing copy.
// Technical JSX metadata such as id, name, data-testid, and aria-controls must
// not become language-platform findings merely because their values are static.
const VISIBLE_LOCALIZED_JSX_ATTRIBUTE_NAMES = new Set(['placeholder']);

const RULE_IDS = new Set([
  'embedded-html-language-attribute',
  'language-array',
  'language-call-argument',
  'language-default',
  'language-element-access',
  'language-equality',
  'language-keyed-map',
  'language-option-list',
  'language-prefix-check',
  'language-reference-file',
  'language-return-literal',
  'language-switch-case',
  'language-union',
  'visible-jsx-string-prop',
]);

function usage() {
  return `Usage: node --import tsx scripts/i18n/audit-language-platform.mjs [options]

Options:
  --check                       run the fail-closed audit (accepted for CI readability)
  --mode <enforce|report>       enforce exits non-zero on violations (default: enforce)
  --scope <all|structure|hardcoding>
                                choose audit scope (default: all)
  --format <text|json>          output format (default: text)
  --root <path>                 repository root (default: current working directory)
  --allowlist <path>            exact allowlist path relative to root
  --help                        show this help
`;
}

function parseArgs(argv) {
  const options = {
    allowlist: DEFAULT_ALLOWLIST,
    format: 'text',
    mode: 'enforce',
    root: process.cwd(),
    scope: 'all',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (argument === '--check') continue;
    if (['--allowlist', '--format', '--mode', '--root', '--scope'].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      index += 1;
      options[
        {
          '--allowlist': 'allowlist',
          '--format': 'format',
          '--mode': 'mode',
          '--root': 'root',
          '--scope': 'scope',
        }[argument]
      ] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!['enforce', 'report'].includes(options.mode)) {
    throw new Error(`Invalid --mode: ${options.mode}`);
  }
  if (!['all', 'structure', 'hardcoding'].includes(options.scope)) {
    throw new Error(`Invalid --scope: ${options.scope}`);
  }
  if (!['json', 'text'].includes(options.format)) {
    throw new Error(`Invalid --format: ${options.format}`);
  }

  options.root = path.resolve(options.root);
  return options;
}

const toPosix = (value) => value.split(path.sep).join('/');
const relativePath = (root, absolutePath) => toPosix(path.relative(root, absolutePath));
const unique = (values) => [...new Set(values)];
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function addViolation(violations, code, message, details = {}) {
  violations.push({ code, message, ...details });
}

async function importPlatformModule(root, relativeModulePath) {
  const absolutePath = path.join(root, relativeModulePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing platform module: ${relativeModulePath}`);
  }
  return import(pathToFileURL(absolutePath).href);
}

async function loadPlatform(root, violations) {
  try {
    const [locale, content, capability, reference] = await Promise.all(
      Object.values(PLATFORM_MODULES).map((modulePath) => importPlatformModule(root, modulePath)),
    );
    return { locale, content, capability, reference };
  } catch (error) {
    addViolation(
      violations,
      'platform-module-load',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function assertUniqueField(rows, field, owner, violations) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row?.[field], (counts.get(row?.[field]) ?? 0) + 1));
  for (const [value, count] of counts) {
    if (typeof value !== 'string' || value.trim() === '') {
      addViolation(violations, 'invalid-registry-field', `${owner}.${field} must be non-empty.`);
    } else if (count > 1) {
      addViolation(
        violations,
        'duplicate-registry-field',
        `${owner}.${field} contains duplicate ${JSON.stringify(value)}.`,
      );
    }
  }
}

function assertExactSet(actual, expected, code, label, violations) {
  const actualValues = sorted(unique(actual));
  const expectedValues = sorted(unique(expected));
  if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
    addViolation(violations, code, `${label} is not an exact derived set.`, {
      actual: actualValues,
      expected: expectedValues,
    });
  }
}

function deriveContentReadingStatus(content) {
  const priorities = content.reading?.priority;
  if (content.reading?.enabled !== true || !Array.isArray(priorities) || priorities.length === 0) {
    return 'unsupported';
  }
  return priorities[0] === content.languageCode ? 'native' : 'declared-fallback';
}

const normalizeLocaleIdentifier = (value) => value.trim().toLowerCase();

function globPatternsOverlap(leftPattern, rightPattern) {
  const left = normalizeLocaleIdentifier(leftPattern);
  const right = normalizeLocaleIdentifier(rightPattern);
  const queue = [[0, 0]];
  const visited = new Set();

  while (queue.length > 0) {
    const [leftIndex, rightIndex] = queue.shift();
    const key = `${leftIndex}:${rightIndex}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (leftIndex === left.length && rightIndex === right.length) return true;

    const leftCharacter = left[leftIndex];
    const rightCharacter = right[rightIndex];
    if (leftCharacter === '*') queue.push([leftIndex + 1, rightIndex]);
    if (rightCharacter === '*') queue.push([leftIndex, rightIndex + 1]);

    if (leftIndex >= left.length || rightIndex >= right.length) continue;
    if (leftCharacter === '*' || rightCharacter === '*' || leftCharacter === rightCharacter) {
      const nextLeftIndex = leftCharacter === '*' ? leftIndex : leftIndex + 1;
      const nextRightIndex = rightCharacter === '*' ? rightIndex : rightIndex + 1;
      if (nextLeftIndex !== leftIndex || nextRightIndex !== rightIndex) {
        queue.push([nextLeftIndex, nextRightIndex]);
      }
    }
  }

  return false;
}

function localeIdentifierMatches(value, pattern) {
  const escapedPattern = normalizeLocaleIdentifier(pattern)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${escapedPattern}$`, 'u').test(normalizeLocaleIdentifier(value));
}

function localeOwnersForIdentifier(locales, value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return locales.filter(
    ({ aliases, canonicalLocale }) =>
      (typeof canonicalLocale === 'string' &&
        normalizeLocaleIdentifier(canonicalLocale) === normalizeLocaleIdentifier(value)) ||
      (Array.isArray(aliases) &&
        aliases.some(
          (alias) => typeof alias === 'string' && localeIdentifierMatches(value, alias),
        )),
  );
}

function auditLocaleIdentifierTopology(locales, violations) {
  const localePatterns = locales.flatMap(({ aliases, canonicalLocale }) =>
    typeof canonicalLocale === 'string' && canonicalLocale.trim() !== ''
      ? [
          { canonicalLocale, kind: 'canonicalLocale', pattern: canonicalLocale },
          ...(Array.isArray(aliases)
            ? aliases
                .filter((alias) => typeof alias === 'string' && alias.trim() !== '')
                .map((pattern) => ({ canonicalLocale, kind: 'alias', pattern }))
            : []),
        ]
      : [],
  );
  const reportedConflicts = new Set();

  for (let leftIndex = 0; leftIndex < localePatterns.length; leftIndex += 1) {
    const left = localePatterns[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < localePatterns.length; rightIndex += 1) {
      const right = localePatterns[rightIndex];
      if (
        left.canonicalLocale === right.canonicalLocale ||
        !globPatternsOverlap(left.pattern, right.pattern)
      ) {
        continue;
      }
      const conflictKey = sorted([
        `${left.canonicalLocale}:${left.kind}:${normalizeLocaleIdentifier(left.pattern)}`,
        `${right.canonicalLocale}:${right.kind}:${normalizeLocaleIdentifier(right.pattern)}`,
      ]).join('|');
      if (reportedConflicts.has(conflictKey)) continue;
      reportedConflicts.add(conflictKey);
      addViolation(
        violations,
        'locale-identifier-conflict',
        `${left.canonicalLocale} ${left.kind} ${JSON.stringify(left.pattern)} overlaps ` +
          `${right.canonicalLocale} ${right.kind} ${JSON.stringify(right.pattern)}.`,
      );
    }
  }

  const assertRoundTrip = (locale, kind, value) => {
    if (typeof value !== 'string' || value.trim() === '' || value.includes('*')) return;
    const owners = localeOwnersForIdentifier(locales, value).map(
      ({ canonicalLocale }) => canonicalLocale,
    );
    if (owners.length !== 1 || owners[0] !== locale.canonicalLocale) {
      addViolation(
        violations,
        kind === 'adapter' ? 'locale-adapter-roundtrip' : 'locale-identifier-roundtrip',
        `${locale.canonicalLocale} ${kind} ${JSON.stringify(value)} resolves to ` +
          `${owners.length === 0 ? 'no locale' : owners.join(', ')}.`,
      );
    }
  };

  for (const locale of locales) {
    assertRoundTrip(locale, 'canonicalLocale', locale.canonicalLocale);
    assertRoundTrip(locale, 'languageCode', locale.languageCode);
    for (const alias of Array.isArray(locale.aliases) ? locale.aliases : []) {
      assertRoundTrip(locale, 'alias', alias);
    }
    for (const value of Object.values(isObject(locale.adapters) ? locale.adapters : {})) {
      assertRoundTrip(locale, 'adapter', value);
    }
  }

  for (const adapter of ['antDesign', 'dayjs', 'intl', 'report']) {
    const ownersByValue = new Map();
    for (const locale of locales) {
      const value = locale.adapters?.[adapter];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const normalizedValue = normalizeLocaleIdentifier(value);
      const owners = ownersByValue.get(normalizedValue) ?? [];
      owners.push(locale.canonicalLocale);
      ownersByValue.set(normalizedValue, owners);
    }
    for (const [value, owners] of ownersByValue) {
      if (owners.length > 1) {
        addViolation(
          violations,
          'duplicate-locale-adapter',
          `${adapter} adapter ${JSON.stringify(value)} is owned by ${owners.join(', ')}.`,
        );
      }
    }
  }
}

function auditPlatformStructure(platform, violations) {
  if (!platform) return null;

  const locales = platform.locale.LOCALE_REGISTRY;
  const contents = platform.content.CONTENT_LANGUAGE_REGISTRY;
  const resources = platform.reference.REFERENCE_RESOURCE_MANIFEST;
  const capabilities = platform.capability.LOCALE_CAPABILITY_MATRIX;

  for (const [label, rows] of [
    ['LOCALE_REGISTRY', locales],
    ['CONTENT_LANGUAGE_REGISTRY', contents],
    ['REFERENCE_RESOURCE_MANIFEST', resources],
    ['LOCALE_CAPABILITY_MATRIX', capabilities],
  ]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      addViolation(violations, 'empty-platform-structure', `${label} must be a non-empty array.`);
    }
  }
  if (![locales, contents, resources, capabilities].every(Array.isArray)) return null;

  assertUniqueField(locales, 'canonicalLocale', 'LOCALE_REGISTRY', violations);
  assertUniqueField(locales, 'languageCode', 'LOCALE_REGISTRY', violations);
  assertUniqueField(contents, 'languageCode', 'CONTENT_LANGUAGE_REGISTRY', violations);
  assertUniqueField(resources, 'resourceId', 'REFERENCE_RESOURCE_MANIFEST', violations);
  assertUniqueField(capabilities, 'appLocale', 'LOCALE_CAPABILITY_MATRIX', violations);

  const appLocales = locales.map(({ canonicalLocale }) => canonicalLocale);
  const contentLanguages = contents.map(({ languageCode }) => languageCode);
  const requiredResources = resources
    .filter(({ required }) => required === true)
    .map(({ resourceId }) => resourceId);

  auditLocaleIdentifierTopology(locales, violations);

  assertExactSet(
    platform.locale.SUPPORTED_APP_LOCALES ?? [],
    appLocales,
    'supported-app-locales-drift',
    'SUPPORTED_APP_LOCALES',
    violations,
  );
  assertExactSet(
    platform.content.SUPPORTED_CONTENT_LANGUAGES ?? [],
    contentLanguages,
    'supported-content-languages-drift',
    'SUPPORTED_CONTENT_LANGUAGES',
    violations,
  );
  assertExactSet(
    platform.content.AUTHORING_CONTENT_LANGUAGES ?? [],
    contents
      .filter(({ authoring }) => authoring?.enabled === true)
      .map(({ languageCode }) => languageCode),
    'authoring-content-languages-drift',
    'AUTHORING_CONTENT_LANGUAGES',
    violations,
  );
  assertExactSet(
    platform.content.REQUIRED_CONTENT_LANGUAGES ?? [],
    contents
      .filter(({ authoring }) => authoring?.requiredForSave === true)
      .map(({ languageCode }) => languageCode),
    'required-content-languages-drift',
    'REQUIRED_CONTENT_LANGUAGES',
    violations,
  );
  assertExactSet(
    platform.reference.REQUIRED_REFERENCE_RESOURCE_IDS ?? [],
    requiredResources,
    'required-reference-resources-drift',
    'REQUIRED_REFERENCE_RESOURCE_IDS',
    violations,
  );

  if (!appLocales.includes(platform.locale.CANONICAL_SOURCE_APP_LOCALE)) {
    addViolation(
      violations,
      'missing-canonical-app-locale',
      'CANONICAL_SOURCE_APP_LOCALE must exist in LOCALE_REGISTRY.',
    );
  }
  if (!contentLanguages.includes(platform.content.CANONICAL_CONTENT_LANGUAGE)) {
    addViolation(
      violations,
      'missing-canonical-content-language',
      'CANONICAL_CONTENT_LANGUAGE must exist in CONTENT_LANGUAGE_REGISTRY.',
    );
  }
  if (!contentLanguages.includes(platform.content.TRANSLATION_SOURCE_CONTENT_LANGUAGE)) {
    addViolation(
      violations,
      'missing-translation-source-language',
      'TRANSLATION_SOURCE_CONTENT_LANGUAGE must exist in CONTENT_LANGUAGE_REGISTRY.',
    );
  }

  for (const locale of locales) {
    for (const field of ['englishName', 'chineseName', 'nativeLabel']) {
      if (typeof locale[field] !== 'string' || locale[field].trim() === '') {
        addViolation(
          violations,
          'missing-locale-label',
          `${locale.canonicalLocale} must declare ${field}.`,
        );
      }
    }
    if (!['ltr', 'rtl'].includes(locale.direction)) {
      addViolation(
        violations,
        'invalid-locale-direction',
        `${locale.canonicalLocale} has invalid direction.`,
      );
    }
    if (!Array.isArray(locale.aliases) || locale.aliases.length === 0) {
      addViolation(
        violations,
        'missing-locale-aliases',
        `${locale.canonicalLocale} must declare aliases.`,
      );
    }
    for (const objectName of ['adapters', 'formatting', 'fallbacks', 'environment']) {
      if (!isObject(locale[objectName])) {
        addViolation(
          violations,
          'missing-locale-contract',
          `${locale.canonicalLocale} must declare ${objectName}.`,
        );
      }
    }
    for (const adapter of ['antDesign', 'dayjs', 'intl', 'report']) {
      if (
        typeof locale.adapters?.[adapter] !== 'string' ||
        locale.adapters[adapter].trim() === ''
      ) {
        addViolation(
          violations,
          'missing-locale-adapter',
          `${locale.canonicalLocale} must declare ${adapter}.`,
        );
      }
    }
    for (const formattingField of ['listSeparator', 'twoItemConjunction', 'manyItemConjunction']) {
      if (
        typeof locale.formatting?.[formattingField] !== 'string' ||
        locale.formatting[formattingField] === ''
      ) {
        addViolation(
          violations,
          'missing-locale-formatting',
          `${locale.canonicalLocale} must declare ${formattingField}.`,
        );
      }
    }
    for (const fallbackField of ['documentationLocale', 'legalLocale']) {
      if (!appLocales.includes(locale.fallbacks?.[fallbackField])) {
        addViolation(
          violations,
          'unknown-locale-fallback',
          `${locale.canonicalLocale}.${fallbackField} must reference a registry locale.`,
        );
      }
    }
    for (const environmentField of ['titleKey', 'loginSubtitleKey']) {
      if (
        typeof locale.environment?.[environmentField] !== 'string' ||
        locale.environment[environmentField].trim() === ''
      ) {
        addViolation(
          violations,
          'missing-locale-environment-key',
          `${locale.canonicalLocale} must declare ${environmentField}.`,
        );
      }
    }
    const contentCapability = locale.contentCapability;
    const contentCapabilityStatus = contentCapability?.status;
    if (!['native', 'declared-fallback', 'unsupported'].includes(contentCapabilityStatus)) {
      addViolation(
        violations,
        'invalid-locale-content-capability',
        `${locale.canonicalLocale} must explicitly declare native, declared-fallback, or unsupported typed content.`,
      );
    } else if (contentCapabilityStatus === 'unsupported') {
      if (contentCapability.contentLanguage !== undefined) {
        addViolation(
          violations,
          'invalid-locale-content-capability',
          `${locale.canonicalLocale} cannot name a content language when typed content is unsupported.`,
        );
      }
    } else if (!contentLanguages.includes(contentCapability.contentLanguage)) {
      addViolation(
        violations,
        'unknown-locale-content-language',
        `${locale.canonicalLocale} references unknown content language ${contentCapability.contentLanguage}.`,
      );
    }
  }

  for (const content of contents) {
    for (const field of ['englishName', 'nativeLabel']) {
      if (typeof content[field] !== 'string' || content[field].trim() === '') {
        addViolation(
          violations,
          'missing-content-language-label',
          `${content.languageCode} must declare ${field}.`,
        );
      }
    }
    const priorities = content.reading?.priority;
    const readingIsValid =
      typeof content.reading?.enabled === 'boolean' &&
      Array.isArray(priorities) &&
      (content.reading.enabled
        ? priorities.length > 0 &&
          unique(priorities).length === priorities.length &&
          priorities.every((language) => contentLanguages.includes(language))
        : priorities.length === 0);
    if (!readingIsValid) {
      addViolation(
        violations,
        'invalid-content-reading-priority',
        `${content.languageCode} must declare a unique supported reading priority when enabled and an empty priority when disabled.`,
      );
    }
    if (
      typeof content.authoring?.enabled !== 'boolean' ||
      typeof content.authoring?.requiredForSave !== 'boolean' ||
      (content.authoring.requiredForSave && !content.authoring.enabled)
    ) {
      addViolation(
        violations,
        'invalid-content-authoring-capability',
        `${content.languageCode} has an inconsistent authoring contract.`,
      );
    }

    const query = content.serviceQuery;
    const resolvedIsKnown = contentLanguages.includes(query?.resolvedLanguage);
    const queryIsValid =
      (query?.status === 'native' &&
        query.resolvedLanguage === content.languageCode &&
        query.disclosure === 'none') ||
      (query?.status === 'declared-fallback' &&
        resolvedIsKnown &&
        query.resolvedLanguage !== content.languageCode &&
        query.disclosure !== 'none') ||
      (query?.status === 'unsupported' && query.resolvedLanguage === undefined);
    if (!queryIsValid) {
      addViolation(
        violations,
        'invalid-service-query-capability',
        `${content.languageCode} has an inconsistent serviceQuery contract.`,
      );
    }
  }

  if (!contents.some(({ authoring }) => authoring?.requiredForSave === true)) {
    addViolation(
      violations,
      'missing-required-authoring-language',
      'At least one content language must be required for save.',
    );
  }

  for (const resource of resources) {
    if (
      !['classification', 'location'].includes(resource.scope) ||
      typeof resource.identityStrategy !== 'string' ||
      resource.identityStrategy.trim() === '' ||
      typeof resource.cacheRevision !== 'string' ||
      resource.cacheRevision.trim() === '' ||
      !isObject(resource.provenance)
    ) {
      addViolation(
        violations,
        'invalid-reference-resource-contract',
        `${resource.resourceId} must declare scope, identity, cache revision, and provenance.`,
      );
    }
    if (!contentLanguages.includes(resource.baseLanguage)) {
      addViolation(
        violations,
        'unknown-reference-base-language',
        `${resource.resourceId} has unknown base language ${resource.baseLanguage}.`,
      );
    }
    const runtimeAssets = isObject(resource.runtimeAssets) ? resource.runtimeAssets : {};
    const localizations = isObject(resource.localizations) ? resource.localizations : {};
    if (!runtimeAssets[resource.baseLanguage]) {
      addViolation(
        violations,
        'missing-reference-base-asset',
        `${resource.resourceId} has no runtime asset for its base language.`,
      );
    }
    assertExactSet(
      Object.keys(localizations),
      contentLanguages,
      'reference-localization-coverage',
      `${resource.resourceId}.localizations`,
      violations,
    );

    for (const [language, asset] of Object.entries(runtimeAssets)) {
      if (
        !contentLanguages.includes(language) ||
        asset?.language !== language ||
        !asset?.fileName
      ) {
        addViolation(
          violations,
          'invalid-reference-runtime-asset',
          `${resource.resourceId} has an invalid runtime asset for ${language}.`,
        );
      }
    }

    for (const language of contentLanguages) {
      const availability = localizations[language];
      if (!availability) continue;
      if (availability.status === 'native') {
        if (!runtimeAssets[availability.assetLanguage] || !availability.deliveryStatus) {
          addViolation(
            violations,
            'missing-native-reference-asset',
            `${resource.resourceId}/${language} references a missing native asset.`,
          );
        }
      } else if (availability.status === 'development-base') {
        if (
          !runtimeAssets[availability.resolvedLanguage] ||
          !availability.ownerIssue ||
          !availability.diagnostic
        ) {
          addViolation(
            violations,
            'invalid-reference-fallback',
            `${resource.resourceId}/${language} has an invalid development fallback.`,
          );
        }
      } else if (
        availability.status !== 'missing' ||
        !availability.ownerIssue ||
        !availability.diagnostic
      ) {
        addViolation(
          violations,
          'invalid-reference-localization-status',
          `${resource.resourceId}/${language} has an invalid localization status.`,
        );
      }
    }
  }

  assertExactSet(
    capabilities.map(({ appLocale }) => appLocale),
    appLocales,
    'capability-locale-coverage',
    'LOCALE_CAPABILITY_MATRIX locales',
    violations,
  );

  for (const row of capabilities) {
    const locale = locales.find(({ canonicalLocale }) => canonicalLocale === row.appLocale);
    const declaredCapability = locale?.contentCapability;
    if (!locale || !declaredCapability) {
      addViolation(
        violations,
        'invalid-capability-locale-mapping',
        `${row.appLocale} capability row has no matching locale declaration.`,
      );
      continue;
    }

    if (declaredCapability.status === 'unsupported') {
      if (
        row.uiCatalog !== 'native' ||
        row.contentLanguage !== undefined ||
        row.contentReading !== 'unsupported' ||
        row.contentAuthoring !== 'unsupported' ||
        row.serviceQuery?.status !== 'unsupported' ||
        row.serviceQuery?.resolvedLanguage !== undefined ||
        row.serviceQuery?.disclosure !== 'none' ||
        !Array.isArray(row.referenceResources) ||
        row.referenceResources.length !== 0
      ) {
        addViolation(
          violations,
          'capability-content-or-service-drift',
          `${row.appLocale} must preserve its explicitly unsupported typed-content boundary.`,
        );
      }
      continue;
    }

    const content = contents.find(
      ({ languageCode }) => languageCode === declaredCapability.contentLanguage,
    );
    if (!content || row.contentLanguage !== declaredCapability.contentLanguage) {
      addViolation(
        violations,
        'invalid-capability-locale-mapping',
        `${row.appLocale} capability row does not resolve its declared content language.`,
      );
      continue;
    }
    const expectedReadingStatus =
      declaredCapability.status === 'declared-fallback'
        ? 'declared-fallback'
        : deriveContentReadingStatus(content);
    const expectedAuthoringStatus =
      declaredCapability.status === 'native' && content.authoring.enabled
        ? 'native'
        : 'unsupported';
    if (
      row.uiCatalog !== 'native' ||
      row.contentReading !== expectedReadingStatus ||
      row.contentAuthoring !== expectedAuthoringStatus ||
      row.serviceQuery?.status !== content.serviceQuery?.status ||
      row.serviceQuery?.resolvedLanguage !== content.serviceQuery?.resolvedLanguage ||
      row.serviceQuery?.disclosure !== content.serviceQuery?.disclosure
    ) {
      addViolation(
        violations,
        'capability-content-or-service-drift',
        `${row.appLocale} content-reading, authoring, or service-query capability drifted from CONTENT_LANGUAGE_REGISTRY.`,
      );
    }
    const resourceCapabilities = Array.isArray(row.referenceResources)
      ? row.referenceResources
      : [];
    assertExactSet(
      resourceCapabilities.map(({ resourceId }) => resourceId),
      requiredResources,
      'capability-reference-coverage',
      `${row.appLocale}.referenceResources`,
      violations,
    );
    for (const resourceId of requiredResources) {
      const resource = resources.find((candidate) => candidate.resourceId === resourceId);
      const expected = resource?.localizations?.[content.languageCode];
      const actual = resourceCapabilities.find((candidate) => candidate.resourceId === resourceId);
      const statusMatches = expected && actual && actual.status === expected.status;
      const detailsMatch =
        expected?.status === 'native'
          ? actual?.requestedLanguage === content.languageCode &&
            actual?.resolvedLanguage === expected.assetLanguage &&
            actual?.deliveryStatus === expected.deliveryStatus &&
            actual?.ownerIssue ===
              (expected.deliveryStatus === 'official' ||
              expected.deliveryStatus === 'project-reviewed'
                ? undefined
                : resource?.provenance?.ownerIssue)
          : expected?.status === 'development-base'
            ? actual?.requestedLanguage === content.languageCode &&
              actual?.resolvedLanguage === expected.resolvedLanguage &&
              actual?.ownerIssue === expected.ownerIssue
            : expected?.status === 'missing'
              ? actual?.requestedLanguage === content.languageCode &&
                actual?.resolvedLanguage === undefined &&
                actual?.ownerIssue === expected.ownerIssue
              : false;
      if (!statusMatches || !detailsMatch) {
        addViolation(
          violations,
          'capability-reference-status-drift',
          `${row.appLocale}/${resourceId} drifted from REFERENCE_RESOURCE_MANIFEST.`,
        );
      }
    }
  }

  return {
    appLocaleCount: appLocales.length,
    contentLanguageCount: contentLanguages.length,
    referenceResourceCount: resources.length,
    requiredReferenceResourceCount: requiredResources.length,
    capabilityRowCount: capabilities.length,
  };
}

function walkFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else if (entry.isFile() && predicate(absolutePath)) files.push(absolutePath);
    }
  };
  walk(directory);
  return files;
}

function sourceFiles(root) {
  const extensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
  const isScannable = (absolutePath) =>
    extensions.has(path.extname(absolutePath)) &&
    !relativePath(root, absolutePath).endsWith('.d.ts');
  const srcFiles = walkFiles(path.join(root, 'src'), (absolutePath) => {
    const relative = relativePath(root, absolutePath);
    return (
      extensions.has(path.extname(absolutePath)) &&
      !relative.includes('/.umi') &&
      !relative.includes('/__tests__/') &&
      !/\.(?:test|spec)\.[^.]+$/u.test(relative) &&
      !relative.endsWith('.d.ts') &&
      !relative.startsWith('src/locales/') &&
      !SOURCE_OF_TRUTH_PATHS.has(relative)
    );
  });
  const scriptFiles = walkFiles(path.join(root, 'scripts'), (absolutePath) => {
    const relative = relativePath(root, absolutePath);
    return extensions.has(path.extname(absolutePath)) && relative !== AUDIT_SCRIPT_PATH;
  });
  const configFiles = walkFiles(path.join(root, 'config'), isScannable);
  const sharedTestInfrastructureFiles = walkFiles(
    path.join(root, 'tests/helpers/i18n'),
    isScannable,
  );
  return [...srcFiles, ...scriptFiles, ...configFiles, ...sharedTestInfrastructureFiles];
}

function scriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current)))
  ) {
    current = current.expression;
  }
  return current;
}

function staticString(node) {
  const current = unwrap(node);
  return current && (ts.isStringLiteralLike(current) || ts.isNoSubstitutionTemplateLiteral(current))
    ? current.text
    : null;
}

function isLexicalBindingScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node)
  );
}

function lexicalBindingScope(node) {
  let current = node.parent;
  while (current && !isLexicalBindingScope(current)) current = current.parent;
  return current;
}

function createStaticStringResolver(sourceFile) {
  const bindingsByScope = new Map();

  const collect = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const scope = lexicalBindingScope(node);
      if (scope) {
        const bindings = bindingsByScope.get(scope) ?? new Map();
        // A non-literal const is recorded as null so it shadows an outer
        // literal with the same name instead of producing a false finding.
        bindings.set(node.name.text, staticString(node.initializer));
        bindingsByScope.set(scope, bindings);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  return (node) => {
    const literal = staticString(node);
    if (literal !== null) return literal;
    const current = unwrap(node);
    if (!current || !ts.isIdentifier(current)) return null;

    let ancestor = current.parent;
    while (ancestor) {
      if (isLexicalBindingScope(ancestor)) {
        const bindings = bindingsByScope.get(ancestor);
        if (bindings?.has(current.text)) return bindings.get(current.text);
      }
      ancestor = ancestor.parent;
    }
    return null;
  };
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function languageishText(value) {
  return /(?:^|[^a-z])(?:lang(?:uage)?|locale|translation)(?:[^a-z]|$)/iu.test(
    value.replace(/([a-z])([A-Z])/gu, '$1 $2'),
  );
}

function languageishExpression(node, sourceFile) {
  if (!node) return false;
  const text = node.getText(sourceFile);
  return (
    languageishText(text) ||
    /(?:translations|moduleOwnership|localeTopology)/u.test(text) ||
    text.includes('@xml:lang')
  );
}

function looksLikeLocaleFallbackLiteral(value) {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  if (candidate === '' || /^(?:ltr|rtl)$/iu.test(candidate)) return false;

  // Recognise registry-external BCP 47 and POSIX-style locale literals so a
  // newly introduced language cannot bypass the audit merely because its
  // token has not been added to the registry yet. The language-like LHS check
  // remains the semantic guard against ordinary two-letter business values.
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*(?:\.[A-Za-z0-9_-]+)?(?:@[A-Za-z0-9_-]+)?$/u.test(
    candidate,
  );
}

function normalizedNodeText(node, sourceFile) {
  return node.getText(sourceFile).replace(/\s+/gu, ' ').trim();
}

function digestNodeText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function embeddedHtmlRootHasStaticLanguageAttribute(node, sourceFile) {
  const current = unwrap(node);
  const documentText = ts.isStringLiteralLike(current)
    ? current.text
    : ts.isTemplateExpression(current)
      ? current.getText(sourceFile)
      : null;
  if (!documentText) return false;

  const rootTagMatch = documentText.match(/<html\b[^>]*>/iu);
  if (!rootTagMatch) return false;

  const rootTag = rootTagMatch[0];
  const languageMatch = rootTag.match(
    /\slang\s*=\s*(?:"([^"$<>{}]+)"|'([^'$<>{}]+)'|([^\s"'=<>${}]+))/iu,
  );
  const directionMatch = rootTag.match(
    /\sdir\s*=\s*(?:"(ltr|rtl)"|'(ltr|rtl)'|(ltr|rtl)(?=\s|>))/iu,
  );
  const language = languageMatch?.[1] ?? languageMatch?.[2] ?? languageMatch?.[3];
  const direction = directionMatch?.[1] ?? directionMatch?.[2] ?? directionMatch?.[3];

  return (language !== undefined && language.trim() !== '') || direction !== undefined;
}

function buildKnownLanguageTokens(platform) {
  const tokens = new Set();
  for (const locale of platform?.locale?.LOCALE_REGISTRY ?? []) {
    tokens.add(locale.canonicalLocale);
    tokens.add(locale.languageCode);
    Object.values(locale.adapters ?? {}).forEach((value) => tokens.add(value));
    for (const alias of locale.aliases ?? []) {
      if (!alias.includes('*')) tokens.add(alias);
    }
  }
  for (const content of platform?.content?.CONTENT_LANGUAGE_REGISTRY ?? []) {
    tokens.add(content.languageCode);
  }
  return new Set([...tokens].filter(Boolean).map((value) => String(value).toLowerCase()));
}

function scanHardcoding(root, platform, violations) {
  const knownTokens = buildKnownLanguageTokens(platform);
  const findings = [];
  const files = sourceFiles(root);
  const findingKeys = new Set();

  const isKnown = (value) => typeof value === 'string' && knownTokens.has(value.toLowerCase());

  for (const absolutePath of files) {
    const relative = relativePath(root, absolutePath);
    const text = fs.readFileSync(absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolutePath),
    );
    for (const diagnostic of sourceFile.parseDiagnostics ?? []) {
      const position = diagnostic.start ?? 0;
      const location = sourceFile.getLineAndCharacterOfPosition(position);
      addViolation(
        violations,
        'hardcoding-scan-parse-error',
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        { path: relative, line: location.line + 1, column: location.character + 1 },
      );
    }
    const staticValue = createStaticStringResolver(sourceFile);

    const addFinding = (ruleId, node) => {
      const nodeText = normalizedNodeText(node, sourceFile);
      const nodeTextDigest = digestNodeText(nodeText);
      const key = `${ruleId}:${relative}:${node.getStart(sourceFile)}`;
      if (findingKeys.has(key)) return;
      findingKeys.add(key);
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push({
        ruleId,
        path: relative,
        line: location.line + 1,
        column: location.character + 1,
        nodeText,
        nodeTextDigest,
      });
    };

    const visit = (node) => {
      if (ts.isBinaryExpression(node) && EQUALITY_OPERATORS.has(node.operatorToken.kind)) {
        const left = staticValue(node.left);
        const right = staticValue(node.right);
        if (
          (isKnown(left) && languageishExpression(node.right, sourceFile)) ||
          (isKnown(right) && languageishExpression(node.left, sourceFile))
        ) {
          addFinding('language-equality', node);
        }
      }

      if (
        ts.isBinaryExpression(node) &&
        LOGICAL_FALLBACK_OPERATORS.has(node.operatorToken.kind) &&
        languageishExpression(node.left, sourceFile) &&
        (isKnown(staticValue(node.right)) ||
          looksLikeLocaleFallbackLiteral(staticValue(node.right)))
      ) {
        addFinding('language-default', node);
      }

      if (
        (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) &&
        embeddedHtmlRootHasStaticLanguageAttribute(node, sourceFile)
      ) {
        addFinding('embedded-html-language-attribute', node);
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const receiver = node.expression.expression;
        if (
          ['startsWith', 'endsWith'].includes(method) &&
          languageishExpression(receiver, sourceFile) &&
          node.arguments.some((argument) => isKnown(staticValue(argument)))
        ) {
          addFinding('language-prefix-check', node);
        } else if (
          languageishExpression(node.expression, sourceFile) &&
          !['localeCompare', 'toLocaleLowerCase', 'toLocaleUpperCase'].includes(method) &&
          node.arguments.some((argument) => isKnown(staticValue(argument)))
        ) {
          addFinding('language-call-argument', node);
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (
          languageishText(node.expression.text) &&
          node.arguments.some((argument) => isKnown(staticValue(argument)))
        ) {
          addFinding('language-call-argument', node);
        }
      }

      if (ts.isCaseClause(node)) {
        const switchStatement = node.parent?.parent;
        if (
          switchStatement &&
          ts.isSwitchStatement(switchStatement) &&
          languageishExpression(switchStatement.expression, sourceFile) &&
          isKnown(staticValue(node.expression))
        ) {
          addFinding('language-switch-case', node);
        }
      }

      if (ts.isUnionTypeNode(node)) {
        const languages = node.types
          .filter(ts.isLiteralTypeNode)
          .map(({ literal }) => staticString(literal))
          .filter(isKnown);
        if (unique(languages).length >= 2) addFinding('language-union', node);
      }

      if (ts.isArrayLiteralExpression(node)) {
        const directLanguages = node.elements.map(staticValue).filter(isKnown);
        if (unique(directLanguages).length >= 2) addFinding('language-array', node);

        const optionLanguages = node.elements
          .filter(ts.isObjectLiteralExpression)
          .flatMap((element) =>
            element.properties
              .filter(ts.isPropertyAssignment)
              .filter((property) =>
                [
                  'appLocale',
                  'canonicalLocale',
                  'language',
                  'languageCode',
                  'locale',
                  'value',
                ].includes(propertyName(property.name)),
              )
              .map((property) => staticValue(property.initializer))
              .filter(isKnown),
          );
        if (unique(optionLanguages).length >= 2) addFinding('language-option-list', node);
      }

      if (ts.isObjectLiteralExpression(node)) {
        const languageKeys = node.properties
          .map((property) => propertyName(property.name))
          .filter(isKnown);
        if (unique(languageKeys).length >= 2) addFinding('language-keyed-map', node);
      }

      if (ts.isElementAccessExpression(node)) {
        if (
          isKnown(staticValue(node.argumentExpression)) &&
          languageishExpression(node.expression, sourceFile)
        ) {
          addFinding('language-element-access', node);
        }
      }

      if (ts.isStringLiteralLike(node)) {
        const baseLanguages = [...knownTokens].filter((token) => /^[a-z]{2}$/u.test(token));
        const marker = baseLanguages
          .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
          .join('|');
        const referenceAssetPattern = new RegExp(
          `(?:Classification|Categorization|Locations).*_(?:${marker})[.]min[.]json[.]gz$`,
          'iu',
        );
        if (marker && referenceAssetPattern.test(node.text)) {
          addFinding('language-reference-file', node);
        }
      }

      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        const name = ts.isIdentifier(node.name) ? node.name.text : '';
        if (languageishText(name) && isKnown(staticValue(node.initializer))) {
          addFinding('language-default', node);
        }
      }

      if (ts.isPropertyAssignment(node)) {
        const name = propertyName(node.name) ?? '';
        const languageScopedDefault =
          name === 'default' &&
          ts.isObjectLiteralExpression(node.parent) &&
          ts.isPropertyAssignment(node.parent.parent) &&
          languageishText(propertyName(node.parent.parent.name) ?? '');
        if (
          (languageishText(name) || languageScopedDefault) &&
          isKnown(staticValue(node.initializer))
        ) {
          addFinding('language-default', node);
        }
      }

      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sourceFile);
        const value = node.initializer
          ? ts.isStringLiteral(node.initializer)
            ? node.initializer.text
            : ts.isJsxExpression(node.initializer)
              ? staticValue(node.initializer.expression)
              : null
          : null;
        if (languageishText(name) && isKnown(value)) addFinding('language-default', node);
        if (
          VISIBLE_LOCALIZED_JSX_ATTRIBUTE_NAMES.has(name.toLowerCase()) &&
          typeof value === 'string' &&
          value.trim().length > 0
        ) {
          addFinding('visible-jsx-string-prop', node);
        }
      }

      if (ts.isReturnStatement(node) && isKnown(staticValue(node.expression))) {
        let current = node.parent;
        let functionName = '';
        while (current) {
          if (
            ts.isFunctionDeclaration(current) ||
            ts.isMethodDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current)
          ) {
            functionName = current.name?.getText(sourceFile) ?? '';
            if (!functionName && ts.isVariableDeclaration(current.parent)) {
              functionName = current.parent.name.getText(sourceFile);
            }
            break;
          }
          current = current.parent;
        }
        if (languageishText(functionName)) addFinding('language-return-literal', node);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return {
    files,
    findings: findings.sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.line - right.line ||
        left.column - right.column ||
        left.ruleId.localeCompare(right.ruleId),
    ),
  };
}

function readAllowlist(root, allowlistPath, violations) {
  const absolutePath = path.resolve(root, allowlistPath);
  let document;
  try {
    document = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    addViolation(
      violations,
      'allowlist-read-error',
      `Cannot read ${relativePath(root, absolutePath)}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
  if (document.schemaVersion !== ALLOWLIST_SCHEMA_VERSION || !Array.isArray(document.entries)) {
    addViolation(
      violations,
      'invalid-allowlist-schema',
      `${relativePath(root, absolutePath)} must use ${ALLOWLIST_SCHEMA_VERSION}.`,
    );
    return [];
  }

  const exactKeys = new Set();
  document.entries.forEach((entry, index) => {
    const label = `allowlist entry ${index}`;
    const commonKeys = [
      'ruleId',
      'path',
      'nodeTextDigest',
      'maxMatches',
      'ownerIssue',
      'reason',
      'status',
    ];
    const requiredKeys =
      entry?.status === 'temporary'
        ? [...commonKeys, 'expiresOn']
        : entry?.status === 'permanent-contract'
          ? [...commonKeys, 'permanentContract']
          : commonKeys;
    const hasExactShape =
      isObject(entry) &&
      JSON.stringify(sorted(Object.keys(entry))) === JSON.stringify(sorted(requiredKeys));
    if (!hasExactShape) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} has unexpected fields.`);
      return;
    }
    if (!RULE_IDS.has(entry.ruleId)) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} has unknown ruleId.`);
    }
    if (!entry.path || path.isAbsolute(entry.path) || /[*?]/u.test(entry.path)) {
      addViolation(
        violations,
        'invalid-allowlist-entry',
        `${label} path must be an exact repository-relative path.`,
      );
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.nodeTextDigest)) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} has invalid nodeTextDigest.`);
    }
    if (!Number.isInteger(entry.maxMatches) || entry.maxMatches < 1) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} has invalid maxMatches.`);
    }
    if (!/^#\d+$/u.test(entry.ownerIssue)) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} must declare ownerIssue.`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
      addViolation(violations, 'invalid-allowlist-entry', `${label} must explain the exception.`);
    }
    if (!['temporary', 'permanent-contract'].includes(entry.status)) {
      addViolation(
        violations,
        'invalid-allowlist-entry',
        `${label} must declare temporary or permanent-contract status.`,
      );
    } else if (entry.status === 'temporary') {
      const validDate =
        typeof entry.expiresOn === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/u.test(entry.expiresOn) &&
        !Number.isNaN(Date.parse(`${entry.expiresOn}T00:00:00.000Z`)) &&
        new Date(`${entry.expiresOn}T00:00:00.000Z`).toISOString().slice(0, 10) === entry.expiresOn;
      if (!validDate) {
        addViolation(
          violations,
          'invalid-allowlist-entry',
          `${label} temporary waiver must declare an ISO expiresOn date.`,
        );
      } else {
        const today = new Date().toISOString().slice(0, 10);
        if (entry.expiresOn <= today) {
          addViolation(
            violations,
            'expired-allowlist-entry',
            `${label} expired on ${entry.expiresOn}.`,
          );
        }
      }
    } else {
      const permanentContract = PERMANENT_ALLOWLIST_CONTRACTS[entry.permanentContract];
      if (!permanentContract || !permanentContract(entry)) {
        addViolation(
          violations,
          'invalid-allowlist-entry',
          `${label} has an unknown or incompatible permanentContract.`,
        );
      }
    }
    const exactKey = `${entry.ruleId}:${entry.path}:${entry.nodeTextDigest}`;
    if (exactKeys.has(exactKey)) {
      addViolation(violations, 'duplicate-allowlist-entry', `${label} duplicates ${exactKey}.`);
    }
    exactKeys.add(exactKey);
  });
  return document.entries;
}

function applyAllowlist(findings, entries, violations) {
  const findingCounts = new Map();
  const allowlisted = [];
  const unapproved = [];
  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.path}:${finding.nodeTextDigest}`;
    const entry = entries.find(
      (candidate) =>
        candidate.ruleId === finding.ruleId &&
        candidate.path === finding.path &&
        candidate.nodeTextDigest === finding.nodeTextDigest,
    );
    if (!entry) {
      unapproved.push(finding);
      continue;
    }
    findingCounts.set(key, (findingCounts.get(key) ?? 0) + 1);
    allowlisted.push(finding);
  }

  for (const finding of unapproved) {
    addViolation(
      violations,
      'unapproved-language-hardcoding',
      `${finding.path}:${finding.line}:${finding.column} ${finding.ruleId} is not allowlisted.`,
      finding,
    );
  }

  const stale = [];
  for (const entry of entries) {
    const key = `${entry.ruleId}:${entry.path}:${entry.nodeTextDigest}`;
    const count = findingCounts.get(key) ?? 0;
    if (count !== entry.maxMatches) {
      stale.push({ ...entry, actualMatches: count });
      addViolation(
        violations,
        count === 0 ? 'unused-allowlist-entry' : 'stale-allowlist-entry',
        `${entry.path} ${entry.ruleId} expected exactly ${entry.maxMatches} match(es), found ${count}.`,
        { entry, actualMatches: count },
      );
    }
  }

  return { allowlisted, stale, unapproved };
}

function renderText(report) {
  const lines = [
    `Language platform audit: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Scope: ${report.scope}`,
  ];
  if (report.platform) {
    lines.push(
      `Platform: ${report.platform.appLocaleCount} app locales, ${report.platform.contentLanguageCount} content languages, ${report.platform.requiredReferenceResourceCount}/${report.platform.referenceResourceCount} required reference resources`,
    );
  }
  if (report.hardcoding) {
    lines.push(
      `Hardcoding: ${report.hardcoding.findingCount} finding(s), ${report.hardcoding.allowlistedCount} allowlisted, ${report.hardcoding.unapprovedCount} unapproved, ${report.hardcoding.staleAllowlistCount} stale/unused`,
    );
  }
  for (const violation of report.violations) {
    lines.push(`- [${violation.code}] ${violation.message}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const violations = [];
  const platform = await loadPlatform(options.root, violations);
  const structureSummary =
    options.scope === 'hardcoding' ? null : auditPlatformStructure(platform, violations);

  let hardcodingSummary = null;
  let findings = [];
  if (options.scope !== 'structure') {
    const scan = scanHardcoding(options.root, platform, violations);
    findings = scan.findings;
    const entries = readAllowlist(options.root, options.allowlist, violations);
    const result = applyAllowlist(findings, entries, violations);
    hardcodingSummary = {
      scannedFileCount: scan.files.length,
      findingCount: findings.length,
      allowlistedCount: result.allowlisted.length,
      unapprovedCount: result.unapproved.length,
      staleAllowlistCount: result.stale.length,
    };
  }

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    scope: options.scope,
    ok: violations.length === 0,
    platform: structureSummary,
    hardcoding: hardcodingSummary,
    violations,
    findings,
  };

  process.stdout.write(
    options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderText(report),
  );
  if (options.mode === 'enforce' && !report.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
