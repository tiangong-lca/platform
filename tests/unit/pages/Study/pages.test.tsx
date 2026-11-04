import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudyPage from '@/pages/Study';
import ReportPage from '@/pages/Study/Report';
import SharePage from '@/pages/Study/Share';
import view from '../../../fixtures/study-report/view-v1.json';
import {
  resolveRouteViewState,
  getRouteViewStateVariantIds,
} from '@/services/general/routeViewState';
const mockMethod = jest.fn();
const mockCore = jest.fn(),
  mockAnalysis = jest.fn(),
  mockReview = jest.fn(),
  mockDownload = jest.fn(),
  mockPush = jest.fn();
let mockSearch = '',
  mockActor = 'reviewer-a';
jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ id }: { id: string }) => id,
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
  useModel: () => ({ initialState: { currentUser: { userid: mockActor } } }),
  useLocation: () => ({ search: mockSearch }),
  history: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  core: (...args: unknown[]) => mockCore(...args),
  method: (...args: unknown[]) => mockMethod(...args),
  analysis: (...args: unknown[]) => mockAnalysis(...args),
  review: (...args: unknown[]) => mockReview(...args),
  subscribeStudyIdentityChange: () => () => {},
  newWriteKey: () => 'original-key',
  readPendingStudyWrite: async () => ({ pending: false, raw: null }),
  recoverPendingStudyWrite: jest.fn(),
  retirePendingStudyWrite: jest.fn(),
  subscribePendingStudyWrites: () => () => {},
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));
jest.mock('@/services/study/download', () => ({
  downloadStudyExport: (...args: unknown[]) => mockDownload(...args),
}));
const study = {
  studyId: 'study-a',
  revision: 4,
  scope: { kind: 'user', id: 'author-a' },
  title: 'Exact frozen study',
  status: 'active',
  currentRevisionId: 'revision-a',
};
const revision = {
  revisionId: 'revision-a',
  revision: 1,
  status: 'frozen',
  contentHash: 'a'.repeat(64),
  definition: {
    goal: 'Frozen functional demand',
    functionalUnit: { amount: '1000', unit: 'kg', referenceFlowId: 'flow-a' },
    systemBoundary: 'Declared upstream boundary',
    methodRefs: [],
    assumptions: [],
  },
  modelPreparationId: 'preparation-a',
  modelRef: { modelRevisionId: 'model-a', contentHash: 'b'.repeat(64) },
};
const state = {
  studyId: 'study-a',
  reportRevisionId: view.report.reportRevisionId,
  reportContentHash: view.report.contentHash,
  reportRevision: 2,
  authorId: 'author-a',
  reviewStateHash: 'c'.repeat(64),
  currentReviewIds: ['review-a'],
  acceptedReviewIds: ['review-a'],
  finalization: null,
  acceptance: 'not_finalized',
  validity: { status: 'current', checkedAt: '2026-11-04T01:00:00Z', reasonCodes: [] },
  checkedAt: '2026-11-04T01:00:00Z',
};
let actions: string[] = [];
const reportSearch = () => `?id=${view.report.reportRevisionId}&hash=${view.report.contentHash}`;
async function chooseReportFamily(option: string) {
  const input = screen.getByRole('combobox', { name: 'pages.study.reportFamily' });
  await act(async () => fireEvent.mouseDown(input));
  const choice = await screen.findByText(option, { selector: '.ant-select-item-option-content' });
  await act(async () => fireEvent.click(choice));
  await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  mockActor = 'reviewer-a';
  actions = [];
  mockCore.mockImplementation(async (request) => {
    if (request.operation === 'study.list')
      return { type: 'studyPage', items: [study], nextCursor: null };
    if (request.operation === 'capability.read')
      return { type: 'capabilities', runtimeEnabled: true, operations: [] };
    if (request.operation === 'study.read') return { type: 'study', value: study };
    if (request.operation === 'revision.read') return { type: 'studyRevision', value: revision };
    if (request.operation === 'study.resources.list')
      return { type: 'resourcePage', kind: request.kind, items: [], nextCursor: null };
    throw new Error('Unexpected core operation ' + request.operation);
  });
  mockAnalysis.mockImplementation(async (request) => ({
    type: 'resourcePage',
    kind: request.kind,
    items: [],
    nextCursor: null,
  }));
  mockReview.mockImplementation(async (request) => {
    if (request.operation === 'resource.actions')
      return {
        type: 'actions',
        resource: request.resource,
        actions,
        corePermissions: { read: true, write: false },
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
    if (request.operation === 'report.view') return { type: 'view', view, state, share: null };
    if (request.operation.endsWith('.list'))
      return { type: 'history', items: [], nextCursor: null };
    if (request.operation === 'comment.append')
      return { type: 'comment', value: { text: request.text } };
    throw new Error('Unexpected review operation ' + request.operation);
  });
});
it('closes all four typed views and falls back safely', () => {
  expect(getRouteViewStateVariantIds('study-view')).toEqual([
    'overview',
    'model',
    'results',
    'reports',
  ]);
  for (const variant of ['overview', 'model', 'results', 'reports'])
    expect(resolveRouteViewState('study-view', variant)).toBe(variant);
  expect(resolveRouteViewState('study-view', 'foreign')).toBe('overview');
  expect(resolveRouteViewState('study-view', null)).toBe('overview');
});
it('lists authenticated exact identities and supports a direct reviewer report link independent of core read', async () => {
  render(<StudyPage />);
  expect(await screen.findByText(study.title)).toHaveAttribute('href', '#/studies?id=study-a');
  fireEvent.change(screen.getByLabelText('pages.study.reportId'), {
    target: { value: view.report.reportRevisionId },
  });
  fireEvent.change(screen.getByLabelText('pages.study.reportHash'), {
    target: { value: view.report.contentHash },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.openReport' }));
  expect(mockPush).toHaveBeenCalledWith('/study-report' + reportSearch());
});
it.each(['overview', 'model', 'results', 'reports'])(
  'renders the %s view against the same frozen study identity',
  async (tab) => {
    mockSearch = `?id=study-a&view=${tab}`;
    render(<StudyPage />);
    expect(await screen.findByText(study.title)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'pages.study.' + tab })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(mockCore).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'study.read', studyId: 'study-a' }),
    );
  },
);
it('rejects invalid identities and denied core permission before raw model/source reads', async () => {
  mockSearch = '?id=/foreign';
  const invalid = render(<StudyPage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  expect(mockCore).not.toHaveBeenCalled();
  invalid.unmount();
  mockSearch = '?id=study-a';
  mockReview.mockResolvedValue({
    type: 'actions',
    actions: [],
    corePermissions: { read: false, write: false },
    allowedMemberRoles: [],
  });
  render(<StudyPage />);
  expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument();
  expect(mockCore).not.toHaveBeenCalledWith(expect.objectContaining({ operation: 'study.read' }));
});
it('opens reviewer-only report without any legacy core access or model tabs and binds comments to exact content', async () => {
  mockSearch = reportSearch();
  actions = ['comment.append', 'comment.list', 'review.list'];
  render(<ReportPage />);
  const frame = await screen.findByTitle('pages.study.preview');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain('Online report preview');
  expect(screen.queryByRole('tab')).toBeNull();
  expect(mockCore).not.toHaveBeenCalled();
  expect(mockAnalysis).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('pages.study.comment'), {
    target: { value: 'Exact revision comment' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.append' }));
  await waitFor(() =>
    expect(mockReview).toHaveBeenCalledWith(
      {
        operation: 'comment.append',
        reportRevisionId: view.report.reportRevisionId,
        expectedContentHash: view.report.contentHash,
        text: 'Exact revision comment',
        idempotencyKey: 'original-key',
      },
      `report:${view.report.reportRevisionId}`,
    ),
  );
});
it('disables author self-approval and finalization without current authority', async () => {
  mockSearch = reportSearch();
  mockActor = 'author-a';
  actions = ['review.record'];
  render(<ReportPage />);
  await screen.findByTitle('pages.study.preview');
  expect(screen.getByRole('button', { name: 'pages.study.record' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'pages.study.finalize' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'pages.study.export' })).toBeDisabled();
});
it('fails closed on missing exact report/share identities', () => {
  const first = render(<ReportPage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  first.unmount();
  render(<SharePage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  expect(mockReview).not.toHaveBeenCalled();
});
it('named recipient sees only authorized share projection and requests only share download', async () => {
  mockSearch = '?id=share-a';
  const share = {
    shareId: 'share-a',
    recipientId: 'reviewer-a',
    expiresAt: '2026-11-05T01:00:00Z',
    status: 'active',
    reportRevisionId: view.report.reportRevisionId,
    reportContentHash: view.report.contentHash,
  };
  mockReview.mockImplementation(async (request) =>
    request.operation === 'resource.actions'
      ? {
          type: 'actions',
          actions: ['share.download'],
          corePermissions: { read: false, write: false },
          allowedMemberRoles: [],
        }
      : { type: 'view', view, state, share },
  );
  render(<SharePage />);
  await screen.findByTitle('pages.study.preview');
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.download' }));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('share', 'share-a'));
  expect(mockCore).not.toHaveBeenCalled();
  expect(mockAnalysis).not.toHaveBeenCalled();
  expect(
    mockReview.mock.calls.every(([request]) =>
      ['resource.actions', 'share.view'].includes(request.operation),
    ),
  ).toBe(true);
});

it('presents frozen functional demand and read-only membership controls in the overview', async () => {
  mockSearch = '?id=study-a&view=overview';
  render(<StudyPage />);
  await screen.findByText(study.title);
  expect(screen.getByText('Frozen functional demand')).toBeInTheDocument();
  expect(screen.getByText('1000 kg / flow-a')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'pages.study.setMember' })).toBeDisabled();
});
it('keeps numerical interpretation limits visible on the results view', async () => {
  mockSearch = '?id=study-a&view=results';
  render(<StudyPage />);
  expect(await screen.findByText('pages.study.noRanking')).toBeInTheDocument();
});

it('selects method V6 inside reports explicitly while retaining the historical default', async () => {
  mockMethod.mockImplementation(async (q) =>
    q.operation === 'capability.read'
      ? { type: 'capabilities', runtimeEnabled: false, operations: [] }
      : { type: 'resourcePage', kind: q.kind, studyId: q.studyId, items: [], nextCursor: null },
  );
  mockSearch = '?id=study-a&view=reports';
  render(<StudyPage />);
  await screen.findByRole('combobox', { name: 'pages.study.reportFamily' });
  expect(mockMethod).not.toHaveBeenCalled();
  await chooseReportFamily('pages.study.methodWorkspace');
  await screen.findByText('pages.study.methodQualificationNote');
  expect(mockMethod).toHaveBeenCalledWith({ operation: 'capability.read' });
  await chooseReportFamily('pages.study.historical');
  await waitFor(() =>
    expect(screen.queryByText('pages.study.methodQualificationNote')).not.toBeInTheDocument(),
  );
});

it('opens a user-selected V6 exact report from the Study landing page', async () => {
  render(<StudyPage />);
  await screen.findByRole('combobox', { name: 'pages.study.reportFamily' });
  await chooseReportFamily('V6');
  fireEvent.change(screen.getByRole('textbox', { name: 'pages.study.reportId' }), {
    target: { value: 'exact-method-report' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'pages.study.reportHash' }), {
    target: { value: 'a'.repeat(64) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.openReport' }));
  expect(mockPush).toHaveBeenCalledWith(
    `/study-report?id=exact-method-report&hash=${'a'.repeat(64)}&api=6`,
  );
});
