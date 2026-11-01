// Actual installed CJS/ESM HTTP middleware, outside Jest's module mappers.
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { test, after } = require('node:test');
const { repositoryRoot } = require('./auditPackageResolution.cjs');
const {
  assert,
  fs,
  path,
  adapter,
  hono,
  nodeWs,
  utoo,
  temporaryDirectory,
  removeDirectory,
  request,
  withServer,
  staticFor,
  assertCleanup,
} = require('./installedHonoSupport.cjs');
const { Hono } = hono.require('hono');
const patchPath = path.join(repositoryRoot, 'patches/@hono__node-server@1.19.17.patch');
const patchSha = createHash('sha256').update(fs.readFileSync(patchPath)).digest('hex');
after(assertCleanup);

function fixtures() {
  const directory = temporaryDirectory();
  for (const [name, body] of Object.entries({
    'static/admin/secret.txt': 'owned secret',
    'static/plain.txt': 'owned public text',
    'static/hello world.txt': 'space',
    'static/炎.txt': 'unicode',
    'static/100%.txt': 'percent',
    'static/%2Fadmin/secret.txt': 'literal encoded directory',
    'static/index.html': 'index',
    'static/custom.html': 'custom index',
    'static/plain.txt.gz': 'synthetic gzip bytes',
  })) {
    const filename = path.join(directory, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, body);
  }
  return directory;
}

test('real Utoo and node-ws share the exact native-patched adapter with unchanged peers', () => {
  assert.equal(adapter.manifest.version, '1.19.17');
  assert.equal(utoo.manifest.version, '1.5.26');
  assert.equal(hono.manifest.version, '4.13.14');
  assert.equal(nodeWs.manifest.peerDependencies['@hono/node-server'], '^1.19.11');
  assert.equal(
    fs.realpathSync(nodeWs.require.resolve('@hono/node-server')),
    fs.realpathSync(utoo.require.resolve('@hono/node-server')),
  );
  assert.ok(adapter.directory.includes('patch_hash=' + patchSha));
  assert.ok(
    fs
      .readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')
      .includes("'@hono/node-server@1.19.17': " + patchSha),
  );
  console.log(
    JSON.stringify({
      adapter: adapter.manifest.version,
      patchSha256: patchSha,
      installedCjsSha256: createHash('sha256')
        .update(fs.readFileSync(path.join(adapter.directory, 'dist/serve-static.js')))
        .digest('hex'),
    }),
  );
});

for (const format of ['cjs', 'esm']) {
  test(
    format +
      ' reconstructs the official baseline and demonstrates the actual HTTP middleware bypass',
    async () => {
      const directory = fixtures();
      const baseline = path.join(directory, 'baseline');
      fs.cpSync(adapter.directory, baseline, { recursive: true });
      fs.mkdirSync(path.join(directory, 'node_modules'));
      fs.symlinkSync(hono.directory, path.join(directory, 'node_modules/hono'), 'junction');
      const reverse = spawnSync('git', ['apply', '--reverse', patchPath], {
        cwd: baseline,
        encoding: 'utf8',
      });
      assert.equal(reverse.status, 0, reverse.stderr);
      // Hashes from the official SRI-verified 1.19.17 archive, not a hand-built mock.
      const expected =
        format === 'cjs'
          ? 'a953e0ff0a1cc39668e2581b42a1c8a7243be917dabccababf22861a0569a53a'
          : 'ddafa28102abea3cf84b2fbc41e16465a32f54fd50addb8d2053cd9921280b4e';
      const runtime = path.join(baseline, 'dist/serve-static.' + (format === 'cjs' ? 'js' : 'mjs'));
      assert.equal(createHash('sha256').update(fs.readFileSync(runtime)).digest('hex'), expected);
      const original = await staticFor(format, baseline);
      const patched = await staticFor(format);
      try {
        for (const [label, serveStatic] of [
          ['baseline', original],
          ['candidate', patched],
        ]) {
          let auth = 0;
          let rewrites = 0;
          const rejected = [];
          const app = new Hono();
          app.use('/static/admin/*', (c) => {
            auth += 1;
            return c.text('denied', 401);
          });
          app.use(
            '/static/*',
            serveStatic({
              root: directory,
              rewriteRequestPath: (value) => {
                rewrites += 1;
                return value;
              },
              onNotFound: (value, c) => rejected.push([value, c.req.path]),
            }),
          );
          await withServer(app, async (port) => {
            for (const url of ['/static/admin/secret.txt', '/static/%61dmin/secret.txt'])
              assert.equal((await request(port, url)).status, 401);
            assert.equal(auth, 2);
            const options = await request(port, '/static/plain.txt', {
              method: 'OPTIONS',
              allowAbort: true,
            });
            assert.equal(options.status, 200);
            assert.equal(options.aborted, true);
            rewrites = 0;
            const result = await request(port, '/static/%%36%31dmin/secret.txt');
            assert.equal(result.status, label === 'baseline' ? 200 : 404);
            assert.equal(result.body === 'owned secret', label === 'baseline');
            assert.equal(auth, 2, 'crafted request missed prefix auth in both versions');
            assert.equal(rewrites, label === 'baseline' ? 1 : 0);
            assert.deepEqual(
              rejected,
              label === 'baseline'
                ? []
                : [['/static/%61dmin/secret.txt', '/static/%61dmin/secret.txt']],
            );
            console.log(
              JSON.stringify({
                format,
                variant: label,
                craftedStatus: result.status,
                authCalls: auth,
                rewrites,
              }),
            );
          });
        }
      } finally {
        removeDirectory(directory);
      }
    },
  );

  test(
    format + ' preserves normal files, Unicode/spaces, index, HEAD, range and precompression',
    async () => {
      const directory = fixtures();
      const serveStatic = await staticFor(format);
      const app = new Hono();
      app.use('/static/*', serveStatic({ root: directory, precompressed: true }));
      try {
        await withServer(app, async (port) => {
          for (const [url, body] of [
            ['/static/plain.txt', 'owned public text'],
            ['/static/hello%20world.txt', 'space'],
            ['/static/%E7%82%8E.txt', 'unicode'],
            ['/static/', 'index'],
          ]) {
            const res = await request(port, url);
            assert.equal(res.status, 200, url);
            assert.equal(res.body, body);
          }
          const head = await request(port, '/static/plain.txt', { method: 'HEAD' });
          assert.equal(head.body, '');
          assert.equal(head.headers['content-length'], '17');
          assert.equal(head.status, 200);
          const options = await request(port, '/static/plain.txt', {
            method: 'OPTIONS',
            allowAbort: true,
          });
          assert.equal(options.status, 200);
          assert.equal(options.body, '', 'retain current 1.x OPTIONS behavior');
          assert.equal(
            options.aborted,
            true,
            '1.x advertises a nonzero length but sends no OPTIONS body',
          );
          const range = await request(port, '/static/plain.txt', {
            headers: { Range: 'bytes=1-4' },
          });
          assert.equal(range.status, 206);
          assert.equal(range.body, 'wned');
          assert.equal(range.headers['content-range'], 'bytes 1-4/17');
          const zipped = await request(port, '/static/plain.txt', {
            headers: { 'Accept-Encoding': 'gzip' },
          });
          assert.equal(zipped.headers['content-encoding'], 'gzip');
          assert.equal(zipped.body, 'synthetic gzip bytes');
          assert.match(zipped.headers.vary, /Accept-Encoding/);
        });
        const custom = new Hono().use(
          '/static/*',
          serveStatic({ root: directory, index: 'custom.html' }),
        );
        await withServer(custom, async (port) =>
          assert.equal((await request(port, '/static/')).body, 'custom index'),
        );
      } finally {
        removeDirectory(directory);
      }
    },
  );

  test(
    format + ' skips percent/malformed paths before rewriting and continues through exact hooks',
    async () => {
      const directory = fixtures();
      const serveStatic = await staticFor(format);
      const rejected = [];
      let rewrites = 0;
      const app = new Hono().use(
        '/static/*',
        serveStatic({
          root: directory,
          rewriteRequestPath: (value) => {
            rewrites += 1;
            return value;
          },
          onNotFound: (value, c) => rejected.push([value, c.req.path]),
        }),
      );
      app.get('/static/*', (c) => c.text('next handler', 202));
      try {
        await withServer(app, async (port) => {
          for (const url of [
            '/static/100%25.txt',
            '/static/%2Fadmin/secret.txt',
            '/static/%FF.txt',
            '/static/%E0%A4%A',
            '/static/%',
            '/static/%5Cfoo',
            '/static//foo',
            '/static/%2e%2e%5Cfoo',
          ]) {
            const res = await request(port, url);
            assert.equal(res.status, 202, url);
            assert.equal(res.body, 'next handler');
          }
          assert.equal(rewrites, 0);
          assert.equal(rejected.length, 8);
          assert.ok(rejected.every(([value, context]) => value === context));
        });
      } finally {
        removeDirectory(directory);
      }
    },
  );

  test(
    format +
      ' retains safely authenticated percent opt-in and fixed paths without weakening validation',
    async () => {
      const directory = fixtures();
      const serveStatic = await staticFor(format);
      let authenticated = 0;
      const app = new Hono();
      app.use('/static/*', (c, next) => {
        authenticated += 1;
        return c.req.header('x-owned-access') === 'yes' ? next() : c.text('denied', 401);
      });
      app.use('/static/*', serveStatic({ root: directory, allowPercentInPath: true }));
      try {
        await withServer(app, async (port) => {
          assert.equal((await request(port, '/static/100%25.txt')).status, 401);
          assert.equal(
            (await request(port, '/static/100%25.txt', { headers: { 'x-owned-access': 'yes' } }))
              .body,
            'percent',
          );
          assert.equal(
            (
              await request(port, '/static/%2Fadmin/secret.txt', {
                headers: { 'x-owned-access': 'yes' },
              })
            ).body,
            'literal encoded directory',
          );
          for (const url of ['/static/%5Cfoo', '/static//foo', '/static/%2e%2e%5Cfoo'])
            assert.equal(
              (await request(port, url, { headers: { 'x-owned-access': 'yes' } })).status,
              404,
            );
          assert.equal(authenticated, 6);
        });
        const fixed = new Hono().use(
          '*',
          serveStatic({ root: directory, path: 'static/100%.txt' }),
        );
        await withServer(fixed, async (port) =>
          assert.equal((await request(port, '/arbitrary/%25')).body, 'percent'),
        );
      } finally {
        removeDirectory(directory);
      }
    },
  );

  test(
    format + ' preserves rewrite/found/not-found contexts and finalized middleware ordering',
    async () => {
      const directory = fixtures();
      const serveStatic = await staticFor(format);
      const found = [];
      const missing = [];
      const app = new Hono();
      app.use(
        '/assets/*',
        serveStatic({
          root: directory,
          rewriteRequestPath: (value, c) => {
            assert.equal(c.req.path, value);
            return value.replace('/assets/', '/static/');
          },
          onFound: (value, c) => found.push([value, c.req.path]),
          onNotFound: (value, c) => missing.push([value, c.req.path]),
        }),
      );
      try {
        await withServer(app, async (port) => {
          assert.equal((await request(port, '/assets/plain.txt')).body, 'owned public text');
          assert.equal((await request(port, '/assets/missing')).status, 404);
          assert.deepEqual(found, [
            [path.join(directory, 'static/plain.txt'), '/assets/plain.txt'],
          ]);
          assert.deepEqual(missing, [[path.join(directory, 'static/missing'), '/assets/missing']]);
        });
        const finalized = new Hono();
        let ran = 0;
        finalized.use('*', async (c, next) => {
          c.res = c.text('already final');
          await next();
        });
        finalized.use(
          '*',
          serveStatic({
            root: directory,
            onFound: () => {
              ran += 1;
            },
          }),
        );
        await withServer(finalized, async (port) =>
          assert.equal((await request(port, '/static/plain.txt')).body, 'already final'),
        );
        assert.equal(ran, 0);
      } finally {
        removeDirectory(directory);
      }
    },
  );

  test(
    format + ' disposes actual file streams after client cancellation and a read fault',
    async () => {
      const { syncBuiltinESMExports } = require('node:module');
      const directory = fixtures();
      const serveStatic = await staticFor(format);
      fs.writeFileSync(path.join(directory, 'static/large.txt'), Buffer.alloc(1024 * 1024, 'a'));
      const original = fs.createReadStream;
      const streams = [];
      let fault = false;
      fs.createReadStream = (filename, options) => {
        const stream = original(filename, { ...options, highWaterMark: 1024 });
        streams.push(stream);
        stream.on('error', () => {}); // Error is observed through the real response/cancellation below.
        if (fault)
          stream.once('open', () => stream.destroy(new Error('owned synthetic read fault')));
        return stream;
      };
      syncBuiltinESMExports();
      try {
        const app = new Hono().use('/static/*', serveStatic({ root: directory }));
        await withServer(app, async (port) => {
          await new Promise((resolve, reject) => {
            const req = require('node:http').get(
              { hostname: '127.0.0.1', port, path: '/static/large.txt', agent: false },
              (res) => {
                res.once('data', () => {
                  res.destroy();
                  req.destroy();
                  resolve();
                });
              },
            );
            req.on('error', reject);
            req.setTimeout(3000, () => req.destroy(new Error('cancel control deadline')));
          });
          const stream = streams[0];
          if (!stream.closed)
            await new Promise((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('file stream cancellation deadline')),
                3000,
              );
              stream.once('close', () => {
                clearTimeout(timer);
                resolve();
              });
            });
          assert.equal(stream.destroyed, true);
          assert.equal(
            stream.readableEnded,
            false,
            'client cancellation stops the actual source before EOF',
          );
          fault = true;
          const response = await request(port, '/static/plain.txt', { allowAbort: true });
          assert.ok(
            response.aborted || response.status >= 400,
            'read error must not deliver an intact successful file',
          );
          assert.notEqual(response.body, 'owned public text');
          assert.ok(streams.every((item) => item.destroyed));
          fault = false;
          assert.equal(
            (await request(port, '/static/plain.txt')).body,
            'owned public text',
            'read fault leaves server usable',
          );
        });
      } finally {
        fs.createReadStream = original;
        syncBuiltinESMExports();
        for (const stream of streams) stream.destroy();
        assert.ok(streams.every((stream) => stream.destroyed));
        removeDirectory(directory);
      }
    },
  );
}
