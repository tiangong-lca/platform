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
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compact = (text) => text.replace(/\s/gu, '');

async function interactiveState(page) {
  return page.evaluate(() => ({
    filters: [...document.querySelectorAll('input[type="search"]')].map((node) => node.value),
    orders: [...document.querySelectorAll('select')].map((node) => node.value),
    rows: [...document.querySelectorAll('[data-report-table] tbody>tr')].map((node) => ({
      label: node.dataset.label,
      hidden: node.hidden,
    })),
    details: [...document.querySelectorAll('details')].map((node) => node.open),
    counts: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent),
  }));
}

async function assertCompletePrint(page, view) {
  assert.equal(await page.locator('[data-catalog-id]:visible').count(), 58);
  assert.equal(await page.locator('[data-requirement-id]:visible').count(), 20);
  assert.equal(await page.locator('[data-category-id]:visible').count(), 25);
  assert.equal(await page.locator('.controls:visible').count(), 0);
  assert.equal(await page.locator('.evidence-disclosure>details:visible').count(), 0);
  assert.equal(
    await page.locator('.print-evidence:visible').count(),
    await page.locator('.print-evidence').count(),
  );
  for (const fact of view.methodAssessment.factCatalog) {
    const record = page.locator(`[data-catalog-id="${fact.factId}"] .print-evidence`);
    assert.equal(await record.isVisible(), true);
    const text = await record.innerText();
    assert.ok(text.includes('unitIdentity'));
    assert.ok(text.includes(fact.unitIdentity.kind));
    assert.ok(text.includes(view.methodAssessment.factsRef.contentHash));
    if ('referenceQuantityId' in fact.unitIdentity)
      assert.ok(text.includes(fact.unitIdentity.referenceQuantityId));
  }
}

function assertPdfText(pdf, view) {
  const textPath = pdf.replace(/\.pdf$/u, '.txt');
  execFileSync('pdftotext', ['-layout', pdf, textPath]);
  const text = compact(fs.readFileSync(textPath, 'utf8'));
  for (const fact of view.methodAssessment.factCatalog) {
    assert.ok(text.includes(compact(fact.factId)), `PDF omits fact ${fact.factId}`);
    if ('referenceQuantityId' in fact.unitIdentity)
      assert.ok(text.includes(compact(fact.unitIdentity.referenceQuantityId)));
  }
  for (const requirement of view.methodAssessment.requirements) {
    assert.ok(text.includes(requirement.requirementId));
    for (const citation of requirement.sourceCitations) assert.ok(text.includes(compact(citation)));
    for (const check of requirement.machine.checks)
      assert.ok(text.includes(compact(check.predicateId)));
  }
  for (const category of view.methodAssessment.categories)
    assert.ok(text.includes(compact(category.referenceQuantityId)));
  assert.equal((text.match(/unitIdentity/gu) ?? []).length, 58);
  const expectedReferenceQuantityFields =
    view.methodAssessment.categories.length +
    view.methodAssessment.factCatalog.filter((fact) => 'referenceQuantityId' in fact.unitIdentity)
      .length;
  assert.equal((text.match(/referenceQuantityId/gu) ?? []).length, expectedReferenceQuantityFields);
  for (const fact of view.methodAssessment.factCatalog) {
    const start = text.indexOf(compact(fact.factId));
    const finish = text.indexOf('Sourcefact' + compact(fact.factId), start);
    assert.ok(finish > start, `PDF omits exact fact source footer ${fact.factId}`);
    const record = text.slice(start, finish);
    for (const reason of fact.reasonCodes)
      assert.ok(record.includes(compact(reason)), `PDF omits fact reason ${fact.factId}`);
    const pairs = [];
    const collect = (value) => {
      if (Array.isArray(value)) {
        for (const entry of value) collect(entry);
        return;
      }
      if (value !== null && typeof value === 'object')
        for (const [key, entry] of Object.entries(value)) {
          if (entry === null) pairs.push(key + ':Notsupplied(null)');
          else if (typeof entry === 'object') collect(entry);
          else pairs.push(key + ':' + compact(String(entry)));
        }
    };
    collect(fact);
    for (const pair of new Set(pairs))
      assert.ok(
        record.split(pair).length - 1 >= pairs.filter((item) => item === pair).length,
        `PDF omits fact field ${pair} for ${fact.factId}`,
      );
  }

  for (const key of [
    'sourceApplicability',
    'sourceCheckKind',
    'evidenceRefs',
    'referenceQuantityId',
  ])
    assert.ok(text.includes(key), `PDF omits evidence field ${key}`);
  assert.ok(text.includes(view.methodAssessment.factsRef.contentHash));
  assert.ok(text.includes('interactivefiltersareignored'));
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  const pages = Number(/^Pages:\s+(\d+)$/mu.exec(info)?.[1]);
  assert.ok(pages > 0 && pages <= 160, `Synthetic fixture pagination is unusable: ${pages} pages`);
  return {
    path: pdf,
    sha256: sha(fs.readFileSync(pdf)),
    pages,
    allCatalogFacts: 58,
    unitIdentityRecords: (text.match(/unitIdentity/gu) ?? []).length,
  };
}

test(
  'packed method printing includes filtered facts and closed evidence without JS or state mutation',
  { timeout: 180000 },
  async () => {
    const built = await buildRenderer();
    const receipt = JSON.parse(fs.readFileSync(path.join(built.output, 'archive.json'), 'utf8'));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-print-'));
    const output = path.join(root, '.local/study-report/print');
    fs.mkdirSync(output, { recursive: true });
    const records = [],
      pdfs = [];
    let contextsCreated = 0,
      contextsClosed = 0,
      browsersClosed = 0;
    try {
      execFileSync('tar', ['-xzf', path.join(built.output, built.archiveName), '-C', temp]);
      const renderer = await import(pathToFileURL(path.join(temp, 'package/index.js')).href);
      const view = JSON.parse(
        fs.readFileSync(path.join(root, 'tests/fixtures/study-report/view-v3.json'), 'utf8'),
      );
      const contextData = JSON.parse(
        fs.readFileSync(path.join(root, 'tests/fixtures/study-report/context-v1.json'), 'utf8'),
      );
      const html = await renderer.renderReport(view, contextData);
      fs.writeFileSync(path.join(output, 'report.html'), html);
      for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
        const browser = await browserType.launch();
        try {
          for (const javaScriptEnabled of [true, false]) {
            const context = await browser.newContext({
              javaScriptEnabled,
              viewport: { width: 1280, height: 900 },
            });
            contextsCreated++;
            try {
              const url = 'http://127.0.0.1:39139/packed-print-report.html';
              const requests = [];
              await context.route('**/*', (route) => route.abort('blockedbyclient'));
              context.on('request', (request) => requests.push(request.url()));
              const page = await context.newPage();
              await page.route(url, (route) =>
                route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
              );
              await page.goto(url);
              await context.setOffline(true);
              assert.equal(await page.locator('[data-catalog-id]').count(), 58);
              if (javaScriptEnabled) {
                const catalog = page.locator('#method-catalog');
                await catalog
                  .getByLabel('Filter method facts')
                  .fill(view.methodAssessment.factCatalog[0].factId);
                await catalog
                  .getByLabel('Method fact order', { exact: true })
                  .selectOption('descending');
                assert.equal(await catalog.locator('[data-catalog-id]:visible').count(), 1);
                await catalog.locator('[data-catalog-id]:visible details summary').first().click();
                for (const table of await page
                  .locator('[data-report-table]:not(#method-catalog)')
                  .all())
                  await table
                    .getByLabel('Filter facts')
                    .fill('no supplied fact matches this filter');
              } else {
                assert.equal(await page.locator('.controls:visible').count(), 0);
                assert.equal(await page.getByText(/^Read-only reading copy:/u).isVisible(), true);
                const nativeDetails = page.locator('#method-catalog details').first();
                await nativeDetails.locator('summary').click();
                assert.equal(await nativeDetails.getAttribute('open'), '');
              }
              const before = await interactiveState(page);
              await page.emulateMedia({ media: 'print' });
              await assertCompletePrint(page, view);
              assert.deepEqual(await interactiveState(page), before);
              if (engine === 'chromium') {
                const pdf = path.join(
                  output,
                  javaScriptEnabled ? 'filtered-closed-evidence.pdf' : 'javascript-disabled.pdf',
                );
                await page.pdf({
                  path: pdf,
                  format: 'A4',
                  printBackground: true,
                  margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
                });
                pdfs.push(assertPdfText(pdf, view));
              }
              await page.emulateMedia({ media: 'screen' });
              assert.deepEqual(await interactiveState(page), before);
              assert.equal(
                await page.locator('[data-catalog-id]:visible').count(),
                javaScriptEnabled ? 1 : 58,
              );
              assert.equal(await page.locator('.print-evidence:visible').count(), 0);
              assert.deepEqual(
                requests.filter((request) => request !== url),
                [],
              );
              records.push({
                engine,
                javaScriptEnabled,
                printedFacts: 58,
                requirements: 20,
                categories: 25,
                completeEvidence: true,
                interactiveStatePreserved: true,
                unexpectedRequests: 0,
              });
            } finally {
              await context.close();
              contextsClosed++;
            }
          }
        } finally {
          await browser.close();
          browsersClosed++;
        }
      }
      fs.writeFileSync(
        path.join(output, 'print-proof.json'),
        JSON.stringify(
          {
            schemaVersion: 'lca.study-renderer-print-proof.v1',
            sourceCommit: built.manifest.sourceCommit,
            sourceDirty: built.manifest.sourceDirty,
            sourceDigest: built.manifest.sourceDigest,
            archiveSha256: receipt.sha256,
            manifestSha256: receipt.manifestSha256,
            htmlSha256: sha(Buffer.from(html)),
            records,
            pdfs,
            contextsCreated,
            contextsClosed,
            browsersClosed,
            noServerStarted: true,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
      assert.equal(fs.existsSync(temp), false);
    }
  },
);
