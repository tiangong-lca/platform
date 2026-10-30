const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { test, after } = require('node:test');
const {
  repositoryRoot,
  plugins,
  axiosPackage,
  axios,
  umi,
  generatedPath,
  expectedVersion,
  esbuild,
  facade,
  activeInterceptors,
} = require('./installedAxiosSupport.cjs');

const candidate = expectedVersion === '0.34.0';
const ownedServers = new Set();
const ownedTypeFixtures = new Set();
after(() => {
  esbuild.stop();
  assert.ok([...ownedServers].every((server) => !server.listening));
  assert.ok([...ownedTypeFixtures].every((directory) => !fs.existsSync(directory)));
  console.log(
    JSON.stringify({
      cleanup: true,
      suite: 'node',
      listenersCreated: ownedServers.size,
      listenersClosed: ownedServers.size,
      temporaryTypeFixturesRemoved: ownedTypeFixtures.size,
      esbuildStopped: true,
    }),
  );
});
const response = (config, data = { success: true, value: 7 }) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: { 'x-fixture': 'yes' },
  config,
  request: { owned: true },
});

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  ownedServers.add(server);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    assert.equal(server.listening, false);
  }
}

test('binds the exact installed Umi parent, generated facade and native CJS/ESM exports', async () => {
  assert.equal(plugins.manifest.version, '4.7.24');
  assert.equal(axiosPackage.manifest.version, expectedVersion);
  assert.equal(axios.VERSION, expectedVersion);
  const generated = fs.readFileSync(generatedPath, 'utf8');
  const imported = generated.match(/from '([^']+\/axios)'/)[1];
  assert.equal(fs.realpathSync(imported), axiosPackage.directory);
  assert.equal(
    fs.realpathSync(path.join(imported, axiosPackage.manifest.types)),
    fs.realpathSync(path.join(axiosPackage.directory, 'index.d.ts')),
  );
  assert.equal(axiosPackage.manifest.browser['./lib/adapters/http.js'], './lib/adapters/xhr.js');
  const esm = await import(pathToFileURL(axiosPackage.entry).href);
  assert.equal(esm.default, axios);
  assert.equal(esm.default.default, axios);
  const closure = axiosPackage.require;
  assert.equal(closure('form-data/package.json').version, '4.0.6');
  assert.equal(closure('follow-redirects/package.json').version, '1.16.2');
  if (candidate) assert.equal(closure('proxy-from-env/package.json').version, '1.1.0');
  assert.match(
    fs.readFileSync(path.join(repositoryRoot, 'src/app.tsx'), 'utf8'),
    /export const request[^=]*=\s*\{\s*\.\.\.errorConfig/,
  );
  const actual = await facade();
  assert.equal(typeof actual.useRequest, 'function');
  assert.ok(actual.UseRequestProvider.$$typeof, 'actual React context provider is exported');
  assert.equal(actual.getRequestInstance(), actual.getRequestInstance());
});

test('generated facade runs real runtime config, tuple/url options, LIFO/FIFO callbacks and ejection', async () => {
  const order = [];
  let calls = 0;
  const actual = await facade({
    adapter: async (config) => {
      calls++;
      order.push('adapter');
      assert.equal(config.headers['x-own'], 'kept');
      assert.equal(config.owned, 9);
      return response(config);
    },
    requestInterceptors: [
      [
        (config) => {
          order.push('global-one');
          return config;
        },
      ],
      async (url, options) => {
        order.push('global-two');
        return { url, options };
      },
    ],
    responseInterceptors: [
      (res) => {
        order.push('global-response');
        return res;
      },
    ],
  });
  const instance = actual.getRequestInstance();
  const counts = activeInterceptors(instance);
  const data = await actual.request('/owned', {
    headers: { 'x-own': 'kept' },
    owned: 9,
    requestInterceptors: [
      [
        async (url, options) => {
          order.push('call-request');
          return { url, options };
        },
      ],
    ],
    responseInterceptors: [
      [
        (res) => {
          order.push('call-response');
          return res;
        },
      ],
    ],
  });
  assert.deepEqual(data, { success: true, value: 7 });
  assert.deepEqual(order, [
    'call-request',
    'global-two',
    'global-one',
    'adapter',
    'global-response',
    'call-response',
  ]);
  assert.deepEqual(activeInterceptors(instance), counts);
  order.length = 0;
  const full = await actual.request('/owned', {
    getResponse: true,
    headers: { 'x-own': 'kept' },
    owned: 9,
  });
  assert.equal(full.status, 200);
  assert.equal(full.headers['x-fixture'], 'yes');
  assert.equal(calls, 2);
  assert.deepEqual(order, ['global-two', 'global-one', 'adapter', 'global-response']);
});

test('actual app callbacks preserve URL transformation, business error feedback and skip behavior', async () => {
  const actual = await facade();
  let data = { success: true, value: 7 };
  Object.assign(actual.fixture.config, actual.appErrorConfig, {
    adapter: async (config) => {
      assert.equal(config.url, '/owned?token = 123');
      return response(config, data);
    },
  });
  assert.deepEqual(await actual.request('/owned'), data);
  for (const [showType, kind] of [
    [0, null],
    [1, 'warning'],
    [2, 'error'],
    [3, 'notification'],
    [9, null],
    [999, 'error'],
  ]) {
    actual.feedback.length = 0;
    data = { success: false, errorMessage: 'owned failure', errorCode: 'OWNED', showType };
    await assert.rejects(
      actual.request('/owned'),
      (error) => error.name === 'BizError' && error.info?.errorCode === 'OWNED',
    );
    assert.deepEqual(actual.feedback[0], ['error', 'component.request.failed']);
    assert.equal(actual.feedback.length, kind ? 2 : 1);
    if (kind) assert.equal(actual.feedback[1][0], kind);
  }
  actual.feedback.length = 0;
  await assert.rejects(actual.request('/owned', { skipErrorHandler: true }), { name: 'BizError' });
  assert.deepEqual(actual.feedback, [['error', 'component.request.failed']]);
});

test('errors retain identity through handler/recovery/throw paths and all call interceptors eject', async () => {
  const original = new Error('owned setup failure');
  const replacement = new Error('handler failure');
  let seen;
  const actual = await facade({
    adapter: async () => {
      throw original;
    },
    errorConfig: {
      errorHandler(error) {
        seen = error;
      },
    },
  });
  const instance = actual.getRequestInstance();
  const counts = activeInterceptors(instance);
  await assert.rejects(
    actual.request('/owned', {
      requestInterceptors: [(config) => config],
      responseInterceptors: [(res) => res],
    }),
    (error) => error === original,
  );
  assert.equal(seen, original);
  assert.deepEqual(activeInterceptors(instance), counts);
  actual.fixture.config.errorConfig.errorHandler = () => {
    throw replacement;
  };
  await assert.rejects(actual.request('/owned'), (error) => error === replacement);
  actual.fixture.config.errorConfig.errorHandler = () => {};
  const recovered = await actual.request('/owned', {
    responseInterceptors: [[(res) => res, () => response({}, { recovered: true })]],
  });
  assert.deepEqual(recovered, { recovered: true });
  await assert.rejects(
    actual.request('/owned', {
      requestInterceptors: [
        () => {
          throw original;
        },
      ],
    }),
    (error) => error === original,
  );
  assert.deepEqual(activeInterceptors(instance), counts);
});

test('overlapping call registrations reproduce existing shared-instance behavior and finish cleanly', async () => {
  const actual = await facade({ adapter: async (config) => response(config, { url: config.url }) });
  const counts = activeInterceptors(actual.getRequestInstance());
  const calls = [];
  const first = actual.request('/first', {
    requestInterceptors: [
      (config) => {
        calls.push(['first', config.url]);
        return config;
      },
    ],
  });
  const second = actual.request('/second', {
    requestInterceptors: [
      (config) => {
        calls.push(['second', config.url]);
        return config;
      },
    ],
  });
  await Promise.all([first, second]);
  assert.deepEqual(calls, [
    ['first', '/first'],
    ['second', '/second'],
    ['first', '/second'],
  ]);
  assert.deepEqual(activeInterceptors(actual.getRequestInstance()), counts);
  calls.length = 0;
  await actual.request('/after');
  assert.deepEqual(calls, []);
});

test('CancelToken and AbortSignal use the installed cancellation path and clean temporary handlers', async () => {
  let dispatches = 0;
  let observed;
  const actual = await facade({
    adapter: async (config) => {
      dispatches++;
      return response(config);
    },
    responseInterceptors: [
      [
        (res) => res,
        (error) => {
          observed = error;
          return Promise.reject(error);
        },
      ],
    ],
  });
  const counts = activeInterceptors(actual.getRequestInstance());
  const source = axios.CancelToken.source();
  source.cancel('owned cancel');
  await assert.rejects(
    actual.request('/owned', { cancelToken: source.token, responseInterceptors: [(res) => res] }),
    (error) => axios.isCancel(error) && error.message === 'owned cancel',
  );
  const controller = new AbortController();
  controller.abort('owned signal');
  await assert.rejects(actual.request('/owned', { signal: controller.signal }), (error) =>
    axios.isCancel(error),
  );
  assert.equal(dispatches, 0);
  assert.equal(
    Boolean(observed),
    candidate,
    'upstream correction: pre-aborted dispatch reaches response interceptors',
  );
  assert.deepEqual(activeInterceptors(actual.getRequestInstance()), counts);
});

test('own config/header values and installed error serialization retain ordinary supported semantics', async () => {
  const actual = await facade({
    adapter: async (config) =>
      response(config, { timeout: config.timeout, headers: config.headers }),
  });
  const own = await actual.request('/owned', { timeout: 17, headers: { 'X-Owned': 'yes' } });
  assert.equal(own.timeout, 17);
  assert.equal(own.headers['X-Owned'], 'yes');
  const inherited = Object.create({ timeout: 29 });
  inherited.url = '/owned';
  const direct = await actual.getRequestInstance().request(inherited);
  assert.equal(direct.data.timeout, candidate ? 0 : 29, 'upstream own-property config correction');
  const error = new axios.AxiosError('owned error', 'ERR_BAD_REQUEST', {
    headers: { Authorization: 'synthetic-fixture-value' },
    owned: 7,
  });
  assert.equal(axios.isAxiosError(error), true);
  assert.equal(error.toJSON().config.owned, 7);
  assert.equal(
    error.toJSON().config.headers.Authorization,
    candidate ? '[REDACTED ****]' : 'synthetic-fixture-value',
  );
  assert.equal(
    error.config.headers.Authorization,
    'synthetic-fixture-value',
    'serialization does not mutate live config',
  );
});

test('real Node transport covers JSON, text, forms, streams, gzip, params, errors, limits and aborts', async () => {
  await withServer(
    async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      if (req.url.startsWith('/timeout')) return;
      if (req.url.startsWith('/status')) {
        res.writeHead(418, { 'content-type': 'application/json' });
        return res.end('{"owned":true}');
      }
      if (req.url.startsWith('/malformed')) return res.end('{invalid json');
      if (req.url.startsWith('/text')) return res.end('{"value":7}');
      if (req.url.startsWith('/gzip')) {
        res.writeHead(200, { 'content-encoding': 'gzip' });
        return res.end(gzipSync('owned gzip'));
      }
      if (req.url.startsWith('/large')) return res.end('123456789');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ url: req.url, body, headers: req.headers }));
    },
    async (baseURL) => {
      const actual = await facade({ baseURL, proxy: false });
      const json = await actual.request('/echo', { method: 'POST', data: { owned: 7 } });
      assert.deepEqual(JSON.parse(json.body), { owned: 7 });
      assert.match(json.headers['content-type'], /application\/json/);
      const params = await actual.request('/echo#fragment', {
        params: { array: [1, 2], nested: { key: 'v' }, missing: null },
      });
      const parsed = new URL(params.url, baseURL);
      assert.deepEqual(parsed.searchParams.getAll('array[]'), ['1', '2']);
      assert.equal(
        parsed.searchParams.get(candidate ? 'nested[key]' : 'nested'),
        candidate ? 'v' : '{"key":"v"}',
      );
      assert.equal(parsed.searchParams.has('missing'), false);
      assert.equal(parsed.hash, '');
      assert.equal(
        (
          await actual.request('/echo', {
            params: { q: 7 },
            paramsSerializer: () => 'owned=custom',
          })
        ).url,
        '/echo?owned=custom',
      );
      if (candidate)
        assert.equal(
          (
            await actual.request('/echo', {
              params: { q: 7 },
              paramsSerializer: { serialize: () => 'owned=object' },
            })
          ).url,
          '/echo?owned=object',
        );
      assert.equal(
        typeof (await actual.request('/text', { responseType: 'text' })),
        candidate ? 'string' : 'object',
        'explicit text no longer receives forced JSON parsing',
      );
      assert.equal(
        (await actual.request('/text', { responseType: 'arraybuffer' })).toString(),
        '{"value":7}',
      );
      await assert.rejects(
        actual.request('/malformed', {
          responseType: 'json',
          transitional: { silentJSONParsing: false },
        }),
        (error) => error.name === 'SyntaxError' && axios.isAxiosError(error),
      );
      const form = await actual.request('/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: { field: 'a b' },
      });
      assert.equal(form.body, candidate ? 'field=a+b' : '{"field":"a b"}');
      const FormData = axiosPackage.require('form-data');
      const multipart = new FormData();
      multipart.append('owned', 'value');
      const upload = await actual.request('/echo', {
        method: 'POST',
        data: multipart,
        headers: multipart.getHeaders(),
      });
      assert.match(upload.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.match(upload.body, /name="owned"\r\n\r\nvalue/);
      const stream = await actual.request('/echo', {
        method: 'POST',
        data: Readable.from(['owned stream']),
        headers: { 'content-type': 'text/plain' },
      });
      assert.equal(stream.body, 'owned stream');
      assert.equal(await actual.request('/gzip'), 'owned gzip');
      await assert.rejects(actual.request('/large', { maxContentLength: 4 }), /maxContentLength/);
      await assert.rejects(
        actual.request('/echo', { method: 'POST', data: '123456789', maxBodyLength: 4 }),
        /maxBodyLength|larger than/,
      );
      await assert.rejects(
        actual.request('/echo', {
          method: 'POST',
          data: Readable.from(['123456789']),
          maxBodyLength: 4,
        }),
        /maxBodyLength|larger than/,
      );
      await assert.rejects(
        actual.request('/status'),
        (error) =>
          axios.isAxiosError(error) && error.response.status === 418 && Boolean(error.request),
      );
      await assert.rejects(
        actual.request('/timeout', { timeout: 40 }),
        (error) => error.code === 'ECONNABORTED',
      );
      const controller = new AbortController();
      const aborted = actual.request('/timeout', { signal: controller.signal });
      setImmediate(() => controller.abort('owned abort'));
      await assert.rejects(aborted, (error) => axios.isCancel(error));
    },
  );
});

test('real Node proxy environment, no_proxy and ordinary redirects use owned listeners only', async () => {
  let proxyCalls = 0;
  await withServer(
    (req, res) => {
      proxyCalls++;
      res.end('owned proxy');
    },
    async (proxyURL) => {
      await withServer(
        (req, res) => {
          if (req.url === '/redirect') {
            res.writeHead(302, { location: '/final' });
            return res.end();
          }
          res.end('owned direct');
        },
        async (baseURL) => {
          const names = [
            'http_proxy',
            'HTTP_PROXY',
            'https_proxy',
            'HTTPS_PROXY',
            'all_proxy',
            'ALL_PROXY',
            'no_proxy',
            'NO_PROXY',
          ];
          const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
          try {
            names.forEach((name) => delete process.env[name]);
            process.env.http_proxy = proxyURL;
            const actual = await facade();
            assert.equal(await actual.request(baseURL + '/echo'), 'owned proxy');
            process.env.no_proxy = '127.0.0.1';
            assert.equal(await actual.request(baseURL + '/redirect'), 'owned direct');
            assert.equal(proxyCalls, 1);
          } finally {
            for (const name of names) {
              if (saved[name] === undefined) delete process.env[name];
              else process.env[name] = saved[name];
            }
          }
        },
      );
    },
  );
});

test('native TypeScript 7 compiles representative consumers of generated public request declarations', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform1372-axios-types-'));
  ownedTypeFixtures.add(directory);
  try {
    const fixture = path.join(directory, 'consumer.ts');
    fs.writeFileSync(
      fixture,
      `import {request, getRequestInstance} from ${JSON.stringify(path.join(path.dirname(generatedPath), 'index'))};
      import type {RequestConfig, RequestOptions, AxiosResponse, AxiosError} from ${JSON.stringify(path.join(path.dirname(generatedPath), 'types.d'))};
      const config: RequestConfig = {headers: {'X-Owned':'yes'}, paramsSerializer: (params) => 'owned=' + params.owned, transformRequest: [(data, headers) => { if(headers) headers['X-Transform']='yes'; return data; }]};
      const options: RequestOptions = {signal: new AbortController().signal, skipErrorHandler:true, ...config};
      const data: Promise<{owned:number}> = request<{owned:number}>('/owned', options);
      const response: Promise<AxiosResponse<{owned:number}>> = request<{owned:number}>('/owned', {getResponse:true});
      const instance = getRequestInstance(); instance.get<{owned:number}>('/owned');
      function classify(error: AxiosError) { return error.response?.status ?? error.code; }
      // @ts-expect-error a full response cannot be assigned to data-only result
      const invalid: Promise<{owned:number}> = request<{owned:number}>('/owned', {getResponse:true});
      void [data,response,classify,invalid];`,
    );
    fs.writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'esnext',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          noEmit: true,
          types: ['node'],
          typeRoots: [path.join(repositoryRoot, 'node_modules/@types')],
          paths: { umi: [path.join(umi.directory, 'client/client/plugin.d.ts')] },
        },
        files: [fixture],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
        '-p',
        path.join(directory, 'tsconfig.json'),
      ],
      { encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    assert.equal(fs.existsSync(directory), false);
  }
});
