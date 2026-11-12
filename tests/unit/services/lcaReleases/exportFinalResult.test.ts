import { collectFinalResult } from '@/services/lcaReleases/exportFinalResult';
jest.mock('@/services/lcaReleases/finalResults', () => ({ queryFinalResult: jest.fn() }));
const identity = { uuid: '11111111-1111-4111-8111-111111111111', version: '01.00.000' };
const row = { ...identity, relationKind: 'direct', quantitativeReference: { value: 1 } };
const overview = {
  publicationId: 'pub',
  runtimeRevision: 'reader',
  releaseVersion: '2026.11.0',
  result: identity,
  data: { result: row, lciaAvailable: true, lciAvailable: true },
} as any;
const reply = (data: unknown, extra = {}) => ({
  status: 'ready',
  result: { ...overview, ...extra, data: { result: row, ...(data as object) } },
});
const run = (query: jest.Mock, value = overview, signal = new AbortController().signal) =>
  collectFinalResult(value, signal, undefined, query);
it('exports every unfiltered cursor page with exact publication/reader pins and keeps zero LCIA and signed LCI', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce(reply({ impacts: [{ amount: 0 }] }))
    .mockResolvedValueOnce(reply({ items: [{ amount: -2 }], nextCursor: 'next', nonzeroCount: 2 }))
    .mockResolvedValueOnce(reply({ items: [{ amount: 3 }], nextCursor: null, nonzeroCount: 2 }));
  expect(await run(query)).toEqual({
    lcia: [{ amount: 0 }],
    lci: { items: [{ amount: -2 }, { amount: 3 }], nonzeroCount: 2, zeroValuesOmitted: true },
  });
  expect(query.mock.calls.map((c) => c[1])).toEqual([
    { kind: 'lcia' },
    { kind: 'lci', limit: 1000, cursor: null },
    { kind: 'lci', limit: 1000, cursor: 'next' },
  ]);
  for (const call of query.mock.calls)
    expect(call[3]).toEqual({ publicationId: 'pub', runtimeRevision: 'reader' });
});
it.each([
  { status: 'error' },
  reply({ impacts: [] }, { publicationId: 'other' }),
  reply({ impacts: [] }, { runtimeRevision: 'other' }),
])('rejects failed or changed responses without a partial result', async (failure) => {
  await expect(run(jest.fn().mockResolvedValue(failure))).rejects.toThrow();
});
it('rejects truncated inventory and repeated cursors', async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce(reply({ impacts: [] }))
    .mockResolvedValueOnce(reply({ items: [], nextCursor: null, nonzeroCount: 2 }));
  await expect(run(query)).rejects.toThrow('Incomplete LCI');
  const loop = jest
    .fn()
    .mockResolvedValueOnce(reply({ impacts: [] }))
    .mockResolvedValue(reply({ items: [{ amount: 1 }], nextCursor: 'same', nonzeroCount: 20 }));
  await expect(run(loop)).rejects.toThrow('Invalid LCI pagination');
});
it('preserves unavailable LCIA as null and stops on cancellation', async () => {
  const query = jest
    .fn()
    .mockResolvedValue(reply({ items: [], nextCursor: null, nonzeroCount: 0 }));
  expect(
    (
      await run(query, {
        ...overview,
        data: { ...overview.data, lciaAvailable: false },
      } as any)
    ).lcia,
  ).toBeNull();
  const controller = new AbortController();
  controller.abort();
  await expect(run(query, overview, controller.signal)).rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(1);
});
