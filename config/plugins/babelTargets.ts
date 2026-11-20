import type { defineConfig, IApi } from '@umijs/max';
import { isDeepStrictEqual } from 'node:util';
import { browserTargets } from '../browserSupport';

type WebpackChain = Parameters<NonNullable<ReturnType<typeof defineConfig>['chainWebpack']>>[0];

function isOptions(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function forwardPresetTargets(options: unknown, targets: unknown) {
  if (!isDeepStrictEqual(targets, browserTargets)) {
    throw new Error('Umi targets must match the Platform browser policy');
  }

  if (!isOptions(options) || !isOptions(options.presetEnv)) {
    throw new Error('The Platform browser policy requires Umi Babel presetEnv options');
  }
  const { presetEnv } = options;
  if (
    presetEnv.forceAllTransforms ||
    (presetEnv.targets !== undefined && !isDeepStrictEqual(presetEnv.targets, targets))
  ) {
    throw new Error('Umi Babel presetEnv conflicts with the Platform browser policy');
  }

  // Umi's nested preset-env ignores Browserslist discovery and needs explicit targets.
  return { ...options, presetEnv: { ...presetEnv, targets } };
}

function isUmiPreset(entry: unknown): entry is [string, unknown, ...unknown[]] {
  return (
    Array.isArray(entry) &&
    typeof entry[0] === 'string' &&
    /[/\\]@umijs[/\\]babel-preset-umi[/\\]dist[/\\]index\.js$/u.test(entry[0])
  );
}

export function configureMfsuBabelTargets(webpack: WebpackChain) {
  // MFSU can build with the bundler's fallback preset, outside modifyBabelPresetOpts.
  for (const rule of ['src', 'jsx-ts-tsx', 'extra-src']) {
    const loader = webpack.module.rules.get(rule)?.uses.get('babel-loader');
    const options: unknown = loader?.get('options');
    if (!loader || !isOptions(options) || !Array.isArray(options.presets)) {
      throw new Error(`MFSU rule ${rule} requires Umi Babel loader presets`);
    }
    const { presets } = options;
    const matches = presets.filter(isUmiPreset);
    if (matches.length !== 1) {
      throw new Error(`MFSU rule ${rule} requires exactly one Umi Babel preset tuple`);
    }
    const umiPreset = matches[0];
    const [request, presetOptions, ...identity] = umiPreset;
    const preset = [request, forwardPresetTargets(presetOptions, options.targets), ...identity];
    loader.options({
      ...options,
      presets: presets.map((entry) => (entry === umiPreset ? preset : entry)),
    });
  }
}

export default function babelTargets(api: IApi) {
  api.modifyBabelPresetOpts((options) => forwardPresetTargets(options, api.config.targets));
}
