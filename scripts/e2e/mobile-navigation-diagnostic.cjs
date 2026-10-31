'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Expected traffic is one initial, eight key phases and at most one frame record,
// plus the separate final snapshot. Five fixed detail slots preserve the byte cap.
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

// Browser values cross a serialization boundary before validation. Reject
// custom array channels as well as holes/accessors, including on the new tuples.
function list(value, length) {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= LIMITS.records &&
    (length === undefined || value.length === length) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.getOwnPropertyNames(value).length === value.length + 1 &&
    Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
    }).every(Boolean)
  );
}

function assertDetail(detail, snapshot, sequence) {
  if (
    !exact(detail, ['recordSequence', 'popover', 'tooltip', 'composition']) ||
    detail.recordSequence !== sequence ||
    !snapshot ||
    !['popover', 'tooltip'].every(
      (key) => list(detail[key], 3) && detail[key].every((value) => integer(value, LIMITS.nodes)),
    ) ||
    !list(detail.composition, 2) ||
    !integer(detail.composition[0]) ||
    (detail.composition[0] === 0
      ? detail.composition[1] !== null
      : !integer(detail.composition[1], LIMITS.elapsedMs) ||
        detail.composition[1] > snapshot.elapsedMs)
  )
    fail();
}

function captureComplete(capture) {
  const firstEscape = capture.records.find(
    (entry) => entry.stage === 'document-capture' && entry.key === 'escape',
  );
  return (
    capture.records[0]?.stage === 'initial' &&
    capture.details.initial !== null &&
    capture.final !== null &&
    capture.details.final !== null &&
    capture.disposed &&
    !capture.recordOverflow &&
    !capture.countOverflow &&
    capture.observerErrorCount === 0 &&
    capture.frame.scheduled === capture.frame.completed + capture.frame.cancelled &&
    (firstEscape
      ? capture.details.escapeCapture?.recordSequence === firstEscape.sequence &&
        capture.frame.scheduled === 1
      : capture.details.escapeCapture === null &&
        capture.details.escapeBubble === null &&
        capture.frame.scheduled === 0) &&
    (capture.frame.completed === 1
      ? capture.details.frame !== null
      : capture.details.frame === null)
  );
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
      'compositionPrehistory',
      'details',
      'frame',
    ]) ||
    !list(capture.records) ||
    capture.records.length > LIMITS.records ||
    !boolean(capture.recordOverflow) ||
    !boolean(capture.countOverflow) ||
    !integer(capture.observerErrorCount) ||
    !boolean(capture.disposed) ||
    capture.compositionPrehistory !== 'unknown' ||
    !exact(capture.details, ['initial', 'escapeCapture', 'escapeBubble', 'frame', 'final']) ||
    !exact(capture.frame, ['scheduled', 'completed', 'cancelled', 'triggerSequence']) ||
    !['scheduled', 'completed', 'cancelled'].every((key) => integer(capture.frame[key], 1)) ||
    capture.frame.completed + capture.frame.cancelled > capture.frame.scheduled
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
      !['initial', 'document-capture', 'window-bubble', 'post-escape-frame'].includes(
        entry.stage,
      ) ||
      !['none', 'enter', 'escape'].includes(entry.key) ||
      ![entry.trusted, entry.composing, entry.defaultPrevented].every(boolean) ||
      !FOCUS.includes(entry.focus)
    )
      fail();
    if (
      entry.stage === 'initial' || entry.stage === 'post-escape-frame'
        ? (entry.stage === 'initial' && index !== 0) ||
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
  const references = [
    ['initial', 'initial', 'none'],
    ['escapeCapture', 'document-capture', 'escape'],
    ['escapeBubble', 'window-bubble', 'escape'],
    ['frame', 'post-escape-frame', 'none'],
  ];
  const compositions = [];
  for (const [slot, stage, key] of references) {
    const detail = capture.details[slot];
    if (detail === null) continue;
    if (!exact(detail, ['recordSequence', 'popover', 'tooltip', 'composition'])) fail();
    if (!integer(detail?.recordSequence, LIMITS.records - 1)) fail();
    const entry = capture.records[detail.recordSequence];
    if (
      !entry ||
      entry.stage !== stage ||
      entry.key !== key ||
      (slot === 'initial' && entry.sequence !== 0)
    )
      fail();
    assertDetail(detail, entry, entry.sequence);
    compositions.push([entry.sequence, detail.composition]);
  }
  if (capture.details.final !== null) {
    assertDetail(capture.details.final, capture.final, null);
    compositions.push([LIMITS.records, capture.details.final.composition]);
  }
  compositions.sort((a, b) => a[0] - b[0]);
  let previousCount = 0,
    previousTime = 0;
  for (const [, [count, time]] of compositions) {
    if (count < previousCount || (time !== null && time < previousTime)) fail();
    previousCount = count;
    previousTime = time ?? previousTime;
  }
  const selected = capture.details.escapeCapture?.recordSequence;
  const bubble = capture.details.escapeBubble?.recordSequence;
  const frame = capture.details.frame?.recordSequence;
  const frameEntries = capture.records.filter((entry) => entry.stage === 'post-escape-frame');
  if (
    selected !== undefined &&
    selected !==
      capture.records.find((entry) => entry.stage === 'document-capture' && entry.key === 'escape')
        ?.sequence
  )
    fail();
  if (bubble !== undefined && (selected === undefined || bubble <= selected)) fail();
  if (
    frameEntries.length > 1 ||
    (frameEntries.length === 1 ? frame !== frameEntries[0].sequence : frame !== undefined)
  )
    fail();
  if (capture.frame.scheduled === 0) {
    if (capture.frame.triggerSequence !== null || frame !== undefined) fail();
  } else {
    if (selected === undefined || capture.frame.triggerSequence !== selected) fail();
    if (
      frame !== undefined &&
      (capture.frame.completed !== 1 ||
        frame <= selected ||
        (bubble !== undefined && frame <= bubble))
    )
      fail();
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
    report.schemaVersion !== 2 ||
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
  const complete = captureComplete(report.capture) && !report.counterOverflow;
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
      compositionPrehistory: 'unknown',
      details: { initial: null, escapeCapture: null, escapeBubble: null, frame: null, final: null },
      frame: { scheduled: 0, completed: 0, cancelled: 0, triggerSequence: null },
    };
  const complete =
    valid && captureComplete(capture) && !counters.counterOverflow && !observerFailed;
  return assertReport({
    kind: 'tiangong.mobile-navigation-diagnostic',
    schemaVersion: 2,
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
  assertCapture,
  buildReport,
  readRuntimeBinding,
  writeReport,
};
