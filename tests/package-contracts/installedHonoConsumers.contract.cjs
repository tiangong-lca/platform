const { fork, spawnSync } = require('node:child_process');
const { test, after } = require('node:test');
const { repositoryRoot } = require('./auditPackageResolution.cjs');
const {
  assert,
  fs,
  path,
  once,
  https,
  adapter,
  hono,
  nodeWs,
  ws,
  resources,
  temporaryDirectory,
  removeDirectory,
  request,
  withServer,
  assertCleanup,
} = require('./installedHonoSupport.cjs');
const { Hono } = hono.require('hono');
const WebSocket = ws.require('ws');
const children = new Set();
after(() => {
  assert.ok([...children].every((child) => child.exitCode !== null || child.signalCode !== null));
  assertCleanup();
});

// A killed wrapper must not orphan a compiler/server. On Windows a forced
// wrapper termination is covered by the fork's IPC-disconnect handler instead.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    const closed = [];
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        closed.push(once(child, 'exit'));
        if (child.connected) child.disconnect();
      }
    const deadline = setTimeout(() => process.exit(1), 4000);
    Promise.all(closed).finally(() => {
      clearTimeout(deadline);
      process.exit(1);
    });
  });

function certificate(directory) {
  // Public, synthetic test-only key/certificate; no CLI or CA/provider access at runtime.
  for (const [fixture, target] of [
    ['hono-test-key.pem', 'key.pem'],
    ['hono-test-cert.pem', 'cert.pem'],
  ])
    fs.copyFileSync(path.join(__dirname, 'fixtures', fixture), path.join(directory, target));
  return {
    key: fs.readFileSync(path.join(directory, 'key.pem')),
    cert: fs.readFileSync(path.join(directory, 'cert.pem')),
  };
}
async function closeSocket(socket) {
  if (socket.readyState === WebSocket.CLOSED) return;
  const closed = once(socket, 'close');
  socket.close(1000, 'owned complete');
  const timer = setTimeout(() => socket.terminate(), 3000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
  assert.equal(socket.readyState, WebSocket.CLOSED);
}
test(
  'real node-ws preserves HTTP/HTTPS handshake, message/binary/close and adapter environment',
  { timeout: 10000 },
  async () => {
    const directory = temporaryDirectory();
    const cert = certificate(directory);
    try {
      for (const tls of [false, true]) {
        const app = new Hono();
        const { injectWebSocket, upgradeWebSocket, wss } = nodeWs
          .require('@hono/node-ws')
          .createNodeWebSocket({ app });
        app.get(
          '/ws',
          upgradeWebSocket((c) => {
            assert.ok(c.env.incoming);
            assert.equal(c.env.incoming.url, '/ws');
            return {
              onMessage(event, socket) {
                socket.send(event.data);
              },
            };
          }),
        );
        app.get('/ok', (c) => c.text('http remains available'));
        try {
          await withServer(
            app,
            async (port, server) => {
              injectWebSocket(server);
              assert.equal(
                (await request(port, '/ok', tls ? { tls: true, ca: cert.cert } : {})).body,
                'http remains available',
              );
              const socket = new WebSocket(
                `${tls ? 'wss' : 'ws'}://127.0.0.1:${port}/ws`,
                tls ? { ca: cert.cert } : {},
              );
              resources.sockets.add(socket);
              try {
                await once(socket, 'open');
                for (const value of ['owned message', Buffer.from([1, 2, 3])]) {
                  const message = once(socket, 'message');
                  socket.send(value);
                  const [actual, binary] = await message;
                  assert.deepEqual(Buffer.from(actual), Buffer.from(value));
                  assert.equal(binary, Buffer.isBuffer(value));
                }
              } finally {
                await closeSocket(socket);
              }
            },
            tls ? { createServer: https.createServer, serverOptions: cert } : {},
          );
        } finally {
          await new Promise((resolve) => {
            wss.close(resolve);
          });
        }
      }
    } finally {
      removeDirectory(directory);
    }
  },
);

function listenOwned(server, port) {
  resources.servers.add(server);
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}
async function closeOwnedListener(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  assert.equal(server.listening, false);
}
function childListeningPorts(ready, child) {
  const observation = ready.listenerOwnership;
  assert.equal(observation?.pid, child.pid, 'listener identities must come from the actual child');
  assert.equal(observation.complete, true, 'listener observation must be complete');
  assert.ok(
    Array.isArray(observation.active) &&
      observation.active.length > 0 &&
      observation.active.length <= 16,
  );
  for (const identity of observation.active) {
    assert.ok(
      Number.isInteger(identity.serverId) && identity.serverId > 0 && identity.serverId <= 16,
    );
    assert.ok(Number.isInteger(identity.port) && identity.port > 0 && identity.port <= 65535);
    assert.ok(['127.0.0.1', '::', '::1', '0.0.0.0'].includes(identity.address));
  }
  const ports = observation.active.map((identity) => identity.port).sort((a, b) => a - b);
  assert.equal(new Set(ports).size, ports.length, 'active listener identities must be unique');
  return ports;
}
async function assertOwnedPortsClosed(ports) {
  for (const port of ports)
    await new Promise((resolve, reject) => {
      // TCP-only closure check of an observed child-owned endpoint; no HTTP/WS payload.
      const socket = require('node:net').createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(3000, () => {
        socket.destroy();
        reject(new Error('owned endpoint closure deadline'));
      });
      socket.once('connect', () => {
        socket.destroy();
        reject(new Error('child-owned port still accepts connections: ' + port));
      });
      socket.once('error', (error) => {
        if (error.code === 'ECONNREFUSED') resolve();
        else reject(error);
      });
    });
}
async function childFixture(format, tls, callback, baselinePath, fixtureOptions = {}) {
  fs.mkdirSync(path.join(repositoryRoot, '.local'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(repositoryRoot, '.local/hono-1385-'));
  resources.directories.add(directory);
  let logs = '';
  let child;
  let backend;
  let outerHolder;
  let innerHolder;
  let port;
  let observedChildPorts = [];
  let failure;
  let innerConnections = 0;
  let callbackCalls = 0;
  const backendRequests = [];
  try {
    const cert = tls ? certificate(directory) : undefined;
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ private: true, name: 'owned-hono-fixture' }),
    );
    fs.writeFileSync(
      path.join(directory, 'entry.js'),
      'globalThis.ownedHono = () => import("./lazy.js");',
    );
    fs.writeFileSync(path.join(directory, 'lazy.js'), 'export const value = "owned lazy module";');
    backend = require('node:http').createServer((req, res) => {
      backendRequests.push(req.method + ' ' + req.url);
      res.end('owned proxy ' + req.method + ' ' + req.url);
    });
    await listenOwned(backend, 0);
    outerHolder = require('node:net').createServer();
    await listenOwned(outerHolder, 0);
    port = outerHolder.address().port;
    if (format === 'umi') {
      assert.ok(port < 65535, 'Umi requires an available adjacent internal port');
      innerHolder = require('node:net').createServer((socket) => {
        innerConnections += 1;
        socket.destroy();
      });
      // One bounded reservation attempt. An occupied adjacent port fails before
      // fork; no blind retry and no attempt to stop somebody else's listener.
      await listenOwned(innerHolder, port + 1);
    }
    await closeOwnedListener(outerHolder);
    if (!fixtureOptions.occupyInner) await closeOwnedListener(innerHolder);
    child = fork(
      path.join(__dirname, 'fixtures/honoUtooChild.cjs'),
      [
        directory,
        String(port),
        format,
        tls ? 'https' : 'http',
        String(backend.address().port),
        baselinePath || '',
      ],
      {
        cwd: repositoryRoot,
        silent: true,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          SystemRoot: process.env.SystemRoot,
          USERPROFILE: process.env.USERPROFILE,
          RAYON_NUM_THREADS: '2',
          UTOO_TURBOPACK_SMALL_PREALLOCATION: '1',
        },
      },
    );
    children.add(child);
    child.stdout.on('data', (data) => {
      logs = (logs + data).slice(-20000);
    });
    child.stderr.on('data', (data) => {
      logs = (logs + data).slice(-20000);
    });
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('owned Utoo readiness deadline\n' + logs)),
        15000,
      );
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`Utoo early exit ${code}/${signal}\n${logs}`));
      });
      child.on('message', (value) => {
        clearTimeout(timer);
        if (value.kind === 'ready') resolve(value);
        else reject(new Error(value.message + '\n' + logs));
      });
    });
    observedChildPorts = childListeningPorts(ready, child);
    const expectedPorts = (format === 'umi' ? [port, port + 1] : [port]).sort((a, b) => a - b);
    if (
      ready.port !== port ||
      JSON.stringify(observedChildPorts) !== JSON.stringify(expectedPorts)
    ) {
      const error = new Error(
        'Refusing client callbacks: child does not own the exact requested endpoint set',
      );
      error.code = 'OWNED_LISTENER_MISMATCH';
      error.ownership = { childPid: child.pid, expectedPorts, actualPorts: observedChildPorts };
      throw error;
    }
    console.log(
      JSON.stringify({
        format,
        requestedPort: port,
        readyPort: ready.port,
        backendPort: backend.address().port,
        ownedListeningPorts: observedChildPorts,
        assetCount: ready.assets.length,
      }),
    );
    callbackCalls += 1;
    await callback({ ...ready, directory, cert, child });
  } catch (error) {
    error.message += '\nbackend=' + JSON.stringify(backendRequests);
    failure = error;
    throw error;
  } finally {
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        const signal = format === 'esm' ? 'SIGINT' : 'SIGTERM';
        if (process.platform === 'win32') child.send({ shutdownSignal: signal });
        else child.kill(signal);
        const force = setTimeout(() => child.kill('SIGKILL'), 3000);
        try {
          const [code, signal] = await exited;
          assert.equal(code, 0, logs + '\n' + signal);
        } finally {
          clearTimeout(force);
        }
      }
      await assertOwnedPortsClosed(observedChildPorts);
      if (failure)
        failure.cleanup = {
          childOwnedPortsClosed: true,
          actualPorts: observedChildPorts,
          occupiedInnerPreserved:
            fixtureOptions.occupyInner === true &&
            innerHolder?.listening &&
            innerHolder.address().port === port + 1,
          innerConnections,
          clientCallbacks: callbackCalls,
          backendRequests: backendRequests.length,
        };
    } finally {
      await closeOwnedListener(innerHolder);
      await closeOwnedListener(outerHolder);
      await closeOwnedListener(backend);
      if (failure?.cleanup)
        failure.cleanup.reservedListenersClosed = [innerHolder, outerHolder, backend].every(
          (server) => !server?.listening,
        );
      removeDirectory(directory);
    }
  }
}

test(
  'occupied Umi internal port rejects the real fallback before any HTTP/WS callback',
  { timeout: 25000 },
  async () => {
    let callbacks = 0;
    await assert.rejects(
      childFixture(
        'umi',
        false,
        async () => {
          callbacks += 1;
        },
        undefined,
        { occupyInner: true },
      ),
      (error) => {
        assert.equal(error.code, 'OWNED_LISTENER_MISMATCH');
        assert.equal(error.ownership.expectedPorts.length, 2);
        assert.equal(error.ownership.actualPorts.length, 2);
        assert.ok(error.ownership.actualPorts.includes(error.ownership.expectedPorts[0]));
        assert.ok(
          !error.ownership.actualPorts.includes(error.ownership.expectedPorts[1]),
          'actual Utoo fallback must leave the held internal port untouched',
        );
        assert.equal(error.cleanup.childOwnedPortsClosed, true);
        assert.equal(error.cleanup.occupiedInnerPreserved, true);
        assert.equal(error.cleanup.reservedListenersClosed, true);
        assert.equal(error.cleanup.innerConnections, 0);
        assert.equal(error.cleanup.backendRequests, 0);
        assert.equal(error.cleanup.clientCallbacks, 0);
        console.log(
          JSON.stringify({ rejectedUmiFallback: error.ownership, cleanup: error.cleanup }),
        );
        return true;
      },
    );
    assert.equal(callbacks, 0);
  },
);

for (const [format, tls] of [
  ['cjs', false],
  ['esm', true],
  ['umi', false],
]) {
  test(
    `actual ${format} Utoo consumer ${tls ? 'HTTPS' : 'HTTP'} serves compiled assets, HMR and releases signals`,
    { timeout: 25000 },
    async () => {
      await childFixture(format, tls, async ({ port, assets, lazyAssets, directory, cert }) => {
        const opts = tls ? { tls: true, ca: cert.cert } : {};
        assert.ok(
          assets.length > 0,
          'onReady/compile callback must identify actual compiler outputs',
        );
        const asset = assets.find((item) => item.endsWith('.js'));
        assert.ok(asset, JSON.stringify(assets));
        const url = asset.startsWith('/') ? asset : '/assets/' + asset;
        assert.equal((await request(port, url, opts)).status, 200, url);
        assert.equal((await request(port, url, { ...opts, method: 'HEAD' })).body, '');
        assert.equal(
          (await request(port, '/owned-proxy/test?q=one', opts)).body,
          'owned proxy GET /upstream/test?q=one',
        );
        assert.equal(
          (
            await request(port, '/owned-proxy/test', {
              ...opts,
              method: 'POST',
              body: 'owned body',
            })
          ).body,
          'owned proxy POST /upstream/test',
        );
        if (format !== 'umi') {
          assert.ok(lazyAssets.length > 0, 'actual compiler must emit a lazy activation manifest');
          const lazyPath = '/assets/' + lazyAssets[0].replaceAll('\\', '/');
          assert.equal((await request(port, lazyPath, opts)).status, 200);
          assert.equal(
            (await request(port, lazyPath, opts)).status,
            200,
            'stable lazy URL remains served after rewrite',
          );
          const outputs = fs
            .readdirSync(path.join(directory, 'dist'), { recursive: true })
            .filter((item) => item.endsWith('.js'));
          assert.ok(
            outputs.some((item) =>
              fs
                .readFileSync(path.join(directory, 'dist', item), 'utf8')
                .includes('owned lazy module'),
            ),
            'real lazy module must be compiled after activation',
          );
          assert.equal((await request(port, '/assets/owned.txt', opts)).body, 'owned Utoo asset');
          assert.equal((await request(port, '/assets/%E7%82%8E.txt', opts)).body, 'owned unicode');
          assert.equal((await request(port, '/missing', opts)).status, 404);
          const post = await request(port, '/assets/owned.txt', { ...opts, method: 'POST' });
          assert.equal(post.status, 405);
          assert.equal(post.headers.allow, 'GET, HEAD');
        } else assert.equal((await request(port, '/owned-before', opts)).body, 'outer middleware');
        const socket = new WebSocket(
          `${tls ? 'wss' : 'ws'}://127.0.0.1:${port}/turbopack-hmr`,
          tls ? { ca: cert.cert } : {},
        );
        resources.sockets.add(socket);
        const messages = [];
        try {
          const sync = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('HMR sync deadline')), 3000);
            socket.on('error', (error) => {
              clearTimeout(timer);
              reject(error);
            });
            socket.on('message', (data) => {
              const item = JSON.parse(data);
              messages.push(item);
              if (item.action === 'sync') {
                clearTimeout(timer);
                resolve();
              }
            });
          });
          await Promise.all([once(socket, 'open'), sync]);
          assert.ok(messages.some((item) => item.action === 'turbopack-connected'));
          assert.deepEqual(messages.find((item) => item.action === 'sync').errors, []);
          socket.send(JSON.stringify({ event: 'client-success' }));
          const pong = once(socket, 'pong');
          socket.ping('owned ping');
          await pong;
        } finally {
          await closeSocket(socket);
        }
      });
    },
  );
}

test('public CJS/ESM consumers and both shipped declarations compile with NodeNext', () => {
  const directory = temporaryDirectory();
  try {
    fs.mkdirSync(path.join(directory, 'node_modules/@hono'), { recursive: true });
    fs.symlinkSync(
      adapter.directory,
      path.join(directory, 'node_modules/@hono/node-server'),
      'junction',
    );
    fs.symlinkSync(hono.directory, path.join(directory, 'node_modules/hono'), 'junction');
    for (const ext of ['cts', 'mts'])
      fs.writeFileSync(
        path.join(directory, 'consumer.' + ext),
        'import { serveStatic, type ServeStaticOptions } from "@hono/node-server/serve-static"; const options: ServeStaticOptions = { allowPercentInPath: false }; const handler = serveStatic(options); void handler;',
      );
    fs.writeFileSync(
      path.join(directory, 'shipped.mts'),
      'import { serveStatic, type ServeStaticOptions } from ' +
        JSON.stringify(
          path.join(adapter.directory, 'dist/serve-static.mjs').replaceAll('\\', '/'),
        ) +
        '; const options: ServeStaticOptions = { allowPercentInPath: true }; void serveStatic(options);',
    );
    const tsc = path.join(repositoryRoot, 'node_modules/typescript/bin/tsc');
    const result = spawnSync(
      process.execPath,
      [
        tsc,
        '--noEmit',
        '--listFiles',
        '--strict',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2022',
        '--typeRoots',
        path.join(repositoryRoot, 'node_modules/@types'),
        path.join(directory, 'consumer.cts'),
        path.join(directory, 'consumer.mts'),
        path.join(directory, 'shipped.mts'),
      ],
      { cwd: directory, encoding: 'utf8', timeout: 25000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.includes('serve-static.d.ts'));
    assert.ok(result.stdout.includes('serve-static.d.mts'));
  } finally {
    removeDirectory(directory);
  }
});

test(
  'actual Utoo percent-bearing output retains the user-approved official restriction',
  { timeout: 45000 },
  async () => {
    const directory = temporaryDirectory();
    const baseline = path.join(directory, 'baseline');
    try {
      fs.cpSync(adapter.directory, baseline, { recursive: true });
      fs.mkdirSync(path.join(baseline, 'node_modules'));
      fs.symlinkSync(hono.directory, path.join(baseline, 'node_modules/hono'), 'junction');
      const reverse = spawnSync(
        'git',
        [
          'apply',
          '--reverse',
          path.join(repositoryRoot, 'patches/@hono__node-server@1.19.17.patch'),
        ],
        { cwd: baseline, encoding: 'utf8' },
      );
      assert.equal(reverse.status, 0, reverse.stderr);
      const observations = [];
      for (const variant of ['baseline', 'candidate'])
        await childFixture(
          'percent-' + variant,
          false,
          async ({ port, assets, directory: project }) => {
            assert.ok(
              assets.some((item) => item.includes('100%')),
              JSON.stringify(assets),
            );
            const asset = assets.find((item) => item.includes('100%') && item.endsWith('.js'));
            assert.ok(
              fs.existsSync(path.join(project, 'dist', asset)),
              'compiler must actually emit the percent-named asset',
            );
            const response = await request(
              port,
              '/assets/' + asset.split('/').map(encodeURIComponent).join('/'),
            );
            observations.push({
              variant,
              asset,
              status: response.status,
              bytes: response.body.length,
            });
            assert.equal(response.status, variant === 'baseline' ? 200 : 404);
          },
          variant === 'baseline' ? baseline : undefined,
        );
      console.log(
        JSON.stringify({
          approvedRestriction:
            'Utoo percent-bearing filenames are unavailable through dynamic static serving',
          userDecision:
            'https://github.com/tiangong-lca/platform/issues/1385#issuecomment-6542920653',
          observations,
        }),
      );
    } finally {
      removeDirectory(directory);
    }
  },
);

test('actual Utoo rejects a missing entry before readiness or opening a listener', async () => {
  const directory = temporaryDirectory();
  try {
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ private: true, name: 'owned-startup-failure' }),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'fixtures/honoUtooChild.cjs'),
        directory,
        '0',
        'bad-entry',
        'http',
        '0',
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          SystemRoot: process.env.SystemRoot,
          USERPROFILE: process.env.USERPROFILE,
          RAYON_NUM_THREADS: '2',
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /owned-missing-entry/);
    assert.doesNotMatch(result.stdout, /"kind":"ready"/);
    console.log(
      JSON.stringify({
        actualUtooStartup: 'missing entry rejected before readiness',
        status: result.status,
      }),
    );
  } finally {
    removeDirectory(directory);
  }
});

test(
  'a lost parent IPC channel shuts down the actual Utoo compiler and listening port',
  { timeout: 25000 },
  async () => {
    await childFixture('cjs', false, async ({ port, child }) => {
      const exited = once(child, 'exit');
      child.disconnect();
      const [code, signal] = await exited;
      assert.equal(code, 0);
      assert.equal(signal, null);
      await assert.rejects(request(port, '/assets/owned.txt'), { code: 'ECONNREFUSED' });
      console.log(
        JSON.stringify({ parentDisconnect: true, childExitCode: code, portClosed: true }),
      );
    });
  },
);

test(
  'abrupt wrapper termination cannot orphan its real compiler/server child',
  { timeout: 25000 },
  async () => {
    fs.mkdirSync(path.join(repositoryRoot, '.local'), { recursive: true });
    const directory = fs.mkdtempSync(path.join(repositoryRoot, '.local/hono-1385-'));
    resources.directories.add(directory);
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"owned-cancellation","private":true}',
    );
    fs.writeFileSync(path.join(directory, 'entry.js'), 'globalThis.ownedCancellation = 1;');
    let wrapper;
    let ownedChildPid;
    let port;
    try {
      wrapper = fork(
        path.join(__dirname, 'fixtures/honoCancellationWrapper.cjs'),
        [directory, '0', 'cjs', 'http', '0'],
        {
          silent: true,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            SystemRoot: process.env.SystemRoot,
            USERPROFILE: process.env.USERPROFILE,
            RAYON_NUM_THREADS: '2',
          },
        },
      );
      children.add(wrapper);
      wrapper.stdout.resume();
      wrapper.stderr.resume();
      const ready = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('cancellation fixture readiness deadline')),
          15000,
        );
        wrapper.on('message', (value) => {
          clearTimeout(timer);
          if (value.kind === 'ready') resolve(value);
          else reject(new Error(value.message));
        });
        wrapper.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('cancellation wrapper exited before readiness'));
        });
      });
      ownedChildPid = ready.ownedChildPid;
      port = ready.port;
      const exited = once(wrapper, 'exit');
      wrapper.kill('SIGKILL');
      await exited;
      const deadline = Date.now() + 5000;
      let alive = true;
      while (alive && Date.now() < deadline) {
        try {
          process.kill(ownedChildPid, 0);
        } catch (error) {
          assert.equal(error.code, 'ESRCH');
          alive = false;
        }
        if (alive)
          await new Promise((resolve) => {
            setTimeout(resolve, 20);
          });
      }
      assert.equal(alive, false, 'owned grandchild must exit after abrupt wrapper loss');
      ownedChildPid = undefined;
      await assert.rejects(request(port, '/owned.txt'), { code: 'ECONNREFUSED' });
      console.log(
        JSON.stringify({ wrapperForcedExit: true, descendantExited: true, portClosed: true }),
      );
    } finally {
      if (wrapper && wrapper.exitCode === null && wrapper.signalCode === null)
        wrapper.kill('SIGKILL');
      if (ownedChildPid) {
        try {
          process.kill(ownedChildPid, 'SIGKILL');
        } catch (error) {
          assert.equal(error.code, 'ESRCH');
        }
      }
      removeDirectory(directory);
    }
  },
);
