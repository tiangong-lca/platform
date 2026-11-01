import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const {
  nativeChildEnvironment,
  assertLaunchEnvironment,
  defaultLaunchOptions,
} = require('../../../scripts/e2e/batch-allocation-native-runtime.cjs');
const runtime = () => ({
  path: '/owned/runtime-private',
  directories: {
    tmp: '/owned/runtime-private/tmp',
    downloads: '/owned/runtime-private/downloads',
    traces: '/owned/runtime-private/traces',
  },
  env: {
    TMPDIR: '/owned/runtime-private/tmp',
    TMP: '/owned/runtime-private/tmp',
    TEMP: '/owned/runtime-private/tmp',
    XDG_CONFIG_HOME: '/owned/runtime-private/config',
    XDG_CACHE_HOME: '/owned/runtime-private/cache',
    XDG_DATA_HOME: '/owned/runtime-private/data',
    XDG_RUNTIME_DIR: '/owned/runtime-private/run',
  },
});
describe('default-headless native child environment (inert)', () => {
  it('overrides poisoned MAC temp only for owned children and preserves host HOME/CODEX_HOME/TMP/XDG', () => {
    const host = Object.freeze({
      ...process.env,
      MAC_CHROMIUM_TMPDIR: '/foreign',
      HOME: '/home-sentinel',
      CODEX_HOME: '/codex-sentinel',
    });
    const before = { ...process.env },
      owned = runtime();
    expect(nativeChildEnvironment(owned, '/cache', host, 'darwin')).toMatchObject({
      ...owned.env,
      MAC_CHROMIUM_TMPDIR: owned.directories.tmp,
      HOME: host.HOME,
      CODEX_HOME: host.CODEX_HOME,
      PLAYWRIGHT_BROWSERS_PATH: '/cache',
    });
    expect(nativeChildEnvironment(undefined, undefined, host)).toEqual(host);
    expect(process.env).toEqual(before);
    expect(host.MAC_CHROMIUM_TMPDIR).toBe('/foreign');
  });
  it('leaves cleanup environment available after launch admission rejects and adds no full-Chrome socket limit', () => {
    const owned = runtime();
    owned.path = '/owned/runtime-' + 'a'.repeat(240);
    owned.directories.tmp = path.posix.join(owned.path, 'tmp');
    Object.assign(owned.env, {
      TMPDIR: owned.directories.tmp,
      TMP: owned.directories.tmp,
      TEMP: owned.directories.tmp,
    });
    const host = { PWDEBUG: 'private-poison', MAC_CHROMIUM_TMPDIR: '/foreign' };
    expect(() => assertLaunchEnvironment(host)).toThrow('runtime_launch_environment');
    expect(nativeChildEnvironment(owned, '/cache', host, 'darwin').MAC_CHROMIUM_TMPDIR).toBe(
      owned.directories.tmp,
    );
    const invalid = runtime();
    invalid.directories.tmp = '/foreign';
    expect(() => nativeChildEnvironment(invalid, '/cache', {}, 'darwin')).toThrow(
      'runtime_tmp_shape',
    );
  });
  it('constructs the actual public launch options without executable/channel/args/default-argument overrides', () => {
    const options = defaultLaunchOptions(runtime(), 5000, {});
    expect(options).toEqual({
      headless: true,
      host: '127.0.0.1',
      timeout: 5000,
      env: {},
      downloadsPath: runtime().directories.downloads,
      tracesDir: runtime().directories.traces,
    });
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/e2e/batch-allocation-native-worker.cjs'),
      'utf8',
    );
    expect(source).toMatch(/launchServer\(\s*defaultLaunchOptions\(/u);
    for (const value of [
      'executablePath:',
      'channel:',
      'ignoreDefaultArgs:',
      'ignoreAllDefaultArgs:',
    ])
      expect(source).not.toContain(value);
    expect(source.indexOf('verifyDefaultLaunch(')).toBeLessThan(
      source.indexOf('browserTypes[name].connect('),
    );
    expect(source.indexOf("checkpoint('launched'")).toBeLessThan(
      source.indexOf('browserTypes[name].connect('),
    );
  });
  it('models target temp paths independently of a substituted win32 host path module', () => {
    const filename = path.join(process.cwd(), 'scripts/e2e/batch-allocation-native-runtime.cjs');
    const loaded = { exports: {} as any };
    vm.runInNewContext(
      fs.readFileSync(filename, 'utf8'),
      {
        module: loaded,
        process,
        Buffer,
        require: (name: string) =>
          name === 'node:path'
            ? path.win32
            : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name),
      },
      { timeout: 1000 },
    );
    expect(
      loaded.exports.nativeChildEnvironment(runtime(), '/cache', {}, 'darwin').MAC_CHROMIUM_TMPDIR,
    ).toBe(runtime().directories.tmp);
    const invalid = runtime();
    invalid.path = 'C:\\owned\\runtime-private';
    invalid.directories.tmp = 'C:\\owned\\runtime-private\\tmp';
    expect(() => loaded.exports.nativeChildEnvironment(invalid, '/cache', {}, 'darwin')).toThrow(
      'runtime_tmp_shape',
    );
  });
});
