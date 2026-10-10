import { supabase } from '@/services/supabase';
import { FunctionRegion } from '@supabase/supabase-js';
import { getLangText } from '@/services/general/util';
import { genProcessName } from '@/services/processes/util';
import { genFlowName } from '@/services/flows/util';
import type { OpenDataDatasetKind } from '@/services/openDataCatalog/types';

export const DATASET_KINDS: OpenDataDatasetKind[] = [
  'lifecyclemodel',
  'process',
  'flow',
  'flowproperty',
  'unitgroup',
  'source',
  'contact',
];
export type DatasetKindFilter = OpenDataDatasetKind | 'all';
export type VisibilityFilter = 'all' | 'visible' | 'hidden';
export type DatasetDisplayItem = { datasetKind: OpenDataDatasetKind; id: string; version: string };
export type DatasetDisplayRow = DatasetDisplayItem & { name: string; isVisible?: boolean };
export type DatasetDisplayListParams = {
  current?: number;
  pageSize?: number;
  datasetKind: DatasetKindFilter;
  query?: string;
  visibility?: VisibilityFilter;
};
export type DatasetDisplayChangeResult = {
  inputCount: number;
  requestedCount: number;
  changedCount: number;
  unchangedCount: number;
  isVisible: boolean;
};
export const datasetDisplayKey = ({ datasetKind, id, version }: DatasetDisplayItem) =>
  `${datasetKind}:${id}:${version}`;

export async function listDatasetDisplay(
  params: DatasetDisplayListParams,
  lang: string,
  candidates = false,
) {
  const args = {
    p_dataset_kind: params.datasetKind,
    p_query: params.query ?? '',
    p_page_size: params.pageSize ?? 10,
    p_page: params.current ?? 1,
  };
  const { data, error } = candidates
    ? await supabase.rpc('list_dataset_display_candidates', {
        ...args,
        p_visibility: params.visibility ?? 'all',
      })
    : await supabase.rpc('list_displayed_datasets', args);
  if (error) return { data: [], success: false, total: 0, error };
  if (
    !data ||
    !Array.isArray(data.data) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.data.length > (params.pageSize ?? 10)
  )
    return {
      data: [],
      success: false,
      total: 0,
      error: new Error('Invalid display list response'),
    };
  const rows: DatasetDisplayRow[] = [];
  for (const row of data.data) {
    if (
      !row ||
      !DATASET_KINDS.includes(row.dataset_kind) ||
      typeof row.dataset_id !== 'string' ||
      typeof row.dataset_version !== 'string' ||
      (candidates && typeof row.is_visible !== 'boolean')
    )
      return { data: [], success: false, total: 0, error: new Error('Invalid display row') };
    const name =
      row.dataset_kind === 'process' || row.dataset_kind === 'lifecyclemodel'
        ? genProcessName(row.name ?? {}, lang)
        : row.dataset_kind === 'flow'
          ? genFlowName(row.name ?? {}, lang)
          : typeof row.name === 'string'
            ? row.name
            : getLangText(row.name, lang);
    rows.push({
      datasetKind: row.dataset_kind,
      id: row.dataset_id,
      version: row.dataset_version,
      name: name && name !== '-' ? name : row.dataset_id,
      ...(candidates ? { isVisible: row.is_visible } : {}),
    });
  }
  return { data: rows, success: true, total: data.total };
}

export async function setDatasetDisplay(items: DatasetDisplayItem[], isVisible: boolean) {
  const sessionResult = await supabase.auth.getSession();
  const session = sessionResult.data.session;
  if (!session) throw sessionResult.error ?? new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke('app_dataset_display_set_batch', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { items, isVisible },
    region: FunctionRegion.UsEast1,
  });
  if (error) throw error;
  const result = data?.data;
  if (
    data?.ok !== true ||
    !result ||
    result.isVisible !== isVisible ||
    !['inputCount', 'requestedCount', 'changedCount', 'unchangedCount'].every(
      (key) => Number.isSafeInteger(result[key]) && result[key] >= 0,
    ) ||
    result.requestedCount !== result.changedCount + result.unchangedCount
  )
    throw new Error('Invalid display command response');
  return result as DatasetDisplayChangeResult;
}
