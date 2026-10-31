import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, firefox, webkit } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadE2ECredential } from '../../tests/e2e/i18n/auth';
import {
  resolveCandidateReadinessBrowserName,
  waitForCandidateFrontendReady,
} from '../../tests/e2e/i18n/candidate-readiness';
import { PLAYWRIGHT_BROWSER_PROJECTS } from '../../tests/e2e/i18n/contracts';
import { readVerifiedE2EBackendTarget } from '../../tests/e2e/i18n/production-backend-target';
import {
  cleanupCodexE2EProcess,
  readProductionDataLedger,
  readProductionDataResult,
} from '../../tests/e2e/i18n/production-data-ledger';
import { assertProductionDataWriteAuthorization } from '../../tests/e2e/i18n/production-data-safety';
import {
  loadQualificationClosureContract,
  qualificationReportFailures,
  readQualificationReportReceipt,
} from './qualification-closure.cjs';
import { verifyMaintainedPatches, type MaintainedPatchEntry } from './maintained-patches.cjs';
import { handoffOutputOwnership } from './output-ownership.cjs';
import { validateRuntimeAdmission } from './batch-allocation-diagnostic.cjs';

type CheckStatus = 'failed' | 'passed' | 'skipped';

type PreflightCheck = {
  durationMs: number;
  finishedAt: string;
  id: string;
  startedAt: string;
  status: CheckStatus;
  summary?: unknown;
};

type CandidateManifest = {
  candidate: {
    archiveSha256: string;
    commit: string;
    evidenceIdentity: {
      configTreeDigest: string;
      observedHeadCommit: string;
      packageManifestDigest: string;
      sourceTreeDigest: string;
      unitTestTreeDigest: string;
    };
    dependencyLockSha256: string;
    maintainedPatches: MaintainedPatchEntry[];
    maintainedPatchesSha256: string;
    packageJsonSha256: string;
    packageVersion: string;
    pnpmWorkspaceSha256: string;
    sourceDateEpoch: number;
    tree: string;
  };
  environment: {
    contractSha256: string;
    dockerfileSha256: string;
    frontendTarget: 'main' | 'qualification';
    nodeMajor: number;
    nodeImage: string;
    nodeVersion: string;
    playwrightImage: string;
    playwrightVersion: string;
  };
  kind: 'tiangong-next-release-e2e-candidate';
  repository: {
    canonical: 'tiangong-lca/platform';
    packageName: 'tiangong-lca-next';
  };
  schemaVersion: number;
  sources: Record<string, string>;
};

type EnvironmentContract = {
  candidateManifestPath: string;
  containerUser: string;
  environmentContractPath: string;
  home: string;
  kind: 'tiangong-next-release-e2e-environment';
  nodeMajor: number;
  nodeImage: string;
  nodeVersion: string;
  outputPath: string;
  playwrightImage: string;
  playwrightVersion: string;
  schemaVersion: number;
  workdir: string;
};

type RunnerPhase = 'preflight' | 'candidate-server' | 'browser' | 'cleanup' | 'finalization';

const EXIT = Object.freeze({
  ENVIRONMENT: 10,
  CANDIDATE: 20,
  SAFETY: 30,
  BROWSER: 40,
  FINALIZATION: 50,
});
const OUTPUT_DIRECTORY = path.resolve(process.env.E2E_OUTPUT_PATH || '/e2e-output');
const PREFLIGHT_REPORT_PATH = path.join(OUTPUT_DIRECTORY, 'preflight-report.json');
const RUN_RESULT_PATH = path.join(OUTPUT_DIRECTORY, 'run-result.json');
const MANIFEST_PATH = path.resolve(
  process.env.E2E_CANDIDATE_MANIFEST_PATH || '/opt/tiangong-e2e/candidate-manifest.json',
);
const ENVIRONMENT_PATH = path.resolve(
  process.env.E2E_ENVIRONMENT_CONTRACT_PATH || '/opt/tiangong-e2e/environment.json',
);
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
const sensitiveValues = new Set<string>();

class RunnerError extends Error {
  cause?: unknown;
  exitCode: number;
  failureCode: string;
  phase: RunnerPhase;

  constructor(
    message: string,
    options: {
      cause?: unknown;
      exitCode: number;
      failureCode: string;
      phase: RunnerPhase;
    },
  ) {
    super(message);
    this.cause = options.cause;
    this.name = 'RunnerError';
    this.exitCode = options.exitCode;
    this.failureCode = options.failureCode;
    this.phase = options.phase;
  }
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function redactString(value: string): string {
  let redacted = value;
  for (const sensitive of sensitiveValues) {
    if (sensitive) redacted = redacted.split(sensitive).join('[REDACTED]');
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
    .replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?/gu,
      '[REDACTED_TOKEN]',
    );
}

function sanitize(value: unknown, key = ''): unknown {
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey &&
    !normalizedKey.includes('sha256') &&
    /password|secret|token|authorization|cookie|credential|api.?key|publishable.?key/u.test(
      normalizedKey,
    )
  ) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]),
    );
  }
  return value;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(sanitize(value), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function errorChain(error: unknown): Array<{ message: string; name: string }> {
  const chain: Array<{ message: string; name: string }> = [];
  let current = error;
  while (current instanceof Error && chain.length < 5) {
    chain.push({ message: redactString(current.message), name: current.name });
    current = (current as Error & { cause?: unknown }).cause;
  }
  return chain;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function waitFor(
  probe: () => Promise<boolean>,
  description: string,
  timeoutMs = 60_000,
  abortProbe?: () => Error | undefined,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const abortError = abortProbe?.();
    if (abortError) throw abortError;
    try {
      if (await probe()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const readinessError = new Error(
    `${description} did not become ready within ${timeoutMs}ms.`,
  ) as Error & { cause?: unknown };
  readinessError.cause = lastError;
  throw readinessError;
}

function classifyPreflightFailure(checkId: string): { exitCode: number; failureCode: string } {
  if (checkId.startsWith('safety.') || checkId.startsWith('auth.')) {
    return {
      exitCode: EXIT.SAFETY,
      failureCode: `E2E_${checkId.replace(/[^a-z0-9]+/giu, '_').toUpperCase()}_FAILED`,
    };
  }
  if (checkId.startsWith('candidate.') || checkId.startsWith('server.')) {
    return {
      exitCode: EXIT.CANDIDATE,
      failureCode: `E2E_${checkId.replace(/[^a-z0-9]+/giu, '_').toUpperCase()}_FAILED`,
    };
  }
  return {
    exitCode: EXIT.ENVIRONMENT,
    failureCode: `E2E_${checkId.replace(/[^a-z0-9]+/giu, '_').toUpperCase()}_FAILED`,
  };
}

async function verifyCandidateIdentity(
  manifest: CandidateManifest,
  environment: EnvironmentContract,
): Promise<Record<string, unknown>> {
  if (
    manifest.kind !== 'tiangong-next-release-e2e-candidate' ||
    manifest.schemaVersion !== 6 ||
    manifest.repository?.canonical !== 'tiangong-lca/platform' ||
    manifest.repository?.packageName !== 'tiangong-lca-next'
  ) {
    throw new Error('Candidate manifest kind or schema version is unsupported.');
  }
  if (
    environment.kind !== 'tiangong-next-release-e2e-environment' ||
    environment.schemaVersion !== 1
  ) {
    throw new Error('Environment contract kind or schema version is unsupported.');
  }
  const [packageJsonRaw, dependencyLockRaw, pnpmWorkspaceRaw, dockerfileRaw, environmentRaw] =
    await Promise.all([
      readFile(path.join(process.cwd(), 'package.json')),
      readFile(path.join(process.cwd(), 'pnpm-lock.yaml')),
      readFile(path.join(process.cwd(), 'pnpm-workspace.yaml')),
      readFile(path.join(process.cwd(), 'docker/e2e/Dockerfile')),
      readFile(path.join(process.cwd(), 'docker/e2e/environment.json')),
    ]);
  verifyMaintainedPatches(
    process.cwd(),
    manifest.candidate.maintainedPatches,
    manifest.candidate.maintainedPatchesSha256,
  );
  const packageJson = JSON.parse(packageJsonRaw.toString('utf8')) as { version?: string };
  const installedPlaywright = await readJson<{ version: string }>(
    path.join(process.cwd(), 'node_modules/@playwright/test/package.json'),
  );
  const mismatches = [
    [sha256(packageJsonRaw), manifest.candidate.packageJsonSha256, 'package.json'],
    [sha256(dependencyLockRaw), manifest.candidate.dependencyLockSha256, 'pnpm-lock.yaml'],
    [sha256(pnpmWorkspaceRaw), manifest.candidate.pnpmWorkspaceSha256, 'pnpm-workspace.yaml'],
    [sha256(dockerfileRaw), manifest.environment.dockerfileSha256, 'Dockerfile'],
    [sha256(environmentRaw), manifest.environment.contractSha256, 'environment contract'],
    [packageJson.version, manifest.candidate.packageVersion, 'package version'],
    [installedPlaywright.version, environment.playwrightVersion, 'Playwright version'],
    [
      String(Number(process.versions.node.split('.')[0])),
      String(environment.nodeMajor),
      'Node major',
    ],
    [process.versions.node, environment.nodeVersion, 'Node version'],
  ].filter(([actual, expected]) => actual !== expected);
  if (mismatches.length > 0) {
    throw new Error(
      `Candidate identity mismatch: ${mismatches.map(([, , label]) => label).join(', ')}.`,
    );
  }
  if (
    manifest.environment.playwrightImage !== environment.playwrightImage ||
    manifest.environment.playwrightVersion !== environment.playwrightVersion ||
    manifest.environment.nodeMajor !== environment.nodeMajor ||
    manifest.environment.nodeImage !== environment.nodeImage ||
    manifest.environment.nodeVersion !== environment.nodeVersion ||
    manifest.environment.frontendTarget !==
      (process.env.E2E_QUALIFICATION === 'true' ? 'qualification' : 'main')
  ) {
    throw new Error('Candidate manifest and environment contract differ.');
  }
  return {
    commit: manifest.candidate.commit,
    environmentContractSha256: manifest.environment.contractSha256,
    packageVersion: manifest.candidate.packageVersion,
    playwrightVersion: installedPlaywright.version,
    tree: manifest.candidate.tree,
  };
}

async function launchEveryBrowser(): Promise<Record<string, string>> {
  const browserTypes = { chromium, firefox, webkit };
  const versions: Record<string, string> = {};
  for (const browserName of PLAYWRIGHT_BROWSER_PROJECTS) {
    const browser = await browserTypes[browserName].launch();
    try {
      versions[browserName] = browser.version();
    } finally {
      await browser.close();
    }
  }
  return versions;
}

function startCandidateServer(): ChildProcess {
  return spawn(process.execPath, ['scripts/e2e/static-server.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      E2E_STATIC_HOST: '127.0.0.1',
      E2E_STATIC_PORT: new URL(BASE_URL).port || '80',
      E2E_STATIC_ROOT: path.join(process.cwd(), 'dist'),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

async function readCandidateServerIdentity(
  manifest: CandidateManifest,
  server: ChildProcess,
): Promise<unknown> {
  let identity: Record<string, unknown> | undefined;
  await waitFor(
    async () => {
      const response = await fetch(new URL('/__tiangong_e2e__/ready', BASE_URL));
      if (!response.ok) return false;
      identity = (await response.json()) as Record<string, unknown>;
      return true;
    },
    'Static candidate server',
    60_000,
    () =>
      server.exitCode === null
        ? undefined
        : new Error(`Static candidate server exited early with code ${server.exitCode}.`),
  );
  if (
    identity?.candidateCommit !== manifest.candidate.commit ||
    identity?.candidateTree !== manifest.candidate.tree ||
    identity?.packageVersion !== manifest.candidate.packageVersion ||
    typeof identity?.bundleSha256 !== 'string'
  ) {
    throw new Error('Static server readiness identity differs from the candidate manifest.');
  }
  return identity;
}

async function verifyRoleNeutralAuthentication(): Promise<Record<string, string>> {
  const [credential, backendTarget] = await Promise.all([
    loadE2ECredential(),
    Promise.resolve(readVerifiedE2EBackendTarget()),
  ]);
  sensitiveValues.add(credential.email);
  sensitiveValues.add(credential.password);
  sensitiveValues.add(backendTarget.publishableKey);
  const client = createClient(backendTarget.origin, backendTarget.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const result = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (result.error || !result.data.session || !result.data.user) {
    throw new Error(`Role-neutral authentication failed: ${result.error?.message ?? 'no session'}`);
  }
  sensitiveValues.add(result.data.session.access_token);
  sensitiveValues.add(result.data.session.refresh_token);
  try {
    return {
      requestedCredentialEntry: credential.requestedRole,
      resolvedCredentialEntry: credential.resolvedRole,
      userIdSha256: sha256(result.data.user.id),
    };
  } finally {
    await client.auth.signOut();
  }
}

async function verifyLedgerSafety(): Promise<Record<string, unknown>> {
  if (process.env.E2E_QUALIFICATION === 'true') {
    if (process.env.E2E_ALLOW_PRODUCTION_DATA === 'true') {
      throw new Error('Semantic harness qualification forbids production-data authorization.');
    }
    return {
      productionDataAuthorized: false,
      recoveryDirectoryWritable: false,
      semanticBackendSimulator: true,
      unresolvedLedger: false,
    };
  }
  const recoveryPath = process.env.E2E_RECOVERY_LEDGER_PATH?.trim();
  if (!recoveryPath || !path.isAbsolute(recoveryPath)) {
    throw new Error('An absolute external recovery ledger path is required.');
  }
  const existingLedger = await readProductionDataLedger();
  if (existingLedger) {
    throw new Error('An unresolved production-data recovery ledger exists; refusing a new run.');
  }
  const probePath = `${recoveryPath}.preflight-${process.pid}`;
  await mkdir(path.dirname(recoveryPath), { recursive: true, mode: 0o700 });
  await writeFile(probePath, 'preflight\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  await rm(probePath, { force: true });
  if (process.env.E2E_ALLOW_PRODUCTION_DATA === 'true') {
    assertProductionDataWriteAuthorization(process.env);
  }
  return {
    productionDataAuthorized: process.env.E2E_ALLOW_PRODUCTION_DATA === 'true',
    recoveryDirectoryWritable: true,
    unresolvedLedger: false,
  };
}

function discoverPlaywrightTests(): Record<string, unknown> {
  const args = JSON.parse(process.env.E2E_PLAYWRIGHT_ARGS_JSON || '[]') as string[];
  const discover = (discoveryArgs: string[]) =>
    spawnSync(
      path.join(process.cwd(), 'node_modules/.bin/playwright'),
      ['test', '--config=playwright.config.ts', '--list', ...discoveryArgs],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  const result = discover(args);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Playwright discovery failed: ${String(result.stderr || '').trim()}`);
  }
  const output = String(result.stdout || '');
  const listedTests = output.split(/\r?\n/u).filter((line) => /^\s*\[/u.test(line)).length;
  if (listedTests === 0) throw new Error('Playwright discovery returned no tests.');
  if (process.env.E2E_QUALIFICATION !== 'true') {
    return { listingSha256: sha256(output), listedTests };
  }
  const canonicalRoot = path.join(process.cwd(), 'tests/e2e/i18n');
  const collectCanonicalSpecs = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectCanonicalSpecs(absolutePath);
      if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) return [];
      if (entry.name === 'harness-qualification.spec.ts') return [];
      return [path.relative(process.cwd(), absolutePath)];
    });
  const canonicalSpecs = collectCanonicalSpecs(canonicalRoot).sort();
  const fullResult = discover(canonicalSpecs);
  if (fullResult.error) throw fullResult.error;
  if (fullResult.status !== 0) {
    throw new Error(`Full Playwright discovery failed: ${String(fullResult.stderr || '').trim()}`);
  }
  const fullOutput = String(fullResult.stdout || '');
  const fullListedTests = fullOutput.split(/\r?\n/u).filter((line) => /^\s*\[/u.test(line)).length;
  return {
    fullListingSha256: sha256(fullOutput),
    fullListedTests,
    listingSha256: sha256(output),
    listedTests,
  };
}

async function runPlaywright(): Promise<number> {
  const args = JSON.parse(process.env.E2E_PLAYWRIGHT_ARGS_JSON || '[]') as string[];
  return new Promise((resolve, reject) => {
    const child = spawn(
      path.join(process.cwd(), 'node_modules/.bin/playwright'),
      ['test', '--config=playwright.config.ts', ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'inherit', 'inherit'],
      },
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Playwright terminated by ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

async function ensureExactCleanup(): Promise<Record<string, number>> {
  if (process.env.E2E_QUALIFICATION === 'true') {
    return { cleaned: 0, created: 0, leaked: 0 };
  }
  const ledger = await readProductionDataLedger();
  if (ledger) {
    const result = await cleanupCodexE2EProcess();
    if (result.leaked !== 0 || result.created !== result.cleaned) {
      throw new Error(
        `Production fixture cleanup invariant failed: created=${result.created}, cleaned=${result.cleaned}, leaked=${result.leaked}.`,
      );
    }
    return result;
  }
  const result = await readProductionDataResult();
  if (result.leaked !== 0 || result.created !== result.cleaned) {
    throw new Error(
      `Production fixture result is incomplete: created=${result.created}, cleaned=${result.cleaned}, leaked=${result.leaked}.`,
    );
  }
  return result;
}

async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main(): Promise<number> {
  const startedAtMs = Date.now();
  const checks: PreflightCheck[] = [];
  let fixtureIntentCreated = false;
  let phase: RunnerPhase = 'preflight';
  let server: ChildProcess | undefined;
  let manifest: CandidateManifest | undefined;
  let cleanupResult: Record<string, number> | undefined;

  const preflightReport = () => ({
    kind: 'tiangong-next-release-e2e-preflight-report',
    schemaVersion: 2,
    candidate: manifest?.candidate,
    checks,
    completedAt: new Date().toISOString(),
    fixtureIntentCreated,
    status: checks.some((check) => check.status === 'failed') ? 'failed' : 'passed',
  });

  const check = async <T>(id: string, operation: () => Promise<T> | T): Promise<T> => {
    const checkStartedAtMs = Date.now();
    try {
      const summary = await operation();
      checks.push({
        durationMs: Date.now() - checkStartedAtMs,
        finishedAt: new Date().toISOString(),
        id,
        startedAt: new Date(checkStartedAtMs).toISOString(),
        status: 'passed',
        summary: sanitize(summary),
      });
      await writePrivateJson(PREFLIGHT_REPORT_PATH, preflightReport());
      return summary;
    } catch (error) {
      checks.push({
        durationMs: Date.now() - checkStartedAtMs,
        finishedAt: new Date().toISOString(),
        id,
        startedAt: new Date(checkStartedAtMs).toISOString(),
        status: 'failed',
        summary: { error: errorChain(error) },
      });
      await writePrivateJson(PREFLIGHT_REPORT_PATH, preflightReport());
      const classification = classifyPreflightFailure(id);
      throw new RunnerError(`Preflight check ${id} failed.`, {
        cause: error,
        exitCode: classification.exitCode,
        failureCode: classification.failureCode,
        phase,
      });
    }
  };

  try {
    await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
    const environment = await readJson<EnvironmentContract>(ENVIRONMENT_PATH);
    manifest = await readJson<CandidateManifest>(MANIFEST_PATH);

    await check('environment.output', async () => {
      const probePath = path.join(OUTPUT_DIRECTORY, `.write-probe-${process.pid}`);
      await writeFile(probePath, 'ok\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rm(probePath, { force: true });
      const outputStat = await stat(OUTPUT_DIRECTORY);
      return { mode: outputStat.mode & 0o777, writable: true };
    });
    await check('candidate.identity', () => verifyCandidateIdentity(manifest!, environment));
    if (process.env.E2E_QUALIFICATION === 'true') {
      await check('candidate.batch-allocation-diagnostic', async () => {
        for (const browser of PLAYWRIGHT_BROWSER_PROJECTS) {
          validateRuntimeAdmission(process.env, process.cwd(), {
            browser,
            project: browser,
            scope: 'qualification-diagnostic-only',
            control: null,
          });
        }
        return { admittedBrowsers: [...PLAYWRIGHT_BROWSER_PROJECTS] };
      });
    }
    await check('environment.browser-launch', launchEveryBrowser);

    phase = 'candidate-server';
    server = startCandidateServer();
    await check('server.identity', () => readCandidateServerIdentity(manifest!, server!));

    phase = 'preflight';
    await check('candidate.frontend-readiness', () =>
      waitForCandidateFrontendReady(
        BASE_URL,
        resolveCandidateReadinessBrowserName(process.env.E2E_READINESS_BROWSER),
      ),
    );
    await check(
      process.env.E2E_QUALIFICATION === 'true'
        ? 'safety.qualification-backend-target'
        : 'safety.production-backend-target',
      () => {
        const target = readVerifiedE2EBackendTarget();
        sensitiveValues.add(target.publishableKey);
        return {
          candidateEnvironmentSha256: target.candidateEnvironmentSha256,
          origin: target.origin,
          originSha256: target.originSha256,
          publishableKeySha256: target.publishableKeySha256,
          trackedMainEnvironmentSha256: target.trackedMainEnvironmentSha256,
        };
      },
    );
    if (process.env.E2E_AUTHENTICATED === 'true' && process.env.E2E_QUALIFICATION !== 'true') {
      await check('auth.role-neutral-login', verifyRoleNeutralAuthentication);
    } else {
      checks.push({
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        id: 'auth.role-neutral-login',
        startedAt: new Date().toISOString(),
        status: 'skipped',
        summary: { reason: 'Credential-free run' },
      });
    }
    await check('safety.production-ledger', verifyLedgerSafety);
    await check('environment.playwright-discovery', discoverPlaywrightTests);
    await writePrivateJson(PREFLIGHT_REPORT_PATH, preflightReport());

    phase = 'browser';
    // This conservative boundary disables resume as soon as Playwright may enter global setup.
    // It never claims a browser pass or a production fixture intent is reusable.
    fixtureIntentCreated = process.env.E2E_ALLOW_PRODUCTION_DATA === 'true';
    const playwrightStatus = await runPlaywright();
    if (playwrightStatus !== 0) {
      throw new RunnerError('Playwright semantic E2E failed.', {
        exitCode: EXIT.BROWSER,
        failureCode: 'E2E_BROWSER_TEST_FAILED',
        phase,
      });
    }
    let qualification: unknown;
    let qualificationReportSha256: string | undefined;
    if (process.env.E2E_QUALIFICATION === 'true') {
      const receipt = readQualificationReportReceipt(
        process.env.E2E_QUALIFICATION_RESULT_PATH ||
          '/e2e-output/semantic-harness-qualification.json',
      );
      qualification = receipt.qualification;
      qualificationReportSha256 = receipt.qualificationReportSha256;
      const contract = loadQualificationClosureContract(process.cwd());
      const closureFailures = qualificationReportFailures(qualification, contract);
      const canonicalCheck = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/i18n/check-semantic-evidence-format.mjs',
          '--path',
          '/e2e-output/qualification-evidence-roundtrip.json',
        ],
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      if (canonicalCheck.status !== 0) closureFailures.push('canonical-evidence-format');
      if (closureFailures.length > 0) {
        process.stderr.write(
          `Qualification closure failed checks: ${closureFailures.join(', ')}\n`,
        );
        throw new RunnerError(
          `Semantic harness qualification closure is incomplete: ${closureFailures.join(', ')}.`,
          {
            exitCode: EXIT.BROWSER,
            failureCode: 'E2E_QUALIFICATION_INCOMPLETE',
            phase,
          },
        );
      }
    }

    phase = 'cleanup';
    cleanupResult = await ensureExactCleanup();
    if (
      process.env.E2E_WRITE_VERIFIED_EVIDENCE === 'true' &&
      !(await stat(process.env.E2E_EVIDENCE_PATH || '').catch(() => undefined))
    ) {
      throw new RunnerError('Verified evidence was requested but not written.', {
        exitCode: EXIT.FINALIZATION,
        failureCode: 'E2E_VERIFIED_EVIDENCE_MISSING',
        phase: 'finalization',
      });
    }

    phase = 'finalization';
    const finishedAtMs = Date.now();
    await writePrivateJson(RUN_RESULT_PATH, {
      kind: 'tiangong-next-release-e2e-run-result',
      schemaVersion: 2,
      candidate: manifest.candidate,
      cleanup: cleanupResult,
      durationMs: finishedAtMs - startedAtMs,
      exitCode: 0,
      finishedAt: new Date(finishedAtMs).toISOString(),
      fixtureIntentCreated,
      qualification,
      qualificationReportSha256,
      phase,
      preflight: { checks: checks.length, status: 'passed' },
      startedAt: new Date(startedAtMs).toISOString(),
      status: 'passed',
    });
    process.stderr.write(`Release E2E passed; output: ${OUTPUT_DIRECTORY}\n`);
    return 0;
  } catch (error) {
    let normalized =
      error instanceof RunnerError
        ? error
        : new RunnerError(error instanceof Error ? error.message : String(error), {
            cause: error,
            exitCode: EXIT.FINALIZATION,
            failureCode: 'E2E_CONTAINER_UNCLASSIFIED_FAILURE',
            phase,
          });
    if (fixtureIntentCreated) {
      try {
        cleanupResult = await ensureExactCleanup();
      } catch (cleanupError) {
        normalized = new RunnerError('Release E2E failed and exact cleanup did not complete.', {
          cause: cleanupError,
          exitCode: EXIT.FINALIZATION,
          failureCode: 'E2E_EXACT_CLEANUP_FAILED',
          phase: 'cleanup',
        });
      }
    }
    const finishedAtMs = Date.now();
    await writePrivateJson(RUN_RESULT_PATH, {
      kind: 'tiangong-next-release-e2e-run-result',
      schemaVersion: 2,
      candidate: manifest?.candidate,
      cleanup: cleanupResult,
      durationMs: finishedAtMs - startedAtMs,
      error: { chain: errorChain(normalized), message: normalized.message },
      exitCode: normalized.exitCode,
      failureCode: normalized.failureCode,
      finishedAt: new Date(finishedAtMs).toISOString(),
      fixtureIntentCreated,
      nextCommand:
        normalized.phase === 'preflight' || normalized.phase === 'candidate-server'
          ? 'pnpm e2e:release:resume'
          : undefined,
      phase: normalized.phase,
      preflight: {
        checks: checks.length,
        status: checks.some((entry) => entry.status === 'failed') ? 'failed' : 'passed',
      },
      startedAt: new Date(startedAtMs).toISOString(),
      status: 'failed',
    });
    process.stderr.write(`${normalized.failureCode}: ${redactString(normalized.message)}\n`);
    return normalized.exitCode;
  } finally {
    await stopServer(server);
    await rm(process.env.E2E_RUNTIME_DIR || '/tmp/tiangong-next-e2e-runtime', {
      force: true,
      recursive: true,
    });
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch(async (error) => {
    await writePrivateJson(RUN_RESULT_PATH, {
      kind: 'tiangong-next-release-e2e-run-result',
      schemaVersion: 2,
      error: { chain: errorChain(error) },
      exitCode: EXIT.FINALIZATION,
      failureCode: 'E2E_CONTAINER_FATAL_FAILURE',
      phase: 'finalization',
      status: 'failed',
    }).catch(() => undefined);
    process.stderr.write(`E2E_CONTAINER_FATAL_FAILURE: ${redactString(String(error))}\n`);
    process.exitCode = EXIT.FINALIZATION;
  })
  .finally(async () => {
    try {
      handoffOutputOwnership(OUTPUT_DIRECTORY, process.env.E2E_RECOVERY_LEDGER_PATH);
    } catch (error) {
      // A partial ownership transfer can leave the result readable. Keep its
      // machine-readable status aligned with the failing container exit code.
      await readFile(RUN_RESULT_PATH, 'utf8')
        .then((value) => JSON.parse(value))
        .then((result) =>
          writePrivateJson(RUN_RESULT_PATH, {
            ...result,
            error: { chain: errorChain(error), message: 'E2E artifact ownership handoff failed.' },
            exitCode: EXIT.FINALIZATION,
            failureCode: 'E2E_OUTPUT_HANDOFF_FAILED',
            nextCommand: undefined,
            phase: 'artifact-handoff',
            status: 'failed',
          }),
        )
        .catch(() => undefined);
      process.stderr.write(`E2E_OUTPUT_HANDOFF_FAILED: ${redactString(String(error))}\n`);
      process.exitCode = EXIT.FINALIZATION;
    }
  });
