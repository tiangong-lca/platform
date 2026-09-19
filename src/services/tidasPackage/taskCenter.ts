import {
  downloadReadyTidasPackageExportApi,
  getTidasPackageJobApi,
  queueExportTidasPackageApi,
  queueImportTidasPackageApi,
  type ExportTidasPackageRequest,
  type ExportTidasPackageResponse,
  type TidasPackageJobResponse,
  type TidasPackageManifestScope,
} from '@/services/general/api';
import { normalizeTidasPackageExportErrorMessage } from '@/services/tidasPackage/exportErrors';
import {
  requestWorkerJobsApi,
  type WorkerJobResult,
  type WorkerJobStatus,
} from '@/services/workerJobs/api';

export type TidasImportOutcome = 'success' | 'partial' | 'none' | 'interrupted';

export type TidasPackageTaskState = 'running' | 'completed' | 'failed';
export type TidasPackageTaskPhase =
  | 'submitting'
  | 'queued'
  | 'collect_refs'
  | 'import_package'
  | 'finalize_zip'
  | 'completed'
  | 'failed';

export type TidasPackageBackgroundTask = {
  id: string;
  sequence: number;
  kind: 'tidas_package_export' | 'tidas_package_import';
  request?: ExportTidasPackageRequest;
  state: TidasPackageTaskState;
  phase: TidasPackageTaskPhase;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  workerJobId?: string;
  jobKind?: string;
  jobId?: string;
  scope?: TidasPackageManifestScope | null;
  rootCount: number;
  filename?: string;
  error?: string;
  importOutcome?: TidasImportOutcome;
  importSummary?: Record<string, number>;
  importReportAvailable?: boolean;
  importDetailsAvailable?: boolean;
};

type PersistedTaskStore = {
  version: number;
  savedAt: string;
  tasks: TidasPackageBackgroundTask[];
};

const MAX_TASK_ITEMS = 30;
const LEGACY_STORAGE_KEY = 'tg_tidas_package_task_center_v1';
const STORAGE_KEY_PREFIX = `${LEGACY_STORAGE_KEY}:user`;
const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_TTL_MS = 72 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_TRANSIENT_ERROR_RETRY_LIMIT = 5;
const TIDAS_PACKAGE_WORKER_JOB_STATUSES: WorkerJobStatus[] = [
  'queued',
  'running',
  'waiting',
  'completed',
  'blocked',
  'stale',
  'failed',
  'cancelled',
];

let taskSequence = 0;
let tasks: TidasPackageBackgroundTask[] = [];
let taskOwnerId: string | null = null;
let taskGeneration = 0;
const listeners = new Set<() => void>();
const activePollers = new Set<string>();
const importCallbacks = new Map<string, () => void>();
let activeRefresh: { generation: number; promise: Promise<TidasPackageBackgroundTask[]> } | null =
  null;

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextTaskSequence(): number {
  taskSequence += 1;
  return taskSequence;
}

function makeTaskId(sequence: number): string {
  return `tidas-package-task-${Date.now()}-${sequence}`;
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeTaskOwnerId(ownerId: string | null | undefined): string | null {
  const normalized = typeof ownerId === 'string' ? ownerId.trim() : '';
  return normalized || null;
}

export function getTidasPackageTaskStorageKey(ownerId: string): string {
  const normalized = normalizeTaskOwnerId(ownerId);
  if (!normalized) {
    throw new Error('TIDAS package task storage requires an authenticated user id');
  }
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(normalized)}`;
}

function isActiveGeneration(generation: number): boolean {
  return taskOwnerId !== null && generation === taskGeneration;
}

function runForActiveGeneration<T>(generation: number, operation: () => T, inactiveResult: T): T {
  if (!isActiveGeneration(generation)) {
    return inactiveResult;
  }
  return operation();
}

function sharesCanonicalTaskIdentity(
  left: TidasPackageBackgroundTask,
  right: TidasPackageBackgroundTask,
): boolean {
  return Boolean(
    (left.workerJobId && right.workerJobId && left.workerJobId === right.workerJobId) ||
    (left.jobId && right.jobId && left.jobId === right.jobId),
  );
}

function earlierTask(
  left: TidasPackageBackgroundTask,
  right: TidasPackageBackgroundTask,
): TidasPackageBackgroundTask {
  if (left.sequence !== right.sequence) {
    return left.sequence < right.sequence ? left : right;
  }
  return Date.parse(left.createdAt) <= Date.parse(right.createdAt) ? left : right;
}

function earlierIso(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function laterTask(
  left: TidasPackageBackgroundTask,
  right: TidasPackageBackgroundTask,
): TidasPackageBackgroundTask {
  return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt) ? left : right;
}

function mergeLocalTaskAliases(
  left: TidasPackageBackgroundTask,
  right: TidasPackageBackgroundTask,
): TidasPackageBackgroundTask {
  const canonical = earlierTask(left, right);
  const latest = laterTask(left, right);
  const fallback = latest === left ? right : left;

  return {
    ...canonical,
    ...latest,
    id: canonical.id,
    sequence: canonical.sequence,
    kind: canonical.kind,
    request: canonical.request ?? latest.request,
    createdAt: earlierIso(left.createdAt, right.createdAt),
    startedAt: latest.startedAt ?? fallback.startedAt,
    finishedAt: latest.finishedAt ?? fallback.finishedAt,
    workerJobId: latest.workerJobId ?? fallback.workerJobId,
    jobKind: latest.jobKind ?? fallback.jobKind,
    jobId: latest.jobId ?? fallback.jobId,
    scope: latest.scope ?? fallback.scope,
    rootCount: latest.rootCount || fallback.rootCount,
    filename: latest.filename ?? fallback.filename,
    error: latest.error ?? fallback.error,
  };
}

function coalesceCanonicalTaskAliases(
  next: TidasPackageBackgroundTask[],
): TidasPackageBackgroundTask[] {
  const coalesced: TidasPackageBackgroundTask[] = [];
  for (const task of next) {
    const matchingIndex = coalesced.findIndex((item) => sharesCanonicalTaskIdentity(item, task));
    if (matchingIndex < 0) {
      coalesced.push(task);
      continue;
    }
    coalesced[matchingIndex] = mergeLocalTaskAliases(coalesced[matchingIndex], task);
  }
  return coalesced;
}

function persistTasksToStorage(): void {
  if (!canUseStorage() || !taskOwnerId) {
    return;
  }

  const payload: PersistedTaskStore = {
    version: STORAGE_SCHEMA_VERSION,
    savedAt: nowIso(),
    tasks,
  };

  try {
    window.localStorage.setItem(
      getTidasPackageTaskStorageKey(taskOwnerId),
      JSON.stringify(payload),
    );
  } catch (_error) {
    // Ignore storage failures.
  }
}

function setTasks(next: TidasPackageBackgroundTask[], generation = taskGeneration): void {
  if (!isActiveGeneration(generation)) {
    return;
  }
  tasks = coalesceCanonicalTaskAliases(next)
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id),
    )
    .slice(0, MAX_TASK_ITEMS);
  persistTasksToStorage();
  emitChange();
}

function normalizeState(value: unknown): TidasPackageTaskState | null {
  if (value === 'running' || value === 'completed' || value === 'failed') {
    return value;
  }
  return null;
}

function normalizePhase(value: unknown): TidasPackageTaskPhase | null {
  if (
    value === 'submitting' ||
    value === 'queued' ||
    value === 'collect_refs' ||
    value === 'import_package' ||
    value === 'finalize_zip' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  return null;
}

function normalizeIso(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value : fallback;
  return Number.isFinite(Date.parse(text)) ? text : fallback;
}

function optionalIso(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const text = value.trim();
    if (text) {
      return text;
    }
  }
  return undefined;
}

function normalizeRequest(value: unknown): ExportTidasPackageRequest | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const request = value as {
    scope?: unknown;
    roots?: unknown;
  };

  const normalized: ExportTidasPackageRequest = {};
  if (typeof request.scope === 'string' && request.scope.trim()) {
    normalized.scope = request.scope as ExportTidasPackageRequest['scope'];
  }

  if (Array.isArray(request.roots)) {
    normalized.roots = request.roots
      .filter(
        (item): item is { table: string; id: string; version: string } =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as any).table === 'string' &&
          typeof (item as any).id === 'string' &&
          typeof (item as any).version === 'string',
      )
      .map((item) => ({
        table: item.table as NonNullable<ExportTidasPackageRequest['roots']>[number]['table'],
        id: item.id,
        version: item.version,
      }));
  }

  return normalized;
}

function normalizeTask(raw: unknown, fallbackSequence: number): TidasPackageBackgroundTask | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as {
    id?: unknown;
    sequence?: unknown;
    kind?: unknown;
    request?: unknown;
    state?: unknown;
    phase?: unknown;
    message?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    startedAt?: unknown;
    finishedAt?: unknown;
    workerJobId?: unknown;
    jobKind?: unknown;
    jobId?: unknown;
    scope?: unknown;
    rootCount?: unknown;
    filename?: unknown;
    error?: unknown;
    importOutcome?: unknown;
    importSummary?: unknown;
    importReportAvailable?: unknown;
    importDetailsAvailable?: unknown;
  };

  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : null;
  const state = normalizeState(item.state);
  const phase = normalizePhase(item.phase);
  if (!id || !state || !phase) {
    return null;
  }

  const now = nowIso();
  const createdAt = normalizeIso(item.createdAt, now);
  const updatedAt = normalizeIso(item.updatedAt, createdAt);

  return {
    id,
    sequence: Number.isInteger(item.sequence)
      ? Math.max(1, Number(item.sequence))
      : fallbackSequence,
    kind: item.kind === 'tidas_package_import' ? 'tidas_package_import' : 'tidas_package_export',
    request: normalizeRequest(item.request),
    state,
    phase,
    message: typeof item.message === 'string' ? item.message : 'Recovered task',
    createdAt,
    updatedAt,
    startedAt: optionalIso(item.startedAt),
    finishedAt: optionalIso(item.finishedAt),
    workerJobId: typeof item.workerJobId === 'string' ? item.workerJobId : undefined,
    jobKind: typeof item.jobKind === 'string' ? item.jobKind : undefined,
    jobId: typeof item.jobId === 'string' ? item.jobId : undefined,
    scope: typeof item.scope === 'string' ? (item.scope as TidasPackageManifestScope) : null,
    rootCount:
      typeof item.rootCount === 'number' && Number.isFinite(item.rootCount) && item.rootCount >= 0
        ? item.rootCount
        : 0,
    filename: typeof item.filename === 'string' ? item.filename : undefined,
    error: typeof item.error === 'string' ? item.error : undefined,
    importReportAvailable:
      typeof item.importReportAvailable === 'boolean' ? item.importReportAvailable : undefined,
    importDetailsAvailable:
      typeof item.importDetailsAvailable === 'boolean' ? item.importDetailsAvailable : undefined,
    importOutcome:
      typeof item.importOutcome === 'string' &&
      ['success', 'partial', 'none', 'interrupted'].includes(item.importOutcome)
        ? (item.importOutcome as TidasImportOutcome)
        : undefined,
    importSummary:
      item.importSummary && typeof item.importSummary === 'object'
        ? Object.fromEntries(
            Object.entries(item.importSummary).filter(
              ([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
            ),
          )
        : undefined,
  };
}

function readTasksFromStorage(): TidasPackageBackgroundTask[] {
  if (!canUseStorage() || !taskOwnerId) {
    return [];
  }

  const storageKey = getTidasPackageTaskStorageKey(taskOwnerId);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PersistedTaskStore;
    if (!parsed || parsed.version !== STORAGE_SCHEMA_VERSION) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    const savedAtMs = Date.parse(String(parsed.savedAt ?? ''));
    if (Number.isFinite(savedAtMs) && Date.now() - savedAtMs > STORAGE_TTL_MS) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const normalized: TidasPackageBackgroundTask[] = [];
    rawTasks.forEach((item, index) => {
      const task = normalizeTask(item, index + 1);
      if (task) {
        normalized.push(task);
      }
    });
    return normalized;
  } catch (_error) {
    return [];
  }
}

function upsertActiveTask(
  taskId: string,
  patch: Partial<TidasPackageBackgroundTask>,
  generation: number,
): void {
  const index = tasks.findIndex((item) => item.id === taskId);
  if (index < 0) {
    return;
  }

  const current = tasks[index];
  const updated: TidasPackageBackgroundTask = {
    ...current,
    ...patch,
    id: current.id,
    sequence: current.sequence,
    kind: current.kind,
    request: patch.request ?? current.request,
    createdAt: current.createdAt,
    updatedAt: patch.updatedAt ?? nowIso(),
  };

  const next = tasks.slice();
  next[index] = updated;
  setTasks(next, generation);
}

function upsertTask(
  taskId: string,
  patch: Partial<TidasPackageBackgroundTask>,
  generation: number,
): void {
  runForActiveGeneration(generation, () => upsertActiveTask(taskId, patch, generation), undefined);
}

function toErrorMessage(error: unknown): string {
  return normalizeTidasPackageExportErrorMessage(error);
}

function phaseFromJob(job: TidasPackageJobResponse): TidasPackageTaskPhase {
  if (job.status === 'failed' || job.status === 'stale') {
    return 'failed';
  }
  if (job.status === 'ready' || job.status === 'completed') {
    return 'completed';
  }

  const stage = typeof job.diagnostics?.stage === 'string' ? job.diagnostics.stage : '';
  if (stage === 'collect_refs') {
    return 'collect_refs';
  }
  if (stage === 'finalize_zip') {
    return 'finalize_zip';
  }
  if (job.status === 'queued') {
    return 'queued';
  }
  return 'submitting';
}

function filenameFromJob(job: TidasPackageJobResponse, request?: ExportTidasPackageRequest) {
  const artifactFilename = job.artifacts_by_kind.export_zip?.metadata?.filename;
  if (typeof artifactFilename === 'string' && artifactFilename.trim()) {
    return artifactFilename.trim();
  }

  if (request?.roots?.length === 1) {
    return `${request.roots[0].table}-package.zip`;
  }

  return 'tidas-package.zip';
}

function messageFromJob(job: TidasPackageJobResponse, request?: ExportTidasPackageRequest): string {
  const diagnosticsMessage =
    typeof job.diagnostics?.message === 'string' ? job.diagnostics.message.trim() : '';
  if (diagnosticsMessage) {
    const processed = Number(job.diagnostics?.processed_items);
    const total = Number(job.diagnostics?.total_items);
    if (
      phaseFromJob(job) === 'collect_refs' &&
      Number.isFinite(processed) &&
      Number.isFinite(total) &&
      total > 0
    ) {
      return `${diagnosticsMessage} (${processed}/${total})`;
    }
    return diagnosticsMessage;
  }

  if (job.status === 'ready' || job.status === 'completed') {
    return `Export package ready (${filenameFromJob(job, request)})`;
  }
  if (job.status === 'queued') {
    return `Export task queued (${job.job_id})`;
  }
  if (phaseFromJob(job) === 'finalize_zip') {
    return 'Materializing ZIP package';
  }
  if (phaseFromJob(job) === 'collect_refs') {
    return 'Collecting related datasets';
  }
  return `Export task running (${job.job_id})`;
}

function isTidasPackageExportWorkerJob(job: WorkerJobResult): boolean {
  return job.jobKind === 'tidas.export_package';
}

function isTidasPackageImportWorkerJob(job: WorkerJobResult): boolean {
  return job.jobKind === 'tidas.import_package';
}

function packageJobIdFromWorkerJob(job: WorkerJobResult): string | undefined {
  const result = asRecord(job.result);
  return firstString(result?.packageJobId, job.subjectId);
}

function artifactsFromWorkerJob(job: WorkerJobResult): Record<string, unknown>[] {
  const result = asRecord(job.result);
  return Array.isArray(result?.artifacts)
    ? result.artifacts.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)),
      )
    : [];
}

function filenameFromWorkerJob(job: WorkerJobResult): string | undefined {
  for (const artifact of artifactsFromWorkerJob(job)) {
    const kind = firstString(artifact.artifactKind, artifact.artifact_kind);
    if (kind && kind !== 'export_zip') {
      continue;
    }
    const metadata = asRecord(artifact.metadata);
    const filename = firstString(metadata?.filename);
    if (filename) {
      return filename;
    }
  }
  return undefined;
}

function phaseFromWorkerJob(job: WorkerJobResult): TidasPackageTaskPhase {
  if (job.status === 'completed') {
    return 'completed';
  }
  if (
    job.status === 'failed' ||
    job.status === 'stale' ||
    job.status === 'blocked' ||
    job.status === 'cancelled'
  ) {
    return 'failed';
  }

  const phase = typeof job.phase === 'string' ? job.phase : '';
  if (phase === 'collect_refs') {
    return 'collect_refs';
  }
  if (phase === 'import_package') {
    return 'import_package';
  }
  if (phase === 'finalize_zip') {
    return 'finalize_zip';
  }
  if (job.status === 'queued' || job.status === 'waiting') {
    return 'queued';
  }
  return 'submitting';
}

function stateFromWorkerJob(job: WorkerJobResult): TidasPackageTaskState {
  if (job.status === 'completed') {
    return 'completed';
  }
  if (job.status === 'queued' || job.status === 'running' || job.status === 'waiting') {
    return 'running';
  }
  return 'failed';
}

function messageFromWorkerJob(
  job: WorkerJobResult,
  phase: TidasPackageTaskPhase,
  displayJobId: string,
): string {
  const isImport = isTidasPackageImportWorkerJob(job);
  if (job.status === 'completed') {
    return isImport
      ? 'Import package completed'
      : `Export package ready (${filenameFromWorkerJob(job) ?? 'tidas-package.zip'})`;
  }
  if (stateFromWorkerJob(job) === 'failed') {
    return isImport ? 'Import package failed' : 'Export package failed';
  }
  if (isImport) {
    return phase === 'import_package'
      ? 'Importing package data'
      : `Import task queued (${displayJobId})`;
  }
  if (phase === 'collect_refs') {
    return 'Collecting related datasets';
  }
  if (phase === 'finalize_zip') {
    return 'Materializing ZIP package';
  }
  return `Export task queued (${displayJobId})`;
}

function taskFromWorkerJob(
  job: WorkerJobResult,
  fallbackSequence: number,
): TidasPackageBackgroundTask | null {
  const workerJobId = firstString(job.id);
  if (
    !workerJobId ||
    (!isTidasPackageExportWorkerJob(job) && !isTidasPackageImportWorkerJob(job))
  ) {
    return null;
  }

  const now = nowIso();
  const createdAt = normalizeIso(job.createdAt, now);
  const updatedAt = normalizeIso(job.updatedAt, createdAt);
  let phase = phaseFromWorkerJob(job);
  let state = stateFromWorkerJob(job);
  const isImport = isTidasPackageImportWorkerJob(job);
  const importResult = asRecord(asRecord(job.result)?.importResult);
  const importSummary =
    isImport && importResult?.summary
      ? (Object.fromEntries(
          Object.entries(asRecord(importResult.summary) ?? {}).filter(
            ([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
          ),
        ) as Record<string, number>)
      : undefined;
  let importOutcome =
    isImport &&
    typeof importResult?.outcome === 'string' &&
    ['success', 'partial', 'none', 'interrupted'].includes(importResult.outcome)
      ? (importResult!.outcome as TidasImportOutcome)
      : undefined;
  // Old v2 reports could call all roots successful while leaving orphan records.
  if (importOutcome === 'success' && (importSummary?.not_imported_count ?? 0) > 0)
    importOutcome = 'partial';
  if (
    isImport &&
    state === 'completed' &&
    (importOutcome === 'none' ||
      importOutcome === 'interrupted' ||
      importResult?.executionComplete === false)
  ) {
    state = 'failed';
    phase = 'failed';
  }
  const packageJobId = packageJobIdFromWorkerJob(job);
  const displayJobId = packageJobId ?? workerJobId;

  return {
    id: workerJobId,
    sequence: fallbackSequence,
    kind: isImport ? 'tidas_package_import' : 'tidas_package_export',
    importOutcome,
    importSummary,
    importReportAvailable:
      typeof importResult?.reportAvailable === 'boolean' ? importResult.reportAvailable : undefined,
    importDetailsAvailable:
      typeof importResult?.detailsAvailable === 'boolean'
        ? importResult.detailsAvailable
        : undefined,
    state,
    phase,
    message: messageFromWorkerJob(job, phase, displayJobId),
    createdAt,
    updatedAt,
    startedAt: optionalIso(job.startedAt),
    finishedAt: optionalIso(job.finishedAt),
    workerJobId,
    jobKind: firstString(job.jobKind),
    jobId: packageJobId,
    scope: (firstString(job.subjectVersion) as TidasPackageManifestScope | undefined) ?? null,
    rootCount: importSummary?.root_count ?? 0,
    filename: filenameFromWorkerJob(job),
    error:
      state === 'failed' ? firstString(job.errorMessage, job.errorCode, job.status) : undefined,
  };
}

function mergeWorkerJobTask(
  serverTask: TidasPackageBackgroundTask,
  currentTasks: TidasPackageBackgroundTask[],
): TidasPackageBackgroundTask {
  const matches = currentTasks.filter((item) =>
    Boolean(
      (serverTask.workerJobId && item.workerJobId === serverTask.workerJobId) ||
      item.id === serverTask.id ||
      (serverTask.jobId && item.jobId === serverTask.jobId),
    ),
  );

  if (matches.length === 0) {
    return serverTask;
  }

  const current = matches.reduce(earlierTask);
  const createdAt = matches.reduce(
    (earliest, item) => earlierIso(earliest, item.createdAt),
    serverTask.createdAt,
  );
  const updatedAt =
    Date.parse(serverTask.updatedAt) >= Date.parse(createdAt) ? serverTask.updatedAt : createdAt;

  return {
    ...current,
    ...serverTask,
    id: current.id,
    sequence: current.sequence,
    request: current.request,
    createdAt,
    updatedAt,
    scope: current.scope ?? serverTask.scope,
    startedAt: serverTask.startedAt ?? current.startedAt,
    finishedAt: serverTask.finishedAt ?? current.finishedAt,
    rootCount: serverTask.importSummary?.root_count ?? (current.rootCount || serverTask.rootCount),
    filename: serverTask.filename ?? current.filename,
  };
}

function taskPatchFromJob(
  current: TidasPackageBackgroundTask,
  job: TidasPackageJobResponse,
): Partial<TidasPackageBackgroundTask> {
  const phase = phaseFromJob(job);
  const isCompleted = phase === 'completed';
  const isFailed = phase === 'failed';

  return {
    updatedAt: normalizeIso(job.timestamps?.updated_at, current.updatedAt),
    startedAt: optionalIso(job.timestamps?.started_at) ?? current.startedAt,
    finishedAt: optionalIso(job.timestamps?.finished_at) ?? current.finishedAt,
    phase,
    state: isCompleted ? 'completed' : isFailed ? 'failed' : 'running',
    message: messageFromJob(job, current?.request),
    jobId: job.job_id,
    scope: job.scope,
    rootCount:
      typeof job.root_count === 'number' && Number.isFinite(job.root_count) ? job.root_count : 0,
    filename: filenameFromJob(job, current?.request),
    error: isFailed
      ? (current?.error ??
        normalizeTidasPackageExportErrorMessage(
          typeof job.request_cache?.error_message === 'string'
            ? job.request_cache.error_message
            : typeof job.diagnostics?.error === 'string'
              ? job.diagnostics.error
              : typeof job.diagnostics?.message === 'string'
                ? job.diagnostics.message
                : null,
          'TIDAS package export failed',
        ))
      : undefined,
  };
}

function applyJobToTask(taskId: string, job: TidasPackageJobResponse, generation: number): void {
  runForActiveGeneration(
    generation,
    () => {
      const current = tasks.find((item) => item.id === taskId);
      if (current) upsertTask(taskId, taskPatchFromJob(current, job), generation);
    },
    undefined,
  );
}

async function pollActiveTask(taskId: string, jobId: string, generation: number): Promise<void> {
  const pollerKey = `${generation}:${taskId}`;
  if (activePollers.has(pollerKey)) {
    return;
  }

  activePollers.add(pollerKey);
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  try {
    while (Date.now() - startedAt <= POLL_TIMEOUT_MS) {
      if (!isActiveGeneration(generation)) {
        return;
      }
      const task = tasks.find((item) => item.id === taskId);
      if (!task || task.state !== 'running') {
        return;
      }

      const { data, error } = await getTidasPackageJobApi(jobId);
      if (!isActiveGeneration(generation)) {
        return;
      }
      if (error || !data?.ok) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= POLL_TRANSIENT_ERROR_RETRY_LIMIT) {
          upsertTask(
            taskId,
            {
              phase: 'failed',
              state: 'failed',
              message: 'Export task failed',
              error: normalizeTidasPackageExportErrorMessage(
                error?.message,
                'Failed to load TIDAS package job status',
              ),
            },
            generation,
          );
          return;
        }

        upsertTask(
          taskId,
          {
            phase: task.phase === 'submitting' ? 'queued' : task.phase,
            state: 'running',
            message: `Connection interrupted while checking export status, retrying (${consecutiveErrors}/${POLL_TRANSIENT_ERROR_RETRY_LIMIT})`,
            error: undefined,
          },
          generation,
        );
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      consecutiveErrors = 0;
      applyJobToTask(taskId, data, generation);
      if (data.status === 'failed' || data.status === 'stale') {
        return;
      }
      if (data.status === 'ready' || data.status === 'completed') {
        return;
      }

      await delay(POLL_INTERVAL_MS);
    }

    upsertTask(
      taskId,
      {
        phase: 'failed',
        state: 'failed',
        message: 'Package status polling paused; refresh Task Center',
        error: 'tidas_package_export_timeout',
      },
      generation,
    );
  } finally {
    activePollers.delete(pollerKey);
  }
}

function pollTask(taskId: string, jobId: string, generation: number): Promise<void> {
  return runForActiveGeneration(
    generation,
    () => pollActiveTask(taskId, jobId, generation),
    Promise.resolve(),
  );
}

async function runExportTask(
  taskId: string,
  request: ExportTidasPackageRequest,
  generation: number,
): Promise<void> {
  let activeTaskId = taskId;
  try {
    const queued = await queueExportTidasPackageApi(request);
    if (!isActiveGeneration(generation)) {
      return;
    }
    if (queued.error || !queued.data?.ok) {
      throw queued.error ?? new Error((queued.data as any)?.message ?? 'Export failed');
    }
    const queuedData = queued.data;

    upsertTask(
      taskId,
      {
        phase: queuedData.mode === 'queued' ? 'queued' : 'submitting',
        state: 'running',
        message:
          queuedData.mode === 'cache_hit'
            ? 'Checking cached export package'
            : `Export task queued (${queuedData.job_id})`,
        workerJobId: queuedData.worker_job_id ?? undefined,
        jobId: queuedData.job_id,
        scope: queuedData.scope,
        rootCount: queuedData.root_count ?? 0,
      },
      generation,
    );

    const canonicalTaskId = tasks.find((item) =>
      Boolean(
        (queuedData.worker_job_id && item.workerJobId === queuedData.worker_job_id) ||
        item.jobId === queuedData.job_id,
      ),
    )?.id;
    if (!canonicalTaskId) {
      return;
    }

    activeTaskId = canonicalTaskId;
    await pollTask(canonicalTaskId, queuedData.job_id, generation);
  } catch (error) {
    upsertTask(
      activeTaskId,
      {
        phase: 'failed',
        state: 'failed',
        message: 'Export task failed',
        error: toErrorMessage(error),
      },
      generation,
    );
  }
}

async function refreshActiveTidasPackageTasks(
  generation: number,
): Promise<TidasPackageBackgroundTask[]> {
  if (!isActiveGeneration(generation)) {
    return tasks;
  }
  const result = await requestWorkerJobsApi({
    action: 'list',
    subjectType: 'lca_package_job',
    statuses: TIDAS_PACKAGE_WORKER_JOB_STATUSES,
    limit: MAX_TASK_ITEMS,
  });
  if (!isActiveGeneration(generation)) {
    return tasks;
  }
  if (result.error) {
    throw new Error(result.error.message || 'Failed to refresh TIDAS package worker jobs');
  }

  const serverTasks = (result.data ?? [])
    .map((job, index) => taskFromWorkerJob(job, taskSequence + index + 1))
    .filter((item): item is TidasPackageBackgroundTask => Boolean(item));
  if (serverTasks.length === 0) {
    return tasks;
  }

  const merged = tasks.slice();
  const completedImports: TidasPackageBackgroundTask[] = [];
  for (const serverTask of serverTasks) {
    const matchingIds = new Set(
      merged
        .filter(
          (item) => item.id === serverTask.id || sharesCanonicalTaskIdentity(item, serverTask),
        )
        .map((item) => item.id),
    );
    const nextTask = mergeWorkerJobTask(serverTask, merged);
    if (
      nextTask.kind === 'tidas_package_import' &&
      nextTask.state !== 'running' &&
      merged.some((item) => matchingIds.has(item.id) && item.state === 'running')
    ) {
      completedImports.push(nextTask);
    }
    const remaining = merged.filter((item) => !matchingIds.has(item.id));
    merged.splice(0, merged.length, ...remaining, nextTask);
  }

  setTasks(merged, generation);
  // Persist terminal state before notifying. Repeated list reads cannot notify again.
  for (const task of completedImports) {
    if (!isActiveGeneration(generation)) break;
    const callback = task.jobId ? importCallbacks.get(task.jobId) : undefined;
    if (task.jobId) importCallbacks.delete(task.jobId);
    if ((task.importSummary?.imported_count ?? 0) > 0) {
      window.dispatchEvent(new Event('tidas-package-imported'));
      if (!isActiveGeneration(generation)) break;
      try {
        callback?.();
      } catch {
        /* A consumer callback must not break list reconciliation. */
      }
    }
  }
  const maxSequence = tasks.reduce((max, item) => Math.max(max, item.sequence), 0);
  if (maxSequence > taskSequence) {
    taskSequence = maxSequence;
  }
  return tasks;
}

export async function refreshTidasPackageTasksFromWorkerJobs(): Promise<
  TidasPackageBackgroundTask[]
> {
  const generation = taskGeneration;
  if (activeRefresh?.generation === generation) return activeRefresh.promise;
  const promise = refreshActiveTidasPackageTasks(generation);
  activeRefresh = { generation, promise };
  try {
    return await promise;
  } finally {
    if (activeRefresh?.promise === promise) activeRefresh = null;
  }
}

function hydrateActiveTasksFromStorage(generation: number): void {
  const restored = readTasksFromStorage();
  if (restored.length > 0) {
    setTasks(restored, generation);
    const maxSequence = restored.reduce((max, item) => Math.max(max, item.sequence), 0);
    if (maxSequence > taskSequence) {
      taskSequence = maxSequence;
    }

    restored
      .filter(
        (item) => item.kind === 'tidas_package_export' && item.state === 'running' && item.jobId,
      )
      .forEach((item) => {
        void pollTask(item.id, item.jobId!, generation);
      });
  }

  void refreshTidasPackageTasksFromWorkerJobs().catch(() => undefined);
}

function hydrateTasksFromStorage(generation: number): void {
  runForActiveGeneration(generation, () => hydrateActiveTasksFromStorage(generation), undefined);
}

export function bindTidasPackageTaskCenterOwner(ownerId: string | null | undefined): void {
  const normalizedOwnerId = normalizeTaskOwnerId(ownerId);
  if (normalizedOwnerId === taskOwnerId) {
    return;
  }

  taskGeneration += 1;
  taskOwnerId = normalizedOwnerId;
  taskSequence = 0;
  tasks = [];
  activePollers.clear();
  importCallbacks.clear();
  emitChange();

  if (!normalizedOwnerId) {
    return;
  }

  if (canUseStorage()) {
    try {
      // The pre-fix global snapshot cannot be attributed to an authenticated
      // owner, so it is deliberately discarded rather than migrated.
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  hydrateTasksFromStorage(taskGeneration);
}

export function submitTidasPackageExportTask(
  request: ExportTidasPackageRequest,
): TidasPackageBackgroundTask {
  if (!taskOwnerId) {
    throw new Error('TIDAS package task center requires an authenticated user');
  }
  const generation = taskGeneration;
  const createdAt = nowIso();
  const sequence = nextTaskSequence();
  const task: TidasPackageBackgroundTask = {
    id: makeTaskId(sequence),
    sequence,
    kind: 'tidas_package_export',
    request,
    state: 'running',
    phase: 'submitting',
    message: 'Submitting export task',
    createdAt,
    updatedAt: createdAt,
    rootCount: request.roots?.length ?? 0,
  };

  setTasks([task, ...tasks], generation);
  void runExportTask(task.id, request, generation);
  return task;
}

/** Upload and enqueue only. Closing the dialog does not cancel backend work. */
export async function submitTidasPackageImportTask(
  file: File,
  onImported?: () => void,
): Promise<void> {
  if (!taskOwnerId) throw new Error('TIDAS package task center requires an authenticated user');
  const generation = taskGeneration;
  const queued = await queueImportTidasPackageApi(file);
  if (queued.error || !queued.data?.ok) throw queued.error ?? new Error('Import enqueue failed');
  if (!isActiveGeneration(generation)) return;
  const createdAt = nowIso();
  const sequence = nextTaskSequence();
  const task: TidasPackageBackgroundTask = {
    id: queued.data.worker_job_id ?? makeTaskId(sequence),
    sequence,
    kind: 'tidas_package_import',
    state: 'running',
    phase: 'queued',
    message: 'Import task queued',
    createdAt,
    updatedAt: createdAt,
    workerJobId: queued.data.worker_job_id ?? undefined,
    jobId: queued.data.job_id,
    rootCount: 0,
    filename: file.name,
  };
  if (onImported) importCallbacks.set(queued.data.job_id, onImported);
  setTasks([task, ...tasks], generation);
}

export async function downloadTidasPackageExportTask(
  taskId: string,
): Promise<ExportTidasPackageResponse> {
  const generation = taskGeneration;
  const task = tasks.find((item) => item.id === taskId);
  if (!task?.jobId) {
    throw new Error('Package export task is missing job information');
  }

  const result = await downloadReadyTidasPackageExportApi(
    task.jobId,
    task.filename ?? 'tidas-package.zip',
  );
  if (result.error || !result.data?.ok) {
    throw result.error ?? new Error('Failed to download TIDAS package');
  }

  if (!isActiveGeneration(generation)) {
    return result.data;
  }

  upsertTask(
    taskId,
    {
      filename: result.data.filename,
      message: `Export package ready (${result.data.filename})`,
    },
    generation,
  );

  return result.data;
}

export function removeTidasPackageTask(taskId: string): void {
  setTasks(tasks.filter((item) => item.id !== taskId));
}

export function clearFinishedTidasPackageTasks(): void {
  setTasks(tasks.filter((item) => item.state === 'running'));
}

export function listTidasPackageTasks(): TidasPackageBackgroundTask[] {
  return tasks;
}

export function subscribeTidasPackageTasks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
