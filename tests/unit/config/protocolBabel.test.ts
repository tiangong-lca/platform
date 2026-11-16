import type { IApi } from '@umijs/max';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test as nativeTest } from 'node:test';

type BuildMode = 'development' | 'production';
type PresetOptions = Record<string, unknown>;

const root = realpathSync(path.resolve(__dirname, '../../..'));

function registerInstalledCompilerTests() {
  const rootRequire = createRequire(path.join(root, 'package.json'));
  const maxRequire = createRequire(rootRequire.resolve('@umijs/max/package.json'));
  const umiRequire = createRequire(maxRequire.resolve('umi/package.json'));
  const presetRequire = createRequire(umiRequire.resolve('@umijs/preset-umi/package.json'));
  const bundlerRequire = createRequire(umiRequire.resolve('@umijs/bundler-webpack/package.json'));
  const { webpack } = bundlerRequire('./compiled/webpack');
  const { MFSU_NAME } = bundlerRequire('./dist/constants');
  const { getConfig } = bundlerRequire('./dist/config/config');
  const { getBrowsersList } = bundlerRequire('./dist/utils/browsersList');
  const { getBabelOpts } = presetRequire('./dist/commands/dev/getBabelOpts');
  const { loadOptions, transformSync } = bundlerRequire('@umijs/bundler-utils/compiled/babel/core');
  const { default: appConfig } = rootRequire('./config/config.ts');
  const { browserSupport } = rootRequire('./config/browserSupport.ts');

  const policyPlugin = './config/plugins/babelTargets';
  const targets = { chrome: 152, edge: 156, firefox: 115, safari: '26.6', ios: '26.6' };
  const broadTransform = 'transform-function-name';
  const edgeTransform = 'transform-edge-function-name';
  const protocolFiles = [
    ...['v2', 'v3', 'v4', 'v5', 'v6'].map(
      (version) => `vendor/study-contract/${version}/index.mjs`,
    ),
    'src/standalone/studyReport/methodProtocol.mjs',
  ].map((file) => path.join(root, file));
  const studyPreview = path.join(root, 'src/pages/Study/preview.ts');
  const renderer = path.join(root, 'vendor/study-renderer/v2/content.js');
  const extraSource = path.join(path.dirname(root), 'extra', 'platform-browser-policy-fixture.mjs');
  const sourceFiles = [renderer, studyPreview, extraSource];
  const extraBabelIncludes = [/platform-browser-policy-fixture/u];

  function installedHook(configTargets: unknown = appConfig.targets) {
    assert.ok(appConfig.plugins.includes(policyPlugin));
    const { default: register } = rootRequire(policyPlugin + '.ts');
    let hook: ((options: PresetOptions) => PresetOptions) | undefined;
    register({
      config: { targets: configTargets },
      modifyBabelPresetOpts(callback: typeof hook) {
        assert.equal(hook, undefined);
        hook = callback;
      },
    } as unknown as IApi);
    assert.ok(hook);
    return hook;
  }

  async function webpackConfig(env: BuildMode, forwardTargets = true) {
    const hook = installedHook();
    const babel = await getBabelOpts({
      api: {
        appData: { react: { version: rootRequire('react/package.json').version } },
        config: appConfig,
        applyPlugins({ key, initialValue }: { key: string; initialValue: PresetOptions }) {
          return key === 'modifyBabelPresetOpts' && forwardTargets
            ? hook(initialValue)
            : initialValue;
        },
      },
    });
    return getConfig({
      ...babel,
      env,
      cwd: root,
      entry: {},
      userConfig: { ...appConfig },
      extraBabelIncludes,
      disableCopy: true,
    });
  }

  async function withBabelLoader<T>(
    config: Awaited<ReturnType<typeof webpackConfig>>,
    inspect: (select: (file: string) => PresetOptions) => T,
  ): Promise<T> {
    const compiler = webpack(config);
    try {
      const { ruleSet } = compiler.createNormalModuleFactory();
      return inspect((resource) => {
        const uses = ruleSet.exec({ resource, realResource: resource, resourceQuery: '' });
        const babel = uses.filter(
          ({ type, value }: { type: string; value?: { loader?: string } }) =>
            type === 'use' && value?.loader === bundlerRequire.resolve('./compiled/babel-loader'),
        );
        assert.equal(babel.length, 1, resource);
        return babel[0].value.options;
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        compiler.close((error: Error | null) => (error ? reject(error) : resolve()));
      });
    }
  }

  function babelOptions(rawOptions: PresetOptions) {
    const options = { ...rawOptions };
    assert.equal(options.cacheDirectory, false);
    delete options.cacheDirectory;
    delete options.customize;
    return options;
  }

  nativeTest(
    'keeps one explicit browser policy and preserves existing Babel preset options',
    () => {
      assert.deepEqual(appConfig.targets, targets);
      assert.equal(browserSupport.browsers.chrome.webCompilerFloor, 156);
      assert.equal(browserSupport.reviewCadence, 'quarterly');
      const hook = installedHook();
      const presetEnv = Object.freeze({
        bugfixes: true,
        useBuiltIns: 'entry',
        exclude: ['fixture'],
      });
      const presetReact = Object.freeze({ runtime: 'automatic' });
      const options = Object.freeze({ presetEnv, presetReact, pluginTransformRuntime: false });

      assert.deepEqual(hook(options), { ...options, presetEnv: { ...presetEnv, targets } });
      assert.equal(hook(options).presetReact, presetReact);
      assert.equal(options.presetEnv, presetEnv);
      assert.deepEqual(hook({ presetEnv: { targets: { ...targets } } }), {
        presetEnv: { targets },
      });
      for (const presetEnv of [undefined, false, []]) {
        assert.throws(() => hook({ presetEnv }), /requires Umi Babel presetEnv options/u);
      }
      for (const presetEnv of [{ targets: { chrome: 80 } }, { forceAllTransforms: true }]) {
        assert.throws(() => hook({ presetEnv }), /presetEnv conflicts/u);
      }
      assert.throws(() => installedHook({ chrome: 80 })(options), /Umi targets must match/u);
    },
  );

  nativeTest(
    'the installed Babel preset forwards effective targets through every source rule',
    async (t) => {
      const originalNodeEnv = process.env.NODE_ENV;
      t.after(() => {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
      });
      for (const mode of ['development', 'production'] as const) {
        process.env.NODE_ENV = mode;
        const config = await webpackConfig(mode);
        const unforwarded = await webpackConfig(mode, false);
        const originalOptions = await withBabelLoader(unforwarded, (select) =>
          sourceFiles.map((file) => babelOptions(select(file))),
        );
        await withBabelLoader(config, (select) => {
          for (const [index, filename] of sourceFiles.entries()) {
            const effective = { ...babelOptions(select(filename)), filename, envName: mode };
            const actual = loadOptions(effective);
            const baseline = loadOptions({ ...originalOptions[index], filename, envName: mode });
            const keys = actual.plugins.map(({ key }: { key: string }) => key);
            assert.deepEqual(actual.targets, {
              chrome: '152.0.0',
              edge: '156.0.0',
              firefox: '115.0.0',
              ios: '26.6.0',
              safari: '26.6.0',
            });
            // Babel exposes the same outer targets even when the nested preset disregards them.
            assert.deepEqual(actual.targets, baseline.targets);
            assert.ok(baseline.plugins.some(({ key }: { key: string }) => key === broadTransform));
            assert.ok(!keys.includes(broadTransform), filename);
            assert.ok(!keys.includes(edgeTransform), filename);
            const { code } = transformSync(
              'export function Component() { return value?.nested; }',
              effective,
            );
            assert.match(code, /value\?\.nested/u, filename);
            assert.equal(/\$RefreshReg\$/u.test(code), mode === 'development', filename);
          }
        });
        assert.deepEqual(config.resolve.extensionAlias, { '.js': ['.js', '.ts'] });
      }
    },
  );

  nativeTest(
    'MFSU forwards the policy through its independent fallback Babel presets',
    async () => {
      assert.equal(typeof appConfig.mfsu.chainWebpack, 'function');
      const depConfig = {
        env: 'development',
        cwd: root,
        entry: {},
        name: MFSU_NAME,
        disableCopy: true,
        userConfig: { ...appConfig, forkTSChecker: false },
        extraBabelIncludes,
      };
      // The MFSU dependency builder calls getConfig without the app's babelPreset.
      const original = await getConfig(depConfig);
      const candidate = await getConfig({
        ...depConfig,
        chainWebpack: appConfig.mfsu.chainWebpack,
      });
      const originalOptions = await withBabelLoader(original, (select) => sourceFiles.map(select));
      await withBabelLoader(candidate, (select) => {
        for (const [index, filename] of sourceFiles.entries()) {
          const before = originalOptions[index];
          const after = select(filename);
          const [[request, options, ...identity], ...presets] = before.presets as [
            string,
            { presetEnv: object },
            ...unknown[],
          ][];
          assert.deepEqual(after, {
            ...before,
            presets: [
              [request, { ...options, presetEnv: { ...options.presetEnv, targets } }, ...identity],
              ...presets,
            ],
          });
          const envName = 'development';
          const baseline = loadOptions({ ...babelOptions(before), filename, envName });
          const compilerOptions = { ...babelOptions(after), filename, envName };
          const effective = loadOptions(compilerOptions);
          assert.deepEqual(effective.targets, baseline.targets, filename);
          assert.ok(baseline.plugins.some(({ key }: { key: string }) => key === broadTransform));
          assert.ok(!effective.plugins.some(({ key }: { key: string }) => key === broadTransform));
          const { code } = transformSync(
            'export function Component() { return value?.nested; }',
            compilerOptions,
          );
          assert.match(code, /value\?\.nested/u, filename);
          assert.doesNotMatch(code, /\$RefreshReg\$/u, filename);
        }
      });
    },
  );

  nativeTest(
    'retiring the override preserves the six protocol outputs and unrelated source outputs',
    async () => {
      const config = await webpackConfig('production');
      await withBabelLoader(config, (select) => {
        for (const filename of [...protocolFiles, studyPreview, renderer]) {
          const input = readFileSync(filename, 'utf8');
          const loaderOptions = babelOptions(select(filename));
          const options = { ...loaderOptions, filename, sourceMaps: true };
          assert.equal('overrides' in loaderOptions, false, filename);
          const [[request, presetOptions]] = loaderOptions.presets as [
            string,
            { presetEnv: object },
          ][];
          const legacyOptions = {
            ...options,
            overrides: [
              {
                test: (file: string) => protocolFiles.includes(file),
                presets: [
                  [
                    request,
                    {
                      ...presetOptions,
                      presetEnv: { ...presetOptions.presetEnv, exclude: [broadTransform] },
                    },
                  ],
                ],
              },
            ],
          };
          const candidate = transformSync(input, options);
          const legacy = transformSync(input, legacyOptions);
          assert.equal(candidate.code, legacy.code, filename);
          assert.deepEqual(candidate.map, legacy.map, filename);
        }
      });
    },
  );

  nativeTest('uses the same floors for Umi polyfills, PostCSS and both minifiers', async () => {
    const { default: polyfill } = presetRequire('./dist/features/polyfill/polyfill');
    let generatePolyfill: (() => void) | undefined;
    let polyfillSource: string | undefined;
    polyfill({
      config: appConfig,
      describe() {},
      onGenerateFiles(generate: () => void) {
        generatePolyfill = generate;
      },
      addPolyfillImports() {},
      modifyConfig() {},
      writeTmpFile({ content }: { content: string }) {
        polyfillSource = content;
      },
    });
    assert.ok(generatePolyfill);
    generatePolyfill();
    assert.ok(polyfillSource);
    assert.match(polyfillSource, /es\.promise\.with-resolvers\.js/u);
    assert.match(polyfillSource, /es\.object\.group-by\.js/u);
    assert.doesNotMatch(polyfillSource, /es\.array\.find-last\.js/u);

    const postcss = bundlerRequire('postcss');
    const postcssRequire = createRequire(bundlerRequire.resolve('postcss-preset-env'));
    const browserslistPath = postcssRequire.resolve('browserslist');
    const browserslist = postcssRequire(browserslistPath);
    const { fullVersions } = createRequire(browserslistPath)('electron-to-chromium');
    const electronVersion = rootRequire('electron/package.json').version;
    assert.equal(electronVersion, browserSupport.electron.version);
    assert.equal(fullVersions[electronVersion], browserSupport.electron.chromium);
    const browsers = getBrowsersList({ targets: appConfig.targets });
    assert.deepEqual(browsers, [
      'chrome >= 152',
      'edge >= 156',
      'firefox >= 115',
      'safari >= 26.6',
      'ios >= 26.6',
    ]);
    const resolved = browserslist(browsers);
    for (const browser of [
      'chrome 152',
      'chrome 156',
      'edge 156',
      'firefox 115',
      'safari 26.6',
      'ios_saf 26.6',
    ]) {
      assert.ok(resolved.includes(browser), browser);
    }

    const minifierTargets = [
      'chrome152',
      'edge156',
      'firefox115',
      'safari26.6',
      'ios26.6',
      'es2015',
    ];
    for (const mode of ['development', 'production'] as const) {
      const config = await webpackConfig(mode);
      const cssRule = config.module.rules.find(
        ({ test, oneOf }: { test?: RegExp; oneOf?: unknown[] }) =>
          test?.test('fixture.css') && oneOf,
      );
      assert.ok(cssRule);
      const loader = cssRule.oneOf[0].use.find(
        ({ loader }: { loader: string }) =>
          loader === bundlerRequire.resolve('./compiled/postcss-loader'),
      );
      assert.ok(loader);
      const css = await postcss(loader.options.postcssOptions.plugins).process(
        'button { user-select: none; text-size-adjust: 100%; }',
        { from: undefined },
      );
      assert.match(css.css, /-webkit-user-select: none/u);
      assert.match(css.css, /-webkit-text-size-adjust: 100%/u);

      assert.equal(config.optimization.minimize, mode === 'production');
      if (mode === 'production') {
        const [jsMinifier, cssMinifier] = config.optimization.minimizer;
        const js = jsMinifier.options.minimizer;
        const styles = cssMinifier.options.minimizer;
        assert.deepEqual(js.options.target, minifierTargets);
        assert.deepEqual(styles.options.target, minifierTargets);
        const minifiedJs = await js.implementation(
          { 'fixture.js': 'export const access = (value) => value?.nested;' },
          undefined,
          js.options,
        );
        const minifiedCss = await styles.implementation(
          { 'fixture.css': css.css },
          undefined,
          styles.options,
        );
        assert.match(minifiedJs.code, /export/u);
        assert.match(minifiedCss.code, /-webkit-user-select:none/u);
      }
    }
  });
}

if (typeof jest === 'undefined') {
  registerInstalledCompilerTests();
} else {
  it('checks browser compatibility using the installed Umi toolchain', () => {
    // Umi imports esbuild, which requires TextEncoder and Uint8Array from a single realm.
    execFileSync(process.execPath, ['--import', 'tsx', __filename], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', COMPRESS: '' },
      timeout: 30_000,
    });
  }, 35_000);
}
