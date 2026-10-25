import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import type { BrowserContext, Page } from '@playwright/test';

import { REPOSITORY_ROOT, sha256 } from './contracts';
import {
  installReadOnlyProductionGuard,
  type ProductionRequestGuard,
  type ProductionRequestGuardOptions,
} from './production-request-guard';

export type VerifiedProductionRequestGuardOptions = Omit<
  ProductionRequestGuardOptions,
  'expectedPublishableKey'
>;

export type VerifiedProductionBackendTarget = {
  candidateEnvironmentSha256: string;
  origin: string;
  originSha256: string;
  publishableKey: string;
  publishableKeySha256: string;
  trackedMainEnvironmentSha256: string;
};

const QUALIFICATION_ENVIRONMENT_RELATIVE_PATH = 'docker/e2e/qualification.env';
const OFFICIAL_MAIN_ENVIRONMENT_PATH = 'config/environments/main.env';

function parseProductionBackend(environment: string): {
  origin: string;
  publishableKey: string;
} {
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(environment);
  } catch {
    throw new Error('Environment does not define a valid production backend target.');
  }
  const url = values.SUPABASE_URL?.trim();
  const publishableKey = values.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error('Environment does not define a complete production backend target.');
  }
  try {
    return { origin: new URL(url).origin, publishableKey };
  } catch {
    throw new Error('Environment defines an invalid production backend target.');
  }
}

export function verifyProductionBackendTargetSources(
  candidateEnvironment: string,
  trackedMainEnvironment: string,
): VerifiedProductionBackendTarget {
  const candidate = parseProductionBackend(candidateEnvironment);
  const trackedMain = parseProductionBackend(trackedMainEnvironment);
  if (
    candidate.origin !== trackedMain.origin ||
    candidate.publishableKey !== trackedMain.publishableKey
  ) {
    throw new Error('Candidate backend target differs from tracked main production.');
  }
  return {
    candidateEnvironmentSha256: sha256(candidateEnvironment),
    origin: trackedMain.origin,
    originSha256: sha256(trackedMain.origin),
    publishableKey: trackedMain.publishableKey,
    publishableKeySha256: sha256(trackedMain.publishableKey),
    trackedMainEnvironmentSha256: sha256(trackedMainEnvironment),
  };
}

function readVerifiedDeploymentBackendTarget(): VerifiedProductionBackendTarget {
  const candidatePath = existsSync(path.join(REPOSITORY_ROOT, OFFICIAL_MAIN_ENVIRONMENT_PATH))
    ? OFFICIAL_MAIN_ENVIRONMENT_PATH
    : '.env';
  const candidateEnvironment = readFileSync(path.join(REPOSITORY_ROOT, candidatePath), 'utf8');
  const trackedMainEnvironmentPath = process.env.E2E_TRACKED_MAIN_ENV_PATH?.trim();
  let trackedMainEnvironment: string;
  if (trackedMainEnvironmentPath) {
    // The archived candidate container has no Git metadata. Its host-exported
    // proof remains sufficient; do not execute any Git command in this branch.
    trackedMainEnvironment = readFileSync(path.resolve(trackedMainEnvironmentPath), 'utf8');
  } else {
    const trackedPath = execFileSync(
      'git',
      ['ls-tree', '--name-only', 'origin/main', '--', OFFICIAL_MAIN_ENVIRONMENT_PATH],
      { cwd: REPOSITORY_ROOT, encoding: 'utf8' },
    ).trim()
      ? OFFICIAL_MAIN_ENVIRONMENT_PATH
      : '.env';
    trackedMainEnvironment = execFileSync('git', ['show', `origin/main:${trackedPath}`], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
  }
  return verifyProductionBackendTargetSources(candidateEnvironment, trackedMainEnvironment);
}

export function readVerifiedE2EBackendTarget(): VerifiedProductionBackendTarget {
  if (process.env.E2E_QUALIFICATION !== 'true') {
    return readVerifiedDeploymentBackendTarget();
  }
  const qualificationEnvironment = readFileSync(
    path.join(REPOSITORY_ROOT, QUALIFICATION_ENVIRONMENT_RELATIVE_PATH),
    'utf8',
  );
  return verifyProductionBackendTargetSources(qualificationEnvironment, qualificationEnvironment);
}

// Keep the established spec-facing API stable while target selection remains centralized here.
export function readVerifiedProductionBackendTarget(): VerifiedProductionBackendTarget {
  return readVerifiedE2EBackendTarget();
}

export function bindVerifiedProductionRequestGuardOptions(
  backendTarget: Pick<VerifiedProductionBackendTarget, 'publishableKey'>,
  options: VerifiedProductionRequestGuardOptions = {},
): ProductionRequestGuardOptions {
  return {
    ...options,
    expectedPublishableKey: backendTarget.publishableKey,
  };
}

export async function installVerifiedProductionReadOnlyGuard(
  target: BrowserContext | Page,
  options: VerifiedProductionRequestGuardOptions = {},
): Promise<{
  backendTarget: VerifiedProductionBackendTarget;
  guard: ProductionRequestGuard;
}> {
  const backendTarget = readVerifiedE2EBackendTarget();
  const guard = await installReadOnlyProductionGuard(
    target,
    backendTarget.origin,
    bindVerifiedProductionRequestGuardOptions(backendTarget, options),
  );
  return { backendTarget, guard };
}
