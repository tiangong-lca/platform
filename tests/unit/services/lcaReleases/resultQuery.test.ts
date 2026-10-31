import { queryPublishedResult } from '@/services/lcaReleases/resultQuery';
const mockSession = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockSession(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));
const id = '11111111-1111-4111-8111-111111111111';
const publicationId = '22222222-2222-4222-8222-222222222222';
const source = { id, version: '01.00.000' };
const process = {
  ...source,
  quantitativeReference: { flow: source, direction: 'Output', meanAmount: 1, referenceUnit: 'kg' },
};
const envelope = (data: unknown, extra = {}) => ({
  ok: true,
  data: {
    schemaVersion: 'result.query.response.v1',
    artifactId: id,
    publicationId,
    source,
    publication: { releaseRunId: id, releaseVersion: source.version, publishedAt: '2026-10-30' },
    data,
    ...extra,
  },
});
const signal = () => new AbortController().signal;
beforeEach(() => {
  mockSession.mockResolvedValue({ data: { session: { access_token: 'actor-token' } } });
  mockInvoke.mockReset();
});
it('uses actor auth, bounded timeout and exact source/publication; retains frozen signed values', async () => {
  mockInvoke.mockResolvedValue({
    data: envelope({
      process,
      impacts: [
        { method: { ...source, key: 'k', name: 'Frozen', unit: 'old kg' }, amount: -1e-20 },
      ],
    }),
  });
  const s = signal();
  const result = await queryPublishedResult(source, { kind: 'lcia' }, s, publicationId);
  expect(result.status).toBe('ready');
  expect(mockInvoke).toHaveBeenCalledWith(
    'lca_release_results',
    expect.objectContaining({
      signal: s,
      timeout: 12000,
      headers: { Authorization: 'Bearer actor-token' },
      body: {
        mode: 'query',
        processId: id,
        processVersion: source.version,
        query: { kind: 'lcia' },
        publicationId,
      },
    }),
  );
  expect(result).toMatchObject({ result: { data: { impacts: [{ amount: -1e-20 }] } } });
});
it('reads overview and LCI, keeping true zero and cursor', async () => {
  mockInvoke
    .mockResolvedValueOnce({
      data: envelope({ process, lciAvailable: true, lciaAvailable: false }),
    })
    .mockResolvedValueOnce({
      data: envelope({
        process,
        items: [
          {
            key: {
              flowId: id,
              flowVersion: source.version,
              direction: 'Input',
              unit: 'kg',
              location: null,
            },
            name: [],
            classification: {},
            amount: 0,
          },
        ],
        nextCursor: 'bound',
        nonzeroCount: 1,
      }),
    });
  expect((await queryPublishedResult(source, { kind: 'overview' }, signal())).status).toBe('ready');
  expect((await queryPublishedResult(source, { kind: 'lci', limit: 50 }, signal())).status).toBe(
    'ready',
  );
  expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty('publicationId');
});
it('returns preparation only with matching identity', async () => {
  mockInvoke.mockResolvedValue({ data: envelope(undefined, { status: 'preparing' }) });
  expect(await queryPublishedResult(source, { kind: 'overview' }, signal())).toEqual({
    status: 'preparing',
    publicationId,
  });
});
it('requires a session before any query', async () => {
  mockSession.mockResolvedValue({ data: { session: null } });
  expect(await queryPublishedResult(source, { kind: 'overview' }, signal())).toEqual({
    status: 'unavailable',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
});
it.each([401, 403, 404, 500, undefined])(
  'classifies transport status %s without a legacy read',
  async (status) => {
    mockInvoke.mockResolvedValue({ error: status ? { context: { status } } : {} });
    expect((await queryPublishedResult(source, { kind: 'overview' }, signal())).status).toBe(
      [401, 403, 404].includes(status as number) ? 'unavailable' : 'error',
    );
  },
);
it.each([
  undefined,
  { ok: false },
  { ok: true, data: {} },
  envelope({}, { source: { ...source, id: publicationId } }),
  envelope({}, { source: { ...source, version: '02.00.000' } }),
  envelope({}, { publicationId: id }),
  envelope({ process: { ...process, id: publicationId }, lciAvailable: true, lciaAvailable: true }),
  envelope({
    process: { ...process, version: '02.00.000' },
    lciAvailable: true,
    lciaAvailable: true,
  }),
])('rejects malformed or mismatched response %#', async (data) => {
  mockInvoke.mockResolvedValue({ data });
  expect(await queryPublishedResult(source, { kind: 'overview' }, signal(), publicationId)).toEqual(
    { status: 'error' },
  );
});
it('does not send or consume a cancelled query', async () => {
  const c = new AbortController();
  c.abort();
  await expect(queryPublishedResult(source, { kind: 'overview' }, c.signal)).rejects.toThrow();
  expect(mockInvoke).not.toHaveBeenCalled();
  const d = new AbortController();
  mockInvoke.mockImplementation(async () => {
    d.abort();
    return {};
  });
  await expect(queryPublishedResult(source, { kind: 'overview' }, d.signal)).rejects.toThrow();
});
