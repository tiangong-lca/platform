// Exact installed default-headless selection and POSIX runtime admission.
// Package imports occur only in admitDefaultBrowsers, called by the owned worker.
const fs = require('node:fs'),
  hostPath = require('node:path'),
  path = hostPath.posix;
const { createRequire } = require('node:module');
const { check, BROWSERS } = require('./batch-allocation-native-policy.cjs');
const { sha, fileHash, bindBrowserTree } = require('./batch-allocation-native-source.cjs');
const POLICY = 'playwright-1.62.1-default-headless';
// Verified against the official npm archive and registry SHA512 SRI, in memory.
const ARCHIVE = Object.freeze({
  url: 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz',
  integrity:
    'sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==',
  sha256: '954be1e183d0ddb9748fe0d2d08b0b66a9210c74dd75c397aeb70303b9f08a00',
});
const PINS = Object.freeze({
  'package.json': '07c47543631fef9508760365dee9fbe958c562093ec8d122543949ed231f233f',
  'browsers.json': 'f306eed529599b1eaf2f8a85db9de2b23e1a3fe36c2b66434b7c9434fb627a99',
  'lib/coreBundle.js': '9393fa79e1c67c74edc26b610d65a4f7ed73d345a762465cc88340a33a2454ac',
});
const ENTRIES = Object.freeze({
  chromium: 'chromium-headless-shell',
  firefox: 'firefox',
  webkit: 'webkit',
});
const FORBIDDEN_ENV = Object.freeze([
  'PWDEBUG',
  'npm_config_pwdebug',
  'npm_package_config_pwdebug',
  'SELENIUM_REMOTE_URL',
  'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE',
]);
const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const digest = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/u.test(s);
const exact = (v, keys) =>
  v &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v)) &&
  !Object.getOwnPropertySymbols(v).length &&
  Object.getOwnPropertyNames(v).length === keys.length &&
  keys.every((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k);
    return d && d.enumerable && Object.hasOwn(d, 'value');
  });
const canonical = (p) =>
  typeof p === 'string' &&
  p.length <= 4096 &&
  path.isAbsolute(p) &&
  path.resolve(p) === p &&
  !p.includes('\0') &&
  !p.includes('\\');
const inside = (p, root) => canonical(p) && p.startsWith(root + '/');
function assertLaunchEnvironment(env = process.env) {
  check(
    FORBIDDEN_ENV.every((key) => !env[key]),
    'runtime_launch_environment',
  );
}
function readRegular(file, cap, io = fs) {
  const before = io.lstatSync(file);
  check(
    before.isFile() && !before.isSymbolicLink() && uint(before.size) && before.size <= cap,
    'runtime_binding_file',
  );
  const unchanged = (s) =>
    s.isFile() &&
    s.dev === before.dev &&
    s.ino === before.ino &&
    s.size === before.size &&
    s.mtimeMs === before.mtimeMs &&
    s.ctimeMs === before.ctimeMs;
  const fd = io.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    check(unchanged(io.fstatSync(fd)), 'runtime_binding_changed');
    const buffer = Buffer.alloc(before.size + 1);
    let size = 0,
      n;
    while (size < buffer.length && (n = io.readSync(fd, buffer, size, buffer.length - size, null)))
      size += n;
    check(
      size === before.size && unchanged(io.fstatSync(fd)) && unchanged(io.lstatSync(file)),
      'runtime_binding_changed',
    );
    return buffer.subarray(0, size);
  } finally {
    io.closeSync(fd);
  }
}
function inspectRuntimePackages(root, ports = {}) {
  const io = ports.fs || fs,
    makeRequire = ports.createRequire || createRequire;
  const req = makeRequire(hostPath.join(root, 'package.json'));
  const testFile = req.resolve('@playwright/test/package.json');
  const testReq = makeRequire(testFile),
    playwrightFile = testReq.resolve('playwright/package.json');
  const pwReq = makeRequire(playwrightFile),
    coreFile = pwReq.resolve('playwright-core/package.json');
  const coreRoot = hostPath.dirname(coreFile),
    bundleFile = pwReq.resolve('playwright-core/lib/coreBundle');
  check(bundleFile === hostPath.join(coreRoot, 'lib/coreBundle.js'), 'runtime_resolver_path');
  const files = {},
    bytes = {};
  for (const file of [
    testFile,
    playwrightFile,
    coreFile,
    hostPath.join(coreRoot, 'browsers.json'),
    bundleFile,
  ]) {
    check(io.realpathSync(file) === file, 'runtime_package_alias');
    bytes[file] = readRegular(file, file === bundleFile ? 4 * 1024 ** 2 : 64 * 1024, io);
    files[file] = sha(bytes[file]);
  }
  for (const file of [testFile, playwrightFile, coreFile])
    check(JSON.parse(bytes[file]).version === '1.62.1', 'runtime_package_version');
  for (const [rel, hash] of Object.entries(PINS))
    check(files[hostPath.join(coreRoot, rel)] === hash, 'runtime_package_pin');
  check(
    JSON.parse(bytes[coreFile]).exports['./lib/coreBundle'] === './lib/coreBundle.js',
    'runtime_resolver_export',
  );
  const manifest = JSON.parse(bytes[hostPath.join(coreRoot, 'browsers.json')]);
  const descriptor = assertShellDescriptor(manifest);
  return {
    files,
    descriptor,
    descriptorSha256: sha(JSON.stringify(descriptor)),
    manifest,
    pwReq,
    bundleFile,
  };
}
function assertShellDescriptor(manifest) {
  check(manifest && Array.isArray(manifest.browsers), 'runtime_descriptor_count');
  const descriptors = manifest.browsers.filter((item) => item.name === ENTRIES.chromium);
  check(descriptors.length === 1, 'runtime_descriptor_count');
  const descriptor = descriptors[0];
  check(
    exact(descriptor, ['name', 'revision', 'installByDefault', 'browserVersion', 'title']) &&
      descriptor.revision === '1234' &&
      descriptor.installByDefault === true &&
      descriptor.browserVersion === '151.0.7922.34' &&
      descriptor.title === 'Chrome Headless Shell',
    'runtime_descriptor',
  );
  return descriptor;
}
function resolverProof(inputs) {
  return {
    policy: POLICY,
    version: '1.62.1',
    resolverSha256: PINS['lib/coreBundle.js'],
    manifestSha256: PINS['browsers.json'],
    packageSha256: PINS['package.json'],
    descriptorSha256: inputs.descriptorSha256,
  };
}
function assertResolverProof(v) {
  check(
    exact(v, [
      'policy',
      'version',
      'resolverSha256',
      'manifestSha256',
      'packageSha256',
      'descriptorSha256',
    ]) &&
      v.policy === POLICY &&
      v.version === '1.62.1' &&
      v.resolverSha256 === PINS['lib/coreBundle.js'] &&
      v.manifestSha256 === PINS['browsers.json'] &&
      v.packageSha256 === PINS['package.json'] &&
      v.descriptorSha256 ===
        sha(
          JSON.stringify({
            name: 'chromium-headless-shell',
            revision: '1234',
            installByDefault: true,
            browserVersion: '151.0.7922.34',
            title: 'Chrome Headless Shell',
          }),
        ),
    'runtime_resolver_proof',
  );
  return v;
}
function admitDefaultBrowsers(root, cache, env = process.env, ports = {}) {
  assertLaunchEnvironment(env);
  const io = ports.fs || fs,
    inputs = inspectRuntimePackages(root, ports);
  // This exact package export is upstream internal API; all input bytes are pinned.
  const core = inputs.pwReq('playwright-core/lib/coreBundle'),
    registry = core?.registry?.registry;
  check(
    registry &&
      typeof registry.findExecutable === 'function' &&
      core.registry.registryDirectory === cache,
    'runtime_registry',
  );
  const platform = ports.platform || process.platform,
    arch = ports.arch || process.arch;
  const suffix =
    platform === 'darwin' && arch === 'arm64'
      ? ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell']
      : platform === 'linux' && arch === 'x64'
        ? ['chrome-headless-shell-linux64', 'chrome-headless-shell']
        : null;
  check(suffix && canonical(cache) && io.realpathSync(cache) === cache, 'runtime_platform');
  const browsers = {};
  for (const name of BROWSERS) {
    const entry = registry.findExecutable(ENTRIES[name]);
    check(
      entry &&
        entry.name === ENTRIES[name] &&
        entry.browserName === name &&
        typeof entry.executablePath === 'function',
      'runtime_registry_entry',
    );
    const executable = entry.executablePath();
    check(
      inside(executable, cache) &&
        io.realpathSync(executable) === executable &&
        entry.directory === path.join(cache, path.relative(cache, executable).split('/')[0]),
      'runtime_executable',
    );
    if (name === 'chromium')
      check(
        entry.revision === '1234' &&
          entry.browserVersion === '151.0.7922.34' &&
          executable === path.join(cache, 'chromium_headless_shell-1234', ...suffix),
        'runtime_chromium_mapping',
      );
    browsers[name] = {
      selector: ENTRIES[name],
      executable,
      sha256: (ports.fileHash || fileHash)(executable, 512 * 1024 ** 2),
      cache: (ports.bindBrowserTree || bindBrowserTree)(cache, executable),
    };
  }
  // An import must not change any pinned module or metadata input.
  for (const [file, hash] of Object.entries(inputs.files))
    check(
      sha(readRegular(file, file === inputs.bundleFile ? 4 * 1024 ** 2 : 64 * 1024, io)) === hash,
      'runtime_package_changed',
    );
  return { resolver: assertResolverProof(resolverProof(inputs)), ...browsers };
}
function assertBrowserBindings(binding, cache) {
  check(exact(binding, ['resolver', ...BROWSERS]), 'runtime_browser_bindings');
  assertResolverProof(binding.resolver);
  for (const name of BROWSERS) {
    const b = binding[name];
    check(
      exact(b, ['selector', 'executable', 'sha256', 'cache']) &&
        b.selector === ENTRIES[name] &&
        inside(b.executable, cache) &&
        digest(b.sha256) &&
        exact(b.cache, ['directory', 'files', 'sha256']) &&
        inside(b.cache.directory, cache) &&
        b.executable.startsWith(b.cache.directory + '/') &&
        b.cache.files &&
        typeof b.cache.files === 'object' &&
        Object.getOwnPropertyNames(b.cache.files).length <= 20000 &&
        sha(JSON.stringify(b.cache.files)) === b.cache.sha256,
      'runtime_browser_binding',
    );
    const file = b.cache.files[b.executable];
    check(
      file?.type === 'file' &&
        file.sha256 === b.sha256 &&
        uint(file.bytes) &&
        file.bytes <= 512 * 1024 ** 2,
      'runtime_executable_binding',
    );
    if (name === 'chromium')
      check(
        b.cache.directory === path.join(cache, 'chromium_headless_shell-1234') &&
          [
            '/chrome-headless-shell-mac-arm64/chrome-headless-shell',
            '/chrome-headless-shell-linux64/chrome-headless-shell',
          ].some((suffix) => b.executable === b.cache.directory + suffix),
        'runtime_chromium_mapping',
      );
  }
  return binding;
}
function defaultLaunchOptions(runtime, remainingMs, env = process.env) {
  assertLaunchEnvironment(env);
  return {
    headless: true,
    host: '127.0.0.1',
    timeout: Math.min(30000, remainingMs),
    env: { ...env },
    downloadsPath: runtime.directories.downloads,
    tracesDir: runtime.directories.traces,
  };
}
function verifyDefaultLaunch(expected, child, cache, ports = {}) {
  const io = ports.fs || fs;
  check(io.realpathSync(child.spawnfile) === expected.executable, 'runtime_spawn_mismatch');
  check(
    (ports.fileHash || fileHash)(expected.executable, 512 * 1024 ** 2) === expected.sha256 &&
      (ports.bindBrowserTree || bindBrowserTree)(cache, expected.executable).sha256 ===
        expected.cache.sha256,
    'runtime_launch_changed',
  );
}
function assertLaunchBinding(v) {
  check(
    exact(v, [
      'policy',
      'pid',
      'parentPid',
      'start',
      'pgid',
      'executable',
      'executableSha256',
      'cacheSha256',
    ]) &&
      v.policy === POLICY &&
      ['pid', 'parentPid', 'pgid'].every((key) => uint(v[key]) && v[key] > 0) &&
      typeof v.start === 'string' &&
      /^[A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(v.start) &&
      canonical(v.executable) &&
      digest(v.executableSha256) &&
      digest(v.cacheSha256),
    'runtime_launch_binding',
  );
  return v;
}
function nativeChildEnvironment(runtime, cache, host = process.env, platform = process.platform) {
  if (!runtime) return { ...host };
  const env = {
    ...host,
    ...runtime.env,
    PLAYWRIGHT_BROWSERS_PATH: cache,
    GOMAXPROCS: '2',
    UV_THREADPOOL_SIZE: '2',
    OMP_NUM_THREADS: '2',
  };
  if (platform === 'darwin') {
    check(
      canonical(runtime.directories.tmp) &&
        runtime.directories.tmp === path.join(runtime.path, 'tmp'),
      'runtime_tmp_shape',
    );
    env.MAC_CHROMIUM_TMPDIR = runtime.directories.tmp;
  }
  return env;
}
function assertRuntimeBinding(v) {
  check(
    exact(v, ['path', 'parent', 'device', 'inode', 'nonce']) &&
      canonical(v.path) &&
      canonical(v.parent) &&
      path.dirname(v.path) === v.parent &&
      path.basename(v.path).startsWith('runtime-') &&
      [v.device, v.inode].every(uint) &&
      v.inode > 0 &&
      typeof v.nonce === 'string' &&
      /^[a-f0-9-]{36}$/u.test(v.nonce),
    'runtime_binding',
  );
  return v;
}
function runtimeFailure(condition, entryKind = 'unknown') {
  return Object.assign(Error('native_runtime_invalid'), { runtimeCondition: condition, entryKind });
}
function inspectRuntime(binding, io = fs, uid = process.getuid()) {
  try {
    assertRuntimeBinding(binding);
  } catch {
    throw runtimeFailure('binding');
  }
  const ancestors = new Map();
  function stat(file) {
    const value = io.lstatSync(file);
    if (
      ![value.dev, value.ino, value.uid, value.mode, value.size].every(uint) ||
      value.ino === 0 ||
      !Number.isFinite(value.mtimeMs) ||
      !Number.isFinite(value.ctimeMs)
    )
      throw runtimeFailure('binding');
    return value;
  }
  const identity = (s) => [s.dev, s.ino, s.uid, s.mode & 0o7777];
  function directory(file) {
    if (!canonical(file) || (file !== binding.path && !inside(file, binding.path)))
      throw runtimeFailure('binding', 'directory');
    const parts = file.split('/').filter(Boolean);
    if (parts.length > 64) throw runtimeFailure('count', 'directory');
    let at = '/';
    for (const part of parts) {
      at = path.join(at, part);
      const value = stat(at);
      if (!value.isDirectory() || value.isSymbolicLink()) throw runtimeFailure('type', 'directory');
      const current = JSON.stringify(identity(value));
      if (ancestors.has(at) && ancestors.get(at) !== current)
        throw runtimeFailure('race', 'directory');
      ancestors.set(at, current);
      if (at === binding.path || inside(at, binding.path)) {
        if (value.dev !== binding.device || value.uid !== uid)
          throw runtimeFailure('owner', 'directory');
      }
    }
    // The whole walked tree retains the existing 500,000-entry cap; the old
    // 64-path union belonged to the retired five-entry singleton tuple only.
    if (ancestors.size > 500000 + 64) throw runtimeFailure('count', 'directory');
  }
  directory(binding.path);
  const root = stat(binding.path),
    ownerFile = path.join(binding.path, '.owner');
  if (
    root.dev !== binding.device ||
    root.ino !== binding.inode ||
    root.uid !== uid ||
    (root.mode & 0o7777) !== 0o700
  )
    throw runtimeFailure('binding', 'directory');
  const owner = stat(ownerFile);
  if (
    !owner.isFile() ||
    owner.isSymbolicLink() ||
    owner.dev !== binding.device ||
    owner.uid !== uid ||
    (owner.mode & 0o7777) !== 0o600 ||
    owner.size !== 36
  )
    throw runtimeFailure('binding', 'file');
  const nonce = readRegular(ownerFile, 36, io);
  if (!nonce.equals(Buffer.from(binding.nonce))) throw runtimeFailure('binding', 'file');
  let directories = 0,
    files = 0;
  return {
    directory,
    entry(file) {
      directory(path.dirname(file));
      const value = stat(file);
      if (value.isSymbolicLink()) throw runtimeFailure('unknown-link', 'symlink');
      if (value.isSocket?.()) throw runtimeFailure('unknown-socket', 'socket');
      if (value.dev !== binding.device || value.uid !== uid) throw runtimeFailure('owner');
      let kind;
      if (value.isDirectory()) {
        directory(file);
        directories++;
        kind = 'directory';
      } else if (value.isFile()) {
        files++;
        kind = 'file';
      } else throw runtimeFailure('type', 'other');
      if (directories + files > 500000) throw runtimeFailure('count');
      return kind;
    },
    finish() {
      for (const [file, previous] of ancestors) {
        const value = stat(file);
        if (
          !value.isDirectory() ||
          value.isSymbolicLink() ||
          JSON.stringify(identity(value)) !== previous
        )
          throw runtimeFailure('race', 'directory');
      }
      const value = stat(ownerFile);
      if (
        !value.isFile() ||
        value.isSymbolicLink() ||
        JSON.stringify([
          value.dev,
          value.ino,
          value.uid,
          value.mode,
          value.size,
          value.mtimeMs,
          value.ctimeMs,
        ]) !==
          JSON.stringify([
            owner.dev,
            owner.ino,
            owner.uid,
            owner.mode,
            owner.size,
            owner.mtimeMs,
            owner.ctimeMs,
          ]) ||
        !readRegular(ownerFile, 36, io).equals(nonce)
      )
        throw runtimeFailure('race', 'file');
      return assertRuntimeInspection({
        policy: POLICY,
        device: binding.device,
        inode: binding.inode,
        uid,
        mode: 0o700,
        directories,
        files,
      });
    },
  };
}
function assertRuntimeInspection(v) {
  check(
    exact(v, ['policy', 'device', 'inode', 'uid', 'mode', 'directories', 'files']) &&
      v.policy === POLICY &&
      ['device', 'inode', 'uid', 'directories', 'files'].every((key) => uint(v[key])) &&
      v.inode > 0 &&
      v.mode === 0o700 &&
      v.directories + v.files <= 500000,
    'runtime_inspection',
  );
  return v;
}
function profileFromArgs(args, runtimePath) {
  check(Array.isArray(args) && args.length <= 128, 'runtime_profile');
  let total = 0,
    profile;
  for (const arg of args) {
    check(
      typeof arg === 'string' &&
        arg.length <= 8192 &&
        (total += Buffer.byteLength(arg)) <= 65536 &&
        arg !== '--user-data-dir',
      'runtime_profile',
    );
    if (arg.startsWith('--user-data-dir=')) {
      check(profile === undefined, 'runtime_profile');
      profile = arg.slice('--user-data-dir='.length);
    }
  }
  check(inside(profile, runtimePath), 'runtime_profile');
  return profile;
}
function emptyRuntimeProof() {
  return {
    policy: POLICY,
    resolver: null,
    inspections: 0,
    lastInspection: null,
    browsers: BROWSERS.map((browser) => ({
      browser,
      status: 'not-admitted',
      selector: ENTRIES[browser],
      expectedSha256: null,
      observedSha256: null,
      cacheSha256: null,
      owner: null,
    })),
  };
}
function assertRuntimeProof(v) {
  check(
    exact(v, ['policy', 'resolver', 'inspections', 'lastInspection', 'browsers']) &&
      v.policy === POLICY &&
      uint(v.inspections) &&
      v.inspections <= 512 &&
      Array.isArray(v.browsers) &&
      Object.getPrototypeOf(v.browsers) === Array.prototype &&
      v.browsers.length === 3 &&
      !Object.getOwnPropertySymbols(v.browsers).length &&
      Object.getOwnPropertyNames(v.browsers).length === 4 &&
      [0, 1, 2].every((i) => {
        const d = Object.getOwnPropertyDescriptor(v.browsers, i);
        return d && d.enumerable && Object.hasOwn(d, 'value');
      }),
    'runtime_proof',
  );
  if (v.resolver !== null) assertResolverProof(v.resolver);
  if (v.lastInspection !== null) assertRuntimeInspection(v.lastInspection);
  check(v.lastInspection === null ? v.inspections === 0 : v.inspections > 0, 'runtime_proof');
  for (const [index, b] of v.browsers.entries()) {
    check(
      exact(b, [
        'browser',
        'status',
        'selector',
        'expectedSha256',
        'observedSha256',
        'cacheSha256',
        'owner',
      ]) &&
        b.browser === BROWSERS[index] &&
        b.selector === ENTRIES[b.browser] &&
        ['not-admitted', 'admitted', 'launched', 'closed'].includes(b.status),
      'runtime_browser_proof',
    );
    if (b.status === 'not-admitted')
      check(
        [b.expectedSha256, b.observedSha256, b.cacheSha256, b.owner].every((x) => x === null),
        'runtime_browser_proof',
      );
    else
      check(
        v.resolver !== null && digest(b.expectedSha256) && digest(b.cacheSha256),
        'runtime_browser_proof',
      );
    if (b.status === 'admitted')
      check(b.observedSha256 === null && b.owner === null, 'runtime_browser_proof');
    if (['launched', 'closed'].includes(b.status))
      check(
        b.observedSha256 === b.expectedSha256 &&
          exact(b.owner, ['pid', 'parentPid', 'start', 'pgid']) &&
          ['pid', 'parentPid', 'pgid'].every((k) => uint(b.owner[k]) && b.owner[k] > 0) &&
          typeof b.owner.start === 'string' &&
          /^[A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(b.owner.start),
        'runtime_browser_proof',
      );
  }
  return v;
}
function runtimeProofComplete(v) {
  assertRuntimeProof(v);
  return (
    v.resolver !== null &&
    v.inspections > 0 &&
    v.lastInspection !== null &&
    v.browsers.every((b) => b.status === 'closed')
  );
}
module.exports = {
  POLICY,
  ARCHIVE,
  PINS,
  ENTRIES,
  FORBIDDEN_ENV,
  assertLaunchEnvironment,
  readRegular,
  inspectRuntimePackages,
  assertShellDescriptor,
  assertResolverProof,
  admitDefaultBrowsers,
  assertBrowserBindings,
  defaultLaunchOptions,
  verifyDefaultLaunch,
  assertLaunchBinding,
  nativeChildEnvironment,
  assertRuntimeBinding,
  inspectRuntime,
  assertRuntimeInspection,
  profileFromArgs,
  emptyRuntimeProof,
  assertRuntimeProof,
  runtimeProofComplete,
};
