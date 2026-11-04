import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReportPage from '@/pages/Study/Report';
import SharePage from '@/pages/Study/Share';
import legacyView from '../../../fixtures/study-report/view-v1.json';
import advancedView from '../../../fixtures/study-report/view-advanced-v2.json';

const mockReview = jest.fn(),
  mockCore = jest.fn(),
  mockPending = jest.fn(),
  mockDownload = jest.fn();
let mockSearch = '',
  mockFinalized = false;
const actor = '10000000-0000-4000-8000-000000000001';
const hash = advancedView.report.contentHash;
const id = advancedView.report.reportRevisionId;
const actions = ['export.request', 'export.download', 'share.create', 'share.download'];
jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ id }: { id: string }) => id,
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
  useModel: () => ({ initialState: { currentUser: { userid: actor } } }),
  useLocation: () => ({ search: mockSearch }),
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  core: (...a: unknown[]) => mockCore(...a),
  review: (...a: unknown[]) => mockReview(...a),
  newWriteKey: () => 'original-ui-key',
  subscribeStudyIdentityChange: () => () => {},
  subscribePendingStudyWrites: () => () => {},
  readPendingStudyWrite: (...a: unknown[]) => mockPending(...a),
}));
jest.mock('@/services/study/download', () => ({
  downloadStudyExport: (...a: unknown[]) => mockDownload(...a),
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));

function state(
  view: {
    report: { studyId: string; reportRevisionId: string; contentHash: string };
  } = advancedView,
) {
  return {
    studyId: view.report.studyId,
    reportRevisionId: view.report.reportRevisionId,
    reportContentHash: view.report.contentHash,
    reportRevision: 1,
    authorId: '10000000-0000-4000-8000-000000000009',
    reviewStateHash: 'c'.repeat(64),
    currentReviewIds: [],
    acceptedReviewIds: [],
    finalization: mockFinalized
      ? {
          studyId: view.report.studyId,
          reportRevisionId: view.report.reportRevisionId,
          reportContentHash: view.report.contentHash,
          finalizationId: 'finalization-v5',
          actorId: actor,
          profileId: 'lca.study-report-unreviewed.v1',
          expectedReviewStateHash: 'c'.repeat(64),
          acceptedReviewIds: [],
          finalizedAt: '2026-11-04T01:00:00Z',
        }
      : null,
    acceptance: mockFinalized ? 'current' : 'not_finalized',
    validity: { status: 'current', checkedAt: '2026-11-04T01:00:00Z', reasonCodes: [] },
    checkedAt: '2026-11-04T01:00:00Z',
  };
}
const share = {
  studyId: advancedView.report.studyId,
  reportRevisionId: id,
  reportContentHash: hash,
  shareId: 'share-v5',
  exportId: 'export-v5',
  finalizationId: 'finalization-v5',
  issuerId: actor,
  recipientId: '10000000-0000-4000-8000-000000000005',
  createdAt: '2026-11-04T01:00:00Z',
  expiresAt: '2027-01-02T03:04:00Z',
  status: 'active',
  revokedAt: null,
};
const exported = {
  studyId: advancedView.report.studyId,
  reportRevisionId: id,
  reportContentHash: hash,
  exportId: 'export-v5',
};
const projection = (api?: string) => {
  const view = api === 'v5' ? advancedView : legacyView;
  return { type: 'view', view, state: state(view), share: null };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFinalized = false;
  mockSearch = `?id=${id}&hash=${hash}&api=5`;
  mockPending.mockResolvedValue({ pending: false, raw: null });
  mockCore.mockRejectedValue(new Error('Report-only routes must not read core Study data'));
  mockDownload.mockResolvedValue(undefined);
  mockReview.mockImplementation(async (request, _workflow, api) => {
    if (request.operation === 'resource.actions')
      return {
        type: 'actions',
        resource: request.resource,
        actions,
        corePermissions: { read: false, write: false },
        allowedMemberRoles: [],
      };
    if (request.operation === 'capability.read')
      return {
        type: 'capabilities',
        runtimeEnabled: true,
        finalizationProfiles: ['lca.study-report-unreviewed.v1'],
      };
    if (request.operation === 'report.view') return projection(api);
    if (request.operation === 'share.view') return { ...projection(api), share };
    if (request.operation === 'export.request' || request.operation === 'export.read')
      return { type: 'export', value: exported };
    if (request.operation === 'share.create') return { type: 'share', value: share };
    throw new Error('Unexpected report operation ' + request.operation);
  });
});

it('opens the explicit V5 report with renderer2 reasons and no core access, and generates a stable V5 link', async () => {
  render(<ReportPage />);
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  const html = document.querySelector('iframe')!.getAttribute('srcdoc')!;
  expect(html).toContain(advancedView.report.title);
  expect(html).toContain('No numeric value');
  expect(html).toContain('zero_baseline_relative_undefined');
  expect(screen.getByRole('link', { name: id })).toHaveAttribute(
    'href',
    `#/study-report?id=${id}&hash=${hash}&api=5`,
  );
  expect(mockPending).toHaveBeenCalledWith(`report5:${id}`);
  expect(mockReview.mock.calls.every((call) => call[2] === 'v5')).toBe(true);
  expect(mockCore).not.toHaveBeenCalled();
});

it('rejects ambiguous or unknown API selectors before any report or share request', () => {
  mockSearch = `?id=${id}&hash=${hash}&api=5&api=5`;
  const page = render(<ReportPage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  page.unmount();
  mockSearch = '?id=share-v5&api=6';
  render(<SharePage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  expect(mockReview).not.toHaveBeenCalled();
});

it('remounts by family and suppresses a late old V4 projection for the same identity', async () => {
  let release!: (value: unknown) => void;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const base = mockReview.getMockImplementation()!;
  mockReview.mockImplementation((request, workflow, api) =>
    request.operation === 'report.view' && api !== 'v5' ? held : base(request, workflow, api),
  );
  mockSearch = `?id=${id}&hash=${hash}`;
  const page = render(<ReportPage />);
  await waitFor(() =>
    expect(mockReview).toHaveBeenCalledWith({
      operation: 'report.view',
      reportRevisionId: id,
      expectedContentHash: hash,
    }),
  );
  mockSearch += '&api=5';
  page.rerender(<ReportPage />);
  await waitFor(() =>
    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
      advancedView.report.title,
    ),
  );
  await act(async () => {
    release(projection());
    await held;
  });
  expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain(
    `<h1>${advancedView.report.title}</h1>`,
  );
  expect(document.querySelector('iframe')?.getAttribute('srcdoc')).not.toContain(
    `<h1>${legacyView.report.title}</h1>`,
  );
  expect(mockPending).toHaveBeenCalledWith(`report:${id}`);
  expect(mockPending).toHaveBeenCalledWith(`report5:${id}`);
});

it('uses V5 export literals and workflow identity and generates a V5 recipient link after sharing', async () => {
  mockFinalized = true;
  render(<ReportPage />);
  const button = await screen.findByRole('button', { name: 'pages.study.export' });
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
  await waitFor(() =>
    expect(mockReview).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'export.request',
        rendererVersion: '2.0.0',
        viewModelVersion: 'lca.study-report-view.v2',
        idempotencyKey: 'original-ui-key',
      }),
      `report5:${id}`,
      'v5',
    ),
  );
  fireEvent.change(screen.getByLabelText('pages.study.recipient'), {
    target: { value: share.recipientId },
  });
  fireEvent.change(screen.getByLabelText('pages.study.expires'), {
    target: { value: '2027-01-02T03:04' },
  });
  const sharing = screen.getByRole('button', { name: 'pages.study.share' });
  await waitFor(() => expect(sharing).toBeEnabled());
  await act(async () => {
    fireEvent.click(sharing);
  });
  expect(
    await screen.findByRole('link', { name: 'pages.study.shares · share-v5' }),
  ).toHaveAttribute('href', '#/study-share?id=share-v5&api=5');
  expect(mockReview.mock.calls.every((call) => call[2] === 'v5')).toBe(true);
});

it('keeps a V5 recipient route projection-only and passes the selected family to download', async () => {
  mockSearch = '?id=share-v5&api=5';
  render(<SharePage />);
  const button = await screen.findByRole('button', { name: 'pages.study.download' });
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('share', 'share-v5', 'v5'));
  expect(screen.getByRole('link', { name: 'share-v5' })).toHaveAttribute(
    'href',
    '#/study-share?id=share-v5&api=5',
  );
  expect(mockPending).toHaveBeenCalledWith('share5:share-v5');
  expect(mockReview.mock.calls.every((call) => call[2] === 'v5')).toBe(true);
  expect(mockCore).not.toHaveBeenCalled();
});
