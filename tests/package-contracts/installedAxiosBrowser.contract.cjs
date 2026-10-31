// Explicit browser qualification; deliberately separate from the non-browser Jest/full gate.
const assert = require('node:assert/strict');
const http = require('node:http');
const { test, after } = require('node:test');
const { bundleFacade, expectedVersion, esbuild } = require('./installedAxiosSupport.cjs');
const engines = require('@playwright/test');
const candidate = expectedVersion === '0.34.0';
after(() => esbuild.stop());

for (const name of (process.env.AXIOS_BROWSER_ENGINES || 'chromium,firefox,webkit').split(',')) {
  test(
    `actual ${name} XHR generated Umi facade, app error branches, XSRF, wire and hook`,
    { timeout: 60000 },
    async () => {
      const { code, metafile } = await bundleFacade('browser');
      assert.ok(
        Object.keys(metafile.inputs).some((input) => input.endsWith('/axios/lib/adapters/xhr.js')),
      );
      assert.ok(
        !Object.keys(metafile.inputs).some((input) =>
          input.endsWith('/axios/lib/adapters/http.js'),
        ),
      );
      const servers = [];
      let browser;
      let context;
      const startServer = async () => {
        const server = http.createServer(async (req, res) => {
          const url = new URL(req.url, 'http://127.0.0.1');
          if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-XSRF-TOKEN,X-Owned');
          }
          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
          }
          if (url.pathname === '/') {
            res.setHeader('content-type', 'text/html');
            return res.end('<!doctype html><html><body><div id="hook"></div></body></html>');
          }
          if (url.pathname === '/bundle.js') {
            res.setHeader('content-type', 'text/javascript');
            return res.end(code);
          }
          if (url.pathname === '/network') return req.socket.destroy();
          if (url.pathname === '/timeout') return;
          if (url.pathname === '/status') {
            res.writeHead(418);
            return res.end('owned failure');
          }
          if (url.pathname === '/text') return res.end('{"owned":7}');
          if (url.pathname === '/hook') {
            res.setHeader('content-type', 'application/json');
            return res.end('{"success":true,"data":{"owned":7}}');
          }
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              url: req.url,
              body: Buffer.concat(chunks).toString(),
              headers: req.headers,
            }),
          );
        });
        await new Promise((resolve) => {
          server.listen(0, '127.0.0.1', resolve);
        });
        servers.push(server);
        return `http://127.0.0.1:${server.address().port}`;
      };
      try {
        const origin = await startServer();
        const cross = await startServer();
        browser = await engines[name].launch({ headless: true });
        context = await browser.newContext();
        await context.route('**/*', (route) => {
          const target = new URL(route.request().url());
          return target.origin === origin || target.origin === cross
            ? route.continue()
            : route.abort();
        });
        const fixturePage = await context.newPage();
        const errors = [];
        fixturePage.on('pageerror', (error) => errors.push(error.message));
        await fixturePage.goto(origin);
        await fixturePage.evaluate(() => {
          window.__fixture = { config: {}, feedback: [] };
          window.__fixture.ui = {
            message: {
              error: (value) => window.__fixture.feedback.push(value),
              warning: (value) => window.__fixture.feedback.push(value),
            },
            notification: { open: (value) => window.__fixture.feedback.push(value) },
          };
        });
        await fixturePage.addScriptTag({ url: origin + '/bundle.js' });
        const observed = await fixturePage.evaluate(
          async ({ origin, cross }) => {
            const { request, getRequestInstance } = window.installedFacade;
            document.cookie = 'XSRF-TOKEN=owned-xsrf; SameSite=Lax; Path=/';
            const same = await request(origin + '/echo');
            const anonymous = await request(cross + '/echo');
            const credentialed = await request(cross + '/echo', { withCredentials: true });
            const bodies = [];
            for (const data of [false, 0, ''])
              bodies.push((await request(origin + '/echo', { method: 'POST', data })).body);
            const json = await request(origin + '/echo', {
              method: 'POST',
              data: { owned: 7 },
              headers: { 'X-Owned': 'value' },
            });
            const params = await request(origin + '/echo#ignored', {
              params: { nested: { key: 'v' }, items: [1, 2] },
            });
            const custom = await request(origin + '/echo', {
              params: { owned: 7 },
              paramsSerializer: () => 'owned=custom',
            });
            const text = await request(origin + '/text', { responseType: 'text' });
            const blob = await request(origin + '/text', { responseType: 'blob' });
            const binary = await request(origin + '/text', { responseType: 'arraybuffer' });
            const formData = new FormData();
            formData.append('owned', 'value');
            let uploaded = 0;
            const multipart = await request(origin + '/echo', {
              method: 'POST',
              data: formData,
              onUploadProgress: () => uploaded++,
            });
            const abort = new AbortController();
            const pending = request(origin + '/timeout', { signal: abort.signal });
            abort.abort('owned abort');
            let cancellation;
            try {
              await pending;
            } catch (error) {
              cancellation = error.code;
            }
            let timeout;
            try {
              await request(origin + '/timeout', { timeout: 40 });
            } catch (error) {
              timeout = error.code;
            }
            let network;
            try {
              await request(origin + '/network');
            } catch (error) {
              network = {
                response: Boolean(error.response),
                request: Boolean(error.request),
                code: error.code,
              };
            }
            const count = [
              getRequestInstance().interceptors.request.handlers.filter(Boolean).length,
              getRequestInstance().interceptors.response.handlers.filter(Boolean).length,
            ];
            return {
              same,
              anonymous,
              credentialed,
              bodies,
              json,
              params,
              custom,
              text,
              blob: await blob.text(),
              binary: new TextDecoder().decode(binary),
              multipart,
              uploaded,
              cancellation,
              timeout,
              network,
              count,
            };
          },
          { origin, cross },
        );
        assert.equal(observed.same.headers['x-xsrf-token'], 'owned-xsrf');
        assert.equal(observed.anonymous.headers['x-xsrf-token'], undefined);
        assert.equal(observed.anonymous.headers.cookie, undefined);
        assert.equal(observed.credentialed.headers.cookie.includes('XSRF-TOKEN=owned-xsrf'), true);
        assert.equal(
          observed.credentialed.headers['x-xsrf-token'],
          candidate ? undefined : 'owned-xsrf',
        );
        assert.deepEqual(observed.bodies, candidate ? ['false', '0', ''] : ['', '', '']);
        assert.deepEqual(JSON.parse(observed.json.body), { owned: 7 });
        assert.equal(observed.json.headers['x-owned'], 'value');
        const query = new URL(observed.params.url, origin);
        assert.equal(
          query.searchParams.get(candidate ? 'nested[key]' : 'nested'),
          candidate ? 'v' : '{"key":"v"}',
        );
        assert.deepEqual(query.searchParams.getAll('items[]'), ['1', '2']);
        assert.equal(observed.custom.url, '/echo?owned=custom');
        assert.equal(typeof observed.text, candidate ? 'string' : 'object');
        assert.equal(observed.blob, '{"owned":7}');
        assert.equal(observed.binary, '{"owned":7}');
        assert.match(
          observed.multipart.headers['content-type'],
          /^multipart\/form-data; boundary=/,
        );
        assert.match(observed.multipart.body, /name="owned"\r\n\r\nvalue/);
        assert.ok(observed.uploaded > 0);
        assert.equal(observed.cancellation, 'ERR_CANCELED');
        assert.equal(observed.timeout, 'ECONNABORTED');
        assert.deepEqual(observed.network, {
          response: !candidate,
          request: true,
          code: 'ERR_NETWORK',
        });
        assert.deepEqual(observed.count, [0, 1]);
        await fixturePage.evaluate(
          ({ origin }) => {
            window.__hookDone = false;
            window.__unmountHook = window.installedFacade.mountRequest(
              document.getElementById('hook'),
              origin + '/hook',
              {},
              (state) => {
                if (state.data?.owned === 7) window.__hookDone = true;
              },
            );
          },
          { origin },
        );
        await fixturePage.waitForFunction(() => window.__hookDone === true);
        await fixturePage.evaluate(() => window.__unmountHook());
        // Fresh document/facade instance applies the actual app callbacks before lazy config initialization.
        await fixturePage.reload();
        await fixturePage.evaluate(() => {
          window.__fixture = { config: {}, feedback: [] };
          window.__fixture.ui = {
            message: { error: (value) => window.__fixture.feedback.push(value) },
          };
        });
        await fixturePage.addScriptTag({ url: origin + '/bundle.js' });
        const branches = await fixturePage.evaluate(
          async ({ origin }) => {
            Object.assign(window.__fixture.config, window.installedFacade.appErrorConfig);
            for (const route of ['/status', '/network', '/timeout']) {
              try {
                await window.installedFacade.request(origin + route, { timeout: 40 });
              } catch {}
            }
            return window.__fixture.feedback;
          },
          { origin },
        );
        assert.deepEqual(branches, [
          'component.request.responseStatus:418',
          candidate ? 'component.request.noResponse' : 'component.request.responseStatus:0',
          'component.request.noResponse',
        ]);
        assert.deepEqual(errors, []);
      } finally {
        const failures = [];
        if (context) {
          try {
            await context.close();
          } catch (error) {
            failures.push(error.message);
          }
        }
        if (browser) {
          try {
            await browser.close();
          } catch (error) {
            failures.push(error.message);
          }
        }
        for (const server of servers) {
          try {
            server.closeAllConnections();
            await new Promise((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            });
          } catch (error) {
            failures.push(error.message);
          }
        }
        const receipt = {
          cleanup: failures.length === 0,
          engine: name,
          browserClosed: Boolean(browser) && !browser.isConnected(),
          listenersClosed: servers.every((server) => !server.listening),
          persistentContext: false,
          failures,
        };
        console.log(JSON.stringify(receipt));
        assert.equal(receipt.browserClosed, true);
        assert.equal(receipt.listenersClosed, true);
        assert.deepEqual(failures, []);
      }
    },
  );
}
