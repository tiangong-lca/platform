import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, test } from 'node:test';
import { classifyProductionRequest } from '../../tests/e2e/i18n/production-request-guard.ts';
import server from './process-capture-server.cjs';

const processId = '11111111-1111-4111-8111-111111111111';
const sourceVersion = '01.00.000';
const publishableKey = 'fake-publishable-key';
const received = [];
let upstream, dev, runtime, captured;
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const close = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
function request(target, method = 'GET', body, headers = {}, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }),
        },
        ...(rawPath ? { path: rawPath } : {}),
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
            bodyBytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const apiHeaders = () => ({
  origin: runtime.appOrigin,
  'sec-fetch-dest': 'empty',
  apikey: publishableKey,
  'content-type': 'application/json',
  'accept-profile': 'public',
  'content-profile': 'api',
});
const captureBody = () =>
  JSON.stringify({
    id: processId,
    table: 'processes',
    sourceVersion,
    modelId: null,
    ruleVerification: false,
    jsonOrdered: {
      processDataSet: {
        processInformation: { dataSetInformation: { 'common:UUID': processId } },
        exchanges: { exchange: [{ '@internalId': '0', meanAmount: '1' }] },
      },
    },
  });
const captureTarget = () =>
  `${runtime.appOrigin}/functions/v1/app_dataset_create_version?forceFunctionRegion=us-east-1`;
beforeEach(async () => {
  received.length = 0;
  captured = [];
  upstream = http.createServer((req, res) => {
    received.push(`${req.method} ${req.url}`);
    if (req.url.includes('redirect')) {
      res.writeHead(307, { location: 'http://127.0.0.1:1/escape' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":[]}');
    }
  });
  dev = http.createServer((req, res) => {
    if (req.url === '/classifications/example.json.gz') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(gzipSync('{"labels":["synthetic"]}'));
      return;
    }
    res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html' : 'text/javascript' });
    res.end(req.url === '/' ? '<html>candidate</html>' : '/* local asset */');
  });
  runtime = await server.startProcessCaptureServers({
    upstreamOrigin: await listen(upstream),
    devOrigin: await listen(dev),
    publishableKey,
    processId,
    sourceVersion,
    classifyRequest: classifyProductionRequest,
    onCapture: async ({ body, sha256, summary }) => {
      assert.match(sha256, /^[a-f0-9]{64}$/);
      captured.push({ body, summary });
    },
  });
});
afterEach(async () => {
  await runtime?.close();
  await Promise.all([close(upstream), close(dev)]);
});

test('shell and embedded app enforce the two-origin sandbox/CSP contract', async () => {
  const shell = await request(`${runtime.parentOrigin}/`);
  assert.equal(shell.status, 200);
  assert.ok(shell.body.includes('sandbox="allow-scripts allow-same-origin allow-forms"'));
  assert.ok(!shell.body.includes('allow-popups'));
  assert.ok(shell.headers['content-security-policy'].includes(`frame-src ${runtime.appOrigin}`));
  const app = await request(`${runtime.appOrigin}/`, 'GET', undefined, {
    referer: `${runtime.parentOrigin}/`,
    'sec-fetch-dest': 'iframe',
  });
  assert.equal(app.status, 200);
  for (const value of [
    "connect-src 'self'",
    "frame-src 'none'",
    `frame-ancestors ${runtime.parentOrigin}`,
  ])
    assert.ok(app.headers['content-security-policy'].includes(value));
  assert.deepEqual(received, []);
});
for (const dest of ['document', 'empty', 'iframe'])
  test(`rejects app outside exact parent (${dest})`, async () => {
    assert.equal(
      (
        await request(`${runtime.appOrigin}/`, 'GET', undefined, {
          'sec-fetch-dest': dest,
          referer: 'http://127.0.0.1:1/',
        })
      ).status,
      403,
    );
    assert.deepEqual(received, []);
  });
test('preserves compressed local reference resources without backend forwarding', async () => {
  const result = await request(
    `${runtime.appOrigin}/classifications/example.json.gz`,
    'GET',
    undefined,
    { referer: `${runtime.appOrigin}/`, 'sec-fetch-dest': 'empty' },
  );
  assert.equal(result.status, 200);
  assert.equal(gunzipSync(result.bodyBytes).toString(), '{"labels":["synthetic"]}');
  assert.deepEqual(received, []);
});

for (const endpoint of [
  'lca_query_results',
  'lca_contribution_path_result',
  'lca_results',
  'lca_release_results',
  'data_product_results',
  'query_calculation_results',
  'query_calculation_status',
  'app_worker_jobs',
  'app_data_product_commands',
  'process_hybrid_search',
  'flow_hybrid_search',
  'source_hybrid_search',
])
  test(`capture profile never dispatches ${endpoint}, including a no-fallback result request`, async () => {
    const body = JSON.stringify({
      mode: 'process_all_impacts',
      process_id: processId,
      version: sourceVersion,
      allow_fallback: false,
      scope: 'full_library',
    });
    const result = await request(
      `${runtime.appOrigin}/functions/v1/${endpoint}?forceFunctionRegion=us-east-1`,
      'POST',
      body,
      { ...apiHeaders(), authorization: 'Bearer synthetic-user-session' },
    );
    assert.deepEqual(received, []);
    assert.equal(result.status, 403);
    assert.equal(runtime.summary().upstreamDispatches, 0);
  });

test('does not inherit worker/data-product list escapes or unrelated relation reads', async () => {
  for (const [endpoint, body] of [
    ['app_worker_jobs', { action: 'list', limit: 10 }],
    ['app_worker_jobs', { action: 'read', jobId: 'synthetic-job' }],
    [
      'app_data_product_commands',
      {
        action: 'list_task_feed',
        category: 'data_product',
        jobKinds: ['lcia.scope_closure_check', 'lcia_result.package_build'],
        limit: 200,
        rootOnly: false,
      },
    ],
  ])
    assert.equal(
      (
        await request(
          `${runtime.appOrigin}/functions/v1/${endpoint}`,
          'POST',
          JSON.stringify(body),
          apiHeaders(),
        )
      ).status,
      403,
    );
  assert.equal(
    (await request(`${runtime.appOrigin}/rest/v1/worker_jobs`, 'GET', undefined, apiHeaders()))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        `${runtime.appOrigin}/rest/v1/rpc/qry_review_get_admin_queue_items_v6`,
        'POST',
        '{}',
        apiHeaders(),
      )
    ).status,
    403,
  );
  assert.deepEqual(received, []);
});

test('refuses unqualified catalog and UUID-search RPCs', async () => {
  for (const rpc of [
    'query_dataset_catalog',
    'search_dataset_uuid_mentions_page',
    'search_dataset_json_uuid_mentions',
    'search_open_data_catalog',
  ]) {
    const result = await request(
      `${runtime.appOrigin}/rest/v1/rpc/${rpc}`,
      'POST',
      '{}',
      apiHeaders(),
    );
    assert.deepEqual(received, []);
    assert.equal(result.status, 403);
  }
});

test('requires the audited schema for relation and RPC reads', async () => {
  for (const profile of ['private', 'public', '']) {
    assert.equal(
      (
        await request(`${runtime.appOrigin}/rest/v1/rpc/qry_system_status`, 'POST', '{}', {
          ...apiHeaders(),
          'content-profile': profile,
        })
      ).status,
      403,
    );
  }
  for (const profile of ['private', 'api', '']) {
    assert.equal(
      (
        await request(`${runtime.appOrigin}/rest/v1/processes`, 'GET', undefined, {
          ...apiHeaders(),
          'accept-profile': profile,
        })
      ).status,
      403,
    );
  }
  assert.deepEqual(received, []);
});

test('admits the native authoring dataset and RPC read prerequisites', async () => {
  for (const relation of [
    'processes',
    'flows',
    'contacts',
    'sources',
    'unitgroups',
    'flowproperties',
    'lciamethods',
    'lifecyclemodels',
    'ilcd',
  ]) {
    const result = await request(
      `${runtime.appOrigin}/rest/v1/${relation}?select=id,version`,
      'GET',
      undefined,
      { ...apiHeaders(), 'accept-profile': 'public' },
    );
    assert.equal(result.status, 200, relation);
    assert.equal(received.at(-1), `GET /rest/v1/${relation}?select=id,version`);
  }
  for (const rpc of [
    'qry_system_status',
    'qry_identity_get_mine',
    'qry_membership_get_mine',
    'qry_review_get_my_contact_status',
    'qry_notification_get_my_data_count',
    'qry_notification_get_my_issue_count',
    'qry_notification_get_my_team_count',
    'get_latest_contact_versions',
    'get_latest_flow_versions',
    'get_latest_flowproperty_versions',
    'get_latest_lifecyclemodel_versions',
    'get_latest_process_versions',
    'get_latest_source_versions',
    'get_latest_unitgroup_versions',
    'search_contacts',
    'search_flowproperties',
    'search_flows',
    'search_lifecyclemodels',
    'search_processes',
    'search_sources',
    'search_unitgroups',
  ]) {
    const result = await request(`${runtime.appOrigin}/rest/v1/rpc/${rpc}`, 'POST', '{}', {
      ...apiHeaders(),
      'content-profile': 'api',
    });
    assert.equal(result.status, 200, rpc);
    assert.equal(received.at(-1), `POST /rest/v1/rpc/${rpc}`);
  }
  assert.equal(runtime.summary().readDispatches, received.length);
});

test('allows a native app reload inside the same constrained parent without opening top-level access', async () => {
  const result = await request(`${runtime.appOrigin}/`, 'GET', undefined, {
    referer: `${runtime.appOrigin}/`,
    'sec-fetch-dest': 'iframe',
  });
  assert.equal(result.status, 200);
  assert.ok(
    result.headers['content-security-policy'].includes(`frame-ancestors ${runtime.parentOrigin}`),
  );
  assert.equal(
    (
      await request(`${runtime.appOrigin}/`, 'GET', undefined, {
        referer: `${runtime.appOrigin}/`,
        'sec-fetch-dest': 'document',
      })
    ).status,
    403,
  );
  assert.deepEqual(received, []);
});

test('captures complete command once and aborts without upstream/success response', async () => {
  const body = captureBody();
  await assert.rejects(request(captureTarget(), 'POST', body, apiHeaders()));
  assert.equal(captured[0].body.toString(), body);
  assert.equal(runtime.state.captureCount, 1);
  assert.deepEqual(received, []);
  assert.equal((await request(captureTarget(), 'POST', body, apiHeaders())).status, 403);
  assert.equal(captured.length, 1);
  assert.equal(runtime.summary().captureHttpAttempts, 2);
  assert.equal(runtime.summary().duplicateCaptureRequests, 1);
  assert.equal(runtime.summary().businessMutationDispatches, 0);
  assert.deepEqual(
    runtime.summary().requestLedger.map((entry) => entry.disposition),
    ['capture-attempt', 'captured-without-dispatch', 'duplicate-rejected'],
  );
});
for (const [pathname, method] of [
  ['/functions/v1/app_dataset_save_draft', 'POST'],
  ['/functions/v1/app_dataset_create', 'POST'],
  ['/rest/v1/processes', 'POST'],
  ['/rest/v1/processes', 'PATCH'],
  ['/rest/v1/processes', 'DELETE'],
  ['/storage/v1/object/data/secret', 'PUT'],
  ['/rest/v1/rpc/cmd_dataset_write', 'POST'],
  ['/functions/v1/translate_text', 'POST'],
  ['/unreviewed', 'GET'],
  ['/api/write.json', 'GET'],
  ['/functions/v1/unknown_write', 'OPTIONS'],
  ['/functions%2fv1/app_dataset_create_version', 'POST'],
])
  test(`rejects ${method} ${pathname} without upstream`, async () => {
    assert.equal(
      (await request(`${runtime.appOrigin}${pathname}`, method, '{}', apiHeaders())).status,
      403,
    );
    assert.deepEqual(received, []);
    assert.deepEqual(captured, []);
  });
for (const [label, override, query] of [
  [
    'wrong identity',
    { id: '00000000-0000-0000-0000-000000000000' },
    '?forceFunctionRegion=us-east-1',
  ],
  ['wrong source', { sourceVersion: '01.01.001' }, '?forceFunctionRegion=us-east-1'],
  ['extra keys', { allocatedVersion: '01.01.001' }, '?forceFunctionRegion=us-east-1'],
  ['duplicate region', {}, '?forceFunctionRegion=us-east-1&forceFunctionRegion=us-east-1'],
])
  test(`rejects malformed capture: ${label}`, async () => {
    assert.equal(
      (
        await request(
          `${runtime.appOrigin}/functions/v1/app_dataset_create_version${query}`,
          'POST',
          JSON.stringify({ ...JSON.parse(captureBody()), ...override }),
          apiHeaders(),
        )
      ).status,
      403,
    );
    assert.deepEqual(received, []);
    assert.deepEqual(captured, []);
  });
test('forwards reviewed reads/native auth; metadata ledger contains no credentials, queries or bodies', async () => {
  assert.equal(
    (
      await request(
        `${runtime.appOrigin}/rest/v1/processes?id=eq.${processId}`,
        'GET',
        undefined,
        apiHeaders(),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${runtime.appOrigin}/auth/v1/token?grant_type=password`,
        'POST',
        JSON.stringify({
          email: 'fake@example.invalid',
          password: 'fake-secret',
          gotrue_meta_security: {},
        }),
        apiHeaders(),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${runtime.appOrigin}/auth/v1/token?grant_type=password`,
        'POST',
        JSON.stringify({ email: 'fake@example.invalid', password: 'fake', role: 'admin' }),
        apiHeaders(),
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`${runtime.appOrigin}/auth/v1/user`, 'PUT', '{}', apiHeaders())).status,
    403,
  );
  const report = runtime.summary();
  assert.equal(report.authDispatches, 1);
  assert.equal(report.readDispatches, 1);
  assert.equal(report.businessMutationDispatches, 0);
  assert.equal(report.upstreamDispatches, received.length);
  for (const entry of report.requestLedger)
    assert.deepEqual(Object.keys(entry).sort(), [
      'category',
      'disposition',
      'method',
      'sequence',
      'upstreamDispatch',
    ]);
  for (const value of ['fake-secret', processId, publishableKey, 'grant_type', 'jsonOrdered'])
    assert.ok(!JSON.stringify(report).includes(value));
  await assert.rejects(request(captureTarget(), 'POST', captureBody(), apiHeaders()));
  assert.equal(captured[0].summary.upstreamDispatches, 2);
  assert.equal(captured[0].summary.businessMutationDispatches, 0);
  assert.equal(received.length, 2);
});
test('does not follow upstream redirect', async () => {
  assert.equal(
    (
      await request(
        `${runtime.appOrigin}/rest/v1/processes?redirect=true`,
        'GET',
        undefined,
        apiHeaders(),
      )
    ).status,
    403,
  );
  assert.deepEqual(received, ['GET /rest/v1/processes?redirect=true']);
});
test('rejects missing metadata and wrong keys before forwarding', async () => {
  assert.equal((await request(`${runtime.appOrigin}/rest/v1/processes`, 'GET')).status, 403);
  assert.equal(
    (
      await request(`${runtime.appOrigin}/rest/v1/processes`, 'GET', undefined, {
        ...apiHeaders(),
        apikey: 'other',
      })
    ).status,
    403,
  );
  assert.deepEqual(received, []);
});
for (const rawPath of [
  'http://127.0.0.1:1/write',
  '//127.0.0.1:1/write',
  '/functions/v1/../v1/app_dataset_create_version?forceFunctionRegion=us-east-1',
  '/functions/v1/%2e%2e/v1/app_dataset_create_version?forceFunctionRegion=us-east-1',
  '/functions/v1/.%2e/v1/app_dataset_create_version?forceFunctionRegion=us-east-1',
  '/functions/v1/%2e./v1/app_dataset_create_version?forceFunctionRegion=us-east-1',
  '/functions/v1/app_dataset_create_version?forceFunctionRegion=us-east-1#discarded',
])
  test(`rejects canonicalization bypass ${rawPath}`, async () => {
    assert.equal(
      (await request(`${runtime.appOrigin}/`, 'POST', captureBody(), apiHeaders(), rawPath)).status,
      403,
    );
    assert.deepEqual(received, []);
    assert.deepEqual(captured, []);
  });
test('serves resources but rejects wrong referrer, tooling and HTML-as-script', async () => {
  const headers = { referer: `${runtime.appOrigin}/`, 'sec-fetch-dest': 'script' };
  assert.equal(
    (await request(`${runtime.appOrigin}/umi.js`, 'GET', undefined, headers)).status,
    200,
  );
  assert.equal(
    (
      await request(`${runtime.appOrigin}/umi.js`, 'GET', undefined, {
        ...headers,
        referer: 'http://127.0.0.1:1/',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`${runtime.appOrigin}/__open/file.js`, 'GET', undefined, headers)).status,
    403,
  );
  assert.equal((await request(`${runtime.appOrigin}/`, 'GET', undefined, headers)).status, 403);
  assert.deepEqual(received, []);
});
test('rejects top-level HTML with true parent referrer and unknown parent routes', async () => {
  assert.equal(
    (
      await request(`${runtime.appOrigin}/`, 'GET', undefined, {
        referer: `${runtime.parentOrigin}/`,
        'sec-fetch-dest': 'document',
      })
    ).status,
    403,
  );
  assert.equal((await request(`${runtime.parentOrigin}/other`)).status, 403);
  assert.equal((await request(`${runtime.parentOrigin}/`, 'POST', '{}')).status, 403);
});
test('persistence failure never forwards or permits retry', async () => {
  await runtime.close();
  runtime = await server.startProcessCaptureServers({
    upstreamOrigin: `http://127.0.0.1:${upstream.address().port}`,
    devOrigin: `http://127.0.0.1:${dev.address().port}`,
    publishableKey,
    processId,
    sourceVersion,
    classifyRequest: classifyProductionRequest,
    onCapture: async () => {
      throw new Error('Evidence unavailable');
    },
  });
  assert.equal((await request(captureTarget(), 'POST', captureBody(), apiHeaders())).status, 502);
  assert.equal((await request(captureTarget(), 'POST', captureBody(), apiHeaders())).status, 403);
  assert.equal(runtime.state.captureCount, 0);
  assert.equal(runtime.summary().captureHttpAttempts, 2);
  assert.equal(
    runtime
      .summary()
      .requestLedger.some((entry) => entry.disposition === 'captured-without-dispatch'),
    false,
  );
  assert.equal(
    runtime
      .summary()
      .requestLedger.some((entry) => entry.disposition === 'capture-persistence-failed'),
    true,
  );
  assert.deepEqual(received, []);
});

test('rejects plaintext remote authentication destinations before starting listeners', async () => {
  await assert.rejects(
    server.startProcessCaptureServers({
      upstreamOrigin: 'http://192.0.2.1',
      devOrigin: `http://127.0.0.1:${dev.address().port}`,
      publishableKey,
      processId,
      sourceVersion,
      classifyRequest: classifyProductionRequest,
      onCapture: async () => {},
    }),
    /Invalid capture origin/,
  );
  assert.deepEqual(received, []);
});
