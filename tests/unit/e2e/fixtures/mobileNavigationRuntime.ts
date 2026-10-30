import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');

export function runtimeFixture() {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-diagnostic-contract-')),
  );
  const outputDirectory = path.join(directory, 'output');
  fs.mkdirSync(outputDirectory, { mode: 0o700 });
  const sourceRoot = process.cwd();
  const root = path.join(directory, 'inert-candidate');
  fs.mkdirSync(root, { mode: 0o700 });
  for (const relative of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tests/e2e/i18n/mobile-navigation-observer.ts',
    'scripts/e2e/mobile-navigation-diagnostic.cjs',
  ]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), target);
  }
  const environmentPath = path.join(directory, 'environment.json');
  const manifestPath = path.join(directory, 'candidate-manifest.json');
  const environment = {
    kind: 'tiangong-next-release-e2e-environment',
    schemaVersion: 1,
    workdir: root,
    outputPath: outputDirectory,
    candidateManifestPath: manifestPath,
    environmentContractPath: environmentPath,
  };
  const environmentRaw = JSON.stringify(environment);
  fs.writeFileSync(environmentPath, environmentRaw);
  fs.mkdirSync(path.join(root, 'docker/e2e'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docker/e2e/environment.json'), environmentRaw);
  const manifest = {
    kind: 'tiangong-next-release-e2e-candidate',
    schemaVersion: 6,
    repository: { canonical: 'tiangong-lca/platform', packageName: 'tiangong-lca-next' },
    environment: { frontendTarget: 'qualification', contractSha256: hash(environmentRaw) },
    candidate: {
      commit: '1'.repeat(40),
      tree: '2'.repeat(40),
      archiveSha256: '3'.repeat(64),
      evidenceIdentity: { observedHeadCommit: '1'.repeat(40) },
      packageJsonSha256: hash(fs.readFileSync(path.join(root, 'package.json'))),
      dependencyLockSha256: hash(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))),
      pnpmWorkspaceSha256: hash(fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'))),
    },
    sources: { e2eTree: '5'.repeat(40), containerRunnerTree: '6'.repeat(40) },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const env = {
    E2E_QUALIFICATION: 'true',
    E2E_RELEASE_MODE: 'true',
    E2E_ALLOW_PRODUCTION_DATA: 'false',
    E2E_WRITE_VERIFIED_EVIDENCE: 'false',
    E2E_CANDIDATE_MANIFEST_PATH: manifestPath,
    E2E_ENVIRONMENT_CONTRACT_PATH: environmentPath,
  };
  return {
    directory,
    outputDirectory,
    root,
    environmentPath,
    manifestPath,
    environment,
    manifest,
    env,
  };
}
