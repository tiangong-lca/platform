'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Expected traffic is one initial snapshot and eight key-phase records for the
// menu and avatar Enter/Escape pairs, plus the separate final/failure snapshot.
// finite headroom permits repeats without retaining an unbounded event stream.
// Compact JSON for every allowed field at these caps remains below 24 KiB.
const LIMITS = Object.freeze({
  records: 48,
  bytes: 24 * 1024,
  count: 255,
  elapsedMs: 600_000,
  nodes: 32,
  animations: 32,
});
const BASENAME = 'mobile-navigation-diagnostic.json';
const FOCUS = [
  'none',
  'body',
  'menu-action',
  'language-action',
  'avatar-action',
  'navigation',
  'other-overlay',
  'other',
];
const STATE_KEYS = [
  'navigationCount',
  'navigationVisibleCount',
  'navigationHiddenCount',
  'navigationOpenCount',
  'navigationMotionCount',
  'dialogVisibleCount',
  'modalVisibleCount',
  'menuVisibleCount',
  'listboxVisibleCount',
  'dropdownVisibleCount',
];
const BINDING_KEYS = [
  'candidateCommit',
  'candidateTree',
  'candidateArchiveSha256',
  'candidateManifestSha256',
  'e2eTree',
  'runnerTree',
  'observerSha256',
  'contractSha256',
];
const validatedBindings = new WeakMap();
const sha256 = (raw) => createHash('sha256').update(raw).digest('hex');
const fail = () => {
  throw new Error('Mobile navigation diagnostic contract is invalid.');
};
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) =>
  record(value) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
  Object.getOwnPropertyNames(value).length === keys.length &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
const integer = (value, max = LIMITS.count) =>
  Number.isInteger(value) && value >= 0 && value <= max;
const boolean = (value) => typeof value === 'boolean';

function assertBinding(binding) {
  if (!exact(binding, BINDING_KEYS)) fail();
  for (const key of BINDING_KEYS) {
    const length = ['candidateCommit', 'candidateTree', 'e2eTree', 'runnerTree'].includes(key)
      ? 40
      : 64;
    if (
      typeof binding[key] !== 'string' ||
      !new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(binding[key])
    )
      fail();
  }
}

function assertState(state) {
  if (!exact(state, STATE_KEYS) || STATE_KEYS.some((key) => !integer(state[key], LIMITS.nodes)))
    fail();
  if (
    state.navigationVisibleCount + state.navigationHiddenCount !== state.navigationCount ||
    state.navigationOpenCount > state.navigationCount ||
    state.navigationMotionCount > state.navigationCount
  )
    fail();
}

function assertSnapshot(snapshot) {
  if (
    !exact(snapshot, ['elapsedMs', 'focus', 'state']) ||
    !integer(snapshot.elapsedMs, LIMITS.elapsedMs) ||
    !FOCUS.includes(snapshot.focus)
  )
    fail();
  assertState(snapshot.state);
}

function assertCapture(capture) {
  if (
    !exact(capture, [
      'records',
      'final',
      'recordOverflow',
      'countOverflow',
      'observerErrorCount',
      'disposed',
    ]) ||
    !Array.isArray(capture.records) ||
    capture.records.length > LIMITS.records ||
    !boolean(capture.recordOverflow) ||
    !boolean(capture.countOverflow) ||
    !integer(capture.observerErrorCount) ||
    !boolean(capture.disposed)
  )
    fail();
  let elapsed = 0;
  capture.records.forEach((entry, index) => {
    if (
      !exact(entry, [
        'sequence',
        'elapsedMs',
        'stage',
        'key',
        'trusted',
        'composing',
        'defaultPrevented',
        'focus',
        'state',
      ]) ||
      entry.sequence !== index ||
      !integer(entry.elapsedMs, LIMITS.elapsedMs) ||
      entry.elapsedMs < elapsed ||
      !['initial', 'document-capture', 'window-bubble'].includes(entry.stage) ||
      !['none', 'enter', 'escape'].includes(entry.key) ||
      ![entry.trusted, entry.composing, entry.defaultPrevented].every(boolean) ||
      !FOCUS.includes(entry.focus)
    )
      fail();
    if (
      entry.stage === 'initial'
        ? index !== 0 ||
          entry.key !== 'none' ||
          entry.trusted ||
          entry.composing ||
          entry.defaultPrevented
        : entry.key === 'none'
    )
      fail();
    assertState(entry.state);
    elapsed = entry.elapsedMs;
  });
  if (capture.final !== null) {
    assertSnapshot(capture.final);
    if (capture.final.elapsedMs < elapsed) fail();
  }
}

function assertReport(report) {
  if (
    !exact(report, [
      'kind',
      'schemaVersion',
      'scope',
      'case',
      'browser',
      'source',
      'originalStepOutcome',
      'captureStatus',
      'pageErrorCount',
      'consoleErrorCount',
      'counterOverflow',
      'capture',
    ]) ||
    report.kind !== 'tiangong.mobile-navigation-diagnostic' ||
    report.schemaVersion !== 1 ||
    report.scope !== 'qualification-diagnostic-only' ||
    report.case !== 'responsive-mobile-navigation' ||
    report.browser !== 'chromium' ||
    !['passed', 'failed'].includes(report.originalStepOutcome) ||
    !['complete', 'incomplete', 'invalid'].includes(report.captureStatus) ||
    !integer(report.pageErrorCount) ||
    !integer(report.consoleErrorCount) ||
    !boolean(report.counterOverflow)
  )
    fail();
  assertBinding(report.source);
  assertCapture(report.capture);
  const complete =
    report.capture.records[0]?.stage === 'initial' &&
    report.capture.final !== null &&
    report.capture.disposed &&
    !report.capture.recordOverflow &&
    !report.capture.countOverflow &&
    report.capture.observerErrorCount === 0 &&
    !report.counterOverflow;
  if (report.captureStatus === 'complete' && !complete) fail();
  if (Buffer.byteLength(`${JSON.stringify(report)}\n`, 'utf8') > LIMITS.bytes) fail();
  return report;
}

function buildReport(source, capture, counters, originalStepOutcome, observerFailed = false) {
  assertBinding(source);
  let valid = true;
  try {
    assertCapture(capture);
  } catch {
    valid = false;
  }
  if (!valid)
    capture = {
      records: [],
      final: null,
      recordOverflow: false,
      countOverflow: false,
      observerErrorCount: 1,
      disposed: false,
    };
  const complete =
    valid &&
    capture.records[0]?.stage === 'initial' &&
    capture.final !== null &&
    capture.disposed &&
    !capture.recordOverflow &&
    !capture.countOverflow &&
    capture.observerErrorCount === 0 &&
    !counters.counterOverflow &&
    !observerFailed;
  return assertReport({
    kind: 'tiangong.mobile-navigation-diagnostic',
    schemaVersion: 1,
    scope: 'qualification-diagnostic-only',
    case: 'responsive-mobile-navigation',
    browser: 'chromium',
    source,
    originalStepOutcome,
    captureStatus: !valid ? 'invalid' : complete ? 'complete' : 'incomplete',
    pageErrorCount: counters.pageErrorCount,
    consoleErrorCount: counters.consoleErrorCount,
    counterOverflow: counters.counterOverflow,
    capture,
  });
}

function readRegular(filePath, maxBytes) {
  const info = fs.lstatSync(filePath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > maxBytes ||
    fs.realpathSync(filePath) !== path.resolve(filePath)
  )
    fail();
  return fs.readFileSync(filePath);
}

function readRuntimeBinding(env = process.env, root = process.cwd()) {
  if (
    env.E2E_QUALIFICATION !== 'true' ||
    env.E2E_RELEASE_MODE !== 'true' ||
    env.E2E_ALLOW_PRODUCTION_DATA === 'true' ||
    env.E2E_WRITE_VERIFIED_EVIDENCE === 'true'
  )
    fail();
  const manifestRaw = readRegular(
    env.E2E_CANDIDATE_MANIFEST_PATH || '/opt/tiangong-e2e/candidate-manifest.json',
    128 * 1024,
  );
  const environmentRaw = readRegular(
    env.E2E_ENVIRONMENT_CONTRACT_PATH || '/opt/tiangong-e2e/environment.json',
    32 * 1024,
  );
  if (
    !environmentRaw.equals(readRegular(path.join(root, 'docker/e2e/environment.json'), 32 * 1024))
  )
    fail();
  const manifest = JSON.parse(manifestRaw.toString('utf8'));
  const environment = JSON.parse(environmentRaw.toString('utf8'));
  if (
    manifest.kind !== 'tiangong-next-release-e2e-candidate' ||
    manifest.schemaVersion !== 6 ||
    manifest.repository?.canonical !== 'tiangong-lca/platform' ||
    manifest.repository?.packageName !== 'tiangong-lca-next' ||
    manifest.environment?.frontendTarget !== 'qualification' ||
    manifest.environment.contractSha256 !== sha256(environmentRaw) ||
    manifest.candidate?.commit !== manifest.candidate?.evidenceIdentity?.observedHeadCommit ||
    environment.kind !== 'tiangong-next-release-e2e-environment' ||
    environment.schemaVersion !== 1 ||
    environment.workdir !== path.resolve(root) ||
    environment.candidateManifestPath !==
      path.resolve(
        env.E2E_CANDIDATE_MANIFEST_PATH || '/opt/tiangong-e2e/candidate-manifest.json',
      ) ||
    environment.environmentContractPath !==
      path.resolve(env.E2E_ENVIRONMENT_CONTRACT_PATH || '/opt/tiangong-e2e/environment.json') ||
    typeof environment.outputPath !== 'string' ||
    environment.outputPath !== path.resolve(environment.outputPath)
  )
    fail();
  for (const [file, expected] of [
    ['package.json', manifest.candidate.packageJsonSha256],
    ['pnpm-lock.yaml', manifest.candidate.dependencyLockSha256],
    ['pnpm-workspace.yaml', manifest.candidate.pnpmWorkspaceSha256],
  ]) {
    if (sha256(readRegular(path.join(root, file), 8 * 1024 * 1024)) !== expected) fail();
  }
  const outputDirectory = environment.outputPath;
  if (
    (env.E2E_OUTPUT_PATH && env.E2E_OUTPUT_PATH !== outputDirectory) ||
    outputDirectory === path.parse(outputDirectory).root ||
    outputDirectory === path.resolve(root) ||
    !fs.lstatSync(outputDirectory).isDirectory() ||
    fs.lstatSync(outputDirectory).isSymbolicLink() ||
    fs.realpathSync(outputDirectory) !== outputDirectory
  )
    fail();
  const source = {
    candidateCommit: manifest.candidate.commit,
    candidateTree: manifest.candidate.tree,
    candidateArchiveSha256: manifest.candidate.archiveSha256,
    candidateManifestSha256: sha256(manifestRaw),
    e2eTree: manifest.sources?.e2eTree,
    runnerTree: manifest.sources?.containerRunnerTree,
    observerSha256: sha256(
      readRegular(path.join(root, 'tests/e2e/i18n/mobile-navigation-observer.ts'), 64 * 1024),
    ),
    contractSha256: sha256(
      readRegular(path.join(root, 'scripts/e2e/mobile-navigation-diagnostic.cjs'), 64 * 1024),
    ),
  };
  assertBinding(source);
  const binding = Object.freeze({ outputDirectory, source: Object.freeze(source) });
  const stableFiles = [
    [
      env.E2E_CANDIDATE_MANIFEST_PATH || '/opt/tiangong-e2e/candidate-manifest.json',
      source.candidateManifestSha256,
    ],
    [
      env.E2E_ENVIRONMENT_CONTRACT_PATH || '/opt/tiangong-e2e/environment.json',
      sha256(environmentRaw),
    ],
    [path.join(root, 'docker/e2e/environment.json'), sha256(environmentRaw)],
    [path.join(root, 'package.json'), manifest.candidate.packageJsonSha256],
    [path.join(root, 'pnpm-lock.yaml'), manifest.candidate.dependencyLockSha256],
    [path.join(root, 'pnpm-workspace.yaml'), manifest.candidate.pnpmWorkspaceSha256],
    [path.join(root, 'tests/e2e/i18n/mobile-navigation-observer.ts'), source.observerSha256],
    [path.join(root, 'scripts/e2e/mobile-navigation-diagnostic.cjs'), source.contractSha256],
  ];
  validatedBindings.set(binding, stableFiles);
  return binding;
}

function writeReport(binding, report) {
  if (!validatedBindings.has(binding)) fail();
  for (const [file, digest] of validatedBindings.get(binding)) {
    if (sha256(readRegular(file, 8 * 1024 * 1024)) !== digest) fail();
  }
  assertBinding(binding.source);
  assertReport(report);
  if (BINDING_KEYS.some((key) => report.source[key] !== binding.source[key])) fail();
  const root = binding.outputDirectory;
  if (
    typeof root !== 'string' ||
    root !== path.resolve(root) ||
    !fs.lstatSync(root).isDirectory() ||
    fs.lstatSync(root).isSymbolicLink() ||
    fs.realpathSync(root) !== root
  )
    fail();
  const output = path.join(root, BASENAME);
  const raw = Buffer.from(`${JSON.stringify(report)}\n`, 'utf8');
  const fd = fs.openSync(
    output,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_RDWR |
      (fs.constants.O_NOFOLLOW || 0),
    0o600,
  );
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
    const readback = Buffer.alloc(raw.length);
    if (fs.readSync(fd, readback, 0, raw.length, 0) !== raw.length || !readback.equals(raw)) fail();
    assertReport(JSON.parse(readback.toString('utf8')));
  } finally {
    fs.closeSync(fd);
  }
  return { path: output, sha256: sha256(raw), bytes: raw.length };
}

module.exports = {
  BASENAME,
  LIMITS,
  FOCUS,
  STATE_KEYS,
  assertReport,
  buildReport,
  readRuntimeBinding,
  writeReport,
};
