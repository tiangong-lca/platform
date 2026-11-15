import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test as nativeTest } from 'node:test';

type ChainWebpack = NonNullable<typeof import('../../../config/config').default.chainWebpack>;
type WebpackChain = Parameters<ChainWebpack>[0];
type WebpackArgs = Parameters<ChainWebpack>[1];

const root = realpathSync(path.resolve(__dirname, '../../..'));

function registerInstalledBabelTests() {
  const rootRequire = createRequire(path.join(root, 'package.json'));
  const maxRequire = createRequire(rootRequire.resolve('@umijs/max/package.json'));
  const umiRequire = createRequire(maxRequire.resolve('umi/package.json'));
  const presetRequire = createRequire(umiRequire.resolve('@umijs/preset-umi/package.json'));
  const bundlerRequire = createRequire(umiRequire.resolve('@umijs/bundler-webpack/package.json'));
  const WebpackChain = bundlerRequire('./compiled/webpack-5-chain');
  const { webpack } = bundlerRequire('./compiled/webpack');
  const { addJavaScriptRules } = bundlerRequire('./dist/config/javaScriptRules');
  const { DEFAULT_BROWSER_TARGETS } = bundlerRequire('./dist/constants');
  const { getBabelOpts } = presetRequire('./dist/commands/dev/getBabelOpts');
  const { loadOptions } = bundlerRequire('@umijs/bundler-utils/compiled/babel/core');
  const { default: appConfig } = rootRequire('./config/config.ts');
  const configureWebpack = appConfig.chainWebpack as ChainWebpack;

  const broadTransform = 'transform-function-name';
  const edgeTransform = 'transform-edge-function-name';
  const exactFiles = [
    ...['v2', 'v3', 'v4', 'v5', 'v6'].map(
      (version) => `vendor/study-contract/${version}/index.mjs`,
    ),
    'src/standalone/studyReport/methodProtocol.mjs',
  ];
  const controlFiles = [
    'src/pages/Study/preview.ts',
    'vendor/study-renderer/v2/content.js',
    'src/standalone/studyReport/otherProtocol.mjs',
    'vendor/study-contract/v7/index.mjs',
    `${exactFiles[0]}/child.mjs`,
    `other-checkout/${exactFiles[0]}`,
  ];

  async function umiRules(env: WebpackArgs['env']): Promise<WebpackChain> {
    const config = new WebpackChain();
    const babel = await getBabelOpts({
      api: {
        appData: { react: { version: rootRequire('react/package.json').version } },
        config: {},
        applyPlugins: ({ initialValue }: { initialValue: unknown }) => initialValue,
      },
    });
    await addJavaScriptRules({
      ...babel,
      config,
      userConfig: { targets: DEFAULT_BROWSER_TARGETS },
      cwd: root,
      env,
      extraBabelIncludes: [],
    });
    return config;
  }

  function ruleBabelLoader(chain: WebpackChain, rule: string) {
    return chain.module.rules.get(rule).uses.get('babel-loader');
  }

  function selectedBabelOptions(options: Record<string, unknown>, file: string) {
    // Match the loader's handoff to the pinned compiled Babel core.
    const babelOptions = { ...options };
    delete babelOptions.cacheDirectory;
    delete babelOptions.customize;
    const { plugins, targets, comments } = loadOptions({
      ...babelOptions,
      filename: path.join(root, file),
      envName: 'production',
    });
    return {
      plugins: plugins.map(({ key }: { key: string }) => key) as string[],
      targets,
      comments,
    };
  }

  nativeTest(
    'changes only the six exact production resources when started outside the app root',
    async () => {
      const config = await umiRules('production');
      const source = ruleBabelLoader(config, 'src');
      const baseline = source.get('options');
      const otherLoaders = ['extra-src', 'jsx-ts-tsx'].map((rule) => ruleBabelLoader(config, rule));
      const otherOptions = otherLoaders.map((loader) => loader.get('options'));

      const callerDirectory = process.cwd();
      try {
        // Umi can choose the application independently of the caller's working directory.
        process.chdir(path.dirname(root));
        configureWebpack(config, { env: 'production' } as WebpackArgs);
      } finally {
        process.chdir(callerDirectory);
      }

      const candidate = source.get('options');
      const { overrides, ...unchanged } = candidate;
      assert.deepEqual(unchanged, baseline);
      assert.equal(candidate.cacheDirectory, false);
      assert.equal(overrides.length, 1);
      assert.deepEqual(config.resolve.get('extensionAlias'), { '.js': ['.js', '.ts'] });
      otherLoaders.forEach((loader, index) =>
        assert.equal(loader.get('options'), otherOptions[index]),
      );

      for (const file of exactFiles) {
        const oldOptions = selectedBabelOptions(baseline, file);
        const newOptions = selectedBabelOptions(candidate, file);
        assert.deepEqual(
          oldOptions.plugins.filter((key) => key === broadTransform || key === edgeTransform),
          [broadTransform],
          file,
        );
        assert.deepEqual(
          newOptions.plugins.filter((key) => key === broadTransform || key === edgeTransform),
          [edgeTransform],
          file,
        );
        assert.deepEqual(
          newOptions.plugins.filter((key) => key !== edgeTransform),
          oldOptions.plugins.filter((key) => key !== broadTransform),
          file,
        );
        assert.deepEqual(newOptions.targets, oldOptions.targets, file);
      }

      for (const file of controlFiles) {
        assert.deepEqual(
          selectedBabelOptions(candidate, file),
          selectedBabelOptions(baseline, file),
          file,
        );
      }
    },
  );

  nativeTest(
    'Webpack selects one Babel loader and scopes the override to the six resources',
    async () => {
      const config = await umiRules('production');
      const babelLoader = ruleBabelLoader(config, 'src').get('loader');
      configureWebpack(config, { env: 'production' } as WebpackArgs);

      const compiler = webpack({ ...config.toConfig(), mode: 'production', context: root });
      try {
        const { ruleSet } = compiler.createNormalModuleFactory();
        for (const file of [...exactFiles, ...controlFiles]) {
          const resource = path.join(root, file);
          const uses = ruleSet.exec({ resource, realResource: resource, resourceQuery: '' });
          const selected = uses.filter(
            ({ type, value }: { type: string; value?: { loader?: string } }) =>
              type === 'use' && value?.loader === babelLoader,
          );
          assert.equal(selected.length, 1, file);
          const options = selected[0].value.options;
          assert.equal(options.cacheDirectory, false, file);
          const { plugins } = selectedBabelOptions(options, file);
          assert.deepEqual(
            plugins.filter((key) => key === broadTransform || key === edgeTransform),
            [exactFiles.includes(file) ? edgeTransform : broadTransform],
            file,
          );
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          compiler.close((error: Error | null) => (error ? reject(error) : resolve()));
        });
      }
    },
  );

  nativeTest(
    'preserves the existing preset identity, environment settings and independent overrides',
    async () => {
      const config = await umiRules('production');
      const loader = ruleBabelLoader(config, 'src');
      const current = loader.get('options');
      const [[request, opts], ...otherPresets] = current.presets;
      const identity = 'existing-umi-preset';
      const presetEnv = { ...opts.presetEnv, bugfixes: true, exclude: ['transform-typeof-symbol'] };
      const preset = [request, { ...opts, presetEnv }, identity];
      const env = { production: { comments: false } };
      const overrides = [{ test: /\.mjs$/u, env: { production: { comments: true } } }];
      loader.options({ ...current, presets: [preset, ...otherPresets], env, overrides });

      configureWebpack(config, { env: 'production' } as WebpackArgs);

      const candidate = loader.get('options');
      assert.equal(candidate.presets[0], preset);
      assert.equal(candidate.env, env);
      assert.equal(candidate.overrides[0], overrides[0]);
      assert.deepEqual(candidate.overrides[1].presets, [
        [
          request,
          { ...opts, presetEnv: { ...presetEnv, exclude: [...presetEnv.exclude, broadTransform] } },
          identity,
        ],
      ]);
      const selected = selectedBabelOptions(candidate, exactFiles[0]);
      assert.equal(selected.comments, true);
      assert.ok(selected.plugins.includes(edgeTransform));
      assert.ok(!selected.plugins.includes(broadTransform));
      const unrelated = selectedBabelOptions(candidate, 'vendor/otherProtocol.mjs');
      assert.equal(unrelated.comments, true);
      assert.ok(unrelated.plugins.includes(broadTransform));
      assert.equal(selectedBabelOptions(candidate, 'src/pages/Study/preview.ts').comments, false);
    },
  );

  nativeTest('rejects environment settings that would replace the same Umi preset', async () => {
    const config = await umiRules('production');
    const loader = ruleBabelLoader(config, 'src');
    const baseline = { ...loader.get('options'), targets: { ie: '11' } };
    const [[request, opts]] = baseline.presets;
    const transform = 'transform-template-literals';
    const preset = [request, { ...opts, presetEnv: { ...opts.presetEnv, exclude: [transform] } }];
    const env = { production: { presets: [preset] } };
    const file = exactFiles[0];
    assert.ok(selectedBabelOptions(baseline, file).plugins.includes(transform));

    for (const configLayer of [{ env }, { overrides: [{ test: /\.mjs$/u, env }] }]) {
      const conflicting = { ...baseline, ...configLayer };
      assert.ok(!selectedBabelOptions(conflicting, file).plugins.includes(transform));
      loader.options(conflicting);
      assert.throws(
        () => configureWebpack(config, { env: 'production' } as WebpackArgs),
        /Study protocol build cannot combine overrides of the Umi Babel preset/u,
      );
      assert.equal(loader.get('options'), conflicting);
    }
  });

  nativeTest('leaves development Babel options unchanged', async () => {
    const config = await umiRules('development');
    const loader = ruleBabelLoader(config, 'src');
    const baseline = loader.get('options');

    configureWebpack(config, { env: 'development' } as WebpackArgs);

    assert.equal(loader.get('options'), baseline);
  });

  nativeTest(
    'fails if Umi changes the source Babel loader or its nested preset options',
    async () => {
      const config = await umiRules('production');
      const loader = ruleBabelLoader(config, 'src');
      const baseline = loader.get('options');
      const [[request, opts], ...otherPresets] = baseline.presets;
      const configure = () => configureWebpack(config, { env: 'production' } as WebpackArgs);
      loader.options({ ...baseline, overrides: [{ test: /\.mjs$/u, presets: [[request, opts]] }] });
      assert.throws(
        configure,
        /Study protocol build cannot combine overrides of the Umi Babel preset/u,
      );

      loader.options({
        ...baseline,
        presets: [[request, { ...opts, presetEnv: false }], ...otherPresets],
      });
      assert.throws(
        configure,
        /Study protocol build requires the Umi Babel preset with presetEnv options/u,
      );

      loader.set('options', 'legacy-options');
      assert.throws(configure, /Study protocol build requires Umi source Babel loader options/u);
      loader.delete('options');
      assert.throws(configure, /Study protocol build requires Umi source Babel loader options/u);

      config.module.rules.get('src').uses.delete('babel-loader');
      assert.throws(configure, /Study protocol build requires the Umi source Babel loader/u);
    },
  );
}

if (typeof jest === 'undefined') {
  registerInstalledBabelTests();
} else {
  it('checks Platform production Babel options with the installed Umi toolchain', () => {
    // Umi imports esbuild, which requires TextEncoder and Uint8Array from a single realm.
    execFileSync(process.execPath, ['--import', 'tsx', __filename], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
      timeout: 15_000,
    });
  });
}
