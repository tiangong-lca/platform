import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const {
  nativeChildEnvironment,
  macChromiumSocketPathBytes,
  macChromiumBundleIdentifier,
  admitMacChromiumRuntime,
} = require('../../../scripts/e2e/batch-allocation-native.cjs');
const { sha } = require('../../../scripts/e2e/batch-allocation-native-source.cjs');

const bundleId = 'com.google.chrome.for.testing';
const runtime = () => ({
  path: '/owned/runtime-abcdef',
  device: 1,
  directories: { tmp: '/owned/runtime-abcdef/tmp' },
  env: {
    TMPDIR: '/owned/runtime-abcdef/tmp',
    TMP: '/owned/runtime-abcdef/tmp',
    TEMP: '/owned/runtime-abcdef/tmp',
    XDG_CONFIG_HOME: '/owned/runtime-abcdef/config',
    XDG_CACHE_HOME: '/owned/runtime-abcdef/cache',
    XDG_DATA_HOME: '/owned/runtime-abcdef/data',
    XDG_RUNTIME_DIR: '/owned/runtime-abcdef/run',
  },
});

function publishedBindingFixture(owned = runtime()) {
  const cache = '/borrowed/cache',
    output = '/owned/output';
  const executable = `${cache}/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  const plist = path.posix.join(path.posix.dirname(path.posix.dirname(executable)), 'Info.plist');
  const bindingFile = path.posix.join(output, 'browser-binding.json');
  const plistBytes = Buffer.from(
    `<plist><dict><key>CFBundleIdentifier</key><string>${bundleId}</string></dict></plist>`,
  );
  const selected: any = {
    executable,
    sha256: 'a'.repeat(64),
    cache: {
      directory: `${cache}/chromium-1234`,
      files: {
        [executable]: { type: 'file', mode: 0o755, bytes: 128, sha256: 'a'.repeat(64) },
        [plist]: { type: 'file', mode: 0o644, bytes: plistBytes.length, sha256: sha(plistBytes) },
      },
      sha256: '',
    },
  };
  const files = new Map<string, Buffer>([[plist, plistBytes]]);
  const stats = new Map<string, any>();
  function stat(file: string) {
    if (!files.has(file) && file !== executable && file !== owned.directories.tmp)
      throw Object.assign(Error('missing'), { code: 'ENOENT' });
    return {
      dev: 1,
      ino: file.length,
      uid: 7,
      mode: file === executable ? 0o755 : file === owned.directories.tmp ? 0o700 : 0o644,
      size: file === executable ? 128 : (files.get(file)?.length ?? 0),
      mtimeMs: 1,
      ctimeMs: 1,
      isFile: () => file !== owned.directories.tmp,
      isDirectory: () => file === owned.directories.tmp,
      isSymbolicLink: () => false,
      ...stats.get(file),
    };
  }
  const positions = new Map<string, number>(),
    opened: string[] = [];
  const io = {
    lstatSync: stat,
    realpathSync: (file: string) => file,
    openSync: (file: string) => {
      opened.push(file);
      positions.set(file, 0);
      return file;
    },
    fstatSync: stat,
    readSync: (file: string, buffer: Buffer, offset: number, length: number) => {
      const bytes = files.get(file)!;
      const position = positions.get(file)!;
      const count = bytes.copy(buffer, offset, position, position + length);
      positions.set(file, position + count);
      return count;
    },
    closeSync: () => {},
  };
  const publish = () => {
    selected.cache.sha256 = sha(JSON.stringify(selected.cache.files));
    files.set(bindingFile, Buffer.from(JSON.stringify({ chromium: selected })));
  };
  publish();
  return {
    cache,
    output,
    executable,
    plist,
    bindingFile,
    selected,
    files,
    stats,
    opened,
    io,
    publish,
  };
}

describe('batch native child environment admission (inert)', () => {
  it('keeps actual Mac target functions POSIX when the host path module is win32', () => {
    const filename = path.join(process.cwd(), 'scripts/e2e/batch-allocation-native.cjs');
    const loaded = { exports: {} as any };
    const targetRequire = (name: string) =>
      name === 'node:path'
        ? path.win32
        : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name);
    vm.runInNewContext(
      fs.readFileSync(filename, 'utf8'),
      {
        module: loaded,
        require: targetRequire,
        __dirname: path.dirname(filename),
        process,
        Buffer,
      },
      { timeout: 1000 },
    );
    const native = loaded.exports,
      owned = runtime(),
      fixture = publishedBindingFixture(owned);
    expect(native.macChromiumSocketPathBytes(owned.directories.tmp)).toBe(
      macChromiumSocketPathBytes(owned.directories.tmp),
    );
    expect(() => native.macChromiumSocketPathBytes('C:\\owned\\runtime-private\\tmp')).toThrow(
      'mac_chromium_tmp_shape',
    );
    expect(
      native.nativeChildEnvironment(owned, '/cache', { MAC_CHROMIUM_TMPDIR: '/foreign' }, 'darwin')
        .MAC_CHROMIUM_TMPDIR,
    ).toBe(owned.directories.tmp);
    expect(() =>
      native.admitMacChromiumRuntime(owned, fixture.cache, fixture.output, fixture.io, 7),
    ).not.toThrow();
    fixture.selected.executable = 'C:\\foreign\\chrome.exe';
    fixture.publish();
    expect(() =>
      native.admitMacChromiumRuntime(owned, fixture.cache, fixture.output, fixture.io, 7),
    ).toThrow('mac_chromium_bundle_identity');
  });

  it('uses the real launch environment builder to replace only the child Mac override', () => {
    const host = Object.freeze({
      ...process.env,
      MAC_CHROMIUM_TMPDIR: '/foreign-host-poison',
      HOME: '/host-home-sentinel',
      CODEX_HOME: '/host-codex-sentinel',
    });
    const hostBefore = { ...host },
      processBefore = { ...process.env },
      owned = runtime();
    const env = nativeChildEnvironment(owned, '/borrowed/browser-cache', host, 'darwin');
    expect(env.MAC_CHROMIUM_TMPDIR).toBe(owned.directories.tmp);
    expect(env).toMatchObject(owned.env);
    expect(env).toMatchObject({
      HOME: host.HOME,
      CODEX_HOME: host.CODEX_HOME,
      PLAYWRIGHT_BROWSERS_PATH: '/borrowed/browser-cache',
      GOMAXPROCS: '2',
      UV_THREADPOOL_SIZE: '2',
      OMP_NUM_THREADS: '2',
    });
    expect(host).toEqual(hostBefore);
    expect(process.env).toEqual(processBefore);
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/e2e/batch-allocation-native.cjs'),
      'utf8',
    );
    expect(source).toContain(
      'env: nativeChildEnvironment(runtime, runtime ? browserCache() : undefined)',
    );
    expect(nativeChildEnvironment(undefined, undefined, host, 'darwin')).toEqual(host);
    expect(nativeChildEnvironment(owned, '/cache', host, 'linux').MAC_CHROMIUM_TMPDIR).toBe(
      '/foreign-host-poison',
    );
  });

  it('admits all 253 Mac socket path bytes, rejects 254, and counts UTF-8 bytes', () => {
    const suffix = `/${bundleId}.XXXXXX/SingletonSocket`;
    const tmp = '/' + 'a'.repeat(252 - Buffer.byteLength(suffix));
    expect(macChromiumSocketPathBytes(tmp)).toBe(253);
    expect(() => macChromiumSocketPathBytes(tmp + 'a')).toThrow('mac_chromium_socket_path_limit');
    expect(macChromiumSocketPathBytes('/owned/运行')).toBe(
      Buffer.byteLength(`/owned/运行${suffix}`),
    );
    expect(() => macChromiumSocketPathBytes('/' + '界'.repeat(80))).toThrow(
      'mac_chromium_socket_path_limit',
    );
  });

  it('keeps cleanup child environment construction available after socket-length admission rejects', () => {
    const owned = runtime();
    owned.path = '/owned/runtime-' + 'a'.repeat(240);
    owned.directories.tmp = path.posix.join(owned.path, 'tmp');
    Object.assign(owned.env, {
      TMPDIR: owned.directories.tmp,
      TMP: owned.directories.tmp,
      TEMP: owned.directories.tmp,
    });
    const fixture = publishedBindingFixture(owned);
    expect(() =>
      admitMacChromiumRuntime(owned, fixture.cache, fixture.output, fixture.io, 7),
    ).toThrow('mac_chromium_socket_path_limit');
    const host = Object.freeze({ MAC_CHROMIUM_TMPDIR: '/host-poison' });
    expect(nativeChildEnvironment(owned, '/cache', host, 'darwin')).toMatchObject({
      MAC_CHROMIUM_TMPDIR: owned.directories.tmp,
      ...owned.env,
    });
    expect(host.MAC_CHROMIUM_TMPDIR).toBe('/host-poison');
  });

  it('admits the published worker executable/plist binding without importing Playwright or reading its executable', () => {
    const fixture = publishedBindingFixture();
    expect(() =>
      admitMacChromiumRuntime(runtime(), fixture.cache, fixture.output, fixture.io, 7),
    ).not.toThrow();
    expect(fixture.opened).toEqual([fixture.bindingFile, fixture.plist]);
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/e2e/batch-allocation-native.cjs'),
      'utf8',
    );
    expect(source).not.toContain("require('@playwright/test')");
    const browserAdmission = source.indexOf("if (message.phase === 'browser')");
    const macAdmission = source.indexOf('admitMacChromiumRuntime(runtime, browserCache(), output)');
    expect(macAdmission).toBeGreaterThan(browserAdmission);
    expect(macAdmission).toBeLessThan(source.indexOf('browserOpen = true;', browserAdmission));
  });

  it.each([
    'missing-plist',
    'plist-hash',
    'executable-hash',
    'outside-executable',
    'cache-hash',
    'oversize-plist',
  ])('rejects a source binding with %s before browser admission', (fault) => {
    const f = publishedBindingFixture();
    if (fault === 'missing-plist') delete f.selected.cache.files[f.plist];
    if (fault === 'plist-hash') f.selected.cache.files[f.plist].sha256 = 'b'.repeat(64);
    if (fault === 'executable-hash') f.selected.sha256 = 'b'.repeat(64);
    if (fault === 'outside-executable')
      f.selected.executable = '/foreign/Google Chrome for Testing';
    if (fault === 'oversize-plist') f.selected.cache.files[f.plist].bytes = 128 * 1024 + 1;
    f.publish();
    if (fault === 'cache-hash') {
      f.selected.cache.sha256 = 'b'.repeat(64);
      f.files.set(f.bindingFile, Buffer.from(JSON.stringify({ chromium: f.selected })));
    }
    expect(() => admitMacChromiumRuntime(runtime(), f.cache, f.output, f.io, 7)).toThrow(
      ['outside-executable', 'cache-hash'].includes(fault)
        ? 'mac_chromium_bundle_identity'
        : 'mac_chromium_bundle_binding',
    );
    expect(f.opened).not.toContain(f.executable);
  });

  it.each(['missing', 'oversize', 'symlink', 'changed-inode'])(
    'rejects a %s published binding using bounded regular-file inspection',
    (fault) => {
      const f = publishedBindingFixture();
      if (fault === 'missing') f.files.delete(f.bindingFile);
      if (fault === 'oversize') f.stats.set(f.bindingFile, { size: 8 * 1024 ** 2 + 1 });
      if (fault === 'symlink') f.stats.set(f.bindingFile, { isSymbolicLink: () => true });
      if (fault === 'changed-inode') {
        const original = f.io.fstatSync;
        f.io.fstatSync = (file: string) => ({ ...original(file), ino: 999 });
      }
      expect(() => admitMacChromiumRuntime(runtime(), f.cache, f.output, f.io, 7)).toThrow(
        fault === 'missing'
          ? 'missing'
          : fault === 'changed-inode'
            ? 'mac_chromium_binding_changed'
            : 'mac_chromium_binding_file',
      );
      expect(f.opened).toEqual(fault === 'changed-inode' ? [f.bindingFile] : []);
    },
  );

  it('rejects unprovable path and bundle shapes before constructing the child environment', () => {
    for (const tmp of [
      'relative/tmp',
      '/owned/../tmp',
      '/owned/tmp/',
      '/owned/\0tmp',
      '/owned/\\tmp',
    ])
      expect(() => macChromiumSocketPathBytes(tmp)).toThrow('mac_chromium_tmp_shape');
    expect(() => macChromiumSocketPathBytes('/owned/tmp', 'org.chromium.Chromium')).toThrow(
      'mac_chromium_tmp_shape',
    );
    const owned = runtime();
    owned.directories.tmp = '/foreign/tmp';
    expect(() => nativeChildEnvironment(owned, '/cache', {}, 'darwin')).toThrow(
      'mac_chromium_tmp_shape',
    );
    const valid = `<plist><dict><key>CFBundleIdentifier</key><string>${bundleId}</string></dict></plist>`;
    expect(macChromiumBundleIdentifier(Buffer.from(valid))).toBe(bundleId);
    for (const text of [
      valid.replace(bundleId, 'com.google.Chrome'),
      valid.replace('</dict>', '<key>CFBundleIdentifier</key><integer>1</integer></dict>'),
      valid.replace('</dict>', `<key>CFBundleIdentifier</key><string>${bundleId}</string></dict>`),
      '<plist/>',
    ])
      expect(() => macChromiumBundleIdentifier(Buffer.from(text))).toThrow(
        'mac_chromium_bundle_identity',
      );
    expect(() => macChromiumBundleIdentifier(Buffer.alloc(128 * 1024 + 1))).toThrow(
      'mac_chromium_bundle_shape',
    );
    expect(() => macChromiumBundleIdentifier(Buffer.from([0xff]))).toThrow(
      'mac_chromium_bundle_shape',
    );
  });
});
