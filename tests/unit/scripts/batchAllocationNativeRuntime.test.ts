import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const runtime = require('../../../scripts/e2e/batch-allocation-native-runtime.cjs');
const { sha } = require('../../../scripts/e2e/batch-allocation-native-source.cjs');
const { disk } = require('../../../scripts/e2e/batch-allocation-native-probe.cjs');
const { assertReceipt } = require('../../../scripts/e2e/batch-allocation-native.cjs');

function memoryFiles() {
  const nodes = new Map<string, any>(),
    opened: string[] = [],
    followed: string[] = [];
  let ino = 10;
  const add = (file: string, kind: string, value: any = {}) => {
    nodes.set(file, {
      kind,
      dev: 7,
      ino: ++ino,
      uid: 501,
      mode: kind === 'directory' ? 0o700 : 0o600,
      bytes: Buffer.alloc(0),
      mtimeMs: 1,
      ctimeMs: 1,
      ...value,
    });
  };
  const stat = (file: string) => {
    const n = nodes.get(file);
    if (!n) throw Object.assign(Error('missing'), { code: 'ENOENT' });
    return {
      ...n,
      size: n.size ?? n.bytes.length,
      isFile: () => n.kind === 'file',
      isDirectory: () => n.kind === 'directory',
      isSymbolicLink: () => n.kind === 'symlink',
      isSocket: () => n.kind === 'socket',
    };
  };
  const positions = new Map<string, number>();
  const io = {
    lstatSync: stat,
    fstatSync: stat,
    realpathSync: (file: string) => {
      followed.push(file);
      return file;
    },
    openSync: (file: string) => {
      opened.push(file);
      positions.set(file, 0);
      return file;
    },
    readSync: (file: string, buffer: Buffer, offset: number, length: number) => {
      const pos = positions.get(file)!,
        n = nodes.get(file).bytes.copy(buffer, offset, pos, pos + length);
      positions.set(file, pos + n);
      return n;
    },
    closeSync: () => {},
    readdirSync: (dir: string) =>
      [...nodes]
        .filter(([file]) => file !== dir && path.posix.dirname(file) === dir)
        .map(([file]) => ({ name: path.posix.basename(file), ...stat(file) })),
    statfsSync: () => ({ bavail: 12 * 1024 ** 3, bsize: 1 }),
  };
  return { nodes, add, stat, io, opened, followed };
}
function packageFixture() {
  const f = memoryFiles(),
    root = path.join(process.cwd(), 'inert-model'),
    cache = '/cache';
  const locations = {
    test: path.join(root, 'test/package.json'),
    playwright: path.join(root, 'playwright/package.json'),
    core: path.join(root, 'core/package.json'),
    manifest: path.join(root, 'core/browsers.json'),
    bundle: path.join(root, 'core/lib/coreBundle.js'),
  };
  const testReq = createRequire(require.resolve('@playwright/test/package.json'));
  const pwReq = createRequire(testReq.resolve('playwright/package.json'));
  const actualCore = path.dirname(pwReq.resolve('playwright-core/package.json'));
  // Read pinned installed source as bytes; never import or run package code.
  for (const [key, rel] of [
    ['core', 'package.json'],
    ['manifest', 'browsers.json'],
    ['bundle', 'lib/coreBundle.js'],
  ] as const)
    f.add(locations[key], 'file', { bytes: fs.readFileSync(path.join(actualCore, rel)) });
  for (const key of ['test', 'playwright'] as const)
    f.add(locations[key], 'file', { bytes: Buffer.from('{"version":"1.62.1"}') });
  const entries: any = {},
    trees: any = {};
  for (const [name, dir, suffix] of [
    [
      'chromium',
      'chromium_headless_shell-1234',
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    ],
    ['firefox', 'firefox-1538', 'firefox/Nightly.app/Contents/MacOS/firefox'],
    ['webkit', 'webkit-2336', 'pw_run.sh'],
  ]) {
    const executable = `${cache}/${dir}/${suffix}`,
      bytes = Buffer.from('inert executable bytes');
    f.add(executable, 'file', { bytes, mode: 0o755 });
    const files = {
      [executable]: { type: 'file', mode: 0o755, bytes: bytes.length, sha256: sha(bytes) },
    };
    trees[executable] = { directory: `${cache}/${dir}`, files, sha256: sha(JSON.stringify(files)) };
    entries[runtime.ENTRIES[name]] = {
      name: runtime.ENTRIES[name],
      browserName: name,
      directory: `${cache}/${dir}`,
      revision: name === 'chromium' ? '1234' : 'other',
      browserVersion: name === 'chromium' ? '151.0.7922.34' : undefined,
      executablePath: () => executable,
    };
  }
  let imports = 0;
  const core: any = {
    registry: {
      registryDirectory: cache,
      registry: { findExecutable: (name: string) => entries[name] },
    },
  };
  let onImport = () => {};
  const makeRequire = (file: string) => {
    const req: any = (name: string) => {
      expect(file).toBe(locations.playwright);
      expect(name).toBe('playwright-core/lib/coreBundle');
      imports++;
      onImport();
      return core;
    };
    req.resolve = (name: string) => {
      if (file === path.join(root, 'package.json') && name === '@playwright/test/package.json')
        return locations.test;
      if (file === locations.test && name === 'playwright/package.json')
        return locations.playwright;
      if (file === locations.playwright && name === 'playwright-core/package.json')
        return locations.core;
      if (file === locations.playwright && name === 'playwright-core/lib/coreBundle')
        return locations.bundle;
      throw Error('unexpected parent resolution');
    };
    return req;
  };
  const ports = {
    fs: f.io,
    createRequire: makeRequire,
    platform: 'darwin',
    arch: 'arm64',
    fileHash: (file: string) => sha(f.nodes.get(file).bytes),
    bindBrowserTree: (_cache: string, executable: string) => trees[executable],
  };
  const admit = () => runtime.admitDefaultBrowsers(root, cache, {}, ports);
  return {
    ...f,
    root,
    cache,
    locations,
    entries,
    trees,
    core,
    ports,
    admit,
    imports: () => imports,
    setImport: (fn: () => void) => {
      onImport = fn;
    },
  };
}
function runtimeFixture() {
  const f = memoryFiles(),
    root = '/owned/runtime-private',
    nonce = '01234567-89ab-cdef-0123-456789abcdef';
  for (const dir of ['/', '/owned', root, root + '/tmp', root + '/tmp/profile'])
    f.add(dir, 'directory');
  f.add(root + '/.owner', 'file', { bytes: Buffer.from(nonce) });
  f.add(root + '/tmp/profile/file', 'file', { bytes: Buffer.from('inert') });
  const binding = { path: root, parent: '/owned', device: 7, inode: f.nodes.get(root).ino, nonce };
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
    fs: f.io,
    runtimeBinding: binding,
    uid: 501,
    now: () => 0,
    freemem: () => 4 * 1024 ** 3,
    rootKinds: ['output'],
    snapshot: () => ({ status: 'ok' }),
    Ownership: Owner,
    spawn: () => {
      const child: any = new EventEmitter();
      child.pid = 42;
      child.stdout = new EventEmitter();
      child.stdin = {
        end: () =>
          queueMicrotask(() => {
            child.stdout.emit('data', '2 owned-output\n');
            child.emit('close', 0);
          }),
      };
      return child;
    },
  };
  return { ...f, root, binding, injected };
}
const condition = (fn: () => unknown, name: string) => {
  let error: any;
  try {
    fn();
  } catch (value) {
    error = value;
  }
  expect(error?.runtimeCondition).toBe(name);
  expect(error?.message).toBe('native_runtime_invalid');
};
describe('pinned default-headless resolver, without package execution', () => {
  it('uses all three source-bound defaults and pre-admits actual selected executable/cache identities', () => {
    const f = packageFixture(),
      binding = f.admit();
    expect(f.imports()).toBe(1);
    expect(binding.resolver.policy).toBe(runtime.POLICY);
    expect(binding.chromium.selector).toBe('chromium-headless-shell');
    expect(binding.chromium.executable).toContain('/chromium_headless_shell-1234/');
    expect(runtime.assertBrowserBindings(binding, f.cache)).toBe(binding);
    expect(f.opened).not.toContain(binding.chromium.executable);
  });
  it('admits the exact pinned Linux x64 shell mapping independently of the host running this inert test', () => {
    const f = packageFixture();
    const executable =
      '/cache/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
    const bytes = Buffer.from('inert Linux shell entry');
    f.add(executable, 'file', { bytes, mode: 0o755 });
    const files = {
      [executable]: { type: 'file', mode: 0o755, bytes: bytes.length, sha256: sha(bytes) },
    };
    f.trees[executable] = {
      directory: '/cache/chromium_headless_shell-1234',
      files,
      sha256: sha(JSON.stringify(files)),
    };
    f.entries['chromium-headless-shell'].executablePath = () => executable;
    f.ports.platform = 'linux';
    f.ports.arch = 'x64';
    expect(f.admit().chromium.executable).toBe(executable);
  });
  it.each(runtime.FORBIDDEN_ENV as readonly string[])(
    'rejects selection-changing %s before importing any package',
    (name: string) => {
      const f = packageFixture();
      expect(() =>
        runtime.admitDefaultBrowsers(f.root, f.cache, { [name]: 'private sentinel' }, f.ports),
      ).toThrow('runtime_launch_environment');
      expect(f.imports()).toBe(0);
    },
  );
  it.each(['bundle', 'manifest', 'core'] as const)(
    'rejects changed pinned %s bytes before import',
    (key) => {
      const f = packageFixture();
      f.nodes.get(f.locations[key]).bytes = Buffer.from(
        key === 'core' ? '{"version":"1.62.1"}' : 'changed',
      );
      expect(f.admit).toThrow('runtime_package_pin');
      expect(f.imports()).toBe(0);
    },
  );
  it.each(['version', 'symlink', 'oversize', 'replacement'])(
    'rejects %s package input',
    (fault) => {
      const f = packageFixture();
      if (fault === 'version')
        f.nodes.get(f.locations.test).bytes = Buffer.from('{"version":"other"}');
      if (fault === 'symlink') f.nodes.get(f.locations.bundle).kind = 'symlink';
      if (fault === 'oversize') f.nodes.get(f.locations.bundle).size = 4 * 1024 ** 2 + 1;
      if (fault === 'replacement')
        f.io.fstatSync = (file: string) => ({ ...f.stat(file), ino: 999 });
      expect(f.admit).toThrow();
      expect(f.imports()).toBe(0);
    },
  );
  it('rejects pinned input changes caused during resolver import', () => {
    const f = packageFixture();
    f.setImport(() => {
      f.nodes.get(f.locations.test).bytes = Buffer.from('{"version":"changed"}');
    });
    expect(f.admit).toThrow('runtime_package_changed');
  });
  it.each(['missing', 'duplicate', 'override', 'revision', 'version', 'extra'])(
    'rejects %s headless-shell descriptor',
    (fault) => {
      const f = packageFixture(),
        manifest = JSON.parse(f.nodes.get(f.locations.manifest).bytes);
      const item = manifest.browsers.find((x: any) => x.name === 'chromium-headless-shell');
      if (fault === 'missing') manifest.browsers = manifest.browsers.filter((x: any) => x !== item);
      if (fault === 'duplicate') manifest.browsers.push({ ...item });
      if (fault === 'override') item.revisionOverrides = { mac: 'other' };
      if (fault === 'revision') item.revision = 'other';
      if (fault === 'version') item.browserVersion = 'other';
      if (fault === 'extra') item.private = 'unapproved';
      expect(() => runtime.assertShellDescriptor(manifest)).toThrow();
    },
  );
  it.each(['registry', 'entry', 'cache', 'mapping', 'platform'])(
    'rejects %s resolver result without a fallback',
    (fault) => {
      const f = packageFixture();
      if (fault === 'registry') f.core.registry.registry = {};
      if (fault === 'entry') delete f.entries['chromium-headless-shell'];
      if (fault === 'cache') f.core.registry.registryDirectory = '/foreign';
      if (fault === 'mapping')
        f.entries['chromium-headless-shell'].executablePath = () =>
          '/cache/chromium-1234/full-chrome';
      if (fault === 'platform') f.ports.platform = 'win32';
      expect(f.admit).toThrow();
    },
  );
  it('checks actual default spawn and refreshed executable/tree identity before connection', () => {
    const f = packageFixture(),
      expected = f.admit().chromium;
    const child = { spawnfile: expected.executable };
    expect(() => runtime.verifyDefaultLaunch(expected, child, f.cache, f.ports)).not.toThrow();
    expect(() =>
      runtime.verifyDefaultLaunch(expected, { spawnfile: '/cache/full-chrome' }, f.cache, f.ports),
    ).toThrow('runtime_spawn_mismatch');
    f.nodes.get(expected.executable).bytes = Buffer.from('changed');
    expect(() => runtime.verifyDefaultLaunch(expected, child, f.cache, f.ports)).toThrow(
      'runtime_launch_changed',
    );
  });
  it('rejects published binding drift, private extensions and a full-Chrome variant', () => {
    const f = packageFixture(),
      b = f.admit();
    for (const edit of [
      (x: any) => {
        x.resolver.policy = 'full-chrome';
      },
      (x: any) => {
        x.chromium.selector = 'chromium';
      },
      (x: any) => {
        x.chromium.sha256 = 'b'.repeat(64);
      },
      (x: any) => {
        x.chromium.cache.sha256 = 'b'.repeat(64);
      },
      (x: any) => {
        x.chromium.executable = '/foreign/chrome';
      },
      (x: any) => {
        x.chromium.private = 'unapproved';
      },
    ]) {
      const copy = JSON.parse(JSON.stringify(b));
      edit(copy);
      expect(() => runtime.assertBrowserBindings(copy, f.cache)).toThrow();
    }
  });
});
describe('regular-only owned POSIX runtime accounting', () => {
  it('accounts all bytes and returns only fixed policy/identity/count fields without referent traversal', async () => {
    const f = runtimeFixture(),
      result = await disk(['/owned'], '/owned', 15000, f.injected);
    expect(result.status).toBe('ok');
    expect(result.bytes).toBe(2048);
    expect(result.runtime).toMatchObject({
      policy: runtime.POLICY,
      device: 7,
      inode: f.binding.inode,
      uid: 501,
      mode: 0o700,
      directories: 2,
      files: 2,
    });
    expect(f.followed).toEqual(['/owned']);
    expect(f.opened.every((file) => file === f.root + '/.owner')).toBe(true);
    for (const privateValue of [f.root, f.binding.nonce, 'profile', 'file'])
      expect(JSON.stringify(result.runtime)).not.toContain(
        privateValue === 'file' ? '"file"' : privateValue,
      );
  });
  it.each(['symlink', 'socket', 'other'])(
    'rejects any runtime %s before resolving or opening its target',
    async (kind) => {
      const f = runtimeFixture(),
        file = f.root + '/tmp/private-entry';
      f.add(file, kind);
      await expect(disk(['/owned'], '/owned', 15000, f.injected)).rejects.toMatchObject({
        resourceDiagnostic: {
          stage: 'runtime',
          rootKind: 'output',
          entryKind: kind,
          condition:
            kind === 'symlink' ? 'unknown-link' : kind === 'socket' ? 'unknown-socket' : 'type',
        },
      });
      expect(f.followed).not.toContain(file);
      expect(f.opened).not.toContain(file);
    },
  );
  it.each(['nonce', 'inode', 'device', 'mode', 'owner', 'owner-file', 'nonfinite'])(
    'rejects wrong %s identity',
    (fault) => {
      const f = runtimeFixture();
      if (fault === 'nonce') f.binding.nonce = 'f'.repeat(36);
      if (fault === 'inode') f.binding.inode++;
      if (fault === 'device') f.binding.device++;
      if (fault === 'mode') f.nodes.get(f.root).mode = 0o755;
      if (fault === 'owner') f.nodes.get(f.root).uid++;
      if (fault === 'owner-file') f.nodes.get(f.root + '/.owner').kind = 'symlink';
      if (fault === 'nonfinite') f.nodes.get(f.root).ino = NaN;
      expect(() => runtime.inspectRuntime(f.binding, f.io, 501)).toThrow('native_runtime_invalid');
    },
  );
  it('rejects ancestor replacement across accounting while permitting normal directory-content changes', () => {
    const f = runtimeFixture(),
      inspection = runtime.inspectRuntime(f.binding, f.io, 501);
    inspection.entry(f.root + '/tmp/profile/file');
    f.nodes.get(f.root + '/tmp').mtimeMs++;
    f.nodes.get(f.root + '/tmp').size = 500;
    expect(() => inspection.finish()).not.toThrow();
    f.nodes.get(f.root + '/tmp').ino++;
    condition(() => inspection.finish(), 'race');
  });
  it('rejects nonce-file replacement or changed nonce bytes after accounting', () => {
    for (const fault of ['inode', 'bytes']) {
      const f = runtimeFixture(),
        inspection = runtime.inspectRuntime(f.binding, f.io, 501),
        owner = f.nodes.get(f.root + '/.owner');
      if (fault === 'inode') owner.ino++;
      else owner.bytes = Buffer.from('f'.repeat(36));
      condition(() => inspection.finish(), 'race');
    }
  });
  it('rejects substituted symlink ancestors and overdeep target paths without following them', () => {
    const f = runtimeFixture(),
      inspection = runtime.inspectRuntime(f.binding, f.io, 501);
    f.nodes.get(f.root + '/tmp').kind = 'symlink';
    condition(() => inspection.entry(f.root + '/tmp/profile/file'), 'type');
    condition(() => inspection.directory(f.root + '/' + Array(65).fill('x').join('/')), 'count');
    expect(f.followed).toEqual([]);
  });
  it('keeps bounded owned profile parsing and rejects duplicate, oversized, outside or Windows arguments', () => {
    const f = runtimeFixture(),
      profile = f.root + '/tmp/profile';
    expect(runtime.profileFromArgs(['--user-data-dir=' + profile], f.root)).toBe(profile);
    for (const args of [
      [],
      ['--user-data-dir'],
      ['--user-data-dir=/foreign'],
      ['--user-data-dir=' + profile + '/../other'],
      ['--user-data-dir=C:\\foreign'],
      ['--user-data-dir=' + profile, '--user-data-dir=' + profile],
      Array(129).fill('x'),
      ['x'.repeat(8193)],
    ])
      expect(() => runtime.profileFromArgs(args, f.root)).toThrow('runtime_profile');
  });
  it('runs actual POSIX runtime functions with win32 host path substitution', () => {
    const filename = path.join(process.cwd(), 'scripts/e2e/batch-allocation-native-runtime.cjs');
    const module = { exports: {} as any },
      context = vm.createContext({
        module,
        process,
        Buffer,
        require: (name: string) =>
          name === 'node:path'
            ? path.win32
            : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name),
      });
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { timeout: 1000 });
    const inspect = vm.runInContext(
      '(binding, io) => module.exports.inspectRuntime(JSON.parse(binding), io, 501)',
      context,
    );
    const f = runtimeFixture(),
      inspection = inspect(JSON.stringify(f.binding), f.io);
    inspection.entry(f.root + '/tmp/profile/file');
    expect(inspection.finish().files).toBe(1);
    f.nodes.get(f.root + '/tmp').kind = 'symlink';
    condition(() => inspection.entry(f.root + '/tmp/profile/file'), 'type');
  });
});
describe('explicit receipt-v4 runtime proof', () => {
  it('rejects historical receipt schemas instead of silently waiving full-Chrome requirements', () => {
    for (const version of [1, 2, 3])
      expect(() =>
        assertReceipt({ schema: `platform.batch-allocation-native.v${version}` }),
      ).toThrow('resource_receipt_invalid');
    const proof = runtime.emptyRuntimeProof();
    expect(runtime.assertRuntimeProof(proof)).toBe(proof);
    expect(runtime.runtimeProofComplete(proof)).toBe(false);
    for (const change of [
      (p: any) => {
        p.policy = 'full-chrome';
      },
      (p: any) => {
        p.singleton = {};
      },
      (p: any) => {
        p.browsers[0].status = 'closed';
      },
      (p: any) => {
        p.inspections = 1;
      },
    ]) {
      const p = runtime.emptyRuntimeProof();
      change(p);
      expect(() => runtime.assertRuntimeProof(p)).toThrow();
    }
  });
  it('requires exact expected/observed entries, fresh-shaped ownership and closed status for all families', () => {
    const f = packageFixture(),
      b = f.admit(),
      proof = runtime.emptyRuntimeProof();
    proof.resolver = b.resolver;
    proof.inspections = 1;
    proof.lastInspection = {
      policy: runtime.POLICY,
      device: 7,
      inode: 10,
      uid: 501,
      mode: 0o700,
      directories: 1,
      files: 1,
    };
    for (const [i, item] of proof.browsers.entries())
      Object.assign(item, {
        status: 'closed',
        expectedSha256: b[item.browser].sha256,
        observedSha256: b[item.browser].sha256,
        cacheSha256: b[item.browser].cache.sha256,
        owner: { pid: 100 + i, parentPid: 50, pgid: 100 + i, start: 'Sun Nov  1 07:41:08 2026' },
      });
    expect(runtime.runtimeProofComplete(proof)).toBe(true);
    proof.browsers[1].status = 'launched';
    expect(runtime.runtimeProofComplete(proof)).toBe(false);
    proof.browsers[1].observedSha256 = 'b'.repeat(64);
    expect(() => runtime.assertRuntimeProof(proof)).toThrow('runtime_browser_proof');
    const launch = {
      policy: runtime.POLICY,
      pid: 101,
      parentPid: 50,
      pgid: 101,
      start: 'Sun Nov  1 07:41:08 2026',
      executable: b.chromium.executable,
      executableSha256: b.chromium.sha256,
      cacheSha256: b.chromium.cache.sha256,
    };
    expect(runtime.assertLaunchBinding(launch)).toBe(launch);
    expect(() => runtime.assertLaunchBinding({ ...launch, private: 'unapproved' })).toThrow(
      'runtime_launch_binding',
    );
    expect(() => runtime.assertLaunchBinding({ ...launch, start: 'unbound' })).toThrow(
      'runtime_launch_binding',
    );
  });
});
