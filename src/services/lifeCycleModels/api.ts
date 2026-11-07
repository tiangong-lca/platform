import {
  getAllRefObj,
  getRefTableName,
  validateDatasetRuleVerification,
} from '@/pages/Utils/review';
import { getCurrentUser } from '@/services/auth';
import {
  attachLangNormalizationMetadata,
  buildLangNormalizationMetadata,
  contributeSource,
  getRefData,
  normalizeLangPayloadForSave,
  type NormalizeLangPayloadForSaveOptions,
} from '@/services/general/api';
import { type SupportedContentLanguage } from '@/services/general/contentLanguageRegistry';
import { supabase } from '@/services/supabase';
import { hasDatasetCatalogFilters, queryMappedDatasetCatalog } from '../datasetCatalog/api';
import {
  withDatasetClassification,
  type DatasetTableParams,
} from '../general/datasetClassification';
import { publicEntity } from '@/services/supabase/public';
import { isRuleVerificationPassed } from '@/utils/ruleVerification';
import { FunctionRegion } from '@supabase/supabase-js';
import type { SortOrder } from 'antd/es/table/interface';
import { getCachedClassificationData } from '../classifications/cache';
import {
  mapDatasetUuidMentionRowsToListRows,
  normalizeDatasetUuidMentionTeamId,
  searchDatasetJsonUuidMentionPage,
} from '../datasetUuidMentionSearch/api';
import { getTeamIdByUserId } from '../general/api';
import { resolveTableSort } from '../general/tableSort';
import {
  classificationToString,
  genLocalizedClassification,
  getLangText,
  jsonToList,
} from '../general/util';
import { addOpenDataCatalogScope, queryMappedOpenDataCatalog } from '../openDataCatalog/api';
import { genProcessName } from '../processes/util';
import type {
  LifeCycleModelGraphData,
  LifeCycleModelJsonTg,
  LifeCycleModelMutationResult,
  LifeCycleModelPersistencePlan,
  LifeCycleModelTable,
  Up2DownEdge,
} from './data';
import {
  buildDeleteLifeCycleModelBundlePayload,
  buildReviewUpdateLifeCycleModelPersistencePlan,
  buildSaveLifeCycleModelPersistencePlan,
} from './persistencePlan';
import {
  genLifeCycleModelJsonOrdered,
  MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE,
} from './util';
import {
  CalculationCancelledError,
  CalculationError,
  CalculationOperation,
} from './matrixCalculation/types';
import { genLifeCycleModelProcesses } from './util_calculate';

type LifeCycleModelListRpcRow = {
  id?: string;
  json?: any;
  version?: string;
  modified_at?: string;
  team_id?: string;
  total_count?: number | string | null;
};

type LifeCycleModelSearchOrderBy = {
  key: 'common:class' | 'baseName';
  lang?: SupportedContentLanguage;
  order: 'asc' | 'desc';
};

type LifeCycleModelMutationOptions = NormalizeLangPayloadForSaveOptions & {
  persistenceGraph?: LifeCycleModelGraphData;
  /**
   * zh-CN: 覆盖整个保存操作（源加载 → 求解 → LCIA → 提交）的取消标识；
   * 提交前复核，已提交后取消不承诺撤销。
   * en-US: A cancellation handle spanning the whole save operation; re-checked
   * before committing. Cancelling after the commit leaves the outcome to the
   * save result (no undo promise).
   */
  operation?: CalculationOperation;
  /**
   * zh-CN: 内存中的模型摘要比对回调：计算完成后、提交保存前调用；返回 true
   * 表示编辑态已变化，本次计算结果按 RESULT_DISCARDED 丢弃，不覆盖新编辑态，
   * 不写入持久化数据。
   * en-US: In-memory model signature callback invoked after calculation and
   * before submitting the save; returning true discards this run as
   * RESULT_DISCARDED so stale results never overwrite the newer edit state or
   * persisted data.
   */
  hasModelChanged?: () => boolean;
};

function normalizeLifeCycleModelTotalCount(row?: LifeCycleModelListRpcRow): number {
  return Number(row?.total_count ?? 0) || 0;
}

function normalizeLifeCycleModelResultTotalCount(
  resultData: LifeCycleModelListRpcRow[],
  resultBody?: any,
): number {
  return (
    normalizeLifeCycleModelTotalCount(resultData[0]) ||
    Number((resultData as any).total_count ?? 0) ||
    Number(resultBody?.total_count ?? 0) ||
    0
  );
}

function normalizeLifeCycleModelSortBy(sortBy: string): string {
  if (sortBy === 'modifiedAt') {
    return 'modified_at';
  }
  if (sortBy === 'createdAt') {
    return 'created_at';
  }
  return sortBy;
}

function normalizeLifeCycleModelSortDirection(orderBy: SortOrder): 'asc' | 'desc' {
  return orderBy === 'ascend' ? 'asc' : 'desc';
}

function getLocalizedLifeCycleModelClassification(
  classificationSource: any,
  classificationData: any,
  fallback?: any,
): string {
  return classificationToString(
    genLocalizedClassification(jsonToList(classificationSource), classificationData ?? []) ??
      fallback,
  );
}

function mapLifeCycleModelSearchResultRows(
  rows: LifeCycleModelListRpcRow[],
  lang: string,
  classificationData: any,
): LifeCycleModelTable[] {
  return rows.map((i: any) => {
    try {
      const dataInfo = i.json?.lifeCycleModelDataSet?.lifeCycleModelInformation;

      return {
        key: i.id,
        id: i.id,
        name: genProcessName(dataInfo?.dataSetInformation?.name ?? {}, lang),
        generalComment: getLangText(
          dataInfo?.dataSetInformation?.['common:generalComment'] ?? {},
          lang,
        ),
        classification: getLocalizedLifeCycleModelClassification(
          dataInfo?.dataSetInformation?.classificationInformation?.['common:classification']?.[
            'common:class'
          ],
          classificationData,
        ),
        version: i?.version ?? '',
        modifiedAt: new Date(i?.modified_at ?? 0),
        teamId: i?.team_id ?? '',
      };
    } catch (error) {
      console.error(error);
      return { id: i.id } as LifeCycleModelTable;
    }
  });
}

async function getLifeCycleModelTeamFilter(
  dataSource: string,
  tid?: string | [],
): Promise<string | null> {
  if (dataSource === 'te') {
    return (await getTeamIdByUserId()) ?? null;
  }
  return normalizeDatasetUuidMentionTeamId(tid);
}

function buildMutationError(
  code: string,
  message: string,
  details?: unknown,
): LifeCycleModelMutationResult {
  return {
    ok: false,
    code,
    message,
    details,
  };
}

/**
 * zh-CN: 将本地矩阵计算的取消/失败映射为可展示的失败结果。取消不是错误：
 * 以 CALCULATION_CANCELLED 状态码区分，UI 用状态文案提示；失败携带可定位
 * 的 calculationIssues。计算失败不更新任何已保存结果。
 * en-US: Map local matrix calculation cancellation/failure to a displayable
 * failure result. Cancellation is not an error: it is distinguished by the
 * CALCULATION_CANCELLED code and surfaced with status copy; failures carry
 * locatable calculationIssues. Failed calculations never update saved results.
 */
function buildCalculationMutationError(error: unknown): LifeCycleModelMutationResult | undefined {
  if (error instanceof CalculationCancelledError) {
    return buildMutationError('CALCULATION_CANCELLED', '');
  }
  if (error instanceof CalculationError) {
    return {
      ...buildMutationError(error.code, ''),
      calculationIssues: error.issues,
    };
  }
  return undefined;
}

type LifeCycleModelCalculationOutcome =
  | {
      ok: true;
      lifeCycleModelProcesses: any[];
      up2DownEdges: Up2DownEdge[];
      lciaIncomplete: boolean;
    }
  | { ok: false; error: LifeCycleModelMutationResult };

/**
 * zh-CN: 运行本地矩阵计算并归一化取消/失败结果；成功时返回聚合结果与 LCIA
 * 覆盖状态。
 * en-US: Run the local matrix calculation and normalize cancellation/failure;
 * on success return the aggregates and the LCIA coverage state.
 */
async function runLifeCycleModelCalculation(input: {
  modelId: string;
  nodes: any[];
  lifeCycleModelJsonOrdered: any;
  oldSubmodels: any[];
  operation?: CalculationOperation;
}): Promise<LifeCycleModelCalculationOutcome> {
  try {
    const { lifeCycleModelProcesses, up2DownEdges, lciaIncomplete } =
      await genLifeCycleModelProcesses(
        input.modelId,
        input.nodes,
        input.lifeCycleModelJsonOrdered,
        input.oldSubmodels,
        ...(input.operation ? [{ operation: input.operation }] : []),
      );
    return { ok: true, lifeCycleModelProcesses, up2DownEdges, lciaIncomplete: !!lciaIncomplete };
  } catch (error) {
    const calculationError = buildCalculationMutationError(error);
    if (calculationError) {
      return { ok: false, error: calculationError };
    }
    throw error;
  }
}

function buildFlowVersionMutationError(error: unknown): LifeCycleModelMutationResult | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE ||
    !('message' in error) ||
    typeof error.message !== 'string'
  ) {
    return undefined;
  }

  return buildMutationError(
    MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE,
    error.message,
    'details' in error ? error.details : undefined,
  );
}

function serializeLifeCycleModelForMutation(
  id: string,
  data: any,
):
  | { success: true; jsonOrdered: any }
  | { success: false; mutationError: LifeCycleModelMutationResult } {
  try {
    return { success: true, jsonOrdered: genLifeCycleModelJsonOrdered(id, data) };
  } catch (error) {
    const flowVersionError = buildFlowVersionMutationError(error);
    if (flowVersionError) {
      return { success: false, mutationError: flowVersionError };
    }
    throw error;
  }
}

function buildLangValidationError(validationError: string): LifeCycleModelMutationResult {
  return buildMutationError('LANG_VALIDATION_ERROR', validationError);
}

function isLifecycleModelMutationResult(value: unknown): value is LifeCycleModelMutationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

async function parseFunctionInvokeError(error: any): Promise<LifeCycleModelMutationResult> {
  const status = Number(error?.context?.status ?? 0);
  const response = error?.context;

  // 传输层失败（FunctionsFetchError）与网关中继失败（FunctionsRelayError，
  // 可能携带真实 HTTP Response 如 504）都不产生应用层应答：无法证明后端
  // 事务是否提交，必须在任何 HTTP/文本分支之前按未知提交状态处理。
  const errorName = typeof error?.name === 'string' ? error.name : '';
  if (errorName === 'FunctionsFetchError' || errorName === 'FunctionsRelayError') {
    return buildMutationError('SAVE_STATUS_UNKNOWN', error?.message ?? '', error);
  }

  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (isLifecycleModelMutationResult(payload)) {
        return payload;
      }

      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.code === 'string' && typeof record.message === 'string') {
          return buildMutationError(record.code, record.message, record.details);
        }
      }
    } catch (_jsonError) {
      // ignore JSON parse failures and fall back to text / generic handling.
    }
  }

  if (response && typeof response.clone === 'function') {
    try {
      const text = await response.clone().text();
      if (status === 401) {
        return buildMutationError('AUTH_REQUIRED', text || 'Authentication required');
      }
      if (status === 403) {
        return buildMutationError('FORBIDDEN', text || 'Forbidden');
      }
      if (status === 404) {
        return buildMutationError('MODEL_NOT_FOUND', text || 'Lifecycle model not found');
      }
      if (text) {
        return buildMutationError('SAVE_REJECTED', text, { status });
      }
    } catch (_textError) {
      // ignore text parse failures and fall through to generic handling.
    }
  }

  if (status === 401) {
    return buildMutationError('AUTH_REQUIRED', 'Authentication required');
  }
  if (status === 403) {
    return buildMutationError('FORBIDDEN', 'Forbidden');
  }
  if (status === 404) {
    return buildMutationError('MODEL_NOT_FOUND', 'Lifecycle model not found');
  }

  // 有服务器应答状态但无已映射语义：权威拒绝证据，按保存失败处理。
  if (status > 0) {
    return buildMutationError(
      'SAVE_REJECTED',
      error?.message ?? 'Lifecycle model bundle request failed',
      error,
    );
  }

  // 其余无状态错误（无 errorName 匹配、无服务器应答）同样无法证明事务
  // 未提交，按未知提交状态处理。
  return buildMutationError(
    'SAVE_STATUS_UNKNOWN',
    error?.message ?? 'Lifecycle model bundle request failed',
    error,
  );
}

/**
 * zh-CN: 把 LCIA 覆盖状态附加到成功结果（LCIA_INCOMPLETE 通知）。
 * en-US: Attach the LCIA coverage state to a successful result (LCIA_INCOMPLETE notice).
 */
function attachCalculationNotice(
  result: LifeCycleModelMutationResult,
  lciaIncomplete: boolean,
): LifeCycleModelMutationResult {
  if (!result.ok || !lciaIncomplete) return result;
  return { ...result, calculationNotice: 'LCIA_INCOMPLETE' };
}

async function invokeLifecycleModelBundleFunction(
  functionName: 'save_lifecycle_model_bundle' | 'delete_lifecycle_model_bundle',
  body: Record<string, unknown>,
): Promise<LifeCycleModelMutationResult> {
  try {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) {
      return buildMutationError('AUTH_REQUIRED', 'Authentication required');
    }

    const result = await supabase.functions.invoke(functionName, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
      region: FunctionRegion.UsEast1,
    });

    if (!result) {
      return buildMutationError('SAVE_STATUS_UNKNOWN', 'Lifecycle model bundle request failed');
    }

    if (result.error) {
      return parseFunctionInvokeError(result.error);
    }

    if (isLifecycleModelMutationResult(result.data)) {
      return result.data;
    }

    // 后端已应答但载荷无效：无法证明事务未提交，按未知提交状态处理。
    return buildMutationError(
      'SAVE_STATUS_UNKNOWN',
      'Lifecycle model bundle endpoint returned an invalid response',
      result.data,
    );
  } catch (error: any) {
    // 超时/断线等未知提交状态：不断言数据没保存，由 UI 提示先检查保存状态。
    return buildMutationError(
      'SAVE_STATUS_UNKNOWN',
      error?.message ?? 'Lifecycle model bundle request failed',
      error,
    );
  }
}

async function applyReferenceAwareRuleVerification(
  plan: LifeCycleModelPersistencePlan,
  userTeamId: string,
): Promise<LifeCycleModelPersistencePlan> {
  const parentValidation = await validateDatasetRuleVerification(
    'lifeCycleModel data set',
    plan.parent.jsonOrdered,
    userTeamId,
  );

  const processMutations = await Promise.all(
    plan.processMutations.map(async (mutation) => {
      if (mutation.op === 'delete') {
        return mutation;
      }

      const processValidation = await validateDatasetRuleVerification(
        'process data set',
        mutation.jsonOrdered,
        userTeamId,
      );

      return {
        ...mutation,
        ruleVerification: processValidation.ruleVerification,
      };
    }),
  );

  return {
    ...plan,
    parent: {
      ...plan.parent,
      ruleVerification: parentValidation.ruleVerification,
    },
    processMutations,
  };
}

export async function createLifeCycleModel(
  data: any,
  options?: LifeCycleModelMutationOptions,
  createVersionOptions?: { sourceVersion: string },
): Promise<LifeCycleModelMutationResult> {
  const serializationResult = serializeLifeCycleModelForMutation(data.id, data);
  if (!serializationResult.success) {
    return serializationResult.mutationError;
  }
  const rawLifeCycleModelJsonOrdered = serializationResult.jsonOrdered;
  const normalizedCreateResult = await normalizeLangPayloadForSave(
    rawLifeCycleModelJsonOrdered,
    options,
  );
  const normalizedLifeCycleModelJsonOrdered =
    normalizedCreateResult?.payload ?? rawLifeCycleModelJsonOrdered;
  const validationError = normalizedCreateResult?.validationError;
  const langMetadata = buildLangNormalizationMetadata(
    normalizedCreateResult,
    rawLifeCycleModelJsonOrdered,
  );
  if (validationError) {
    return attachLangNormalizationMetadata(
      buildLangValidationError(validationError),
      langMetadata,
      options,
    );
  }

  const calculation = await runLifeCycleModelCalculation({
    modelId: data.id,
    nodes: data?.model?.nodes ?? [],
    lifeCycleModelJsonOrdered: normalizedLifeCycleModelJsonOrdered,
    oldSubmodels: [],
    operation: options?.operation,
  });
  if (!calculation.ok) {
    return attachLangNormalizationMetadata(calculation.error, langMetadata, options);
  }
  if (options?.hasModelChanged?.()) {
    return attachLangNormalizationMetadata(
      buildMutationError('RESULT_DISCARDED', ''),
      langMetadata,
      options,
    );
  }
  const { lifeCycleModelProcesses, up2DownEdges } = calculation;
  const persistenceGraph = options?.persistenceGraph ?? data?.model;

  const planResult = await buildSaveLifeCycleModelPersistencePlan({
    langIntent: options?.intent,
    mode: 'create',
    modelId: data.id,
    lifeCycleModelJsonOrdered: normalizedLifeCycleModelJsonOrdered,
    nodes: persistenceGraph?.nodes ?? [],
    edges: persistenceGraph?.edges ?? [],
    up2DownEdges,
    lifeCycleModelProcesses,
  });

  if (!planResult.ok) {
    return attachLangNormalizationMetadata(
      buildMutationError(planResult.code, planResult.message, planResult.details),
      langMetadata,
      options,
    );
  }
  const userTeamId = (await getTeamIdByUserId()) ?? '';
  const plan = await applyReferenceAwareRuleVerification(planResult.plan, userTeamId);
  const savePlan = createVersionOptions?.sourceVersion
    ? {
        ...plan,
        allocateVersion: true,
        sourceVersion: createVersionOptions.sourceVersion,
      }
    : plan;
  // 提交前复核操作级取消：已取消则不发起保存
  if (options?.operation) {
    if (options.operation.isCancelled()) {
      return attachLangNormalizationMetadata(
        buildMutationError('CALCULATION_CANCELLED', ''),
        langMetadata,
        options,
      );
    }
    options.operation.beginStage('persisting');
  }
  const result = await invokeLifecycleModelBundleFunction('save_lifecycle_model_bundle', savePlan);
  return attachLangNormalizationMetadata(
    attachCalculationNotice(result, calculation.lciaIncomplete),
    langMetadata,
    options,
  );
}

export async function updateLifeCycleModel(
  data: any,
  options?: LifeCycleModelMutationOptions,
): Promise<LifeCycleModelMutationResult> {
  const serializationResult = serializeLifeCycleModelForMutation(data.id, data);
  if (!serializationResult.success) {
    return serializationResult.mutationError;
  }
  const rawLifeCycleModelJsonOrdered = serializationResult.jsonOrdered;
  const normalizedUpdateResult = await normalizeLangPayloadForSave(
    rawLifeCycleModelJsonOrdered,
    options,
  );
  const normalizedLifeCycleModelJsonOrdered =
    normalizedUpdateResult?.payload ?? rawLifeCycleModelJsonOrdered;
  const validationError = normalizedUpdateResult?.validationError;
  const langMetadata = buildLangNormalizationMetadata(
    normalizedUpdateResult,
    rawLifeCycleModelJsonOrdered,
  );
  const currentModelResult = await publicEntity('lifecyclemodels')
    .select('id,json,json_tg->submodels')
    .eq('id', data.id)
    .eq('version', data.version);

  if (currentModelResult.error) {
    return attachLangNormalizationMetadata(
      buildMutationError(
        'MODEL_LOOKUP_FAILED',
        'Failed to load lifecycle model before saving',
        currentModelResult.error,
      ),
      langMetadata,
      options,
    );
  }

  if (!currentModelResult.data || currentModelResult.data.length !== 1) {
    return attachLangNormalizationMetadata(
      buildMutationError('MODEL_NOT_FOUND', 'Lifecycle model not found'),
      langMetadata,
      options,
    );
  }

  const oldSubmodels = jsonToList(currentModelResult.data[0].submodels);
  const currentResultRefs = jsonToList(
    currentModelResult.data[0].json?.lifeCycleModelDataSet?.lifeCycleModelInformation
      ?.dataSetInformation?.referenceToResultingProcess,
  );
  if (!oldSubmodels.some((item) => item.type === 'primary') && currentResultRefs.length > 0) {
    if (
      currentResultRefs.length !== 1 ||
      !currentResultRefs[0]['@refObjectId'] ||
      !currentResultRefs[0]['@version']
    ) {
      return attachLangNormalizationMetadata(
        buildMutationError(
          'RESULT_IDENTITY_AMBIGUOUS',
          'The current primary result cannot be identified uniquely',
        ),
        langMetadata,
        options,
      );
    }
    const ref = currentResultRefs[0];
    const existing = oldSubmodels.find(
      (item) =>
        item.id === ref['@refObjectId'] && (item.version ?? data.version) === ref['@version'],
    );
    if (existing && existing.type && existing.type !== 'primary') {
      return attachLangNormalizationMetadata(
        buildMutationError(
          'RESULT_IDENTITY_AMBIGUOUS',
          'The current result role conflicts with its stored membership',
        ),
        langMetadata,
        options,
      );
    }
    if (existing) existing.type = 'primary';
    else oldSubmodels.push({ id: ref['@refObjectId'], version: ref['@version'], type: 'primary' });
  }
  if (validationError) {
    return attachLangNormalizationMetadata(
      buildLangValidationError(validationError),
      langMetadata,
      options,
    );
  }

  const calculation = await runLifeCycleModelCalculation({
    modelId: data.id,
    nodes: data?.model?.nodes ?? [],
    lifeCycleModelJsonOrdered: normalizedLifeCycleModelJsonOrdered,
    oldSubmodels,
    operation: options?.operation,
  });
  if (!calculation.ok) {
    return attachLangNormalizationMetadata(calculation.error, langMetadata, options);
  }
  if (options?.hasModelChanged?.()) {
    return attachLangNormalizationMetadata(
      buildMutationError('RESULT_DISCARDED', ''),
      langMetadata,
      options,
    );
  }
  const { lifeCycleModelProcesses, up2DownEdges } = calculation;

  const oldKeys = oldSubmodels.map((item) => ({
    id: item.id,
    version: item.version ?? data.version,
  }));
  const oldProcessesResult =
    oldKeys.length > 0
      ? await publicEntity('processes')
          .select('id,version,json,model_id,model_version')
          .or(oldKeys.map((item) => `and(id.eq.${item.id},version.eq.${item.version})`).join(','))
      : { data: [], error: null };
  if (oldProcessesResult.error) {
    return attachLangNormalizationMetadata(
      buildMutationError(
        'PROCESS_LOOKUP_FAILED',
        'Failed to load current model results',
        oldProcessesResult.error,
      ),
      langMetadata,
      options,
    );
  }
  const oldProcesses = oldProcessesResult.data ?? [];
  if (
    oldKeys.some(
      (key) =>
        !oldProcesses.some(
          (row: {
            id: string;
            version: string;
            model_id: string | null;
            model_version: string | null;
          }) =>
            row.id === key.id &&
            row.version === key.version &&
            row.model_id === data.id &&
            (row.model_version ?? row.version) === data.version,
        ),
    )
  ) {
    return attachLangNormalizationMetadata(
      buildMutationError(
        'PROCESS_NOT_FOUND',
        'A current result is missing or does not belong to this model version',
      ),
      langMetadata,
      options,
    );
  }
  const persistenceGraph = options?.persistenceGraph ?? data?.model;

  const planResult = await buildSaveLifeCycleModelPersistencePlan({
    langIntent: options?.intent,
    mode: 'update',
    modelId: data.id,
    version: data.version,
    lifeCycleModelJsonOrdered: normalizedLifeCycleModelJsonOrdered,
    nodes: persistenceGraph?.nodes ?? [],
    edges: persistenceGraph?.edges ?? [],
    up2DownEdges,
    lifeCycleModelProcesses,
    oldSubmodels,
    oldProcesses,
  });

  if (!planResult.ok) {
    return attachLangNormalizationMetadata(
      buildMutationError(planResult.code, planResult.message, planResult.details),
      langMetadata,
      options,
    );
  }
  const userTeamId = (await getTeamIdByUserId()) ?? '';
  const plan = await applyReferenceAwareRuleVerification(planResult.plan, userTeamId);
  // 提交前复核操作级取消：已取消则不发起保存
  if (options?.operation) {
    if (options.operation.isCancelled()) {
      return attachLangNormalizationMetadata(
        buildMutationError('CALCULATION_CANCELLED', ''),
        langMetadata,
        options,
      );
    }
    options.operation.beginStage('persisting');
  }
  const result = await invokeLifecycleModelBundleFunction('save_lifecycle_model_bundle', plan);
  return attachLangNormalizationMetadata(
    attachCalculationNotice(result, calculation.lciaIncomplete),
    langMetadata,
    options,
  );
}

export async function updateLifeCycleModelJsonApi(
  id: string,
  version: string,
  data: any,
  options: { commentReview?: any[]; commentCompliance?: any[] } = {},
): Promise<LifeCycleModelMutationResult> {
  const normalizedResult = await normalizeLangPayloadForSave(data);
  const normalizedData = normalizedResult?.payload ?? data;
  const validationError = normalizedResult?.validationError;
  if (validationError) {
    return buildLangValidationError(validationError);
  }

  const currentModelResult = await publicEntity('lifecyclemodels')
    .select('json_tg, rule_verification')
    .eq('id', id)
    .eq('version', version);

  if (currentModelResult.error) {
    return buildMutationError(
      'MODEL_LOOKUP_FAILED',
      'Failed to load lifecycle model before review update',
      currentModelResult.error,
    );
  }

  if (!currentModelResult.data || currentModelResult.data.length !== 1) {
    return buildMutationError('MODEL_NOT_FOUND', 'Lifecycle model not found');
  }

  const currentModel = currentModelResult.data[0];
  const currentJsonTg = (currentModel.json_tg ?? {}) as LifeCycleModelJsonTg;
  const submodels = jsonToList(currentJsonTg?.submodels);
  const submodelIds = submodels.map((item: any) => item.id).filter(Boolean);

  let currentProcesses: Array<{
    id: string;
    version: string;
    json_ordered: any;
    rule_verification?: boolean | null;
  }> = [];

  if (submodelIds.length > 0) {
    const currentProcessesResult = await publicEntity('processes')
      .select('id, version, json_ordered, rule_verification')
      .eq('version', version)
      .in('id', submodelIds);

    if (currentProcessesResult.error) {
      return buildMutationError(
        'PROCESS_LOOKUP_FAILED',
        'Failed to load current submodel processes before review update',
        currentProcessesResult.error,
      );
    }

    currentProcesses = currentProcessesResult.data ?? [];
  }

  const planResult = await buildReviewUpdateLifeCycleModelPersistencePlan({
    modelId: id,
    version,
    lifeCycleModelJsonOrdered: normalizedData,
    currentJsonTg,
    currentRuleVerification: isRuleVerificationPassed(currentModel.rule_verification),
    submodels,
    currentProcesses,
    commentReview: options.commentReview,
    commentCompliance: options.commentCompliance,
  });

  if (!planResult.ok) {
    return buildMutationError(planResult.code, planResult.message, planResult.details);
  }

  return invokeLifecycleModelBundleFunction('save_lifecycle_model_bundle', planResult.plan);
}

export async function deleteLifeCycleModel(
  id: string,
  version: string,
): Promise<LifeCycleModelMutationResult> {
  return invokeLifecycleModelBundleFunction(
    'delete_lifecycle_model_bundle',
    buildDeleteLifeCycleModelBundlePayload(id, version),
  );
}

export async function getLifeCycleModelTableAll(
  params: DatasetTableParams,
  sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  tid: string,
  stateCode?: string | number,
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, {});
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');
  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'lifecyclemodel',
        filterCondition,
        mode: 'list',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        sortBy: normalizeLifeCycleModelSortBy(sortBy),
        sortDirection: normalizeLifeCycleModelSortDirection(orderBy),
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapLifeCycleModelMentionRows(rows, lang),
    );
  }

  const session = await supabase.auth.getSession();
  if (dataSource === 'my' && !session.data.session) {
    return Promise.resolve({
      data: [],
      success: false,
    });
  }

  const teamId = await getLifeCycleModelTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return Promise.resolve({
      data: [],
      success: true,
    });
  }

  if (hasDatasetCatalogFilters(params)) {
    return queryMappedDatasetCatalog(
      {
        datasetKind: 'lifecyclemodel',
        dataSource,
        filterCondition,
        stateCode,
        teamId,
        pageCurrent: params.current,
        pageSize: params.pageSize,
        sortBy: normalizeLifeCycleModelSortBy(sortBy),
        sortDirection: normalizeLifeCycleModelSortDirection(orderBy),
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapLifeCycleModelMentionRows(rows, lang),
    );
  }

  const rpcResult = await supabase.rpc('get_latest_lifecyclemodel_versions', {
    page_size: params.pageSize ?? 10,
    page_current: params.current ?? 1,
    data_source: dataSource,
    this_user_id: session?.data?.session?.user?.id ?? '',
    team_id_filter: teamId,
    state_code_filter: typeof stateCode === 'number' ? stateCode : null,
    sort_by: normalizeLifeCycleModelSortBy(sortBy),
    sort_direction: normalizeLifeCycleModelSortDirection(orderBy),
  });

  const result = {
    ...rpcResult,
    count:
      normalizeLifeCycleModelTotalCount(rpcResult?.data?.[0]) ||
      rpcResult?.count ||
      rpcResult?.data?.length ||
      0,
    data: rpcResult?.data?.map((i: LifeCycleModelListRpcRow) => ({
      id: i.id,
      name:
        i.json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name ??
        (i as any).name,
      'common:class':
        i.json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation
          ?.classificationInformation?.['common:classification']?.['common:class'] ??
        (i as any)['common:class'],
      'common:generalComment':
        i.json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation?.[
          'common:generalComment'
        ] ?? (i as any)['common:generalComment'],
      version: i.version,
      modified_at: i.modified_at,
      team_id: i.team_id,
    })),
  };

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

    const classificationData = await getCachedClassificationData('LifeCycleModel', lang, ['all']);
    const data = result.data.map((i: any) => {
      try {
        return {
          key: i.id,
          id: i.id,
          name: genProcessName(i.name ?? {}, lang),
          generalComment: getLangText(i?.['common:generalComment'], lang),
          classification: getLocalizedLifeCycleModelClassification(
            i['common:class'],
            classificationData,
            {},
          ),
          version: i?.version,
          modifiedAt: new Date(i?.modified_at),
          teamId: i?.team_id,
        };
      } catch (e) {
        console.error(e);
        return {
          id: i.id,
        };
      }
    });

    return Promise.resolve({
      data: data,
      page: params.current ?? 1,
      success: true,
      total: result.count,
    });
  }
  return Promise.resolve({
    data: [],
    success: false,
  });
}

export async function getLifeCycleModelTablePgroongaSearch(
  params: DatasetTableParams,
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  rawFilterCondition: any,
  stateCode?: string | number,
  _orderBy?: LifeCycleModelSearchOrderBy,
  tid?: string | [],
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, rawFilterCondition);
  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'lifecyclemodel',
        filterCondition,
        mode: 'lexical',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        queryText,
        queryTerms: [queryText],
      },
      // eslint-disable-next-line no-use-before-define
      (rows) => mapLifeCycleModelMentionRows(rows, lang),
    );
  }
  let result: any = {};
  const session = await supabase.auth.getSession();
  if (session.data.session) {
    const teamId = await getLifeCycleModelTeamFilter(dataSource, tid);
    if (dataSource === 'te' && !teamId) {
      return Promise.resolve({
        data: [],
        success: true,
      });
    }

    result = await supabase.rpc(
      'search_lifecyclemodels',
      typeof stateCode === 'number'
        ? {
            query_text: queryText,
            filter_condition: filterCondition,
            page_size: params.pageSize ?? 10,
            page_current: params.current ?? 1,
            data_source: dataSource,
            this_user_id: session.data.session.user?.id,
            team_id_filter: teamId,
            state_code_filter: stateCode,
          }
        : {
            query_text: queryText,
            filter_condition: filterCondition,
            page_size: params.pageSize ?? 10,
            page_current: params.current ?? 1,
            data_source: dataSource,
            this_user_id: session.data.session.user?.id,
            team_id_filter: teamId,
            state_code_filter: null,
          },
    );
  }
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
    const totalCount = normalizeLifeCycleModelTotalCount(result.data[0]) || result.data.length;

    const classificationData = await getCachedClassificationData('LifeCycleModel', lang, ['all']);
    const data = mapLifeCycleModelSearchResultRows(result.data, lang, classificationData);

    return Promise.resolve({
      data: data,
      page: params.current ?? 1,
      success: true,
      total: totalCount,
    });
  }

  return result;
}

async function mapLifeCycleModelMentionRows(
  rows: LifeCycleModelListRpcRow[],
  lang: string,
): Promise<LifeCycleModelTable[]> {
  const classificationData = await getCachedClassificationData('LifeCycleModel', lang, ['all']);

  return rows.map((i: any) => {
    try {
      const dataInfo = i.json?.lifeCycleModelDataSet?.lifeCycleModelInformation;
      return {
        key: i.id,
        id: i.id,
        name: genProcessName(dataInfo?.dataSetInformation?.name ?? {}, lang),
        generalComment: getLangText(
          dataInfo?.dataSetInformation?.['common:generalComment'] ?? {},
          lang,
        ),
        classification: getLocalizedLifeCycleModelClassification(
          dataInfo?.dataSetInformation?.classificationInformation?.['common:classification']?.[
            'common:class'
          ],
          classificationData,
        ),
        version: i?.version ?? '',
        modifiedAt: new Date(i?.modified_at ?? 0),
        teamId: i?.team_id ?? '',
      };
    } catch (e) {
      console.error(e);
      return {
        id: i.id,
        version: i.version ?? '',
        modifiedAt: new Date(i.modified_at ?? 0),
        teamId: i.team_id ?? '',
        name: '-',
        generalComment: '',
        classification: '',
      };
    }
  });
}

export async function getLifeCycleModelTableUuidMentionSearch(
  params: DatasetTableParams,
  lang: string,
  dataSource: string,
  uuid: string,
  stateCode?: string | number,
  tid?: string | [],
  useOpenDataCatalog?: boolean,
) {
  const filterCondition = withDatasetClassification(params, {});
  if (dataSource === 'tg' && useOpenDataCatalog) {
    return queryMappedOpenDataCatalog(
      {
        datasetKind: 'lifecyclemodel',
        filterCondition,
        mode: 'uuid',
        pageCurrent: params.current,
        pageSize: params.pageSize,
        queryText: uuid,
      },
      (rows) => mapLifeCycleModelMentionRows(rows, lang),
    );
  }
  const result = await searchDatasetJsonUuidMentionPage({
    dataSource,
    filterCondition,
    pageCurrent: params.current,
    pageSize: params.pageSize,
    sourceEntityKinds: ['lifecyclemodel'],
    stateCode,
    teamId: normalizeDatasetUuidMentionTeamId(tid),
    uuid,
  });
  if (!result.success) {
    return { ...result, data: [] };
  }

  return {
    ...result,
    data: await mapLifeCycleModelMentionRows(
      mapDatasetUuidMentionRowsToListRows(result.data),
      lang,
    ),
  };
}
export async function lifeCycleModel_hybrid_search(
  params: DatasetTableParams,
  // sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  queryText: string,
  rawFilterCondition: any,
  stateCode?: string | number,
  useOpenDataCatalog?: boolean,
  tid: string | [] = [],
) {
  const filterCondition = withDatasetClassification(params, rawFilterCondition);
  const teamId = await getLifeCycleModelTeamFilter(dataSource, tid);
  if (dataSource === 'te' && !teamId) {
    return { data: [], success: true, page: params.current ?? 1, total: 0 };
  }
  let result: any = {};
  const bodyParams: Record<string, any> = addOpenDataCatalogScope(
    {
      query: queryText,
      filter_condition: filterCondition,
      data_source: dataSource,
      page_size: params.pageSize ?? 10,
      page_current: params.current ?? 1,
    },
    useOpenDataCatalog,
  );
  if (typeof stateCode === 'number') {
    bodyParams.state_code = stateCode;
  }
  if (teamId) {
    bodyParams.team_id = teamId;
  }
  const session = await supabase.auth.getSession();
  if (session.data.session) {
    result = await supabase.functions.invoke('lifecyclemodel_hybrid_search', {
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
  if (result.data?.data) {
    if (result.data?.data.length === 0) {
      return Promise.resolve({
        data: [],
        success: true,
      });
    }
    const resultData = result.data.data;
    const totalCount = normalizeLifeCycleModelResultTotalCount(resultData, result.data);

    const classificationData = await getCachedClassificationData('LifeCycleModel', lang, ['all']);
    const data = mapLifeCycleModelSearchResultRows(resultData, lang, classificationData);

    return Promise.resolve({
      data: data,
      page: params.current ?? 1,
      success: true,
      total: totalCount,
    });
  }

  return result;
}
export async function getLifeCyclesByIdAndVersion(params: { id: string; version: string }[]) {
  if (!params.length) {
    return { data: [] };
  }

  const orConditions = params.map((k) => `and(id.eq.${k.id},version.eq.${k.version})`).join(',');

  const result = await publicEntity('lifecyclemodels')
    .select('id, version, json, json_tg, modified_at, team_id')
    .or(orConditions);

  return result;
}

export async function getLifeCycleModelDetail(
  id: string,
  version: string,
): Promise<
  | {
      data: {
        id: string;
        version: string;
        json: any;
        json_tg: any;
        stateCode: number;
        ruleVerification: any;
      };
      success: true;
    }
  | {
      data: object;
      success: false;
    }
> {
  const result = await publicEntity('lifecyclemodels')
    .select('json, json_tg,state_code,rule_verification,team_id')
    .eq('id', id)
    .eq('version', version);
  if (result.data && result.data.length > 0) {
    const data = result.data[0];

    return Promise.resolve({
      data: {
        id: id,
        version: version,
        json: data.json,
        json_tg: data?.json_tg,
        stateCode: data?.state_code,
        ruleVerification: data?.rule_verification,
        teamId: data?.team_id,
      },
      success: true,
    });
  }
  return Promise.resolve({
    data: {},
    success: false,
  });
}

export async function contributeLifeCycleModel(id: string, version: string) {
  const currentUser = await getCurrentUser();
  const userid = currentUser?.userid;

  if (!userid) {
    console.error('Failed to get current user');
    return { error: true, message: 'Failed to get current user' };
  }

  const modelDetail = await getLifeCycleModelDetail(id, version);
  const refs = getAllRefObj(modelDetail);

  const needContributeMap = new Map<string, any>();
  const processedRefsSet = new Set<string>();

  const modelRefsRecursively = async (refsList: any[]): Promise<void> => {
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
          // 上游按 refObjectId+version+type 去重，此处键必然唯一
          needContributeMap.set(refKey, {
            type: item.ref['@type'],
            ...item.refData,
            id: item.ref['@refObjectId'],
            version: item.ref['@version'],
          });
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
      await modelRefsRecursively(nextLevelRefs);
    }
  };

  await modelRefsRecursively(refs);

  const result = Array.from(needContributeMap.values());
  result.push({
    id: id,
    version: version,
    type: 'lifeCycleModel data set',
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
