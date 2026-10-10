import {
  datasetDisplayKey,
  listDatasetDisplay,
  setDatasetDisplay,
  DATASET_KINDS,
} from '@/services/datasetDisplay/api';
const mockRpc = jest.fn(),
  mockInvoke = jest.fn(),
  mockGetSession = jest.fn();
jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => mockRpc(...a),
    auth: { getSession: () => mockGetSession() },
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
  },
}));
jest.mock('@/services/processes/util', () => ({
  genProcessName: (name: any) => name.baseName ?? '-',
}));
jest.mock('@/services/flows/util', () => ({
  genFlowName: (name: any) => name.baseName ?? undefined,
}));
jest.mock('@/services/general/util', () => ({ getLangText: (name: any) => name?.text ?? '-' }));
const item = {
  datasetKind: 'process' as const,
  id: '11111111-1111-4111-8111-111111111111',
  version: '01.00.000',
};
const params = { datasetKind: 'all' as const };
const raw = (kind = 'process', name: unknown = { baseName: 'Test' }) => ({
  dataset_kind: kind,
  dataset_id: item.id,
  dataset_version: item.version,
  name,
  is_visible: true,
});
const result = {
  inputCount: 1,
  requestedCount: 1,
  changedCount: 1,
  unchangedCount: 0,
  isVisible: true,
};
describe('datasetDisplay transport and exact identities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'actor' } }, error: null });
  });
  it('keeps kind and version in the key', () => {
    expect(datasetDisplayKey(item)).toBe(`process:${item.id}:01.00.000`);
  });
  it('uses separate bounded projection RPCs and never adds an owner/state predicate', async () => {
    mockRpc.mockResolvedValue({ data: { data: [], total: 0 }, error: null });
    expect(await listDatasetDisplay(params, 'en')).toEqual({ data: [], success: true, total: 0 });
    expect(mockRpc).toHaveBeenLastCalledWith('list_displayed_datasets', {
      p_dataset_kind: 'all',
      p_query: '',
      p_page_size: 10,
      p_page: 1,
    });
    await listDatasetDisplay(
      { ...params, current: 3, pageSize: 20, query: 'iron', visibility: 'hidden' },
      'en',
      true,
    );
    expect(mockRpc).toHaveBeenLastCalledWith('list_dataset_display_candidates', {
      p_dataset_kind: 'all',
      p_query: 'iron',
      p_page_size: 20,
      p_page: 3,
      p_visibility: 'hidden',
    });
    await listDatasetDisplay(params, 'en', true);
    expect(mockRpc.mock.calls[2][1].p_visibility).toBe('all');
  });
  it('localizes only projected names for all seven types, falling back to identity', async () => {
    const rows = [
      raw('process'),
      raw('lifecyclemodel'),
      raw('flow'),
      raw('source', 'Citation'),
      raw('contact', { text: 'Contact' }),
      raw('unitgroup', null),
      raw('flowproperty'),
    ];
    mockRpc.mockResolvedValue({ data: { data: rows, total: 7 }, error: null });
    const response = await listDatasetDisplay(params, 'en', true);
    expect(response.data.map((r) => r.name)).toEqual([
      'Test',
      'Test',
      'Test',
      'Citation',
      'Contact',
      item.id,
      item.id,
    ]);
    expect(response.data.every((r) => r.isVisible)).toBe(true);
    expect(DATASET_KINDS).toHaveLength(7);
    mockRpc.mockResolvedValue({ data: { data: [raw('flow', null)], total: 1 }, error: null });
    expect((await listDatasetDisplay(params, 'en')).data).toEqual([
      { ...item, datasetKind: 'flow', name: item.id },
    ]);
    mockRpc.mockResolvedValue({ data: { data: [raw('process', null)], total: 1 }, error: null });
    expect((await listDatasetDisplay(params, 'en')).data[0].name).toBe(item.id);
    mockRpc.mockResolvedValue({
      data: { data: [raw('lifecyclemodel', {})], total: 1 },
      error: null,
    });
    expect((await listDatasetDisplay(params, 'en')).data[0].name).toBe(item.id);
  });
  it('propagates RPC failures and rejects malformed pages instead of reporting successful empty lists', async () => {
    const error = new Error('denied');
    mockRpc.mockResolvedValue({ data: null, error });
    expect(await listDatasetDisplay(params, 'en')).toEqual({
      data: [],
      success: false,
      total: 0,
      error,
    });
    for (const data of [
      null,
      {},
      { data: null, total: 0 },
      { data: [], total: '0' },
      { data: [], total: -1 },
      { data: Array.from({ length: 11 }, () => raw()), total: 11 },
      { data: [null], total: 1 },
      { data: [raw('ilcd')], total: 1 },
      { data: [{ ...raw(), dataset_id: 2 }], total: 1 },
      { data: [{ ...raw(), dataset_version: null }], total: 1 },
    ]) {
      mockRpc.mockResolvedValue({ data, error: null });
      expect((await listDatasetDisplay(params, 'en')).success).toBe(false);
    }
    mockRpc.mockResolvedValue({
      data: { data: [{ ...raw(), is_visible: null }], total: 1 },
      error: null,
    });
    expect((await listDatasetDisplay(params, 'en', true)).success).toBe(false);
  });
  it('sets and cancels via the verified session and preserves true/false exactly', async () => {
    for (const isVisible of [true, false]) {
      mockInvoke.mockResolvedValue({
        data: { ok: true, data: { ...result, isVisible } },
        error: null,
      });
      expect(await setDatasetDisplay([item], isVisible)).toEqual({ ...result, isVisible });
      expect(mockInvoke).toHaveBeenLastCalledWith(
        'app_dataset_display_set_batch',
        expect.objectContaining({
          headers: { Authorization: 'Bearer actor' },
          body: { items: [item], isVisible },
          region: 'us-east-1',
        }),
      );
    }
  });
  it('rejects missing sessions, remote failures and malformed success counts', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(setDatasetDisplay([item], true)).rejects.toThrow('Authentication required');
    const authError = new Error('auth');
    mockGetSession.mockResolvedValue({ data: { session: null }, error: authError });
    await expect(setDatasetDisplay([item], true)).rejects.toBe(authError);
    expect(mockInvoke).not.toHaveBeenCalled();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'actor' } }, error: null });
    const error = new Error('remote');
    mockInvoke.mockResolvedValue({ data: null, error });
    await expect(setDatasetDisplay([item], true)).rejects.toBe(error);
    for (const data of [
      null,
      {},
      { ok: false, data: result },
      { ok: true, data: null },
      { ok: true, data: { ...result, isVisible: false } },
      { ok: true, data: { ...result, changedCount: 2 } },
      { ok: true, data: { ...result, requestedCount: -1 } },
      { ok: true, data: { ...result, inputCount: 0.5 } },
    ]) {
      mockInvoke.mockResolvedValue({ data, error: null });
      await expect(setDatasetDisplay([item], true)).rejects.toThrow(
        'Invalid display command response',
      );
    }
  });
});
