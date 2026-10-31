import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { runtimeFixture } from './fixtures/mobileNavigationRuntime';
import { handoffOutputOwnership } from '../../../scripts/e2e/output-ownership.cjs';

import {
  BASENAME,
  LIMITS,
  STATE_KEYS,
  assertReport,
  buildReport,
  readRuntimeBinding,
  writeReport,
  type BrowserCapture,
  type NavigationRecord,
  type NavigationState,
  type NavigationDetail,
  type SourceBinding,
} from '../../../scripts/e2e/mobile-navigation-diagnostic.cjs';

const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const zeroState = () => Object.fromEntries(STATE_KEYS.map((key) => [key, 0])) as NavigationState;
const detail = (recordSequence: number | null): NavigationDetail => ({
  recordSequence,
  popover: [0, 0, 0],
  tooltip: [0, 0, 0],
  composition: [0, null],
});
const source = (): SourceBinding => ({
  candidateCommit: '1'.repeat(40),
  candidateTree: '2'.repeat(40),
  candidateArchiveSha256: '3'.repeat(64),
  candidateManifestSha256: '4'.repeat(64),
  e2eTree: '5'.repeat(40),
  runnerTree: '6'.repeat(40),
  observerSha256: '7'.repeat(64),
  contractSha256: '8'.repeat(64),
});
const capture = (): BrowserCapture => ({
  records: [
    {
      sequence: 0,
      elapsedMs: 0,
      stage: 'initial',
      key: 'none',
      trusted: false,
      composing: false,
      defaultPrevented: false,
      focus: 'body',
      state: zeroState(),
    },
  ],
  final: { elapsedMs: 1, focus: 'body', state: zeroState() },
  recordOverflow: false,
  countOverflow: false,
  observerErrorCount: 0,
  disposed: true,
  compositionPrehistory: 'unknown',
  details: {
    initial: detail(0),
    escapeCapture: null,
    escapeBubble: null,
    frame: null,
    final: detail(null),
  },
  frame: { scheduled: 0, completed: 0, cancelled: 0, triggerSequence: null },
});
const counters = () => ({ pageErrorCount: 0, consoleErrorCount: 0, counterOverflow: false });
const frameCapture = (): BrowserCapture => {
  const data = capture();
  for (const stage of ['document-capture', 'window-bubble', 'post-escape-frame'] as const) {
    const sequence = data.records.length;
    data.records.push({
      ...data.records[0],
      sequence,
      elapsedMs: sequence,
      stage,
      key: stage === 'post-escape-frame' ? 'none' : 'escape',
    });
  }
  data.final!.elapsedMs = 4;
  data.details = {
    initial: detail(0),
    escapeCapture: detail(1),
    escapeBubble: detail(2),
    frame: detail(3),
    final: detail(null),
  };
  data.frame = { scheduled: 1, completed: 1, cancelled: 0, triggerSequence: 1 };
  return data;
};

describe('bounded mobile navigation diagnostic contract (inert fixtures, not qualification proof)', () => {
  it('retains fixed data only and never labels an original failed step as a qualification pass', () => {
    const report = buildReport(source(), capture(), counters(), 'failed');
    expect(assertReport(report)).toBe(report);
    expect(report).toMatchObject({
      scope: 'qualification-diagnostic-only',
      originalStepOutcome: 'failed',
      captureStatus: 'complete',
    });
    expect(Object.keys(report)).not.toEqual(
      expect.arrayContaining(['assertionIds', 'qualification', 'proof']),
    );
  });

  it('accepts a completed frame or normal cancellation without inventing another keyboard event', () => {
    const completed = frameCapture();
    expect(buildReport(source(), completed, counters(), 'passed').captureStatus).toBe('complete');
    const cancelled = frameCapture();
    cancelled.records.pop();
    cancelled.details.frame = null;
    cancelled.frame.completed = 0;
    cancelled.frame.cancelled = 1;
    expect(buildReport(source(), cancelled, counters(), 'passed').captureStatus).toBe('complete');
    cancelled.frame.cancelled = 0;
    cancelled.disposed = false;
    expect(buildReport(source(), cancelled, counters(), 'passed').captureStatus).toBe('incomplete');
  });

  it('rejects retained schema 1 under the new source rather than silently upgrading it', () => {
    const report: any = buildReport(source(), capture(), counters(), 'passed');
    report.schemaVersion = 1;
    expect(() => assertReport(report)).toThrow();
  });

  it.each([
    (data: any) => {
      data.compositionPrehistory = 'known-clear';
    },
    (data: any) => {
      data.details.initial.imeBlocked = false;
    },
    (data: any) => {
      data.details.initial.popover.push(0);
    },
    (data: any) => {
      data.details.initial.tooltip[0] = 33;
    },
    (data: any) => {
      data.details.initial.composition = [0, 0];
    },
    (data: any) => {
      data.details.initial.composition = [1, null];
    },
    (data: any) => {
      data.details.initial.composition = [256, 0];
    },
    (data: any) => {
      data.details.initial.composition = [1, 1];
    },
    (data: any) => {
      data.details.final.composition = [1, 5];
    },
    (data: any) => {
      data.details.escapeCapture.recordSequence = 2;
    },
    (data: any) => {
      data.details.escapeBubble.recordSequence = 1;
    },
    (data: any) => {
      data.frame.triggerSequence = 2;
    },
    (data: any) => {
      data.frame.scheduled = 2;
    },
    (data: any) => {
      data.frame.cancelled = 1;
    },
    (data: any) => {
      data.frame.completed = 0;
    },
    (data: any) => {
      data.details.frame = null;
    },
    (data: any) => {
      data.records[3].key = 'escape';
    },
    (data: any) => {
      data.records[3].trusted = true;
    },
    (data: any) => {
      data.details.initial.popover[Symbol('private')] = 'private';
    },
    (data: any) => {
      Object.defineProperty(data.details.initial.tooltip, 'toJSON', { value: () => 'private' });
    },
    (data: any) => {
      data.details.escapeCapture.composition = [2, 1];
      data.details.final.composition = [1, 1];
    },
    (data: any) => {
      data.records.length = 10000;
    },
  ])('rejects invalid v2 detail/lifecycle/reference payload (%#)', (mutate) => {
    const data = frameCapture();
    mutate(data);
    const invalid = buildReport(source(), data, counters(), 'failed');
    expect(invalid.captureStatus).toBe('invalid');
    expect(JSON.stringify(invalid)).not.toContain('private');
  });

  it('rejects new detail/tuple accessors without invoking them', () => {
    const getter = jest.fn(() => 'private');
    const data = frameCapture();
    Object.defineProperty(data.details.initial!, 'recordSequence', {
      enumerable: true,
      get: getter,
    });
    expect(buildReport(source(), data, counters(), 'failed').captureStatus).toBe('invalid');
    const other = frameCapture();
    Object.defineProperty(other.details.initial!.popover, '0', { enumerable: true, get: getter });
    expect(buildReport(source(), other, counters(), 'failed').captureStatus).toBe('invalid');
    expect(getter).not.toHaveBeenCalled();
  });

  it('bounds every allowed maximal record and snapshot below 24 KiB', () => {
    const data = capture();
    const state = Object.fromEntries(
      STATE_KEYS.map((key) => [key, LIMITS.nodes]),
    ) as NavigationState;
    state.navigationVisibleCount = 16;
    state.navigationHiddenCount = 16;
    data.records = Array.from({ length: LIMITS.records }, (_, index): NavigationRecord => ({
      ...data.records[0],
      sequence: index,
      elapsedMs: LIMITS.elapsedMs,
      stage:
        index === 0
          ? 'initial'
          : index === 2
            ? 'window-bubble'
            : index === 3
              ? 'post-escape-frame'
              : 'document-capture',
      key: index === 0 || index === 3 ? 'none' : 'escape',
      focus: 'language-action',
      state,
    }));
    data.final = { elapsedMs: LIMITS.elapsedMs, focus: 'language-action', state };
    const maximalDetail = (sequence: number | null): NavigationDetail => ({
      recordSequence: sequence,
      popover: [32, 32, 32],
      tooltip: [32, 32, 32],
      composition: [255, LIMITS.elapsedMs],
    });
    data.details = {
      initial: maximalDetail(0),
      escapeCapture: maximalDetail(1),
      escapeBubble: maximalDetail(2),
      frame: maximalDetail(3),
      final: maximalDetail(null),
    };
    data.frame = { scheduled: 1, completed: 1, cancelled: 0, triggerSequence: 1 };
    data.observerErrorCount = 255;
    data.disposed = false;
    const fixture = runtimeFixture();
    try {
      const binding = readRuntimeBinding(fixture.env, fixture.root);
      const report = buildReport(
        binding.source,
        data,
        { pageErrorCount: 255, consoleErrorCount: 255, counterOverflow: false },
        'passed',
      );
      expect(report.captureStatus).toBe('incomplete');
      const written = writeReport(binding, report);
      expect(written.bytes).toBe(Buffer.byteLength(`${JSON.stringify(report)}\n`));
      expect(written.bytes).toBeLessThanOrEqual(24 * 1024);
      process.stdout.write(
        `${JSON.stringify({ kind: 'mobile-navigation-v2-maximal-bytes', bytes: written.bytes, cap: LIMITS.bytes })}\n`,
      );
      expect(assertReport(JSON.parse(fs.readFileSync(written.path, 'utf8')))).toEqual(report);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each([
    'rawText',
    'url',
    'attributes',
    'input',
    'auth',
    'headers',
    'environment',
    'screenshot',
    'trace',
    'dom',
  ])('rejects the unsupported %s channel without echoing its value', (key) => {
    const report: any = buildReport(source(), capture(), counters(), 'passed');
    report[key] = 'synthetic-private-value';
    expect(() => assertReport(report)).toThrow('Mobile navigation diagnostic contract is invalid.');
  });

  it('rejects nested unknown keys, free text, nonfinite counts, missing disposal and false completeness', () => {
    for (const mutate of [
      (report: any) => {
        report.capture.records[0].text = 'synthetic-private-value';
      },
      (report: any) => {
        report.capture.final.focus = 'https://synthetic.invalid/private';
      },
      (report: any) => {
        report.pageErrorCount = NaN;
      },
      (report: any) => {
        report.consoleErrorCount = Infinity;
      },
      (report: any) => {
        report.capture.final.state.menuVisibleCount = -1;
      },
      (report: any) => {
        report.capture.records[0].elapsedMs = 0.5;
      },
      (report: any) => {
        report.capture.disposed = false;
      },
      (report: any) => {
        report.capture.recordOverflow = true;
      },
      (report: any) => {
        report.source.candidateCommit = 'arbitrary-env-claim';
      },
      (report: any) => {
        Object.defineProperty(report, 'toJSON', { value: () => 'private' });
      },
      (report: any) => {
        Object.setPrototypeOf(report.capture, { toJSON: () => 'private' });
      },
    ]) {
      const report = buildReport(source(), capture(), counters(), 'passed');
      mutate(report);
      expect(() => assertReport(report)).toThrow();
    }
  });

  it('drops invalid browser payloads rather than serializing raw data and reports caps honestly', () => {
    const invalid = { ...capture(), rawDom: 'synthetic-private-value' };
    const report = buildReport(source(), invalid, counters(), 'failed');
    expect(report.captureStatus).toBe('invalid');
    expect(report.capture.records).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('synthetic-private-value');
    for (const field of ['recordOverflow', 'countOverflow'] as const) {
      expect(
        buildReport(source(), { ...capture(), [field]: true }, counters(), 'passed').captureStatus,
      ).toBe('incomplete');
    }
    expect(
      buildReport(source(), capture(), { ...counters(), counterOverflow: true }, 'passed')
        .captureStatus,
    ).toBe('incomplete');
    expect(buildReport(source(), capture(), counters(), 'passed', true).captureStatus).toBe(
      'incomplete',
    );
  });

  it('derives source binding from the schema-6 canonical manifest and verified current install inputs', () => {
    const fixture = runtimeFixture();
    try {
      const binding = readRuntimeBinding(fixture.env, fixture.root);
      expect(binding.source.candidateManifestSha256).toBe(
        hash(fs.readFileSync(fixture.manifestPath)),
      );
      expect(binding.source.observerSha256).toBe(
        hash(
          fs.readFileSync(path.join(fixture.root, 'tests/e2e/i18n/mobile-navigation-observer.ts')),
        ),
      );
      expect(Object.isFrozen(binding)).toBe(true);
      const report = buildReport(binding.source, capture(), counters(), 'failed');
      const written = writeReport(binding, report);
      expect(written.path).toBe(path.join(fixture.outputDirectory, BASENAME));
      const raw = fs.readFileSync(written.path);
      expect(written.sha256).toBe(hash(raw));
      expect(assertReport(JSON.parse(raw.toString()))).toEqual(report);
      handoffOutputOwnership(fixture.outputDirectory);
      expect(fs.readFileSync(written.path).equals(raw)).toBe(true);
      const copied = path.join(fixture.directory, 'artifact-readback.json');
      fs.copyFileSync(written.path, copied);
      expect(fs.readFileSync(copied).equals(raw)).toBe(true);
      expect(assertReport(JSON.parse(fs.readFileSync(copied, 'utf8')))).toEqual(report);
      expect(fs.statSync(written.path).mode & 0o777).toBe(0o600);
      expect(() => writeReport(binding, report)).toThrow();
      expect(() => writeReport({ ...binding }, report)).toThrow();
      const mismatched = {
        ...report,
        source: { ...report.source, candidateCommit: '9'.repeat(40) },
      };
      expect(() => writeReport(binding, mismatched)).toThrow();
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it.each([
    'candidate',
    'environment-digest',
    'lock-digest',
    'output-root',
    'production',
    'symlink',
    'source-contract',
  ])('rejects %s binding drift before writing an artifact', (kind) => {
    const fixture = runtimeFixture();
    try {
      if (kind === 'candidate') fixture.manifest.candidate.commit = '9'.repeat(40);
      if (kind === 'environment-digest')
        fixture.manifest.environment.contractSha256 = '9'.repeat(64);
      if (kind === 'lock-digest') fixture.manifest.candidate.dependencyLockSha256 = '9'.repeat(64);
      if (kind === 'output-root')
        (fixture.env as NodeJS.ProcessEnv).E2E_OUTPUT_PATH = '/unowned-output';
      if (kind === 'production') fixture.env.E2E_ALLOW_PRODUCTION_DATA = 'true';
      if (kind === 'source-contract') {
        fs.appendFileSync(fixture.environmentPath, '\n');
        fixture.manifest.environment.contractSha256 = hash(
          fs.readFileSync(fixture.environmentPath),
        );
      }
      if (kind === 'symlink') {
        fs.renameSync(fixture.outputDirectory, `${fixture.outputDirectory}-owned`);
        fs.symlinkSync(`${fixture.outputDirectory}-owned`, fixture.outputDirectory, 'dir');
      }
      fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest));
      expect(() => readRuntimeBinding(fixture.env, fixture.root)).toThrow();
      expect(fs.existsSync(path.join(fixture.outputDirectory, BASENAME))).toBe(false);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it('refuses an existing output symlink without modifying its target', () => {
    const fixture = runtimeFixture();
    try {
      const binding = readRuntimeBinding(fixture.env, fixture.root);
      const retained = path.join(fixture.directory, 'retained');
      fs.writeFileSync(retained, 'retained');
      fs.symlinkSync(retained, path.join(fixture.outputDirectory, BASENAME));
      expect(() =>
        writeReport(binding, buildReport(binding.source, capture(), counters(), 'failed')),
      ).toThrow();
      expect(fs.readFileSync(retained, 'utf8')).toBe('retained');
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it('revalidates the bound manifest bytes immediately before writing', () => {
    const fixture = runtimeFixture();
    try {
      const binding = readRuntimeBinding(fixture.env, fixture.root);
      const report = buildReport(binding.source, capture(), counters(), 'failed');
      fs.appendFileSync(fixture.manifestPath, '\n');
      expect(() => writeReport(binding, report)).toThrow();
      expect(fs.existsSync(path.join(fixture.outputDirectory, BASENAME))).toBe(false);
    } finally {
      fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
