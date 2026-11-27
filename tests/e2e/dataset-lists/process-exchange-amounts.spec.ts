import { signInViaUi } from '../i18n/auth';
import { getLocaleMessage, selectAppLocaleThroughUi } from '../i18n/contracts';
import { expect, test } from '../i18n/fixtures';
import { datasetRow, installDatasetListFixture } from './fixture';

test.use({ semanticPersona: 'data_product_manager' });

test('exchange editor synchronizes static amounts and preserves variable amounts', async ({
  page,
}) => {
  test.skip(process.env.E2E_QUALIFICATION !== 'true', 'Requires the synthetic backend.');
  await installDatasetListFixture(page);
  await signInViaUi(page);
  const locale = 'en-US';
  const message = (id: string) => getLocaleMessage(locale, id);
  await selectAppLocaleThroughUi(page, locale);
  await page.setViewportSize({ width: 1440, height: 900 });
  const processRow = datasetRow('process', 0);
  await page.goto(`/#/mydata/processes?id=${processRow.id}&version=${processRow.version}`);
  const processDrawer = page.getByRole('dialog', {
    name: message('pages.process.drawer.title.edit'),
    exact: true,
  });
  await processDrawer
    .getByRole('tab', { name: message('pages.process.view.exchanges'), exact: true })
    .click();
  await processDrawer
    .locator('.process-exchange-table')
    .first()
    .getByRole('button', { name: message('pages.button.create'), exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: message('pages.process.exchange.drawer.title.create'),
    exact: true,
  });
  const mean = editor.getByLabel(message('pages.process.view.exchange.meanAmount'), {
    exact: true,
  });
  const result = editor.getByLabel(message('pages.process.view.exchange.resultingAmount'), {
    exact: true,
  });
  const variable = editor.getByLabel(message('pages.process.view.exchange.referenceToVariable'), {
    exact: true,
  });
  await mean.fill('0.306');
  await expect(result).toHaveValue('0.306');
  await result.fill('0.307');
  await expect(mean).toHaveValue('0.307');
  await variable.fill('factor');
  await result.fill('306.0');
  await expect(mean).toHaveValue('0.307');
  await variable.fill('');
  await expect(
    editor.getByText(message('pages.process.exchange.amountConflict'), { exact: true }),
  ).toBeVisible();
  await mean.fill('0');
  await expect(result).toHaveValue('0');
  await expect(
    editor.getByText(message('pages.process.exchange.amountConflict'), { exact: true }),
  ).toHaveCount(0);
});
