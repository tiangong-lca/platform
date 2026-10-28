#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import staticServer from '../e2e/static-server.cjs';

const repository = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const bindingKeys = [
  'GIT_CONFIG',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
];
const gitEnvironment = { ...process.env };
for (const key of bindingKeys) delete gitEnvironment[key];
gitEnvironment.GIT_WORK_TREE = repository;
function fail(message) {
  throw new Error(message);
}
function git(...args) {
  try {
    return execFileSync(
      'git',
      ['-C', repository, '--work-tree', repository, '-c', 'core.bare=false', ...args],
      { env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    fail('Cannot read the bound candidate repository');
  }
}
function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function snapshot() {
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    tree: git('rev-parse', 'HEAD^{tree}').trim(),
    status: git('status', '--porcelain', '--untracked-files=all').trim(),
    lockSha256: digest(fs.readFileSync(path.join(repository, 'pnpm-lock.yaml'))),
  };
}
function requireUnchanged(initial) {
  const current = snapshot();
  if (
    current.commit !== initial.commit ||
    current.tree !== initial.tree ||
    current.status ||
    current.lockSha256 !== initial.lockSha256
  )
    fail('Candidate changed while building');
}
function readPinnedEnvironment() {
  let values;
  let text;
  try {
    text = git('show', 'HEAD:.env');
    values = parseEnv(text);
  } catch {
    fail('Cannot read the committed main environment');
  }
  try {
    const upstream = new URL(values.SUPABASE_URL);
    if (
      upstream.protocol !== 'https:' ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== '/' ||
      upstream.search ||
      upstream.hash ||
      !values.SUPABASE_PUBLISHABLE_KEY
    )
      fail('Invalid pinned main environment');
  } catch {
    fail('Invalid pinned main environment');
  }
  if (values.APP_RUNTIME_CONFIG_ENABLED?.trim().toLowerCase() === 'false')
    fail('Committed main environment disables runtime admission');
  return { values, text };
}

function requireNoLocalDotenv() {
  // Installed @umijs/core 4.7.9 service/env.js loads exactly .env then .env.local,
  // with ignoreProcessEnv:true before assigning every parsed key to process.env.
  // The product main resolver likewise reads .env and .env.local only.
  if (fs.existsSync(path.join(repository, '.env.local')))
    fail('Local dotenv overrides are not eligible for a committed candidate');
}
function buildEnvironment(overrides) {
  const environment = { ...gitEnvironment };
  for (const key of Object.keys(environment)) {
    if (
      /^(?:APP_|UMI_|REACT_APP_)/u.test(key) ||
      ['NODE_ENV', 'MOCK', 'SOCKET_SERVER', 'HMR', 'ERROR_OVERLAY', 'PORT', 'HOST'].includes(key)
    )
      delete environment[key];
  }
  return { ...environment, ...overrides };
}
function sourceDigest(sourceRoot, trackedPaths) {
  const hash = crypto.createHash('sha256');
  for (const relative of trackedPaths) {
    const filename = path.join(sourceRoot, relative);
    const entry = fs.lstatSync(filename);
    hash.update(`${relative}\0`);
    if (entry.isSymbolicLink()) hash.update(`link\0${fs.readlinkSync(filename)}\0`);
    else if (entry.isFile()) hash.update(fs.readFileSync(filename));
    else fail('Exported source contains an unexpected tracked entry');
  }
  return hash.digest('hex');
}
function verifyBundleTarget(root, appOrigin, upstreamOrigin) {
  let gatewayPresent = false;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const script = fs.readFileSync(filename, 'utf8');
        gatewayPresent ||= script.includes(appOrigin);
        if (script.includes(upstreamOrigin))
          fail('Built JavaScript still contains the pinned remote backend');
      }
    }
  };
  visit(root);
  if (!gatewayPresent) fail('Built JavaScript does not contain the capture gateway');
}
function ignored(filename) {
  const result = spawnSync(
    'git',
    [
      '-C',
      repository,
      '--work-tree',
      repository,
      '-c',
      'core.bare=false',
      'check-ignore',
      '-q',
      '--',
      filename,
    ],
    { env: gitEnvironment, stdio: 'ignore' },
  );
  return result.status === 0;
}
function lockFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) lockFiles(filename);
    else if (entry.isFile()) fs.chmodSync(filename, 0o444);
    else fail('Candidate bundle contains a non-file entry');
  }
  fs.chmodSync(directory, 0o555);
}

function main() {
  const receiptPath = process.env.PROCESS_CAPTURE_BUILD_RECEIPT;
  if (!receiptPath || !path.isAbsolute(receiptPath) || fs.existsSync(receiptPath))
    fail('Receipt must be a new absolute path');
  const portText = process.env.PROCESS_CAPTURE_APP_PORT;
  if (!/^[1-9]\d{0,4}$/u.test(portText ?? '') || Number(portText) > 65535)
    fail('A fixed valid app port is required');
  const appOrigin = `http://127.0.0.1:${Number(portText)}`;
  const initial = snapshot();
  if (initial.status) fail('Build requires a clean committed candidate');
  requireNoLocalDotenv();
  if (initial.lockSha256 !== digest(git('show', 'HEAD:pnpm-lock.yaml')))
    fail('Working lockfile differs from the committed candidate');
  const nodeVersion = process.versions.node;
  const requiredNode = git('show', 'HEAD:.nvmrc').trim().replace(/^v/u, '');
  if (nodeVersion !== requiredNode) fail('Node version differs from the repository pin');
  const manifest = JSON.parse(git('show', 'HEAD:package.json'));
  const requiredPnpm = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(manifest.packageManager)?.[1];
  if (!requiredPnpm) fail('Package manager must be an exact stable pnpm version');
  let pnpmVersion;
  try {
    pnpmVersion = execFileSync('pnpm', ['--version'], {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail('Cannot verify pnpm');
  }
  if (pnpmVersion !== requiredPnpm) fail('pnpm version differs from the repository pin');
  const pinned = readPinnedEnvironment();
  const receiptParent = fs.realpathSync(path.dirname(receiptPath));
  const resolvedReceipt = path.join(receiptParent, path.basename(receiptPath));
  if (
    (resolvedReceipt === repository || resolvedReceipt.startsWith(`${repository}${path.sep}`)) &&
    !ignored(resolvedReceipt)
  )
    fail('Repository receipt must be ignored');
  const bundleBase = path.join(repository, '.local/e2e-release/process-capture');
  if (!ignored(path.join(bundleBase, 'candidate-probe/dist/index.html')))
    fail('Private candidate bundles must be ignored');
  fs.mkdirSync(bundleBase, { recursive: true });
  if (!fs.realpathSync(bundleBase).startsWith(`${repository}${path.sep}`))
    fail('Bundle storage escaped the repository');
  const uniqueRoot = fs.mkdtempSync(path.join(bundleBase, 'candidate-'));
  const sourceRoot = path.join(uniqueRoot, 'source');
  fs.mkdirSync(sourceRoot);
  const archive = path.join(uniqueRoot, 'source.tar');
  git('archive', '--format=tar', `--output=${archive}`, initial.commit);
  execFileSync('tar', ['-xf', archive, '-C', sourceRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  fs.unlinkSync(archive);
  const overrides = {
    NODE_ENV: 'production',
    REACT_APP_ENV: 'main',
    APP_BRAND: 'tiangong',
    APP_RUNTIME_CONFIG_ENABLED: 'true',
    MOCK: 'none',
    UMI_ENV: '',
    SUPABASE_URL: appOrigin,
    SUPABASE_PUBLISHABLE_KEY: pinned.values.SUPABASE_PUBLISHABLE_KEY,
  };
  const effectiveEnvironment = `${pinned.text}\n${Object.entries(overrides)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n')}\n`;
  fs.writeFileSync(path.join(sourceRoot, '.env'), effectiveEnvironment, { mode: 0o600 });
  fs.chmodSync(path.join(sourceRoot, '.env'), 0o600);
  const buildProfile = {
    version: 1,
    backend: 'loopback-capture',
    environment: 'main',
    brand: 'tiangong',
    runtimeConfigEnabled: true,
    sourceEnvironmentSha256: digest(pinned.text),
    effectiveEnvironmentSha256: digest(effectiveEnvironment),
  };
  const trackedPaths = git('ls-tree', '-rz', '--name-only', initial.commit)
    .split('\0')
    .filter(Boolean);
  const sourceIdentity = sourceDigest(sourceRoot, trackedPaths);
  const childEnvironment = buildEnvironment(overrides);
  // The archive owns its install. pnpm must never repair/remove the source
  // checkout's modules through a symlink or discover its Git repository.
  delete childEnvironment.GIT_WORK_TREE;
  childEnvironment.GIT_CEILING_DIRECTORIES = path.dirname(sourceRoot);
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile', '--offline', '--prod=false'], {
    cwd: sourceRoot,
    env: childEnvironment,
    stdio: 'inherit',
  });
  if (install.error || install.status !== 0)
    fail('Isolated frozen install failed; no receipt was written');
  requireUnchanged(initial);
  if (sourceDigest(sourceRoot, trackedPaths) !== sourceIdentity)
    fail('Exported candidate source changed while installing');
  const build = spawnSync('pnpm', ['build'], {
    cwd: sourceRoot,
    env: childEnvironment,
    stdio: 'inherit',
  });
  if (build.error || build.status !== 0) fail('Production build failed; no receipt was written');
  requireNoLocalDotenv();
  requireUnchanged(initial);
  if (sourceDigest(sourceRoot, trackedPaths) !== sourceIdentity)
    fail('Exported candidate source changed while building');
  const dist = path.join(sourceRoot, 'dist');
  if (!fs.lstatSync(dist).isDirectory() || !fs.statSync(path.join(dist, 'index.html')).isFile())
    fail('Build did not produce the application shell');
  const bundleSha256 = staticServer.bundleDigest(dist);
  verifyBundleTarget(dist, appOrigin, new URL(pinned.values.SUPABASE_URL).origin);
  const bundleRoot = path.join(uniqueRoot, 'dist');
  fs.cpSync(dist, bundleRoot, { recursive: true, force: false, errorOnExist: true });
  if (staticServer.bundleDigest(bundleRoot) !== bundleSha256) fail('Copied bundle digest differs');
  lockFiles(bundleRoot);
  requireUnchanged(initial);
  const receipt = {
    schemaVersion: 'platform.process-capture-build.v1',
    candidate: { commit: initial.commit, tree: initial.tree, packageVersion: manifest.version },
    appOrigin,
    pnpmLockSha256: initial.lockSha256,
    nodeVersion,
    pnpmVersion,
    bundleSha256,
    bundleRoot,
    buildProfile,
  };
  fs.writeFileSync(resolvedReceipt, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify({ receiptPath: resolvedReceipt, candidate: receipt.candidate, bundleSha256 })}\n`,
  );
}

try {
  main();
} catch (error) {
  // Keep native child-process errors and environment parser input out of diagnostics.
  const safeMessages = [
    'Cannot read the bound candidate repository',
    'Candidate changed while building',
    'Cannot read the committed main environment',
    'Invalid pinned main environment',
    'Committed main environment disables runtime admission',
    'Local dotenv overrides are not eligible for a committed candidate',
    'Exported source contains an unexpected tracked entry',
    'Exported candidate source changed while building',
    'Built JavaScript still contains the pinned remote backend',
    'Built JavaScript does not contain the capture gateway',
    'Receipt must be a new absolute path',
    'A fixed valid app port is required',
    'Build requires a clean committed candidate',
    'Working lockfile differs from the committed candidate',
    'Node version differs from the repository pin',
    'Package manager must be an exact stable pnpm version',
    'Cannot verify pnpm',
    'pnpm version differs from the repository pin',
    'Repository receipt must be ignored',
    'Production build failed; no receipt was written',
    'Isolated frozen install failed; no receipt was written',
    'Exported candidate source changed while installing',
    'Build did not produce the application shell',
    'Private candidate bundles must be ignored',
    'Bundle storage escaped the repository',
    'Copied bundle digest differs',
    'Candidate bundle contains a non-file entry',
  ];
  process.stderr.write(
    `Process capture build refused: ${safeMessages.includes(error.message) ? error.message : 'Candidate preparation failed'}\n`,
  );
  process.exitCode = 1;
}
