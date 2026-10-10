const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const mockInvoke = jest.fn();

jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import {
  addOpenDataHybridFilters,
  queryMappedOpenDataCatalog,
  queryOpenDataCatalog,
} from '@/services/openDataCatalog/api';

const filters = { sourceFilter: 'literature' as const, publicationFilter: 'published' as const };

describe('Open Data catalog service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the catalog query contract to the public RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await queryOpenDataCatalog({
      datasetKind: 'process',
      filters,
      mode: 'lexical',
      queryText: 'steel',
    });
    expect(mockRpc).toHaveBeenCalledWith('search_open_data_catalog', {
      p_dataset_kind: 'process',
      p_search_mode: 'lexical',
      p_query_text: 'steel',
      p_query_terms: null,
      p_filter_condition: {},
      p_source_filter: 'literature',
      p_publication_filter: 'published',
      p_page_size: 10,
      p_page_current: 1,
      p_sort_by: 'modified_at',
      p_sort_direction: 'desc',
    });

    await queryOpenDataCatalog({
      datasetKind: 'source',
      filters: { sourceFilter: 'enterprise' },
      mode: 'list',
    });
    expect(mockRpc).toHaveBeenLastCalledWith(
      'search_open_data_catalog',
      expect.objectContaining({ p_publication_filter: 'all' }),
    );
  });

  it('maps rows, totals, empty results, and RPC errors', async () => {
    const mapRows = jest.fn(async (rows) => rows.map((row: any) => row.id));
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'one', total_count: '3' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('failed') });
    await expect(
      queryMappedOpenDataCatalog({ datasetKind: 'contact', filters, mode: 'list' }, mapRows),
    ).resolves.toMatchObject({ data: ['one'], success: true, total: 3, capped: false });
    await expect(
      queryMappedOpenDataCatalog({ datasetKind: 'contact', filters, mode: 'list' }, mapRows),
    ).resolves.toMatchObject({ data: [], success: true, total: 0 });
    await expect(
      queryMappedOpenDataCatalog({ datasetKind: 'contact', filters, mode: 'list' }, mapRows),
    ).resolves.toMatchObject({ data: [], success: true, total: 0 });
    await expect(
      queryMappedOpenDataCatalog({ datasetKind: 'contact', filters, mode: 'list' }, mapRows),
    ).resolves.toMatchObject({ data: [], success: false, total: 0 });
    expect(mapRows).toHaveBeenCalledTimes(1);
  });

  it('adds Open Data filters only when requested', () => {
    expect(addOpenDataHybridFilters({ query: 'steel' })).toEqual({ query: 'steel' });
    expect(addOpenDataHybridFilters({ query: 'steel' }, { sourceFilter: 'enterprise' })).toEqual({
      query: 'steel',
      source_filter: 'enterprise',
      publication_filter: 'all',
    });
  });
});
