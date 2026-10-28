import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  createBuildFixture,
  disposeBuildFixture,
  fixtureGit,
  runBuildFixture,
} from './process-capture-build-contract.test.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
async function fixture() {
  const value = createBuildFixture();
  const listener = http.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  value.env.PROCESS_CAPTURE_APP_PORT = String(listener.address().port);
  await new Promise((resolve) => listener.close(resolve));
  for (const name of ['process-capture-start.mjs', 'process-capture-server.cjs'])
    fs.copyFileSync(
      path.join(sourceRoot, 'scripts/qualification', name),
      path.join(value.repo, 'scripts/qualification', name),
    );
  fs.appendFileSync(path.join(value.repo, '.gitignore'), 'node_modules\ntests\n');
  fs.symlinkSync(
    path.join(sourceRoot, 'node_modules'),
    path.join(value.repo, 'node_modules'),
    'dir',
  );
  fs.symlinkSync(path.join(sourceRoot, 'tests'), path.join(value.repo, 'tests'), 'dir');
  fixtureGit(value, 'add', '.');
  fixtureGit(value, 'commit', '-qm', 'launcher');
  const result = runBuildFixture(value);
  assert.equal(result.status, 0, result.stderr);
  value.env.PROCESS_CAPTURE_OUTPUT = path.join(value.temporary, 'payload.json');
  value.env.PROCESS_CAPTURE_PARENT_PORT = '0';
  value.env.PROCESS_CAPTURE_PROCESS_ID = '11111111-1111-4111-8111-111111111111';
  value.env.PROCESS_CAPTURE_SOURCE_VERSION = '01.00.000';
  return value;
}
const args = (value) => [
  '--import',
  'tsx',
  path.join(value.repo, 'scripts/qualification/process-capture-start.mjs'),
];
function refused(value, overrides = {}) {
  const result = spawnSync(process.execPath, args(value), {
    cwd: value.repo,
    env: { ...value.env, ...overrides },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes('parentOrigin'));
  assert.ok(!(result.stdout + result.stderr).includes('fixture-key-never-in-receipt'));
  assert.equal(fs.existsSync(value.env.PROCESS_CAPTURE_OUTPUT), false);
}

test('launches the exact copied bundle through a separate loopback sandbox and closes every server', async () => {
  const value = await fixture();
  let child;
  try {
    child = spawn(process.execPath, args(value), {
      cwd: value.repo,
      env: { ...value.env, GIT_DIR: '/foreign/nonexistent.git', GIT_WORK_TREE: '/foreign' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const identity = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Launcher did not become ready'));
      }, 10_000);
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error(stderr));
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        const line = stdout.split('\n').find((entry) => entry.includes('parentOrigin'));
        if (line) {
          clearTimeout(timeout);
          resolve(JSON.parse(line));
        }
      });
    });
    const receipt = JSON.parse(fs.readFileSync(value.receipt, 'utf8'));
    assert.equal(identity.sourceCommit, receipt.candidate.commit);
    assert.equal(identity.sourceTree, receipt.candidate.tree);
    assert.equal(identity.bundleSha256, receipt.bundleSha256);
    for (const name of ['parentOrigin', 'appOrigin', 'frontendOrigin'])
      assert.equal(new URL(identity[name]).hostname, '127.0.0.1');
    assert.notEqual(identity.parentOrigin, identity.appOrigin);
    assert.match(
      await (await fetch(identity.parentOrigin)).text(),
      /sandbox="allow-scripts allow-same-origin allow-forms"/,
    );
    assert.equal(
      (await fetch(identity.appOrigin, { headers: { 'sec-fetch-dest': 'document' } })).status,
      403,
    );
    const ready = await (await fetch(`${identity.frontendOrigin}/__tiangong_e2e__/ready`)).json();
    assert.equal(ready.bundleSha256, receipt.bundleSha256);
    assert.equal(ready.candidateCommit, receipt.candidate.commit);
    const status = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Status signal did not return')), 3000);
      child.stdout.on('data', () => {
        const line = stdout
          .split('\n')
          .slice(0, -1)
          .find((entry) => entry.includes('"event":"status"'));
        if (line) {
          clearTimeout(timeout);
          resolve(JSON.parse(line));
        }
      });
    });
    child.kill('SIGUSR2');
    const reported = await status;
    assert.equal(reported.summary.businessMutationDispatches, 0);
    assert.equal(reported.summary.authDispatches, 0);
    const exit = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exit;
    assert.ok(!(stdout + stderr).includes('fixture-key-never-in-receipt'));
    assert.equal(fs.existsSync(value.env.PROCESS_CAPTURE_OUTPUT), false);
    for (const name of ['parentOrigin', 'appOrigin', 'frontendOrigin'])
      await assert.rejects(fetch(identity[name]));
  } finally {
    child?.kill('SIGKILL');
    disposeBuildFixture(value);
  }
});

test('rejects modified source, receipt identity and bundle bytes before serving', async () => {
  const value = await fixture();
  try {
    const receipt = JSON.parse(fs.readFileSync(value.receipt, 'utf8'));
    for (const change of [
      { candidate: { ...receipt.candidate, commit: '0'.repeat(40) } },
      { appOrigin: 'http://127.0.0.1:1' },
      { pnpmLockSha256: '0'.repeat(64) },
      { nodeVersion: '0.0.1' },
      { pnpmVersion: '0.0.1' },
      { bundleSha256: '0'.repeat(64) },
      { buildProfile: { ...receipt.buildProfile, runtimeConfigEnabled: false } },
      { buildProfile: { ...receipt.buildProfile, sourceEnvironmentSha256: '0'.repeat(64) } },
      { buildProfile: { ...receipt.buildProfile, effectiveEnvironmentSha256: '0'.repeat(64) } },
      { bundleRoot: path.join(value.repo, 'dist') },
    ]) {
      fs.writeFileSync(value.receipt, JSON.stringify({ ...receipt, ...change }));
      refused(value);
    }
    fs.writeFileSync(value.receipt, JSON.stringify(receipt));
    refused(value, { PROCESS_CAPTURE_UPSTREAM_ORIGIN: 'https://wrong.example.invalid' });
    fs.writeFileSync(path.join(value.repo, 'tracked.txt'), 'dirty');
    refused(value);
    fixtureGit(value, 'checkout', '--', 'tracked.txt');
    const bundleFile = path.join(receipt.bundleRoot, 'umi.js');
    fs.chmodSync(bundleFile, 0o644);
    fs.writeFileSync(bundleFile, 'tampered');
    refused(value);
  } finally {
    disposeBuildFixture(value);
  }
});
