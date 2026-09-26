import {
  createLegacyMutationRemovedError,
  invokeDatasetCommand,
  type TidasPackageRootTable,
} from '@/services/general/api';
import { getLifeCyclesByIdAndVersion } from '@/services/lifeCycleModels/api';
import { supabase } from '@/services/supabase';
import type { SupabaseError, SupabaseMutationResult } from '@/services/supabase/data';
import { getUserId, getUsersByIds } from '@/services/users/api';
import { FunctionRegion } from '@supabase/supabase-js';
import { resolveTableSort } from '../general/tableSort';
import { getLangText, jsonToList } from '../general/util';
import { getProcessDetailByIdAndVersion } from '../processes/api';
import { genProcessName } from '../processes/util';
import { isCurrentAssignedReviewerCommentState } from './util';

export type ReviewSubmitDatasetTable = TidasPackageRootTable;
export type ReviewDisplayMode = 'model_process' | 'other' | 'all';
export type ReviewQueueFilters = {
  query?: string;
  displayMode?: ReviewDisplayMode;
  targetTable?: ReviewSubmitDatasetTable;
};
export type ReviewQualityDiagnosticStatus =
  'queued' | 'running' | 'waiting' | 'stale' | 'completed' | 'failed' | 'cancelled';

export type ReviewQualityDiagnosticOutcome = 'clear' | 'findings' | 'not_evaluable';

export type ReviewQualityDiagnosticFinding = {
  code: string;
  category: 'completeness' | 'numerical_stability';
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: unknown;
  workflowBlocking: false;
};

export type ReviewQualityDiagnosticSection = {
  key: 'completeness' | 'numerical_stability';
  status: 'clear' | 'findings' | 'not_evaluable' | 'not_applicable';
  metrics?: Record<string, unknown>;
  findings: ReviewQualityDiagnosticFinding[];
};

export type ReviewQualityDiagnosticReport = {
  schemaVersion: 'review.quality_diagnostic.report.v1';
  runId: string;
  generatedAt?: string;
  requestedAt?: string;
  requestedBy?: string;
  outcome: ReviewQualityDiagnosticOutcome;
  informationalOnly: true;
  affectsReviewState: false;
  scope: {
    kind: 'pending_review';
    reviewStates?: number[];
    reviewCount?: number;
    datasetCount?: number;
    datasetCounts?: Record<string, number>;
    pendingProcessCount?: number;
    pendingProcessSample?: Array<{ id: string; version: string }>;
    pendingProcessSampleTruncated?: boolean;
  };
  summary?: Record<string, unknown>;
  sections: ReviewQualityDiagnosticSection[];
  findings: ReviewQualityDiagnosticFinding[];
};

export type ReviewQualityDiagnosticRun = {
  runId: string;
  status: ReviewQualityDiagnosticStatus;
  outcome?: ReviewQualityDiagnosticOutcome;
  requestedBy?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  reportSchemaVersion?: string;
  report?: ReviewQualityDiagnosticReport;
  error?: {
    code?: string;
    message?: string;
  };
};

export type ReviewQualityDiagnosticRequest =
  { action: 'start' } | { action: 'read'; runId?: string };

type ReviewWorkflowCommandFunctionName =
  | 'admin_review_save_assignment_draft'
  | 'admin_review_assign_reviewers'
  | 'admin_review_revoke_reviewer'
  | 'admin_review_approve'
  | 'admin_review_reject';

export type ReviewBatchDecision = 'approve' | 'reject';

export type ReviewBatchOperation =
  'admin-assign' | 'admin-approve' | 'admin-reject' | 'reviewer-approve' | 'reviewer-reject';

export type ReviewBatchEligibility = {
  ordinal: number;
  review_id: string;
  eligible: boolean;
  reason_code?: string | null;
  state_code?: number | null;
  target_table?: ReviewSubmitDatasetTable | null;
  data_version?: string | null;
  reviewer_count: number;
  submitted_opinion_count: number;
  approve_opinion_count: number;
  reject_opinion_count: number;
};

export type ReviewBatchDecisionResult = {
  ok: boolean;
  command: 'admin_review_batch_decision' | 'reviewer_review_batch_decision';
  batchId: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    reviewId: string;
    ok: boolean;
    code?: string;
    message?: string;
    status?: number;
  }>;
};

type DataNotificationRpcRow = {
  id: string;
  state_code: number;
  json: any;
  modified_at: string;
  total_count?: number | string | null;
};

type ReviewItemRpcRow = {
  id: string;
  data_id?: string;
  data_version?: string;
  state_code?: number;
  review_state_code?: number;
  review_kind?: 'root' | 'reference';
  target_table?: ReviewSubmitDatasetTable;
  reviewer_id?: string[] | null;
  json: any;
  deadline?: string | null;
  created_at?: string;
  modified_at?: string;
  root_matches_status?: boolean;
  root_can_read?: boolean;
  comment_state_code?: number | null;
  comment_json?: any;
  comment_created_at?: string | null;
  comment_modified_at?: string | null;
  reviewer_count?: number | null;
  completed_reviewer_count?: number | null;
  approve_opinion_count?: number | null;
  reject_opinion_count?: number | null;
};

export type RootReviewReferenceProgress = {
  reference_review_id: string;
  target_table: ReviewSubmitDatasetTable;
  data_id: string;
  data_version: string;
  data_name: any;
  submitted_revision_checksum: string;
  state_code: number;
  reviewer_count: number;
  completed_reviewer_count: number;
  actor_comment_state_code?: number | null;
  actor_comment_modified_at?: string | null;
};

type ReviewAdminQueueRpcRow = ReviewItemRpcRow & {
  comment_state_codes?: number[] | null;
  total_count?: number | string | null;
};

type ReviewMemberQueueRpcRow = {
  id: string;
  data_id?: string;
  data_version?: string;
  review_state_code?: number;
  reviewer_id?: string[] | null;
  json: any;
  deadline?: string | null;
  created_at?: string;
  modified_at?: string;
  comment_state_code?: number;
  comment_json?: any;
  comment_created_at?: string;
  comment_modified_at?: string;
  review_kind?: 'root' | 'reference';
  target_table?: ReviewSubmitDatasetTable;
  root_matches_status?: boolean;
  root_can_read?: boolean;
  reviewer_count?: number | null;
  completed_reviewer_count?: number | null;
  approve_opinion_count?: number | null;
  reject_opinion_count?: number | null;
  total_count?: number | string | null;
};

type VisibleReviewUser = {
  id?: string | null;
  email?: string | null;
  display_name?: string | null;
};

async function invokeReviewWorkflowCommand<Row extends Record<string, unknown>>(
  functionName: ReviewWorkflowCommandFunctionName,
  body: Record<string, unknown>,
) {
  return invokeDatasetCommand<Row>(functionName as never, body);
}

async function parseReviewSubmitCommandErrorPayload(error: any) {
  if (!error?.context || typeof error.context.json !== 'function') {
    return null;
  }

  try {
    return await error.context.json();
  } catch (_parseError) {
    return null;
  }
}

function isReviewQualityDiagnosticEnvelope(payload: unknown): payload is {
  command?: string;
  action?: string;
  data?: ReviewQualityDiagnosticRun | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const candidate = payload as { command?: unknown; action?: unknown };
  return (
    candidate.command === 'review_quality_diagnostic' &&
    (candidate.action === 'start' || candidate.action === 'read')
  );
}

function normalizeReviewSubmitCommandError(error: any, payload: any): SupabaseError {
  return {
    message:
      payload?.message || payload?.detail || payload?.error || error?.message || 'Request failed',
    code: typeof payload?.code === 'string' ? payload.code : 'FUNCTION_ERROR',
    details: payload?.details ?? '',
    hint: payload?.hint ?? '',
  } as SupabaseError;
}

async function invokeReviewWorkflowCommandBatch<Row extends Record<string, unknown>>(
  functionName: Exclude<
    ReviewWorkflowCommandFunctionName,
    'admin_review_revoke_reviewer' | 'admin_review_approve' | 'admin_review_reject'
  >,
  reviewIds: React.Key[],
  buildBody: (reviewId: string) => Record<string, unknown>,
) {
  const results = await Promise.all(
    reviewIds.map((reviewId) =>
      invokeReviewWorkflowCommand<Row>(functionName, buildBody(String(reviewId))),
    ),
  );

  const firstError = results.find((result) => result.error);

  return {
    data: results.flatMap((result) => result.data ?? []),
    error: firstError?.error ?? null,
    count: null,
    status: firstError?.status ?? 200,
    statusText: firstError?.statusText ?? 'OK',
  };
}

function normalizeTotalCount(value: number | string | null | undefined) {
  return Number(value ?? 0) || 0;
}

function normalizeReviewUserText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getReviewSubmitterId(row: Pick<ReviewItemRpcRow, 'json'>) {
  return normalizeReviewUserText(row?.json?.user?.id);
}

async function getReviewSubmitterNamesById(rows: Array<Pick<ReviewItemRpcRow, 'json'>>) {
  const userIds = [...new Set(rows.map(getReviewSubmitterId).filter((id): id is string => !!id))];
  const namesById = new Map<string, string>();

  if (userIds.length === 0) {
    return namesById;
  }

  try {
    const users = (await getUsersByIds(userIds)) as VisibleReviewUser[] | null;
    (users ?? []).forEach((user) => {
      const userId = normalizeReviewUserText(user.id);
      const userName =
        normalizeReviewUserText(user.display_name) ?? normalizeReviewUserText(user.email);
      if (userId && userName) {
        namesById.set(userId, userName);
      }
    });
  } catch (_error) {
    // Identity enrichment is best-effort; retained review snapshots remain the safe fallback.
  }

  return namesById;
}

function mapReviewRowToTableData(
  row: ReviewItemRpcRow,
  lang: string,
  lifecycleModels: any[],
  {
    comments = [],
    submitterNamesById,
  }: {
    comments?: { state_code: number }[];
    submitterNamesById: ReadonlyMap<string, string>;
  },
) {
  const model = lifecycleModels?.find(
    (candidate) =>
      candidate.id === row?.json?.data?.id && candidate.version === row?.json?.data?.version,
  );
  const modelName =
    model?.json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name;
  const reviewKind = row.review_kind ?? row?.json?.review_kind;
  const targetTable = row.target_table ?? row?.json?.data?.table;
  const stateCode = row.state_code ?? row.review_state_code;
  const submitterId = getReviewSubmitterId(row);
  const submitterName =
    (submitterId ? submitterNamesById.get(submitterId) : undefined) ??
    normalizeReviewUserText(row?.json?.user?.name) ??
    normalizeReviewUserText(row?.json?.user?.email) ??
    '-';

  return {
    key: row.id,
    id: row.id,
    isFromLifeCycle: Boolean(model),
    ...(reviewKind ? { reviewKind } : {}),
    ...(targetTable ? { targetTable } : {}),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(row.root_matches_status !== undefined
      ? { rootMatchesStatus: row.root_matches_status }
      : {}),
    ...(row.root_can_read !== undefined ? { rootCanRead: row.root_can_read } : {}),
    reviewerCount: Number(row.reviewer_count ?? 0),
    completedReviewerCount: Number(row.completed_reviewer_count ?? 0),
    approveOpinionCount: Number(row.approve_opinion_count ?? 0),
    rejectOpinionCount: Number(row.reject_opinion_count ?? 0),
    ...(row.comment_state_code !== undefined
      ? { actorCommentStateCode: row.comment_state_code }
      : {}),
    ...(row.comment_json !== undefined ? { actorCommentJson: row.comment_json } : {}),
    ...(row.comment_modified_at
      ? { actorCommentModifiedAt: new Date(row.comment_modified_at).toISOString() }
      : {}),
    name:
      (model
        ? genProcessName(modelName ?? {}, lang)
        : genProcessName(row?.json?.data?.name ?? {}, lang)) || '-',
    teamName: getLangText(row?.json?.team?.name ?? {}, lang),
    userName: submitterName,
    createAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    modifiedAt: row.modified_at ? new Date(row.modified_at).toISOString() : undefined,
    deadline: row.deadline ? new Date(row.deadline).toISOString() : row.deadline,
    json: row?.json,
    comments,
    modelData: model
      ? { id: model.id, version: model.version, json: model.json, json_tg: model.json_tg }
      : null,
  };
}

export async function getRootReviewReferenceProgress(reviewId: string) {
  const { data, error } = await supabase.rpc('qry_root_review_reference_progress_v2', {
    p_root_review_id: reviewId,
  });

  return {
    data: (data ?? []) as RootReviewReferenceProgress[],
    error,
  };
}

export async function submitSimpleReviewDecision(
  reviewId: string,
  decision: 'approve' | 'reject',
  reason?: string,
) {
  return invokeDatasetCommand<Record<string, unknown>>('app_simple_review_submit_decision', {
    reviewId,
    decision,
    ...(decision === 'reject' ? { reason: reason?.trim() } : {}),
  });
}

async function getReviewItemsRpc(params: {
  reviewIds?: string[];
  dataId?: string | null;
  dataVersion?: string | null;
  stateCodes?: number[];
}) {
  const { data, error } = await supabase.rpc('qry_review_get_items', {
    p_review_ids: params.reviewIds?.length ? params.reviewIds : null,
    p_data_id: params.dataId ?? null,
    p_data_version: params.dataVersion ?? null,
    p_state_codes: params.stateCodes?.length ? params.stateCodes : null,
  });

  return {
    data: (data ?? []) as ReviewItemRpcRow[],
    error,
  };
}

export async function addReviewsApi(id: string, data: any) {
  void id;
  void data;
  return { error: createLegacyMutationRemovedError('addReviewsApi') };
}

export async function submitDatasetReviewApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(tableName: ReviewSubmitDatasetTable, id: string, version: string) {
  return invokeDatasetCommand<Row>('app_dataset_submit_review', {
    id,
    version,
    table: tableName,
  });
}

export async function requestReviewQualityDiagnosticApi(
  request: ReviewQualityDiagnosticRequest,
): Promise<SupabaseMutationResult<ReviewQualityDiagnosticRun>> {
  const session = await supabase.auth.getSession();
  if (!session?.data?.session) {
    return {
      data: null,
      error: {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        details: '',
        hint: '',
      } as SupabaseError,
      count: null,
      status: 401,
      statusText: 'AUTH_REQUIRED',
    };
  }

  const result = await supabase.functions.invoke('admin_review_quality_diagnostic', {
    headers: {
      Authorization: `Bearer ${session.data.session.access_token ?? ''}`,
    },
    body: request,
    region: FunctionRegion.UsEast1,
  });

  if (result.error) {
    const payload = await parseReviewSubmitCommandErrorPayload(result.error);
    const normalizedError = normalizeReviewSubmitCommandError(result.error, payload);
    return {
      data: null,
      error: normalizedError,
      count: null,
      status: result.error.context?.status ?? 500,
      statusText: normalizedError.code,
    };
  }

  const payload = isReviewQualityDiagnosticEnvelope(result.data)
    ? result.data.data
    : !result.data || typeof result.data !== 'object' || Array.isArray(result.data)
      ? null
      : (result.data as ReviewQualityDiagnosticRun);

  return {
    data: payload ? [payload] : [],
    error: null,
    count: null,
    status: request.action === 'start' ? 202 : 200,
    statusText: request.action === 'start' ? 'Accepted' : 'OK',
  };
}

export async function saveReviewAssignmentDraftApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewIds: React.Key[], reviewerIds: string[]) {
  return invokeReviewWorkflowCommandBatch<Row>(
    'admin_review_save_assignment_draft',
    reviewIds,
    (reviewId) => ({
      reviewId,
      reviewerIds,
    }),
  );
}

export async function assignReviewersApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewIds: React.Key[], reviewerIds: string[], deadline?: string | null) {
  return invokeReviewWorkflowCommandBatch<Row>(
    'admin_review_assign_reviewers',
    reviewIds,
    (reviewId) => ({
      reviewId,
      reviewerIds,
      deadline: deadline ?? null,
    }),
  );
}

export async function revokeReviewerApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewId: string, reviewerId: string) {
  return invokeReviewWorkflowCommand<Row>('admin_review_revoke_reviewer', {
    reviewId,
    reviewerId,
  });
}

export async function approveReviewApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewId: string, table: ReviewSubmitDatasetTable) {
  return invokeReviewWorkflowCommand<Row>('admin_review_approve', {
    reviewId,
    table,
  });
}

export async function rejectReviewApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewId: string, table: ReviewSubmitDatasetTable, reason: string) {
  return invokeReviewWorkflowCommand<Row>('admin_review_reject', {
    reviewId,
    table,
    reason,
  });
}

async function submitReviewBatchDecision(
  functionName: 'admin_review_batch_decision' | 'app_review_batch_decision',
  reviewIds: React.Key[],
  decision: ReviewBatchDecision,
  reason?: string,
) {
  return invokeDatasetCommand<ReviewBatchDecisionResult>(functionName as never, {
    reviewIds: Array.from(new Set(reviewIds.map(String))),
    decision,
    ...(decision === 'reject' ? { reason: reason?.trim() } : {}),
  });
}

export async function submitAdminReviewBatchDecision(
  reviewIds: React.Key[],
  decision: ReviewBatchDecision,
  reason?: string,
) {
  return submitReviewBatchDecision('admin_review_batch_decision', reviewIds, decision, reason);
}

export async function submitReviewerBatchDecision(
  reviewIds: React.Key[],
  decision: ReviewBatchDecision,
  reason?: string,
) {
  return submitReviewBatchDecision('app_review_batch_decision', reviewIds, decision, reason);
}

export async function getReviewBatchEligibility(
  reviewIds: React.Key[],
  operation: ReviewBatchOperation,
) {
  const { data, error } = await supabase.rpc('qry_review_batch_eligibility_v1', {
    p_review_ids: Array.from(new Set(reviewIds.map(String))),
    p_operation: operation,
  });

  return {
    data: (data ?? []) as ReviewBatchEligibility[],
    error,
  };
}

export async function updateReviewApi(reviewIds: React.Key[], data: any) {
  void reviewIds;
  void data;
  return {
    error: createLegacyMutationRemovedError('updateReviewApi'),
  };
}

export async function getReviewerIdsApi(reviewIds: React.Key[]) {
  const { data } = await getReviewItemsRpc({
    reviewIds: reviewIds.map(String),
  });

  return Array.from(
    new Set(
      data.flatMap((item: any) => (Array.isArray(item?.reviewer_id) ? item.reviewer_id : [])),
    ),
  );
}

export async function getReviewsDetail(id: string) {
  const { data } = await getReviewItemsRpc({
    reviewIds: [id],
  });
  return data.length > 0 ? data[0] : null;
}

export async function getReviewsDetailByReviewIds(reviewIds: React.Key[]) {
  const { data } = await getReviewItemsRpc({
    reviewIds: reviewIds.map(String),
  });
  return data;
}

export async function getReviewsTableDataOfReviewMember(
  params: { pageSize: number; current: number },
  sort: any,
  type: 'pending' | 'submitted' | 'completed' | 'reviewed' | 'reviewer-rejected',
  lang: string,
  userData?: { user_id: string | undefined },
  filters: ReviewQueueFilters = {},
) {
  const userId = userData?.user_id ?? (await getUserId());
  if (!userId) {
    return Promise.resolve({
      data: [],
      success: true,
      total: 0,
    });
  }

  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');

  const status =
    type === 'reviewed' ? 'submitted' : type === 'reviewer-rejected' ? 'completed' : type;
  const { data, error } = await supabase.rpc('qry_review_get_member_queue_items_v5', {
    p_status: status,
    p_query: filters.query ?? null,
    p_page: params.current ?? 1,
    p_page_size: params.pageSize ?? 50,
    p_sort_by: sortBy,
    p_sort_order: orderBy,
    ...(filters.displayMode ? { p_display_mode: filters.displayMode } : {}),
    ...(filters.targetTable ? { p_target_table: filters.targetTable } : {}),
  });

  const rows = (data ?? []) as ReviewMemberQueueRpcRow[];
  if (error) {
    return { data: [], success: false, total: 0, error };
  }
  if (rows.length === 0) {
    return Promise.resolve({
      data: [],
      success: true,
      total: 0,
    });
  }

  const processes = rows
    .filter(
      (row) =>
        row.root_can_read !== false &&
        (!row.target_table || row.target_table === 'lifecyclemodels'),
    )
    .map((row) => ({
      id: row?.json?.data?.id,
      version: row?.json?.data?.version,
    }))
    .filter((item) => item.id);
  const [modelResult, submitterNamesById] = await Promise.all([
    getLifeCyclesByIdAndVersion(processes),
    getReviewSubmitterNamesById(rows),
  ]);
  const lifecycleModels = Array.isArray(modelResult?.data) ? modelResult.data : [];

  return Promise.resolve({
    data: rows.map((row) =>
      mapReviewRowToTableData(row, lang, lifecycleModels, { submitterNamesById }),
    ),
    page: params?.current ?? 1,
    success: true,
    total: normalizeTotalCount(rows[0]?.total_count),
  });
}

export async function getReviewsTableDataOfReviewAdmin(
  params: { pageSize: number; current: number },
  sort: any,
  type: 'unassigned' | 'in-progress' | 'completed' | 'assigned' | 'admin-rejected',
  lang: string,
  filters: ReviewQueueFilters = {},
) {
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');

  const status =
    type === 'assigned' ? 'in-progress' : type === 'admin-rejected' ? 'completed' : type;
  const { data, error } = await supabase.rpc('qry_review_get_admin_queue_items_v5', {
    p_status: status,
    p_query: filters.query ?? null,
    p_page: params.current ?? 1,
    p_page_size: params.pageSize ?? 50,
    p_sort_by: sortBy,
    p_sort_order: orderBy,
    ...(filters.displayMode ? { p_display_mode: filters.displayMode } : {}),
    ...(filters.targetTable ? { p_target_table: filters.targetTable } : {}),
  });

  const rows = (data ?? []) as ReviewAdminQueueRpcRow[];
  if (error) {
    return { data: [], success: false, total: 0, error };
  }
  if (rows.length === 0) {
    return Promise.resolve({
      data: [],
      success: true,
      total: 0,
    });
  }

  const processes = rows
    .filter((row) => !row.target_table || row.target_table === 'lifecyclemodels')
    .map((row) => ({
      id: row?.json?.data?.id,
      version: row?.json?.data?.version,
    }))
    .filter((item) => item.id);
  const [modelResult, submitterNamesById] = await Promise.all([
    getLifeCyclesByIdAndVersion(processes),
    getReviewSubmitterNamesById(rows),
  ]);
  const lifecycleModels = Array.isArray(modelResult?.data) ? modelResult.data : [];

  return Promise.resolve({
    data: rows.map((row) =>
      mapReviewRowToTableData(row, lang, lifecycleModels, {
        comments: Array.isArray(row.comment_state_codes)
          ? row.comment_state_codes
              .map((stateCode) => ({ state_code: Number(stateCode) }))
              .filter((comment) => isCurrentAssignedReviewerCommentState(comment.state_code))
          : [],
        submitterNamesById,
      }),
    ),
    page: params?.current ?? 1,
    success: true,
    total: normalizeTotalCount(rows[0]?.total_count),
  });
}

export async function getReviewsByProcess(processId: string, processVersion: string) {
  return getReviewItemsRpc({
    dataId: processId,
    dataVersion: processVersion,
  });
}

export async function getRejectReviewsByProcess(processId: string, processVersion: string) {
  return getReviewItemsRpc({
    dataId: processId,
    dataVersion: processVersion,
    stateCodes: [-1],
  });
}

export async function getNotifyReviews(
  params: { pageSize: number; current: number },
  lang: string,
  timeFilter: number = 3,
) {
  const session = await supabase.auth.getSession();

  if (!session.data.session) {
    return Promise.resolve({
      data: [],
      success: false,
      total: 0,
    });
  }

  const { data, error } = await supabase.rpc('qry_notification_get_my_data_items', {
    p_page: params.current ?? 1,
    p_page_size: params.pageSize ?? 10,
    p_days: timeFilter,
  });

  if (error || !Array.isArray(data)) {
    return Promise.resolve({
      data: [],
      success: false,
      total: 0,
    });
  }

  if (data.length === 0) {
    return Promise.resolve({
      data: [],
      success: true,
      total: 0,
    });
  }

  const rows = data as DataNotificationRpcRow[];
  const processIdAndVersions: { id: string; version: string }[] = [];
  rows.forEach((row) => {
    const id = row?.json?.data?.id;
    const version = row?.json?.data?.version;
    if (id && version) {
      processIdAndVersions.push({ id, version });
    }
  });
  const modelResult = await getLifeCyclesByIdAndVersion(processIdAndVersions);
  const mappedRows = rows.map((row) => {
    const model = modelResult?.data?.find(
      (candidate: { id: string; version: string }) =>
        candidate.id === row?.json?.data?.id && candidate.version === row?.json?.data?.version,
    );
    const name =
      model?.json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name;
    return {
      key: row.id,
      id: row.id,
      isFromLifeCycle: model ? true : false,
      targetTable: row?.json?.data?.table,
      name:
        (model
          ? genProcessName(name ?? {}, lang)
          : genProcessName(row?.json?.data?.name ?? {}, lang)) || '-',
      teamName: getLangText(row?.json?.team?.name ?? {}, lang),
      userName: row?.json?.user?.name ?? row?.json?.user?.email ?? '-',
      modifiedAt: new Date(row.modified_at).toISOString(),
      stateCode: row.state_code,
      json: row?.json,
    };
  });

  return Promise.resolve({
    data: mappedRows,
    page: params?.current ?? 1,
    success: true,
    total: Number(rows[0]?.total_count ?? 0) || 0,
  });
}

export async function getNotifyReviewsCount(timeFilter: number = 3, lastViewTime?: number) {
  const session = await supabase.auth.getSession();

  if (!session.data.session) {
    return Promise.resolve({
      success: false,
      total: 0,
    });
  }

  const { data, error } = await supabase.rpc('qry_notification_get_my_data_count', {
    p_days: timeFilter,
    p_last_view_at: lastViewTime && lastViewTime > 0 ? new Date(lastViewTime).toISOString() : null,
  });

  return Promise.resolve({
    success: !error,
    total: Number(data ?? 0) || 0,
  });
}

export async function getLatestReviewOfMine() {
  const userId = await getUserId();

  if (!userId) {
    return null;
  }

  const { data } = await supabase.rpc('qry_review_get_items', {
    p_data_id: null,
    p_data_version: null,
    p_review_ids: null,
    p_state_codes: [1, 2, -1],
  });

  return (data ?? [])
    .filter((review: any) => review?.json?.user?.id === userId)
    .sort(
      (left: any, right: any) =>
        new Date(right.modified_at).getTime() - new Date(left.modified_at).getTime(),
    )
    .slice(0, 1);
}

/**
 * Batch fetch subtable data for LifecycleModel
 * Collect and merge data from processInstance and json_tg.submodels
 * @param modelDatas - lifecyclemodel data array
 * @param lang - language
 * @returns Subtable data grouped by reviewId
 */
export async function getLifeCycleModelSubTableDataBatch(
  modelDatas: Array<{
    reviewId: string;
    modelData: {
      id: string;
      version: string;
      json: any;
      json_tg: any;
    };
  }>,
  lang: string,
): Promise<{
  data: Record<
    string,
    Array<{
      key: string;
      id: string;
      version: string;
      name: string;
      generalComment: string;
      sourceType: 'processInstance' | 'submodel';
      submodelType: string;
    }>
  >;
  success: boolean;
}> {
  if (!modelDatas.length) {
    return { data: {}, success: true };
  }

  // 1. Collect all process id and version that need to be fetched, and record data source and type
  const processParamMap = new Map<string, string[]>(); // key: "id:version", value: reviewId[]
  const processSourceMap = new Map<
    string,
    { source: 'processInstance' | 'submodel'; type?: string }
  >(); // key: "id:version", value: source info

  modelDatas.forEach(({ reviewId, modelData }) => {
    if (!modelData) return;

    const { json, json_tg, version } = modelData;

    // Extract from json.processInstance
    const processInstances =
      json?.lifeCycleModelDataSet?.lifeCycleModelInformation?.technology?.processes
        ?.processInstance ?? [];

    jsonToList(processInstances).forEach((instance: any) => {
      const refObjectId = instance?.referenceToProcess?.['@refObjectId'];
      const refVersion = instance?.referenceToProcess?.['@version'];
      if (refObjectId && refVersion) {
        const key = `${refObjectId}:${refVersion}`;
        if (!processParamMap.has(key)) {
          processParamMap.set(key, []);
        }
        processParamMap.get(key)!.push(reviewId);
        // Record source as processInstance
        if (!processSourceMap.has(key)) {
          processSourceMap.set(key, { source: 'processInstance' });
        }
      }
    });

    // Extract from json_tg.submodels
    const submodels = json_tg?.submodels ?? [];
    submodels.forEach((submodel: any) => {
      const submodelId = submodel?.id;
      const submodelType = submodel?.type; // primary or secondary
      if (submodelId) {
        const key = `${submodelId}:${version}`;
        if (!processParamMap.has(key)) {
          processParamMap.set(key, []);
        }
        processParamMap.get(key)!.push(reviewId);
        // Record source as submodel and its type
        if (!processSourceMap.has(key)) {
          processSourceMap.set(key, { source: 'submodel', type: submodelType });
        }
      }
    });
  });

  // 2. Batch fetch all process details
  const processParams = Array.from(processParamMap.keys()).map((key) => {
    const [id, version] = key.split(':');
    return { id, version };
  });

  if (processParams.length === 0) {
    return { data: {}, success: true };
  }

  const processesResult = await getProcessDetailByIdAndVersion(processParams);

  if (!processesResult.success || !processesResult.data) {
    return { data: {}, success: false };
  }

  // 3. Group and format process data by reviewId
  const resultData: Record<string, any[]> = {};

  processesResult.data.forEach((process: any) => {
    if (process.state_code !== 20) {
      return;
    }

    const key = `${process.id}:${process.version}`;
    const relatedReviewIds = processParamMap.get(key) ?? [];
    const sourceInfo = processSourceMap.get(key);

    relatedReviewIds.forEach((reviewId) => {
      if (!resultData[reviewId]) {
        resultData[reviewId] = [];
      }

      // Avoid adding the same process multiple times
      if (!resultData[reviewId].some((item: any) => item.id === process.id)) {
        resultData[reviewId].push({
          key: process.id,
          id: process.id,
          version: process.version,
          name: genProcessName(
            process.json?.processDataSet?.processInformation?.dataSetInformation?.name ?? {},
            lang,
          ),
          sourceType: sourceInfo?.source,
          submodelType: sourceInfo?.type,
        });
      }
    });
  });

  return { data: resultData, success: true };
}
