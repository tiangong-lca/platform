#!/usr/bin/env node
// No native work without --execute. This shell is not a product build or qualification.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const os = require('node:os');
const { readSnapshot, Ownership, createRuntime, runtimeRemovable } = require('./portal-native-resources.cjs');
const http = require('node:http'), cp = require('node:child_process'), { createRequire, Module } = require('node:module');
const root = path.resolve(__dirname, '../..'), req = createRequire(path.join(root, 'package.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Scalar definitions preserve real-file-only metafile binding. A whole-object
// process.env definition creates esbuild's synthetic <define:process.env> input.
const BROWSER_DEFINES = Object.freeze({
  'process.env.NODE_ENV': '"production"',
  'process.env.APP_BRAND': '"tiangong"',
  'process.env.APP_LIGHT_PRIMARY': 'undefined',
  'process.env.APP_LIGHT_LOGO': 'undefined',
  'process.env.APP_DARK_PRIMARY': 'undefined',
  'process.env.APP_DARK_LOGO': 'undefined',
  'process.env.APP_FAVICON': 'undefined',
});
function check(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function git(args) { return cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000 }).trim(); }
function parse(argv) { const value = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--execute') { check(!value.execute, 'duplicate_execute'); value.execute = true; } else { check(['--output', '--expected-head'].includes(argv[i]) && argv[i + 1] && !value[argv[i]], 'invalid_argument'); value[argv[i]] = argv[++i]; } } return value; }
const stateKeys = ['navigationVisibleCount', 'navigationOpenCount', 'navigationMotionCount', 'popupVisibleCount', 'popupMotionCount', 'popupClosingCount', 'otherPopoverVisibleCount', 'otherTooltipVisibleCount', 'menuActionHovered', 'popupOpen', 'focus'];
function validateCapture(value) {
  const exact = (item, keys) => item && Object.getPrototypeOf(item) === Object.prototype && Object.getOwnPropertyNames(item).length === keys.length && Object.getOwnPropertySymbols(item).length === 0 && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
  const state = item => {
    check(stateKeys.slice(0, 8).every(key => Number.isInteger(item[key]) && item[key] >= 0 && item[key] <= 32), 'invalid_capture_count');
    check(typeof item.menuActionHovered === 'boolean' && typeof item.popupOpen === 'boolean' && ['opener', 'controlled-popup', 'navigation', 'body', 'other'].includes(item.focus), 'invalid_capture_state');
  };
  check(exact(value, ['scenario', 'committed', 'overflow', 'openerConnected', 'restoredOpener', 'events', 'collapseCalls', 'compositionEndCount', ...stateKeys]), 'invalid_capture_keys');
  check(['navigation-only', 'descendant-popup-closing'].includes(value.scenario) && value.committed === true && value.overflow === false, 'invalid_capture_status');
  check(typeof value.openerConnected === 'boolean' && typeof value.restoredOpener === 'boolean', 'invalid_capture_focus');
  check(Number.isInteger(value.compositionEndCount) && value.compositionEndCount >= 0 && value.compositionEndCount <= 32, 'invalid_capture_composition_count');
  check(Array.isArray(value.events) && value.events.length <= 32 && Array.isArray(value.collapseCalls) && value.collapseCalls.length <= 32 && value.collapseCalls.every(item => typeof item === 'boolean'), 'invalid_capture_arrays');
  state(value);
  let elapsed = 0;
  for (const event of value.events) {
    check(exact(event, ['key', 'trusted', 'composing', 'elapsedMs', 'recentCompositionEnd', ...stateKeys]), 'invalid_capture_event_keys');
    check(['enter', 'escape'].includes(event.key) && ['trusted', 'composing', 'recentCompositionEnd'].every(key => typeof event[key] === 'boolean'), 'invalid_capture_event');
    check(Number.isInteger(event.elapsedMs) && event.elapsedMs >= elapsed && event.elapsedMs <= 300000, 'invalid_capture_elapsed');
    elapsed = event.elapsedMs;
    state(event);
  }
  check(Buffer.byteLength(JSON.stringify(value)) <= 16384, 'capture_byte_cap');
  return value;
}
function sources(expectedHead) {
  const binding = require('./portal-escape-native.cjs').sources(expectedHead);
  const files = [
    'scripts/e2e/mobile-navigation-native.cjs',
    'scripts/e2e/mobile-navigation-native.d.cts',
    'scripts/e2e/mobile-navigation-diagnostic.cjs', 'scripts/e2e/mobile-navigation-diagnostic.d.cts',
    'tests/e2e/i18n/mobile-navigation-observer.ts',
    'tests/package-contracts/native-mobile-navigation/fixture.mjs',
    'tests/unit/components/fixtures/mobile-navigation-original-action.fixture',
    'src/components/MobileNavigationAction/index.tsx', 'src/app.tsx',
    'src/components/DataNavigation/header.tsx',
    'src/components/DataNavigation/navigation.ts', 'src/components/DataNavigation/menuText.tsx',
    'config/routes.ts', 'config/brands/tiangong.json', 'config/brandProfile.ts', 'config/branding.ts',
    'src/locales/fr-FR/menu.ts', 'src/locales/fr-FR/settingDrawer.ts', 'public/logo_dark.svg',
    'src/contexts/AntdThemeSync.tsx', 'src/services/general/localeRegistry.ts',
    'tests/e2e/i18n/responsive-layout.spec.ts', 'tests/e2e/i18n/responsive-surface-registry.ts',
    'tests/e2e/i18n/contracts.ts', 'tests/e2e/i18n/locale-catalog-adapter.ts',
    'src/global.less', 'src/components/BrandPresentation/style.less',
    'src/.umi/plugin-layout/Layout.tsx', 'src/.umi/plugin-layout/Layout.css',
  ];
  for (const file of files) binding.hashes[file] = sha(fs.readFileSync(path.join(root, file)));
  return { ...binding, evidenceMode: 'worktree-hashes-only',
    failedSourceCommit: 'e98d1d631d9895c49f0d6c02bed39206ac28df77',
    headTree: git(['rev-parse', 'HEAD^{tree}']),
    worktreeChangeCount: git(['status', '--porcelain=v1', '--untracked-files=all']).split('\n').filter(Boolean).length,
    composition: 'real-uncontrolled-ProLayout-with-product-native-action-canonical-hover-and-actual-passive-v2-observer',
    representativePresentation: 'TianGong-terminal-dark-French-four-data-scopes',
    isolation: 'unused-Umi-theme-sync-hook-import-is-external-and-side-effect-free',
    omitted: ['authenticated-header-tools-and-avatar', 'user-access-filtering', 'deployment-brand-environment-overrides', 'authenticated-services', 'Umi-router-bootstrap', 'responsive-predecessor-history'],
  };
}
function sameSources(binding) { check(git(['rev-parse', 'HEAD']) === binding.head, 'head_changed'); for (const [file, digest] of Object.entries(binding.hashes)) check(sha(fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, file))) === digest, 'source_changed'); }
async function execute(options, binding) {
  check(['darwin', 'linux'].includes(process.platform), 'posix_identity_required');
  // Explicit worktree-hash proof; this does not qualify the HEAD archive or canonical case.
  const output = path.resolve(options['--output'] || ''); check(options['--output'] && path.isAbsolute(options['--output']) && !fs.existsSync(output), 'new_absolute_output_required');
  check(fs.realpathSync(path.dirname(output)) === path.dirname(output), 'symlink_output_parent'); fs.mkdirSync(output, { mode: 0o700 });
  const write = (file, data) => fs.writeFileSync(path.join(output, file), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  const started = Date.now(), deadline = started + 900000, startedMono = performance.now(), deadlineMono = startedMono + 900000, workDeadlineMono = deadlineMono - 120000;
  const remaining = () => Math.max(0, deadlineMono - performance.now());
  const inspect = () => readSnapshot({ remainingMs: remaining() });
  const registry = new Ownership();
  let runtime = null, runtimeEnvironment = {}, previousEnvironment = {};
  const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches') : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright');
  const receipt = { schema: 'platform.mobile-navigation-native.v1', source: binding, startedAt: started, deadline, workDeadline: deadline - 120000, runtime: { path: null, toolCache: browserCache, retained: false }, browsers: [], focusProbes: [], steps: [], failures: [], ownership: [], peakRssBytes: 0, peakTotalOwnedDiskBytes: 0, cleanup: { verified: false }, nativePass: false };
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
  const intent = { ...binding, owner: 'platform#1383', pid: process.pid, started, deadline, rssCapBytes: 4 * 1024 ** 3, totalOwnedDiskCapBytes: 12 * 1024 ** 3, browsers: ['chromium'] };
  try {
    runtime = createRuntime(output, value => { runtime = value; receipt.runtime.path = value.path; receipt.runtime.retained = true; write('runtime-intent.json', { path: value.path, status: 'created-before-config' }); });
    runtimeEnvironment = { ...runtime.env, PLAYWRIGHT_BROWSERS_PATH: browserCache };
    previousEnvironment = Object.fromEntries(Object.keys(runtimeEnvironment).map(key => [key, process.env[key]]));
    for (const [key, value] of Object.entries(runtimeEnvironment)) process.env[key] = value;
    write('intent.json', { ...intent, runtime });
    softTimer = setTimeout(() => abort('cleanup_reserve_reached'), workDeadlineMono - performance.now());
    hardTimer = setTimeout(() => { stopping = true; killOwned('SIGKILL'); receipt.failures.push({ phase: 'deadline', code: 'hard_deadline' }); receipt.finishedAt = Date.now(); write('receipt.json', receipt); process.exit(124); }, deadlineMono - performance.now() - 2000);
    receipt.step = 'setup:resource-snapshot';
    sampler = setInterval(() => { try { sample(); } catch (error) { receipt.failures.push({ phase: 'resource-observation', code: error.code || 'resource_observation_failed', observationFailed: true }); abort('resource_observation_failed'); } }, 1000); sample();
    process.env.GOMAXPROCS = '2'; process.env.UV_THREADPOOL_SIZE = '2'; process.env.OMP_NUM_THREADS = '2';
    receipt.step = 'setup:bundle';
    const compilerReq = createRequire(req.resolve('@umijs/max/package.json')); esbuild = compilerReq('esbuild');
    const fixture = path.join(root, 'tests/package-contracts/native-mobile-navigation/fixture.mjs');
    const brand = JSON.parse(fs.readFileSync(path.join(root, 'config/brands/tiangong.json'), 'utf8'));
    check(brand.theme.dark.logo === '/logo_dark.svg', 'unexpected_product_logo_path');
    const logo = fs.readFileSync(path.join(root, 'public/logo_dark.svg'));
    const entry = `import React from ${JSON.stringify(req.resolve('react'))};import {createRoot} from ${JSON.stringify(req.resolve('react-dom/client'))};import {flushSync} from ${JSON.stringify(req.resolve('react-dom'))};import {ProLayout} from ${JSON.stringify(path.join(binding.proRoot, 'es/layout/ProLayout.js'))};import {ConfigProvider,Popover} from ${JSON.stringify(path.join(binding.antdRoot, 'es/index.js'))};import frenchLocale from ${JSON.stringify(path.join(binding.antdRoot, 'es/locale/fr_FR.js'))};import {renderMobileNavigationAction} from './src/components/MobileNavigationAction/index.tsx';import {renderDataNavigationHeader} from './src/components/DataNavigation/header.tsx';import './src/global.less';import './src/components/BrandPresentation/style.less';import './src/.umi/plugin-layout/Layout.css';import ${JSON.stringify(path.join(binding.antdRoot, 'dist/reset.css'))};import {mountFixture} from ${JSON.stringify(fixture)};mountFixture({React,createRoot,flushSync,ProLayout,ConfigProvider,Popover,frenchLocale,renderMobileNavigationAction,renderDataNavigationHeader});`;
    const loadedInputs = new Map();
    const less = compilerReq('@umijs/bundler-utils/compiled/less');
    const bindingPlugin = { name: 'bind-exact-source-bytes', setup(build) {
      // createAntdThemeConfig is pure. Its module's separate unused sync component
      // imports this Umi hook; fail below if tree shaking leaves any executed import.
      build.onResolve({ filter: /^@umijs\/max$/ }, args => ({ path: args.path, external: true, sideEffects: false }));
      build.onLoad({ filter: /\.(?:[cm]?js|jsx|ts|tsx|json|css|less)$/ }, async args => {
        const file = fs.realpathSync(args.path), contents = fs.readFileSync(file), extension = path.extname(file).slice(1);
        loadedInputs.set(file, { sha256: sha(contents), bytes: contents.length });
        if (extension === 'less') {
          const result = await less.render(contents.toString('utf8'), { filename: file, modifyVars: { 'error-color': '#ff4d4f' } });
          check(result.imports.length === 0, 'unbound_css_import');
          return { contents: result.css, loader: 'css', resolveDir: path.dirname(file) };
        }
        return { contents, loader: ['mjs', 'cjs'].includes(extension) ? 'js' : extension, resolveDir: path.dirname(file) };
      });
    } };
    const built = await race(esbuild.build({ plugins: [bindingPlugin], absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: 'mobile-navigation-native-entry.mjs' }, bundle: true, write: false, metafile: true, platform: 'browser', format: 'iife', target: 'es2022', mainFields: ['module', 'main'], preserveSymlinks: false, define: BROWSER_DEFINES, jsx: 'automatic', outfile: path.join(output, 'fixture.js'), logLevel: 'silent' }));
    check(Object.values(built.metafile.outputs).every(output => output.imports.every(item => item.path !== '@umijs/max')), 'unexpected_executed_umi_import');
    // Load the real host module through the already-owned pinned compiler, then
    // pass its actual closure-free browser exports through Page.evaluate.
    const observerFile = path.join(root, 'tests/e2e/i18n/mobile-navigation-observer.ts');
    const observerBuilt = await race(esbuild.build({ plugins: [bindingPlugin], absWorkingDir: root,
      entryPoints: [observerFile], bundle: false, write: false, platform: 'node', format: 'cjs', target: 'es2022',
      outfile: path.join(output, 'observer-host.cjs'), logLevel: 'silent' }));
    const observerBytes = observerBuilt.outputFiles[0].contents;
    const observerModule = new Module(observerFile, module);
    observerModule.filename = observerFile; observerModule.paths = Module._nodeModulePaths(path.dirname(observerFile));
    observerModule._compile(Buffer.from(observerBytes).toString('utf8'), observerFile);
    const { installMobileNavigationObserver, finishMobileNavigationObserver } = observerModule.exports;
    const passiveContract = req('./scripts/e2e/mobile-navigation-diagnostic.cjs');
    check(typeof installMobileNavigationObserver === 'function' && typeof finishMobileNavigationObserver === 'function', 'actual_observer_exports_missing');
    const cancellationOwner = crypto.randomUUID();
    const cancellationSetup = `(() => {
      if (Object.prototype.hasOwnProperty.call(window, '__tgPassiveCancellationControl')) throw Error('Cancellation control already exists.');
      const finish = (${finishMobileNavigationObserver.toString()});
      let capture = null, finishCalls = 0, finishErrors = 0, removeErrors = 0;
      const remove = () => { try { window.removeEventListener('keydown', onKeyDown, false); return true; } catch { removeErrors++; return false; } };
      const onKeyDown = event => {
        if (event.key !== 'Escape' || !event.isTrusted || finishCalls) return;
        finishCalls++;
        try { capture = finish(); } catch { finishErrors++; } finally { remove(); }
      };
      const control = { owner: ${JSON.stringify(cancellationOwner)}, cleanup() { const removed = remove(); if (removed && window.__tgPassiveCancellationControl === control) delete window.__tgPassiveCancellationControl;
        return { capture, finishCalls, finishErrors, removeErrors, disposed: !Object.prototype.hasOwnProperty.call(window, '__tgPassiveCancellationControl') }; } };
      Object.defineProperty(window, '__tgPassiveCancellationControl', { configurable: true, value: control });
      window.addEventListener('keydown', onKeyDown, { passive: true });
    })()`;
    receipt.passiveObserver = { schemaVersion: 2, hostTransformSha256: sha(observerBytes),
      hostSourceSha256: sha(fs.readFileSync(observerFile)), installExportSha256: sha(installMobileNavigationObserver.toString()),
      finishExportSha256: sha(finishMobileNavigationObserver.toString()), cancellationSetupSha256: sha(cancellationSetup),
      cancellationSetup: 'separate-test-listener-finishes-on-single-trusted-Escape-without-cancelling-product-event' };
    fs.writeFileSync(path.join(output, 'observer-host.cjs'), observerBytes, { mode: 0o600 });
    fs.writeFileSync(path.join(output, 'cancellation-setup.js'), cancellationSetup, { mode: 0o600 });
    const inputs = Object.keys(built.metafile.inputs).filter(name => name !== 'mobile-navigation-native-entry.mjs' && name !== '<stdin>').map(name => fs.realpathSync(path.resolve(root, name)));
    const portalInputs = inputs.filter(file => file.includes('/@rc-component/portal/'));
    check(portalInputs.length > 0 && portalInputs.every(file => file.startsWith(binding.portalRoot + '/es/')) && portalInputs.includes(path.join(binding.portalRoot, 'es/useEscKeyDown.js')), 'wrong_or_duplicate_portal_bundle');
    const inputHashes = Object.fromEntries(inputs.map(file => { const loaded = loadedInputs.get(file); check(loaded && loaded.sha256 === sha(fs.readFileSync(file)), 'unbound_or_changed_bundle_input'); return [file, loaded.sha256]; }));
    const bundle = built.outputFiles.find(file => file.path.endsWith('/fixture.js'))?.contents; check(bundle && bundle.length <= 8 * 1024 ** 2, 'fixture_bundle_missing_or_large');
    const css = built.outputFiles.find(file => file.path.endsWith('/fixture.css'))?.contents;
    check(css && css.length < 512 * 1024, 'product_css_missing_or_large');
    // The one-second popup animation is an explicitly controlled stimulus, not product CSS.
    const controlledCss = Buffer.from('\n.fixture-competing-popup{animation-duration:1s!important}\n');
    const servedCss = Buffer.concat([Buffer.from(css), controlledCss]);
    const bundleHash = sha(bundle);
    receipt.bundle = { sha256: bundleHash, bytes: bundle.length, cssSha256: sha(css),
      servedCssSha256: sha(servedCss), controlledPopupCssSha256: sha(controlledCss),
      entrySha256: sha(entry), portalInputs, inputHashes };
    write('metafile.json', built.metafile); write('bundle-binding.json', receipt.bundle);
    fs.writeFileSync(path.join(output, 'fixture.js'), bundle, { mode: 0o600 });
    fs.writeFileSync(path.join(output, 'fixture.css'), servedCss, { mode: 0o600 });
    esbuild.stop(); sameSources(binding);
    const html = Buffer.from('<!doctype html><html><meta charset="utf-8"><title>Mobile navigation controlled shell</title><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    server = http.createServer((request, response) => {
      if (request.method !== 'GET' || !['/', '/fixture.js', '/fixture.css', '/logo_dark.svg'].includes(request.url)) { response.writeHead(404).end(); return; }
      const type = request.url === '/' ? 'text/html; charset=utf-8' : request.url === '/fixture.css' ? 'text/css' : request.url === '/logo_dark.svg' ? 'image/svg+xml' : 'text/javascript';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(request.url === '/' ? html : request.url === '/fixture.css' ? servedCss : request.url === '/logo_dark.svg' ? logo : bundle);
    });
    await race(new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const playwright = req('@playwright/test'); check(req('@playwright/test/package.json').version === '1.62.1', 'playwright_version_mismatch');
    const expect = playwright.expect.configure({ timeout: 45000 });
    for (const name of ['chromium']) {
      const runBrowser = async () => {
      check(performance.now() < workDeadlineMono && !stopping, 'no_time_for_browser'); receipt.step = `${name}:launch`; sample();
      const launch = playwright[name].launchServer({ headless: true, host: '127.0.0.1', timeout: 30000, env: { ...process.env }, downloadsPath: runtime.directories.downloads, tracesDir: runtime.directories.traces }); launch.then(value => { if (stopping) value.close().catch(() => {}); }); browserServer = await race(launch); remember(browserServer.process().pid, browserServer.process());
      browser = await race(playwright[name].connect(browserServer.wsEndpoint())); context = await race(browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }));
      let externalRequests = 0, pageErrors = 0, consoleErrors = 0, browserCounterOverflow = false;
      const increment = value => { if (value === 255) browserCounterOverflow = true; return Math.min(255, value + 1); };
      await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { externalRequests = increment(externalRequests); return route.abort(); } return route.continue(); });
      let page;
      const snapshot = async () => {
        const value = await page.evaluate(() => window.mobileNavigationControl.snapshot());
        validateCapture(value);
        return value;
      };
      const cases = [];
      receipt.controlCases = cases;
      for (const scenario of ['navigation-only', 'descendant-popup-closing', 'navigation-cancel-frame']) {
        receipt.step = `${name}:${scenario}:setup`;
        const caseResult = { scenario, outcome: 'pending', capture: null, passiveCapture: null, cancellationControl: null, componentCleanup: null };
        let cancellationInstalled = false;
        cases.push(caseResult);
        try {
        // Fresh pages isolate conditions without a pointer-reset action that
        // would change the canonical hover prefix or inherit an already-hovered button.
        page = await context.newPage(); page.on('pageerror', () => { pageErrors = increment(pageErrors); }); page.on('console', message => { if (message.type() === 'error') consoleErrors = increment(consoleErrors); }); page.setDefaultTimeout(45000);
        const asset = page.waitForResponse(response => response.url() === origin + '/fixture.js');
        const cssAsset = page.waitForResponse(response => response.url() === origin + '/fixture.css');
        await race(page.goto(origin, { waitUntil: 'networkidle' })); const actualAsset = await race(asset); check(sha(await actualAsset.body()) === bundleHash, 'served_bundle_mismatch');
        check(sha(await (await race(cssAsset)).body()) === receipt.bundle.servedCssSha256, 'served_css_mismatch');
        await page.waitForFunction(() => window.mobileNavigationControl?.snapshot().committed);
        await page.evaluate(value => window.mobileNavigationControl.configure(value), scenario === 'navigation-cancel-frame' ? 'navigation-only' : scenario);
        await page.evaluate(installMobileNavigationObserver, passiveContract.LIMITS);
        if (scenario === 'navigation-cancel-frame') {
          await page.evaluate(cancellationSetup);
          cancellationInstalled = true;
        }
        const navigation = page.getByRole('dialog');
        const header = page.getByTestId('pro-layout-global-header');
        const menuButton = header.locator('.tg-pro-layout-mobile-menu-action');
        await expect(menuButton).toBeVisible();
        receipt.step = `${name}:${scenario}:hover-and-enter`;
        const backgroundBeforeHover = await menuButton.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        await menuButton.hover();
        await expect
          .poll(() => menuButton.evaluate((element) => getComputedStyle(element).backgroundColor))
          .not.toBe(backgroundBeforeHover);
        await menuButton.press('Enter');
        receipt.step = `${name}:${scenario}:assert-visible`;
        await expect(navigation).toBeVisible();
        // No motion completion, extra focus or extra key action precedes this Escape.
        if (scenario === 'descendant-popup-closing') {
          receipt.step = `${name}:${scenario}:popup-closing-setup`;
          await page.evaluate(() => window.mobileNavigationControl.setPopup(true));
          await expect(page.locator('.fixture-competing-popup')).toBeVisible();
          // Explicit setup for this controlled variation only: establish actual
          // popup animation, then its leave-active phase before dispatching Escape.
          await page.waitForFunction(() => window.mobileNavigationControl.snapshot().popupMotionCount > 0);
          await page.evaluate(() => window.mobileNavigationControl.setPopup(false));
          await page.waitForFunction(() => {
            const value = window.mobileNavigationControl.snapshot();
            return !value.popupOpen && value.popupClosingCount === 1 && value.popupMotionCount > 0;
          });
        }
        receipt.step = `${name}:${scenario}:escape`;
        await page.keyboard.press('Escape');
        if (scenario !== 'descendant-popup-closing') {
          receipt.step = `${name}:${scenario}:assert-hidden`;
          await expect(navigation).toBeHidden({ timeout: 45000 });
          receipt.step = `${name}:${scenario}:assert-focus`;
          await expect(menuButton).toBeFocused();
        } else {
          // Controlled condition only: wait for the popup to finish, not before Escape.
          receipt.step = `${name}:${scenario}:assert-popup-hidden`;
          await expect(page.locator('.fixture-competing-popup')).toBeHidden();
          receipt.step = `${name}:${scenario}:assert-navigation-retained`;
          await expect(navigation).toBeVisible();
        }
        receipt.step = `${name}:${scenario}:validate-capture`;
        const observed = await snapshot();
        const enters = observed.events.filter(event => event.key === 'enter');
        const escapes = observed.events.filter(event => event.key === 'escape');
        check(enters.length === 1 && escapes.length === 1 && [...enters, ...escapes].every(event => event.trusted && !event.composing && !event.recentCompositionEnd) && observed.compositionEndCount === 0, 'native_key_sequence_unproved');
        check(enters[0].focus === 'opener' && observed.openerConnected, 'opener_focus_unproved');
        check(enters[0].menuActionHovered, 'canonical_hover_precondition_unproved');
        check(escapes[0].navigationOpenCount === 1 && escapes[0].navigationVisibleCount === 1, 'escape_navigation_precondition_unproved');
        if (scenario !== 'descendant-popup-closing') {
          check(observed.navigationOpenCount === 0 && observed.navigationVisibleCount === 0 && observed.restoredOpener, 'navigation_hide_or_restore_failed');
          check(observed.collapseCalls.includes(false) && observed.collapseCalls.slice(observed.collapseCalls.indexOf(false) + 1).includes(true), 'native_state_chain_unproved');
        } else {
          check(!escapes[0].popupOpen && escapes[0].popupClosingCount === 1 && escapes[0].popupMotionCount > 0 && observed.navigationOpenCount === 1, 'controlled_closing_condition_unproved');
          check(!observed.collapseCalls.slice(observed.collapseCalls.indexOf(false) + 1).includes(true), 'competing_popup_did_not_retain_escape');
        }
        caseResult.outcome = 'passed';
        } catch (error) {
          caseResult.outcome = 'failed';
          throw error;
        } finally {
          try { caseResult.capture = await snapshot(); }
          catch { receipt.failures.push({ phase: 'capture', code: 'final_capture_failed' }); }
          try {
            let cancellation = null;
            if (cancellationInstalled) {
              cancellation = await page.evaluate(owner => {
                const control = window.__tgPassiveCancellationControl;
                return control?.owner === owner ? control.cleanup() : null;
              }, cancellationOwner);
              const { finishCalls, finishErrors, removeErrors, disposed } = cancellation;
              check(finishCalls === 1 && finishErrors === 0 && removeErrors === 0 && disposed === true, 'cancellation_control_failed');
              caseResult.cancellationControl = { finishCalls, finishErrors, removeErrors, disposed };
            }
            const passive = cancellation?.capture ?? await page.evaluate(finishMobileNavigationObserver);
            passiveContract.assertCapture(passive);
            check(Buffer.byteLength(JSON.stringify(passive)) <= passiveContract.LIMITS.bytes, 'passive_capture_byte_cap');
            caseResult.passiveCapture = passive;
            check(passive.disposed && !passive.recordOverflow && !passive.countOverflow && passive.observerErrorCount === 0, 'passive_capture_incomplete');
            if (caseResult.outcome === 'passed') {
              const cancelled = scenario === 'navigation-cancel-frame';
              check(passive.frame.scheduled === 1 && passive.frame.completed + passive.frame.cancelled === 1, 'passive_frame_lifecycle_unproved');
              if (cancelled) check(passive.frame.completed === 0 && passive.frame.cancelled === 1, 'passive_cancellation_unproved');
              if (scenario === 'descendant-popup-closing') check(passive.frame.completed === 1, 'native_completed_frame_unproved');
              check(passive.compositionPrehistory === 'unknown' && passive.details.final.composition[0] === 0, 'passive_composition_contract_failed');
              if (!cancelled) {
                const selected = passive.details.escapeCapture;
                check(selected && selected.popover[0] === (scenario === 'descendant-popup-closing' ? 1 : 0), 'passive_selected_popover_unproved');
                check(selected.tooltip[0] === 0, 'unexpected_native_tooltip');
                if (scenario === 'descendant-popup-closing') check(selected.popover[1] === 1 && selected.popover[2] === 1, 'passive_closing_popover_unproved');
              }
            }
          } catch { receipt.failures.push({ phase: 'passive-capture', code: 'passive_capture_or_control_failed' }); }
          // Always attempt the actual observer finish, even if control cleanup or
          // validation failed. Duplicate finish has no effect after a normal close.
          try { await page?.evaluate(finishMobileNavigationObserver); }
          catch { receipt.failures.push({ phase: 'cleanup', code: 'passive_finish_failed' }); }
          try { await page?.evaluate(owner => {
            const control = window.__tgPassiveCancellationControl;
            if (control?.owner === owner) control.cleanup();
          }, cancellationOwner); }
          catch { receipt.failures.push({ phase: 'cleanup', code: 'cancellation_listener_cleanup_failed' }); }
          try {
            const result = await page.evaluate(() => window.mobileNavigationControl.dispose());
            check(result.componentDisposed && result.observerDisposed && !result.overflow && result.remaining.keydown === 0 && result.remaining.compositionend === 0, 'component_cleanup_failed');
            caseResult.componentCleanup = result;
          } catch { receipt.failures.push({ phase: 'cleanup', code: 'component_cleanup_failed' }); }
          try { write('control-cases.json', cases); }
          catch { receipt.failures.push({ phase: 'capture', code: 'capture_write_failed' }); }
          try { await page?.close(); page = null; }
          catch { receipt.failures.push({ phase: 'cleanup', code: 'page_close_failed' }); }
        }
      }
      const componentCleanup = { verified: cases.length === 3 && cases.every(item => item.componentCleanup?.componentDisposed === true && item.componentCleanup?.observerDisposed === true && item.passiveCapture?.disposed === true) };
      check(componentCleanup.verified, 'component_cleanup_failed');
      check(externalRequests === 0 && pageErrors === 0 && consoleErrors === 0 && !browserCounterOverflow, 'browser_boundary_failed');
      receipt.browsers.push({ name, version: browser.version(), bundleSha256: bundleHash, nativeCases: cases, externalRequests, pageErrors, consoleErrors, browserCounterOverflow, componentCleanup });
      await race(context.close()); context = null; await race(browser.close()); browser = null; await race(browserServer.close()); browserServer = null; sample();
      };
      await race(runBrowser());
    }
    sameSources(binding); for (const [file, digest] of Object.entries(receipt.bundle.inputHashes)) check(sha(fs.readFileSync(file)) === digest, 'bundle_input_changed');
  } catch (error) { receipt.failures.push({ phase: receipt.step || 'setup', code: /^[a-z0-9_]+$/u.test(error.code || '') ? error.code : 'native_harness_failed', errorCode: /^[a-z0-9_]+$/u.test(error.code || '') ? error.code : null }); }
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
    receipt.ownership = registry.evidence(); receipt.finishedAt = Date.now(); receipt.elapsedMs = performance.now() - startedMono; receipt.withinDeadline = receipt.elapsedMs <= 900000; receipt.nativePass = receipt.browsers.length === 1 && receipt.failures.length === 0 && receipt.cleanup.verified && receipt.withinDeadline; write('receipt.json', receipt); process.stdout.write(JSON.stringify({ nativePass: receipt.nativePass, receipt: path.join(output, 'receipt.json') }) + '\n'); process.exitCode = receipt.nativePass ? 0 : 1;
  }
}
async function main() { if (process.argv.length === 3 && process.argv[2] === '--help') { console.log('Usage: node scripts/e2e/mobile-navigation-native.cjs --expected-head SHA [--execute --output NEW_ABSOLUTE_DIRECTORY]\nDefault is read-only plan. Execution is15min including120s cleanup reserve,4GiB RSS/12GiB total owned disk,Chromium only. Worktree hashes are intermediate controlled evidence, not canonical qualification.'); return; } const options = parse(process.argv.slice(2)); const binding = sources(options['--expected-head']); if (!options.execute) { console.log(JSON.stringify({ mode: 'plan-only', binding, wallSeconds: 900, cleanupReserveSeconds: 120, rssCapBytes: 4 * 1024 ** 3, totalOwnedDiskCapBytes: 12 * 1024 ** 3, browsers: ['chromium'] })); return; } await execute(options, binding); }
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ nativePass: false, code: error.code || 'preflight_failed' })); process.exitCode = 1; });
module.exports = { parse, sources, validateCapture, BROWSER_DEFINES };
