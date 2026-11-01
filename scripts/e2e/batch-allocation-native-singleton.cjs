// Exact Chromium 151 process-singleton accounting. No connection, target follow,
// deletion, generic symlink exception, or retained scalar/hostname/argv data.
const fs = require('node:fs');
// The inspected Chromium runtime is POSIX, independently of the inert test host.
const path = require('node:path').posix;
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { readSnapshot } = require('./portal-native-resources.cjs');
const VERSION = '151.0.7922.34';
const MAX_ANCESTORS = 64;
const COUNTS = Object.freeze({ lockLinks: 1, cookieLinks: 2, socketLinks: 1, socketEndpoints: 1 });
const CONDITIONS = Object.freeze([
  'binding',
  'version',
  'runtime',
  'profile',
  'process',
  'executable',
  'missing',
  'size',
  'shape',
  'cookie',
  'lock',
  'target',
  'endpoint',
  'uid',
  'mode',
  'race',
  'count',
  'unknown-link',
  'unknown-socket',
]);
const exact = (v, keys) =>
  v &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v)) &&
  Object.getOwnPropertyNames(v).length === keys.length &&
  Object.getOwnPropertySymbols(v).length === 0 &&
  keys.every((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k);
    return d && d.enumerable && Object.hasOwn(d, 'value');
  });
const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const identity = (s) => ({ device: s.dev, inode: s.ino, uid: s.uid, mode: s.mode & 0o7777 });
function fail(condition, entryKind = 'unknown', error) {
  const value = Object.assign(new Error('native_singleton_invalid'), {
    singletonCondition: condition,
    entryKind,
  });
  const code = error && Object.getOwnPropertyDescriptor(error, 'code');
  if (code && Object.hasOwn(code, 'value')) value.code = code.value;
  throw value;
}
function canonical(p) {
  return (
    typeof p === 'string' &&
    p.length <= 4096 &&
    path.isAbsolute(p) &&
    p === path.resolve(p) &&
    !p.includes('\0') &&
    !p.includes('\\')
  );
}
const inside = (p, root) => canonical(p) && p.startsWith(root + path.sep);
function assertBinding(v) {
  if (!exact(v, ['version', 'runtime', 'profile', 'process']) || v.version !== VERSION)
    fail('version');
  if (
    !exact(v.runtime, ['path', 'parent', 'device', 'inode', 'nonce', 'uid', 'mode']) ||
    !canonical(v.runtime.path) ||
    !canonical(v.runtime.parent) ||
    path.dirname(v.runtime.path) !== v.runtime.parent ||
    !path.basename(v.runtime.path).startsWith('runtime-') ||
    ![v.runtime.device, v.runtime.inode, v.runtime.uid].every(uint) ||
    v.runtime.mode !== 0o700 ||
    typeof v.runtime.nonce !== 'string' ||
    !/^[a-f0-9-]{36}$/u.test(v.runtime.nonce)
  )
    fail('binding');
  if (
    !exact(v.profile, ['path', 'device', 'inode', 'uid', 'mode']) ||
    !inside(v.profile.path, v.runtime.path) ||
    ![v.profile.device, v.profile.inode, v.profile.uid].every(uint) ||
    v.profile.mode !== 0o700
  )
    fail('binding');
  if (
    !exact(v.process, ['pid', 'parentPid', 'start', 'pgid', 'executable', 'executableSha256']) ||
    ![v.process.pid, v.process.parentPid, v.process.pgid].every((n) => uint(n) && n > 0) ||
    typeof v.process.start !== 'string' ||
    !/^[A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(v.process.start) ||
    !canonical(v.process.executable) ||
    typeof v.process.executableSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(v.process.executableSha256)
  )
    fail('binding');
  return v;
}
function profileFromArgs(args, runtimePath) {
  if (!Array.isArray(args) || args.length > 128) fail('profile');
  let total = 0,
    profile;
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.length > 8192 || (total += Buffer.byteLength(arg)) > 65536)
      fail('profile');
    if (arg === '--user-data-dir') fail('profile');
    if (arg.startsWith('--user-data-dir=')) {
      if (profile !== undefined) fail('profile');
      profile = arg.slice('--user-data-dir='.length);
    }
  }
  if (!inside(profile, runtimePath)) fail('profile');
  return profile;
}
function hashFile(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.size > 512 * 1024 ** 2) fail('executable');
  const fd = fs.openSync(file, 'r'),
    hash = crypto.createHash('sha256'),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes = 0,
      n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) {
      bytes += n;
      if (bytes > before.size) fail('race');
      hash.update(buffer.subarray(0, n));
    }
    const after = fs.fstatSync(fd);
    if (
      bytes !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs
    )
      fail('race');
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}
function assertSummary(v) {
  if (
    !exact(v, [
      'version',
      'counts',
      'tupleDigest',
      'owner',
      'runtime',
      'profile',
      'socketDirectory',
    ]) ||
    v.version !== VERSION ||
    !exact(v.counts, Object.keys(COUNTS)) ||
    !Object.keys(COUNTS).every((k) => v.counts[k] === COUNTS[k]) ||
    typeof v.tupleDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(v.tupleDigest) ||
    !exact(v.owner, ['pid', 'start', 'pgid', 'executableSha256']) ||
    ![v.owner.pid, v.owner.pgid].every((n) => uint(n) && n > 0) ||
    typeof v.owner.start !== 'string' ||
    !/^[A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(v.owner.start) ||
    typeof v.owner.executableSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(v.owner.executableSha256) ||
    !['runtime', 'profile', 'socketDirectory'].every(
      (k) =>
        exact(v[k], ['device', 'inode', 'uid', 'mode']) &&
        [v[k].device, v[k].inode, v[k].uid].every(uint) &&
        v[k].mode === 0o700,
    ) ||
    v.runtime.device !== v.profile.device ||
    v.runtime.device !== v.socketDirectory.device ||
    v.runtime.uid !== v.profile.uid ||
    v.runtime.uid !== v.socketDirectory.uid
  )
    fail('binding');
  return v;
}
function inspectTuple(binding, injected = {}) {
  assertBinding(binding);
  const io = injected.fs || fs,
    inspect = injected.snapshot || readSnapshot,
    clock = injected.now || (() => performance.now()),
    uid = injected.uid === undefined ? process.getuid() : injected.uid,
    hostname = injected.hostname || os.hostname,
    executableHash = injected.hashFile || hashFile,
    buffers = [],
    entries = new Map(),
    ancestors = new Map(),
    links = [];
  const { runtime, profile, process: owner } = binding;
  function stat(file, kind = 'unknown') {
    let value;
    try {
      value = io.lstatSync(file);
    } catch (error) {
      fail('missing', kind, error);
    }
    if (
      !value ||
      ![value.dev, value.ino, value.uid, value.mode, value.size].every(uint) ||
      value.ino === 0 ||
      !Number.isFinite(value.mtimeMs) ||
      !Number.isFinite(value.ctimeMs)
    )
      fail('binding', kind);
    return value;
  }
  function fingerprint(s) {
    return JSON.stringify([s.dev, s.ino, s.uid, s.mode, s.size, s.mtimeMs, s.ctimeMs]);
  }
  function recheck(file, expected, kind) {
    const current = stat(file, kind);
    if (fingerprint(current) !== fingerprint(expected)) fail('race', kind);
    return current;
  }
  function dirs(file, privateMode = true) {
    if (!canonical(file)) fail('target');
    const parts = file.split(path.sep).filter(Boolean);
    if (parts.length > MAX_ANCESTORS) fail('target');
    let at = path.parse(file).root;
    for (const part of parts) {
      at = path.join(at, part);
      const s = stat(at, 'directory');
      if (!s.isDirectory() || s.isSymbolicLink()) fail('profile', 'directory');
      // Directory contents may change normally. Retain only ownership identity,
      // including type, across the bounded union of every walked ancestor.
      const current = JSON.stringify(['directory', s.dev, s.ino, s.uid, s.mode & 0o7777]);
      if (ancestors.has(at)) {
        if (ancestors.get(at) !== current) fail('race', 'directory');
      } else {
        if (ancestors.size >= MAX_ANCESTORS) fail('count', 'directory');
        ancestors.set(at, current);
      }
      if (at === runtime.path || inside(at, runtime.path)) {
        if (s.dev !== runtime.device || s.uid !== uid) fail('uid', 'directory');
        if (privateMode && (s.mode & 0o7777) !== 0o700) fail('mode', 'directory');
      }
    }
  }
  function processFresh() {
    const state = inspect({ remainingMs: 1000 });
    const row = state.status === 'ok' && state.rows.get(owner.pid);
    const age = clock() - state.observedAt;
    if (
      !row ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 2000 ||
      row.pid !== owner.pid ||
      row.start !== owner.start ||
      row.pgid !== owner.pgid ||
      row.ppid !== owner.parentPid
    )
      fail('process');
  }
  function readLink(file, cap) {
    if (!inside(file, runtime.path)) fail('target', 'symlink');
    dirs(path.dirname(file));
    const before = stat(file, 'symlink');
    if (!before.isSymbolicLink()) fail('shape', 'symlink');
    if (before.uid !== uid || before.dev !== runtime.device) fail('uid', 'symlink');
    if (!uint(before.size) || before.size < 1 || before.size > cap) fail('size', 'symlink');
    let bytes;
    try {
      bytes = io.readlinkSync(file, { encoding: 'buffer' });
    } catch (error) {
      fail('shape', 'symlink', error);
    }
    if (!Buffer.isBuffer(bytes) || bytes.length !== before.size || bytes.length > cap)
      fail('race', 'symlink');
    buffers.push(bytes);
    recheck(file, before, 'symlink');
    entries.set(file, { stat: before, kind: 'symlink' });
    links.push([file, cap, before, bytes]);
    return bytes;
  }
  try {
    dirs(runtime.path);
    const rs = stat(runtime.path, 'directory');
    if (
      rs.dev !== runtime.device ||
      rs.ino !== runtime.inode ||
      rs.uid !== runtime.uid ||
      rs.uid !== uid ||
      (rs.mode & 0o7777) !== runtime.mode
    )
      fail('runtime', 'directory');
    const nonceFile = path.join(runtime.path, '.owner'),
      ns = stat(nonceFile, 'file');
    if (
      !ns.isFile() ||
      ns.isSymbolicLink() ||
      ns.dev !== runtime.device ||
      ns.uid !== uid ||
      (ns.mode & 0o7777) !== 0o600 ||
      ns.size !== 36
    )
      fail('runtime', 'file');
    let nonce;
    try {
      nonce = io.readFileSync(nonceFile);
    } catch (error) {
      fail('runtime', 'file', error);
    }
    if (!Buffer.isBuffer(nonce) || nonce.length !== 36 || !nonce.equals(Buffer.from(runtime.nonce)))
      fail('runtime', 'file');
    recheck(nonceFile, ns, 'file');
    dirs(profile.path);
    const ps = stat(profile.path, 'directory');
    if (
      ps.dev !== profile.device ||
      ps.ino !== profile.inode ||
      ps.uid !== profile.uid ||
      (ps.mode & 0o7777) !== profile.mode
    )
      fail('profile', 'directory');
    processFresh();
    if (executableHash(owner.executable) !== owner.executableSha256) fail('executable');
    const lock = readLink(path.join(profile.path, 'SingletonLock'), 512),
      socket = readLink(path.join(profile.path, 'SingletonSocket'), 4096),
      cookie = readLink(path.join(profile.path, 'SingletonCookie'), 20);
    const host = hostname();
    if (
      typeof host !== 'string' ||
      host.length === 0 ||
      host.length > 500 ||
      Buffer.byteLength(host) > 500 ||
      host.includes('/') ||
      host.includes('\\') ||
      host.includes('\0') ||
      host === '.' ||
      host === '..'
    )
      fail('lock', 'symlink');
    const expected = Buffer.from(`${host}-${owner.pid}`);
    buffers.push(expected);
    if (expected.length > 512 || !lock.equals(expected)) fail('lock', 'symlink');
    const target = socket.toString('utf8');
    if (
      !Buffer.from(target).equals(socket) ||
      !inside(target, runtime.path) ||
      path.basename(target) !== 'SingletonSocket'
    )
      fail('target', 'symlink');
    const socketDir = path.dirname(target);
    if (socketDir === profile.path) fail('target', 'socket');
    dirs(socketDir);
    const ds = stat(socketDir, 'directory');
    if ((ds.mode & 0o7777) !== 0o700 || ds.uid !== uid || ds.dev !== runtime.device)
      fail('mode', 'directory');
    const endpoint = stat(target, 'socket');
    if (!endpoint.isSocket() || endpoint.isSymbolicLink()) fail('endpoint', 'socket');
    if (endpoint.uid !== uid || endpoint.dev !== runtime.device) fail('uid', 'socket');
    entries.set(target, { stat: endpoint, kind: 'socket' });
    const remote = readLink(path.join(socketDir, 'SingletonCookie'), 20);
    if (
      !/^(?:0|[1-9][0-9]{0,19})$/u.test(cookie.toString('ascii')) ||
      !Buffer.from(cookie.toString('ascii'), 'ascii').equals(cookie) ||
      BigInt(cookie.toString('ascii')) > 18446744073709551615n ||
      !cookie.equals(remote)
    )
      fail('cookie', 'symlink');
    if (entries.size !== 5 || links.length !== 4) fail('count');
    for (const [file, cap, before, old] of links) {
      const again = stat(file, 'symlink');
      if (!again.isSymbolicLink() || again.size > cap || fingerprint(again) !== fingerprint(before))
        fail('race', 'symlink');
      let value;
      try {
        value = io.readlinkSync(file, { encoding: 'buffer' });
      } catch (error) {
        fail('race', 'symlink', error);
      }
      buffers.push(value);
      if (!Buffer.isBuffer(value) || value.length > cap || !value.equals(old))
        fail('race', 'symlink');
      recheck(file, before, 'symlink');
    }
    recheck(target, endpoint, 'socket');
    dirs(profile.path);
    dirs(socketDir);
    recheck(nonceFile, ns, 'file');
    for (const [file, previous] of [
      [runtime.path, rs],
      [profile.path, ps],
      [socketDir, ds],
    ]) {
      const current = stat(file, 'directory');
      if (
        !current.isDirectory() ||
        JSON.stringify(identity(current)) !== JSON.stringify(identity(previous))
      )
        fail('race', 'directory');
    }
    processFresh();
    const ownerSummary = {
      pid: owner.pid,
      start: owner.start,
      pgid: owner.pgid,
      executableSha256: owner.executableSha256,
    };
    const facts = {
      owner: ownerSummary,
      runtime: identity(rs),
      profile: identity(ps),
      socketDirectory: identity(ds),
      ancestors: [...ancestors.values()],
      entries: [...entries.values()].map(({ stat: s, kind }) => ({
        kind,
        ...identity(s),
        mtimeMs: s.mtimeMs,
        ctimeMs: s.ctimeMs,
      })),
    };
    const summary = assertSummary({
      version: VERSION,
      counts: { ...COUNTS },
      tupleDigest: crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      owner: ownerSummary,
      runtime: identity(rs),
      profile: identity(ps),
      socketDirectory: identity(ds),
    });
    return {
      entries,
      summary,
      assertEntry(file) {
        const allowed = entries.get(file);
        if (!allowed) fail('count');
        const s = recheck(file, allowed.stat, allowed.kind);
        if (allowed.kind === 'socket' ? !s.isSocket() : !s.isSymbolicLink())
          fail('race', allowed.kind);
      },
    };
  } finally {
    for (const bytes of buffers) if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
}
module.exports = {
  VERSION,
  COUNTS,
  CONDITIONS,
  assertBinding,
  profileFromArgs,
  assertSummary,
  inspectTuple,
};
