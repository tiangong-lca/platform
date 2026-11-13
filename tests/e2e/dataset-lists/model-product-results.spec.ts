import { test, expect } from '../i18n/fixtures';
import { signInViaUi } from '../i18n/auth';
import { APP_LOCALES, selectAppLocaleThroughUi, getLocaleMessage } from '../i18n/contracts';
import { datasetRow, installDatasetListFixture } from './fixture';

test.use({ semanticPersona: 'data_product_manager' });
test.skip(process.env.E2E_QUALIFICATION !== 'true', 'Requires the closed synthetic backend.');

test('keeps the primary result separate from other products and hides allocated providers', async ({
  page,
}, testInfo) => {
  await installDatasetListFixture(page);
  const primary = datasetRow('process', 0);
  const intermediate = datasetRow('process', 1);
  const coproduct = datasetRow('process', 2);
  const provider = datasetRow('process', 3);
  await page.route('**/rest/v1/lifecyclemodels*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    expect(new URL(route.request().url()).origin).toBe('https://semantic-harness.invalid');
    await route.fulfill({
      json: [
        {
          ...datasetRow('lifecyclemodel', 0),
          json_tg: {
            xflow: { nodes: [], edges: [] },
            submodels: [
              { id: primary.id, version: primary.version, type: 'primary' },
              { id: intermediate.id, version: intermediate.version, type: 'secondary' },
              { id: coproduct.id, version: coproduct.version, type: 'secondary' },
              { id: provider.id, version: provider.version, type: 'allocated' },
            ],
          },
        },
      ],
    });
  });
  await signInViaUi(page);
  for (const locale of APP_LOCALES) {
    await page.goto('/#/tgdata/models');
    await selectAppLocaleThroughUi(page, locale);
    const root = page.locator('.responsive-data-list-viewport').first();
    await expect(root.locator('.ant-table-tbody > tr[data-row-key]')).toHaveCount(50);
    await root
      .locator('.ant-table-tbody > tr[data-row-key]')
      .first()
      .getByRole('button', { name: 'profile' })
      .click();
    const modelView = page.locator('.ant-drawer:visible').last();
    await expect(modelView).toBeVisible();
    await modelView.getByRole('button', { name: 'product' }).click();
    const result = page.getByRole('dialog', {
      name: getLocaleMessage(locale, 'pages.button.model.result'),
      exact: true,
    });
    const tables = result.locator('.responsive-data-list-table');
    await expect(tables).toHaveCount(2);
    await expect(tables.first()).toContainText(
      getLocaleMessage(locale, 'pages.lifeCycleModel.modelResults.mainProduct'),
    );
    await expect(tables.last()).toContainText(
      getLocaleMessage(locale, 'pages.lifeCycleModel.modelResults.subProduct'),
    );
    await expect(tables.first().locator('.ant-table-tbody > tr[data-row-key]')).toHaveCount(1);
    await expect(tables.last().locator('.ant-table-tbody > tr[data-row-key]')).toHaveCount(2);
    await expect(
      tables.first().locator(`tr[data-row-key="${primary.id}:${primary.version}"]`),
    ).toBeVisible();
    await expect(
      tables.last().locator(`tr[data-row-key="${intermediate.id}:${intermediate.version}"]`),
    ).toBeVisible();
    await expect(
      result.locator(`tr[data-row-key="${provider.id}:${provider.version}"]`),
    ).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: testInfo.outputPath(`product-results-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.reload();
  }
});
