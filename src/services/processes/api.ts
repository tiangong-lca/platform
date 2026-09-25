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
import {
  addOpenDataHybridFilters,
  queryMappedOpenDataCatalog,
  type OpenDataCatalogFilters,
} from '../openDataCatalog/api';
import {
  toProcessModelVersionField,
  type ProcessDetailByVersionResponse,
  type ProcessTable,
} from './data';
import { genProcessJsonOrdered, genProcessName } from './util';
import { processSiteFromRow } from './siteLabel';

const selectStr4Table = `
    id,
    json->processDataSet->processInformation->dataSetInformation->name,
    json->processDataSet->processInformation->dataSetInformation->classificationInformation->"common:classification"->"common:class",
    json->processDataSet->processInformation->dataSetInformation->"common:generalComment",
    json->processDataSet->processInformation->time->>"common:referenceYear",
    json->processDataSet->modellingAndValidation->LCIMethodAndAllocation->typeOfDataSet,
    json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->>"@location",
    json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->descriptionOfRestrictions,
    json->processDataSet->processInformation->quantitativeReference->>referenceToReferenceFlow,
    json->processDataSet->processInformation->technology->technologyDescriptionAndIncludedProcesses,
    json->processDataSet->processInformation->technology->technologicalApplicability,
    json->processDataSet->exchanges->exchange,
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

type ProcessTableQueryParams = {
  current?: number;
  pageSize?: number;
};

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
        site: processSiteFromRow(i),
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
    descriptionOfRestrictions:
      dataInfo?.geography?.locationOfOperationSupplyOrProduction?.descriptionOfRestrictions ??
      (row as any).descriptionOfRestrictions,
    referenceToReferenceFlow:
      dataInfo?.quantitativeReference?.referenceToReferenceFlow ??
      (row as any).referenceToReferenceFlow,
    technologyDescriptionAndIncludedProcesses:
      dataInfo?.technology?.technologyDescriptionAndIncludedProcesses ??
      (row as any).technologyDescriptionAndIncludedProcesses,
    technologicalApplicability:
      dataInfo?.technology?.technologicalApplicability ?? (row as any).technologicalApplicability,
    exchange: row.json?.processDataSet?.exchanges?.exchange ?? (row as any).exchange,
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
        site: processSiteFromRow(item),
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
  options?: NormalizeLangPayloadForSaveOptions,
) {
  const rawData = genProcessJsonOrdered(id, data);
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
      ruleVerification: rule_verification,
    },
    {
      ruleVerification: rule_verification,
    },
  );
  return attachLangNormalizationMetadata(result, langMetadata, options);
}

export async function createProcessVersion(
  id: string,
  sourceVersion: string,
  data: any,
  modelId?: string,
  options?: NormalizeLangPayloadForSaveOptions,
) {
  const rawData = genProcessJsonOrdered(id, data);
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
      ruleVerification: rule_verification,
    },
    {
      ruleVerification: rule_verification,
    },
  );
  return attachLangNormalizationMetadata(result, langMetadata, options);
}

export async function updateProcess(
  id: string,
  version: string,
  data: any,
  modelId?: string,
  options?: NormalizeLangPayloadForSaveOptions,
): Promise<UpdateProcessResult | undefined> {
  const rawData = genProcessJsonOrdered(id, data);
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
      ruleVerification: rule_verification,
    },
    {
      ruleVerification: rule_verification,
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
  params: {
    current?: number;
    pageSize?: number;
  },
  sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  tid: string | [],
  stateCode?: string | number,
  typeOfDataSet?: string,
  openDataFilters?: OpenDataCatalogFilters,
) {
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');

  if (dataSource === 'tg' && openDataFilters) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition: { typeOfDataSet: typeOfDataSet ?? 'all' },
        filters: openDataFilters,
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
  params: {
    current?: number;
    pageSize?: number;
  },
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
  params: {
    current?: number;
    pageSize?: number;
  },
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
  const sortBy = connectableSortFieldMap[requestedSort.field] ?? 'modified_at';
  const orderBy = requestedSort.order;
  const direction = portId.split(':')[0];
  const flowId = portId.split(':').pop();
  if (!flowId) {
    return { data: [], success: true };
  }

  const selectStr = `
      id,
      json->processDataSet->processInformation->dataSetInformation->name,
      json->processDataSet->processInformation->dataSetInformation->classificationInformation->"common:classification"->"common:class",
      json->processDataSet->processInformation->dataSetInformation->"common:generalComment",
      json->processDataSet->processInformation->time->>"common:referenceYear",
      json->processDataSet->modellingAndValidation->LCIMethodAndAllocation->typeOfDataSet,
      json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->>"@location",
      json->processDataSet->exchanges->exchange,
      version,
      modified_at,
      team_id
    `;

  const tableName = 'processes';

  let query = publicEntity(tableName)
    .select(selectStr, { count: 'exact' })
    .order(sortBy, { ascending: orderBy === 'ascend' });
  // .range(
  //   ((params.current ?? 1) - 1) * (params.pageSize ?? 10),
  //   (params.current ?? 1) * (params.pageSize ?? 10) - 1,
  // );

  const baseFlowRef = flowVersion
    ? { '@refObjectId': flowId, '@version': flowVersion }
    : { '@refObjectId': flowId };

  query = query.filter(
    'json->processDataSet->exchanges->exchange',
    'cs',
    JSON.stringify([{ referenceToFlowDataSet: baseFlowRef }]),
  );

  if (dataSource === 'ex') {
    query = query.eq('state_code', -1);
    if (tid.length > 0) {
      query = query.eq('team_id', tid);
    }
  } else if (dataSource === 'tg') {
    query = query.eq('state_code', 100);
    if (tid.length > 0) {
      query = query.eq('team_id', tid);
    }
  } else if (dataSource === 'co') {
    query = query.eq('state_code', 200);
    if (tid.length > 0) {
      query = query.eq('team_id', tid);
    }
  } else if (dataSource === 'my') {
    const session = await supabase.auth.getSession();
    if (session.data.session) {
      query = query.eq('user_id', session?.data?.session?.user?.id);
    } else {
      return { data: [], success: false };
    }
  } else if (dataSource === 'te') {
    const teamId = await getTeamIdByUserId();
    if (teamId) {
      query = query.eq('team_id', teamId);
    } else {
      return { data: [], success: true };
    }
  }

  const result = await query;

  if (result?.error) {
    console.error('error', result?.error);
    return { data: [], success: false, error: result?.error };
  }

  if (!result?.data || result?.data.length === 0) {
    return { data: [], success: true };
  }
  const exchangeDirection = direction.toLowerCase() === 'input' ? 'output' : 'input';
  const filteredData = result.data.filter((i: any) =>
    i.exchange.find(
      (j: any) =>
        j?.exchangeDirection?.toLowerCase() === exchangeDirection &&
        j?.referenceToFlowDataSet?.['@refObjectId'] === flowId &&
        (flowVersion ? j?.referenceToFlowDataSet?.['@version'] === flowVersion : true),
    ),
  );
  result.data = [...filteredData];

  const locations = Array.from(
    new Set<string>(result.data.map((i: any) => String(i['@location'] ?? ''))),
  ).filter(Boolean);
  const processIdsAndVersions = result.data.map((i: any) => ({ id: i.id, version: i.version }));
  const [locationRes, classificationRes, lifeCycleResult] = await Promise.all([
    getCachedLocationData(lang, locations),
    getCachedClassificationData('Process', lang, ['all']),
    getLifeCyclesByIdAndVersion(processIdsAndVersions),
  ]);
  const locationMap = new Map(locationRes.map((l: any) => [l['@value'], l['#text']]));
  const classificationData = classificationRes ?? [];

  let data: any[] = result.data.map((i: any) => {
    try {
      const classification = getLocalizedProcessClassification(
        i['common:class'],
        classificationData,
      );
      let location = i['@location'];
      if (locationMap.has(location)) {
        location = locationMap.get(location);
      }
      return {
        key: i.id + ':' + i.version,
        id: i.id,
        version: i.version,
        lang: lang,
        name: genProcessName(i.name ?? {}, lang),
        generalComment: getLangText(i['common:generalComment'] ?? {}, lang),
        classification,
        typeOfDataSet: i.typeOfDataSet ?? '-',
        referenceYear: i['common:referenceYear'] ?? '-',
        location: location ?? '-',
        modifiedAt: new Date(i.modified_at),
        teamId: i.team_id,
      };
    } catch (e) {
      console.error(e);
      return { id: i.id };
    }
  });

  if (lifeCycleResult.data && lifeCycleResult.data.length > 0) {
    const lifeCycleMap = new Map(
      lifeCycleResult.data.map((i: any) => [i.id + ':' + i.version, true]),
    );
    data.forEach((i) => {
      if (lifeCycleMap.has(i.id + ':' + i.version)) {
        i.isFromLifeCycle = true;
      }
    });
  }

  return {
    data,
    // page: params?.current ?? 1,
    success: true,
    // total: result?.count ?? 0,
  };
}
export async function getProcessTablePgroongaSearch(
  params: {
    current?: number;
    pageSize?: number;
  },
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  filterCondition: any,
  stateCode?: string | number,
  typeOfDataSet?: string,
  _orderBy?: ProcessSearchOrderBy,
  tid: string | [] = [],
  ownerDraftOnly = false,
  openDataFilters?: OpenDataCatalogFilters,
) {
  if (dataSource === 'tg' && openDataFilters) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition: { ...filterCondition, typeOfDataSet: typeOfDataSet ?? 'all' },
        filters: openDataFilters,
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
        site: processSiteFromRow(i),
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
  openDataFilters?: OpenDataCatalogFilters,
): Promise<ProcessTableResponse & { capped?: boolean }> {
  if (dataSource === 'tg' && openDataFilters) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'process',
        filterCondition: { typeOfDataSet: typeOfDataSet ?? 'all' },
        filters: openDataFilters,
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

  const rows = mapDatasetUuidMentionRowsToListRows(result.data).filter((row) => {
    if (!typeOfDataSet || typeOfDataSet === 'all') {
      return true;
    }
    const sourceJson = row.json as any;
    return (
      sourceJson?.processDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ===
      typeOfDataSet
    );
  }) as ProcessListRpcRow[];

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
    pageParams: Required<ProcessTableQueryParams>,
  ) =>
    normalizeProcessTableResponse(
      await getProcessTablePgroongaSearch(
        pageParams,
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
  params: {
    current?: number;
    pageSize?: number;
  },
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  filterCondition: any,
  stateCode?: string | number,
  typeOfDataSet?: string,
  tid: string | [] = [],
  openDataFilters?: OpenDataCatalogFilters,
) {
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
  const bodyParams: { [key: string]: any } = addOpenDataHybridFilters(
    {
      query: queryText,
      version_scope: 'matched',
      match_count: 200,
      filter_condition: filterCondition,
      data_source: dataSource,
      page_size: params.pageSize ?? 10,
      page_current: params.current ?? 1,
    },
    openDataFilters,
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
  params: {
    current?: number;
    pageSize?: number;
  },
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
) {
  if (!params || params.length === 0) {
    return {
      data: [],
      success: true,
      page: 1,
      total: 0,
    };
  }
  const orConditions = params.map((k) => `and(id.eq.${k.id},version.eq.${k.version})`).join(',');
  const result = await publicEntity('processes').select(selectStr4Table).or(orConditions);

  let data: any[] = [];
  if (lang) {
    data =
      result?.data?.map((i: any) => {
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
          site: processSiteFromRow(i),
          // location: location ?? '-',
          modifiedAt: new Date(i.modified_at),
          teamId: i.team_id,
          modelId: i.model_id,
          ...toProcessModelVersionField(i.model_version),
        };
      }) ?? [];
  } else {
    data =
      result?.data?.map((i: any) => {
        return {
          key: i.id + ':' + i.version,
          id: i.id,
          version: i.version,
          lang: lang,
          name: i.name,
          typeOfDataSet: i.typeOfDataSet ?? '-',
          referenceYear: i['common:referenceYear'] ?? '-',
          site: processSiteFromRow(i),
          modifiedAt: new Date(i.modified_at),
          teamId: i.team_id,
          modelId: i.model_id,
          ...toProcessModelVersionField(i.model_version),
          userId: i.user_id,
        };
      }) ?? [];
  }

  return {
    data: data,
    success: true,
    page: 1,
    total: result.data?.length ?? 0,
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
