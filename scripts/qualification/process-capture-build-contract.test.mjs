import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import crypto from 'node:crypto';
import staticServer from '../e2e/static-server.cjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
export function fixtureGit(fixture, ...args) {
  return execFileSync('git', ['-C', fixture.repo, ...args], {
    env: fixture.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export function createBuildFixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'process-capture-build-'));
  const repo = path.join(temporary, 'repo');
  const tools = path.join(temporary, 'tools');
  fs.mkdirSync(repo);
  fs.mkdirSync(tools);
  const env = {
    ...process.env,
    PATH: `${tools}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
    PROCESS_CAPTURE_APP_PORT: '62661',
    PROCESS_CAPTURE_BUILD_RECEIPT: path.join(temporary, 'receipt.json'),
  };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const fixture = { temporary, repo, tools, env, receipt: env.PROCESS_CAPTURE_BUILD_RECEIPT };
  env.FAKE_ORIGINAL_REPO = repo;
  for (const relative of [
    'scripts/qualification/process-capture-build.mjs',
    'scripts/e2e/static-server.cjs',
  ]) {
    fs.mkdirSync(path.dirname(path.join(repo, relative)), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), path.join(repo, relative));
  }
  fs.writeFileSync(path.join(repo, '.nvmrc'), `${process.versions.node}\n`);
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    `${JSON.stringify({ name: 'capture-build-fixture', version: '0.0.1', packageManager: 'pnpm@11.24.0', scripts: { build: 'fake-build' } })}\n`,
  );
  fs.writeFileSync(
    path.join(repo, '.env'),
    'SUPABASE_URL=https://backend.example.invalid\nSUPABASE_PUBLISHABLE_KEY=fixture-key-never-in-receipt\n',
  );
  fs.writeFileSync(path.join(repo, '.gitignore'), 'dist/\n.local/\n.env.local\n');
  fs.writeFileSync(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'source\n');
  fs.writeFileSync(
    path.join(tools, 'pnpm'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const { parseEnv } = require('node:util');
const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write(process.env.FAKE_PNPM_VERSION || '11.24.0'); process.exit(0); }
if (args[0] === 'install') {
  if (args.join(' ') !== 'install --frozen-lockfile --offline --prod=false' || process.env.GIT_WORK_TREE) process.exit(9);
  if (process.env.FAKE_BUILD_MODE === 'installfail') process.exit(7);
  fs.mkdirSync('node_modules', {recursive:true});
  fs.writeFileSync('node_modules/fixture-installed', 'frozen');
  process.exit(0);
}
if (args.join(' ') !== 'build') process.exit(9);
if (!fs.existsSync('node_modules/fixture-installed') || fs.lstatSync('node_modules').isSymbolicLink()) process.exit(9);
if (process.env.FAKE_BUILD_MODE === 'fail') process.exit(7);
// Match installed Umi4.7.9: .env then .env.local overwrite even explicit process values.
for (const file of ['.env', '.env.local']) if (fs.existsSync(file)) Object.assign(process.env, parseEnv(fs.readFileSync(file, 'utf8')));
if (process.env.REACT_APP_ENV !== 'main' || process.env.APP_BRAND !== 'tiangong' || process.env.SUPABASE_URL !== 'http://127.0.0.1:' + process.env.PROCESS_CAPTURE_APP_PORT || process.env.SUPABASE_PUBLISHABLE_KEY !== 'fixture-key-never-in-receipt') process.exit(8);
if (process.env.APP_RUNTIME_CONFIG_ENABLED !== 'true' || process.env.MOCK !== 'none' || process.env.UMI_ENV !== '' || process.env.UMI_APP_PRIVATE || process.env.APP_LAYOUT || process.env.SOCKET_SERVER) process.exit(8);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', '<!doctype html><script src="/umi.js"></script>');
fs.writeFileSync('dist/umi.js', 'const capturedConfiguration=' + JSON.stringify({supabaseUrl:process.env.SUPABASE_URL,runtimeConfigEnabled:process.env.APP_RUNTIME_CONFIG_ENABLED}) + ';');
const original = process.env.FAKE_ORIGINAL_REPO;
if (process.env.FAKE_BUILD_MODE === 'dirty') fs.writeFileSync(path.join(original,'tracked.txt'), 'changed');
if (process.env.FAKE_BUILD_MODE === 'lock') fs.appendFileSync(path.join(original,'pnpm-lock.yaml'), '#changed');
if (process.env.FAKE_BUILD_MODE === 'head') { fs.writeFileSync(path.join(original,'tracked.txt'), 'new revision'); cp.execFileSync('git', ['add', 'tracked.txt'],{cwd:original}); cp.execFileSync('git', ['commit', '-qm', 'drift'],{cwd:original}); }
if (process.env.FAKE_BUILD_MODE === 'symlink') fs.symlinkSync('../tracked.txt', 'dist/unsafe');
if (process.env.FAKE_BUILD_MODE === 'source') fs.writeFileSync('tracked.txt', 'changed exported source');
if (process.env.FAKE_BUILD_MODE === 'remote') fs.writeFileSync('dist/umi.js', 'const supabaseUrl="https://backend.example.invalid"');
if (process.env.FAKE_BUILD_MODE === 'nogateway') fs.writeFileSync('dist/umi.js', '/* missing target */');
if (process.env.FAKE_BUILD_MODE === 'localdotenv') fs.writeFileSync(path.join(original,'.env.local'), 'APP_RUNTIME_CONFIG_ENABLED=false');
`,
    { mode: 0o755 },
  );
  fixtureGit(fixture, 'init', '-q', '-b', 'main');
  fixtureGit(fixture, 'config', 'user.email', 'fixture@example.invalid');
  fixtureGit(fixture, 'config', 'user.name', 'Fixture');
  fixtureGit(fixture, 'add', '.');
  fixtureGit(fixture, 'commit', '-qm', 'fixture');
  return fixture;
}
export function runBuildFixture(fixture, overrides = {}) {
  return spawnSync(
    process.execPath,
    [path.join(fixture.repo, 'scripts/qualification/process-capture-build.mjs')],
    {
      cwd: fixture.temporary,
      env: { ...fixture.env, ...overrides },
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
}
export function disposeBuildFixture(fixture) {
  const unlock = (directory) => {
    fs.chmodSync(directory, 0o755);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
      if (entry.isDirectory()) unlock(path.join(directory, entry.name));
  };
  unlock(fixture.temporary);
  fs.rmSync(fixture.temporary, { recursive: true, force: true });
}

// Exported fixtures may be reused by launcher contracts without registering this suite twice.
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  test('builds one private pinned bundle and records exact identities without credentials', () => {
    const fixture = createBuildFixture();
    try {
      const before = fixtureGit(fixture, 'rev-parse', 'HEAD');
      const result = runBuildFixture(fixture);
      assert.equal(result.status, 0, result.stderr);
      const receipt = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
      assert.deepEqual(Object.keys(receipt).sort(), [
        'appOrigin',
        'buildProfile',
        'bundleRoot',
        'bundleSha256',
        'candidate',
        'nodeVersion',
        'pnpmLockSha256',
        'pnpmVersion',
        'schemaVersion',
      ]);
      assert.equal(receipt.schemaVersion, 'platform.process-capture-build.v1');
      assert.deepEqual(receipt.candidate, {
        commit: before,
        tree: fixtureGit(fixture, 'rev-parse', 'HEAD^{tree}'),
        packageVersion: '0.0.1',
      });
      assert.equal(receipt.appOrigin, 'http://127.0.0.1:62661');
      assert.equal(receipt.nodeVersion, process.versions.node);
      assert.equal(receipt.pnpmVersion, '11.24.0');
      const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
      assert.deepEqual(receipt.buildProfile, {
        version: 1,
        backend: 'loopback-capture',
        environment: 'main',
        brand: 'tiangong',
        runtimeConfigEnabled: true,
        sourceEnvironmentSha256: hash(fs.readFileSync(path.join(fixture.repo, '.env'))),
        effectiveEnvironmentSha256: hash(
          fs.readFileSync(path.join(path.dirname(receipt.bundleRoot), 'source/.env')),
        ),
      });
      const script = fs.readFileSync(path.join(receipt.bundleRoot, 'umi.js'), 'utf8');
      assert.ok(script.includes(receipt.appOrigin));
      assert.ok(!script.includes('backend.example.invalid'));
      assert.equal(receipt.bundleSha256, staticServer.bundleDigest(receipt.bundleRoot));
      assert.ok(
        receipt.bundleRoot.startsWith(
          path.join(fs.realpathSync(fixture.repo), '.local/e2e-release/process-capture/candidate-'),
        ),
      );
      assert.equal(fixtureGit(fixture, 'status', '--porcelain'), '');
      assert.equal(fs.statSync(path.join(receipt.bundleRoot, 'umi.js')).mode & 0o777, 0o444);
      assert.equal(fs.statSync(fixture.receipt).mode & 0o777, 0o600);
      for (const value of ['fixture-key-never-in-receipt', 'backend.example.invalid']) {
        assert.ok(!JSON.stringify(receipt).includes(value));
        assert.ok(!(result.stdout + result.stderr).includes(value));
      }
      fs.writeFileSync(
        path.join(path.dirname(receipt.bundleRoot), 'source/dist/umi.js'),
        'changed source dist',
      );
      assert.equal(receipt.bundleSha256, staticServer.bundleDigest(receipt.bundleRoot));
      const repeated = runBuildFixture(fixture);
      assert.notEqual(repeated.status, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(fixture.receipt, 'utf8')), receipt);
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  for (const mode of [
    'fail',
    'installfail',
    'dirty',
    'lock',
    'head',
    'symlink',
    'source',
    'remote',
    'nogateway',
    'localdotenv',
  ])
    test(`build ${mode} refuses receipt`, () => {
      const fixture = createBuildFixture();
      try {
        const result = runBuildFixture(fixture, { FAKE_BUILD_MODE: mode });
        assert.notEqual(result.status, 0);
        assert.equal(fs.existsSync(fixture.receipt), false);
      } finally {
        disposeBuildFixture(fixture);
      }
    });
  for (const port of ['0', '65536', '-1', '8000x', '08000', ''])
    test(`invalid port ${port} refuses before build`, () => {
      const fixture = createBuildFixture();
      try {
        assert.notEqual(runBuildFixture(fixture, { PROCESS_CAPTURE_APP_PORT: port }).status, 0);
        assert.equal(fs.existsSync(fixture.receipt), false);
        assert.equal(fs.existsSync(path.join(fixture.repo, 'dist')), false);
      } finally {
        disposeBuildFixture(fixture);
      }
    });
  test('wrong pnpm, dirty source and wrong Node each fail before bundle creation', () => {
    const fixture = createBuildFixture();
    try {
      assert.notEqual(runBuildFixture(fixture, { FAKE_PNPM_VERSION: '11.23.0' }).status, 0);
      assert.equal(fs.existsSync(fixture.receipt), false);
      fs.writeFileSync(path.join(fixture.repo, 'tracked.txt'), 'dirty');
      assert.notEqual(runBuildFixture(fixture).status, 0);
      fixtureGit(fixture, 'checkout', '--', 'tracked.txt');
      fs.writeFileSync(path.join(fixture.repo, '.nvmrc'), '0.0.1\n');
      fixtureGit(fixture, 'add', '.nvmrc');
      fixtureGit(fixture, 'commit', '-qm', 'wrong node');
      assert.notEqual(runBuildFixture(fixture).status, 0);
      assert.equal(fs.existsSync(path.join(fixture.repo, 'dist')), false);
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  test('uses script-owned repo and committed environment even with inherited foreign Git bindings', () => {
    const fixture = createBuildFixture();
    try {
      const result = runBuildFixture(fixture, {
        GIT_DIR: '/nonexistent/foreign.git',
        GIT_WORK_TREE: '/nonexistent/foreign',
        SUPABASE_URL: 'https://wrong.example.invalid',
        SUPABASE_PUBLISHABLE_KEY: 'wrong',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        JSON.parse(fs.readFileSync(fixture.receipt, 'utf8')).candidate.commit,
        fixtureGit(fixture, 'rev-parse', 'HEAD'),
      );
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  test('second successful build uses a new copied bundle and exclusive receipt', () => {
    const fixture = createBuildFixture();
    try {
      assert.equal(runBuildFixture(fixture).status, 0);
      const first = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
      const secondReceipt = path.join(fixture.temporary, 'second.json');
      assert.equal(
        runBuildFixture(fixture, { PROCESS_CAPTURE_BUILD_RECEIPT: secondReceipt }).status,
        0,
      );
      const second = JSON.parse(fs.readFileSync(secondReceipt, 'utf8'));
      assert.notEqual(second.bundleRoot, first.bundleRoot);
      assert.equal(second.bundleSha256, first.bundleSha256);
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  test('neutralizes ambient frontend overrides while retaining normal runtime admission', () => {
    const fixture = createBuildFixture();
    try {
      const result = runBuildFixture(fixture, {
        APP_RUNTIME_CONFIG_ENABLED: 'false',
        APP_LAYOUT: 'top',
        UMI_APP_PRIVATE: 'ambient-private-value',
        UMI_ENV: 'development',
        REACT_APP_ENV: 'qualification',
        APP_BRAND: 'atlas',
        MOCK: 'all',
        SOCKET_SERVER: 'https://socket.example.invalid',
        HMR: 'true',
        ERROR_OVERLAY: 'true',
        APP_ROOT: '/unrelated',
        UMI_PRESETS: '/unrelated/preset',
      });
      assert.equal(result.status, 0, result.stderr);
      const receipt = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
      assert.equal(receipt.buildProfile.runtimeConfigEnabled, true);
      const script = fs.readFileSync(path.join(receipt.bundleRoot, 'umi.js'), 'utf8');
      assert.ok(script.includes('"runtimeConfigEnabled":"true"'));
      assert.ok(!script.includes('ambient-private-value'));
      assert.ok(
        !(result.stdout + result.stderr + JSON.stringify(receipt)).includes(
          'ambient-private-value',
        ),
      );
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  test('refuses ignored .env.local before any candidate build', () => {
    const fixture = createBuildFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.repo, '.env.local'),
        'APP_RUNTIME_CONFIG_ENABLED=false\nUMI_APP_PRIVATE=local-private-value\n',
      );
      assert.equal(fixtureGit(fixture, 'status', '--porcelain'), '');
      const result = runBuildFixture(fixture);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('Local dotenv overrides'));
      assert.equal(fs.existsSync(fixture.receipt), false);
      assert.equal(
        fs.existsSync(path.join(fixture.repo, '.local/e2e-release/process-capture')),
        false,
      );
      assert.ok(!(result.stdout + result.stderr).includes('local-private-value'));
    } finally {
      disposeBuildFixture(fixture);
    }
  });
  test('refuses a committed main profile that disables runtime admission', () => {
    const fixture = createBuildFixture();
    try {
      fs.appendFileSync(path.join(fixture.repo, '.env'), 'APP_RUNTIME_CONFIG_ENABLED=false\n');
      fixtureGit(fixture, 'add', '.env');
      fixtureGit(fixture, 'commit', '-qm', 'disabled admission');
      const result = runBuildFixture(fixture);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes('disables runtime admission'));
      assert.equal(fs.existsSync(fixture.receipt), false);
    } finally {
      disposeBuildFixture(fixture);
    }
  });
}
