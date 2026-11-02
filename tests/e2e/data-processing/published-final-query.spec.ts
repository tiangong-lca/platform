import { expect, test } from '@playwright/test';
import { installDatasetListFixture } from '../dataset-lists/fixture';
const app = process.env.RESULT_PREVIEW_BASE_URL ?? 'http://127.0.0.1:8012';
const id = '11111111-1111-4111-8111-111111111111';
const publicationId = '22222222-2222-4222-8222-222222222222';
const runtimeRevision = '33333333-3333-4333-8333-333333333333';
const resultId = '44444444-4444-4444-8444-444444444444';
const otherId = '55555555-5555-4555-8555-555555555555';
test('original Process selects processed Results, reads pinned HDF5 pages and downloads only authorized ZIPs', async ({
  page,
  context,
}, testInfo) => {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'final-query@example.test',
    app_metadata: {},
    user_metadata: {},
  };
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: id, aud: 'authenticated', role: 'authenticated', exp: 2000000000 })}.fixture`;
  await context.addInitScript(
    ({ user, token }) => {
      localStorage.setItem(
        'sb-semantic-harness-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_at: 2000000000,
          expires_in: 3600,
          user,
        }),
      );
      localStorage.setItem('umi_locale', 'en-US');
    },
    { user, token },
  );
  await installDatasetListFixture(page);
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  const requests: Record<string, any>[] = [];
  let first = true,
    allowZip = false,
    changed = false;
  await page.route('https://result-download.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'content-disposition': 'attachment; filename="result.tidas.zip"' },
      body: 'synthetic ZIP download transport only',
    }),
  );
  await page.route('**/functions/v1/lca_release_results**', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    expect(new URL(route.request().url()).origin).toBe('https://semantic-harness.invalid');
    if (body.mode === 'source_results') {
      expect(body.sourceId).toBe('12130000-0000-4000-8000-000000000001');
      expect(body.sourceVersion).toBe('01.00.000');
      return route.fulfill({
        json: {
          ok: true,
          mode: body.mode,
          data: {
            publication: {
              publicationId,
              releaseVersion: '2026.11.1',
              format: 'final-result-pair.v2',
            },
            results: [resultId, otherId].map((uuid) => ({
              uuid,
              version: '01.00.000',
              relationKind: 'direct',
              lciAvailable: true,
              lciaAvailable: uuid === resultId,
            })),
            nextResultKey: null,
          },
        },
      });
    }
    if (body.mode === 'final_download') {
      expect(body.publicationId).toBe(publicationId);
      if (!allowZip)
        return route.fulfill({
          status: 404,
          json: { ok: false, code: 'RESULT_PACKAGE_NOT_AVAILABLE' },
        });
      return route.fulfill({
        json: {
          ok: true,
          mode: body.mode,
          data: {
            publicationId,
            file: { name: 'result.tidas.zip', sha256: 'a'.repeat(64), byteSize: 100 },
            url: 'https://result-download.invalid/frozen.zip?ephemeral=1',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        },
      });
    }
    expect(body.mode).toBe('final_query');
    expect(body.publicationId).toBe(publicationId);
    if (changed)
      return route.fulfill({ status: 409, json: { ok: false, code: 'RESULT_RUNTIME_CHANGED' } });
    const result = { uuid: body.resultId, version: '01.00.000' };
    const unit = {
      flowPropertyId: id,
      flowPropertyVersion: '01.00.000',
      unitGroupId: id,
      unitGroupVersion: '02.00.000',
      internalId: '0',
      name: 'frozen kg',
    };
    const key = {
      flowId: id,
      flowVersion: '01.00.000',
      direction: 'Output',
      location: 'CN',
      functionType: 'General reminder flow',
      unit,
    };
    const row = {
      ...result,
      relationKind: result.uuid === id ? 'derived' : 'direct',
      quantitativeReference: {
        ...key,
        flowName: 'Processed product',
        flowClassification: [],
        value: -2,
        amountField: 'resultingAmount',
      },
    };
    const common = {
      schemaVersion: 'result.query.response.v2',
      publicationId,
      releaseVersion: '2026.11.1',
      runtimeRevision,
      result,
    };
    if (first) {
      first = false;
      return route.fulfill({
        status: 202,
        json: { ok: true, mode: body.mode, data: { ...common, data: { status: 'preparing' } } },
      });
    }
    if (body.query.kind !== 'overview') expect(body.runtimeRevision).toBe(runtimeRevision);
    const data =
      body.query.kind === 'overview'
        ? { result: row, lciAvailable: true, lciaAvailable: result.uuid === resultId }
        : body.query.kind === 'lcia'
          ? {
              result: row,
              impacts: [
                {
                  method: {
                    id,
                    version: '03.00.001',
                    key: 'climate',
                    name: 'Final climate',
                    unit: 'frozen kg CO2 eq',
                  },
                  amount: 0,
                },
              ],
            }
          : {
              result: row,
              items: [
                {
                  key,
                  name: body.query.cursor ? 'Next processed flow' : 'Processed water',
                  classification: [],
                  amount: -3.5,
                },
              ],
              nextCursor: body.query.cursor ? null : 'bound-final-cursor',
              nonzeroCount: 2,
            };
    return route.fulfill({ json: { ok: true, mode: body.mode, data: { ...common, data } } });
  });
  await page.goto(`${app}/#/tgdata/processes`);
  await page.getByRole('button', { name: 'profile', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Published results', exact: true }).click();
  await expect(page.getByText('Preparing published results. Please retry shortly.')).toBeVisible();
  await expect(page.getByText('Final climate', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0', exact: true })).toBeVisible();
  await expect(
    page.getByText('-2 frozen kg · Processed product · 01.00.000', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'LCI', exact: true }).click();
  await expect(page.getByText('Processed water', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-3.5', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Next processed flow', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Download TIDAS ZIP', exact: true }).click();
  await expect(
    page.getByText(
      'A complete ZIP is not available for this publication and your access permissions.',
    ),
  ).toBeVisible();
  allowZip = true;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download TIDAS ZIP', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('result.tidas.zip');
  await page.getByRole('combobox', { name: 'Select a published result' }).click();
  await expect(
    page.getByRole('option', { name: `${otherId} · 01.00.000`, exact: true }),
  ).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('combobox', { name: 'Select a published result' }).press('ArrowDown');
  await page.getByRole('combobox', { name: 'Select a published result' }).press('Enter');
  await expect(page.getByText('This result has no LCIA data.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'LCIA', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Select a published result' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByRole('tab', { name: 'LCI', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({
    path: testInfo.outputPath('final-result-lci.png'),
    fullPage: true,
    animations: 'disabled',
  });
  changed = true;
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(
    page.getByText('The publication or result reader changed. Reload the result selection.'),
  ).toBeVisible();
  await expect(page.getByText('Processed water', { exact: true })).toHaveCount(0);
  changed = false;
  const sourceReads = requests.filter((r) => r.mode === 'source_results').length;
  await page.goto(
    `${app}/#/published-results?resultId=${id}&resultVersion=01.00.000&publicationId=${publicationId}`,
  );
  await expect(page.getByText('Derived result', { exact: true })).toBeVisible();
  await expect(page.getByText('Processed water', { exact: true })).toBeVisible();
  expect(requests.filter((r) => r.mode === 'source_results')).toHaveLength(sourceReads);
  expect(requests.some((r) => r.mode === 'query')).toBe(false);
  expect(
    requests.some(
      (r) => r.query?.cursor === 'bound-final-cursor' && r.runtimeRevision === runtimeRevision,
    ),
  ).toBe(true);
});
