const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { onePackage, packageFromParent } = require('./auditPackageResolution.cjs');

const globCopies = [
  packageFromParent(onePackage('rimraf', 4), 'glob'),
  packageFromParent(onePackage('rimraf', 5), 'glob'),
  packageFromParent(onePackage('jest-config', 30), 'glob'),
];
const minimatchCopies = globCopies.map((copy) => packageFromParent(copy, 'minimatch'));
assert.deepEqual(
  globCopies.map((copy) => copy.manifest.version),
  ['9.3.5', '10.5.0', '13.0.6'],
);
assert.deepEqual(
  minimatchCopies.map((copy) => copy.manifest.version),
  ['8.0.7', '9.0.9', '10.2.5'],
);

function endpoint(copy, mode, raw = false) {
  return path.join(copy.directory, copy.manifest.exports[raw ? './raw' : '.'][mode].default);
}
async function load(copy, mode, raw = false) {
  const target = endpoint(copy, mode, raw);
  return mode === 'require' ? require(target) : import(pathToFileURL(target).href);
}
function optimizerBranches(prototype, configurable) {
  const row = ['**', '..', 'a', 'b'];
  let pushes = 0;
  const collection = {
    length: 100_000,
    *[Symbol.iterator]() {
      yield row;
    },
    push() {
      pushes++;
      throw new Error('unexpected optimizer split');
    },
  };
  prototype.firstPhasePreProcess.call({ options: {}, preserveMultipleSlashes: false }, collection);
  assert.equal(pushes, 0);
  assert.deepEqual(row, ['**', '..', 'a', 'b']);
  let comparisons = 0;
  const set = { length: 1001, 0: ['x'], 1: ['y'] };
  assert.equal(
    prototype.secondPhasePreProcess.call(
      {
        partsMatch() {
          comparisons++;
          throw new Error('unexpected dedup comparison');
        },
      },
      set,
    ),
    set,
  );
  assert.equal(comparisons, 0);
  if (configurable) {
    const small = [['**', '..', 'a', 'b', '**', '..', 'c', 'd']];
    prototype.firstPhasePreProcess.call(
      { options: { braceExpandMax: 2 }, preserveMultipleSlashes: false },
      small,
    );
    assert.equal(small.length, 2);
  }
}

for (const copy of minimatchCopies) {
  for (const mode of ['require', 'import']) {
    test(`minimatch ${copy.manifest.version} ${mode}: retained exports, matcher semantics and bounded optimizer branches`, async () => {
      const api = await load(copy, mode);
      const match = typeof api === 'function' ? api : api.minimatch;
      assert.equal(typeof match, 'function');
      assert.equal(typeof api.Minimatch, 'function');
      assert.equal(typeof api.GLOBSTAR, 'symbol');
      const options = { optimizationLevel: 2 };
      const cases = [
        ['a/x.js', 'a/*.{js,ts}', {}, true],
        ['a/x.txt', 'a/*.{js,ts}', {}, false],
        ['a/x.js', 'a/+(x|y).js', {}, true],
        ['a/x.js', '!a/*.ts', {}, true],
        ['.hidden/x.js', '**/*.js', {}, false],
        ['.hidden/x.js', '**/*.js', { dot: true }, true],
        ['A/X.JS', 'a/*.js', { nocase: true }, true],
        ['a', 'a/b/c', { partial: true }, true],
        ['a/x.js', 'a\\*.js', { windowsPathsNoEscape: true, platform: 'win32' }, true],
      ];
      for (const [value, pattern, extra, expected] of cases)
        assert.equal(match(value, pattern, { ...options, ...extra }), expected, pattern);
      const mm = new api.Minimatch('**/*.js', options);
      assert(mm.set.some((parts) => parts.includes(api.GLOBSTAR)));
      assert(mm.set.some((parts) => parts.some((part) => part instanceof RegExp)));
      assert.equal(typeof mm.makeRe, 'function');
      assert(mm.makeRe() instanceof RegExp);
      assert.equal(mm.match('a/x.js'), true);
      const split = new api.Minimatch('**/../a/b/**/../c/d', options);
      assert.equal(split.set.length, 4);
      assert.equal(split.match('../a/b/../c/d'), true);
      assert.equal(split.match('x/a/b/y/c/d'), true);
      const dedup = new api.Minimatch('{x,*}/{0..3}', options);
      assert.equal(dedup.set.length, 4);
      assert.equal(dedup.match('y/3'), true);
      optimizerBranches(api.Minimatch.prototype, copy.manifest.version.startsWith('10.'));
      if (copy.manifest.version.startsWith('10.')) {
        assert.equal(
          new api.Minimatch('**/../a/b/**/../c/d', { ...options, braceExpandMax: 2 }).set.length,
          2,
        );
      }
    });
  }
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-glob-1390-'));
  for (const file of ['a/x.js', 'a/y.ts', 'b/z.js', 'b/deep/q.js', '.hidden/h.js', 'root.txt']) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'owned Platform1390 finite fixture\n');
  }
  t.after(() => {
    fs.rmSync(directory, { recursive: true });
    assert.equal(fs.existsSync(directory), false);
  });
  return directory;
}

for (const aliasKind of ['root', 'ancestor']) {
  test(`generator rejects owned ${aliasKind} aliases into dependency trees before writes`, async (t) => {
    const cwd = fixture(t);
    const { backport, mutations } = await import('./globMinimatchBackport.mjs');
    for (const [index, component] of ['node_modules', 'NoDe_MoDuLeS'].entries()) {
      // Copy an archive-plus-patch payload into a fake dependency tree. The
      // generator only receives these disposable aliases, never an installed
      // package or the configured content store.
      const dependencyTree = path.join(cwd, `case-${index}`, component);
      const target = path.join(dependencyTree, 'minimatch');
      fs.cpSync(minimatchCopies[0].directory, target, { recursive: true });
      const snapshot = () => {
        const rows = [];
        const visit = (folder) => {
          for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) visit(file);
            else
              rows.push({
                path: path.relative(target, file),
                mode: fs.statSync(file).mode & 0o7777,
                sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
              });
          }
        };
        visit(target);
        return rows;
      };
      const before = snapshot();
      const priorMutations = mutations.length;
      const alias = path.join(cwd, `alias-${index}`);
      fs.symlinkSync(
        aliasKind === 'root' ? target : dependencyTree,
        alias,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const input = aliasKind === 'root' ? alias : path.join(alias, 'minimatch');
      assert.throws(() => backport(input), /must not resolve inside node_modules/);
      assert.deepEqual(snapshot(), before);
      assert.equal(mutations.length, priorMutations);
    }
  });
}

test('glob10 unchanged published CLI retains executable mode and starts natively', (t) => {
  const cwd = fixture(t);
  const copy = globCopies[1];
  assert.equal(copy.manifest.bin, './dist/esm/bin.mjs');
  const bin = path.resolve(copy.directory, copy.manifest.bin);
  if (process.platform !== 'win32') assert.equal(fs.statSync(bin).mode & 0o7777, 0o755);
  const result = spawnSync(
    process.platform === 'win32' ? process.execPath : bin,
    process.platform === 'win32' ? [bin, '--help'] : ['--help'],
    { cwd, encoding: 'utf8', timeout: 3000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /glob/);
});
function countedFS(controller) {
  const counters = { reads: 0, afterAbort: 0, settled: 0 };
  return {
    counters,
    fs: {
      ...fs,
      readdir(...args) {
        if (controller.signal.aborted) counters.afterAbort++;
        counters.reads++;
        controller.abort(new Error('owned abort'));
        const cb = args.pop();
        fs.readdir(...args, (...values) => {
          counters.settled++;
          cb(...values);
        });
      },
      readdirSync(...args) {
        if (controller.signal.aborted) counters.afterAbort++;
        counters.reads++;
        controller.abort(new Error('owned abort'));
        const result = fs.readdirSync(...args);
        counters.settled++;
        return result;
      },
    },
  };
}
async function collect(stream) {
  const values = [];
  for await (const value of stream) values.push(value);
  return values.sort();
}
for (const copy of globCopies) {
  for (const mode of ['require', 'import']) {
    for (const raw of copy.manifest.version.startsWith('13.') ? [false, true] : [false]) {
      test(
        `glob ${copy.manifest.version} ${mode} ${raw ? 'raw' : 'default'}: ordinary and finite abort/stream consumers`,
        { timeout: 4000 },
        async (t) => {
          const cwd = fixture(t);
          const api = await load(copy, mode, raw);
          const options = { cwd, ignore: ['b/deep/**'], dot: false };
          const expected = ['a/x.js', 'b/z.js'];
          assert.deepEqual(api.globSync('**/*.js', options).sort(), expected);
          assert.deepEqual((await api.glob('**/*.js', options)).sort(), expected);
          assert.deepEqual(await collect(api.globStream('**/*.js', options)), expected);
          assert.deepEqual(await collect(api.globStreamSync('**/*.js', options)), expected);
          const paused = api.globStream('**/*', { cwd });
          paused.pause();
          await new Promise((resolve) => {
            setImmediate(resolve);
          });
          assert.deepEqual(await collect(paused), api.globSync('**/*', { cwd }).sort());
          const pausedController = new AbortController();
          const pausedAbort = api.globStream('**/*', { cwd, signal: pausedController.signal });
          let pausedErrors = 0;
          pausedAbort.on('error', () => {
            pausedErrors++;
          });
          pausedAbort.pause();
          await new Promise((resolve) => {
            setImmediate(resolve);
          });
          pausedController.abort(new Error('owned paused abort'));
          await assert.rejects(collect(pausedAbort), /owned paused abort/);
          assert.equal(pausedErrors, 1);
          assert.equal(pausedAbort.destroyed, true);
          const already = AbortSignal.abort(new Error('owned already-aborted'));
          await assert.rejects(api.glob('**', { cwd, signal: already }), /owned already-aborted/);
          await assert.rejects(
            collect(api.globStream('**', { cwd, signal: already })),
            /owned already-aborted/,
          );
          // Minipass retains an error emitted during synchronous construction, but
          // its iterator on an already-destroyed stream completes with no values.
          const alreadySync = api.globStreamSync('**', { cwd, signal: already });
          let alreadyErrors = 0;
          alreadySync.on('error', (error) => {
            alreadyErrors++;
            assert.equal(error, already.reason);
          });
          assert.deepEqual(await collect(alreadySync), []);
          assert.equal(alreadyErrors, 1);
          assert.equal(alreadySync.destroyed, true);
          const ac = new AbortController();
          const measured = countedFS(ac);
          await assert.rejects(
            api.glob('**', { cwd, signal: ac.signal, fs: measured.fs }),
            /owned abort/,
          );
          // Settle the one owned in-flight read before judging newly scheduled work.
          while (measured.counters.settled < measured.counters.reads)
            await new Promise((resolve) => {
              setImmediate(resolve);
            });
          await new Promise((resolve) => {
            setImmediate(resolve);
          });
          assert.equal(measured.counters.reads, 1);
          assert.equal(measured.counters.afterAbort, 0);
          for (const sync of [false, true]) {
            const controller = new AbortController();
            const calls = countedFS(controller);
            const stream = (sync ? api.globStreamSync : api.globStream)('**', {
              cwd,
              signal: controller.signal,
              fs: calls.fs,
            });
            let errors = 0;
            stream.on('error', () => errors++);
            if (sync) assert.deepEqual(await collect(stream), []);
            else await assert.rejects(collect(stream), /owned abort/);
            while (calls.counters.settled < calls.counters.reads)
              await new Promise((resolve) => {
                setImmediate(resolve);
              });
            assert.equal(errors, 1);
            assert.equal(stream.destroyed, true);
            assert.equal(calls.counters.reads, 1);
            assert.equal(calls.counters.afterAbort, 0);
          }
        },
      );
    }
  }
}

for (const copy of globCopies) {
  test(`glob ${copy.manifest.version}: walker four early returns and resume completion exactly once`, () => {
    const format = copy.manifest.version.startsWith('9.') ? 'cjs' : 'commonjs';
    const { GlobUtil } = require(path.join(copy.directory, 'dist', format, 'walker.js'));
    for (const method of ['walkCB', 'walkCB2', 'walkCBSync', 'walkCB2Sync']) {
      const util = new GlobUtil(
        [],
        {},
        { signal: AbortSignal.abort(), platform: process.platform },
      );
      let completions = 0;
      util.walkCB2 =
        method === 'walkCB2'
          ? util.walkCB2
          : () => {
              throw new Error('continued async walk');
            };
      util.walkCB2Sync =
        method === 'walkCB2Sync'
          ? util.walkCB2Sync
          : () => {
              throw new Error('continued sync walk');
            };
      const cb = () => completions++;
      if (method.endsWith('2') || method.endsWith('2Sync'))
        util[method](
          {},
          [],
          {
            processPatterns() {
              throw new Error('continued processor');
            },
          },
          cb,
        );
      else util[method]({}, [], cb);
      assert.equal(completions, 1);
    }
    const util = new GlobUtil([], {}, { signal: AbortSignal.abort(), platform: process.platform });
    let resumed = 0;
    util.onResume(() => resumed++);
    assert.equal(resumed, 1);
  });
}

for (const mode of ['require', 'import']) {
  test(`glob13 ${mode}: actual embedded optimizer method branch controls`, () => {
    const text = fs.readFileSync(endpoint(globCopies[2], mode), 'utf8');
    const first = text.slice(
      text.indexOf('firstPhasePreProcess(t){'),
      text.indexOf('secondPhasePreProcess(t){'),
    );
    const second = text.slice(
      text.indexOf('secondPhasePreProcess(t){'),
      text.indexOf('partsMatch(t,e,s='),
    );
    assert(
      first.startsWith('firstPhasePreProcess(t){') &&
        second.startsWith('secondPhasePreProcess(t){'),
    );
    const methods = vm.runInNewContext(`({${first},${second}})`, {}, { timeout: 1000 });
    optimizerBranches(methods, true);
  });
}

test('test-exclude7 actual async/sync glob and named matcher consumers', async (t) => {
  const cwd = fixture(t);
  const copy = onePackage('test-exclude', 7);
  assert.equal(packageFromParent(copy, 'glob').directory, globCopies[1].directory);
  assert.equal(packageFromParent(copy, 'minimatch').directory, minimatchCopies[2].directory);
  const TestExclude = copy.require('test-exclude');
  const exclude = new TestExclude({
    cwd,
    extension: ['.js'],
    include: ['a/**', 'b/**'],
    exclude: ['b/deep/**'],
    excludeNodeModules: false,
  });
  assert.deepEqual(exclude.globSync().sort(), ['a/x.js', 'b/z.js']);
  assert.deepEqual((await exclude.glob()).sort(), ['a/x.js', 'b/z.js']);
  assert.equal(exclude.shouldInstrument(path.join(cwd, 'a/x.js')), true);
  assert.equal(exclude.shouldInstrument(path.join(cwd, 'b/deep/q.js')), false);
});

test('rimraf4/5 actual opt-in glob selection and signal forwarding with deletion veto', async (t) => {
  const cwd = fixture(t);
  for (const major of [4, 5]) {
    const copy = onePackage('rimraf', major);
    const api = copy.require('rimraf');
    const selected = [];
    const filter = (file) => {
      selected.push(file);
      return false;
    };
    assert.equal(await api.rimraf(path.join(cwd, 'a', '*.js'), { glob: true, filter }), false);
    assert.deepEqual(selected, [path.join(cwd, 'a/x.js')]);
    selected.length = 0;
    assert.equal(api.rimrafSync(path.join(cwd, 'b', '*.js'), { glob: true, filter }), false);
    assert.deepEqual(selected, [path.join(cwd, 'b/z.js')]);
    assert(fs.existsSync(path.join(cwd, 'a/x.js')));
    assert(fs.existsSync(path.join(cwd, 'b/z.js')));
    const signal = AbortSignal.abort(new Error('owned rimraf abort'));
    await assert.rejects(
      api.rimraf(path.join(cwd, '**'), { signal, glob: { signal }, filter }),
      /owned rimraf abort/,
    );
  }
});

test('app-builder actual FileMatcher consumer retains matcher representation and selection', (t) => {
  const cwd = fixture(t);
  const copy = onePackage('app-builder-lib', 26);
  assert.equal(packageFromParent(copy, 'minimatch').directory, minimatchCopies[2].directory);
  const { FileMatcher } = copy.require(path.join(copy.directory, 'out/fileMatcher.js'));
  const matcher = new FileMatcher(cwd, path.join(cwd, 'output'), (value) => value, [
    'a/*.{js,ts}',
    '!a/*.ts',
  ]);
  const parsed = [];
  matcher.computeParsedPatterns(parsed);
  assert.equal(parsed.length, 2);
  assert(parsed[0].set.some((parts) => parts.some((part) => part instanceof RegExp)));
  const filter = matcher.createFilter();
  assert.equal(filter(path.join(cwd, 'a/x.js'), fs.statSync(path.join(cwd, 'a/x.js'))), true);
  assert.equal(filter(path.join(cwd, 'a/y.ts'), fs.statSync(path.join(cwd, 'a/y.ts'))), false);
});

test('Jest actual configuration project glob expansion and coverage threshold glob consumer', async (t) => {
  const cwd = fixture(t);
  const config = onePackage('jest-config', 30);
  const reporters = onePackage('@jest/reporters', 30);
  assert.equal(packageFromParent(config, 'glob').directory, globCopies[2].directory);
  assert.equal(packageFromParent(reporters, 'glob').directory, globCopies[2].directory);
  const normalized = await config.require('jest-config').normalize(
    {
      rootDir: cwd,
      projects: [path.join(cwd, '{a,b}')],
      testEnvironment: config.require.resolve('jest-environment-node'),
    },
    {},
  );
  assert.deepEqual(normalized.options.projects.sort(), [path.join(cwd, 'a'), path.join(cwd, 'b')]);
  const { CoverageReporter } = reporters.require('@jest/reporters');
  const coverage = reporters.require('istanbul-lib-coverage');
  const file = path.join(cwd, 'a/x.js');
  const map = coverage.createCoverageMap({
    [file]: {
      path: file,
      statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
      s: { 0: 1 },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {},
    },
  });
  let failure;
  CoverageReporter.prototype._checkThreshold.call(
    {
      _globalConfig: { coverageThreshold: { [path.join(cwd, 'a/*.js')]: { statements: 100 } } },
      log(message) {
        throw new Error(message);
      },
      _setError(error) {
        failure = error;
      },
    },
    map,
  );
  assert.equal(failure, undefined);
});

test(
  'Jest actual runtime missing-extension diagnostic enters its installed glob consumer',
  { timeout: 10_000 },
  (t) => {
    const cwd = fixture(t);
    const runtime = onePackage('jest-runtime', 30);
    assert.equal(packageFromParent(runtime, 'glob').directory, globCopies[2].directory);
    fs.writeFileSync(path.join(cwd, 'sibling.jsx'), 'module.exports = 1;\n');
    fs.writeFileSync(
      path.join(cwd, 'native.test.js'),
      "test('owned deliberate missing extension control', () => require('./sibling'));\n",
    );
    const cli = onePackage('jest', 30);
    const result = spawnSync(
      process.execPath,
      [
        path.join(cli.directory, 'bin/jest.js'),
        '--runInBand',
        '--no-cache',
        '--config',
        JSON.stringify({
          rootDir: cwd,
          cacheDirectory: path.join(cwd, '.jest-cache'),
          moduleFileExtensions: ['js'],
          testMatch: ['**/native.test.js'],
          testEnvironment: 'node',
        }),
      ],
      { cwd, encoding: 'utf8', timeout: 8000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr + result.stdout, /Jest was able to find/);
    assert.match(result.stderr + result.stdout, /sibling\.jsx/);
  },
);
