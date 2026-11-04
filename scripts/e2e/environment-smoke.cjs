'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resourceCommand,
  QUICK_READ_MS,
  CONTAINER_REMOVE_MS,
  commandFailure,
} = require('./resource-command.cjs');

const PREFIX = 'org.tiangong.lca.next.';
const SMOKE = `${PREFIX}environment-smoke`;
const SCHEMA = 'platform.environment-smoke.v1';
const ID = /^[a-f0-9]{64}$/u;
const IMAGE = /^sha256:[a-f0-9]{64}$/u;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const SMOKE_SOURCE = [
  "const { chromium, firefox, webkit } = require('@playwright/test');",
  '(async () => {',
  '  const versions = {};',
  '  for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {',
  '    const browser = await browserType.launch();',
  '    try { versions[name] = browser.version(); } finally { await browser.close(); }',
  '  }',
  '  process.stdout.write(JSON.stringify(versions));',
  '})().catch((error) => { console.error(error); process.exitCode = 1; });',
].join('\n');
const CMD = ['node', '-e', SMOKE_SOURCE];
function smokeFailureCode(error) {
  return (
    /^SMOKE_[A-Z0-9_]+/u.exec(error.message ?? '')?.[0] ??
    (/^RESOURCE_[A-Z0-9_]+$/u.test(error.code ?? '') ? error.code : 'SMOKE_FAILED')
  );
}

function save(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function noLinks(file, root) {
  assert.ok(file.startsWith(root + path.sep), 'SMOKE_PATH_OUTSIDE_ROOT');
  for (let current = file; current !== root; current = path.dirname(current))
    if (fs.existsSync(current))
      assert.equal(fs.lstatSync(current).isSymbolicLink(), false, 'SMOKE_SYMLINK_REFUSED');
}
function readCid(file) {
  assert.equal(fs.lstatSync(file).isFile(), true, 'SMOKE_CID_NOT_REGULAR');
  assert.equal(fs.lstatSync(file).isSymbolicLink(), false, 'SMOKE_CID_SYMLINK');
  const id = fs.readFileSync(file, 'utf8').trim();
  assert.ok(ID.test(id), 'SMOKE_INVALID_CID');
  return id;
}
function smokeLabels(record) {
  return {
    [SMOKE]: 'true',
    [`${PREFIX}smoke-nonce`]: record.nonce,
    [`${PREFIX}smoke-head`]: record.head,
    [`${PREFIX}smoke-input-sha256`]: sha(SMOKE_SOURCE),
  };
}
function validateSmoke(container, record) {
  assert.ok(ID.test(record.id ?? '') && container.Id === record.id, 'SMOKE_ID_MISMATCH');
  assert.equal(container.Image, record.imageId, 'SMOKE_IMAGE_MISMATCH');
  assert.equal(container.Name, `/tiangong-smoke-${record.nonce}`, 'SMOKE_NAME_MISMATCH');
  for (const [key, value] of Object.entries(smokeLabels(record)))
    assert.equal(container.Config?.Labels?.[key], value, 'SMOKE_LABEL_MISMATCH');
  assert.deepEqual(container.Config?.Cmd, CMD, 'SMOKE_COMMAND_MISMATCH');
  assert.ok(!container.Config?.Entrypoint?.length, 'SMOKE_ENTRYPOINT_MISMATCH');
  assert.deepEqual(container.Mounts, [], 'SMOKE_MOUNT_MISMATCH');
  assert.equal(container.HostConfig?.NetworkMode, 'none', 'SMOKE_NETWORK_MISMATCH');
  assert.equal(container.HostConfig?.IpcMode, 'host', 'SMOKE_IPC_MISMATCH');
  assert.equal(container.HostConfig?.Init, true, 'SMOKE_INIT_MISMATCH');
  assert.equal(container.HostConfig?.AutoRemove, false, 'SMOKE_AUTOREMOVE_REFUSED');
}
function smokeIdentity(container, record) {
  validateSmoke(container, record);
  return {
    id: container.Id,
    imageId: container.Image,
    name: container.Name,
    labels: smokeLabels(record),
    commandSha256: sha(JSON.stringify(container.Config.Cmd)),
    networkMode: container.HostConfig.NetworkMode,
    ipcMode: container.HostConfig.IpcMode,
    init: container.HostConfig.Init,
    autoRemove: container.HostConfig.AutoRemove,
    mounts: [],
  };
}
function validateReceipt(record, source, controller, daemonId) {
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      'schema',
      'nonce',
      'root',
      'head',
      'tree',
      'imageId',
      'dockerDaemonId',
      'inputSha256',
      'controller',
      'createdAt',
      'id',
      'bound',
      'identity',
      'createAttempted',
      'passed',
      'cleanupComplete',
      'commands',
      'errors',
    ].sort(),
    'SMOKE_RECEIPT_KEYS',
  );
  assert.deepEqual(
    Object.keys(record.controller).sort(),
    ['pid', 'hostname', 'lockSha256'].sort(),
    'SMOKE_CONTROLLER_KEYS',
  );
  assert.equal(record.schema, SCHEMA, 'SMOKE_SCHEMA_MISMATCH');
  assert.ok(
    ['bound', 'createAttempted', 'passed', 'cleanupComplete'].every(
      (key) => typeof record[key] === 'boolean',
    ),
    'SMOKE_STATE_TYPE',
  );
  assert.ok(Number.isSafeInteger(record.createdAt) && record.createdAt >= 0, 'SMOKE_TIMESTAMP');
  assert.ok(
    Number.isSafeInteger(record.controller.pid) && record.controller.pid > 0,
    'SMOKE_CONTROLLER_PID',
  );
  assert.equal(record.controller.hostname, os.hostname(), 'SMOKE_HOST_MISMATCH');
  assert.equal(record.dockerDaemonId, daemonId, 'SMOKE_DAEMON_MISMATCH');
  assert.match(record.nonce, /^[a-f0-9-]{36}$/u);
  assert.equal(record.root, source.root, 'SMOKE_ROOT_MISMATCH');
  assert.equal(record.head, source.head, 'SMOKE_HEAD_MISMATCH');
  assert.equal(record.tree, source.tree, 'SMOKE_TREE_MISMATCH');
  assert.ok(IMAGE.test(record.imageId), 'SMOKE_IMAGE_MISMATCH');
  assert.equal(record.inputSha256, sha(SMOKE_SOURCE), 'SMOKE_INPUT_MISMATCH');
  assert.ok(
    controller &&
      record.controller.pid === controller.pid &&
      record.controller.lockSha256 === controller.lockSha256,
    'SMOKE_CONTROLLER_MISMATCH',
  );
  assert.ok(record.id === null || ID.test(record.id), 'SMOKE_ID_MISMATCH');
  if (record.bound) {
    const expected = {
      Id: record.id,
      Image: record.imageId,
      Name: `/tiangong-smoke-${record.nonce}`,
      Config: { Labels: smokeLabels(record), Cmd: CMD, Entrypoint: null },
      Mounts: [],
      HostConfig: { NetworkMode: 'none', IpcMode: 'host', Init: true, AutoRemove: false },
    };
    assert.deepEqual(record.identity, smokeIdentity(expected, record), 'SMOKE_IDENTITY_MISMATCH');
  }
  assert.ok(Array.isArray(record.commands) && record.commands.length <= 32, 'SMOKE_COMMAND_CAP');
  assert.ok(
    Array.isArray(record.errors) &&
      record.errors.length <= 8 &&
      record.errors.every((value) => /^(?:SMOKE|RESOURCE)_[A-Z0-9_]{1,64}$/u.test(value)),
    'SMOKE_ERROR_CAP',
  );
  for (const event of record.commands) {
    assert.ok(
      Object.keys(event).every((key) =>
        [
          'phase',
          'operation',
          'resourceId',
          'startedAt',
          'timeoutMs',
          'outcome',
          'finishedAt',
          'commandStartedAt',
          'status',
          'signal',
          'errorCode',
          'timedOut',
        ].includes(key),
      ),
      'SMOKE_COMMAND_KEYS',
    );
    assert.ok(
      /^(?:engine:identity|image:inspect|container:(?:create|inspect|start|ls|stop|rm))$/u.test(
        event.operation,
      ),
      'SMOKE_OPERATION',
    );
    assert.ok(
      event.resourceId === null || ID.test(event.resourceId) || IMAGE.test(event.resourceId),
      'SMOKE_EVENT_ID',
    );
    assert.ok(['pending', 'passed', 'failed'].includes(event.outcome), 'SMOKE_EVENT_OUTCOME');
    assert.ok(
      Number.isSafeInteger(event.timeoutMs) && event.timeoutMs > 0 && event.timeoutMs <= 120000,
      'SMOKE_EVENT_TIMEOUT',
    );
  }
}

function cleanupSmoke(record, docker, persist) {
  assert.ok(ID.test(record.id ?? ''), 'SMOKE_CREATE_OUTCOME_UNKNOWN');
  const ids = docker(['container', 'ls', '-aq', '--no-trunc']).trim().split(/\s+/u);
  if (!ids.includes(record.id)) {
    // Absence never creates ownership; the exact identity must already have been inspected.
    assert.equal(record.bound, true, 'SMOKE_UNBOUND_ABSENCE');
  } else {
    const inspect = () => JSON.parse(docker(['container', 'inspect', record.id]))[0];
    let container = inspect();
    validateSmoke(container, record);
    const identity = smokeIdentity(container, record);
    if (record.identity) assert.deepEqual(record.identity, identity, 'SMOKE_IDENTITY_MISMATCH');
    record.identity = identity;
    record.bound = true;
    persist();
    if (container.State?.Running) {
      docker(['container', 'stop', '--time', '5', record.id], CONTAINER_REMOVE_MS);
      container = inspect();
      validateSmoke(container, record);
      assert.equal(container.State?.Running, false, 'SMOKE_STILL_RUNNING');
    }
    docker(['container', 'rm', record.id], CONTAINER_REMOVE_MS);
    assert.ok(
      !docker(['container', 'ls', '-aq', '--no-trunc']).trim().split(/\s+/u).includes(record.id),
      'SMOKE_RETAINED',
    );
  }
  record.cleanupComplete = true;
  persist();
}

function runOwnedSmoke({ root, head, tree, imageId }, io = {}) {
  assert.ok(
    IMAGE.test(imageId) && /^[a-f0-9]{40}$/u.test(head) && /^[a-f0-9]{40}$/u.test(tree),
    'SMOKE_INPUT_IDENTITY',
  );
  root = fs.realpathSync(root);
  const clock = io.now ?? Date.now;
  const deadline = clock() + 300_000;
  const invoke = io.command ?? resourceCommand;
  const dockerDaemonId = JSON.parse(
    invoke('docker', ['info', '--format', '{{json .ID}}'], { timeout: QUICK_READ_MS }),
  );
  assert.ok(
    typeof dockerDaemonId === 'string' && dockerDaemonId.length > 0 && dockerDaemonId.length <= 128,
    'SMOKE_DAEMON_IDENTITY',
  );
  const nonce = crypto.randomUUID();
  const parent = path.join(root, '.local/e2e-release/smoke');
  noLinks(parent, root);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(parent), parent, 'SMOKE_SYMLINK_REFUSED');
  const directory = path.join(parent, nonce);
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, 'receipt.json');
  const cid = path.join(directory, 'container.cid');
  const ownerFile = path.join(root, '.local/e2e-release/invocation.lock/owner.json');
  noLinks(ownerFile, root);
  const ownerRaw = fs.existsSync(ownerFile) ? fs.readFileSync(ownerFile) : null;
  if (ownerRaw) assert.equal(JSON.parse(ownerRaw).pid, process.pid, 'SMOKE_CONTROLLER_MISMATCH');
  const record = {
    schema: SCHEMA,
    nonce,
    root,
    head,
    tree,
    imageId,
    dockerDaemonId,
    inputSha256: sha(SMOKE_SOURCE),
    controller: {
      pid: process.pid,
      hostname: os.hostname(),
      lockSha256: ownerRaw ? sha(ownerRaw) : null,
    },
    createdAt: clock(),
    id: null,
    bound: false,
    identity: null,
    createAttempted: false,
    passed: false,
    cleanupComplete: false,
    commands: [],
    errors: [],
  };
  const persist = () => save(file, record);
  const docker = (args, timeout = QUICK_READ_MS) => {
    timeout = Math.min(timeout, deadline - clock());
    assert.ok(timeout > 0, 'SMOKE_BUDGET_EXHAUSTED');
    assert.ok(record.commands.length < 32, 'SMOKE_COMMAND_CAP');
    const event = {
      phase: args[0] === 'info' ? 'daemon-identity' : args[1],
      operation: args[0] === 'info' ? 'engine:identity' : `${args[0]}:${args[1]}`,
      resourceId: args[0] === 'image' ? record.imageId : record.id,
      startedAt: clock(),
      timeoutMs: timeout,
      outcome: 'pending',
    };
    record.commands.push(event);
    persist();
    try {
      if (['create', 'start', 'stop', 'rm'].includes(args[1])) {
        assert.equal(
          JSON.parse(docker(['info', '--format', '{{json .ID}}'])),
          record.dockerDaemonId,
          'SMOKE_DAEMON_MISMATCH',
        );
      }
      timeout = Math.min(timeout, deadline - clock());
      assert.ok(timeout > 0, 'SMOKE_BUDGET_EXHAUSTED');
      if (args[0] === 'container' && args[1] === 'create') record.createAttempted = true;
      event.commandStartedAt = clock();
      event.timeoutMs = timeout;
      persist();
      const output = invoke('docker', args, { timeout });
      Object.assign(event, {
        outcome: 'passed',
        finishedAt: clock(),
        status: 0,
        signal: null,
        errorCode: null,
      });
      persist();
      return output;
    } catch (error) {
      Object.assign(event, {
        outcome: 'failed',
        finishedAt: clock(),
        ...commandFailure(error),
      });
      persist();
      throw error;
    }
  };
  persist();
  let failure;
  let versions;
  try {
    const image = JSON.parse(docker(['image', 'inspect', imageId]))[0];
    assert.equal(image.Id, imageId, 'SMOKE_IMAGE_MISMATCH');
    assert.equal(
      image.Config?.Labels?.[`${PREFIX}release-e2e-environment`],
      'true',
      'SMOKE_DEPENDENCY_IMAGE_REQUIRED',
    );
    const args = [
      'container',
      'create',
      '--cidfile',
      cid,
      '--name',
      `tiangong-smoke-${nonce}`,
      '--init',
      '--ipc=host',
      '--network=none',
    ];
    for (const [key, value] of Object.entries(smokeLabels(record)))
      args.push('--label', `${key}=${value}`);
    args.push(imageId, ...CMD);
    docker(args);
    record.id = readCid(cid);
    persist();
    record.identity = smokeIdentity(
      JSON.parse(docker(['container', 'inspect', record.id]))[0],
      record,
    );
    record.bound = true;
    persist();
    versions = JSON.parse(docker(['container', 'start', '--attach', record.id], 120_000));
    assert.ok(
      ['chromium', 'firefox', 'webkit'].every(
        (name) => typeof versions[name] === 'string' && versions[name].length > 0,
      ),
      'SMOKE_BROWSER_INVENTORY',
    );
    record.passed = true;
    persist();
  } catch (error) {
    failure = error;
    record.errors.push(smokeFailureCode(error));
    if (!record.id && fs.existsSync(cid)) {
      record.id = readCid(cid);
      persist();
    }
  } finally {
    try {
      if (!record.createAttempted) {
        record.cleanupComplete = true;
        persist();
      } else cleanupSmoke(record, docker, persist);
    } catch (error) {
      record.errors.push(smokeFailureCode(error));
      persist();
      failure ??= error;
    }
  }
  if (failure) {
    const error = new Error('SMOKE_EXECUTION_FAILED');
    error.code = smokeFailureCode(failure);
    if (failure.resourceDiagnostic) error.resourceDiagnostic = commandFailure(failure);
    throw error;
  }
  return versions;
}

module.exports = {
  SMOKE,
  SCHEMA,
  SMOKE_SOURCE,
  smokeLabels,
  validateSmoke,
  smokeIdentity,
  validateReceipt,
  cleanupSmoke,
  runOwnedSmoke,
  readCid,
};
