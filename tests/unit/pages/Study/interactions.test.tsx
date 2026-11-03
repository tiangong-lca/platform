import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StudyPage from '@/pages/Study';
import ReportPage from '@/pages/Study/Report';
import SharePage from '@/pages/Study/Share';
import StudyTaskProgress from '@/pages/Study/TaskProgress';
import { StudyRequestError } from '@/services/study/api';
import view from '../../../fixtures/study-report/view-v1.json';

const mockCore = jest.fn(),
  mockAnalysis = jest.fn(),
  mockReview = jest.fn(),
  mockReadArtifact = jest.fn(),
  mockDownload = jest.fn(),
  mockPush = jest.fn(),
  mockSubscribe = jest.fn(),
  mockReadPending = jest.fn(),
  mockRecoverPending = jest.fn(),
  mockSubscribePending = jest.fn();
let mockSearch = '',
  mockActor: string | undefined = 'reviewer-a',
  mockWriteCounter = 0;
jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ id }: { id: string }) => id,
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
  useModel: () => ({ initialState: { currentUser: { userid: mockActor } } }),
  useLocation: () => ({ search: mockSearch }),
  history: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  core: (...args: unknown[]) => mockCore(...args),
  analysis: (...args: unknown[]) => mockAnalysis(...args),
  review: (...args: unknown[]) => mockReview(...args),
  readArtifact: (...args: unknown[]) => mockReadArtifact(...args),
  subscribeStudyIdentityChange: (...args: unknown[]) => mockSubscribe(...args),
  newWriteKey: () => `write-${++mockWriteCounter}`,
  readPendingStudyWrite: (...args: unknown[]) => mockReadPending(...args),
  recoverPendingStudyWrite: (...args: unknown[]) => mockRecoverPending(...args),
  subscribePendingStudyWrites: (...args: unknown[]) => mockSubscribePending(...args),
}));
jest.mock('@/services/study/download', () => ({
  downloadStudyExport: (...args: unknown[]) => mockDownload(...args),
}));

const hash = (character: string) => character.repeat(64);
const contract = {
  kind: 'calculation_contract',
  schema: 'lca.calculation-contract.v1',
  sha256: hash('e'),
};
const study = {
  studyId: 'study-a',
  revision: 4,
  title: 'Frozen owner Study',
  status: 'active',
  currentRevisionId: 'revision-a',
  scope: { kind: 'user', id: 'author-a' },
};
const revision = {
  revisionId: 'revision-a',
  studyId: 'study-a',
  revision: 2,
  status: 'frozen',
  contentHash: hash('a'),
  definition: {
    goal: 'Frozen scope',
    functionalUnit: { amount: '1000', unit: 'kg', referenceFlowId: 'flow-reference' },
    systemBoundary: 'Declared scope',
    methodRefs: [],
    assumptions: [],
  },
  modelPreparationId: 'preparation-a',
  modelRef: { modelRevisionId: 'model-a', contentHash: hash('b') },
};
const artifactRef = {
  type: 'modelInput',
  id: 'input-a',
  contentHash: hash('b'),
  digestScope: 'artifact_bytes_sha256',
  byteSize: 500,
  mediaType: 'application/json',
  schemaVersion: 'lca.study-prepared-input.v1',
};
const preparation = {
  preparationId: 'preparation-a',
  studyId: 'study-a',
  profileId: 'lca.study-explicit-v1',
  calculationContractRef: contract,
  execution: { jobId: 'job-a', status: 'completed' },
  inputArtifactRef: artifactRef,
  inputHash: hash('c'),
  modelRef: { modelRevisionId: 'model-a', contentHash: hash('b') },
};
const scenario = {
  scenarioRevisionId: 'scenario-before',
  scenarioId: 'scenario-a',
  studyId: 'study-a',
  studyRevisionId: 'revision-a',
  revision: 7,
  status: 'frozen',
  contentHash: hash('d'),
  parentScenarioRevisionId: null,
  modelPreparationId: 'preparation-a',
  overrides: [
    { path: '/instances/plant/exchanges/emission/amount', value: 1 },
    { path: '/instances/plant/exchanges/fuel/amount', value: 3 },
  ],
};
const createdScenario = {
  ...scenario,
  scenarioRevisionId: 'scenario-new',
  revision: 1,
  status: 'draft',
  parentScenarioRevisionId: 'scenario-before',
  contentHash: hash('f'),
};
const preparedScenario = {
  ...preparation,
  preparationId: 'preparation-new',
  inputArtifactRef: null,
  inputHash: hash('9'),
};
const frozenScenario = {
  ...createdScenario,
  revision: 2,
  status: 'frozen',
  modelPreparationId: 'preparation-new',
};
const frozenModel = {
  schemaVersion: 'lca.study-prepared-input.v1',
  model: {
    origin: { id: 'origin-a', version: '01.00.000' },
    connections: [],
    cutoffs: [],
    sourceDocuments: [{ identity: { id: 'source-a', version: '01.00.000' }, sha256: hash('8') }],
    qualityFindings: [],
    instances: [
      {
        id: 'plant',
        process: { id: 'process-a', version: '01.00.001' },
        referenceExchangeId: 'reference',
        exchanges: [
          {
            id: 'reference',
            flow: { id: 'flow-reference', version: '01.00.000' },
            amount: 1000,
            unit: 'kg',
          },
          {
            id: 'emission',
            flow: { id: 'flow-emission', version: '01.00.002' },
            amount: 1,
            unit: 'kg',
          },
        ],
      },
    ],
  },
};
const reportState = {
  studyId: 'study-a',
  reportRevisionId: view.report.reportRevisionId,
  reportContentHash: view.report.contentHash,
  reportRevision: 3,
  authorId: 'author-a',
  reviewStateHash: hash('c'),
  currentReviewIds: ['review-current'],
  acceptedReviewIds: ['review-current'],
  finalization: null as null | { finalizationId: string },
  acceptance: 'not_finalized',
  validity: { status: 'current', checkedAt: '2026-11-04T01:00:00Z', reasonCodes: [] },
  checkedAt: '2026-11-04T01:00:00Z',
};
let mockActions: string[] = [],
  mockCoreWrite = true,
  mockCurrentState = { ...reportState };
const requestCalls = (operation: string) =>
  mockReview.mock.calls
    .map(([request]) => request)
    .filter((request) => request.operation === operation);
const coreCalls = (operation: string) =>
  mockCore.mock.calls
    .map(([request]) => request)
    .filter((request) => request.operation === operation);
const selectedReportSearch = () =>
  `?id=${view.report.reportRevisionId}&hash=${view.report.contentHash}`;
const choose = async (label: string, option: string) => {
  const input = await screen.findByRole('combobox', { name: `pages.study.${label}` });
  fireEvent.mouseDown(input.closest('.ant-select-selector') ?? input);
  const choice = await screen.findByText(option, { selector: '.ant-select-item-option-content' });
  fireEvent.click(choice);
};
const waitForReport = () => screen.findByTitle('pages.study.preview');
const completeWrite = async (operation: string) => {
  await waitFor(() => expect(requestCalls(operation)).toHaveLength(1));
  await act(async () => {});
  if (operation === 'member.set') await screen.findByText(study.title);
  else await waitForReport();
};

const nativeComputedStyle = window.getComputedStyle.bind(window);
beforeAll(() => {
  jest
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element) => nativeComputedStyle(element));
});
afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  mockActor = 'reviewer-a';
  mockWriteCounter = 0;
  mockActions = [];
  mockCoreWrite = true;
  mockCurrentState = { ...reportState };
  mockSubscribe.mockReturnValue(() => {});
  mockReadPending.mockResolvedValue({ pending: false, raw: null });
  mockSubscribePending.mockReturnValue(() => {});
  mockCore.mockImplementation(async (request) => {
    if (request.operation === 'capability.read')
      return {
        type: 'capabilities',
        runtimeEnabled: true,
        operations: ['scenario.create', 'model.prepare', 'scenario.freeze', 'run.submit'],
      };
    if (request.operation === 'study.read') return { type: 'study', value: study };
    if (request.operation === 'revision.read') return { type: 'studyRevision', value: revision };
    if (request.operation === 'study.resources.list')
      return {
        type: 'resourcePage',
        kind: request.kind,
        items:
          request.kind === 'modelPreparation'
            ? [{ type: 'modelPreparation', value: preparation }]
            : request.kind === 'scenarioRevision'
              ? [{ type: 'scenarioRevision', value: scenario }]
              : [],
        nextCursor: null,
      };
    if (request.operation === 'model.read')
      return {
        type: 'modelPreparation',
        value: request.preparationId === 'preparation-new' ? preparedScenario : preparation,
      };
    if (request.operation === 'scenario.create')
      return { type: 'scenarioRevision', value: createdScenario };
    if (request.operation === 'model.prepare')
      return { type: 'modelPreparation', value: preparedScenario };
    if (request.operation === 'scenario.freeze')
      return { type: 'scenarioRevision', value: frozenScenario };
    if (request.operation === 'run.submit')
      return { type: 'run', value: { runId: 'run-new', studyId: 'study-a' } };
    if (request.operation === 'task.read')
      return {
        type: 'task',
        value: {
          resource: request.resource,
          execution: {
            jobId: `job-${request.resource.id}`,
            status: 'completed',
            progress: 1,
            phase: 'complete',
          },
          errorCode: null,
        },
      };
    throw new Error('Unexpected core request ' + request.operation);
  });
  mockReadArtifact.mockResolvedValue(frozenModel);
  mockAnalysis.mockResolvedValue({ type: 'resourcePage', items: [], nextCursor: null });
  mockReview.mockImplementation(async (request) => {
    if (request.operation === 'resource.actions')
      return {
        type: 'actions',
        resource: request.resource,
        actions: mockActions,
        corePermissions: { read: true, write: mockCoreWrite },
        allowedMemberRoles: ['reviewer'],
      };
    if (request.operation === 'capability.read')
      return {
        type: 'capabilities',
        runtimeEnabled: true,
        finalizationProfiles: [
          'lca.study-report-unreviewed.v1',
          'lca.study-report-internal-review.v1',
        ],
      };
    if (request.operation === 'report.view')
      return { type: 'view', view, state: mockCurrentState, share: null };
    if (request.operation.endsWith('.list'))
      return { type: 'history', items: [], nextCursor: null };
    if (request.operation === 'export.request')
      return { type: 'export', value: { exportId: 'export-new' } };
    if (request.operation === 'export.read')
      return {
        type: 'export',
        value: {
          exportId: request.exportId,
          reportRevisionId: view.report.reportRevisionId,
          reportContentHash: view.report.contentHash,
        },
      };
    return { type: 'comment', value: { command: request.operation } };
  });
});

it('creates a new amount scenario, prepares it, freezes its exact revision and submits the bound Run', async () => {
  const predecessorBefore = JSON.stringify(scenario);
  mockSearch = '?id=study-a&view=model';
  render(<StudyPage />);
  await choose('preparation', 'preparation-a / completed');
  expect(await screen.findByRole('region', { name: 'pages.study.model' })).toHaveTextContent(
    'process-a @ 01.00.001',
  );
  const edits = screen.getAllByRole('button', { name: 'pages.study.edit' });
  expect(edits).toHaveLength(2);
  expect(edits[0]).toBeDisabled();
  expect(edits[1]).toBeEnabled();
  fireEvent.click(edits[1]);
  await choose('selectScenario', 'scenario-before');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'pages.study.amount' }), {
    target: { value: '' },
  });
  expect(screen.getByRole('button', { name: 'pages.study.create' })).toBeDisabled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'pages.study.amount' }), {
    target: { value: '2.5' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.create' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.prepare' })).toBeEnabled(),
  );
  expect(coreCalls('scenario.create')[0]).toEqual({
    operation: 'scenario.create',
    studyRevisionId: 'revision-a',
    parentScenarioRevisionId: 'scenario-before',
    overrides: [
      { path: '/instances/plant/exchanges/fuel/amount', value: 3 },
      { path: '/instances/plant/exchanges/emission/amount', value: 2.5 },
    ],
    idempotencyKey: 'write-1',
  });
  expect(screen.getByRole('spinbutton', { name: 'pages.study.amount' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.prepare' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.freeze' })).toBeEnabled(),
  );
  expect(coreCalls('model.prepare')[0]).toEqual({
    operation: 'model.prepare',
    studyId: 'study-a',
    source: {
      type: 'scenarioRevision',
      scenarioRevisionId: 'scenario-new',
      expectedRevision: 1,
      contentHash: hash('f'),
    },
    profileId: preparation.profileId,
    calculationContractRef: contract,
    idempotencyKey: 'write-2',
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.freeze' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.run' })).toBeEnabled(),
  );
  expect(coreCalls('scenario.freeze')[0]).toEqual({
    operation: 'scenario.freeze',
    target: { type: 'scenarioRevision', id: 'scenario-new', expectedRevision: 1 },
    expectedContentHash: hash('f'),
    modelPreparationId: 'preparation-new',
    idempotencyKey: 'write-3',
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.run' }));
  await waitFor(() => expect(coreCalls('run.submit')).toHaveLength(1));
  expect(coreCalls('run.submit')[0]).toEqual({
    operation: 'run.submit',
    studyRevisionId: 'revision-a',
    scenarioRevisionId: 'scenario-new',
    expectedInputHash: hash('9'),
    calculationContractRef: contract,
    profileId: preparation.profileId,
    idempotencyKey: 'write-4',
  });
  expect(JSON.stringify(scenario)).toBe(predecessorBefore);
  expect(await screen.findByText('run-new')).toBeInTheDocument();
  expect(screen.getByText('job-run-new')).toBeInTheDocument();
  expect(screen.getByText('job-preparation-new')).toBeInTheDocument();
  expect(coreCalls('study.read')).toHaveLength(1);
  for (const operation of ['scenario.create', 'model.prepare', 'scenario.freeze', 'run.submit']) {
    expect(mockCore).toHaveBeenCalledWith(expect.objectContaining({ operation }), 'study:study-a');
  }
});

it('honors server core read-only authority for every exchange and preserves exact prepared source identities', async () => {
  mockCoreWrite = false;
  mockSearch = '?id=study-a&view=model';
  render(<StudyPage />);
  await choose('preparation', 'preparation-a / completed');
  await screen.findByRole('region', { name: 'pages.study.model' });
  for (const edit of screen.getAllByRole('button', { name: 'pages.study.edit' }))
    expect(edit).toBeDisabled();
  expect(mockReadArtifact).toHaveBeenCalledWith('study-a', artifactRef);
  expect(screen.getByText(/source-a/)).toHaveTextContent(hash('8'));
  expect(coreCalls('scenario.create')).toHaveLength(0);
});

it('keeps exact numeric strings, partial coverage and unknown facts without inventing ranking', async () => {
  mockSearch = '?id=study-a&view=results';
  const item = {
    analysisId: 'analysis-a',
    configHash: hash('4'),
    factsRef: { ...artifactRef, type: 'analysisFacts', id: 'facts-a' },
    comparability: { status: 'not_comparable', reasonCodes: ['different_units'] },
  };
  mockAnalysis.mockImplementation(async (request) =>
    request.operation === 'analysis.read'
      ? { type: 'analysis', value: item }
      : { type: 'resourcePage', items: [{ type: 'analysis', value: item }], nextCursor: null },
  );
  mockReadArtifact.mockResolvedValue({
    schemaVersion: 'lca.study-analysis-facts.v1',
    analysisId: 'analysis-a',
    configHash: hash('4'),
    comparability: item.comparability,
    inputs: [{ runId: 'run-exact' }],
    coverage: [
      {
        runId: 'run-exact',
        gaps: [{ method: { id: 'method-a', version: '01.00.000' }, inventoryIndex: 2 }],
        qualityFindings: ['Declared coverage gap'],
        completeLciaScores: false,
      },
    ],
    scenarioEvidence: [
      {
        runId: 'run-exact',
        scenarioRevisionId: 'scenario-before',
        contentHash: hash('d'),
        overrides: [{ path: '/instances/a/exchanges/e/amount', value: '2' }],
      },
    ],
    hotspots: [],
    businessPilotQualified: false,
    scientificRankingQualified: false,
    facts: [
      {
        factId: 'partial',
        label: 'Declared subtotal',
        canonicalValue: '1092.8000000000000001',
        unit: 'kg CO2',
        coverage: 'partial',
        runIds: ['run-exact'],
        methodRef: { id: 'method-a', version: '01.00.000' },
      },
      {
        factId: 'unknown',
        label: 'Unknown quantity',
        canonicalValue: null,
        unit: 'kg',
        coverage: 'unknown',
        runIds: ['run-exact'],
        methodRef: null,
      },
      {
        factId: 'zero',
        label: 'True zero',
        canonicalValue: '0',
        unit: 'kg',
        coverage: 'complete',
        runIds: ['run-exact'],
        methodRef: null,
      },
    ],
  });
  render(<StudyPage />);
  await choose('readFacts', 'analysis-a');
  expect(await screen.findByText('1092.8000000000000001')).toBeInTheDocument();
  expect(screen.getByText('pages.study.unknown')).toBeInTheDocument();
  expect(screen.getByText('pages.study.subtotal')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getAllByText(/different_units/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Declared coverage gap/)).toHaveTextContent('businessPilotQualified');
  expect(screen.getByText(/Declared coverage gap/)).toHaveTextContent('scientificRankingQualified');
  expect(screen.getByText(/Declared coverage gap/)).toHaveTextContent('scenarioEvidence');
});

it('binds direct review, one-use OAuth delegation and internal finalization to exact revision state', async () => {
  mockSearch = selectedReportSearch();
  mockActions = [
    'comment.append',
    'review.record',
    'review.delegation.issue',
    'review.delegation.revoke',
    'review.delegation.list',
    'report.finalize',
  ];
  render(<ReportPage />);
  await waitForReport();
  fireEvent.change(screen.getByLabelText('pages.study.comment'), {
    target: { value: 'Bound internal decision' },
  });
  await choose('decision', 'pages.study.reject');
  await choose('predecessorReview', 'review-current');
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.record' }));
  await completeWrite('review.record');
  expect(requestCalls('review.record')[0]).toEqual({
    operation: 'review.record',
    reportRevisionId: view.report.reportRevisionId,
    expectedContentHash: view.report.contentHash,
    reviewClass: 'internal',
    decision: 'reject',
    comment: 'Bound internal decision',
    predecessorReviewId: 'review-current',
    delegationId: null,
    idempotencyKey: 'write-1',
  });
  fireEvent.change(screen.getByLabelText('pages.study.client'), {
    target: { value: 'explicit-oauth-client' },
  });
  fireEvent.change(screen.getByLabelText('pages.study.expires'), {
    target: { value: '2026-11-05T12:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.delegate' }));
  await completeWrite('review.delegation.issue');
  expect(requestCalls('review.delegation.issue')[0]).toEqual({
    operation: 'review.delegation.issue',
    reportRevisionId: view.report.reportRevisionId,
    expectedContentHash: view.report.contentHash,
    clientId: 'explicit-oauth-client',
    reviewClass: 'internal',
    decision: 'reject',
    predecessorReviewId: 'review-current',
    expiresAt: new Date('2026-11-05T12:00').toISOString(),
    idempotencyKey: 'write-2',
  });
  fireEvent.change(screen.getByLabelText('pages.study.delegations'), {
    target: { value: 'delegation-selected' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.revoke' })[0]);
  await completeWrite('review.delegation.revoke');
  expect(requestCalls('review.delegation.revoke')[0]).toEqual({
    operation: 'review.delegation.revoke',
    delegationId: 'delegation-selected',
    idempotencyKey: 'write-3',
  });
  await choose('profile', 'lca.study-report-internal-review.v1');
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.finalize' }));
  await completeWrite('report.finalize');
  expect(requestCalls('report.finalize')[0]).toEqual({
    operation: 'report.finalize',
    target: { type: 'reportRevision', id: view.report.reportRevisionId, expectedRevision: 3 },
    expectedContentHash: view.report.contentHash,
    expectedReviewStateHash: hash('c'),
    profileId: 'lca.study-report-internal-review.v1',
    acceptedReviewIds: ['review-current'],
    idempotencyKey: 'write-4',
  });
  expect(mockCore).not.toHaveBeenCalled();
  for (const operation of [
    'review.record',
    'review.delegation.issue',
    'review.delegation.revoke',
    'report.finalize',
  ]) {
    expect(mockReview).toHaveBeenCalledWith(
      expect.objectContaining({ operation }),
      `report:${view.report.reportRevisionId}`,
    );
  }
});

it('uses finalization-bound export result for named share creation and exact revocation', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['export.request', 'share.create', 'share.list', 'share.revoke'];
  mockCurrentState = {
    ...reportState,
    finalization: { finalizationId: 'final-exact' },
    acceptance: 'current',
  };
  render(<ReportPage />);
  await waitForReport();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.export' }));
  await completeWrite('export.request');
  expect(screen.getByLabelText('pages.study.exportId')).toHaveValue('export-new');
  expect(requestCalls('export.request')[0]).toEqual({
    operation: 'export.request',
    reportRevisionId: view.report.reportRevisionId,
    expectedContentHash: view.report.contentHash,
    finalizationId: 'final-exact',
    expectedReviewStateHash: hash('c'),
    rendererVersion: '1.0.0',
    viewModelVersion: 'lca.study-report-view.v1',
    idempotencyKey: 'write-1',
  });
  fireEvent.change(screen.getByLabelText('pages.study.recipient'), {
    target: { value: 'recipient-explicit' },
  });
  fireEvent.change(screen.getByLabelText('pages.study.expires'), {
    target: { value: '2026-11-05T12:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.share' }));
  await completeWrite('share.create');
  expect(requestCalls('share.create')[0]).toEqual({
    operation: 'share.create',
    reportRevisionId: view.report.reportRevisionId,
    expectedContentHash: view.report.contentHash,
    exportId: 'export-new',
    recipientId: 'recipient-explicit',
    disclosurePolicyId: 'lca.study-report-summary-share.v1',
    expiresAt: new Date('2026-11-05T12:00').toISOString(),
    idempotencyKey: 'write-2',
  });
  fireEvent.change(screen.getByLabelText('pages.study.shares'), {
    target: { value: 'share-exact' },
  });
  fireEvent.change(screen.getByLabelText('pages.study.reason'), {
    target: { value: 'Recipient access withdrawn' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.revoke' })[1]);
  await completeWrite('share.revoke');
  expect(requestCalls('share.revoke')[0]).toEqual({
    operation: 'share.revoke',
    shareId: 'share-exact',
    reason: 'Recipient access withdrawn',
    idempotencyKey: 'write-3',
  });
});

it('recovers an ambiguous comment with its original idempotency key and exact content', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['comment.append'];
  let attempts = 0;
  const defaultReview = mockReview.getMockImplementation()!;
  mockReview.mockImplementation(async (request) => {
    if (request.operation === 'comment.append' && ++attempts === 1)
      throw new StudyRequestError('UPSTREAM_UNAVAILABLE', true);
    return defaultReview(request);
  });
  render(<ReportPage />);
  await waitForReport();
  fireEvent.change(screen.getByLabelText('pages.study.comment'), {
    target: { value: 'Original exact comment' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.append' }));
  expect(await screen.findByText('pages.study.pending')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.retry' }));
  await waitFor(() => expect(requestCalls('comment.append')).toHaveLength(2));
  expect(requestCalls('comment.append')[0]).toEqual(requestCalls('comment.append')[1]);
  expect(requestCalls('comment.append')[0].idempotencyKey).toBe('write-1');
});

it('paginates revision-bound comment history and resets to its first page', async () => {
  mockSearch = selectedReportSearch();
  const base = mockReview.getMockImplementation()!;
  mockReview.mockImplementation(async (request) =>
    request.operation === 'comment.list'
      ? {
          type: 'history',
          items: [{ text: request.cursor ? 'second history page' : 'first history page' }],
          nextCursor: request.cursor ? null : 'cursor-next',
        }
      : base(request),
  );
  render(<ReportPage />);
  await waitForReport();
  await screen.findByText(/first history page/);
  const next = screen
    .getAllByRole('button', { name: 'pages.study.next' })
    .find((button) => !button.hasAttribute('disabled'))!;
  fireEvent.click(next);
  await screen.findByText(/second history page/);
  expect(requestCalls('comment.list')[requestCalls('comment.list').length - 1]).toMatchObject({
    reportRevisionId: view.report.reportRevisionId,
    expectedContentHash: view.report.contentHash,
    cursor: 'cursor-next',
    limit: 25,
  });
  const section = screen.getByText(/second history page/).closest('section')!;
  fireEvent.click(within(section).getByRole('button', { name: 'pages.study.refresh' }));
  await screen.findByText(/first history page/);
});

it.each(['revoked', 'expired', 'invalidated'])(
  'disables named-share download when current share is %s',
  async (status) => {
    mockSearch = '?id=share-a';
    mockReview.mockImplementation(async (request) =>
      request.operation === 'resource.actions'
        ? {
            type: 'actions',
            actions: ['share.download'],
            corePermissions: { read: false, write: false },
            allowedMemberRoles: [],
          }
        : {
            type: 'view',
            view,
            state: reportState,
            share: {
              shareId: 'share-a',
              recipientId: 'recipient-a',
              expiresAt: '2026-11-05T01:00:00Z',
              status,
              reportRevisionId: view.report.reportRevisionId,
              reportContentHash: view.report.contentHash,
            },
          },
    );
    render(<SharePage />);
    await waitForReport();
    expect(screen.getByRole('button', { name: 'pages.study.download' })).toBeDisabled();
    expect(mockDownload).not.toHaveBeenCalled();
  },
);

it('clears a named-recipient projection when the admitted account changes and ignores late old replies', async () => {
  mockSearch = '?id=share-a';
  let change = () => {};
  mockSubscribe.mockImplementation((listener) => {
    change = listener;
    return () => {};
  });
  let resolveOld!: (value: unknown) => void;
  const oldReply = new Promise((resolve) => {
    resolveOld = resolve;
  });
  mockReview.mockImplementation(async (request) =>
    request.operation === 'resource.actions'
      ? {
          type: 'actions',
          actions: [],
          corePermissions: { read: false, write: false },
          allowedMemberRoles: [],
        }
      : mockActor === 'reviewer-a'
        ? oldReply
        : Promise.reject(new StudyRequestError('FORBIDDEN', false)),
  );
  render(<SharePage />);
  await waitFor(() =>
    expect(mockReview).toHaveBeenCalledWith({ operation: 'share.view', shareId: 'share-a' }),
  );
  mockActor = 'foreign-actor';
  act(change);
  expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument();
  await act(async () =>
    resolveOld({
      type: 'view',
      view,
      state: reportState,
      share: {
        shareId: 'share-a',
        recipientId: 'reviewer-a',
        expiresAt: '2026-11-05T01:00:00Z',
        status: 'active',
        reportRevisionId: view.report.reportRevisionId,
        reportContentHash: view.report.contentHash,
      },
    }),
  );
  expect(screen.queryByTitle('pages.study.preview')).toBeNull();
  expect(screen.queryByText('reviewer-a')).toBeNull();
  expect(mockCore).not.toHaveBeenCalled();
});

it('uses current server member roles and Study CAS for an explicit registered user, including removal', async () => {
  mockSearch = '?id=study-a';
  mockActions = ['member.set'];
  render(<StudyPage />);
  await screen.findByText(study.title);
  fireEvent.change(screen.getByLabelText('pages.study.member'), {
    target: { value: 'a80c7200-0b81-4c18-9f84-2523c4f40c01' },
  });
  await choose('role', 'reviewer');
  expect(screen.queryByText('editor', { selector: '.ant-select-item-option-content' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.setMember' }));
  await completeWrite('member.set');
  expect(requestCalls('member.set')[0]).toEqual({
    operation: 'member.set',
    target: { type: 'study', id: 'study-a', expectedRevision: 4 },
    memberId: 'a80c7200-0b81-4c18-9f84-2523c4f40c01',
    role: 'reviewer',
    idempotencyKey: 'write-1',
  });
  await choose('role', 'pages.study.remove');
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.setMember' }));
  await waitFor(() => expect(requestCalls('member.set')).toHaveLength(2));
  expect(requestCalls('member.set')[1].role).toBeNull();
  expect(mockReview).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'member.set' }),
    'study:study-a',
  );
});

it('keeps the exact Study identity when navigating the four-view tabs', async () => {
  mockSearch = '?id=study-a';
  render(<StudyPage />);
  await screen.findByText(study.title);
  fireEvent.click(screen.getByRole('tab', { name: 'pages.study.reports' }));
  expect(mockPush).toHaveBeenCalledWith('/studies?id=study-a&view=reports');
});

it('paginates the authenticated Study directory and can return to its first page', async () => {
  mockCore.mockImplementation(async (request) => ({
    type: 'studyPage',
    items: [{ ...study, title: request.cursor ? 'Second Study page' : 'First Study page' }],
    nextCursor: request.cursor ? null : 'study-cursor',
  }));
  render(<StudyPage />);
  await screen.findByText('First Study page');
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.next' }));
  await screen.findByText('Second Study page');
  expect(coreCalls('study.list')[1]).toMatchObject({ cursor: 'study-cursor', limit: 25 });
  const buttons = screen.getAllByRole('button', { name: 'pages.study.refresh' });
  fireEvent.click(buttons[1]);
  await screen.findByText('First Study page');
  expect(coreCalls('study.list')[2].cursor).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.refresh' })[0]);
  await waitFor(() => expect(coreCalls('study.list')).toHaveLength(4));
});

it('paginates exact revision resources without substituting a latest dataset read', async () => {
  mockSearch = '?id=study-a';
  const base = mockCore.getMockImplementation()!;
  mockCore.mockImplementation(async (request) =>
    request.operation === 'study.resources.list' && request.kind === 'studyRevision'
      ? {
          type: 'resourcePage',
          items: [
            {
              type: 'studyRevision',
              value: { revisionId: request.cursor ? 'revision-page-two' : 'revision-page-one' },
            },
          ],
          nextCursor: request.cursor ? null : 'revision-cursor',
        }
      : base(request),
  );
  render(<StudyPage />);
  await screen.findByText(/revision-page-one/);
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.next' }));
  await screen.findByText(/revision-page-two/);
  expect(
    coreCalls('study.resources.list').filter((request) => request.kind === 'studyRevision')[1],
  ).toMatchObject({
    studyId: 'study-a',
    kind: 'studyRevision',
    cursor: 'revision-cursor',
    limit: 25,
  });
});

it('paginates frozen report revisions with exact content-hash links', async () => {
  mockSearch = '?id=study-a&view=reports';
  mockAnalysis.mockImplementation(async (request) => ({
    type: 'resourcePage',
    items: [
      {
        type: 'reportRevision',
        value: {
          reportRevisionId: request.cursor ? 'report-second' : 'report-first',
          contentHash: request.cursor ? hash('2') : hash('1'),
        },
      },
    ],
    nextCursor: request.cursor ? null : 'report-cursor',
  }));
  render(<StudyPage />);
  expect(await screen.findByRole('link', { name: 'report-first' })).toHaveAttribute(
    'href',
    `#/study-report?id=report-first&hash=${hash('1')}`,
  );
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.next' }));
  expect(await screen.findByRole('link', { name: 'report-second' })).toHaveAttribute(
    'href',
    `#/study-report?id=report-second&hash=${hash('2')}`,
  );
  expect(mockAnalysis).toHaveBeenLastCalledWith({
    operation: 'study.resources.list',
    studyId: 'study-a',
    kind: 'reportRevision',
    cursor: 'report-cursor',
    limit: 25,
  });
});

it('paginates analyses and displays an unavailable facts artifact without fabricating values', async () => {
  mockSearch = '?id=study-a&view=results';
  mockAnalysis.mockImplementation(async (request) =>
    request.operation === 'analysis.read'
      ? {
          type: 'analysis',
          value: {
            analysisId: 'analysis-pending',
            factsRef: null,
            execution: { status: 'running' },
          },
        }
      : {
          type: 'resourcePage',
          items: [
            {
              type: 'analysis',
              value: { analysisId: request.cursor ? 'analysis-pending' : 'analysis-initial' },
            },
          ],
          nextCursor: request.cursor ? null : 'analysis-cursor',
        },
  );
  render(<StudyPage />);
  await screen.findByRole('combobox', { name: 'pages.study.readFacts' });
  const next = screen
    .getAllByRole('button', { name: 'pages.study.next' })
    .find((button) => !button.hasAttribute('disabled'))!;
  fireEvent.click(next);
  await choose('readFacts', 'analysis-pending');
  await screen.findByText(/"status": "running"/);
  expect(mockReadArtifact).not.toHaveBeenCalled();
  expect(screen.queryByText('pages.study.unknown')).toBeNull();
});

it.each([
  ['absent model record', null, 'REFERENCE_MISMATCH'],
  [
    'unsupported prepared schema',
    { ...frozenModel, schemaVersion: 'unreviewed-schema' },
    'UNSUPPORTED_SCHEMA',
  ],
  [
    'non-array instances',
    { ...frozenModel, model: { ...frozenModel.model, instances: {} } },
    'REFERENCE_MISMATCH',
  ],
  [
    'non-string instance identity',
    {
      ...frozenModel,
      model: { ...frozenModel.model, instances: [{ ...frozenModel.model.instances[0], id: 42 }] },
    },
    'REFERENCE_MISMATCH',
  ],
  [
    'nonfinite amount',
    {
      ...frozenModel,
      model: {
        ...frozenModel.model,
        instances: [
          {
            ...frozenModel.model.instances[0],
            exchanges: [{ ...frozenModel.model.instances[0].exchanges[0], amount: Infinity }],
          },
        ],
      },
    },
    'REFERENCE_MISMATCH',
  ],
])('fails closed when the frozen artifact has %s', async (_description, artifact, errorCode) => {
  mockSearch = '?id=study-a&view=model';
  mockReadArtifact.mockResolvedValue(artifact);
  render(<StudyPage />);
  await choose('preparation', 'preparation-a / completed');
  expect(await screen.findByText(errorCode as string)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'pages.study.model' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'pages.study.edit' })).toBeNull();
});

it('shows pending preparation state without inventing a model artifact', async () => {
  mockSearch = '?id=study-a&view=model';
  const base = mockCore.getMockImplementation()!;
  mockCore.mockImplementation(async (request) =>
    request.operation === 'model.read'
      ? {
          type: 'modelPreparation',
          value: {
            ...preparation,
            inputArtifactRef: null,
            execution: { status: 'running', jobId: 'pending-prepare' },
          },
        }
      : base(request),
  );
  render(<StudyPage />);
  await choose('preparation', 'preparation-a / completed');
  expect(await screen.findByText(/pending-prepare/)).toBeInTheDocument();
  expect(mockReadArtifact).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'pages.study.model' })).toBeNull();
});

it('rejects facts from a foreign analysis before displaying their quantities', async () => {
  mockSearch = '?id=study-a&view=results';
  const item = {
    analysisId: 'analysis-a',
    configHash: hash('4'),
    factsRef: { ...artifactRef, type: 'analysisFacts' },
  };
  mockAnalysis.mockImplementation(async (request) =>
    request.operation === 'analysis.read'
      ? { type: 'analysis', value: item }
      : { type: 'resourcePage', items: [{ type: 'analysis', value: item }], nextCursor: null },
  );
  mockReadArtifact.mockResolvedValue({
    schemaVersion: 'lca.study-analysis-facts.v1',
    analysisId: 'foreign-analysis',
    configHash: hash('4'),
    facts: [{ canonicalValue: 'secret-quantity' }],
  });
  render(<StudyPage />);
  await choose('readFacts', 'analysis-a');
  expect(await screen.findByText('REFERENCE_MISMATCH')).toBeInTheDocument();
  expect(screen.queryByText('secret-quantity')).toBeNull();
});

it('refreshes current report authority and downloads only after exact export actions authorize it', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['export.download'];
  render(<ReportPage />);
  await waitForReport();
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.refresh' })[0]);
  await waitFor(() => expect(requestCalls('report.view')).toHaveLength(2));
  await waitForReport();
  fireEvent.change(screen.getByLabelText('pages.study.exportId'), {
    target: { value: 'export-explicit' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.download' })).toBeEnabled(),
  );
  expect(requestCalls('resource.actions')).toContainEqual({
    operation: 'resource.actions',
    resource: { type: 'export', id: 'export-explicit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.download' }));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('export', 'export-explicit'));
});

it('uses empty accepted-review IDs for the explicitly unreviewed finalization profile', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['report.finalize'];
  render(<ReportPage />);
  await waitForReport();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.finalize' }));
  await completeWrite('report.finalize');
  expect(requestCalls('report.finalize')[0]).toMatchObject({
    profileId: 'lca.study-report-unreviewed.v1',
    acceptedReviewIds: [],
    expectedReviewStateHash: hash('c'),
  });
});

it('surfaces a determinate stale-CAS denial without offering an unsafe automatic retry', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['report.finalize'];
  const base = mockReview.getMockImplementation()!;
  mockReview.mockImplementation(async (request) => {
    if (request.operation === 'report.finalize')
      throw new StudyRequestError('REVISION_CONFLICT', false);
    return base(request);
  });
  render(<ReportPage />);
  await waitForReport();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.finalize' }));
  expect(await screen.findByText('REVISION_CONFLICT')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'pages.study.retry' })).toBeNull();
});

it('shows an empty Study overview when no frozen revision has been selected', async () => {
  mockSearch = '?id=study-a';
  const base = mockCore.getMockImplementation()!;
  mockCore.mockImplementation(async (request) =>
    request.operation === 'study.read'
      ? { type: 'study', value: { ...study, currentRevisionId: null } }
      : base(request),
  );
  render(<StudyPage />);
  await screen.findByText(study.title);
  expect(screen.getByText('pages.study.empty')).toBeInTheDocument();
  expect(screen.queryByText('Frozen scope')).toBeNull();
  expect(coreCalls('revision.read')).toHaveLength(0);
});

it('retains no cached resource projection before an actor is admitted', () => {
  mockActor = undefined;
  mockSearch = '?id=invalid/path';
  render(<SharePage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  expect(mockCore).not.toHaveBeenCalled();
  expect(mockReview).not.toHaveBeenCalled();
});

it('clears a selected predecessor before recording an explicitly initial review decision', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['comment.append', 'review.record'];
  render(<ReportPage />);
  await waitForReport();
  fireEvent.change(screen.getByLabelText('pages.study.comment'), {
    target: { value: 'New decision with no predecessor' },
  });
  await choose('predecessorReview', 'review-current');
  const select = screen
    .getByRole('combobox', { name: 'pages.study.predecessorReview' })
    .closest('.ant-select')!;
  const clear = select.querySelector('.ant-select-clear')!;
  expect(clear).not.toBeNull();
  fireEvent.click(clear);
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.record' }));
  await completeWrite('review.record');
  expect(requestCalls('review.record')[0]).toMatchObject({
    predecessorReviewId: null,
    delegationId: null,
  });
});

it('refreshes actual task progress with the shared status and fraction presentation', async () => {
  let refreshed = false;
  mockCore.mockImplementation(async (request) => ({
    type: 'task',
    value: {
      resource: request.resource,
      execution: {
        jobId: 'actual-task-job',
        status: refreshed ? 'failed' : 'queued',
        progress: refreshed ? 0.4 : null,
        phase: refreshed ? 'model_prepare' : null,
      },
      errorCode: refreshed ? 'native_execution_failed' : null,
    },
  }));
  render(
    <StudyTaskProgress
      studyId='study-a'
      resource={{ type: 'modelPreparation', id: 'preparation-new' }}
    />,
  );
  expect(await screen.findByText('active')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
  refreshed = true;
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.refresh' }));
  expect(await screen.findByText('native_execution_failed')).toBeInTheDocument();
  expect(screen.getByText('failed')).toBeInTheDocument();
  expect(screen.getByText('model_prepare')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  expect(mockCore).toHaveBeenLastCalledWith({
    operation: 'task.read',
    studyId: 'study-a',
    resource: { type: 'modelPreparation', id: 'preparation-new' },
  });
});

it('keeps export download disabled for a foreign report binding even when that export is otherwise accessible', async () => {
  mockSearch = selectedReportSearch();
  mockActions = ['export.download'];
  const base = mockReview.getMockImplementation()!;
  mockReview.mockImplementation(async (request) =>
    request.operation === 'export.read'
      ? {
          type: 'export',
          value: {
            exportId: request.exportId,
            reportRevisionId: 'foreign-report',
            reportContentHash: hash('b'),
          },
        }
      : base(request),
  );
  render(<ReportPage />);
  await waitForReport();
  fireEvent.change(screen.getByLabelText('pages.study.exportId'), {
    target: { value: 'foreign-export' },
  });
  await waitFor(() => expect(requestCalls('export.read')).toHaveLength(1));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'pages.study.download' })).toBeDisabled();
  expect(mockDownload).not.toHaveBeenCalled();
});
