const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const { test, after } = require('node:test');
const { axios, facade, esbuild } = require('./installedAxiosSupport.cjs');

const servers = new Set();
const streams = new Set();
const variants = [{ label: 'candidate', axios, create: facade }];
if (process.env.AXIOS_BASELINE_PACKAGE) {
  const directory = path.resolve(process.env.AXIOS_BASELINE_PACKAGE);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'axios');
  assert.equal(manifest.version, '0.27.2');
  const baseline = require(directory);
  variants.push({
    label: 'baseline',
    axios: baseline,
    create: async (config) => {
      const instance = baseline.create(config);
      return {
        getRequestInstance: () => instance,
        request: async (url, opts) => (await instance.request({ ...opts, url })).data,
      };
    },
  });
}

after(() => {
  esbuild.stop();
  assert.ok([...servers].every((server) => !server.listening));
  assert.ok([...streams].every((stream) => stream.destroyed));
  console.log(
    JSON.stringify({
      cleanup: true,
      suite: 'axios-followup',
      listenersCreated: servers.size,
      listenersClosed: servers.size,
      streamsDestroyed: streams.size,
      esbuildStopped: true,
    }),
  );
});

async function serve(handler, callback) {
  const server = http.createServer(handler);
  servers.add(server);
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
function containsCause(error, original) {
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    if (current === original) return true;
    seen.add(current);
    current = current.cause;
  }
  return false;
}
async function consume(stream) {
  streams.add(stream);
  try {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString();
  } finally {
    stream.destroy();
  }
}
const response = (config, data = 'owned') => ({
  data,
  config,
  status: 200,
  statusText: 'OK',
  headers: {},
  request: {},
});

for (const variant of variants) {
  const isCandidate = variant.label === 'candidate';
  test(`${variant.label}: real redirect hook receives response/request details, can mutate options and stop redirects`, async () => {
    const finalRequests = [];
    await serve(
      (req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { location: '/final', 'x-owned-redirect': 'present' });
          return res.end();
        }
        finalRequests.push({ path: req.url, header: req.headers['x-owned-mutated'] });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(finalRequests.at(-1)));
      },
      async (origin) => {
        const actual = await variant.create({ proxy: false });
        let hookCalls = 0;
        const result = await actual.request(origin + '/redirect', {
          beforeRedirect: function (options, { headers, statusCode }, requestDetails) {
            hookCalls++;
            assert.equal(arguments.length, 3);
            assert.equal(headers['x-owned-redirect'], 'present');
            assert.equal(statusCode, 302);
            assert.equal(requestDetails.url, origin + '/redirect');
            assert.equal(requestDetails.method, 'GET');
            assert.ok(requestDetails.headers);
            options.path = '/mutated';
            options.headers['X-Owned-Mutated'] = 'yes';
          },
        });
        assert.deepEqual(result, { path: '/mutated', header: 'yes' });
        assert.equal(hookCalls, 1);
        for (const original of [
          new Error('owned redirect stop'),
          new variant.axios.CanceledError('owned hook cancellation'),
        ]) {
          await assert.rejects(
            actual.request(origin + '/redirect', {
              beforeRedirect() {
                throw original;
              },
            }),
            (error) =>
              error.code === 'ERR_FR_REDIRECTION_FAILURE' && containsCause(error, original),
          );
        }
        assert.equal(finalRequests.length, 1, 'thrown hooks must prevent the redirected request');
        console.log(
          JSON.stringify({
            variant: variant.label,
            redirectArguments: 3,
            mutationApplied: true,
            thrownHooksPreventedDispatch: 2,
          }),
        );
      },
    );
  });

  test(`${variant.label}: returned download stream and native streamed upload obey configured small limits`, async () => {
    await serve(
      async (req, res) => {
        if (req.url === '/download') return res.end('123456789');
        if (req.url === '/small') return res.end('123');
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          res.end(Buffer.concat(chunks));
        } catch (error) {
          if (error.code !== 'ECONNRESET') throw error;
          res.destroy();
        }
      },
      async (origin) => {
        const actual = await variant.create({ proxy: false });
        assert.equal(
          await consume(
            await actual.request(origin + '/small', {
              responseType: 'stream',
              maxContentLength: 4,
            }),
          ),
          '123',
        );
        // The HTTP promise resolves a stream. Overflow belongs to that returned stream.
        const overflow = await actual.request(origin + '/download', {
          responseType: 'stream',
          maxContentLength: 4,
        });
        if (isCandidate)
          await assert.rejects(
            consume(overflow),
            (error) => error.code === 'ERR_BAD_RESPONSE' && /maxContentLength/.test(error.message),
          );
        else
          assert.equal(
            await consume(overflow),
            '123456789',
            'baseline ignored stream download limit',
          );
        const upload = async (body) => {
          const data = Readable.from([body]);
          streams.add(data);
          try {
            return await actual.request(origin + '/upload', {
              method: 'POST',
              data,
              maxRedirects: 0,
              maxBodyLength: 4,
              responseType: 'text',
            });
          } finally {
            data.destroy();
          }
        };
        assert.equal(await upload('abc'), 'abc');
        if (isCandidate)
          await assert.rejects(
            upload('abcdefghi'),
            (error) => error.code === 'ERR_BAD_REQUEST' && /maxBodyLength/.test(error.message),
          );
        else
          assert.equal(
            await upload('abcdefghi'),
            'abcdefghi',
            'baseline native upload ignored stream limit',
          );
        console.log(
          JSON.stringify({
            variant: variant.label,
            downloadOverflow: isCandidate ? 'stream-error' : 'baseline-bypass',
            nativeUploadOverflow: isCandidate ? 'request-error' : 'baseline-bypass',
            belowLimitControls: 2,
          }),
        );
      },
    );
  });

  test(`${variant.label}: public direct synchronous interceptors preserve rejection identity and bounded recovery dispatch`, async () => {
    const make = async () => {
      const state = { dispatches: 0, responseErrors: [] };
      const actual = await variant.create({
        proxy: false,
        adapter: async (config) => {
          state.dispatches++;
          return response(config, config.owned);
        },
      });
      const instance = actual.getRequestInstance();
      instance.interceptors.response.use(
        (res) => res,
        (error) => {
          state.responseErrors.push(error);
          return Promise.reject(error);
        },
      );
      return { state, instance };
    };
    const original = new Error('owned synchronous rejection');
    const replacement = new Error('owned rejected-handler rejection');
    {
      const { state, instance } = await make();
      instance.interceptors.request.use(
        (config) => ({ ...config, owned: 'fulfilled' }),
        undefined,
        { synchronous: true },
      );
      const promise = instance.request({ url: '/owned', owned: 'initial' });
      assert.equal(state.dispatches, 1, 'fulfilled synchronous handler dispatches immediately');
      assert.equal((await promise).data, 'fulfilled');
    }
    for (const onRejected of [
      undefined,
      () => {
        throw replacement;
      },
    ]) {
      const { state, instance } = await make();
      instance.interceptors.request.use(
        () => {
          throw original;
        },
        onRejected,
        { synchronous: true },
      );
      let promise;
      let synchronous;
      try {
        promise = instance.request({ url: '/owned' });
      } catch (error) {
        synchronous = error;
      }
      if (isCandidate) {
        assert.equal(synchronous, undefined);
        const expected = onRejected ? replacement : original;
        await assert.rejects(promise, (error) => error === expected);
        assert.deepEqual(state.responseErrors, [expected]);
      } else {
        if (onRejected) assert.equal(synchronous, replacement);
        else
          assert.ok(
            synchronous instanceof TypeError,
            'baseline called missing rejected handler synchronously',
          );
        assert.deepEqual(state.responseErrors, []);
      }
      assert.equal(state.dispatches, 0);
    }
    {
      const { state, instance } = await make();
      instance.interceptors.request.use(
        () => {
          throw original;
        },
        () => ({ owned: 'ignored recovery object' }),
        { synchronous: true },
      );
      assert.equal(
        (await instance.request({ url: '/owned', owned: 'original config' })).data,
        'original config',
        '0.x rejection callback return object does not replace the last valid config',
      );
      assert.equal(state.dispatches, 1);
    }
    for (const rejected of [false, true]) {
      const { state, instance } = await make();
      const gate = Promise.withResolvers();
      gate.promise.catch(() => {}); // Baseline ignores this returned promise; retain its rejection observation.
      instance.interceptors.request.use(
        () => {
          throw original;
        },
        () => gate.promise,
        { synchronous: true },
      );
      const outcome = instance.request({ url: '/owned', owned: 'last valid config' }).then(
        (res) => ({ res }),
        (error) => ({ error }),
      );
      assert.equal(
        state.dispatches,
        isCandidate ? 0 : 1,
        'candidate waits for promise recovery before dispatch',
      );
      if (rejected) gate.reject(replacement);
      else gate.resolve({ owned: 'ignored recovery value' });
      const result = await outcome;
      if (isCandidate && rejected) {
        assert.equal(result.error, replacement);
        assert.deepEqual(state.responseErrors, [replacement]);
        assert.equal(state.dispatches, 0);
      } else {
        assert.equal(result.res.data, 'last valid config');
        assert.equal(state.dispatches, 1);
        assert.deepEqual(state.responseErrors, []);
      }
    }
    if (isCandidate) {
      const { state, instance } = await make();
      instance.interceptors.request.use(
        () => {
          throw original;
        },
        undefined,
        { synchronous: true },
      );
      instance.interceptors.response.use(undefined, (error) => {
        assert.equal(error, original);
        return response({}, 'response recovery');
      });
      assert.equal((await instance.request({ url: '/owned' })).data, 'response recovery');
      assert.equal(state.dispatches, 0);
    }
    console.log(
      JSON.stringify({
        variant: variant.label,
        missingRejectedHandler: isCandidate
          ? 'original-promise-rejection'
          : 'synchronous-TypeError',
        throwingRejectedHandler: isCandidate
          ? 'replacement-promise-rejection'
          : 'synchronous-replacement',
        promiseRecoveryWaited: isCandidate,
        fulfilledControls: true,
      }),
    );
  });
}

test('candidate: proxy redirect setup still precedes the three-argument configured hook', async () => {
  let targetRequests = 0;
  await serve(
    (req, res) => {
      targetRequests++;
      res.end('unexpected direct request');
    },
    async (origin) => {
      const seen = [];
      await serve(
        (req, res) => {
          seen.push({ url: req.url, header: req.headers['x-owned-proxy-hook'] });
          if (req.url.endsWith('/redirect')) {
            res.writeHead(302, { location: origin + '/final', 'x-owned-proxy': 'present' });
            return res.end();
          }
          res.end('owned proxy redirect');
        },
        async (proxyURL) => {
          const proxy = new URL(proxyURL);
          const actual = await facade({
            proxy: { protocol: 'http', host: proxy.hostname, port: Number(proxy.port) },
          });
          let calls = 0;
          const result = await actual.request(origin + '/redirect', {
            beforeRedirect: function (options, { headers }, requestDetails) {
              calls++;
              assert.equal(arguments.length, 3);
              assert.equal(headers['x-owned-proxy'], 'present');
              assert.equal(requestDetails.url, origin + '/redirect');
              assert.equal(options.hostname, proxy.hostname);
              assert.equal(Number(options.port), Number(proxy.port));
              assert.equal(
                options.path,
                origin + '/final',
                'proxy rewrite must run before caller hook',
              );
              options.headers['X-Owned-Proxy-Hook'] = 'yes';
            },
          });
          assert.equal(result, 'owned proxy redirect');
          assert.equal(calls, 1);
          assert.deepEqual(seen, [
            { url: origin + '/redirect', header: undefined },
            { url: origin + '/final', header: 'yes' },
          ]);
          assert.equal(targetRequests, 0);
        },
      );
    },
  );
});

function credentialHeaders(req) {
  return {
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
    proxyAuthorization: req.headers['proxy-authorization'],
  };
}

for (const variant of variants) {
  const isCandidate = variant.label === 'candidate';
  const destinationHeaders = {
    Authorization: 'Bearer owned-dummy-authorization',
    Cookie: 'owned_dummy_cookie=value',
  };
  const expectedDestination = {
    authorization: destinationHeaders.Authorization,
    cookie: destinationHeaders.Cookie,
    proxyAuthorization: undefined,
  };

  test(`${variant.label}: same-origin redirect retains dummy destination headers and changed-origin redirect strips them`, async () => {
    const primary = [];
    const changed = [];
    await serve(
      (req, res) => {
        changed.push(credentialHeaders(req));
        res.end('owned changed-origin target');
      },
      async (otherOrigin) => {
        await serve(
          (req, res) => {
            primary.push({ path: req.url, ...credentialHeaders(req) });
            if (req.url === '/same') {
              res.writeHead(302, { location: '/final' });
              return res.end();
            }
            if (req.url === '/changed') {
              res.writeHead(302, { location: otherOrigin + '/final' });
              return res.end();
            }
            res.end('owned same-origin target');
          },
          async (origin) => {
            const actual = await variant.create({ proxy: false });
            assert.equal(
              await actual.request(origin + '/same', { headers: destinationHeaders }),
              'owned same-origin target',
            );
            assert.equal(
              await actual.request(origin + '/changed', { headers: destinationHeaders }),
              'owned changed-origin target',
            );
            assert.deepEqual(primary, [
              { path: '/same', ...expectedDestination },
              { path: '/final', ...expectedDestination },
              { path: '/changed', ...expectedDestination },
            ]);
            assert.deepEqual(changed, [
              { authorization: undefined, cookie: undefined, proxyAuthorization: undefined },
            ]);
            console.log(
              JSON.stringify({
                variant: variant.label,
                sameOriginDestinationHeadersRetained: true,
                changedOriginDestinationHeadersStripped: true,
              }),
            );
          },
        );
      },
    );
  });

  test(`${variant.label}: explicit proxy receives its dummy authentication and direct target excludes proxy-only headers`, async () => {
    const proxyRequests = [];
    const directRequests = [];
    const dummyProxyAuth = { username: 'owned-explicit-proxy', password: 'owned-dummy-password' };
    const expectedProxyAuth =
      'Basic ' +
      Buffer.from(dummyProxyAuth.username + ':' + dummyProxyAuth.password).toString('base64');
    const suppliedProxyHeader = 'Basic owned-dummy-stale-proxy-header';
    await serve(
      (req, res) => {
        directRequests.push(credentialHeaders(req));
        res.end('owned direct target');
      },
      async (origin) => {
        await serve(
          (req, res) => {
            proxyRequests.push({ url: req.url, ...credentialHeaders(req) });
            res.end('owned explicit proxy');
          },
          async (proxyURL) => {
            const proxy = new URL(proxyURL);
            const actual = await variant.create({
              proxy: {
                host: proxy.hostname,
                port: Number(proxy.port),
                protocol: 'http',
                auth: dummyProxyAuth,
              },
            });
            assert.equal(
              await actual.request(origin + '/explicit', {
                headers: { ...destinationHeaders, 'Proxy-Authorization': suppliedProxyHeader },
              }),
              'owned explicit proxy',
            );
            assert.deepEqual(proxyRequests, [
              {
                url: origin + '/explicit',
                ...expectedDestination,
                proxyAuthorization: expectedProxyAuth,
              },
            ]);
            assert.equal(
              await actual.request(origin + '/direct', {
                proxy: false,
                headers: { ...destinationHeaders, 'pRoXy-aUtHoRiZaTiOn': suppliedProxyHeader },
              }),
              'owned direct target',
            );
            assert.deepEqual(
              directRequests,
              [
                {
                  ...expectedDestination,
                  proxyAuthorization: isCandidate ? undefined : suppliedProxyHeader,
                },
              ],
              'candidate removes supplied proxy-only headers case-insensitively when proxy:false; baseline forwarded them',
            );
            assert.equal(proxyRequests.length, 1);
            console.log(
              JSON.stringify({
                variant: variant.label,
                explicitProxyAuthentication: 'intended-proxy-only',
                directTargetProxyAuthorization: isCandidate
                  ? 'stripped'
                  : 'baseline-forwarded-supplied-header',
              }),
            );
          },
        );
      },
    );
  });

  test(`${variant.label}: ENV proxy authentication stays at proxy across same-origin no_proxy transition`, async () => {
    // Read precedence from installed proxy-from-env; isolate every HTTP(S), generic
    // proxy and bypass variable it can read before enabling this owned fixture.
    const names = [
      'http_proxy',
      'https_proxy',
      'all_proxy',
      'no_proxy',
      'npm_config_http_proxy',
      'npm_config_https_proxy',
      'npm_config_proxy',
      'npm_config_no_proxy',
    ].flatMap((name) => [name, name.toUpperCase()]);
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const proxyRequests = [];
    const directRequests = [];
    const expectedProxyAuth =
      'Basic ' + Buffer.from('owned-env-proxy:owned-dummy-password').toString('base64');
    try {
      names.forEach((name) => delete process.env[name]);
      await serve(
        (req, res) => {
          directRequests.push({ path: req.url, ...credentialHeaders(req) });
          res.end('owned bypass target');
        },
        async (origin) => {
          await serve(
            (req, res) => {
              proxyRequests.push({ url: req.url, ...credentialHeaders(req) });
              const target = new URL(req.url);
              if (target.pathname === '/stay') {
                res.writeHead(302, { location: origin + '/stay-final' });
                return res.end();
              }
              if (target.pathname === '/transition') {
                // Simulate a legitimate process configuration change while handling
                // this owned response. Same-origin redirects retain headers in
                // follow-redirects, so Axios must clear proxy auth before bypass.
                process.env.no_proxy = '127.0.0.1';
                res.writeHead(302, { location: origin + '/final' });
                return res.end();
              }
              res.end('owned ENV proxy');
            },
            async (proxyURL) => {
              const proxy = new URL(proxyURL);
              proxy.username = 'owned-env-proxy';
              proxy.password = 'owned-dummy-password';
              process.env.http_proxy = proxy.href;
              const actual = await variant.create({});
              assert.equal(
                await actual.request(origin + '/stay', { headers: destinationHeaders }),
                'owned ENV proxy',
              );
              assert.deepEqual(proxyRequests, [
                {
                  url: origin + '/stay',
                  ...expectedDestination,
                  proxyAuthorization: expectedProxyAuth,
                },
                {
                  url: origin + '/stay-final',
                  ...expectedDestination,
                  proxyAuthorization: expectedProxyAuth,
                },
              ]);
              assert.deepEqual(directRequests, []);
              proxyRequests.length = 0;
              const result = await actual.request(origin + '/transition', {
                headers: destinationHeaders,
              });
              assert.equal(result, isCandidate ? 'owned bypass target' : 'owned ENV proxy');
              assert.deepEqual(proxyRequests, [
                {
                  url: origin + '/transition',
                  ...expectedDestination,
                  proxyAuthorization: expectedProxyAuth,
                },
                ...(isCandidate
                  ? []
                  : [
                      {
                        url: origin + '/final',
                        ...expectedDestination,
                        proxyAuthorization: expectedProxyAuth,
                      },
                    ]),
              ]);
              assert.deepEqual(
                directRequests,
                isCandidate ? [{ path: '/final', ...expectedDestination }] : [],
                'same-origin direct request retains destination credentials but contains no Proxy-Authorization',
              );
              console.log(
                JSON.stringify({
                  variant: variant.label,
                  envProxyAuthentication: 'intended-proxy-only',
                  sameOriginProxyPositiveControl: true,
                  noProxyRedirectTransition: isCandidate
                    ? 'reevaluated-and-proxy-header-stripped'
                    : 'baseline-kept-original-proxy',
                }),
              );
            },
          );
        },
      );
    } finally {
      for (const name of names) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
      assert.deepEqual(
        Object.fromEntries(names.map((name) => [name, process.env[name]])),
        saved,
        'restore all proxy environment values, including absence',
      );
    }
  });
}
