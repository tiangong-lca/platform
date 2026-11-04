import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
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

test('packed HTML has local-only usable controls in fresh online/offline desktop/mobile contexts', async () => {
  const built = await buildRenderer();
  const archiveIdentity = JSON.parse(
    fs.readFileSync(path.join(built.output, 'archive.json'), 'utf8'),
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'study-report-browser-'));
  const proof = path.join(root, '.local/study-report');
  fs.mkdirSync(proof, { recursive: true });
  const browser = await chromium.launch();
  const records = [];
  try {
    execFileSync('tar', ['-xzf', path.join(built.output, built.archiveName), '-C', temporary]);
    const renderer = await import(pathToFileURL(path.join(temporary, 'package/index.js')).href);
    const view = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v2.json'), 'utf8'),
    );
    const contextData = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/context-v1.json'), 'utf8'),
    );
    const html = await renderer.renderReport(view, contextData);
    const htmlPath = path.join(temporary, 'report.html');
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(path.join(proof, 'report.html'), html);
    for (const offline of [false, true]) {
      for (const width of [1280, 390]) {
        const context = await browser.newContext({
          offline,
          viewport: { width, height: 900 },
          serviceWorkers: 'allow',
        });
        const requests = [];
        const sockets = [];
        const errors = [];
        context.on('request', (request) => requests.push(request.url()));
        context.on('serviceworker', (worker) => sockets.push('serviceworker:' + worker.url()));
        await observeAttempts(context);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('websocket', (socket) => sockets.push(socket.url()));
        await page.goto(pathToFileURL(htmlPath).href);
        assert.equal(await page.getByRole('heading', { name: view.report.title }).count(), 1);
        assert.equal(await page.getByText('Unreviewed', { exact: true }).count(), 1);
        const filter = page.getByLabel('Filter facts');
        await filter.focus();
        await page.keyboard.type('Trace');
        assert.equal(await page.getByRole('status').textContent(), '1 of 6 facts shown');
        assert.equal(await page.locator('tbody tr:not([hidden])').count(), 1);
        assert.match(await page.locator('tbody tr:not([hidden])').textContent(), /5e-324/u);
        await filter.fill('');
        await page.getByLabel('Order', { exact: true }).selectOption('descending');
        assert.match(
          await page.locator('tbody tr').first().textContent(),
          /Uncharacterized particles/u,
        );
        await page.getByLabel('Order', { exact: true }).selectOption('ascending');
        assert.match(await page.locator('tbody tr').first().textContent(), /Alternative direct/u);
        await page.getByLabel('Order', { exact: true }).selectOption('original');
        assert.match(await page.locator('tbody tr').first().textContent(), /Baseline direct/u);
        const evidence = page.locator('tbody summary').first();
        await evidence.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('tbody details').first().getAttribute('open'), '');
        assert.match(await page.locator('tbody details').first().textContent(), /result-baseline/u);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        await page.screenshot({
          path: path.join(proof, `report-${offline ? 'offline' : 'online'}-${width}.png`),
          fullPage: true,
        });
        const observations = await page.evaluate(() => window.__studyObservation);
        assert.deepEqual(observations, { violations: [], attempts: [] });
        assert.deepEqual(
          requests.filter((url) => url !== pathToFileURL(htmlPath).href),
          [],
        );
        assert.deepEqual(sockets, []);
        assert.deepEqual(errors, []);
        records.push({
          offline,
          width,
          requests: requests.length,
          violations: observations.violations,
          attempts: observations.attempts,
          sockets,
          errors,
        });
        await context.close();
      }
    }
    const advanced = JSON.parse(
      fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-advanced-v2.json'), 'utf8'),
    );
    const advancedHtml = await renderer.renderReport(advanced, contextData);
    const advancedPath = path.join(temporary, 'advanced-report.html');
    fs.writeFileSync(advancedPath, advancedHtml);
    for (const offline of [false, true]) {
      for (const width of [1280, 390]) {
        const context = await browser.newContext({ offline, viewport: { width, height: 900 } });
        const requests = [];
        context.on('request', (request) => requests.push(request.url()));
        await observeAttempts(context);
        const page = await context.newPage();
        await page.goto(pathToFileURL(advancedPath).href);
        const parameter = page.locator('tbody tr').filter({ hasText: 'Parameter amount:' });
        assert.match(await parameter.locator('.value').textContent(), /819\.6kg/u);
        await parameter.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await parameter.locator('details').getAttribute('open'), '');
        assert.match(await parameter.locator('details').textContent(), /No LCIA method/u);
        assert.doesNotMatch(await parameter.textContent(), /activity or inventory fact/u);
        const undefinedFact = page
          .locator('tbody tr')
          .filter({ hasText: 'Relative response undefined:' });
        assert.match(await undefinedFact.locator('.value').textContent(), /No numeric value1/u);
        assert.match(
          await undefinedFact.locator('.value').textContent(),
          /Reason codes: zero_baseline_relative_undefined/u,
        );
        assert.match(await undefinedFact.textContent(), /Complete coverage/u);
        assert.match(
          await page.locator('#section-advanced-settings').textContent(),
          /No value is imputed/u,
        );
        assert.equal(await page.locator('#identity details').count(), 1);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        const observations = await page.evaluate(() => window.__studyObservation);
        assert.deepEqual(observations, { violations: [], attempts: [] });
        assert.deepEqual(
          requests.filter((url) => url !== pathToFileURL(advancedPath).href),
          [],
        );
        records.push({
          regression: 'advanced-fact-contexts',
          offline,
          width,
          htmlSha256: sha256(advancedHtml),
          externalRequests: 0,
          ...observations,
        });
        await context.close();
      }
    }
    const stressView = structuredClone(view);
    for (let i = 0; i < 114; i++) {
      stressView.facts.push({
        ...view.facts[0],
        factId: `long-${i}`,
        label: `Long table row ${i} ${'declared inventory evidence '.repeat(6)}`,
      });
    }
    stressView.tables[0].factIds = stressView.facts.map((fact) => fact.factId);
    stressView.charts[0].factIds = stressView.facts.slice(0, 64).map((fact) => fact.factId);
    const stressPath = path.join(temporary, 'long-report.html');
    fs.writeFileSync(stressPath, await renderer.renderReport(stressView, contextData));
    const stressContext = await browser.newContext({
      offline: true,
      viewport: { width: 390, height: 900 },
    });
    const stressRequests = [];
    stressContext.on('request', (request) => stressRequests.push(request.url()));
    const stressPage = await stressContext.newPage();
    await stressPage.goto(pathToFileURL(stressPath).href);
    assert.equal(await stressPage.locator('tbody tr').count(), 120);
    assert.equal(await stressPage.locator('.chart-row').count(), 64);
    await stressPage.getByLabel('Filter facts').fill('Long table row 113');
    assert.equal(await stressPage.getByRole('status').textContent(), '1 of 120 facts shown');
    assert.equal(
      await stressPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(
      stressRequests.filter((url) => url !== pathToFileURL(stressPath).href),
      [],
    );
    records.push({
      offline: true,
      width: 390,
      longTableFacts: 120,
      chartFacts: 64,
      externalRequests: 0,
    });
    await stressContext.close();
    const literals =
      '</script><script>globalThis.__reportXss=1</script><img src="https://example.invalid/pixel" onerror="globalThis.__reportXss=2"> javascript:alert(1) data:text/html,test';
    const cases = [
      {
        name: 'max-title',
        change: (v) => {
          v.report.title = 'T'.repeat(256);
        },
      },
      {
        name: 'max-goal-boundary',
        change: (v) => {
          v.definition.goal = 'G'.repeat(4096);
          v.definition.boundary = 'B'.repeat(4096);
        },
      },
      {
        name: 'max-chart-label',
        change: (v) => {
          v.facts[0].label = 'F'.repeat(1024);
        },
      },
      {
        name: 'max-other-text',
        change: (v) => {
          v.assumptions = ['A'.repeat(8192)];
          v.definition.methodRefs[0].name = 'M'.repeat(256);
          v.runs[0].label = 'R'.repeat(256);
          v.sections[0].paragraphs = ['P'.repeat(2048)];
        },
      },
      {
        name: 'literal-markup-and-urls',
        change: (v) => {
          v.report.title = literals;
          v.definition.goal = literals;
          v.assumptions = [literals];
          v.citations[0].label = 'https://example.invalid/paper';
          v.facts[0].label = literals;
          v.sections[0].paragraphs = [
            literals,
            '<style>@import "https://example.invalid/style";</style>',
          ];
        },
      },
      {
        name: '32-tables-and-remaining-facts',
        change: (v) => {
          v.tables = Array.from({ length: 32 }, (_, i) => ({
            tableId: i === 0 ? 'remaining' : `specified-${i}`,
            title: `Specified table ${i}`,
            factIds: ['baseline-climate'],
          }));
        },
      },
    ];
    for (const regression of cases) {
      const regressionView = structuredClone(view);
      regression.change(regressionView);
      regressionView.report.generatedAt = '2026-11-03T12:00:00.123456+08:00';
      regressionView.snapshot.checkedAt = '2026-11-03T23:00:00.123456789-05:00';
      const before = JSON.stringify(regressionView);
      const regressionPath = path.join(temporary, regression.name + '.html');
      const regressionHtml = await renderer.renderReport(regressionView, contextData);
      assert.equal(JSON.stringify(regressionView), before);
      fs.writeFileSync(regressionPath, regressionHtml);
      const regressionContext = await browser.newContext({
        offline: false,
        viewport: { width: 390, height: 900 },
        serviceWorkers: 'allow',
      });
      const requests = [];
      const sockets = [];
      const errors = [];
      regressionContext.on('request', (request) => requests.push(request.url()));
      regressionContext.on('serviceworker', (worker) =>
        sockets.push('serviceworker:' + worker.url()),
      );
      await observeAttempts(regressionContext);
      const page = await regressionContext.newPage();
      page.on('websocket', (socket) => sockets.push(socket.url()));
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(pathToFileURL(regressionPath).href);
      const geometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      }));
      assert.ok(
        geometry.documentWidth <= geometry.viewportWidth,
        regression.name + ': ' + JSON.stringify(geometry),
      );
      assert.equal(await page.locator('h1').textContent(), regressionView.report.title);
      assert.equal(await page.locator('img,iframe,object,link').count(), 0);
      assert.equal(await page.locator('script').count(), 1);
      assert.equal(await page.locator('style').count(), 1);
      assert.equal(await page.evaluate(() => window.__reportXss), undefined);
      const anchorTargets = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
      assert.ok(anchorTargets.every((target) => target.startsWith('#')));
      if (regression.name === '32-tables-and-remaining-facts') {
        assert.equal(regressionView.tables.length, 32);
        assert.equal(await page.locator('[data-report-table]').count(), 33);
        const remaining = page.locator('#table-remaining');
        assert.equal(await remaining.locator('tbody tr').count(), view.facts.length - 1);
        await remaining.getByLabel('Filter facts').fill('Trace');
        assert.equal(await remaining.getByRole('status').textContent(), '1 of 5 facts shown');
      }
      const ids = await page
        .locator('[id]')
        .evaluateAll((elements) => elements.map((element) => element.id));
      assert.equal(new Set(ids).size, ids.length);
      const observations = await page.evaluate(() => window.__studyObservation);
      assert.deepEqual(observations, { violations: [], attempts: [] });
      assert.deepEqual(
        requests.filter((url) => url !== pathToFileURL(regressionPath).href),
        [],
      );
      assert.deepEqual(sockets, []);
      assert.deepEqual(errors, []);
      records.push({
        regression: regression.name,
        htmlSha256: sha256(regressionHtml),
        offline: false,
        width: 390,
        ...geometry,
        violations: observations.violations,
        attempts: observations.attempts,
        externalRequests: 0,
        sockets,
        errors,
      });
      await regressionContext.close();
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
          reportHtmlSha256: sha256(html),
          rendererVersion: built.manifest.rendererVersion,
          records,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await browser.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
