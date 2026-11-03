import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const {
  CANDIDATE,
  createManager,
  dependencyLabels,
  expectedImageTag,
  validateContainer,
  validateImage,
  sameProcess,
  stopObserver,
  canonicalDigestReference,
} = require('../../../scripts/qualification/supabase-browser-resources.cjs');

const {
  SMOKE_SOURCE,
  smokeIdentity,
  smokeLabels,
} = require('../../../scripts/e2e/environment-smoke.cjs');

const digest = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const id = (letter: string) => letter.repeat(64);
const prefix = 'org.tiangong.lca.next.';
const directories: string[] = [];
afterEach(() => {
  directories
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

function fixture() {
  // The observer deliberately requires canonical owned paths. macOS may expose
  // os.tmpdir() through /var while realpath resolves that parent to /private/var.
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-browser-resource-test-')),
  );
  directories.push(directory);
  const root = path.join(directory, 'checkout');
  const runnerTemp = path.join(directory, 'runner');
  fs.mkdirSync(root);
  fs.mkdirSync(runnerTemp);
  const state = path.join(runnerTemp, 'owned');
  const source = {
    maintainedPatches: [] as { package: string; path: string; sha256: string }[],
    maintainedPatchesSha256: digest('[]\n'),
    root,
    head: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    files: {
      'package.json': id('1'),
      'pnpm-lock.yaml': id('2'),
      'pnpm-workspace.yaml': id('3'),
      'docker/e2e/environment.json': id('4'),
      'docker/e2e/Dockerfile': id('5'),
    },
    baseImages: [`public/playwright@sha256:${id('6')}`, `public/node@sha256:${id('7')}`],
  };
  const containers = new Map();
  const images = new Map();
  const volumes = new Set(['preexisting-volume']);
  const networks = new Set(['preexisting-network']);
  const commands: string[][] = [];
  let serverId = 'owned-daemon';
  let ignoreRemoval = false;
  let logicalClock = Date.now();
  let expireRead = false;
  let controllerProcess: any = null;
  let afterCommand: { operation: string; callback: () => void } | null = null;
  const filesystemCalls: string[] = [];
  const filesystemActions: Record<string, (file: string) => void> = {};
  let failure: { operation: string; error: any } | null = null;
  const invoke = (program: string, args: string[]) => {
    if (program === 'pnpm') return '11.24.0\n';
    expect(program).toBe('docker');
    expect(args.slice(0, 4)).toEqual([
      '--config',
      path.join(state, 'docker-config'),
      '--context',
      'default',
    ]);
    const actual = args.slice(4);
    commands.push(actual);
    if (expireRead) {
      logicalClock += 300001;
      expireRead = false;
    }
    if (failure?.operation === `${actual[0]}:${actual[1]}`) {
      const selected = failure;
      failure = null;
      throw selected.error;
    }
    if (actual[0] === 'version')
      return JSON.stringify({ Client: { Version: '28.0.0' }, Server: { Version: '28.0.0' } });
    if (actual[0] === 'info')
      return JSON.stringify({
        ID: serverId,
        OSType: 'linux',
        Architecture: 'x86_64',
        ServerVersion: '28.0.0',
        MemTotal: 8e9,
        NCPU: 4,
      });
    if (actual[0] === 'context')
      return JSON.stringify({
        Name: 'default',
        Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } },
      });
    if (actual[1] === 'ls') {
      const keys =
        actual[0] === 'container'
          ? containers.keys()
          : actual[0] === 'image'
            ? images.keys()
            : actual[0] === 'volume'
              ? volumes.keys()
              : networks.keys();
      return [...keys].join('\n');
    }
    const store = actual[0] === 'container' ? containers : images;
    if (actual[1] === 'inspect') {
      assert.ok(store.has(actual[2]), 'fake Docker inspect requires an existing exact ID');
      return JSON.stringify([store.get(actual[2])]);
    }
    if (actual[1] === 'stop') {
      const selected = actual[actual.length - 1];
      containers.get(selected).State.Running = false;
      if (afterCommand?.operation === 'container:stop') {
        const action = afterCommand;
        afterCommand = null;
        action.callback();
      }
      return selected;
    }
    if (actual[1] === 'rm') {
      const selected = actual[actual.length - 1];
      assert.ok(
        ['container', 'image'].includes(actual[0]),
        'fake Docker only removes image/container IDs',
      );
      if (!ignoreRemoval) store.delete(selected);
      if (afterCommand?.operation === `${actual[0]}:${actual[1]}`) {
        const action = afterCommand;
        afterCommand = null;
        action.callback();
      }
      return selected;
    }
    throw new Error('Unexpected fake Docker command');
  };
  const options = {
    root,
    state,
    runnerTemp,
    head: source.head,
    source: () => JSON.parse(JSON.stringify(source)),
    now: () => logicalClock,
    command: invoke,
    filesystem: {
      unlink: (file: string) => {
        filesystemCalls.push('unlink');
        return (filesystemActions.unlink ?? fs.unlinkSync)(file);
      },
      rmdir: (file: string) => {
        filesystemCalls.push('rmdir');
        return (filesystemActions.rmdir ?? fs.rmdirSync)(file);
      },
    },
    processInfo: () => controllerProcess,
    capacity: () => ({ bavail: 100, bsize: 4096 }),
  };
  const manager = createManager(options);
  const runId = `2026-10-19T01-02-03-004Z-${source.head.slice(0, 12)}`;
  function candidate() {
    const folder = path.join(root, '.local/e2e-release/build', runId);
    fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(path.join(root, '.local/e2e-release/runs', runId), { recursive: true });
    const manifest = {
      kind: 'tiangong-next-release-e2e-candidate',
      schemaVersion: 6,
      repository: { canonical: 'tiangong-lca/platform' },
      candidate: {
        commit: source.head,
        tree: source.tree,
        dependencyLockSha256: source.files['pnpm-lock.yaml'],
        packageJsonSha256: source.files['package.json'],
        pnpmWorkspaceSha256: source.files['pnpm-workspace.yaml'],
        maintainedPatches: source.maintainedPatches,
        maintainedPatchesSha256: source.maintainedPatchesSha256,
      },
      environment: {
        frontendTarget: 'qualification',
        contractSha256: source.files['docker/e2e/environment.json'],
        dockerfileSha256: source.files['docker/e2e/Dockerfile'],
      },
    };
    const text = JSON.stringify(manifest);
    fs.writeFileSync(path.join(folder, 'candidate-manifest.json'), text);
    const image = {
      Id: `sha256:${id('c')}`,
      Config: {
        Labels: {
          [CANDIDATE]: 'true',
          [`${prefix}candidate-tree`]: source.tree,
          [`${prefix}manifest-sha256`]: digest(text),
          [`${prefix}dependency-image-id`]: `sha256:${id('d')}`,
        },
      },
      RepoTags: [expectedImageTag(source, 'candidate')],
      RepoDigests: [],
    };
    const dependency = {
      Id: `sha256:${id('d')}`,
      Config: { Labels: dependencyLabels(source) },
      RepoTags: [expectedImageTag(source, 'dependency')],
      RepoDigests: [],
    };
    const container = {
      Id: id('e'),
      Image: image.Id,
      Config: { Labels: { [CANDIDATE]: 'true' }, Env: ['SYNTHETIC_SECRET=must-not-appear'] },
      State: { Running: false },
      Mounts: [
        {
          Type: 'bind',
          Source: path.join(root, '.local/e2e-release/runs', runId),
          Destination: '/e2e-output',
          RW: true,
        },
      ],
    };
    // Actual hosted discovery observes dependency image before candidate image.
    images.set(dependency.Id, dependency);
    images.set(image.Id, image);
    const receipt = manager.read();
    receipt.controller ??= {
      pid: 1234,
      lockSha256: id('9'),
      start: '100',
      cwd: root,
      argvSha256: id('8'),
    };
    manager.save(receipt);
    const nonce = '00000000-0000-4000-8000-000000000001';
    const smokeFolder = path.join(root, '.local/e2e-release/smoke', nonce);
    fs.mkdirSync(smokeFolder, { recursive: true });
    const smoke = {
      schema: 'platform.environment-smoke.v1',
      nonce,
      root,
      head: source.head,
      tree: source.tree,
      imageId: dependency.Id,
      dockerDaemonId: 'owned-daemon',
      inputSha256: digest(SMOKE_SOURCE),
      controller: {
        pid: receipt.controller.pid,
        hostname: os.hostname(),
        lockSha256: receipt.controller.lockSha256,
      },
      createdAt: receipt.startedAt,
      id: id('9'),
      bound: true,
      identity: null,
      createAttempted: true,
      passed: true,
      cleanupComplete: true,
      commands: [],
      errors: [],
    };
    const probe = {
      Id: smoke.id,
      Image: smoke.imageId,
      Name: `/tiangong-smoke-${nonce}`,
      Config: { Labels: smokeLabels(smoke), Cmd: ['node', '-e', SMOKE_SOURCE], Entrypoint: null },
      Mounts: [],
      HostConfig: { NetworkMode: 'none', IpcMode: 'host', Init: true, AutoRemove: false },
    };
    smoke.identity = smokeIdentity(probe, smoke);
    fs.writeFileSync(path.join(smokeFolder, 'receipt.json'), JSON.stringify(smoke));
    fs.writeFileSync(path.join(smokeFolder, 'container.cid'), smoke.id);

    containers.set(container.Id, container);
    return { image, dependency, container, folder, manifest, text };
  }
  function staleLock() {
    const directory = path.join(root, '.local/e2e-release/invocation.lock');
    const file = path.join(directory, 'owner.json');
    fs.mkdirSync(directory);
    const raw = JSON.stringify({
      command: 'qualify',
      hostname: os.hostname(),
      nonce: crypto.randomUUID(),
      pid: 1234,
      startedAt: new Date(logicalClock).toISOString(),
    });
    fs.writeFileSync(file, raw);
    const receipt = manager.read();
    receipt.controller = null;
    manager.save(receipt);
    const smokeParent = path.join(root, '.local/e2e-release/smoke');
    for (const nonce of fs.readdirSync(smokeParent)) {
      const smokeFile = path.join(smokeParent, nonce, 'receipt.json');
      const smoke = JSON.parse(fs.readFileSync(smokeFile, 'utf8'));
      smoke.controller.lockSha256 = digest(raw);
      fs.writeFileSync(smokeFile, JSON.stringify(smoke));
    }
    controllerProcess = {
      pid: 1234,
      parent: 1,
      group: 1234,
      start: '100',
      cwd: root,
      argvSha256: id('8'),
      canonicalQualifier: true,
    };
    manager.observe();
    controllerProcess = null;
    return { directory, file };
  }
  return {
    root,
    state,
    source,
    options,
    manager,
    candidate,
    staleLock,
    filesystemCalls,
    setFilesystem: (name: string, action: (file: string) => void) => {
      filesystemActions[name] = action;
    },
    afterNext: (operation: string, callback: () => void) => {
      afterCommand = { operation, callback };
    },
    images,
    containers,
    commands,
    volumes,
    networks,
    driftContext: () => {
      serverId = 'another-daemon';
    },
    setControllerProcess: (value: any) => {
      controllerProcess = value;
    },
    expireNextRead: () => {
      expireRead = true;
    },
    failNext: (operation: string, error: any) => {
      failure = { operation, error };
    },
    ignoreRemoval: () => {
      ignoreRemoval = true;
    },
  };
}

it('captures identities early, removes only exact fresh IDs, preserves baseline/cache and emits no environment', () => {
  const f = fixture();
  const shared = {
    Id: `sha256:${id('f')}`,
    Config: { Labels: {} },
    RepoTags: ['shared:keep'],
    RepoDigests: [],
  };
  f.images.set(shared.Id, shared);
  f.manager.start();
  const owned = f.candidate();
  const observed = f.manager.observe();
  expect(observed.containers[0]).toMatchObject({ id: owned.container.Id, imageId: owned.image.Id });
  expect(JSON.stringify(observed)).not.toContain('must-not-appear');
  expect(f.manager.finish().complete).toBe(true);
  expect(f.manager.verify().retained.buildkitCache).toContain('retained');
  expect(f.images.has(shared.Id)).toBe(true);
  expect(f.commands.filter((args) => args[1] === 'rm')).toEqual([
    ['container', 'rm', owned.container.Id],
    ['image', 'rm', owned.image.Id],
    ['image', 'rm', owned.dependency.Id],
  ]);
  expect(f.commands.flat().join(' ')).not.toMatch(/prune|purge|builder|volume rm|network rm/u);
});

it('preserves preexisting dependency images with valid identical inputs', () => {
  const f = fixture();
  const dependency = {
    Id: `sha256:${id('d')}`,
    Config: { Labels: dependencyLabels(f.source) },
    RepoTags: [expectedImageTag(f.source, 'dependency')],
    RepoDigests: [],
  };
  f.images.set(dependency.Id, dependency);
  f.manager.start();
  f.candidate();
  f.manager.observe();
  expect(f.manager.finish().complete).toBe(true);
  expect(f.manager.verify().complete).toBe(true);
  expect(f.images.has(dependency.Id)).toBe(true);
});

it('binds tagged public inputs to actual repository digests without confusing mirrors or registry ports', () => {
  const f = fixture();
  const reference = `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:${id('6')}`;
  const actual = `mcr.microsoft.com/playwright@sha256:${id('6')}`;
  f.source.baseImages[0] = reference;
  const image = {
    Id: `sha256:${id('8')}`,
    Config: { Labels: {} },
    RepoTags: ['mcr.microsoft.com/playwright:v1.62.1-noble'],
    RepoDigests: [actual],
  };
  f.images.set(image.Id, image);
  f.manager.start();
  f.candidate();
  expect(f.manager.observe().baseImages).toEqual([
    { reference, canonicalReference: actual, id: image.Id, digests: [actual] },
  ]);
  expect(canonicalDigestReference(`node:24.19.0@sha256:${id('7')}`)).toBe(
    `docker.io/library/node@sha256:${id('7')}`,
  );
  expect(canonicalDigestReference(`localhost:5000/team/node:v1@sha256:${id('7')}`)).toBe(
    `localhost:5000/team/node@sha256:${id('7')}`,
  );
  expect(canonicalDigestReference(actual)).not.toBe(
    canonicalDigestReference(`other.example/playwright@sha256:${id('6')}`),
  );
  expect(canonicalDigestReference('not-a-digest')).toBeNull();
});

it('refuses ambiguous preexisting candidate resources before starting qualification', () => {
  const f = fixture();
  f.containers.set(id('f'), { Id: id('f'), Config: { Labels: { [CANDIDATE]: 'true' } } });
  expect(() => f.manager.start()).toThrow('PREEXISTING_CONTROLLER_CONTAINER');
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
});

it.each(['Id', 'label', 'image', 'mount', 'tree', 'manifest', 'context', 'head', 'lock', 'patch'])(
  'refuses %s drift without deleting foreign resources',
  (field) => {
    const f = fixture();
    f.manager.start();
    const owned = f.candidate();
    f.manager.observe();
    if (field === 'Id') owned.container.Id = id('f');
    if (field === 'label') owned.container.Config.Labels[CANDIDATE] = 'false';
    if (field === 'image') owned.container.Image = `sha256:${id('f')}`;
    if (field === 'mount') owned.container.Mounts[0].Source = path.join(f.root, 'foreign');
    if (field === 'tree') owned.image.Config.Labels[`${prefix}candidate-tree`] = 'c'.repeat(40);
    if (field === 'manifest') owned.image.Config.Labels[`${prefix}manifest-sha256`] = id('f');
    if (field === 'context') f.driftContext();
    if (field === 'head') f.source.head = 'c'.repeat(40);
    if (field === 'lock') f.source.files['pnpm-lock.yaml'] = id('f');
    if (field === 'patch') f.source.maintainedPatchesSha256 = id('f');
    expect(f.manager.finish().complete).toBe(false);
    expect(f.containers.size).toBe(1);
    expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
    expect(() => f.manager.verify()).toThrow();
  },
);

it('retains an unlabeled interrupted browser-smoke container and fails verification', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.containers.set(id('f'), {
    Id: id('f'),
    Image: owned.dependency.Id,
    Config: { Labels: {}, Env: [] },
    Mounts: [],
  });
  expect(f.manager.observe().ambiguousContainers).toEqual([id('f')]);
  expect(f.manager.finish().complete).toBe(false);
  expect(f.containers.has(id('f'))).toBe(true);
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
  expect(() => f.manager.verify()).toThrow('CLEANUP_NOT_VERIFIED');
});

it('requires preflight and actual runtime observation, rejects leaked containers and volume/network drift', () => {
  const absent = fixture();
  expect(() => absent.manager.verify()).toThrow();
  const empty = fixture();
  empty.manager.start();
  empty.manager.finish();
  expect(() => empty.manager.verify()).toThrow('ACTUAL_RUNTIME_OBSERVATION_MISSING');
  const leaked = fixture();
  leaked.manager.start();
  leaked.candidate();
  leaked.manager.observe();
  leaked.ignoreRemoval();
  expect(leaked.manager.finish().complete).toBe(false);
  expect(() => leaked.manager.verify()).toThrow();
  const volume = fixture();
  volume.manager.start();
  volume.candidate();
  volume.manager.observe();
  volume.volumes.add('unattributed');
  expect(volume.manager.finish().complete).toBe(false);
  expect(volume.volumes.has('unattributed')).toBe(true);
});

it('does not signal reused observer PIDs or accept foreign mount/label ownership', () => {
  const process = { pid: 42, start: '100', cwd: '/owned', argvSha256: id('1') };
  expect(sameProcess(process, { ...process })).toBe(true);
  expect(sameProcess(process, { ...process, start: '101' })).toBe(false);
  expect(sameProcess(process, { ...process, cwd: '/foreign' })).toBe(false);
  expect(sameProcess(process, { ...process, argvSha256: id('2') })).toBe(false);
  const f = fixture();
  const before = f.manager.start();
  const owned = f.candidate();
  const observed = f.manager.observe();
  expect(() =>
    validateContainer(owned.container, f.source, observed.manifests, [owned.image], {
      ...before.baseline,
      containers: [owned.container.Id],
    }),
  ).toThrow('CONTAINER_NOT_FRESH');
  owned.dependency.Config.Labels[`${prefix}environment-sha256`] = id('f');
  expect(() => validateImage(owned.dependency, f.source, observed.manifests)).toThrow(
    'DEPENDENCY_IMAGE_INPUT_MISMATCH',
  );
});

it('stops an exact observer with bounded escalation and waits for its subprocess group', async () => {
  const expected = { pid: 42, start: '100', cwd: '/owned', argvSha256: id('1') };
  let live = true;
  let children = 2;
  const signals: string[] = [];
  await stopObserver(expected, {
    processInfo: () => (live ? expected : null),
    processGroup: () => (children > 0 ? [expected] : []),
    signal: (_pid: number, signal: string) => {
      signals.push(signal);
      if (signal === 'SIGKILL') live = false;
    },
    delay: async () => {
      if (!live) children -= 1;
    },
  });
  expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  expect(children).toBe(0);
});

it('refuses a reused observer PID and bounds an observer or child that never exits', async () => {
  const expected = { pid: 42, start: '100', cwd: '/owned', argvSha256: id('1') };
  const signal = jest.fn();
  await expect(
    stopObserver(expected, {
      processInfo: () => ({ ...expected, cwd: '/foreign' }),
      signal,
      delay: async () => {},
    }),
  ).rejects.toThrow('OBSERVER_PROCESS_IDENTITY_DRIFT');
  expect(signal).not.toHaveBeenCalled();
  await expect(
    stopObserver(expected, {
      processInfo: () => expected,
      processGroup: () => [],
      signal,
      delay: async () => {},
    }),
  ).rejects.toThrow('OBSERVER_NOT_STOPPED');
  await expect(
    stopObserver(expected, {
      processInfo: () => null,
      processGroup: () => [expected],
      signal,
      delay: async () => {},
    }),
  ).rejects.toThrow('OBSERVER_CHILD_GROUP_RETAINED');
});

it('binds maintained patch bytes to dependency tags, labels and candidate manifests', () => {
  const f = fixture();
  f.source.maintainedPatches = [
    { package: 'fixture@1.0.0', path: 'patches/fixture.patch', sha256: id('8') },
  ];
  f.source.maintainedPatchesSha256 = digest(JSON.stringify(f.source.maintainedPatches) + '\n');
  const patchTag = expectedImageTag(f.source, 'dependency');
  f.manager.start();
  const owned = f.candidate();
  f.manager.observe();
  owned.dependency.Config.Labels[`${prefix}maintained-patches-sha256`] = id('f');
  expect(() => validateImage(owned.dependency, f.source, [])).toThrow(
    'DEPENDENCY_IMAGE_INPUT_MISMATCH',
  );
  f.source.maintainedPatchesSha256 = id('f');
  expect(expectedImageTag(f.source, 'dependency')).not.toBe(patchTag);
});

it('rejects retained schema-5 candidate manifests before adopting or deleting resources', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  owned.manifest.schemaVersion = 5;
  fs.writeFileSync(
    path.join(owned.folder, 'candidate-manifest.json'),
    JSON.stringify(owned.manifest),
  );
  expect(() => f.manager.observe()).toThrow('MANIFEST_KIND_MISMATCH');
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
});

it('uses actual dependency-first discovery but removes the validated dependent before its dependency', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.images.delete(owned.image.Id);
  f.containers.delete(owned.container.Id);
  f.manager.observe();
  f.images.set(owned.image.Id, owned.image);
  f.containers.set(owned.container.Id, owned.container);
  expect(f.manager.observe().images.map((entry: any) => entry.kind)).toEqual([
    'dependency',
    'candidate',
  ]);
  const finished = f.manager.finish();
  expect(finished.complete).toBe(true);
  expect(finished.removed.images).toEqual([owned.image.Id, owned.dependency.Id]);
  const removals = finished.commands.filter((entry: any) => entry.operation === 'image:rm');
  expect(removals.map((entry: any) => entry.timeoutMs)).toEqual([120000, 120000]);
  expect(
    removals.every((entry: any) => entry.phase === 'image-removal' && entry.outcome === 'passed'),
  ).toBe(true);
});

it('preserves typed timeout evidence and unknown mutation effect without deleting another resource', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.manager.observe();
  f.failNext(
    'image:rm',
    Object.assign(new Error('private-secret-must-not-appear'), {
      code: 'RESOURCE_COMMAND_TIMEOUT',
      resourceDiagnostic: {
        status: null,
        signal: 'SIGKILL',
        errorCode: 'ETIMEDOUT',
        timedOut: true,
      },
    }),
  );
  const failed = f.manager.finish();
  expect(failed.complete).toBe(false);
  expect(failed.errors).toContain('RESOURCE_COMMAND_TIMEOUT');
  expect(
    failed.commands.filter((entry: any) => entry.operation === 'image:rm').at(-1),
  ).toMatchObject({
    phase: 'image-removal',
    operation: 'image:rm',
    resourceId: owned.image.Id,
    timeoutMs: 120000,
    outcome: 'failed',
    effect: 'unknown',
    errorCode: 'ETIMEDOUT',
  });
  expect(f.images.has(owned.dependency.Id)).toBe(true);
  expect(JSON.stringify(failed)).not.toContain('private-secret');
  expect(() => f.manager.verify()).toThrow('CLEANUP_NOT_VERIFIED');
});

it('does not accept disappearance as attribution for an unknown transient', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.containers.set(id('f'), {
    Id: id('f'),
    Image: owned.dependency.Id,
    Config: { Labels: {} },
    Mounts: [],
  });
  f.manager.observe();
  f.containers.delete(id('f'));
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('UNATTRIBUTABLE_CONTAINER_OBSERVED');
  expect(f.images.has(owned.image.Id)).toBe(true);
});

it('rejects mutated CID proof even after a previously complete owned smoke', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const observed = f.manager.observe();
  const nonce = observed.smokes[0].nonce;
  fs.writeFileSync(path.join(f.root, '.local/e2e-release/smoke', nonce, 'container.cid'), id('8'));
  expect(f.manager.finish().complete).toBe(false);
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
});

it.each([true, false])(
  'recovers a stopped controller probe only with its exact CID (%s)',
  (hasCid) => {
    const f = fixture();
    f.manager.start();
    const owned = f.candidate();
    const folder = path.join(
      f.root,
      '.local/e2e-release/smoke',
      '00000000-0000-4000-8000-000000000001',
    );
    const file = path.join(folder, 'receipt.json');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.id = null;
    record.bound = false;
    record.identity = null;
    record.passed = false;
    record.cleanupComplete = false;
    fs.writeFileSync(file, JSON.stringify(record));
    if (!hasCid) fs.unlinkSync(path.join(folder, 'container.cid'));
    const probeId = id('9');
    f.containers.set(probeId, {
      Id: probeId,
      Image: owned.dependency.Id,
      Name: `/tiangong-smoke-${record.nonce}`,
      Config: { Labels: smokeLabels(record), Cmd: ['node', '-e', SMOKE_SOURCE], Entrypoint: null },
      Mounts: [],
      HostConfig: { NetworkMode: 'none', IpcMode: 'host', Init: true, AutoRemove: false },
      State: { Running: false },
    });
    f.manager.observe();
    const result = f.manager.finish();
    expect(result.complete).toBe(hasCid);
    expect(f.containers.has(probeId)).toBe(!hasCid);
    const verified = hasCid ? f.manager.verify().complete : false;
    expect(verified).toBe(hasCid);
    expect(f.commands.some((args) => args[1] === 'rm')).toBe(hasCid);
  },
);

it('admits no removal once the total cleanup deadline expires', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  f.manager.observe();
  f.expireNextRead();
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('CLEANUP_BUDGET_EXHAUSTED');
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
  expect(result.failure.operation.timeoutMs).toBe(0);
});

it.each([false, true])(
  'does not clean while the prior controller PID is live or reused (%s)',
  (reused) => {
    const f = fixture();
    f.manager.start();
    f.candidate();
    const observed = f.manager.observe();
    f.setControllerProcess({ ...observed.controller, start: reused ? '101' : '100' });
    const result = f.manager.finish();
    expect(result.complete).toBe(false);
    expect(result.errors).toContain(
      reused ? 'CONTROLLER_PROCESS_IDENTITY_DRIFT' : 'CONTROLLER_PROCESS_STILL_LIVE',
    );
    expect(f.commands.some((args) => args[1] === 'rm' || args[1] === 'stop')).toBe(false);
  },
);

it.each(['daemon', 'source'])('stops all later effects after a mid-cleanup %s switch', (kind) => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.manager.observe();
  f.afterNext('container:rm', () => {
    const actions = {
      daemon: f.driftContext,
      source: () => {
        f.source.head = 'd'.repeat(40);
      },
    };
    actions[kind as 'daemon' | 'source']();
  });
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain(
    kind === 'daemon' ? 'DOCKER_CONTEXT_DRIFT' : 'SOURCE_IDENTITY_DRIFT',
  );
  expect(f.commands.filter((args) => args[0] === 'image' && args[1] === 'rm')).toHaveLength(0);
  expect(f.images.has(owned.image.Id)).toBe(true);
  expect(f.images.has(owned.dependency.Id)).toBe(true);
  expect(fs.existsSync(owned.folder)).toBe(true);
  expect(
    result.commands.filter((event: any) => event.operation === 'image:rm').at(-1),
  ).toMatchObject({ mutationStarted: false, effect: 'not-started', outcome: 'failed' });
});

it('does not remove the support image or filesystem after daemon changes following candidate removal', () => {
  const f = fixture();
  f.manager.start();
  const owned = f.candidate();
  f.manager.observe();
  f.afterNext('image:rm', f.driftContext);
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(f.commands.filter((args) => args[0] === 'image' && args[1] === 'rm')).toEqual([
    ['image', 'rm', owned.image.Id],
  ]);
  expect(f.images.has(owned.dependency.Id)).toBe(true);
  expect(fs.existsSync(owned.folder)).toBe(true);
});

it('journals separately owned lock unlink and nonrecursive rmdir', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  const result = f.manager.finish();
  expect(result.complete).toBe(true);
  expect(f.filesystemCalls).toEqual(['unlink', 'rmdir']);
  const effects = result.commands.filter(
    (entry: any) =>
      entry.operation === 'filesystem:unlink' || entry.operation === 'filesystem:rmdir',
  );
  expect(
    effects.map((entry: any) => [entry.phase, entry.operation, entry.outcome, entry.effect]),
  ).toEqual([
    ['invocation-lock-unlink', 'filesystem:unlink', 'passed', 'verified-absent'],
    ['invocation-lock-rmdir', 'filesystem:rmdir', 'passed', 'verified-absent'],
  ]);
  expect(
    effects.every(
      (entry: any) =>
        entry.mutationStarted && entry.remainingBudgetMs > 0 && entry.readback.exists === false,
    ),
  ).toBe(true);
  expect(fs.existsSync(lock.directory)).toBe(false);
  expect(f.manager.verify().complete).toBe(true);
});

it('preserves native ENOTEMPTY and the successful unlink when a new directory entry appears during rmdir', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  f.setFilesystem('rmdir', (directory) => {
    fs.writeFileSync(path.join(directory, 'private-foreign-entry'), 'retain');
    fs.rmdirSync(directory);
  });
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(f.filesystemCalls).toEqual(['unlink', 'rmdir']);
  const effects = result.commands.filter(
    (entry: any) =>
      entry.operation === 'filesystem:unlink' || entry.operation === 'filesystem:rmdir',
  );
  expect(effects[0]).toMatchObject({ outcome: 'passed', readback: { exists: false } });
  expect(effects[1]).toMatchObject({
    outcome: 'failed',
    errorCode: 'ENOTEMPTY',
    mutationStarted: true,
    effect: 'unknown',
    readback: { exists: true, entryCount: 1 },
  });
  expect(fs.existsSync(path.join(lock.directory, 'private-foreign-entry'))).toBe(true);
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private-foreign-entry');
});

it('admits no lock directory removal after budget expires following a successful unlink', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  f.setFilesystem('unlink', (file) => {
    fs.unlinkSync(file);
    f.expireNextRead();
  });
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('CLEANUP_BUDGET_EXHAUSTED');
  expect(f.filesystemCalls).toEqual(['unlink']);
  const rmdir = result.commands.find((entry: any) => entry.operation === 'filesystem:rmdir');
  expect(rmdir).toMatchObject({
    outcome: 'failed',
    mutationStarted: false,
    effect: 'not-started',
    errorCode: 'CLEANUP_BUDGET_EXHAUSTED',
  });
  expect(fs.existsSync(lock.file)).toBe(false);
  expect(fs.existsSync(lock.directory)).toBe(true);
});

it('preserves a replaced lock directory after unlink without recursively clearing new entries', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  f.setFilesystem('unlink', (file) => {
    fs.unlinkSync(file);
    fs.renameSync(lock.directory, lock.directory + '-previous');
    fs.mkdirSync(lock.directory);
    fs.writeFileSync(path.join(lock.directory, 'foreign-keep'), 'keep');
  });
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('INVOCATION_LOCK_IDENTITY_DRIFT');
  expect(f.filesystemCalls).toEqual(['unlink']);
  expect(fs.existsSync(path.join(lock.directory, 'foreign-keep'))).toBe(true);
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
});

it('refuses an owner-file inode replacement before either lock effect', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  const raw = fs.readFileSync(lock.file);
  fs.renameSync(lock.file, lock.file + '-previous');
  fs.writeFileSync(lock.file, raw);
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('INVOCATION_LOCK_IDENTITY_DRIFT');
  expect(f.filesystemCalls).toEqual([]);
  expect(fs.existsSync(lock.file)).toBe(true);
  expect(fs.existsSync(lock.file + '-previous')).toBe(true);
});

it.each(['stop', 'rm'])(
  'revalidates daemon during exact-CID smoke recovery after %s',
  (operation) => {
    const f = fixture();
    f.manager.start();
    const owned = f.candidate();
    const folder = path.join(
      f.root,
      '.local/e2e-release/smoke',
      '00000000-0000-4000-8000-000000000001',
    );
    const file = path.join(folder, 'receipt.json');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.cleanupComplete = false;
    fs.writeFileSync(file, JSON.stringify(record));
    const probeId = record.id;
    f.containers.set(probeId, {
      Id: probeId,
      Image: owned.dependency.Id,
      Name: `/tiangong-smoke-${record.nonce}`,
      Config: { Labels: smokeLabels(record), Cmd: ['node', '-e', SMOKE_SOURCE], Entrypoint: null },
      Mounts: [],
      HostConfig: { NetworkMode: 'none', IpcMode: 'host', Init: true, AutoRemove: false },
      State: { Running: operation === 'stop' },
    });
    f.manager.observe();
    f.afterNext(`container:${operation}`, f.driftContext);
    const result = f.manager.finish();
    expect(result.complete).toBe(false);
    expect(result.errors).toContain('DOCKER_CONTEXT_DRIFT');
    expect(f.commands.filter((args) => args[0] === 'container' && args[1] === 'rm')).toEqual(
      operation === 'rm' ? [['container', 'rm', probeId]] : [],
    );
    expect(f.containers.has(owned.container.Id)).toBe(true);
    expect(f.commands.filter((args) => args[0] === 'image' && args[1] === 'rm')).toEqual([]);
  },
);

it('revalidates daemon before rmdir after a previously valid unlink', () => {
  const f = fixture();
  f.manager.start();
  f.candidate();
  const lock = f.staleLock();
  f.setFilesystem('unlink', (file) => {
    fs.unlinkSync(file);
    f.driftContext();
  });
  const result = f.manager.finish();
  expect(result.complete).toBe(false);
  expect(result.errors).toContain('DOCKER_CONTEXT_DRIFT');
  expect(f.filesystemCalls).toEqual(['unlink']);
  expect(fs.existsSync(lock.directory)).toBe(true);
  expect(f.commands.some((args) => args[1] === 'rm')).toBe(false);
});
