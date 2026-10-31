import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  HISTORICAL_COMMIT,
  HISTORICAL_TREE,
  SLOTS,
  emptyCapture,
  assertCapture,
  assertReport,
  buildReport,
  admitNativeBinding,
  writeReport,
  runObservedStep,
  readRuntimeBinding,
  validateRuntimeAdmission,
  type SourceBinding,
  type Identity,
} from '../../../scripts/e2e/batch-allocation-diagnostic.cjs';
import { runtimeFixture } from '../e2e/fixtures/mobileNavigationRuntime';
const hash = (raw: string | Buffer) => crypto.createHash('sha256').update(raw).digest('hex');
const source = (): SourceBinding => ({
  mode: 'controlled-native',
  historicalCommit: HISTORICAL_COMMIT,
  historicalTree: HISTORICAL_TREE,
  executedHead: '0'.repeat(40),
  executedTree: '1'.repeat(40),
  candidateArchiveSha256: null,
  candidateManifestSha256: null,
  e2eTree: null,
  runnerTree: null,
  environmentSha256: '2'.repeat(64),
  observerSha256: '3'.repeat(64),
  contractSha256: '4'.repeat(64),
  testSha256: '5'.repeat(64),
  installedControlsSha256: '6'.repeat(64),
  browserRuntimeSha256: '7'.repeat(64),
});
const identity = (browser = 'chromium'): Identity =>
  ({ browser, project: browser, scope: 'native-control', control: 'valid' }) as Identity;
const counters = () => ({ pageErrorCount: 0, consoleErrorCount: 0, counterOverflow: false });

it('strictly distinguishes invalid payloads from missing observations and observer faults', () => {
  const capture = emptyCapture();
  assertCapture(capture);
  capture.slots['first-ok-bubble'] = { status: 'not-observed', snapshot: null, fault: null };
  assertCapture(capture);
  const report = buildReport(source(), capture, counters(), 'failed', identity());
  expect(report.captureStatus).toBe('incomplete');
  expect(
    buildReport(source(), { ...capture, private: 'SECRET' }, counters(), 'failed', identity())
      .captureStatus,
  ).toBe('invalid');
  capture.slots.final = { status: 'observer-fault', snapshot: null, fault: null };
  expect(() => assertCapture(capture)).toThrow();
});

it.each(['accessor', 'symbol', 'array-property', 'hole', 'enum', 'count'])(
  'rejects %s channels before serialization',
  (kind) => {
    const capture: any = emptyCapture();
    if (kind === 'accessor')
      Object.defineProperty(capture, 'records', {
        enumerable: true,
        get() {
          throw new Error('must not execute');
        },
      });
    if (kind === 'symbol') capture[Symbol('secret')] = true;
    if (kind === 'array-property') capture.records.private = 'SECRET';
    if (kind === 'hole') capture.records.length = 1;
    if (kind === 'enum') capture.popupObservation = 'SECRET';
    if (kind === 'count') capture.counters.callbacks = 257;
    expect(() => assertCapture(capture)).toThrow(
      'Batch allocation diagnostic contract is invalid.',
    );
  },
);

it('bounds the maximal allowed serialized report and rejects extra source/report keys', () => {
  const capture = emptyCapture();
  capture.counters.callbacks = 256;
  capture.records = Array.from({ length: 48 }, (_, sequence) => ({
    sequence,
    elapsedMs: 120000,
    event: 'pointerdown',
    target: 'other-within-batch',
    phase: 'document-capture',
    trusted: true,
    defaultPrevented: false,
    composing: 'unavailable',
  }));
  // Every snapshot is populated with the longest valid connected shape.
  for (const stage of SLOTS)
    capture.slots[stage] = {
      status: 'observed',
      fault: null,
      snapshot: {
        rootConnected: true,
        rootElementVisibility: 'unknown',
        scanStatus: 'read-fault',
        counts: { rawRow: 8, rawCheckbox: 8, add: 8, target: 8, share: 8, ok: 8, alerts: 8 },
        controlCoverage: 'ambiguous',
        rawSelected: 'unknown',
        targetMatchesB: 'unknown',
        shareMatches100: 'unknown',
        nativeOkDisabled: 'unknown',
        ariaOkDisabled: 'unknown',
        alertVisibility: { invalid: 8, loadFailed: 8, other: 8 },
        focus: 'other-within-batch',
      },
    };
  capture.observerErrors = 255;
  capture.disposal.failed = 255;
  Object.keys(capture.overflow).forEach((key) => ((capture.overflow as any)[key] = true));
  const report = buildReport(source(), capture, counters(), 'failed', identity('firefox'));
  expect(Buffer.byteLength(JSON.stringify(report) + '\n')).toBeLessThanOrEqual(24576);
  expect(() => assertReport({ ...report, private: true })).toThrow();
  expect(() => assertReport({ ...report, source: { ...report.source, private: true } })).toThrow();
  expect(() => assertReport({ ...report, captureStatus: 'complete' })).toThrow();
  // Canonical binding is longer than native's four null identity fields. A
  // detached observation has the longest legitimate null counts/unknowns.
  for (const stage of SLOTS)
    capture.slots[stage] = {
      status: 'observed',
      fault: null,
      snapshot: {
        rootConnected: false,
        rootElementVisibility: 'unknown',
        scanStatus: 'detached',
        counts: {
          rawRow: null,
          rawCheckbox: null,
          add: null,
          target: null,
          share: null,
          ok: null,
          alerts: null,
        },
        controlCoverage: 'not-applicable',
        rawSelected: 'unknown',
        targetMatchesB: 'unknown',
        shareMatches100: 'unknown',
        nativeOkDisabled: 'unknown',
        ariaOkDisabled: 'unknown',
        alertVisibility: { invalid: null, loadFailed: null, other: null },
        focus: 'unknown',
      },
    };
  const longestSource: SourceBinding = {
    ...source(),
    mode: 'archived-candidate',
    candidateArchiveSha256: 'a'.repeat(64),
    candidateManifestSha256: 'b'.repeat(64),
    e2eTree: 'c'.repeat(40),
    runnerTree: 'd'.repeat(40),
  };
  const canonical = buildReport(
    longestSource,
    capture,
    { pageErrorCount: 255, consoleErrorCount: 255, counterOverflow: false },
    'failed',
    {
      browser: 'chromium',
      project: 'chromium',
      scope: 'qualification-diagnostic-only',
      control: null,
    },
  );
  expect(Buffer.byteLength(JSON.stringify(canonical) + '\n')).toBeLessThanOrEqual(24576);
});

it('publishes disjoint three-browser private files exclusively and rechecks owned source', () => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'batch-unit-')));
  try {
    const input = path.join(directory, 'source');
    fs.writeFileSync(input, 'bound');
    for (const browser of ['chromium', 'firefox', 'webkit']) {
      const id = identity(browser),
        binding = admitNativeBinding({
          outputDirectory: directory,
          source: source(),
          identity: id,
          stableFiles: [[input, hash('bound')]],
        });
      const report = buildReport(source(), emptyCapture(), counters(), 'failed', id);
      const result = writeReport(binding, report);
      expect(result.bytes).toBe(fs.statSync(result.path).size);
      expect(fs.statSync(result.path).mode & 0o777).toBe(0o600);
      expect(() => writeReport(binding, report)).toThrow();
    }
    const driftDirectory = path.join(directory, 'drift');
    fs.mkdirSync(driftDirectory);
    const id = identity(),
      binding = admitNativeBinding({
        outputDirectory: driftDirectory,
        source: source(),
        identity: id,
        stableFiles: [[input, hash('bound')]],
      });
    fs.writeFileSync(input, 'drift');
    expect(() =>
      writeReport(binding, buildReport(source(), emptyCapture(), counters(), 'failed', id)),
    ).toThrow();
    expect(fs.readdirSync(directory).filter((file) => file.endsWith('.json'))).toHaveLength(3);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects symlink directories, source-mode mismatches, unadmitted writes and wrong browser identity', () => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'batch-unit-')));
  try {
    const link = path.join(directory, 'link');
    fs.symlinkSync(directory, link);
    expect(() =>
      admitNativeBinding({
        outputDirectory: link,
        source: source(),
        identity: identity(),
        stableFiles: [],
      }),
    ).toThrow();
    expect(() =>
      buildReport(source(), emptyCapture(), counters(), 'failed', {
        ...identity(),
        scope: 'qualification-diagnostic-only',
        control: null,
      }),
    ).toThrow();
    expect(() =>
      buildReport(source(), emptyCapture(), counters(), 'failed', {
        ...identity(),
        project: 'webkit',
      }),
    ).toThrow();
    expect(() =>
      writeReport(
        { outputDirectory: directory, source: source(), identity: identity() },
        buildReport(source(), emptyCapture(), counters(), 'failed', identity()),
      ),
    ).toThrow();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it.each([undefined, null, false, 7, 'original', { original: true }])(
  'preserves the identical original rejection through every observer fault (%p)',
  async (originalError) => {
    const order: string[] = [];
    let calls = 0;
    const fault = (step: string) => async () => {
      order.push(step);
      throw new Error('diagnostic');
    };
    let caught = false,
      error: unknown;
    try {
      await runObservedStep({
        install: fault('install'),
        original: async () => {
          calls++;
          throw originalError;
        },
        finish: fault('finish'),
        removePageError: fault('page'),
        removeConsoleError: fault('console'),
        publish: fault('publish'),
      });
    } catch (value) {
      caught = true;
      error = value;
    }
    expect(caught).toBe(true);
    expect(error).toBe(originalError);
    expect(calls).toBe(1);
    expect(order).toEqual(['install', 'finish', 'page', 'console', 'publish']);
  },
);

it('fails mandatory diagnostic faults on otherwise passing original actions', async () => {
  await expect(
    runObservedStep({
      install: async () => {},
      original: async () => {},
      finish: async () => undefined,
      removePageError: () => {},
      removeConsoleError: () => {},
      publish: () => false,
    }),
  ).rejects.toThrow('Mandatory batch allocation diagnostic capture failed.');
});

it.each(['install', 'finish', 'page', 'console', 'publish', 'none'])(
  'attempts all cleanup and publication when only %s fails',
  async (stage) => {
    const order: string[] = [];
    let originalCalls = 0;
    const attempt = async (key: string) => {
      order.push(key);
      if (stage === key) throw new Error('fixed');
    };
    const promise = runObservedStep({
      install: () => attempt('install'),
      original: async () => {
        originalCalls++;
      },
      finish: () => attempt('finish'),
      removePageError: () => attempt('page'),
      removeConsoleError: () => attempt('console'),
      publish: async () => {
        await attempt('publish');
        return true;
      },
    });
    const outcome = await promise.then(
      () => null,
      (error) => error.message,
    );
    expect(outcome).toBe(
      stage === 'none' ? null : 'Mandatory batch allocation diagnostic capture failed.',
    );
    expect(originalCalls).toBe(1);
    expect(order).toEqual(['install', 'finish', 'page', 'console', 'publish']);
  },
);

it('binds the actual installed control files and archived source, reserves before capture, and rejects drift/production admission', () => {
  const fixture = runtimeFixture();
  try {
    for (const name of [
      'tests/e2e/i18n/batch-allocation-observer.ts',
      'scripts/e2e/batch-allocation-diagnostic.cjs',
      'tests/e2e/i18n/process-allocation.spec.ts',
    ]) {
      const destination = path.join(fixture.root, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(process.cwd(), name), destination);
    }
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(fixture.root, 'node_modules'),
    );
    const id: Identity = {
      browser: 'webkit',
      project: 'webkit',
      scope: 'qualification-diagnostic-only',
      control: null,
    };
    expect(validateRuntimeAdmission(fixture.env, fixture.root, id).source.mode).toBe(
      'archived-candidate',
    );
    expect(
      fs.existsSync(path.join(fixture.outputDirectory, 'batch-allocation-diagnostic-webkit.json')),
    ).toBe(false);
    const binding = readRuntimeBinding(fixture.env, fixture.root, id);
    expect(binding.source.historicalCommit).toBe(HISTORICAL_COMMIT);
    expect(binding.source.executedHead).toBe('1'.repeat(40));
    const destination = path.join(
      fixture.outputDirectory,
      'batch-allocation-diagnostic-webkit.json',
    );
    expect(fs.statSync(destination).size).toBe(0);
    expect(() => readRuntimeBinding(fixture.env, fixture.root, id)).toThrow();
    expect(() => validateRuntimeAdmission(fixture.env, fixture.root, id)).toThrow();
    const linked: Identity = { ...id, browser: 'firefox', project: 'firefox' };
    fs.symlinkSync(
      path.join(fixture.directory, 'missing-target'),
      path.join(fixture.outputDirectory, 'batch-allocation-diagnostic-firefox.json'),
    );
    expect(() => validateRuntimeAdmission(fixture.env, fixture.root, linked)).toThrow();
    expect(() =>
      readRuntimeBinding({ ...fixture.env, E2E_ALLOW_PRODUCTION_DATA: 'true' }, fixture.root, id),
    ).toThrow();
    expect(() =>
      readRuntimeBinding(fixture.env, fixture.root, { ...id, project: 'chromium' }),
    ).toThrow();
    const report = buildReport(binding.source, emptyCapture(), counters(), 'failed', id);
    writeReport(binding, report);
    expect(assertReport(JSON.parse(fs.readFileSync(destination, 'utf8'))).captureStatus).toBe(
      'incomplete',
    );
    const other: Identity = { ...id, browser: 'chromium', project: 'chromium' };
    const drift = readRuntimeBinding(fixture.env, fixture.root, other);
    fs.appendFileSync(
      path.join(fixture.root, 'tests/e2e/i18n/batch-allocation-observer.ts'),
      '\n// drift',
    );
    expect(() =>
      writeReport(drift, buildReport(drift.source, emptyCapture(), counters(), 'failed', other)),
    ).toThrow();
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
