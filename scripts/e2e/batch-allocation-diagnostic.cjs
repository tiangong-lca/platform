'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const LIMITS = Object.freeze({
  records: 48,
  bytes: 24576,
  count: 255,
  elapsedMs: 120000,
  nodes: 2048,
  depth: 32,
  matches: 8,
  callbacks: 256,
});
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const CONTROLS = ['valid', 'missing-share', 'total-99', 'cancel'];
const SLOTS = [
  'initial',
  'first-share-input-capture',
  'first-ok-capture',
  'first-ok-bubble',
  'final',
];
const TARGETS = [
  'raw-checkbox',
  'add-allocation',
  'target-combobox',
  'share-input',
  'ok',
  'other-within-batch',
];
const EVENTS = ['input', 'change', 'blur', 'click', 'pointerdown', 'pointerup'];
const COUNT_KEYS = ['rawRow', 'rawCheckbox', 'add', 'target', 'share', 'ok', 'alerts'];
const FLAGS = ['records', 'counts', 'elapsed', 'eventWork', 'ancestry'];
const SOURCE_KEYS = [
  'mode',
  'historicalCommit',
  'historicalTree',
  'executedHead',
  'executedTree',
  'candidateArchiveSha256',
  'candidateManifestSha256',
  'e2eTree',
  'runnerTree',
  'environmentSha256',
  'observerSha256',
  'contractSha256',
  'testSha256',
  'installedControlsSha256',
  'browserRuntimeSha256',
];
const HISTORICAL_COMMIT = '632d1d204aaa5ea14f2a501ecb855f2e9b2c614d';
const HISTORICAL_TREE = '64e69c3447a813e2c6b07f298430b593e5c5a0f7';
const admitted = new WeakMap();
const fail = () => {
  throw new Error('Batch allocation diagnostic contract is invalid.');
};
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const integer = (v, max = 255) => Number.isInteger(v) && v >= 0 && v <= max;
const exact = (v, keys) => {
  if (
    !v ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.getOwnPropertySymbols(v).length ||
    Object.getOwnPropertyNames(v).length !== keys.length
  )
    return false;
  return keys.every((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k);
    return d && Object.hasOwn(d, 'value') && d.enumerable;
  });
};
const list = (v, max) =>
  Array.isArray(v) &&
  Object.getPrototypeOf(v) === Array.prototype &&
  v.length <= max &&
  Object.getOwnPropertySymbols(v).length === 0 &&
  Object.getOwnPropertyNames(v).length === v.length + 1 &&
  Array.from({ length: v.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(v, i);
    return d && Object.hasOwn(d, 'value') && d.enumerable;
  }).every(Boolean);
const tri = (v) => ['true', 'false', 'unknown'].includes(v);
const fault = (v) => ['install', 'read', 'shape', 'finish', 'validation'].includes(v);

function assertSnapshot(v, stage) {
  if (
    !exact(v, [
      'rootConnected',
      'rootElementVisibility',
      'scanStatus',
      'counts',
      'controlCoverage',
      'rawSelected',
      'targetMatchesB',
      'shareMatches100',
      'nativeOkDisabled',
      'ariaOkDisabled',
      'alertVisibility',
      'focus',
    ])
  )
    fail();
  if (
    typeof v.rootConnected !== 'boolean' ||
    !['visible', 'hidden', 'unknown'].includes(v.rootElementVisibility) ||
    ![
      'complete',
      'detached',
      'node-cap',
      'depth-cap',
      'match-cap',
      'text-cap',
      'shape-error',
      'read-fault',
    ].includes(v.scanStatus) ||
    !['expected', 'missing', 'ambiguous', 'not-applicable', 'unknown'].includes(
      v.controlCoverage,
    ) ||
    !['none', 'body', 'share', 'ok', 'other-within-batch', 'outside', 'unknown'].includes(v.focus)
  )
    fail();
  for (const k of [
    'rawSelected',
    'targetMatchesB',
    'shareMatches100',
    'nativeOkDisabled',
    'ariaOkDisabled',
  ])
    if (!tri(v[k])) fail();
  if (!exact(v.counts, COUNT_KEYS) || !exact(v.alertVisibility, ['invalid', 'loadFailed', 'other']))
    fail();
  const detached = !v.rootConnected;
  for (const n of Object.values(v.counts)) if (detached ? n !== null : !integer(n, 8)) fail();
  for (const n of Object.values(v.alertVisibility))
    if (detached ? n !== null : !(n === null || integer(n, 8))) fail();
  if (detached) {
    if (
      v.scanStatus !== 'detached' ||
      v.controlCoverage !== 'not-applicable' ||
      v.rootElementVisibility !== 'unknown' ||
      [
        'rawSelected',
        'targetMatchesB',
        'shareMatches100',
        'nativeOkDisabled',
        'ariaOkDisabled',
      ].some((k) => v[k] !== 'unknown') ||
      v.focus !== 'unknown'
    )
      fail();
  } else {
    if (v.scanStatus === 'detached' || v.controlCoverage === 'not-applicable') fail();
    if (v.controlCoverage === 'expected') {
      const required =
        stage === 'initial'
          ? ['rawRow', 'rawCheckbox', 'add', 'ok']
          : ['rawRow', 'rawCheckbox', 'add', 'ok', 'target', 'share'];
      if (
        v.scanStatus !== 'complete' ||
        required.some((k) => v.counts[k] !== 1) ||
        (stage === 'initial' && (v.counts.target !== 0 || v.counts.share !== 0))
      )
        fail();
    }
    for (const [key, count] of [
      ['rawSelected', 'rawCheckbox'],
      ['targetMatchesB', 'target'],
      ['shareMatches100', 'share'],
      ['nativeOkDisabled', 'ok'],
      ['ariaOkDisabled', 'ok'],
    ])
      if (v.counts[count] !== 1 && v[key] !== 'unknown') fail();
  }
}

function assertCapture(v) {
  if (
    !exact(v, [
      'rootIdentity',
      'popupObservation',
      'compositionPrehistory',
      'slots',
      'records',
      'counters',
      'overflow',
      'observerErrors',
      'disposal',
    ]) ||
    v.rootIdentity !== 'original-only' ||
    v.popupObservation !== 'omitted' ||
    v.compositionPrehistory !== 'unknown' ||
    !exact(v.slots, SLOTS) ||
    !list(v.records, 48) ||
    !exact(v.counters, ['callbacks', 'events']) ||
    !integer(v.counters.callbacks, 256) ||
    !exact(v.counters.events, EVENTS) ||
    !exact(v.overflow, FLAGS) ||
    FLAGS.some((k) => typeof v.overflow[k] !== 'boolean') ||
    !integer(v.observerErrors) ||
    !exact(v.disposal, ['closed', 'removed', 'failed', 'handleDeleted']) ||
    typeof v.disposal.closed !== 'boolean' ||
    !integer(v.disposal.removed, 11) ||
    !integer(v.disposal.failed) ||
    typeof v.disposal.handleDeleted !== 'boolean'
  )
    fail();
  for (const n of Object.values(v.counters.events)) if (!integer(n)) fail();
  for (const stage of SLOTS) {
    const slot = v.slots[stage];
    if (
      !exact(slot, ['status', 'snapshot', 'fault']) ||
      !['not-observed', 'observed', 'observer-fault'].includes(slot.status)
    )
      fail();
    if (slot.status === 'observed') {
      if (slot.fault !== null) fail();
      assertSnapshot(slot.snapshot, stage);
    } else if (
      slot.snapshot !== null ||
      (slot.status === 'observer-fault' ? !fault(slot.fault) : slot.fault !== null)
    )
      fail();
  }
  let elapsed = 0;
  v.records.forEach((r, i) => {
    if (
      !exact(r, [
        'sequence',
        'elapsedMs',
        'event',
        'target',
        'phase',
        'trusted',
        'defaultPrevented',
        'composing',
      ]) ||
      r.sequence !== i ||
      !integer(r.elapsedMs, 120000) ||
      r.elapsedMs < elapsed ||
      !EVENTS.includes(r.event) ||
      !TARGETS.includes(r.target) ||
      !['document-capture', 'window-bubble'].includes(r.phase) ||
      (r.event === 'blur' && r.phase !== 'document-capture') ||
      typeof r.trusted !== 'boolean' ||
      typeof r.defaultPrevented !== 'boolean' ||
      !['true', 'false', 'unavailable'].includes(r.composing)
    )
      fail();
    elapsed = r.elapsedMs;
  });
  if (v.records.length > v.counters.callbacks || (v.disposal.handleDeleted && !v.disposal.closed))
    fail();
  return v;
}
function captureComplete(capture) {
  assertCapture(capture);
  return (
    capture.slots.initial.status === 'observed' &&
    capture.slots.initial.snapshot.rootConnected &&
    capture.slots.initial.snapshot.controlCoverage === 'expected' &&
    capture.slots.final.status === 'observed' &&
    SLOTS.every(
      (k) =>
        capture.slots[k].status !== 'observer-fault' &&
        (capture.slots[k].status !== 'observed' ||
          (['expected', 'not-applicable'].includes(capture.slots[k].snapshot.controlCoverage) &&
            ['complete', 'detached'].includes(capture.slots[k].snapshot.scanStatus))),
    ) &&
    !Object.values(capture.overflow).some(Boolean) &&
    capture.observerErrors === 0 &&
    capture.disposal.closed &&
    capture.disposal.removed === 11 &&
    capture.disposal.failed === 0 &&
    capture.disposal.handleDeleted
  );
}
function assertIdentity(v) {
  if (
    !exact(v, ['browser', 'project', 'scope', 'control']) ||
    !BROWSERS.includes(v.browser) ||
    v.browser !== v.project ||
    (v.scope === 'qualification-diagnostic-only'
      ? v.control !== null
      : v.scope !== 'native-control' || !CONTROLS.includes(v.control))
  )
    fail();
}
function assertSource(v) {
  if (
    !exact(v, SOURCE_KEYS) ||
    !['archived-candidate', 'controlled-native'].includes(v.mode) ||
    v.historicalCommit !== HISTORICAL_COMMIT ||
    v.historicalTree !== HISTORICAL_TREE
  )
    fail();
  for (const k of SOURCE_KEYS.filter(
    (k) => !['mode', 'historicalCommit', 'historicalTree'].includes(k),
  )) {
    if (
      v.mode === 'controlled-native' &&
      ['candidateArchiveSha256', 'candidateManifestSha256', 'e2eTree', 'runnerTree'].includes(k)
    ) {
      if (v[k] !== null) fail();
      continue;
    }
    if (
      typeof v[k] !== 'string' ||
      !new RegExp(
        `^[a-f0-9]{${['executedHead', 'executedTree', 'e2eTree', 'runnerTree'].includes(k) ? 40 : 64}}$`,
        'u',
      ).test(v[k])
    )
      fail();
  }
}
function assertReport(v) {
  if (
    !exact(v, [
      'kind',
      'schemaVersion',
      'scope',
      'case',
      'browser',
      'project',
      'control',
      'source',
      'originalStepOutcome',
      'captureStatus',
      'pageErrorCount',
      'consoleErrorCount',
      'counterOverflow',
      'capture',
    ]) ||
    v.kind !== 'tiangong.batch-allocation-diagnostic' ||
    v.schemaVersion !== 1 ||
    v.case !== 'process-allocation-batch' ||
    !['passed', 'failed'].includes(v.originalStepOutcome) ||
    !['complete', 'incomplete', 'invalid'].includes(v.captureStatus) ||
    !integer(v.pageErrorCount) ||
    !integer(v.consoleErrorCount) ||
    typeof v.counterOverflow !== 'boolean'
  )
    fail();
  assertIdentity({ browser: v.browser, project: v.project, scope: v.scope, control: v.control });
  assertSource(v.source);
  assertCapture(v.capture);
  if (
    (v.scope === 'native-control') !== (v.source.mode === 'controlled-native') ||
    (v.captureStatus === 'complete' && (!captureComplete(v.capture) || v.counterOverflow)) ||
    Buffer.byteLength(JSON.stringify(v) + '\n') > LIMITS.bytes
  )
    fail();
  return v;
}
function emptyCapture() {
  return {
    rootIdentity: 'original-only',
    popupObservation: 'omitted',
    compositionPrehistory: 'unknown',
    slots: Object.fromEntries(
      SLOTS.map((k) => [k, { status: 'observer-fault', snapshot: null, fault: 'install' }]),
    ),
    records: [],
    counters: { callbacks: 0, events: Object.fromEntries(EVENTS.map((k) => [k, 0])) },
    overflow: Object.fromEntries(FLAGS.map((k) => [k, false])),
    observerErrors: 1,
    disposal: { closed: false, removed: 0, failed: 0, handleDeleted: false },
  };
}
function buildReport(source, capture, counters, outcome, identity, observerFailed = false) {
  assertIdentity(identity);
  assertSource(source);
  let valid = true;
  let validatedCapture = capture;
  try {
    assertCapture(validatedCapture);
  } catch {
    valid = false;
    validatedCapture = emptyCapture();
  }
  return assertReport({
    kind: 'tiangong.batch-allocation-diagnostic',
    schemaVersion: 1,
    ...identity,
    case: 'process-allocation-batch',
    source,
    originalStepOutcome: outcome,
    captureStatus: !valid
      ? 'invalid'
      : !observerFailed && !counters.counterOverflow && captureComplete(validatedCapture)
        ? 'complete'
        : 'incomplete',
    pageErrorCount: counters.pageErrorCount,
    consoleErrorCount: counters.consoleErrorCount,
    counterOverflow: counters.counterOverflow,
    capture: validatedCapture,
  });
}
function regular(file, max = 8 * 1024 * 1024) {
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.size > max ||
    fs.realpathSync(file) !== path.resolve(file)
  )
    fail();
  return fs.readFileSync(file);
}
function outputRoot(dir) {
  if (
    typeof dir !== 'string' ||
    dir !== path.resolve(dir) ||
    dir === path.parse(dir).root ||
    fs.realpathSync(dir) !== dir ||
    !fs.lstatSync(dir).isDirectory() ||
    fs.lstatSync(dir).isSymbolicLink()
  )
    fail();
}
function reserve(binding, files) {
  const destination = path.join(
    binding.outputDirectory,
    `batch-allocation-diagnostic-${binding.identity.browser}.json`,
  );
  const fd = fs.openSync(
    destination,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_RDWR |
      (fs.constants.O_NOFOLLOW || 0),
    0o600,
  );
  let stat;
  try {
    stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size !== 0 || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1)
      fail();
  } finally {
    fs.closeSync(fd);
  }
  admitted.set(binding, {
    files,
    destination,
    device: stat.dev,
    inode: stat.ino,
    published: false,
  });
  return binding;
}
function admitNativeBinding({ outputDirectory, source, identity, stableFiles }) {
  assertIdentity(identity);
  assertSource(source);
  outputRoot(outputDirectory);
  if (
    identity.scope !== 'native-control' ||
    source.mode !== 'controlled-native' ||
    !list(stableFiles, 64) ||
    !stableFiles.length
  )
    fail();
  for (const pair of stableFiles)
    if (
      !list(pair, 2) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      pair[0] !== path.resolve(pair[0]) ||
      !/^[a-f0-9]{64}$/u.test(pair[1]) ||
      hash(regular(pair[0])) !== pair[1]
    )
      fail();
  const binding = Object.freeze({
    outputDirectory,
    source: Object.freeze({ ...source }),
    identity: Object.freeze({ ...identity }),
  });
  return reserve(
    binding,
    stableFiles.map((p) => [...p]),
  );
}
function inspectRuntimeBinding(env = process.env, root = process.cwd(), identity) {
  assertIdentity(identity);
  if (
    identity.scope !== 'qualification-diagnostic-only' ||
    env.E2E_QUALIFICATION !== 'true' ||
    env.E2E_RELEASE_MODE !== 'true' ||
    env.E2E_ALLOW_PRODUCTION_DATA === 'true' ||
    env.E2E_WRITE_VERIFIED_EVIDENCE === 'true'
  )
    fail();
  const manifestPath =
    env.E2E_CANDIDATE_MANIFEST_PATH || '/opt/tiangong-e2e/candidate-manifest.json';
  const environmentPath = env.E2E_ENVIRONMENT_CONTRACT_PATH || '/opt/tiangong-e2e/environment.json';
  const mr = regular(manifestPath, 128 * 1024),
    er = regular(environmentPath, 32 * 1024),
    m = JSON.parse(mr),
    e = JSON.parse(er);
  if (
    !er.equals(regular(path.join(root, 'docker/e2e/environment.json'), 32 * 1024)) ||
    m.kind !== 'tiangong-next-release-e2e-candidate' ||
    m.schemaVersion !== 6 ||
    m.repository?.canonical !== 'tiangong-lca/platform' ||
    m.repository?.packageName !== 'tiangong-lca-next' ||
    m.environment?.frontendTarget !== 'qualification' ||
    m.environment.contractSha256 !== hash(er) ||
    m.candidate.commit !== m.candidate.evidenceIdentity.observedHeadCommit ||
    e.kind !== 'tiangong-next-release-e2e-environment' ||
    e.schemaVersion !== 1 ||
    e.workdir !== path.resolve(root) ||
    e.candidateManifestPath !== path.resolve(manifestPath) ||
    e.environmentContractPath !== path.resolve(environmentPath) ||
    (env.E2E_OUTPUT_PATH && env.E2E_OUTPUT_PATH !== e.outputPath)
  )
    fail();
  outputRoot(e.outputPath);
  if (e.outputPath === path.resolve(root)) fail();
  // lstat catches dangling links too. A prior destination is a collision even
  // for non-writing preflight; no smoke browser should start on that output.
  try {
    fs.lstatSync(path.join(e.outputPath, `batch-allocation-diagnostic-${identity.browser}.json`));
    fail();
  } catch (error) {
    if (error.code !== 'ENOENT') fail();
  }
  const files = [
    [manifestPath, hash(mr)],
    [environmentPath, hash(er)],
    [path.join(root, 'docker/e2e/environment.json'), hash(er)],
  ];
  for (const [f, h] of [
    ['package.json', m.candidate.packageJsonSha256],
    ['pnpm-lock.yaml', m.candidate.dependencyLockSha256],
    ['pnpm-workspace.yaml', m.candidate.pnpmWorkspaceSha256],
  ]) {
    const absolute = path.join(root, f);
    if (hash(regular(absolute)) !== h) fail();
    files.push([absolute, h]);
  }
  const source = {
    mode: 'archived-candidate',
    historicalCommit: HISTORICAL_COMMIT,
    historicalTree: HISTORICAL_TREE,
    executedHead: m.candidate.commit,
    executedTree: m.candidate.tree,
    candidateArchiveSha256: m.candidate.archiveSha256,
    candidateManifestSha256: hash(mr),
    e2eTree: m.sources?.e2eTree,
    runnerTree: m.sources?.containerRunnerTree,
    environmentSha256: hash(er),
  };
  for (const [key, f] of [
    ['observerSha256', 'tests/e2e/i18n/batch-allocation-observer.ts'],
    ['contractSha256', 'scripts/e2e/batch-allocation-diagnostic.cjs'],
    ['testSha256', 'tests/e2e/i18n/process-allocation.spec.ts'],
  ]) {
    source[key] = hash(regular(path.join(root, f), 128 * 1024));
    files.push([path.join(root, f), source[key]]);
  }
  // Resolve and hash the actual installed ESM shape inputs, without importing
  // their package code. The image contract identifies runtime, not execution.
  const req = createRequire(path.join(root, 'package.json'));
  const antdRoot = path.dirname(req.resolve('antd/package.json'));
  const antdReq = createRequire(path.join(antdRoot, 'package.json'));
  const installed = [
    path.join(antdRoot, 'package.json'),
    path.join(antdRoot, 'es/button/button.js'),
    path.join(antdRoot, 'es/button/buttonHelpers.js'),
    path.join(antdRoot, 'es/alert/Alert.js'),
    ...['index.js', 'useWave.js', 'WaveEffect.js', 'style.js'].map((file) =>
      path.join(antdRoot, 'es/_util/wave', file),
    ),
    ...[
      [
        '@rc-component/select',
        ['es/SelectInput/Content/SingleContent.js', 'es/SelectInput/Input.js'],
      ],
      ['@rc-component/input-number', ['es/InputNumber.js']],
      ['@rc-component/dialog', ['es/Dialog/Content/Panel.js']],
      ['@rc-component/table', ['es/Table.js', 'es/Body/BodyRow.js']],
    ].flatMap(([pkg, names]) => {
      const base = path.dirname(antdReq.resolve(`${pkg}/package.json`));
      return [path.join(base, 'package.json'), ...names.map((name) => path.join(base, name))];
    }),
  ].map((file) => fs.realpathSync(file));
  source.installedControlsSha256 = hash(
    Buffer.from(
      JSON.stringify(
        installed.map((file) => {
          const digest = hash(regular(file));
          files.push([file, digest]);
          return digest;
        }),
      ),
    ),
  );
  const testReq = createRequire(req.resolve('@playwright/test/package.json'));
  const playwrightReq = createRequire(testReq.resolve('playwright/package.json'));
  const browserFile = fs.realpathSync(
    path.join(path.dirname(playwrightReq.resolve('playwright-core/package.json')), 'browsers.json'),
  );
  const browserRaw = regular(browserFile);
  files.push([browserFile, hash(browserRaw)]);
  source.browserRuntimeSha256 = hash(Buffer.concat([er, browserRaw]));
  assertSource(source);
  const binding = Object.freeze({
    outputDirectory: e.outputPath,
    source: Object.freeze(source),
    identity: Object.freeze({ ...identity }),
  });
  return { binding, files };
}
function validateRuntimeAdmission(env = process.env, root = process.cwd(), identity) {
  return inspectRuntimeBinding(env, root, identity).binding;
}
function readRuntimeBinding(env = process.env, root = process.cwd(), identity) {
  const { binding, files } = inspectRuntimeBinding(env, root, identity);
  return reserve(binding, files);
}
function writeReport(binding, report) {
  if (!admitted.has(binding)) fail();
  const ownership = admitted.get(binding);
  if (ownership.published) fail();
  for (const [f, digest] of ownership.files) if (hash(regular(f)) !== digest) fail();
  assertReport(report);
  outputRoot(binding.outputDirectory);
  if (
    SOURCE_KEYS.some((k) => report.source[k] !== binding.source[k]) ||
    ['browser', 'project', 'scope', 'control'].some((k) => report[k] !== binding.identity[k])
  )
    fail();
  const destination = ownership.destination,
    raw = Buffer.from(JSON.stringify(report) + '\n');
  const fd = fs.openSync(destination, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.dev !== ownership.device ||
      before.ino !== ownership.inode ||
      before.size !== 0 ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o600
    )
      fail();
    ownership.published = true;
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size !== raw.length) fail();
    const readback = Buffer.alloc(raw.length);
    if (fs.readSync(fd, readback, 0, raw.length, 0) !== raw.length || !readback.equals(raw)) fail();
    assertReport(JSON.parse(readback));
  } finally {
    fs.closeSync(fd);
  }
  return { path: destination, sha256: hash(raw), bytes: raw.length };
}

// In-trajectory failures must never suppress or replace the original thrown value.
async function runObservedStep({
  install,
  original,
  finish,
  removePageError,
  removeConsoleError,
  publish,
}) {
  let failed = false,
    originalFailed = false,
    originalError,
    capture;
  try {
    await install();
  } catch {
    failed = true;
  }
  try {
    await original();
  } catch (error) {
    originalFailed = true;
    originalError = error;
  }
  try {
    capture = await finish();
  } catch {
    failed = true;
  }
  for (const remove of [removePageError, removeConsoleError]) {
    try {
      await remove();
    } catch {
      failed = true;
    }
  }
  try {
    if (!(await publish(capture, originalFailed ? 'failed' : 'passed', failed))) failed = true;
  } catch {
    failed = true;
  }
  if (originalFailed) throw originalError;
  if (failed) throw new Error('Mandatory batch allocation diagnostic capture failed.');
}
module.exports = {
  LIMITS,
  BROWSERS,
  CONTROLS,
  SLOTS,
  EVENTS,
  TARGETS,
  COUNT_KEYS,
  FLAGS,
  HISTORICAL_COMMIT,
  HISTORICAL_TREE,
  assertCapture,
  captureComplete,
  assertSource,
  assertIdentity,
  assertReport,
  emptyCapture,
  buildReport,
  readRuntimeBinding,
  validateRuntimeAdmission,
  admitNativeBinding,
  writeReport,
  runObservedStep,
};
