/**
 * Integration tests for review authentication states
 * Paths under test:
 * - src/pages/Review/index.tsx
 */

import Review from '@/pages/Review';
import { getReviewerContactStatus } from '@/services/reviewerContacts/api';
import { getReviewUserRoleApi } from '@/services/roles/api';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../helpers/testUtils';

const assignmentReloads: Record<string, jest.Mock> = {};

jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ id, defaultMessage }: any) => (
    <span data-testid={`fmt-${id}`}>{defaultMessage ?? id}</span>
  ),
}));

jest.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ title, children }: any) => (
    <div data-testid='page-container'>
      <div data-testid='page-title'>{title}</div>
      <div>{children}</div>
    </div>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Spin = ({ spinning, children }: any) => (
    <div data-testid='spin' data-spinning={spinning ? 'true' : 'false'}>
      {children}
    </div>
  );

  const Result = ({ status, title, subTitle }: any) => (
    <section data-testid='antd-result' data-status={status}>
      <h1>{title}</h1>
      <p>{subTitle}</p>
    </section>
  );

  const Tabs = ({ items = [], activeKey, onChange }: any) => (
    <div data-testid='tabs'>
      {(items ?? []).map((item: any) => (
        <div key={item.key} data-testid={`tab-wrapper-${item.key}`}>
          <button
            type='button'
            data-testid={`tab-${item.key}`}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
          </button>
          {item.key === activeKey ? (
            <div data-testid={`tab-panel-${item.key}`}>{item.children}</div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const ConfigProvider = ({ children }: any) => <>{children}</>;
  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  };

  return {
    __esModule: true,
    ConfigProvider,
    message,
    Result,
    Spin,
    Tabs,
  };
});

jest.mock('@/pages/Review/Components/AssignmentReview', () => {
  const React = require('react');

  const AssignmentReviewMock = ({ actionRef, tableType, userData }: any) => {
    const reloadRef = React.useRef(null);
    if (!reloadRef.current) {
      reloadRef.current = jest.fn();
    }
    const reload = reloadRef.current;
    if (actionRef) {
      actionRef.current = { reload };
    }
    assignmentReloads[tableType] = reload;
    return (
      <div data-testid={`assignment-${tableType}`}>
        <span data-testid={`assignment-role-${tableType}`}>{userData?.role ?? 'unknown'}</span>
      </div>
    );
  };

  return {
    __esModule: true,
    default: AssignmentReviewMock,
  };
});

jest.mock('@/pages/Review/Components/ReviewMember', () => ({
  __esModule: true,
  default: ({ userData }: any) => (
    <div data-testid='review-member-view'>{userData?.role ?? 'unknown'}</div>
  ),
}));

jest.mock('@/pages/Review/Components/ReviewQualityDiagnostic', () => ({
  __esModule: true,
  default: () => <div data-testid='review-quality-diagnostic'>Quality diagnostic</div>,
}));

jest.mock('@/pages/Review/Components/ReviewerProfile', () => ({
  __esModule: true,
  default: ({ status }: any) => (
    <div data-testid='reviewer-profile'>{status?.status ?? 'loading'}</div>
  ),
}));

jest.mock('@/services/reviewerContacts/api', () => ({
  getReviewerContactStatus: jest.fn(),
}));

jest.mock('@/services/roles/api', () => ({
  getReviewUserRoleApi: jest.fn(),
}));

const mockGetReviewUserRoleApi = jest.mocked(getReviewUserRoleApi);
const mockGetReviewerContactStatus = jest.mocked(getReviewerContactStatus);

describe('Review page authentication workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(assignmentReloads).forEach((key) => {
      delete assignmentReloads[key];
    });
    mockGetReviewerContactStatus.mockResolvedValue({
      data: {
        status: 'ready',
        ready: true,
        contact: { '@refObjectId': 'contact-1', '@version': '01.00.000' },
        dataset: {
          id: 'contact-1',
          version: '01.00.000',
          state_code: 100,
          rule_verification: true,
          json_ordered: {},
        },
      },
      error: null,
    });
  });

  it('loads admin queues and exposes table switch actions for admins', async () => {
    mockGetReviewUserRoleApi.mockResolvedValue({ user_id: 'admin-1', role: 'review-admin' });

    renderWithProviders(<Review />);

    await waitFor(() => expect(mockGetReviewUserRoleApi).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(assignmentReloads.unassigned).toBeDefined());
    expect(screen.getByTestId('assignment-role-unassigned')).toHaveTextContent('review-admin');
    expect(screen.getByTestId('review-quality-diagnostic')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-in-progress'));

    await waitFor(() => expect(screen.getByTestId('assignment-in-progress')).toBeInTheDocument());
    expect(assignmentReloads['in-progress']).toBeDefined();
  });

  it('defaults review members to the pending tab with drawer-ready action refs', async () => {
    mockGetReviewUserRoleApi.mockResolvedValue({ user_id: 'member-1', role: 'review-member' });

    renderWithProviders(<Review />);

    await waitFor(() => expect(mockGetReviewUserRoleApi).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByTestId('tab-panel-pending')).toBeInTheDocument());
    expect(screen.queryByTestId('tab-unassigned')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-quality-diagnostic')).not.toBeInTheDocument();
    expect(assignmentReloads.pending).toBeDefined();
  });

  it('stops spinning and surfaces console errors when the role lookup fails', async () => {
    const error = new Error('network down');
    mockGetReviewUserRoleApi.mockRejectedValue(error);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<Review />);

    await waitFor(() =>
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(error);
    expect(assignmentReloads.unassigned).toBeUndefined();
    expect(screen.getByTestId('access-denied')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('renders access denied instead of reviewer tabs for users without a review role', async () => {
    mockGetReviewUserRoleApi.mockResolvedValue(null);

    renderWithProviders(<Review />);

    await waitFor(() => expect(mockGetReviewUserRoleApi).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false'),
    );

    expect(screen.getByTestId('access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('tabs')).not.toBeInTheDocument();
    expect(assignmentReloads.unassigned).toBeUndefined();
    expect(assignmentReloads.reviewed).toBeUndefined();
  });
});
