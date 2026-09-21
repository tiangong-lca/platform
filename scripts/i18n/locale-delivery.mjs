#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { getImportReportContentAuditDescriptor } from '../../src/components/ImportTidasPackage/reportContent.ts';
import { TRANSLATION_SOURCE_CONTENT_LANGUAGE } from '../../src/services/general/contentLanguageRegistry.ts';
import { getLocaleCapability } from '../../src/services/general/localeCapabilities.ts';
import {
  CANONICAL_SOURCE_APP_LOCALE,
  getLocaleDefinition,
  getLocaleDefinitionByLanguage,
  SUPPORTED_APP_LOCALES,
} from '../../src/services/general/localeRegistry.ts';
import { REFERENCE_RESOURCE_MANIFEST as REFERENCE_RESOURCES } from '../../src/services/referenceResources/manifest.ts';
import {
  resolveLocaleArtifactSharedAuditMode,
  resolveLocaleArtifactTargets,
} from './locale-artifact-targets.ts';
import ts from '../typescript-native-parser.mjs';

const require = createRequire(import.meta.url);
const prettier = require('prettier');

const AUDIT_SCRIPT = 'scripts/i18n/audit-locales.mjs';
const CANONICAL_MANIFEST = 'docs/plans/i18n-de-DE/manifest.json';
const CORRECTION_LEDGER = 'docs/plans/i18n/corrections.json';
const DYNAMIC_FAMILIES = 'docs/plans/i18n-de-DE/dynamic-families.json';
const ROUTE_VIEW_COVERAGE = 'docs/plans/i18n/route-view-coverage.json';
const FALLBACK_CONTRACT = 'docs/plans/i18n/fallback-contract.json';
const IMPORT_REPORT_CONTENT_SOURCE = 'src/components/ImportTidasPackage/reportContent.ts';
const CONTENT_LANGUAGE_REGISTRY = 'src/services/general/contentLanguageRegistry.ts';
const LOCALE_CAPABILITY_MATRIX = 'src/services/general/localeCapabilities.ts';
const REFERENCE_RESOURCE_MANIFEST = 'src/services/referenceResources/manifest.ts';
const REFERENCE_RESOURCE_SOURCE_MANIFEST =
  'src/services/referenceResources/reference-resource-manifest.json';
const REFERENCE_RESOURCE_GENERATED_MANIFEST =
  'src/services/referenceResources/generatedManifest.ts';
const REFERENCE_RESOURCE_PIPELINE = 'scripts/reference-data/reference-resource-pipeline.mjs';
const REFERENCE_RESOURCE_RESOLVER = 'src/services/referenceResources/resolver.ts';
const LANGUAGE_PLATFORM_AUDIT = 'scripts/i18n/audit-language-platform.mjs';
const LANGUAGE_HARDCODING_ALLOWLIST = 'scripts/i18n/language-hardcoding-allowlist.json';
const PRIVATE_CONFIRMATION_PATTERN = /\.local\/.+confirmation/iu;
const TRANSLATION_SOURCE_APP_LOCALE = getLocaleDefinitionByLanguage(
  TRANSLATION_SOURCE_CONTENT_LANGUAGE,
)?.canonicalLocale;
if (!TRANSLATION_SOURCE_APP_LOCALE) {
  throw new Error('Translation source content language has no registered app locale.');
}
const REQUIRED_FALLBACK_SURFACES = [
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
const SEMANTIC_E2E_BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);
const SEMANTIC_E2E_EVIDENCE_SCHEMA = 'tiangong.i18n-semantic-e2e-evidence.v2';
const SEMANTIC_E2E_PROOF_SCOPES = new Set([
  'internal-localization',
  'access-boundary-observed',
  'declared-fallback-observed',
]);
const SEMANTIC_E2E_IGNORED_RUNTIME_DIRECTORIES = new Set([
  '.auth',
  'playwright-report',
  'runtime',
  'test-results',
]);
const SEMANTIC_E2E_RUNTIME_ASSET_MANIFESTS = Object.freeze([
  'src/services/referenceResources/generatedManifest.ts',
  'src/services/referenceResources/manifest.ts',
  'src/services/referenceResources/reference-resource-manifest.json',
]);
const SEMANTIC_E2E_CRITICAL_SOURCE_PATHS = Object.freeze([
  'src/components/LocationTextItem/description.tsx',
  'src/components/RightContent/index.tsx',
]);
const SEMANTIC_E2E_CRITICAL_TEST_PATHS = Object.freeze([
  'docs/plans/i18n/semantic-e2e-evidence.schema.json',
  'scripts/i18n/locale-delivery.mjs',
  'tests/data-workflows/data-workflow-paths.ts',
  'tests/data-workflows/workflows/workflow-shared.ts',
  'tests/unit/components/LocationTextItemDescription.test.tsx',
  'tests/unit/components/RightContent.test.tsx',
  'tests/unit/e2e/evidenceReporter.test.ts',
  'tests/unit/e2e/productionDataLedger.test.ts',
  'tests/unit/e2e/productionRequestGuard.test.ts',
  'tests/unit/services/general/routeViewStateRegistry.test.ts',
]);
const SEMANTIC_E2E_DEPENDENCY_LOCK = 'pnpm-lock.yaml';
const SEMANTIC_E2E_PNPM_WORKSPACE = 'pnpm-workspace.yaml';
const SEMANTIC_E2E_TRACKED_ENVIRONMENT = '.env';
const LOCALE_ARTIFACT_DEPENDENCIES = Object.freeze({
  context: Object.freeze([]),
  structuralValidation: Object.freeze(['context']),
  quality: Object.freeze(['context', 'structuralValidation']),
  activation: Object.freeze(['context', 'quality']),
});

function topologicalArtifactOrder(dependencies) {
  const order = [];
  const visiting = new Set();
  const visited = new Set();

  const visit = (artifact) => {
    if (visited.has(artifact)) return;
    if (visiting.has(artifact)) {
      throw new Error(`Locale artifact dependency cycle detected at ${artifact}.`);
    }
    const artifactDependencies = dependencies[artifact];
    if (!artifactDependencies) {
      throw new Error(`Unknown locale artifact dependency: ${artifact}.`);
    }
    visiting.add(artifact);
    for (const dependency of artifactDependencies) {
      if (!Object.hasOwn(dependencies, dependency)) {
        throw new Error(`${artifact} depends on unknown locale artifact ${dependency}.`);
      }
      visit(dependency);
    }
    visiting.delete(artifact);
    visited.add(artifact);
    order.push(artifact);
  };

  for (const artifact of Object.keys(dependencies)) visit(artifact);
  return Object.freeze(order);
}

const LOCALE_ARTIFACT_TOPOLOGICAL_ORDER = topologicalArtifactOrder(LOCALE_ARTIFACT_DEPENDENCIES);

const ACTIONS = new Set([
  'audit',
  'manifest',
  'context',
  'quality',
  'corrections',
  'activation',
  'artifacts',
  'all',
  'dossier',
]);

function usage() {
  return `Usage: node --import tsx scripts/i18n/locale-delivery.mjs <action> [options]

Actions:
  audit         run the shared exact locale audit and verify the requested locale
  manifest      write or check the shared canonical source manifest
  context       write or check the compact locale context manifest
  quality       write or check the compact automated quality manifest
  corrections   check the tracked existing-translation correction overlay
  activation    write or check the compact runtime activation manifest
  artifacts     write context, structural validation, quality, and activation manifests
                in dependency order
  all           check context, quality, and activation for every registry locale
  dossier       print one reproducible full message dossier without writing it

Options:
  --locale <locale>  canonical locale from the typed registry; required for per-locale
                     actions, optional legacy compatibility for the shared manifest,
                     and an artifacts target override (all registry locales when omitted)
  --message <id>     exact message ID (required for dossier)
  --root <path>      repository root (default: current working directory)
  --write            write the selected deterministic artifact
  --check            check the selected deterministic artifact (default)
  --require-production-ready
                     fail when the checked activation manifest has unresolved blockers
  --help             show this help
`;
}

function parseArgs(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const action = argv[0];
  if (!ACTIONS.has(action)) throw new Error(`Unknown action: ${action ?? '(missing)'}`);

  const options = {
    action,
    root: process.cwd(),
    locale: undefined,
    message: undefined,
    write: false,
    check: false,
    requireProductionReady: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--require-production-ready') options.requireProductionReady = true;
    else if (argument === '--locale' || argument === '--root' || argument === '--message') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      options[argument === '--locale' ? 'locale' : argument === '--message' ? 'message' : 'root'] =
        value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.write && options.check) throw new Error('--write and --check cannot be combined');
  if (!options.write && !options.check) options.check = true;
  options.root = path.resolve(options.root);

  if (
    action !== 'corrections' &&
    action !== 'all' &&
    action !== 'artifacts' &&
    action !== 'manifest'
  ) {
    if (!options.locale) throw new Error('--locale is required for this action');
  }
  if (options.locale && action !== 'corrections' && action !== 'all') {
    const definition = getLocaleDefinition(options.locale);
    if (!definition || definition.canonicalLocale !== options.locale) {
      throw new Error(
        `--locale must be canonical; expected one of ${SUPPORTED_APP_LOCALES.join(', ')}`,
      );
    }
  }
  if (action === 'audit' && options.write) throw new Error('audit does not support --write');
  if (action === 'all' && options.write) throw new Error('all does not support --write');
  if (options.requireProductionReady && !['activation', 'all'].includes(action)) {
    throw new Error('--require-production-ready is supported only for activation and all');
  }
  if (action === 'dossier' && !options.message)
    throw new Error('--message is required for dossier');
  if (action === 'dossier' && options.write) throw new Error('dossier does not support --write');
  if (action === 'corrections' && options.write) {
    throw new Error('corrections are human-readable tracked dossiers and are never generated');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function digestJson(value) {
  return sha256(`${JSON.stringify(stable(value))}\n`);
}

function readText(root, relativeFile) {
  return fs.readFileSync(path.resolve(root, relativeFile), 'utf8');
}

function readJson(root, relativeFile) {
  return JSON.parse(readText(root, relativeFile));
}

function fileDigest(root, relativeFile) {
  return sha256(fs.readFileSync(path.resolve(root, relativeFile)));
}

function gitText(root, commit, relativeFile) {
  return execFileSync('git', ['show', `${commit}:${relativeFile}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function gitLocaleCatalogDigest(root, commit, locale) {
  const files = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', commit, `src/locales/${locale}`, `src/locales/${locale}.ts`],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const relativeFile of files) {
    hash.update(relativeFile);
    hash.update('\0');
    hash.update(
      execFileSync('git', ['show', `${commit}:${relativeFile}`], {
        cwd: root,
        encoding: null,
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
    hash.update('\0');
  }
  return hash.digest('hex');
}

function dependencyIdentityMatchesCurrentRuntime(evidence, expectedDigests) {
  return (
    evidence.digests.dependencyLock.sha256 === expectedDigests.dependencyLock.sha256 &&
    evidence.digests.pnpmWorkspace.sha256 === expectedDigests.pnpmWorkspace.sha256
  );
}

function planDirectory(locale) {
  return `docs/plans/i18n-${locale}`;
}

function localePaths(locale) {
  const directory = planDirectory(locale);
  return {
    directory,
    glossary: `${directory}/glossary.json`,
    styleGuide: `${directory}/style-guide.md`,
    context: `${directory}/context-manifest.json`,
    quality: `${directory}/quality-manifest.json`,
    activation: `${directory}/locale-activation-manifest.json`,
    structuralValidation: `${directory}/structural-validation.json`,
  };
}

async function formattedJson(root, relativeFile, value) {
  return prettier.format(JSON.stringify(value), {
    ...(await prettier.resolveConfig(path.resolve(root, relativeFile))),
    filepath: path.resolve(root, relativeFile),
  });
}

async function writeOrCheckJson(root, relativeFile, value, options) {
  const absoluteFile = path.resolve(root, relativeFile);
  const rendered = await formattedJson(root, relativeFile, value);
  if (options.write) {
    fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
    fs.writeFileSync(absoluteFile, rendered);
    return { path: relativeFile, wrote: true, stale: false };
  }
  const stale = !fs.existsSync(absoluteFile) || fs.readFileSync(absoluteFile, 'utf8') !== rendered;
  return { path: relativeFile, wrote: false, stale };
}

function assertSharedManifest(manifest, locale) {
  if (manifest?.summary?.enforceable !== true || manifest?.summary?.violationCount !== 0) {
    throw new Error('The shared locale manifest contains enforceable findings.');
  }
  const topology = manifest?.localeTopology?.[locale];
  const sourceTopology = manifest?.localeTopology?.[CANONICAL_SOURCE_APP_LOCALE];
  if (!topology || !sourceTopology) throw new Error(`Manifest does not include ${locale}.`);
  if (JSON.stringify(topology.leafModules) !== JSON.stringify(sourceTopology.leafModules)) {
    throw new Error(`${locale} leaf-module topology differs from the canonical source locale.`);
  }
  if (topology.spreadOrderAligned !== true) {
    throw new Error(`${locale} top-level spread order is not aligned.`);
  }
  const expectedCount = manifest.summary.canonicalCandidateKeyCount;
  if (manifest.summary.localeUniqueKeyCounts?.[locale] !== expectedCount) {
    throw new Error(`${locale} does not have exact key parity with the canonical source locale.`);
  }
}

function runSharedAudit(root, mode) {
  const args = [
    '--import',
    'tsx',
    AUDIT_SCRIPT,
    '--mode',
    'enforce',
    mode === 'write' ? '--write' : '--check',
  ];
  if (mode === 'write') {
    const ledger = readJson(root, CORRECTION_LEDGER);
    args.push('--base-ref', ledger.baselineSha);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error(`Shared locale audit failed with status ${result.status}.`);
  }
  return JSON.parse(result.stdout);
}

function runLanguagePlatformAudit(root) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', LANGUAGE_PLATFORM_AUDIT, '--scope', 'all', '--check'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error(`Language-platform audit failed with status ${result.status}.`);
  }
}

function parseTypeScriptSource(root, relativeFile) {
  const source = readText(root, relativeFile);
  return {
    source,
    sourceFile: ts.createSourceFile(
      relativeFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      relativeFile.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  };
}

function propertyNameText(property) {
  const name = property?.name;
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) {
    return name.text;
  }
  return undefined;
}

function objectProperty(object, name) {
  return object?.properties?.find((property) => propertyNameText(property) === name);
}

function collectStringConstants(sourceFile) {
  const constants = new Map();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      constants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return constants;
}

function expressionString(expression, constants, sourceFile) {
  if (!expression) return undefined;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression)) return constants.get(expression.text);
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      value +=
        expressionString(span.expression, constants, sourceFile) ??
        `\${${span.expression.getText(sourceFile)}}`;
      value += span.literal.text;
    }
    return value;
  }
  return undefined;
}

function collectRouteConfigEvidence(root, relativeFile) {
  const { sourceFile } = parseTypeScriptSource(root, relativeFile);
  const constants = collectStringConstants(sourceFile);
  const definitions = [];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const pathProperty = objectProperty(node, 'path');
      const routePath = expressionString(pathProperty?.initializer, constants, sourceFile);
      if (routePath) {
        const redirectProperty = objectProperty(node, 'redirect');
        const componentProperty = objectProperty(node, 'component');
        const keepQueryProperty = objectProperty(node, 'keepQuery');
        definitions.push({
          path: routePath,
          redirect: expressionString(redirectProperty?.initializer, constants, sourceFile) ?? null,
          component:
            expressionString(componentProperty?.initializer, constants, sourceFile) ?? null,
          keepQuery: keepQueryProperty?.initializer?.kind === ts.SyntaxKind.TrueKeyword,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return {
    definitions,
    configuredPaths: [...new Set(definitions.map(({ path: routePath }) => routePath))].sort(),
    digest: digestJson(definitions),
  };
}

function collectAnonymousRoutePolicyEvidence(root) {
  const relativeFile = 'src/services/general/publicRoutePolicy.ts';
  const { source, sourceFile } = parseTypeScriptSource(root, relativeFile);
  const constants = collectStringConstants(sourceFile);
  let allowedPaths = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'ANONYMOUS_ROUTE_PATHS' &&
      node.initializer
    ) {
      const initializer = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isArrayLiteralExpression(initializer)) {
        allowedPaths = initializer.elements
          .map((element) => expressionString(element, constants, sourceFile))
          .filter(Boolean);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (allowedPaths.length === 0) {
    throw new Error('Anonymous-route policy must expose its explicit allowlist.');
  }
  if (!source.includes('anonymousRoutePaths.has(pathname)')) {
    throw new Error('Anonymous-route policy must fail closed through exact allowlist membership.');
  }
  return {
    allowedPaths,
    defaultAccess: 'authenticated-session-required',
    unknownPathAccess: 'authenticated-session-required',
    sourcePath: relativeFile,
  };
}

function semanticSignalsFromText(value) {
  const normalized = String(value)
    .replace(/([a-z])([A-Z])/gu, '$1-$2')
    .toLocaleLowerCase('en-US');
  const signals = [];
  if (/(?:loading|spinning|pending)/u.test(normalized)) signals.push('loading');
  if (/(?:error|failure|failed|invalid|wrong)/u.test(normalized)) signals.push('error');
  if (/(?:empty|no-data|no-results)/u.test(normalized)) signals.push('empty');
  if (/(?:success|complete|completed)/u.test(normalized)) signals.push('success');
  if (/(?:ready|loaded)/u.test(normalized)) signals.push('ready');
  if (/(?:unavailable|expired|missing|not-found)/u.test(normalized)) signals.push('unavailable');
  if (/(?:retry|reload|request-new)/u.test(normalized)) signals.push('retry');
  if (/(?:modal|drawer|dialog)/u.test(normalized)) signals.push('modal');
  if (/(?:dark-mode|is-dark)/u.test(normalized)) signals.push('dark');
  return signals;
}

function collectSourceDerivation(root, relativeFile, referencedMessages) {
  const extension = path.extname(relativeFile);
  const source = readText(root, relativeFile);
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
    return {
      sourcePath: relativeFile,
      sourceDigest: fileDigest(root, relativeFile),
      messageIds: [],
      navigationTargets: [],
      queryParameters: [],
      interactionKinds: [],
      stateSignals: [],
      acceptedTechnicalLiterals: [],
      unownedVisibleLiterals: [],
    };
  }
  const { sourceFile } = parseTypeScriptSource(root, relativeFile);
  const constants = collectStringConstants(sourceFile);
  const navigationTargets = new Set();
  const queryParameters = new Set();
  const interactionKinds = new Set();
  const stateSignals = new Set();
  const visibleLiterals = [];
  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/gu, ' ').trim();
      if (value && /[\p{L}\p{N}]/u.test(value)) visibleLiterals.push(value);
    }
    if (ts.isJsxAttribute(node)) {
      const attributeName = propertyNameText(node);
      if (
        ['alt', 'title', 'placeholder', 'aria-label'].includes(attributeName) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        visibleLiterals.push(node.initializer.text);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile).split('.').at(-1);
      if (['Alert', 'Drawer', 'Modal', 'Spin', 'Tabs', 'Tooltip'].includes(tagName)) {
        interactionKinds.add(tagName.toLocaleLowerCase('en-US'));
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const callee = node.initializer.expression.getText(sourceFile);
      if (/(?:^|\.)useState$/u.test(callee) && ts.isIdentifier(node.name)) {
        for (const signal of semanticSignalsFromText(node.name.text)) stateSignals.add(signal);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText(sourceFile);
      if (['push', 'replace'].includes(method)) {
        const target = expressionString(node.arguments[0], constants, sourceFile);
        if (target?.startsWith('/')) navigationTargets.add(target);
      }
      if (method === 'get' && /(?:searchParams|getHashSearchParams)/iu.test(receiver)) {
        const parameter = expressionString(node.arguments[0], constants, sourceFile);
        if (parameter) queryParameters.add(parameter);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^set[A-Z]/u.test(node.expression.text)
    ) {
      const stateValue = expressionString(node.arguments[0], constants, sourceFile);
      for (const signal of semanticSignalsFromText(stateValue ?? node.expression.text)) {
        stateSignals.add(signal);
      }
    }
    if (ts.isJsxAttribute(node) && ['href', 'to'].includes(propertyNameText(node))) {
      const target =
        node.initializer && ts.isStringLiteral(node.initializer)
          ? node.initializer.text
          : node.initializer && ts.isJsxExpression(node.initializer)
            ? expressionString(node.initializer.expression, constants, sourceFile)
            : undefined;
      if (target?.startsWith('/')) navigationTargets.add(target);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  for (const message of referencedMessages) {
    for (const signal of semanticSignalsFromText(message.id)) stateSignals.add(signal);
  }
  const acceptedTechnicalLiterals = [...new Set(visibleLiterals.filter(isTechnicalOrProperName))];
  const unownedVisibleLiterals = [
    ...new Set(visibleLiterals.filter((value) => !isTechnicalOrProperName(value))),
  ];
  return {
    sourcePath: relativeFile,
    sourceDigest: sha256(source),
    messageIds: referencedMessages.map(({ id }) => id).sort(),
    navigationTargets: [...navigationTargets].sort(),
    queryParameters: [...queryParameters].sort(),
    interactionKinds: [...interactionKinds].sort(),
    stateSignals: [...stateSignals].sort(),
    acceptedTechnicalLiterals,
    unownedVisibleLiterals,
  };
}

function routeRowMatchesMessage(row, message) {
  const ids = row.copySources.localeMessageIds ?? [];
  const prefixes = row.copySources.localeMessageIdPrefixes ?? [];
  const sourcePaths = new Set(row.copySources.sourcePaths ?? []);
  return (
    ids.includes(message.id) ||
    prefixes.some((prefix) => message.id.startsWith(prefix)) ||
    message.references.some((reference) => sourcePaths.has(reference.path))
  );
}

function stateSignalCovered(signal, visibleStates) {
  const normalized = visibleStates.join(' ').toLocaleLowerCase('en-US');
  const aliases = {
    loading: ['loading', 'spinning', 'pending'],
    error: ['error', 'failure', 'invalid'],
    empty: ['empty', 'no-data', 'no-results'],
    success: ['success', 'complete', 'ready'],
    ready: ['ready', 'form', 'overview', 'success'],
    unavailable: ['unavailable', 'expired', 'fallback', 'error'],
    retry: ['retry', 'reload', 'recovery', 'action'],
    modal: ['modal', 'drawer', 'dialog'],
    dark: ['dark', 'theme'],
  };
  return aliases[signal].some((alias) => normalized.includes(alias));
}

function assertRecordShape(value, requiredKeys, optionalKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (missingKeys.length > 0 || unknownKeys.length > 0) {
    throw new Error(
      `${label} has an invalid shape (missing: ${missingKeys.join(', ') || 'none'}; unknown: ${unknownKeys.join(', ') || 'none'}).`,
    );
  }
}

function assertExactSequence(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must exactly match ${expected.join(', ')}.`);
  }
}

function collectEvidenceFiles(root, relativeDirectory, include = () => true) {
  const absoluteDirectory = path.resolve(root, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  const files = [];
  const visit = (absolutePath) => {
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      if (entry.isDirectory() && SEMANTIC_E2E_IGNORED_RUNTIME_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const entryPath = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && include(entryPath)) {
        files.push(path.relative(root, entryPath).split(path.sep).join('/'));
      }
    }
  };
  visit(absoluteDirectory);
  return files.sort();
}

function semanticRuntimeAssetPaths(root) {
  const gzipAssets = ['public/classifications', 'public/locations'].flatMap((directory) =>
    collectEvidenceFiles(root, directory, (absolutePath) => absolutePath.endsWith('.gz')),
  );
  const paths = [...new Set([...SEMANTIC_E2E_RUNTIME_ASSET_MANIFESTS, ...gzipAssets])].sort();
  if (gzipAssets.length === 0) {
    throw new Error('Semantic E2E evidence has no classification/location runtime assets.');
  }
  return paths;
}

function trackedBackendTarget(root) {
  const candidateEnvironment = readText(root, SEMANTIC_E2E_TRACKED_ENVIRONMENT);
  const trackedMainEnvironment = gitText(root, 'origin/main', SEMANTIC_E2E_TRACKED_ENVIRONMENT);
  const parseBackend = (environment) => {
    const values = parseEnv(environment);
    const url = values.SUPABASE_URL?.trim();
    const publishableKey = values.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !publishableKey) {
      throw new Error('Environment does not define a complete production backend target.');
    }
    try {
      return { origin: new URL(url).origin, publishableKey };
    } catch {
      throw new Error('Environment has an invalid production backend target.');
    }
  };
  const candidate = parseBackend(candidateEnvironment);
  const trackedMain = parseBackend(trackedMainEnvironment);
  if (
    candidate.origin !== trackedMain.origin ||
    candidate.publishableKey !== trackedMain.publishableKey
  ) {
    throw new Error('Candidate backend target differs from tracked main production.');
  }
  return {
    candidateEnvironmentDigest: sha256(candidateEnvironment),
    originDigest: sha256(trackedMain.origin),
    publishableKeyDigest: sha256(trackedMain.publishableKey),
    trackedMainEnvironmentDigest: sha256(trackedMainEnvironment),
  };
}

function playwrightRequiresFreshServer(root) {
  const source = readText(root, 'playwright.config.ts');
  const sourceFile = ts.createSourceFile(
    'playwright.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const values = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'reuseExistingServer') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'reuseExistingServer'))
    ) {
      values.push(node.initializer.kind);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values.length === 1 && values[0] === ts.SyntaxKind.FalseKeyword;
}

function playwrightDisablesFailurePageSnapshots(root) {
  const source = readText(root, 'playwright.config.ts');
  return /process\.env\.PLAYWRIGHT_NO_COPY_PROMPT\s*=\s*['"]1['"]/u.test(source);
}

function playwrightBlocksServiceWorkers(root) {
  const source = readText(root, 'playwright.config.ts');
  return /serviceWorkers\s*:\s*['"]block['"]/u.test(source);
}

function playwrightTestDirectory(root) {
  const source = readText(root, 'playwright.config.ts');
  const sourceFile = ts.createSourceFile(
    'playwright.config.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const values = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'testDir') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'testDir'))
    ) {
      values.push(
        ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)
          ? path.resolve(root, node.initializer.text)
          : null,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values.length === 1 ? values[0] : null;
}

function routeCoverageContractDigest(coverage) {
  return digestJson({
    schemaVersion: coverage.schemaVersion,
    supportedLocales: coverage.supportedLocales,
    sourceRouteConfig: coverage.sourceRouteConfig,
    policy: coverage.policy,
    executableTargets: coverage.executableTargets,
    executableViewVariants: coverage.executableViewVariants,
    viewStateRegistry: coverage.viewStateRegistry,
    assertionSemantics: coverage.proofPolicy?.assertionSemantics,
    evidenceContract: coverage.proofPolicy?.evidenceContract,
    routeFamilies: coverage.routeFamilies,
    rows: coverage.rows,
  });
}

function expectedSemanticEvidenceDigests(root, routeRows, evidenceContract) {
  const focusedTestPaths = routeRows.flatMap((row) => row.proof.focusedTests ?? []);
  const semanticE2EPaths = collectEvidenceFiles(
    root,
    evidenceContract.digestPolicy.semanticE2ERoot,
  );
  const testPaths = [
    ...new Set([
      ...focusedTestPaths,
      ...semanticE2EPaths,
      ...SEMANTIC_E2E_CRITICAL_TEST_PATHS,
      ...evidenceContract.digestPolicy.additionalTestPaths,
    ]),
  ].sort();
  const sourcePaths = [
    ...new Set([
      ...routeRows.flatMap((row) => row.copySources.sourcePaths ?? []),
      ...SEMANTIC_E2E_CRITICAL_SOURCE_PATHS,
      ...evidenceContract.digestPolicy.criticalSourcePaths,
    ]),
  ].sort();
  for (const relativeFile of [...testPaths, ...sourcePaths]) {
    if (!fs.existsSync(path.resolve(root, relativeFile))) {
      throw new Error(`Semantic E2E evidence requires missing digest source ${relativeFile}.`);
    }
  }
  const toDigests = (relativeFiles) =>
    relativeFiles.map((relativeFile) => ({
      path: relativeFile,
      sha256: fileDigest(root, relativeFile),
    }));
  const runtimeAssetPaths = semanticRuntimeAssetPaths(root);
  return {
    dependencyLock: toDigests([SEMANTIC_E2E_DEPENDENCY_LOCK])[0],
    pnpmWorkspace: toDigests([SEMANTIC_E2E_PNPM_WORKSPACE])[0],
    runtimeAssets: toDigests(runtimeAssetPaths),
    tests: toDigests(testPaths),
    sources: toDigests(sourcePaths),
  };
}

function assertExactFileDigests(actual, expected, label, { requireCurrentBindings = true } = {}) {
  if (!Array.isArray(actual)) throw new Error(`${label} must be an array.`);
  const actualPaths = actual.map((entry) => entry?.path);
  if (
    actualPaths.some((entryPath) => typeof entryPath !== 'string' || entryPath.length === 0) ||
    new Set(actualPaths).size !== actualPaths.length ||
    JSON.stringify(actualPaths) !== JSON.stringify([...actualPaths].sort())
  ) {
    throw new Error(`${label} paths must be non-empty, unique, and sorted.`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    const actualEntry = actual[index];
    assertRecordShape(actualEntry, ['path', 'sha256'], [], `${label}[${index}]`);
    if (!/^[0-9a-f]{64}$/u.test(actualEntry.sha256)) {
      throw new Error(`${label} contains an invalid digest for ${actualEntry.path}.`);
    }
  }
  if (!requireCurrentBindings) return;
  if (JSON.stringify(actualPaths) !== JSON.stringify(expected.map((entry) => entry.path))) {
    throw new Error(`${label} paths do not exactly close the required file set.`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const actualEntry = actual[index];
    const expectedEntry = expected[index];
    if (actualEntry.sha256 !== expectedEntry.sha256) {
      throw new Error(`${label} contains a digest mismatch for ${expectedEntry.path}.`);
    }
  }
}

function validateSemanticEvidenceContract(root, coverage, routeRows) {
  const contract = coverage.proofPolicy?.evidenceContract;
  if (!contract) throw new Error('Route-view coverage has no semantic E2E evidence contract.');
  assertRecordShape(
    contract,
    [
      'schemaVersion',
      'schemaPath',
      'evidencePath',
      'requiredAssertionCount',
      'requiredLocales',
      'requiredBrowsers',
      'browserCoverage',
      'target',
      'productionData',
      'digestPolicy',
    ],
    [],
    'Semantic E2E evidence contract',
  );
  if (contract.schemaVersion !== SEMANTIC_E2E_EVIDENCE_SCHEMA) {
    throw new Error('Semantic E2E evidence contract uses an unsupported schema.');
  }
  if (typeof contract.evidencePath !== 'string' || !contract.evidencePath.startsWith('.local/')) {
    throw new Error('Semantic E2E evidence must be emitted under an ignored local artifact path.');
  }
  if (contract.requiredAssertionCount !== routeRows.length) {
    throw new Error('Semantic E2E evidence assertion count differs from route/view coverage.');
  }
  assertExactSequence(
    contract.requiredLocales,
    SUPPORTED_APP_LOCALES,
    'Semantic E2E contract locales',
  );
  assertExactSequence(
    contract.requiredBrowsers,
    SEMANTIC_E2E_BROWSERS,
    'Semantic E2E contract browsers',
  );
  if (
    contract.target?.frontend !== 'candidate-local' ||
    contract.target?.backend !== 'production'
  ) {
    throw new Error(
      'Semantic E2E evidence must target a candidate-local frontend and production backend.',
    );
  }
  if (
    contract.productionData?.markerPrefix !== 'codex-e2e' ||
    contract.productionData?.exactCreated !== 1 ||
    contract.productionData?.requireCreatedAndCleaned !== true ||
    contract.productionData?.maximumLeaked !== 0
  ) {
    throw new Error('Semantic E2E production-data policy must require exact codex-e2e cleanup.');
  }
  if (
    contract.browserCoverage?.fullRouteViewBrowser !== 'chromium' ||
    JSON.stringify(contract.browserCoverage?.criticalBrowsers) !==
      JSON.stringify(SEMANTIC_E2E_BROWSERS) ||
    !Array.isArray(contract.browserCoverage?.criticalAssertionIds)
  ) {
    throw new Error('Semantic E2E browser coverage policy is incomplete.');
  }
  const requiredAssertionIds = new Set(routeRows.map((row) => row.executableAssertionId));
  if (
    contract.browserCoverage.criticalAssertionIds.length === 0 ||
    new Set(contract.browserCoverage.criticalAssertionIds).size !==
      contract.browserCoverage.criticalAssertionIds.length ||
    contract.browserCoverage.criticalAssertionIds.some(
      (assertionId) => !requiredAssertionIds.has(assertionId),
    )
  ) {
    throw new Error('Semantic E2E critical browser assertions differ from route/view coverage.');
  }
  if (
    typeof contract.digestPolicy?.semanticE2ERoot !== 'string' ||
    !Array.isArray(contract.digestPolicy?.additionalTestPaths) ||
    !Array.isArray(contract.digestPolicy?.criticalSourcePaths)
  ) {
    throw new Error('Semantic E2E digest policy is incomplete.');
  }
  const semanticE2ERoot = path.resolve(root, contract.digestPolicy.semanticE2ERoot);
  const relativeSemanticE2ERoot = path.relative(root, semanticE2ERoot);
  if (
    playwrightTestDirectory(root) !== semanticE2ERoot ||
    relativeSemanticE2ERoot === '..' ||
    relativeSemanticE2ERoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeSemanticE2ERoot) ||
    collectEvidenceFiles(root, contract.digestPolicy.semanticE2ERoot).length === 0
  ) {
    throw new Error(
      'Semantic E2E digest root must be a non-empty repository directory matching Playwright testDir.',
    );
  }
  if (!fs.existsSync(path.resolve(root, contract.schemaPath))) {
    throw new Error(`Semantic E2E evidence schema is missing: ${contract.schemaPath}.`);
  }
  const schema = readJson(root, contract.schemaPath);
  if (
    schema?.properties?.schemaVersion?.const !== SEMANTIC_E2E_EVIDENCE_SCHEMA ||
    schema?.properties?.target?.properties?.frontend?.const !== 'candidate-local' ||
    schema?.properties?.target?.properties?.backend?.const !== 'production' ||
    schema?.properties?.target?.properties?.proof?.properties?.observer?.const !==
      'chromium-auth-request' ||
    !schema?.required?.includes('candidate') ||
    !schema?.properties?.digests?.required?.includes('dependencyLock') ||
    !schema?.properties?.digests?.required?.includes('pnpmWorkspace') ||
    !schema?.properties?.digests?.required?.includes('runtimeAssets')
  ) {
    throw new Error('Semantic E2E evidence schema differs from the executable contract.');
  }
  if (!playwrightRequiresFreshServer(root)) {
    throw new Error('Semantic E2E evidence runs must never reuse a local frontend server.');
  }
  if (!playwrightDisablesFailurePageSnapshots(root)) {
    throw new Error('Authenticated semantic E2E runs must not persist automatic page snapshots.');
  }
  if (!playwrightBlocksServiceWorkers(root)) {
    throw new Error('Semantic E2E request guards require service workers to be blocked.');
  }
  return contract;
}

function validateSemanticE2EEvidence(
  root,
  coverage,
  routeRows,
  descriptor,
  evidenceContract,
  { requireCurrentBindings = false } = {},
) {
  if (
    !descriptor?.path ||
    descriptor.path !== evidenceContract.evidencePath ||
    !/^[0-9a-f]{64}$/u.test(descriptor.sha256 ?? '') ||
    !fs.existsSync(path.resolve(root, descriptor.path)) ||
    fileDigest(root, descriptor.path) !== descriptor.sha256
  ) {
    throw new Error('Semantic browser proof contains missing or digest-mismatched evidence.');
  }
  const evidence = readJson(root, descriptor.path);
  assertRecordShape(
    evidence,
    [
      'schemaVersion',
      'status',
      'generatedAt',
      'runId',
      'candidate',
      'target',
      'locales',
      'browsers',
      'routeCoverage',
      'digests',
      'assertions',
      'productionData',
    ],
    [],
    'Semantic E2E evidence',
  );
  if (evidence.schemaVersion !== SEMANTIC_E2E_EVIDENCE_SCHEMA || evidence.status !== 'verified') {
    throw new Error('Semantic E2E evidence is not a verified v2 execution record.');
  }
  if (
    typeof evidence.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(evidence.generatedAt)) ||
    typeof evidence.runId !== 'string' ||
    !/^(?:github-[0-9]+-[0-9]+|local-[0-9a-f-]{36})$/u.test(evidence.runId)
  ) {
    throw new Error('Semantic E2E evidence has no valid run identity.');
  }
  assertRecordShape(
    evidence.candidate,
    [
      'configTreeDigest',
      'observedHeadCommit',
      'packageManifestDigest',
      'sourceTreeDigest',
      'unitTestTreeDigest',
    ],
    [],
    'Semantic E2E candidate identity',
  );
  if (
    !/^[0-9a-f]{40}$/u.test(evidence.candidate.observedHeadCommit ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.candidate.configTreeDigest ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.candidate.packageManifestDigest ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.candidate.sourceTreeDigest ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.candidate.unitTestTreeDigest ?? '')
  ) {
    throw new Error('Semantic E2E evidence has an invalid candidate identity.');
  }
  assertRecordShape(evidence.target, ['frontend', 'backend', 'proof'], [], 'Semantic E2E target');
  if (
    evidence.target.frontend !== evidenceContract.target.frontend ||
    evidence.target.backend !== evidenceContract.target.backend
  ) {
    throw new Error('Semantic E2E evidence did not execute candidate-local against production.');
  }
  assertRecordShape(
    evidence.target.proof,
    [
      'backendObservedOriginSha256',
      'backendObservedPublishableKeySha256',
      'backendTrackedOriginSha256',
      'backendTrackedPublishableKeySha256',
      'candidateEnvironmentSha256',
      'frontendOriginSha256',
      'freshPlaywrightServer',
      'observer',
      'trackedMainEnvironmentSha256',
    ],
    [],
    'Semantic E2E target proof',
  );
  const trackedBackend = trackedBackendTarget(root);
  if (
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.backendObservedOriginSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.backendTrackedOriginSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.backendObservedPublishableKeySha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.backendTrackedPublishableKeySha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.candidateEnvironmentSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.trackedMainEnvironmentSha256 ?? '') ||
    !/^[0-9a-f]{64}$/u.test(evidence.target.proof.frontendOriginSha256 ?? '') ||
    evidence.target.proof.frontendOriginSha256 ===
      evidence.target.proof.backendObservedOriginSha256 ||
    evidence.target.proof.freshPlaywrightServer !== true ||
    evidence.target.proof.observer !== 'chromium-auth-request' ||
    !playwrightRequiresFreshServer(root) ||
    !playwrightDisablesFailurePageSnapshots(root) ||
    !playwrightBlocksServiceWorkers(root)
  ) {
    throw new Error(
      'Semantic E2E target proof does not bind a fresh local candidate to the tracked production backend.',
    );
  }
  if (
    requireCurrentBindings &&
    (evidence.target.proof.backendObservedOriginSha256 !== trackedBackend.originDigest ||
      evidence.target.proof.backendTrackedOriginSha256 !== trackedBackend.originDigest ||
      evidence.target.proof.backendObservedPublishableKeySha256 !==
        trackedBackend.publishableKeyDigest ||
      evidence.target.proof.backendTrackedPublishableKeySha256 !==
        trackedBackend.publishableKeyDigest ||
      evidence.target.proof.candidateEnvironmentSha256 !==
        trackedBackend.candidateEnvironmentDigest ||
      evidence.target.proof.trackedMainEnvironmentSha256 !==
        trackedBackend.trackedMainEnvironmentDigest)
  ) {
    throw new Error(
      'Semantic E2E target proof is not bound to the current tracked production backend.',
    );
  }
  assertExactSequence(evidence.locales, SUPPORTED_APP_LOCALES, 'Semantic E2E evidence locales');
  assertExactSequence(evidence.browsers, SEMANTIC_E2E_BROWSERS, 'Semantic E2E evidence browsers');
  assertRecordShape(
    evidence.routeCoverage,
    ['path', 'contractDigest'],
    [],
    'Semantic E2E route coverage binding',
  );
  const contractDigest = routeCoverageContractDigest(coverage);
  if (
    evidence.routeCoverage.path !== ROUTE_VIEW_COVERAGE ||
    evidence.routeCoverage.contractDigest !== contractDigest
  ) {
    throw new Error('Semantic E2E evidence is not bound to the current route/view contract.');
  }
  assertRecordShape(
    evidence.digests,
    ['dependencyLock', 'pnpmWorkspace', 'runtimeAssets', 'tests', 'sources'],
    [],
    'Semantic E2E digests',
  );
  const expectedDigests = expectedSemanticEvidenceDigests(root, routeRows, evidenceContract);
  assertRecordShape(
    evidence.digests.dependencyLock,
    ['path', 'sha256'],
    [],
    'Semantic E2E dependency-lock digest',
  );
  assertRecordShape(
    evidence.digests.pnpmWorkspace,
    ['path', 'sha256'],
    [],
    'Semantic E2E pnpm-workspace digest',
  );
  if (
    evidence.digests.dependencyLock.path !== expectedDigests.dependencyLock.path ||
    !/^[0-9a-f]{64}$/u.test(evidence.digests.dependencyLock.sha256 ?? '') ||
    evidence.digests.pnpmWorkspace.path !== expectedDigests.pnpmWorkspace.path ||
    !/^[0-9a-f]{64}$/u.test(evidence.digests.pnpmWorkspace.sha256 ?? '') ||
    (requireCurrentBindings && !dependencyIdentityMatchesCurrentRuntime(evidence, expectedDigests))
  ) {
    throw new Error(
      'Semantic E2E evidence is not bound to the current executable dependency identity.',
    );
  }
  assertExactFileDigests(
    evidence.digests.runtimeAssets,
    expectedDigests.runtimeAssets,
    'Semantic E2E runtime-asset digests',
    { requireCurrentBindings },
  );
  assertExactFileDigests(
    evidence.digests.tests,
    expectedDigests.tests,
    'Semantic E2E test digests',
    { requireCurrentBindings },
  );
  assertExactFileDigests(
    evidence.digests.sources,
    expectedDigests.sources,
    'Semantic E2E source digests',
    { requireCurrentBindings },
  );

  if (!Array.isArray(evidence.assertions)) {
    throw new Error('Semantic E2E evidence assertions must be an array.');
  }
  const assertionsById = new Map();
  for (const [index, assertion] of evidence.assertions.entries()) {
    assertRecordShape(
      assertion,
      [
        'assertionId',
        'route',
        'viewState',
        'result',
        'proofScope',
        'locales',
        'browsers',
        'scenarios',
        'scenarioCoverage',
      ],
      [],
      `Semantic E2E assertion[${index}]`,
    );
    if (assertionsById.has(assertion.assertionId)) {
      throw new Error(`Semantic E2E evidence duplicates assertion ${assertion.assertionId}.`);
    }
    assertionsById.set(assertion.assertionId, assertion);
  }
  if (assertionsById.size !== routeRows.length) {
    throw new Error('Semantic E2E evidence does not close every required route/view assertion.');
  }
  const criticalAssertionIds = new Set(evidenceContract.browserCoverage.criticalAssertionIds);
  for (const row of routeRows) {
    const assertion = assertionsById.get(row.executableAssertionId);
    if (!assertion) {
      throw new Error(`Semantic E2E evidence is missing ${row.executableAssertionId}.`);
    }
    if (
      assertion.route !== row.route ||
      assertion.viewState !== row.viewState ||
      assertion.result !== 'passed' ||
      assertion.proofScope !== row.proof.requiredEvidenceScope
    ) {
      throw new Error(
        `Semantic E2E assertion ${row.executableAssertionId} differs from its route contract.`,
      );
    }
    assertExactSequence(
      assertion.locales,
      SUPPORTED_APP_LOCALES,
      `Semantic E2E assertion ${row.executableAssertionId} locales`,
    );
    const requiredScenarios = requiredSemanticScenarios(
      coverage.executableTargets[row.executableAssertionId],
      coverage,
      row.executableAssertionId,
    );
    assertExactSequence(
      assertion.scenarios,
      [...requiredScenarios].sort(),
      `Semantic E2E assertion ${row.executableAssertionId} scenarios`,
    );
    if (
      !Array.isArray(assertion.scenarioCoverage) ||
      assertion.scenarioCoverage.length !== assertion.scenarios.length
    ) {
      throw new Error(
        `Semantic E2E assertion ${row.executableAssertionId} has incomplete scenario coverage.`,
      );
    }
    for (const [scenarioIndex, scenarioCoverage] of assertion.scenarioCoverage.entries()) {
      assertRecordShape(
        scenarioCoverage,
        ['scenario', 'locales', 'browsers'],
        [],
        `Semantic E2E assertion ${row.executableAssertionId} scenarioCoverage[${scenarioIndex}]`,
      );
      if (scenarioCoverage.scenario !== assertion.scenarios[scenarioIndex]) {
        throw new Error(
          `Semantic E2E assertion ${row.executableAssertionId} scenario coverage order differs from its contract.`,
        );
      }
      assertExactSequence(
        scenarioCoverage.locales,
        SUPPORTED_APP_LOCALES,
        `Semantic E2E assertion ${row.executableAssertionId} ${scenarioCoverage.scenario} locales`,
      );
      if (
        !Array.isArray(scenarioCoverage.browsers) ||
        new Set(scenarioCoverage.browsers).size !== scenarioCoverage.browsers.length ||
        JSON.stringify(scenarioCoverage.browsers) !==
          JSON.stringify(
            SEMANTIC_E2E_BROWSERS.filter((browser) => scenarioCoverage.browsers.includes(browser)),
          ) ||
        !scenarioCoverage.browsers.includes(evidenceContract.browserCoverage.fullRouteViewBrowser)
      ) {
        throw new Error(
          `Semantic E2E assertion ${row.executableAssertionId} ${scenarioCoverage.scenario} has invalid browser coverage.`,
        );
      }
    }
    if (
      !Array.isArray(assertion.browsers) ||
      new Set(assertion.browsers).size !== assertion.browsers.length ||
      JSON.stringify(assertion.browsers) !==
        JSON.stringify(
          SEMANTIC_E2E_BROWSERS.filter((browser) => assertion.browsers.includes(browser)),
        ) ||
      !assertion.browsers.includes(evidenceContract.browserCoverage.fullRouteViewBrowser)
    ) {
      throw new Error(
        `Semantic E2E assertion ${row.executableAssertionId} has invalid browser coverage.`,
      );
    }
    if (
      criticalAssertionIds.has(row.executableAssertionId) &&
      JSON.stringify(assertion.browsers) !== JSON.stringify(SEMANTIC_E2E_BROWSERS)
    ) {
      throw new Error(
        `Semantic E2E critical assertion ${row.executableAssertionId} must pass all browsers.`,
      );
    }
    if (
      assertion.proofScope === 'access-boundary-observed' &&
      row.proof.requiredEvidenceScope !== 'access-boundary-observed'
    ) {
      throw new Error(
        `Access-boundary evidence cannot prove internal localization for ${row.executableAssertionId}.`,
      );
    }
  }

  assertRecordShape(
    evidence.productionData,
    ['markerPrefix', 'created', 'cleaned', 'leaked'],
    [],
    'Semantic E2E production data ledger',
  );
  if (
    evidence.productionData.markerPrefix !== evidenceContract.productionData.markerPrefix ||
    !Number.isInteger(evidence.productionData.created) ||
    evidence.productionData.created !== evidenceContract.productionData.exactCreated ||
    evidence.productionData.cleaned !== evidenceContract.productionData.exactCreated ||
    evidence.productionData.leaked !== evidenceContract.productionData.maximumLeaked
  ) {
    throw new Error('Semantic E2E codex-e2e data was not created and cleaned without leaks.');
  }
  return {
    path: descriptor.path,
    sha256: descriptor.sha256,
    contractDigest,
    assertionCount: assertionsById.size,
    internalLocalizationAssertionCount: routeRows.filter(
      (row) => row.proof.requiredEvidenceScope === 'internal-localization',
    ).length,
    accessBoundaryAssertionCount: routeRows.filter(
      (row) => row.proof.requiredEvidenceScope === 'access-boundary-observed',
    ).length,
    declaredFallbackAssertionCount: routeRows.filter(
      (row) => row.proof.requiredEvidenceScope === 'declared-fallback-observed',
    ).length,
    createdDataCount: evidence.productionData.created,
    cleanedDataCount: evidence.productionData.cleaned,
    leakedDataCount: evidence.productionData.leaked,
  };
}

function validateTypedContentSources(locale) {
  const descriptor = getImportReportContentAuditDescriptor();
  const expectedAdapters = SUPPORTED_APP_LOCALES.map(
    (appLocale) => getLocaleDefinition(appLocale).adapters.report,
  );
  if (JSON.stringify(descriptor.reportAdapterKeys) !== JSON.stringify(expectedAdapters)) {
    throw new Error('TIDAS import-report content topology differs from the typed locale registry.');
  }
  if (
    JSON.stringify(descriptor.entries.map(({ canonicalLocale }) => canonicalLocale)) !==
    JSON.stringify(SUPPORTED_APP_LOCALES)
  ) {
    throw new Error('TIDAS import-report canonical locale topology is incomplete.');
  }
  for (const entry of descriptor.entries) {
    const contentFields = [
      entry.humanSummaryTemplate,
      entry.readmeMarkdown,
      entry.v2HumanSummaryTemplate,
      entry.v2ReadingGuide,
      entry.v2ReadmeMarkdown,
    ];
    if (contentFields.some((field) => !field.trim())) {
      throw new Error(`TIDAS import-report content is empty for ${entry.canonicalLocale}.`);
    }
    for (const token of descriptor.humanSummaryTokens) {
      if (!entry.humanSummaryTemplate.includes(`{${token}}`)) {
        throw new Error(`TIDAS import-report ${entry.canonicalLocale} is missing {${token}}.`);
      }
    }
    for (const token of descriptor.v2HumanSummaryTokens) {
      if (!entry.v2HumanSummaryTemplate.includes(`{${token}}`)) {
        throw new Error(`TIDAS import-report v2 ${entry.canonicalLocale} is missing {${token}}.`);
      }
    }
  }
  const target = descriptor.entries.find(({ canonicalLocale }) => canonicalLocale === locale);
  const source = descriptor.entries.find(
    ({ canonicalLocale }) => canonicalLocale === CANONICAL_SOURCE_APP_LOCALE,
  );
  const fieldForKind = {
    human_summary: 'humanSummaryTemplate',
    readme_markdown: 'readmeMarkdown',
    v2_human_summary: 'v2HumanSummaryTemplate',
    v2_reading_guide: 'v2ReadingGuide',
    v2_readme_markdown: 'v2ReadmeMarkdown',
  };
  const dossiers = descriptor.contentKinds.map((kind) => ({
    contentId: `${descriptor.sourceId}.${kind}`,
    translations: Object.fromEntries(
      descriptor.entries.map((entry) => [entry.canonicalLocale, entry[fieldForKind[kind]]]),
    ),
    callsite: 'src/components/ImportTidasPackage/ImportResult.tsx report download action',
    route: 'authenticated TIDAS package import task center',
    uiRole: kind.includes('human_summary')
      ? 'downloaded report summary'
      : 'downloaded report guide',
    stateTransition: 'import result -> report download -> offline diagnosis',
    userConsequence: kind.startsWith('v2_')
      ? 'explains actual imported, existing, not-imported and bounded validation results'
      : 'explains historical validation failures, conflicts, and skipped open data',
    terminologyEvidence: 'locale glossary, TIDAS schema tokens, and canonical report contract',
    syntax: {
      placeholders:
        kind === 'human_summary'
          ? descriptor.humanSummaryTokens
          : kind === 'v2_human_summary'
            ? descriptor.v2HumanSummaryTokens
            : [],
      markdown: kind.endsWith('readme_markdown') || kind === 'readme_markdown',
    },
    targetCandidate: target[fieldForKind[kind]],
    canonicalEnglish: source[fieldForKind[kind]],
    rationale: 'registry-complete cross-locale content with report-schema tokens preserved',
    risk: 'high',
    validation: ['exact registry topology', 'token parity', 'pure descriptor unit test'],
  }));
  return {
    sourcePath: IMPORT_REPORT_CONTENT_SOURCE,
    sourceId: descriptor.sourceId,
    contentKinds: descriptor.contentKinds,
    registryLocaleCount: descriptor.entries.length,
    targetContentUnitCount: dossiers.length,
    targetContentDigest: digestJson(
      dossiers.map(({ contentId, targetCandidate }) => [contentId, targetCandidate]),
    ),
    dossierDigest: digestJson(dossiers),
    topologyDigest: digestJson(descriptor),
    blockedContextCount: 0,
  };
}

function requiredSemanticScenarios(target, coverage, routeAssertionId) {
  const declared = target.requiredScenarios ?? ['route'];
  const viewVariantScenarios = (coverage?.executableViewVariants ?? [])
    .filter((variant) => variant.routeAssertionId === routeAssertionId)
    .map(({ scenario }) => scenario);
  return [
    ...new Set([
      'route',
      ...(target.kind !== 'declared-static-fallback' && target.session === 'authenticated'
        ? ['anonymous-protection']
        : []),
      ...declared.filter((scenario) => scenario !== 'route' && scenario !== 'anonymous-protection'),
      ...viewVariantScenarios,
    ]),
  ];
}

function validateViewStateRegistry(root, coverage, routeRows, manifest) {
  const descriptor = coverage.viewStateRegistry;
  if (
    !descriptor ||
    descriptor.sourcePath !== 'src/services/general/routeViewStateRegistry.json' ||
    !Array.isArray(descriptor.usages)
  ) {
    throw new Error('Route-view coverage must identify its typed view-state registry and usages.');
  }
  const registryDocument = readJson(root, descriptor.sourcePath);
  if (
    registryDocument.schemaVersion !== descriptor.schemaVersion ||
    !Array.isArray(registryDocument.registries) ||
    registryDocument.registries.length === 0
  ) {
    throw new Error('Typed view-state registry schema differs from route-view coverage.');
  }
  const registriesById = new Map();
  for (const registry of registryDocument.registries) {
    if (
      typeof registry.id !== 'string' ||
      typeof registry.parameter !== 'string' ||
      typeof registry.defaultVariantId !== 'string' ||
      !Array.isArray(registry.variants) ||
      registry.variants.length === 0 ||
      registriesById.has(registry.id)
    ) {
      throw new Error('Typed view-state registries must have unique IDs and finite variants.');
    }
    const variantIds = registry.variants.map(({ id }) => id);
    const queryValues = registry.variants.map(({ queryValue }) => queryValue);
    if (
      variantIds.some(
        (variantId) =>
          typeof variantId !== 'string' || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(variantId),
      ) ||
      new Set(variantIds).size !== variantIds.length ||
      new Set(queryValues.map((value) => JSON.stringify(value))).size !== queryValues.length ||
      !variantIds.includes(registry.defaultVariantId) ||
      registry.variants.some(
        ({ queryValue }) => queryValue !== null && typeof queryValue !== 'string',
      )
    ) {
      throw new Error(`${registry.id} has invalid or duplicate typed view-state variants.`);
    }
    registriesById.set(registry.id, registry);
  }
  const usageIds = descriptor.usages.map(({ registryId }) => registryId);
  if (
    JSON.stringify([...usageIds].sort()) !== JSON.stringify([...registriesById.keys()].sort()) ||
    new Set(usageIds).size !== usageIds.length
  ) {
    throw new Error('Typed view-state usages must exactly close every source registry.');
  }
  const executableVariants = coverage.executableViewVariants;
  if (!Array.isArray(executableVariants)) {
    throw new Error('Route-view coverage must declare executable typed view variants.');
  }
  const executableAssertionIds = executableVariants.map(({ assertionId }) => assertionId);
  if (
    executableAssertionIds.some(
      (assertionId) =>
        typeof assertionId !== 'string' || !/^vv\.[a-z0-9][a-z0-9.-]+$/u.test(assertionId),
    ) ||
    new Set(executableAssertionIds).size !== executableAssertionIds.length
  ) {
    throw new Error('Executable view variants must have unique stable assertion IDs.');
  }
  const routeAssertionIds = new Set(
    routeRows.map(({ executableAssertionId }) => executableAssertionId),
  );
  const messageIds = new Set(manifest.messages.map(({ id }) => id));
  const variantsByAssertionId = new Map(
    executableVariants.map((variant) => [variant.assertionId, variant]),
  );
  for (const usage of descriptor.usages) {
    const registry = registriesById.get(usage.registryId);
    const registryVariantIds = registry.variants.map(({ id }) => id);
    if (
      !Array.isArray(usage.sourcePaths) ||
      usage.sourcePaths.length === 0 ||
      new Set(usage.sourcePaths).size !== usage.sourcePaths.length ||
      JSON.stringify(usage.variantIds) !== JSON.stringify(registryVariantIds)
    ) {
      throw new Error(`${usage.registryId} usage does not exactly close its registry variants.`);
    }
    for (const sourcePath of usage.sourcePaths) {
      if (!fs.existsSync(path.resolve(root, sourcePath))) {
        throw new Error(`${usage.registryId} references missing source ${sourcePath}.`);
      }
      const source = readText(root, sourcePath);
      const resolverPattern = new RegExp(
        `resolveRouteViewState\\(\\s*['\"]${usage.registryId}['\"]`,
        'u',
      );
      if (!resolverPattern.test(source)) {
        throw new Error(
          `${sourcePath} must resolve ${registry.parameter} through ${usage.registryId}.`,
        );
      }
    }
    if (usage.proof?.kind === 'focused-tests') {
      if (
        !Array.isArray(usage.proof.testPaths) ||
        usage.proof.testPaths.length === 0 ||
        executableVariants.some(({ registryId }) => registryId === usage.registryId)
      ) {
        throw new Error(`${usage.registryId} has an invalid focused-test proof declaration.`);
      }
      for (const testPath of usage.proof.testPaths) {
        if (!fs.existsSync(path.resolve(root, testPath))) {
          throw new Error(`${usage.registryId} references missing focused test ${testPath}.`);
        }
      }
      continue;
    }
    if (
      usage.proof?.kind !== 'browser' ||
      !Array.isArray(usage.proof.variantAssertionIds) ||
      usage.proof.variantAssertionIds.length !== registry.variants.length
    ) {
      throw new Error(`${usage.registryId} has no exact browser variant proof.`);
    }
    const proofVariants = usage.proof.variantAssertionIds.map((assertionId) =>
      variantsByAssertionId.get(assertionId),
    );
    if (
      proofVariants.some((variant) => !variant || variant.registryId !== usage.registryId) ||
      JSON.stringify(proofVariants.map(({ variantId }) => variantId)) !==
        JSON.stringify(registryVariantIds)
    ) {
      throw new Error(`${usage.registryId} browser variants differ from its finite registry.`);
    }
    for (const testPath of usage.proof.supplementalFocusedTestPaths ?? []) {
      if (!fs.existsSync(path.resolve(root, testPath))) {
        throw new Error(`${usage.registryId} references missing supplemental test ${testPath}.`);
      }
    }
  }
  const usageByRegistryId = new Map(descriptor.usages.map((usage) => [usage.registryId, usage]));
  for (const variant of executableVariants) {
    const usage = usageByRegistryId.get(variant.registryId);
    const registry = registriesById.get(variant.registryId);
    const registryVariant = registry?.variants.find(({ id }) => id === variant.variantId);
    if (
      !usage ||
      usage.proof?.kind !== 'browser' ||
      !registryVariant ||
      !routeAssertionIds.has(variant.routeAssertionId) ||
      typeof variant.scenario !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(variant.scenario) ||
      !variant.target ||
      !Array.isArray(variant.target.visibleMessageIds) ||
      variant.target.visibleMessageIds.length === 0 ||
      variant.target.visibleMessageIds.some((messageId) => !messageIds.has(messageId))
    ) {
      throw new Error(`${variant.assertionId} has an invalid executable view target.`);
    }
    if (variant.execution?.kind === 'dedicated-spec') {
      const specPath = variant.execution.specPath;
      if (typeof specPath !== 'string' || !fs.existsSync(path.resolve(root, specPath))) {
        throw new Error(`${variant.assertionId} references a missing dedicated browser spec.`);
      }
      const specSource = readText(root, specPath);
      if (!specSource.includes(variant.assertionId) || !specSource.includes(variant.scenario)) {
        throw new Error(
          `${variant.assertionId} dedicated browser spec does not bind its assertion and scenario.`,
        );
      }
    } else if (variant.execution && variant.execution.kind !== 'route-inventory') {
      throw new Error(`${variant.assertionId} has an unknown browser execution kind.`);
    }
    const parameter = registry.parameter;
    const navigateHasParameter = Object.hasOwn(variant.target.navigate?.hashQuery ?? {}, parameter);
    const expectedHasParameter = Object.hasOwn(variant.target.expected?.hashQuery ?? {}, parameter);
    const navigateValue = navigateHasParameter
      ? variant.target.navigate.hashQuery[parameter]
      : null;
    const expectedValue = expectedHasParameter
      ? variant.target.expected.hashQuery[parameter]
      : null;
    if (
      navigateValue !== registryVariant.queryValue ||
      expectedValue !== registryVariant.queryValue
    ) {
      throw new Error(
        `${variant.assertionId} query target differs from ${variant.registryId}/${variant.variantId}.`,
      );
    }
  }
  return {
    schemaVersion: registryDocument.schemaVersion,
    sourcePath: descriptor.sourcePath,
    sourceDigest: fileDigest(root, descriptor.sourcePath),
    registryCount: registryDocument.registries.length,
    executableVariantCount: executableVariants.length,
    focusedVariantCount: descriptor.usages
      .filter(({ proof }) => proof.kind === 'focused-tests')
      .reduce((sum, usage) => sum + usage.variantIds.length, 0),
  };
}

function validateRouteCoverage(root, manifest, { requireCurrentSemanticEvidence = false } = {}) {
  const coverage = readJson(root, ROUTE_VIEW_COVERAGE);
  if (coverage.sourceRouteConfig !== 'config/routes.ts') {
    throw new Error('Route-view coverage must identify config/routes.ts as its route source.');
  }
  const requiredPaths = new Set(['/', '/welcome', '/welcome?view=carbon-footprint']);
  if (!Array.isArray(coverage.routeFamilies)) {
    throw new Error('Route-view coverage must declare its config-derived route families.');
  }
  const familyRows = coverage.routeFamilies.flatMap((family) => {
    if (
      !family.id ||
      !Array.isArray(family.routes) ||
      family.routes.length === 0 ||
      !family.executableAssertionIds ||
      typeof family.executableAssertionIds !== 'object' ||
      Array.isArray(family.executableAssertionIds)
    ) {
      throw new Error(
        'Every route-view family must have an id, routes, and executable assertion IDs.',
      );
    }
    if (
      JSON.stringify(Object.keys(family.executableAssertionIds)) !== JSON.stringify(family.routes)
    ) {
      throw new Error(`${family.id} executable assertion IDs must exactly match its routes.`);
    }
    return family.routes.map((route) => ({
      ...family,
      route,
      executableAssertionId: family.executableAssertionIds[route],
    }));
  });
  const routeRows = [...coverage.rows, ...familyRows];
  const observedPaths = new Set(routeRows.map(({ route }) => route));
  for (const route of requiredPaths) {
    if (!observedPaths.has(route)) throw new Error(`Route-view coverage is missing ${route}.`);
  }
  if (JSON.stringify(coverage.supportedLocales) !== JSON.stringify(SUPPORTED_APP_LOCALES)) {
    throw new Error('Route-view coverage locale order differs from the typed registry.');
  }
  const assertionIds = routeRows.map(({ executableAssertionId }) => executableAssertionId);
  if (
    assertionIds.some(
      (assertionId) =>
        typeof assertionId !== 'string' || !/^rv\.[a-z0-9][a-z0-9.-]+$/u.test(assertionId),
    ) ||
    new Set(assertionIds).size !== assertionIds.length
  ) {
    throw new Error('Every route/view row must have one unique stable executable assertion ID.');
  }
  if (
    !coverage.executableTargets ||
    typeof coverage.executableTargets !== 'object' ||
    Array.isArray(coverage.executableTargets) ||
    JSON.stringify(Object.keys(coverage.executableTargets).sort()) !==
      JSON.stringify([...assertionIds].sort()) ||
    Object.values(coverage.executableTargets).some(
      (target) => !target || typeof target !== 'object' || Array.isArray(target),
    )
  ) {
    throw new Error(
      'Route-view executable targets must exactly match every stable assertion identity.',
    );
  }
  for (const row of routeRows) {
    const target = coverage.executableTargets[row.executableAssertionId];
    const declaredScenarios = target.requiredScenarios ?? ['route'];
    if (
      !Array.isArray(declaredScenarios) ||
      declaredScenarios.length === 0 ||
      !declaredScenarios.includes('route') ||
      new Set(declaredScenarios).size !== declaredScenarios.length ||
      declaredScenarios.some(
        (scenario) => typeof scenario !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(scenario),
      )
    ) {
      throw new Error(`${row.executableAssertionId} has invalid required semantic scenarios.`);
    }
    if (declaredScenarios.includes('anonymous-protection')) {
      throw new Error(
        `${row.executableAssertionId} must derive anonymous-protection from its authenticated session instead of declaring it manually.`,
      );
    }
    if (!SEMANTIC_E2E_PROOF_SCOPES.has(row.proof?.requiredEvidenceScope)) {
      throw new Error(`${row.executableAssertionId} has no valid executable evidence scope.`);
    }
    if (
      row.proof.requiredEvidenceScope === 'access-boundary-observed' &&
      !/redirect|boundary/iu.test(`${row.viewState} ${row.accessContext}`)
    ) {
      throw new Error(
        `${row.executableAssertionId} cannot use access-boundary evidence for internal localization.`,
      );
    }
    if (
      row.proof.requiredEvidenceScope === 'declared-fallback-observed' &&
      (!Array.isArray(row.copySources?.declaredFallbacks) ||
        row.copySources.declaredFallbacks.length === 0)
    ) {
      throw new Error(`${row.executableAssertionId} has no declared fallback to observe.`);
    }
  }
  const viewStateRegistryEvidence = validateViewStateRegistry(root, coverage, routeRows, manifest);
  const evidenceContract = validateSemanticEvidenceContract(root, coverage, routeRows);
  const browserProof = coverage.proofPolicy?.browserProof;
  const externalBrowserProof =
    coverage.proofPolicy?.status === 'ci-required' &&
    browserProof?.status === 'external-artifact' &&
    browserProof?.ownerIssue === '#867' &&
    browserProof?.requiredAt === 'dev-release-candidate-gate' &&
    browserProof?.storage === 'ignored-local-or-github-actions-artifact' &&
    Array.isArray(browserProof?.executedEvidence) &&
    browserProof.executedEvidence.length === 0;
  if (!externalBrowserProof) {
    throw new Error(
      'Route-view coverage must require external browser proof at the dev Release candidate gate.',
    );
  }
  const externalEvidencePath = path.resolve(root, evidenceContract.evidencePath);
  if (requireCurrentSemanticEvidence && !fs.existsSync(externalEvidencePath)) {
    throw new Error(
      `Semantic E2E evidence is required at ${evidenceContract.evidencePath}; run the release qualification first.`,
    );
  }
  const semanticExecutionEvidence = fs.existsSync(externalEvidencePath)
    ? validateSemanticE2EEvidence(
        root,
        coverage,
        routeRows,
        {
          path: evidenceContract.evidencePath,
          sha256: fileDigest(root, evidenceContract.evidencePath),
        },
        evidenceContract,
        { requireCurrentBindings: requireCurrentSemanticEvidence },
      )
    : null;
  const browserProofContractReady = externalBrowserProof;
  const routeKeys = routeRows.map(({ route, viewState }) => `${route}\0${viewState}`);
  if (new Set(routeKeys).size !== routeKeys.length) {
    throw new Error('Route-view coverage contains duplicate route/view-state rows.');
  }
  const routeConfig = collectRouteConfigEvidence(root, coverage.sourceRouteConfig);
  const anonymousRoutePolicy = collectAnonymousRoutePolicyEvidence(root);
  const configuredPaths = new Set(routeConfig.configuredPaths);
  const coveredConfiguredPaths = new Set(
    routeRows
      .map(({ route }) => route.split(/[?#]/u)[0])
      .filter((routePath) => configuredPaths.has(routePath)),
  );
  const missingConfiguredPaths = [...configuredPaths].filter(
    (routePath) => !coveredConfiguredPaths.has(routePath),
  );
  const unknownFamilyPaths = familyRows
    .map(({ route }) => route.split(/[?#]/u)[0])
    .filter((routePath) => !configuredPaths.has(routePath));
  if (missingConfiguredPaths.length > 0 || unknownFamilyPaths.length > 0) {
    throw new Error(
      `Route-view coverage differs from config/routes.ts (missing: ${missingConfiguredPaths.join(', ') || 'none'}; unknown family routes: ${unknownFamilyPaths.join(', ') || 'none'}).`,
    );
  }
  const messageIds = new Set(manifest.messages.map(({ id }) => id));
  const messagesBySource = new Map();
  for (const message of manifest.messages) {
    for (const reference of message.references) {
      const messages = messagesBySource.get(reference.path) ?? [];
      messages.push(message);
      messagesBySource.set(reference.path, messages);
    }
  }
  const derivationsBySource = new Map();
  for (const sourcePath of new Set(routeRows.flatMap((row) => row.copySources.sourcePaths))) {
    if (!fs.existsSync(path.resolve(root, sourcePath))) {
      throw new Error(`Route-view coverage references missing source ${sourcePath}.`);
    }
    derivationsBySource.set(
      sourcePath,
      collectSourceDerivation(root, sourcePath, messagesBySource.get(sourcePath) ?? []),
    );
  }
  const rootDefinition = routeConfig.definitions.find(({ path: routePath }) => routePath === '/');
  if (rootDefinition?.redirect !== '/welcome' || rootDefinition.keepQuery !== true) {
    throw new Error('The root route must derive a query-preserving redirect to /welcome.');
  }
  const rowEvidence = [];
  for (const row of routeRows) {
    if (
      !row.route ||
      !row.viewState ||
      !row.trigger ||
      !row.component ||
      !row.accessContext ||
      !Array.isArray(row.visibleStates) ||
      row.visibleStates.length === 0
    ) {
      throw new Error(
        'Every route-view row must identify a route, view state, trigger, component, access context, and visible states.',
      );
    }
    const copySources = row.copySources;
    if (
      !copySources ||
      !Array.isArray(copySources.sourcePaths) ||
      copySources.sourcePaths.length === 0
    ) {
      throw new Error(`${row.route}/${row.viewState} has no copy-source ownership.`);
    }
    if (!row.targetCoverage || !row.proof) {
      throw new Error(`${row.route}/${row.viewState} has no target coverage or proof contract.`);
    }
    if (
      row.targetCoverage.localeScope !== 'all-registry-locales' ||
      row.targetCoverage.missingContent !== 0 ||
      !Array.isArray(row.proof.focusedTests) ||
      row.proof.focusedTests.length === 0 ||
      !Array.isArray(row.proof.plannedBrowserAssertions) ||
      row.proof.plannedBrowserAssertions.length === 0 ||
      Object.hasOwn(row.proof, 'browserAssertions')
    ) {
      throw new Error(`${row.route}/${row.viewState} has incomplete target or proof coverage.`);
    }
    const routePath = row.route.split(/[?#]/u)[0];
    if (
      routePath !== '*' &&
      !configuredPaths.has(routePath) &&
      !fs.existsSync(path.resolve(root, `public${routePath}`))
    ) {
      throw new Error(`${row.route}/${row.viewState} is not derived from routes or public files.`);
    }
    for (const testPath of row.proof.focusedTests) {
      if (!fs.existsSync(path.resolve(root, testPath))) {
        throw new Error(`${row.route}/${row.viewState} references missing test ${testPath}.`);
      }
    }
    for (const messageId of copySources.localeMessageIds ?? []) {
      if (!messageIds.has(messageId)) {
        throw new Error(`${row.route}/${row.viewState} references unknown message ${messageId}.`);
      }
    }
    const executableTarget = coverage.executableTargets[row.executableAssertionId];
    const targetDefaultPageOwnedMessageIds =
      executableTarget.kind === 'declared-static-fallback'
        ? []
        : executableTarget.kind === 'role-boundary'
          ? executableTarget.boundary.messageIds
          : executableTarget.visible.messageIds.filter(
              (messageId) => !messageId.startsWith('menu.'),
            );
    const pageOwnedMessageIds = row.pageOwnedMessageIds ?? targetDefaultPageOwnedMessageIds;
    if (
      !Array.isArray(pageOwnedMessageIds) ||
      new Set(pageOwnedMessageIds).size !== pageOwnedMessageIds.length ||
      (row.proof.requiredEvidenceScope === 'internal-localization' &&
        pageOwnedMessageIds.length === 0)
    ) {
      throw new Error(
        `${row.executableAssertionId} must declare unique page-owned visible message markers for internal localization.`,
      );
    }
    for (const messageId of pageOwnedMessageIds) {
      const message = manifest.messages.find(({ id }) => id === messageId);
      if (!message) {
        throw new Error(
          `${row.executableAssertionId} references unknown page marker ${messageId}.`,
        );
      }
      if (
        !message.references.some((reference) => copySources.sourcePaths.includes(reference.path))
      ) {
        throw new Error(
          `${row.executableAssertionId} page marker ${messageId} is not owned by one of its copy sources.`,
        );
      }
    }
    for (const prefix of copySources.localeMessageIdPrefixes ?? []) {
      if (![...messageIds].some((messageId) => messageId.startsWith(prefix))) {
        throw new Error(
          `${row.route}/${row.viewState} references an empty message prefix ${prefix}.`,
        );
      }
    }
    if (row.unownedStaticContent !== 0 || row.blockedContext !== 0) {
      throw new Error(
        `${row.route}/${row.viewState} still has unowned content or blocked context.`,
      );
    }
    const sourceEvidence = copySources.sourcePaths.map((sourcePath) =>
      derivationsBySource.get(sourcePath),
    );
    const unownedVisibleLiterals = sourceEvidence.flatMap(
      (evidence) => evidence.unownedVisibleLiterals,
    );
    if (unownedVisibleLiterals.length > 0) {
      throw new Error(
        `${row.route}/${row.viewState} has unowned visible literals: ${unownedVisibleLiterals.slice(0, 3).join(', ')}.`,
      );
    }
    const derivedMessages = manifest.messages.filter((message) =>
      routeRowMatchesMessage(row, message),
    );
    rowEvidence.push({
      executableAssertionId: row.executableAssertionId,
      route: row.route,
      viewState: row.viewState,
      requiredEvidenceScope: row.proof.requiredEvidenceScope,
      sourceDigest: digestJson(sourceEvidence),
      focusedTestDigest: digestJson(
        row.proof.focusedTests.map((testPath) => [testPath, fileDigest(root, testPath)]),
      ),
      plannedBrowserAssertionCount: row.proof.plannedBrowserAssertions.length,
      plannedBrowserAssertionDigest: digestJson(row.proof.plannedBrowserAssertions),
      derivedMessageCount: derivedMessages.length,
      derivedMessageDigest: digestJson(derivedMessages.map(({ id }) => id)),
      stateSignals: [
        ...new Set(sourceEvidence.flatMap((evidence) => evidence.stateSignals)),
      ].sort(),
      queryParameters: [
        ...new Set(sourceEvidence.flatMap((evidence) => evidence.queryParameters)),
      ].sort(),
      navigationTargets: [
        ...new Set(sourceEvidence.flatMap((evidence) => evidence.navigationTargets)),
      ].sort(),
      interactionKinds: [
        ...new Set(sourceEvidence.flatMap((evidence) => evidence.interactionKinds)),
      ].sort(),
      acceptedTechnicalLiteralCount: sourceEvidence.reduce(
        (sum, evidence) => sum + evidence.acceptedTechnicalLiterals.length,
        0,
      ),
      unownedVisibleLiteralCount: 0,
    });
  }
  for (const [sourcePath, derivation] of derivationsBySource) {
    const relatedRows = routeRows.filter((row) => row.copySources.sourcePaths.includes(sourcePath));
    const visibleStates = relatedRows.flatMap((row) => row.visibleStates);
    for (const signal of derivation.stateSignals) {
      if (!stateSignalCovered(signal, visibleStates)) {
        throw new Error(
          `${sourcePath} derives visible state ${signal}, but its route-view rows do not cover it.`,
        );
      }
    }
    for (const parameter of derivation.queryParameters) {
      if (parameter === 'redirect') continue;
      const routeDeclaresParameter = relatedRows.some((row) => row.route.includes(`${parameter}=`));
      const statesDeclareParameter = visibleStates.some((state) =>
        state.toLocaleLowerCase('en-US').includes(parameter.toLocaleLowerCase('en-US')),
      );
      const dashboardScreenClosure =
        parameter === 'screen' &&
        ['overview', 'map-status', 'outcome-metrics', 'connectivity', 'flow-topology'].every(
          (state) => visibleStates.includes(state),
        );
      if (!routeDeclaresParameter && !statesDeclareParameter && !dashboardScreenClosure) {
        throw new Error(
          `${sourcePath} derives URL state parameter ${parameter}, but no route/view state covers it.`,
        );
      }
    }
  }
  const derivedEvidence = {
    schemaVersion: 'tiangong.i18n-route-view-derived-evidence.v2',
    sourceRouteConfig: coverage.sourceRouteConfig,
    routeConfigDigest: routeConfig.digest,
    configuredRouteCount: routeConfig.configuredPaths.length,
    coveredConfiguredRouteCount: coveredConfiguredPaths.size,
    browserProof: {
      status: browserProof.status,
      ownerIssue: browserProof.ownerIssue,
      inventoryOnly: false,
      executedEvidenceCount: browserProof.executedEvidence.length,
      evidenceSchemaVersion: evidenceContract.schemaVersion,
      proofStorage: browserProof.storage,
      requiredAt: browserProof.requiredAt,
      routeCoverageContractDigest: routeCoverageContractDigest(coverage),
      requiredAssertionCount: routeRows.length,
      executionEvidence: semanticExecutionEvidence,
      contractReady: browserProofContractReady,
      evidencePresent: semanticExecutionEvidence !== null,
      ready: semanticExecutionEvidence !== null,
    },
    anonymousRoutePolicy,
    viewStateRegistry: viewStateRegistryEvidence,
    sourceFileCount: derivationsBySource.size,
    sourceEvidenceDigest: digestJson([...derivationsBySource.values()]),
    rowEvidence,
    rowEvidenceDigest: digestJson(rowEvidence),
    blockedDerivedStateCount: 0,
    unownedVisibleLiteralCount: 0,
  };
  return { ...coverage, derivedEvidence };
}

function deriveUiRole(message) {
  const id = message.id.toLocaleLowerCase('en-US');
  if (/(?:error|failure|failed|invalid|required|wrong)/u.test(id)) return 'error-or-validation';
  if (/(?:success|complete)/u.test(id)) return 'success-notification';
  if (/(?:placeholder|hint)/u.test(id)) return 'field-guidance';
  if (/(?:tooltip|help|description|subtitle|intro)/u.test(id)) return 'explanatory-copy';
  if (/(?:title|header|heading)/u.test(id)) return 'title-or-heading';
  if (/(?:button|submit|confirm|cancel|save|delete|add|edit|back|retry|reload|action)/u.test(id)) {
    return 'user-action';
  }
  if (/(?:menu|tab|navigation|breadcrumb)/u.test(id)) return 'navigation-or-tab';
  if (/(?:loading|empty|status|state)/u.test(id)) return 'status-or-empty-state';
  return message.category === 'reserved' ? 'reserved-catalog-copy' : 'label-or-body-copy';
}

function deriveBehavior(uiRole, message) {
  const id = message.id.toLocaleLowerCase('en-US');
  if (uiRole === 'error-or-validation') {
    return {
      currentState: 'failure-or-invalid-input',
      transition: 'user action or service response -> failure -> correction or retry',
      userConsequence: 'the user must understand the problem and the safe next action',
    };
  }
  if (uiRole === 'success-notification') {
    return {
      currentState: 'successful-completion',
      transition: 'user action -> accepted result -> next screen or confirmed state',
      userConsequence: 'the user receives confirmation that the requested operation completed',
    };
  }
  if (/(?:delete|remove|reject|rollback|overwrite)/u.test(id)) {
    return {
      currentState: 'destructive-or-rejecting-action',
      transition: 'selection -> confirmation -> persistent data or workflow change',
      userConsequence:
        'an incorrect interpretation could cause irreversible or review-state change',
    };
  }
  if (uiRole === 'user-action' || uiRole === 'navigation-or-tab') {
    return {
      currentState: 'interactive-ready',
      transition: 'visible control -> activation -> navigation, mutation, or state change',
      userConsequence: 'the label must predict the result of activating the control',
    };
  }
  return {
    currentState: message.category === 'reserved' ? 'retained-not-currently-reachable' : 'visible',
    transition:
      message.category === 'reserved'
        ? 'catalog retention -> future audited activation'
        : 'route or component entry -> content becomes visible -> user reads or continues',
    userConsequence:
      message.category === 'reserved'
        ? 'future activation must retain the same reviewed product meaning'
        : 'the user relies on the copy to understand the current LCA product context',
  };
}

function extractTechnicalTokens(value) {
  const matches = String(value).match(
    /(?:https?:\/\/[^\s)]+|`[^`]+`|\{[^{}]+\}|\b[A-Z][A-Z0-9_-]{1,}\b|\b[\w-]+\.(?:json|csv|xml|zip|pdf|xlsx|html)\b|\b[a-z]+_[a-z0-9_]+\b|\b\d+(?:[.,]\d+)?\s?(?:kg|g|t|km|m|MJ|kWh|%)\b)/gu,
  );
  return [...new Set(matches ?? [])].sort();
}

function deriveMessageRisk(message, uiRole, targetValue) {
  const id = message.id.toLocaleLowerCase('en-US');
  if (
    /(?:login|password|auth|permission|access|legal|privacy|terms|delete|remove|reject|rollback|import|export|validation|error|failure|review|publish|release)/u.test(
      id,
    ) ||
    uiRole === 'error-or-validation' ||
    message.translations[CANONICAL_SOURCE_APP_LOCALE]?.argumentSignature?.length > 0
  ) {
    return 'high';
  }
  if (
    message.category === 'active-dynamic' ||
    message.dynamicFamilies.length > 0 ||
    targetValue.length > 80
  ) {
    return 'medium';
  }
  return 'low';
}

function buildMessageDossiers(locale, manifest, coverage, glossary, styleGuideDigest) {
  const modules = new Map();
  for (const message of manifest.messages) {
    const module = message.moduleOwnership?.[CANONICAL_SOURCE_APP_LOCALE]?.[0] ?? '$entry';
    const values = modules.get(module) ?? [];
    values.push(message);
    modules.set(module, values);
  }
  const glossarySources = glossary.evidenceSources ?? [
    {
      id: 'repository-context',
      location: `${CANONICAL_MANIFEST} + callsites + cross-locale catalog`,
    },
  ];
  const dossiers = manifest.messages.map((message) => {
    const ownerModule = message.moduleOwnership?.[CANONICAL_SOURCE_APP_LOCALE]?.[0] ?? '$entry';
    const sourceValue = message.translations[CANONICAL_SOURCE_APP_LOCALE]?.value ?? '';
    const targetValue = message.translations[locale]?.value ?? '';
    const uiRole = deriveUiRole(message);
    const behavior = deriveBehavior(uiRole, message);
    const matchedTerms = (glossary.terms ?? []).filter((term) => {
      const concept = term.concept.toLocaleLowerCase('en-US');
      return (
        sourceValue.toLocaleLowerCase('en-US').includes(concept) ||
        message.id.toLocaleLowerCase('en-US').includes(concept.replace(/\s+/gu, '')) ||
        (term.preferred ?? []).some((preferred) =>
          targetValue.toLocaleLowerCase(locale).includes(preferred.toLocaleLowerCase(locale)),
        )
      );
    });
    const routeRows = coverage.rows
      .filter((row) => routeRowMatchesMessage(row, message))
      .map(({ route, viewState }) => `${route}::${viewState}`);
    const callsitePaths = [...new Set(message.references.map(({ path: callsite }) => callsite))];
    const components = [
      ...new Set(
        message.references.map(
          ({ path: callsite, symbol }) => `${callsite}${symbol ? `#${symbol}` : ''}`,
        ),
      ),
    ];
    const prefix = message.id.split('.').slice(0, 3).join('.');
    const adjacentMessages = (modules.get(ownerModule) ?? [])
      .filter((candidate) => candidate.id !== message.id && candidate.id.startsWith(prefix))
      .slice(0, 4)
      .map((candidate) => ({
        id: candidate.id,
        canonicalEnglish: candidate.translations[CANONICAL_SOURCE_APP_LOCALE]?.value ?? '',
        target: candidate.translations[locale]?.value ?? '',
      }));
    const sourceSyntax = message.translations[CANONICAL_SOURCE_APP_LOCALE];
    const targetSyntax = message.translations[locale];
    const technicalTokens = extractTechnicalTokens(sourceValue);
    const risk = deriveMessageRisk(message, uiRole, targetValue);
    const usageEvidence = {
      category: message.category,
      directCallsites: message.references,
      dynamicFamilies: message.dynamicFamilies,
      retainedFallback:
        message.references.length === 0 && message.dynamicFamilies.length === 0
          ? message.category === 'reserved'
            ? 'audited reserved catalog retention; any future activation is re-scanned'
            : 'active catalog entry owned by its source module and exact topology audit'
          : null,
    };
    return {
      messageId: message.id,
      ownerModule,
      sourceIdentity: {
        repository: manifest.source.repository,
        baselineSha: manifest.source.baseCommit,
        auditedInputDigest: manifest.source.auditedInputDigest,
      },
      translations: Object.fromEntries(
        SUPPORTED_APP_LOCALES.map((appLocale) => [
          appLocale,
          message.translations[appLocale]?.value,
        ]),
      ),
      canonicalEnglish: sourceValue,
      existingChinese: message.translations[TRANSLATION_SOURCE_APP_LOCALE]?.value ?? '',
      usageEvidence,
      surface: {
        pages:
          callsitePaths
            .map((callsite) => callsite.match(/^src\/pages\/([^/]+)/u)?.[1])
            .filter(Boolean) || [],
        components: components.length > 0 ? components : [`catalog-module:${ownerModule}`],
        routes:
          routeRows.length > 0
            ? routeRows
            : callsitePaths.length > 0
              ? callsitePaths.map((callsite) => `runtime-route-derived-from:${callsite}`)
              : ['reserved-not-currently-routed'],
        uiRole,
      },
      behavior: {
        ...behavior,
        adjacentMessages,
        adjacentContextDigest: digestJson(adjacentMessages),
      },
      terminology: {
        matchedConcepts: matchedTerms.map(({ concept }) => concept),
        decision:
          matchedTerms.length > 0
            ? 'apply the target glossary terms according to the real callsite and LCA/TIDAS object role'
            : 'general product UI copy; preserve technical tokens and use cross-locale product semantics',
        trustedSources: glossarySources,
        glossaryDigest: digestJson(glossary),
        styleGuideDigest,
      },
      syntax: {
        sourceArgumentSignature: sourceSyntax?.argumentSignature ?? [],
        targetArgumentSignature: targetSyntax?.argumentSignature ?? [],
        sourcePlaceholders: sourceSyntax?.placeholders ?? [],
        targetPlaceholders: targetSyntax?.placeholders ?? [],
        richTextTags: [...new Set(sourceValue.match(/<\/?[a-z][^>]*>/giu) ?? [])],
        interpolationSample: (sourceSyntax?.placeholders ?? []).reduce(
          (sample, placeholder) => sample.split(`{${placeholder}}`).join(`<${placeholder}>`),
          sourceValue,
        ),
        newlineCount: (targetValue.match(/\n/gu) ?? []).length,
      },
      preservedTokens: technicalTokens,
      layoutRisks: [
        targetValue.length > Math.max(40, sourceValue.length * 1.35)
          ? 'French expansion on narrow controls, tables, and dialogs'
          : 'standard French expansion check',
        targetValue.includes('\n') ? 'explicit newline preservation' : 'single-flow wrapping',
        'LTR; RTL/bidi implementation not applicable, technical-token isolation still checked',
        'dark-theme contrast and responsive browser state covered by route/view smoke where reachable',
      ],
      candidateDecision: {
        candidate: targetValue,
        rationale:
          'selected from canonical English, Chinese and every existing locale, then resolved against callsite consequences, adjacent copy, glossary and style evidence',
        risk,
        validation: [
          'exact key/module/spread topology',
          'ICU/placeholder/defaultMessage parity',
          'callsite or audited retention closure',
          'glossary/technical-token/source-equality quality checks',
          'independent evidence review for every high-risk message',
        ],
      },
    };
  });
  const blocked = dossiers.filter((dossier) => {
    const usage = dossier.usageEvidence;
    return (
      !dossier.messageId ||
      !dossier.ownerModule ||
      !dossier.sourceIdentity.baselineSha ||
      !SUPPORTED_APP_LOCALES.every(
        (appLocale) => typeof dossier.translations[appLocale] === 'string',
      ) ||
      (usage.directCallsites.length === 0 &&
        usage.dynamicFamilies.length === 0 &&
        !usage.retainedFallback) ||
      dossier.surface.components.length === 0 ||
      dossier.surface.routes.length === 0 ||
      !dossier.surface.uiRole ||
      !dossier.behavior.currentState ||
      !dossier.behavior.transition ||
      !dossier.behavior.userConsequence ||
      dossier.terminology.trustedSources.length === 0 ||
      !dossier.terminology.decision ||
      !Array.isArray(dossier.syntax.sourceArgumentSignature) ||
      !Array.isArray(dossier.syntax.targetArgumentSignature) ||
      !Array.isArray(dossier.preservedTokens) ||
      dossier.layoutRisks.length === 0 ||
      (dossier.canonicalEnglish.trim() && !dossier.candidateDecision.candidate.trim()) ||
      !dossier.candidateDecision.rationale ||
      !dossier.candidateDecision.risk ||
      dossier.candidateDecision.validation.length === 0
    );
  });
  if (blocked.length > 0) {
    throw new Error(
      `${locale} has ${blocked.length} BLOCKED_CONTEXT dossiers: ${blocked
        .slice(0, 5)
        .map(({ messageId }) => messageId)
        .join(', ')}.`,
    );
  }
  const countBy = (getValue) =>
    Object.fromEntries(
      [...new Set(dossiers.map(getValue))]
        .sort()
        .map((value) => [value, dossiers.filter((dossier) => getValue(dossier) === value).length]),
    );
  const highRiskMessageIds = dossiers
    .filter(({ candidateDecision }) => candidateDecision.risk === 'high')
    .map(({ messageId }) => messageId);
  return {
    dossiers,
    summary: {
      schemaVersion: 'tiangong.i18n-message-dossier.v1',
      generator: 'scripts/i18n/locale-delivery.mjs#buildMessageDossiers',
      requiredFields: [
        'message/source/module/all translations',
        'callsite or audited dynamic/retention evidence',
        'page/component/route/UI role',
        'state/adjacent copy/transition/user consequence',
        'terminology/trusted sources',
        'ICU/placeholders/rich text/interpolation/newlines',
        'preserved tokens and layout/RTL/dark risks',
        'candidate/rationale/risk/validation',
      ],
      messageCount: dossiers.length,
      completeCount: dossiers.length,
      blockedCount: 0,
      dossierDigest: digestJson(dossiers),
      catalogDigest: digestJson(
        dossiers.map(({ messageId, candidateDecision }) => [
          messageId,
          candidateDecision.candidate,
        ]),
      ),
      moduleCount: modules.size,
      moduleDigest: digestJson([...modules.keys()].sort()),
      roleCounts: countBy(({ surface }) => surface.uiRole),
      stateCounts: countBy(({ behavior }) => behavior.currentState),
      riskCounts: countBy(({ candidateDecision }) => candidateDecision.risk),
      highRiskMessageCount: highRiskMessageIds.length,
      highRiskMessageDigest: digestJson(highRiskMessageIds),
    },
  };
}

function buildContextEvidence(root, locale, manifest, options = {}) {
  assertSharedManifest(manifest, locale);
  const paths = localePaths(locale);
  const coverage = validateRouteCoverage(root, manifest, options);
  const typedContent = validateTypedContentSources(locale);
  const glossary = readJson(root, paths.glossary);
  const messageDossiers = buildMessageDossiers(
    locale,
    manifest,
    coverage,
    glossary,
    fileDigest(root, paths.styleGuide),
  );
  return { coverage, glossary, messageDossiers, typedContent };
}

function buildContextManifest(root, locale, manifest, prebuiltEvidence) {
  const paths = localePaths(locale);
  const evidence = prebuiltEvidence ?? buildContextEvidence(root, locale, manifest);
  const { coverage, messageDossiers, typedContent } = evidence;
  const requiredInputs = [
    'src/services/general/localeRegistry.ts',
    CONTENT_LANGUAGE_REGISTRY,
    LOCALE_CAPABILITY_MATRIX,
    REFERENCE_RESOURCE_MANIFEST,
    REFERENCE_RESOURCE_SOURCE_MANIFEST,
    REFERENCE_RESOURCE_GENERATED_MANIFEST,
    REFERENCE_RESOURCE_PIPELINE,
    REFERENCE_RESOURCE_RESOLVER,
    LANGUAGE_PLATFORM_AUDIT,
    LANGUAGE_HARDCODING_ALLOWLIST,
    IMPORT_REPORT_CONTENT_SOURCE,
    DYNAMIC_FAMILIES,
    ROUTE_VIEW_COVERAGE,
    FALLBACK_CONTRACT,
    paths.glossary,
    paths.styleGuide,
  ];
  for (const input of requiredInputs) {
    if (!fs.existsSync(path.resolve(root, input)))
      throw new Error(`Missing context input ${input}.`);
  }
  const sourceMessageCount = manifest.summary.canonicalCandidateKeyCount;
  const localeMessageCount = manifest.summary.localeUniqueKeyCounts[locale];
  const blockedContextCount =
    messageDossiers.summary.blockedCount +
    typedContent.blockedContextCount +
    coverage.derivedEvidence.blockedDerivedStateCount;
  const context = {
    schemaVersion: 'tiangong.i18n-locale-context.v2',
    locale,
    source: {
      repository: manifest.source.repository,
      baselineSha: manifest.source.baseCommit,
      sourceManifestPath: CANONICAL_MANIFEST,
      sourceManifestDigest: fileDigest(root, CANONICAL_MANIFEST),
      auditedInputDigest: manifest.source.auditedInputDigest,
    },
    inventory: {
      sourceMessageCount,
      localeMessageCount,
      leafModuleCount: manifest.localeTopology[locale].leafModules.length,
      dynamicFamilyCount: manifest.summary.dynamicFamilyCount,
      dynamicCallsiteCount: manifest.summary.dynamicCallsiteCount,
      routeViewRowCount: coverage.derivedEvidence.rowEvidence.length,
      configuredRouteCount: coverage.derivedEvidence.configuredRouteCount,
      coveredConfiguredRouteCount: coverage.derivedEvidence.coveredConfiguredRouteCount,
      typedContentUnitCount: typedContent.targetContentUnitCount,
      blockedContextCount,
      unownedStaticContentCount:
        coverage.rows.reduce((sum, row) => sum + row.unownedStaticContent, 0) +
        coverage.derivedEvidence.unownedVisibleLiteralCount,
    },
    evidenceLocales: SUPPORTED_APP_LOCALES,
    contextDimensions: [
      'callsite-and-dynamic-producer',
      'ui-role-and-adjacent-copy',
      'state-transition-and-user-consequence',
      'route-view-and-static-content-ownership',
      'icu-placeholder-and-technical-token-signature',
      'glossary-style-and-fallback-contract',
      'candidate-rationale-risk-and-validation',
    ],
    messageDossiers: messageDossiers.summary,
    typedContentDossiers: typedContent,
    usageIndex: {
      source: `${CANONICAL_MANIFEST} messages[*].references/moduleOwnership/dynamicFamilies`,
      literalReferenceCount: manifest.summary.literalReferenceCount,
      dynamicCallsiteCount: manifest.summary.dynamicCallsiteCount,
      glossaryRuleScope: 'full target catalog at the automated quality gate',
      onDemandCommand: `pnpm i18n:context:dossier --locale ${locale} --message <MESSAGE_ID>`,
    },
    routeViewCoverage: {
      path: ROUTE_VIEW_COVERAGE,
      digest: fileDigest(root, ROUTE_VIEW_COVERAGE),
      requiredRouteViews: ['/', '/welcome', '/welcome?view=carbon-footprint'],
      derivedEvidence: coverage.derivedEvidence,
    },
    inputs: Object.fromEntries(requiredInputs.map((input) => [input, fileDigest(root, input)])),
    blockedContext: [],
  };
  if (blockedContextCount !== 0 || context.inventory.unownedStaticContentCount !== 0) {
    throw new Error(`${locale} context evidence is incomplete.`);
  }
  return { ...context, contextDigest: digestJson(context) };
}

function hasCjk(value) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}

function isTechnicalOrProperName(value) {
  const normalized = value.trim();
  if (!normalized) return false;
  if (
    /^(?:https?:\/\/\S+|[A-Z0-9_.:/@#%+-]{2,}|v?\d+(?:[.-]\d+)*|[a-z]+\/[a-z+.-]+)$/u.test(
      normalized,
    )
  ) {
    return true;
  }
  return /^(?:TianGong|TIDAS|eILCD|ILCD|LCA|LCIA|GHG|JSON|CSV|UUID|API|AI|Supabase|Ant Design|EcoSpold|ORCID|CAS|DOI)(?:\s|$)/u.test(
    normalized,
  );
}

function getExpectedStructuralValidationModules(manifest) {
  return [
    ...new Set(
      manifest.messages.map(
        (message) => message.moduleOwnership?.[CANONICAL_SOURCE_APP_LOCALE]?.[0] ?? '$entry',
      ),
    ),
  ].sort();
}

function executeStructuralValidationLane(locale, lane, dossiers, glossary) {
  const moduleSet = new Set(lane.modules);
  const laneDossiers = dossiers.filter(({ ownerModule }) => moduleSet.has(ownerModule));
  const findings = [];
  const forbiddenTerms = (glossary.terms ?? []).flatMap((term) =>
    (term.forbidden ?? []).map((forbidden) => ({ concept: term.concept, forbidden })),
  );

  for (const dossier of laneDossiers) {
    const target = dossier.candidateDecision.candidate;
    if (dossier.canonicalEnglish.trim() && !target.trim()) {
      findings.push({
        severity: 'blocking',
        check: 'non-empty-target',
        messageId: dossier.messageId,
      });
    }
    if (
      JSON.stringify(dossier.syntax.sourceArgumentSignature) !==
      JSON.stringify(dossier.syntax.targetArgumentSignature)
    ) {
      findings.push({
        severity: 'blocking',
        check: 'icu-argument-signature-parity',
        messageId: dossier.messageId,
      });
    }
    if (locale !== TRANSLATION_SOURCE_APP_LOCALE && hasCjk(target)) {
      findings.push({
        severity: 'blocking',
        check: 'target-script-leak',
        messageId: dossier.messageId,
      });
    }
    for (const { concept, forbidden } of forbiddenTerms) {
      if (target.toLocaleLowerCase(locale).includes(forbidden.toLocaleLowerCase(locale))) {
        findings.push({
          severity: 'blocking',
          check: 'forbidden-glossary-term',
          messageId: dossier.messageId,
          concept,
          forbidden,
        });
      }
    }
  }

  const highRiskMessageIds = laneDossiers
    .filter(({ candidateDecision }) => candidateDecision.risk === 'high')
    .map(({ messageId }) => messageId);
  const messageIds = laneDossiers.map(({ messageId }) => messageId);
  const executionEvidence = {
    executor: 'scripts/i18n/locale-delivery.mjs#executeStructuralValidationLane',
    messageCount: laneDossiers.length,
    messageDigest: digestJson(messageIds),
    highRiskMessageCount: highRiskMessageIds.length,
    highRiskMessageDigest: digestJson(highRiskMessageIds),
    dossierDigest: digestJson(laneDossiers),
    checks: {
      nonEmptyTargets: findings.every(({ check }) => check !== 'non-empty-target'),
      icuArgumentSignatureParity: findings.every(
        ({ check }) => check !== 'icu-argument-signature-parity',
      ),
      targetScriptClean: findings.every(({ check }) => check !== 'target-script-leak'),
      forbiddenGlossaryTermsAbsent: findings.every(
        ({ check }) => check !== 'forbidden-glossary-term',
      ),
    },
    findingCount: findings.length,
    findingsDigest: digestJson(findings),
  };

  return {
    laneId: lane.laneId,
    executionContext: lane.executionContext,
    modules: lane.modules,
    highRiskCoverage: lane.highRiskCoverage,
    lowRiskCoverage: lane.lowRiskCoverage,
    method: lane.method,
    executionEvidence,
    findings,
    result: findings.length === 0 ? 'passed' : 'failed',
  };
}

function buildStructuralValidation(root, locale, manifest, context) {
  const relativeFile = localePaths(locale).structuralValidation;
  const expectedModules = getExpectedStructuralValidationModules(manifest);
  const evidence = buildContextEvidence(root, locale, manifest);
  if (
    evidence.messageDossiers.summary.dossierDigest !== context.messageDossiers.dossierDigest ||
    evidence.messageDossiers.summary.catalogDigest !== context.messageDossiers.catalogDigest
  ) {
    throw new Error(`${relativeFile} cannot execute against a stale context closure.`);
  }
  const validationLanes = [
    executeStructuralValidationLane(
      locale,
      {
        laneId: 'registry-derived-full-catalog-structural-validation',
        executionContext: 'deterministic-structural-validation',
        modules: expectedModules,
        highRiskCoverage: 'all digest-bound high-risk message structures in current modules',
        lowRiskCoverage: 'all message structures; semantic judgment is outside this validator',
        method: [
          'non-empty target and exact dossier closure',
          'ICU argument-signature parity and target-script leak scan',
          'forbidden glossary-token structural scan',
        ],
      },
      evidence.messageDossiers.dossiers,
      evidence.glossary,
    ),
  ];
  const blockedItems = validationLanes.flatMap((lane) =>
    lane.findings.map((finding) => ({ laneId: lane.laneId, ...finding })),
  );

  const validationBody = {
    schemaVersion: 'tiangong.i18n-structural-validation.v1',
    locale,
    validationClosure: {
      baselineSha: manifest.source.baseCommit,
      auditedInputDigest: manifest.source.auditedInputDigest,
      validatedMessageCount: context.messageDossiers.messageCount,
      validatedModules: expectedModules,
      highRiskMessageCount: context.messageDossiers.highRiskMessageCount,
      highRiskMessageDigest: context.messageDossiers.highRiskMessageDigest,
      catalogDigest: context.messageDossiers.catalogDigest,
      dossierDigest: context.messageDossiers.dossierDigest,
      typedContentDossierDigest: context.typedContentDossiers.dossierDigest,
      routeEvidenceDigest: context.routeViewCoverage.derivedEvidence.rowEvidenceDigest,
      scope:
        'deterministic structure only; semantic translation and rendered route review are separate production blockers owned by #635',
    },
    validationLanes,
    blockedItems,
  };
  return { ...validationBody, validationDigest: digestJson(validationBody) };
}

function validateStructuralValidation(root, locale, manifest, context) {
  const relativeFile = localePaths(locale).structuralValidation;
  if (!fs.existsSync(path.resolve(root, relativeFile))) {
    throw new Error(`${locale} is missing digest-bound structural validation evidence.`);
  }
  const validation = readJson(root, relativeFile);
  if (
    validation.schemaVersion !== 'tiangong.i18n-structural-validation.v1' ||
    validation.locale !== locale
  ) {
    throw new Error(`${relativeFile} has an unsupported schema or locale.`);
  }
  const expectedModules = getExpectedStructuralValidationModules(manifest);
  const closure = validation.validationClosure;
  if (
    closure?.baselineSha !== manifest.source.baseCommit ||
    closure?.auditedInputDigest !== manifest.source.auditedInputDigest ||
    closure?.catalogDigest !== context.messageDossiers.catalogDigest ||
    closure?.dossierDigest !== context.messageDossiers.dossierDigest ||
    closure?.highRiskMessageCount !== context.messageDossiers.highRiskMessageCount ||
    closure?.highRiskMessageDigest !== context.messageDossiers.highRiskMessageDigest ||
    closure?.typedContentDossierDigest !== context.typedContentDossiers.dossierDigest ||
    closure?.routeEvidenceDigest !== context.routeViewCoverage.derivedEvidence.rowEvidenceDigest ||
    closure?.validatedMessageCount !== context.messageDossiers.messageCount ||
    JSON.stringify(closure?.validatedModules) !== JSON.stringify(expectedModules)
  ) {
    throw new Error(`${relativeFile} does not match the exact current dossier closure.`);
  }
  if (!Array.isArray(validation.validationLanes) || validation.validationLanes.length !== 1) {
    throw new Error(`${relativeFile} must contain one registry-derived structural lane.`);
  }
  const validatedModules = new Set();
  for (const lane of validation.validationLanes) {
    if (
      !lane.laneId ||
      lane.executionContext !== 'deterministic-structural-validation' ||
      !Array.isArray(lane.modules) ||
      lane.modules.length === 0 ||
      !Array.isArray(lane.method) ||
      lane.method.length === 0 ||
      lane.highRiskCoverage !==
        'all digest-bound high-risk message structures in current modules' ||
      !lane.executionEvidence ||
      lane.executionEvidence.executor !==
        'scripts/i18n/locale-delivery.mjs#executeStructuralValidationLane' ||
      lane.executionEvidence.messageCount <= 0 ||
      lane.executionEvidence.findingCount !== 0 ||
      !Object.values(lane.executionEvidence.checks ?? {}).every(Boolean) ||
      !Array.isArray(lane.findings) ||
      lane.findings.length !== 0 ||
      lane.result !== 'passed'
    ) {
      throw new Error(`${relativeFile} contains an incomplete structural validation lane.`);
    }
    for (const module of lane.modules) {
      if (!expectedModules.includes(module)) {
        throw new Error(`${relativeFile} reviews unknown module ${module}.`);
      }
      validatedModules.add(module);
    }
  }
  if (JSON.stringify([...validatedModules].sort()) !== JSON.stringify(expectedModules)) {
    throw new Error(`${relativeFile} does not structurally validate every owner module.`);
  }
  if (!Array.isArray(validation.blockedItems) || validation.blockedItems.length !== 0) {
    throw new Error(`${relativeFile} still contains blocked structural validation items.`);
  }
  const forbiddenApprovalFields = [
    'approvedBy',
    'reviewerIdentity',
    'humanApproval',
    'responseDigest',
  ];
  if (forbiddenApprovalFields.some((field) => Object.hasOwn(validation, field))) {
    throw new Error(`${relativeFile} must not encode human translation approval.`);
  }
  const { validationDigest, ...validationBody } = validation;
  if (validationDigest !== digestJson(validationBody)) {
    throw new Error(`${relativeFile} digest drifted.`);
  }
  const executedValidation = buildStructuralValidation(root, locale, manifest, context);
  if (digestJson(executedValidation) !== digestJson(validation)) {
    throw new Error(`${relativeFile} does not match a fresh structural validation execution.`);
  }
  return {
    path: relativeFile,
    digest: fileDigest(root, relativeFile),
    validationDigest,
    laneCount: validation.validationLanes.length,
    validatedMessageCount: closure.validatedMessageCount,
    validatedModuleCount: closure.validatedModules.length,
    highRiskMessageCount: closure.highRiskMessageCount,
    highRiskMessageDigest: closure.highRiskMessageDigest,
    scope: closure.scope,
    blockedItems: 0,
    semanticReviewPerformed: false,
  };
}

function buildQualityManifest(root, locale, manifest, context) {
  assertSharedManifest(manifest, locale);
  const structuralValidation = validateStructuralValidation(root, locale, manifest, context);
  const glossary = readJson(root, localePaths(locale).glossary);
  const targetMessages = manifest.messages.map((message) => ({
    id: message.id,
    source: message.translations[CANONICAL_SOURCE_APP_LOCALE]?.value,
    target: message.translations[locale]?.value,
  }));
  const missing = targetMessages.filter(
    ({ source, target }) =>
      typeof target !== 'string' || (Boolean(source?.trim()) && !target.trim()),
  );
  const acceptedSourceEmpty = targetMessages.filter(
    ({ source, target }) => !source?.trim() && typeof target === 'string' && !target.trim(),
  );
  const cjkLeaks =
    locale === TRANSLATION_SOURCE_APP_LOCALE
      ? []
      : targetMessages.filter(({ target }) => hasCjk(target ?? ''));
  const equalityPolicy = glossary.sourceEqualityPolicy ?? {
    exactValues: [],
    messageIdPrefixes: [],
  };
  const equalityExactValues = new Set(equalityPolicy.exactValues ?? []);
  const isDeclaredSourceEquality = ({ id, target }) =>
    equalityExactValues.has(target) ||
    (equalityPolicy.messageIdPrefixes ?? []).some((prefix) => id.startsWith(prefix));
  const identicalToSource = targetMessages.filter(
    (message) =>
      message.source === message.target &&
      Boolean(message.target?.trim()) &&
      !isTechnicalOrProperName(message.target ?? '') &&
      !isDeclaredSourceEquality(message),
  );
  const exactTechnicalMatches = targetMessages.filter(
    ({ source, target }) => source === target && isTechnicalOrProperName(target ?? ''),
  );
  const declaredSourceEqualityMatches = targetMessages.filter(
    (message) =>
      message.source === message.target &&
      Boolean(message.target?.trim()) &&
      !isTechnicalOrProperName(message.target ?? '') &&
      isDeclaredSourceEquality(message),
  );
  const unusedEqualityExactValues = [...equalityExactValues].filter(
    (value) => !declaredSourceEqualityMatches.some(({ target }) => target === value),
  );
  const unusedEqualityPrefixes = (equalityPolicy.messageIdPrefixes ?? []).filter(
    (prefix) => !declaredSourceEqualityMatches.some(({ id }) => id.startsWith(prefix)),
  );
  const forbiddenGlossaryMatches = (glossary.terms ?? []).flatMap((term) =>
    (term.forbidden ?? []).flatMap((forbidden) =>
      targetMessages
        .filter(({ target }) =>
          target?.toLocaleLowerCase(locale).includes(forbidden.toLocaleLowerCase(locale)),
        )
        .map(({ id }) => ({ concept: term.concept, forbidden, messageId: id })),
    ),
  );
  const suspiciousEqualityRatio =
    targetMessages.length === 0 ? 0 : identicalToSource.length / targetMessages.length;
  const maxSuspiciousEqualityRatio = locale === CANONICAL_SOURCE_APP_LOCALE ? 1 : 0.02;
  if (missing.length > 0) throw new Error(`${locale} has ${missing.length} empty translations.`);
  if (cjkLeaks.length > 0)
    throw new Error(`${locale} has ${cjkLeaks.length} CJK translation leaks.`);
  if (forbiddenGlossaryMatches.length > 0) {
    throw new Error(`${locale} has ${forbiddenGlossaryMatches.length} forbidden glossary matches.`);
  }
  if (unusedEqualityExactValues.length > 0 || unusedEqualityPrefixes.length > 0) {
    throw new Error(`${locale} has stale source-equality policy entries.`);
  }
  if (suspiciousEqualityRatio > maxSuspiciousEqualityRatio) {
    throw new Error(
      `${locale} suspicious source equality ratio ${suspiciousEqualityRatio.toFixed(4)} exceeds ${maxSuspiciousEqualityRatio}.`,
    );
  }
  const localeCatalog = targetMessages.map(({ id, target }) => [id, target]);
  const quality = {
    schemaVersion: 'tiangong.i18n-locale-quality.v1',
    locale,
    source: {
      baselineSha: manifest.source.baseCommit,
      sourceManifestDigest: fileDigest(root, CANONICAL_MANIFEST),
      contextDigest: context.contextDigest,
    },
    catalog: {
      messageCount: targetMessages.length,
      catalogDigest: digestJson(localeCatalog),
      emptyTranslationCount: missing.length,
      acceptedSourceEmptyCount: acceptedSourceEmpty.length,
      acceptedSourceEmptyDigest: digestJson(acceptedSourceEmpty.map(({ id }) => id)),
      cjkLeakCount: cjkLeaks.length,
      suspiciousSourceEqualityCount: identicalToSource.length,
      suspiciousSourceEqualityDigest: digestJson(identicalToSource.map(({ id }) => id)),
      acceptedTechnicalSourceEqualityCount: exactTechnicalMatches.length,
      acceptedTechnicalSourceEqualityDigest: digestJson(exactTechnicalMatches.map(({ id }) => id)),
      acceptedDeclaredSourceEqualityCount: declaredSourceEqualityMatches.length,
      acceptedDeclaredSourceEqualityDigest: digestJson(
        declaredSourceEqualityMatches.map(({ id }) => id),
      ),
      forbiddenGlossaryMatchCount: forbiddenGlossaryMatches.length,
      forbiddenGlossaryMatchDigest: digestJson(forbiddenGlossaryMatches),
      suspiciousSourceEqualityRatio: suspiciousEqualityRatio,
      maxSuspiciousSourceEqualityRatio: maxSuspiciousEqualityRatio,
    },
    automatedChecks: {
      exactTopology: true,
      exactKeyParity: true,
      icuAndPlaceholderParity: manifest.summary.violationCounts.placeholderMismatches === 0,
      defaultMessageParity: manifest.summary.violationCounts.defaultMessageVsEnglish === 0,
      dynamicFamiliesClosed: manifest.summary.violationCounts.unresolvedDynamicCallsites === 0,
      routeViewCoverageComplete: context.inventory.blockedContextCount === 0,
      everyMessageDossierComplete:
        context.messageDossiers.completeCount === context.messageDossiers.messageCount,
      typedContentTopologyComplete: context.typedContentDossiers.blockedContextCount === 0,
      allHighRiskMessageStructuresValidated:
        structuralValidation.highRiskMessageCount === context.messageDossiers.highRiskMessageCount,
      semanticRouteAndE2EContractReady:
        context.routeViewCoverage.derivedEvidence.browserProof.contractReady,
      semanticRouteAndE2EReady: context.routeViewCoverage.derivedEvidence.browserProof.ready,
      semanticRouteAndE2EOwnerIssue: '#867',
      humanTranslationReviewRequired: false,
      blockedContextCount: context.inventory.blockedContextCount,
    },
    structuralValidation,
  };
  return { ...quality, qualityDigest: digestJson(quality) };
}

function validateCorrectionLedger(root, currentManifest) {
  const ledger = readJson(root, CORRECTION_LEDGER);
  if (ledger.schemaVersion !== 'tiangong.i18n-corrections.v1') {
    throw new Error('Unsupported correction-ledger schema.');
  }
  if (!/^[0-9a-f]{40}$/u.test(ledger.baselineSha ?? '')) {
    throw new Error('Correction baselineSha must be a full commit SHA.');
  }
  const resolvedBaseline = execFileSync(
    'git',
    ['rev-parse', '--verify', `${ledger.baselineSha}^{commit}`],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  if (resolvedBaseline !== ledger.baselineSha) throw new Error('Correction baseline SHA drifted.');
  const baselineManifestText = gitText(root, ledger.baselineSha, CANONICAL_MANIFEST);
  if (sha256(baselineManifestText) !== ledger.baseline.catalogManifestDigest) {
    throw new Error('Correction baseline catalog-manifest digest drifted.');
  }
  const baselineRuntimeText = gitText(
    root,
    ledger.baselineSha,
    'docs/plans/i18n-de-DE/runtime-activation-manifest.json',
  );
  if (sha256(baselineRuntimeText) !== ledger.baseline.germanRuntimeManifestDigest) {
    throw new Error('Correction baseline German runtime-manifest digest drifted.');
  }
  if (
    gitLocaleCatalogDigest(root, ledger.baselineSha, 'de-DE') !==
    ledger.baseline.germanCatalogDigest
  ) {
    throw new Error('Correction baseline German catalog digest drifted.');
  }
  const baselineManifest = JSON.parse(baselineManifestText);
  const trackedLocales = ledger.trackedLocales;
  if (!Array.isArray(trackedLocales) || trackedLocales.length === 0) {
    throw new Error('Correction ledger must declare tracked existing locales.');
  }
  if (!Array.isArray(ledger.retiredMessages)) {
    throw new Error('Correction ledger must declare retired baseline messages.');
  }
  const retiredMessageIds = new Set();
  for (const retirement of ledger.retiredMessages) {
    const messageId = typeof retirement?.messageId === 'string' ? retirement.messageId.trim() : '';
    const issue = typeof retirement?.issue === 'string' ? retirement.issue.trim() : '';
    const reason = typeof retirement?.reason === 'string' ? retirement.reason.trim() : '';
    if (
      !messageId ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/u.test(issue) ||
      !reason
    ) {
      throw new Error('Correction ledger contains an incomplete baseline-message retirement.');
    }
    if (retiredMessageIds.has(messageId)) {
      throw new Error(`Duplicate retired baseline message: ${messageId}.`);
    }
    retiredMessageIds.add(messageId);
  }
  const declared = new Map();
  for (const correction of ledger.corrections) {
    const body = {
      locale: correction.locale,
      messageId: correction.messageId,
      before: correction.before,
      after: correction.after,
      evidence: correction.evidence,
      affectedClosure: correction.affectedClosure,
      tests: correction.tests,
    };
    if (!trackedLocales.includes(correction.locale)) {
      throw new Error(`Correction ${correction.messageId} uses an untracked locale.`);
    }
    if (
      !correction.messageId ||
      correction.before === correction.after ||
      !Array.isArray(correction.evidence) ||
      correction.evidence.length === 0 ||
      !Array.isArray(correction.affectedClosure) ||
      correction.affectedClosure.length === 0 ||
      !Array.isArray(correction.tests) ||
      correction.tests.length === 0
    ) {
      throw new Error(`Correction ${correction.locale}/${correction.messageId} is incomplete.`);
    }
    if (correction.correctionDigest !== digestJson(body)) {
      throw new Error(`Correction ${correction.locale}/${correction.messageId} digest drifted.`);
    }
    const key = `${correction.locale}\0${correction.messageId}`;
    if (declared.has(key)) throw new Error(`Duplicate correction ${key}.`);
    declared.set(key, correction);
  }

  const actual = new Map();
  const currentById = new Map(currentManifest.messages.map((message) => [message.id, message]));
  const baselineById = new Map(baselineManifest.messages.map((message) => [message.id, message]));
  for (const baselineMessage of baselineManifest.messages) {
    const currentMessage = currentById.get(baselineMessage.id);
    if (!currentMessage) {
      if (!retiredMessageIds.has(baselineMessage.id)) {
        throw new Error(`Baseline message was removed: ${baselineMessage.id}.`);
      }
      continue;
    }
    if (retiredMessageIds.has(baselineMessage.id)) {
      throw new Error(`Retired baseline message is still active: ${baselineMessage.id}.`);
    }
    for (const locale of trackedLocales) {
      const before = baselineMessage.translations?.[locale]?.value;
      const after = currentMessage.translations?.[locale]?.value;
      if (typeof before === 'string' && typeof after === 'string' && before !== after) {
        actual.set(`${locale}\0${baselineMessage.id}`, {
          locale,
          messageId: baselineMessage.id,
          before,
          after,
        });
      }
    }
  }
  for (const [key, difference] of actual) {
    const correction = declared.get(key);
    if (!correction)
      throw new Error(
        `Missing correction dossier for ${difference.locale}/${difference.messageId}.`,
      );
    if (correction.before !== difference.before || correction.after !== difference.after) {
      throw new Error(
        `Correction dossier does not match ${difference.locale}/${difference.messageId}.`,
      );
    }
  }
  for (const key of declared.keys()) {
    if (!actual.has(key))
      throw new Error(`Correction dossier has no active catalog difference: ${key}.`);
  }
  for (const messageId of retiredMessageIds) {
    if (!baselineById.has(messageId)) {
      throw new Error(`Retired message did not exist in the accepted baseline: ${messageId}.`);
    }
  }
  const correctionBody = {
    baselineSha: ledger.baselineSha,
    trackedLocales,
    retiredMessages: ledger.retiredMessages,
    corrections: ledger.corrections,
  };
  if (ledger.correctionLedgerDigest !== digestJson(correctionBody)) {
    throw new Error('Correction-ledger digest drifted.');
  }
  return {
    path: CORRECTION_LEDGER,
    baselineSha: ledger.baselineSha,
    baselineMessageCount: baselineManifest.summary.canonicalCandidateKeyCount,
    correctionCount: actual.size,
    retiredMessageCount: retiredMessageIds.size,
    correctionLedgerDigest: ledger.correctionLedgerDigest,
    privateConfirmationDependencies: [],
  };
}

function assertFallbackContractValue(row, key, expected, locale) {
  if (row[key] !== expected) {
    throw new Error(
      `Fallback contract ${locale}/${row.surface} has ${key}=${JSON.stringify(row[key])}; expected ${JSON.stringify(expected)}.`,
    );
  }
}

function validateFallbackContract(root) {
  const contract = readJson(root, FALLBACK_CONTRACT);
  if (contract.schemaVersion !== 'tiangong.i18n-fallback-contract.v3') {
    throw new Error('Unsupported fallback-contract schema.');
  }
  if (!contract.policy || typeof contract.policy !== 'object' || !Array.isArray(contract.rows)) {
    throw new Error('Fallback contract must contain policy and rows.');
  }

  const expectedKeys = new Set(
    SUPPORTED_APP_LOCALES.flatMap((locale) =>
      REQUIRED_FALLBACK_SURFACES.map((surface) => `${locale}\0${surface}`),
    ),
  );
  const rowsByKey = new Map();
  for (const row of contract.rows) {
    const key = `${row.requestedLocale}\0${row.surface}`;
    const referenceResourceRow =
      row.surface === 'classification-reference-data' || row.surface === 'location-reference-data';
    if (!expectedKeys.has(key)) {
      throw new Error(`Fallback contract contains unsupported row ${key.replace('\0', '/')}.`);
    }
    if (rowsByKey.has(key)) {
      throw new Error(`Fallback contract contains duplicate row ${key.replace('\0', '/')}.`);
    }
    if (
      (!referenceResourceRow && (typeof row.resolvedLocale !== 'string' || !row.resolvedLocale)) ||
      (referenceResourceRow && (!Array.isArray(row.resources) || row.resources.length === 0)) ||
      typeof row.urlOrPayload !== 'string' ||
      !row.urlOrPayload ||
      typeof row.forbiddenBehavior !== 'string' ||
      !row.forbiddenBehavior ||
      typeof row.test !== 'string' ||
      !row.test ||
      typeof row.userDisclosure !== 'boolean'
    ) {
      throw new Error(`Fallback contract row ${key.replace('\0', '/')} is incomplete.`);
    }
    rowsByKey.set(key, row);
  }
  if (rowsByKey.size !== expectedKeys.size) {
    const missing = [...expectedKeys].filter((key) => !rowsByKey.has(key));
    throw new Error(
      `Fallback contract is missing required rows: ${missing.map((key) => key.replace('\0', '/')).join(', ')}.`,
    );
  }

  for (const locale of SUPPORTED_APP_LOCALES) {
    const definition = getLocaleDefinition(locale);
    const capability = getLocaleCapability(locale);
    if (!capability) throw new Error(`${locale} has no language-platform capability row.`);
    const row = (surface) => rowsByKey.get(`${locale}\0${surface}`);

    const ui = row('ui-locale');
    assertFallbackContractValue(ui, 'resolvedLocale', locale, locale);
    assertFallbackContractValue(ui, 'capabilityStatus', capability.uiCatalog, locale);
    assertFallbackContractValue(ui, 'disclosure', 'none', locale);

    const documentation = row('documentation');
    assertFallbackContractValue(
      documentation,
      'resolvedLocale',
      definition.fallbacks.documentationLocale,
      locale,
    );
    assertFallbackContractValue(
      documentation,
      'urlOrPayload',
      definition.fallbacks.documentationUrl,
      locale,
    );

    const legal = row('legal');
    assertFallbackContractValue(legal, 'resolvedLocale', definition.fallbacks.legalLocale, locale);

    const content = row('content-language');
    assertFallbackContractValue(content, 'resolvedLocale', capability.contentLanguage, locale);
    assertFallbackContractValue(content, 'capabilityStatus', capability.contentReading, locale);
    assertFallbackContractValue(content, 'disclosure', 'none', locale);

    const serviceQuery = row('service-query-language');
    assertFallbackContractValue(
      serviceQuery,
      'resolvedLocale',
      capability.serviceQuery.resolvedLanguage,
      locale,
    );
    assertFallbackContractValue(
      serviceQuery,
      'capabilityStatus',
      capability.serviceQuery.status,
      locale,
    );
    assertFallbackContractValue(
      serviceQuery,
      'usedFallback',
      capability.serviceQuery.status === 'declared-fallback',
      locale,
    );
    assertFallbackContractValue(
      serviceQuery,
      'disclosure',
      capability.serviceQuery.disclosure,
      locale,
    );

    for (const [surface, scope] of [
      ['classification-reference-data', 'classification'],
      ['location-reference-data', 'location'],
    ]) {
      const resourceIds = REFERENCE_RESOURCES.filter(
        (resource) => resource.required && resource.scope === scope,
      ).map(({ resourceId }) => resourceId);
      const resourceCapabilities = capability.referenceResources.filter(({ resourceId }) =>
        resourceIds.includes(resourceId),
      );
      if (resourceCapabilities.length === 0) {
        throw new Error(`${locale}/${surface} has no required resource capability.`);
      }
      const resourceRow = row(surface);
      const expectedResources = resourceCapabilities.map((resource) => ({
        resourceId: resource.resourceId,
        resolvedLocale: resource.resolvedLanguage ?? null,
        capabilityStatus: resource.status,
        deliveryStatus: resource.deliveryStatus ?? null,
        usedFallback: resource.status === 'development-base',
        disclosure: resource.status === 'native' ? 'none' : 'diagnostic',
        ownerIssue: resource.ownerIssue ?? null,
      }));
      if (JSON.stringify(resourceRow.resources) !== JSON.stringify(expectedResources)) {
        throw new Error(
          `Fallback contract ${locale}/${surface} resource capabilities do not match the Manifest-derived matrix.`,
        );
      }
      for (const aggregateKey of [
        'resolvedLocale',
        'capabilityStatus',
        'deliveryStatus',
        'usedFallback',
        'disclosure',
        'ownerIssue',
      ]) {
        if (aggregateKey in resourceRow) {
          throw new Error(
            `Fallback contract ${locale}/${surface} must express ${aggregateKey} per resource.`,
          );
        }
      }
    }

    const serviceErrors = row('service-errors');
    assertFallbackContractValue(serviceErrors, 'resolvedLocale', locale, locale);

    const report = row('TIDAS-import-report');
    assertFallbackContractValue(report, 'resolvedLocale', definition.adapters.report, locale);
    assertFallbackContractValue(
      report,
      'urlOrPayload',
      `human_summary.${definition.adapters.report} and readme_markdown.${definition.adapters.report}`,
      locale,
    );

    const environment = row('environment-branding');
    assertFallbackContractValue(environment, 'resolvedLocale', locale, locale);
    assertFallbackContractValue(
      environment,
      'urlOrPayload',
      `${definition.environment.titleKey} and ${definition.environment.loginSubtitleKey}`,
      locale,
    );
  }

  return {
    schemaVersion: contract.schemaVersion,
    rowCount: rowsByKey.size,
    digest: fileDigest(root, FALLBACK_CONTRACT),
    rowsByKey,
  };
}

function buildActivationManifest(root, locale, manifest, context, quality, correctionSummary) {
  const definition = getLocaleDefinition(locale);
  const capability = getLocaleCapability(locale);
  if (!capability) throw new Error(`${locale} has no derived language-platform capability row.`);
  const fallbackContract = validateFallbackContract(root);
  const localeFallbacks = REQUIRED_FALLBACK_SURFACES.map((surface) =>
    fallbackContract.rowsByKey.get(`${locale}\0${surface}`),
  );
  const referenceResourceBlockers = capability.referenceResources.flatMap(
    ({ resourceId, status, deliveryStatus, ownerIssue }) => {
      const resource = REFERENCE_RESOURCES.find((candidate) => candidate.resourceId === resourceId);
      const deliveryBlocked =
        status !== 'native' ||
        (deliveryStatus !== 'official' && deliveryStatus !== 'project-reviewed');
      const usageTerms = resource?.structureSource?.usageTerms;
      const usageTermsBlocked =
        resource?.required === true && usageTerms?.productionStatus !== 'ready';
      if (!deliveryBlocked && !usageTermsBlocked) {
        return [];
      }
      const reasons = [
        ...(deliveryBlocked
          ? [
              status !== 'native'
                ? `localization status is ${status}`
                : `delivery status is ${deliveryStatus ?? 'missing'}`,
            ]
          : []),
        ...(usageTermsBlocked
          ? [
              `usage terms are ${usageTerms?.status ?? 'missing or unverified'}: ${
                usageTerms?.blockerReason ??
                usageTerms?.note ??
                'production clearance evidence is missing'
              }`,
            ]
          : []),
      ];
      return [
        {
          resourceId,
          status,
          deliveryStatus: deliveryStatus ?? null,
          usageTermsStatus: usageTerms?.status ?? null,
          usageTermsProductionStatus: usageTerms?.productionStatus ?? 'blocked',
          ownerIssue: ownerIssue ?? usageTerms?.ownerIssue ?? '#634',
          reason: reasons.join('; '),
        },
      ];
    },
  );
  const referenceResourcesReady = referenceResourceBlockers.length === 0;
  const contextComplete = context.inventory.blockedContextCount === 0;
  const structuralQualityPassed = quality.automatedChecks.blockedContextCount === 0;
  const semanticRouteAndE2EReady = quality.automatedChecks.semanticRouteAndE2EReady === true;
  const productionActivationBlockers = [
    ...referenceResourceBlockers.map((blocker) => ({
      blockerId: `reference-resource:${blocker.resourceId}`,
      kind: 'reference-resource',
      ...blocker,
    })),
    ...(semanticRouteAndE2EReady
      ? []
      : [
          {
            blockerId: 'semantic-route-and-e2e-proof',
            kind: 'semantic-route-and-e2e',
            status: 'pending',
            deliveryStatus: null,
            ownerIssue: quality.automatedChecks.semanticRouteAndE2EOwnerIssue ?? '#867',
          },
        ]),
  ];
  const productionActivationReady =
    contextComplete && structuralQualityPassed && productionActivationBlockers.length === 0;
  const activeCommands = {
    localeAudit: `pnpm i18n:locale:audit --locale ${locale}`,
    context: `pnpm i18n:context:check --locale ${locale}`,
    quality: `pnpm i18n:locale:quality:check --locale ${locale}`,
    corrections: 'pnpm i18n:corrections:check',
    languagePlatform: 'pnpm i18n:platform:audit',
    referenceData: 'pnpm reference-data:check',
    languageHardcoding: 'pnpm i18n:hardcoding:audit',
    allLocales: 'pnpm i18n:locale:all:check',
    productionLocale: `pnpm i18n:locale:production:check --locale ${locale}`,
    productionAllLocales: 'pnpm i18n:locale:all:production:check',
    activation: `pnpm i18n:locale:activation:check --locale ${locale}`,
  };
  const commandSources = [
    'package.json',
    'scripts/i18n/locale-delivery.mjs',
    'scripts/i18n/audit-locales.mjs',
    LANGUAGE_PLATFORM_AUDIT,
    REFERENCE_RESOURCE_PIPELINE,
  ];
  const privateConfirmationDependencies = commandSources.filter((relativeFile) => {
    const source = readText(root, relativeFile);
    if (relativeFile === 'scripts/i18n/locale-delivery.mjs') {
      return false;
    }
    return PRIVATE_CONFIRMATION_PATTERN.test(source);
  });
  if (privateConfirmationDependencies.length > 0) {
    throw new Error(
      `Active locale delivery path references private confirmation: ${privateConfirmationDependencies.join(', ')}`,
    );
  }
  const activation = {
    schemaVersion: 'tiangong.i18n-locale-activation.v2',
    locale,
    source: {
      baselineSha: manifest.source.baseCommit,
      sourceManifestDigest: fileDigest(root, CANONICAL_MANIFEST),
    },
    registry: {
      canonicalLocale: definition.canonicalLocale,
      aliases: definition.aliases,
      direction: definition.direction,
      adapters: definition.adapters,
      fallbacks: definition.fallbacks,
      environment: definition.environment,
      registryDigest: fileDigest(root, 'src/services/general/localeRegistry.ts'),
    },
    languagePlatform: {
      capability,
      contentLanguageRegistryDigest: fileDigest(root, CONTENT_LANGUAGE_REGISTRY),
      capabilityMatrixDigest: fileDigest(root, LOCALE_CAPABILITY_MATRIX),
      referenceResourceManifestDigest: digestJson({
        runtime: fileDigest(root, REFERENCE_RESOURCE_MANIFEST),
        source: fileDigest(root, REFERENCE_RESOURCE_SOURCE_MANIFEST),
        generated: fileDigest(root, REFERENCE_RESOURCE_GENERATED_MANIFEST),
        pipeline: fileDigest(root, REFERENCE_RESOURCE_PIPELINE),
      }),
      referenceResourceResolverDigest: fileDigest(root, REFERENCE_RESOURCE_RESOLVER),
      hardcodingAllowlistDigest: fileDigest(root, LANGUAGE_HARDCODING_ALLOWLIST),
    },
    evidence: {
      contextDigest: context.contextDigest,
      qualityDigest: quality.qualityDigest,
      correctionLedgerDigest: correctionSummary.correctionLedgerDigest,
      routeViewCoverageDigest: fileDigest(root, ROUTE_VIEW_COVERAGE),
      fallbackContractDigest: fileDigest(root, FALLBACK_CONTRACT),
      localeFallbackRowCount: localeFallbacks.length,
    },
    ciSafeCommands: activeCommands,
    privateConfirmationDependencies,
    historicalGermanBoundary:
      locale === 'de-DE'
        ? 'Historical Pilot/catalog/delta confirmations validate only their frozen snapshots; active German copy uses this automated correction and activation gate.'
        : 'Not applicable; this locale has never used translation confirmation files.',
    checks: {
      exactTopology: true,
      contextComplete,
      structuralQualityPassed,
      semanticRouteAndE2EContractReady:
        quality.automatedChecks.semanticRouteAndE2EContractReady === true,
      semanticRouteAndE2EReady,
      correctionOverlayPassed: true,
      fallbackContractPassed: true,
      platformContractValid: true,
      languageHardcodingPassed: true,
      referenceResourcesReady,
      productionActivationReady,
      ltrCondition:
        definition.direction === 'ltr' ? 'single-standard; RTL work not applicable' : null,
      humanTranslationReviewRequired: false,
    },
    referenceResourceBlockers,
    productionActivationBlockers,
  };
  return { ...activation, activationDigest: digestJson(activation) };
}

function assertProductionActivationReady(activation) {
  if (activation.checks.productionActivationReady) {
    return;
  }
  const blockers = activation.productionActivationBlockers
    .map(
      ({ blockerId, ownerIssue, reason }) =>
        `${blockerId} (${ownerIssue ?? 'unowned'})${reason ? `: ${reason}` : ''}`,
    )
    .join(', ');
  throw new Error(
    `${activation.locale} is not production-ready; unresolved activation blockers: ${blockers || 'non-reference checks'}.`,
  );
}

function assertCurrentSemanticEvidenceReady(root, locale, manifest) {
  try {
    buildContextEvidence(root, locale, manifest, {
      requireCurrentSemanticEvidence: true,
    });
  } catch (error) {
    throw new Error(
      `${locale} is not production-ready; unresolved activation blocker: semantic-route-and-e2e-proof (#867): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function loadCheckedArtifact(root, relativeFile, builder, options) {
  const value = builder();
  const status = await writeOrCheckJson(root, relativeFile, value, options);
  if (status.stale) throw new Error(`${relativeFile} is stale or missing.`);
  return { value, status };
}

function buildLocaleArtifact(artifact, root, locale, manifest, correctionSummary, values) {
  if (artifact === 'context') {
    return buildContextManifest(root, locale, manifest);
  }
  if (artifact === 'structuralValidation') {
    return buildStructuralValidation(root, locale, manifest, values.context);
  }
  if (artifact === 'quality') {
    return buildQualityManifest(root, locale, manifest, values.context);
  }
  if (artifact === 'activation') {
    return buildActivationManifest(
      root,
      locale,
      manifest,
      values.context,
      values.quality,
      correctionSummary,
    );
  }
  throw new Error(`Unsupported locale artifact: ${artifact}.`);
}

async function writeOrCheckLocaleArtifacts(root, locales, manifest, correctionSummary, options) {
  const states = new Map(
    locales.map((locale) => [
      locale,
      {
        locale,
        paths: localePaths(locale),
        statuses: {},
        values: {},
      },
    ]),
  );

  for (const artifact of LOCALE_ARTIFACT_TOPOLOGICAL_ORDER) {
    for (const locale of locales) {
      const state = states.get(locale);
      const result = await loadCheckedArtifact(
        root,
        state.paths[artifact],
        () =>
          buildLocaleArtifact(artifact, root, locale, manifest, correctionSummary, state.values),
        options,
      );
      state.values[artifact] = result.value;
      state.statuses[artifact] = result.status;
    }
  }

  return locales.map((locale) => states.get(locale));
}

function summarizeLocaleArtifactState(state) {
  return {
    locale: state.locale,
    ...state.statuses,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { action, locale, root } = options;

  if (action === 'manifest') {
    const result = runSharedAudit(root, options.write ? 'write' : 'check');
    process.stdout.write(`${JSON.stringify({ action, locale, ...result }, null, 2)}\n`);
    return;
  }

  if (action === 'audit') {
    const result = runSharedAudit(root, 'check');
    const manifest = readJson(root, CANONICAL_MANIFEST);
    assertSharedManifest(manifest, locale);
    process.stdout.write(
      `${JSON.stringify(
        {
          action,
          locale,
          sourceManifestDigest: fileDigest(root, CANONICAL_MANIFEST),
          messageCount: manifest.summary.localeUniqueKeyCounts[locale],
          audit: result.summary,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (['activation', 'artifacts', 'all'].includes(action)) {
    runSharedAudit(
      root,
      action === 'artifacts' ? resolveLocaleArtifactSharedAuditMode(options.write) : 'check',
    );
    runLanguagePlatformAudit(root);
  }
  const manifest = readJson(root, CANONICAL_MANIFEST);
  const correctionSummary = validateCorrectionLedger(root, manifest);
  if (action === 'corrections') {
    process.stdout.write(`${JSON.stringify({ action, ...correctionSummary }, null, 2)}\n`);
    return;
  }

  if (options.requireProductionReady) {
    assertCurrentSemanticEvidenceReady(root, locale ?? SUPPORTED_APP_LOCALES[0], manifest);
  }

  if (action === 'all') {
    const states = await writeOrCheckLocaleArtifacts(
      root,
      SUPPORTED_APP_LOCALES,
      manifest,
      correctionSummary,
      { ...options, write: false, check: true },
    );
    for (const state of states) {
      if (options.requireProductionReady) {
        assertProductionActivationReady(state.values.activation);
      }
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          action,
          dependencyOrder: LOCALE_ARTIFACT_TOPOLOGICAL_ORDER,
          registryLocaleCount: SUPPORTED_APP_LOCALES.length,
          locales: states.map(summarizeLocaleArtifactState),
          privateConfirmationDependencies: [],
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (action === 'artifacts') {
    const targetLocales = resolveLocaleArtifactTargets(locale, SUPPORTED_APP_LOCALES);
    const states = await writeOrCheckLocaleArtifacts(
      root,
      targetLocales,
      manifest,
      correctionSummary,
      options,
    );
    const locales = states.map(summarizeLocaleArtifactState);
    process.stdout.write(
      `${JSON.stringify(
        locale
          ? {
              action,
              dependencyOrder: LOCALE_ARTIFACT_TOPOLOGICAL_ORDER,
              ...locales[0],
              privateConfirmationDependencies: [],
            }
          : {
              action,
              dependencyOrder: LOCALE_ARTIFACT_TOPOLOGICAL_ORDER,
              registryLocaleCount: SUPPORTED_APP_LOCALES.length,
              locales,
              privateConfirmationDependencies: [],
            },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const paths = localePaths(locale);
  if (action === 'dossier') {
    const evidence = buildContextEvidence(root, locale, manifest);
    const dossier = evidence.messageDossiers.dossiers.find(
      ({ messageId }) => messageId === options.message,
    );
    if (!dossier) throw new Error(`Unknown message ID: ${options.message}`);
    process.stdout.write(
      `${JSON.stringify(
        {
          action,
          locale,
          dossier,
          dossierDigest: digestJson(dossier),
          fullCatalogDossierDigest: evidence.messageDossiers.summary.dossierDigest,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const contextResult = await loadCheckedArtifact(
    root,
    paths.context,
    () => buildContextManifest(root, locale, manifest),
    action === 'context' ? options : { ...options, write: false, check: true },
  );
  if (action === 'context') {
    process.stdout.write(
      `${JSON.stringify({ action, locale, ...contextResult.status }, null, 2)}\n`,
    );
    return;
  }

  const qualityResult = await loadCheckedArtifact(
    root,
    paths.quality,
    () => buildQualityManifest(root, locale, manifest, contextResult.value),
    action === 'quality' ? options : { ...options, write: false, check: true },
  );
  if (action === 'quality') {
    process.stdout.write(
      `${JSON.stringify({ action, locale, ...qualityResult.status }, null, 2)}\n`,
    );
    return;
  }

  const activationResult = await loadCheckedArtifact(
    root,
    paths.activation,
    () =>
      buildActivationManifest(
        root,
        locale,
        manifest,
        contextResult.value,
        qualityResult.value,
        correctionSummary,
      ),
    action === 'activation' ? options : { ...options, write: false, check: true },
  );
  if (options.requireProductionReady) {
    assertProductionActivationReady(activationResult.value);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        action,
        locale,
        context: contextResult.status,
        quality: qualityResult.status,
        activation: activationResult.status,
        privateConfirmationDependencies: [],
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `locale delivery failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
