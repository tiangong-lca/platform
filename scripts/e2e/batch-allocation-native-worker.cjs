// Owned worker: blocking source/build/browser work never runs on the supervisor event loop.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  http = require('node:http');
const { createRequire } = require('node:module');
const {
  check,
  LIMITS,
  BROWSERS,
  CONTROLS,
  independentCleanup,
} = require('./batch-allocation-native-policy.cjs');
const { Ownership, readSnapshot } = require('./portal-native-resources.cjs');
const {
  POLICY,
  assertLaunchEnvironment,
  admitDefaultBrowsers,
  defaultLaunchOptions,
  verifyDefaultLaunch,
  profileFromArgs,
} = require('./batch-allocation-native-runtime.cjs');
const {
  sha,
  fileHash,
  bindSources,
  bindBrowserTree,
  verifySources,
  build,
} = require('./batch-allocation-native-source.cjs');
const root = path.resolve(__dirname, '../..'),
  req = createRequire(path.join(root, 'package.json'));
let stopping = false,
  input,
  browser,
  browserServer,
  context,
  activePage,
  server;
let observerOwner;
let actualObserver;
let rejectAbort;
const aborted = new Promise((_, reject) => {
  rejectAbort = reject;
});
aborted.catch(() => {});
const sockets = new Set(),
  owners = new Ownership(),
  rawSpawn = cp.spawn;
const now = () => Number(process.hrtime.bigint() / 1000000n);
const remaining = () => Math.max(0, input.deadline - now());
const send = (value) => process.connected && process.send(value);
const write = (name, value) =>
  fs.writeFileSync(path.join(input.output, name), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
const timeout = (start, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('bounded_operation_timeout')), Math.max(1, ms));
    Promise.resolve()
      .then(start)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
  });
cp.spawn = (...args) => {
  check(!stopping, 'spawn_after_stop');
  const child = rawSpawn(...args);
  check(child.pid, 'child_pid_missing');
  owners.capture(child.pid, child);
  send({ type: 'ownership', states: owners.evidence() });
  check(
    owners.bind(child.pid, readSnapshot({ remainingMs: Math.min(1000, remaining()) })),
    'child_identity_unknown',
  );
  return child;
};
const pending = new Map();
let sequence = 0;
function checkpoint(type, details = {}) {
  check(!stopping, 'stopping');
  const id = ++sequence;
  send({ type, id, ...details });
  return timeout(
    () =>
      new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      }),
    Math.min(20000, Math.max(1, input.workDeadline - now())),
  );
}
async function git(args) {
  return new Promise((resolve, reject) => {
    check(
      args.length === 2 && args[0] === 'rev-parse' && ['HEAD', 'HEAD^{tree}'].includes(args[1]),
      'git_command_invalid',
    );
    const child = cp.spawn(
      '/bin/sh',
      ['-c', 'read gate; exec git -C "$1" rev-parse "$2"', 'batch-git', root, args[1]],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    );
    let output = '';
    const timer = setTimeout(() => reject(Error('git_deadline')), 5000);
    child.stdout.on('data', (data) => {
      output += data;
      if (output.length > 1048576) reject(Error('git_output_cap'));
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(Error('git_failed'));
    });
    child.stdin.end('run\n');
  });
}
async function closure() {
  const failures = [];
  await independentCleanup(
    [
      [
        'observer',
        () => activePage?.evaluate(actualObserver?.finishBatchAllocationObserver, observerOwner),
      ],
      ['component', () => activePage?.evaluate(() => window.batchAllocationControl?.dispose())],
      ['page', () => activePage?.close()],
      ['context', () => context?.close()],
      ['browser', () => browser?.close()],
      ['browser-server', () => browserServer?.close()],
      [
        'http',
        () =>
          server &&
          new Promise((resolve) => {
            for (const socket of sockets) socket.destroy();
            server.closeAllConnections();
            server.close(resolve);
          }),
      ],
    ],
    remaining,
    timeout,
    (name) => failures.push(name),
  );
  return { failures, portClosed: !server || !server.listening, socketsClosed: sockets.size === 0 };
}
async function work() {
  const runInput = input;
  assertLaunchEnvironment();
  const publishOwner = (token) => {
    observerOwner = token;
  };
  const head = await git(['rev-parse', 'HEAD']);
  check(head === runInput.expectedHead, 'head_changed');
  const binding = bindSources(root, head, await git(['rev-parse', 'HEAD^{tree}']));
  const browserIdentities = admitDefaultBrowsers(root, runInput.browserCache);
  const browserTypes = req('@playwright/test');
  write('source-binding.json', binding);
  write('browser-binding.json', browserIdentities);
  await checkpoint('phase', { phase: 'build' });
  const compiled = await build(root, runInput.output, binding);
  actualObserver = compiled.observer;
  write('executed-inputs.json', binding);
  await checkpoint('phase', { phase: 'server' });
  verifySources(binding);
  check((await git(['rev-parse', 'HEAD'])) === head, 'head_changed');
  const assets = new Map(
    Object.entries(compiled.receipt.files).map(([name, meta]) => {
      const bytes = fs.readFileSync(path.join(runInput.output, name));
      check(sha(bytes) === meta.sha256, 'served_asset_changed');
      return ['/' + name, bytes];
    }),
  );
  const html = Buffer.from(
    '<!doctype html><html><meta charset="utf-8"><title>Controlled allocation</title><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
  );
  assets.set('/', html);
  write(
    'served-binding.json',
    Object.fromEntries([...assets].map(([name, bytes]) => [name, sha(bytes)])),
  );
  server = http.createServer((request, response) => {
    const bytes = assets.get(request.url);
    if (request.method !== 'GET' || !bytes) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': request.url.endsWith('.js')
        ? 'text/javascript'
        : request.url.endsWith('.css')
          ? 'text/css'
          : 'text/html',
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  send({ type: 'port', port: server.address().port });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const contract = require('./batch-allocation-diagnostic.cjs');
  const {
    runControl,
  } = require('../../tests/package-contracts/native-batch-allocation/control.spec.cjs');
  const expect = browserTypes.expect.configure({ timeout: LIMITS.expectMs });
  for (const name of BROWSERS) {
    await checkpoint('phase', { phase: 'browser', browser: name });
    check(
      fileHash(browserIdentities[name].executable, 512 * 1024 ** 2) ===
        browserIdentities[name].sha256,
      'browser_changed',
    );
    check(
      bindBrowserTree(runInput.browserCache, browserIdentities[name].executable).sha256 ===
        browserIdentities[name].cache.sha256,
      'browser_cache_changed',
    );
    browserServer = await browserTypes[name].launchServer(
      defaultLaunchOptions(runInput.runtime, runInput.workDeadline - now()),
    );
    const child = browserServer.process();
    verifyDefaultLaunch(browserIdentities[name], child, runInput.browserCache);
    const state = readSnapshot({ remainingMs: Math.min(1000, remaining()) }),
      row = state.status === 'ok' && state.rows.get(child.pid),
      record = owners.records.get(child.pid);
    check(
      row &&
        record &&
        row.start === record.start &&
        row.pgid === record.pgid &&
        row.ppid === process.pid,
      'runtime_process_identity',
    );
    if (name === 'chromium') {
      const profile = profileFromArgs(child.spawnargs, runInput.runtime.path),
        ps = fs.lstatSync(profile);
      check(
        ps.isDirectory() &&
          !ps.isSymbolicLink() &&
          ps.dev === runInput.runtime.device &&
          ps.uid === process.getuid() &&
          (ps.mode & 0o7777) === 0o700,
        'runtime_profile_identity',
      );
    }
    await checkpoint('launched', {
      browser: name,
      binding: {
        policy: POLICY,
        pid: child.pid,
        parentPid: process.pid,
        start: row.start,
        pgid: row.pgid,
        executable: browserIdentities[name].executable,
        executableSha256: browserIdentities[name].sha256,
        cacheSha256: browserIdentities[name].cache.sha256,
      },
    });
    browser = await browserTypes[name].connect(browserServer.wsEndpoint(), {
      timeout: Math.min(30000, runInput.workDeadline - now()),
    });
    if (name === 'chromium')
      check(browser.version() === '151.0.7922.34', 'runtime_browser_version');
    for (const control of CONTROLS) {
      observerOwner = undefined;
      await checkpoint('begin', { browser: name, control });
      const caseContext = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1100, height: 800 },
        serviceWorkers: 'block',
      });
      const boundary = { external: false, passed: false };
      await caseContext.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          boundary.external = true;
          return route.abort();
        }
        return route.continue();
      });
      context = caseContext;
      const casePage = await caseContext.newPage();
      activePage = casePage;
      casePage.setDefaultTimeout(LIMITS.actionMs);
      casePage.setDefaultNavigationTimeout(LIMITS.navigationMs);
      const actual = new Map();
      casePage.on('response', (response) => {
        const url = new URL(response.url());
        if (url.origin === origin && assets.has(url.pathname))
          actual.set(url.pathname, response.body().then(sha));
      });
      const directory = path.join(runInput.output, name + '-' + control);
      fs.mkdirSync(directory, { mode: 0o700 });

      try {
        await timeout(
          async () => {
            await casePage.goto(origin, { waitUntil: 'load' });
            for (const [asset, bytes] of assets)
              check(
                actual.has(asset) && (await actual.get(asset)) === sha(bytes),
                'actual_served_bytes',
              );
            verifySources(binding);
            const source = {
              mode: 'controlled-native',
              historicalCommit: '632d1d204aaa5ea14f2a501ecb855f2e9b2c614d',
              historicalTree: '64e69c3447a813e2c6b07f298430b593e5c5a0f7',
              executedHead: head,
              executedTree: binding.tree,
              candidateArchiveSha256: null,
              candidateManifestSha256: null,
              e2eTree: null,
              runnerTree: null,
              environmentSha256: binding.hashes[path.join(root, 'docker/e2e/environment.json')],
              observerSha256:
                binding.hashes[path.join(root, 'tests/e2e/i18n/batch-allocation-observer.ts')],
              contractSha256:
                binding.hashes[path.join(root, 'scripts/e2e/batch-allocation-diagnostic.cjs')],
              testSha256:
                binding.hashes[
                  path.join(
                    root,
                    'tests/package-contracts/native-batch-allocation/control.spec.cjs',
                  )
                ],
              installedControlsSha256: binding.installedControlsSha256,
              browserRuntimeSha256: sha(JSON.stringify(browserIdentities[name])),
            };
            const stable = [
              'executed-inputs.json',
              'build-binding.json',
              'browser-binding.json',
            ].map((file) => [
              path.join(runInput.output, file),
              fileHash(path.join(runInput.output, file)),
            ]);
            const reportBinding = contract.admitNativeBinding({
              outputDirectory: directory,
              source,
              identity: { browser: name, project: name, scope: 'native-control', control },
              stableFiles: stable,
            });
            const result = await runControl({
              page: casePage,
              control,
              expect,
              observer: compiled.observer,
              contract,
              binding: reportBinding,
              onOwner: publishOwner,
              beforePublish: async () => {
                await checkpoint('phase', { phase: 'publication' });
                verifySources(binding);
              },
              afterPublish: async () => {
                await checkpoint('phase', { phase: 'published' });
                verifySources(binding);
              },
            });
            verifySources(binding);
            check(!boundary.external, 'external_request');
            write(name + '-' + control + '-control.json', result);
            boundary.passed = true;
          },
          Math.min(LIMITS.caseMs, runInput.workDeadline - now()),
        );
      } finally {
        const failures = [];
        await independentCleanup(
          [
            ['component', () => casePage.evaluate(() => window.batchAllocationControl.dispose())],
            ['page', () => casePage.close()],
            ['context', () => caseContext.close()],
          ],
          remaining,
          timeout,
          (name) => failures.push(name),
        );
        activePage = null;
        context = null;
        send({
          type: 'complete',
          browser: name,
          control,
          outcome: boundary.passed && !failures.length ? 'passed' : 'failed',
        });
        check(!failures.length, 'control_cleanup_failed');
      }
    }
    await browser.close();
    browser = null;
    await browserServer.close();
    browserServer = null;
    check(
      bindBrowserTree(runInput.browserCache, browserIdentities[name].executable).sha256 ===
        browserIdentities[name].cache.sha256,
      'browser_cache_changed',
    );
    const closed = owners.closure(readSnapshot({ remainingMs: Math.min(1000, remaining()) }));
    check(closed.verified, 'previous_browser_tree_not_closed');
    await checkpoint('phase', { phase: 'browser-closed', browser: name });
  }
  verifySources(binding);
  check((await git(['rev-parse', 'HEAD'])) === head, 'head_changed');
}
function abort() {
  stopping = true;
  rejectAbort(Error('cancelled'));
  for (const port of pending.values()) port.reject(Error('cancelled'));
  pending.clear();
}
process.on('SIGINT', abort);
process.on('SIGTERM', abort);
process.on('message', async (message) => {
  if (message.type === 'ack') {
    const port = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) port?.resolve();
    else port?.reject(Error('admission_rejected'));
    return;
  }
  if (message.type === 'stop') {
    abort();
    return;
  }
  if (message.type !== 'start' || input) return;
  input = message;
  let failed = false;
  try {
    await Promise.race([work(), aborted]);
  } catch {
    failed = true;
  } finally {
    stopping = true;
    const cleanup = await closure();
    cp.spawn = rawSpawn;
    const code = failed || cleanup.failures.length ? 1 : 0;
    if (process.connected)
      process.send({ type: 'finished', failed: Boolean(code), cleanup }, () => {
        process.disconnect();
        process.exit(code);
      });
    else process.exit(code);
  }
});
process.on('disconnect', abort);
