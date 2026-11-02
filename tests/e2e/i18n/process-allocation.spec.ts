import { signInViaUi } from './auth';
import { routeToCandidateUrl, selectAppLocaleThroughUi } from './contracts';
import { withBatchAllocationDiagnostics } from './batch-allocation-observer';
import { expect, test, type Locator } from './fixtures';
import { makeMinimalProcessJson, readProductionDataLedger } from './production-data-ledger';

// This fixture is exclusively in-memory on the reserved qualification origin.
// Unmatched requests remain subject to the repository's hermetic backend guard.
test('Process allocation survives deletion, batch editing and save/reopen', async ({
  page,
  baseURL,
  browserName,
}, testInfo) => {
  test.skip(
    process.env.E2E_QUALIFICATION !== 'true',
    'Requires the hermetic qualification backend.',
  );
  const ledger = (await readProductionDataLedger())!;
  const json: any = makeMinimalProcessJson(ledger);
  const flowId = (n: number) => `11360000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const names = ['Disposable input', 'Product A', 'Product B', 'Electricity', 'Raw material'];
  const split = [
    { '@internalReferenceToCoProduct': '1', '@allocatedFraction': '70' },
    { '@internalReferenceToCoProduct': '2', '@allocatedFraction': '30' },
  ];
  const exchanges = names.map((name, i) => ({
    '@dataSetInternalID': String(i),
    exchangeDirection: i === 1 || i === 2 ? 'Output' : 'Input',
    referenceToFlowDataSet: {
      '@refObjectId': flowId(i),
      '@version': '01.00.000',
      '@type': 'flow data set',
      'common:shortDescription': [{ '@xml:lang': 'en', '#text': name }],
    },
    meanAmount: '100',
    resultingAmount: '100',
    ...(i === 3 ? { allocations: { allocation: split } } : {}),
  }));
  json.processDataSet.processInformation.quantitativeReference = {
    '@type': 'Reference flow(s)',
    referenceToReferenceFlow: '1',
  };
  json.processDataSet.exchanges = { exchange: exchanges };
  const records = new Map([[`${ledger.id}@${ledger.version}`, json]]);
  const writes: any[] = [];
  const respond = async (route: any, data: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(data),
    });
  await page.route('https://semantic-harness.invalid/rest/v1/processes*', async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? ledger.id;
    const version = url.searchParams.get('version')?.replace(/^eq\./, '') ?? ledger.version;
    const stored = records.get(`${id}@${version}`);
    await respond(
      route,
      stored
        ? [
            {
              id,
              version,
              json: stored,
              state_code: 0,
              rule_verification: false,
              reviews: [],
              team_id: null,
              name: stored.processDataSet.processInformation.dataSetInformation.name,
              quantitativeReference: stored.processDataSet.processInformation.quantitativeReference,
              exchange: stored.processDataSet.exchanges.exchange,
            },
          ]
        : [],
    );
  });
  await page.route('https://semantic-harness.invalid/rest/v1/flows*', async (route) => {
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('id');
    const exact = filter?.startsWith('eq.') ? filter.slice(3) : undefined;
    await respond(
      route,
      names.flatMap((name, i) =>
        exact && exact !== flowId(i)
          ? []
          : [
              {
                id: flowId(i),
                version: '01.00.000',
                typeOfDataSet: 'Product flow',
                name: { baseName: [{ '@xml:lang': 'en', '#text': name }] },
                json: {
                  flowDataSet: {
                    flowInformation: {
                      dataSetInformation: {
                        name: { baseName: [{ '@xml:lang': 'en', '#text': name }] },
                      },
                      quantitativeReference: { referenceToReferenceFlowProperty: '0' },
                    },
                    modellingAndValidation: { LCIMethod: { typeOfDataSet: 'Product flow' } },
                    flowProperties: { flowProperty: [] },
                  },
                },
                flowProperty: [],
                referenceToReferenceFlowProperty: '0',
              },
            ],
      ),
    );
  });
  await page.route(
    'https://semantic-harness.invalid/functions/v1/app_dataset_save_draft*',
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.table).toBe('processes');
      writes.push(body);
      records.set(`${body.id}@${body.version}`, body.jsonOrdered);
      await respond(route, {
        data: [
          {
            id: body.id,
            version: body.version,
            json: body.jsonOrdered,
            state_code: 0,
            rule_verification: false,
          },
        ],
        success: true,
      });
    },
  );
  await signInViaUi(page);
  await selectAppLocaleThroughUi(page, 'en-US');
  const waitForDialogReady = async (dialog: Locator) => {
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate(async (node) => {
          // Motion prepares its classes before registering the opening animation.
          // Sample after rendered frames, then require both preparations and finite motion to end.
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          const preparingOrMoving = Array.from(node.classList).some((name) =>
            /-(?:appear|enter|leave)(?:-|$)/.test(name),
          );
          return (
            !preparingOrMoving &&
            node.getAnimations().every((animation) => {
              const endTime = animation.effect?.getComputedTiming().endTime;
              return (
                !Number.isFinite(endTime) ||
                (!animation.pending && animation.playState !== 'running')
              );
            })
          );
        }),
      )
      .toBe(true);
  };
  const open = async () => {
    await page.goto(
      routeToCandidateUrl(
        baseURL!,
        `/mydata/processes?id=${ledger.id}&version=${ledger.version}&mode=edit`,
      ),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const drawer = page.locator('.tg-process-drawer:visible');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.ant-spin-spinning')).toHaveCount(0);
    await expect(drawer.locator('textarea').first()).not.toBeEmpty();
    const tab = drawer.getByRole('tab', { name: 'Inputs and Outputs', exact: true });
    // The drawer's initial data/form remount can replace the tab during opening.
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    return drawer;
  };
  let drawer = await open();
  const deleteDialog = page.getByRole('dialog', {
    name: 'Delete',
    exact: true,
    includeHidden: true,
  });
  const disposable = drawer.getByRole('row').filter({ hasText: 'Disposable input' });
  await expect(disposable).toHaveCount(1);
  await disposable
    .getByRole('button')
    .filter({ has: page.locator('[aria-label="delete"]') })
    .click();
  await waitForDialogReady(deleteDialog);
  await deleteDialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(disposable).toHaveCount(0);
  // The first confirmation must finish closing before the next one can own the OK action.
  await expect(deleteDialog).toBeHidden();
  const product = drawer.getByRole('row').filter({ hasText: 'Product A' });
  await product
    .getByRole('button')
    .filter({ has: page.locator('[aria-label="delete"]') })
    .click();
  await waitForDialogReady(deleteDialog);
  await deleteDialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText(/This product is used by allocations/)).toContainText('Electricity');
  await expect(product).toHaveCount(1);
  await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(deleteDialog).toBeHidden();
  await drawer.getByRole('button', { name: 'Batch allocation', exact: true }).click();
  const batch = page.getByRole('dialog', {
    name: 'Batch allocation',
    exact: true,
    includeHidden: true,
  });
  await waitForDialogReady(batch);
  await withBatchAllocationDiagnostics(page, batch, testInfo, browserName, async () => {
    await batch.getByRole('row').filter({ hasText: 'Raw material' }).getByRole('checkbox').check();
    await batch.getByRole('button', { name: 'Add product allocation', exact: true }).click();
    await batch.getByRole('combobox', { name: 'Target product' }).click();
    await page.getByText('Product B (#2)', { exact: true }).last().click();
    await batch.getByRole('spinbutton').fill('100');
    await batch.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(batch).toBeHidden();
  });
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  const saved = writes[0].jsonOrdered.processDataSet.exchanges.exchange;
  expect(saved.map((row: any) => row['@dataSetInternalID'])).toEqual(['1', '2', '3', '4']);
  expect(
    saved.find((row: any) => row['@dataSetInternalID'] === '3').allocations.allocation,
  ).toEqual(split);
  expect(
    saved.find((row: any) => row['@dataSetInternalID'] === '4').allocations.allocation,
  ).toEqual([{ '@internalReferenceToCoProduct': '2', '@allocatedFraction': '100' }]);
  drawer = await open();
  const electricity = drawer.getByRole('row').filter({ hasText: 'Electricity' });
  await electricity
    .getByRole('button')
    .filter({ has: page.locator('[aria-label="profile"]') })
    .click();
  await expect(page.getByText('Product A (#1)', { exact: true })).toBeVisible();
  await expect(page.getByText('Product B (#2)', { exact: true })).toBeVisible();
});
