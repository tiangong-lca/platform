import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  sanitizeSyntheticAllocationDiagnostic,
  writeSyntheticAllocationDiagnostic,
} from '../../e2e/i18n/process-allocation-diagnostics';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'allocation-diagnostic-'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

const options = () => ({
  qualification: 'true',
  backendOrigin: 'https://semantic-harness.invalid',
  frontendUrl: 'http://127.0.0.1:18764',
  browser: 'webkit',
  outputDirectory: directory,
  diagnostic: {},
});

it('retains native event facts and DOM state while leaving React handler state unobserved', () => {
  expect(
    sanitizeSyntheticAllocationDiagnostic({
      events: [
        { type: 'input', control: 'fraction', value: '100', trusted: true },
        { type: 'click', control: 'ok', trusted: true },
      ],
      modalAttached: true,
      modalHidden: false,
      fractionDomValue: '100',
      okDisabled: false,
      errorAlertCount: 1,
      checkedRowCount: 1,
      modalMotion: ['ant-zoom-enter-active', 'ant-zoom-enter', 'ant-zoom-leave'],
      committedReactValue: ['untrusted'],
      handlerStages: 'onOk',
    }),
  ).toEqual({
    events: [
      { type: 'input', control: 'fraction', value: '100', trusted: true },
      { type: 'click', control: 'ok', trusted: true },
    ],
    modalAttached: true,
    modalHidden: false,
    fractionDomValue: '100',
    okDisabled: false,
    errorAlertCount: 1,
    checkedRowCount: 1,
    modalMotion: ['enter', 'leave'],
    committedReactValue: 'not-observed',
    handlerStages: 'not-observed',
  });
});

it('drops arbitrary browser fields, page contents, errors and nonnumeric values', () => {
  const secret = 'sensitive-user@example.invalid';
  const safe = sanitizeSyntheticAllocationDiagnostic({
    events: [
      { type: 'input', control: 'fraction', value: secret, trusted: secret, html: secret },
      { type: secret, control: 'ok' },
      { type: 'click', control: secret },
      { type: 'click', control: 'ok', value: secret, error: secret },
    ],
    modalAttached: secret,
    modalHidden: secret,
    fractionDomValue: secret,
    okDisabled: secret,
    errorAlertCount: secret,
    checkedRowCount: -1,
    modalMotion: [secret, `custom-${secret}-enter-active`],
    page: secret,
    html: secret,
    error: secret,
  });
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe).toMatchObject({
    events: [
      { type: 'input', control: 'fraction', value: '[invalid]', trusted: false },
      { type: 'click', control: 'ok', trusted: false },
    ],
    modalAttached: null,
    modalHidden: null,
    fractionDomValue: '[invalid]',
    errorAlertCount: null,
    checkedRowCount: null,
    modalMotion: ['enter'],
  });
  expect(sanitizeSyntheticAllocationDiagnostic({ captureError: secret })).toEqual({
    captureError: 'DOM_CAPTURE_FAILED',
  });
});

it('bounds hostile event and motion collections and rejects malformed numeric counts', () => {
  const safe = sanitizeSyntheticAllocationDiagnostic({
    events: Array.from({ length: 100_000 }, () => ({
      type: 'input',
      control: 'fraction',
      value: '100',
    })),
    modalMotion: Array.from({ length: 100 }, () => 'ant-enter'),
    checkedRowCount: Infinity,
    errorAlertCount: 101,
  });
  expect(safe).toMatchObject({
    checkedRowCount: null,
    errorAlertCount: null,
    modalMotion: ['enter'],
  });
  expect('events' in safe && safe.events).toHaveLength(40);
  expect(Buffer.byteLength(JSON.stringify(safe))).toBeLessThan(12_000);
  expect(sanitizeSyntheticAllocationDiagnostic(null)).toMatchObject({ events: [] });
});

it.each([
  { qualification: 'false' },
  { backendOrigin: 'https://production.example.invalid' },
  { frontendUrl: 'https://127.0.0.1:18764' },
  { frontendUrl: 'http://external.example.invalid' },
  { frontendUrl: 'http://username:password@127.0.0.1:18764' },
  { browser: '../unsafe' },
])(
  'refuses artifact writes outside the explicit synthetic loopback boundary: %j',
  async (invalid) => {
    await expect(
      writeSyntheticAllocationDiagnostic({ ...options(), ...invalid }),
    ).rejects.toThrow();
    expect(readdirSync(directory)).toEqual([]);
  },
);

it('writes only a sanitized fixed-name private artifact for a configured browser', async () => {
  await writeSyntheticAllocationDiagnostic({
    ...options(),
    diagnostic: { html: 'PRIVATE', events: [] },
  });
  const file = path.join(directory, 'process-allocation-diagnostics-webkit.json');
  expect(readdirSync(directory)).toEqual(['process-allocation-diagnostics-webkit.json']);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  const content = readFileSync(file, 'utf8');
  expect(content).not.toContain('PRIVATE');
  expect(JSON.parse(content)).toMatchObject({
    schemaVersion: 'tiangong.synthetic-allocation-diagnostic.v1',
    browser: 'webkit',
    scope: 'reserved-origin-synthetic-process-allocation',
    diagnostic: { committedReactValue: 'not-observed', handlerStages: 'not-observed' },
  });
});

it.each([
  {
    workflow: '.github/workflows/i18n-semantic-e2e.yml',
    step: 'Upload qualification diagnostics',
    existing: [
      '.local/e2e-release/qualification-controller-report.json',
      '.local/e2e-release/runs/**/run-result.json',
      '.local/e2e-release/runs/**/preflight-report.json',
      '.local/e2e-release/runs/**/semantic-harness-qualification.json',
      '.local/e2e-release/runs/**/qualification-evidence-roundtrip.json',
    ],
  },
  {
    workflow: '.github/workflows/dependency-pr.yml',
    step: 'Upload synthetic qualification and cleanup evidence',
    existing: [
      '${{ runner.temp }}/platform-supabase-browser-${{ github.run_id }}-${{ github.run_attempt }}/*.json',
      '.local/e2e-release/qualification-proof.json',
      '.local/e2e-release/qualification-controller-report.json',
      '.local/e2e-release/runs/**/run-result.json',
      '.local/e2e-release/runs/**/preflight-report.json',
      '.local/e2e-release/runs/**/semantic-harness-qualification.json',
      '.local/e2e-release/runs/**/qualification-evidence-roundtrip.json',
    ],
  },
])('uploads only dedicated sanitized diagnostics in $workflow', ({ workflow, step, existing }) => {
  const source = readFileSync(path.resolve(process.cwd(), workflow), 'utf8');
  const start = source.indexOf(`      - name: ${step}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextStep = source.indexOf('\n      - name:', start + 1);
  const upload = source.slice(start, nextStep < 0 ? undefined : nextStep);
  expect(upload).toContain('if: always()');
  const files = [...upload.matchAll(/^            (.+)$/gm)].map((match) => match[1]);
  expect(files).toEqual([
    ...existing,
    '.local/e2e-release/runs/**/process-allocation-diagnostics-*.json',
  ]);
  expect(upload).not.toMatch(/error-context|test-results|trace|screenshot|auth-state/);
});
