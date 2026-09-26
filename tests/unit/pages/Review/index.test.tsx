// @ts-nocheck
import ReviewPage from '@/pages/Review';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetReviewUserRoleApi = jest.fn();
const mockGetReviewerContactStatus = jest.fn();
const assignmentReloads: Record<string, jest.Mock> = {};

jest.mock('@umijs/max', () => ({
  __esModule: true,
  FormattedMessage: ({ id, defaultMessage }: any) => defaultMessage ?? id,
}));

jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getReviewUserRoleApi: (...args: any[]) => mockGetReviewUserRoleApi(...args),
}));

jest.mock('@/services/reviewerContacts/api', () => ({
  __esModule: true,
  getReviewerContactStatus: (...args: any[]) => mockGetReviewerContactStatus(...args),
}));

jest.mock('@/pages/Review/Components/ReviewerProfile', () => ({
  __esModule: true,
  default: ({ status }: any) => (
    <div data-testid='reviewer-profile'>{status?.status ?? 'missing'}</div>
  ),
}));

jest.mock('@/pages/Review/Components/AssignmentReview', () => ({
  __esModule: true,
  default: ({ actionRef, tableType, userData, onOpenQualityDiagnostic }: any) => {
    const reload = assignmentReloads[tableType] ?? jest.fn();
    assignmentReloads[tableType] = reload;
    if (actionRef) {
      actionRef.current = { reload };
    }
    return (
      <div data-testid={`assignment-${tableType}`}>
        {`${tableType}:${userData?.role ?? 'none'}`}
        {onOpenQualityDiagnostic && (
          <button type='button' onClick={onOpenQualityDiagnostic}>
            open-quality-diagnostic
          </button>
        )}
      </div>
    );
  },
}));

jest.mock('@/pages/Review/Components/ReviewMember', () => ({
  __esModule: true,
  default: ({ userData }: any) => <div data-testid='review-member'>{userData?.role ?? 'none'}</div>,
}));

jest.mock('@/pages/Review/Components/ReviewQualityDiagnostic', () => ({
  __esModule: true,
  default: ({ open, onClose }: any) => (
    <div data-testid='review-quality-diagnostic' data-open={String(open)}>
      quality diagnostic
      {open && (
        <button type='button' onClick={onClose}>
          close-quality-diagnostic
        </button>
      )}
    </div>
  ),
}));

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  PageContainer: ({ title, children }: any) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Result = ({ status, title, subTitle }: any) => (
    <section data-testid='antd-result' data-status={status}>
      <h1>{title}</h1>
      <p>{subTitle}</p>
    </section>
  );
  const Spin = ({ children }: any) => <div data-testid='spin'>{children}</div>;
  const Tabs = ({ items = [], activeKey, onChange, styles }: any) => {
    const currentItem = items.find((item: any) => item.key === activeKey) ?? items[0];

    return (
      <div
        data-testid='review-tabs'
        data-body-min-width={String(styles?.body?.minWidth)}
        data-content-min-width={String(styles?.content?.minWidth)}
      >
        <div>
          {items.map((item: any) => (
            <button
              key={item.key}
              type='button'
              disabled={item.disabled}
              onClick={() => onChange?.(item.key)}
            >
              {typeof item.label === 'string' ? item.label : item.label}
            </button>
          ))}
        </div>
        <div data-testid='active-tab'>{currentItem?.children}</div>
      </div>
    );
  };

  return {
    __esModule: true,
    Result,
    Spin,
    Tabs,
  };
});

describe('Review page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReviewerContactStatus.mockResolvedValue({
      data: { status: 'ready', ready: true, contact: {}, dataset: {} },
      error: null,
    });
    Object.keys(assignmentReloads).forEach((key) => delete assignmentReloads[key]);
  });

  it('renders review-admin tabs and switches between them', async () => {
    mockGetReviewUserRoleApi.mockResolvedValueOnce({ user_id: 'user-1', role: 'review-admin' });

    render(<ReviewPage />);

    expect(await screen.findByTestId('assignment-unassigned')).toHaveTextContent(
      'unassigned:review-admin',
    );
    expect(screen.getByTestId('review-tabs')).toHaveAttribute('data-body-min-width', '0');
    expect(screen.getByTestId('review-tabs')).toHaveAttribute('data-content-min-width', '0');
    expect(screen.getByTestId('review-quality-diagnostic')).toBeInTheDocument();
    expect(screen.getByTestId('review-quality-diagnostic')).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'open-quality-diagnostic' }));
    expect(screen.getByTestId('review-quality-diagnostic')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'close-quality-diagnostic' }));
    expect(screen.getByTestId('review-quality-diagnostic')).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('button', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pages.review.tabs.members' })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => !button.textContent?.includes('quality'))
        .slice(-1)[0],
    ).toHaveTextContent('pages.review.tabs.members');

    fireEvent.click(screen.getByRole('button', { name: 'In Progress' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-in-progress')).toHaveTextContent(
        'in-progress:review-admin',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'open-quality-diagnostic' }));
    expect(screen.getByTestId('review-quality-diagnostic')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'close-quality-diagnostic' }));

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-completed')).toHaveTextContent(
        'completed:review-admin',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'pages.review.tabs.members' }));

    expect(await screen.findByTestId('review-member')).toHaveTextContent('review-admin');

    fireEvent.click(screen.getByRole('button', { name: 'pages.review.tabs.unassigned' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-unassigned')).toHaveTextContent(
        'unassigned:review-admin',
      );
      expect(assignmentReloads.unassigned).toHaveBeenCalled();
    });
  });

  it('forces review members onto the pending tab without requiring an initial reload', async () => {
    mockGetReviewUserRoleApi.mockResolvedValueOnce({ user_id: 'user-2', role: 'review-member' });

    render(<ReviewPage />);

    await waitFor(() => {
      expect(screen.getByTestId('assignment-pending')).toHaveTextContent('pending:review-member');
    });
    expect(screen.queryByTestId('review-quality-diagnostic')).not.toBeInTheDocument();
    expect(assignmentReloads.pending).not.toHaveBeenCalled();

    expect(
      screen.queryByRole('button', { name: 'pages.review.tabs.unassigned' }),
    ).not.toBeInTheDocument();
    const pendingTab = screen.getByRole('button', { name: 'pages.review.tabs.pending' });
    await waitFor(() => expect(pendingTab).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Submitted Opinions' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-submitted')).toHaveTextContent(
        'submitted:review-member',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-completed')).toHaveTextContent(
        'completed:review-member',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'pages.review.tabs.pending' }));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-pending')).toHaveTextContent('pending:review-member');
      expect(assignmentReloads.pending).toHaveBeenCalledTimes(1);
    });
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'pages.review.tabs.pending',
      'Submitted Opinions',
      'Completed',
      'pages.review.tabs.reviewerProfile',
    ]);
  });

  it('gates review tasks and opens reviewer profile when profile is missing', async () => {
    mockGetReviewUserRoleApi.mockResolvedValueOnce({ user_id: 'user-3', role: 'review-member' });
    mockGetReviewerContactStatus.mockResolvedValueOnce({
      data: { status: 'missing', ready: false, contact: null, dataset: null },
      error: null,
    });

    render(<ReviewPage />);

    expect(await screen.findByTestId('reviewer-profile')).toHaveTextContent('missing');
    expect(screen.getByRole('button', { name: 'pages.review.tabs.pending' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submitted Opinions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  });

  it('does not select a member task tab while reviewer profile readiness is loading', async () => {
    mockGetReviewUserRoleApi.mockResolvedValueOnce({ user_id: 'user-4', role: 'review-member' });
    mockGetReviewerContactStatus.mockReturnValueOnce(new Promise(() => {}));

    const view = render(<ReviewPage />);

    await waitFor(() => expect(mockGetReviewerContactStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('assignment-pending')).not.toBeInTheDocument();
    view.unmount();
  });

  it('logs errors from role loading and falls back to access denied', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetReviewUserRoleApi.mockRejectedValueOnce(new Error('load failed'));

    render(<ReviewPage />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    expect(screen.getByTestId('spin')).toBeInTheDocument();
    expect(screen.getByTestId('access-denied')).toHaveTextContent(
      'You do not have permission to access this page.',
    );
    expect(screen.queryByTestId('review-quality-diagnostic')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
