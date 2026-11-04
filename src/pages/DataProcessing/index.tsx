import AccessDenied from '@/components/AccessDenied';
import {
  ClosureArtifactList,
  closureCheckNeedsPolling,
  closureCheckPollIntervalMs,
  closureCheckPollMaxAttempts,
} from '@/components/ClosureTaskDetail';
import { dataListPagination } from '@/components/ResponsiveDataList';
import LcaReleaseReadPanel from '@/components/LcaReleaseReadPanel';
import {
  createClosureCheck,
  createLciaResultBuildRequest,
  createLciaResultSet,
  getClosureCheck,
  getLciaResultSet,
  listClosureCheckIssues,
  listLciaResultPublications,
  listLciaResultSets,
  previewLciaResultPackage,
  publishLciaResultPackage,
  unpublishLciaResultPublication,
  type ClosureCheckIssueV1,
  type ClosureCheckSummaryV1,
  type ClosureScopeIdentityV1,
  type LciaResultPublication,
  type LciaResultSetV1,
} from '@/services/dataProducts';
import {
  getDataProductTaskGeneration,
  getDataProductTaskOwnerId,
  listDataProductTasks,
  refreshDataProductTasks,
  subscribeDataProductTasks,
  upsertDataProductTasks,
} from '@/services/dataProducts/taskCenter';
import { resolveContentLanguages } from '@/services/general/contentLanguageRegistry';
import { resolveRouteViewState } from '@/services/general/routeViewState';
import {
  DEFAULT_BROWSER_APP_LOCALE,
  normalizeRuntimeLocale,
} from '@/services/general/runtimeLocale';
import { toCanonicalLciaMethodId } from '@/services/lciaMethods/evidence';
import { getSystemUserRoleApi } from '@/services/roles/api';
import { taskProgressPercent, type TaskSummaryV2 } from '@/services/taskCenter/types';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  StopOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useIntl, useLocation } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Modal,
  Descriptions,
  Drawer,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import CalculationBundlePanel, { formatBundleNumber } from './CalculationBundlePanel';
import { closureDisplayStatus } from './resultPresentation';
import styles from './index.less';
import ResultSetDirectory from './ResultSetDirectory';
import { deriveResultSetWorkflowSummary } from './resultSetWorkflow';
export {
  deriveResultSetWorkflowSummary,
  resultSetStatusMessage,
  resultSetActionMessage,
} from './resultSetWorkflow';

type CommandStatus = {
  kind: 'success' | 'error';
  message: ReactNode;
};

type CommandAction =
  | 'createResultSet'
  | 'createClosureCheck'
  | 'createBuild'
  | 'previewPackage'
  | 'publishPackage'
  | 'unpublishPublication';

type CommandSummaryRow = {
  label: string;
  value: string;
};

type LciaMethodListPayload = {
  files?: Array<{
    id?: string;
    version?: string;
    description?: unknown;
    referenceQuantity?: {
      'common:shortDescription'?: unknown;
    };
  }>;
};

type ImpactCategoryOption = {
  label: string;
  value: string;
  version: string;
};

type LciaResultPackageOption = {
  value: string;
  label: string;
  packageId: string;
  packageName?: string;
  packageVersion?: string;
  buildId?: string;
  status?: string;
  includedInputCount?: string;
  eligibleInputCount?: string;
};

type StatusTone = 'success' | 'error' | 'processing' | 'warning' | 'default';

const submittedBuildPendingPhase = 'waiting_for_worker_processing';
const previewPageSize = dataListPagination.defaultPageSize;
function isTerminalTaskStatus(status: TaskSummaryV2['workerStatus'] | undefined): boolean {
  return Boolean(
    status && ['completed', 'blocked', 'stale', 'failed', 'cancelled'].includes(status),
  );
}

function newIdempotencyToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `closure-check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function selectedImpactCategoryIdentity(
  value: unknown,
  options: ImpactCategoryOption[],
): ClosureScopeIdentityV1 | null {
  if (typeof value !== 'string') return null;
  const option = options.find((candidate) => candidate.value === value);
  return option ? { id: option.value, version: option.version } : null;
}

export function reviewedLciaMethodSet(options: ImpactCategoryOption[]): ClosureScopeIdentityV1[] {
  const identities = new Map<string, ClosureScopeIdentityV1>();
  options.forEach((option) => {
    const identity = { id: option.value.trim(), version: option.version.trim() };
    if (!identity.id || !identity.version) return;
    identities.set(`${identity.id}\u0000${identity.version}`, identity);
  });
  return [...identities.values()];
}

export function scopeSelectionKey(
  values: Record<string, unknown>,
  options: ImpactCategoryOption[] = [],
): string {
  return JSON.stringify({
    coverageMode: values.coverageMode ?? 'global_eligible',
    lciaMethods: reviewedLciaMethodSet(options),
  });
}

export function parseDataProcessingDeepLink(search: string): {
  activeTabKey: 'builds' | 'preview' | 'exports' | 'publication';
  packageId?: string;
  processId?: string;
  processVersion?: string;
  closureCheckId?: string;
  resultBuildId?: string;
  resultSetId?: string;
} {
  const params = new URLSearchParams(search);
  const activeTabKey = resolveRouteViewState('data-processing-tab', params.get('tab')) as
    'builds' | 'preview' | 'exports' | 'publication';
  const value = (name: string) => params.get(name)?.trim() || undefined;
  return {
    activeTabKey,
    packageId: value('packageId'),
    processId: value('processId'),
    processVersion: value('processVersion'),
    closureCheckId: value('closureCheckId'),
    resultBuildId: value('resultBuildId'),
    resultSetId: value('resultSetId'),
  };
}

export function stringifyCommandData(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim() !== '');
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function statusToneFromValue(value: unknown): StatusTone {
  switch (normalizeStatus(value)) {
    case 'completed':
    case 'current':
    case 'published':
    case 'ready':
    case 'preview_ready':
      return 'success';
    case 'failed':
    case 'error':
      return 'error';
    case 'running':
    case 'processing':
    case 'in_progress':
      return 'processing';
    case 'queued':
    case 'pending':
    case 'waiting':
    case 'blocked':
      return 'warning';
    default:
      return 'default';
  }
}

function statusToneClassName(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return styles.statusIconSuccess;
    case 'error':
      return styles.statusIconError;
    case 'processing':
      return styles.statusIconProcessing;
    case 'warning':
      return styles.statusIconWarning;
    default:
      return styles.statusIconDefault;
  }
}

export function statusIconFromValue(value: unknown): ReactNode {
  switch (normalizeStatus(value)) {
    case 'completed':
    case 'current':
    case 'published':
    case 'ready':
    case 'preview_ready':
      return <CheckCircleOutlined />;
    case 'failed':
    case 'error':
      return <CloseCircleOutlined />;
    case 'running':
    case 'processing':
    case 'in_progress':
      return <SyncOutlined />;
    case 'queued':
    case 'pending':
    case 'waiting':
      return <ClockCircleOutlined />;
    case 'blocked':
      return <WarningOutlined />;
    case 'unpublished':
    case 'cancelled':
    case 'canceled':
      return <StopOutlined />;
    default:
      return <ClockCircleOutlined />;
  }
}

function renderStatusIcon(value: unknown, tooltipTitle?: string): ReactNode {
  const label = firstString(value) ?? '-';
  const tone = statusToneFromValue(value);

  return (
    <Tooltip title={tooltipTitle ?? label}>
      <span
        aria-label={label}
        className={`${styles.statusIcon} ${statusToneClassName(tone)}`}
        role='img'
      >
        {statusIconFromValue(value)}
      </span>
    </Tooltip>
  );
}

export function firstNumberText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function firstDisplayString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string =>
      typeof value === 'string' &&
      value.trim() !== '' &&
      value.trim() !== '-' &&
      value.trim().toLowerCase() !== 'unknown',
  );
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return unknownArray(value).filter(isRecord);
}

export function packageCountLabel(option: LciaResultPackageOption): string | undefined {
  if (option.includedInputCount && !option.eligibleInputCount) {
    return option.includedInputCount;
  }
  if (!option.includedInputCount && option.eligibleInputCount) {
    return option.eligibleInputCount;
  }
  if (!option.includedInputCount || !option.eligibleInputCount) {
    return undefined;
  }
  return `${option.includedInputCount}/${option.eligibleInputCount}`;
}

export function stateCodeFromProcess(value: unknown): string {
  const record = isRecord(value) ? value : {};
  return firstNumberText(record.stateCode, record.state_code) ?? '-';
}

export function stateCodeCountsFromProcesses(
  processes: unknown[],
): Array<{ stateCode: string; count: number }> {
  const counts = new Map<string, number>();
  processes.forEach((process) => {
    const stateCode = stateCodeFromProcess(process);
    counts.set(stateCode, (counts.get(stateCode) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([stateCode, count]) => ({ stateCode, count }))
    .sort((left, right) => left.stateCode.localeCompare(right.stateCode));
}

export function stateCodeCountsFromScope(
  value: unknown,
): Array<{ stateCode: string; count: number }> {
  return recordArray(value)
    .map((item) => {
      const count = typeof item.count === 'number' ? item.count : Number(item.count);
      return {
        stateCode: firstNumberText(item.stateCode, item.state_code) ?? '-',
        count: Number.isFinite(count) ? count : 0,
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => left.stateCode.localeCompare(right.stateCode));
}

export function formatArtifactByteSize(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const size = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(size) || size < 0) {
    return '-';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function formatNumericValue(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '-';
  }
  return String(numeric);
}

export function formatTimestamp(value: unknown): string {
  const raw = firstString(value);
  if (!raw) {
    return '-';
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : raw;
}

function numberField(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function processDetailHref(processId: string, processVersion: string): string {
  const params = new URLSearchParams({
    id: processId,
    version: processVersion,
    mode: 'view',
  });
  return `/mydata/processes?${params.toString()}`;
}

function lineFromSnapshotOutput(stdoutTail: unknown, prefix: string): string | undefined {
  if (typeof stdoutTail !== 'string') {
    return undefined;
  }
  return stdoutTail
    .split('\n')
    .find((line) => line.startsWith(`[${prefix}]`))
    ?.replace(new RegExp(`^\\[${prefix}\\]\\s*`), '')
    .trim();
}

function summarizeSnapshotMatrix(stdoutTail: unknown): string | undefined {
  const line = lineFromSnapshotOutput(stdoutTail, 'matrix');
  return line?.match(/process_count=\S+\s+flow_count=\S+\s+impact_count=\S+/)?.[0] ?? line;
}

function summarizeSnapshotCoverage(stdoutTail: unknown): string | undefined {
  const line = lineFromSnapshotOutput(stdoutTail, 'coverage');
  return line?.match(/unique_match=\S+\s+any_match=\S+\s+singular_risk=\S+/)?.[0] ?? line;
}

/** Safe local projection used only while the task feed has not observed a new build yet. */
export function createSubmittedBuildTask(data: unknown): TaskSummaryV2 | null {
  const record = isRecord(data) ? data : null;
  const jobId = firstString(record?.workerJobId, record?.worker_job_id);
  if (!jobId) return null;
  const buildId = firstString(record?.buildId, record?.build_id);
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 'task-summary.v2',
    jobId,
    jobKind: 'lcia_result.package_build',
    workerStatus: 'queued',
    domainValidity: 'none',
    projectionUpdatedAt: timestamp,
    capabilities: {
      canCancel: false,
      canDownloadReport: false,
      canOpenWorkbench: true,
      canPreviewResult: false,
    },
    id: jobId,
    category: 'data_product',
    title: firstString(record?.name, record?.packageName) ?? 'Result set generation',
    runState: 'active',
    phase: submittedBuildPendingPhase,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(buildId ? { deepLink: { routeKey: 'data_product.package', params: {} } } : {}),
  };
}

export function packageOptionFromTaskSummary(task: TaskSummaryV2): LciaResultPackageOption | null {
  if (!task.resultPackageId) return null;
  return {
    value: task.resultPackageId,
    label: task.title || task.resultPackageId,
    packageId: task.resultPackageId,
    packageName: task.title,
    status: task.domainStatus,
    ...(typeof task.progressCounters?.completed === 'number'
      ? { includedInputCount: String(task.progressCounters.completed) }
      : {}),
    ...(typeof task.progressCounters?.total === 'number'
      ? { eligibleInputCount: String(task.progressCounters.total) }
      : {}),
  };
}

export function packageOptionsFromTaskSummaries(tasks: TaskSummaryV2[]): LciaResultPackageOption[] {
  const options = new Map<string, LciaResultPackageOption>();
  tasks.forEach((task) => {
    const option = packageOptionFromTaskSummary(task);
    if (option) options.set(option.packageId, option);
  });
  return [...options.values()];
}

export function resolveLocalizedText(value: unknown, locale: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const entries = value.filter(
      (item): item is Record<string, unknown> => item !== null && typeof item === 'object',
    );
    const hasText = (item: Record<string, unknown>) =>
      String(item['#text'] ?? '').trim().length > 0;
    const fallback =
      resolveContentLanguages(locale)
        .map((languageCode) =>
          entries.find(
            (item) =>
              String(item['@xml:lang'] ?? '')
                .trim()
                .toLowerCase() === languageCode && hasText(item),
          ),
        )
        .find((item): item is Record<string, unknown> => item !== undefined) ??
      entries.find(hasText);
    return fallback ? String(fallback['#text']) : '';
  }

  if (value && typeof value === 'object') {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }

  return '';
}

export function buildImpactCategoryOptions(
  payload: LciaMethodListPayload,
  locale: string,
): ImpactCategoryOption[] {
  return (payload.files ?? []).flatMap((file) => {
    const id = typeof file.id === 'string' ? file.id.trim() : '';
    const version = typeof file.version === 'string' ? file.version.trim() : '';
    if (!id || !/^\d{2}\.\d{2}\.\d{3}$/.test(version)) return [];
    const methodId = toCanonicalLciaMethodId(id, version);

    const name = resolveLocalizedText(file.description, locale) || id;
    const unit = resolveLocalizedText(file.referenceQuantity?.['common:shortDescription'], locale);
    const suffix = [version, unit].filter(Boolean).join(' / ');
    return [
      {
        value: methodId,
        version,
        label: `${name} (${suffix})`,
      },
    ];
  });
}

export function parseImpactCategoryOptionLabel(label?: string) {
  if (!label) {
    return {};
  }
  const match = label.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (!match) {
    return { name: label };
  }
  const parts = match[2].split('/').map((part) => part.trim());
  return {
    name: match[1].trim(),
    version: parts[0],
    unit: parts.slice(1).join(' / '),
  };
}

const DataProcessing = () => {
  const intl = useIntl();
  const location = useLocation();
  const deepLink = useMemo(() => parseDataProcessingDeepLink(location.search), [location.search]);
  const locale = normalizeRuntimeLocale(intl.locale) ?? DEFAULT_BROWSER_APP_LOCALE;
  const t = useCallback(
    (id: string, defaultMessage: string) => intl.formatMessage({ id, defaultMessage }),
    [intl],
  );
  const [authResolved, setAuthResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | undefined>();
  const [activeTabKey, setActiveTabKey] = useState<string>(deepLink.activeTabKey);
  const [commandStatus, setCommandStatus] = useState<CommandStatus | null>(null);
  const [submittingAction, setSubmittingAction] = useState<CommandAction | null>(null);
  const commandSequenceRef = useRef(0);
  const createResultSetInFlightRef = useRef(false);
  const [resultProcess, setResultProcess] = useState<{
    id: string;
    version: string;
    name?: string;
  } | null>(null);
  useEffect(() => {
    setResultProcess(
      deepLink.processId && deepLink.processVersion
        ? { id: deepLink.processId, version: deepLink.processVersion }
        : null,
    );
  }, [deepLink.resultSetId, deepLink.packageId, deepLink.processId, deepLink.processVersion]);
  const [previewData, setPreviewData] = useState<Record<string, any> | null>(null);
  const [impactCategoryOptions, setImpactCategoryOptions] = useState<ImpactCategoryOption[]>([]);
  const dataProductTasks = useSyncExternalStore(
    subscribeDataProductTasks,
    listDataProductTasks,
    listDataProductTasks,
  );
  const allBuildJobs = useMemo(
    () => dataProductTasks.filter((job) => job.jobKind === 'lcia_result.package_build'),
    [dataProductTasks],
  );
  const buildJobs = useMemo(
    () =>
      deepLink.resultSetId
        ? allBuildJobs.filter((job) => job.resultSetId === deepLink.resultSetId)
        : allBuildJobs.filter((job) => !job.resultSetId),
    [allBuildJobs, deepLink.resultSetId],
  );
  const closureTasks = useMemo(
    () =>
      dataProductTasks.filter(
        (job) =>
          job.jobKind === 'lcia.scope_closure_check' &&
          (deepLink.resultSetId ? job.resultSetId === deepLink.resultSetId : !job.resultSetId),
      ),
    [dataProductTasks, deepLink.resultSetId],
  );
  const [resultSets, setResultSets] = useState<LciaResultSetV1[]>([]);
  const [resultSetsLoading, setResultSetsLoading] = useState(false);
  const [resultSetsError, setResultSetsError] = useState<string | null>(null);
  const [resultSetContextError, setResultSetContextError] = useState<string | null>(null);
  const [closureCheck, setClosureCheck] = useState<ClosureCheckSummaryV1 | null>(null);
  const closureCheckRef = useRef<ClosureCheckSummaryV1 | null>(null);
  const activeClosureCheckIdRef = useRef<string | undefined>(undefined);
  const closureRequestGenerationRef = useRef(0);
  const closureRefreshFlightRef = useRef<{
    closureCheckId: string;
    promise: ReturnType<typeof getClosureCheck>;
  } | null>(null);
  const mountedRef = useRef(true);
  const previousClosureTaskStatusRef = useRef<TaskSummaryV2['workerStatus'] | undefined>(undefined);
  const closurePollAttemptRef = useRef<{ closureCheckId?: string; count: number }>({ count: 0 });
  const recoveryInFlightRef = useRef(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const closureTask = useMemo(
    () =>
      closureCheck?.workerJob?.jobId
        ? dataProductTasks.find((task) => task.jobId === closureCheck.workerJob?.jobId)
        : undefined,
    [closureCheck?.workerJob?.jobId, dataProductTasks],
  );
  const [closurePrerequisiteUnavailable, setClosurePrerequisiteUnavailable] = useState(false);
  const [closureIssues, setClosureIssues] = useState<ClosureCheckIssueV1[]>([]);
  const [closureIssuesAfterIssueId, setClosureIssuesAfterIssueId] = useState<string | undefined>();
  const [closureIssuesLoading, setClosureIssuesLoading] = useState(false);
  const [closureIssuesError, setClosureIssuesError] = useState<string | null>(null);
  const [closureSelectionKey, setClosureSelectionKey] = useState<string | null>(null);
  const [currentSelectionKey, setCurrentSelectionKey] = useState<string>(scopeSelectionKey({}));
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>(
    deepLink.packageId,
  );
  const [previewImpactCategoryId, setPreviewImpactCategoryId] = useState<string | undefined>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const resultSetLoadGeneration = useRef(0);
  const previewReadGeneration = useRef(0);
  const previewPageSizeRef = useRef(previewPageSize);
  const previewRouteKey = `${deepLink.resultSetId ?? ''}:${deepLink.packageId ?? ''}`;
  const previewRouteRef = useRef(previewRouteKey);
  previewRouteRef.current = previewRouteKey;
  const [buildJobsLoading, setBuildJobsLoading] = useState(false);
  const [buildJobsError, setBuildJobsError] = useState<string | null>(null);
  const [publications, setPublications] = useState<LciaResultPublication[]>([]);
  const [publicationsLoading, setPublicationsLoading] = useState(false);
  const [publicationsError, setPublicationsError] = useState<string | null>(null);
  const publicationsLoadInFlightRef = useRef(false);
  const [buildForm] = Form.useForm();
  const [resultSetForm] = Form.useForm();
  const [previewForm] = Form.useForm();
  const [publishForm] = Form.useForm();

  useEffect(() => {
    setActiveTabKey(deepLink.activeTabKey);
  }, [deepLink.activeTabKey]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      closureRequestGenerationRef.current += 1;
      closureRefreshFlightRef.current = null;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      setLoading(true);
      try {
        const userRole = await getSystemUserRoleApi();
        if (!cancelled) {
          setRole(userRole?.role);
        }
      } catch (error) {
        if (!cancelled) {
          setRole(undefined);
        }
      } finally {
        if (!cancelled) {
          setAuthResolved(true);
          setLoading(false);
        }
      }
    };

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadImpactCategories = async () => {
      try {
        const response = await fetch('/lciamethods/list.json');
        if (!response.ok) {
          throw new Error('LCIA method list request failed');
        }
        const payload = (await response.json()) as LciaMethodListPayload;
        if (!cancelled) {
          setImpactCategoryOptions(buildImpactCategoryOptions(payload, locale));
        }
      } catch (_error) {
        if (!cancelled) {
          setImpactCategoryOptions([]);
        }
      }
    };

    void loadImpactCategories();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const isAuthorized = role === 'data_product_manager';
  const selectedResultSet = useMemo(
    () => resultSets.find((resultSet) => resultSet.resultSetId === deepLink.resultSetId),
    [deepLink.resultSetId, resultSets],
  );
  const selectedClosureCheckId =
    deepLink.closureCheckId ??
    (deepLink.resultSetId
      ? closureTasks.find((task) => task.closureCheckId)?.closureCheckId
      : undefined);

  const activateClosureCheckId = useCallback((closureCheckId: string | undefined) => {
    if (activeClosureCheckIdRef.current === closureCheckId) return;
    activeClosureCheckIdRef.current = closureCheckId;
    closureRequestGenerationRef.current += 1;
    closureRefreshFlightRef.current = null;
    previousClosureTaskStatusRef.current = undefined;
    closurePollAttemptRef.current = { closureCheckId, count: 0 };
  }, []);

  const refreshClosureCheck = useCallback((closureCheckId: string) => {
    const currentFlight = closureRefreshFlightRef.current;
    if (currentFlight?.closureCheckId === closureCheckId) {
      return currentFlight.promise;
    }
    const generation = closureRequestGenerationRef.current;
    const promise = getClosureCheck(closureCheckId)
      .then((result) => {
        if (
          mountedRef.current &&
          generation === closureRequestGenerationRef.current &&
          activeClosureCheckIdRef.current === closureCheckId &&
          !result.error &&
          result.data?.closureCheckId === closureCheckId
        ) {
          closureCheckRef.current = result.data;
          setClosureCheck(result.data);
        }
        return result;
      })
      .finally(() => {
        if (closureRefreshFlightRef.current?.promise === promise) {
          closureRefreshFlightRef.current = null;
        }
      });
    closureRefreshFlightRef.current = { closureCheckId, promise };
    return promise;
  }, []);

  const loadBuildJobs = useCallback(async () => {
    setBuildJobsLoading(true);
    setBuildJobsError(null);
    try {
      await refreshDataProductTasks();
    } catch (error) {
      setBuildJobsError(error instanceof Error ? error.message : String(error));
    } finally {
      setBuildJobsLoading(false);
    }
  }, []);

  const loadResultSets = useCallback(async () => {
    const generation = ++resultSetLoadGeneration.current;
    setResultSetsLoading(true);
    setResultSetsError(null);
    setResultSetContextError(null);
    try {
      const result = await listLciaResultSets(200);
      if (!mountedRef.current || generation !== resultSetLoadGeneration.current) return;
      if (result.error || !result.data) {
        setResultSets([]);
        setResultSetsError(result.error?.message ?? 'Unable to load result sets.');
        return;
      }
      let rows = result.data.items;
      if (
        deepLink.resultSetId &&
        !rows.some((resultSet) => resultSet.resultSetId === deepLink.resultSetId)
      ) {
        const linkedResult = await getLciaResultSet(deepLink.resultSetId);
        if (!mountedRef.current || generation !== resultSetLoadGeneration.current) return;
        if (linkedResult.data) {
          rows = [linkedResult.data, ...rows];
        } else {
          setResultSetContextError(
            linkedResult.error?.message ?? 'The selected result set was not found.',
          );
        }
      }
      setResultSets(rows);
    } catch (error) {
      if (!mountedRef.current || generation !== resultSetLoadGeneration.current) return;
      setResultSets([]);
      setResultSetsError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mountedRef.current && generation === resultSetLoadGeneration.current)
        setResultSetsLoading(false);
    }
  }, [deepLink.resultSetId]);

  const loadPublications = useCallback(async () => {
    if (publicationsLoadInFlightRef.current) return;
    publicationsLoadInFlightRef.current = true;
    setPublicationsLoading(true);
    setPublicationsError(null);
    try {
      const result = await listLciaResultPublications({ limit: 50 });
      const rows = [...(result.data ?? [])].sort((left, right) => {
        const currentRank = Number(Boolean(right.isCurrent)) - Number(Boolean(left.isCurrent));
        if (currentRank !== 0) {
          return currentRank;
        }
        return String(right.publishedAt ?? right.unpublishedAt ?? '').localeCompare(
          String(left.publishedAt ?? left.unpublishedAt ?? ''),
        );
      });
      setPublications(rows);
      setPublicationsError(result.error?.message ?? null);
    } finally {
      publicationsLoadInFlightRef.current = false;
      setPublicationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      void loadResultSets();
      void loadBuildJobs();
      void loadPublications();
    }
  }, [isAuthorized, loadBuildJobs, loadPublications, loadResultSets]);

  useEffect(() => {
    const closureCheckId = selectedClosureCheckId;
    if (!isAuthorized || !closureCheckId) {
      activateClosureCheckId(undefined);
      closureCheckRef.current = null;
      setClosureCheck(null);
      setClosureSelectionKey(null);
      return;
    }
    activateClosureCheckId(closureCheckId);
    void refreshClosureCheck(closureCheckId);
  }, [activateClosureCheckId, isAuthorized, refreshClosureCheck, selectedClosureCheckId]);

  useEffect(() => {
    if (selectedResultSet) {
      buildForm.setFieldsValue?.({ name: selectedResultSet.name });
    }
  }, [buildForm, selectedResultSet]);

  useEffect(() => {
    if (
      isAuthorized &&
      selectedClosureCheckId &&
      closureCheck?.closureCheckId === selectedClosureCheckId
    ) {
      const selectionKey = scopeSelectionKey(
        buildForm.getFieldsValue?.() ?? {},
        impactCategoryOptions,
      );
      setClosureSelectionKey(selectionKey);
      setCurrentSelectionKey(selectionKey);
    }
  }, [
    buildForm,
    closureCheck?.closureCheckId,
    impactCategoryOptions,
    isAuthorized,
    selectedClosureCheckId,
  ]);

  const closurePollingKey = closureCheck
    ? [
        closureCheck.closureCheckId,
        closureCheck.runStatus,
        ...(closureCheck.artifacts?.map(
          (artifact) => `${artifact.artifactRole}:${artifact.artifactState}`,
        ) ?? []),
      ].join('|')
    : '';

  useEffect(() => {
    const closureCheckId = closureCheck?.closureCheckId;
    if (!closureCheckId || !closureCheckNeedsPolling(closureCheck)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      closurePollAttemptRef.current.count += 1;
      await refreshClosureCheck(closureCheckId);
      if (
        !cancelled &&
        activeClosureCheckIdRef.current === closureCheckId &&
        closureCheckNeedsPolling(closureCheckRef.current) &&
        closurePollAttemptRef.current.count < closureCheckPollMaxAttempts
      ) {
        timer = setTimeout(() => void poll(), closureCheckPollIntervalMs);
      }
    };
    timer = setTimeout(() => void poll(), closureCheckPollIntervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [closurePollingKey, refreshClosureCheck]);

  useEffect(() => {
    const status = closureTask?.workerStatus;
    const previousStatus = previousClosureTaskStatusRef.current;
    previousClosureTaskStatusRef.current = status;
    if (
      closureCheck?.closureCheckId &&
      isTerminalTaskStatus(status) &&
      status !== previousStatus &&
      closureCheckNeedsPolling(closureCheck)
    ) {
      void refreshClosureCheck(closureCheck.closureCheckId);
    }
  }, [closureCheck, closureTask?.workerStatus, refreshClosureCheck]);

  useEffect(() => {
    setCurrentSelectionKey(
      scopeSelectionKey(buildForm.getFieldsValue?.() ?? {}, impactCategoryOptions),
    );
  }, [buildForm, impactCategoryOptions]);

  const loadClosureIssues = useCallback(
    async (afterIssueId?: string) => {
      const closureCheckId = closureCheck!.closureCheckId;
      setClosureIssuesLoading(true);
      setClosureIssuesError(null);
      const result = await listClosureCheckIssues(closureCheckId, {
        ...(afterIssueId ? { afterIssueId } : {}),
        limit: 50,
      });
      const page = result.data;
      if (result.error || !page) {
        setClosureIssuesError(result.error?.message ?? 'Unable to load issues.');
      } else {
        setClosureIssues((previous) => {
          const rows = new Map<string, ClosureCheckIssueV1>();
          (afterIssueId ? previous : []).forEach((issue) => rows.set(issue.issueId, issue));
          page.issues.forEach((issue) => rows.set(issue.issueId, issue));
          return [...rows.values()];
        });
        setClosureIssuesAfterIssueId(page.nextCursor);
      }
      setClosureIssuesLoading(false);
    },
    [closureCheck?.closureCheckId],
  );

  useEffect(() => {
    if (!closureCheck?.closureCheckId || !['passed', 'blocked'].includes(closureCheck.runStatus)) {
      setClosureIssues([]);
      setClosureIssuesAfterIssueId(undefined);
      setClosureIssuesError(null);
      return;
    }
    void loadClosureIssues();
  }, [closureCheck?.closureCheckId, closureCheck?.runStatus, loadClosureIssues]);

  const visibleBuildJobs = useMemo(() => buildJobs, [buildJobs]);
  const packageOptions = useMemo(
    () => packageOptionsFromTaskSummaries(visibleBuildJobs),
    [visibleBuildJobs],
  );
  const selectedResultSetPackageIds = useMemo(
    () => new Set(packageOptions.map((option) => option.packageId)),
    [packageOptions],
  );
  const visiblePublications = useMemo(
    () =>
      deepLink.resultSetId
        ? publications.filter(
            (publication) =>
              Boolean(publication.packageId) &&
              selectedResultSetPackageIds.has(publication.packageId as string),
          )
        : publications,
    [deepLink.resultSetId, publications, selectedResultSetPackageIds],
  );
  const resultSetOptions = useMemo(
    () =>
      resultSets.map((resultSet) => ({
        label: resultSet.name,
        value: resultSet.resultSetId,
      })),
    [resultSets],
  );
  const closureTaskOptions = useMemo(
    () =>
      closureTasks
        .filter((task) => Boolean(task.closureCheckId))
        .map((task) => ({
          label: `${formatTimestamp(task.updatedAt)} · ${closureDisplayStatus(task.domainStatus ?? task.workerStatus, t)}`,
          value: task.closureCheckId as string,
        })),
    [closureTasks, t],
  );

  useEffect(() => {
    if (activeTabKey === 'preview' && selectedPackageId) {
      previewForm.setFieldsValue?.({ packageId: selectedPackageId });
    }
  }, [activeTabKey, previewForm, selectedPackageId]);

  useEffect(() => {
    if (activeTabKey === 'publication' && selectedPackageId) {
      publishForm.setFieldsValue?.({ packageId: selectedPackageId });
    }
  }, [activeTabKey, publishForm, selectedPackageId]);

  const coverageModeOptions = useMemo(
    () => [
      {
        label: t('pages.dataProcessing.coverage.globalEligible', 'Global eligible'),
        value: 'global_eligible',
      },
      { label: t('pages.dataProcessing.coverage.subset', 'Subset'), value: 'subset' },
    ],
    [t],
  );

  const commandSuccessTitle = (action: CommandAction) => {
    const messages: Record<CommandAction, { defaultMessage: string; id: string }> = {
      createResultSet: {
        id: 'pages.dataProcessing.command.createResultSetSuccess',
        defaultMessage: 'Result set created',
      },
      createClosureCheck: {
        id: 'pages.dataProcessing.command.createClosureCheckSuccess',
        defaultMessage: 'Data completeness check submitted',
      },
      createBuild: {
        id: 'pages.dataProcessing.command.createBuildSuccess',
        defaultMessage: 'Result generation request submitted',
      },
      previewPackage: {
        id: 'pages.dataProcessing.command.previewPackageSuccess',
        defaultMessage: 'Result preview loaded',
      },
      publishPackage: {
        id: 'pages.dataProcessing.command.publishPackageSuccess',
        defaultMessage: 'Result set published',
      },
      unpublishPublication: {
        id: 'pages.dataProcessing.command.unpublishPublicationSuccess',
        defaultMessage: 'Publication unpublished',
      },
    };
    return t(messages[action].id, messages[action].defaultMessage);
  };

  const commandSummaryRows = (action: CommandAction, data: unknown): CommandSummaryRow[] => {
    const record = isRecord(data) ? data : null;
    const workerJob = isRecord(record?.workerJob) ? record.workerJob : null;

    const rows: CommandSummaryRow[] = [];
    const addRow = (label: string, value?: string) => {
      if (value) {
        rows.push({ label, value });
      }
    };

    if (action === 'createResultSet') {
      addRow(
        t('pages.dataProcessing.command.resultSetId', 'Result set ID'),
        firstString(record?.resultSetId),
      );
      return rows;
    }

    if (action === 'createClosureCheck') {
      addRow(
        t('pages.dataProcessing.command.closureCheckId', 'Closure check ID'),
        firstString(record?.closureCheckId, record?.closure_check_id, record?.id),
      );
      addRow(
        t('pages.dataProcessing.command.workerJobId', 'Worker job ID'),
        firstString(record?.workerJobId, record?.worker_job_id, workerJob?.jobId),
      );
      return rows;
    }

    if (action === 'createBuild') {
      addRow(
        t('pages.dataProcessing.command.buildId', 'Generation ID'),
        firstString(record?.buildId, record?.build_id, record?.id),
      );
      addRow(
        t('pages.dataProcessing.command.workerJobId', 'Worker job ID'),
        firstString(
          record?.workerJobId,
          record?.worker_job_id,
          workerJob?.id,
          workerJob?.workerJobId,
          workerJob?.worker_job_id,
        ),
      );
      return rows;
    }

    if (action === 'publishPackage') {
      addRow(
        t('pages.dataProcessing.command.publicationId', 'Publication ID'),
        firstString(record?.publicationId, record?.publication_id, record?.id),
      );
      addRow(
        t('pages.dataProcessing.command.packageId', 'Result set ID'),
        firstString(record?.packageId, record?.package_id),
      );
      addRow(t('pages.dataProcessing.command.status', 'Status'), firstString(record?.status));
      return rows;
    }

    addRow(
      t('pages.dataProcessing.command.publicationId', 'Publication ID'),
      firstString(record?.publicationId, record?.publication_id, record?.id),
    );
    addRow(
      t('pages.dataProcessing.command.status', 'Status'),
      firstString(record?.status, typeof data === 'string' ? data : undefined),
    );
    return rows;
  };

  const commandSuccessMessage = (action: CommandAction, data: unknown) => {
    const rows = commandSummaryRows(action, data);

    return (
      <div className={styles.commandMessage}>
        <strong>{commandSuccessTitle(action)}</strong>
        {rows.length > 0 ? (
          <div className={styles.commandMeta}>
            {rows.map((row) => (
              <span key={`${row.label}:${row.value}`} className={styles.commandMetaItem}>
                {row.label}: <code className={styles.commandMetaValue}>{row.value}</code>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const showResult = (
    action: CommandAction,
    result: { data: unknown; error: { message?: string; code?: string } | null },
  ) => {
    if (result.error) {
      const closureErrorMessages: Record<string, string> = {
        closure_check_required: t(
          'pages.dataProcessing.closure.error.required',
          'A closure check is required.',
        ),
        closure_check_not_found: t(
          'pages.dataProcessing.closure.error.notFound',
          'The selected closure check was not found.',
        ),
        closure_check_not_passed: t(
          'pages.dataProcessing.closure.error.notPassed',
          'The closure check has not passed.',
        ),
        closure_check_incomplete: t(
          'pages.dataProcessing.closure.error.incomplete',
          'The closure scan is incomplete.',
        ),
        closure_check_scope_mismatch: t(
          'pages.dataProcessing.closure.error.scopeMismatch',
          'The current selection does not match this closure check.',
        ),
        closure_check_policy_mismatch: t(
          'pages.dataProcessing.closure.error.policyMismatch',
          'The current policy does not match this closure check.',
        ),
        closure_check_stale: t(
          'pages.dataProcessing.closure.error.stale',
          'The closure certificate is stale.',
        ),
        closure_check_revoked: t(
          'pages.dataProcessing.closure.error.revoked',
          'The closure certificate was revoked.',
        ),
        closure_evidence_unavailable: t(
          'pages.dataProcessing.closure.error.evidenceUnavailable',
          'The current public release or snapshot is unavailable; a certificate cannot be issued.',
        ),
        current_release_required: t(
          'pages.dataProcessing.closure.error.currentReleaseRequired',
          'The current public release or snapshot is unavailable; a certificate cannot be issued.',
        ),
        closure_evidence_hash_mismatch: t(
          'pages.dataProcessing.closure.error.evidenceHashMismatch',
          'Closure evidence integrity verification failed.',
        ),
      };
      setCommandStatus({
        kind: 'error',
        message:
          (result.error.code ? closureErrorMessages[result.error.code] : undefined) ??
          result.error.message ??
          t('pages.dataProcessing.command.failed', 'Command failed'),
      });
      return;
    }

    if (action === 'previewPackage') {
      // Read state belongs to the result panel, including partially loaded responses.
      setCommandStatus(null);
      return;
    }
    setCommandStatus({
      kind: 'success',
      message: commandSuccessMessage(action, result.data),
    });
  };

  const runCommand = async <T,>(
    action: CommandAction,
    command: () => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>,
    isCurrent: () => boolean = () => true,
  ) => {
    const commandSequence = ++commandSequenceRef.current;
    setSubmittingAction(action);
    try {
      const result = await command();
      if (!mountedRef.current || commandSequence !== commandSequenceRef.current || !isCurrent())
        return null;
      showResult(action, result);
      return result;
    } catch (error) {
      if (!mountedRef.current || commandSequence !== commandSequenceRef.current || !isCurrent())
        return null;
      setCommandStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      if (commandSequence === commandSequenceRef.current) setSubmittingAction(null);
    }
  };

  const navigateToResultSet = (
    resultSetId: string,
    options: {
      tab?: 'builds' | 'preview' | 'exports' | 'publication';
      closureCheckId?: string;
      packageId?: string;
    } = {},
  ) => {
    const tab = options.tab ?? 'builds';
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('resultSetId', resultSetId);
    searchParams.set('tab', tab);
    ['closureCheckId', 'packageId', 'resultBuildId', 'processId', 'processVersion'].forEach((key) =>
      searchParams.delete(key),
    );
    if (options.closureCheckId) searchParams.set('closureCheckId', options.closureCheckId);
    if (options.packageId) searchParams.set('packageId', options.packageId);
    previewReadGeneration.current++;
    commandSequenceRef.current++;
    setSubmittingAction(null);
    setActiveTabKey(tab);
    setSelectedPackageId(options.packageId);
    setPreviewData(null);
    setResultProcess(null);
    setCommandStatus(null);
    activateClosureCheckId(options.closureCheckId);
    closureCheckRef.current = null;
    setClosureCheck(null);
    setClosureSelectionKey(null);
    history.push({ pathname: location.pathname, search: `?${searchParams.toString()}` });
  };

  const handleCreateResultSet = async () => {
    if (createResultSetInFlightRef.current) return;
    createResultSetInFlightRef.current = true;
    try {
      const values = await resultSetForm.validateFields().catch(() => null);
      if (!values) return;
      const result = await runCommand('createResultSet', () => createLciaResultSet(values.name));
      if (!result?.data || result.error) return;
      const createdResultSet = result.data as LciaResultSetV1;
      setResultSets([
        createdResultSet,
        ...resultSets.filter((item) => item.resultSetId !== createdResultSet.resultSetId),
      ]);
      resultSetForm.resetFields?.();
      setCreateDialogOpen(false);
      navigateToResultSet(result.data.resultSetId);
    } finally {
      createResultSetInFlightRef.current = false;
    }
  };

  const clearResultSetContext = () => {
    previewReadGeneration.current++;
    commandSequenceRef.current++;
    setSubmittingAction(null);
    setActiveTabKey('builds');
    setSelectedPackageId(undefined);
    setPreviewData(null);
    setResultProcess(null);
    setCommandStatus(null);
    activateClosureCheckId(undefined);
    closureCheckRef.current = null;
    setClosureCheck(null);
    setClosureSelectionKey(null);
    const params = new URLSearchParams(location.search);
    [
      'resultSetId',
      'closureCheckId',
      'packageId',
      'resultBuildId',
      'processId',
      'processVersion',
      'tab',
    ].forEach((key) => params.delete(key));
    history.push({ pathname: location.pathname, search: params.size ? `?${params}` : '' });
  };

  const handleResultSetAction = (
    resultSet: LciaResultSetV1,
    summary = deriveResultSetWorkflowSummary(resultSet.resultSetId, dataProductTasks, publications),
  ) => {
    if (summary.nextAction === 'preview') {
      navigateToResultSet(resultSet.resultSetId, {
        tab: 'preview',
        packageId: summary.packageId,
      });
      return;
    }
    if (summary.nextAction === 'view_publication') {
      navigateToResultSet(resultSet.resultSetId, {
        tab: 'publication',
        packageId: summary.packageId,
      });
      return;
    }
    navigateToResultSet(resultSet.resultSetId, {
      tab: 'builds',
      closureCheckId: summary.closureCheckId,
    });
  };

  const handleSelectClosureCheck = (closureCheckId: string) => {
    navigateToResultSet(deepLink.resultSetId!, { tab: 'builds', closureCheckId });
  };

  const handleCreateBuild = async () => {
    const taskGeneration = getDataProductTaskGeneration();
    const taskOwnerId = getDataProductTaskOwnerId();
    const values = await buildForm.validateFields();
    if (
      !taskOwnerId ||
      taskGeneration === null ||
      taskGeneration !== getDataProductTaskGeneration()
    )
      return;
    const selectionKey = scopeSelectionKey(values, impactCategoryOptions);
    const lciaMethodSet = reviewedLciaMethodSet(impactCategoryOptions);
    if (lciaMethodSet.length === 0) {
      setCommandStatus({
        kind: 'error',
        message: t(
          'pages.dataProcessing.validation.methodCatalogUnavailable',
          'The reviewed LCIA method catalog is unavailable.',
        ),
      });
      return;
    }
    const closureIsUsable =
      closureCheck?.runStatus === 'passed' &&
      closureCheck.certificateValidity === 'valid' &&
      closureCheck.scanCompleteness === 'complete' &&
      closureSelectionKey === selectionKey;
    if (!closureIsUsable || !closureCheck?.requestedScopeHash || !closureCheck.policyFingerprint) {
      setCommandStatus({
        kind: 'error',
        message: t(
          'pages.dataProcessing.closure.buildRequiresValidCertificate',
          'Run a complete data check for the current selection before generating a result set.',
        ),
      });
      return;
    }
    const isCurrent = () => taskGeneration === getDataProductTaskGeneration();
    const result = await runCommand(
      'createBuild',
      () =>
        createLciaResultBuildRequest(
          {
            name: selectedResultSet?.name ?? values.name,
            coverageMode: values.coverageMode || 'global_eligible',
            ...(values.defaultImpactCategory
              ? { defaultImpactCategory: values.defaultImpactCategory }
              : {}),
            lciaMethodSet,
            closureCheckId: closureCheck.closureCheckId,
            requestedScopeHash: closureCheck.requestedScopeHash,
            policyFingerprint: closureCheck.policyFingerprint,
          },
          {
            taskSession: {
              ownerId: taskOwnerId,
              isCurrent,
            },
          },
        ),
      isCurrent,
    );

    if (taskGeneration !== getDataProductTaskGeneration()) return;
    if (result && !result.error) {
      const submittedTask = createSubmittedBuildTask(result.data);
      if (submittedTask) {
        upsertDataProductTasks([submittedTask], taskGeneration);
      }
      void loadBuildJobs();
    }
  };

  const handleRecoverClosureCheck = async () => {
    if (recoveryInFlightRef.current) return;
    recoveryInFlightRef.current = true;
    setRecoveryLoading(true);
    try {
      const values = await buildForm.validateFields(['coverageMode', 'defaultImpactCategory']);
      const lciaMethods = reviewedLciaMethodSet(impactCategoryOptions);
      if (lciaMethods.length === 0) {
        setCommandStatus({
          kind: 'error',
          message: t(
            'pages.dataProcessing.validation.methodCatalogUnavailable',
            'The reviewed LCIA method catalog is unavailable.',
          ),
        });
        return;
      }
      const selectionKey = scopeSelectionKey(values, impactCategoryOptions);
      const result = await runCommand('createClosureCheck', () =>
        createClosureCheck({
          ...(deepLink.resultSetId ? { resultSetId: deepLink.resultSetId } : {}),
          requestedScope: {
            coverageMode: values.coverageMode || 'global_eligible',
            lciaMethods,
          },
          requestIdempotencyToken: newIdempotencyToken(),
        }),
      );
      if (result && !result.error && result.data) {
        const closureCheckId = result.data.closureCheckId;
        activateClosureCheckId(closureCheckId);
        const searchParams = new URLSearchParams(location.search);
        searchParams.set('tab', 'builds');
        if (deepLink.resultSetId) searchParams.set('resultSetId', deepLink.resultSetId);
        searchParams.set('closureCheckId', closureCheckId);
        history.replace({
          pathname: location.pathname,
          search: `?${searchParams.toString()}`,
        });
        const summary = await refreshClosureCheck(closureCheckId);
        if (activeClosureCheckIdRef.current !== closureCheckId) return;
        if (summary.error || !summary.data) {
          setCommandStatus({
            kind: 'error',
            message:
              summary.error?.message ?? t('pages.dataProcessing.command.failed', 'Command failed'),
          });
          return;
        }
        setClosurePrerequisiteUnavailable(false);
        setClosureSelectionKey(selectionKey);
        setCurrentSelectionKey(selectionKey);
        void loadBuildJobs();
      } else if (
        result?.error?.code === 'current_release_required' ||
        result?.error?.code === 'closure_evidence_unavailable'
      ) {
        // This is an execution-environment prerequisite, not a data-quality
        // blocker.  A formerly displayed certificate must not keep result
        // generation enabled after the server says current evidence is absent.
        activateClosureCheckId(undefined);
        closureCheckRef.current = null;
        setClosureCheck(null);
        setClosureSelectionKey(null);
        setClosurePrerequisiteUnavailable(true);
      }
    } finally {
      recoveryInFlightRef.current = false;
      if (mountedRef.current) setRecoveryLoading(false);
    }
  };

  const previewPackageById = async (
    packageId: string,
    options: {
      impactCategoryId?: string;
      rowOffset: number;
      rowLimit?: number;
    },
  ) => {
    const generation = ++previewReadGeneration.current;
    const route = previewRouteRef.current;
    setSelectedPackageId(packageId);
    if (deepLink.resultSetId) {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('resultSetId', deepLink.resultSetId);
      searchParams.set('tab', 'preview');
      searchParams.set('packageId', packageId);
      history.replace({ pathname: location.pathname, search: `?${searchParams.toString()}` });
    }
    const rowOffset = options.rowOffset;
    const rowLimit = options.rowLimit ?? previewPageSizeRef.current;
    previewPageSizeRef.current = rowLimit;
    const impactCategoryId = options.impactCategoryId ?? previewImpactCategoryId;
    const result = await runCommand(
      'previewPackage',
      () =>
        previewLciaResultPackage({
          packageId,
          rowOffset,
          rowLimit,
          ...(impactCategoryId ? { impactCategoryId } : {}),
        }),
      () => generation === previewReadGeneration.current && route === previewRouteRef.current,
    );
    if (
      !mountedRef.current ||
      generation !== previewReadGeneration.current ||
      route !== previewRouteRef.current
    )
      return null;
    const nextPreviewData = result?.error
      ? null
      : ((result?.data ?? null) as Record<string, any> | null);
    setPreviewData(nextPreviewData);
    if (nextPreviewData) {
      const detailPage = isRecord(nextPreviewData.detailPage) ? nextPreviewData.detailPage : {};
      const resolvedImpactCategoryId = firstString(
        detailPage.impactCategoryId,
        nextPreviewData.summary?.defaultImpactCategory,
        impactCategoryId,
      );
      setPreviewImpactCategoryId(resolvedImpactCategoryId);
    }
    return result;
  };

  useEffect(() => {
    setPreviewData(null);
    previewPageSizeRef.current = previewPageSize;
    setPreviewImpactCategoryId(undefined);
    setCommandStatus(null);
    setSelectedPackageId(deepLink.packageId);
    if (!isAuthorized || !deepLink.packageId || (deepLink.resultSetId && !selectedResultSet))
      return;
    const generation = ++previewReadGeneration.current;
    let cancelled = false;
    setSubmittingAction('previewPackage');
    void previewLciaResultPackage({
      packageId: deepLink.packageId,
      rowOffset: 0,
      rowLimit: previewPageSize,
    })
      .then((result) => {
        if (cancelled || generation !== previewReadGeneration.current) return;
        setPreviewData(result.error ? null : result.data);
        setPreviewImpactCategoryId(
          result.error
            ? undefined
            : firstString(
                isRecord(result.data?.detailPage) && result.data.detailPage.impactCategoryId,
                isRecord(result.data?.summary) && result.data.summary.defaultImpactCategory,
              ),
        );
        if (result.error) setCommandStatus({ kind: 'error', message: result.error.message });
      })
      .catch((error) => {
        if (!cancelled && generation === previewReadGeneration.current)
          setCommandStatus({ kind: 'error', message: String(error) });
      })
      .finally(() => {
        if (!cancelled && generation === previewReadGeneration.current) setSubmittingAction(null);
      });
    return () => {
      cancelled = true;
      previewReadGeneration.current++;
    };
  }, [isAuthorized, deepLink.resultSetId, deepLink.packageId, selectedResultSet?.resultSetId]);

  const handlePreviewPackage = async () => {
    const values = await previewForm.validateFields();
    setPreviewImpactCategoryId(undefined);
    await previewPackageById(values.packageId, { rowOffset: 0 });
  };

  const handlePreviewPackageFromJob = async (option: LciaResultPackageOption) => {
    setActiveTabKey('preview');
    setCommandStatus(null);
    setPreviewImpactCategoryId(undefined);
    await previewPackageById(option.packageId, { rowOffset: 0 });
  };

  const handlePublishPackage = async () => {
    const values = await publishForm.validateFields();
    const result = await runCommand('publishPackage', () =>
      publishLciaResultPackage({
        packageId: values.packageId,
        displayDefaultImpactCategory: values.displayDefaultImpactCategory,
        ...(values.reason ? { reason: values.reason } : {}),
      }),
    );
    if (result && !result.error) {
      void loadPublications();
    }
  };

  const handleUnpublishPublication = async (publicationId: string) => {
    const result = await runCommand('unpublishPublication', () =>
      unpublishLciaResultPublication({
        publicationId,
      }),
    );
    if (result && !result.error) {
      void loadPublications();
    }
  };

  const handleTabChange = (key: string) => {
    setActiveTabKey(key);
    setCommandStatus(null);
    if (key === 'publication' && !publicationsLoading && publications.length === 0) {
      void loadPublications();
    }
    const queryValue = resolveRouteViewState('data-processing-tab', key);
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', queryValue);
    history.replace({
      pathname: location.pathname,
      search: `?${searchParams.toString()}`,
    });
  };

  const renderCommandStatus = () =>
    commandStatus ? (
      <Alert
        title={commandStatus.message}
        type={commandStatus.kind === 'success' ? 'success' : 'error'}
      />
    ) : null;

  const renderJobProgress = (job: TaskSummaryV2) => (
    <Progress percent={taskProgressPercent(job)} showInfo={false} />
  );

  const renderJobPhase = (phase: string | null | undefined) =>
    phase === submittedBuildPendingPhase
      ? t('pages.dataProcessing.jobs.waitingForWorker', 'Waiting for worker processing')
      : null;

  const renderBuildJobs = () => (
    <Card
      title={t('pages.dataProcessing.jobs.title', 'Result generation tasks')}
      extra={
        <Button onClick={loadBuildJobs} loading={buildJobsLoading}>
          {t('pages.dataProcessing.jobs.refresh', 'Refresh jobs')}
        </Button>
      }
    >
      <Spin spinning={buildJobsLoading}>
        <Space orientation='vertical' size='small' className={styles.jobList}>
          <div className={styles.jobHint}>
            {t(
              'pages.dataProcessing.jobs.hint',
              'Result set generation runs asynchronously. Refresh tasks to update progress, then preview or publish the result set after completion.',
            )}
          </div>
          {buildJobsError ? <Alert title={buildJobsError} type='error' /> : null}
          {visibleBuildJobs.length === 0 ? (
            <div className={styles.emptyJobs} data-testid='data-product-jobs-empty'>
              {t('pages.dataProcessing.jobs.empty', 'No result generation tasks')}
            </div>
          ) : (
            <div className={styles.jobTable} role='table'>
              <div className={styles.jobTableHeader} role='row'>
                <span role='columnheader'>
                  {t('pages.dataProcessing.jobs.resultSet', 'Result set')}
                </span>
                <span role='columnheader'>
                  {t('pages.dataProcessing.command.status', 'Status')}
                </span>
                <span role='columnheader'>
                  {t('pages.dataProcessing.jobs.packageInputs', 'Inputs')}
                </span>
                <span role='columnheader'>
                  {t('pages.dataProcessing.jobs.updatedAt', 'Updated at')}
                </span>
                <span role='columnheader'>{t('pages.dataProcessing.jobs.action', 'Action')}</span>
              </div>
              {visibleBuildJobs.map((job) => {
                const jobId = job.jobId;
                const packageOption = packageOptionFromTaskSummary(job);
                const packageInputs = packageOption ? packageCountLabel(packageOption) : undefined;
                const failureSummary = job.errorSummary;
                const resultSetLabel =
                  job.title ||
                  t('pages.dataProcessing.jobs.pendingResultSet', 'Result set generation');
                const jobPhaseLabel = renderJobPhase(job.phase);
                const previewPackageLabel = t(
                  'pages.dataProcessing.action.previewPackage',
                  'Preview result set',
                );

                return (
                  <section
                    key={jobId}
                    className={styles.jobTableRow}
                    data-testid={`data-product-job-${jobId}`}
                    role='row'
                  >
                    <div className={styles.jobTableCell} role='cell'>
                      <strong>{resultSetLabel}</strong>
                      {jobPhaseLabel ? (
                        <span className={styles.jobSecondary}>{jobPhaseLabel}</span>
                      ) : null}
                      {renderJobProgress(job)}
                    </div>
                    <div className={styles.jobTableCell} role='cell'>
                      {renderStatusIcon(job.workerStatus, failureSummary ?? undefined)}
                    </div>
                    <div className={styles.jobTableCell} role='cell'>
                      {packageInputs ?? '-'}
                    </div>
                    <div className={styles.jobTableCell} role='cell'>
                      {formatTimestamp(job.updatedAt)}
                    </div>
                    <div className={styles.jobTableCell} role='cell'>
                      {packageOption ? (
                        <Tooltip title={previewPackageLabel}>
                          <Button
                            type='text'
                            size='small'
                            className={styles.iconActionButton}
                            icon={<EyeOutlined />}
                            aria-label={previewPackageLabel}
                            onClick={() => handlePreviewPackageFromJob(packageOption)}
                          />
                        </Tooltip>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Space>
      </Spin>
    </Card>
  );

  const renderImpactCategorySelect = (ariaLabel: string) => (
    <Select
      aria-label={ariaLabel}
      allowClear
      showSearch={{ optionFilterProp: 'label' }}
      options={impactCategoryOptions}
      placeholder={t(
        'pages.dataProcessing.form.defaultImpactCategory.placeholder',
        'Select an impact category',
      )}
    />
  );

  const renderPackageSelect = (ariaLabel: string) => (
    <Select
      aria-label={ariaLabel}
      disabled={packageOptions.length === 0}
      showSearch={{ optionFilterProp: 'label' }}
      options={packageOptions}
      placeholder={t(
        'pages.dataProcessing.form.packageSelect.placeholder',
        'Select a preview-ready result set',
      )}
    />
  );

  const isWorkspace = Boolean(
    deepLink.resultSetId || deepLink.closureCheckId || deepLink.packageId,
  );
  const renderResultSetWorkspace = () =>
    isWorkspace ? (
      <Space orientation='vertical' className={styles.resultSetWorkspaceContent}>
        <div className={styles.resultSetToolbar}>
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={clearResultSetContext}>
              {t('pages.dataProcessing.resultSets.backToList', 'Back to result sets')}
            </Button>
            <Typography.Title
              level={4}
              className={styles.workspaceTitle}
              data-testid={
                selectedResultSet ? `data-processing-result-set-${deepLink.resultSetId}` : undefined
              }
            >
              {selectedResultSet?.name ?? t('pages.dataProcessing.resultSets.title', 'Result sets')}
            </Typography.Title>
          </Space>
          <Select
            aria-label={t('pages.dataProcessing.resultSets.select', 'Current result set')}
            className={styles.resultSetSelector}
            value={deepLink.resultSetId}
            showSearch={{ optionFilterProp: 'label' }}
            options={resultSetOptions}
            onChange={(id) => {
              const resultSet = resultSets.find((item) => item.resultSetId === id);
              if (resultSet) handleResultSetAction(resultSet);
            }}
          />
        </div>
        {resultSetContextError || resultSetsError ? (
          <Alert
            type='error'
            title={resultSetContextError ?? resultSetsError}
            action={
              <Button onClick={loadResultSets}>
                {t('pages.dataProcessing.resultSets.refresh', 'Refresh')}
              </Button>
            }
          />
        ) : null}
      </Space>
    ) : (
      <ResultSetDirectory
        resultSets={resultSets}
        tasks={dataProductTasks}
        publications={publications}
        loading={resultSetsLoading}
        error={resultSetsError}
        search={location.search}
        onQueryChange={(search) => history.replace({ pathname: location.pathname, search })}
        onOpen={handleResultSetAction}
        onCreate={() => setCreateDialogOpen(true)}
        onRefresh={loadResultSets}
      />
    );

  const hasWorkflowContext = deepLink.resultSetId
    ? Boolean(selectedResultSet || resultSetsLoading)
    : Boolean(deepLink.closureCheckId || deepLink.packageId);
  const renderWorkflowContextRequired = (content: ReactNode) =>
    hasWorkflowContext ? (
      content
    ) : (
      <Card className={styles.workflowEmpty}>
        <Space orientation='vertical' size='small'>
          <Typography.Text strong>
            {t(
              'pages.dataProcessing.resultSets.selectToContinue',
              'Select a result set to continue',
            )}
          </Typography.Text>
          <Typography.Text type='secondary'>
            {t(
              'pages.dataProcessing.resultSets.selectToContinueDescription',
              'The selected result set keeps completeness checks, calculations, previews, and publication in one recoverable context.',
            )}
          </Typography.Text>
        </Space>
      </Card>
    );

  const renderBuildRequests = () => (
    <Space orientation='vertical' size='middle' className={styles.workbenchPanel}>
      {packageOptions.length > 0 ? (
        <Alert
          type='info'
          title={t(
            'pages.dataProcessing.resultView.existing',
            'Calculated results are available. The form below starts a new calculation; existing results remain available in Result preview.',
          )}
          action={
            <Button onClick={() => handleTabChange('preview')}>
              {t('pages.dataProcessing.resultView.open', 'View results')}
            </Button>
          }
        />
      ) : null}
      <Card>
        <Form
          form={buildForm}
          initialValues={{
            coverageMode: 'global_eligible',
          }}
          onValuesChange={(_changedValues, allValues) => {
            setCurrentSelectionKey(scopeSelectionKey(allValues, impactCategoryOptions));
          }}
        >
          <Form.Item
            label={t('pages.dataProcessing.form.packageName', 'Result set name')}
            name='name'
            rules={[
              {
                required: true,
                message: t(
                  'pages.dataProcessing.validation.packageNameRequired',
                  'Result set name is required',
                ),
              },
            ]}
          >
            <Input
              aria-label={t('pages.dataProcessing.form.packageName', 'Result set name')}
              disabled={Boolean(selectedResultSet)}
            />
          </Form.Item>
          <Form.Item
            label={t('pages.dataProcessing.form.coverageMode', 'Coverage mode')}
            name='coverageMode'
          >
            <Select
              aria-label={t('pages.dataProcessing.form.coverageMode', 'Coverage mode')}
              options={coverageModeOptions}
            />
          </Form.Item>
          <Form.Item
            label={t('pages.dataProcessing.form.defaultImpactCategory', 'Default impact category')}
            name='defaultImpactCategory'
          >
            {renderImpactCategorySelect(
              t('pages.dataProcessing.form.defaultImpactCategory', 'Default impact category'),
            )}
          </Form.Item>
          <Card
            size='small'
            title={t('pages.dataProcessing.closure.title', 'Data completeness preflight')}
            className={styles.closureCard}
          >
            <Space orientation='vertical' size='small'>
              {deepLink.resultSetId && closureTaskOptions.length > 0 ? (
                <Space wrap className={styles.closureHistoryToolbar}>
                  <Typography.Text>
                    {t('pages.dataProcessing.closure.history', 'Check history')}
                  </Typography.Text>
                  <Select
                    aria-label={t('pages.dataProcessing.closure.history', 'Check history')}
                    className={styles.closureHistorySelect}
                    value={closureCheck?.closureCheckId ?? selectedClosureCheckId}
                    options={closureTaskOptions}
                    onChange={handleSelectClosureCheck}
                  />
                </Space>
              ) : null}
              {!closureCheck ? (
                <Alert
                  type='info'
                  title={t(
                    'pages.dataProcessing.closure.notChecked',
                    'Check data completeness before generation.',
                  )}
                />
              ) : (
                <Descriptions
                  size='small'
                  column={1}
                  bordered
                  items={[
                    {
                      key: 'status',
                      label: t('pages.dataProcessing.closure.status', 'Check status'),
                      children: closureDisplayStatus(closureCheck.runStatus, t),
                    },
                    {
                      key: 'certificate',
                      label: t('pages.dataProcessing.closure.certificate', 'Certificate'),
                      children: closureDisplayStatus(closureCheck.certificateValidity, t),
                    },
                    {
                      key: 'completeness',
                      label: t('pages.dataProcessing.closure.completeness', 'Scan completeness'),
                      children: closureDisplayStatus(closureCheck.scanCompleteness, t),
                    },
                    {
                      key: 'issues',
                      label: t('pages.dataProcessing.closure.issues', 'Issues'),
                      children: intl.formatMessage(
                        {
                          id: 'pages.dataProcessing.resultView.blockers',
                          defaultMessage: '{count} blocking issues',
                        },
                        { count: closureCheck.blockerCodes?.length ?? 0 },
                      ),
                    },
                  ]}
                />
              )}
              {closureCheck && closureSelectionKey !== currentSelectionKey ? (
                <Alert
                  type='warning'
                  title={t(
                    'pages.dataProcessing.closure.scopeMismatch',
                    'The current selection differs from this check. Run a new check before generating.',
                  )}
                />
              ) : null}
              {closureCheck?.runStatus === 'failed' ? (
                <Alert
                  type='error'
                  title={
                    <Space orientation='vertical' size={2}>
                      <strong>
                        {t(
                          'pages.dataProcessing.closure.executionFailed',
                          'Data completeness check failed to run',
                        )}
                      </strong>
                      <span>
                        {closureTask?.errorSummary ??
                          t(
                            'pages.dataProcessing.closure.executionFailedFallback',
                            'The check did not complete. Retry it; if it fails again, contact an administrator with the identifiers below.',
                          )}
                      </span>
                      {closureCheck.workerJob?.errorCode ? (
                        <span>
                          {`${t(
                            'pages.dataProcessing.closure.errorCode',
                            'Error code',
                          )}: ${closureCheck.workerJob.errorCode}`}
                        </span>
                      ) : null}
                      {closureCheck.workerJob?.jobId ? (
                        <span>
                          {`${t(
                            'pages.dataProcessing.closure.workerJobId',
                            'Worker job ID',
                          )}: ${closureCheck.workerJob.jobId}`}
                        </span>
                      ) : null}
                    </Space>
                  }
                />
              ) : closureCheck?.runStatus === 'cancelled' ? (
                <Alert
                  type='warning'
                  title={t(
                    'pages.dataProcessing.closure.executionCancelled',
                    'Data completeness check was cancelled. Run a new check to continue.',
                  )}
                />
              ) : closureCheck && ['queued', 'running'].includes(closureCheck.runStatus) ? (
                <Alert
                  type='info'
                  title={t(
                    'pages.dataProcessing.closure.executionPending',
                    'The check is still running. Closure issues will be available after it completes.',
                  )}
                />
              ) : null}
              {closureCheck && ['passed', 'blocked'].includes(closureCheck.runStatus) ? (
                <div className={styles.closureIssues} data-testid='closure-issues'>
                  <strong>{t('pages.dataProcessing.closure.issueList', 'Closure issues')}</strong>
                  {closureIssuesError ? <Alert type='error' title={closureIssuesError} /> : null}
                  {!closureIssuesLoading && !closureIssuesError && closureIssues.length === 0 ? (
                    <div>
                      {t('pages.dataProcessing.closure.issuesEmpty', 'No closure issues found.')}
                    </div>
                  ) : null}
                  {closureIssues.map((issue) => (
                    <div key={issue.issueId} data-testid={`closure-issue-${issue.issueId}`}>
                      <strong>
                        {issue.code === 'matrix_readiness_singular_risk_medium'
                          ? t(
                              'pages.dataProcessing.resultView.matrixReview',
                              'Review calculation matrix stability',
                            )
                          : issue.title}
                      </strong>
                      <span>{` · ${closureDisplayStatus(issue.severity, t)}`}</span>
                      {issue.code === 'matrix_readiness_singular_risk_medium' ? (
                        <div>
                          {t(
                            'pages.dataProcessing.resultView.matrixReviewDetail',
                            'The preflight detected a medium matrix singularity risk. Review process connections and the issue report; follow the check status before starting calculation.',
                          )}
                        </div>
                      ) : (
                        <>
                          {issue.summary ? <div>{issue.summary}</div> : null}
                          {issue.suggestedAction ? <div>{issue.suggestedAction}</div> : null}
                        </>
                      )}
                      <Collapse
                        size='small'
                        items={[
                          {
                            key: 'diagnostic',
                            label: t(
                              'pages.dataProcessing.workspace.evidence',
                              'Technical evidence',
                            ),
                            children: (
                              <Space orientation='vertical'>
                                <code>{issue.code}</code>
                                {issue.code === 'matrix_readiness_singular_risk_medium' ? (
                                  <>
                                    <span>{issue.summary}</span>
                                    <span>{issue.suggestedAction}</span>
                                  </>
                                ) : null}
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </div>
                  ))}
                  {closureIssuesAfterIssueId ? (
                    <Button
                      loading={closureIssuesLoading}
                      onClick={() => void loadClosureIssues(closureIssuesAfterIssueId)}
                    >
                      {t('pages.dataProcessing.closure.loadMoreIssues', 'Load more issues')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {closureCheck ? (
                <ClosureArtifactList
                  artifactClassName={styles.closureArtifact}
                  canDownloadReport
                  className={styles.closureArtifacts}
                  closureCheck={closureCheck}
                  onDownloadError={(messageText) =>
                    setCommandStatus({ kind: 'error', message: messageText })
                  }
                  onRerun={handleRecoverClosureCheck}
                  rerunDisabled={recoveryLoading}
                  rerunLoading={recoveryLoading}
                />
              ) : null}
              <Space wrap>
                <Button
                  disabled={recoveryLoading || Boolean(deepLink.resultSetId && !selectedResultSet)}
                  loading={recoveryLoading || submittingAction === 'createClosureCheck'}
                  onClick={handleRecoverClosureCheck}
                >
                  {t('pages.dataProcessing.action.checkCompleteness', 'Check data completeness')}
                </Button>
              </Space>
            </Space>
          </Card>
          <Button
            type='primary'
            loading={submittingAction === 'createBuild'}
            disabled={
              Boolean(deepLink.resultSetId && !selectedResultSet) ||
              closurePrerequisiteUnavailable ||
              closureCheck?.runStatus !== 'passed' ||
              closureCheck?.certificateValidity !== 'valid' ||
              closureCheck?.scanCompleteness !== 'complete' ||
              closureSelectionKey !== currentSelectionKey
            }
            onClick={handleCreateBuild}
          >
            {packageOptions.length > 0
              ? t(
                  'pages.dataProcessing.resultView.recalculate',
                  'Start a new calculation with this check',
                )
              : deepLink.resultSetId
                ? t(
                    'pages.dataProcessing.action.calculateFromCheck',
                    'Use this check to start calculation',
                  )
                : t('pages.dataProcessing.action.createBuild', 'Generate result set')}
          </Button>
        </Form>
      </Card>
      {renderBuildJobs()}
    </Space>
  );

  const previewSummary = isRecord(previewData?.summary) ? previewData.summary : {};
  const previewInputManifest = isRecord(previewData?.inputManifest)
    ? previewData.inputManifest
    : {};
  const previewInputScope = isRecord(previewData?.inputScope) ? previewData.inputScope : {};
  const previewProcesses = unknownArray(previewInputManifest.processes);
  const previewProcessCount =
    numberField(previewInputScope.processCount) || previewProcesses.length;
  const previewSelectionMode = firstString(
    previewInputScope.selectionMode,
    previewInputManifest.selectionMode,
  );
  const previewPredicateVersion = firstString(
    previewInputScope.predicateVersion,
    previewInputManifest.predicateVersion,
  );
  const previewScopeStateCodeCounts = stateCodeCountsFromScope(previewInputScope.stateCodeCounts);
  const previewStateCodeCounts =
    previewScopeStateCodeCounts.length > 0
      ? previewScopeStateCodeCounts
      : stateCodeCountsFromProcesses(previewProcesses);
  const previewQueryArtifact = isRecord(previewData?.queryArtifact)
    ? previewData.queryArtifact
    : {};
  const previewResultArtifact = isRecord(previewData?.resultArtifact)
    ? previewData.resultArtifact
    : {};
  const previewArtifactManifest = isRecord(previewData?.artifactManifest)
    ? previewData.artifactManifest
    : {};
  const previewResultDiagnostics = isRecord(previewArtifactManifest.resultDiagnostics)
    ? previewArtifactManifest.resultDiagnostics
    : {};
  const previewSnapshotBuilder = isRecord(previewArtifactManifest.snapshotBuilder)
    ? previewArtifactManifest.snapshotBuilder
    : {};
  const previewArtifactStorage = [
    previewResultDiagnostics.storage,
    previewResultDiagnostics.persist_mode,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' / ');
  const previewMatrixSummary = summarizeSnapshotMatrix(previewSnapshotBuilder.stdout_tail);
  const previewCoverageSummary = summarizeSnapshotCoverage(previewSnapshotBuilder.stdout_tail);
  const previewDetailPage = isRecord(previewData?.detailPage) ? previewData.detailPage : {};
  const previewDetailRows = recordArray(previewDetailPage.rows);
  const impactCategoryLabelById = new Map(
    impactCategoryOptions.map((option) => [option.value, option.label]),
  );
  const previewImpactOptionRecords = recordArray(previewData?.impactOptions);
  const fallbackPreviewImpactCategoryId = firstString(
    previewDetailPage.impactCategoryId,
    previewDetailPage.impactKey,
  );
  const previewImpactOptions = (
    previewImpactOptionRecords.length > 0
      ? previewImpactOptionRecords
      : fallbackPreviewImpactCategoryId
        ? [
            {
              impactCategoryId: fallbackPreviewImpactCategoryId,
              impactKey: firstString(previewDetailPage.impactKey),
              impactName: firstString(previewDetailPage.impactName),
              impactVersion: firstString(previewDetailPage.impactVersion),
              unit: firstDisplayString(previewDetailPage.unit),
            },
          ]
        : []
  )
    .map((impact) => {
      const value = firstString(impact.impactCategoryId, impact.impactKey) ?? '';
      const localLabel = impactCategoryLabelById.get(value);
      const suffix = [firstString(impact.impactVersion), firstString(impact.unit)]
        .filter(Boolean)
        .join(' / ');
      const label =
        localLabel ??
        [
          firstString(impact.impactName, impact.impactKey, impact.impactCategoryId),
          suffix ? `(${suffix})` : '',
        ]
          .filter(Boolean)
          .join(' ');
      return { value, label };
    })
    .filter((option) => option.value);
  const previewWarnings = recordArray(previewData?.previewWarnings).filter(
    (warning) => firstString(warning.code) !== 'preview_impact_metadata_lookup_failed',
  );
  const previewResultReady = previewDetailPage.status === 'ready';
  const previewResultUnavailableReason = firstString(previewDetailPage.reason);
  const previewDetailTotal = numberField(previewDetailPage.totalCount);
  const previewDetailLimit = numberField(previewDetailPage.limit) || previewPageSizeRef.current;
  const previewDetailOffset = numberField(previewDetailPage.offset);
  const selectedPreviewPackageId = firstString(previewSummary.packageId, selectedPackageId);
  const selectedPreviewImpactCategoryId = firstString(
    previewDetailPage.impactCategoryId,
    previewDetailPage.impactKey,
    previewImpactCategoryId,
  );
  const selectedPreviewImpactLocal = parseImpactCategoryOptionLabel(
    selectedPreviewImpactCategoryId
      ? impactCategoryLabelById.get(selectedPreviewImpactCategoryId)
      : undefined,
  );
  const previewValueUnit =
    firstDisplayString(previewDetailPage.unit) ?? selectedPreviewImpactLocal.unit;
  const previewValueTitle = previewValueUnit
    ? `${t('pages.dataProcessing.preview.value', 'Value')} (${previewValueUnit})`
    : t('pages.dataProcessing.preview.value', 'Value');

  const previewDetailColumns = [
    {
      title: '#',
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 64,
    },
    {
      title: t('pages.dataProcessing.preview.processName', 'Process'),
      dataIndex: 'processName',
      key: 'processName',
      render: (_value: unknown, row: Record<string, unknown>) => {
        const processId = firstString(row.processId);
        const processVersion = firstString(row.processVersion);
        const processName = firstString(row.processName) ?? processId ?? '-';
        if (!processId || !processVersion) {
          return processName;
        }
        const href = processDetailHref(processId, processVersion);
        return (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              history.push(href);
            }}
          >
            {processName}
          </a>
        );
      },
    },
    {
      title: t('pages.dataProcessing.preview.processVersion', 'Version'),
      dataIndex: 'processVersion',
      key: 'processVersion',
      width: 120,
    },
    {
      title: previewValueTitle,
      dataIndex: 'value',
      key: 'value',
      width: 140,
      render: (value: unknown) =>
        value === null || value === undefined || value === ''
          ? t('pages.dataProcessing.preview.valueUnavailable', 'Unavailable')
          : formatBundleNumber(Number(value)),
    },
    {
      title: t('pages.dataProcessing.resultView.details', 'Result details'),
      key: 'details',
      width: 120,
      render: (_: unknown, row: Record<string, unknown>) => (
        <Button
          type='link'
          size='small'
          disabled={!firstString(row.processId) || !firstString(row.processVersion)}
          onClick={() =>
            setResultProcess({
              id: String(row.processId),
              version: String(row.processVersion),
              name: firstString(row.processName),
            })
          }
        >
          {t('pages.dataProcessing.resultView.open', 'View results')}
        </Button>
      ),
    },
  ];

  const reloadPreviewDetailPage = (rowOffset: number, rowLimit = previewDetailLimit) => {
    if (selectedPreviewPackageId) {
      void previewPackageById(selectedPreviewPackageId, {
        impactCategoryId: previewImpactCategoryId,
        rowOffset,
        rowLimit,
      });
    }
  };

  const handlePreviewImpactChange = (impactCategoryId: string) => {
    setPreviewImpactCategoryId(impactCategoryId);
    if (selectedPreviewPackageId) {
      void previewPackageById(selectedPreviewPackageId, {
        impactCategoryId,
        rowOffset: 0,
      });
    }
  };

  const renderArtifactSummary = (title: string, artifact: Record<string, unknown>) => (
    <div className={styles.previewArtifact}>
      <strong>{title}</strong>
      <div className={styles.previewArtifactMeta}>
        <span>{stringifyCommandData(artifact.artifactFormat)}</span>
        <span>{formatArtifactByteSize(artifact.artifactByteSize)}</span>
        <code>{stringifyCommandData(artifact.artifactSha256)}</code>
      </div>
    </div>
  );

  const renderPackagePreview = () => (
    <Space orientation='vertical' size='middle' className={styles.workbenchPanel}>
      {!previewData?.summary || packageOptions.length > 1 ? (
        <Card>
          <Form form={previewForm}>
            <Form.Item
              label={t('pages.dataProcessing.workspace.version', 'Calculation version')}
              name='packageId'
              help={
                packageOptions.length === 0
                  ? t(
                      'pages.dataProcessing.form.packageSelect.empty',
                      'No preview-ready result set yet. Refresh tasks or wait for the worker to complete.',
                    )
                  : undefined
              }
              rules={[
                {
                  required: true,
                  message: t(
                    'pages.dataProcessing.validation.packageIdRequired',
                    'Result set is required',
                  ),
                },
              ]}
            >
              {renderPackageSelect(
                t('pages.dataProcessing.workspace.version', 'Calculation version'),
              )}
            </Form.Item>
            <Button
              type='primary'
              disabled={
                packageOptions.length === 0 || Boolean(deepLink.resultSetId && !selectedResultSet)
              }
              loading={submittingAction === 'previewPackage'}
              onClick={handlePreviewPackage}
            >
              {t('pages.dataProcessing.workspace.loadVersion', 'Load calculation version')}
            </Button>
          </Form>
        </Card>
      ) : null}
      {previewData ? (
        <Space orientation='vertical' size='middle' className={styles.previewDetails}>
          <Drawer
            title={t('pages.dataProcessing.resultView.title', 'Process results')}
            open={Boolean(resultProcess)}
            onClose={() => setResultProcess(null)}
            size='large'
            destroyOnHidden
          >
            {resultProcess ? (
              <CalculationBundlePanel
                key={`${getDataProductTaskOwnerId()}:${selectedPreviewPackageId}:${resultProcess.id}:${resultProcess.version}`}
                packageId={selectedPreviewPackageId as string}
                view='results'
                onOpenExports={() => {
                  setResultProcess(null);
                  handleTabChange('exports');
                }}
                initialProcessId={resultProcess.id}
                initialProcessVersion={resultProcess.version}
                processName={resultProcess.name}
              />
            ) : null}
          </Drawer>
          <Card
            title={t('pages.dataProcessing.preview.resultDetailsTitle', 'Result details')}
            extra={
              <Space size='small' className={styles.previewResultActions}>
                <Button
                  size='small'
                  icon={<DownloadOutlined />}
                  disabled={!previewResultReady || !selectedPreviewPackageId}
                  onClick={() => handleTabChange('exports')}
                >
                  {t('pages.dataProcessing.workspace.exportAll', 'Export all results')}
                </Button>
              </Space>
            }
          >
            <Space orientation='vertical' size='middle' className={styles.previewTableStack}>
              <Space className={styles.previewResultToolbar} size='small'>
                <span>{t('pages.dataProcessing.preview.lciaMethod', 'LCIA method')}</span>
                <Select
                  aria-label={t('pages.dataProcessing.preview.lciaMethod', 'LCIA method')}
                  className={styles.previewResultSelect}
                  value={previewImpactCategoryId}
                  disabled={previewImpactOptions.length === 0}
                  showSearch={{ optionFilterProp: 'label' }}
                  options={previewImpactOptions}
                  onChange={handlePreviewImpactChange}
                />
              </Space>
              {!previewResultReady || previewWarnings.length > 0 ? (
                <Alert
                  type={previewResultReady ? 'warning' : 'error'}
                  showIcon
                  title={
                    previewResultReady
                      ? t(
                          'pages.dataProcessing.preview.warningTitle',
                          'Some preview data could not be loaded',
                        )
                      : t(
                          'pages.dataProcessing.preview.resultUnavailable',
                          'Calculation results are not available for this preview.',
                        )
                  }
                  action={
                    <Button
                      loading={submittingAction === 'previewPackage'}
                      onClick={() => reloadPreviewDetailPage(previewDetailOffset)}
                    >
                      {t('pages.dataProcessing.bundle.retry', 'Retry')}
                    </Button>
                  }
                />
              ) : null}
              <div className={styles.previewTableWrap}>
                <Table
                  size='small'
                  loading={submittingAction === 'previewPackage'}
                  pagination={{
                    ...dataListPagination,
                    className: 'result-preview-pagination',
                    current: Math.floor(previewDetailOffset / previewDetailLimit) + 1,
                    pageSize: previewDetailLimit,
                    total: previewDetailTotal,
                    responsive: true,
                    disabled: submittingAction === 'previewPackage',
                    onChange: (page, pageSize) =>
                      reloadPreviewDetailPage(
                        pageSize === previewDetailLimit ? (page - 1) * pageSize : 0,
                        pageSize,
                      ),
                  }}
                  rowKey={(row: Record<string, unknown>) =>
                    `${stringifyCommandData(row.processId)}:${stringifyCommandData(
                      row.processVersion,
                    )}:${stringifyCommandData(row.impactCategoryId)}:${stringifyCommandData(
                      row.rowNumber,
                    )}`
                  }
                  columns={previewDetailColumns}
                  dataSource={previewDetailRows}
                />
              </div>
            </Space>
          </Card>
          <Collapse
            items={[
              {
                key: 'evidence',
                label: t('pages.dataProcessing.workspace.evidence', 'Technical evidence'),
                children: (
                  <Space orientation='vertical' className={styles.previewDetails}>
                    {previewResultUnavailableReason || previewWarnings.length > 0 ? (
                      <pre className={styles.previewDiagnostics}>
                        {JSON.stringify(
                          {
                            reason: previewResultUnavailableReason,
                            warnings: previewWarnings,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    ) : null}
                    <Card title={t('pages.dataProcessing.preview.inputScopeTitle', 'Input scope')}>
                      <Descriptions
                        bordered
                        size='small'
                        column={1}
                        items={[
                          {
                            key: 'process-count',
                            label: t('pages.dataProcessing.preview.processCount', 'Process count'),
                            children: previewProcessCount,
                          },
                          {
                            key: 'selection-mode',
                            label: t(
                              'pages.dataProcessing.preview.selectionMode',
                              'Selection mode',
                            ),
                            children: stringifyCommandData(previewSelectionMode),
                          },
                          {
                            key: 'predicate-version',
                            label: t(
                              'pages.dataProcessing.preview.predicateVersion',
                              'Predicate version',
                            ),
                            children: stringifyCommandData(previewPredicateVersion),
                          },
                          {
                            key: 'state-codes',
                            label: t('pages.dataProcessing.preview.stateCodes', 'State codes'),
                            children: (
                              <div className={styles.previewTags}>
                                {previewStateCodeCounts.map((item) => (
                                  <span
                                    key={item.stateCode}
                                  >{`${item.stateCode}: ${item.count}`}</span>
                                ))}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </Card>
                    <Card
                      title={t('pages.dataProcessing.preview.summaryTitle', 'Result set overview')}
                    >
                      <Descriptions
                        bordered
                        size='small'
                        column={1}
                        items={[
                          {
                            key: 'package-id',
                            label: t('pages.dataProcessing.preview.packageId', 'Result set ID'),
                            children: stringifyCommandData(previewSummary.packageId),
                          },
                          {
                            key: 'package-version',
                            label: t(
                              'pages.dataProcessing.preview.packageVersion',
                              'Result set version',
                            ),
                            children: stringifyCommandData(previewSummary.packageVersion),
                          },
                          {
                            key: 'status',
                            label: t('pages.dataProcessing.preview.status', 'Status'),
                            children: stringifyCommandData(previewSummary.status),
                          },
                          {
                            key: 'coverage-mode',
                            label: t('pages.dataProcessing.preview.coverageMode', 'Coverage mode'),
                            children: stringifyCommandData(previewSummary.coverageMode),
                          },
                          {
                            key: 'default-impact-category',
                            label: t(
                              'pages.dataProcessing.preview.defaultImpactCategory',
                              'Default impact category',
                            ),
                            children: stringifyCommandData(previewSummary.defaultImpactCategory),
                          },
                          {
                            key: 'input-manifest-hash',
                            label: t(
                              'pages.dataProcessing.preview.inputManifestHash',
                              'Input manifest hash',
                            ),
                            children: stringifyCommandData(previewSummary.inputManifestHash),
                          },
                          {
                            key: 'included-inputs',
                            label: t(
                              'pages.dataProcessing.preview.includedInputs',
                              'Included inputs',
                            ),
                            children: stringifyCommandData(previewSummary.includedInputCount),
                          },
                          {
                            key: 'eligible-inputs',
                            label: t(
                              'pages.dataProcessing.preview.eligibleInputs',
                              'Eligible inputs',
                            ),
                            children: stringifyCommandData(previewSummary.eligibleInputCount),
                          },
                          {
                            key: 'impact-categories',
                            label: t(
                              'pages.dataProcessing.preview.impactCategories',
                              'Impact category count',
                            ),
                            children: Array.isArray(previewSummary.availableImpactCategories)
                              ? previewSummary.availableImpactCategories.length
                              : '-',
                          },
                        ]}
                      />
                    </Card>
                    <Card
                      title={t(
                        'pages.dataProcessing.preview.artifactVerificationTitle',
                        'Artifact verification',
                      )}
                    >
                      <Descriptions
                        bordered
                        size='small'
                        column={1}
                        items={[
                          {
                            key: 'manifest-version',
                            label: t(
                              'pages.dataProcessing.preview.artifactManifestVersion',
                              'Manifest version',
                            ),
                            children: stringifyCommandData(
                              previewArtifactManifest.artifactManifestVersion,
                            ),
                          },
                          {
                            key: 'storage',
                            label: t('pages.dataProcessing.preview.storage', 'Storage'),
                            children: previewArtifactStorage || '-',
                          },
                          {
                            key: 'snapshot-id',
                            label: t('pages.dataProcessing.preview.snapshotId', 'Snapshot ID'),
                            children: stringifyCommandData(
                              firstString(
                                previewSummary.snapshotId,
                                isRecord(previewArtifactManifest.snapshotSource)
                                  ? previewArtifactManifest.snapshotSource.snapshotId
                                  : undefined,
                                previewSnapshotBuilder.resolved_snapshot_id,
                              ),
                            ),
                          },
                          {
                            key: 'snapshot-matrix',
                            label: t(
                              'pages.dataProcessing.preview.snapshotMatrix',
                              'Snapshot matrix',
                            ),
                            children: stringifyCommandData(previewMatrixSummary),
                          },
                          {
                            key: 'snapshot-coverage',
                            label: t(
                              'pages.dataProcessing.preview.snapshotCoverage',
                              'Snapshot coverage',
                            ),
                            children: stringifyCommandData(previewCoverageSummary),
                          },
                          {
                            key: 'artifacts',
                            label: t('pages.dataProcessing.preview.artifacts', 'Artifacts'),
                            children: (
                              <Space
                                orientation='vertical'
                                size='small'
                                className={styles.previewArtifactList}
                              >
                                {renderArtifactSummary(
                                  t('pages.dataProcessing.preview.queryArtifact', 'Query artifact'),
                                  previewQueryArtifact,
                                )}
                                {renderArtifactSummary(
                                  t(
                                    'pages.dataProcessing.preview.resultArtifact',
                                    'Result artifact',
                                  ),
                                  previewResultArtifact,
                                )}
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </Card>
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      ) : null}
    </Space>
  );

  const renderPublication = () => (
    <Space orientation='vertical' size='middle' className={styles.workbenchPanel}>
      <LcaReleaseReadPanel
        processId={deepLink.processId}
        processVersion={deepLink.processVersion}
      />
      <Card title={t('pages.dataProcessing.publications.legacyTitle', 'Legacy LCIA publication')}>
        <Form form={publishForm}>
          <Form.Item
            label={t('pages.dataProcessing.form.publishPackageId', 'Publish result set')}
            name='packageId'
            help={
              packageOptions.length === 0
                ? t(
                    'pages.dataProcessing.form.packageSelect.empty',
                    'No preview-ready result set yet. Refresh tasks or wait for the worker to complete.',
                  )
                : undefined
            }
            rules={[
              {
                required: true,
                message: t(
                  'pages.dataProcessing.validation.packageIdRequired',
                  'Result set is required',
                ),
              },
            ]}
          >
            {renderPackageSelect(
              t('pages.dataProcessing.form.publishPackageId', 'Publish result set'),
            )}
          </Form.Item>
          <Form.Item
            label={t(
              'pages.dataProcessing.form.publishDefaultImpactCategory',
              'Publish default impact category',
            )}
            name='displayDefaultImpactCategory'
            rules={[
              {
                required: true,
                message: t(
                  'pages.dataProcessing.validation.defaultImpactCategoryRequired',
                  'Default impact category is required',
                ),
              },
            ]}
          >
            {renderImpactCategorySelect(
              t(
                'pages.dataProcessing.form.publishDefaultImpactCategory',
                'Publish default impact category',
              ),
            )}
          </Form.Item>
          <Form.Item
            label={t('pages.dataProcessing.form.publishReason', 'Publish reason')}
            name='reason'
          >
            <Input aria-label={t('pages.dataProcessing.form.publishReason', 'Publish reason')} />
          </Form.Item>
          <Button
            type='primary'
            disabled={Boolean(deepLink.resultSetId && !selectedResultSet)}
            loading={submittingAction === 'publishPackage'}
            onClick={handlePublishPackage}
          >
            {t('pages.dataProcessing.action.publishPackage', 'Publish result set')}
          </Button>
        </Form>
      </Card>
      <Card
        title={t('pages.dataProcessing.publications.title', 'Publication management')}
        extra={
          <Button onClick={loadPublications} loading={publicationsLoading}>
            {t('pages.dataProcessing.publications.refresh', 'Refresh publications')}
          </Button>
        }
      >
        <Spin spinning={publicationsLoading}>
          <Space orientation='vertical' size='small' className={styles.publicationList}>
            {publicationsError ? <Alert title={publicationsError} type='error' /> : null}
            {visiblePublications.length === 0 ? (
              <div className={styles.emptyJobs} data-testid='data-product-publications-empty'>
                {t('pages.dataProcessing.publications.empty', 'No publications yet')}
              </div>
            ) : (
              <div className={styles.publicationTable} role='table'>
                <div className={styles.publicationTableHeader} role='row'>
                  <span role='columnheader'>
                    {t('pages.dataProcessing.jobs.resultSet', 'Result set')}
                  </span>
                  <span role='columnheader'>
                    {t('pages.dataProcessing.command.status', 'Status')}
                  </span>
                  <span role='columnheader'>
                    {t(
                      'pages.dataProcessing.form.publishDefaultImpactCategory',
                      'Publish default impact category',
                    )}
                  </span>
                  <span role='columnheader'>
                    {t('pages.dataProcessing.publications.publishedAt', 'Published at')}
                  </span>
                  <span role='columnheader'>
                    {t('pages.dataProcessing.jobs.packageInputs', 'Inputs')}
                  </span>
                  <span role='columnheader'>{t('pages.dataProcessing.jobs.action', 'Action')}</span>
                </div>
                {visiblePublications.map((publication, index) => {
                  const publicationId = firstString(
                    publication.publicationId,
                    (publication as { id?: unknown }).id,
                  );
                  const resultSetLabel =
                    firstString(
                      publication.packageName,
                      publication.packageVersion,
                      publication.packageId,
                    ) ?? '-';
                  const inputCount =
                    publication.includedInputCount !== undefined ||
                    publication.eligibleInputCount !== undefined
                      ? `${stringifyCommandData(publication.includedInputCount)}/${stringifyCommandData(
                          publication.eligibleInputCount,
                        )}`
                      : '-';
                  const impactLabel =
                    impactCategoryLabelById.get(publication.displayDefaultImpactCategory ?? '') ??
                    publication.displayDefaultImpactCategory ??
                    '-';
                  const canUnpublish = publication.status !== 'unpublished' && publicationId;
                  const unpublishPublicationLabel = t(
                    'pages.dataProcessing.action.unpublishPublication',
                    'Unpublish publication',
                  );

                  return (
                    <section
                      key={publicationId ?? `${publication.packageId ?? 'publication'}-${index}`}
                      className={styles.publicationTableRow}
                      data-testid={
                        publicationId
                          ? `data-product-publication-${publicationId}`
                          : `data-product-publication-${index}`
                      }
                      role='row'
                    >
                      <div className={styles.publicationTableCell} role='cell'>
                        <strong>{resultSetLabel}</strong>
                        {publication.packageVersion &&
                        publication.packageVersion !== resultSetLabel ? (
                          <span className={styles.jobSecondary}>{publication.packageVersion}</span>
                        ) : null}
                      </div>
                      <div className={styles.publicationTableCell} role='cell'>
                        {renderStatusIcon(publication.status)}
                        {publication.isCurrent ? (
                          <span className={styles.currentPublication}>
                            {t('pages.dataProcessing.publications.current', 'Current')}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.publicationTableCell} role='cell'>
                        {impactLabel}
                      </div>
                      <div className={styles.publicationTableCell} role='cell'>
                        {formatTimestamp(publication.publishedAt)}
                      </div>
                      <div className={styles.publicationTableCell} role='cell'>
                        {inputCount}
                      </div>
                      <div className={styles.publicationTableCell} role='cell'>
                        {canUnpublish ? (
                          <Tooltip title={unpublishPublicationLabel}>
                            <Button
                              type='text'
                              size='small'
                              danger
                              className={styles.iconActionButton}
                              icon={<StopOutlined />}
                              aria-label={unpublishPublicationLabel}
                              loading={submittingAction === 'unpublishPublication'}
                              onClick={() => handleUnpublishPublication(publicationId)}
                            />
                          </Tooltip>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </Space>
        </Spin>
      </Card>
    </Space>
  );

  return (
    <PageContainer title={t('pages.dataProcessing.title', 'Data Processing')}>
      <Spin spinning={loading}>
        {!authResolved ? null : !isAuthorized ? (
          <AccessDenied />
        ) : (
          <Space orientation='vertical' size='large' className={styles.pageStack}>
            {renderResultSetWorkspace()}
            {!createDialogOpen ? renderCommandStatus() : null}
            {isWorkspace ? (
              <Tabs
                activeKey={activeTabKey}
                onChange={handleTabChange}
                items={[
                  {
                    key: 'builds',
                    label: t('pages.dataProcessing.tabs.builds', 'Completeness & Calculation'),
                    children: renderWorkflowContextRequired(renderBuildRequests()),
                  },
                  {
                    key: 'preview',
                    label: t('pages.dataProcessing.tabs.preview', 'Result Preview'),
                    children: renderWorkflowContextRequired(renderPackagePreview()),
                  },
                  {
                    key: 'exports',
                    label: t('pages.dataProcessing.workspace.exports', 'Exports'),
                    children: renderWorkflowContextRequired(
                      selectedPackageId ? (
                        <CalculationBundlePanel
                          key={selectedPackageId}
                          packageId={selectedPackageId}
                          view='exports'
                          onReviewCalculation={() => handleTabChange('builds')}
                        />
                      ) : (
                        <Alert
                          type='info'
                          title={t(
                            'pages.dataProcessing.workspace.selectVersion',
                            'Open a completed calculation in Results before exporting.',
                          )}
                        />
                      ),
                    ),
                  },
                  {
                    key: 'publication',
                    label: t('pages.dataProcessing.tabs.publication', 'Publication'),
                    children: renderWorkflowContextRequired(renderPublication()),
                  },
                ]}
              />
            ) : null}
            <Modal
              title={t('pages.dataProcessing.resultSets.create', 'Create result set')}
              open={createDialogOpen}
              confirmLoading={submittingAction === 'createResultSet'}
              onCancel={() => {
                if (submittingAction !== 'createResultSet') setCreateDialogOpen(false);
              }}
              onOk={handleCreateResultSet}
              okText={t('pages.dataProcessing.resultSets.create', 'Create result set')}
            >
              <Form form={resultSetForm} layout='vertical' onFinish={handleCreateResultSet}>
                <Form.Item
                  name='name'
                  label={t('pages.dataProcessing.resultSets.newName', 'New result set name')}
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: t(
                        'pages.dataProcessing.validation.packageNameRequired',
                        'Result set name is required',
                      ),
                    },
                  ]}
                >
                  <Input
                    aria-label={t('pages.dataProcessing.resultSets.newName', 'New result set name')}
                    maxLength={200}
                  />
                </Form.Item>
              </Form>
              {createDialogOpen ? renderCommandStatus() : null}
            </Modal>
          </Space>
        )}
      </Spin>
    </PageContainer>
  );
};

export default DataProcessing;
