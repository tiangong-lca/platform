import { dispatchAntdAppAction } from '@/contexts/AntdAppContext';
import { getTeamMessage } from '@/locales/runtimeCatalogRegistry';
import { supabase } from '@/services/supabase';
import type { SupabaseError, SupabaseMutationResult } from '@/services/supabase/data';
import { publicEntity } from '@/services/supabase/public';
import { normalizeTidasPackageExportErrorMessage } from '@/services/tidasPackage/exportErrors';
import { FunctionRegion } from '@supabase/supabase-js';
import type { SortOrder } from 'antd/es/table/interface';
import { getILCDClassification, getILCDFlowCategorizationAll } from '../classifications/api';
import { genFlowName } from '../flows/util';
import {
  classificationToString,
  genLocalizedClassification,
  getLangText,
  getLangValidationErrorMessage,
  jsonToList,
  type LangNormalizationIntent,
  normalizeLangPayloadBeforeSave,
} from '../general/util';
import { getILCDLocationByValues } from '../locations/api';
import { toProcessModelVersionField } from '../processes/data';
import { processSiteFromRow } from '../processes/siteLabel';
import { genProcessName } from '../processes/util';
import {
  CANONICAL_CONTENT_LANGUAGE,
  TRANSLATION_SOURCE_CONTENT_LANGUAGE,
} from './contentLanguageRegistry';
import { getRuntimeLocale } from './runtimeLocale';
import { resolveTableSort } from './tableSort';
import { sortDataSetVersionRows } from './version';

const NO_TEAM_MESSAGE_ID = 'teams.modal.noTeam.title';
const getNoTeamMessage = () => {
  const locale = getRuntimeLocale();
  return getTeamMessage(locale, NO_TEAM_MESSAGE_ID);
};

type InvokeErrorBody = {
  code?: string;
  detail?: string;
  error?: string;
  message?: string;
  details?: unknown;
  state_code?: number;
  review_state_code?: number;
};

type ResolvedFunctionInvokeError = {
  code?: string;
  detail?: string;
  details?: unknown;
  error?: string;
  message: string;
  review_state_code?: number;
  state_code?: number;
  status?: number;
};

type GetRefDataOptions = {
  fallbackToLatest?: boolean;
};

export type NormalizeLangPayloadForSaveOptions = {
  intent?: LangNormalizationIntent;
};

export type LangNormalizationMetadata = {
  normalizedJsonOrdered?: any;
  langSupplementedPlaceholderPaths?: string[];
  langTranslatedPaths?: string[];
};

export const hasLangNormalizationDraftChanges = (
  value?: LangNormalizationMetadata | null,
): boolean =>
  Boolean(
    (value?.langSupplementedPlaceholderPaths?.length ?? 0) > 0 ||
    (value?.langTranslatedPaths?.length ?? 0) > 0,
  );

export const buildLangNormalizationMetadata = (
  normalizedResult: {
    payload?: any;
    supplementedEnglishPlaceholderPaths?: string[];
    translatedPaths?: string[];
  },
  rawPayload: any,
): LangNormalizationMetadata => ({
  normalizedJsonOrdered: normalizedResult?.payload ?? rawPayload,
  langSupplementedPlaceholderPaths: normalizedResult?.supplementedEnglishPlaceholderPaths ?? [],
  langTranslatedPaths: normalizedResult?.translatedPaths ?? [],
});

export const attachLangNormalizationMetadata = <T>(
  result: T,
  metadata: LangNormalizationMetadata,
  options?: NormalizeLangPayloadForSaveOptions,
): T | (T & LangNormalizationMetadata) => {
  if ((options?.intent ?? 'save') !== 'validation') {
    return result;
  }
  return {
    ...((result as Record<string, unknown>) ?? {}),
    ...metadata,
  } as T & LangNormalizationMetadata;
};

const INTERNAL_SUPABASE_DOWNLOAD_HOSTS = new Set(['kong', 'storage']);

export async function attachStateCodesToRows<
  T extends { id?: string; stateCode?: number; version?: string },
>(table: string, rows: T[]): Promise<T[]> {
  if (!table || !Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const missingStateRows = rows.filter(
    (row) =>
      typeof row?.stateCode !== 'number' &&
      typeof row?.id === 'string' &&
      row.id.length > 0 &&
      typeof row?.version === 'string' &&
      row.version.length > 0,
  );

  if (missingStateRows.length === 0) {
    return rows;
  }

  const ids = Array.from(
    new Set(missingStateRows.map((row) => row.id).filter(Boolean)),
  ) as string[];

  const { data, error } = await publicEntity(table).select('id,version,state_code').in('id', ids);

  if (error || !data) {
    return rows;
  }

  const stateCodeMap = new Map<string, number | null | undefined>();
  data.forEach((item: { id?: string; state_code?: number | null; version?: string }) => {
    if (!item?.id || !item?.version) {
      return;
    }
    stateCodeMap.set(`${item.id}:${item.version}`, item.state_code);
  });

  return rows.map((row) => {
    if (
      typeof row?.stateCode === 'number' ||
      typeof row?.id !== 'string' ||
      typeof row?.version !== 'string'
    ) {
      return row;
    }

    const stateCode = stateCodeMap.get(`${row.id}:${row.version}`);
    if (typeof stateCode !== 'number') {
      return row;
    }

    return {
      ...row,
      stateCode,
    };
  });
}

export async function exportDataApi(tableName: string, id: string, version: string) {
  let query;
  if (tableName === 'lifecyclemodels') {
    query = publicEntity(tableName)
      .select(`json_ordered,json_tg`)
      .eq('id', id)
      .eq('version', version);
  } else {
    query = publicEntity(tableName).select(`json_ordered`).eq('id', id).eq('version', version);
  }

  const result = await query;
  return result;
}

export type TidasPackageRootTable =
  | 'contacts'
  | 'sources'
  | 'unitgroups'
  | 'flowproperties'
  | 'flows'
  | 'processes'
  | 'lifecyclemodels';

export type TidasPackageScope = 'current_user' | 'open_data' | 'current_user_and_open_data';

export type TidasPackageManifestScope = TidasPackageScope | 'selected_roots';

export type TidasPackageRoot = {
  table: TidasPackageRootTable;
  id: string;
  version: string;
};

type DatasetCommandFunctionName =
  | 'app_dataset_create'
  | 'app_dataset_create_version'
  | 'app_dataset_delete'
  | 'app_dataset_save_draft'
  | 'app_dataset_assign_team'
  | 'app_dataset_publish'
  | 'app_dataset_submit_review'
  | 'app_simple_review_submit_decision';

const DATASET_COMMAND_TABLES: readonly TidasPackageRootTable[] = [
  'contacts',
  'sources',
  'unitgroups',
  'flowproperties',
  'flows',
  'processes',
  'lifecyclemodels',
] as const;

export type TidasPackageSummary = {
  total_entries: number;
  filtered_open_data_count: number;
  user_conflict_count: number;
  importable_count: number;
  imported_count?: number;
  validation_issue_count?: number;
  error_count?: number;
  warning_count?: number;
};

export type TidasPackageConflict = {
  table: string;
  id: string;
  version: string;
  state_code: number | null;
  user_id?: string | null;
};

export type TidasPackageValidationIssue = {
  issue_code: string;
  severity: string;
  category: string;
  file_path: string;
  location: string;
  message: string;
  context?: Record<string, any>;
};

export type TidasPackageJobMode = 'queued' | 'in_progress' | 'cache_hit' | 'completed';

export type TidasPackageArtifactKind =
  'import_source' | 'export_zip' | 'export_report' | 'import_report' | 'import_details';

export type TidasPackageJobStatus =
  'queued' | 'running' | 'ready' | 'completed' | 'failed' | 'stale';

export type ExportTidasPackageQueueResponse = {
  ok: boolean;
  mode: Exclude<TidasPackageJobMode, 'completed'>;
  job_id: string;
  worker_job_id?: string | null;
  scope: TidasPackageManifestScope;
  root_count: number;
  code?: string;
  message?: string;
};

export type ImportTidasPackageResponse = {
  ok: boolean;
  code: string;
  message: string;
  summary: TidasPackageSummary;
  filtered_open_data: TidasPackageConflict[];
  user_conflicts: TidasPackageConflict[];
  validation_issues?: TidasPackageValidationIssue[];
};

export type PrepareImportTidasPackageResponse = {
  ok: boolean;
  action: 'prepare_upload';
  job_id: string;
  source_artifact_id: string;
  artifact_url: string;
  upload: {
    bucket: string;
    object_path: string;
    token: string;
    path: string;
    signed_url: string | null;
    expires_in_seconds: number;
    filename: string;
    byte_size: number;
    content_type: string;
  };
  code?: string;
  message?: string;
};

export type EnqueueImportTidasPackageResponse = {
  ok: boolean;
  mode: 'queued' | 'in_progress' | 'completed';
  job_id: string;
  worker_job_id?: string | null;
  source_artifact_id: string;
  code?: string;
  message?: string;
};

export type TidasPackageArtifact = {
  artifact_id: string;
  artifact_kind: TidasPackageArtifactKind;
  status: string;
  artifact_format: string;
  content_type: string;
  artifact_sha256: string | null;
  artifact_byte_size: number | null;
  artifact_url: string;
  storage_bucket: string | null;
  storage_object_path: string | null;
  signed_download_url: string | null;
  signed_download_expires_in_seconds: number | null;
  metadata: Record<string, any>;
  expires_at: string | null;
  is_pinned: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type TidasPartialImportProgress = {
  imported_count: number;
  existing_count: number;
  successful_root_count: number;
  source: 'committed_receipts';
};

export type TidasPartialImportReport = {
  report_version: 2;
  outcome: 'success' | 'partial' | 'none' | 'interrupted';
  execution_complete: boolean;
  summary: Record<string, number>;
  roots: { root: TidasPackageRoot; status: string; blocking_path: TidasPackageRoot[] }[];
  roots_truncated: boolean;
};

export type TidasPackageJobResponse = {
  import_progress?: TidasPartialImportProgress | null;
  ok: boolean;
  job_id: string;
  job_type: 'export_package' | 'import_package';
  status: TidasPackageJobStatus;
  scope: TidasPackageManifestScope | null;
  root_count: number;
  request_key: string | null;
  timestamps: {
    created_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string | null;
  };
  payload: any;
  diagnostics: any;
  artifacts: TidasPackageArtifact[];
  artifacts_by_kind: Partial<Record<TidasPackageArtifactKind, TidasPackageArtifact>>;
  request_cache: {
    id: string;
    status: string;
    error_code: string | null;
    error_message: string | null;
    hit_count: number;
    last_accessed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    export_artifact_id: string | null;
    report_artifact_id: string | null;
  } | null;
};

export type ExportTidasPackageResponse = {
  ok: boolean;
  job_id: string;
  filename: string;
};

type TidasPackageReportEnvelope<T> = {
  payload?: T;
};

const TIDAS_PACKAGE_POLL_INTERVAL_MS = 1500;
const TIDAS_PACKAGE_POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function parseFunctionErrorPayload(error: any) {
  if (!error?.context || typeof error.context.json !== 'function') {
    return null;
  }

  try {
    return await error.context.json();
  } catch (_parseError) {
    return null;
  }
}

export type ExportTidasPackageRequest = {
  scope?: TidasPackageScope;
  roots?: TidasPackageRoot[];
};

async function invokeTidasPackageFunction<T>(name: string, body?: any) {
  const session = await supabase.auth.getSession();
  if (!session.data.session) {
    return {
      data: null,
      error: new Error('Unauthorized'),
    };
  }

  const result = await supabase.functions.invoke<T>(name, {
    headers: {
      Authorization: `Bearer ${session.data.session?.access_token ?? ''}`,
    },
    body,
    region: FunctionRegion.UsEast1,
  });

  if (result.error) {
    const errorPayload = await parseFunctionErrorPayload(result.error);
    return {
      data: errorPayload as T | null,
      error: result.error,
    };
  }

  return result;
}

export async function queueExportTidasPackageApi(request: ExportTidasPackageRequest = {}) {
  return await invokeTidasPackageFunction<ExportTidasPackageQueueResponse>(
    'export_tidas_package',
    request,
  );
}

export async function prepareImportTidasPackageUploadApi(file: {
  filename: string;
  byte_size: number;
  content_type: string;
}) {
  return await invokeTidasPackageFunction<PrepareImportTidasPackageResponse>(
    'import_tidas_package',
    {
      action: 'prepare_upload',
      ...file,
    },
  );
}

export async function enqueueImportTidasPackageApi(request: {
  job_id: string;
  source_artifact_id: string;
  artifact_sha256: string | null;
  artifact_byte_size: number;
  filename: string;
  content_type: string;
}) {
  return await invokeTidasPackageFunction<EnqueueImportTidasPackageResponse>(
    'import_tidas_package',
    {
      action: 'enqueue',
      ...request,
      import_policy: 'root_closure_v2',
    },
  );
}

export async function getTidasPackageJobApi(jobId: string) {
  if (!jobId) {
    return {
      data: null,
      error: new Error('Missing job id'),
    };
  }

  return await invokeTidasPackageFunction<TidasPackageJobResponse>('tidas_package_jobs', {
    job_id: jobId,
  });
}

async function waitForTidasPackageJob(
  jobId: string,
  isDone: (job: TidasPackageJobResponse) => boolean,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= TIDAS_PACKAGE_POLL_TIMEOUT_MS) {
    const { data, error } = await getTidasPackageJobApi(jobId);
    if (error || !data?.ok) {
      throw error ?? new Error('Failed to load TIDAS package job status');
    }

    if (data.status === 'failed' || isDone(data)) {
      return data;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, TIDAS_PACKAGE_POLL_INTERVAL_MS);
    });
  }

  throw new Error('Timed out waiting for the TIDAS package job to finish');
}

function parseUrlOrNull(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function normalizeBrowserAccessiblePackageUrl(signedUrl: string) {
  const configuredSupabaseUrl = process.env.SUPABASE_URL?.trim() || '';
  if (!configuredSupabaseUrl) {
    return signedUrl;
  }

  const parsedSignedUrl = parseUrlOrNull(signedUrl);
  const parsedPublicUrl = parseUrlOrNull(configuredSupabaseUrl);
  if (!parsedSignedUrl || !parsedPublicUrl) {
    return signedUrl;
  }

  const publicOrigin = parsedPublicUrl.origin;
  if (parsedSignedUrl.origin === publicOrigin) {
    return signedUrl;
  }

  if (!INTERNAL_SUPABASE_DOWNLOAD_HOSTS.has(parsedSignedUrl.hostname)) {
    return signedUrl;
  }

  return `${publicOrigin}${parsedSignedUrl.pathname}${parsedSignedUrl.search}${parsedSignedUrl.hash}`;
}

async function downloadArtifactBySignedUrl(signedUrl: string, filename: string) {
  const response = await fetch(normalizeBrowserAccessiblePackageUrl(signedUrl));
  if (!response.ok) {
    throw new Error(`Failed to download artifact (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function resolveExportArtifactFilename(job: TidasPackageJobResponse, fallbackFilename: string) {
  const metadataFilename = job.artifacts_by_kind.export_zip?.metadata?.filename;
  if (typeof metadataFilename === 'string' && metadataFilename.trim()) {
    return metadataFilename.trim();
  }

  return fallbackFilename;
}

export async function fetchPackageReport<T>(
  artifact: TidasPackageArtifact,
  signal?: AbortSignal,
): Promise<T> {
  if (!artifact.signed_download_url) {
    throw new Error('Package report is not available');
  }

  const response = await fetch(normalizeBrowserAccessiblePackageUrl(artifact.signed_download_url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to load package report (${response.status})`);
  }

  const parsed = (await response.json()) as TidasPackageReportEnvelope<T> | T;
  return ((parsed as TidasPackageReportEnvelope<T>).payload ?? parsed) as T;
}

async function computeSha256Hex(file: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    return null;
  }

  try {
    const buffer = await file.arrayBuffer();
    const digest = await subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (_error) {
    return null;
  }
}

async function uploadTidasPackageToSignedUrl(
  upload: PrepareImportTidasPackageResponse['upload'],
  file: File,
) {
  const result = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      cacheControl: '3600',
      contentType: upload.content_type,
      upsert: true,
    });

  if (result.error) {
    throw result.error;
  }
}

function extractPackageJobError(job: TidasPackageJobResponse) {
  const requestCacheMessage = job.request_cache?.error_message;
  const diagnosticsMessage =
    typeof job.diagnostics?.error === 'string'
      ? job.diagnostics.error
      : typeof job.diagnostics?.message === 'string'
        ? job.diagnostics.message
        : null;

  return normalizeTidasPackageExportErrorMessage(
    requestCacheMessage || diagnosticsMessage,
    'TIDAS package job failed',
  );
}

export async function exportTidasPackageApi(request: ExportTidasPackageRequest = {}) {
  const queued = await queueExportTidasPackageApi(request);
  if (queued.error || !queued.data?.ok) {
    return {
      data: null,
      error: queued.error ?? new Error((queued.data as any)?.message ?? 'Export failed'),
    };
  }

  try {
    const job = await waitForTidasPackageJob(
      queued.data.job_id,
      (candidate) => candidate.status === 'ready' || candidate.status === 'completed',
    );

    if (job.status === 'failed') {
      throw new Error(extractPackageJobError(job));
    }

    const exportArtifact = job.artifacts_by_kind.export_zip;
    if (!exportArtifact?.signed_download_url) {
      throw new Error('Export package is not available for download');
    }

    const filename = resolveExportArtifactFilename(
      job,
      request.roots?.length ? `${request.roots[0].table}-package.zip` : 'tidas-package.zip',
    );

    await downloadArtifactBySignedUrl(exportArtifact.signed_download_url, filename);

    return {
      data: {
        ok: true,
        job_id: job.job_id,
        filename,
      } satisfies ExportTidasPackageResponse,
      error: null,
    };
  } catch (error: any) {
    return {
      data: null,
      error,
    };
  }
}

export async function downloadReadyTidasPackageExportApi(
  jobId: string,
  fallbackFilename = 'tidas-package.zip',
) {
  const { data, error } = await getTidasPackageJobApi(jobId);
  if (error || !data?.ok) {
    return {
      data: null,
      error: error ?? new Error('Failed to load TIDAS package job status'),
    };
  }

  if (data.status === 'failed') {
    return {
      data: null,
      error: new Error(extractPackageJobError(data)),
    };
  }

  const exportArtifact = data.artifacts_by_kind.export_zip;
  if (!exportArtifact?.signed_download_url) {
    return {
      data: null,
      error: new Error('Export package is not ready for download'),
    };
  }

  try {
    const filename = resolveExportArtifactFilename(data, fallbackFilename);
    await downloadArtifactBySignedUrl(exportArtifact.signed_download_url, filename);
    return {
      data: {
        ok: true,
        job_id: data.job_id,
        filename,
      } satisfies ExportTidasPackageResponse,
      error: null,
    };
  } catch (downloadError: any) {
    return {
      data: null,
      error: downloadError,
    };
  }
}

export async function queueImportTidasPackageApi(file: File) {
  const contentType = file.type || 'application/zip';
  const prepared = await prepareImportTidasPackageUploadApi({
    filename: file.name,
    byte_size: file.size,
    content_type: contentType,
  });

  if (prepared.error || !prepared.data?.ok) {
    return {
      data: null,
      error: prepared.error ?? new Error((prepared.data as any)?.message ?? 'Import failed'),
    };
  }

  try {
    const artifactSha256 = await computeSha256Hex(file);
    if (!artifactSha256) throw new Error('Import requires a verified SHA-256 checksum');
    await uploadTidasPackageToSignedUrl(prepared.data.upload, file);

    const queued = await enqueueImportTidasPackageApi({
      job_id: prepared.data.job_id,
      source_artifact_id: prepared.data.source_artifact_id,
      artifact_sha256: artifactSha256,
      artifact_byte_size: file.size,
      filename: file.name,
      content_type: contentType,
    });

    if (queued.error || !queued.data?.ok) {
      throw queued.error ?? new Error((queued.data as any)?.message ?? 'Import failed');
    }

    return queued;
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function importTidasPackageApi(file: File) {
  const queued = await queueImportTidasPackageApi(file);
  if (queued.error || !queued.data?.ok) return { data: null, error: queued.error };
  try {
    const job = await waitForTidasPackageJob(
      queued.data.job_id,
      (candidate) => candidate.status === 'completed',
    );

    if (job.status === 'failed') {
      throw new Error(extractPackageJobError(job));
    }

    const reportArtifact = job.artifacts_by_kind.import_report;
    if (!reportArtifact) {
      throw new Error('Import report is not available');
    }

    const report = await fetchPackageReport<ImportTidasPackageResponse | TidasPartialImportReport>(
      reportArtifact,
    );
    return {
      data: report,
      error: null,
    };
  } catch (error: any) {
    return {
      data: null,
      error,
    };
  }
}

const VERSION_PATTERN = /^\d{2}\.\d{2}\.\d{3}$/;

function isDatasetCommandTable(value: string): value is TidasPackageRootTable {
  return DATASET_COMMAND_TABLES.includes(value as TidasPackageRootTable);
}

function extractStateCode(details: unknown): number | undefined {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const candidate = details as { state_code?: unknown; review_state_code?: unknown };
  if (typeof candidate.state_code === 'number') {
    return candidate.state_code;
  }
  if (typeof candidate.review_state_code === 'number') {
    return candidate.review_state_code;
  }

  return undefined;
}

function extractReviewStateCode(details: unknown): number | undefined {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const candidate = details as { review_state_code?: unknown };
  return typeof candidate.review_state_code === 'number' ? candidate.review_state_code : undefined;
}

function normalizeFunctionInvokeErrorShape(error: {
  code?: string;
  details?: unknown;
  message: string;
  review_state_code?: number;
  state_code?: number;
}): SupabaseError {
  const normalized = {
    message: error.message,
    code: typeof error.code === 'string' ? error.code : 'FUNCTION_ERROR',
    details: error.details ?? '',
    hint: '',
  } as SupabaseError;

  const stateCode =
    typeof error.state_code === 'number' ? error.state_code : extractStateCode(error.details);
  if (typeof stateCode === 'number') {
    normalized.state_code = stateCode;
  }

  const reviewStateCode =
    typeof error.review_state_code === 'number'
      ? error.review_state_code
      : extractReviewStateCode(error.details);
  if (typeof reviewStateCode === 'number') {
    normalized.review_state_code = reviewStateCode;
  }

  return normalized;
}

function normalizeDatasetCommandRows<Row extends Record<string, unknown>>(
  data: unknown,
  ruleVerification?: boolean | null,
): Row[] {
  let payload = data;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
    payload = (payload as Record<string, unknown>).data;
  }

  const rows = Array.isArray(payload)
    ? payload
    : payload === null || payload === undefined
      ? []
      : [payload];

  return rows.map((row) => {
    if (
      typeof ruleVerification !== 'boolean' ||
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row)
    ) {
      return row as Row;
    }

    return {
      ...(row as Record<string, unknown>),
      rule_verification: ruleVerification,
    } as unknown as Row;
  });
}

export async function resolveFunctionInvokeError(error: {
  message?: string;
  context?: Response;
}): Promise<ResolvedFunctionInvokeError> {
  const fallbackMessage = error?.message || 'Request failed';
  const context = error?.context;

  if (!context || typeof context.text !== 'function') {
    return {
      message: fallbackMessage,
    };
  }

  try {
    const text = await context.text();
    if (!text) {
      return {
        message: fallbackMessage,
        status: context.status,
      };
    }

    try {
      const parsed = JSON.parse(text) as InvokeErrorBody;
      return {
        ...parsed,
        message: parsed.message || parsed.detail || parsed.error || fallbackMessage,
        status: context.status,
      };
    } catch {
      return {
        message: `${fallbackMessage}: ${text}`,
        status: context.status,
      };
    }
  } catch {
    return {
      message: fallbackMessage,
      status: context.status,
    };
  }
}

export function createLegacyMutationRemovedError(boundary: string): SupabaseError {
  return {
    message: 'Use explicit command endpoints instead',
    code: 'LEGACY_ENDPOINT_REMOVED',
    details: boundary,
    hint: '',
  } as SupabaseError;
}

export function createLegacyMutationRemovedResult<Row extends Record<string, unknown>>(
  boundary: string,
): SupabaseMutationResult<Row> {
  return {
    data: null,
    error: createLegacyMutationRemovedError(boundary),
    count: null,
    status: 410,
    statusText: 'LEGACY_ENDPOINT_REMOVED',
  };
}

export async function invokeDatasetCommand<Row extends Record<string, unknown>>(
  functionName: DatasetCommandFunctionName,
  body: Record<string, unknown>,
  options: { ruleVerification?: boolean | null } = {},
): Promise<SupabaseMutationResult<Row>> {
  const session = await supabase.auth.getSession();
  if (!session.data.session) {
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

  const result = await supabase.functions.invoke(functionName, {
    headers: {
      Authorization: `Bearer ${session.data.session?.access_token ?? ''}`,
    },
    body,
    region: FunctionRegion.UsEast1,
  });

  if (result.error) {
    console.log('error', result.error);
    const resolved = await resolveFunctionInvokeError(result.error);
    const normalizedError = normalizeFunctionInvokeErrorShape({
      message: resolved.message,
      code: resolved.code,
      details: resolved.details,
      review_state_code: resolved.review_state_code,
      state_code: resolved.state_code,
    });

    return {
      data: null,
      error: normalizedError,
      count: null,
      status: resolved.status ?? result.error.context?.status ?? 500,
      statusText: normalizedError.code,
    };
  }

  return {
    data: normalizeDatasetCommandRows<Row>(result.data, options.ruleVerification),
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
  };
}

export async function invokeDatasetCreateVersion<Row extends Record<string, unknown>>(
  body: {
    id: string;
    table: Exclude<TidasPackageRootTable, 'lifecyclemodels'>;
    sourceVersion: string;
    jsonOrdered: unknown;
    modelId?: string | null;
    ruleVerification?: boolean | null;
  },
  options: { ruleVerification?: boolean | null } = {},
): Promise<SupabaseMutationResult<Row>> {
  return invokeDatasetCommand<Row>('app_dataset_create_version', body, options);
}

export async function getDataDetail(id: string, version: string, table: string) {
  const hasValidId = typeof id === 'string' && id.length === 36;
  const normalizedVersion = typeof version === 'string' ? version.trim() : '';
  const hasVersion = normalizedVersion.length > 0;
  const isVersionFormatValid = !hasVersion || VERSION_PATTERN.test(normalizedVersion);

  if (!hasValidId || !table || (hasVersion && !isVersionFormatValid)) {
    return Promise.resolve({
      data: null,
      success: false,
    });
  }

  const query = publicEntity(table)
    .select('json,version, modified_at,id,state_code,rule_verification,user_id')
    .eq('id', id);

  let result: any;
  if (hasVersion) {
    result = await query.eq('version', normalizedVersion);
  } else {
    result = await query.order('version', { ascending: false }).range(0, 0);
  }

  if (!result?.data || result.data.length === 0) {
    return Promise.resolve({
      data: null,
      success: false,
    });
  }

  const data = result.data[0];
  return Promise.resolve({
    data: {
      id,
      version: data.version,
      json: data.json,
      modifiedAt: data?.modified_at,
      stateCode: data?.state_code,
      ruleVerification: data?.rule_verification,
      userId: data?.user_id,
    },
    success: true,
  });
}
export async function getDataDetailById(id: string, table: string) {
  let result: any = {};
  if (id && id.length === 36) {
    result = await publicEntity(table)
      .select('json,version, modified_at,id,state_code,rule_verification,user_id')
      .eq('id', id);
    return result;
  }
  return null;
}

export async function getRefData(
  id: string,
  version: string,
  table: string,
  teamId?: string,
  options: GetRefDataOptions = {},
) {
  if (!table || !id || id.length !== 36) {
    return Promise.resolve({
      data: null,
      success: false,
    });
  }

  let query = publicEntity(table)
    .select('id,version,state_code,json,rule_verification,user_id,team_id')
    .eq('id', id);

  let result: any = {};

  if (version && version.length === 9) {
    result = await query.eq('version', version);
    if ((!result?.data || result.data.length === 0) && options.fallbackToLatest !== false) {
      result = await query.order('version', { ascending: false }).range(0, 0);
    }
  } else {
    result = await query.order('version', { ascending: false }).range(0, 0);
  }

  if (result?.data && result.data.length > 0) {
    let data = result.data[0];
    const teamData = result.data.filter((item: any) => item.team_id === teamId);
    if (teamId !== '00000000-0000-0000-0000-000000000000' && teamData && teamData.length > 0) {
      data = teamData[0];
    }
    return Promise.resolve({
      data: {
        id: data?.id,
        version: data?.version,
        stateCode: data?.state_code,
        json: data?.json,
        ruleVerification: data?.rule_verification,
        userId: data?.user_id,
        teamId: data?.team_id,
      },
      success: true,
    });
  }

  return Promise.resolve({
    data: null,
    success: false,
  });
}

export async function getRefDataByIds(ids: string[], table: string) {
  if (!table || ids.length === 0) {
    return Promise.resolve({
      data: null,
      success: false,
    });
  }

  const result = await publicEntity(table).select('state_code,id,version').in('id', ids);

  return Promise.resolve({
    data: result.data,
    success: true,
  });
}

export async function updateStateCodeApi(
  id: string,
  version: string,
  table: string,
  stateCode: number,
) {
  if (!table) return;
  void id;
  void version;
  void stateCode;
  return {
    error: createLegacyMutationRemovedError(`updateStateCodeApi:${table}`),
  };
}

export async function getReviewsOfData(id: string, version: string, table: string) {
  const result = await publicEntity(table).select('reviews').eq('id', id).eq('version', version);
  return result.data?.[0]?.reviews ?? [];
}
export async function updateDateToReviewState(
  id: string,
  version: string,
  table: string,
  data: any,
) {
  if (!table) return;
  void id;
  void version;
  void data;
  return {
    error: createLegacyMutationRemovedError(`updateDateToReviewState:${table}`),
  };
}

// Get the team id of the user when the user is not an invited user and  is not a rejected user
export async function getTeamIdByUserId() {
  const { data } = await supabase.rpc('qry_membership_get_mine');
  const memberships = (data ?? []).filter(
    (membership: { team_id: string }) =>
      membership.team_id !== '00000000-0000-0000-0000-000000000000',
  );

  if (
    memberships.length > 0 &&
    memberships[0].role !== 'is_invited' &&
    memberships[0].role !== 'rejected'
  ) {
    return memberships[0].team_id;
  }
  return null;
}

export async function contributeSource(tableName: string, id: string, version: string) {
  if (!tableName || !isDatasetCommandTable(tableName)) {
    return {
      error: true,
      message: 'Contribute failed',
    };
  }
  const teamId = await getTeamIdByUserId();
  if (teamId) {
    return invokeDatasetCommand('app_dataset_assign_team', {
      id,
      version,
      table: tableName,
      teamId,
    });
  } else {
    dispatchAntdAppAction(({ message }) => message.error(getNoTeamMessage()));
  }
  return {
    error: true,
    message: 'Contribute failed',
  };
}

export async function publishDatasetApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(tableName: TidasPackageRootTable, id: string, version: string) {
  return invokeDatasetCommand<Row>('app_dataset_publish', {
    id,
    version,
    table: tableName,
  });
}

export async function getAllVersions(
  nameColume: string,
  tableName: string,
  id: string,
  params: { pageSize: number; current: number },
  sort: Record<string, SortOrder>,
  lang: string,
  dataSource: string,
  stateCode?: number,
) {
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'version');

  let query = publicEntity(tableName)
    .select(
      `
    id,
    ${nameColume}, 
    version, 
    created_at, 
    modified_at`,
      { count: 'exact' },
    )
    .eq('id', id)
    .order(sortBy, { ascending: orderBy === 'ascend' })
    .range(
      ((params.current ?? 1) - 1) * (params.pageSize ?? 10),
      (params.current ?? 1) * (params.pageSize ?? 10) - 1,
    );

  const hasExactStateCode = typeof stateCode === 'number';

  if (dataSource === 'my') {
    const session = await supabase.auth.getSession();
    if (session.data.session) {
      query = query.eq('user_id', session?.data?.session?.user?.id);
    } else {
      return Promise.resolve({
        data: [],
        success: false,
        total: 0,
      });
    }
  } else if (dataSource === 'te') {
    const teamId = await getTeamIdByUserId();
    if (teamId) {
      query = query.eq('team_id', teamId);
    } else {
      return Promise.resolve({
        data: [],
        success: false,
        total: 0,
      });
    }
  }

  if (dataSource === 'ex') {
    query = query.eq('state_code', -1);
  } else if (hasExactStateCode) {
    query = query.eq('state_code', stateCode);
  } else if (dataSource === 'tg') {
    query = query.eq('state_code', 100);
  } else if (dataSource === 'co') {
    query = query.eq('state_code', 200);
  }

  const result = await query;
  let data: any[] = result?.data ?? [];
  if (!result.error) {
    switch (tableName) {
      case 'contacts': {
        await getILCDClassification('Contact', lang, ['all']).then((res) => {
          data = result.data.map((i: any) => {
            try {
              const classifications = jsonToList(i?.['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );

              return {
                key: i.id + ':' + i.version,
                id: i.id,
                shortName: getLangText(i?.['common:shortName'], lang),
                name: getLangText(i?.['common:name'], lang),
                classification: classificationToString(localizedClassification),
                email: i?.email ?? '-',
                version: i.version,
                modifiedAt: new Date(i?.modified_at),
                teamId: i?.team_id,
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;
      }
      case 'sources':
        await getILCDClassification('Source', lang, ['all']).then((res) => {
          data = result?.data?.map((i: any) => {
            try {
              const classifications = jsonToList(i['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );
              return {
                key: i.id + ':' + i.version,
                id: i.id,
                shortName: getLangText(i?.['common:shortName'], lang),
                classification: classificationToString(localizedClassification),
                sourceCitation: i?.sourceCitation ?? '-',
                publicationType: i?.publicationType ?? '-',
                version: i.version,
                modifiedAt: new Date(i?.modified_at),
                teamId: i.team_id,
                stateCode: i.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;

      case 'unitgroups':
        await getILCDClassification('UnitGroup', lang, ['all']).then((res) => {
          data = result.data.map((i: any) => {
            try {
              const classifications = jsonToList(i?.['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );
              const unitList = jsonToList(i?.unit);
              const refUnit = unitList.find(
                (item) => item?.['@dataSetInternalID'] === i?.referenceToReferenceUnit,
              );
              return {
                key: i.id + ':' + i.version,
                id: i.id,
                name: getLangText(i?.['common:name'], lang),
                classification: classificationToString(localizedClassification),
                refUnitId: i?.referenceToReferenceUnit ?? '-',
                refUnitName: refUnit?.name ?? '-',
                refUnitGeneralComment: getLangText(refUnit?.generalComment, lang),
                version: i.version,
                modifiedAt: new Date(i?.modified_at),
                teamId: i?.team_id,
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;

      case 'flowproperties':
        await getILCDClassification('FlowProperty', lang, ['all']).then((res) => {
          data = result.data.map((i: any) => {
            try {
              const classifications = jsonToList(i?.['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );
              return {
                key: i.id + ':' + i.version,
                id: i.id,
                name: getLangText(i?.['common:name'], lang),
                classification: classificationToString(localizedClassification),
                generalComment: getLangText(i?.['common:generalComment'], lang),
                refUnitGroupId: i?.['@refObjectId'] ?? '-',
                refUnitGroup: getLangText(i?.['common:shortDescription'], lang),
                version: i.version,
                modifiedAt: new Date(i?.modified_at),
                teamId: i?.team_id,
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;

      case 'flows': {
        const locations: string[] = Array.from(
          new Set(result.data.map((i: any) => i['locationOfSupply'])),
        );
        let locationData: any[] = [];
        await getILCDLocationByValues(lang, locations).then((res) => {
          locationData = res.data;
        });

        await getILCDFlowCategorizationAll(lang).then((res) => {
          data = result.data.map((i: any) => {
            try {
              const thisLocation = locationData.find((l) => l['@value'] === i['locationOfSupply']);
              let locationOfSupply = i['locationOfSupply'];
              if (thisLocation?.['#text']) {
                locationOfSupply = thisLocation['#text'];
              }

              let classificationData: any = {};
              let localizedCategory: any[] = [];
              if (i?.typeOfDataSet === 'Elementary flow') {
                classificationData =
                  i?.classificationInformation?.['common:elementaryFlowCategorization']?.[
                    'common:category'
                  ];
                localizedCategory = res?.data?.categoryElementaryFlow;
              } else {
                classificationData =
                  i?.classificationInformation?.['common:classification']?.['common:class'];
                localizedCategory = res?.data?.category;
              }
              const classifications = jsonToList(classificationData);
              const localizedClassification = genLocalizedClassification(
                classifications,
                localizedCategory,
              );

              return {
                key: i.id + ':' + i.version,
                id: i.id,
                name: genFlowName(i?.name ?? {}, lang),
                flowType: i.typeOfDataSet ?? '-',
                classification: classificationToString(localizedClassification),
                synonyms: getLangText(i['common:synonyms'], lang),
                CASNumber: i.CASNumber ?? '-',
                refFlowPropertyId: i.referenceToFlowPropertyDataSet?.['@refObjectId'] ?? '-',
                locationOfSupply: locationOfSupply ?? '-',
                version: i.version,
                modifiedAt: new Date(i.modified_at),
                teamId: i?.team_id,
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;
      }

      case 'processes': {
        const locations: string[] = Array.from(
          new Set(result?.data.map((i: any) => i['@location'])),
        );
        let locationData: any[] = [];
        await getILCDLocationByValues(lang, locations).then((res) => {
          locationData = res.data;
        });
        await getILCDClassification('Process', lang, ['all']).then((res) => {
          data = result?.data?.map((i: any) => {
            try {
              const classifications = jsonToList(i['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );
              const thisLocation = locationData.find((l) => l['@value'] === i['@location']);
              let location = i['@location'];
              if (thisLocation?.['#text']) {
                location = thisLocation['#text'];
              }
              return {
                key: i.id + ':' + i.version,
                id: i.id,
                version: i.version,
                lang: lang,
                name: genProcessName(i.name ?? {}, lang),
                generalComment: getLangText(i['common:generalComment'] ?? {}, lang),
                classification: classificationToString(localizedClassification ?? {}),
                typeOfDataSet: i.typeOfDataSet ?? '-',
                referenceYear: i['common:referenceYear'] ?? '-',
                location: location ?? '-',
                site: processSiteFromRow(i),
                modifiedAt: new Date(i.modified_at),
                teamId: i?.team_id,
                modelId: i?.model_id,
                ...toProcessModelVersionField(i?.model_version),
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });
        break;
      }

      case 'lifecyclemodels': {
        await getILCDClassification('LifeCycleModel', lang, ['all']).then((res) => {
          data = result.data.map((i: any) => {
            try {
              const classifications = jsonToList(i['common:class']);
              const localizedClassification = genLocalizedClassification(
                classifications,
                res?.data,
              );
              return {
                key: i.id,
                id: i.id,
                name: genProcessName(i.name ?? {}, lang),
                generalComment: getLangText(i?.['common:generalComment'], lang),
                classification: classificationToString(localizedClassification ?? {}),
                version: i?.version,
                modifiedAt: new Date(i?.modified_at),
                teamId: i?.team_id,
                stateCode: i?.state_code,
              };
            } catch (e) {
              console.error(e);
              return {
                id: i.id,
              };
            }
          });
        });

        break;
      }
    }

    const versionSortedData =
      sortBy === 'version'
        ? sortDataSetVersionRows(data, orderBy === 'ascend' ? 'asc' : 'desc')
        : data;

    return Promise.resolve({
      data: versionSortedData,
      page: params.current ?? 1,
      success: true,
      total: result.count ?? 0,
    });
  } else {
    return Promise.resolve({
      data: [],
      success: false,
      total: 0,
    });
  }
}

export { getAISuggestion } from './aiSuggestion';

const JSON_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

export const parseJsonLikeText = (text: string): any => {
  const trimmedText = text.trim();
  if (!trimmedText) return undefined;

  const candidates = [trimmedText];
  const blockMatch = trimmedText.match(JSON_BLOCK_PATTERN);
  if (blockMatch?.[1]) {
    candidates.push(blockMatch[1].trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
};

export const getTranslatedTextFromObject = (value: any): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const directKeys = ['translatedText', 'translation', 'englishText', 'english', 'output_text'];
  for (const key of directKeys) {
    if (typeof value?.[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }

  if (Array.isArray(value?.content)) {
    for (const contentItem of value.content) {
      if (typeof contentItem?.text === 'string' && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
      if (typeof contentItem?.content === 'string' && contentItem.content.trim()) {
        return contentItem.content.trim();
      }
    }
  }

  return undefined;
};

export const extractTranslatedText = (value: any, depth = 0): string | undefined => {
  if (depth > 8 || value === null || value === undefined) return undefined;

  if (typeof value === 'string') {
    const parsed = parseJsonLikeText(value);
    if (parsed) {
      return extractTranslatedText(parsed, depth + 1);
    }
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractTranslatedText(item, depth + 1);
      if (extracted) return extracted;
    }
    return undefined;
  }

  if (typeof value === 'object') {
    const directTranslated = getTranslatedTextFromObject(value);
    if (directTranslated) return directTranslated;

    const preferredNestedKeys = ['result', 'data', 'response', 'output', 'values', 'messages'];
    for (const nestedKey of preferredNestedKeys) {
      if (nestedKey in value) {
        const extracted = extractTranslatedText(value[nestedKey], depth + 1);
        if (extracted) return extracted;
      }
    }
  }

  return undefined;
};

export async function translateZhTextToEnglish(text: string): Promise<string | undefined> {
  const sourceText = text?.trim();
  if (!sourceText) return undefined;

  let result: any = {};
  const session = await supabase.auth.getSession();
  const accessToken = session?.data?.session?.access_token;
  if (accessToken) {
    result = await supabase.functions.invoke('translate_text', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        texts: [sourceText],
        sourceLang: TRANSLATION_SOURCE_CONTENT_LANGUAGE,
        targetLang: CANONICAL_CONTENT_LANGUAGE,
      },
      region: FunctionRegion.UsEast1,
    });
  }
  if (result.error) {
    console.log('error', result.error);
    return undefined;
  }

  const translatedText = extractTranslatedText(result?.data?.translations?.[0]?.translatedText);
  if (!translatedText) {
    const fallbackText = extractTranslatedText(result?.data);
    return fallbackText?.trim();
  }
  return translatedText.trim();
}

export async function normalizeLangPayloadForSave(
  payload: any,
  options: NormalizeLangPayloadForSaveOptions = {},
) {
  const intent = options.intent ?? 'save';
  const normalized = await normalizeLangPayloadBeforeSave(payload, {
    intent,
    translateZhToEn: translateZhTextToEnglish,
  });

  const validationError = getLangValidationErrorMessage(normalized.issues, 5, getRuntimeLocale());
  return {
    payload: normalized.payload,
    issues: normalized.issues,
    supplementedEnglishPlaceholderPaths: normalized.supplementedEnglishPlaceholderPaths,
    translatedPaths: normalized.translatedPaths,
    validationError: validationError || undefined,
  };
}
