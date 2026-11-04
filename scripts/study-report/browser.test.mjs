import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { buildRenderer } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function observeAttempts(context) {
  await context.addInitScript(() => {
    window.__studyObservation = { violations: [], attempts: [] };
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__studyObservation.violations.push(event.violatedDirective + ':' + event.blockedURI),
    );
    for (const name of ['fetch', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker']) {
      if (typeof window[name] === 'function') {
        const Original = window[name];
        window[name] = new Proxy(Original, {
          apply(target, receiver, args) {
            window.__studyObservation.attempts.push(name);
            return Reflect.apply(target, receiver, args);
          },
          construct(target, args) {
            window.__studyObservation.attempts.push(name);
            return Reflect.construct(target, args);
          },
        });
      }
    }
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      window.__studyObservation.attempts.push('XMLHttpRequest');
      return Reflect.apply(open, this, args);
    };
    if (navigator.sendBeacon)
      navigator.sendBeacon = () => {
        window.__studyObservation.attempts.push('sendBeacon');
        return false;
      };
    if (navigator.serviceWorker)
      navigator.serviceWorker.register = async () => {
        window.__studyObservation.attempts.push('serviceWorker');
        throw new Error('Observed forbidden service worker');
      };
  });
}

async function observeNativeFaviconBaseline(browser) {
  const documentUrl = 'http://127.0.0.1:39139/native-baseline.html';
  const favicon = 'img-src:http://127.0.0.1:39139/favicon.ico';
  const context = await browser.newContext();
  const requests = [];
  context.on('request', (request) => requests.push(request.url()));
  try {
    await observeAttempts(context);
    const page = await context.newPage();
    await page.route(documentUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'none'"><title>Native baseline</title></head><body><p>No product scripts, styles, links or images.</p></body></html>`,
      }),
    );
    await page.goto(documentUrl);
    await page.waitForTimeout(200);
    const observation = await page.evaluate(() => window.__studyObservation);
    assert.deepEqual(observation.attempts, []);
    assert.deepEqual(
      requests.filter((url) => url !== documentUrl),
      [],
    );
    assert.ok(observation.violations.every((violation) => violation === favicon));
    return {
      favicon,
      observed: observation.violations.length > 0,
      violations: observation.violations,
    };
  } finally {
    await context.close();
  }
}

test('packed method HTML preserves mandatory evidence and local controls offline and at narrow widths', async () => {
  const built = await buildRenderer();
  const archiveIdentity = JSON.parse(
    fs.readFileSync(path.join(built.output, 'archive.json'), 'utf8'),
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-browser-'));
  const proof = path.join(root, '.local/study-report');
  fs.mkdirSync(proof, { recursive: true });
  const records = [];
  try {
    execFileSync('tar', ['-xzf', path.join(built.output, built.archiveName), '-C', temporary]);
    const renderer = await import(pathToFileURL(path.join(temporary, 'package/index.js')).href);
    const view = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v3.json'), 'utf8'),
    );
    const contextData = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/context-v1.json'), 'utf8'),
    );
    // Empty author narrative and tables cannot suppress any mandatory method section.
    view.sections = [];
    view.tables = [];
    view.charts = [];
    view.report.title = '<script>literal</script> Method report';
    view.assumptions = [
      '<img src="https://invalid.example/leak">',
      'https://invalid.example/literal',
      'T'.repeat(2048),
    ];
    const original = JSON.stringify(view);
    const html = await renderer.renderReport(view, contextData);
    assert.equal(JSON.stringify(view), original);
    const htmlPath = path.join(temporary, 'report.html');
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(path.join(proof, 'report.html'), html);
    const engines = { chromium, firefox, webkit };
    const selected = process.env.STUDY_REPORT_BROWSERS?.split(',') ?? ['chromium'];
    for (const browserName of selected) {
      assert.ok(Object.hasOwn(engines, browserName));
      const browser = await engines[browserName].launch();
      try {
        const nativeFavicon = await observeNativeFaviconBaseline(browser);
        for (const offline of [false, true])
          for (const width of [1280, 390]) {
            const context = await browser.newContext({
              offline: false,
              viewport: { width, height: 900 },
              serviceWorkers: 'allow',
            });
            await context.route('**/*', (route) => route.abort('blockedbyclient'));
            const requests = [],
              sockets = [],
              errors = [];
            context.on('request', (request) => requests.push(request.url()));
            context.on('serviceworker', (worker) => sockets.push('serviceworker:' + worker.url()));
            await observeAttempts(context);
            const page = await context.newPage();
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('websocket', (socket) => sockets.push(socket.url()));
            const documentUrl = 'http://127.0.0.1:39139/packed-method-report.html';
            // Fulfil exactly this document with actual packed HTML bytes, including offline.
            // No server/backend is started and every other network request remains forbidden.
            await page.route(documentUrl, (route) =>
              route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: fs.readFileSync(htmlPath),
              }),
            );
            await page.goto(documentUrl);
            await context.setOffline(offline);
            assert.equal(
              await page.getByRole('heading', { name: view.report.title, exact: true }).count(),
              1,
            );
            assert.equal(await page.locator('[data-requirement-id]').count(), 20);
            assert.equal(await page.locator('[data-category-id]').count(), 25);
            assert.equal(await page.locator('[data-catalog-id]').count(), 58);
            for (const requirement of view.methodAssessment.requirements) {
              const text = await page
                .locator(`[data-requirement-id="${requirement.requirementId}"]`)
                .textContent();
              assert.ok(text.includes(requirement.machine.status));
              assert.ok(text.includes(requirement.professional.status));
              const checks = page.locator(
                `[data-requirement-id="${requirement.requirementId}"] .machine-checks`,
              );
              assert.equal(
                await checks.locator(':scope > li').count(),
                requirement.machine.checks.length,
              );
              for (const check of requirement.machine.checks)
                assert.ok((await checks.textContent()).includes(check.predicateId));
            }
            const catalog = page.locator('#method-catalog');
            const firstId = view.methodAssessment.factCatalog[0].factId;
            const filter = catalog.getByLabel('Filter method facts');
            await filter.focus();
            await page.keyboard.type(firstId);
            assert.equal(await catalog.locator('tbody tr:not([hidden])').count(), 1);
            assert.equal(await catalog.getByRole('status').textContent(), '1 of 58 facts shown');
            await filter.fill('');
            const order = catalog.getByLabel('Method fact order', { exact: true });
            await order.focus();
            // Native select type-ahead cycles the fixed English Label options.
            await page.keyboard.press('l');
            assert.equal(await order.inputValue(), 'ascending');
            const labels = await catalog
              .locator('tbody tr')
              .evaluateAll((rows) => rows.map((row) => row.dataset.label));
            assert.deepEqual(
              labels,
              [...labels].sort((a, b) =>
                a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
              ),
            );
            await order.selectOption('original');
            const details = catalog.locator('tbody details').first();
            await details.locator('summary').focus();
            await page.keyboard.press('Enter');
            assert.equal(await details.getAttribute('open'), '');
            assert.ok(
              (await details.textContent()).includes(view.methodAssessment.factsRef.contentHash),
            );
            for (const id of [
              'method-assessment',
              'method-requirements',
              'method-categories',
              'method-catalog',
              'method-sources',
            ]) {
              const link = page.locator(`nav a[href="#${id}"]`);
              await link.focus();
              await page.keyboard.press('Enter');
              assert.equal(new URL(page.url()).hash, '#' + id);
            }
            assert.equal(await page.locator('img,iframe,object,a[href^="http"],base').count(), 0);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              true,
            );
            for (const region of await page.locator('.table-scroll').all()) {
              assert.ok(
                await region.evaluate(
                  (element) => element.getBoundingClientRect().width <= innerWidth,
                ),
              );
            }
            let horizontalGesture = 'not_needed_at_desktop_width';
            if (width === 390) {
              const region = page.getByRole('region', {
                name: 'Method requirements: machine and professional states',
                exact: true,
              });
              await region.focus();
              const before = await region.evaluate((element) => element.scrollLeft);
              if (browserName === 'webkit') {
                await region.hover();
                await page.mouse.wheel(280, 0);
                horizontalGesture = 'native_horizontal_wheel';
              } else {
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight');
                horizontalGesture = 'native_ArrowRight';
              }
              await page.waitForFunction(
                ({ label, before }) =>
                  [...document.querySelectorAll('[role="region"]')].find(
                    (element) => element.getAttribute('aria-label') === label,
                  ).scrollLeft > before,
                { label: 'Method requirements: machine and professional states', before },
              );
            }
            assert.equal(await page.locator('script').count(), 1);
            const observation = await page.evaluate(() => window.__studyObservation);
            assert.deepEqual(observation.attempts, []);
            // A browser-managed favicon check is allowed only after the same engine's
            // no-product baseline reproduced it; CSP must block it before any request.
            assert.ok(
              observation.violations.every(
                (violation) => nativeFavicon.observed && violation === nativeFavicon.favicon,
              ),
            );
            assert.deepEqual(
              requests.filter((url) => url !== documentUrl),
              [],
            );
            assert.deepEqual(sockets, []);
            assert.deepEqual(errors, []);
            await page
              .getByRole('heading', { name: 'All 20 method requirements', exact: true })
              .scrollIntoViewIfNeeded();
            await page.screenshot({
              path: path.join(
                proof,
                `${browserName}-${offline ? 'offline' : 'online'}-${width}.png`,
              ),
              fullPage: false,
            });
            records.push({
              browser: browserName,
              offline,
              width,
              requirements: 20,
              categories: 25,
              catalogFacts: 58,
              requests: requests.length,
              networkAttempts: 0,
              documentTransport: 'loopback_intercept_exact_packed_html_bytes',
              offlineDuringAllControls: offline,
              initialDocumentLocalInterception: true,
              browserManagedFaviconBaseline: nativeFavicon,
              browserManagedFaviconBlockedByCsp: observation.violations.length,
              keyboardControls: true,
              horizontalGesture,
              pageContained: true,
            });
            await context.close();
          }
      } finally {
        await browser.close();
      }
    }
    fs.writeFileSync(
      path.join(proof, 'browser-proof.json'),
      JSON.stringify(
        {
          schemaVersion: 'lca.study-renderer-browser-proof.v1',
          sourceCommit: built.manifest.sourceCommit,
          sourceDirty: built.manifest.sourceDirty,
          sourceDigest: built.manifest.sourceDigest,
          archiveSha256: archiveIdentity.sha256,
          manifestSha256: archiveIdentity.manifestSha256,
          htmlSha256: sha256(Buffer.from(html)),
          records,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
