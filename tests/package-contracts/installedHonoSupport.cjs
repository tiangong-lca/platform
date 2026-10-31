const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const { onePackage, packageFromParent } = require('./auditPackageResolution.cjs');

const bundler = onePackage('@umijs/bundler-utoopack');
const utoo = packageFromParent(bundler, '@utoo/pack');
const adapter = packageFromParent(utoo, '@hono/node-server');
const hono = packageFromParent(utoo, 'hono');
const nodeWs = packageFromParent(utoo, '@hono/node-ws');
const ws = packageFromParent(nodeWs, 'ws');
const resources = { servers: new Set(), directories: new Set(), sockets: new Set() };

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-hono-1385-'));
  resources.directories.add(directory);
  return directory;
}
function removeDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(fs.existsSync(directory), false);
}
function request(port, requestPath, options = {}) {
  const { tls, allowAbort, body, ...requestOptions } = options;
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        agent: false,
        ...requestOptions,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('aborted', () =>
          allowAbort
            ? resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString(),
                aborted: true,
              })
            : reject(new Error('owned response aborted')),
        );
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error('owned loopback request deadline')));
    req.on('error', reject);
    req.end(body);
  });
}
async function withServer(app, callback, serverOptions = {}) {
  const server = adapter
    .require('@hono/node-server')
    .serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0, ...serverOptions });
  resources.servers.add(server);
  if (!server.listening) await once(server, 'listening');
  try {
    return await callback(server.address().port, server);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    assert.equal(server.listening, false);
  }
}
async function staticFor(format, directory = adapter.directory) {
  return format === 'cjs'
    ? require(path.join(directory, 'dist/serve-static.js')).serveStatic
    : (await import(pathToFileURL(path.join(directory, 'dist/serve-static.mjs')).href)).serveStatic;
}
function assertCleanup() {
  assert.ok([...resources.servers].every((server) => !server.listening));
  assert.ok([...resources.directories].every((directory) => !fs.existsSync(directory)));
  assert.ok(
    [...resources.sockets].every((socket) => socket.readyState === ws.require('ws').CLOSED),
  );
  console.log(
    JSON.stringify({
      scope: 'hono-owned-loopback',
      serversClosed: resources.servers.size,
      directoriesRemoved: resources.directories.size,
      socketsClosed: resources.sockets.size,
    }),
  );
}

module.exports = {
  assert,
  fs,
  http,
  https,
  path,
  once,
  bundler,
  utoo,
  adapter,
  hono,
  nodeWs,
  ws,
  resources,
  temporaryDirectory,
  removeDirectory,
  request,
  withServer,
  staticFor,
  assertCleanup,
};
