import {
  finalResultDownload,
  finalResultLink,
  parseFinalResultLink,
  queryFinalResult,
  sourceFinalResults,
} from '@/services/lcaReleases/finalResults';
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
const runtimeRevision = '33333333-3333-4333-8333-333333333333';
const result = { uuid: id, version: '01.00.000' };
const pins = { publicationId, runtimeRevision };
const unit = {
  flowPropertyId: id,
  flowPropertyVersion: result.version,
  unitGroupId: id,
  unitGroupVersion: '02.00.000',
  internalId: '0',
  name: 'frozen kg',
};
const key = {
  flowId: id,
  flowVersion: result.version,
  direction: 'Output',
  location: 'GLO',
  functionType: null,
  unit,
};
const row = {
  ...result,
  relationKind: 'derived',
  quantitativeReference: {
    ...key,
    flowName: 'Product',
    flowClassification: [],
    value: -2,
    amountField: 'resultingAmount',
  },
};
const overview = { result: row, lciAvailable: true, lciaAvailable: false };
const source = { id, version: result.version };
const page = {
  publication: { publicationId, releaseVersion: '2026.11.1', format: 'final-result-pair.v2' },
  results: [{ ...result, relationKind: 'direct', lciAvailable: true, lciaAvailable: true }],
  nextResultKey: `${id}@${result.version}`,
};
const envelope = (data: unknown, extra = {}) => ({
  data: {
    ok: true,
    mode: 'final_query',
    data: {
      schemaVersion: 'result.query.response.v2',
      ...pins,
      releaseVersion: '2026.11.1',
      result,
      data,
      ...extra,
    },
  },
});
const signal = () => new AbortController().signal;
beforeEach(() => {
  mockSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-actor' } } });
  mockInvoke.mockReset();
});
it('uses authenticated exact v2 query and preserves frozen signed reference and complete units', async () => {
  mockInvoke.mockResolvedValue(envelope(overview));
  const s = signal();
  const value = await queryFinalResult(result, { kind: 'overview' }, s, pins);
  expect(value).toMatchObject({ status: 'ready', result: { data: overview } });
  expect(mockInvoke).toHaveBeenCalledWith(
    'lca_release_results',
    expect.objectContaining({
      signal: s,
      timeout: 12000,
      headers: { Authorization: 'Bearer synthetic-actor' },
      body: {
        mode: 'final_query',
        resultId: id,
        resultVersion: result.version,
        ...pins,
        query: { kind: 'overview' },
      },
    }),
  );
});
it('preserves zero LCIA, signed LCI, cursors and cold runtime pins', async () => {
  mockInvoke
    .mockResolvedValueOnce(envelope({ status: 'preparing' }))
    .mockResolvedValueOnce(
      envelope({
        result: row,
        impacts: [
          {
            method: {
              id,
              version: '03.00.001',
              key: 'climate',
              name: 'Frozen climate',
              unit: 'historical kg',
            },
            amount: 0,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      envelope({
        result: row,
        items: [{ key, name: 'Carbon dioxide', classification: [], amount: -1e-20 }],
        nextCursor: 'bound-next',
        nonzeroCount: 2,
      }),
    );
  expect(await queryFinalResult(result, { kind: 'overview' }, signal(), { publicationId })).toEqual(
    { status: 'preparing', pins },
  );
  expect(await queryFinalResult(result, { kind: 'lcia' }, signal(), pins)).toMatchObject({
    result: { data: { impacts: [{ amount: 0 }] } },
  });
  expect(
    await queryFinalResult(
      result,
      { kind: 'lci', limit: 1, cursor: 'bound-current', filter: 'air' },
      signal(),
      pins,
    ),
  ).toMatchObject({
    result: { data: { items: [{ key, amount: -1e-20 }], nextCursor: 'bound-next' } },
  });
});
it.each([401, 403, 404, 409, 422, 429, 500])('maps HTTP %i without fallback', async (status) => {
  mockInvoke.mockResolvedValue({ error: { context: { status } } });
  expect(await queryFinalResult(result, { kind: 'overview' }, signal(), pins)).toEqual({
    status: status < 405 ? 'unavailable' : status === 409 || status === 422 ? 'changed' : 'error',
  });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it('rejects unauthenticated and cancelled sessions without issuing a query', async () => {
  mockSession.mockResolvedValueOnce({ data: { session: null } });
  expect(await queryFinalResult(result, { kind: 'overview' }, signal(), pins)).toEqual({
    status: 'unavailable',
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    queryFinalResult(result, { kind: 'overview' }, controller.signal, pins),
  ).rejects.toThrow();
  expect(mockInvoke).not.toHaveBeenCalled();
});
it('rejects a response completed after cancellation', async () => {
  const controller = new AbortController();
  mockInvoke.mockImplementation(async () => {
    controller.abort();
    return envelope(overview);
  });
  await expect(
    queryFinalResult(result, { kind: 'overview' }, controller.signal, pins),
  ).rejects.toThrow();
});
it('rejects wrong identity, runtime, malformed reference and unbound or oversized continuations', async () => {
  for (const extra of [
    { result: { ...result, version: '02.00.000' } },
    { publicationId: id },
    { runtimeRevision: id },
    { artifactId: id },
  ]) {
    mockInvoke.mockResolvedValue(envelope(overview, extra));
    expect(await queryFinalResult(result, { kind: 'overview' }, signal(), pins)).toEqual({
      status: 'error',
    });
  }
  for (const data of [
    { ...overview, result: { ...row, uuid: publicationId } },
    { ...overview, result: { ...row, quantitativeReference: { value: 1 } } },
    { ...overview, lciAvailable: false },
  ]) {
    mockInvoke.mockResolvedValue(envelope(data));
    expect(await queryFinalResult(result, { kind: 'overview' }, signal(), pins)).toEqual({
      status: 'error',
    });
  }
  mockInvoke.mockClear();
  expect(
    await queryFinalResult(result, { kind: 'lci', limit: 1, cursor: 'x' }, signal(), {
      publicationId,
    }),
  ).toEqual({ status: 'error' });
  for (const query of [
    { kind: 'lci' as const, limit: 0 },
    { kind: 'lci' as const, limit: 1001 },
    { kind: 'lci' as const, limit: 1, cursor: '界'.repeat(1366) },
    { kind: 'lci' as const, limit: 1, filter: '界'.repeat(86) },
  ])
    expect(await queryFinalResult(result, query, signal(), pins)).toEqual({ status: 'error' });
  expect(mockInvoke).not.toHaveBeenCalled();
});
it('validates source format and ordered direct selection, pins pagination, and keeps empty distinct', async () => {
  mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'source_results', data: page } });
  expect(await sourceFinalResults(source, signal())).toEqual({ status: 'ready', page });
  const nextPage = { ...page, results: [], nextResultKey: null };
  mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'source_results', data: nextPage } });
  expect(
    await sourceFinalResults(source, signal(), { publicationId, afterKey: page.nextResultKey }),
  ).toEqual({ status: 'ready', page: nextPage });
  expect(mockInvoke.mock.calls.slice(-1)[0][1].body).toMatchObject({
    publicationId,
    afterKey: page.nextResultKey,
  });
  for (const publication of [null, { ...page.publication, format: 'legacy-four-zip.v1' }]) {
    const empty = { publication, results: [], nextResultKey: null };
    mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'source_results', data: empty } });
    expect(await sourceFinalResults(source, signal())).toEqual({ status: 'ready', page: empty });
  }
});
it('rejects source ancestors, duplicate/backward keys, wrong publication and v2 failure as legacy', async () => {
  for (const malformed of [
    { ...page, results: [{ ...page.results[0], relationKind: 'derived' }] },
    { ...page, results: [page.results[0], page.results[0]] },
    { ...page, nextResultKey: `${publicationId}@01.00.000` },
    { ...page, publication: null },
    { ...page, publication: { ...page.publication, format: 'unknown' } },
  ]) {
    mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'source_results', data: malformed } });
    expect(await sourceFinalResults(source, signal())).toEqual({ status: 'error' });
  }
  mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'source_results', data: page } });
  expect(
    await sourceFinalResults(source, signal(), { publicationId: id, afterKey: page.nextResultKey }),
  ).toEqual({ status: 'error' });
  mockInvoke.mockResolvedValue({ error: { context: { status: 503 } } });
  expect(await sourceFinalResults(source, signal())).toEqual({ status: 'error' });
});
const zip = () => ({
  publicationId,
  file: { name: 'result.tidas.zip', sha256: 'a'.repeat(64), byteSize: 900 },
  url: 'https://storage.example.invalid/frozen.zip?synthetic-signature=1',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
it('only returns a fresh exact authorized ZIP and never stores its signed URL', async () => {
  const data = zip();
  mockInvoke.mockResolvedValue({ data: { ok: true, mode: 'final_download', data } });
  expect(await finalResultDownload(publicationId, 'tidas', signal())).toEqual({
    status: 'ready',
    download: data,
  });
  mockInvoke.mockResolvedValue({ error: { context: { status: 404 } } });
  expect(await finalResultDownload(publicationId, 'ilcd', signal())).toEqual({
    status: 'unavailable',
  });
});
it('rejects unsafe links, stale/long-lived URLs, wrong files and identity', async () => {
  for (const patch of [
    { publicationId: id },
    { file: { ...zip().file, name: 'result.ilcd.zip' } },
    { url: 'http://outside.invalid/x' },
    { url: 'https://user:secret@storage.invalid/x' },
    { url: 'javascript:alert(1)' },
    { expiresAt: new Date(Date.now() - 1000).toISOString() },
    { expiresAt: new Date(Date.now() + 120000).toISOString() },
  ]) {
    mockInvoke.mockResolvedValue({
      data: { ok: true, mode: 'final_download', data: { ...zip(), ...patch } },
    });
    expect(await finalResultDownload(publicationId, 'tidas', signal())).toEqual({
      status: 'error',
    });
  }
});
it('rejects invalid inputs and wrong envelopes before exposing data', async () => {
  expect(await sourceFinalResults({ id: 'bad', version: 'latest' }, signal())).toEqual({
    status: 'error',
  });
  expect(
    await sourceFinalResults(source, signal(), { publicationId: 'bad', afterKey: 'bad' }),
  ).toEqual({ status: 'error' });
  expect(await finalResultDownload('bad', 'tidas', signal())).toEqual({ status: 'error' });
  expect(
    await queryFinalResult({ ...result, uuid: 'bad' }, { kind: 'overview' }, signal(), pins),
  ).toEqual({ status: 'error' });
  expect(mockInvoke).not.toHaveBeenCalled();
  for (const data of [{ ok: false }, { ok: true, mode: 'query', data: overview }]) {
    mockInvoke.mockResolvedValue({ data });
    expect(await queryFinalResult(result, { kind: 'overview' }, signal(), pins)).toEqual({
      status: 'error',
    });
  }
});
it('exact Result links bind publication and reject missing, duplicate, unknown or invalid fields', () => {
  const link = finalResultLink(result, publicationId);
  expect(link.startsWith('#/published-results?')).toBe(true);
  const search = link.slice(link.indexOf('?'));
  expect(parseFinalResultLink(search)).toEqual({ result, publicationId });
  for (const value of [
    '',
    '?resultId=bad',
    `${search}&resultId=${id}`,
    `${search}&sourceId=${id}`,
    search.replace(publicationId, 'invalid'),
    search.replace(result.version, 'latest'),
  ])
    expect(parseFinalResultLink(value)).toBeNull();
});
