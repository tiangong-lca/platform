const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { onePackage, packageFromParent, repositoryRoot } = require('./auditPackageResolution.cjs');

const plugins = onePackage('@umijs/plugins');
const axiosPackage = packageFromParent(plugins, 'axios');
const axios = axiosPackage.require('axios');
const umi = onePackage('umi');
const runtimePath = path.join(umi.directory, 'client/client/plugin.js');
const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild');
const generatedMode = process.env.AXIOS_GENERATED_MODE || '.umi';
assert.ok(['.umi', '.umi-test', '.umi-production'].includes(generatedMode));
const generatedPath = path.join(repositoryRoot, 'src', generatedMode, 'plugin-request/request.ts');
const expectedVersion = process.env.AXIOS_CONTRACT_BASELINE === '1' ? '0.27.2' : '0.34.0';

// Only the application bootstrap and UI feedback/localization ports are fixtures.
// The generated facade, Axios, use-request and Umi PluginManager execute installed bytes.
// Loading src/app.tsx itself would start unrelated service/auth/runtime integrations.
async function bundleFacade(platform = 'node') {
  const result = await esbuild.build({
    stdin: {
      contents: `export * from ${JSON.stringify(generatedPath)}; export {errorConfig as appErrorConfig} from ${JSON.stringify(path.join(repositoryRoot, 'src/requestErrorConfig.ts'))};${
        platform === 'browser'
          ? `
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {useRequest as hook} from ${JSON.stringify(generatedPath)};
export function mountRequest(container, service, options, observe) {
  function Consumer() { const state = hook(service, options); observe(state); return null; }
  const root = createRoot(container); root.render(React.createElement(Consumer)); return () => root.unmount();
}`
          : ''
      }`,
      resolveDir: repositoryRoot,
      sourcefile: 'owned-installed-axios-fixture.ts',
      loader: 'ts',
    },
    bundle: true,
    metafile: true,
    write: false,
    platform,
    format: platform === 'node' ? 'cjs' : 'iife',
    globalName: platform === 'browser' ? 'installedFacade' : undefined,
    packages: platform === 'node' ? 'external' : undefined,
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [
      {
        name: 'owned-runtime-and-feedback-ports',
        setup(build) {
          if (platform === 'node')
            build.onResolve(
              { filter: /node_modules\/(axios|@ahooksjs\/use-request)$/ },
              ({ path }) => ({ path, external: true }),
            );
          build.onResolve({ filter: /^umi$/ }, () => ({ path: runtimePath }));
          build.onResolve({ filter: /^\.\.\/core\/plugin$/ }, () => ({
            path: 'runtime',
            namespace: 'owned-fixture',
          }));
          build.onResolve({ filter: /^@\/contexts\/AntdAppContext$/ }, () => ({
            path: 'feedback',
            namespace: 'owned-fixture',
          }));
          build.onResolve({ filter: /^@umijs\/max$/ }, () => ({
            path: 'intl',
            namespace: 'owned-fixture',
          }));
          build.onLoad({ filter: /.*/, namespace: 'owned-fixture' }, ({ path: name }) => ({
            resolveDir: repositoryRoot,
            contents:
              name === 'runtime'
                ? `import {PluginManager} from ${JSON.stringify(runtimePath)};
            let manager; export function getPluginManager() { return manager ||= PluginManager.create({
              plugins:[{apply:{request:()=>__fixture.config},path:'owned-installed-axios-fixture'}],validKeys:['request']}); }`
                : name === 'feedback'
                  ? 'export const dispatchAntdAppAction = (callback) => callback(__fixture.ui);'
                  : 'export const getIntl = () => ({formatMessage: (message, values) => values ? message.id + ":" + values.status : message.id});',
          }));
        },
      },
    ],
  });
  return { code: result.outputFiles[0].text, metafile: result.metafile };
}

let nodeBundle;
async function facade(config = {}) {
  nodeBundle ||= bundleFacade();
  const { code } = await nodeBundle;
  const feedback = [];
  const fixture = {
    config,
    ui: {
      message: Object.fromEntries(
        ['warning', 'error'].map((kind) => [kind, (value) => feedback.push([kind, value])]),
      ),
      notification: { open: (value) => feedback.push(['notification', value]) },
    },
  };
  const result = { exports: {} };
  new Function('require', 'module', 'exports', '__fixture', code)(
    require,
    result,
    result.exports,
    fixture,
  );
  return { ...result.exports, feedback, fixture };
}

function activeInterceptors(instance) {
  return [instance.interceptors.request, instance.interceptors.response].map(
    (manager) => manager.handlers.filter(Boolean).length,
  );
}

module.exports = {
  repositoryRoot,
  plugins,
  axiosPackage,
  axios,
  umi,
  esbuild,
  runtimePath,
  generatedPath,
  expectedVersion,
  bundleFacade,
  facade,
  activeInterceptors,
};
