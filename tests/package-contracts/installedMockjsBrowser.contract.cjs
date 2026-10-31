// Explicit native-browser proof, separate from the normal non-browser full gate.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const engines = require('@playwright/test');
const { mergeContract } = require('./mockjsMergeFixture.cjs');
const { onePackage, packageFromParent } = require('./auditPackageResolution.cjs');
const openapi = packageFromParent(onePackage('@umijs/max-plugin-openapi'), '@umijs/openapi');
const installed = packageFromParent(openapi, 'mockjs');
const directory = process.env.MOCKJS_CONTRACT_PACKAGE || installed.directory;
const baseline = process.env.MOCKJS_CONTRACT_BASELINE === 'true';
for (const name of ['chromium', 'firefox', 'webkit']) {
  test(
    `${name} real unminified/minified global and AMD merge behavior`,
    { timeout: 30_000 },
    async () => {
      let browser;
      const receipts = [];
      try {
        browser = await engines[name].launch({ headless: true });
        for (const filename of ['mock.js', 'mock-min.js']) {
          for (const mode of ['browser', 'amd']) {
            const context = await browser.newContext({ offline: true });
            let requests = 0;
            context.on('request', () => requests++);
            await context.route('**/*', (route) => route.abort());
            try {
              const fixturePage = await context.newPage();
              const errors = [];
              fixturePage.on('pageerror', (error) => errors.push(error.message));
              if (mode === 'amd')
                await fixturePage.evaluate(() => {
                  window.define = (_dependencies, factory) => {
                    window.ownedMock = factory();
                  };
                  window.define.amd = {};
                });
              await fixturePage.addScriptTag({ path: path.join(directory, 'dist', filename) });
              const receipt = await fixturePage.evaluate(
                `(${mergeContract.toString()})((window.ownedMock || window.Mock).Util, ${baseline})`,
              );
              assert.equal(receipt.checks, baseline ? 36 : 41);
              assert.equal(receipt.prototypesRestored, true);
              assert.deepEqual(
                await fixturePage.evaluate(() => {
                  const Mock = window.ownedMock || window.Mock;
                  Mock.Random.extend({
                    owned1384() {
                      return 'maintained';
                    },
                  });
                  return [Mock.mock('@OWNED1384'), Mock.mock({ 'list|2': [{ value: 1 }] })];
                }),
                ['maintained', { list: [{ value: 1 }, { value: 1 }] }],
              );
              assert.deepEqual(errors, []);
              assert.equal(requests, 0);
              receipts.push({ filename, mode, ...receipt });
            } finally {
              await context.close();
              assert.equal(browser.contexts().includes(context), false);
            }
          }
        }
        assert.equal(browser.contexts().length, 0);
      } finally {
        if (browser) {
          await browser.close();
          assert.equal(browser.isConnected(), false);
        }
      }
      console.log(
        JSON.stringify({
          engine: name,
          receipts,
          contextsClosed: true,
          browserClosed: true,
          networkRequests: 0,
        }),
      );
    },
  );
}
