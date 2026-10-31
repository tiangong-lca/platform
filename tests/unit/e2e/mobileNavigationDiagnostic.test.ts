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
  type SourceBinding,
} from '../../../scripts/e2e/mobile-navigation-diagnostic.cjs';

const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const zeroState = () => Object.fromEntries(STATE_KEYS.map((key) => [key, 0])) as NavigationState;
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
});
const counters = () => ({ pageErrorCount: 0, consoleErrorCount: 0, counterOverflow: false });

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

  it('bounds every allowed maximal record and snapshot below 24 KiB', () => {
    const data = capture();
    const state = Object.fromEntries(
      STATE_KEYS.map((key) => [key, LIMITS.nodes]),
    ) as NavigationState;
    state.navigationHiddenCount = 0;
    data.records = Array.from({ length: LIMITS.records }, (_, index): NavigationRecord => ({
      ...data.records[0],
      sequence: index,
      elapsedMs: LIMITS.elapsedMs,
      stage: index === 0 ? 'initial' : 'document-capture',
      key: index === 0 ? 'none' : 'escape',
      focus: 'language-action',
      state,
    }));
    data.final = { elapsedMs: LIMITS.elapsedMs, focus: 'language-action', state };
    const report = buildReport(
      source(),
      data,
      { pageErrorCount: 255, consoleErrorCount: 255, counterOverflow: false },
      'passed',
    );
    expect(report.captureStatus).toBe('complete');
    expect(Buffer.byteLength(`${JSON.stringify(report)}\n`)).toBeLessThanOrEqual(24 * 1024);
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
