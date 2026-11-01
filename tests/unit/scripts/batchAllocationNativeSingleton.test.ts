import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
const {
  VERSION,
  COUNTS,
  assertBinding,
  profileFromArgs,
  inspectTuple,
  assertSummary,
} = require('../../../scripts/e2e/batch-allocation-native-singleton.cjs');
const { disk } = require('../../../scripts/e2e/batch-allocation-native-probe.cjs');

function fixture() {
  const runtime = '/owned/runtime-private',
    profile = runtime + '/tmp/profile',
    socketDir = runtime + '/tmp/socket-dir',
    endpoint = socketDir + '/SingletonSocket';
  const uid = 501,
    dev = 7,
    nonce = '01234567-89ab-cdef-0123-456789abcdef',
    start = 'Sun Nov  1 07:41:08 2026',
    sha = 'a'.repeat(64);
  const nodes = new Map<string, any>(),
    reads: string[] = [],
    duCalls: any[] = [];
  let inode = 10;
  function add(file: string, kind: string, options: any = {}) {
    nodes.set(file, {
      kind,
      dev,
      ino: ++inode,
      uid,
      mode:
        kind === 'directory' ? 0o700 : kind === 'file' ? 0o600 : kind === 'symlink' ? 0o777 : 0o600,
      size: 0,
      mtimeMs: 10,
      ctimeMs: 20,
      ...options,
    });
  }
  for (const dir of ['/', '/owned', runtime, runtime + '/tmp', profile, socketDir])
    add(dir, 'directory');
  add(runtime + '/.owner', 'file', { bytes: Buffer.from(nonce), size: 36 });
  add(profile + '/SingletonLock', 'symlink', { target: 'synthetic-host-321' });
  add(profile + '/SingletonCookie', 'symlink', { target: '18446744073709551615' });
  add(profile + '/SingletonSocket', 'symlink', { target: endpoint });
  add(socketDir + '/SingletonCookie', 'symlink', { target: '18446744073709551615' });
  add(endpoint, 'socket');
  for (const n of nodes.values()) if (n.kind === 'symlink') n.size = Buffer.byteLength(n.target);
  const stat = (n: any) => ({
    ...n,
    isDirectory: () => n.kind === 'directory',
    isFile: () => n.kind === 'file',
    isSymbolicLink: () => n.kind === 'symlink',
    isSocket: () => n.kind === 'socket',
  });
  let onRead: ((file: string) => void) | null = null;
  const io = {
    lstatSync: (file: string) => {
      const n = nodes.get(file);
      if (!n) throw Object.assign(Error('private path omitted'), { code: 'ENOENT' });
      return stat(n);
    },
    readlinkSync: (file: string) => {
      reads.push(file);
      const n = nodes.get(file);
      const bytes = Buffer.from(n.target);
      onRead?.(file);
      return bytes;
    },
    readFileSync: (file: string) => {
      if (file !== runtime + '/.owner') throw Error('referent read forbidden');
      return Buffer.from(nodes.get(file).bytes);
    },
    realpathSync: (file: string) => {
      if (file !== '/owned') throw Error('referent following forbidden');
      return file;
    },
    readdirSync: (dir: string) =>
      [...nodes.entries()]
        .filter(([file]) => file !== dir && path.posix.dirname(file) === dir)
        .map(([file, n]) => ({ name: path.posix.basename(file), ...stat(n) })),
    statfsSync: () => ({ bavail: 12 * 1024 ** 3, bsize: 1 }),
  };
  const r = nodes.get(runtime),
    p = nodes.get(profile);
  const binding = {
    version: VERSION,
    runtime: {
      path: runtime,
      parent: '/owned',
      device: dev,
      inode: r.ino,
      nonce,
      uid,
      mode: 0o700,
    },
    profile: { path: profile, device: dev, inode: p.ino, uid, mode: 0o700 },
    process: {
      pid: 321,
      parentPid: 123,
      start,
      pgid: 321,
      executable: '/cache/chrome',
      executableSha256: sha,
    },
  };
  const row = { pid: 321, ppid: 123, start, pgid: 321, rss: 100 };
  const ports = {
    fs: io,
    uid,
    hostname: () => 'synthetic-host',
    now: () => 100,
    snapshot: () => ({ status: 'ok', observedAt: 100, rows: new Map([[321, { ...row }]]) }),
    hashFile: () => sha,
  };
  class Owner {
    capture() {}
    bind() {
      return true;
    }
    closure() {
      return { verified: true };
    }
    signalPlan() {
      return { status: 'ok', pids: [] };
    }
  }
  const injected = {
    fs: io,
    singletonBinding: binding,
    singletonPorts: ports,
    snapshot: ports.snapshot,
    Ownership: Owner,
    now: () => 0,
    rootKinds: ['output'],
    freemem: () => 4 * 1024 ** 3,
    spawn: (...args: any[]) => {
      duCalls.push(args);
      const child: any = new EventEmitter();
      child.pid = 42;
      child.stdout = new EventEmitter();
      child.stdin = {
        end: () =>
          queueMicrotask(() => {
            child.stdout.emit('data', '2 private du output\n');
            child.emit('close', 0);
          }),
      };
      return child;
    },
  };
  return {
    runtime,
    profile,
    socketDir,
    endpoint,
    uid,
    dev,
    nonce,
    binding,
    ports,
    nodes,
    reads,
    duCalls,
    injected,
    row,
    setRead: (fn: (file: string) => void) => {
      onRead = fn;
    },
    add,
  };
}
function condition(fn: () => unknown, expected: string) {
  let error: any;
  try {
    fn();
  } catch (value) {
    error = value;
  }
  expect(error?.singletonCondition).toBe(expected);
  expect(String(error?.message)).toBe('native_singleton_invalid');
}

describe('complete pinned Chromium singleton tuple with inert injected filesystem/process state', () => {
  it('qualifies the actual POSIX tuple functions under a substituted win32 host path module', () => {
    const filename = path.join(process.cwd(), 'scripts/e2e/batch-allocation-native-singleton.cjs');
    const loaded = { exports: {} as any };
    const context = vm.createContext({
      module: loaded,
      Buffer,
      process,
      require: (name: string) =>
        name === 'node:path'
          ? path.win32
          : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name),
    });
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { timeout: 1000 });
    // Parse the binding in the module's realm, preserving its strict prototype checks.
    const inspect = vm.runInContext(
      '(binding, ports) => module.exports.inspectTuple(JSON.parse(binding), ports)',
      context,
    );
    const f = fixture();
    expect(inspect(JSON.stringify(f.binding), f.ports).summary.counts).toEqual(COUNTS);
    expect(loaded.exports.profileFromArgs(['--user-data-dir=' + f.profile], f.runtime)).toBe(
      f.profile,
    );
    condition(
      () => loaded.exports.profileFromArgs(['--user-data-dir=C:\\outside'], f.runtime),
      'profile',
    );
    const link = f.nodes.get(f.profile + '/SingletonSocket');
    link.target = '/foreign/SingletonSocket';
    link.size = Buffer.byteLength(link.target);
    condition(() => inspect(JSON.stringify(f.binding), f.ports), 'target');
  });

  it('admits exactly four bounded links plus one private socket and exposes only approved identities', () => {
    const f = fixture(),
      value = inspectTuple(f.binding, f.ports);
    expect(value.entries.size).toBe(5);
    expect(value.summary.counts).toEqual(COUNTS);
    expect(assertSummary(value.summary)).toBe(value.summary);
    const raw = JSON.stringify(value.summary);
    for (const privateValue of [
      f.runtime,
      f.profile,
      f.endpoint,
      'synthetic-host',
      '18446744073709551615',
      f.nonce,
      '/cache/chrome',
    ])
      expect(raw).not.toContain(privateValue);
    expect(value.summary.owner).toEqual({
      pid: 321,
      start: f.binding.process.start,
      pgid: 321,
      executableSha256: 'a'.repeat(64),
    });
  });
  it('accounts within the existing single output root without dereference or new deletion', async () => {
    const f = fixture();
    const result = await disk(['/owned'], '/owned', 15000, f.injected);
    expect(result.status).toBe('ok');
    expect(result.bytes).toBe(2048);
    expect(result.singleton.counts).toEqual(COUNTS);
    expect(f.duCalls).toHaveLength(1);
    expect(f.duCalls[0][1][1]).toBe('read gate; exec du -sk "$1"');
    expect(f.nodes.has(f.endpoint)).toBe(true);
  });
  it.each([
    ['SingletonLock', 512],
    ['SingletonCookie', 20],
    ['SingletonSocket', 4096],
  ])('rejects oversized %s before its readlink', (name, cap) => {
    const f = fixture(),
      file = f.profile + '/' + name;
    f.nodes.get(file).size = Number(cap) + 1;
    condition(() => inspectTuple(f.binding, f.ports), 'size');
    expect(f.reads).not.toContain(file);
  });
  it('accepts only one bounded actual-launch user-data-dir flag and never returns argv', () => {
    const f = fixture();
    expect(
      profileFromArgs(['/cache/chrome', '--headless', '--user-data-dir=' + f.profile], f.runtime),
    ).toBe(f.profile);
    for (const args of [
      [],
      ['--user-data-dir'],
      ['--user-data-dir=/outside'],
      ['--user-data-dir=' + f.profile + '/../other'],
      ['--user-data-dir=' + f.profile, '--user-data-dir=' + f.profile],
      Array(129).fill('x'),
      ['x'.repeat(8193)],
    ])
      condition(() => profileFromArgs(args, f.runtime), 'profile');
  });
  it.each([
    'version',
    'nonce',
    'runtime-inode',
    'runtime-device',
    'runtime-mode',
    'runtime-owner',
    'profile-inode',
    'ancestor-link',
  ])('rejects wrong %s ownership without an exemption', (kind) => {
    const f = fixture();
    if (kind === 'version') f.binding.version = '150.0.0.0';
    if (kind === 'nonce') f.binding.runtime.nonce = 'f'.repeat(36);
    if (kind === 'runtime-inode') f.binding.runtime.inode++;
    if (kind === 'runtime-device') f.binding.runtime.device++;
    if (kind === 'runtime-mode') f.nodes.get(f.runtime).mode = 0o755;
    if (kind === 'runtime-owner') f.nodes.get(f.runtime).uid++;
    if (kind === 'profile-inode') f.binding.profile.inode++;
    if (kind === 'ancestor-link') f.nodes.get(f.runtime + '/tmp').kind = 'symlink';
    expect(() => inspectTuple(f.binding, f.ports)).toThrow('native_singleton_invalid');
  });
  it.each(['missing', 'reused', 'group', 'parent', 'stale', 'future', 'executable'])(
    'rejects %s process proof before reading links',
    (kind) => {
      const f = fixture();
      if (kind === 'missing')
        f.ports.snapshot = () => ({ status: 'ok', observedAt: 100, rows: new Map() });
      if (kind === 'reused') f.row.start = 'Sun Nov  1 08:41:08 2026';
      if (kind === 'group') f.row.pgid = 322;
      if (kind === 'parent') f.row.ppid = 999;
      if (kind === 'stale') f.ports.now = () => 2101;
      if (kind === 'future') f.ports.now = () => 99;
      if (kind === 'executable') f.ports.hashFile = () => 'b'.repeat(64);
      condition(
        () => inspectTuple(f.binding, f.ports),
        kind === 'executable' ? 'executable' : 'process',
      );
      expect(f.reads).toEqual([]);
    },
  );
  it.each([
    'missing-cookie',
    'unequal-cookie',
    'noncanonical-cookie',
    'uint64-overflow',
    'wrong-host',
    'wrong-pid',
    'socket-link-type',
    'endpoint-type',
    'endpoint-uid',
    'public-socket-dir',
  ])('rejects %s complete-tuple violations', (kind) => {
    const f = fixture(),
      remote = f.nodes.get(f.socketDir + '/SingletonCookie');
    if (kind === 'missing-cookie') f.nodes.delete(f.socketDir + '/SingletonCookie');
    if (kind === 'unequal-cookie') {
      remote.target = '1';
      remote.size = 1;
    }
    if (kind === 'noncanonical-cookie')
      for (const file of [f.profile + '/SingletonCookie', f.socketDir + '/SingletonCookie'])
        Object.assign(f.nodes.get(file), { target: '01', size: 2 });
    if (kind === 'uint64-overflow')
      for (const file of [f.profile + '/SingletonCookie', f.socketDir + '/SingletonCookie'])
        Object.assign(f.nodes.get(file), { target: '18446744073709551616', size: 20 });
    if (kind === 'wrong-host') f.ports.hostname = () => 'foreign-host';
    if (kind === 'wrong-pid') f.binding.process.pid = 999;
    if (kind === 'socket-link-type') f.nodes.get(f.profile + '/SingletonSocket').kind = 'file';
    if (kind === 'endpoint-type') f.nodes.get(f.endpoint).kind = 'file';
    if (kind === 'endpoint-uid') f.nodes.get(f.endpoint).uid++;
    if (kind === 'public-socket-dir') f.nodes.get(f.socketDir).mode = 0o755;
    expect(() => inspectTuple(f.binding, f.ports)).toThrow('native_singleton_invalid');
  });
  it.each([
    '/outside/SingletonSocket',
    '/owned/runtime-private/tmp/socket-dir/../other/SingletonSocket',
    '/owned/runtime-private/tmp/socket-dir//SingletonSocket',
    'relative/SingletonSocket',
  ])('never follows unadmitted socket target %s', (target) => {
    const f = fixture(),
      link = f.nodes.get(f.profile + '/SingletonSocket');
    link.target = target;
    link.size = Buffer.byteLength(target);
    condition(() => inspectTuple(f.binding, f.ports), 'target');
  });
  it('rejects substituted symlink ancestors and inode changes during link reads', () => {
    let f = fixture();
    f.nodes.get(f.socketDir).kind = 'symlink';
    expect(() => inspectTuple(f.binding, f.ports)).toThrow();
    f = fixture();
    f.setRead((file) => {
      if (file === f.profile + '/SingletonLock') f.nodes.get(file).ino++;
    });
    condition(() => inspectTuple(f.binding, f.ports), 'race');
  });
  it('rejects an intermediate runtime/tmp inode swap preserving directory UID and mode', () => {
    const f = fixture();
    f.setRead((file) => {
      if (file === f.profile + '/SingletonLock') f.nodes.get(f.runtime + '/tmp').ino++;
    });
    condition(() => inspectTuple(f.binding, f.ports), 'race');
  });
  it('does not treat mutable intermediate directory mtime or size as ownership identity', () => {
    const f = fixture(),
      baseline = fixture();
    f.setRead((file) => {
      if (file === f.profile + '/SingletonLock') {
        const dir = f.nodes.get(f.runtime + '/tmp');
        dir.mtimeMs++;
        dir.size++;
      }
    });
    const result = inspectTuple(f.binding, f.ports).summary;
    expect(result.counts).toEqual(COUNTS);
    expect(result.tupleDigest).toBe(
      inspectTuple(baseline.binding, baseline.ports).summary.tupleDigest,
    );
  });
  it('detects an intermediate ancestor replacement between initial and final accounting passes', async () => {
    const f = fixture(),
      spawn = f.injected.spawn;
    f.injected.spawn = (...args: any[]) => {
      const child = spawn(...args),
        end = child.stdin.end;
      child.stdin.end = () => {
        f.nodes.get(f.runtime + '/tmp').ino++;
        end();
      };
      return child;
    };
    let error: any;
    try {
      await disk(['/owned'], '/owned', 15000, f.injected);
    } catch (value) {
      error = value;
    }
    expect(error.resourceDiagnostic).toMatchObject({ stage: 'singleton', condition: 'race' });
  });
  it('rejects an ancestor union above64 even when each individual path is shallower', () => {
    const f = fixture(),
      newProfile = f.runtime + '/tmp/' + Array(35).fill('p').join('/') + '/profile',
      newSocket = f.runtime + '/tmp/' + Array(35).fill('s').join('/') + '/socket-dir';
    for (const directory of [newProfile, newSocket]) {
      let at = '/';
      for (const part of directory.split('/').filter(Boolean)) {
        at = path.posix.join(at, part);
        if (!f.nodes.has(at)) f.add(at, 'directory');
      }
    }
    for (const [oldRoot, newRoot] of [
      [f.profile, newProfile],
      [f.socketDir, newSocket],
    ]) {
      for (const [file, node] of [...f.nodes])
        if (file === oldRoot || file.startsWith(oldRoot + '/')) {
          f.nodes.delete(file);
          f.nodes.set(newRoot + file.slice(oldRoot.length), node);
        }
    }
    f.binding.profile.path = newProfile;
    const link = f.nodes.get(newProfile + '/SingletonSocket');
    link.target = newSocket + '/SingletonSocket';
    link.size = Buffer.byteLength(link.target);
    condition(() => inspectTuple(f.binding, f.ports), 'count');
  });
  it.each(['', '/', 'node/child', 'node\\child', '\0', '.', '..'])(
    'rejects matching path-like hostname and lock scalar %p',
    (host) => {
      const f = fixture(),
        lock = f.nodes.get(f.profile + '/SingletonLock');
      f.ports.hostname = () => host;
      lock.target = host + '-321';
      lock.size = Buffer.byteLength(lock.target);
      condition(() => inspectTuple(f.binding, f.ports), 'lock');
    },
  );
  it('allows a matching ordinary FQDN hostname containing dots', () => {
    const f = fixture(),
      host = 'worker.example.test',
      lock = f.nodes.get(f.profile + '/SingletonLock');
    f.ports.hostname = () => host;
    lock.target = host + '-321';
    lock.size = Buffer.byteLength(lock.target);
    expect(inspectTuple(f.binding, f.ports).summary.counts).toEqual(COUNTS);
  });
  it('fails closed on unrepresentable endpoint identity instead of hashing unknown metadata', () => {
    const f = fixture();
    f.nodes.get(f.endpoint).ino = Number.MAX_SAFE_INTEGER + 1;
    condition(() => inspectTuple(f.binding, f.ports), 'binding');
  });
  it.each(['symlink', 'socket'])(
    'rejects an extra unrecognized %s inside the owned runtime',
    async (kind) => {
      const f = fixture();
      f.add(f.runtime + '/tmp/extra', kind, { target: 'private', size: 7 });
      let error: any;
      try {
        await disk(['/owned'], '/owned', 15000, f.injected);
      } catch (value) {
        error = value;
      }
      expect(error.resourceDiagnostic).toMatchObject({
        stage: 'singleton',
        condition: kind === 'symlink' ? 'unknown-link' : 'unknown-socket',
        rootKind: 'output',
      });
    },
  );
  it('does not allow tuple-shaped links in source/cache/evidence or an unregistered runtime', async () => {
    const f = fixture();
    delete (f.injected as any).singletonBinding;
    let error: any;
    try {
      await disk(['/owned'], '/owned', 15000, f.injected);
    } catch (value) {
      error = value;
    }
    expect(error.resourceDiagnostic.stage).toBe('traversal');
    const outside = fixture();
    outside.binding.profile.path = '/source/profile';
    condition(() => assertBinding(outside.binding), 'binding');
  });
  it('rejects duplicated discovery and private extensions in otherwise valid summaries', async () => {
    const f = fixture(),
      read = f.ports.fs.readdirSync;
    f.ports.fs.readdirSync = (dir: string) => {
      const list = read(dir);
      return dir === f.profile ? [...list, list.find((x) => x.name === 'SingletonLock')] : list;
    };
    let error: any;
    try {
      await disk(['/owned'], '/owned', 15000, f.injected);
    } catch (value) {
      error = value;
    }
    expect(error.resourceDiagnostic).toMatchObject({ stage: 'singleton', condition: 'count' });
    const clean = fixture(),
      summary = inspectTuple(clean.binding, clean.ports).summary;
    expect(() => assertSummary({ ...summary, targets: ['private'] })).toThrow();
    expect(() =>
      assertSummary({ ...summary, owner: { ...summary.owner, argv: ['private'] } }),
    ).toThrow();
    expect(() => assertSummary({ ...summary, counts: { ...COUNTS, cookieLinks: 3 } })).toThrow();
    const coercion = {
      toString: () => {
        throw Error('must-not-coerce-private-input');
      },
    };
    expect(() => assertSummary({ ...summary, tupleDigest: coercion })).toThrow(
      'native_singleton_invalid',
    );
    expect(() =>
      assertSummary({ ...summary, owner: { ...summary.owner, executableSha256: coercion } }),
    ).toThrow('native_singleton_invalid');
  });
});
