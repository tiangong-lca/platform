import { signInViaUi } from '../i18n/auth';
import { getLocaleMessage, selectAppLocaleThroughUi } from '../i18n/contracts';
import { expect, test } from '../i18n/fixtures';
import { datasetRow, installDatasetListFixture } from './fixture';

test.use({ semanticPersona: 'data_product_manager' });
test.skip(process.env.E2E_QUALIFICATION !== 'true', 'Requires the closed synthetic backend.');

test('opens the exact linked model and explains unreadable process references', async ({
  page,
}) => {
  await installDatasetListFixture(page);
  const parent = datasetRow('lifecyclemodel', 0);
  const child = { ...datasetRow('lifecyclemodel', 1), version: '01.01.023' };
  const power = { ...datasetRow('process', 0), version: '01.00.001' };
  const solar = { ...datasetRow('process', 1), version: '01.01.000' };
  const newerSolar = { ...solar, version: '01.01.002' };
  const modelVersions: string[] = [];
  const processVersions: string[] = [];
  const node = (id: string, process: typeof power, x: number) => ({
    id,
    shape: 'rect',
    x,
    y: 100,
    width: 270,
    height: 75,
    data: { id: process.id, version: process.version, label: id, name: process.name },
  });

  await page.route('**/rest/v1/lifecyclemodels*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://semantic-harness.invalid' || !url.searchParams.has('id'))
      return route.fallback();
    const id = url.searchParams.get('id');
    const version = url.searchParams.get('version');
    if (id === 'eq.' + child.id) modelVersions.push(String(version));
    const row =
      id === 'eq.' + parent.id && version === 'eq.' + parent.version
        ? {
            ...parent,
            json_tg: {
              xflow: {
                nodes: [node('power-node', power, 80), node('solar-node', solar, 440)],
                edges: [],
              },
            },
          }
        : id === 'eq.' + child.id && version === 'eq.' + child.version
          ? {
              ...child,
              json_tg: { xflow: { nodes: [node('child-result', power, 80)], edges: [] } },
            }
          : undefined;
    await route.fulfill({ json: row ? [row] : [] });
  });
  await page.route('**/rest/v1/processes*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://semantic-harness.invalid') return route.fallback();
    if (url.searchParams.has('or')) {
      const rows =
        url.searchParams.get('or')?.includes(power.id) &&
        Number(url.searchParams.get('offset')) === 0
          ? [{ ...power, model_id: child.id, model_version: child.version }]
          : [];
      return route.fulfill({
        headers: {
          'content-range': rows.length ? '0-0/1' : '*/1',
          'access-control-expose-headers': 'content-range',
        },
        json: rows,
      });
    }
    if (url.searchParams.get('id') !== 'eq.' + solar.id) return route.fallback();
    const version = url.searchParams.get('version');
    processVersions.push(String(version));
    return route.fulfill({ json: version === 'eq.' + newerSolar.version ? [newerSolar] : [] });
  });

  await signInViaUi(page);
  await page.goto('/#/tgdata/models');
  await selectAppLocaleThroughUi(page, 'en-US');
  await page
    .locator('.responsive-data-list-viewport .ant-table-tbody > tr[data-row-key]')
    .first()
    .getByRole('button', { name: 'profile' })
    .click();
  const parentDrawer = page
    .getByRole('dialog', {
      name: getLocaleMessage('en-US', 'pages.flow.model.drawer.title.view'),
      exact: true,
    })
    .first();
  await parentDrawer.locator('g.x6-node[data-cell-id="power-node"]').click();
  await parentDrawer.getByRole('button', { name: 'profile', exact: true }).click();
  const childDrawer = page
    .getByRole('dialog', {
      name: getLocaleMessage('en-US', 'pages.flow.model.drawer.title.view'),
      exact: true,
    })
    .last();
  await expect(childDrawer.locator('g.x6-node[data-cell-id="child-result"]')).toBeVisible();
  expect(modelVersions).toEqual(['eq.01.01.023']);
  await childDrawer.getByRole('button', { name: 'close', exact: true }).click();
  await parentDrawer.locator('g.x6-node[data-cell-id="solar-node"]').click();
  await parentDrawer.getByRole('button', { name: 'profile', exact: true }).click();
  const alert = page
    .getByRole('dialog', {
      name: getLocaleMessage('en-US', 'pages.process.drawer.title.view'),
      exact: true,
    })
    .getByRole('alert');
  await expect(alert).toContainText(getLocaleMessage('en-US', 'pages.datasetDetail.unavailable'));
  await expect(alert).toContainText(solar.id);
  await expect(alert).toContainText(solar.version);
  expect(processVersions).toEqual(['eq.01.01.000']);
});
