import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReportPage from '@/pages/Study/Report';
import SharePage from '@/pages/Study/Share';
import legacyView from '../../../fixtures/study-report/view-v1.json';
import advancedView from '../../../fixtures/study-report/view-v3.json';

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
          finalizationId: 'finalization-v6',
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
  shareId: 'share-v6',
  exportId: 'export-v6',
  finalizationId: 'finalization-v6',
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
  exportId: 'export-v6',
};
const projection = (api?: string) => {
  const view = api === 'v6' ? advancedView : legacyView;
  return { type: 'view', view, state: state(view), share: null };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFinalized = false;
  mockSearch = `?id=${id}&hash=${hash}&api=6`;
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

it('opens the explicit V6 report with renderer3 mandatory evidence and no core access, and generates a stable V6 link', async () => {
  render(<ReportPage />);
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  const html = document.querySelector('iframe')!.getAttribute('srcdoc')!;
  expect(html).toContain(advancedView.report.title);
  expect(html).toContain('No numeric value');
  expect(html).toContain('All 20 method requirements');
  expect(screen.getByRole('link', { name: id })).toHaveAttribute(
    'href',
    `#/study-report?id=${id}&hash=${hash}&api=6`,
  );
  expect(mockPending).toHaveBeenCalledWith(`report6:${id}`);
  expect(mockReview.mock.calls.every((call) => call[2] === 'v6')).toBe(true);
  expect(mockCore).not.toHaveBeenCalled();
});

it('rejects ambiguous or unknown API selectors before any report or share request', () => {
  mockSearch = `?id=${id}&hash=${hash}&api=6&api=6`;
  const page = render(<ReportPage />);
  expect(screen.getByText('pages.study.invalidLink')).toBeInTheDocument();
  page.unmount();
  mockSearch = '?id=share-v6&api=7';
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
    request.operation === 'report.view' && api !== 'v6' ? held : base(request, workflow, api),
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
  mockSearch += '&api=6';
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
  expect(mockPending).toHaveBeenCalledWith(`report6:${id}`);
});

it('uses V6 export literals and workflow identity and generates a V6 recipient link after sharing', async () => {
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
        rendererVersion: '3.0.0',
        viewModelVersion: 'lca.study-report-view.v3',
        idempotencyKey: 'original-ui-key',
      }),
      `report6:${id}`,
      'v6',
    ),
  );
  const download = screen.getByRole('button', { name: 'pages.study.download' });
  await waitFor(() => expect(download).toBeEnabled());
  await act(async () => {
    fireEvent.click(download);
  });
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('export', 'export-v6', 'v6'));
  expect(mockReview).toHaveBeenCalledWith(
    { operation: 'export.read', exportId: 'export-v6' },
    undefined,
    'v6',
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
    await screen.findByRole('link', { name: 'pages.study.shares · share-v6' }),
  ).toHaveAttribute('href', '#/study-share?id=share-v6&api=6');
  expect(mockReview.mock.calls.every((call) => call[2] === 'v6')).toBe(true);
});

it('keeps a V6 recipient route projection-only and passes the selected family to download', async () => {
  mockSearch = '?id=share-v6&api=6';
  render(<SharePage />);
  const button = await screen.findByRole('button', { name: 'pages.study.download' });
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('share', 'share-v6', 'v6'));
  expect(screen.getByRole('link', { name: 'share-v6' })).toHaveAttribute(
    'href',
    '#/study-share?id=share-v6&api=6',
  );
  expect(mockPending).toHaveBeenCalledWith('share6:share-v6');
  expect(mockReview.mock.calls.every((call) => call[2] === 'v6')).toBe(true);
  expect(mockCore).not.toHaveBeenCalled();
});

const revokeButton = () => screen.getAllByRole('button', { name: 'pages.study.revoke' })[1];
const selectShareForRevocation = (shareId = share.shareId) => {
  fireEvent.change(screen.getByLabelText('pages.study.shares'), {
    target: { value: shareId },
  });
  fireEvent.change(screen.getByLabelText('pages.study.reason'), {
    target: { value: 'Explicit recipient revocation' },
  });
};

it.each(['v4', 'v6'] as const)(
  'revokes only the exact share with its own server actions through %s',
  async (api) => {
    const view = api === 'v6' ? advancedView : legacyView;
    mockSearch = `?id=${view.report.reportRevisionId}&hash=${view.report.contentHash}${api === 'v6' ? '&api=6' : ''}`;
    const exact = { ...share, ...view.report, reportContentHash: view.report.contentHash };
    const base = mockReview.getMockImplementation()!;
    mockReview.mockImplementation(async (request, workflow, selectedApi) => {
      if (request.operation === 'resource.actions' && request.resource.type === 'share')
        return {
          type: 'actions',
          resource: request.resource,
          actions: ['share.read', 'share.revoke'],
        };
      if (request.operation === 'share.read') return { type: 'share', value: exact };
      if (request.operation === 'share.revoke')
        return { type: 'share', value: { ...exact, status: 'revoked' } };
      return base(request, workflow, selectedApi);
    });
    render(<ReportPage />);
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    expect(revokeButton()).toBeDisabled();
    selectShareForRevocation();
    expect(screen.getByLabelText('pages.study.delegations')).toHaveValue('');
    await waitFor(() => expect(revokeButton()).toBeEnabled());
    expect(mockReview).toHaveBeenCalledWith(
      { operation: 'resource.actions', resource: { type: 'share', id: share.shareId } },
      ...(api === 'v6' ? [undefined, 'v6'] : []),
    );
    expect(mockReview).toHaveBeenCalledWith(
      { operation: 'share.read', shareId: share.shareId },
      ...(api === 'v6' ? [undefined, 'v6'] : []),
    );
    await act(async () => fireEvent.click(revokeButton()));
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith(
        {
          operation: 'share.revoke',
          shareId: share.shareId,
          reason: 'Explicit recipient revocation',
          idempotencyKey: 'original-ui-key',
        },
        `${api === 'v6' ? 'report6' : 'report'}:${view.report.reportRevisionId}`,
        ...(api === 'v6' ? ['v6'] : []),
      ),
    );
    expect(mockCore).not.toHaveBeenCalled();
  },
);

it.each(['report', 'hash', 'permission', 'denial'])(
  'denies share revocation for %s mismatch without using report-wide action claims',
  async (mismatch) => {
    const base = mockReview.getMockImplementation()!;
    mockReview.mockImplementation(async (request, workflow, api) => {
      if (request.operation === 'resource.actions')
        return {
          type: 'actions',
          resource: request.resource,
          actions:
            request.resource.type === 'share' && mismatch === 'permission'
              ? ['share.read']
              : ['share.revoke'],
        };
      if (request.operation === 'share.read') {
        if (mismatch === 'denial') throw new Error('Server denied current access');
        return {
          type: 'share',
          value: {
            ...share,
            reportRevisionId: mismatch === 'report' ? 'another-report' : id,
            reportContentHash: mismatch === 'hash' ? '0'.repeat(64) : hash,
          },
        };
      }
      return base(request, workflow, api);
    });
    render(<ReportPage />);
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    selectShareForRevocation();
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith(
        { operation: 'share.read', shareId: share.shareId },
        undefined,
        'v6',
      ),
    );
    await act(async () => {});
    expect(revokeButton()).toBeDisabled();
    fireEvent.click(revokeButton());
    expect(mockReview.mock.calls.some(([request]) => request.operation === 'share.revoke')).toBe(
      false,
    );
  },
);

it('discards late actions/read metadata for a replaced share selection and another protocol family', async () => {
  let release!: (value: unknown) => void;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const base = mockReview.getMockImplementation()!;
  mockReview.mockImplementation(async (request, workflow, api) => {
    if (request.operation === 'resource.actions' && request.resource.type === 'share')
      return {
        type: 'actions',
        resource: request.resource,
        actions: ['share.read', 'share.revoke'],
      };
    if (request.operation === 'share.read')
      return request.shareId === share.shareId
        ? held
        : { type: 'share', value: { ...share, reportRevisionId: 'another-report' } };
    return base(request, workflow, api);
  });
  const page = render(<ReportPage />);
  await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
  selectShareForRevocation();
  await waitFor(() =>
    expect(mockReview).toHaveBeenCalledWith(
      { operation: 'share.read', shareId: share.shareId },
      undefined,
      'v6',
    ),
  );
  selectShareForRevocation('another-share');
  await act(async () => {
    release({ type: 'share', value: share });
    await held;
  });
  expect(revokeButton()).toBeDisabled();
  mockSearch = `?id=${id}&hash=${hash}`;
  page.rerender(<ReportPage />);
  await waitFor(() => expect(screen.getByLabelText('pages.study.shares')).toHaveValue(''));
  expect(revokeButton()).toBeDisabled();
  expect(mockReview.mock.calls.some(([request]) => request.operation === 'share.revoke')).toBe(
    false,
  );
});
