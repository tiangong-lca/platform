#!/usr/bin/env node
// No native work without --execute. Fixture compilation is not a product build.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const os = require('node:os');
const { readSnapshot, Ownership, createRuntime, runtimeRemovable } = require('./portal-native-resources.cjs');
const http = require('node:http'), cp = require('node:child_process'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..'), req = createRequire(path.join(root, 'package.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function check(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function git(args) { return cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000 }).trim(); }
function parse(argv) { const value = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--execute') { check(!value.execute, 'duplicate_execute'); value.execute = true; } else { check(['--output', '--expected-head'].includes(argv[i]) && argv[i + 1] && !value[argv[i]], 'invalid_argument'); value[argv[i]] = argv[++i]; } } return value; }
function sources(expectedHead) {
  check(/^[a-f0-9]{40}$/u.test(expectedHead || '') && git(['rev-parse', 'HEAD']) === expectedHead, 'head_mismatch');
  const antdRoot = path.dirname(req.resolve('antd/package.json')), antdReq = createRequire(path.join(antdRoot, 'package.json'));
  const drawerReq = createRequire(antdReq.resolve('@rc-component/drawer/package.json'));
  const portalRoot = fs.realpathSync(path.dirname(drawerReq.resolve('@rc-component/portal/package.json')));
  check(req(path.join(portalRoot, 'package.json')).version === '2.2.1', 'portal_version_mismatch');
  const patch = 'patches/@rc-component__portal@2.2.1.patch', patchHash = sha(fs.readFileSync(path.join(root, patch)));
  check(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8').includes(`'@rc-component/portal@2.2.1': ${patchHash}`), 'patch_lock_mismatch');
  const files = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', patch, 'scripts/e2e/portal-escape-native.cjs', 'scripts/e2e/portal-native-resources.cjs', 'tests/package-contracts/native-portal-escape/fixture.mjs'];
  const hashes = Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
  for (const file of ['es/index.js', 'es/Portal.js', 'es/useEscKeyDown.js', 'es/Context.js']) hashes[path.join(portalRoot, file)] = sha(fs.readFileSync(path.join(portalRoot, file)));
  return { head: expectedHead, patchHash, portalRoot, antdRoot, proRoot: path.dirname(req.resolve('@ant-design/pro-components/package.json')), hashes };
}
function sameSources(binding) { check(git(['rev-parse', 'HEAD']) === binding.head, 'head_changed'); for (const [file, digest] of Object.entries(binding.hashes)) check(sha(fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, file))) === digest, 'source_changed'); }
async function execute(options, binding) {
  check(['darwin', 'linux'].includes(process.platform), 'posix_identity_required');
  check(!git(['status', '--porcelain=v1', '--untracked-files=all']), 'dirty_source');
  const output = path.resolve(options['--output'] || ''); check(options['--output'] && path.isAbsolute(options['--output']) && !fs.existsSync(output), 'new_absolute_output_required');
  check(fs.realpathSync(path.dirname(output)) === path.dirname(output), 'symlink_output_parent'); fs.mkdirSync(output, { mode: 0o700 });
  const write = (file, data) => fs.writeFileSync(path.join(output, file), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  const started = Date.now(), deadline = started + 900000, startedMono = performance.now(), deadlineMono = startedMono + 900000, workDeadlineMono = deadlineMono - 120000;
  const remaining = () => Math.max(0, deadlineMono - performance.now());
  const inspect = () => readSnapshot({ remainingMs: remaining() });
  const registry = new Ownership();
  let runtime = null, runtimeEnvironment = {}, previousEnvironment = {};
  const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches') : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright');
  const receipt = { schema: 'platform.portal-native.v1', source: binding, startedAt: started, deadline, workDeadline: deadline - 120000, runtime: { path: null, toolCache: browserCache, retained: false }, browsers: [], focusProbes: [], steps: [], failures: [], ownership: [], peakRssBytes: 0, peakTotalOwnedDiskBytes: 0, cleanup: { verified: false }, nativePass: false };
  let stopping = false, browserServer, browser, context, server, esbuild, sampler, softTimer, hardTimer, rejectAbort;
  const abortPromise = new Promise((_, reject) => { rejectAbort = reject; }); abortPromise.catch(() => {});
  const abort = code => { if (!stopping) { const error = new Error(code); error.code = code; rejectAbort(error); } };
  const race = promise => Promise.race([promise, abortPromise]);
  const spawn = cp.spawn;
  const remember = (pid, handle) => {
    if (!pid || registry.handles.get(pid) === handle && registry.records.has(pid)) return;
    registry.capture(pid, handle);
    write('ownership.json', registry.evidence());
    if (!registry.bind(pid, inspect())) { receipt.failures.push({ phase: 'ownership', code: 'owned_identity_unknown' }); abort('owned_identity_unknown'); }
    receipt.ownership = registry.evidence(); write('ownership.json', receipt.ownership);
  };
  const launchOwned = args => { const child = spawn(...args); if (child.pid) remember(child.pid, child); else abort('spawn_identity_missing'); child.once('error', () => abort('owned_child_spawn_error')); return child; };
  cp.spawn = (...args) => { check(!stopping, 'spawn_after_cancellation'); return launchOwned(args); };
  const signal = () => abort('cancelled'); process.on('SIGINT', signal); process.on('SIGTERM', signal);
  const sample = () => {
    const snapshot = inspect(), state = registry.refresh(snapshot);
    check(state.status === 'ok', 'resource_inventory_unknown');
    const self = snapshot.rows.get(process.pid); check(self, 'resource_self_unknown');
    receipt.peakRssBytes = Math.max(receipt.peakRssBytes, state.live.reduce((sum, row) => sum + snapshot.rows.get(row.pid).rss, self.rss));
    const diskRoots = output.startsWith(root + path.sep) ? [root] : [root, output];
    // A cold traversal of the frozen pnpm tree takes longer than one second.
    // Keep the probe bounded by both its own limit and the original run deadline.
    const disk = diskRoots.reduce((sum, dir) => { check(remaining() > 200, 'disk_inspection_budget'); const bytes = Number(cp.execFileSync('du', ['-sk', dir], { encoding: 'utf8', timeout: Math.min(5000, Math.floor(remaining() - 100)) }).trim().split(/\s+/u)[0]) * 1024; check(Number.isSafeInteger(bytes) && bytes >= 0, 'disk_inspection_invalid'); return sum + bytes; }, 0);
    receipt.peakTotalOwnedDiskBytes = Math.max(receipt.peakTotalOwnedDiskBytes, disk);
    receipt.ownership = registry.evidence();
    check(receipt.peakRssBytes <= 4 * 1024 ** 3 && disk <= 12 * 1024 ** 3, 'resource_limit');
  };
  const bounded = (start, ms) => { check(remaining() > 100, 'cleanup_budget'); return Promise.race([Promise.resolve().then(start), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('cleanup_timeout')), Math.min(ms, Math.max(1, remaining() - 100))); timer.unref(); })]); };
  const killOwned = signalName => {
    const snapshot = inspect(), plan = registry.signalPlan(snapshot, remaining());
    if (plan.status !== 'ok') { receipt.failures.push({ phase: 'cleanup', code: 'signal_inventory_unknown' }); return; }
    for (const pid of plan.pids) { if (remaining() < 100 || performance.now() - snapshot.observedAt > 250) { receipt.failures.push({ phase: 'cleanup', code: 'signal_budget_or_freshness' }); break; } try { process.kill(pid, signalName); } catch (error) { if (error.code !== 'ESRCH') receipt.failures.push({ phase: 'cleanup', code: 'owned_signal_failed' }); } }
  };
  const intent = { ...binding, owner: 'platform#1358', pid: process.pid, started, deadline, rssCapBytes: 4 * 1024 ** 3, totalOwnedDiskCapBytes: 12 * 1024 ** 3, browsers: ['chromium', 'firefox', 'webkit'] };
  try {
    runtime = createRuntime(output, value => { runtime = value; receipt.runtime.path = value.path; receipt.runtime.retained = true; write('runtime-intent.json', { path: value.path, status: 'created-before-config' }); });
    runtimeEnvironment = { ...runtime.env, PLAYWRIGHT_BROWSERS_PATH: browserCache };
    previousEnvironment = Object.fromEntries(Object.keys(runtimeEnvironment).map(key => [key, process.env[key]]));
    for (const [key, value] of Object.entries(runtimeEnvironment)) process.env[key] = value;
    write('intent.json', { ...intent, runtime });
    softTimer = setTimeout(() => abort('cleanup_reserve_reached'), workDeadlineMono - performance.now());
    hardTimer = setTimeout(() => { stopping = true; killOwned('SIGKILL'); receipt.failures.push({ phase: 'deadline', code: 'hard_deadline' }); receipt.finishedAt = Date.now(); write('receipt.json', receipt); process.exit(124); }, deadlineMono - performance.now() - 2000);
    receipt.step = 'setup:resource-snapshot';
    sampler = setInterval(() => { try { sample(); } catch (error) { receipt.failures.push({ phase: 'resource-observation', code: error.code || 'resource_observation_failed', detail: String(error.message).slice(0, 2000) }); abort('resource_observation_failed'); } }, 1000); sample();
    process.env.GOMAXPROCS = '2'; process.env.UV_THREADPOOL_SIZE = '2'; process.env.OMP_NUM_THREADS = '2';
    receipt.step = 'setup:bundle';
    const compilerReq = createRequire(req.resolve('@umijs/max/package.json')); esbuild = compilerReq('esbuild');
    const fixture = path.join(root, 'tests/package-contracts/native-portal-escape/fixture.mjs');
    const entry = `import React from ${JSON.stringify(req.resolve('react'))};import {createRoot} from ${JSON.stringify(req.resolve('react-dom/client'))};import {flushSync} from ${JSON.stringify(req.resolve('react-dom'))};import Portal from ${JSON.stringify(path.join(binding.portalRoot, 'es/index.js'))};import {EscapeContext} from ${JSON.stringify(path.join(binding.portalRoot, 'es/useEscKeyDown.js'))};import Drawer from ${JSON.stringify(path.join(binding.antdRoot, 'es/drawer/index.js'))};import {SiderMenu} from ${JSON.stringify(path.join(binding.proRoot, 'es/layout/components/SiderMenu/index.js'))};import {mountFixture} from ${JSON.stringify(fixture)};mountFixture({React,createRoot,flushSync,Portal,Drawer,SiderMenu,EscapeContext});`;
    const loadedInputs = new Map();
    const bindingPlugin = { name: 'bind-exact-source-bytes', setup(build) { build.onLoad({ filter: /\.(?:[cm]?js|jsx|ts|tsx|json|css)$/ }, args => { const file = fs.realpathSync(args.path), contents = fs.readFileSync(file), extension = path.extname(file).slice(1); loadedInputs.set(file, { sha256: sha(contents), bytes: contents.length }); return { contents, loader: ['mjs', 'cjs'].includes(extension) ? 'js' : extension, resolveDir: path.dirname(file) }; }); } };
    const built = await race(esbuild.build({ plugins: [bindingPlugin], absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: 'portal-native-entry.mjs' }, bundle: true, write: false, metafile: true, platform: 'browser', format: 'iife', target: 'es2022', mainFields: ['module', 'main'], preserveSymlinks: false, define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(output, 'fixture.js'), logLevel: 'silent' }));
    const inputs = Object.keys(built.metafile.inputs).filter(name => name !== 'portal-native-entry.mjs' && name !== '<stdin>').map(name => fs.realpathSync(path.resolve(root, name)));
    const portalInputs = inputs.filter(file => file.includes('/@rc-component/portal/'));
    check(portalInputs.length > 0 && portalInputs.every(file => file.startsWith(binding.portalRoot + '/es/')) && portalInputs.includes(path.join(binding.portalRoot, 'es/useEscKeyDown.js')), 'wrong_or_duplicate_portal_bundle');
    const inputHashes = Object.fromEntries(inputs.map(file => { const loaded = loadedInputs.get(file); check(loaded && loaded.sha256 === sha(fs.readFileSync(file)), 'unbound_or_changed_bundle_input'); return [file, loaded.sha256]; }));
    const bundle = built.outputFiles.find(file => file.path.endsWith('/fixture.js'))?.contents; check(bundle && bundle.length <= 8 * 1024 ** 2, 'fixture_bundle_missing_or_large');
    const bundleHash = sha(bundle); receipt.bundle = { sha256: bundleHash, bytes: bundle.length, entrySha256: sha(entry), portalInputs, inputHashes }; write('metafile.json', built.metafile); write('bundle-binding.json', receipt.bundle); fs.writeFileSync(path.join(output, 'fixture.js'), bundle, { mode: 0o600 });
    esbuild.stop(); sameSources(binding);
    const html = Buffer.from('<!doctype html><html><meta charset="utf-8"><title>Portal synthetic fixture</title><body><button id="key-target">Key target</button><div id="root"></div><script src="/fixture.js"></script></body></html>');
    server = http.createServer((request, response) => { if (request.method !== 'GET' || !['/', '/fixture.js'].includes(request.url)) { response.writeHead(404).end(); return; } response.writeHead(200, { 'Content-Type': request.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript', 'Cache-Control': 'no-store' }); response.end(request.url === '/' ? html : bundle); });
    await race(new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const playwright = req('@playwright/test'); check(req('@playwright/test/package.json').version === '1.65.0', 'playwright_version_mismatch');
    for (const name of ['chromium', 'firefox', 'webkit']) {
      const runBrowser = async () => {
      check(performance.now() < workDeadlineMono && !stopping, 'no_time_for_browser'); receipt.step = `${name}:launch`; sample();
      const launch = playwright[name].launchServer({ headless: true, host: '127.0.0.1', timeout: 30000, env: { ...process.env }, downloadsPath: runtime.directories.downloads, tracesDir: runtime.directories.traces }); launch.then(value => { if (stopping) value.close().catch(() => {}); }); browserServer = await race(launch); remember(browserServer.process().pid, browserServer.process());
      browser = await race(playwright[name].connect(browserServer.wsEndpoint())); context = await race(browser.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' }));
      let externalRequests = 0, pageErrors = 0; await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { externalRequests++; return route.abort(); } return route.continue(); });
      const page = await context.newPage(); page.on('pageerror', () => pageErrors++); page.setDefaultTimeout(15000);
      const asset = page.waitForResponse(response => response.url() === origin + '/fixture.js'); await race(page.goto(origin, { waitUntil: 'networkidle' })); const actualAsset = await race(asset); check(sha(await actualAsset.body()) === bundleHash, 'served_bundle_mismatch');
      await page.waitForFunction(() => window.portalEscapeFixture?.reactVersion === '19.3.1');
      const snapshot = () => page.evaluate(() => window.portalEscapeFixture.snapshot());
      const configure = async scenario => { await page.evaluate(name => window.portalEscapeFixture.configure(name), scenario); await page.waitForFunction(() => window.portalEscapeFixture.snapshot().committedPhase === 0); };
      const advance = async () => { await page.evaluate(() => window.portalEscapeFixture.advance()); await page.waitForTimeout(0); };
      let callStart = 0;
      const escape = async () => { callStart = (await snapshot()).calls.length; await page.locator('#key-target').focus(); await page.keyboard.press('Escape'); };
      const top = async expected => { const value = await snapshot(); const tops = value.calls.slice(callStart).filter(call => call.top); check(tops.length === 1 && tops[0].name === expected && !value.overflow, 'wrong_native_escape_priority'); return value; };
      const cases = [];
      let observed;
      for (const activationMode of ['keyboard', 'pointer']) {
        receipt.step = `${name}:default-container-two-escape-focus:${activationMode}`;
        await configure('drawers');
        const focusProbe = { browser: name, activationMode, focusSetup: activationMode === 'pointer' ? 'programmatic fixture-trigger focus before open; native click' : 'locator.press focus before native Enter' }; receipt.focusProbes.push(focusProbe);
        const activate = async locator => activationMode === 'keyboard' ? locator.press('Enter') : locator.click();
        const verifyActivation = (activation, opener) => {
          check(activation?.classification === 'native' && activation.focus === opener, 'native_activation_opener_focus_unproved');
          check(activation.focusSetup === (activationMode === 'pointer' ? 'fixture-trigger-focus-before-open' : 'targeted-native-Enter'), 'focus_setup_mismatch');
          if (activationMode === 'keyboard') check(activation.detail === 0, 'keyboard_activation_unproved');
          else check(activation.detail > 0, 'pointer_activation_unproved');
        };
        await activate(page.getByRole('button', { name: 'Open parent', exact: true }));
        const parent = page.getByRole('dialog', { name: 'Parent', exact: true });
        await playwright.expect(parent).toBeVisible();
        check(await parent.evaluate(node => !node.closest('#root')), 'not_default_body_container');
        focusProbe.parentActivation = (await snapshot()).events.find(event => event.type === 'open-parent');
        verifyActivation(focusProbe.parentActivation, 'open-parent');
        await activate(page.getByRole('button', { name: 'Open child', exact: true }));
        const child = page.getByRole('dialog', { name: 'Child', exact: true });
        await playwright.expect(child).toBeVisible();
        check(await child.evaluate(node => !node.closest('#root')), 'not_default_child_body_container');
        focusProbe.childActivation = (await snapshot()).events.find(event => event.type === 'open-child');
        verifyActivation(focusProbe.childActivation, 'open-child');
        await page.keyboard.press('Escape');
        await playwright.expect(child).toBeHidden(); await playwright.expect(parent).toBeVisible();
        focusProbe.afterChildEscape = await snapshot();
        await playwright.expect(page.locator('#open-child')).toBeFocused();
        // Verify both the declared focusable opener and its exact identity.
        // A fallback document.body is not a restorable focus precondition.
        await page.waitForFunction(() => window.portalEscapeFixture.snapshot().restoredFocus.child, null, { timeout: 5000 });
        focusProbe.afterChildEscape = await snapshot();
        check(focusProbe.afterChildEscape.savedFocusConnected.child, 'child_saved_focus_detached');
        await page.keyboard.press('Escape'); await playwright.expect(parent).toBeHidden();
        focusProbe.afterParentEscape = await snapshot();
        await playwright.expect(page.locator('#open-parent')).toBeFocused();
        await page.waitForFunction(() => window.portalEscapeFixture.snapshot().restoredFocus.parent, null, { timeout: 5000 });
        focusProbe.afterParentEscape = await snapshot();
        check(focusProbe.afterParentEscape.savedFocusConnected.parent, 'parent_saved_focus_detached');
        observed = await snapshot();
        check(observed.calls.map(call => call.name).join(',') === 'closed-child,closed-parent' && observed.events.filter(event => event.key === 'Escape' && event.classification === 'native').length === 2, 'native_two_escape_unproved');
        if (activationMode === 'keyboard') check(observed.events.filter(event => event.key === 'Enter' && event.classification === 'native').length === 2, 'native_enter_unproved');
        cases.push({ ...observed, activationMode, focusSetup: focusProbe.focusSetup });
      }
      for (const scenario of ['siblings', 'nested', 'aborted-open', 'aborted-close', 'aborted-callback', 'omitted', 'keyboard-false', 'reparent', 'aborted-reparent', 'isolated-replay', 'prolayout-inline', 'ime']) {
        check(!stopping && performance.now() < workDeadlineMono, 'no_time_for_case'); receipt.step = `${name}:${scenario}`; await configure(scenario);
        if (scenario === 'siblings') { await advance(); await escape(); await top('B'); await advance(); await escape(); await top('C'); await advance(); await escape(); await top('B'); }
        else if (scenario === 'nested') { await escape(); observed = await top('child'); check(observed.calls.length === 2 && observed.calls[0].name === 'child' && observed.calls[1].name === 'parent', 'native_fanout_order'); }
        else if (scenario === 'aborted-open') { await page.waitForFunction(() => window.portalEscapeFixture.snapshot().pendingRenders > 0); await escape(); await top('A'); }
        else if (scenario === 'aborted-close' || scenario === 'aborted-callback') { await advance(); await page.waitForFunction(() => window.portalEscapeFixture.snapshot().pendingRenders > 0); await escape(); await top(scenario === 'aborted-close' ? 'A' : 'committed'); }
        else if (scenario === 'omitted') { await escape(); observed = await snapshot(); check(observed.calls.length === 1 && observed.calls[0].top === false, 'omitted_callback_did_not_block'); }
        else if (scenario === 'keyboard-false') { await escape(); check((await snapshot()).calls.length === 0, 'keyboard_false_did_not_block'); }
        else if (scenario === 'reparent') { for (let step = 0; step < 4; step++) await advance(); await escape(); await top('A'); }
        else if (scenario === 'aborted-reparent') { for (let step = 0; step < 4; step++) await advance(); await page.waitForFunction(() => window.portalEscapeFixture.snapshot().pendingRenders > 0); await escape(); await top('child'); }
        else if (scenario === 'isolated-replay') { await advance(); const before = (await snapshot()).replay; await advance(); await advance(); await escape(); observed = await top('B'); check(observed.replay.A > before.A && observed.replay.B === before.B, 'isolated_effect_replay_unproved'); }
        else if (scenario === 'prolayout-inline') { await escape(); const delta = (await snapshot()).calls.slice(callStart); check(delta.length === 1 && delta[0].name === 'collapse' && delta[0].value === true, 'native_prolayout_close_missing'); }
        else { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }))); check((await snapshot()).calls.length === 0, 'composing_escape_not_ignored'); await page.evaluate(() => window.dispatchEvent(new CompositionEvent('compositionend'))); await escape(); observed = await snapshot(); check(observed.events.at(-1).classification === 'native' && observed.events.at(-1).imeRecent && observed.calls.length === 0, 'recent_ime_control_unproved'); await page.waitForFunction(() => window.portalEscapeFixture.snapshot().imePast); await escape(); await top('A'); }
        observed = await snapshot(); check(!observed.overflow && observed.events.some(event => event.key === 'Escape' && event.classification === 'native'), 'native_event_unproved'); cases.push(observed);
      }
      const componentCleanup = await page.evaluate(() => window.portalEscapeFixture.dispose()); check(componentCleanup.componentDisposed && !componentCleanup.overflow && componentCleanup.remaining.keydown === 0 && componentCleanup.remaining.compositionend === 0, 'component_listener_cleanup_failed');
      check(externalRequests === 0 && pageErrors === 0, 'browser_boundary_failed'); receipt.browsers.push({ name, version: browser.version(), bundleSha256: bundleHash, nativeCases: cases, externalRequests, pageErrors, componentCleanup });
      await race(context.close()); context = null; await race(browser.close()); browser = null; await race(browserServer.close()); browserServer = null; sample();
      };
      await race(runBrowser());
    }
    sameSources(binding); for (const [file, digest] of Object.entries(receipt.bundle.inputHashes)) check(sha(fs.readFileSync(file)) === digest, 'bundle_input_changed');
  } catch (error) { receipt.failures.push({ phase: receipt.step || 'setup', code: /^[a-z0-9_]+$/u.test(error.code || '') ? error.code : 'native_harness_failed', errorCode: error.code || null, detail: String(error.message).slice(0, 2000) }); }
  finally {
    stopping = true; if (sampler) clearInterval(sampler); if (softTimer) clearTimeout(softTimer);
    for (const [kind, close] of [['context', () => context?.close()], ['browser', () => browser?.close()], ['browser-server', () => browserServer?.close()], ['compiler', () => esbuild?.stop()], ['http-server', () => server && new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })]]) { try { await bounded(close, 10000); } catch { receipt.failures.push({ phase: 'cleanup', code: `${kind}_close_failed` }); } }
    killOwned('SIGTERM'); await new Promise(resolve => setTimeout(resolve, 300)); killOwned('SIGKILL'); await new Promise(resolve => setTimeout(resolve, 100));
    receipt.cleanup = registry.closure(inspect());
    receipt.cleanup.verified = receipt.cleanup.verified && (!server || !server.listening);
    if (runtime && receipt.cleanup.verified && remaining() > 2000 && runtimeRemovable(runtime, receipt.cleanup)) {
      try {
        check(sha(fs.readFileSync(path.join(root, 'scripts/e2e/portal-native-resources.cjs'))) === binding.hashes['scripts/e2e/portal-native-resources.cjs'], 'cleanup_helper_changed');
        const helper = path.join(root, 'scripts/e2e/portal-native-resources.cjs');
        const program = `const fs=require('fs');const helper=require(process.argv[1]);const runtime=JSON.parse(process.argv[2]);process.stdin.once('data',()=>{if(!helper.runtimeRemovable(runtime,{verified:true}))process.exit(2);fs.rmSync(runtime.path,{recursive:true,force:false});});`;
        const worker = launchOwned([process.execPath, ['-e', program, helper, JSON.stringify(runtime)], { stdio: ['pipe', 'ignore', 'ignore'] }]);
        const closed = new Promise((resolve, reject) => { worker.once('error', reject); worker.once('close', code => code === 0 ? resolve() : reject(Error('runtime_remove_failed'))); });
        worker.stdin.end('remove'); await bounded(() => closed, Math.min(10000, remaining() - 1000));
        try { fs.lstatSync(runtime.path); throw Error('runtime_still_present'); } catch (error) { check(error.code === 'ENOENT', 'runtime_absence_unknown'); }
        receipt.runtime.retained = false;
      } catch { receipt.failures.push({ phase: 'cleanup', code: 'runtime_cleanup_failed_or_unknown' }); killOwned('SIGKILL'); }
    }
    receipt.cleanup = { ...registry.closure(inspect()), httpServerClosed: !server || !server.listening };
    receipt.cleanup.verified = receipt.cleanup.verified && receipt.cleanup.httpServerClosed && !receipt.runtime.retained;
    for (const [key, value] of Object.entries(previousEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    cp.spawn = spawn; process.off('SIGINT', signal); process.off('SIGTERM', signal); if (hardTimer) clearTimeout(hardTimer);
    receipt.ownership = registry.evidence(); receipt.finishedAt = Date.now(); receipt.elapsedMs = performance.now() - startedMono; receipt.withinDeadline = receipt.elapsedMs <= 900000; receipt.nativePass = receipt.browsers.length === 3 && receipt.failures.length === 0 && receipt.cleanup.verified && receipt.withinDeadline; write('receipt.json', receipt); process.stdout.write(JSON.stringify({ nativePass: receipt.nativePass, receipt: path.join(output, 'receipt.json') }) + '\n'); process.exitCode = receipt.nativePass ? 0 : 1;
  }
}
async function main() { if (process.argv.length === 3 && process.argv[2] === '--help') { console.log('Usage: node scripts/e2e/portal-escape-native.cjs --expected-head SHA [--execute --output NEW_ABSOLUTE_DIRECTORY]\nDefault is read-only plan. Execution is15min including120s cleanup reserve,4GiB RSS/12GiB total owned disk,serial Chromium/Firefox/WebKit.'); return; } const options = parse(process.argv.slice(2)); const binding = sources(options['--expected-head']); if (!options.execute) { console.log(JSON.stringify({ mode: 'plan-only', binding, wallSeconds: 900, cleanupReserveSeconds: 120, rssCapBytes: 4 * 1024 ** 3, totalOwnedDiskCapBytes: 12 * 1024 ** 3, browsers: ['chromium', 'firefox', 'webkit'] })); return; } await execute(options, binding); }
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ nativePass: false, code: error.code || 'preflight_failed' })); process.exitCode = 1; });
module.exports = { parse, sources };
