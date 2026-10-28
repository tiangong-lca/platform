import {
  getAllRefObj,
  getRefTableName,
  validateDatasetRuleVerification,
} from '@/pages/Utils/review';
import { getCurrentUser } from '@/services/auth';
import { readMatchedHybridRows } from '@/services/general/hybridVersions';
import {
  attachLangNormalizationMetadata,
  buildLangNormalizationMetadata,
  contributeSource,
  createLegacyMutationRemovedError,
  getRefData,
  invokeDatasetCommand,
  invokeDatasetCreateVersion,
  normalizeLangPayloadForSave,
  type LangNormalizationMetadata,
  type NormalizeLangPayloadForSaveOptions,
} from '@/services/general/api';
import { type SupportedContentLanguage } from '@/services/general/contentLanguageRegistry';
import { getLifeCyclesByIdAndVersion } from '@/services/lifeCycleModels/api';
import { supabase } from '@/services/supabase';
import { hasDatasetCatalogFilters, queryMappedDatasetCatalog } from '../datasetCatalog/api';
import {
  withDatasetClassification,
  type DatasetTableParams,
} from '../general/datasetClassification';
import {
  normalizeDeleteCommandResult,
  type SupabaseMutationResult,
} from '@/services/supabase/data';
import { publicEntity } from '@/services/supabase/public';
import { FunctionRegion } from '@supabase/supabase-js';
import { SortOrder } from 'antd/es/table/interface';
import { getCachedClassificationData } from '../classifications/cache';
import {
  mapDatasetUuidMentionRowsToListRows,
  normalizeDatasetUuidMentionTeamId,
  searchDatasetJsonUuidMentionPage,
} from '../datasetUuidMentionSearch/api';
import { getTeamIdByUserId } from '../general/api';
import { resolveTableSort } from '../general/tableSort';
import {
  createTidasScalarValidationError,
  validateProcessTidasScalarStorage,
} from '../general/tidasScalarStorage';
import {
  classificationToString,
  genLocalizedClassification,
  getLangText,
  jsonToList,
} from '../general/util';
import { getCachedLocationData } from '../locations/cache';
import { addOpenDataCatalogScope, queryMappedOpenDataCatalog } from '../openDataCatalog/api';
import {
  toProcessModelVersionField,
  type ProcessDetailByVersionResponse,
  type ProcessTable,
} from './data';
import { genProcessName } from './util';
import { getProcessJsonOrderedForSave } from './saveSerialization';
import {
  matchesProcessExactSetClassification,
  matchesProcessExactSetKeyword,
  validateProcessExactSetFilters,
  type ProcessExactSetFilters,
} from './exactSetFilters';

export type { ProcessExactSetFilters } from './exactSetFilters';

const selectStr4Table = `
    id,
    json->processDataSet->processInformation->dataSetInformation->name,
    json->processDataSet->processInformation->dataSetInformation->classificationInformation->"common:classification"->"common:class",
    json->processDataSet->processInformation->dataSetInformation->"common:generalComment",
    json->processDataSet->processInformation->time->>"common:referenceYear",
    json->processDataSet->modellingAndValidation->LCIMethodAndAllocation->typeOfDataSet,
    json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->>"@location",
    version,
    modified_at,
    team_id,
    user_id,
    model_id,
    model_version
`;

type ProcessCommandRow = {
  id?: string;
  version?: string;
  json?: { processDataSet?: any };
  state_code?: number;
  rule_verification?: boolean;
};

export type UpdateProcessResult = SupabaseMutationResult<ProcessCommandRow> &
  LangNormalizationMetadata;

const getProcessTidasScalarValidationError = (payload: unknown) => {
  const issues = validateProcessTidasScalarStorage(payload);
  return issues.length > 0 ? createTidasScalarValidationError(issues) : undefined;
};

export type LcaMyProcessOption = {
  id: string;
  version: string;
  name: string;
};

export type LcaAnalysisProcessScope =
  'public_plus_owner_draft' | 'current_user' | 'open_data' | 'all_data';

type ProcessTableQueryParams = DatasetTableParams;

type ProcessTableResponse = {
  data: ProcessTable[];
  page?: number;
  success: boolean;
  total?: number;
  error?: unknown;
};

type ProcessSearchOrderBy = {
  key: 'common:class' | 'baseName';
  lang?: SupportedContentLanguage;
  order: 'asc' | 'desc';
};

type ProcessListRpcRow = {
  id?: string;
  json?: any;
  version?: string;
  modified_at?: string;
  team_id?: string;
  model_id?: string;
  model_version?: string | null;
  total_count?: number | string | null;
  is_published?: boolean;
};

function normalizeProcessTotalCount(row?: ProcessListRpcRow): number {
  return Number(row?.total_count ?? 0) || 0;
}

function normalizeProcessResultTotalCount(
  resultData: ProcessListRpcRow[],
  resultBody?: any,
): number {
  return (
    normalizeProcessTotalCount(resultData[0]) ||
    Number((resultData as any).total_count ?? 0) ||
    Number(resultBody?.total_count ?? 0) ||
    0
  );
}

function normalizeProcessSortBy(sortBy: string): string {
  if (sortBy === 'modifiedAt') {
    return 'modified_at';
  }
  if (sortBy === 'createdAt') {
    return 'created_at';
  }
  return sortBy;
}

function normalizeProcessSortDirection(orderBy: SortOrder): 'asc' | 'desc' {
  return orderBy === 'ascend' ? 'asc' : 'desc';
}

function getLocalizedProcessClassification(
  classificationSource: any,
  classificationData: any,
): string {
  return classificationToString(
    genLocalizedClassification(jsonToList(classificationSource), classificationData ?? []),
  );
}

function mapProcessSearchResultRows(
  rows: ProcessListRpcRow[],
  lang: string,
  locationData: any[],
  classificationData: any,
): ProcessTable[] {
  return rows.map((i: any) => {
    try {
      const dataInfo = i.json?.processDataSet?.processInformation;
      const locationCode =
        dataInfo?.geography?.locationOfOperationSupplyOrProduction?.['@location'];
      const localizedLocation = locationData.find(
        (location: any) => location?.['@value'] === locationCode,
      )?.['#text'];

      return {
        key: i.id + ':' + i.version,
        id: i.id,
        lang,
        name: genProcessName(dataInfo?.dataSetInformation?.name ?? {}, lang),
        generalComment: getLangText(
          dataInfo?.dataSetInformation?.['common:generalComment'] ?? {},
          lang,
        ),
        classification: getLocalizedProcessClassification(
          dataInfo?.dataSetInformation?.classificationInformation?.['common:classification']?.[
            'common:class'
          ],
          classificationData,
        ),
        referenceYear: dataInfo?.time?.['common:referenceYear'] ?? '-',
        location: localizedLocation ?? locationCode ?? '-',
        version: i.version,
        typeOfDataSet:
          i?.json?.processDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ??
          '-',
        modifiedAt: new Date(i.modified_at),
        teamId: i.team_id,
        modelId: i.model_id,
        isPublished: i.is_published,
        ...toProcessModelVersionField(i.model_version),
      };
    } catch (error) {
      console.error(error);
      return { id: i.id, version: i.version, key: i.id + ':' + i.version, lang } as ProcessTable;
    }
  });
}

function getOptionalTeamId(tid: string | []): string | null {
  if (typeof tid === 'string' && tid.length > 0) {
    return tid;
  }
  return null;
}

async function getProcessTeamFilter(dataSource: string, tid: string | []): Promise<string | null> {
  if (dataSource === 'te') {
    return (await getTeamIdByUserId()) ?? null;
  }
  return getOptionalTeamId(tid);
}

function toProcessTableSelectRow(row: ProcessListRpcRow): any {
  const dataInfo = row.json?.processDataSet?.processInformation;
  return {
    id: row.id,
    name: dataInfo?.dataSetInformation?.name ?? (row as any).name,
    'common:class':
      dataInfo?.dataSetInformation?.classificationInformation?.['common:classification']?.[
        'common:class'
      ] ?? (row as any)['common:class'],
    'common:generalComment':
      dataInfo?.dataSetInformation?.['common:generalComment'] ??
      (row as any)['common:generalComment'],
    'common:referenceYear':
      dataInfo?.time?.['common:referenceYear'] ?? (row as any)['common:referenceYear'],
    typeOfDataSet:
      row.json?.processDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ??
      (row as any).typeOfDataSet,
    '@location':
      dataInfo?.geography?.locationOfOperationSupplyOrProduction?.['@location'] ??
      (row as any)['@location'],
    version: row.version,
    modified_at: row.modified_at,
    team_id: row.team_id,
    model_id: row.model_id,
    model_version: row.model_version,
  };
}

async function mapProcessTableRows(rawRows: any[], lang: string): Promise<ProcessTable[]> {
  const locations = Array.from(new Set(rawRows.map((item: any) => item['@location'])));
  const [locationRes, classificationRes] = await Promise.all([
    getCachedLocationData(lang, locations),
    getCachedClassificationData('Process', lang, ['all']),
  ]);
  const locationMap = new Map(locationRes.map((item: any) => [item['@value'], item['#text']]));
  const classificationData = classificationRes ?? [];

  return rawRows.map((item: any) => {
    try {
      const classification = getLocalizedProcessClassification(
        item['common:class'],
        classificationData,
      );
      let location = item['@location'];
      if (locationMap.has(location)) {
        location = locationMap.get(location);
      }

      return {
        key: item.id + ':' + item.version,
        id: item.id,
        version: item.version,
        lang,
        name: genProcessName(item.name ?? {}, lang) || String(item.id ?? '').trim(),
        generalComment: getLangText(item['common:generalComment'] ?? {}, lang),
        classification,
        typeOfDataSet: item.typeOfDataSet ?? '-',
        referenceYear: item['common:referenceYear'] ?? '-',
        location: location ?? '-',
        modifiedAt: new Date(item.modified_at),
        teamId: item.team_id,
        modelId: item.model_id,
        ...toProcessModelVersionField(item.model_version),
      };
    } catch (error) {
      console.error(error);
      return { id: item.id, lang } as ProcessTable;
    }
  });
}

export async function listMyProcessesForLca(
  lang: string,
  options: { limit?: number } = {},
): Promise<{ data: LcaMyProcessOption[]; success: boolean; error?: unknown }> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user?.id;
  if (!userId) {
    return { data: [], success: false, error: 'unauthorized' };
  }

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const result = await publicEntity('processes')
    .select(
      `
      id,
      version,
      modified_at,
      json->processDataSet->processInformation->dataSetInformation->name
    `,
    )
    .eq('user_id', userId)
    .order('modified_at', { ascending: false })
    .limit(limit);

  if (result.error) {
    return { data: [], success: false, error: result.error };
  }

  const data = (result.data ?? [])
    .map((item: any) => {
      const id = String(item.id ?? '').trim();
      const version = String(item.version ?? '').trim();
      if (!id || !version) {
        return null;
      }
      const name = genProcessName(item.name ?? {}, lang);
      return {
        id,
        version,
        name: name || `${id}@${version}`,
      };
    })
    .filter((item: LcaMyProcessOption | null): item is LcaMyProcessOption => item !== null);

  return { data, success: true };
}

export async function createProcess(
  id: string,
  data: any,
  modelId?: string,
  options?: NormalizeLangPayloadForSaveOptions & { allocationDraft?: boolean },
) {
  const rawData = await getProcessJsonOrderedForSave(id, data);
  const normalizedResult = await normalizeLangPayloadForSave(rawData, options);
  const newData = normalizedResult?.payload ?? rawData;
  const validationError = normalizedResult?.validationError;
  const langMetadata = buildLangNormalizationMetadata(normalizedResult, rawData);
  if (validationError) {
    return attachLangNormalizationMetadata(
      {
        data: null,
        error: {
          message: validationError,
          code: 'LANG_VALIDATION_ERROR',
          details: '',
          hint: '',
          name: 'LangValidationError',
        },
        status: 400,
        statusText: 'LANG_VALIDATION_ERROR',
        count: null,
      },
      langMetadata,
      options,
    );
  }
  const scalarValidationError = getProcessTidasScalarValidationError(newData);
  if (scalarValidationError) {
    return attachLangNormalizationMetadata(scalarValidationError, langMetadata, options);
  }
  const userTeamId = (await getTeamIdByUserId()) ?? '';
  const { ruleVerification: rule_verification } = await validateDatasetRuleVerification(
    'process data set',
    newData,
    userTeamId,
  );
  const result = await invokeDatasetCommand<ProcessCommandRow>(
    'app_dataset_create',
    {
      id,
      table: 'processes',
      jsonOrdered: newData,
      modelId: modelId ?? null,
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
    {
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
  );
  return attachLangNormalizationMetadata(result, langMetadata, options);
}

export async function createProcessVersion(
  id: string,
  sourceVersion: string,
  data: any,
  modelId?: string,
  options?: NormalizeLangPayloadForSaveOptions & { allocationDraft?: boolean },
) {
  const rawData = await getProcessJsonOrderedForSave(id, data);
  const normalizedResult = await normalizeLangPayloadForSave(rawData, options);
  const newData = normalizedResult?.payload ?? rawData;
  const validationError = normalizedResult?.validationError;
  const langMetadata = buildLangNormalizationMetadata(normalizedResult, rawData);
  if (validationError) {
    return attachLangNormalizationMetadata(
      {
        data: null,
        error: {
          message: validationError,
          code: 'LANG_VALIDATION_ERROR',
          details: '',
          hint: '',
          name: 'LangValidationError',
        },
        status: 400,
        statusText: 'LANG_VALIDATION_ERROR',
        count: null,
      },
      langMetadata,
      options,
    );
  }
  const scalarValidationError = getProcessTidasScalarValidationError(newData);
  if (scalarValidationError) {
    return attachLangNormalizationMetadata(scalarValidationError, langMetadata, options);
  }
  const userTeamId = (await getTeamIdByUserId()) ?? '';
  const { ruleVerification: rule_verification } = await validateDatasetRuleVerification(
    'process data set',
    newData,
    userTeamId,
  );
  const result = await invokeDatasetCreateVersion<ProcessCommandRow>(
    {
      id,
      table: 'processes',
      sourceVersion,
      jsonOrdered: newData,
      modelId: modelId ?? null,
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
    {
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
  );
  return attachLangNormalizationMetadata(result, langMetadata, options);
}

export async function updateProcess(
  id: string,
  version: string,
  data: any,
  modelId?: string,
  options?: NormalizeLangPayloadForSaveOptions & { allocationDraft?: boolean },
): Promise<UpdateProcessResult | undefined> {
  const rawData = await getProcessJsonOrderedForSave(id, data);
  const normalizedResult = await normalizeLangPayloadForSave(rawData, options);
  const newData = normalizedResult?.payload ?? rawData;
  const validationError = normalizedResult?.validationError;
  const langMetadata = buildLangNormalizationMetadata(normalizedResult, rawData);
  if (validationError) {
    return attachLangNormalizationMetadata(
      {
        data: null,
        error: {
          message: validationError,
          code: 'LANG_VALIDATION_ERROR',
          details: '',
          hint: '',
          name: 'LangValidationError',
        },
        status: 400,
        statusText: 'LANG_VALIDATION_ERROR',
        count: null,
      },
      langMetadata,
      options,
    );
  }
  const scalarValidationError = getProcessTidasScalarValidationError(newData);
  if (scalarValidationError) {
    return attachLangNormalizationMetadata(scalarValidationError, langMetadata, options);
  }
  const userTeamId = (await getTeamIdByUserId()) ?? '';
  const { ruleVerification: rule_verification } = await validateDatasetRuleVerification(
    'process data set',
    newData,
    userTeamId,
  );
  const result = await invokeDatasetCommand<ProcessCommandRow>(
    'app_dataset_save_draft',
    {
      id,
      version,
      table: 'processes',
      jsonOrdered: newData,
      modelId,
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
    {
      ruleVerification: options?.allocationDraft ? false : rule_verification,
    },
  );
  return attachLangNormalizationMetadata(result, langMetadata, options);
}

export async function updateProcessApi(id: string, version: string, data: any) {
  void id;
  void version;
  void data;
  return {
    error: createLegacyMutationRemovedError('updateProcessApi'),
  };
}

export async function getProcessTableAll(
  params: DatasetTableParams,
  sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  tid: string | [],
  stateCode?: string | number,
  typeOfDataSet?: string,
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, {
    typeOfDataSet: typeOfDataSet ?? 'all',
  });
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');

  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition,
        mode: 'list',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        sortBy: normalizeProcessSortBy(sortBy),
        sortDirection: normalizeProcessSortDirection(orderBy),
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapProcessListRows(rows, lang),
    );
  }

  const session = await supabase.auth.getSession();
  if (dataSource === 'my' && !session.data.session) {
    return { data: [], success: false };
  }

  const teamId = await getProcessTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return { data: [], success: true };
  }

  if (hasDatasetCatalogFilters(params)) {
    return queryMappedDatasetCatalog(
      {
        datasetKind: 'process',
        dataSource,
        filterCondition,
        stateCode,
        teamId,
        pageCurrent: params.current,
        pageSize: params.pageSize,
        sortBy: normalizeProcessSortBy(sortBy),
        sortDirection: normalizeProcessSortDirection(orderBy),
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapProcessListRows(rows, lang),
    );
  }

  const rpcResult = await supabase.rpc('get_latest_process_versions', {
    page_size: params.pageSize ?? 10,
    page_current: params.current ?? 1,
    data_source: dataSource,
    this_user_id: session?.data?.session?.user?.id ?? '',
    team_id_filter: teamId,
    state_code_filter: typeof stateCode === 'number' ? stateCode : null,
    type_of_data_set_filter: typeOfDataSet ?? 'all',
    sort_by: normalizeProcessSortBy(sortBy),
    sort_direction: normalizeProcessSortDirection(orderBy),
  });

  const result = {
    ...rpcResult,
    count:
      normalizeProcessTotalCount(rpcResult?.data?.[0]) ||
      rpcResult?.count ||
      rpcResult?.data?.length ||
      0,
    data: rpcResult?.data?.map(toProcessTableSelectRow),
  };

  if (result?.error) {
    console.error('error', result?.error);
    return { data: [], success: false, error: result?.error };
  }

  if (!result?.data || result?.data.length === 0) {
    return { data: [], success: true };
  }

  const data = await mapProcessTableRows(result.data, lang);

  return {
    data,
    page: params?.current ?? 1,
    success: true,
    total: result.count,
  };
}

async function getProcessTableAllData(
  params: DatasetTableParams,
  sort: Record<string, SortOrder>,
  lang: string,
  typeOfDataSet?: string,
  ownerDraftOnly = false,
): Promise<ProcessTableResponse> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user?.id;

  if (!userId) {
    return { data: [], success: false, error: 'unauthorized' };
  }

  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');
  if (hasDatasetCatalogFilters(params)) {
    return queryMappedDatasetCatalog(
      {
        datasetKind: 'process',
        dataSource: 'all_data',
        filterCondition: withDatasetClassification(params, {
          typeOfDataSet: typeOfDataSet ?? 'all',
        }),
        ownerDraftOnly,
        versionScope: 'all',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        sortBy: normalizeProcessSortBy(sortBy),
        sortDirection: normalizeProcessSortDirection(orderBy),
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapProcessListRows(rows, lang),
    );
  }

  let query = publicEntity('processes')
    .select(selectStr4Table, { count: 'exact' })
    .or(
      ownerDraftOnly
        ? `state_code.eq.100,and(user_id.eq.${userId},state_code.eq.0)`
        : `state_code.eq.100,user_id.eq.${userId}`,
    )
    .order(sortBy, { ascending: orderBy === 'ascend' })
    .range(
      ((params.current ?? 1) - 1) * (params.pageSize ?? 10),
      (params.current ?? 1) * (params.pageSize ?? 10) - 1,
    );

  if (typeOfDataSet && typeOfDataSet !== 'all') {
    query = query.eq(
      'json_ordered->processDataSet->modellingAndValidation->LCIMethodAndAllocation->>typeOfDataSet',
      typeOfDataSet,
    );
  }

  const result = await query;

  if (result?.error) {
    console.error('error', result?.error);
    return { data: [], success: false, error: result?.error };
  }

  if (!result?.data || result?.data.length === 0) {
    return {
      data: [],
      page: params?.current ?? 1,
      success: true,
      total: result?.count ?? 0,
    };
  }

  const data = await mapProcessTableRows(result.data, lang);
  return {
    data,
    page: params?.current ?? 1,
    success: true,
    total: result?.count ?? 0,
  };
}

export async function getConnectableProcessesTable(
  params: DatasetTableParams,
  sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  tid: string | [],
  portId: string,
  flowVersion: string,
) {
  const requestedSort = resolveTableSort(sort, 'modified_at');
  const connectableSortFieldMap: Record<string, string> = {
    id: 'id',
    version: 'version',
    modifiedAt: 'modified_at',
    modified_at: 'modified_at',
  };
  const direction = portId.split(':')[0];
  const flowId = portId.split(':').pop();
  if (!flowId) {
    return { data: [], success: true, page: params.current ?? 1, total: 0 };
  }
  if (dataSource === 'my') {
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      return { data: [], success: false, page: params.current ?? 1, total: 0 };
    }
  }
  const teamId = await getProcessTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return { data: [], success: true, page: params.current ?? 1, total: 0 };
  }
  const result = await queryMappedDatasetCatalog(
    {
      datasetKind: 'process',
      dataSource,
      filterCondition: {
        ...withDatasetClassification(params),
        flowReference: {
          id: flowId,
          version: flowVersion,
          direction: direction.toLowerCase() === 'input' ? 'Output' : 'Input',
        },
      },
      stateCode: null,
      teamId,
      pageCurrent: params.current,
      pageSize: params.pageSize,
      sortBy: connectableSortFieldMap[requestedSort.field] ?? 'modified_at',
      sortDirection: normalizeProcessSortDirection(requestedSort.order),
      versionScope: 'all',
    },
    // eslint-disable-next-line no-use-before-define
    (rows) => mapProcessListRows(rows, lang),
  );
  if (!result.success || result.data.length === 0) {
    return result;
  }
  const lifeCycleResult = await getLifeCyclesByIdAndVersion(
    result.data.map((row) => ({ id: row.id, version: row.version })),
  );
  const lifecycleKeys = new Set(
    (lifeCycleResult.data ?? []).map((row: any) => `${row.id}:${row.version}`),
  );
  return {
    ...result,
    data: result.data.map((row) =>
      lifecycleKeys.has(`${row.id}:${row.version}`) ? { ...row, isFromLifeCycle: true } : row,
    ),
  };
}
export async function getProcessTablePgroongaSearch(
  params: DatasetTableParams,
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  rawFilterCondition: any,
  stateCode?: string | number,
  typeOfDataSet?: string,
  _orderBy?: ProcessSearchOrderBy,
  tid: string | [] = [],
  ownerDraftOnly = false,
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, rawFilterCondition);
  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition: { ...filterCondition, typeOfDataSet: typeOfDataSet ?? 'all' },
        mode: 'lexical',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        queryTerms: [queryText],
        queryText,
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapProcessListRows(rows, lang),
    );
  }
  // const time_start = new Date();
  const session = await supabase.auth.getSession();
  if (!session.data.session) {
    return {
      data: [],
      success: false,
      error: 'unauthorized',
    };
  }
  const teamId = await getProcessTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return {
      data: [],
      success: true,
    };
  }
  const requestParams: { [key: string]: any } = {
    query_text: queryText,
    filter_condition: filterCondition,
    page_size: params.pageSize ?? 10,
    page_current: params.current ?? 1,
    data_source: dataSource,
    this_user_id: session.data.session.user?.id,
    team_id_filter: teamId,
    state_code_filter: ownerDraftOnly ? 0 : typeof stateCode === 'number' ? stateCode : null,
    type_of_data_set_filter: typeOfDataSet ?? 'all',
    query_terms: [queryText],
    owner_draft_only: ownerDraftOnly,
  };
  const result = await supabase.rpc('search_processes', requestParams);
  if (result.error) {
    console.log('error', result.error);
  }
  if (result.data) {
    if (result.data.length === 0) {
      return Promise.resolve({
        data: [],
        success: true,
      });
    }
    const totalCount = result.data[0].total_count;

    const locations: string[] = Array.from(
      new Set(
        result.data.map(
          (i: any) =>
            i.json?.processDataSet?.processInformation?.geography
              ?.locationOfOperationSupplyOrProduction?.['@location'],
        ),
      ),
    );
    const [locationData, classificationData] = await Promise.all([
      getCachedLocationData(lang, locations),
      getCachedClassificationData('Process', lang, ['all']),
    ]);
    const data = mapProcessSearchResultRows(result.data, lang, locationData, classificationData);

    return {
      data,
      page: params.current ?? 1,
      success: true,
      total: totalCount,
    };
  }
}

function normalizeProcessTableResponse(
  result: ProcessTableResponse | undefined,
  fallbackPage: number,
): ProcessTableResponse {
  if (!result) {
    return { data: [], page: fallbackPage, success: false };
  }

  return {
    data: result.data,
    page: result.page ?? fallbackPage,
    success: result.success !== false,
    total: result.total ?? result.data.length,
    error: result.error,
  };
}

function mergeUniqueProcessTableRows(responses: ProcessTableResponse[]): ProcessTable[] {
  const merged: ProcessTable[] = [];
  const seen = new Set<string>();

  responses.forEach((response) => {
    response.data.forEach((row) => {
      const id = String(row.id ?? '').trim();
      const version = String(row.version ?? '').trim();
      const key = version ? `${id}:${version}` : id;
      if (!id || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(row);
    });
  });

  return merged;
}

async function mapProcessListRows(
  rows: ProcessListRpcRow[],
  lang: string,
): Promise<ProcessTable[]> {
  const locations: string[] = Array.from(
    new Set(
      rows.map(
        (i: any) =>
          i.json?.processDataSet?.processInformation?.geography
            ?.locationOfOperationSupplyOrProduction?.['@location'],
      ),
    ),
  );
  const locationData = await getCachedLocationData(lang, locations);
  const classificationData = await getCachedClassificationData('Process', lang, ['all']);

  return rows.map((i: any) => {
    try {
      const dataInfo = i.json?.processDataSet?.processInformation;
      const thisLocation = locationData.find(
        (l: any) =>
          l['@value'] === dataInfo?.geography?.locationOfOperationSupplyOrProduction?.['@location'],
      );
      const location =
        thisLocation?.['#text'] ??
        dataInfo?.geography?.locationOfOperationSupplyOrProduction?.['@location'];
      const classification = getLocalizedProcessClassification(
        dataInfo?.dataSetInformation?.classificationInformation?.['common:classification']?.[
          'common:class'
        ],
        classificationData,
      );

      return {
        key: i.id + ':' + i.version,
        id: i.id,
        lang,
        name: genProcessName(dataInfo?.dataSetInformation?.name ?? {}, lang),
        generalComment: getLangText(
          dataInfo?.dataSetInformation?.['common:generalComment'] ?? {},
          lang,
        ),
        classification,
        referenceYear: dataInfo?.time?.['common:referenceYear'] ?? '-',
        location: location ?? '-',
        version: i.version,
        typeOfDataSet:
          i?.json?.processDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ??
          '-',
        modifiedAt: new Date(i.modified_at ?? 0),
        teamId: i.team_id ?? '',
        modelId: i.model_id ?? '',
        isPublished: i.is_published,
        ...toProcessModelVersionField(i.model_version),
      };
    } catch (e) {
      console.error(e);
      return {
        id: i.id,
      } as ProcessTable;
    }
  });
}

export async function getProcessTableUuidMentionSearch(
  params: ProcessTableQueryParams,
  lang: string,
  dataSource: string,
  uuid: string,
  stateCode?: string | number,
  typeOfDataSet?: string,
  tid?: string | [],
  useOpenDataCatalog?: boolean,
): Promise<ProcessTableResponse & { capped?: boolean }> {
  const filterCondition = withDatasetClassification(params, {
    typeOfDataSet: typeOfDataSet ?? 'all',
  });
  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition,
        mode: 'uuid',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        queryText: uuid,
      },
      (rows) => mapProcessListRows(rows, lang),
    );
  }
  const result = await searchDatasetJsonUuidMentionPage({
    dataSource,
    filterCondition,
    pageCurrent: params.current,
    pageSize: params.pageSize,
    sourceEntityKinds: ['process'],
    stateCode,
    teamId: normalizeDatasetUuidMentionTeamId(tid),
    uuid,
  });
  if (!result.success) {
    return { ...result, data: [] };
  }

  const rows = mapDatasetUuidMentionRowsToListRows(result.data) as ProcessListRpcRow[];

  return {
    ...result,
    data: await mapProcessListRows(rows, lang),
  };
}

async function listAllDataSearchProcessPage(
  params: ProcessTableQueryParams,
  lang: string,
  queryText: string,
  filterCondition: any,
  stateCode: string | number,
  typeOfDataSet: string,
  ownerDraftOnly = false,
): Promise<ProcessTableResponse> {
  const currentPage = Math.max(1, params.current ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 10);
  const loadSearchBySource = async (
    dataSource: 'my' | 'tg',
    pageParams: { current: number; pageSize: number },
  ) =>
    normalizeProcessTableResponse(
      await getProcessTablePgroongaSearch(
        { ...params, ...pageParams },
        lang,
        dataSource,
        queryText,
        filterCondition,
        stateCode,
        typeOfDataSet,
        undefined,
        [],
        ownerDraftOnly && dataSource === 'my',
      ),
      pageParams.current,
    );

  const currentUserHead = await loadSearchBySource('my', {
    current: 1,
    pageSize: 1,
  });
  if (!currentUserHead.success) {
    return {
      data: [],
      page: currentPage,
      success: false,
      total: 0,
      error: currentUserHead.error,
    };
  }

  const openDataHead = await loadSearchBySource('tg', {
    current: 1,
    pageSize: 1,
  });
  if (!openDataHead.success) {
    return {
      data: [],
      page: currentPage,
      success: false,
      total: currentUserHead.total,
      error: openDataHead.error,
    };
  }

  const currentUserTotal = currentUserHead.total!;
  const openDataTotal = openDataHead.total!;
  const pageStartIndex = (currentPage - 1) * pageSize;

  if (pageStartIndex < currentUserTotal) {
    const currentUserPage = await loadSearchBySource('my', {
      current: currentPage,
      pageSize,
    });
    if (!currentUserPage.success) {
      return {
        data: [],
        page: currentPage,
        success: false,
        total: currentUserTotal + openDataTotal,
        error: currentUserPage.error,
      };
    }

    const remainingSlots = Math.max(0, pageSize - currentUserPage.data.length);
    if (remainingSlots === 0) {
      return {
        data: currentUserPage.data,
        page: currentPage,
        success: true,
        total: currentUserTotal + openDataTotal,
      };
    }

    const openDataPage = await loadSearchBySource('tg', {
      current: 1,
      pageSize: remainingSlots,
    });
    if (!openDataPage.success) {
      return {
        data: [],
        page: currentPage,
        success: false,
        total: currentUserTotal + openDataTotal,
        error: openDataPage.error,
      };
    }

    return {
      data: mergeUniqueProcessTableRows([
        currentUserPage,
        {
          ...openDataPage,
          data: openDataPage.data.slice(0, remainingSlots),
        },
      ]),
      page: currentPage,
      success: true,
      total: currentUserTotal + openDataTotal,
    };
  }

  const openDataStartIndex = pageStartIndex - currentUserTotal;
  const openDataPage = await loadSearchBySource('tg', {
    current: Math.floor(openDataStartIndex / pageSize) + 1,
    pageSize: pageSize + (openDataStartIndex % pageSize),
  });
  if (!openDataPage.success) {
    return {
      data: [],
      page: currentPage,
      success: false,
      total: currentUserTotal + openDataTotal,
      error: openDataPage.error,
    };
  }

  const openDataSliceStart = openDataStartIndex % pageSize;
  return {
    data: openDataPage.data.slice(openDataSliceStart, openDataSliceStart + pageSize),
    page: currentPage,
    success: true,
    total: currentUserTotal + openDataTotal,
  };
}

export async function listProcessesForLcaAnalysis(
  params: ProcessTableQueryParams,
  lang: string,
  dataScope: LcaAnalysisProcessScope,
  keyword = '',
  sort: Record<string, SortOrder> = {},
  filterCondition: any = {},
  stateCode: string | number = 'all',
  typeOfDataSet = 'all',
): Promise<ProcessTableResponse> {
  const trimmedKeyword = keyword.trim();

  const loadBySource = async (dataSource: 'my' | 'tg'): Promise<ProcessTableResponse> => {
    if (trimmedKeyword) {
      return normalizeProcessTableResponse(
        await getProcessTablePgroongaSearch(
          params,
          lang,
          dataSource,
          trimmedKeyword,
          filterCondition,
          stateCode,
          typeOfDataSet,
        ),
        params.current ?? 1,
      );
    }

    return normalizeProcessTableResponse(
      await getProcessTableAll(params, sort, lang, dataSource, '', stateCode, typeOfDataSet),
      params.current ?? 1,
    );
  };

  if (dataScope === 'all_data') {
    if (!trimmedKeyword) {
      return await getProcessTableAllData(params, sort, lang, typeOfDataSet);
    }

    return await listAllDataSearchProcessPage(
      params,
      lang,
      trimmedKeyword,
      filterCondition,
      stateCode,
      typeOfDataSet,
    );
  }

  if (dataScope === 'public_plus_owner_draft') {
    if (trimmedKeyword) {
      return await listAllDataSearchProcessPage(
        params,
        lang,
        trimmedKeyword,
        filterCondition,
        stateCode,
        typeOfDataSet,
        true,
      );
    }

    return await getProcessTableAllData(params, sort, lang, typeOfDataSet, true);
  }

  return loadBySource(dataScope === 'open_data' ? 'tg' : 'my');
}

export async function process_hybrid_search(
  params: DatasetTableParams,
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  rawFilterCondition: any,
  stateCode?: string | number,
  typeOfDataSet?: string,
  tid: string | [] = [],
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, rawFilterCondition);
  const teamId = await getProcessTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return {
      data: [],
      success: true,
      page: params.current ?? 1,
      total: 0,
    };
  }
  let result: any = {};
  const bodyParams: { [key: string]: any } = addOpenDataCatalogScope(
    {
      query: queryText,
      version_scope: 'matched',
      match_count: 200,
      filter_condition: filterCondition,
      data_source: dataSource,
      page_size: params.pageSize ?? 10,
      page_current: params.current ?? 1,
    },
    useOpenDataCatalog,
  );
  if (typeof stateCode === 'number') {
    bodyParams['state_code'] = stateCode;
  }
  if (typeOfDataSet && typeOfDataSet !== 'all') {
    bodyParams['type_of_data_set'] = typeOfDataSet;
  }
  if (teamId) {
    bodyParams['team_id'] = teamId;
  }
  const session = await supabase.auth.getSession();
  if (session.data.session) {
    result = await supabase.functions.invoke('process_hybrid_search', {
      headers: {
        Authorization: `Bearer ${session.data.session?.access_token ?? ''}`,
      },
      body: bodyParams,
      region: FunctionRegion.UsEast1,
    });
  }
  if (result.error) {
    console.log('error', result.error);
  }
  const resultData = result.error ? null : readMatchedHybridRows(result.data);
  if (resultData) {
    const totalCount = normalizeProcessResultTotalCount(resultData, result.data);
    if (resultData.length === 0) {
      return Promise.resolve({
        data: [],
        success: true,
        page: params.current ?? 1,
        total: totalCount,
      });
    }

    const locations: string[] = Array.from(
      new Set(
        resultData.map(
          (i: any) =>
            i.json?.processDataSet?.processInformation?.geography
              ?.locationOfOperationSupplyOrProduction?.['@location'],
        ),
      ),
    );
    const [locationData, classificationData] = await Promise.all([
      getCachedLocationData(lang, locations),
      getCachedClassificationData('Process', lang, ['all']),
    ]);
    const data = mapProcessSearchResultRows(resultData, lang, locationData, classificationData);

    return Promise.resolve({
      data: data,
      page: params.current ?? 1,
      success: true,
      total: totalCount,
    });
  }

  return { ...result, data: [], success: false };
}

export async function getProcessDetailByIdAndVersion(
  data: { id: string; version: string }[],
): Promise<ProcessDetailByVersionResponse> {
  if (data && data.length > 0) {
    const orConditions = data.map((k) => `and(id.eq.${k.id},version.eq.${k.version})`).join(',');

    const result = await publicEntity('processes')
      .select('id,json,version, modified_at, state_code')
      .or(orConditions);

    return Promise.resolve({
      data: result?.data ?? [],
      success: true,
    });
  }
  return Promise.resolve({
    data: [],
    success: true,
  });
}

export async function getProcessDetail(id: string, version: string) {
  let result: any = {};
  if (id && id.length === 36) {
    if (version && version.length === 9) {
      result = await publicEntity('processes')
        .select('json,version, modified_at,state_code,rule_verification,team_id,reviews')
        .eq('id', id)
        .eq('version', version);
    } else {
      result = await publicEntity('processes')
        .select('json,version, modified_at,state_code,rule_verification,team_id,reviews')
        .eq('id', id)
        .order('version', { ascending: false })
        .range(0, 0);
    }
    if (result?.data && result.data.length > 0) {
      const data = result.data[0];
      return Promise.resolve({
        data: {
          id: id,
          version: data.version,
          json: data.json,
          modifiedAt: data.modified_at,
          stateCode: data.state_code,
          ruleVerification: data.rule_verification,
          teamId: data.team_id,
          reviews: data.reviews,
        },
        success: true,
      });
    }
  }
  return Promise.resolve({
    data: null,
    success: true,
  });
}

export async function deleteProcess(id: string, version: string) {
  const result = await invokeDatasetCommand('app_dataset_delete', {
    id,
    version,
    table: 'processes',
  });
  return normalizeDeleteCommandResult(result);
}

export async function getProcessExchange(
  exchangeData: any[],
  direction: string,
  params: DatasetTableParams,
) {
  const data = exchangeData.filter(
    (i) => i.exchangeDirection.toUpperCase() === direction.toUpperCase(),
  );
  const start = ((params.current ?? 1) - 1) * (params.pageSize ?? 10);
  const end = start + (params.pageSize ?? 10);
  const paginatedData = data.slice(start, end);
  return Promise.resolve({
    data: paginatedData,
    page: params.current ?? 1,
    success: true,
    total: data.length,
  });
}

export async function getProcessDetailByIdsAndVersion(ids: string[], version: string) {
  if (ids && ids.length > 0) {
    const result = await publicEntity('processes')
      .select('id,json,version, modified_at')
      .eq('version', version)
      .in('id', ids);

    return Promise.resolve({
      data: result.data ?? [],
      success: true,
    });
  }
  return Promise.resolve({
    data: [],
    success: true,
  });
}

export async function getProcessesByIdAndVersion(
  params: { id: string; version: string }[],
  lang?: string,
  filters: ProcessExactSetFilters = {},
) {
  if (!params || params.length === 0) {
    return {
      data: [],
      success: true,
      page: 1,
      total: 0,
    };
  }
  try {
    validateProcessExactSetFilters(filters);
  } catch (error) {
    return { data: [], success: false, page: 1, total: 0, error };
  }
  const references = Array.from(
    new Map(
      params.map((reference) => [`${reference.id}:${reference.version}`, reference]),
    ).values(),
  );
  const rows = new Map<string, any>();
  const batchSize = 50;
  for (let batchStart = 0; batchStart < references.length; batchStart += batchSize) {
    const batch = references.slice(batchStart, batchStart + batchSize);
    const exactKeys = new Set(batch.map((reference) => `${reference.id}:${reference.version}`));
    const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const orConditions = batch
      .map(
        (reference) => `and(id.eq.${quote(reference.id)},version.eq.${quote(reference.version)})`,
      )
      .join(',');
    const batchRows = new Map<string, any>();
    let offset = 0;
    while (true) {
      const result = await publicEntity('processes')
        .select(
          `${selectStr4Table},json->processDataSet->processInformation->dataSetInformation->classificationInformation`,
          { count: 'exact' },
        )
        .or(orConditions)
        .order('id', { ascending: true })
        .order('version', { ascending: true })
        .range(offset, offset + batch.length - 1);
      if (result.error) {
        return { data: [], success: false, page: 1, total: 0, error: result.error };
      }
      const pageRows = result.data ?? [];
      const count = typeof result.count === 'number' ? result.count : undefined;
      const previousSize = batchRows.size;
      for (const row of pageRows) {
        const key = `${row.id}:${row.version}`;
        if (!exactKeys.has(key)) {
          return {
            data: [],
            success: false,
            page: 1,
            total: 0,
            error: new Error('Unexpected exact-process identity'),
          };
        }
        batchRows.set(key, row);
      }
      if (count !== undefined && (count < batchRows.size || count > batch.length)) {
        return {
          data: [],
          success: false,
          page: 1,
          total: 0,
          error: new Error('Invalid exact-process count'),
        };
      }
      if (
        (count !== undefined && batchRows.size === count) ||
        batchRows.size === batch.length ||
        (count === undefined && pageRows.length === 0)
      ) {
        break;
      }
      if (pageRows.length === 0 || batchRows.size === previousSize) {
        return {
          data: [],
          success: false,
          page: 1,
          total: 0,
          error: new Error('Incomplete exact-process response'),
        };
      }
      offset += pageRows.length;
    }
    batchRows.forEach((row, key) => rows.set(key, row));
  }
  const matchedRows = Array.from(rows.values()).filter(
    (row) =>
      matchesProcessExactSetClassification(row.classificationInformation, filters.classification) &&
      matchesProcessExactSetKeyword(row, filters.keyword),
  );
  const locations = Array.from(
    new Set(matchedRows.map((row) => row['@location']).filter(Boolean)),
  ) as string[];
  const locationData =
    lang && locations.length > 0 ? await getCachedLocationData(lang, locations) : [];
  const locationMap = new Map(
    locationData.map((location: any) => [location['@value'], location['#text']]),
  );

  let data: any[] = [];
  if (lang) {
    data = matchedRows.map((i: any) => {
      return {
        key: i.id + ':' + i.version,
        id: i.id,
        version: i.version,
        lang: lang,
        name: genProcessName(i.name ?? {}, lang),
        generalComment: getLangText(i['common:generalComment'] ?? {}, lang),
        // classification,
        typeOfDataSet: i.typeOfDataSet ?? '-',
        referenceYear: i['common:referenceYear'] ?? '-',
        location: locationMap.get(i['@location']) ?? i['@location'] ?? '-',
        modifiedAt: new Date(i.modified_at),
        teamId: i.team_id,
        modelId: i.model_id,
        ...toProcessModelVersionField(i.model_version),
      };
    });
  } else {
    data = matchedRows.map((i: any) => {
      return {
        key: i.id + ':' + i.version,
        id: i.id,
        version: i.version,
        lang: lang,
        name: i.name,
        typeOfDataSet: i.typeOfDataSet ?? '-',
        referenceYear: i['common:referenceYear'] ?? '-',
        location: i['@location'] ?? '-',
        modifiedAt: new Date(i.modified_at),
        teamId: i.team_id,
        modelId: i.model_id,
        ...toProcessModelVersionField(i.model_version),
        userId: i.user_id,
      };
    });
  }

  return {
    data: data,
    success: true,
    page: 1,
    total: matchedRows.length,
  };
}

export async function validateProcessesByIdAndVersion(id: string, version: string) {
  const resultVersion = await publicEntity('processes')
    .select('id,version')
    .eq('id', id)
    .eq('version', version);
  if (resultVersion?.data && resultVersion.data.length > 0) {
    return true;
  }
  // const result = await publicEntity('processes').select('id,version').eq('id', id);
  // if (result?.data && result.data.length > 0) {
  //   return true;
  // }
  return false;
}

export async function contributeProcess(id: string, version: string) {
  const currentUser = await getCurrentUser();
  const userid = currentUser?.userid;

  if (!userid) {
    console.error('Failed to get current user');
    return { error: true, message: 'Failed to get current user' };
  }

  const processDetail = await getProcessDetailByIdAndVersion([{ id, version }]);
  const refs = getAllRefObj(processDetail);

  const needContributeMap = new Map<string, any>();
  const processedRefsSet = new Set<string>();

  const processRefsRecursively = async (refsList: any[]): Promise<void> => {
    const uniqueRefsMap = new Map<string, any>();
    refsList.forEach((ref: any) => {
      const key = `${ref['@refObjectId']}:${ref['@version']}:${ref['@type']}`;
      if (!processedRefsSet.has(key)) {
        uniqueRefsMap.set(key, ref);
        processedRefsSet.add(key);
      }
    });

    if (uniqueRefsMap.size === 0) {
      return;
    }

    const uniqueRefs = Array.from(uniqueRefsMap.values());
    const refDataPromises = uniqueRefs.map(async (ref: any) => {
      const tableName = getRefTableName(ref['@type']);

      if (!tableName) {
        return null;
      }

      try {
        const refData = await getRefData(ref['@refObjectId'], ref['@version'], tableName);
        return {
          ref,
          refData: refData?.data,
          success: refData?.success,
        };
      } catch (error) {
        console.error('Error fetching ref data:', error);
        return null;
      }
    });

    const refResults = await Promise.all(refDataPromises);

    const nextLevelRefs: any[] = [];

    refResults.forEach((item) => {
      if (item && item.success && item.refData) {
        const refKey = `${item.ref['@refObjectId']}:${item.ref['@version']}:${item.ref['@type']}`;

        if (
          item.refData.stateCode !== 100 &&
          item.refData.stateCode !== 200 &&
          item.refData.userId === userid
        ) {
          if (!needContributeMap.has(refKey)) {
            needContributeMap.set(refKey, {
              type: item.ref['@type'],
              ...item.refData,
              id: item.ref['@refObjectId'],
              version: item.ref['@version'],
            });
          }
        }

        if (item.refData.json) {
          const subRefs = getAllRefObj(item.refData.json);
          if (subRefs && subRefs.length > 0) {
            nextLevelRefs.push(...subRefs);
          }
        }
      }
    });

    if (nextLevelRefs.length > 0) {
      await processRefsRecursively(nextLevelRefs);
    }
  };

  await processRefsRecursively(refs);

  const result = Array.from(needContributeMap.values());
  result.push({
    id: id,
    version: version,
    type: 'process data set',
  });

  const contributePromises = result.map(async (item) => {
    const tableName = getRefTableName(item.type);
    if (!tableName) {
      return {
        success: false,
        error: 'Invalid table name',
        id: item.id,
        version: item.version,
      };
    }

    try {
      const contributeResult = await contributeSource(tableName, item.id, item.version);
      return {
        success: true,
        data: contributeResult,
        id: item.id,
        version: item.version,
        type: item.type,
      };
    } catch (error) {
      console.error('Error contributing data:', error);
      return {
        success: false,
        error,
        id: item.id,
        version: item.version,
      };
    }
  });

  const contributeResults = await Promise.all(contributePromises);

  return {
    success: true,
    needContribute: result,
    contributeResults,
  };
}
