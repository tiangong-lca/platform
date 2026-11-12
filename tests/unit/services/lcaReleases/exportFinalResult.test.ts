import { queryFinalResult } from '@/services/lcaReleases/finalResults';
import {
  collectFinalResult,
  exportFinalResultJson,
} from '@/services/lcaReleases/exportFinalResult';
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

it('rejects a non-overview and missing or changing result sections', async () => {
  await expect(run(jest.fn(), { ...overview, data: { result: row } })).rejects.toThrow(
    'Invalid result overview',
  );
  await expect(run(jest.fn().mockResolvedValue(reply({})))).rejects.toThrow('Missing LCIA');
  await expect(
    run(
      jest
        .fn()
        .mockResolvedValueOnce(reply({ impacts: [] }))
        .mockResolvedValueOnce(reply({})),
    ),
  ).rejects.toThrow('Missing LCI');
  await expect(
    run(
      jest
        .fn()
        .mockResolvedValueOnce(reply({ impacts: [] }))
        .mockResolvedValueOnce(
          reply({ items: [{ amount: 1 }], nextCursor: 'next', nonzeroCount: 2 }),
        )
        .mockResolvedValueOnce(reply({ items: [], nextCursor: null, nonzeroCount: 3 })),
    ),
  ).rejects.toThrow('LCI changed');
});
it.each([{ ...identity, name: 'Source' }, undefined])(
  'creates a complete JSON download with optional source metadata, then releases its URL',
  async (source) => {
    jest.clearAllMocks();
    jest
      .mocked(queryFinalResult)
      .mockResolvedValueOnce(reply({ impacts: [{ amount: 0 }] }) as any)
      .mockResolvedValueOnce(
        reply({ items: [{ amount: -2 }], nextCursor: null, nonzeroCount: 1 }) as any,
      );
    const create = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:result');
    const previousRevoke = URL.revokeObjectURL;
    const revoke = jest.fn();
    URL.revokeObjectURL = revoke;
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe(`result-${identity.uuid}-${identity.version}.json`);
      expect(this.href).toBe('blob:result');
    });
    await exportFinalResultJson(overview, new AbortController().signal, source);
    const blob = create.mock.calls[0][0] as Blob;
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(JSON.parse(contents)).toMatchObject({
      schemaVersion: 'tiangong.calculation-result-export.v1',
      publication: { id: 'pub', version: '2026.11.0' },
      sourceProcess: source ?? null,
      result: row,
      lcia: [{ amount: 0 }],
      lci: { items: [{ amount: -2 }], nonzeroCount: 1 },
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((resolve) => {
      setTimeout(resolve, 1050);
    });
    expect(revoke).toHaveBeenCalledWith('blob:result');
    create.mockRestore();
    URL.revokeObjectURL = previousRevoke;
    click.mockRestore();
  },
);
