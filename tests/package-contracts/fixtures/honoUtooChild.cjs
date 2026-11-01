// Isolated real native compiler/server. Parent owns this process and fixture tree.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { utoo, bundler } = require('../installedHonoSupport.cjs');
const { repositoryRoot } = require('../auditPackageResolution.cjs');
const net = require('node:net');
const [directory, portText, format = 'cjs', tls = 'http', backendPort, baselinePath] =
  process.argv.slice(2);
const port = Number(portText);
if (baselinePath) {
  const Module = require('node:module');
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (name, ...args) {
    if (name === '@hono/node-server') return path.join(baselinePath, 'dist/index.js');
    if (name === '@hono/node-server/serve-static')
      return path.join(baselinePath, 'dist/serve-static.js');
    return resolve.call(this, name, ...args);
  };
}
process.chdir(directory);
// Observe this process's actual servers, including Utoo's temporary get-port
// probes. Preserve emit's arguments, listener ordering and return value. Only
// still-listening servers enter readiness; a fallback cannot masquerade as the
// requested Umi internal endpoint. The observation is bounded and fails closed.
const listeningServers = new Map();
let listenerObservationComplete = true;
const originalEmit = net.Server.prototype.emit;
net.Server.prototype.emit = function (event, ...args) {
  if (event === 'listening' && !listeningServers.has(this)) {
    if (listeningServers.size < 16) listeningServers.set(this, listeningServers.size + 1);
    else listenerObservationComplete = false;
  }
  return originalEmit.call(this, event, ...args);
};
function listenerOwnership() {
  const active = [];
  for (const [server, serverId] of listeningServers) {
    const address = server.address();
    if (!server.listening) continue;
    if (!address || typeof address !== 'object') {
      listenerObservationComplete = false;
      continue;
    }
    active.push({ serverId, port: address.port, address: address.address });
  }
  return { pid: process.pid, complete: listenerObservationComplete, active };
}
const ready = (value) =>
  process.send({ kind: 'ready', ...value, listenerOwnership: listenerOwnership() });
const output = path.join(directory, 'dist');
// Windows lacks POSIX signal delivery. IPC exercises the installed signal handler;
// Unix qualification sends the real OS signal. The parent verifies process/port closure.
process.on('disconnect', () => {
  if (process.listenerCount('SIGTERM')) {
    process.emit('SIGTERM');
    setTimeout(() => process.exit(1), 3000).unref();
  } else process.exit(1);
});
process.on('message', (value) => {
  if (value.shutdownSignal && ['SIGINT', 'SIGTERM'].includes(value.shutdownSignal))
    process.emit(value.shutdownSignal);
});

async function main() {
  const entry = path.join(directory, 'entry.js');
  const config = {
    entry: [{ import: './entry.js', name: 'main' }],
    output: { path: output, publicPath: '/assets/' },
    persistentCaching: false,
    devServer: {
      lazyDynamicImports: true,
      proxy: [
        {
          context: '/owned-proxy',
          target: 'http://127.0.0.1:' + backendPort,
          pathRewrite: { '^/owned-proxy': '/upstream' },
        },
      ],
    },
  };
  if (format.startsWith('percent')) {
    config.entry[0].name = '100%';
    config.output.filename = '[name].js';
  }
  if (format === 'bad-entry') config.entry[0].import = './owned-missing-entry.js';
  if (format === 'umi') {
    await bundler.require('@umijs/bundler-utoopack').dev({
      cwd: directory,
      port,
      host: '127.0.0.1',
      ip: '127.0.0.1',
      entry: { main: entry },
      config: {
        publicPath: '/assets/',
        outputPath: 'dist',
        utoopack: { root: repositoryRoot, persistentCaching: false },
        targets: { chrome: 120 },
        proxy: {
          '/owned-proxy': {
            target: 'http://127.0.0.1:' + backendPort,
            pathRewrite: { '^/owned-proxy': '/upstream' },
          },
        },
      },
      onBeforeMiddleware(app) {
        app.get('/owned-before', (_req, res) => res.end('outer middleware'));
      },
      onDevCompileDone({ stats }) {
        ready({
          port,
          assets: Object.values(stats.entrypoints)
            .flatMap((item) => item.assets)
            .map((item) => (typeof item === 'string' ? item : item.name)),
        });
      },
    });
    return;
  }
  const pack =
    format === 'esm'
      ? await import(pathToFileURL(path.join(utoo.directory, 'esm/index.js')).href)
      : utoo.require('@utoo/pack');
  await pack.serve({ config, tracing: false }, directory, repositoryRoot, {
    port,
    hostname: '127.0.0.1',
    logServerInfo: false,
    ...(tls === 'https'
      ? {
          https: true,
          selfSignedCertificate: {
            key: path.join(directory, 'key.pem'),
            cert: path.join(directory, 'cert.pem'),
          },
        }
      : {}),
    onReady(context) {
      // Additional files are owned synthetic outputs; the real compiler creates its own entry/HMR outputs.
      fs.writeFileSync(path.join(output, 'owned.txt'), 'owned Utoo asset');
      fs.writeFileSync(path.join(output, '炎.txt'), 'owned unicode');
      ready({
        ...context,
        assets: context.clientPaths,
        lazyAssets: fs
          .readdirSync(output, { recursive: true })
          .filter((item) => item.includes('lazy-compilation-') && item.endsWith('.js')),
      });
    },
  });
}
main().catch((error) => {
  if (process.send)
    process.send({ kind: 'error', message: error.stack }, () => process.disconnect());
  else {
    console.error(error.stack);
    process.exit(1);
  }
});
