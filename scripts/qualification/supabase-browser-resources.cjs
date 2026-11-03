#!/usr/bin/env node
'use strict';

// Resource receipts surround, but never replace, the canonical browser controller.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  resourceCommand,
  QUICK_READ_MS,
  IMAGE_REMOVE_MS,
  CONTAINER_REMOVE_MS,
  CLEANUP_TOTAL_MS,
  commandFailure,
} = require('../e2e/resource-command.cjs');
const {
  SMOKE,
  validateReceipt: validateSmokeReceipt,
  cleanupSmoke,
  validateSmoke,
  readCid,
} = require('../e2e/environment-smoke.cjs');

const { readMaintainedPatches } = require('../e2e/maintained-patches.cjs');

const PREFIX = 'org.tiangong.lca.next.';
const CANDIDATE = `${PREFIX}release-e2e`;
const DEPENDENCY = `${PREFIX}release-e2e-environment`;
const SCHEMA = 'platform.supabase-browser-resources.v2';
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/u;
const CONTAINER_ID = /^[a-f0-9]{64}$/u;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stable = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, stable(value[key])]),
      )
    : value;
const check = (condition, code) => assert.ok(condition, code);
const failureCode = (error) => {
  const firstLine = String(error.message ?? '').split(/\r?\n/u)[0];
  return /^[A-Z0-9_:]{1,96}$/u.test(firstLine)
    ? firstLine
    : /^[A-Z0-9_]{1,64}$/u.test(error.code ?? '')
      ? error.code
      : 'RESOURCE_BOUNDARY_FAILED';
};

function privateJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, json(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function contained(root, value) {
  return value !== root && value.startsWith(`${root}${path.sep}`);
}

function noSymlinks(file, boundary) {
  check(contained(boundary, file), 'PATH_OUTSIDE_OWNED_ROOT');
  let current = file;
  while (current !== boundary) {
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 'SYMLINK_REFUSED');
    current = path.dirname(current);
  }
}

function command(program, args, options = {}) {
  return resourceCommand(program, args, options);
}

function sourceIdentity(root, head, budget = {}) {
  const capture = (program, args, options = {}) => {
    const timeout = budget.remaining ? Math.min(QUICK_READ_MS, budget.remaining()) : QUICK_READ_MS;
    check(timeout > 0, 'CLEANUP_BUDGET_EXHAUSTED');
    return command(program, args, { ...options, timeout });
  };
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const git = (...args) =>
    capture('git', ['--no-optional-locks', '-C', root, ...args], { env }).trim();
  check(/^[a-f0-9]{40}$/u.test(head) && git('rev-parse', 'HEAD') === head, 'HEAD_MISMATCH');
  check(git('status', '--porcelain=v1', '--untracked-files=all') === '', 'SOURCE_NOT_CLEAN');
  const maintainedPatches = readMaintainedPatches(root);
  const files = {};
  for (const name of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'docker/e2e/environment.json',
    'docker/e2e/Dockerfile',
    ...maintainedPatches.entries.map((entry) => entry.path),
  ]) {
    noSymlinks(path.join(root, name), root);
    files[name] = sha(fs.readFileSync(path.join(root, name)));
    check(
      files[name] === sha(capture('git', ['-C', root, 'show', `${head}:${name}`], { env })),
      'TRACKED_INPUT_DRIFT',
    );
  }
  const environment = JSON.parse(
    fs.readFileSync(path.join(root, 'docker/e2e/environment.json'), 'utf8'),
  );
  check(environment.outputPath === '/e2e-output', 'OUTPUT_CONTRACT_DRIFT');
  check(
    environment.nodeVersion === '24.19.0' && environment.playwrightVersion === '1.62.1',
    'TOOLCHAIN_CONTRACT_DRIFT',
  );
  check(
    [environment.playwrightImage, environment.nodeImage].every((ref) =>
      /@sha256:[a-f0-9]{64}$/u.test(ref),
    ),
    'UNPINNED_BASE_IMAGE',
  );
  return {
    root,
    head,
    tree: git('rev-parse', 'HEAD^{tree}'),
    files,
    maintainedPatches: maintainedPatches.entries,
    maintainedPatchesSha256: maintainedPatches.sha256,
    baseImages: [environment.playwrightImage, environment.nodeImage],
  };
}

function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (fields[0] === 'Z') return null;
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`).toString().split('\0').filter(Boolean);
    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    return {
      pid,
      parent: Number(fields[1]),
      group: Number(fields[2]),
      start: fields[19],
      cwd,
      argvSha256: sha(fs.readFileSync(`/proc/${pid}/cmdline`)),
      canonicalQualifier:
        argv.length > 2 &&
        path.resolve(cwd, argv[1]) === path.join(cwd, 'scripts/e2e/release-e2e.cjs') &&
        argv[2] === 'qualify',
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
    throw error;
  }
}

function sameProcess(left, right) {
  return (
    left &&
    right &&
    left.pid === right.pid &&
    left.start === right.start &&
    left.cwd === right.cwd &&
    left.argvSha256 === right.argvSha256
  );
}

function processGroup(group) {
  if (!fs.existsSync('/proc')) return [];
  const members = [];
  for (const name of fs.readdirSync('/proc').filter((entry) => /^\d+$/u.test(entry))) {
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
      if (Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]) !== group) continue;
      const identity = processIdentity(Number(name));
      if (identity) members.push(identity);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  return members;
}

async function stopObserver(expected, io = {}) {
  const inspect = io.processInfo ?? processIdentity;
  const group = io.processGroup ?? processGroup;
  const delay = io.delay ?? wait;
  const signal = io.signal ?? ((pid, name) => process.kill(pid, name));
  for (const name of [null, 'SIGTERM', 'SIGKILL']) {
    const current = inspect(expected.pid);
    if (!current) break;
    check(sameProcess(current, expected), 'OBSERVER_PROCESS_IDENTITY_DRIFT');
    if (name) {
      try {
        signal(expected.pid, name);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    for (let attempt = 0; attempt < 30 && inspect(expected.pid); attempt += 1) await delay(100);
  }
  check(!inspect(expected.pid), 'OBSERVER_NOT_STOPPED');
  // Child commands are bounded read-only subprocesses. Do not signal a process
  // group after its leader exits; require its observed absence instead.
  for (let attempt = 0; attempt < 160 && group(expected.pid).length; attempt += 1) await delay(100);
  check(group(expected.pid).length === 0, 'OBSERVER_CHILD_GROUP_RETAINED');
}

function dependencyLabels(source) {
  return {
    [DEPENDENCY]: 'true',
    [`${PREFIX}dependency-lock-sha256`]: source.files['pnpm-lock.yaml'],
    [`${PREFIX}package-json-sha256`]: source.files['package.json'],
    [`${PREFIX}pnpm-workspace-sha256`]: source.files['pnpm-workspace.yaml'],
    [`${PREFIX}maintained-patches-sha256`]: source.maintainedPatchesSha256,
    [`${PREFIX}environment-sha256`]: source.files['docker/e2e/environment.json'],
    [`${PREFIX}dockerfile-sha256`]: source.files['docker/e2e/Dockerfile'],
  };
}

function canonicalDigestReference(value) {
  if (typeof value !== 'string') return null;
  const match = /^([^\s@]+)@(sha256:[a-f0-9]{64})$/u.exec(value);
  if (!match) return null;
  let repository = match[1];
  const colon = repository.lastIndexOf(':');
  if (colon > repository.lastIndexOf('/')) repository = repository.slice(0, colon);
  const first = repository.split('/')[0];
  if (!first.includes('.') && !first.includes(':') && first !== 'localhost')
    repository = `docker.io/${repository}`;
  repository = repository.replace(/^index\.docker\.io\//u, 'docker.io/');
  if (/^docker\.io\/[^/]+$/u.test(repository))
    repository = repository.replace('docker.io/', 'docker.io/library/');
  return `${repository}@${match[2]}`;
}

function expectedImageTag(source, kind) {
  if (kind === 'candidate')
    return `tiangong-lca-next-e2e:${source.tree.slice(0, 12)}-${source.files['docker/e2e/environment.json'].slice(0, 12)}-qualification`;
  const identity = {
    dependencyLockSha256: source.files['pnpm-lock.yaml'],
    dockerfileSha256: source.files['docker/e2e/Dockerfile'],
    environmentSha256: source.files['docker/e2e/environment.json'],
    packageJsonSha256: source.files['package.json'],
    pnpmWorkspaceSha256: source.files['pnpm-workspace.yaml'],
    maintainedPatchesSha256: source.maintainedPatchesSha256,
  };
  return `tiangong-lca-next-e2e-dependencies:${sha(json(stable(identity))).slice(0, 24)}`;
}

function validateImage(image, source, manifests) {
  check(IMAGE_ID.test(image.Id), 'INVALID_IMAGE_ID');
  const labels = image.Config?.Labels ?? {};
  if (labels[DEPENDENCY] === 'true') {
    for (const [key, value] of Object.entries(dependencyLabels(source)))
      check(labels[key] === value, 'DEPENDENCY_IMAGE_INPUT_MISMATCH');
    check(
      image.RepoTags?.includes(expectedImageTag(source, 'dependency')),
      'DEPENDENCY_IMAGE_TAG_MISMATCH',
    );
    return 'dependency';
  }
  check(labels[CANDIDATE] === 'true', 'IMAGE_LABEL_MISMATCH');
  check(labels[`${PREFIX}candidate-tree`] === source.tree, 'IMAGE_TREE_MISMATCH');
  check(
    manifests.some((entry) => entry.sha256 === labels[`${PREFIX}manifest-sha256`]),
    'IMAGE_MANIFEST_MISMATCH',
  );
  check(
    image.RepoTags?.includes(expectedImageTag(source, 'candidate')),
    'CANDIDATE_IMAGE_TAG_MISMATCH',
  );
  check(
    IMAGE_ID.test(labels[`${PREFIX}dependency-image-id`] ?? ''),
    'CANDIDATE_DEPENDENCY_ID_MISSING',
  );
  return 'candidate';
}

function validateContainer(container, source, manifests, images, baseline) {
  check(
    CONTAINER_ID.test(container.Id) && !baseline.containers.includes(container.Id),
    'CONTAINER_NOT_FRESH',
  );
  check(container.Config?.Labels?.[CANDIDATE] === 'true', 'CONTAINER_LABEL_MISMATCH');
  const image = images.find((entry) => entry.Id === container.Image);
  check(
    image && validateImage(image, source, manifests) === 'candidate',
    'CONTAINER_IMAGE_MISMATCH',
  );
  const output = container.Mounts?.filter((mount) => mount.Destination === '/e2e-output');
  check(
    output?.length === 1 && output[0].Type === 'bind' && output[0].RW === true,
    'OUTPUT_MOUNT_MISMATCH',
  );
  const runId = path.basename(output[0].Source);
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}$/u.test(runId) &&
      runId.endsWith(source.head.slice(0, 12)),
    'RUN_ID_MISMATCH',
  );
  check(
    output[0].Source === path.join(source.root, '.local/e2e-release/runs', runId),
    'OUTPUT_MOUNT_MISMATCH',
  );
  noSymlinks(output[0].Source, source.root);
  const manifest = manifests.find((entry) => entry.runId === runId);
  check(
    manifest && image.Config.Labels[`${PREFIX}manifest-sha256`] === manifest.sha256,
    'CONTAINER_MANIFEST_MISMATCH',
  );
  for (const mount of container.Mounts) {
    check(mount.Type === 'bind', 'UNEXPECTED_VOLUME');
    const expected = {
      '/e2e-output': path.join(source.root, '.local/e2e-release/runs', runId),
      '/e2e-input/tracked-main.env': path.join(
        source.root,
        '.local/e2e-release/build',
        runId,
        'runtime-input/tracked-main.env',
      ),
      '/e2e-recovery': path.join(source.root, '.local/e2e-release'),
    }[mount.Destination];
    check(expected === mount.Source, 'FOREIGN_MOUNT');
    noSymlinks(mount.Source, source.root);
  }
  check(
    !container.Config.Env?.some(
      (entry) =>
        entry === 'E2E_ALLOW_PRODUCTION_DATA=true' || entry === 'E2E_WRITE_VERIFIED_EVIDENCE=true',
    ),
    'PRODUCTION_MODE_REFUSED',
  );
  return { id: container.Id, imageId: image.Id, runId, manifestSha256: manifest.sha256 };
}

function createManager(options) {
  const root = fs.realpathSync(options.root);
  const runnerTemp = fs.realpathSync(options.runnerTemp ?? process.env.RUNNER_TEMP);
  const state = path.resolve(options.state);
  check(contained(runnerTemp, state) && !contained(root, state), 'STATE_ROOT_NOT_OWNED');
  noSymlinks(state, runnerTemp);
  const clock = options.now ?? Date.now;
  const source =
    options.source ??
    (() =>
      sourceIdentity(root, options.head, {
        remaining: () => (cleanupDeadline === null ? QUICK_READ_MS : cleanupDeadline - clock()),
      }));
  const processInfo = options.processInfo ?? processIdentity;
  const groupInfo = options.processGroup ?? processGroup;
  const invoke = options.command ?? command;
  const filesystem = {
    unlink: fs.unlinkSync,
    rmdir: fs.rmdirSync,
    remove: (folder) => fs.rmSync(folder, { recursive: true }),
    ...(options.filesystem ?? {}),
  };
  let cleanupReceipt = null;
  let cleanupDeadline = null;
  let cleanupPhase = 'preflight';
  const docker = (args, requestedTimeout) => {
    const id =
      [...args].reverse().find((value) => IMAGE_ID.test(value) || CONTAINER_ID.test(value)) ?? null;
    const timeout =
      requestedTimeout ??
      (args[0] === 'image' && args[1] === 'rm'
        ? IMAGE_REMOVE_MS
        : args[0] === 'container' && ['rm', 'stop'].includes(args[1])
          ? CONTAINER_REMOVE_MS
          : QUICK_READ_MS);
    let event;
    let remaining =
      cleanupDeadline === null ? timeout : Math.min(timeout, cleanupDeadline - clock());
    if (cleanupReceipt) {
      check(cleanupReceipt.commands.length < 256, 'CLEANUP_COMMAND_CAP');
      event = {
        phase: cleanupPhase,
        operation: `${args[0]}:${args[1] ?? 'read'}`,
        resourceId: id,
        startedAt: clock(),
        timeoutMs: Math.max(0, remaining),
        outcome: 'pending',
        mutation: ['rm', 'stop'].includes(args[1]),
        effect: ['rm', 'stop'].includes(args[1]) ? 'not-started' : 'read-only',
        mutationStarted: false,
      };
      cleanupReceipt.commands.push(event);
      save(cleanupReceipt);
    }
    try {
      check(remaining > 0, 'CLEANUP_BUDGET_EXHAUSTED');
      if (cleanupReceipt && ['rm', 'stop'].includes(args[1])) {
        beforeDockerMutation(args, id);
        remaining = Math.min(timeout, cleanupDeadline - clock());
        check(remaining > 0, 'CLEANUP_BUDGET_EXHAUSTED');
        Object.assign(event, {
          boundaryVerifiedAt: clock(),
          commandStartedAt: clock(),
          timeoutMs: remaining,
          mutationStarted: true,
          effect: 'unknown',
        });
        save(cleanupReceipt);
      }
      const output = invoke(
        'docker',
        ['--config', path.join(state, 'docker-config'), '--context', 'default', ...args],
        { timeout: remaining },
      );
      if (event) {
        Object.assign(event, {
          outcome: 'passed',
          finishedAt: clock(),
          status: 0,
          signal: null,
          errorCode: null,
        });
        save(cleanupReceipt);
      }
      return output;
    } catch (error) {
      error.resourceOperation = {
        phase: cleanupPhase,
        operation: `${args[0]}:${args[1] ?? 'read'}`,
        resourceId: id,
        timeoutMs: Math.max(0, remaining),
        ...commandFailure(error),
      };
      if (event) {
        Object.assign(event, {
          outcome: 'failed',
          finishedAt: clock(),
          ...commandFailure(error),
        });
        save(cleanupReceipt);
      }
      throw error;
    }
  };
  const read = () => JSON.parse(fs.readFileSync(path.join(state, 'resources.json'), 'utf8'));
  const save = (receipt) => privateJson(path.join(state, 'resources.json'), receipt);
  const list = (kind) => {
    const args =
      kind === 'container'
        ? ['container', 'ls', '-aq', '--no-trunc']
        : [kind, 'ls', '-q', ...(kind === 'image' ? ['--no-trunc'] : [])];
    return [...new Set(docker(args).trim().split(/\s+/u).filter(Boolean))].sort();
  };
  const inventory = () =>
    Object.fromEntries(
      ['container', 'image', 'volume', 'network'].map((kind) => [`${kind}s`, list(kind)]),
    );
  const inspect = (kind, id) => {
    const values = JSON.parse(docker([kind, 'inspect', id]));
    check(values.length === 1 && (values[0].Id ?? values[0].Name) === id, 'INSPECT_ID_MISMATCH');
    return values[0];
  };
  const inspectPresent = (kind, id) => {
    try {
      return inspect(kind, id);
    } catch (error) {
      // --rm containers may disappear between list and inspect. A second
      // successful inventory is required before treating that as absence.
      if (!list(kind).includes(id)) return null;
      throw error;
    }
  };
  function context() {
    const info = JSON.parse(docker(['info', '--format', '{{json .}}']));
    const selected = JSON.parse(
      docker(['context', 'inspect', 'default', '--format', '{{json .}}']),
    );
    check(
      selected.Name === 'default' &&
        selected.Endpoints?.docker?.Host === 'unix:///var/run/docker.sock',
      'DOCKER_CONTEXT_NOT_LOCAL_DEFAULT',
    );
    check(
      typeof info.ID === 'string' && info.ID.length > 0 && info.OSType === 'linux',
      'DOCKER_SERVER_ID_MISSING',
    );
    check(
      Number.isFinite(info.MemTotal) &&
        info.MemTotal > 0 &&
        Number.isFinite(info.NCPU) &&
        info.NCPU > 0,
      'DOCKER_CAPACITY_MISSING',
    );
    return {
      id: info.ID,
      endpoint: selected.Endpoints.docker.Host,
      os: info.OSType,
      architecture: info.Architecture,
      version: info.ServerVersion,
      memoryBytes: info.MemTotal,
      cpus: info.NCPU,
    };
  }
  function bound(receipt) {
    check(
      receipt.schema === SCHEMA &&
        receipt.preflight === true &&
        receipt.source.head === options.head &&
        receipt.source.root === root,
      'MISSING_OR_MISMATCHED_PREFLIGHT',
    );
    check(json(source()) === json(receipt.source), 'SOURCE_IDENTITY_DRIFT');
    check(json(context()) === json(receipt.docker), 'DOCKER_CONTEXT_DRIFT');
  }
  function mutationBoundary(receipt, finalContext = true) {
    check(cleanupDeadline !== null && clock() < cleanupDeadline, 'CLEANUP_BUDGET_EXHAUSTED');
    bound(receipt);
    if (receipt.controller) {
      const current = processInfo(receipt.controller.pid);
      check(
        !current,
        sameProcess(current, receipt.controller)
          ? 'CONTROLLER_PROCESS_STILL_LIVE'
          : 'CONTROLLER_PROCESS_IDENTITY_DRIFT',
      );
    }
    check(
      json(list('volume')) === json(receipt.baseline.volumes) &&
        json(list('network')) === json(receipt.baseline.networks),
      'UNATTRIBUTED_VOLUME_OR_NETWORK_DRIFT',
    );
    if (finalContext) check(json(context()) === json(receipt.docker), 'DOCKER_CONTEXT_DRIFT');
    check(clock() < cleanupDeadline, 'CLEANUP_BUDGET_EXHAUSTED');
  }
  function beforeDockerMutation(args, id) {
    const receipt = cleanupReceipt;
    mutationBoundary(receipt, false);
    if (args[0] === 'image') {
      const entry = receipt.images.find((value) => value.id === id);
      check(entry && !receipt.baseline.images.includes(id), 'IMAGE_NOT_OWNED');
      const image = inspect('image', id);
      validateImage(image, receipt.source, receipt.manifests);
      const labels = Object.fromEntries(
        Object.entries(image.Config.Labels ?? {}).filter(([key]) => key.startsWith(PREFIX)),
      );
      check(
        json(image.RepoTags ?? []) === json(entry.tags) &&
          json(labels) === json(entry.labels) &&
          entry.tags.length === 1,
        'IMAGE_SHARED_OR_CHANGED',
      );
      if (entry.kind === 'dependency') {
        const present = list('image');
        check(
          !receipt.images.some(
            (candidate) =>
              candidate.kind === 'candidate' &&
              candidate.labels[`${PREFIX}dependency-image-id`] === id &&
              present.includes(candidate.id),
          ),
          'IMAGE_DEPENDENT_RETAINED',
        );
      }
      for (const containerId of list('container'))
        check(inspect('container', containerId).Image !== id, 'IMAGE_STILL_REFERENCED');
    } else {
      const container = inspect('container', id);
      const entry = receipt.containers.find((value) => value.id === id);
      if (entry) {
        check(
          json(
            validateContainer(
              container,
              receipt.source,
              receipt.manifests,
              [inspect('image', entry.imageId)],
              receipt.baseline,
            ),
          ) === json(entry),
          'CONTAINER_CHANGED_BEFORE_REMOVAL',
        );
      } else {
        const smoke = receipt.smokes.find((value) => value.record.id === id && value.record.bound);
        check(smoke, 'CONTAINER_NOT_OWNED');
        const folder = path.join(root, '.local/e2e-release/smoke', smoke.nonce);
        const file = path.join(folder, 'receipt.json');
        const cid = path.join(folder, 'container.cid');
        noSymlinks(file, root);
        noSymlinks(cid, root);
        const stat = fs.statSync(folder);
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        check(
          stat.ino === smoke.inode &&
            stat.dev === smoke.device &&
            json(record) === json(smoke.record) &&
            readCid(cid) === id,
          'SMOKE_RECEIPT_DRIFT',
        );
        validateSmokeReceipt(record, receipt.source, receipt.controller, receipt.docker.id);
        validateSmoke(container, record);
      }
      if (args[1] === 'rm') check(container.State?.Running === false, 'CONTAINER_STILL_RUNNING');
    }
    // Context can also change while inspecting an otherwise identical portable image.
    check(json(context()) === json(receipt.docker), 'DOCKER_CONTEXT_DRIFT');
    check(clock() < cleanupDeadline, 'CLEANUP_BUDGET_EXHAUSTED');
  }
  function captureManifests(receipt) {
    const directory = path.join(root, '.local/e2e-release/build');
    if (!fs.existsSync(directory)) return;
    noSymlinks(directory, root);
    for (const runId of fs.readdirSync(directory)) {
      const folder = path.join(directory, runId);
      noSymlinks(folder, root);
      const file = path.join(folder, 'candidate-manifest.json');
      if (!fs.existsSync(file)) continue;
      noSymlinks(file, root);
      const raw = fs.readFileSync(file);
      let manifest;
      try {
        manifest = JSON.parse(raw);
      } catch {
        continue;
      }
      const candidate = manifest.candidate;
      check(
        manifest.kind === 'tiangong-next-release-e2e-candidate' &&
          manifest.schemaVersion === 6 &&
          manifest.repository?.canonical === 'tiangong-lca/platform',
        'MANIFEST_KIND_MISMATCH',
      );
      check(
        candidate?.commit === receipt.source.head &&
          candidate.tree === receipt.source.tree &&
          candidate.dependencyLockSha256 === receipt.source.files['pnpm-lock.yaml'] &&
          candidate.packageJsonSha256 === receipt.source.files['package.json'] &&
          candidate.pnpmWorkspaceSha256 === receipt.source.files['pnpm-workspace.yaml'] &&
          candidate.maintainedPatchesSha256 === receipt.source.maintainedPatchesSha256 &&
          JSON.stringify(candidate.maintainedPatches) ===
            JSON.stringify(receipt.source.maintainedPatches),
        'MANIFEST_SOURCE_MISMATCH',
      );
      check(
        manifest.environment?.frontendTarget === 'qualification' &&
          manifest.environment.contractSha256 ===
            receipt.source.files['docker/e2e/environment.json'] &&
          manifest.environment.dockerfileSha256 === receipt.source.files['docker/e2e/Dockerfile'],
        'MANIFEST_ENVIRONMENT_MISMATCH',
      );
      check(
        runId.endsWith(receipt.source.head.slice(0, 12)) &&
          /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{12}$/u.test(runId),
        'MANIFEST_RUN_ID_MISMATCH',
      );
      const stat = fs.statSync(folder);
      const entry = { runId, sha256: sha(raw), inode: stat.ino, device: stat.dev };
      const old = receipt.manifests.find((value) => value.runId === runId);
      check(!old || json(old) === json(entry), 'MANIFEST_REPLACED');
      if (!old) receipt.manifests.push(entry);
    }
  }
  function captureSmokes(receipt, strict = false) {
    const parent = path.join(root, '.local/e2e-release/smoke');
    if (!fs.existsSync(parent)) return;
    noSymlinks(parent, root);
    for (const nonce of fs.readdirSync(parent)) {
      check(/^[a-f0-9-]{36}$/u.test(nonce), 'SMOKE_DIRECTORY_MISMATCH');
      const folder = path.join(parent, nonce);
      noSymlinks(folder, root);
      const file = path.join(folder, 'receipt.json');
      noSymlinks(file, root);
      if (!fs.existsSync(file)) {
        check(!strict, 'SMOKE_RECEIPT_MISSING');
        continue;
      }
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (record.id) {
        const cid = path.join(folder, 'container.cid');
        noSymlinks(cid, root);
        check(readCid(cid) === record.id, 'SMOKE_CID_DRIFT');
      }
      validateSmokeReceipt(record, receipt.source, receipt.controller, receipt.docker.id);
      check(
        record.nonce === nonce && record.createdAt >= receipt.startedAt,
        'SMOKE_INTENT_NOT_FRESH',
      );
      const image = receipt.images.find(
        (entry) => entry.id === record.imageId && entry.kind === 'dependency',
      );
      check(image, 'SMOKE_DEPENDENCY_NOT_OBSERVED');
      const stat = fs.statSync(folder);
      const selected = { nonce, inode: stat.ino, device: stat.dev, record };
      const index = receipt.smokes.findIndex((entry) => entry.nonce === nonce);
      if (index >= 0) {
        const old = receipt.smokes[index];
        check(
          old.inode === selected.inode &&
            ['root', 'head', 'tree', 'imageId', 'inputSha256', 'createdAt', 'controller'].every(
              (key) => json(old.record[key]) === json(record[key]),
            ) &&
            old.device === selected.device &&
            (!old.record.id || old.record.id === record.id) &&
            (!old.record.bound || record.bound),
          'SMOKE_IDENTITY_DRIFT',
        );
        receipt.smokes[index] = selected;
      } else receipt.smokes.push(selected);
    }
  }
  function observe(receipt = read()) {
    if (!cleanupReceipt) cleanupPhase = 'observation';
    bound(receipt);
    captureManifests(receipt);
    const lockFile = path.join(root, '.local/e2e-release/invocation.lock/owner.json');
    if (fs.existsSync(lockFile)) {
      noSymlinks(lockFile, root);
      const raw = fs.readFileSync(lockFile);
      const owner = JSON.parse(raw);
      check(
        owner.command === 'qualify' &&
          owner.hostname === os.hostname() &&
          Date.parse(owner.startedAt) >= receipt.startedAt &&
          /^[a-f0-9-]{36}$/u.test(owner.nonce),
        'CONTROLLER_LOCK_MISMATCH',
      );
      const identity = processInfo(owner.pid);
      if (identity) {
        check(identity.cwd === root && identity.canonicalQualifier, 'CONTROLLER_PROCESS_MISMATCH');
        const entry = { ...identity, lockSha256: sha(raw) };
        check(
          !receipt.controller || json(receipt.controller) === json(entry),
          'CONTROLLER_PROCESS_DRIFT',
        );
        receipt.controller = entry;
        const fileStat = fs.lstatSync(lockFile);
        const directoryStat = fs.lstatSync(path.dirname(lockFile));
        check(fileStat.isFile() && directoryStat.isDirectory(), 'INVOCATION_LOCK_TYPE_MISMATCH');
        const selected = {
          owner: { inode: fileStat.ino, device: fileStat.dev, sha256: sha(raw) },
          directory: { inode: directoryStat.ino, device: directoryStat.dev },
        };
        check(
          !receipt.invocationLock || json(receipt.invocationLock) === json(selected),
          'INVOCATION_LOCK_IDENTITY_DRIFT',
        );
        receipt.invocationLock = selected;
      }
    }
    const current = inventory();
    const images = [];
    for (const id of current.images) {
      const image = inspectPresent('image', id);
      if (!image) continue;
      check(IMAGE_ID.test(image.Id), 'INVALID_IMAGE_ID');
      for (const reference of receipt.source.baseImages) {
        const canonicalReference = canonicalDigestReference(reference);
        if (
          canonicalReference &&
          image.RepoDigests?.some(
            (digest) => canonicalDigestReference(digest) === canonicalReference,
          ) &&
          !receipt.baseImages.some((entry) => entry.reference === reference)
        )
          receipt.baseImages.push({
            reference,
            canonicalReference,
            id: image.Id,
            digests: image.RepoDigests,
          });
      }
      const labels = image.Config?.Labels ?? {};
      if (labels[CANDIDATE] !== 'true' && labels[DEPENDENCY] !== 'true') continue;
      if (labels[CANDIDATE] === 'true' && labels[`${PREFIX}candidate-tree`] !== receipt.source.tree)
        continue;
      // Other jobs' dependency images are not adopted from a generic label.
      if (
        labels[DEPENDENCY] === 'true' &&
        labels[`${PREFIX}dependency-lock-sha256`] !== receipt.source.files['pnpm-lock.yaml']
      )
        continue;
      const kindHint = labels[DEPENDENCY] === 'true' ? 'dependency' : 'candidate';
      // BuildKit can expose an intermediate image before assigning the final tag.
      if (!image.RepoTags?.includes(expectedImageTag(receipt.source, kindHint))) continue;
      const kind = validateImage(image, receipt.source, receipt.manifests);
      images.push(image);
      const selected = {
        id,
        kind,
        labels: Object.fromEntries(
          Object.entries(labels).filter(([key]) => key.startsWith(PREFIX)),
        ),
        tags: image.RepoTags ?? [],
        digests: image.RepoDigests ?? [],
      };
      const old = receipt.images.find((entry) => entry.id === id);
      check(!old || json(old) === json(selected), 'IMAGE_IDENTITY_DRIFT');
      if (!old) receipt.images.push(selected);
    }
    captureSmokes(receipt);
    for (const id of current.containers) {
      if (receipt.baseline.containers.includes(id)) continue;
      const container = inspectPresent('container', id);
      if (!container) continue;
      if (container.Config?.Labels?.[SMOKE] === 'true') {
        const owned = receipt.smokes.find((entry) => entry.record.id === id && entry.record.bound);
        if (owned) validateSmoke(container, owned.record);
        else receipt.ambiguousContainers = [...new Set([...receipt.ambiguousContainers, id])];
        continue;
      }
      if (container.Config?.Labels?.[CANDIDATE] !== 'true') {
        if (images.some((image) => image.Id === container.Image))
          receipt.ambiguousContainers = [...new Set([...receipt.ambiguousContainers, id])];
        continue;
      }
      const mounts = container.Mounts ?? [];
      if (
        !mounts.some((mount) =>
          contained(path.join(root, '.local/e2e-release/runs'), mount.Source ?? ''),
        )
      )
        continue;
      const selected = validateContainer(
        container,
        receipt.source,
        receipt.manifests,
        images,
        receipt.baseline,
      );
      const old = receipt.containers.find((entry) => entry.id === id);
      check(!old || json(old) === json(selected), 'CONTAINER_IDENTITY_DRIFT');
      if (!old) receipt.containers.push(selected);
    }
    receipt.observations += 1;
    receipt.lastObservedAt = clock();
    receipt.lastInventory = current;
    save(receipt);
    return receipt;
  }
  function start() {
    check(!fs.existsSync(state), 'STATE_ALREADY_EXISTS');
    fs.mkdirSync(state, { mode: 0o700 });
    try {
      fs.mkdirSync(path.join(state, 'docker-config'), { mode: 0o700 });
      privateJson(path.join(state, 'docker-config/config.json'), {});
      const identity = source();
      check(identity.head === options.head && identity.root === root, 'HEAD_MISMATCH');
      const runtime = path.join(root, '.local/e2e-release');
      for (const name of ['runs', 'build', 'environment-build', 'invocation.lock', 'smoke']) {
        const file = path.join(runtime, name);
        noSymlinks(file, root);
        check(
          !fs.existsSync(file) ||
            (fs.statSync(file).isDirectory() && fs.readdirSync(file).length === 0),
          'PREEXISTING_RUNTIME_RESOURCE',
        );
      }
      const baseline = inventory();
      for (const id of baseline.containers)
        check(
          inspect('container', id).Config?.Labels?.[CANDIDATE] !== 'true',
          'PREEXISTING_CONTROLLER_CONTAINER',
        );
      for (const id of baseline.images) {
        const image = inspect('image', id);
        check(
          !(
            image.Config?.Labels?.[CANDIDATE] === 'true' &&
            image.Config.Labels[`${PREFIX}candidate-tree`] === identity.tree
          ),
          'PREEXISTING_CANDIDATE_IMAGE',
        );
      }
      const versions = JSON.parse(docker(['version', '--format', '{{json .}}']));
      check(
        typeof versions.Client?.Version === 'string' &&
          typeof versions.Server?.Version === 'string',
        'DOCKER_VERSION_MISSING',
      );
      const pnpmVersion = invoke('pnpm', ['--version']).trim();
      check(pnpmVersion === '11.24.0' && process.version === 'v24.19.0', 'HOST_TOOLCHAIN_MISMATCH');
      const disk = (options.capacity ?? (() => fs.statfsSync(root)))();
      check(Number(disk.bavail) > 0 && Number(disk.bsize) > 0, 'DISK_CAPACITY_MISSING');
      const receipt = {
        schema: SCHEMA,
        nonce: crypto.randomUUID(),
        preflight: true,
        source: identity,
        startedAt: clock(),
        docker: context(),
        tools: {
          node: process.version,
          pnpm: pnpmVersion,
          dockerClient: versions.Client?.Version,
          dockerServer: versions.Server?.Version,
        },
        capacity: {
          hostMemoryBytes: os.totalmem(),
          freeMemoryBytes: os.freemem(),
          freeDiskBytes: Number(disk.bavail) * Number(disk.bsize),
        },
        baseline,
        images: [],
        baseImages: [],
        containers: [],
        manifests: [],
        ambiguousContainers: [],
        smokes: [],
        commands: [],
        invocationLock: null,
        observations: 0,
        errors: [],
        complete: false,
        retained: {
          preexisting: baseline,
          publicBaseImages: identity.baseImages,
          buildkitCache:
            'retained: not attributable; no cache prune permitted; BuildKit-only base image IDs are not claimed as observed Docker images',
          volumesAndNetworks:
            'controller declares no named volume or network creation; unexpected mounts fail closed',
        },
      };
      save(receipt);
      return receipt;
    } catch (error) {
      privateJson(path.join(state, 'failure.json'), {
        schema: SCHEMA,
        phase: 'preflight',
        code: failureCode(error),
        operation: error.resourceOperation ?? null,
        at: clock(),
      });
      throw error;
    }
  }
  function pathReadback(file) {
    try {
      const stat = fs.lstatSync(file);
      const value = {
        exists: true,
        inode: stat.ino,
        device: stat.dev,
        kind: stat.isSymbolicLink()
          ? 'symlink'
          : stat.isDirectory()
            ? 'directory'
            : stat.isFile()
              ? 'file'
              : 'other',
      };
      if (stat.isDirectory() && !stat.isSymbolicLink())
        value.entryCount = fs.readdirSync(file).length;
      return value;
    } catch (error) {
      return error.code === 'ENOENT'
        ? { exists: false }
        : { exists: null, errorCode: failureCode(error) };
    }
  }
  function filesystemEffect(operation, resourceId, file, validate, execute, binding = null) {
    check(cleanupReceipt.commands.length < 256, 'CLEANUP_COMMAND_CAP');
    const event = {
      phase: cleanupPhase,
      operation: `filesystem:${operation}`,
      resourceId,
      resourceBinding: binding,
      startedAt: clock(),
      remainingBudgetMs: Math.max(0, cleanupDeadline - clock()),
      outcome: 'pending',
      mutation: true,
      mutationStarted: false,
      effect: 'not-started',
    };
    cleanupReceipt.commands.push(event);
    save(cleanupReceipt);
    try {
      mutationBoundary(cleanupReceipt);
      validate();
      check(clock() < cleanupDeadline, 'CLEANUP_BUDGET_EXHAUSTED');
      Object.assign(event, {
        boundaryVerifiedAt: clock(),
        commandStartedAt: clock(),
        remainingBudgetMs: cleanupDeadline - clock(),
        mutationStarted: true,
        effect: 'unknown',
      });
      save(cleanupReceipt);
      execute();
      event.readback = pathReadback(file);
      if (binding && operation === 'unlink') {
        event.parentReadback = pathReadback(path.dirname(file));
        check(
          event.parentReadback.exists === true &&
            event.parentReadback.inode === binding.directory.inode &&
            event.parentReadback.device === binding.directory.device,
          'INVOCATION_LOCK_IDENTITY_DRIFT',
        );
      }
      check(event.readback.exists === false, 'FILESYSTEM_EFFECT_NOT_VERIFIED');
      check(clock() <= cleanupDeadline, 'CLEANUP_BUDGET_EXHAUSTED');
      Object.assign(event, {
        outcome: 'passed',
        effect: 'verified-absent',
        finishedAt: clock(),
        status: 0,
        signal: null,
        errorCode: null,
      });
      save(cleanupReceipt);
    } catch (error) {
      Object.assign(event, {
        outcome: 'failed',
        readback: pathReadback(file),
        parentReadback: binding ? pathReadback(path.dirname(file)) : null,
        finishedAt: clock(),
        status: null,
        signal: null,
        errorCode: failureCode(error),
      });
      error.resourceOperation = {
        phase: cleanupPhase,
        operation: event.operation,
        resourceId,
        remainingBudgetMs: Math.max(0, cleanupDeadline - clock()),
        status: null,
        signal: null,
        errorCode: failureCode(error),
      };
      save(cleanupReceipt);
      throw error;
    }
  }
  function removeFilesystem(folder, resourceId, validate) {
    filesystemEffect(
      'remove',
      resourceId,
      folder,
      () => {
        noSymlinks(folder, root);
        validate();
      },
      () => filesystem.remove(folder),
    );
  }
  function cleanupInvocationLock(receipt) {
    const directory = path.join(root, '.local/e2e-release/invocation.lock');
    const ownerFile = path.join(directory, 'owner.json');
    if (!fs.existsSync(directory)) return;
    const binding = receipt.invocationLock;
    const directoryMatches = () => {
      noSymlinks(directory, root);
      check(binding, 'UNOBSERVED_CONTROLLER_LOCK_RETAINED');
      const stat = fs.lstatSync(directory);
      check(
        stat.isDirectory() &&
          stat.ino === binding.directory.inode &&
          stat.dev === binding.directory.device,
        'INVOCATION_LOCK_IDENTITY_DRIFT',
      );
    };
    const unlinked = () =>
      receipt.commands.some(
        (entry) =>
          entry.operation === 'filesystem:unlink' &&
          entry.resourceId === 'invocation.lock/owner.json' &&
          entry.outcome === 'passed' &&
          json(entry.resourceBinding) === json(binding),
      );
    cleanupPhase = 'invocation-lock-unlink';
    if (fs.existsSync(ownerFile))
      filesystemEffect(
        'unlink',
        'invocation.lock/owner.json',
        ownerFile,
        () => {
          directoryMatches();
          noSymlinks(ownerFile, root);
          const stat = fs.lstatSync(ownerFile);
          const raw = fs.readFileSync(ownerFile);
          check(
            stat.isFile() &&
              stat.ino === binding.owner.inode &&
              stat.dev === binding.owner.device &&
              sha(raw) === binding.owner.sha256 &&
              receipt.controller?.lockSha256 === binding.owner.sha256,
            'INVOCATION_LOCK_IDENTITY_DRIFT',
          );
          check(!processInfo(JSON.parse(raw).pid), 'CONTROLLER_PROCESS_STILL_LIVE');
          check(
            json(fs.readdirSync(directory).sort()) === json(['owner.json']),
            'INVOCATION_LOCK_NEW_ENTRIES',
          );
        },
        () => filesystem.unlink(ownerFile),
        binding,
      );
    cleanupPhase = 'invocation-lock-rmdir';
    filesystemEffect(
      'rmdir',
      'invocation.lock',
      directory,
      () => {
        directoryMatches();
        check(unlinked(), 'INVOCATION_LOCK_UNLINK_NOT_VERIFIED');
        check(
          !fs.existsSync(ownerFile) && fs.readdirSync(directory).length === 0,
          'INVOCATION_LOCK_NEW_ENTRIES',
        );
      },
      () => filesystem.rmdir(directory),
      binding,
    );
  }
  function finish() {
    let receipt = read();
    cleanupReceipt = receipt;
    cleanupDeadline = clock() + CLEANUP_TOTAL_MS;
    cleanupPhase = 'cleanup-observation';
    try {
      receipt = observe(receipt);
      if (receipt.controller) {
        const currentController = processInfo(receipt.controller.pid);
        check(
          !currentController,
          sameProcess(currentController, receipt.controller)
            ? 'CONTROLLER_PROCESS_STILL_LIVE'
            : 'CONTROLLER_PROCESS_IDENTITY_DRIFT',
        );
      }
      cleanupInvocationLock(receipt);
      const current = inventory();
      receipt.removed = { containers: [], images: [], buildContexts: [] };
      captureSmokes(receipt, true);
      for (const entry of receipt.smokes) {
        cleanupPhase = 'smoke-recovery';
        if (!entry.record.cleanupComplete) {
          const file = path.join(root, '.local/e2e-release/smoke', entry.nonce, 'receipt.json');
          const cidFile = path.join(path.dirname(file), 'container.cid');
          noSymlinks(cidFile, root);
          if (fs.existsSync(cidFile)) {
            const id = readCid(cidFile);
            check(!entry.record.id || entry.record.id === id, 'SMOKE_CID_DRIFT');
            entry.record.id = id;
          }
          cleanupSmoke(entry.record, docker, () => {
            privateJson(file, entry.record);
            save(receipt);
          });
        }
        check(entry.record.cleanupComplete, 'SMOKE_CLEANUP_NOT_VERIFIED');
      }
      check(
        receipt.ambiguousContainers.every(
          (id) =>
            receipt.containers.some((entry) => entry.id === id) ||
            receipt.smokes.some((entry) => entry.record.id === id && entry.record.bound),
        ),
        'UNATTRIBUTABLE_CONTAINER_OBSERVED',
      );
      cleanupPhase = 'container-removal';
      for (const entry of receipt.containers) {
        if (!current.containers.includes(entry.id)) continue;
        const container = inspectPresent('container', entry.id);
        if (!container) continue;
        if (container.State?.Running) {
          docker(['container', 'stop', '--time', '5', entry.id]);
          if (!inspectPresent('container', entry.id)) continue;
        }
        docker(['container', 'rm', entry.id]);
        receipt.removed.containers.push(entry.id);
        save(receipt);
      }
      const orderedImages = [...receipt.images].sort(
        (left, right) => Number(left.kind === 'dependency') - Number(right.kind === 'dependency'),
      );
      for (const entry of orderedImages.filter((value) => value.kind === 'candidate'))
        check(
          receipt.images.some(
            (dependency) =>
              dependency.kind === 'dependency' &&
              dependency.id === entry.labels[`${PREFIX}dependency-image-id`],
          ),
          'IMAGE_DEPENDENCY_NOT_OBSERVED',
        );
      for (const entry of orderedImages) {
        cleanupPhase = 'image-preflight';
        if (receipt.baseline.images.includes(entry.id) || !inventory().images.includes(entry.id))
          continue;
        cleanupPhase = 'image-removal';
        docker(['image', 'rm', entry.id]);
        receipt.removed.images.push(entry.id);
        save(receipt);
      }
      for (const entry of receipt.manifests) {
        const folder = path.join(root, '.local/e2e-release/build', entry.runId);
        if (!fs.existsSync(folder)) continue;
        cleanupPhase = 'build-context-removal';
        removeFilesystem(folder, entry.runId, () => {
          const stat = fs.statSync(folder);
          check(
            stat.ino === entry.inode &&
              stat.dev === entry.device &&
              sha(fs.readFileSync(path.join(folder, 'candidate-manifest.json'))) === entry.sha256,
            'BUILD_CONTEXT_CHANGED',
          );
        });
        receipt.removed.buildContexts.push(entry.runId);
      }
      const environmentBuild = path.join(root, '.local/e2e-release/environment-build');
      if (fs.existsSync(environmentBuild)) {
        cleanupPhase = 'environment-context-removal';
        removeFilesystem(environmentBuild, 'environment-build', () => {
          for (const [file, expected] of Object.entries({
            'package.json': receipt.source.files['package.json'],
            'pnpm-lock.yaml': receipt.source.files['pnpm-lock.yaml'],
            'pnpm-workspace.yaml': receipt.source.files['pnpm-workspace.yaml'],
            Dockerfile: receipt.source.files['docker/e2e/Dockerfile'],
            ...Object.fromEntries(
              receipt.source.maintainedPatches.map((entry) => [entry.path, entry.sha256]),
            ),
          })) {
            noSymlinks(path.join(environmentBuild, file), root);
            check(
              sha(fs.readFileSync(path.join(environmentBuild, file))) === expected,
              'DEPENDENCY_CONTEXT_CHANGED',
            );
          }
        });
      }
      const remainingBuild = path.join(root, '.local/e2e-release/build');
      check(
        !fs.existsSync(remainingBuild) || fs.readdirSync(remainingBuild).length === 0,
        'UNATTRIBUTED_BUILD_CONTEXT_RETAINED',
      );
      cleanupPhase = 'cleanup-verification';
      bound(receipt);
      receipt.finalInventory = inventory();
      check(
        !receipt.containers.some((entry) => receipt.finalInventory.containers.includes(entry.id)),
        'CONTAINER_LEAK',
      );
      check(
        !receipt.images.some(
          (entry) =>
            !receipt.baseline.images.includes(entry.id) &&
            receipt.finalInventory.images.includes(entry.id),
        ),
        'IMAGE_LEAK',
      );
      check(
        json(receipt.finalInventory.volumes) === json(receipt.baseline.volumes) &&
          json(receipt.finalInventory.networks) === json(receipt.baseline.networks),
        'UNATTRIBUTED_VOLUME_OR_NETWORK_DRIFT',
      );
      bound(receipt);
      receipt.complete = true;
    } catch (error) {
      receipt.errors.push(failureCode(error));
      receipt.failure = {
        phase: cleanupPhase,
        code: failureCode(error),
        operation: error.resourceOperation ?? null,
        at: clock(),
      };
    }
    cleanupReceipt = null;
    cleanupDeadline = null;
    receipt.finishedAt = clock();
    save(receipt);
    return receipt;
  }
  function verify() {
    const receipt = read();
    bound(receipt);
    check(
      receipt.complete && receipt.errors.length === 0 && receipt.observations > 0,
      'CLEANUP_NOT_VERIFIED',
    );
    check(
      receipt.containers.length > 0 &&
        receipt.images.some((entry) => entry.kind === 'candidate') &&
        receipt.images.some((entry) => entry.kind === 'dependency'),
      'ACTUAL_RUNTIME_OBSERVATION_MISSING',
    );
    for (const entry of receipt.smokes) {
      const folder = path.join(root, '.local/e2e-release/smoke', entry.nonce);
      const file = path.join(folder, 'receipt.json');
      noSymlinks(file, root);
      const stat = fs.statSync(folder);
      const cid = path.join(folder, 'container.cid');
      noSymlinks(cid, root);
      check(readCid(cid) === entry.record.id, 'SMOKE_CID_DRIFT');
      check(
        stat.ino === entry.inode &&
          stat.dev === entry.device &&
          json(JSON.parse(fs.readFileSync(file, 'utf8'))) === json(entry.record),
        'SMOKE_RECEIPT_DRIFT',
      );
    }
    check(
      receipt.smokes.length > 0 &&
        receipt.smokes.every((entry) => entry.record.cleanupComplete && entry.record.bound),
      'SMOKE_LIFECYCLE_MISSING',
    );
    check(!receipt.observer || !processInfo(receipt.observer.pid), 'OBSERVER_STILL_LIVE');
    check(
      !receipt.observer || groupInfo(receipt.observer.pid).length === 0,
      'OBSERVER_CHILD_GROUP_RETAINED',
    );
    const current = inventory();
    check(
      !fs.existsSync(path.join(root, '.local/e2e-release/invocation.lock')),
      'CONTROLLER_LOCK_RETAINED',
    );
    const build = path.join(root, '.local/e2e-release/build');
    check(!fs.existsSync(build) || fs.readdirSync(build).length === 0, 'BUILD_CONTEXT_RETAINED');
    check(
      !fs.existsSync(path.join(root, '.local/e2e-release/environment-build')),
      'DEPENDENCY_CONTEXT_RETAINED',
    );
    check(
      !receipt.containers.some((entry) => current.containers.includes(entry.id)),
      'CONTAINER_LEAK',
    );
    check(
      !receipt.images.some(
        (entry) => !receipt.baseline.images.includes(entry.id) && current.images.includes(entry.id),
      ),
      'IMAGE_LEAK',
    );
    check(
      json(current.volumes) === json(receipt.baseline.volumes) &&
        json(current.networks) === json(receipt.baseline.networks),
      'UNATTRIBUTED_VOLUME_OR_NETWORK_DRIFT',
    );
    return receipt;
  }
  return { start, observe, finish, verify, read, save, processInfo };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(argv) {
  const action = argv.shift();
  const values = {};
  while (argv.length) {
    const key = argv.shift();
    check(
      ['--root', '--state', '--head', '--nonce'].includes(key) && argv.length && !values[key],
      'INVALID_ARGUMENTS',
    );
    values[key] = argv.shift();
  }
  check(['start', 'observe', 'finish', 'verify'].includes(action), 'INVALID_ACTION');
  check(process.platform === 'linux', 'HOSTED_LINUX_REQUIRED');
  const options = { root: values['--root'], state: values['--state'], head: values['--head'] };
  const manager = createManager(options);
  if (action === 'start') {
    const receipt = manager.start();
    const child = spawn(
      process.execPath,
      [
        __filename,
        'observe',
        '--root',
        options.root,
        '--state',
        options.state,
        '--head',
        options.head,
        '--nonce',
        receipt.nonce,
      ],
      { cwd: options.root, detached: true, stdio: 'ignore' },
    );
    child.unref();
    const launched = manager.processInfo(child.pid);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await wait(100);
        const current = manager.read();
        if (current.observer && current.observations > 0) return;
        check(manager.processInfo(child.pid), 'OBSERVER_START_FAILED');
      }
      throw new Error('OBSERVER_START_TIMEOUT');
    } catch (error) {
      privateJson(path.join(options.state, 'stop.json'), { nonce: receipt.nonce });
      const expected = manager.read().observer ?? launched;
      if (expected) await stopObserver(expected);
      throw error;
    }
  }
  if (action === 'observe') {
    const receipt = manager.read();
    check(receipt.nonce === values['--nonce'], 'LEASE_NONCE_MISMATCH');
    receipt.observer = manager.processInfo(process.pid);
    check(
      receipt.observer?.cwd === fs.realpathSync(options.root) &&
        receipt.observer.group === process.pid,
      'OBSERVER_CWD_OR_GROUP_MISMATCH',
    );
    manager.save(receipt);
    const deadline = receipt.startedAt + 95 * 60 * 1000;
    while (Date.now() < deadline) {
      const stop = path.join(options.state, 'stop.json');
      if (fs.existsSync(stop)) {
        check(
          JSON.parse(fs.readFileSync(stop, 'utf8')).nonce === receipt.nonce,
          'STOP_NONCE_MISMATCH',
        );
        return;
      }
      try {
        manager.observe();
      } catch (error) {
        const current = manager.read();
        current.errors.push(failureCode(error));
        current.failure = {
          phase: 'observation',
          code: failureCode(error),
          operation: error.resourceOperation ?? null,
          at: Date.now(),
        };
        manager.save(current);
      }
      await wait(500);
    }
    const current = manager.read();
    current.errors.push('OBSERVER_LEASE_EXPIRED');
    manager.save(current);
    manager.finish();
    return;
  }
  if (action === 'finish') {
    const receipt = manager.read();
    check(receipt.observer, 'OBSERVER_PREFLIGHT_MISSING');
    privateJson(path.join(options.state, 'stop.json'), { nonce: receipt.nonce });
    await stopObserver(receipt.observer);
    const result = manager.finish();
    check(result.complete && result.errors.length === 0, 'RESOURCE_CLEANUP_FAILED');
    return;
  }
  manager.verify();
}

module.exports = {
  CANDIDATE,
  DEPENDENCY,
  SCHEMA,
  createManager,
  dependencyLabels,
  expectedImageTag,
  validateImage,
  validateContainer,
  sameProcess,
  stopObserver,
  canonicalDigestReference,
};
if (require.main === module)
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'Browser resource boundary failed; inspect the selected resources.json receipt.\n',
    );
    process.exitCode = 1;
  });
