'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const CAPTURE_PATH = '/functions/v1/app_dataset_create_version';
const API_PATH = /^\/(?:auth|rest|functions|storage|graphql|realtime)\/v\d+(?:\/|$)/u;
// This authoring diagnostic deliberately admits less than the general E2E guard.
// Result/query Edge functions can enqueue computation; their names do not prove reads.
const CAPTURE_DATASET_RELATIONS = new Set([
  'processes',
  'flows',
  'contacts',
  'sources',
  'unitgroups',
  'flowproperties',
  'lciamethods',
  'lifecyclemodels',
  'ilcd',
]);
const CAPTURE_READ_RPCS = new Set([
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
]);

function isCaptureReadSurface(method, target, headers) {
  if (target.pathname === '/auth/v1/token') return method === 'POST';
  if (['GET', 'HEAD'].includes(method)) {
    if (['/auth/v1/user', '/auth/v1/.well-known/jwks.json'].includes(target.pathname)) return true;
    return (
      headers['accept-profile'] === 'public' &&
      CAPTURE_DATASET_RELATIONS.has(target.pathname.replace(/^\/rest\/v1\//u, '')) &&
      target.pathname.startsWith('/rest/v1/')
    );
  }
  if (method === 'POST' && target.pathname.startsWith('/rest/v1/rpc/')) {
    return (
      headers['content-profile'] === 'api' &&
      CAPTURE_READ_RPCS.has(target.pathname.slice('/rest/v1/rpc/'.length))
    );
  }
  // The exact create-version sink is handled earlier, without dispatch. No Edge,
  // storage signing, job, result, semantic AI search or computation route is forwarded.
  return false;
}

function origin(value, loopback = false) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (loopback
      ? url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      : url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new Error('Invalid capture origin');
  return url.origin;
}

function reply(response, status, body = '', headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Capture request exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function exactCapture(request, target, bytes, config) {
  if (request.method !== 'POST' || target.pathname !== CAPTURE_PATH) return false;
  if (
    JSON.stringify([...target.searchParams]) !==
    JSON.stringify([['forceFunctionRegion', 'us-east-1']])
  )
    return false;
  if (request.headers.apikey !== config.publishableKey) return false;
  let body;
  try {
    body = JSON.parse(bytes.toString('utf8'));
  } catch {
    return false;
  }
  const keys = ['id', 'table', 'sourceVersion', 'jsonOrdered', 'modelId', 'ruleVerification'];
  return (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    JSON.stringify(Object.keys(body).sort()) === JSON.stringify(keys.sort()) &&
    body.id === config.processId &&
    body.table === 'processes' &&
    body.sourceVersion === config.sourceVersion &&
    body.modelId === null &&
    typeof body.ruleVerification === 'boolean' &&
    body.jsonOrdered &&
    typeof body.jsonOrdered === 'object' &&
    !Array.isArray(body.jsonOrdered) &&
    body.jsonOrdered.processDataSet?.processInformation?.dataSetInformation?.['common:UUID'] ===
      config.processId
  );
}

function exactAuthBody(target, bytes) {
  if (target.pathname !== '/auth/v1/token') return true;
  let body;
  try {
    body = JSON.parse(bytes.toString('utf8'));
  } catch {
    return false;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const grant = target.searchParams.get('grant_type');
  const keys = Object.keys(body);
  if (grant === 'refresh_token')
    return (
      keys.length === 1 && typeof body.refresh_token === 'string' && body.refresh_token.length > 0
    );
  return (
    grant === 'password' &&
    keys.every((key) => ['email', 'password', 'gotrue_meta_security'].includes(key)) &&
    typeof body.email === 'string' &&
    typeof body.password === 'string' &&
    (body.gotrue_meta_security === undefined ||
      (body.gotrue_meta_security &&
        typeof body.gotrue_meta_security === 'object' &&
        !Array.isArray(body.gotrue_meta_security) &&
        Object.keys(body.gotrue_meta_security).length === 0))
  );
}

async function startProcessCaptureServers(config) {
  const upstreamOrigin = origin(config.upstreamOrigin);
  const devOrigin = origin(config.devOrigin, true);
  if (
    typeof config.classifyRequest !== 'function' ||
    typeof config.onCapture !== 'function' ||
    !config.publishableKey ||
    !/^[0-9a-f-]{36}$/u.test(config.processId) ||
    !/^\d{2}\.\d{2}\.\d{3}$/u.test(config.sourceVersion)
  )
    throw new Error('Incomplete capture contract');
  let appOrigin;
  let parentOrigin;
  let captured = false;
  let ready = false;
  const state = { captureCount: 0, rejectedCount: 0, forwardedReadCount: 0, ledger: [] };
  const record = (method, category, disposition, upstreamDispatch = false) => {
    state.ledger.push({
      sequence: state.ledger.length + 1,
      method,
      category,
      disposition,
      upstreamDispatch,
    });
  };
  const summary = () => ({
    captureCount: state.captureCount,
    captureHttpAttempts: state.ledger.filter(
      (entry) =>
        entry.category === 'capture' &&
        ['capture-attempt', 'duplicate-rejected', 'contract-rejected'].includes(entry.disposition),
    ).length,
    duplicateCaptureRequests: state.ledger.filter(
      (entry) => entry.disposition === 'duplicate-rejected',
    ).length,
    rejectedCount: state.rejectedCount,
    upstreamDispatches: state.ledger.filter((entry) => entry.upstreamDispatch).length,
    authDispatches: state.ledger.filter(
      (entry) => entry.upstreamDispatch && entry.category === 'auth',
    ).length,
    readDispatches: state.ledger.filter(
      (entry) => entry.upstreamDispatch && entry.category === 'read',
    ).length,
    businessMutationDispatches: state.ledger.filter(
      (entry) => entry.upstreamDispatch && !['auth', 'read'].includes(entry.category),
    ).length,
    requestLedger: state.ledger.map((entry) => ({ ...entry })),
  });
  const appCsp = () =>
    `default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors ${parentOrigin}`;
  const deny = (
    response,
    disposition = 'rejected',
    category = response.captureCategory ?? 'unknown',
  ) => {
    state.rejectedCount += 1;
    record(response.captureMethod ?? 'UNKNOWN', category, disposition);
    reply(response, 403, 'Request denied');
  };
  const app = http.createServer(async (request, response) => {
    response.captureMethod = request.method;
    try {
      if (!ready || request.headers.host !== new URL(appOrigin).host) return deny(response);
      // Origin-form only; never turn an absolute URL or encoded separator into a proxy target.
      if (
        !request.url?.startsWith('/') ||
        request.url.startsWith('//') ||
        /%(?:2f|5c)|\\/iu.test(request.url)
      )
        return deny(response);
      if (/(?:^|\/)(?:\.{1,2}|(?:%2e){1,2})(?:\/|$)/iu.test(request.url.split('?')[0]))
        return deny(response);
      const target = new URL(request.url, appOrigin);
      if (request.url !== `${target.pathname}${target.search}`) return deny(response);
      const backend = API_PATH.test(target.pathname);
      response.captureCategory = backend
        ? target.pathname.startsWith('/auth/')
          ? 'auth'
          : 'api'
        : 'ui';
      const referer = request.headers.referer;
      const candidateFrame =
        request.headers['sec-fetch-dest'] === 'iframe' &&
        (referer === `${parentOrigin}/` ||
          (typeof referer === 'string' && referer.startsWith(`${appOrigin}/`)));
      if (backend) {
        // The browser uses this same-origin gateway; no backend CORS preflight is needed.
        // In particular, never forward a preflight to an otherwise unreviewed command path.
        if (request.method === 'OPTIONS') return deny(response);
        if (
          request.headers.origin !== appOrigin &&
          !(typeof referer === 'string' && referer.startsWith(`${appOrigin}/`))
        )
          return deny(response);
        if (request.headers['sec-fetch-dest'] !== 'empty') return deny(response);
      } else {
        if (!['GET', 'HEAD'].includes(request.method)) return deny(response);
        if (request.headers['sec-fetch-dest'] === 'document') return deny(response);
        if (request.headers['sec-fetch-dest'] === 'iframe') {
          if (!candidateFrame || target.pathname !== '/' || target.search) return deny(response);
        } else if (!(typeof referer === 'string' && referer.startsWith(`${appOrigin}/`)))
          return deny(response);
        if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/__'))
          return deny(response);
        if (
          target.pathname !== '/' &&
          !/\.(?:js|css|json|json\.gz|xml|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map)$/iu.test(
            target.pathname,
          )
        )
          return deny(response);
      }
      const bytes = await readBody(request);
      if (backend && target.pathname === CAPTURE_PATH) {
        if (captured) return deny(response, 'duplicate-rejected', 'capture');
        if (!exactCapture(request, target, bytes, config))
          return deny(response, 'contract-rejected', 'capture');
        captured = true;
        record(request.method, 'capture', 'capture-attempt');
        try {
          await config.onCapture({
            body: bytes,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            summary: summary(),
          });
        } catch (error) {
          record(request.method, 'capture', 'capture-persistence-failed');
          throw error;
        }
        record(request.method, 'capture', 'captured-without-dispatch');
        state.captureCount += 1;
        request.socket.destroy();
        if (config.onCaptured)
          await config.onCaptured({
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            summary: summary(),
          });
        return;
      }
      const destination = new URL(
        `${target.pathname}${target.search}`,
        backend ? upstreamOrigin : devOrigin,
      );
      if (
        backend &&
        (!isCaptureReadSurface(request.method, target, request.headers) ||
          config.classifyRequest(
            request.method,
            destination.href,
            upstreamOrigin,
            bytes.length ? bytes.toString('utf8') : null,
            request.headers,
            config.publishableKey,
          ) !== 'allow' ||
          !exactAuthBody(target, bytes))
      )
        return deny(response);
      const headers = {};
      for (const key of [
        'accept',
        'content-type',
        'apikey',
        'authorization',
        'x-client-info',
        'prefer',
        'accept-profile',
        'content-profile',
        'range',
      ]) {
        if (request.headers[key]) headers[key] = request.headers[key];
      }
      record(
        request.method,
        backend ? (target.pathname.startsWith('/auth/') ? 'auth' : 'read') : 'ui',
        'dispatched',
        backend,
      );
      if (backend && !target.pathname.startsWith('/auth/')) state.forwardedReadCount += 1;
      const result = await fetch(destination, {
        method: request.method,
        headers,
        body: bytes.length ? bytes : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      if (result.status >= 300 && result.status < 400) return deny(response);
      const contentType = result.headers.get('content-type') || 'application/octet-stream';
      if (!backend && contentType.includes('text/html') && !candidateFrame) return deny(response);
      const resultHeaders = {
        'content-type': contentType,
        'content-security-policy': appCsp(),
        'referrer-policy': 'strict-origin-when-cross-origin',
      };
      for (const key of ['content-range', 'accept-ranges'])
        if (result.headers.has(key)) resultHeaders[key] = result.headers.get(key);
      reply(
        response,
        result.status,
        request.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()),
        resultHeaders,
      );
    } catch {
      if (!response.destroyed && !response.headersSent)
        reply(response, 502, 'Capture transport unavailable');
      else response.destroy();
    }
  });
  const parent = http.createServer((request, response) => {
    response.captureMethod = request.method;
    response.captureCategory = 'shell';
    if (
      !ready ||
      request.headers.host !== new URL(parentOrigin).host ||
      request.url !== '/' ||
      !['GET', 'HEAD'].includes(request.method)
    )
      return deny(response);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Process payload capture</title></head><body><iframe title="Platform candidate" sandbox="allow-scripts allow-same-origin allow-forms" src="${appOrigin}/#/user/login" width="1440" height="1000"></iframe></body></html>`;
    reply(response, 200, request.method === 'HEAD' ? undefined : html, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': `default-src 'none'; frame-src ${appOrigin}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
  });
  for (const server of [app, parent]) {
    server.on('upgrade', (_request, socket) => socket.destroy());
    server.on('connect', (_request, socket) => socket.destroy());
    server.requestTimeout = 35_000;
  }
  const listen = (server, port) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  try {
    await listen(app, config.appPort ?? 0);
    appOrigin = `http://127.0.0.1:${app.address().port}`;
    await listen(parent, config.parentPort ?? 0);
    parentOrigin = `http://127.0.0.1:${parent.address().port}`;
    ready = true;
  } catch (error) {
    app.close();
    parent.close();
    throw error;
  }
  return {
    appOrigin,
    parentOrigin,
    state,
    summary,
    close: async () => {
      ready = false;
      await Promise.all(
        [app, parent].map(
          (server) =>
            new Promise((resolve) => {
              server.close(resolve);
              server.closeAllConnections();
            }),
        ),
      );
    },
  };
}

module.exports = { startProcessCaptureServers };
