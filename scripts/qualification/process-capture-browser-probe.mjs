// Synthetic browser qualification only. No production origin or credentials are used.
// node --import tsx scripts/qualification/process-capture-browser-probe.mjs <private-report.json>
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyProductionRequest } from '../../tests/e2e/i18n/production-request-guard.ts';
import capture from './process-capture-server.cjs';

const reportPath = process.argv[2];
if (!reportPath || !path.isAbsolute(reportPath))
  throw new Error('An absolute report path is required');
const state = { unexpected: [], permittedReads: [], captures: [] };
const saveReport = () => writeFile(reportPath, JSON.stringify(state, null, 2), { mode: 0o600 });
const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
const sink = http.createServer(async (request, response) => {
  state.unexpected.push({ method: request.method, path: request.url });
  await saveReport();
  response.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  response.end('Unexpected network request received');
});
sink.on('upgrade', async (request, socket) => {
  state.unexpected.push({ method: 'WEBSOCKET', path: request.url });
  await saveReport();
  socket.destroy();
});
const sinkOrigin = await listen(sink);
const upstream = http.createServer(async (request, response) => {
  state.permittedReads.push({ method: request.method, path: request.url });
  await saveReport();
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end('{}');
});
const upstreamOrigin = await listen(upstream);
const processId = '11111111-1111-4111-8111-111111111111';
const sourceVersion = '01.00.000';
const publishableKey = 'synthetic-browser-key';
const script = `
const sink = ${JSON.stringify(sinkOrigin)};
const output = document.getElementById('results');
const show = (text) => { output.textContent += text + '\\n'; };
document.addEventListener('securitypolicyviolation', (event) => show('CSP blocked: ' + event.effectiveDirective));
document.getElementById('read').onclick = async () => {
  const response = await fetch('/rest/v1/processes', { headers: { apikey: ${JSON.stringify(publishableKey)}, 'accept-profile': 'public' } });
  show('Permitted read: ' + response.status);
};
document.getElementById('capture').onclick = async () => {
  const body = ${JSON.stringify({ id: processId, table: 'processes', sourceVersion, modelId: null, ruleVerification: false, jsonOrdered: { processDataSet: { processInformation: { dataSetInformation: { 'common:UUID': processId } }, exchanges: { exchange: [{ '@dataSetInternalID': '0', meanAmount: '1' }] } } } })};
  try {
    const response = await fetch('/functions/v1/app_dataset_create_version?forceFunctionRegion=us-east-1', { method: 'POST', headers: { 'content-type': 'application/json', apikey: ${JSON.stringify(publishableKey)} }, body: JSON.stringify(body) });
    show(response.ok ? 'ERROR: capture returned success' : 'Capture transport ended with denied response: ' + response.status);
  } catch { show('Captured request aborted'); }
};
document.getElementById('writes').onclick = async () => {
  for (const [url, method] of [['/rest/v1/processes', 'POST'], ['/functions/v1/app_dataset_save_draft', 'POST'], ['/functions/v1/translate_text', 'POST']]) {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json', apikey: ${JSON.stringify(publishableKey)} }, body: '{}' });
    show('Denied write: ' + response.status);
  }
};
document.getElementById('compute').onclick = async () => {
  for (const endpoint of ['lca_query_results', 'lca_contribution_path_result', 'app_worker_jobs', 'app_data_product_commands', 'process_hybrid_search']) {
    const response = await fetch('/functions/v1/' + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ${JSON.stringify(publishableKey)}, authorization: 'Bearer synthetic-user-session' }, body: JSON.stringify({ mode: 'process_all_impacts', process_id: ${JSON.stringify(processId)}, version: ${JSON.stringify(sourceVersion)}, allow_fallback: false, action: 'list' }) });
    show('Denied computation/result: ' + endpoint + ' ' + response.status);
  }
};
document.getElementById('network').onclick = () => {
  fetch(sink + '/fetch', { method: 'POST', body: 'synthetic' }).catch(() => show('fetch blocked'));
  fetch(sink.replace('http:', '') + '/protocol-relative').catch(() => show('protocol-relative blocked'));
  try { const xhr = new XMLHttpRequest(); xhr.open('POST', sink + '/xhr'); xhr.onerror = () => show('XHR blocked'); xhr.send('synthetic'); } catch { show('XHR blocked'); }
  try { navigator.sendBeacon(sink + '/beacon', 'synthetic'); } catch { show('beacon blocked'); }
  try { const ws = new WebSocket(sink.replace('http:', 'ws:') + '/websocket'); ws.onerror = () => show('WebSocket blocked'); } catch { show('WebSocket blocked'); }
  for (const tag of ['img', 'script', 'video', 'object']) {
    const element = document.createElement(tag); element[tag === 'object' ? 'data' : 'src'] = sink + '/' + tag;
    element.onerror = () => show(tag + ' blocked'); document.body.appendChild(element);
  }
  try { new Worker(URL.createObjectURL(new Blob(['fetch(' + JSON.stringify(sink + '/worker') + ')'], { type: 'text/javascript' }))); } catch { show('worker blocked'); }
  show('Network probes dispatched');
};
document.getElementById('navigation').onclick = () => {
  try { window.open(sink + '/popup'); } catch { show('popup blocked'); }
  try { window.top.location.href = sink + '/top'; } catch { show('top navigation blocked'); }
  try { window.parent.document.querySelector('iframe').removeAttribute('sandbox'); show('ERROR: parent accessible'); } catch { show('parent access blocked'); }
  show('Navigation probes dispatched');
};
document.getElementById('form').onclick = () => { const form = document.createElement('form'); form.method = 'POST'; form.action = sink + '/form'; document.body.appendChild(form); form.submit(); };
document.getElementById('frame').onclick = () => { const frame = document.createElement('iframe'); frame.src = sink + '/nested-frame'; document.body.appendChild(frame); };
document.getElementById('navigate').onclick = () => { location.href = sink + '/frame-navigation'; };
document.getElementById('reload').onclick = () => { location.reload(); };
`;
const dev = http.createServer((request, response) => {
  if (request.url === '/probe.js') {
    response.writeHead(200, { 'content-type': 'application/javascript' });
    response.end(script);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(
    '<!doctype html><html><head><title>Synthetic capture isolation probes</title></head><body><h1>Synthetic capture isolation probes</h1><p>No production data or credentials.</p><button id="reload">Reload embedded app</button><button id="read">Permitted read</button><button id="capture">Capture synthetic payload</button><button id="writes">Try denied writes</button><button id="compute">Try computation and result routes</button><button id="network">Try external network requests</button><button id="navigation">Try popup and top navigation</button><button id="frame">Try nested frame</button><button id="form">Try external form</button><button id="navigate">Try frame navigation last</button><pre id="results"></pre><script src="/probe.js"></script></body></html>',
  );
});
const devOrigin = await listen(dev);
const runtime = await capture.startProcessCaptureServers({
  upstreamOrigin,
  devOrigin,
  publishableKey,
  processId,
  sourceVersion,
  classifyRequest: classifyProductionRequest,
  onCapture: async ({ body, sha256 }) => {
    state.captures.push({ body: JSON.parse(body.toString('utf8')), sha256 });
    await saveReport();
  },
});
await saveReport();
process.stdout.write(
  `${JSON.stringify({ parentOrigin: runtime.parentOrigin, appOrigin: runtime.appOrigin, sinkOrigin, reportPath })}\n`,
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await runtime.close();
    for (const server of [dev, upstream, sink]) {
      server.close();
      server.closeAllConnections();
    }
    await saveReport();
    process.exit(0);
  });
