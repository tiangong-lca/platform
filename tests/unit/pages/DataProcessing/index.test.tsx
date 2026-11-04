import { Form } from 'antd';
import DataProcessing, {
  buildImpactCategoryOptions,
  createSubmittedBuildTask,
  deriveResultSetWorkflowSummary,
  firstNumberText,
  formatArtifactByteSize,
  formatNumericValue,
  formatTimestamp,
  packageCountLabel,
  packageOptionsFromTaskSummaries,
  parseDataProcessingDeepLink,
  parseImpactCategoryOptionLabel,
  resolveLocalizedText,
  resultSetActionMessage,
  resultSetStatusMessage,
  reviewedLciaMethodSet,
  scopeSelectionKey,
  selectedImpactCategoryIdentity,
  stateCodeCountsFromProcesses,
  stateCodeCountsFromScope,
  stateCodeFromProcess,
  statusIconFromValue,
  statusToneFromValue,
  stringifyCommandData,
} from '@/pages/DataProcessing';
import { CONTENT_LANGUAGE_REGISTRY } from '@/services/general/contentLanguageRegistry';
import { LOCALE_CAPABILITY_MATRIX } from '@/services/general/localeCapabilities';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const publicArtifactContract = require('../../../fixtures/contracts/20260729_scope_closure_public_artifact_contract.json');
type TestArtifactState = 'pending' | 'ready' | 'expired' | 'deleted' | 'failed';

function contractArtifacts(states: [TestArtifactState, TestArtifactState] = ['ready', 'pending']) {
  return publicArtifactContract.ownerCheckRead.artifacts.map(
    (fixture: Record<string, unknown>, index: number) => {
      const state = states[index];
      const role = fixture.artifactRole as 'closure_report_xlsx' | 'closure_issue_manifest';
      const readyMetadata =
        role === 'closure_report_xlsx'
          ? {
              filename: 'closure-issues.xlsx',
              format: 'xlsx',
              mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              size: 1024,
              checksumSha256: 'a'.repeat(64),
              artifactExpiresAt: '2026-08-05T00:00:00Z',
            }
          : {
              filename: 'closure-complete-manifest.json',
              format: 'json',
              mediaType: 'application/vnd.tiangong.scope-closure-manifest+json',
              size: 2048,
              checksumSha256: 'b'.repeat(64),
              artifactExpiresAt: '2026-08-05T00:00:00Z',
            };
      return state === 'ready'
        ? { ...fixture, ...readyMetadata, artifactState: state }
        : {
            artifactRole: role,
            artifactState: state,
            filename: null,
            format: null,
            mediaType: null,
            size: null,
            checksumSha256: null,
            artifactExpiresAt: null,
          };
    },
  );
}

function closureSummary(
  states: [TestArtifactState, TestArtifactState],
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 'lcia.scope-closure-check.v1',
    closureCheckId: 'closure-valid',
    runStatus: 'passed',
    certificateValidity: 'valid',
    scanCompleteness: 'complete',
    requestedScopeHash: 'scope-hash-valid',
    policyFingerprint: 'policy-valid',
    artifacts: contractArtifacts(states),
    ...overrides,
  };
}

jest.mock('antd', () => {
  const mocks = require('../../../mocks/antd').createAntdMock();
  const { Pagination } = jest.requireActual('antd');
  const MockTable = mocks.Table;
  return {
    ...mocks,
    Table: (props: any) => (
      <>
        <MockTable {...props} />
        {props.pagination ? <Pagination {...props.pagination} /> : null}
      </>
    ),
  };
});
jest.mock('@ant-design/pro-components', () =>
  require('../../../mocks/proComponents').createProComponentsMock(),
);
jest.mock('@ant-design/icons', () =>
  require('../../../mocks/antDesignIcons').createAntDesignIconsMock(),
);
jest.mock('@/pages/DataProcessing/CalculationBundlePanel', () => ({
  __esModule: true,
  formatBundleNumber: (value: number) => (Number.isFinite(value) ? String(value) : '-'),
  default: ({
    packageId,
    initialProcessId,
    initialProcessVersion,
    onReviewCalculation,
    onOpenExports,
  }: any) => (
    <div data-testid='calculation-bundle-panel'>
      {packageId}
      <span data-testid='selected-result-process'>
        {initialProcessId}@{initialProcessVersion}
      </span>
      {onOpenExports && (
        <button type='button' onClick={onOpenExports}>
          Open result downloads
        </button>
      )}
      {onReviewCalculation ? (
        <button type='button' onClick={onReviewCalculation}>
          Review calculation
        </button>
      ) : null}
    </div>
  ),
}));
jest.mock('@/components/LcaReleaseReadPanel', () => ({
  __esModule: true,
  default: ({ processId }: any) => <div data-testid='release-read-panel'>{processId}</div>,
}));

const mockGetSystemUserRoleApi = jest.fn();
const mockCreateLciaResultBuildRequest = jest.fn();
const mockCreateLciaResultSet = jest.fn();
const mockGetLciaResultSet = jest.fn();
const mockListLciaResultSets = jest.fn();
const mockPreviewLciaResultPackage = jest.fn();
const mockPublishLciaResultPackage = jest.fn();
const mockUnpublishLciaResultPublication = jest.fn();
const mockListLciaResultPublications = jest.fn();
const mockRequestWorkerJobsApi = jest.fn();
const mockGetClosureCheck = jest.fn();
const mockListClosureCheckIssues = jest.fn();
const mockCreateClosureReportDownload = jest.fn();
const mockCreateClosureCheck = jest.fn();
const taskListeners = new Set<() => void>();
const TEST_RESULT_SET_ID = '77777777-7777-4777-8777-777777777777';
const TEST_RESULT_SET = {
  schemaVersion: 'lcia.result-set.v1',
  resultSetId: TEST_RESULT_SET_ID,
  name: 'Test result set',
  createdAt: '2026-06-23T09:00:00Z',
};
let mockDataProductTasks: any[] = [];
let mockBoundTaskSource: any[] | undefined;
let mockBoundTasks: any[] = [];
const mockGetTasksForResultSet = () => {
  if (mockBoundTaskSource === mockDataProductTasks) return mockBoundTasks;
  mockBoundTaskSource = mockDataProductTasks;
  mockBoundTasks = mockDataProductTasks.map((task) => ({
    ...task,
    runState:
      task.runState ??
      (task.workerStatus === 'completed'
        ? 'succeeded'
        : task.workerStatus === 'failed'
          ? 'failed'
          : task.workerStatus === 'cancelled'
            ? 'cancelled'
            : task.workerStatus === 'blocked'
              ? 'blocked'
              : 'active'),
    resultSetId: task.resultSetId ?? TEST_RESULT_SET_ID,
    resultSetName: task.resultSetName ?? TEST_RESULT_SET.name,
    deepLink: task.deepLink
      ? {
          ...task.deepLink,
          params: { ...task.deepLink.params, resultSetId: TEST_RESULT_SET_ID },
        }
      : task.deepLink,
  }));
  return mockBoundTasks;
};
const mockRefreshDataProductTasks = jest.fn(async () => mockGetTasksForResultSet());
const mockListDataProductTasks = jest.fn(() => mockGetTasksForResultSet());
const mockSubscribeDataProductTasks = jest.fn((listener: () => void) => {
  taskListeners.add(listener);
  return () => taskListeners.delete(listener);
});
let mockTaskGeneration: number | null = 0;
const mockUpsertDataProductTasks = jest.fn((rows: any[]) => {
  const byId = new Map(mockDataProductTasks.map((task) => [task.jobId, task]));
  rows.forEach((task) => byId.set(task.jobId, task));
  mockDataProductTasks = [...byId.values()];
  taskListeners.forEach((listener) => listener());
});
const mockFetch = jest.fn();
let mockLocale: string | undefined = 'en-US';
let mockLocation = { pathname: '/data-processing', search: '' };
let mockInjectResultSet = true;
const mockHistoryReplace = jest.fn();
const mockHistoryPush = jest.fn();

function mockWithTestResultSet(search: string): string {
  if (!mockInjectResultSet) return search;
  const params = new URLSearchParams(search);
  params.set('resultSetId', TEST_RESULT_SET_ID);
  return `?${params.toString()}`;
}

const mockMessages: Record<string, Record<string, string>> = {
  'zh-CN': {
    'pages.dataProcessing.title': '数据处理',
    'pages.dataProcessing.tabs.builds': '结果生成',
    'pages.dataProcessing.tabs.preview': '结果预览',
    'pages.dataProcessing.tabs.publication': '发布',
    'pages.dataProcessing.form.packageName': '结果集名称',
    'pages.dataProcessing.form.coverageMode': '覆盖范围',
    'pages.dataProcessing.form.defaultImpactCategory': '默认影响类别',
    'pages.dataProcessing.form.publishDefaultImpactCategory': '发布默认影响类别',
    'pages.dataProcessing.workspace.version': '选择结果集',
    'pages.dataProcessing.form.publishPackageId': '发布结果集',
    'pages.dataProcessing.form.publishReason': '发布原因',
    'pages.dataProcessing.form.unpublishPublicationId': '下架发布 ID',
    'pages.dataProcessing.form.unpublishReason': '下架原因',
    'pages.dataProcessing.action.createBuild': '生成结果集',
    'pages.dataProcessing.action.calculateFromCheck': '使用此检查开始计算',
    'pages.dataProcessing.resultView.recalculate': '使用此检查开始新计算',
    'pages.dataProcessing.workspace.loadVersion': '预览结果集',
    'pages.dataProcessing.action.publishPackage': '发布结果集',
    'pages.dataProcessing.action.unpublishPublication': '下架发布',
    'pages.dataProcessing.jobs.title': '结果生成任务',
    'pages.dataProcessing.jobs.empty': '暂无结果生成任务',
    'pages.dataProcessing.jobs.refresh': '刷新任务',
    'pages.dataProcessing.jobs.build': '生成',
    'pages.dataProcessing.jobs.updatedAt': '更新时间',
    'pages.dataProcessing.preview.stateCode': '状态码',
    'pages.dataProcessing.publications.title': '发布管理',
    'pages.dataProcessing.publications.refresh': '刷新发布',
    'pages.dataProcessing.publications.empty': '暂无已发布结果集',
    'pages.dataProcessing.publications.current': '当前',
  },
};

const mockFormatMessage = (
  { id, defaultMessage }: { id?: string; defaultMessage?: string },
  values: Record<string, unknown> = {},
) =>
  (
    (id && mockLocale ? mockMessages[mockLocale]?.[id] : undefined) ??
    defaultMessage ??
    id ??
    ''
  ).replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));

const mockLciaMethodList = {
  files: [
    {
      id: 'climate-change',
      version: '01.00.000',
      description: [
        { '@xml:lang': 'en', '#text': 'Climate change' },
        { '@xml:lang': 'zh', '#text': '气候变化' },
      ],
      referenceQuantity: {
        'common:shortDescription': {
          '@xml:lang': 'en',
          '#text': 'kg CO2 eq',
        },
      },
    },
    {
      id: 'acidification',
      version: '01.00.000',
      description: [
        { '@xml:lang': 'en', '#text': 'Acidification' },
        { '@xml:lang': 'zh', '#text': '酸化' },
      ],
      referenceQuantity: {
        'common:shortDescription': {
          '@xml:lang': 'en',
          '#text': 'mol H+ eq',
        },
      },
    },
  ],
};

const expectedReviewedLciaMethods = [
  { id: 'climate-change', version: '01.00.000' },
  { id: 'acidification', version: '01.00.000' },
];

jest.mock('@umijs/max', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  history: {
    push: (...args: any[]) => Reflect.apply(mockHistoryPush, undefined, args),
    replace: (...args: any[]) => Reflect.apply(mockHistoryReplace, undefined, args),
  },
  useIntl: () => ({
    formatMessage: mockFormatMessage,
    locale: mockLocale,
  }),
  useLocation: () => ({ ...mockLocation, search: mockWithTestResultSet(mockLocation.search) }),
}));

jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getSystemUserRoleApi: (...args: any[]) =>
    Reflect.apply(mockGetSystemUserRoleApi, undefined, args),
}));

jest.mock('@/services/dataProducts', () => ({
  __esModule: true,
  createLciaResultSet: (...args: any[]) => Reflect.apply(mockCreateLciaResultSet, undefined, args),
  getLciaResultSet: (...args: any[]) => Reflect.apply(mockGetLciaResultSet, undefined, args),
  listLciaResultSets: (...args: any[]) => Reflect.apply(mockListLciaResultSets, undefined, args),
  createLciaResultBuildRequest: (...args: any[]) =>
    Reflect.apply(mockCreateLciaResultBuildRequest, undefined, args),
  previewLciaResultPackage: (...args: any[]) =>
    Reflect.apply(mockPreviewLciaResultPackage, undefined, args),
  publishLciaResultPackage: (...args: any[]) =>
    Reflect.apply(mockPublishLciaResultPackage, undefined, args),
  unpublishLciaResultPublication: (...args: any[]) =>
    Reflect.apply(mockUnpublishLciaResultPublication, undefined, args),
  listLciaResultPublications: (...args: any[]) =>
    Reflect.apply(mockListLciaResultPublications, undefined, args),
  getClosureCheck: (...args: any[]) => Reflect.apply(mockGetClosureCheck, undefined, args),
  listClosureCheckIssues: (...args: any[]) =>
    Reflect.apply(mockListClosureCheckIssues, undefined, args),
  createClosureCheck: (...args: any[]) => Reflect.apply(mockCreateClosureCheck, undefined, args),
  createClosureReportDownload: (...args: any[]) =>
    Reflect.apply(mockCreateClosureReportDownload, undefined, args),
  refreshDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockRefreshDataProductTasks, undefined, args),
  listDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockListDataProductTasks, undefined, args),
  subscribeDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockSubscribeDataProductTasks, undefined, args),
  upsertDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockUpsertDataProductTasks, undefined, args),
}));

jest.mock('@/services/dataProducts/taskCenter', () => ({
  __esModule: true,
  getDataProductTaskGeneration: () => mockTaskGeneration,
  getDataProductTaskOwnerId: () => (mockTaskGeneration === null ? null : 'owner-a'),
  refreshDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockRefreshDataProductTasks, undefined, args),
  listDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockListDataProductTasks, undefined, args),
  subscribeDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockSubscribeDataProductTasks, undefined, args),
  upsertDataProductTasks: (...args: any[]) =>
    Reflect.apply(mockUpsertDataProductTasks, undefined, args),
}));

jest.mock('@/services/workerJobs/api', () => ({
  __esModule: true,
  requestWorkerJobsApi: (...args: any[]) =>
    Reflect.apply(mockRequestWorkerJobsApi, undefined, args),
}));

describe('DataProcessing page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskGeneration = 0;
    mockLocale = 'en-US';
    mockInjectResultSet = true;
    mockLocation = { pathname: '/data-processing', search: '?closureCheckId=closure-valid' };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockLciaMethodList,
    });
    global.fetch = mockFetch as any;
    mockGetSystemUserRoleApi.mockResolvedValue({ role: 'data_product_manager' });
    mockCreateLciaResultBuildRequest.mockResolvedValue({
      data: { buildId: 'build-1', workerJobId: 'worker-job-1' },
      error: null,
    });
    mockCreateLciaResultSet.mockResolvedValue({ data: null, error: null });
    mockGetLciaResultSet.mockResolvedValue({ data: TEST_RESULT_SET, error: null });
    mockListLciaResultSets.mockResolvedValue({
      data: { items: [TEST_RESULT_SET] },
      error: null,
    });
    mockPreviewLciaResultPackage.mockReset();
    mockPreviewLciaResultPackage.mockResolvedValue({
      data: {
        summary: {
          packageId: 'package-1',
          packageVersion: '2026-06-public',
          status: 'preview_ready',
          eligibleInputCount: 10,
          includedInputCount: 10,
        },
      },
      error: null,
    });
    mockPublishLciaResultPackage.mockResolvedValue({
      data: { publicationId: 'publication-1', packageId: 'package-1' },
      error: null,
    });
    mockUnpublishLciaResultPublication.mockResolvedValue({
      data: { publicationId: 'publication-1', status: 'unpublished' },
      error: null,
    });
    mockListLciaResultPublications.mockResolvedValue({
      data: [],
      error: null,
    });
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-valid',
        policyFingerprint: 'policy-valid',
        artifacts: contractArtifacts(),
      },
      error: null,
    });
    mockCreateClosureCheck.mockResolvedValue({
      data: {
        closureCheckId: 'closure-new',
        requestedScopeHash: 'scope-hash-new',
        policyFingerprint: 'policy-new',
        workerJob: { jobId: 'closure-worker-new', status: 'queued' },
        reused: false,
      },
      error: null,
    });
    mockCreateClosureReportDownload.mockResolvedValue({ data: null, error: null });
    mockListClosureCheckIssues.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-issues-page.v1',
        closureCheckId: 'closure-valid',
        issues: [],
      },
      error: null,
    });
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-1',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'running',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:00:00Z',
        title: '',
        phase: 'materializing',
        progressFraction: 0.35,
        capabilities: {
          canCancel: true,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: false,
        },
      },
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-ready',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'completed',
        domainStatus: 'preview_ready',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:05:00Z',
        title: 'Ready package',
        resultPackageId: 'package-1',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: true,
        },
      },
    ];
    (URL as any).createObjectURL = jest.fn(() => 'blob:mock-export');
    (URL as any).revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  async function waitForValidCertificate() {
    await waitFor(() => expect(mockGetClosureCheck).toHaveBeenCalledWith('closure-valid'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled(),
    );
  }

  async function waitForReadyPreviewPackage() {
    await waitFor(() =>
      expect(
        screen.getByLabelText('Calculation version').querySelector('option[value="package-1"]'),
      ).not.toBeNull(),
    );
  }

  async function waitForTestResultSetLoaded() {
    return screen.findByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`);
  }

  it('derives the next recoverable ResultSet step from authoritative task projections', () => {
    expect(deriveResultSetWorkflowSummary(TEST_RESULT_SET_ID, [], [])).toEqual({
      closureStatus: 'unknown',
      buildStatus: 'unknown',
      publicationStatus: 'unknown',
      nextAction: 'start_closure',
    });

    const closureTask = {
      schemaVersion: 'task-summary.v2',
      jobId: 'closure-job',
      jobKind: 'lcia.scope_closure_check',
      resultSetId: TEST_RESULT_SET_ID,
      closureCheckId: 'closure-ready',
      workerStatus: 'completed',
      runState: 'succeeded',
      domainStatus: 'passed',
      domainValidity: 'valid',
      projectionUpdatedAt: '2026-06-23T10:00:00Z',
    } as any;
    expect(deriveResultSetWorkflowSummary(TEST_RESULT_SET_ID, [closureTask], [])).toEqual(
      expect.objectContaining({
        closureStatus: 'ready',
        buildStatus: 'unknown',
        nextAction: 'start_build',
        closureCheckId: 'closure-ready',
      }),
    );

    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [{ ...closureTask, runState: 'failed', workerStatus: 'failed', domainStatus: 'failed' }],
        [],
      ),
    ).toEqual(expect.objectContaining({ nextAction: 'view_closure' }));
    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [
          {
            ...closureTask,
            jobKind: 'lcia_result.package_build',
            runState: 'active',
            workerStatus: 'queued',
          },
        ],
        [],
      ),
    ).toEqual(expect.objectContaining({ nextAction: 'view_build' }));

    for (const status of ['queued', 'running', 'waiting']) {
      expect(
        deriveResultSetWorkflowSummary(
          TEST_RESULT_SET_ID,
          [{ ...closureTask, runState: 'unknown', workerStatus: status }],
          [],
        ).closureStatus,
      ).toBe('checking');
    }
    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [{ ...closureTask, domainValidity: 'invalid' }],
        [],
      ).closureStatus,
    ).toBe('needs_attention');
    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [{ ...closureTask, jobKind: 'lcia_result.package_build', workerStatus: 'failed' }],
        [],
      ).buildStatus,
    ).toBe('failed');
    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [],
        [{ status: 'draft', isCurrent: false } as any],
      ).publicationStatus,
    ).toBe('unknown');
    const buildTask = {
      schemaVersion: 'task-summary.v2',
      jobId: 'build-job',
      jobKind: 'lcia_result.package_build',
      resultSetId: TEST_RESULT_SET_ID,
      resultPackageId: 'package-ready',
      workerStatus: 'completed',
      runState: 'succeeded',
      domainValidity: 'none',
      projectionUpdatedAt: '2026-06-23T11:00:00Z',
    } as any;
    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [closureTask, buildTask],
        [
          {
            publicationId: 'publication-current',
            packageId: 'package-ready',
            status: 'published',
            isCurrent: true,
          } as any,
        ],
      ),
    ).toEqual(
      expect.objectContaining({
        closureStatus: 'ready',
        buildStatus: 'ready',
        publicationStatus: 'published',
        nextAction: 'view_publication',
        packageId: 'package-ready',
      }),
    );

    expect(
      deriveResultSetWorkflowSummary(
        TEST_RESULT_SET_ID,
        [
          closureTask,
          {
            ...buildTask,
            resultPackageId: undefined,
            workerStatus: 'completed',
            runState: 'succeeded',
          },
        ],
        [],
      ),
    ).toEqual(expect.objectContaining({ buildStatus: 'failed', nextAction: 'start_build' }));
  });

  it('maps every ResultSet workflow state and action to stable copy', () => {
    const translate = (_id: string, defaultMessage: string) => defaultMessage;
    expect([
      resultSetStatusMessage(translate, 'closure', 'not_checked'),
      resultSetStatusMessage(translate, 'closure', 'checking'),
      resultSetStatusMessage(translate, 'closure', 'needs_attention'),
      resultSetStatusMessage(translate, 'closure', 'ready'),
      resultSetStatusMessage(translate, 'closure', 'failed'),
      resultSetStatusMessage(translate, 'build', 'not_started'),
      resultSetStatusMessage(translate, 'build', 'running'),
      resultSetStatusMessage(translate, 'build', 'ready'),
      resultSetStatusMessage(translate, 'build', 'failed'),
      resultSetStatusMessage(translate, 'publication', 'not_published'),
      resultSetStatusMessage(translate, 'publication', 'published'),
      resultSetStatusMessage(translate, 'closure', 'future'),
    ]).toEqual([
      'Not checked',
      'Checking',
      'Needs attention',
      'Ready to calculate',
      'Check failed',
      'Not calculated',
      'Calculating',
      'Ready to preview',
      'Calculation failed',
      'Not published',
      'Published',
      'future',
    ]);
    expect(
      [
        'start_closure',
        'view_closure',
        'start_build',
        'view_build',
        'preview',
        'view_publication',
      ].map((action) => resultSetActionMessage(translate, action as any)),
    ).toEqual([
      'Start check',
      'View check',
      'Start calculation',
      'View progress',
      'Preview result',
      'View publication',
    ]);
  });

  it('creates the first ResultSet and establishes its stable URL context', async () => {
    mockInjectResultSet = false;
    mockLocation = { pathname: '/data-processing', search: '' };
    mockListLciaResultSets.mockResolvedValueOnce({ data: { items: [] }, error: null });
    mockCreateLciaResultSet.mockResolvedValueOnce({ data: TEST_RESULT_SET, error: null });

    render(<DataProcessing />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create result set' }));
    fireEvent.change(await screen.findByLabelText('New result set name'), {
      target: { value: 'Test result set' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create result set' }),
    );

    await waitFor(() => expect(mockCreateLciaResultSet).toHaveBeenCalledWith('Test result set'));
    expect(mockHistoryPush).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=builds`,
    });
    expect(
      await screen.findByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`),
    ).toHaveTextContent('Test result set');
  });

  it.each(['response', 'rejection'])(
    'serializes form and footer creation and unlocks after %s failure',
    async (failure) => {
      mockInjectResultSet = false;
      mockLocation = { pathname: '/data-processing', search: '' };
      let settle!: () => void;
      mockCreateLciaResultSet
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              settle = () =>
                failure === 'response'
                  ? resolve({ data: null, error: { message: 'creation unavailable' } })
                  : reject(new Error('creation unavailable'));
            }),
        )
        .mockResolvedValue({ data: TEST_RESULT_SET, error: null });
      render(<DataProcessing />);
      fireEvent.click(await screen.findByRole('button', { name: 'Create result set' }));
      const input = await screen.findByLabelText('New result set name');
      fireEvent.change(input, { target: { value: 'Single creation' } });
      const form = input.closest('form')!;
      const submit = within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Create result set',
      });
      await act(async () => {
        fireEvent.submit(form);
        fireEvent.click(submit);
        fireEvent.submit(form);
      });
      expect(mockCreateLciaResultSet).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.submit(form);
        fireEvent.click(submit);
      });
      expect(mockCreateLciaResultSet).toHaveBeenCalledTimes(1);
      await act(async () => settle());
      expect(await screen.findByText('creation unavailable')).toBeInTheDocument();
      fireEvent.submit(form);
      await waitFor(() => expect(mockCreateLciaResultSet).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockHistoryPush).toHaveBeenCalledWith({
        pathname: '/data-processing',
        search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=builds`,
      });
    },
  );

  it('replaces an existing ResultSet projection after creation', async () => {
    mockInjectResultSet = false;
    mockLocation = { pathname: '/data-processing', search: '' };
    mockListLciaResultSets.mockResolvedValueOnce({
      data: { items: [{ ...TEST_RESULT_SET, name: 'Previous name' }] },
      error: null,
    });
    mockCreateLciaResultSet.mockResolvedValueOnce({ data: TEST_RESULT_SET, error: null });

    render(<DataProcessing />);

    expect(
      await screen.findByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`),
    ).toHaveTextContent('Previous name');

    fireEvent.click(await screen.findByRole('button', { name: 'Create result set' }));
    fireEvent.change(await screen.findByLabelText('New result set name'), {
      target: { value: 'Test result set' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create result set' }),
    );

    await waitFor(() => expect(mockCreateLciaResultSet).toHaveBeenCalledWith('Test result set'));
    await waitFor(() => {
      const projections = screen.getAllByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`);
      expect(projections).toHaveLength(1);
      expect(projections[0]).toHaveTextContent('Test result set');
    });
    expect(screen.queryByText('Previous name')).not.toBeInTheDocument();
  });

  it.each([
    [
      'command error',
      () =>
        mockListLciaResultSets.mockResolvedValueOnce({
          data: null,
          error: { message: 'Result sets unavailable' },
        }),
      'Result sets unavailable',
    ],
    [
      'empty envelope',
      () => mockListLciaResultSets.mockResolvedValueOnce({ data: null, error: null }),
      'Unable to load result sets.',
    ],
    [
      'Error rejection',
      () => mockListLciaResultSets.mockRejectedValueOnce(new Error('Result set request exploded')),
      'Result set request exploded',
    ],
    [
      'non-Error rejection',
      () => mockListLciaResultSets.mockRejectedValueOnce('Result set request stopped'),
      'Result set request stopped',
    ],
  ])('surfaces a %s while loading ResultSets', async (_caseName, arrange, expected) => {
    arrange();
    render(<DataProcessing />);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('hydrates a direct ResultSet link that is outside the first list page', async () => {
    mockListLciaResultSets.mockResolvedValueOnce({ data: { items: [] }, error: null });
    mockGetLciaResultSet.mockResolvedValueOnce({ data: TEST_RESULT_SET, error: null });

    render(<DataProcessing />);

    expect(
      await screen.findByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`),
    ).toHaveTextContent('Test result set');
    expect(mockGetLciaResultSet).toHaveBeenCalledWith(TEST_RESULT_SET_ID);
  });

  it.each([
    [{ message: 'Linked result set is unavailable' }, 'Linked result set is unavailable'],
    [null, 'The selected result set was not found.'],
  ])('fails a missing direct ResultSet context closed', async (error, expected) => {
    mockListLciaResultSets.mockResolvedValueOnce({ data: { items: [] }, error: null });
    mockGetLciaResultSet.mockResolvedValueOnce({ data: null, error });

    render(<DataProcessing />);

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('navigates from ResultSet summaries, clears selection, and exposes closure history', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'closure-history-job',
        jobKind: 'lcia.scope_closure_check',
        category: 'data_product',
        resultSetId: TEST_RESULT_SET_ID,
        closureCheckId: 'closure-history',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainStatus: 'passed',
        domainValidity: 'valid',
        projectionUpdatedAt: '2026-08-17T09:00:00Z',
        updatedAt: '2026-08-17T09:00:00Z',
        capabilities: {},
      },
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'closure-history-fallback-job',
        jobKind: 'lcia.scope_closure_check',
        category: 'data_product',
        resultSetId: TEST_RESULT_SET_ID,
        closureCheckId: 'closure-history-fallback',
        workerStatus: 'failed',
        runState: 'failed',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-08-16T09:00:00Z',
        capabilities: {},
      },
    ];
    mockLocation = { pathname: '/data-processing', search: '' };
    mockGetClosureCheck.mockImplementation(async (closureCheckId: string) => ({
      data: closureSummary(['ready', 'ready'], { closureCheckId }),
      error: null,
    }));

    render(<DataProcessing />);

    const resultSetRow = await screen.findByTestId(
      `data-processing-result-set-${TEST_RESULT_SET_ID}`,
    );
    expect(resultSetRow).toHaveTextContent('Test result set');
    fireEvent.change(screen.getByLabelText('Current result set'), {
      target: { value: TEST_RESULT_SET_ID },
    });
    expect(mockHistoryPush).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=builds&closureCheckId=closure-history`,
    });

    const historySelect = await screen.findByLabelText('Check history');
    fireEvent.change(historySelect, { target: { value: 'closure-history' } });
    expect(mockHistoryPush).toHaveBeenLastCalledWith({
      pathname: '/data-processing',
      search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=builds&closureCheckId=closure-history`,
    });

    fireEvent.change(screen.getByLabelText('Current result set'), {
      target: { value: '99999999-9999-4999-8999-999999999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to result sets' }));
    expect(mockHistoryPush).toHaveBeenLastCalledWith({ pathname: '/data-processing', search: '' });
  });

  it('uses the package destination selected by a ResultSet summary', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'preview-ready-job',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        resultSetId: TEST_RESULT_SET_ID,
        resultPackageId: 'package-from-result-set',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-08-17T10:00:00Z',
        capabilities: {},
      },
    ];
    mockLocation = { pathname: '/data-processing', search: '' };

    render(<DataProcessing />);

    const resultSetRow = await waitForTestResultSetLoaded();
    expect(resultSetRow).toHaveTextContent('Test result set');
    fireEvent.change(await screen.findByLabelText('Current result set'), {
      target: { value: TEST_RESULT_SET_ID },
    });
    expect(mockHistoryPush).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=preview&packageId=package-from-result-set`,
    });
  });

  it('opens a published ResultSet at its publication destination', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'published-package-job',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        resultSetId: TEST_RESULT_SET_ID,
        resultPackageId: 'published-package',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-08-17T10:00:00Z',
        capabilities: {},
      },
    ];
    mockListLciaResultPublications.mockResolvedValueOnce({
      data: [
        { publicationId: 'published-result', packageId: 'published-package', status: 'current' },
      ],
      error: null,
    });
    mockLocation = { pathname: '/data-processing', search: '' };

    render(<DataProcessing />);

    const row = await screen.findByTestId(`data-processing-result-set-${TEST_RESULT_SET_ID}`);
    expect(row).toHaveTextContent('Test result set');
    fireEvent.change(screen.getByLabelText('Current result set'), {
      target: { value: TEST_RESULT_SET_ID },
    });
    expect(mockHistoryPush).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search: `?resultSetId=${TEST_RESULT_SET_ID}&tab=publication&packageId=published-package`,
    });
  });

  it('does not establish context when ResultSet creation fails', async () => {
    mockInjectResultSet = false;
    mockLocation = { pathname: '/data-processing', search: '' };
    mockListLciaResultSets.mockResolvedValueOnce({ data: { items: [] }, error: null });
    mockCreateLciaResultSet.mockResolvedValueOnce({
      data: null,
      error: { message: 'Unable to create result set' },
    });

    render(<DataProcessing />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create result set' }));
    fireEvent.change(await screen.findByLabelText('New result set name'), {
      target: { value: 'Rejected result set' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create result set' }),
    );

    expect(await screen.findByText('Unable to create result set')).toBeInTheDocument();
    expect(mockHistoryReplace).not.toHaveBeenCalled();
  });

  it('keeps legacy closure and build commands compatible without a ResultSet id', async () => {
    mockInjectResultSet = false;
    mockLocation = { pathname: '/data-processing', search: '?closureCheckId=closure-valid' };
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'legacy-closure-job',
        jobKind: 'lcia.scope_closure_check',
        category: 'data_product',
        resultSetId: '',
        closureCheckId: 'closure-valid',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainStatus: 'passed',
        domainValidity: 'valid',
        projectionUpdatedAt: '2026-08-17T09:00:00Z',
        capabilities: {},
      },
    ];

    render(<DataProcessing />);
    await waitFor(() => expect(mockGetClosureCheck).toHaveBeenCalledWith('closure-valid'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate result set' })).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Legacy result set' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate result set' }));
    await waitFor(() =>
      expect(mockCreateLciaResultBuildRequest).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Legacy result set', closureCheckId: 'closure-valid' }),
        expect.objectContaining({
          taskSession: expect.objectContaining({
            ownerId: 'owner-a',
            isCurrent: expect.any(Function),
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));
    await waitFor(() =>
      expect(mockCreateClosureCheck).toHaveBeenCalledWith(
        expect.not.objectContaining({ resultSetId: expect.anything() }),
      ),
    );
  });

  it('normalizes localized impact category option metadata', () => {
    expect(resolveLocalizedText('String label', 'en-US')).toBe('String label');
    expect(
      resolveLocalizedText(
        [
          null,
          { '@xml:lang': 'fr', '#text': 'Changement climatique' },
          { '@xml:lang': 'en', '#text': 'Climate fallback' },
        ],
        'zh-CN',
      ),
    ).toBe('Climate fallback');
    expect(resolveLocalizedText([{ '@xml:lang': 'fr', '#text': 'Acidification' }], 'en-US')).toBe(
      'Acidification',
    );
    expect(resolveLocalizedText([{}], 'en-US')).toBe('');
    expect(resolveLocalizedText(['raw fallback'], 'en-US')).toBe('');
    expect(resolveLocalizedText({}, 'en-US')).toBe('');
    expect(resolveLocalizedText(undefined, 'en-US')).toBe('');

    const registryLocalizedValue = CONTENT_LANGUAGE_REGISTRY.map(({ languageCode }) => ({
      '@xml:lang': languageCode,
      '#text': `label-${languageCode}`,
    }));
    for (const { appLocale, contentLanguage } of LOCALE_CAPABILITY_MATRIX) {
      if (!contentLanguage) {
        throw new Error(`Missing content capability for ${appLocale}.`);
      }
      expect(resolveLocalizedText(registryLocalizedValue, appLocale)).toBe(
        `label-${contentLanguage}`,
      );
    }
    expect(
      resolveLocalizedText(
        [
          { '@xml:lang': 'fr', '#text': '   ' },
          { '@xml:lang': 'en', '#text': 'English fallback after blank French' },
          { '@xml:lang': 'zh', '#text': '中文备选' },
        ],
        'fr-FR',
      ),
    ).toBe('English fallback after blank French');
    expect(
      resolveLocalizedText(
        [
          { '@xml:lang': 'fr', '#text': '' },
          { '@xml:lang': 'ja', '#text': 'First non-blank legacy fallback' },
        ],
        'fr-FR',
      ),
    ).toBe('First non-blank legacy fallback');

    expect(buildImpactCategoryOptions({}, 'en-US')).toEqual([]);
    expect(
      buildImpactCategoryOptions(
        {
          files: [
            { description: 'Missing id' },
            { id: 'fallback-name', version: '01.00.000' },
            {
              id: 'string-name',
              description: 'String name',
              version: '01.00.000',
              referenceQuantity: {
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'kg eq' }],
              },
            },
          ],
        },
        'en-US',
      ),
    ).toEqual([
      {
        value: 'fallback-name',
        version: '01.00.000',
        label: 'fallback-name (01.00.000)',
      },
      {
        value: 'string-name',
        version: '01.00.000',
        label: 'String name (01.00.000 / kg eq)',
      },
    ]);
    expect(
      buildImpactCategoryOptions(
        {
          files: [
            {
              id: '9ec743ea-6b00-400d-a53b-61547a3fc03c',
              version: '01.01.000',
              description: 'Reviewed alias',
            },
          ],
        },
        'en-US',
      ),
    ).toEqual([
      {
        value: '503699e0-eca9-4089-8bf8-e0f49c93e578',
        version: '01.01.000',
        label: 'Reviewed alias (01.01.000)',
      },
    ]);
    expect(parseImpactCategoryOptionLabel('Legacy label without metadata')).toEqual({
      name: 'Legacy label without metadata',
    });
    expect(selectedImpactCategoryIdentity(null, [])).toBeNull();
    expect(selectedImpactCategoryIdentity('missing-method', [])).toBeNull();
    expect(
      selectedImpactCategoryIdentity('string-name', [
        {
          value: 'string-name',
          version: '01.00.000',
          label: 'String name (01.00.000)',
        },
      ]),
    ).toEqual({ id: 'string-name', version: '01.00.000' });
    expect(reviewedLciaMethodSet(buildImpactCategoryOptions(mockLciaMethodList, 'en-US'))).toEqual(
      expectedReviewedLciaMethods,
    );
    expect(
      reviewedLciaMethodSet([
        { value: ' method-a ', version: ' 01.00.000 ', label: 'A' },
        { value: 'method-a', version: '01.00.000', label: 'A duplicate' },
        { value: '', version: '01.00.000', label: 'Invalid' },
        { value: 'method-b', version: '02.00.000', label: 'B' },
      ]),
    ).toEqual([
      { id: 'method-a', version: '01.00.000' },
      { id: 'method-b', version: '02.00.000' },
    ]);
    expect(scopeSelectionKey({ defaultImpactCategory: 'missing-method' }, [])).toBe(
      JSON.stringify({
        coverageMode: 'global_eligible',
        lciaMethods: [],
      }),
    );
    const reviewedOptions = buildImpactCategoryOptions(mockLciaMethodList, 'en-US');
    expect(selectedImpactCategoryIdentity('climate-change', reviewedOptions)).toEqual({
      id: 'climate-change',
      version: '01.00.000',
    });
    expect(scopeSelectionKey({ defaultImpactCategory: 'climate-change' }, reviewedOptions)).toBe(
      scopeSelectionKey({ defaultImpactCategory: 'acidification' }, reviewedOptions),
    );
  });

  it('covers data-processing display helper fallbacks', () => {
    expect(parseDataProcessingDeepLink('')).toEqual({
      activeTabKey: 'builds',
      packageId: undefined,
      processId: undefined,
      processVersion: undefined,
    });
    expect(
      parseDataProcessingDeepLink(
        '?tab=publication&packageId=package-1&processId=process-1&processVersion=01.00.000',
      ),
    ).toEqual({
      activeTabKey: 'publication',
      packageId: 'package-1',
      processId: 'process-1',
      processVersion: '01.00.000',
    });
    expect(parseDataProcessingDeepLink('?tab=preview').activeTabKey).toBe('preview');
    expect(parseDataProcessingDeepLink('?tab=unknown&packageId=%20').activeTabKey).toBe('builds');

    expect(stringifyCommandData(null)).toBe('-');
    expect(stringifyCommandData('plain')).toBe('plain');
    expect(stringifyCommandData({ value: '<quoted>' })).toBe('{"value":"<quoted>"}');

    expect(statusToneFromValue('blocked')).toBe('warning');
    expect(statusToneFromValue('cancelled')).toBe('default');
    expect(statusToneFromValue('preview_ready')).toBe('success');
    expect(statusToneFromValue({})).toBe('default');
    expect(statusIconFromValue('blocked')).toBeTruthy();
    expect(statusIconFromValue('unpublished')).toBeTruthy();
    expect(statusIconFromValue('unknown-status')).toBeTruthy();

    expect(firstNumberText(undefined, null, Number.NaN, '')).toBeUndefined();
    expect(firstNumberText(0)).toBe('0');
    expect(firstNumberText('100')).toBe('100');

    expect(
      packageCountLabel({ value: 'a', label: 'A', packageId: 'a', includedInputCount: '2' }),
    ).toBe('2');
    expect(
      packageCountLabel({ value: 'b', label: 'B', packageId: 'b', eligibleInputCount: '3' }),
    ).toBe('3');
    expect(packageCountLabel({ value: 'c', label: 'C', packageId: 'c' })).toBeUndefined();
    expect(
      packageCountLabel({
        value: 'd',
        label: 'D',
        packageId: 'd',
        includedInputCount: '2',
        eligibleInputCount: '4',
      }),
    ).toBe('2/4');

    expect(stateCodeFromProcess(null)).toBe('-');
    expect(stateCodeFromProcess({ state_code: 101 })).toBe('101');
    expect(
      stateCodeCountsFromProcesses([
        { stateCode: 100 },
        { state_code: '101' },
        null,
        { stateCode: 100 },
      ]),
    ).toEqual([
      { stateCode: '-', count: 1 },
      { stateCode: '100', count: 2 },
      { stateCode: '101', count: 1 },
    ]);
    expect(
      stateCodeCountsFromScope([
        { count: 1 },
        { state_code: 100, count: '2' },
        { stateCode: '101', count: 1 },
        { stateCode: '102', count: 'not-a-number' },
      ]),
    ).toEqual([
      { stateCode: '-', count: 1 },
      { stateCode: '100', count: 2 },
      { stateCode: '101', count: 1 },
    ]);

    expect(formatArtifactByteSize(-1)).toBe('-');
    expect(formatArtifactByteSize(null)).toBe('-');
    expect(formatArtifactByteSize(512)).toBe('512 B');
    expect(formatArtifactByteSize('512')).toBe('512 B');
    expect(formatArtifactByteSize(1536)).toBe('1.5 KB');
    expect(formatArtifactByteSize(2 * 1024 * 1024)).toBe('2.00 MB');
    expect(formatNumericValue('bad')).toBe('-');
    expect(formatNumericValue('12.5')).toBe('12.5');
    expect(formatNumericValue(12.5)).toBe('12.5');
    expect(formatTimestamp(undefined)).toBe('-');
    expect(formatTimestamp('2026-06-24T09:10:11Z')).toBe('2026-06-24 09:10');
    expect(formatTimestamp('not-iso')).toBe('not-iso');
  });

  it('normalizes a locally submitted safe build task before the feed observes it', () => {
    expect(createSubmittedBuildTask(null)).toBeNull();
    expect(createSubmittedBuildTask({ workerJobId: 'worker-without-build' })).not.toHaveProperty(
      'deepLink',
    );
    expect(
      createSubmittedBuildTask({ workerJobId: 'worker-safe', buildId: 'build-safe' }),
    ).toMatchObject({
      jobId: 'worker-safe',
      jobKind: 'lcia_result.package_build',
      workerStatus: 'queued',
    });
    expect(
      packageOptionsFromTaskSummaries([
        {
          schemaVersion: 'task-summary.v2',
          jobId: 'safe-ready',
          jobKind: 'lcia_result.package_build',
          category: 'data_product',
          workerStatus: 'completed',
          domainValidity: 'none',
          projectionUpdatedAt: '2026-06-23T10:00:00Z',
          title: 'Safe package',
          resultPackageId: 'package-safe',
          capabilities: {
            canCancel: false,
            canDownloadReport: false,
            canOpenWorkbench: true,
            canPreviewResult: true,
          },
        },
      ] as any),
    ).toEqual([expect.objectContaining({ packageId: 'package-safe' })]);
    expect(
      packageOptionsFromTaskSummaries([
        {
          schemaVersion: 'task-summary.v2',
          jobId: 'safe-ready-fallback',
          jobKind: 'lcia_result.package_build',
          category: 'data_product',
          workerStatus: 'completed',
          domainValidity: 'none',
          projectionUpdatedAt: '2026-06-23T10:00:00Z',
          title: '',
          resultPackageId: 'package-fallback',
          capabilities: {},
        },
      ] as any),
    ).toEqual([expect.objectContaining({ label: 'package-fallback' })]);
  });

  it('submits build, preview, publish, and unpublish commands for managers', async () => {
    mockLocation = { pathname: '/data-processing', search: '' };
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-new',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-new',
        policyFingerprint: 'policy-new',
      },
      error: null,
    });
    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    expect(await screen.findByLabelText('Default impact category')).toHaveTextContent(
      'Climate change',
    );
    expect(mockRefreshDataProductTasks).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'June package' },
    });
    fireEvent.change(screen.getByLabelText('Default impact category'), {
      target: { value: 'climate-change' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));
    await waitFor(() =>
      expect(mockCreateClosureCheck).toHaveBeenCalledWith({
        resultSetId: TEST_RESULT_SET_ID,
        requestedScope: {
          coverageMode: 'global_eligible',
          lciaMethods: expectedReviewedLciaMethods,
        },
        requestIdempotencyToken: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    await waitFor(() =>
      expect(mockCreateLciaResultBuildRequest).toHaveBeenCalledWith(
        {
          name: 'Test result set',
          coverageMode: 'global_eligible',
          defaultImpactCategory: 'climate-change',
          lciaMethodSet: expectedReviewedLciaMethods,
          closureCheckId: 'closure-new',
          requestedScopeHash: 'scope-hash-new',
          policyFingerprint: 'policy-new',
        },
        expect.objectContaining({
          taskSession: expect.objectContaining({
            ownerId: 'owner-a',
            isCurrent: expect.any(Function),
          }),
        }),
      ),
    );
    const runningJob = await screen.findByTestId('data-product-job-worker-job-1');
    expect(within(runningJob).getByLabelText('queued')).toBeInTheDocument();
    expect(runningJob).not.toHaveTextContent('queued');
    expect(runningJob).not.toHaveTextContent('worker-job-1');
    expect(runningJob).not.toHaveTextContent('build-1');

    fireEvent.click(screen.getByTestId('tab-preview'));
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenCalledWith({
        packageId: 'package-1',
        rowOffset: 0,
        rowLimit: 50,
      }),
    );
    expect(await screen.findByText('2026-06-public')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-publication'));
    const publicationPanel = screen.getByTestId('tab-panel-publication');
    fireEvent.change(within(publicationPanel).getByLabelText('Publish result set'), {
      target: { value: 'package-1' },
    });
    fireEvent.change(within(publicationPanel).getByLabelText('Publish default impact category'), {
      target: { value: 'climate-change' },
    });
    fireEvent.change(within(publicationPanel).getByLabelText('Publish reason'), {
      target: { value: 'approve public package' },
    });
    fireEvent.click(within(publicationPanel).getByRole('button', { name: 'Publish result set' }));

    await waitFor(() =>
      expect(mockPublishLciaResultPackage).toHaveBeenCalledWith({
        packageId: 'package-1',
        displayDefaultImpactCategory: 'climate-change',
        reason: 'approve public package',
      }),
    );

    mockListLciaResultPublications.mockResolvedValueOnce({
      data: [
        {
          publicationId: 'publication-1',
          packageId: 'package-1',
          packageName: 'June package',
          packageVersion: '2026-06-public',
          status: 'published',
          isCurrent: true,
          displayDefaultImpactCategory: 'climate-change',
          publishedAt: '2026-06-24T09:00:00Z',
        },
      ],
      error: null,
    });
    fireEvent.click(within(publicationPanel).getByRole('button', { name: 'Refresh publications' }));
    const publicationRow = await screen.findByTestId('data-product-publication-publication-1');
    expect(publicationRow).toHaveTextContent('June package');
    expect(publicationRow).toHaveTextContent('2026-06-public');
    expect(publicationRow).toHaveTextContent('Current');
    expect(within(publicationRow).getByLabelText('published')).toBeInTheDocument();
    const unpublishButton = within(publicationRow).getByRole('button', {
      name: 'Unpublish publication',
    });
    expect(unpublishButton).not.toHaveTextContent('Unpublish publication');
    fireEvent.click(unpublishButton);

    await waitFor(() =>
      expect(mockUnpublishLciaResultPublication).toHaveBeenCalledWith({
        publicationId: 'publication-1',
      }),
    );
  });

  it('submits the canonical LCIA method identity for a reviewed artifact alias', async () => {
    mockLocation = { pathname: '/data-processing', search: '' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [
          {
            id: '9ec743ea-6b00-400d-a53b-61547a3fc03c',
            version: '01.01.000',
            description: 'Reviewed alias',
          },
        ],
      }),
    });

    render(<DataProcessing />);

    await screen.findByText('Reviewed alias (01.01.000)');
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Alias package' },
    });
    fireEvent.change(screen.getByLabelText('Default impact category'), {
      target: { value: '503699e0-eca9-4089-8bf8-e0f49c93e578' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));

    await waitFor(() =>
      expect(mockCreateClosureCheck).toHaveBeenCalledWith({
        resultSetId: TEST_RESULT_SET_ID,
        requestedScope: {
          coverageMode: 'global_eligible',
          lciaMethods: [
            {
              id: '503699e0-eca9-4089-8bf8-e0f49c93e578',
              version: '01.01.000',
            },
          ],
        },
        requestIdempotencyToken: expect.any(String),
      }),
    );
  });

  it('hydrates typed hash tabs and preserves other deep-link parameters when tabs change', async () => {
    mockLocation = {
      pathname: '/data-processing',
      search: '?tab=preview&packageId=package-1',
    };

    render(<DataProcessing />);

    expect(await screen.findByTestId('tab-panel-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-publication'));
    expect(mockHistoryReplace).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search:
        '?tab=publication&packageId=package-1&resultSetId=77777777-7777-4777-8777-777777777777',
    });
    await waitFor(() => expect(mockListLciaResultPublications).toHaveBeenCalledWith({ limit: 50 }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('tab-panel-publication')).getByRole('button', {
          name: 'Refresh publications',
        }),
      ).toHaveAttribute('data-loading', 'false'),
    );
  });

  it('keeps generation blocked until a complete valid closure check succeeds', async () => {
    mockGetClosureCheck.mockReset();
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'blocked',
        certificateValidity: 'unavailable',
        scanCompleteness: 'complete',
        blockerCodes: ['missing_provider', 'missing_reference'],
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    const generationButton = await screen.findByRole(
      'button',
      { name: /Use this check to start calculation|Start a new calculation with this check/ },
      { timeout: 5000 },
    );
    expect(generationButton).toBeDisabled();
    expect(await screen.findByText('Blocked', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('2 blocking issues')).toBeInTheDocument();
    expect(generationButton).toBeDisabled();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });

  it.each(['current_release_required', 'closure_evidence_unavailable'])(
    'maps %s as an execution prerequisite and revokes the displayed certificate',
    async (code) => {
      mockCreateClosureCheck.mockResolvedValueOnce({
        data: null,
        error: { code, message: 'untrusted raw error' },
      });

      render(<DataProcessing />);
      await waitForValidCertificate();
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled();

      // The lightweight Form mock validates every registered field even when
      // validateFields(names) is used, so satisfy the unrelated build name too.
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'certificate preflight' },
      });
      fireEvent.change(screen.getByLabelText('Default impact category'), {
        target: { value: 'climate-change' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));

      expect(
        await screen.findByText(
          'The current public release or snapshot is unavailable; a certificate cannot be issued.',
        ),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: /Use this check to start calculation|Start a new calculation with this check/,
          }),
        ).toBeDisabled(),
      );
      expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
    },
  );

  it('loads closure issues by stable issue id without putting issue details in the task feed', async () => {
    mockListClosureCheckIssues
      .mockResolvedValueOnce({
        data: {
          schemaVersion: 'lcia.scope-closure-issues-page.v1',
          closureCheckId: 'closure-valid',
          issues: [
            {
              issueId: 'issue-1',
              severity: 'blocker',
              blocking: true,
              code: 'missing_provider',
              title: 'Missing provider',
              summary: 'A required provider is unavailable.',
              suggestedAction: 'Publish or select a provider.',
              occurrenceCount: 1,
              affectedRootCount: 1,
            },
          ],
          nextCursor: 'cursor-2',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          schemaVersion: 'lcia.scope-closure-issues-page.v1',
          closureCheckId: 'closure-valid',
          issues: [
            {
              issueId: 'issue-1',
              severity: 'blocker',
              blocking: true,
              code: 'missing_provider',
              title: 'Missing provider',
              occurrenceCount: 1,
              affectedRootCount: 1,
            },
            {
              issueId: 'issue-2',
              severity: 'warning',
              blocking: false,
              code: 'version_ambiguous',
              title: 'Version ambiguity',
              occurrenceCount: 1,
              affectedRootCount: 1,
            },
          ],
        },
        error: null,
      });

    render(<DataProcessing />);

    expect(await screen.findByTestId('closure-issue-issue-1')).toHaveTextContent(
      'Missing provider',
    );
    expect(screen.getByText('Publish or select a provider.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more issues' }));
    expect(await screen.findByTestId('closure-issue-issue-2')).toHaveTextContent(
      'Version ambiguity',
    );
    expect(screen.getAllByTestId('closure-issue-issue-1')).toHaveLength(1);
    expect(mockListClosureCheckIssues).toHaveBeenLastCalledWith('closure-valid', {
      afterIssueId: 'cursor-2',
      limit: 50,
    });
  });

  it('shows an empty closure-issue state without blocking task history rendering', async () => {
    render(<DataProcessing />);
    await waitFor(
      () =>
        expect(mockListClosureCheckIssues).toHaveBeenCalledWith('closure-valid', {
          limit: 50,
        }),
      { timeout: 5000 },
    );
    expect(
      await screen.findByText('No closure issues found.', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('data-product-job-worker-job-1')).toBeInTheDocument();
  });

  it('shows execution diagnostics instead of an empty issue result when closure execution fails', async () => {
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'failed',
        certificateValidity: 'unavailable',
        scanCompleteness: 'unknown',
        workerJob: {
          jobId: 'closure-worker-failed',
          status: 'failed',
          errorCode: 'scope_closure_execution_failed',
        },
      },
      error: null,
    });
    mockDataProductTasks.push({
      schemaVersion: 'task-summary.v2',
      jobId: 'closure-worker-failed',
      jobKind: 'lcia.scope_closure_check',
      category: 'data_product',
      workerStatus: 'failed',
      runState: 'failed',
      domainValidity: 'unknown',
      projectionUpdatedAt: '2026-06-23T10:06:00Z',
      title: 'Data completeness check',
      errorSummary: 'TIDAS validation could not complete its issue stream.',
      capabilities: {
        canCancel: false,
        canDownloadReport: false,
        canOpenWorkbench: true,
        canPreviewResult: false,
      },
    });

    render(<DataProcessing />);

    expect(await screen.findByText('Data completeness check failed to run')).toBeInTheDocument();
    expect(
      screen.getByText('TIDAS validation could not complete its issue stream.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Error code: scope_closure_execution_failed')).toBeInTheDocument();
    expect(screen.getByText('Worker job ID: closure-worker-failed')).toBeInTheDocument();
    expect(screen.queryByText('No closure issues found.')).not.toBeInTheDocument();
    expect(mockListClosureCheckIssues).not.toHaveBeenCalled();
  });

  it('uses the safe execution fallback when a failed closure check has no task projection', async () => {
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'failed',
        certificateValidity: 'unavailable',
        scanCompleteness: 'unknown',
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(
      await screen.findByText(
        'The check did not complete. Retry it; if it fails again, contact an administrator with the identifiers below.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Error code:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Worker job ID:/)).not.toBeInTheDocument();
    expect(mockListClosureCheckIssues).not.toHaveBeenCalled();
  });

  it.each([
    ['cancelled', 'Data completeness check was cancelled. Run a new check to continue.'],
    ['running', 'The check is still running. Closure issues will be available after it completes.'],
  ])('shows the %s closure execution state without loading issues', async (runStatus, message) => {
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus,
        certificateValidity: 'unavailable',
        scanCompleteness: 'unknown',
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mockListClosureCheckIssues).not.toHaveBeenCalled();
  });

  it('shows a closure-issue loading error without blocking task history rendering', async () => {
    mockListClosureCheckIssues.mockResolvedValueOnce({
      data: null,
      error: { message: 'issue page failed' },
    });
    render(<DataProcessing />);
    expect(await screen.findByText('issue page failed')).toBeInTheDocument();
    expect(screen.getByTestId('data-product-job-worker-job-1')).toBeInTheDocument();
  });

  it('uses the closure-issue fallback when the page is unavailable without an error detail', async () => {
    mockListClosureCheckIssues.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    render(<DataProcessing />);
    expect(await screen.findByText('Unable to load issues.')).toBeInTheDocument();
  });

  it('summarizes successful build responses without rendering the raw worker payload', async () => {
    mockCreateLciaResultBuildRequest.mockResolvedValueOnce({
      data: {
        buildId: 'build-with-large-payload',
        workerJobId: 'worker-job-with-large-payload',
        workerJob: {
          payload: {
            input_manifest: {
              processes: [{ id: 'process-from-raw-manifest', version: '01.01.000' }],
            },
          },
        },
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForValidCertificate();
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Large payload package' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    expect(await screen.findByText('Result generation request submitted')).toBeInTheDocument();
    const successAlert = screen
      .getByText('Result generation request submitted')
      .closest('[role=alert]') as HTMLElement;
    expect(within(successAlert).getByText('build-with-large-payload')).toBeInTheDocument();
    expect(within(successAlert).getByText('worker-job-with-large-payload')).toBeInTheDocument();
    expect(screen.queryByText(/input_manifest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/process-from-raw-manifest/)).not.toBeInTheDocument();
  });

  it.each(['success', 'error', 'rejection'])(
    'discards an optimistic build callback after owner generation changes (outcome: %s)',
    async (outcome) => {
      mockDataProductTasks = [];
      let finish: (value: any) => void = () => undefined;
      let reject: (error: Error) => void = () => undefined;
      mockCreateLciaResultBuildRequest.mockReturnValueOnce(
        new Promise((resolve, no) => {
          finish = resolve;
          reject = no;
        }),
      );
      render(<DataProcessing />);
      expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
      await waitForValidCertificate();
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Pending package' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      );
      await waitFor(() => expect(mockCreateLciaResultBuildRequest).toHaveBeenCalledTimes(1));
      const guard = mockCreateLciaResultBuildRequest.mock.calls[0][1].taskSession;
      expect(guard.ownerId).toBe('owner-a');
      expect(guard.isCurrent()).toBe(true);
      mockTaskGeneration = 2;
      expect(guard.isCurrent()).toBe(false);
      await act(async () => {
        if (outcome === 'success')
          finish({ data: { buildId: 'old-build', workerJobId: 'old-worker' }, error: null });
        else if (outcome === 'error')
          finish({ data: null, error: { message: 'stale owner error' } });
        else reject(new Error('stale owner error'));
      });
      expect(mockUpsertDataProductTasks).not.toHaveBeenCalled();
      expect(screen.queryByText('stale owner error')).not.toBeInTheDocument();
      expect(screen.queryByText('Result generation request submitted')).not.toBeInTheDocument();
    },
  );

  it('stops a build before submission when the owner changes during form validation', async () => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const validationStarted = jest.fn();
    const forms = new Set<any>();
    const useForm = Form.useForm;
    const spy = jest.spyOn(Form, 'useForm').mockImplementation((...args: any[]) => {
      const result = useForm(...args);
      forms.add(result[0]);
      return result;
    });
    try {
      render(<DataProcessing />);
      expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
      await waitForValidCertificate();
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Deferred package' },
      });
      const form = [...forms].find(
        (candidate) => candidate.getFieldValue?.('name') === 'Deferred package',
      );
      const validate = form.validateFields;
      form.validateFields = async () => {
        const values = await validate();
        validationStarted();
        await pending;
        return values;
      };
      fireEvent.click(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      );
      await waitFor(() => expect(validationStarted).toHaveBeenCalledTimes(1));
      mockTaskGeneration = null;
      await act(async () => {
        finish();
      });
      expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
      expect(mockUpsertDataProductTasks).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps a newly submitted build visible when the refreshed task feed is still empty', async () => {
    mockDataProductTasks = [];
    mockCreateLciaResultBuildRequest.mockResolvedValueOnce({
      data: {
        buildId: 'build-pending-after-submit',
        workerJobId: 'worker-job-pending-after-submit',
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForValidCertificate();
    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('data-product-jobs-empty')).toHaveTextContent(
      'No result generation tasks',
    );

    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Pending package' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    expect(await screen.findByText('Result generation request submitted')).toBeInTheDocument();
    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('data-product-jobs-empty')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('data-product-job-worker-job-pending-after-submit')).getByLabelText(
        'queued',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('data-product-job-worker-job-pending-after-submit'),
    ).not.toHaveTextContent('queued');
    expect(
      screen.getByTestId('data-product-job-worker-job-pending-after-submit'),
    ).not.toHaveTextContent('worker-job-pending-after-submit');
    expect(screen.getByText('Waiting for worker processing')).toBeInTheDocument();
  });

  it('previews packages directly from completed safe task summaries', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-ready',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'completed',
        domainStatus: 'preview_ready',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:00:00Z',
        title: 'June public result set',
        resultPackageId: 'package-ready',
        progressCounters: { completed: 2037, total: 2037 },
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: true,
        },
      },
    ];

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForValidCertificate();
    const readyJob = await screen.findByTestId('data-product-job-worker-job-ready');
    expect(readyJob).toHaveTextContent('June public result set');
    expect(readyJob).toHaveTextContent('2037');
    expect(within(readyJob).getByLabelText('completed')).toBeInTheDocument();
    expect(readyJob).not.toHaveTextContent('completed');
    expect(readyJob).not.toHaveTextContent('worker-job-ready');
    expect(readyJob).not.toHaveTextContent('build-ready');
    expect(readyJob).not.toHaveTextContent('lcia_result.package_build');
    expect(readyJob).not.toHaveTextContent('package-ready');

    const previewButton = within(readyJob).getByRole('button', { name: 'Preview result set' });
    expect(previewButton).not.toHaveTextContent('Load calculation version');
    fireEvent.click(previewButton);

    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenCalledWith({
        packageId: 'package-ready',
        rowOffset: 0,
        rowLimit: 50,
      }),
    );
    expect(screen.getByTestId('tab-panel-preview')).toBeInTheDocument();
  });

  it('shows projection titles and only server-curated failure summaries', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-ready',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'completed',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:00:00Z',
        title: 'June public result set',
        resultPackageId: 'package-ready',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: true,
        },
      },
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-failed-log',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'failed',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:01:00Z',
        title: 'Failed June result set',
        errorSummary: 'The selected data scope is not calculable.',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: false,
        },
      },
    ];

    render(<DataProcessing />);

    const readyJob = await screen.findByTestId('data-product-job-worker-job-ready');
    expect(readyJob).toHaveTextContent('June public result set');
    expect(readyJob).not.toHaveTextContent('package-ready');

    const failedJob = await screen.findByTestId('data-product-job-worker-job-failed-log');
    expect(failedJob).toHaveTextContent('Failed June result set');
    const failedStatus = within(failedJob).getByLabelText('failed');
    expect(failedStatus).toHaveAttribute(
      'title',
      expect.stringContaining('The selected data scope is not calculable.'),
    );
  });

  it('does not submit a closure check when the reviewed LCIA catalog is unavailable', async () => {
    mockLocation = { pathname: '/data-processing', search: '' };
    mockFetch.mockResolvedValueOnce({ ok: false });
    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    fireEvent.change(await screen.findByLabelText('Result set name'), {
      target: { value: 'Missing LCIA method' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));

    expect(
      await screen.findByText('The reviewed LCIA method catalog is unavailable.'),
    ).toBeInTheDocument();
    expect(mockCreateClosureCheck).not.toHaveBeenCalled();
  });

  it('does not submit a build when a linked certificate has no reviewed LCIA catalog', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Missing LCIA method build' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    expect(
      await screen.findByText('The reviewed LCIA method catalog is unavailable.'),
    ).toBeInTheDocument();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });

  it('renders preview input scope and artifact verification details', async () => {
    mockPreviewLciaResultPackage
      .mockResolvedValueOnce({
        data: {
          summary: {
            packageId: 'package-1',
            packageVersion: '2026-06-public',
            status: 'preview_ready',
            coverageMode: 'global_eligible',
            inputManifestHash: 'input-hash-1',
            defaultImpactCategory: 'climate-change',
            eligibleInputCount: 2,
            includedInputCount: 2,
            availableImpactCategories: ['climate-change', 'acidification'],
          },
          inputManifest: {
            selectionMode: 'all_eligible',
            predicateVersion: 'published-state-code-100-199:latest-per-id:v1',
          },
          inputScope: {
            processCount: 2,
            selectionMode: 'all_eligible',
            predicateVersion: 'published-state-code-100-199:latest-per-id:v1',
            stateCodeCounts: [
              { stateCode: '100', count: 1 },
              { stateCode: '101', count: 1 },
            ],
          },
          detailPage: {
            status: 'ready',
            impactCategoryId: 'climate-change',
            impactKey: 'climate-change',
            impactIndex: 0,
            impactName: 'Climate change',
            impactVersion: '01.00.000',
            unit: 'kg CO2 eq',
            offset: 0,
            limit: 25,
            returnedCount: 2,
            totalCount: 2,
            omittedInputCount: 0,
            rows: [
              {
                rowNumber: 1,
                processId: 'process-a',
                processVersion: '01.00.000',
                processName: 'Portland cement production',
                processIndex: 0,
                stateCode: 100,
                impactCategoryId: 'climate-change',
                impactKey: 'climate-change',
                impactIndex: 0,
                impactName: 'Climate change',
                impactVersion: '01.00.000',
                unit: 'unknown',
                value: 12.5,
              },
              {
                rowNumber: 2,
                processId: 'process-b',
                processVersion: '01.00.001',
                processName: 'Electricity, medium voltage',
                processIndex: 1,
                stateCode: 101,
                impactCategoryId: 'climate-change',
                impactKey: 'climate-change',
                impactIndex: 0,
                impactName: 'Climate change',
                impactVersion: '01.00.000',
                unit: 'unknown',
                value: -0.45,
              },
            ],
          },
          previewWarnings: [
            {
              code: 'preview_impact_metadata_lookup_failed',
              detail: 'optional LCIA method metadata fallback',
            },
          ],
          queryArtifact: {
            artifactFormat: 'all-unit-query:v1',
            artifactByteSize: 831250,
            artifactSha256: 'query-sha-256',
          },
          resultArtifact: {
            artifactFormat: 'hdf5:v1',
            artifactByteSize: 1054768,
            artifactSha256: 'result-sha-256',
          },
          artifactManifest: {
            artifactManifestVersion: 'lcia-result-package-worker.v1',
            resultDiagnostics: {
              storage: 'object_storage',
              persist_mode: 's3-strict',
            },
            snapshotBuilder: {
              resolved_snapshot_id: 'snapshot-resolved',
              stdout_tail:
                '[matrix] process_count=2 flow_count=3 impact_count=25 a_nnz=4 b_nnz=5 c_nnz=6\n[coverage] unique_match=9.15 any_match=35.44 singular_risk=medium',
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          detailPage: {
            status: 'ready',
            impactCategoryId: 'climate-change',
            impactKey: 'climate-change',
            impactName: 'Climate change',
            impactVersion: '01.00.000',
            unit: 'kg CO2 eq',
            offset: 0,
            limit: 100,
            returnedCount: 2,
            totalCount: 2,
            rows: [
              {
                rowNumber: 1,
                processId: 'process-a',
                processName: 'Portland cement production',
                processVersion: '01.00.000',
                stateCode: 100,
                value: 12.5,
              },
              {
                rowNumber: 2,
                processId: 'process-b',
                processName: 'Electricity, medium voltage',
                processVersion: '01.00.001',
                stateCode: 101,
                value: -0.45,
              },
            ],
          },
        },
        error: null,
      });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForValidCertificate();
    fireEvent.click(screen.getByTestId('tab-preview'));
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

    expect(await screen.findByText('Input scope')).toBeInTheDocument();
    expect(screen.getByText('published-state-code-100-199:latest-per-id:v1')).toBeInTheDocument();
    expect(screen.getByText('100: 1')).toBeInTheDocument();
    expect(screen.getByText('101: 1')).toBeInTheDocument();
    expect(screen.queryByText('process-a@01.00.000')).not.toBeInTheDocument();
    expect(screen.queryByText('process-b@01.00.001')).not.toBeInTheDocument();
    expect(screen.queryByText('Input data')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation results')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Result details' })).toBeInTheDocument();
    const processLink = screen.getByRole('link', { name: 'Portland cement production' });
    expect(processLink).toHaveAttribute(
      'href',
      '/mydata/processes?id=process-a&version=01.00.000&mode=view',
    );
    fireEvent.click(processLink);
    expect(mockHistoryPush).toHaveBeenCalledWith(
      '/mydata/processes?id=process-a&version=01.00.000&mode=view',
    );
    expect(screen.getByText('Electricity, medium voltage')).toBeInTheDocument();
    expect(screen.queryByText('process-a')).not.toBeInTheDocument();
    expect(screen.queryByText('process-b')).not.toBeInTheDocument();
    expect(screen.getByText('Climate change (01.00.000 / kg CO2 eq)')).toBeInTheDocument();
    expect(screen.getAllByText('01.00.000')).not.toHaveLength(0);
    expect(screen.queryByRole('columnheader', { name: 'LCIA method' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Method version' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Unit' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value (kg CO2 eq)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export all results' })).toBeInTheDocument();
    expect(screen.queryByText('Some preview data could not be loaded')).not.toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('-0.45')).toBeInTheDocument();
    expect(screen.getByText('Artifact verification')).toBeInTheDocument();
    expect(screen.getByText('all-unit-query:v1')).toBeInTheDocument();
    expect(screen.getByText('hdf5:v1')).toBeInTheDocument();
    expect(screen.getByText('query-sha-256')).toBeInTheDocument();
    expect(screen.getByText('result-sha-256')).toBeInTheDocument();
    expect(screen.getByText('object_storage / s3-strict')).toBeInTheDocument();
    expect(screen.getByText('snapshot-resolved')).toBeInTheDocument();
    expect(screen.getByText('process_count=2 flow_count=3 impact_count=25')).toBeInTheDocument();
    expect(
      screen.getByText('unique_match=9.15 any_match=35.44 singular_risk=medium'),
    ).toBeInTheDocument();

    expect(screen.queryByRole('dialog', { name: 'Process results' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'View results' })[0]);
    expect(screen.getByTestId('selected-result-process')).toHaveTextContent('process-a@01.00.000');
    expect(screen.getByTestId('calculation-bundle-panel')).toHaveTextContent('package-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('calculation-bundle-panel')).not.toBeInTheDocument();

    const reads = mockPreviewLciaResultPackage.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Export all results' }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: expect.stringContaining('tab=exports') }),
    );
    expect(mockPreviewLciaResultPackage).toHaveBeenCalledTimes(reads);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows one retryable unavailable state, preserves diagnostics and recovers zero values', async () => {
    mockLocation.search = '?tab=preview&packageId=package-1';
    const data = {
      summary: { packageId: 'package-1', defaultImpactCategory: 'climate-change' },
      artifactManifest: { snapshotSource: { snapshotId: 'certified-snapshot' } },
      detailPage: {
        status: 'unavailable',
        reason: 'result_projection_artifacts_unavailable',
        offset: 0,
        limit: 50,
        totalCount: 1,
        returnedCount: 1,
        rows: [
          {
            rowNumber: 1,
            processId: 'process-a',
            processName: 'Cement',
            processVersion: '01.00.000',
            value: null,
          },
        ],
      },
      previewWarnings: [{ code: 'query_artifact_shape_invalid', detail: 'v2 jobId is invalid' }],
    };
    mockPreviewLciaResultPackage
      .mockResolvedValueOnce({ data, error: null })
      .mockResolvedValueOnce({
        data: {
          ...data,
          previewWarnings: [],
          detailPage: {
            ...data.detailPage,
            status: 'ready',
            reason: undefined,
            rows: [{ ...data.detailPage.rows[0], value: 0 }],
          },
        },
        error: null,
      });
    render(<DataProcessing />);
    expect(
      await screen.findByText('Calculation results are not available for this preview.'),
    ).toBeInTheDocument();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).not.toHaveTextContent('result_projection_artifacts_unavailable');
    expect(screen.queryByText('Result preview loaded')).not.toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('certified-snapshot')).toBeInTheDocument();
    expect(screen.getByText(/v2 jobId is invalid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('cell', { name: '0' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
      packageId: 'package-1',
      impactCategoryId: 'climate-change',
      rowOffset: 0,
      rowLimit: 50,
    });
  });

  it('resets to the first page when changing page size and keeps the size for method changes', async () => {
    mockLocation.search = '?tab=preview&packageId=package-1';
    mockPreviewLciaResultPackage.mockImplementation(
      async ({ rowLimit, rowOffset, impactCategoryId }) => ({
        data: {
          summary: { packageId: 'package-1', defaultImpactCategory: 'climate-change' },
          detailPage: {
            status: 'ready',
            offset: rowLimit === 50 ? 50 : rowOffset,
            limit: rowLimit,
            totalCount: 200,
            impactCategoryId: impactCategoryId || 'climate-change',
            rows: [],
          },
          impactOptions: [
            { impactCategoryId: 'climate-change', impactName: 'Climate change' },
            { impactCategoryId: 'acidification', impactName: 'Acidification' },
          ],
        },
        error: null,
      }),
    );
    render(<DataProcessing />);
    const sizeSelect = await screen.findByRole('combobox', { name: 'Page Size' });
    fireEvent.mouseDown(sizeSelect);
    fireEvent.click(await screen.findByTitle('20 / page'));
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'climate-change',
        rowOffset: 0,
        rowLimit: 20,
      }),
    );
    fireEvent.change(screen.getByLabelText('LCIA method'), { target: { value: 'acidification' } });
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'acidification',
        rowOffset: 0,
        rowLimit: 20,
      }),
    );
  });

  it('paginates preview details, switches impact categories, and renders preview warnings', async () => {
    const previewPayload = (offset: number, returnedCount = 50) => ({
      data: {
        summary: {
          packageId: 'package-1',
          packageVersion: '2026-06-public',
          status: 'preview_ready',
          defaultImpactCategory: 'climate-change',
        },
        detailPage: {
          status: 'ready',
          impactCategoryId: 'climate-change',
          impactName: 'Climate change',
          impactVersion: '01.00.000',
          unit: 'kg CO2 eq',
          offset,
          limit: 50,
          returnedCount,
          totalCount: 160,
          rows: [
            {
              rowNumber: offset + 1,
              processId: 'process-without-version',
              processName: 'Process without version',
              stateCode: 100,
              value: null,
            },
            {
              rowNumber: offset + 2,
              processId: 'process-without-name',
              stateCode: 100,
              value: 2.5,
            },
            {
              rowNumber: offset + 3,
              stateCode: 100,
              value: 3.5,
            },
          ],
        },
        impactOptions: [
          {
            impactCategoryId: 'climate-change',
            impactName: 'Climate change',
            impactVersion: '01.00.000',
            unit: 'kg CO2 eq',
          },
          {
            impactCategoryId: 'acidification',
            impactName: 'Acidification',
            impactVersion: '01.00.000',
            unit: 'mol H+ eq',
          },
          {
            impactName: 'Impact without id',
          },
          {
            impactCategoryId: 'no-suffix-impact',
            impactName: 'No suffix impact',
          },
          {
            impactCategoryId: 'suffix-without-local-label',
            impactName: 'Suffix without local label',
            impactVersion: '99.00.000',
            unit: 'points',
          },
        ],
        previewWarnings: [{ code: 'partial_process_name_lookup_failed' }],
      },
      error: null,
    });
    mockPreviewLciaResultPackage
      .mockResolvedValueOnce(previewPayload(50))
      .mockResolvedValueOnce(previewPayload(100, 50))
      .mockResolvedValueOnce(previewPayload(50))
      .mockResolvedValueOnce({
        data: {
          ...previewPayload(0).data,
          detailPage: {
            ...previewPayload(0).data.detailPage,
            impactCategoryId: 'acidification',
            unit: 'mol H+ eq',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...previewPayload(0).data,
          detailPage: {
            ...previewPayload(0).data.detailPage,
            impactCategoryId: 'no-suffix-impact',
            unit: undefined,
          },
        },
        error: null,
      });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    fireEvent.click(screen.getByTestId('tab-preview'));
    await waitForReadyPreviewPackage();
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

    expect(await screen.findByText('Some preview data could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('Process without version')).toBeInTheDocument();
    expect(screen.getByText('process-without-name')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Process without version' })).not.toBeInTheDocument();
    expect(screen.getByTitle('2')).toHaveClass('ant-pagination-item-active');

    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'climate-change',
        rowOffset: 100,
        rowLimit: 50,
      }),
    );
    await waitFor(() => expect(screen.getByTitle('3')).toHaveClass('ant-pagination-item-active'));

    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'climate-change',
        rowOffset: 50,
        rowLimit: 50,
      }),
    );

    fireEvent.change(screen.getByLabelText('LCIA method'), {
      target: { value: 'acidification' },
    });
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'acidification',
        rowOffset: 0,
        rowLimit: 50,
      }),
    );
    expect(
      await screen.findByRole('columnheader', { name: 'Value (mol H+ eq)' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('LCIA method'), {
      target: { value: 'no-suffix-impact' },
    });
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenLastCalledWith({
        packageId: 'package-1',
        impactCategoryId: 'no-suffix-impact',
        rowOffset: 0,
        rowLimit: 50,
      }),
    );
  });

  it('uses local impact labels without version suffixes in preview details', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [{ id: 'plain-impact', version: '01.00.000', description: 'Plain impact' }],
      }),
    });
    mockPreviewLciaResultPackage.mockResolvedValueOnce({
      data: {
        summary: {
          packageId: 'package-1',
          packageVersion: '2026-06-public',
          status: 'preview_ready',
        },
        detailPage: {
          status: 'ready',
          impactCategoryId: 'plain-impact',
          offset: 0,
          limit: 25,
          returnedCount: 1,
          totalCount: 1,
          rows: [
            {
              rowNumber: 1,
              processId: 'process-a',
              processVersion: '01.00.000',
              processName: 'Process A',
              stateCode: 100,
              value: 1,
            },
          ],
        },
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await screen.findByText('Plain impact (01.00.000)');
    fireEvent.click(screen.getByTestId('tab-preview'));
    await waitForReadyPreviewPackage();
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

    expect(await screen.findByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
  });

  it.each(['unpublished', null])(
    'handles command errors and sparse payload %s for managers',
    async (unpublishData) => {
      mockDataProductTasks = [];
      mockCreateLciaResultBuildRequest.mockResolvedValueOnce({
        data: null,
        error: {},
      });
      mockPreviewLciaResultPackage.mockResolvedValueOnce({
        data: {},
        error: null,
      });
      mockPreviewLciaResultPackage.mockResolvedValueOnce({
        data: null,
        error: { message: 'preview failed' },
      });
      mockPublishLciaResultPackage.mockResolvedValueOnce({
        data: null,
        error: { message: 'publish failed' },
      });
      mockUnpublishLciaResultPublication.mockResolvedValueOnce({
        data: unpublishData,
        error: null,
      });

      render(<DataProcessing />);

      expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
      await waitForValidCertificate();
      await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('data-product-jobs-empty')).toHaveTextContent(
        'No result generation tasks',
      );

      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Sparse package' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      );

      await waitFor(() =>
        expect(mockCreateLciaResultBuildRequest).toHaveBeenCalledWith(
          {
            name: 'Test result set',
            coverageMode: 'global_eligible',
            lciaMethodSet: expectedReviewedLciaMethods,
            closureCheckId: 'closure-valid',
            requestedScopeHash: 'scope-hash-valid',
            policyFingerprint: 'policy-valid',
          },
          expect.objectContaining({
            taskSession: expect.objectContaining({
              ownerId: 'owner-a',
              isCurrent: expect.any(Function),
            }),
          }),
        ),
      );
      expect(await screen.findByText('Command failed')).toBeInTheDocument();

      mockDataProductTasks = [
        {
          schemaVersion: 'task-summary.v2',
          jobId: 'worker-job-ready-after-error',
          jobKind: 'lcia_result.package_build',
          category: 'data_product',
          workerStatus: 'completed',
          domainValidity: 'none',
          projectionUpdatedAt: '2026-06-23T10:00:00Z',
          title: 'Preview-ready package',
          resultPackageId: 'package-1',
          capabilities: {
            canCancel: false,
            canDownloadReport: false,
            canOpenWorkbench: true,
            canPreviewResult: true,
          },
        },
      ];
      await act(async () => {
        taskListeners.forEach((listener) => listener());
      });

      fireEvent.click(screen.getByRole('button', { name: 'Refresh jobs' }));
      await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByTestId('tab-preview'));
      await waitForReadyPreviewPackage();
      fireEvent.change(screen.getByLabelText('Calculation version'), {
        target: { value: 'package-1' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

      await waitFor(() =>
        expect(mockPreviewLciaResultPackage).toHaveBeenCalledWith({
          packageId: 'package-1',
          rowOffset: 0,
          rowLimit: 50,
        }),
      );
      expect(await screen.findByText('Result set overview')).toBeInTheDocument();
      expect(screen.getByText('Input scope')).toBeInTheDocument();
      expect(screen.getByText('Artifact verification')).toBeInTheDocument();
      expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(5);

      fireEvent.change(screen.getByLabelText('Calculation version'), {
        target: { value: 'package-1' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

      await waitFor(() => expect(mockPreviewLciaResultPackage).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('preview failed')).toBeInTheDocument();
      expect(screen.queryByTestId('descriptions')).not.toBeInTheDocument();

      mockListLciaResultPublications.mockResolvedValueOnce({
        data: [
          {
            publicationId: 'publication-sparse',
            packageId: 'package-1',
            packageName: 'Sparse package',
            packageVersion: '2026-06-public',
            status: 'current',
            isCurrent: true,
          },
          {
            packageId: 'package-without-publication-id',
            packageName: 'Unpublished package',
            packageVersion: '2026-06-old',
            status: 'unpublished',
          },
          {
            packageName: 'Publication without package id',
            packageVersion: '2026-05-old',
            status: 'unpublished',
          },
        ],
        error: null,
      });
      fireEvent.click(screen.getByTestId('tab-publication'));
      const publicationPanel = screen.getByTestId('tab-panel-publication');
      fireEvent.change(within(publicationPanel).getByLabelText('Publish result set'), {
        target: { value: 'package-1' },
      });
      fireEvent.change(within(publicationPanel).getByLabelText('Publish default impact category'), {
        target: { value: 'climate-change' },
      });
      fireEvent.click(within(publicationPanel).getByRole('button', { name: 'Publish result set' }));

      await waitFor(() =>
        expect(mockPublishLciaResultPackage).toHaveBeenCalledWith({
          packageId: 'package-1',
          displayDefaultImpactCategory: 'climate-change',
        }),
      );
      expect(await screen.findByText('publish failed')).toBeInTheDocument();

      const publicationRow = await screen.findByTestId(
        'data-product-publication-publication-sparse',
      );
      expect(screen.queryByText('Unpublished package')).not.toBeInTheDocument();
      fireEvent.click(
        within(publicationRow).getByRole('button', { name: 'Unpublish publication' }),
      );

      await waitFor(() =>
        expect(mockUnpublishLciaResultPublication).toHaveBeenCalledWith({
          publicationId: 'publication-sparse',
        }),
      );
      expect(await screen.findByText('Publication unpublished')).toBeInTheDocument();
      expect(screen.queryAllByText('unpublished')).toHaveLength(unpublishData ? 1 : 0);
    },
  );

  it('handles failed method metadata loading and sparse task summaries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'job-0',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'failed',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:00:00Z',
        title: 'Result set generation',
        errorSummary: 'job failed',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: false,
        },
      },
    ];

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForTestResultSetLoaded();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/lciamethods/list.json'));
    expect(screen.getByLabelText('Default impact category')).not.toHaveTextContent(
      'Climate change',
    );
    expect(screen.getByTestId('data-product-job-job-0')).toHaveTextContent('Result set generation');
    expect(
      within(screen.getByTestId('data-product-job-job-0')).getByLabelText('failed'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('data-product-job-job-0')).not.toHaveTextContent('failed');
    expect(
      within(screen.getByTestId('data-product-job-job-0')).getByLabelText('failed'),
    ).toHaveAttribute('title', expect.stringContaining('job failed'));
  });

  it('renders only the safe failure summaries carried by task projections', async () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'worker-job-failed-log',
        jobKind: 'lcia_result.package_build',
        category: 'data_product',
        workerStatus: 'failed',
        domainValidity: 'none',
        projectionUpdatedAt: '2026-06-23T10:00:00Z',
        title: 'Result generation',
        errorSummary: 'The selected process is outside the calculable input scope.',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: false,
        },
      },
    ];

    render(<DataProcessing />);

    const job = await screen.findByTestId('data-product-job-worker-job-failed-log');
    expect(within(job).getByLabelText('failed')).toHaveAttribute(
      'title',
      expect.stringContaining('The selected process is outside the calculable input scope.'),
    );
  });

  it('deduplicates publication loading when the tab opens before the mount request settles', async () => {
    mockInjectResultSet = false;
    let resolvePublications!: (value: {
      data: Array<Record<string, unknown>>;
      error: null;
    }) => void;
    const pendingPublications = new Promise<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>((resolve) => {
      resolvePublications = resolve;
    });
    mockListLciaResultPublications.mockImplementationOnce(() => pendingPublications);

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitFor(() => expect(mockListLciaResultPublications).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('tab-publication'));
    fireEvent.click(
      within(screen.getByTestId('tab-panel-publication')).getByRole('button', {
        name: 'Refresh publications',
      }),
    );
    expect(mockListLciaResultPublications).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePublications({
        data: [
          {
            publicationId: 'publication-delayed',
            packageId: 'package-delayed',
            packageName: 'Delayed publication',
            status: 'published',
            isCurrent: true,
          },
        ],
        error: null,
      });
      await pendingPublications;
    });

    expect(
      await screen.findByTestId('data-product-publication-publication-delayed'),
    ).toHaveTextContent('Delayed publication');
  });

  it('lists current publications first and unpublishes from the management list', async () => {
    mockInjectResultSet = false;
    mockListLciaResultPublications.mockResolvedValueOnce({
      data: [
        {
          publicationId: 'publication-old',
          packageId: 'package-old',
          packageName: 'May result set',
          packageVersion: '2026-05-public',
          status: 'unpublished',
          isCurrent: false,
          displayDefaultImpactCategory: 'acidification',
          publishedAt: '2026-05-20T09:00:00Z',
          unpublishedAt: '2026-06-01T09:00:00Z',
        },
        {
          publicationId: 'publication-current',
          packageId: 'package-current',
          packageName: 'June result set',
          packageVersion: '2026-06-public',
          status: 'published',
          isCurrent: true,
          displayDefaultImpactCategory: 'climate-change',
          publishedAt: '2026-06-24T09:00:00Z',
        },
        {
          status: 'unpublished',
          packageName: 'Unidentified result set',
        },
      ],
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    fireEvent.click(screen.getByTestId('tab-publication'));

    await waitFor(
      () => expect(mockListLciaResultPublications).toHaveBeenCalledWith({ limit: 50 }),
      { timeout: 5000 },
    );
    const currentRow = await screen.findByTestId(
      'data-product-publication-publication-current',
      undefined,
      { timeout: 5000 },
    );
    const oldRow = screen.getByTestId('data-product-publication-publication-old');
    expect(screen.getByTestId('data-product-publication-2')).toHaveTextContent(
      'Unidentified result set',
    );
    expect(currentRow.compareDocumentPosition(oldRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(currentRow).toHaveTextContent('June result set');
    expect(currentRow).toHaveTextContent('2026-06-public');
    expect(currentRow).toHaveTextContent('Current');
    expect(currentRow).toHaveTextContent('Climate change');
    expect(within(currentRow).getByLabelText('published')).toBeInTheDocument();
    expect(currentRow).not.toHaveTextContent('published');
    expect(oldRow).toHaveTextContent('May result set');
    expect(within(oldRow).getByLabelText('unpublished')).toBeInTheDocument();
    expect(oldRow).not.toHaveTextContent('unpublished');
    expect(oldRow).not.toHaveTextContent('Current');

    const unpublishButton = within(currentRow).getByRole('button', {
      name: 'Unpublish publication',
    });
    expect(unpublishButton).not.toHaveTextContent('Unpublish publication');
    fireEvent.click(unpublishButton);

    await waitFor(() =>
      expect(mockUnpublishLciaResultPublication).toHaveBeenCalledWith({
        publicationId: 'publication-current',
      }),
    );
  });

  it('renders sparse publication rows without exposing an unavailable unpublish action', async () => {
    mockInjectResultSet = false;
    mockListLciaResultPublications.mockResolvedValueOnce({
      data: [
        {
          packageId: 'package-only',
          status: 'unpublished',
          isCurrent: false,
          includedInputCount: 4,
          displayDefaultImpactCategory: 'unknown-impact',
        },
        {
          publicationId: 'publication-with-eligible-only',
          packageVersion: '2026-06-public',
          status: 'blocked',
          eligibleInputCount: 6,
          unpublishedAt: '2026-06-24T08:30:00Z',
        },
        {
          publicationId: 'publication-empty',
        },
      ],
      error: { message: 'publication list warning' },
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    fireEvent.click(screen.getByTestId('tab-publication'));

    expect(await screen.findByText('publication list warning')).toBeInTheDocument();
    const packageOnlyRow = await screen.findByTestId('data-product-publication-1');
    expect(packageOnlyRow).toHaveTextContent('package-only');
    expect(packageOnlyRow).toHaveTextContent('unknown-impact');
    expect(packageOnlyRow).toHaveTextContent('4/-');
    expect(
      within(packageOnlyRow).queryByRole('button', { name: 'Unpublish publication' }),
    ).toBeNull();

    const eligibleOnlyRow = await screen.findByTestId(
      'data-product-publication-publication-with-eligible-only',
    );
    expect(eligibleOnlyRow).toHaveTextContent('2026-06-public');
    expect(eligibleOnlyRow).toHaveTextContent('-/6');
    expect(eligibleOnlyRow).toHaveTextContent('-');
    expect(within(eligibleOnlyRow).getByLabelText('blocked')).toBeInTheDocument();

    const emptyRow = await screen.findByTestId('data-product-publication-publication-empty');
    expect(emptyRow).toHaveTextContent('-');
    expect(within(emptyRow).getByLabelText('-')).toBeInTheDocument();
  });

  it('renders an empty publication list when the response omits data rows', async () => {
    mockListLciaResultPublications.mockResolvedValueOnce({
      data: undefined,
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    fireEvent.click(screen.getByTestId('tab-publication'));

    expect(await screen.findByTestId('data-product-publications-empty')).toHaveTextContent(
      'No publications yet',
    );
  });

  it('surfaces thrown command errors and falls back when locale is unavailable', async () => {
    mockLocale = undefined;
    mockPreviewLciaResultPackage.mockReset();
    mockPreviewLciaResultPackage.mockRejectedValueOnce('plain preview failure');
    mockCreateLciaResultBuildRequest.mockRejectedValueOnce(new Error('build exploded'));

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
    await waitForValidCertificate();
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Throwing package' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    expect(await screen.findByText('build exploded')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-preview'));
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));

    expect(await screen.findByText('plain preview failure')).toBeInTheDocument();
  });

  it('surfaces non-Error task refresh failures and rejects a certificate without binding hashes', async () => {
    mockRefreshDataProductTasks.mockRejectedValueOnce('task feed unavailable');
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
      },
      error: null,
    });

    render(<DataProcessing />);

    expect(await screen.findByText('task feed unavailable')).toBeInTheDocument();
    mockRefreshDataProductTasks.mockRejectedValueOnce(new Error('task feed exploded'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh jobs' }));
    expect(await screen.findByText('task feed exploded')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Unbound certificate' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Use this check to start calculation|Start a new calculation with this check/,
      }),
    );

    expect(
      await screen.findByText(
        'Run a complete data check for the current selection before generating a result set.',
      ),
    ).toBeInTheDocument();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'closure summary failed' }, 'closure summary failed'],
    [null, 'Command failed'],
  ])(
    'surfaces an unavailable post-create closure summary',
    async (summaryError, expectedMessage) => {
      mockLocation = { pathname: '/data-processing', search: '' };
      mockGetClosureCheck.mockResolvedValueOnce({
        data: null,
        error: summaryError,
      });

      render(<DataProcessing />);

      expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
      await waitForTestResultSetLoaded();
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Closure summary check' },
      });
      fireEvent.change(screen.getByLabelText('Default impact category'), {
        target: { value: 'climate-change' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));

      expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    },
  );

  it('uses the idempotency fallback and keeps the certificate when only the default display changes', async () => {
    mockLocation = { pathname: '/data-processing', search: '' };
    mockGetClosureCheck.mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-new',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-new',
        policyFingerprint: 'policy-new',
        artifacts: contractArtifacts(),
      },
      error: null,
    });
    const originalRandomUuid = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });

    try {
      render(<DataProcessing />);

      expect(await screen.findByTestId('page-title')).toHaveTextContent('Data Processing');
      await waitForTestResultSetLoaded();
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Fallback token check' },
      });
      fireEvent.change(screen.getByLabelText('Coverage mode'), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByLabelText('Default impact category'), {
        target: { value: 'climate-change' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));

      await waitFor(() =>
        expect(mockCreateClosureCheck).toHaveBeenCalledWith(
          expect.objectContaining({
            requestIdempotencyToken: expect.stringMatching(/^closure-check-\d+-[a-z0-9]+$/),
          }),
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: /Use this check to start calculation|Start a new calculation with this check/,
          }),
        ).not.toBeDisabled(),
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      );
      await waitFor(() =>
        expect(mockCreateLciaResultBuildRequest).toHaveBeenCalledWith(
          expect.objectContaining({ coverageMode: 'global_eligible' }),
          expect.objectContaining({
            taskSession: expect.objectContaining({
              ownerId: 'owner-a',
              isCurrent: expect.any(Function),
            }),
          }),
        ),
      );

      fireEvent.change(screen.getByLabelText('Default impact category'), {
        target: { value: 'acidification' },
      });
      expect(
        screen.queryByText(
          'The current selection differs from this check. Run a new check before generating.',
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Use this check to start calculation|Start a new calculation with this check/,
        }),
      ).not.toBeDisabled();
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: originalRandomUuid,
      });
    }
  });

  it('renders ready and pending primary roles independently with semantic metadata', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-29T00:00:00Z'));
    try {
      render(<DataProcessing />);
      await waitForValidCertificate();

      const report = screen.getByTestId('closure-artifact-closure_report_xlsx');
      const manifest = screen.getByTestId('closure-artifact-closure_issue_manifest');
      expect(within(report).getByText(/Available until: 2026-08-05 00:00/)).toBeInTheDocument();
      expect(within(report).getByText('closure-issues.xlsx')).toBeInTheDocument();
      expect(within(report).getByText(/xlsx.*1\.0 KB/)).toBeInTheDocument();
      expect(within(report).getByText('a'.repeat(64))).toBeInTheDocument();
      expect(within(manifest).getByText('Machine result manifest')).toBeInTheDocument();
      expect(within(manifest).getByText('Preparing this artifact.')).toBeInTheDocument();
      expect(
        within(manifest).queryByRole('button', { name: 'Download machine result manifest' }),
      ).toBeNull();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('polls an exact pending projection until both primary downloads are ready, then stops', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-29T00:00:00Z'));
    mockGetClosureCheck
      .mockReset()
      .mockResolvedValueOnce({
        data: closureSummary(['pending', 'pending'], {
          runStatus: 'queued',
          certificateValidity: 'unavailable',
          scanCompleteness: 'unknown',
          workerJob: { jobId: 'closure-worker-poll', status: 'queued' },
        }),
        error: null,
      })
      .mockResolvedValueOnce({ data: closureSummary(['ready', 'ready']), error: null });

    try {
      render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText('Preparing this artifact.')).toHaveLength(2);

      await act(async () => {
        jest.advanceTimersByTime(2_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Download issue report' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Download machine result manifest' }),
      ).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts the same bounded polling after creating a queued closure check', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-29T00:00:00Z'));
    mockLocation = { pathname: '/data-processing', search: '' };
    mockGetClosureCheck
      .mockReset()
      .mockResolvedValueOnce({
        data: closureSummary(['pending', 'pending'], {
          closureCheckId: 'closure-new',
          runStatus: 'queued',
          certificateValidity: 'unavailable',
          scanCompleteness: 'unknown',
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: closureSummary(['ready', 'ready'], { closureCheckId: 'closure-new' }),
        error: null,
      });

    try {
      render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.change(screen.getByLabelText('Result set name'), {
        target: { value: 'Created polling' },
      });
      fireEvent.change(screen.getByLabelText('Default impact category'), {
        target: { value: 'climate-change' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getAllByText('Preparing this artifact.')).toHaveLength(2);

      await act(async () => {
        jest.advanceTimersByTime(2_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Download issue report' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps pending polling after the configured maximum attempts', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-29T00:00:00Z'));
    const pending = closureSummary(['pending', 'pending'], {
      runStatus: 'running',
      certificateValidity: 'unavailable',
      scanCompleteness: 'unknown',
    });
    mockGetClosureCheck.mockReset().mockResolvedValue({ data: pending, error: null });

    try {
      const view = render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      for (let attempt = 0; attempt < 35; attempt += 1) {
        await act(async () => {
          jest.advanceTimersByTime(2_000);
          await Promise.resolve();
          await Promise.resolve();
        });
      }
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(31);
      view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a stale summary response after the closure id changes', async () => {
    let resolveOld: ((value: { data: Record<string, unknown>; error: null }) => void) | undefined;
    const oldResponse = new Promise<{ data: Record<string, unknown>; error: null }>((resolve) => {
      resolveOld = resolve;
    });
    mockGetClosureCheck.mockReset().mockImplementation((closureCheckId: string) =>
      closureCheckId === 'closure-valid'
        ? oldResponse
        : Promise.resolve({
            data: closureSummary(['ready', 'ready'], {
              closureCheckId: 'closure-replacement',
              artifacts: contractArtifacts(['ready', 'ready']).map(
                (artifact: Record<string, unknown>) => ({
                  ...artifact,
                  filename:
                    artifact.artifactRole === 'closure_report_xlsx'
                      ? 'replacement.xlsx'
                      : 'replacement-manifest.json',
                }),
              ),
            }),
            error: null,
          }),
    );

    const view = render(<DataProcessing />);
    await waitFor(() => expect(mockGetClosureCheck).toHaveBeenCalledWith('closure-valid'));
    mockLocation = {
      pathname: '/data-processing',
      search: '?closureCheckId=closure-replacement',
    };
    view.rerender(<DataProcessing />);
    expect(await screen.findByText('replacement.xlsx')).toBeInTheDocument();
    await act(async () => {
      resolveOld?.({
        data: closureSummary(['pending', 'pending'], {
          runStatus: 'running',
          certificateValidity: 'unavailable',
          scanCompleteness: 'unknown',
        }),
        error: null,
      });
      await oldResponse;
    });
    expect(screen.getByText('replacement.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('Preparing this artifact.')).toBeNull();
  });

  it('refreshes a pending summary immediately when its task subscription becomes terminal', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-29T00:00:00Z'));
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'closure-worker-event',
        jobKind: 'lcia.scope_closure_check',
        category: 'data_product',
        workerStatus: 'running',
        runState: 'active',
        domainValidity: 'pending',
        projectionUpdatedAt: '2026-07-29T00:00:00Z',
        title: 'Data completeness check',
        capabilities: {},
      },
    ];
    mockGetClosureCheck
      .mockReset()
      .mockResolvedValueOnce({
        data: closureSummary(['pending', 'pending'], {
          runStatus: 'running',
          certificateValidity: 'unavailable',
          scanCompleteness: 'unknown',
          workerJob: { jobId: 'closure-worker-event', status: 'running' },
        }),
        error: null,
      })
      .mockResolvedValueOnce({ data: closureSummary(['ready', 'ready']), error: null });

    try {
      render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      mockDataProductTasks = [
        {
          ...mockDataProductTasks[0],
          workerStatus: 'completed',
          runState: 'succeeded',
          domainValidity: 'valid',
          projectionUpdatedAt: '2026-07-29T00:00:01Z',
        },
      ];
      await act(async () => {
        taskListeners.forEach((listener) => listener());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Download issue report' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shares one in-flight refresh between polling and a terminal task event', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-29T00:00:00Z'));
    let resolveRefresh:
      ((value: { data: Record<string, unknown>; error: null }) => void) | undefined;
    const pendingRefresh = new Promise<{ data: Record<string, unknown>; error: null }>(
      (resolve) => {
        resolveRefresh = resolve;
      },
    );
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        jobId: 'closure-worker-flight',
        jobKind: 'lcia.scope_closure_check',
        category: 'data_product',
        workerStatus: 'running',
        runState: 'active',
        domainValidity: 'pending',
        projectionUpdatedAt: '2026-07-29T00:00:00Z',
        title: 'Data completeness check',
        capabilities: {},
      },
    ];
    mockGetClosureCheck
      .mockReset()
      .mockResolvedValueOnce({
        data: closureSummary(['pending', 'pending'], {
          runStatus: 'running',
          certificateValidity: 'unavailable',
          scanCompleteness: 'unknown',
          workerJob: { jobId: 'closure-worker-flight', status: 'running' },
        }),
        error: null,
      })
      .mockReturnValueOnce(pendingRefresh);

    try {
      render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(2_000);
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);

      mockDataProductTasks = [
        {
          ...mockDataProductTasks[0],
          workerStatus: 'completed',
          runState: 'succeeded',
          domainValidity: 'valid',
          projectionUpdatedAt: '2026-07-29T00:00:01Z',
        },
      ];
      await act(async () => {
        taskListeners.forEach((listener) => listener());
        await Promise.resolve();
      });
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveRefresh?.({ data: closureSummary(['ready', 'ready']), error: null });
        await pendingRefresh;
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: 'Download issue report' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('expires ready artifacts at the client deadline without another network request', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-08-04T23:59:59Z'));
    mockGetClosureCheck.mockReset().mockResolvedValue({
      data: closureSummary(['ready', 'ready']),
      error: null,
    });

    try {
      render(<DataProcessing />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: 'Download issue report' })).toBeInTheDocument();
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(1_000);
        await Promise.resolve();
      });
      expect(screen.queryByRole('button', { name: 'Download issue report' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Download machine result manifest' })).toBeNull();
      expect(
        screen.getAllByText(
          'This artifact has expired. Run the data completeness check again to prepare a new download.',
        ),
      ).toHaveLength(2);
      expect(mockGetClosureCheck).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('serializes every recovery entry until the request settles, then permits a retry', async () => {
    let resolveFirstRecovery:
      ((value: { data: Record<string, unknown>; error: null }) => void) | undefined;
    const firstRecovery = new Promise<{ data: Record<string, unknown>; error: null }>((resolve) => {
      resolveFirstRecovery = resolve;
    });
    mockGetClosureCheck
      .mockReset()
      .mockResolvedValueOnce({ data: closureSummary(['expired', 'failed']), error: null })
      .mockResolvedValue({
        data: closureSummary(['ready', 'ready'], { closureCheckId: 'closure-new' }),
        error: null,
      });
    mockCreateClosureCheck
      .mockReset()
      .mockReturnValueOnce(firstRecovery)
      .mockResolvedValue({
        data: {
          closureCheckId: 'closure-new',
          requestedScopeHash: 'scope-hash-new',
          policyFingerprint: 'policy-new',
          workerJob: null,
          reused: false,
        },
        error: null,
      });

    render(<DataProcessing />);
    await waitForValidCertificate();
    fireEvent.change(screen.getByLabelText('Result set name'), {
      target: { value: 'Recovery mutex' },
    });
    fireEvent.change(screen.getByLabelText('Default impact category'), {
      target: { value: 'climate-change' },
    });
    const rerunButtons = screen.getAllByRole('button', { name: 'Run check again' });
    const primaryRecoveryButton = screen.getByRole('button', {
      name: 'Check data completeness',
    });
    act(() => {
      rerunButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      rerunButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      primaryRecoveryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(mockCreateClosureCheck).toHaveBeenCalledTimes(1));
    expect(rerunButtons[0]).toBeDisabled();
    expect(rerunButtons[1]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check data completeness' })).toBeDisabled();

    await act(async () => {
      resolveFirstRecovery?.({
        data: {
          closureCheckId: 'closure-new',
          requestedScopeHash: 'scope-hash-new',
          policyFingerprint: 'policy-new',
          workerJob: null,
          reused: false,
        },
        error: null,
      });
      await firstRecovery;
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check data completeness' })).not.toBeDisabled(),
    );
    expect(mockHistoryReplace).toHaveBeenCalledWith({
      pathname: '/data-processing',
      search:
        '?closureCheckId=closure-new&resultSetId=77777777-7777-4777-8777-777777777777&tab=builds',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));
    await waitFor(() => expect(mockCreateClosureCheck).toHaveBeenCalledTimes(2));
    expect(mockCreateClosureCheck.mock.calls[0][0].requestIdempotencyToken).toEqual(
      expect.any(String),
    );
    expect(mockCreateClosureCheck.mock.calls[1][0].requestIdempotencyToken).not.toBe(
      mockCreateClosureCheck.mock.calls[0][0].requestIdempotencyToken,
    );
  });

  it('does not apply recovery completion after navigation activates another closure id', async () => {
    mockLocation = { pathname: '/data-processing', search: '' };
    let resolveCreatedSummary:
      ((value: { data: Record<string, unknown>; error: null }) => void) | undefined;
    const createdSummary = new Promise<{ data: Record<string, unknown>; error: null }>(
      (resolve) => {
        resolveCreatedSummary = resolve;
      },
    );
    mockCreateClosureCheck.mockReset().mockResolvedValue({
      data: {
        closureCheckId: 'closure-created-stale',
        requestedScopeHash: 'scope-hash-new',
        policyFingerprint: 'policy-new',
        workerJob: null,
        reused: false,
      },
      error: null,
    });
    mockGetClosureCheck.mockReset().mockImplementation((closureCheckId: string) => {
      if (closureCheckId === 'closure-created-stale') return createdSummary;
      return Promise.resolve({
        data: closureSummary(['ready', 'ready'], {
          closureCheckId: 'closure-replacement',
          artifacts: contractArtifacts(['ready', 'ready']).map(
            (artifact: Record<string, unknown>) => ({
              ...artifact,
              filename:
                artifact.artifactRole === 'closure_report_xlsx'
                  ? 'navigation-winner.xlsx'
                  : 'navigation-winner.json',
            }),
          ),
        }),
        error: null,
      });
    });

    const view = render(<DataProcessing />);
    fireEvent.change(await screen.findByLabelText('Result set name'), {
      target: { value: 'Stale recovery' },
    });
    fireEvent.change(screen.getByLabelText('Default impact category'), {
      target: { value: 'climate-change' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check data completeness' }));
    await waitFor(() => expect(mockGetClosureCheck).toHaveBeenCalledWith('closure-created-stale'));

    mockLocation = {
      pathname: '/data-processing',
      search: '?closureCheckId=closure-replacement',
    };
    view.rerender(<DataProcessing />);
    expect(await screen.findByText('navigation-winner.xlsx')).toBeInTheDocument();

    await act(async () => {
      resolveCreatedSummary?.({
        data: closureSummary(['ready', 'ready'], { closureCheckId: 'closure-created-stale' }),
        error: null,
      });
      await createdSummary;
      await Promise.resolve();
    });
    expect(screen.getByText('navigation-winner.xlsx')).toBeInTheDocument();
  });

  it('keeps 404/502 details opaque and opens a valid signed report without buffering', async () => {
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mockCreateClosureReportDownload
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'closure_report_unavailable', message: 'private bucket detail' },
        status: 404,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'edge_upstream_failed', message: 'internal RPC detail' },
        status: 502,
      })
      .mockResolvedValueOnce({
        data: { signedDownloadUrl: 'https://storage.example.test/closure.xlsx' },
        error: null,
      });

    render(<DataProcessing />);
    await waitForValidCertificate();
    const downloadButton = await screen.findByRole('button', { name: 'Download issue report' });

    fireEvent.click(downloadButton);
    expect(
      await screen.findByText('This download is currently unavailable. Please try again later.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('private bucket detail')).toBeNull();

    fireEvent.click(downloadButton);
    expect(
      await screen.findByText('This download is currently unavailable. Please try again later.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('internal RPC detail')).toBeNull();

    const fetchCountBeforeDownload = mockFetch.mock.calls.length;
    fireEvent.click(downloadButton);
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const navigationAnchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(navigationAnchor.href).toBe('https://storage.example.test/closure.xlsx');
    expect(navigationAnchor.target).toBe('_self');
    expect(navigationAnchor.rel).toBe('noopener noreferrer');
    expect(mockFetch).toHaveBeenCalledTimes(fetchCountBeforeDownload);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockCreateClosureReportDownload).toHaveBeenLastCalledWith(
      'closure-valid',
      'closure_report_xlsx',
    );
    clickSpy.mockRestore();
  });

  it('renders independent artifact states and maps a 410 machine download to rerun guidance', async () => {
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mockGetClosureCheck.mockReset().mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-valid',
        policyFingerprint: 'policy-valid',
        artifacts: contractArtifacts(['ready', 'ready']),
      },
      error: null,
    });
    mockCreateClosureReportDownload
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'closure_report_expired', message: 'expired' },
        status: 410,
      })
      .mockResolvedValueOnce({
        data: {
          signedDownloadUrl: 'https://storage.example.test/closure.xlsx',
          filename: 'closure-issues.xlsx',
        },
        error: null,
        status: 200,
      });

    render(<DataProcessing />);
    await waitForValidCertificate();

    expect(screen.getByText('closure-issues.xlsx')).toBeInTheDocument();
    expect(screen.getByText('closure-complete-manifest.json')).toBeInTheDocument();
    expect(screen.getAllByText(/Available until: 2026-08-05 00:00/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Download machine result manifest' }));
    expect(
      await screen.findAllByText(
        'This artifact has expired. Run the data completeness check again to prepare a new download.',
      ),
    ).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Download machine result manifest' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run check again' })).toBeInTheDocument();
    expect(mockCreateClosureReportDownload).toHaveBeenNthCalledWith(
      1,
      'closure-valid',
      'closure_issue_manifest',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download issue report' }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    clickSpy.mockRestore();
  });

  it('presents deleted and failed artifact transport states independently', async () => {
    mockGetClosureCheck.mockReset().mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-valid',
        policyFingerprint: 'policy-valid',
        artifacts: contractArtifacts(['deleted', 'failed']),
      },
      error: null,
    });

    render(<DataProcessing />);
    await waitForValidCertificate();

    expect(screen.getByText('This artifact is unavailable.')).toBeInTheDocument();
    expect(
      screen.getByText('Artifact preparation failed. Run the data completeness check again.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download issue report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download machine result manifest' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run check again' })).toBeInTheDocument();
  });

  it('renders backend expiry separately from a missing artifact projection', async () => {
    mockGetClosureCheck.mockReset().mockResolvedValue({
      data: {
        schemaVersion: 'lcia.scope-closure-check.v1',
        closureCheckId: 'closure-valid',
        runStatus: 'passed',
        certificateValidity: 'valid',
        scanCompleteness: 'complete',
        requestedScopeHash: 'scope-hash-valid',
        policyFingerprint: 'policy-valid',
        artifacts: contractArtifacts(['expired', 'deleted']),
      },
      error: null,
    });

    render(<DataProcessing />);
    await waitForValidCertificate();

    expect(
      screen.getByText(
        'This artifact has expired. Run the data completeness check again to prepare a new download.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('This artifact is unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run check again' })).toBeInTheDocument();
  });

  it('safely renders both primary roles unavailable when the artifact projection is missing', async () => {
    mockGetClosureCheck.mockReset().mockResolvedValue({
      data: {
        ...closureSummary(['ready', 'ready']),
        artifacts: undefined,
      },
      error: null,
    });

    render(<DataProcessing />);
    await waitForValidCertificate();

    expect(screen.getAllByText('This artifact is unavailable.')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Download issue report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download machine result manifest' })).toBeNull();
  });

  it('renders access denied for non-manager users', async () => {
    mockGetSystemUserRoleApi.mockResolvedValueOnce({ role: 'member' });

    render(<DataProcessing />);

    expect(await screen.findByTestId('access-denied')).toBeInTheDocument();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });

  it('renders localized Chinese workbench copy and impact category labels', async () => {
    mockLocale = 'zh-CN';

    render(<DataProcessing />);

    expect(await screen.findByTestId('page-title')).toHaveTextContent('数据处理');
    await waitForTestResultSetLoaded();
    expect(screen.getByTestId('tab-builds')).toHaveTextContent('结果生成');
    expect(screen.getByTestId('tab-preview')).toHaveTextContent('结果预览');
    expect(screen.getByTestId('tab-publication')).toHaveTextContent('发布');
    expect(screen.getByLabelText('默认影响类别')).toHaveTextContent('气候变化');
    expect(screen.getByRole('button', { name: /使用此检查开始(新)?计算/ })).toBeInTheDocument();
  });

  it('renders access denied when role lookup fails', async () => {
    mockGetSystemUserRoleApi.mockRejectedValueOnce(new Error('role lookup failed'));

    render(<DataProcessing />);

    expect(await screen.findByTestId('access-denied')).toBeInTheDocument();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });
  it('localizes the matrix diagnostic while retaining evidence and existing calculation decisions', async () => {
    mockListClosureCheckIssues.mockResolvedValue({
      data: {
        issues: [
          {
            issueId: 'matrix-1',
            code: 'matrix_readiness_singular_risk_medium',
            severity: 'warning',
            title: 'Raw matrix token',
            summary: 'Raw matrix detail',
            suggestedAction: 'Raw action',
          },
        ],
      },
      error: null,
    });
    render(<DataProcessing />);
    expect(await screen.findByText('Review calculation matrix stability')).toBeInTheDocument();
    expect(screen.getByText('Raw matrix detail')).toBeInTheDocument();
    expect(screen.getByText('Raw action')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View results' }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: expect.stringContaining('tab=preview') }),
    );
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });

  it('opens an exact process/version deep link without selecting an arbitrary process', async () => {
    mockLocation.search =
      '?tab=preview&packageId=package-1&processId=process-a&processVersion=01.00.000';
    render(<DataProcessing />);
    expect(await screen.findByTestId('selected-result-process')).toHaveTextContent(
      'process-a@01.00.000',
    );
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open result downloads' }));
    expect(screen.queryByRole('dialog', { name: 'Process results' })).not.toBeInTheDocument();
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: expect.stringContaining('tab=exports') }),
    );
  });

  it('keeps directory filters on entry and return without exposing workflow tabs in the list', async () => {
    mockInjectResultSet = false;
    mockLocation = { pathname: '/data-processing', search: '?rsQuery=Test&rsPage=2' };
    const view = render(<DataProcessing />);
    await waitForTestResultSetLoaded();
    expect(screen.queryByTestId('tab-builds')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search loaded names or IDs'), {
      target: { value: 'changed' },
    });
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: expect.stringContaining('rsQuery=changed') }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test result set' }));
    expect(mockHistoryPush).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: expect.stringContaining('rsQuery=Test&rsPage=2&resultSetId='),
      }),
    );
    mockLocation.search = `?rsQuery=Test&rsPage=2&resultSetId=${TEST_RESULT_SET_ID}&tab=preview&packageId=package-1`;
    view.rerender(<DataProcessing />);
    await waitFor(() => expect(mockPreviewLciaResultPackage).toHaveBeenCalled());
    expect(screen.queryByTestId('calculation-bundle-panel')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search loaded names or IDs')).not.toBeInTheDocument();
    expect(mockCreateClosureCheck).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tab-exports'));
    fireEvent.click(screen.getByRole('button', { name: 'Review calculation' }));
    expect(mockHistoryReplace).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: expect.stringContaining('tab=builds') }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to result sets' }));
    expect(mockHistoryPush).toHaveBeenLastCalledWith({
      pathname: '/data-processing',
      search: '?rsQuery=Test&rsPage=2',
    });
  });

  it.each(['resolve', 'reject'])(
    'ignores old direct-preview %s after navigation and reports current failures',
    async (outcome) => {
      let settle!: (value: any) => void;
      mockPreviewLciaResultPackage.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            settle = outcome === 'resolve' ? resolve : reject;
          }),
      );
      mockLocation.search = '?tab=preview&packageId=old';
      const view = render(<DataProcessing />);
      await waitFor(() => expect(mockPreviewLciaResultPackage).toHaveBeenCalled());
      mockPreviewLciaResultPackage.mockRejectedValueOnce(new Error('new preview failed'));
      mockLocation.search = '?tab=preview&packageId=new';
      view.rerender(<DataProcessing />);
      expect(await screen.findByText('Error: new preview failed')).toBeInTheDocument();
      await act(async () => {
        settle(
          outcome === 'resolve'
            ? { data: { summary: { packageId: 'old' } }, error: null }
            : new Error('old failure'),
        );
      });
      expect(screen.getByText('Error: new preview failed')).toBeInTheDocument();
      expect(screen.queryByTestId('calculation-bundle-panel')).not.toBeInTheDocument();
    },
  );

  it('closes creation without submitting and handles rejected validation', async () => {
    mockInjectResultSet = false;
    mockLocation.search = '';
    render(<DataProcessing />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create result set' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create result set' }),
    );
    await act(async () => {});
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockCreateLciaResultSet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockCreateLciaResultSet).not.toHaveBeenCalled();
  });
  it.each(['resolve', 'reject', 'linked'])(
    'discards a late %s directory response after unmount',
    async (outcome) => {
      let settle!: (value: any) => void;
      const pending = new Promise((resolve, reject) => {
        settle = outcome === 'reject' ? reject : resolve;
      });
      if (outcome === 'linked') {
        mockListLciaResultSets.mockResolvedValueOnce({ data: { items: [] }, error: null });
        mockGetLciaResultSet.mockReturnValueOnce(pending);
      } else mockListLciaResultSets.mockReturnValueOnce(pending);
      const view = render(<DataProcessing />);
      await waitFor(() =>
        expect(
          outcome === 'linked' ? mockGetLciaResultSet : mockListLciaResultSets,
        ).toHaveBeenCalled(),
      );
      view.unmount();
      await act(async () => {
        settle(
          outcome === 'reject'
            ? new Error('late list failure')
            : { data: { items: [] }, error: null },
        );
      });
    },
  );

  it('discards a manual preview response after leaving its workspace', async () => {
    let settle!: (value: any) => void;
    mockLocation.search = '?tab=preview';
    const view = render(<DataProcessing />);
    await waitForReadyPreviewPackage();
    mockPreviewLciaResultPackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText('Calculation version'), {
      target: { value: 'package-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load calculation version' }));
    await waitFor(() => expect(mockPreviewLciaResultPackage).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      settle({ data: { summary: { packageId: 'package-1' } }, error: null });
    });
  });

  it('shows the current direct-preview service error without requiring a second load', async () => {
    mockLocation.search = '?tab=preview&packageId=broken';
    mockPreviewLciaResultPackage.mockResolvedValueOnce({
      data: null,
      error: { message: 'Version unavailable' },
    });
    render(<DataProcessing />);
    expect(await screen.findByText('Version unavailable')).toBeInTheDocument();
    expect(mockCreateLciaResultBuildRequest).not.toHaveBeenCalled();
  });
  it('clears previous route errors and selects the loaded version method after history navigation', async () => {
    mockLocation.search = '?tab=preview&packageId=broken';
    mockPreviewLciaResultPackage.mockResolvedValueOnce({
      data: null,
      error: { message: 'Previous version unavailable' },
    });
    const view = render(<DataProcessing />);
    expect(await screen.findByText('Previous version unavailable')).toBeInTheDocument();
    mockPreviewLciaResultPackage.mockResolvedValueOnce({
      data: {
        summary: { packageId: 'recovered', defaultImpactCategory: 'method-current' },
        detailPage: {
          status: 'ready',
          impactCategoryId: 'method-current',
          offset: 0,
          limit: 25,
          returnedCount: 25,
          totalCount: 60,
        },
      },
      error: null,
    });
    mockLocation.search = '?tab=preview&packageId=recovered';
    view.rerender(<DataProcessing />);
    await waitFor(() =>
      expect(screen.queryByText('Previous version unavailable')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Previous version unavailable')).not.toBeInTheDocument();
    mockPreviewLciaResultPackage.mockClear();
    // Paging inherits the loaded version's method rather than the previous route.
    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    await waitFor(() =>
      expect(mockPreviewLciaResultPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          packageId: 'recovered',
          impactCategoryId: 'method-current',
          rowOffset: 25,
        }),
      ),
    );
  });
});
