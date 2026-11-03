import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  runOwnedSmoke,
  SMOKE_SOURCE,
  validateReceipt,
} = require('../../../scripts/e2e/environment-smoke.cjs');
const {
  resourceCommand,
  IMAGE_REMOVE_MS,
  QUICK_READ_MS,
} = require('../../../scripts/e2e/resource-command.cjs');
const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((folder) => fs.rmSync(folder, { recursive: true, force: true })),
);

function temporary() {
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'owned-smoke-control-')));
  directories.push(folder);
  return folder;
}
function commandError(timeout = true) {
  return Object.assign(new Error('raw-secret-must-not-enter-receipt'), {
    code: timeout ? 'RESOURCE_COMMAND_TIMEOUT' : 'RESOURCE_COMMAND_FAILED',
    resourceDiagnostic: {
      status: timeout ? null : 17,
      signal: timeout ? 'SIGKILL' : null,
      errorCode: timeout ? 'ETIMEDOUT' : null,
      timedOut: timeout,
    },
  });
}
function fixture(mode = 'pass') {
  const root = temporary();
  const imageId = 'sha256:' + 'b'.repeat(64);
  const id = 'c'.repeat(64);
  const containers = new Map<string, any>();
  const commands: string[][] = [];
  let folder = '';
  let daemonReads = 0;
  const command = (_program: string, original: string[]) => {
    const args = original;
    commands.push(args);
    if (args[0] === 'info') {
      daemonReads += 1;
      return JSON.stringify(
        (mode === 'daemon-drift' && daemonReads >= 2) ||
          (mode === 'cleanup-daemon-drift' && daemonReads >= 4)
          ? 'foreign-daemon'
          : 'owned-daemon',
      );
    }
    if (args[0] === 'image')
      return JSON.stringify([
        {
          Id: imageId,
          Config: { Labels: { 'org.tiangong.lca.next.release-e2e-environment': 'true' } },
        },
      ]);
    if (args[1] === 'create') {
      const cid = args[args.indexOf('--cidfile') + 1];
      folder = path.dirname(cid);
      const intent = JSON.parse(fs.readFileSync(path.join(folder, 'receipt.json'), 'utf8'));
      assert.equal(intent.createAttempted, true);
      assert.equal(intent.id, null);
      assert.equal(intent.imageId, imageId);
      const labels = Object.fromEntries(
        args.flatMap((value, index) => (value === '--label' ? [args[index + 1].split('=')] : [])),
      );
      const container = {
        Id: id,
        Image: imageId,
        Name: '/' + args[args.indexOf('--name') + 1],
        Config: { Labels: labels, Cmd: args.slice(args.indexOf(imageId) + 1), Entrypoint: null },
        HostConfig: { NetworkMode: 'none', IpcMode: 'host', Init: true, AutoRemove: false },
        Mounts: [],
        State: { Running: false },
      };
      containers.set(id, container);
      if (mode === 'missing-cid') throw commandError();
      fs.writeFileSync(cid, id);
      if (mode === 'partial-create') throw commandError();
      return id;
    }
    if (args[1] === 'ls') return [...containers.keys()].join('\n');
    if (args[1] === 'inspect') return JSON.stringify([containers.get(args[2])]);
    if (args[1] === 'start') {
      containers.get(id).State.Running = true;
      if (mode === 'drift') {
        containers.get(id).Image = 'sha256:' + 'd'.repeat(64);
        throw commandError(false);
      }
      if (mode === 'start-timeout') throw commandError();
      containers.get(id).State.Running = false;
      return JSON.stringify({ chromium: '151', firefox: '153', webkit: '26' });
    }
    if (args[1] === 'stop') {
      containers.get(id).State.Running = false;
      return id;
    }
    if (args[1] === 'rm') {
      if (mode === 'remove-refusal') throw commandError(false);
      assert.deepEqual(args, ['container', 'rm', id]);
      containers.delete(id);
      return id;
    }
    throw new Error('Unexpected synthetic Docker request');
  };
  const input = { root, imageId, head: 'a'.repeat(40), tree: 'e'.repeat(40) };
  return {
    root,
    input,
    containers,
    commands,
    command,
    receipt: () => JSON.parse(fs.readFileSync(path.join(folder, 'receipt.json'), 'utf8')),
  };
}

function caught(callback: () => unknown): any {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error('Expected native command failure');
}

it('records native timeout, exit and partially completed effects without raw output', () => {
  const effect = path.join(temporary(), 'effect.txt');
  const refusal = caught(() =>
    resourceCommand(process.execPath, [
      '-e',
      "process.stderr.write('private-secret');process.exit(17)",
    ]),
  );
  expect(refusal.code).toBe('RESOURCE_COMMAND_FAILED');
  expect(refusal.resourceDiagnostic).toEqual({
    status: 17,
    signal: null,
    errorCode: null,
    timedOut: false,
  });
  expect(JSON.stringify(refusal)).not.toContain('private-secret');
  const timeout = caught(() =>
    resourceCommand(
      process.execPath,
      [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1], 'partial');setInterval(()=>{},1000)",
        effect,
      ],
      { timeout: 1000 },
    ),
  );
  expect(timeout.code).toBe('RESOURCE_COMMAND_TIMEOUT');
  expect(timeout.resourceDiagnostic).toMatchObject({
    errorCode: 'ETIMEDOUT',
    signal: 'SIGKILL',
    timedOut: true,
  });
  expect(fs.readFileSync(effect, 'utf8')).toBe('partial');
  expect(QUICK_READ_MS).toBe(15_000);
  expect(IMAGE_REMOVE_MS).toBe(120_000);
});

it('owns create intent/CID/immutable image and inspection before launch, then removes exact ID', () => {
  // Frozen from the actual browser program at qualified source 602ecfa0f;
  // only its resource lifecycle changes in this repair.
  expect(createHash('sha256').update(SMOKE_SOURCE).digest('hex')).toBe(
    '7fd8384a5875caae60161f128336e12737d5159e12fe2bc3f191c7dfb73bb46e',
  );
  const f = fixture();
  expect(runOwnedSmoke(f.input, { command: f.command })).toEqual({
    chromium: '151',
    firefox: '153',
    webkit: '26',
  });
  const receipt = f.receipt();
  expect(receipt).toMatchObject({ passed: true, bound: true, cleanupComplete: true, errors: [] });
  expect(receipt.identity.commandSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    f.commands.filter((args) => args[0] !== 'info').map((args) => args.slice(0, 2).join(':')),
  ).toEqual([
    'image:inspect',
    'container:create',
    'container:inspect',
    'container:start',
    'container:ls',
    'container:inspect',
    'container:rm',
    'container:ls',
  ]);
  expect(f.commands.flat()).toContain(f.input.imageId);
  expect(f.commands.flat().join(' ')).not.toMatch(/--rm|--force|prune|volume|network rm/u);
  expect(f.containers.size).toBe(0);
  expect(JSON.stringify(receipt)).not.toContain(SMOKE_SOURCE);
});

it.each(['partial-create', 'start-timeout'])(
  'recovers only inspected CID after %s while preserving original failure',
  (mode) => {
    const f = fixture(mode);
    expect(() => runOwnedSmoke(f.input, { command: f.command })).toThrow('SMOKE_EXECUTION_FAILED');
    expect(f.receipt()).toMatchObject({ passed: false, bound: true, cleanupComplete: true });
    expect(f.receipt().errors).toContain('RESOURCE_COMMAND_TIMEOUT');
    expect(f.containers.size).toBe(0);
    expect(JSON.stringify(f.receipt())).not.toContain('raw-secret');
  },
);

it.each(['missing-cid', 'drift', 'remove-refusal'])(
  'fails closed and retains uncertain/changed resources after %s',
  (mode) => {
    const f = fixture(mode);
    expect(() => runOwnedSmoke(f.input, { command: f.command })).toThrow('SMOKE_EXECUTION_FAILED');
    expect(f.receipt().cleanupComplete).toBe(false);
    expect(f.containers.size).toBe(1);
    expect(f.commands.filter((args) => args[1] === 'rm')).toHaveLength(
      mode === 'remove-refusal' ? 1 : 0,
    );
    expect(JSON.stringify(f.receipt())).not.toContain('raw-secret');
  },
);

it('rejects source/controller and inspected-identity drift in a persisted receipt', () => {
  const f = fixture();
  runOwnedSmoke(f.input, { command: f.command });
  const receipt = f.receipt();
  const source = { root: f.root, head: f.input.head, tree: f.input.tree };
  const controller = { pid: receipt.controller.pid, lockSha256: receipt.controller.lockSha256 };
  validateReceipt(receipt, source, controller, receipt.dockerDaemonId);
  expect(() =>
    validateReceipt(
      { ...receipt, head: 'd'.repeat(40) },
      source,
      controller,
      receipt.dockerDaemonId,
    ),
  ).toThrow('SMOKE_HEAD_MISMATCH');
  expect(() =>
    validateReceipt(receipt, source, { ...controller, pid: 999999 }, receipt.dockerDaemonId),
  ).toThrow('SMOKE_CONTROLLER_MISMATCH');
  receipt.identity.networkMode = 'host';
  expect(() => validateReceipt(receipt, source, controller, receipt.dockerDaemonId)).toThrow(
    'SMOKE_IDENTITY_MISMATCH',
  );
});

it('refuses extra receipt/command payload fields rather than publishing raw diagnostics', () => {
  const f = fixture();
  runOwnedSmoke(f.input, { command: f.command });
  const receipt = f.receipt();
  const source = { root: f.root, head: f.input.head, tree: f.input.tree };
  const controller = { pid: receipt.controller.pid, lockSha256: receipt.controller.lockSha256 };
  expect(() =>
    validateReceipt({ ...receipt, stdout: 'secret' }, source, controller, receipt.dockerDaemonId),
  ).toThrow('SMOKE_RECEIPT_KEYS');
  receipt.commands[0].stderr = 'secret';
  expect(() => validateReceipt(receipt, source, controller, receipt.dockerDaemonId)).toThrow(
    'SMOKE_COMMAND_KEYS',
  );
});

it.each(['daemon-drift', 'cleanup-daemon-drift'])(
  'does not mutate a substituted Docker daemon (%s)',
  (mode) => {
    const f = fixture(mode);
    expect(() => runOwnedSmoke(f.input, { command: f.command })).toThrow('SMOKE_EXECUTION_FAILED');
    expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
    expect(f.commands.filter((args) => args[1] === 'create')).toHaveLength(
      mode === 'daemon-drift' ? 0 : 1,
    );
    expect(f.containers.size).toBe(mode === 'daemon-drift' ? 0 : 1);
  },
);

it('admits no creation after the finite smoke budget has expired', () => {
  const f = fixture();
  let now = 0;
  const command = (program: string, args: string[]) => {
    const result = f.command(program, args);
    if (args[0] === 'image') now = 300001;
    return result;
  };
  expect(() => runOwnedSmoke(f.input, { command, now: () => now })).toThrow(
    'SMOKE_EXECUTION_FAILED',
  );
  expect(f.containers.size).toBe(0);
  expect(f.commands.some((args) => args[1] === 'create')).toBe(false);
});
