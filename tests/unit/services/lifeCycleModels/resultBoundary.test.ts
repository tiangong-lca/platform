import { classifyResultBoundary } from '@/services/lifeCycleModels/resultBoundary';
import { publicEntity } from '@/services/supabase/public';

jest.mock('@/services/supabase/public', () => ({ publicEntity: jest.fn() }));
const exchange = (flowId: string, version: string, quantitativeReference = false) => ({
  flowId,
  quantitativeReference,
  amount: 1,
  direction: 'OUTPUT' as const,
  template: {
    internalId: flowId,
    flowId,
    amount: 1,
    direction: 'OUTPUT' as const,
    raw: { referenceToFlowDataSet: { '@version': version } },
  },
});
const mockFlowTypes = (data: { id: string; typeOfDataSet: string }[]) => {
  const lookup = jest.fn().mockResolvedValue({ data, error: null });
  const eq = jest.fn().mockReturnValue({ in: lookup });
  (publicEntity as jest.Mock).mockReturnValue({ select: () => ({ eq }) });
  return { eq, lookup };
};
it.each(['Product flow', 'Waste flow'])(
  'classifies an open %s using its exact Flow version',
  async (typeOfDataSet) => {
    const { eq, lookup } = mockFlowTypes([{ id: 'external', typeOfDataSet }]);
    expect(
      await classifyResultBoundary([
        exchange('product', '01.00.000', true),
        exchange('external', '02.00.000'),
      ]),
    ).toBe('Partly terminated system');
    expect(eq).toHaveBeenCalledWith('version', '02.00.000');
    expect(lookup).toHaveBeenCalledWith('id', ['external']);
  },
);
it('classifies a fully resolved inventory and refuses to guess when Flow metadata is missing', async () => {
  mockFlowTypes([{ id: 'air', typeOfDataSet: 'Elementary flow' }]);
  expect(await classifyResultBoundary([exchange('air', '01.00.000')])).toBe('LCI result');
  await expect(classifyResultBoundary([exchange('unknown', '01.00.000')])).rejects.toMatchObject({
    code: 'SOURCE_UNAVAILABLE',
  });
});

it('reports unavailable exact versions and source read failures', async () => {
  await expect(classifyResultBoundary([exchange('air', '')])).rejects.toMatchObject({
    code: 'SOURCE_UNAVAILABLE',
  });
  const { lookup } = mockFlowTypes([]);
  lookup.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  await expect(classifyResultBoundary([exchange('air', '01.00.000')])).rejects.toMatchObject({
    code: 'SOURCE_UNAVAILABLE',
  });
});

it('resolves each exact version once, skipping zero exchanges and treating absent rows as unknown', async () => {
  const { lookup } = mockFlowTypes([]);
  lookup.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({
    data: [{ id: 'repeated', typeOfDataSet: 'Other flow' }],
  });
  const flow = exchange('repeated', '01.00.000');
  await expect(
    classifyResultBoundary([
      { ...exchange('unused', ''), amount: 0 },
      flow,
      flow,
      exchange('repeated', '02.00.000'),
    ]),
  ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  expect(lookup.mock.calls).toEqual([
    ['id', ['repeated']],
    ['id', ['repeated']],
  ]);
});
