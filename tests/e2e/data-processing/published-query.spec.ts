import { expect, test } from '@playwright/test';
import { installDatasetListFixture } from '../dataset-lists/fixture';
const app = process.env.RESULT_PREVIEW_BASE_URL ?? 'http://127.0.0.1:8012';
const id = '11111111-1111-4111-8111-111111111111';
const publicationId = '22222222-2222-4222-8222-222222222222';
test('original process browses frozen HDF5 result pages without downloading matrices', async ({
  page,
  context,
}, testInfo) => {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'query@example.test',
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
  await page.route('**/functions/v1/lca_release_results**', async (route) => {
    const body = route.request().postDataJSON();
    expect(new URL(route.request().url()).origin).toBe('https://semantic-harness.invalid');
    requests.push(body);
    if (body.mode !== 'query') return route.fulfill({ status: 404, json: { ok: false } });
    const source = { id: body.processId, version: body.processVersion };
    const process = {
      ...source,
      quantitativeReference: {
        flow: { id, version: '01.00.000' },
        direction: 'Output',
        meanAmount: 2,
        referenceUnit: 'frozen kg',
      },
    };
    const common = {
      schemaVersion: 'result.query.response.v1',
      artifactId: id,
      publicationId,
      source,
    };
    if (requests.length === 1)
      return route.fulfill({
        status: 202,
        json: { ok: true, data: { ...common, status: 'preparing' } },
      });
    expect(body.publicationId).toBe(publicationId);
    const data =
      body.query.kind === 'overview'
        ? { process, lciAvailable: true, lciaAvailable: true }
        : body.query.kind === 'lcia'
          ? {
              process,
              impacts: [
                {
                  method: {
                    id,
                    version: '00.00.001',
                    key: 'climate',
                    name: 'Frozen climate',
                    unit: 'historical kg',
                  },
                  amount: -1e-20,
                },
              ],
            }
          : {
              process,
              items: [
                {
                  key: {
                    flowId: id,
                    flowVersion: '00.00.001',
                    direction: 'Output',
                    unit: 'frozen g',
                    location: 'GLO',
                  },
                  name: body.query.cursor ? 'Second flow' : 'Frozen water',
                  classification: {},
                  amount: -3,
                },
              ],
              nextCursor: body.query.cursor ? null : 'bound-cursor',
              nonzeroCount: 2,
            };
    return route.fulfill({
      json: {
        ok: true,
        data: {
          ...common,
          publication: { releaseRunId: id, releaseVersion: '02.00.000', publishedAt: '2026-10-30' },
          data,
        },
      },
    });
  });
  await page.goto(`${app}/#/tgdata/processes`);
  await page.getByRole('button', { name: 'profile', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Published results', exact: true }).click();
  await expect(page.getByText('Preparing published results. Please retry shortly.')).toBeVisible();
  await expect(page.getByText('Frozen climate', { exact: true })).toBeVisible();
  await expect(page.getByText('-1e-20', { exact: true })).toBeVisible();
  await expect(page.getByText('historical kg', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'LCI', exact: true }).click();
  await expect(page.getByText('Frozen water', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Second flow', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  expect(
    requests.filter((r) => r.mode === 'query').every((r) => r.processVersion === '01.00.000'),
  ).toBe(true);
  expect(requests.some((r) => r.query?.cursor === 'bound-cursor')).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('published-lci.png'), fullPage: true });
});
