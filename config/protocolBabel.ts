import type { defineConfig } from '@umijs/max';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

type WebpackChain = Parameters<NonNullable<ReturnType<typeof defineConfig>['chainWebpack']>>[0];

const protocolModules = [
  'vendor/study-contract/v2/index.mjs',
  'vendor/study-contract/v3/index.mjs',
  'vendor/study-contract/v4/index.mjs',
  'vendor/study-contract/v5/index.mjs',
  'vendor/study-contract/v6/index.mjs',
  'src/standalone/studyReport/methodProtocol.mjs',
];
const umiPresetPath = /[/\\]@umijs[/\\]babel-preset-umi[/\\]dist[/\\]index\.js$/u;
const broadTransform = 'transform-function-name';

function isOptions(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUmiPreset(entry: unknown): boolean {
  const request: unknown = Array.isArray(entry) ? entry[0] : entry;
  return (
    typeof request === 'string' &&
    (umiPresetPath.test(request) || request.replace(/^module:/u, '') === '@umijs/babel-preset-umi')
  );
}

function hasUmiPreset(options: unknown): boolean {
  return isOptions(options) && Array.isArray(options.presets) && options.presets.some(isUmiPreset);
}

function hasUmiEnvironmentPreset(env: unknown): boolean {
  return isOptions(env) && Object.values(env).some(hasUmiPreset);
}

export function configureStudyProtocolBabel(memo: WebpackChain, appRoot: string): void {
  const loader = memo.module.rules.get('src')?.uses.get('babel-loader');
  if (!loader) throw new Error('Study protocol build requires the Umi source Babel loader');

  const options: unknown = loader.get('options');
  if (!isOptions(options)) {
    throw new Error('Study protocol build requires Umi source Babel loader options');
  }

  const { presets, overrides } = options;
  const umiPresets = Array.isArray(presets) ? presets.filter(isUmiPreset) : [];
  const umiPreset: unknown = umiPresets[0];
  if (umiPresets.length !== 1 || !Array.isArray(umiPreset)) {
    throw new Error('Study protocol build requires exactly one Umi Babel preset tuple');
  }

  const [preset, presetOptions, ...identity] = umiPreset;
  if (!isOptions(presetOptions) || !isOptions(presetOptions.presetEnv)) {
    throw new Error('Study protocol build requires the Umi Babel preset with presetEnv options');
  }

  if (
    hasUmiEnvironmentPreset(options.env) ||
    (overrides !== undefined &&
      (!Array.isArray(overrides) ||
        overrides.some(
          (override) =>
            isOptions(override) &&
            (hasUmiPreset(override) || hasUmiEnvironmentPreset(override.env)),
        )))
  ) {
    throw new Error('Study protocol build cannot combine overrides of the Umi Babel preset');
  }

  const { presetEnv } = presetOptions;
  const { exclude } = presetEnv;
  if (exclude !== undefined && !Array.isArray(exclude)) {
    throw new Error('Study protocol build requires Umi Babel presetEnv exclusions to be an array');
  }
  const excludedTransforms = [...new Set([...(exclude ?? []), broadTransform])];

  const root = realpathSync(appRoot);
  const filenames = new Set(protocolModules.map((file) => resolve(root, file)));
  loader.options({
    ...options,
    overrides: [
      ...(overrides ?? []),
      {
        // Reuse the same preset identity so Babel replaces its options for these files only.
        test: (filename?: string) => filename !== undefined && filenames.has(filename),
        presets: [
          [
            preset,
            { ...presetOptions, presetEnv: { ...presetEnv, exclude: excludedTransforms } },
            ...identity,
          ],
        ],
      },
    ],
  });
}
