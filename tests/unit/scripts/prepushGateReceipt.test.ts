import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const receiptHelper = require('../../../scripts/prepush-gate-receipt.cjs') as {
  RECEIPT_RELATIVE_PATH: string;
  RECEIPT_TTL_MS: number;
  collectCheckpoint: (
    root: string,
    docpactBaseRef: string,
  ) => {
    checkpointVersion: number;
    gateInputsDigest: string;
    pnpmVersion: string;
    pnpmExecutableDigest: string;
    pnpmConfigDigest: string;
    pnpmWorkspaceDigest: string;
    pnpmLockDigest: string;
    installedPnpmLockDigest: string;
    installedModulesManifestDigest: string;
    installedDependencyTreeDigest: string;
  };
  dependencyTreeDigest: (source: string) => string;
  retryTransport: (root: string) => void;
  sha256: (value: string) => string;
};
const packageJson = require('../../../package.json') as { scripts: Record<string, string> };

type Fixture = {
  container: string;
  root: string;
  remote: string;
  receipt: string;
  gateLog: string;
  mainBase: string;
  devBase: string;
  head: string;
};

type FixtureSeed = Pick<Fixture, 'container' | 'root' | 'remote' | 'mainBase' | 'devBase' | 'head'>;

const LOCAL_GIT_ENVIRONMENT_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

const isolatedEnvironment = (overrides: Record<string, string> = {}) => {
  const environment = { ...process.env, ...overrides };
  LOCAL_GIT_ENVIRONMENT_KEYS.forEach((key) => delete environment[key]);
  return environment;
};

const inheritedLocalGitEnvironment = new Map(
  LOCAL_GIT_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]] as const),
);

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedEnvironment() }).trim();

const run = (cwd: string, command: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: isolatedEnvironment(env),
  });

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const writeExecutable = (filePath: string, source: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, { mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
};

const shellQuote = (value: string) => `'${value.replace(/'/gu, "'\\''")}'`;

const remoteSha = (fixture: Fixture, ref = 'refs/heads/main') => {
  const output = git(fixture.root, ['ls-remote', '--refs', 'origin', ref]);
  return output ? output.split(/\s+/u)[0] : '';
};

const createFixtureSeed = (): FixtureSeed => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'prepush-receipt-seed-'));
  const root = path.join(container, 'repo');
  const remote = path.join(container, 'remote.git');
  fs.mkdirSync(root);

  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Receipt Test']);
  git(root, ['config', 'user.email', 'receipt@example.test']);
  git(container, ['init', '--bare', remote]);

  const packageJsonFixture = {
    name: 'receipt-fixture',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@11.24.0',
    scripts: {
      'docpact:gate': 'node scripts/fake-gate.cjs docpact',
      'prepush:gate': 'node scripts/fake-gate.cjs prepush',
      'release:preflight': 'node scripts/fake-gate.cjs release-preflight',
      'push:checked': 'node scripts/prepush-gate-receipt.cjs checked-push',
      'push:retry': 'node scripts/prepush-gate-receipt.cjs retry',
    },
  };
  writeJson(path.join(root, 'package.json'), packageJsonFixture);
  fs.writeFileSync(
    path.join(root, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n\nimporters:\n  .: {}\n",
  );
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - '.'\n");
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\n/.local/prepush-gate/\n/.local/test-gates.log\n',
  );
  fs.writeFileSync(path.join(root, '.prettierignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(root, '.prettierrc.js'), 'module.exports = {};\n');
  for (const configPath of [
    '.oxlintrc.json',
    'jsconfig.json',
    'tsconfig.json',
    'tsconfig.electron.json',
  ]) {
    writeJson(path.join(root, configPath), {});
  }
  fs.writeFileSync(
    path.join(root, 'jest.config.cjs'),
    "module.exports = { testSequencer: '<rootDir>/scripts/jest-sequencer.cjs' };\n",
  );

  const scriptsDirectory = path.join(root, 'scripts');
  fs.mkdirSync(scriptsDirectory);
  fs.copyFileSync(
    path.join(process.cwd(), 'scripts/prepush-gate-receipt.cjs'),
    path.join(scriptsDirectory, 'prepush-gate-receipt.cjs'),
  );
  fs.copyFileSync(
    path.join(process.cwd(), 'scripts/jest-sequencer.cjs'),
    path.join(scriptsDirectory, 'jest-sequencer.cjs'),
  );
  writeExecutable(
    path.join(scriptsDirectory, 'fake-docpact'),
    "#!/bin/sh\nprintf 'docpact 0.1.9\\n'\n",
  );
  writeExecutable(
    path.join(scriptsDirectory, 'docpact'),
    '#!/bin/sh\nset -eu\nscript_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\n' +
      'if [ "${1:-}" = "--print-bin" ]; then printf "%s\\n" "$script_dir/fake-docpact"; exit 0; fi\n' +
      'exec "$script_dir/fake-docpact" "$@"\n',
  );
  fs.writeFileSync(
    path.join(scriptsDirectory, 'fake-gate.cjs'),
    [
      "'use strict';",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const root = process.cwd();',
      "const log = path.join(root, '.local/test-gates.log');",
      'fs.mkdirSync(path.dirname(log), { recursive: true });',
      'fs.appendFileSync(log, `${JSON.stringify({ gate: process.argv[2], args: process.argv.slice(3) })}\\n`);',
      "if (process.env.RECEIPT_TEST_REQUIRE_PRIVATE_SESSION === 'absent') {",
      '  if (process.env.TIANGONG_CHECKED_PUSH_SESSION_DIR || process.env.TIANGONG_CHECKED_PUSH_SESSION_NONCE) {',
      "    throw new Error('checked-push session credentials leaked into a gate subprocess');",
      '  }',
      '}',
      'if (process.env.RECEIPT_TEST_MUTATE_DURING_GATE === process.argv[2]) {',
      "  fs.appendFileSync(path.join(root, 'package.json'), '\\n');",
      '}',
      '',
    ].join('\n'),
  );

  const hookDirectory = path.join(root, '.husky');
  fs.mkdirSync(hookDirectory);
  fs.copyFileSync(
    path.join(process.cwd(), '.husky/pre-push'),
    path.join(hookDirectory, 'pre-push'),
  );
  fs.chmodSync(path.join(hookDirectory, 'pre-push'), 0o755);

  fs.mkdirSync(path.join(root, 'node_modules/.pnpm'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'pnpm-lock.yaml'),
    path.join(root, 'node_modules/.pnpm/lock.yaml'),
  );
  fs.writeFileSync(path.join(root, 'node_modules/.modules.yaml'), 'nodeLinker: isolated\n');
  fs.writeFileSync(path.join(root, 'node_modules/.receipt-dependency-fixture'), 'original\n');

  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'main baseline']);
  const mainBase = git(root, ['rev-parse', 'HEAD']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '--no-verify', 'origin', `${mainBase}:refs/heads/main`]);

  fs.writeFileSync(path.join(root, 'dev-baseline.txt'), 'dev baseline\n');
  git(root, ['add', 'dev-baseline.txt']);
  git(root, ['commit', '-m', 'dev baseline']);
  const devBase = git(root, ['rev-parse', 'HEAD']);
  git(root, ['push', '--no-verify', 'origin', `${devBase}:refs/heads/dev`]);

  fs.writeFileSync(path.join(root, 'delivery.txt'), 'delivery\n');
  git(root, ['add', 'delivery.txt']);
  git(root, ['commit', '-m', 'delivery']);
  const head = git(root, ['rev-parse', 'HEAD']);
  git(root, ['fetch', 'origin', 'main', 'dev']);
  git(root, ['update-ref', 'refs/heads/base', head]);
  git(root, ['config', 'core.hooksPath', '.husky']);

  return {
    container,
    root,
    remote,
    mainBase,
    devBase,
    head,
  };
};

let sharedFixtureSeed: FixtureSeed | undefined;

const createFixture = (): Fixture => {
  if (!sharedFixtureSeed) throw new Error('the shared receipt fixture seed is unavailable');

  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'prepush-receipt-'));
  const root = path.join(container, 'repo');
  const remote = path.join(container, 'remote.git');
  fs.cpSync(sharedFixtureSeed.root, root, { recursive: true });
  fs.cpSync(sharedFixtureSeed.remote, remote, { recursive: true });
  git(root, ['remote', 'set-url', 'origin', remote]);

  return {
    container,
    root,
    remote,
    receipt: path.join(root, receiptHelper.RECEIPT_RELATIVE_PATH),
    gateLog: path.join(root, '.local/test-gates.log'),
    mainBase: sharedFixtureSeed.mainBase,
    devBase: sharedFixtureSeed.devBase,
    head: sharedFixtureSeed.head,
  };
};

const readGateLog = (fixture: Fixture) => {
  if (!fs.existsSync(fixture.gateLog)) return [];
  return fs
    .readFileSync(fixture.gateLog, 'utf8')
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { gate: string; args: string[] });
};

const installRemoteRejection = (fixture: Fixture) => {
  writeExecutable(
    path.join(fixture.remote, 'hooks/pre-receive'),
    "#!/bin/sh\necho 'receipt test rejection' >&2\nexit 1\n",
  );
};

const removeRemoteRejection = (fixture: Fixture) => {
  fs.rmSync(path.join(fixture.remote, 'hooks/pre-receive'), { force: true });
};

const checkedPush = (
  fixture: Fixture,
  remoteRef = 'refs/heads/main',
  env: Record<string, string> = {},
  gateProfile?: string,
) => {
  const localRef = git(fixture.root, ['symbolic-ref', 'HEAD']);
  return run(
    fixture.root,
    'pnpm',
    [
      'run',
      'push:checked',
      ...(gateProfile ? ['--gate-profile', gateProfile] : []),
      'origin',
      `${localRef}:${remoteRef}`,
    ],
    env,
  );
};

const rawPush = (fixture: Fixture, remoteRef = 'refs/heads/main') => {
  const localRef = git(fixture.root, ['symbolic-ref', 'HEAD']);
  return run(fixture.root, 'git', ['push', 'origin', `${localRef}:${remoteRef}`]);
};

const prepareReleaseCandidate = (fixture: Fixture) => {
  git(fixture.root, ['switch', '-c', 'codex/issue-867-version-v1.0.1', 'refs/remotes/origin/dev']);
  const packagePath = path.join(fixture.root, 'package.json');
  const packageDocument = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageDocument.version = '1.0.1';
  writeJson(packagePath, packageDocument);
  git(fixture.root, ['add', 'package.json']);
  git(fixture.root, ['commit', '-m', 'prepare release candidate']);
};

const prepareImmutablePromotion = (fixture: Fixture) => {
  git(fixture.root, [
    'switch',
    '-c',
    'codex/promote-v1.0.0-dev-to-main-issue-867',
    'refs/remotes/origin/dev',
  ]);
};

const retryPush = (fixture: Fixture, args: string[] = []) =>
  run(fixture.root, 'pnpm', ['run', 'push:retry', ...args]);

const activateFailedTransportReceipt = (fixture: Fixture) => {
  installRemoteRejection(fixture);
  const result = checkedPush(fixture);
  expect(result.status).not.toBe(0);
  expect(result.stderr.split(/\r?\n/u)).toContain('Next: pnpm run push:retry');
  expect(fs.existsSync(fixture.receipt)).toBe(true);
  expect(remoteSha(fixture)).toBe(fixture.mainBase);
  removeRemoteRejection(fixture);
};

const rewriteReceipt = (fixture: Fixture, mutate: (receipt: Record<string, any>) => void) => {
  const receipt = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
  mutate(receipt);
  const payload = { ...receipt };
  delete payload.receiptDigest;
  receipt.receiptDigest = receiptHelper.sha256(JSON.stringify(payload));
  writeJson(fixture.receipt, receipt);
  fs.chmodSync(fixture.receipt, 0o600);
};

describe('bounded checked-push transport receipt', () => {
  const fixtures: Fixture[] = [];
  const originalGermanTitle = process.env.APP_TITLE_DE_DE;

  beforeAll(() => {
    LOCAL_GIT_ENVIRONMENT_KEYS.forEach((key) => delete process.env[key]);
    sharedFixtureSeed = createFixtureSeed();
  });

  afterAll(() => {
    if (sharedFixtureSeed) {
      fs.rmSync(sharedFixtureSeed.container, { recursive: true, force: true });
      sharedFixtureSeed = undefined;
    }
    inheritedLocalGitEnvironment.forEach((value, key) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  afterEach(() => {
    if (originalGermanTitle === undefined) delete process.env.APP_TITLE_DE_DE;
    else process.env.APP_TITLE_DE_DE = originalGermanTitle;
    while (fixtures.length > 0) {
      const current = fixtures.pop();
      if (current) fs.rmSync(current.container, { recursive: true, force: true });
    }
  });

  const fixture = () => {
    const value = createFixture();
    fixtures.push(value);
    return value;
  };

  it('keeps gate and retry activation inside repo-owned entrypoints', () => {
    const hook = fs.readFileSync(path.join(process.cwd(), '.husky/pre-push'), 'utf8');
    const fixtureEnvironment = isolatedEnvironment({
      GIT_DIR: '/outer/repository/.git',
      GIT_WORK_TREE: '/outer/repository',
    });

    expect(hook).toContain('prepush-gate-receipt.cjs hook-run');
    expect(hook).toContain('--docpact-base-override');
    expect(packageJson.scripts['push:checked']).toBe(
      'node scripts/prepush-gate-receipt.cjs checked-push',
    );
    expect(packageJson.scripts['push:retry']).toBe('node scripts/prepush-gate-receipt.cjs retry');
    expect(packageJson.scripts['test:prepush-receipt']).toBe(
      'cross-env NODE_OPTIONS=--max-old-space-size=8192 node scripts/test-runner.cjs --stage prepush-receipt --runInBand --runTestsByPath tests/unit/scripts/prepushGateReceipt.test.ts --testTimeout=20000 --no-coverage --no-watchman',
    );
    expect(packageJson.scripts['test:coverage:collect']).toBe(
      'cross-env NODE_OPTIONS=--max-old-space-size=8192 node scripts/test-runner.cjs --stage coverage --maxWorkers=2 --workerIdleMemoryLimit=512MB --testTimeout=20000 --coverage --no-watchman --testPathIgnorePatterns="<rootDir>/tests/unit/scripts/prepushGateReceipt[.]test[.]ts$"',
    );
    expect(packageJson.scripts['test:coverage']).toBe(
      'pnpm test:prepush-receipt && pnpm test:coverage:collect',
    );
    expect(packageJson.scripts['test:coverage:report']).toBe(
      'pnpm test:coverage && node scripts/test-coverage-report.js',
    );
    expect((receiptHelper as Record<string, unknown>).gateAndCreateReceipt).toBeUndefined();
    expect(fixtureEnvironment).not.toHaveProperty('GIT_DIR');
    expect(fixtureEnvironment).not.toHaveProperty('GIT_WORK_TREE');
  });

  it('binds every compiler, linter, Jest, and runner input into the gate checkpoint', () => {
    const current = fixture();
    const gateInputs = [
      '.gitignore',
      '.oxlintrc.json',
      '.prettierignore',
      '.prettierrc.js',
      'jsconfig.json',
      'jest.config.cjs',
      'pnpm-workspace.yaml',
      'scripts/jest-sequencer.cjs',
      'tsconfig.json',
      'tsconfig.electron.json',
    ];
    let previousDigest = receiptHelper.collectCheckpoint(
      current.root,
      'origin/main',
    ).gateInputsDigest;

    for (const gateInput of gateInputs) {
      fs.appendFileSync(path.join(current.root, gateInput), '\n');
      git(current.root, ['add', gateInput]);
      git(current.root, ['commit', '-m', `change ${gateInput}`]);
      const nextDigest = receiptHelper.collectCheckpoint(
        current.root,
        'origin/main',
      ).gateInputsDigest;
      expect(nextDigest).not.toBe(previousDigest);
      previousDigest = nextDigest;
    }
  });

  it('binds the pnpm runtime, configuration, workspace, lockfiles, and installed graph', () => {
    const current = fixture();
    const checkpoint = receiptHelper.collectCheckpoint(current.root, 'origin/main');

    expect(checkpoint).toMatchObject({
      checkpointVersion: 3,
      pnpmVersion: expect.any(String),
      pnpmExecutableDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      pnpmConfigDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      pnpmWorkspaceDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      pnpmLockDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      installedPnpmLockDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      installedModulesManifestDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      installedDependencyTreeDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it('canonicalizes pnpm dependency object order without hiding content drift', () => {
    const first = JSON.stringify([
      { dependencies: { alpha: { version: '1.0.0' }, beta: { version: '2.0.0' } } },
    ]);
    const reordered = JSON.stringify([
      { dependencies: { beta: { version: '2.0.0' }, alpha: { version: '1.0.0' } } },
    ]);
    const changed = JSON.stringify([
      { dependencies: { beta: { version: '2.0.1' }, alpha: { version: '1.0.0' } } },
    ]);

    expect(receiptHelper.dependencyTreeDigest(reordered)).toBe(
      receiptHelper.dependencyTreeDigest(first),
    );
    expect(receiptHelper.dependencyTreeDigest(changed)).not.toBe(
      receiptHelper.dependencyTreeDigest(first),
    );
  });

  it('excludes registry authentication from the stable pnpm configuration digest', () => {
    const current = fixture();
    const fakeBin = path.join(current.container, 'auth-config-bin');
    const actualPnpm = execFileSync('which', ['pnpm'], {
      encoding: 'utf8',
      env: isolatedEnvironment(),
    }).trim();
    writeExecutable(
      path.join(fakeBin, 'pnpm'),
      [
        '#!/bin/sh',
        'if [ "$1" = "config" ] && [ "$2" = "list" ] && [ "$3" = "--json" ]; then',
        `  exec node -e "process.stdout.write(JSON.stringify({ nodeLinker: 'isolated', '//registry.npmjs.org/:_authToken': process.env.RECEIPT_TEST_AUTH_TOKEN }))"`,
        'fi',
        `exec ${shellQuote(actualPnpm)} "$@"`,
        '',
      ].join('\n'),
    );

    const originalPath = process.env.PATH;
    const originalToken = process.env.RECEIPT_TEST_AUTH_TOKEN;
    process.env.PATH = `${fakeBin}:${originalPath ?? ''}`;
    try {
      process.env.RECEIPT_TEST_AUTH_TOKEN = 'first-secret';
      const first = receiptHelper.collectCheckpoint(current.root, 'origin/main');
      process.env.RECEIPT_TEST_AUTH_TOKEN = 'second-secret';
      const second = receiptHelper.collectCheckpoint(current.root, 'origin/main');
      expect(second.pnpmConfigDigest).toBe(first.pnpmConfigDigest);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalToken === undefined) delete process.env.RECEIPT_TEST_AUTH_TOKEN;
      else process.env.RECEIPT_TEST_AUTH_TOKEN = originalToken;
    }
  });

  it('invalidates a transport receipt after committed lint configuration drift', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    fs.appendFileSync(path.join(current.root, '.oxlintrc.json'), '\n');
    git(current.root, ['add', '.oxlintrc.json']);
    git(current.root, ['commit', '-m', 'change lint configuration']);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('uses an already-active Node 24.19.0 without requiring an NVM-managed install', () => {
    expect(process.versions.node).toBe('24.19.0');
    const current = fixture();
    const fakeHome = path.join(current.container, 'home');
    writeExecutable(
      path.join(fakeHome, '.nvm/nvm.sh'),
      "#!/bin/sh\nnvm() { echo 'fixture nvm must not be used' >&2; return 42; }\n",
    );

    const result = checkedPush(current, 'refs/heads/main', {
      HOME: fakeHome,
      NVM_DIR: path.join(fakeHome, '.nvm'),
    });

    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual(
      expect.objectContaining({ status: 0 }),
    );
    expect(readGateLog(current)).toHaveLength(3);
    expect(remoteSha(current)).toBe(current.head);
  });

  it('captures dependency trees larger than the Node spawnSync default buffer', () => {
    const current = fixture();
    const fakeBin = path.join(current.container, 'large-output-bin');
    const actualPnpm = execFileSync('which', ['pnpm'], {
      encoding: 'utf8',
      env: isolatedEnvironment(),
    }).trim();
    writeExecutable(
      path.join(fakeBin, 'pnpm'),
      [
        '#!/bin/sh',
        'if [ "$1" = "list" ] && [ "$2" = "--depth" ] && [ "$3" = "Infinity" ] && [ "$4" = "--json" ]; then',
        `  exec node -e "process.stdout.write(JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) }))"`,
        'fi',
        `exec ${shellQuote(actualPnpm)} "$@"`,
        '',
      ].join('\n'),
    );

    const result = checkedPush(current, 'refs/heads/main', {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    });

    expect(result.status).toBe(0);
    expect(remoteSha(current)).toBe(current.head);
  });

  it('fails clearly when neither PATH nor NVM can provide Node 24.19.0', () => {
    const current = fixture();
    const fakeHome = path.join(current.container, 'home');
    const fakeBin = path.join(current.container, 'fake-bin');
    writeExecutable(path.join(fakeBin, 'node'), '#!/bin/sh\nexit 1\n');
    writeExecutable(path.join(fakeHome, '.nvm/nvm.sh'), '#!/bin/sh\nnvm() { return 42; }\n');

    const result = run(
      current.root,
      path.join(current.root, '.husky/pre-push'),
      ['origin', current.remote],
      {
        HOME: fakeHome,
        NVM_DIR: path.join(fakeHome, '.nvm'),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Node.js 24.19.0 is required for the pre-push gate.');
    expect(readGateLog(current)).toEqual([]);
  });

  it('does not activate a receipt after managed success, even if the remote is rolled back', () => {
    const current = fixture();

    const result = checkedPush(current);
    expect(result.status).toBe(0);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);

    git(current.container, [
      `--git-dir=${current.remote}`,
      'update-ref',
      'refs/heads/main',
      current.mainBase,
    ]);
    expect(retryPush(current).status).not.toBe(0);
    expect(remoteSha(current)).toBe(current.mainBase);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('keeps checked-push session credentials out of gate subprocesses', () => {
    const current = fixture();

    const result = checkedPush(current, 'refs/heads/main', {
      RECEIPT_TEST_REQUIRE_PRIVATE_SESSION: 'absent',
    });

    expect(result.status).toBe(0);
    expect(readGateLog(current)).toHaveLength(3);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('treats raw and checked pushes with no ref updates as pre-checkpoint no-ops', () => {
    const current = fixture();
    git(current.root, ['push', '--no-verify', 'origin', 'refs/heads/main:refs/heads/main']);
    fs.rmSync(path.join(current.root, 'node_modules/.pnpm/lock.yaml'));

    expect(rawPush(current).status).toBe(0);
    expect(checkedPush(current).status).toBe(0);
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('skips the checkpoint and gates for a raw ref deletion', () => {
    const current = fixture();

    const result = run(current.root, 'git', ['push', 'origin', '--delete', 'dev']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Only ref deletions requested; skipped the checkpoint and gates.',
    );
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current, 'refs/heads/dev')).toBe('');
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('accepts HEAD as the exact current-branch source for a managed push', () => {
    const current = fixture();

    const result = run(current.root, 'pnpm', [
      'run',
      'push:checked',
      'origin',
      'HEAD:refs/heads/main',
    ]);

    expect(result.status).toBe(0);
    expect(readGateLog(current)).toHaveLength(3);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('rejects an ineligible managed ref update before running either gate', () => {
    const current = fixture();
    git(current.root, ['tag', 'ineligible-managed-tag']);

    const result = run(current.root, 'pnpm', [
      'run',
      'push:checked',
      'origin',
      'refs/tags/ineligible-managed-tag:refs/tags/ineligible-managed-tag',
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('checked push requires one eligible exact-HEAD branch update');
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current, 'refs/tags/ineligible-managed-tag')).toBe('');
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('rejects a successful managed update when the hook returns no private payload', () => {
    const current = fixture();
    git(current.root, ['config', 'core.hooksPath', '.missing-hooks']);

    const result = checkedPush(current);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'git push succeeded without a checked-push gate payload; no retry receipt exists',
    );
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('activates only after managed transport rejection and is consumed by success', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);

    expect(fs.statSync(current.receipt).mode & 0o777).toBe(0o600);
    expect(retryPush(current).status).toBe(0);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);
    expect(retryPush(current).status).not.toBe(0);
  });

  it('retains an unchanged receipt across retry transport failure within its TTL', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    installRemoteRejection(current);

    const rejectedRetry = retryPush(current);
    expect(rejectedRetry.status).not.toBe(0);
    expect(remoteSha(current)).toBe(current.mainBase);
    expect(fs.existsSync(current.receipt)).toBe(true);

    removeRemoteRejection(current);
    expect(retryPush(current).status).toBe(0);
    expect(remoteSha(current)).toBe(current.head);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('rejects every operator-supplied retry target and preserves the bound receipt', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);

    for (const argument of ['origin', 'refs/heads/dev', '--force']) {
      const result = retryPush(current, [argument]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'push:retry does not accept arguments; its remote, ref, and commit are receipt-bound',
      );
      expect(remoteSha(current)).toBe(current.mainBase);
      expect(fs.existsSync(current.receipt)).toBe(true);
    }
  });

  it('does not activate a receipt after a raw push transport failure', () => {
    const current = fixture();
    installRemoteRejection(current);

    const result = rawPush(current);
    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toHaveLength(3);
    expect(remoteSha(current)).toBe(current.mainBase);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('rejects --no-verify before invoking Git', () => {
    const current = fixture();
    const result = run(current.root, 'pnpm', ['run', 'push:checked', '--no-verify', 'origin']);

    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current)).toBe(current.mainBase);
  });

  it('blocks a dirty checkpoint before either gate or transport', () => {
    const current = fixture();
    fs.writeFileSync(path.join(current.root, 'untracked.ts'), 'dirty\n');

    const result = checkedPush(current);
    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current)).toBe(current.mainBase);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('blocks the original transport when controlled state drifts during the gates', () => {
    const current = fixture();

    const result = checkedPush(current, 'refs/heads/main', {
      RECEIPT_TEST_MUTATE_DURING_GATE: 'prepush',
    });
    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toHaveLength(3);
    expect(remoteSha(current)).toBe(current.mainBase);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('selects the Docpact base from the destination ref and honors explicit override', () => {
    const main = fixture();
    expect(checkedPush(main, 'refs/heads/main').status).toBe(0);
    expect(readGateLog(main)[0]).toEqual({
      gate: 'docpact',
      args: ['--base', main.mainBase, '--head', main.head],
    });
    expect(readGateLog(main).map(({ gate }) => gate)).toEqual([
      'docpact',
      'release-preflight',
      'prepush',
    ]);

    const dev = fixture();
    expect(checkedPush(dev, 'refs/heads/dev').status).toBe(0);
    expect(readGateLog(dev)[0]).toEqual({
      gate: 'docpact',
      args: ['--base', dev.devBase, '--head', dev.head],
    });
    expect(readGateLog(dev).map(({ gate }) => gate)).toEqual(['docpact', 'prepush']);

    const overridden = fixture();
    expect(
      checkedPush(overridden, 'refs/heads/main', {
        DOCPACT_BASE_REF: 'refs/heads/base',
      }).status,
    ).toBe(0);
    expect(readGateLog(overridden)[0]).toEqual({
      gate: 'docpact',
      args: ['--base', overridden.head, '--head', overridden.head],
    });
  });

  it('uses structural/static gates for an exact deterministic Release PR push', () => {
    const current = fixture();
    prepareReleaseCandidate(current);
    const branchRef = 'refs/heads/codex/issue-867-version-v1.0.1';

    expect(checkedPush(current, branchRef, {}, 'release-candidate').status).toBe(0);
    expect(readGateLog(current).map(({ gate }) => gate)).toEqual(['docpact', 'release-preflight']);
    expect(remoteSha(current, branchRef)).toBe(git(current.root, ['rev-parse', 'HEAD']));
  });

  it('rejects dependency drift hidden behind the release-candidate profile', () => {
    const current = fixture();
    prepareReleaseCandidate(current);
    const lockPath = path.join(current.root, 'pnpm-lock.yaml');
    fs.appendFileSync(lockPath, '# hidden dependency drift\n');
    git(current.root, ['add', 'pnpm-lock.yaml']);
    git(current.root, ['commit', '--amend', '--no-edit']);

    const result = checkedPush(
      current,
      'refs/heads/codex/issue-867-version-v1.0.1',
      {},
      'release-candidate',
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'release-candidate profile requires pnpm-lock.yaml to remain byte-for-byte unchanged',
    );
    expect(readGateLog(current)).toEqual([]);
  });

  it('uses structural/static gates for an exact immutable promotion push', () => {
    const current = fixture();
    prepareImmutablePromotion(current);
    const branchRef = 'refs/heads/codex/promote-v1.0.0-dev-to-main-issue-867';

    expect(checkedPush(current, branchRef, {}, 'immutable-promotion').status).toBe(0);
    expect(readGateLog(current).map(({ gate }) => gate)).toEqual(['docpact', 'release-preflight']);
    expect(remoteSha(current, branchRef)).toBe(current.devBase);
  });

  it('rejects a reduced gate profile on an arbitrary branch', () => {
    const current = fixture();
    const localRef = git(current.root, ['symbolic-ref', 'HEAD']);
    const result = checkedPush(current, localRef, {}, 'release-candidate');

    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toEqual([]);
    expect(result.stderr).toContain('deterministic version branch');
  });

  it('runs release preflight only for main-semantic branch pushes', () => {
    const hotfix = fixture();
    git(hotfix.root, ['branch', '-m', 'codex/hotfix-issue-685']);
    expect(checkedPush(hotfix, 'refs/heads/codex/hotfix-issue-685').status).toBe(0);
    expect(readGateLog(hotfix).map(({ gate }) => gate)).toEqual([
      'docpact',
      'release-preflight',
      'prepush',
    ]);

    const feature = fixture();
    git(feature.root, ['branch', '-m', 'codex/feature-issue-685']);
    expect(checkedPush(feature, 'refs/heads/codex/feature-issue-685').status).toBe(0);
    expect(readGateLog(feature).map(({ gate }) => gate)).toEqual(['docpact', 'prepush']);
  });

  it('fails closed before gates for a multi-ref push with mixed baselines', () => {
    const current = fixture();
    const result = run(current.root, 'pnpm', [
      'run',
      'push:checked',
      'origin',
      'refs/heads/main:refs/heads/main',
      'refs/heads/main:refs/heads/dev',
    ]);

    expect(result.status).not.toBe(0);
    expect(readGateLog(current)).toEqual([]);
    expect(remoteSha(current, 'refs/heads/main')).toBe(current.mainBase);
    expect(remoteSha(current, 'refs/heads/dev')).toBe(current.devBase);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it.each([
    [
      'tracked worktree',
      (current: Fixture) => fs.appendFileSync(path.join(current.root, 'delivery.txt'), 'drift\n'),
    ],
    [
      'untracked worktree',
      (current: Fixture) => fs.writeFileSync(path.join(current.root, 'new-source.ts'), 'x\n'),
    ],
    [
      'installed dependency content',
      (current: Fixture) =>
        fs.writeFileSync(
          path.join(current.root, 'node_modules/.receipt-dependency-fixture'),
          'changed\n',
        ),
    ],
    [
      'installed pnpm lock',
      (current: Fixture) =>
        fs.appendFileSync(path.join(current.root, 'node_modules/.pnpm/lock.yaml'), '# drift\n'),
    ],
    [
      'installed modules manifest',
      (current: Fixture) =>
        fs.appendFileSync(path.join(current.root, 'node_modules/.modules.yaml'), '# drift\n'),
    ],
  ])('invalidates after %s changes', (_kind, mutate) => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    mutate(current);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no longer valid|changed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('invalidates after a gate-affecting environment change', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    process.env.APP_TITLE_DE_DE = 'changed after gate';

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it.each(['NPM_CONFIG_AUDIT', 'PNPM_HOME'])(
    'binds the %s environment family into the checkpoint',
    (environmentKey) => {
      const current = fixture();
      const original = process.env[environmentKey];
      activateFailedTransportReceipt(current);
      process.env[environmentKey] = 'changed-after-gate';
      try {
        const result = retryPush(current);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/changed/u);
        expect(fs.existsSync(current.receipt)).toBe(false);
      } finally {
        if (original === undefined) delete process.env[environmentKey];
        else process.env[environmentKey] = original;
      }
    },
  );

  it('invalidates when the resolved Docpact base moves', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    git(current.root, ['update-ref', 'refs/remotes/origin/main', current.devBase]);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/changed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it.each([
    ['broken JSON', (current: Fixture) => fs.writeFileSync(current.receipt, '{broken\n')],
    ['JSON null', (current: Fixture) => fs.writeFileSync(current.receipt, 'null\n')],
    [
      'directory replacement',
      (current: Fixture) => {
        fs.rmSync(current.receipt, { force: true });
        fs.mkdirSync(current.receipt);
      },
    ],
  ])('removes a malformed or unsafe %s receipt', (_kind, mutate) => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    mutate(current);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing or malformed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('invalidates an expired receipt', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    rewriteReceipt(current, (receipt) => {
      receipt.createdAt = new Date(Date.now() - receiptHelper.RECEIPT_TTL_MS - 1_000).toISOString();
    });

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/stale/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('invalidates when the named push URL changes', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    const otherRemote = path.join(current.container, 'other.git');
    git(current.container, ['init', '--bare', otherRemote]);
    git(current.root, ['remote', 'set-url', '--push', 'origin', otherRemote]);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/remote changed/u);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('uses the validated immutable push URL for remote verification and transport', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    const otherRemote = path.join(current.container, 'other.git');
    git(current.container, ['init', '--bare', otherRemote]);
    const mutatingUploadPack = path.join(current.container, 'mutating-upload-pack.sh');
    writeExecutable(
      mutatingUploadPack,
      [
        '#!/bin/sh',
        `git -C ${shellQuote(current.root)} remote set-url --push origin ${shellQuote(otherRemote)}`,
        `exec git-upload-pack ${shellQuote(current.remote)}`,
        '',
      ].join('\n'),
    );
    git(current.root, ['config', 'remote.origin.uploadpack', mutatingUploadPack]);

    expect(retryPush(current).status).toBe(0);
    expect(git(current.root, ['remote', 'get-url', '--push', 'origin'])).toBe(current.remote);
    expect(git(current.root, ['ls-remote', '--refs', current.remote, 'refs/heads/main'])).toContain(
      current.head,
    );
    expect(git(current.root, ['ls-remote', '--refs', otherRemote, 'refs/heads/main'])).toBe('');
  });

  it('clears the receipt and succeeds idempotently when the exact commit already reached remote', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    git(current.root, ['push', '--no-verify', current.remote, 'refs/heads/main:refs/heads/main']);

    const gateCount = readGateLog(current).length;
    const result = retryPush(current);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('already reached the remote');
    expect(remoteSha(current)).toBe(current.head);
    expect(readGateLog(current)).toHaveLength(gateCount);
    expect(fs.existsSync(current.receipt)).toBe(false);
  });

  it('keeps an unchanged receipt when remote verification is temporarily unavailable', () => {
    const current = fixture();
    activateFailedTransportReceipt(current);
    fs.renameSync(current.remote, `${current.remote}.offline`);

    const result = retryPush(current);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/could not verify/u);
    expect(fs.existsSync(current.receipt)).toBe(true);
  });
});
