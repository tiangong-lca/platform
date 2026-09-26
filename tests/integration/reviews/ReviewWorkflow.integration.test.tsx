/**
 * Integration tests for the review workflow components
 * Paths under test:
 * - src/pages/Review/index.tsx
 * - src/pages/Review/Components/AssignmentReview.tsx
 * - src/pages/Review/Components/ReviewMember.tsx
 */

import React from 'react';

jest.mock('@/services/reviews/api', () => ({
  getReviewsTableDataOfReviewAdmin: jest.fn(),
  getReviewsTableDataOfReviewMember: jest.fn(),
}));

jest.mock('@/services/reviewerContacts/api', () => ({
  getReviewerContactStatus: jest.fn(),
}));

jest.mock('@/services/roles/api', () => ({
  getReviewUserRoleApi: jest.fn(),
  getUserManageTableData: jest.fn(),
  updateRoleApi: jest.fn(),
  delRoleApi: jest.fn(),
}));

jest.mock('@/pages/Review/Components/RejectReview', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => (
    <button type='button' data-testid={`reject-review-${reviewId}`}>
      Reject
    </button>
  ),
}));

jest.mock('@/pages/Review/Components/reviewLifeCycleModels', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => <span data-testid={`lcm-${reviewId}`}>LCM</span>,
}));

jest.mock('@/pages/Review/Components/reviewProcess', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => <span data-testid={`process-${reviewId}`}>Process</span>,
}));

jest.mock('@/pages/Review/Components/ReviewProgress', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => <span data-testid={`progress-${reviewId}`}>Progress</span>,
}));

jest.mock('@/pages/Review/Components/SelectReviewer', () => ({
  __esModule: true,
  default: ({ reviewIds = [] }: any) => (
    <div data-testid={`select-reviewer-${reviewIds.length}`}>SelectReviewer</div>
  ),
}));

jest.mock('@/pages/Review/Components/SimpleReviewActions', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => <span data-testid={`simple-review-${reviewId}`}>Review</span>,
}));

jest.mock('@/pages/Review/Components/ReviewQualityDiagnostic', () => ({
  __esModule: true,
  default: () => <div data-testid='review-quality-diagnostic'>Quality diagnostic</div>,
}));

jest.mock('@/pages/Account/view', () => ({
  __esModule: true,
  default: ({ userId }: any) => <span data-testid={`account-${userId}`}>Account</span>,
}));

jest.mock('@/pages/LifeCycleModels/Components/view', () => ({
  __esModule: true,
  default: ({ id }: any) => <span data-testid={`lcm-view-${id}`}>LCMView</span>,
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id }: any) => <span data-testid={`process-view-${id}`}>ProcessView</span>,
}));

jest.mock('@/pages/Review/Components/AddMemberModal', () => ({
  __esModule: true,
  default: ({ open }: any) => (open ? <div data-testid='add-member-modal' /> : null),
}));

jest.mock('@/pages/Review/Components/ReviewerProfile', () => ({
  __esModule: true,
  default: ({ status }: any) => (
    <div data-testid='reviewer-profile'>{status?.status ?? 'loading'}</div>
  ),
}));

jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ defaultMessage, id }: any) => (
    <span data-testid={`fmt-${id}`}>{defaultMessage ?? id}</span>
  ),
  useIntl: () => ({
    locale: 'en-US',
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@ant-design/icons', () => ({
  CloseOutlined: () => <span data-testid='icon-close' />,
  CrownOutlined: () => <span data-testid='icon-crown' />,
  DeleteOutlined: () => <span data-testid='icon-delete' />,
  EyeOutlined: () => <span data-testid='icon-eye' />,
  ExperimentOutlined: () => <span data-testid='icon-experiment' />,
  PlusOutlined: () => <span data-testid='icon-plus' />,
  UserOutlined: () => <span data-testid='icon-user' />,
}));

jest.mock('antd', () => {
  const React = require('react');
  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };
  const ModalComponent = ({ open, onCancel, onOk, children }: any) =>
    open ? (
      <div data-testid='modal'>
        <div>{children}</div>
        <button type='button' onClick={onCancel}>
          close
        </button>
        <button type='button' onClick={onOk}>
          ok
        </button>
      </div>
    ) : null;
  ModalComponent.confirm = jest.fn();
  const App = ({ children }: any) => <>{children}</>;
  App.useApp = () => ({
    message,
    modal: { confirm: ModalComponent.confirm },
  });
  const Drawer = ({ open, children, extra }: any) =>
    open ? (
      <div data-testid='drawer'>
        <div>{extra}</div>
        {children}
      </div>
    ) : null;
  const Button = React.forwardRef((props: any, ref: any) => {
    const { onClick, children, disabled, icon, loading: _loading, ...rest } = props ?? {};
    void _loading;
    return (
      <button ref={ref} type='button' onClick={onClick} disabled={disabled} {...rest}>
        {icon}
        {children}
      </button>
    );
  });
  const Tabs = ({ items, activeKey, onChange }: any) => (
    <div data-testid='tabs'>
      {(items ?? []).map((item: any) => (
        <div key={item.key}>
          <button
            type='button'
            data-testid={`tab-${item.key}`}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
          </button>
          {item.key === activeKey ? <div>{item.children}</div> : null}
        </div>
      ))}
    </div>
  );
  const Spin = ({ spinning, children }: any) => (
    <div data-testid='spin' data-spinning={spinning ? 'true' : 'false'}>
      {children}
    </div>
  );
  const ConfigProvider = ({ children }: any) => <>{children}</>;
  const Card = ({ children }: any) => <div data-testid='card'>{children}</div>;
  const Row = ({ children }: any) => <div data-testid='row'>{children}</div>;
  const Col = ({ children }: any) => <div data-testid='col'>{children}</div>;
  const Space = ({ children }: any) => <div data-testid='space'>{children}</div>;
  const Tooltip = ({ children }: any) => <>{children}</>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Flex = ({ children }: any) => <div data-testid='flex'>{children}</div>;
  const Input = ({ value, onChange, ...rest }: any) => (
    <input
      data-testid='input'
      value={value ?? ''}
      onChange={(event) => onChange?.(event)}
      {...rest}
    />
  );
  Input.Search = ({ onSearch, placeholder }: any) => (
    <div data-testid='input-search'>
      <input placeholder={placeholder} data-testid='search-input' />
      <button type='button' onClick={() => onSearch?.('')}>
        search
      </button>
    </div>
  );
  const Select = ({ value, options = [], onChange, labelRender, ...rest }: any) => {
    void labelRender;
    return (
      <select value={value} onChange={(event) => onChange?.(event.target.value)} {...rest}>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {typeof option.label === 'string' ? option.label : option.value}
          </option>
        ))}
      </select>
    );
  };
  const theme = {
    useToken: () => ({ token: { colorPrimary: '#1677ff' } }),
  };

  return {
    __esModule: true,
    App,
    Button,
    Card,
    Col,
    Drawer,
    Flex,
    Input,
    Modal: ModalComponent,
    Row,
    Select,
    Space,
    Spin,
    Tabs,
    Tag,
    Tooltip,
    message,
    ConfigProvider,
    theme,
  };
});

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const ProTable = ({
    params,
    dataSource,
    request,
    actionRef,
    columns = [] as any[],
    rowKey = 'id',
    pagination,
    toolBarRender,
    headerTitle,
  }: any) => {
    const [rows, setRows] = React.useState([] as any[]);
    const paramsRef = React.useRef({
      current: pagination?.current ?? 1,
      pageSize: pagination?.pageSize ?? 10,
    });
    const requestRef = React.useRef(request);
    const queryParamsRef = React.useRef(params);
    queryParamsRef.current = params;

    const runRequest = React.useCallback(async (override: any = {}) => {
      paramsRef.current = { ...paramsRef.current, ...override };
      const result = await requestRef.current?.(
        { ...paramsRef.current, ...queryParamsRef.current },
        {},
      );
      if (result?.success !== false) setRows(result?.data ?? []);
      return result;
    }, []);

    React.useEffect(() => {
      requestRef.current = request;
    }, [request]);

    React.useEffect(() => {
      runRequest();
    }, [JSON.stringify(params)]);

    React.useEffect(() => {
      if (actionRef) {
        actionRef.current = {
          reload: () => runRequest(),
          setPageInfo: (info: any) => {
            if (
              Object.entries(info ?? {}).some(([key, value]) => paramsRef.current[key] !== value)
            ) {
              return runRequest(info);
            }
          },
        };
      }
    }, [actionRef, runRequest]);

    const renderContent = (content: any, keyPrefix: string) => {
      if (Array.isArray(content)) {
        return content.map((item, index) => (
          <React.Fragment key={`${keyPrefix}-${index}`}>{item}</React.Fragment>
        ));
      }
      return content;
    };

    const header = typeof headerTitle === 'function' ? headerTitle() : headerTitle;
    const toolbar = toolBarRender?.() ?? [];

    return (
      <div data-testid='pro-table'>
        <div data-testid='pro-table-header'>{header}</div>
        <div data-testid='pro-table-toolbar'>
          {Array.isArray(toolbar)
            ? toolbar.map((node, index) => (
                <React.Fragment key={`toolbar-${index}`}>{node}</React.Fragment>
              ))
            : toolbar}
        </div>
        {(dataSource ?? rows).map((row: any, rowIndex: number) => {
          const rowIdentifier = rowKey && row[rowKey] ? row[rowKey] : rowIndex;
          return (
            <div data-testid={`pro-table-row-${rowIdentifier}`} key={`row-${rowIdentifier}`}>
              {(columns ?? []).map((column: any, columnIndex: number) => {
                const dataIndex = column.dataIndex;
                const value = dataIndex ? row[dataIndex] : undefined;
                const rendered = column.render
                  ? column.render(value, row, rowIndex)
                  : (value ?? column.title ?? null);
                return (
                  <div
                    key={`cell-${columnIndex}`}
                    data-testid={`pro-table-cell-${dataIndex ?? columnIndex}-${rowIdentifier}`}
                  >
                    {renderContent(rendered, `render-${columnIndex}`)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const PageContainer = ({ title, children }: any) => (
    <div data-testid='page-container'>
      <div data-testid='page-container-title'>{title}</div>
      <div>{children}</div>
    </div>
  );

  return {
    __esModule: true,
    ProTable,
    PageContainer,
  };
});

import Review from '@/pages/Review';
import AssignmentReview from '@/pages/Review/Components/AssignmentReview';
import ReviewMember from '@/pages/Review/Components/ReviewMember';
import {
  getReviewsTableDataOfReviewAdmin,
  getReviewsTableDataOfReviewMember,
} from '@/services/reviews/api';
import { getReviewerContactStatus } from '@/services/reviewerContacts/api';
import {
  delRoleApi,
  getReviewUserRoleApi,
  getUserManageTableData,
  updateRoleApi,
} from '@/services/roles/api';
import { message } from 'antd';
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../helpers/testUtils';

const mockGetReviewsTableDataOfReviewAdmin = jest.mocked(getReviewsTableDataOfReviewAdmin);
const mockGetReviewsTableDataOfReviewMember = jest.mocked(getReviewsTableDataOfReviewMember);
const mockGetReviewerContactStatus = jest.mocked(getReviewerContactStatus);
const mockGetReviewUserRoleApi = jest.mocked(getReviewUserRoleApi);
const mockGetUserManageTableData = jest.mocked(getUserManageTableData);
const mockUpdateRoleApi = jest.mocked(updateRoleApi);
const mockDelRoleApi = jest.mocked(delRoleApi);

describe('Review workflow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValue({
      data: [],
      success: true,
      total: 0,
    } as any);
    mockGetReviewsTableDataOfReviewMember.mockResolvedValue({
      data: [],
      success: true,
      total: 0,
    } as any);
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
    mockGetReviewUserRoleApi.mockResolvedValue({
      user_id: 'user-admin',
      role: 'review-admin',
    } as any);
    mockGetUserManageTableData.mockResolvedValue({ data: [], success: true, total: 0 } as any);
    mockDelRoleApi.mockResolvedValue({ error: null } as any);
  });

  it('loads admin review queues and refreshes when switching tabs', async () => {
    renderWithProviders(<Review />);

    await waitFor(() => {
      expect(mockGetReviewUserRoleApi).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        mockGetReviewsTableDataOfReviewAdmin.mock.calls.some(
          ([, , type, lang]) => type === 'unassigned' && lang === 'en',
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByTestId('tab-in-progress'));

    await waitFor(() => {
      expect(
        mockGetReviewsTableDataOfReviewAdmin.mock.calls.some(
          ([, , type]) => type === 'in-progress',
        ),
      ).toBe(true);
    });
  });

  it('defaults review members to the pending tab and requests pending queue data', async () => {
    mockGetReviewUserRoleApi.mockResolvedValueOnce({
      user_id: 'member-007',
      role: 'review-member',
    } as any);

    renderWithProviders(<Review />);

    await waitFor(() => {
      expect(
        mockGetReviewsTableDataOfReviewMember.mock.calls.some(
          ([, , type, lang]) => type === 'pending' && lang === 'en',
        ),
      ).toBe(true);
    });

    expect(screen.queryByTestId('tab-unassigned')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument();
  });

  it('passes explicit reviewer id when loading queues from member drawer context', async () => {
    const actionRef = React.createRef<any>();
    const userData = { user_id: 'reviewer-99', role: 'review-member' } as const;

    renderWithProviders(
      <AssignmentReview
        actionRef={actionRef}
        tableType='pending'
        userData={userData}
        actionFrom='reviewMember'
      />,
    );

    await waitFor(() => {
      expect(
        mockGetReviewsTableDataOfReviewMember.mock.calls.some(
          ([, , type, lang, filter]) =>
            type === 'pending' &&
            lang === 'en' &&
            typeof filter === 'object' &&
            filter?.user_id === userData.user_id,
        ),
      ).toBe(true);
    });
  });

  it('omits the dataset view trigger for an unsupported review table', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      data: [
        {
          id: 'unsupported-review',
          name: 'Unsupported review',
          userName: 'Owner',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'unsupported',
          json: {
            data: { id: 'unsupported-1', version: '1.0.0' },
            user: { id: 'owner-1' },
          },
        },
      ],
      success: true,
      total: 1,
    } as any);

    renderWithProviders(
      <AssignmentReview
        actionRef={React.createRef<any>()}
        tableType='in-progress'
        userData={{ user_id: 'user-admin', role: 'review-admin' }}
      />,
    );

    const nameCell = await screen.findByTestId('pro-table-cell-processName-unsupported-review');
    expect(within(nameCell).getByText('Unsupported review')).toBeInTheDocument();
    expect(within(nameCell).queryByText('ProcessView')).not.toBeInTheDocument();
    expect(within(nameCell).queryByText('LCMView')).not.toBeInTheDocument();
  });

  it('opens reviewed drawer entries with member-specific filters', async () => {
    const memberRecord = {
      email: 'member@example.com',
      pendingCount: 3,
      reviewedCount: 5,
      display_name: 'Reviewer Zero',
      role: 'review-member',
      user_id: 'member-123',
      team_id: 'team-xyz',
    };

    mockGetUserManageTableData.mockResolvedValueOnce({
      data: [memberRecord],
      success: true,
      total: 1,
    } as any);

    renderWithProviders(<ReviewMember userData={{ user_id: 'admin-1', role: 'review-admin' }} />);

    const reviewedCell = await screen.findByTestId(
      'pro-table-cell-reviewedCount-member@example.com',
    );
    fireEvent.click(within(reviewedCell).getByText('5'));

    await screen.findByTestId('drawer');

    await waitFor(() => {
      expect(
        mockGetReviewsTableDataOfReviewMember.mock.calls.some(
          ([, , type, lang, filter]) =>
            type === 'reviewed' &&
            lang === 'en' &&
            typeof filter === 'object' &&
            filter?.user_id === memberRecord.user_id,
        ),
      ).toBe(true);
    });
  });

  it('promotes members to admin and reloads the table on success', async () => {
    const memberRecord = {
      email: 'member@example.com',
      pendingCount: 3,
      reviewedCount: 5,
      display_name: 'Reviewer Zero',
      role: 'review-member',
      user_id: 'member-123',
      team_id: 'team-xyz',
    };

    mockGetUserManageTableData
      .mockResolvedValueOnce({
        data: [memberRecord],
        success: true,
        total: 1,
      } as any)
      .mockResolvedValue({
        data: [memberRecord],
        success: true,
        total: 1,
      } as any);

    mockUpdateRoleApi.mockResolvedValue({ error: null } as any);

    renderWithProviders(<ReviewMember userData={{ user_id: 'admin-1', role: 'review-admin' }} />);

    const memberRow = await screen.findByTestId('pro-table-row-member@example.com');
    const promoteButton = within(memberRow).getByTestId('icon-crown').closest('button');
    expect(promoteButton).toBeTruthy();
    fireEvent.click(promoteButton!);

    await waitFor(() => {
      expect(mockUpdateRoleApi).toHaveBeenCalledWith(
        memberRecord.team_id,
        memberRecord.user_id,
        'review-admin',
      );
    });

    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith('Operation successful');
    });

    await waitFor(() => {
      expect(mockGetUserManageTableData).toHaveBeenCalledTimes(2);
    });
  });

  it('disables review-member management controls for non-admin users', async () => {
    const rows = [
      {
        email: 'admin@example.com',
        pendingCount: 2,
        reviewedCount: 4,
        display_name: 'Review Admin',
        role: 'review-admin',
        user_id: 'admin-1',
        team_id: 'team-xyz',
      },
      {
        email: 'member@example.com',
        pendingCount: 1,
        reviewedCount: 3,
        display_name: 'Review Member',
        role: 'review-member',
        user_id: 'member-1',
        team_id: 'team-xyz',
      },
    ];

    mockGetUserManageTableData.mockResolvedValue({
      data: rows,
      success: true,
      total: rows.length,
    } as any);

    renderWithProviders(
      <ReviewMember userData={{ user_id: 'member-self', role: 'review-member' }} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pro-table-row-admin@example.com')).toBeInTheDocument();
    });

    const toolbar = screen.getByTestId('pro-table-toolbar');
    const addButton = within(toolbar).getByTestId('icon-plus').closest('button');
    expect(addButton).toBeDisabled();

    const adminRow = screen.getByTestId('pro-table-row-admin@example.com');
    const memberRow = screen.getByTestId('pro-table-row-member@example.com');

    expect(within(adminRow).getByTestId('icon-delete').closest('button')).toBeDisabled();
    expect(within(adminRow).getByTestId('icon-crown').closest('button')).toBeDisabled();
    expect(within(adminRow).getByTestId('icon-user').closest('button')).toBeDisabled();
    expect(within(memberRow).getByTestId('icon-delete').closest('button')).toBeDisabled();
    expect(within(memberRow).getByTestId('icon-crown').closest('button')).toBeDisabled();
    expect(within(memberRow).getByTestId('icon-user').closest('button')).toBeDisabled();

    fireEvent.click(addButton!);
    expect(screen.queryByTestId('add-member-modal')).not.toBeInTheDocument();
    expect(mockUpdateRoleApi).not.toHaveBeenCalled();
    expect(mockDelRoleApi).not.toHaveBeenCalled();
  });

  it('shows review-member action errors and only reloads after delete confirmation paths', async () => {
    const memberRecord = {
      email: 'member@example.com',
      pendingCount: 3,
      reviewedCount: 5,
      display_name: 'Reviewer Zero',
      role: 'review-member',
      user_id: 'member-123',
      team_id: 'team-xyz',
    };

    mockGetUserManageTableData.mockResolvedValue({
      data: [memberRecord],
      success: true,
      total: 1,
    } as any);
    mockUpdateRoleApi.mockResolvedValue({ error: 'failure' } as any);
    mockDelRoleApi.mockResolvedValue({ error: 'failure' } as any);

    renderWithProviders(<ReviewMember userData={{ user_id: 'admin-1', role: 'review-admin' }} />);

    const memberRow = await screen.findByTestId('pro-table-row-member@example.com');
    const loadCountAfterOpen = mockGetUserManageTableData.mock.calls.length;

    await act(async () => {
      fireEvent.click(within(memberRow).getByTestId('icon-crown').closest('button')!);
    });

    await waitFor(() => {
      expect(mockUpdateRoleApi).toHaveBeenCalledWith(
        memberRecord.team_id,
        memberRecord.user_id,
        'review-admin',
      );
    });

    expect(message.error).toHaveBeenCalledWith('Operation failed');
    expect(message.success).not.toHaveBeenCalledWith('Operation successful');
    expect(mockGetUserManageTableData).toHaveBeenCalledTimes(loadCountAfterOpen);

    await act(async () => {
      fireEvent.click(within(memberRow).getByTestId('icon-delete').closest('button')!);
    });

    const confirmCalls = ((require('antd') as any).Modal.confirm as jest.Mock).mock.calls;
    const confirmConfig = confirmCalls[confirmCalls.length - 1]?.[0];
    await act(async () => {
      await confirmConfig.onOk?.();
    });

    await waitFor(() => {
      expect(mockDelRoleApi).toHaveBeenCalledWith(
        memberRecord.team_id,
        memberRecord.user_id,
        memberRecord.role,
      );
    });

    expect(message.error).toHaveBeenCalledWith('Operation failed');
    await waitFor(() => {
      expect(mockGetUserManageTableData).toHaveBeenCalledTimes(loadCountAfterOpen + 1);
    });
  });

  test.failing(
    'reloading members table after opening drawer keeps main table action ref intact',
    async () => {
      const memberRecord = {
        email: 'member@example.com',
        pendingCount: 3,
        reviewedCount: 5,
        display_name: 'Reviewer Zero',
        role: 'review-member',
        user_id: 'member-123',
        team_id: 'team-xyz',
      };

      mockGetUserManageTableData.mockResolvedValueOnce({
        data: [memberRecord],
        success: true,
        total: 1,
      } as any);

      renderWithProviders(<ReviewMember userData={{ user_id: 'admin-1', role: 'review-admin' }} />);

      await waitFor(() => {
        expect(mockGetUserManageTableData).toHaveBeenCalledTimes(1);
      });

      const pendingCell = await screen.findByTestId(
        'pro-table-cell-pendingCount-member@example.com',
      );
      fireEvent.click(within(pendingCell).getByText('3'));

      await waitFor(() => {
        expect(
          mockGetReviewsTableDataOfReviewMember.mock.calls.some(
            ([, , type, lang, filter]) =>
              type === 'pending' && lang === 'en' && filter?.user_id === memberRecord.user_id,
          ),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(mockGetUserManageTableData).toHaveBeenCalledTimes(2);
      });
    },
  );
});
