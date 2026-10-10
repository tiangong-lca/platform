import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadQualificationClosureContract,
  qualificationReportFailures,
  readQualificationReportReceipt,
} from '../../../scripts/e2e/qualification-closure.cjs';

const controller = require('../../../scripts/e2e/release-e2e.cjs');
const controllerPath = path.resolve(process.cwd(), 'scripts/e2e/release-e2e.cjs');
// Credential-free reporter output downloaded from CI 37189151648. It is a
// regression fixture, never a qualification proof for the current candidate.
const observedReport = fs.readFileSync(
  path.join(__dirname, 'fixtures/qualification-ci-37189151648.fixture'),
);
const contract = loadQualificationClosureContract(process.cwd());
// Unit-only synthetic report for the current route contract. Keep the original CI bytes
// immutable and prove below that the old assertion set cannot qualify these new routes.
const currentReport = Buffer.from(
  JSON.stringify({
    ...JSON.parse(observedReport.toString('utf8')),
    assertionIds: [...contract.assertionIds],
    assertionBrowsers: Object.fromEntries(
      contract.assertionIds.map((id) => [
        id,
        JSON.parse(observedReport.toString('utf8')).assertionBrowsers[id] ?? [...contract.browsers],
      ]),
    ),
  }),
);
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-proof-source-'));
});
afterEach(() => fs.rmSync(directory, { force: true, recursive: true }));

function artifacts(raw: Buffer = currentReport) {
  const candidate = { commit: 'd'.repeat(40), tree: 'e'.repeat(40) };
  const preflightReport = path.join(directory, 'preflight-report.json');
  const containerResult = path.join(directory, 'run-result.json');
  const qualificationReport = path.join(directory, 'semantic-harness-qualification.json');
  fs.writeFileSync(qualificationReport, raw, { mode: 0o600 });
  const receipt = readQualificationReportReceipt(qualificationReport);
  fs.writeFileSync(
    containerResult,
    JSON.stringify({
      kind: 'tiangong-next-release-e2e-run-result',
      schemaVersion: 2,
      candidate,
      cleanup: { created: 0, cleaned: 0, leaked: 0 },
      status: 'passed',
      exitCode: 0,
      preflight: { status: 'passed' },
      qualification: controller.sanitize(receipt.qualification),
      qualificationReportSha256: receipt.qualificationReportSha256,
    }),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    preflightReport,
    JSON.stringify({
      kind: 'tiangong-next-release-e2e-preflight-report',
      schemaVersion: 2,
      candidate,
      status: 'passed',
      checks: [
        {
          id: 'environment.playwright-discovery',
          status: 'passed',
          summary: { fullListedTests: 84, listedTests: 96 },
        },
      ],
    }),
    { mode: 0o600 },
  );
  return {
    artifacts: { preflightReport, containerResult, qualificationReport },
    candidate,
    runDirectory: directory,
    environment: {
      manifestSha256: 'f'.repeat(64),
      environmentBrowsers: { chromium: '1', firefox: '2', webkit: '3' },
    },
  };
}

function refusal(result: ReturnType<typeof artifacts>) {
  const proof = path.join(directory, 'refused-proof.json');
  let error: any;
  try {
    controller.finalizeQualification(result, { proof });
  } catch (caught) {
    error = caught;
  }
  expect(fs.existsSync(proof)).toBe(false);
  return error;
}

it('round-trips a synthetic current report through producer receipt, private proof writing and CLI verification', () => {
  const result = artifacts();
  const run = JSON.parse(fs.readFileSync(result.artifacts.containerResult, 'utf8'));
  expect(run.qualification.assertionBrowsers['rv.login.password-forgot']).toBe('[REDACTED]');
  expect(run.qualification.assertionBrowsers['rv.login.password-reset']).toBe('[REDACTED]');
  expect(qualificationReportFailures(run.qualification, contract)).toContain(
    'assertion-browser-applicability',
  );
  const proof = path.join(directory, 'replayed-fixture-proof.json');
  expect(controller.finalizeQualification(result, { proof }).qualificationProof).toBe(proof);
  const written = JSON.parse(fs.readFileSync(proof, 'utf8'));
  expect(written.assertionBrowsers['rv.login.password-forgot']).toEqual(['chromium']);
  expect(written.assertionBrowsers['rv.login.password-reset']).toEqual(['chromium']);
  expect(written.assertionIds).toHaveLength(60);
  expect(written.diagnostics.qualificationReportSha256).toBe(
    createHash('sha256').update(currentReport).digest('hex'),
  );
  expect(fs.statSync(proof).mode & 0o777).toBe(0o600);
  const verified = spawnSync(
    process.execPath,
    [controllerPath, 'check-qualification', '--proof', proof, '--format=json'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  expect({ status: verified.status, stderr: verified.stderr }).toEqual({ status: 0, stderr: '' });
  expect(JSON.parse(verified.stdout).status).toBe('passed');
  expect(controller.sanitize({ password: 'real secret', token: 'private token' })).toEqual({
    password: '[REDACTED]',
    token: '[REDACTED]',
  });
});

it('rejects the immutable historical CI assertion set for the new display routes', () => {
  const result = artifacts(observedReport);
  expect(refusal(result).details.closureFailures).toContain('assertion-id-set');
  expect(
    qualificationReportFailures(JSON.parse(observedReport.toString('utf8')), contract),
  ).toContain('assertion-browser-id-set');
});

it('rejects a legacy receipt and a foreign report even when its closure data remains valid', () => {
  const result = artifacts();
  const run = JSON.parse(fs.readFileSync(result.artifacts.containerResult, 'utf8'));
  delete run.qualificationReportSha256;
  fs.writeFileSync(result.artifacts.containerResult, JSON.stringify(run));
  expect(refusal(result).details.closureFailures).toContain('qualification-report-digest');
  artifacts();
  fs.appendFileSync(result.artifacts.qualificationReport, '\n');
  expect(refusal(result).details.closureFailures).toContain('qualification-report-digest');
});

it.each(['run-result', 'preflight'])(
  'rejects foreign candidate identity in %s while the report hash still matches',
  (kind) => {
    const result = artifacts();
    const artifactPath =
      kind === 'run-result' ? result.artifacts.containerResult : result.artifacts.preflightReport;
    const value = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    value.candidate.commit = 'a'.repeat(40);
    fs.writeFileSync(artifactPath, JSON.stringify(value));
    expect(refusal(result).details.closureFailures).toContain(`${kind}-identity-status`);
  },
);

it.each(['secret-field', 'nested-secret', 'secret-value', 'unexpected-browser', 'partial'])(
  'rejects %s in a digest-bound report without exposing the payload',
  (kind) => {
    const report = JSON.parse(currentReport.toString('utf8'));
    if (kind === 'secret-field') report.password = 'private-secret-sentinel';
    if (kind === 'nested-secret') report.browsers.chromium.password = 'private-secret-sentinel';
    if (kind === 'secret-value') {
      report.assertionBrowsers['rv.login.password-forgot'] = ['private-secret-sentinel'];
    }
    if (kind === 'unexpected-browser')
      report.assertionBrowsers['rv.login.password-reset'] = ['safari'];
    if (kind === 'partial') report.assertionIds.pop();
    const result = artifacts(Buffer.from(JSON.stringify(report)));
    const error = refusal(result);
    expect(error.failureCode).toBe('E2E_QUALIFICATION_INCOMPLETE');
    expect(JSON.stringify(error.details)).not.toContain('private-secret-sentinel');
  },
);

it('requires canonical regular sibling files and never falls back to a diagnostic copy', () => {
  const result = artifacts();
  const moved = path.join(directory, 'different-report.json');
  fs.renameSync(result.artifacts.qualificationReport, moved);
  expect(refusal(result).failureCode).toBe('E2E_QUALIFICATION_ARTIFACT_INVALID');
  fs.symlinkSync(moved, result.artifacts.qualificationReport);
  expect(refusal(result).failureCode).toBe('E2E_QUALIFICATION_ARTIFACT_INVALID');
  fs.unlinkSync(result.artifacts.qualificationReport);
  fs.renameSync(moved, result.artifacts.qualificationReport);
  result.artifacts.preflightReport = path.join(directory, 'foreign-preflight.json');
  fs.copyFileSync(path.join(directory, 'preflight-report.json'), result.artifacts.preflightReport);
  expect(refusal(result).failureCode).toBe('E2E_QUALIFICATION_ARTIFACT_INVALID');
});

it('keeps malformed report content out of producer and host error messages', () => {
  const result = artifacts();
  fs.writeFileSync(result.artifacts.qualificationReport, 'private-secret-sentinel');
  expect(() => readQualificationReportReceipt(result.artifacts.qualificationReport)).toThrow(
    'Semantic qualification report is not valid JSON.',
  );
  const error = refusal(result);
  expect(error.failureCode).toBe('E2E_QUALIFICATION_ARTIFACT_INVALID');
  expect(error.message).not.toContain('private-secret-sentinel');
});

it.each([
  'secret-field',
  'nested-secret',
  'secret-version',
  'secret-date',
  'coverage-extra',
  'browser-extra',
  'candidate-extra',
  'cleanup-extra',
  'missing-diagnostics',
  'missing-report-digest',
  'missing-result-digest',
  'legacy-schema',
  'malformed-json',
])('refuses %s in the persisted external proof through public CLI verification', (kind) => {
  const result = artifacts();
  const proof = path.join(directory, 'tampered-fixture-proof.json');
  controller.finalizeQualification(result, { proof });
  const value = JSON.parse(fs.readFileSync(proof, 'utf8'));
  if (kind === 'secret-field') value.password = 'private-secret-sentinel';
  if (kind === 'nested-secret') value.diagnostics.password = 'private-secret-sentinel';
  if (kind === 'secret-version') value.browsers[0].version = 'private-secret-sentinel';
  if (kind === 'secret-date') value.generatedAt = 'private-secret-sentinel 2026-01-01';
  if (kind === 'coverage-extra') value.coverage.note = 'private-secret-sentinel';
  if (kind === 'browser-extra') value.browsers[0].note = 'private-secret-sentinel';
  if (kind === 'candidate-extra') value.candidate.note = 'private-secret-sentinel';
  if (kind === 'cleanup-extra') value.cleanup.note = 'private-secret-sentinel';
  if (kind === 'missing-diagnostics') delete value.diagnostics;
  if (kind === 'missing-report-digest') delete value.diagnostics.qualificationReportSha256;
  if (kind === 'missing-result-digest') delete value.diagnostics.runResultSha256;
  if (kind === 'legacy-schema') value.schemaVersion = 'tiangong.semantic-harness-qualification.v5';
  fs.writeFileSync(proof, JSON.stringify(value));
  if (kind === 'malformed-json') fs.writeFileSync(proof, 'private-secret-sentinel');
  const verified = spawnSync(
    process.execPath,
    [controllerPath, 'check-qualification', '--proof', proof, '--format=json'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  expect(verified.status).toBe(20);
  expect(JSON.parse(verified.stdout).failureCode).toBe('E2E_QUALIFICATION_PROOF_INVALID');
  expect(verified.stdout).not.toContain('private-secret-sentinel');
  expect(verified.stderr).not.toContain('private-secret-sentinel');
});
