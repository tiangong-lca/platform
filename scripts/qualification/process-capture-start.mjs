// Run with the repository Node launcher: node --import tsx scripts/qualification/process-capture-start.mjs
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyProductionRequest } from '../../tests/e2e/i18n/production-request-guard.ts';
import server from './process-capture-server.cjs';
import staticCandidate from '../e2e/static-server.cjs';

const output = process.env.PROCESS_CAPTURE_OUTPUT;
if (!output || !path.isAbsolute(output))
  throw new Error('PROCESS_CAPTURE_OUTPUT must be an absolute private evidence path');
const repository = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const gitEnvironment = { ...process.env };
for (const key of [
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
])
  delete gitEnvironment[key];
gitEnvironment.GIT_WORK_TREE = repository;
const git = (...args) =>
  execFileSync(
    'git',
    ['-C', repository, '--work-tree', repository, '-c', 'core.bare=false', ...args],
    { env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
let pinnedMain;
let sourceEnvironment;
let sourceCommit;
let sourceTree;
try {
  sourceEnvironment = git('show', 'HEAD:.env');
  pinnedMain = parseEnv(sourceEnvironment);
  sourceCommit = git('rev-parse', 'HEAD').trim();
  sourceTree = git('rev-parse', 'HEAD^{tree}').trim();
  if (git('status', '--porcelain').trim()) {
    throw new Error('Uncommitted candidate');
  }
} catch {
  throw new Error('Capture requires a clean committed candidate and its tracked main environment');
}
if (
  new URL(pinnedMain.SUPABASE_URL).protocol !== 'https:' ||
  !pinnedMain.SUPABASE_PUBLISHABLE_KEY ||
  (process.env.PROCESS_CAPTURE_UPSTREAM_ORIGIN &&
    process.env.PROCESS_CAPTURE_UPSTREAM_ORIGIN !== pinnedMain.SUPABASE_URL) ||
  (process.env.PROCESS_CAPTURE_PUBLISHABLE_KEY &&
    process.env.PROCESS_CAPTURE_PUBLISHABLE_KEY !== pinnedMain.SUPABASE_PUBLISHABLE_KEY)
) {
  throw new Error('Capture upstream must match the committed main environment');
}
const outputParent = await realpath(path.dirname(output));
if (outputParent === repository || outputParent.startsWith(`${repository}${path.sep}`)) {
  throw new Error('Capture evidence must remain outside the repository');
}
const outputExists = await lstat(output).then(
  () => true,
  (error) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  },
);
if (outputExists)
  throw new Error('Capture output already exists; choose a new private evidence file');
const receiptPath = process.env.PROCESS_CAPTURE_BUILD_RECEIPT;
if (!receiptPath || !path.isAbsolute(receiptPath))
  throw new Error('A qualified capture build receipt is required');
const receiptText = await readFile(receiptPath, 'utf8');
const receipt = JSON.parse(receiptText);
const bundleRoot = await realpath(receipt.bundleRoot);
if (!bundleRoot.startsWith(`${repository}/.local/e2e-release/process-capture/`))
  throw new Error('Capture bundle must come from the isolated build directory');
const appPort = Number(process.env.PROCESS_CAPTURE_APP_PORT);
const appOrigin = `http://127.0.0.1:${appPort}`;
const effectiveEnvironment = `${sourceEnvironment}\n${Object.entries({
  NODE_ENV: 'production',
  REACT_APP_ENV: 'main',
  APP_BRAND: 'tiangong',
  APP_RUNTIME_CONFIG_ENABLED: 'true',
  MOCK: 'none',
  UMI_ENV: '',
  SUPABASE_URL: appOrigin,
  SUPABASE_PUBLISHABLE_KEY: pinnedMain.SUPABASE_PUBLISHABLE_KEY,
})
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  .join('\n')}\n`;
const expectedProfile = {
  version: 1,
  backend: 'loopback-capture',
  environment: 'main',
  brand: 'tiangong',
  runtimeConfigEnabled: true,
  sourceEnvironmentSha256: createHash('sha256').update(sourceEnvironment).digest('hex'),
  effectiveEnvironmentSha256: createHash('sha256').update(effectiveEnvironment).digest('hex'),
};
const packageMetadata = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
const lockSha256 = createHash('sha256')
  .update(await readFile(path.join(repository, 'pnpm-lock.yaml')))
  .digest('hex');
const expectedNode = (await readFile(path.join(repository, '.nvmrc'), 'utf8'))
  .trim()
  .replace(/^v/u, '');
if (
  !Number.isInteger(appPort) ||
  appPort < 1 ||
  appPort > 65535 ||
  receipt.schemaVersion !== 'platform.process-capture-build.v1' ||
  receipt.candidate?.commit !== sourceCommit ||
  receipt.candidate?.tree !== sourceTree ||
  receipt.candidate?.packageVersion !== packageMetadata.version ||
  receipt.appOrigin !== `http://127.0.0.1:${appPort}` ||
  !isDeepStrictEqual(receipt.buildProfile, expectedProfile) ||
  receipt.pnpmLockSha256 !== lockSha256 ||
  receipt.nodeVersion !== expectedNode ||
  process.versions.node !== expectedNode ||
  `pnpm@${receipt.pnpmVersion}` !== packageMetadata.packageManager ||
  !path.isAbsolute(receipt.bundleRoot ?? '') ||
  staticCandidate.bundleDigest(bundleRoot) !== receipt.bundleSha256
) {
  throw new Error('Capture build identity or bundle digest does not match the committed candidate');
}
const frontend = staticCandidate.createStaticCandidateServer({
  root: bundleRoot,
  manifest: receipt,
  manifestText: receiptText,
});
await new Promise((resolve, reject) => {
  frontend.server.once('error', reject);
  frontend.server.listen(
    Number(process.env.PROCESS_CAPTURE_FRONTEND_PORT ?? 0),
    '127.0.0.1',
    resolve,
  );
});
const frontendOrigin = `http://127.0.0.1:${frontend.server.address().port}`;
let runtime;
try {
  runtime = await server.startProcessCaptureServers({
    upstreamOrigin: pinnedMain.SUPABASE_URL,
    devOrigin: frontendOrigin,
    appPort,
    parentPort: Number(process.env.PROCESS_CAPTURE_PARENT_PORT),
    publishableKey: pinnedMain.SUPABASE_PUBLISHABLE_KEY,
    processId: process.env.PROCESS_CAPTURE_PROCESS_ID,
    sourceVersion: process.env.PROCESS_CAPTURE_SOURCE_VERSION,
    classifyRequest: classifyProductionRequest,
    onCapture: async ({ body }) => {
      await writeFile(output, body, { flag: 'wx', mode: 0o600 });
    },
    onCaptured: async ({ sha256, summary }) => {
      process.stdout.write(
        `${JSON.stringify({ event: 'captured-without-dispatch', sha256, summary })}\n`,
      );
    },
  });
} catch (error) {
  await new Promise((resolve) => {
    frontend.server.close(resolve);
    frontend.server.closeAllConnections();
  });
  throw error;
}
process.stdout.write(
  `${JSON.stringify({ sourceCommit, sourceTree, bundleSha256: frontend.identity.bundleSha256, parentOrigin: runtime.parentOrigin, appOrigin: runtime.appOrigin, frontendOrigin, upstreamOrigin: pinnedMain.SUPABASE_URL })}\n`,
);
process.on('SIGUSR2', () => {
  process.stdout.write(`${JSON.stringify({ event: 'status', summary: runtime.summary() })}\n`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    process.stdout.write(`${JSON.stringify({ event: 'closed', summary: runtime.summary() })}\n`);
    await runtime.close();
    await new Promise((resolve) => {
      frontend.server.close(resolve);
      frontend.server.closeAllConnections();
    });
    process.exit(0);
  });
