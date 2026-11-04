import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { renderStudyPreview } from '../../src/pages/Study/preview.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const playwrightVersion = require('@playwright/test/package.json').version;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtureNames = ['view-v1.json', 'view-v2.json', 'view-advanced-v2.json'];
const fixtures = fixtureNames.map((name) => ({
  name,
  view: JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/study-report', name), 'utf8')),
}));
const sourcePaths = [
  'src/pages/Study/preview.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.nvmrc',
  'docker/e2e/environment.json',
  'tests/browser/studyPreviewNavigation.test.mjs',
  ...execFileSync('git', ['ls-files', 'src/standalone/studyReport'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n'),
  ...fixtureNames.map((name) => 'tests/fixtures/study-report/' + name),
];
const sourceBindings = () =>
  sourcePaths.map((name) => ({
    path: name,
    sha256: sha256(fs.readFileSync(path.join(root, name))),
  }));
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

// Explicitly selected native component proof, independent of the portable export
// package and authenticated application/runtime qualification. No backend or auth.
test(
  'online srcdoc chapter links retain document/report identity, requests and keyboard controls',
  { timeout: 180000 },
  async () => {
    assert.equal(
      process.version.replace(/^v/u, ''),
      fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(),
    );
    assert.equal(
      playwrightVersion,
      JSON.parse(fs.readFileSync(path.join(root, 'docker/e2e/environment.json'), 'utf8'))
        .playwrightVersion,
    );
    const bindings = sourceBindings();
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const sourceDirty = Boolean(
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    );
    const records = [];
    let contextsCreated = 0;
    let contextsClosed = 0;
    let browsersClosed = 0;
    let failure;
    const server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      const url = new URL(request.url, 'http://localhost');
      if (request.headers['sec-fetch-dest'] === 'iframe')
        return response.end('<!doctype html><h1>Host application response</h1>');
      const fixture = fixtures[Number(url.searchParams.get('fixture'))];
      let preview = renderStudyPreview(fixture.view);
      if (url.searchParams.get('control') === 'relative')
        preview = preview.replaceAll('href="about:srcdoc#', 'href="#');
      response.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><h1>Embedding application</h1><iframe title="Report preview" sandbox="allow-scripts" style="display:block;width:100%;height:500px;border:0" srcdoc="' +
          escapeAttribute(preview) +
          '"></iframe></body></html>',
      );
    });
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
        const browser = await browserType.launch({ headless: true });
        try {
          const cases = [
            ...['keyboard', 'mouse'].map((activation) => ({
              fixture: 2,
              width: 390,
              activation,
              control: 'relative',
            })),
            ...fixtures.flatMap((_fixture, fixture) =>
              [390, 1280].flatMap((width) =>
                ['keyboard', 'mouse'].map((activation) => ({
                  fixture,
                  width,
                  activation,
                  control: 'current',
                })),
              ),
            ),
          ];
          for (const entry of cases) {
            const context = await browser.newContext({
              viewport: { width: entry.width, height: 844 },
              serviceWorkers: 'allow',
            });
            contextsCreated++;
            try {
              context.setDefaultTimeout(10000);
              const requests = [],
                blocked = [],
                errors = [];
              await context.route('**/*', (route) => {
                if (new URL(route.request().url()).origin === origin) return route.continue();
                blocked.push(route.request().url());
                return route.abort();
              });
              context.on('request', (request) => requests.push(request.url()));
              const page = await context.newPage();
              page.on('pageerror', (error) => errors.push(error.message));
              const hostUrl = `${origin}/host?fixture=${entry.fixture}&control=${entry.control}#/study-report?id=synthetic-frozen-report`;
              await page.goto(hostUrl, { waitUntil: 'networkidle' });
              const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
              const view = fixtures[entry.fixture].view;
              await frame.getByRole('heading', { name: view.report.title, exact: true }).waitFor();
              const policy = await frame
                .locator('meta[http-equiv="Content-Security-Policy"]')
                .getAttribute('content');
              assert.match(policy, /base-uri 'none'; form-action 'none'/u);
              assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
              await frame.evaluate(() => {
                window.__previewDocument = document.documentElement;
                window.__previewPolicyViolations = [];
                document.addEventListener('securitypolicyviolation', (event) =>
                  window.__previewPolicyViolations.push(event.violatedDirective),
                );
              });
              const startRequests = requests.length;
              const sections =
                entry.control === 'relative'
                  ? [['Results', 'results']]
                  : [
                      ['Results', 'results'],
                      ['Sources and limitations', 'evidence'],
                      ['Frozen identities', 'identity'],
                      ['Goal and scope', 'scope'],
                    ];
              for (const [label, id] of sections) {
                const expected =
                  entry.control === 'relative'
                    ? `${origin}/host?fixture=${entry.fixture}&control=relative#${id}`
                    : 'about:srcdoc#' + id;
                const navigation = frame.waitForURL(expected, { waitUntil: 'load' });
                const link = frame.getByRole('link', { name: label, exact: true });
                if (entry.activation === 'keyboard') {
                  await link.focus();
                  await link.press('Enter');
                } else await link.click();
                await navigation;
                if (entry.control === 'current') {
                  assert.equal(
                    await frame.evaluate(
                      () => window.__previewDocument === document.documentElement,
                    ),
                    true,
                  );
                  assert.equal(
                    await frame
                      .getByRole('heading', { name: view.report.title, exact: true })
                      .count(),
                    1,
                  );
                  assert.equal(page.url(), hostUrl);
                  assert.equal(requests.length, startRequests);
                  const section = await frame.locator('#' + id).boundingBox();
                  const frameBox = await page.locator('iframe').boundingBox();
                  assert.ok(
                    section.y >= frameBox.y - 1 && section.y < frameBox.y + frameBox.height,
                    'target section is within the same frame viewport',
                  );
                }
              }
              if (entry.control === 'relative') {
                await frame.waitForLoadState('networkidle');
                assert.equal(
                  await frame.evaluate(() => window.__previewDocument === document.documentElement),
                  false,
                );
                assert.ok(requests.length > startRequests);
                assert.equal(page.url(), hostUrl);
              } else {
                const table = frame.locator('[data-report-table]').first();
                const rows = table.locator('tbody tr');
                const originalRows = await rows.allTextContents();
                const label = (await rows.first().locator('th').textContent()).trim();
                const filter = table.getByLabel('Filter facts');
                await filter.focus();
                await filter.pressSequentially(label);
                const expectedVisible = originalRows.filter((text) =>
                  text.toLocaleLowerCase('en-US').includes(label.toLocaleLowerCase('en-US')),
                ).length;
                assert.ok(expectedVisible > 0 && expectedVisible < originalRows.length);
                assert.equal(
                  await table.locator('tbody tr:not([hidden])').count(),
                  expectedVisible,
                );
                assert.equal(
                  await table.getByRole('status').textContent(),
                  `${expectedVisible} of ${originalRows.length} facts shown`,
                );
                await filter.press('ControlOrMeta+A');
                await filter.press('Backspace');
                assert.deepEqual(await rows.allTextContents(), originalRows);
                assert.equal(
                  await table.locator('tbody tr:not([hidden])').count(),
                  originalRows.length,
                );
                const originalLabels = await rows.locator('th').allTextContents();
                const ascending = originalLabels
                  .slice()
                  .sort((left, right) =>
                    left.toLocaleLowerCase('en-US') < right.toLocaleLowerCase('en-US') ? -1 : 1,
                  );
                const order = table.getByLabel('Order', { exact: true });
                await order.focus();
                // Native select type-ahead cycles the two fixed English "Label" options.
                // Popup/Home gestures vary between the pinned browser engines.
                await page.keyboard.press('l');
                assert.equal(await order.inputValue(), 'ascending');
                assert.deepEqual(await rows.locator('th').allTextContents(), ascending);
                await page.keyboard.press('l');
                assert.equal(await order.inputValue(), 'descending');
                assert.deepEqual(
                  await rows.locator('th').allTextContents(),
                  ascending.slice().reverse(),
                );
                assert.deepEqual(
                  (await rows.allTextContents()).slice().sort(),
                  originalRows.slice().sort(),
                );
                const summary = rows.first().locator('summary');
                assert.equal(await rows.first().locator('details').getAttribute('open'), null);
                await summary.focus();
                await summary.press('Enter');
                assert.equal(await rows.first().locator('details').getAttribute('open'), '');
                const scroll = table.getByRole('region');
                await scroll.focus();
                if (entry.width === 390) {
                  assert.ok(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth));
                  await scroll.evaluate((node) => {
                    node.scrollLeft = 0;
                  });
                  assert.equal(await scroll.evaluate((node) => node.scrollLeft), 0);
                  if (engine === 'webkit') {
                    // The unmodified browser baseline has no ArrowRight scrolling.
                    // This case claims native wheel access, never a universal arrow gesture.
                    await scroll.hover();
                    await page.mouse.wheel(120, 0);
                  } else await scroll.press('ArrowRight');
                  await frame.waitForFunction(
                    () => document.querySelector('.table-scroll').scrollLeft > 0,
                  );
                }
                assert.equal(
                  await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
                  true,
                );
                assert.equal(
                  await frame.evaluate(() => window.__previewDocument === document.documentElement),
                  true,
                );
                assert.equal(requests.length, startRequests);
                assert.deepEqual(await frame.evaluate(() => window.__previewPolicyViolations), []);
              }
              assert.deepEqual(errors, []);
              assert.deepEqual(blocked, []);
              records.push({
                engine,
                version: browser.version(),
                fixtureName: fixtures[entry.fixture].name,
                ...entry,
                reportRevisionId: view.report.reportRevisionId,
                reportContentHash: view.report.contentHash,
                sourceRequestCount: startRequests,
                additionalRequests: requests.length - startRequests,
                parentUnchanged: page.url() === hostUrl,
                frameUrl: frame.url(),
                horizontalInput:
                  entry.width === 390
                    ? engine === 'webkit'
                      ? 'nativeHorizontalWheel'
                      : 'nativeArrowRight'
                    : null,
                orderInput: entry.control === 'current' ? 'nativeTypeaheadRepeatedL' : null,
                tableKeyboard: entry.control === 'current' ? ['filter', 'order', 'evidence'] : [],
                passed: true,
              });
            } finally {
              await context.close();
              contextsClosed++;
            }
          }
        } finally {
          await browser.close();
          assert.equal(browser.isConnected(), false);
          browsersClosed++;
        }
      }
      assert.deepEqual(sourceBindings(), bindings);
    } catch (error) {
      failure = error;
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
    const proof = {
      schemaVersion: 'lca.study-online-preview-native.v1',
      sourceCommit,
      sourceDirty,
      sourceBindings: bindings,
      toolchain: {
        node: process.version,
        nodeBinarySha256: sha256(fs.readFileSync(process.execPath)),
        playwrightVersion,
      },
      classification:
        'isolated native component proof; no credentials/backend or actual application qualification',
      passed: !failure,
      records,
      contextsCreated,
      contextsClosed,
      browsersClosed,
      serverClosed: !server.listening,
    };
    const output = path.join(root, '.local/study-report');
    fs.mkdirSync(output, { recursive: true });
    const proofPath = path.join(output, `online-preview-navigation-${Date.now()}.json`);
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
    console.log(
      JSON.stringify({
        passed: !failure,
        proofPath,
        cases: records.length,
        contextsCreated,
        contextsClosed,
        browsersClosed,
        serverClosed: !server.listening,
      }),
    );
    if (failure) throw failure;
    assert.equal(contextsCreated, contextsClosed);
    assert.equal(browsersClosed, 3);
  },
);
