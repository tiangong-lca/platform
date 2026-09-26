// @ts-nocheck
import SelectReviewer from '@/pages/Review/Components/SelectReviewer';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

jest.mock('@umijs/max', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span data-testid='icon-close' />,
  DeleteOutlined: () => <span data-testid='icon-delete' />,
  UsergroupAddOutlined: () => <span data-testid='icon-user' />,
}));

jest.mock('dayjs', () => {
  const actual = jest.requireActual('dayjs');
  return actual;
});

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, onClick, disabled, icon, shape, size, ...rest }: any) => {
    const restProps = { ...rest } as Record<string, any>;
    delete restProps.danger;
    return (
      <button
        {...restProps}
        type='button'
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        data-shape={shape}
        data-size={size}
      >
        {icon}
        {toText(children)}
      </button>
    );
  };

  const Tooltip = ({ children }: any) => <>{children}</>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <>{children}</>;

  const Drawer = ({ open, children, footer, extra, title, getContainer, onClose }: any) =>
    open ? (
      <section
        data-testid='drawer'
        data-container={getContainer?.() === globalThis.document?.body ? 'body' : 'other'}
      >
        <header>{toText(title)}</header>
        <button type='button' onClick={onClose}>
          drawer-on-close
        </button>
        <div>{extra}</div>
        <div>{children}</div>
        <footer>{footer}</footer>
      </section>
    ) : null;

  const DatePicker = ({ onChange, value, disabledDate, placeholder }: any) => {
    const dayjs = require('dayjs');
    const pastDisabled = disabledDate?.(dayjs().subtract(1, 'day'));
    const futureDisabled = disabledDate?.(dayjs().add(1, 'day'));

    return (
      <input
        data-testid='date-picker'
        data-past-disabled={String(!!pastDisabled)}
        data-future-disabled={String(!!futureDisabled)}
        placeholder={placeholder}
        value={value ? String(value) : ''}
        onChange={(event) =>
          onChange?.(
            event?.target?.value ? { toISOString: () => '2026-04-01T00:00:00.000Z' } : null,
          )
        }
      />
    );
  };

  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };

  const App = { useApp: () => ({ message }) };

  const theme = {
    useToken: () => ({ token: { fontSize: 12 } }),
  };

  return {
    __esModule: true,
    Button,
    DatePicker,
    Drawer,
    Space,
    Spin,
    Tooltip,
    App,
    message,
    theme,
  };
});

const ProTable = ({ rowSelection, actionRef, request, columns = [], toolbar, dataSource }: any) => {
  const [rows, setRows] = React.useState<any[]>(dataSource ?? []);

  React.useEffect(() => {
    const reload = jest.fn(async () => {
      const result = await request?.({}, {});
      setRows(result?.data ?? []);
    });

    if (actionRef) {
      actionRef.current = { reload };
    }

    if (request) void reload();
    else setRows(dataSource ?? []);
  }, [actionRef, dataSource, request]);

  return (
    <div data-testid='protable'>
      <div>{toolbar?.title}</div>
      {rowSelection && (
        <button type='button' onClick={() => rowSelection.onChange?.(['user-2'])}>
          select-row
        </button>
      )}
      {rows.map((row) => (
        <div
          key={row.user_id ?? row.reviewer_id}
          data-checkbox-disabled={String(!!rowSelection?.getCheckboxProps?.(row)?.disabled)}
        >
          {columns.map((column: any, index: number) => {
            const value = column?.dataIndex ? row[column.dataIndex] : undefined;
            const rendered =
              typeof column?.render === 'function' ? column.render(value, row, index) : value;
            return <div key={`${row.user_id}-${column.dataIndex ?? index}`}>{rendered}</div>;
          })}
        </div>
      ))}
    </div>
  );
};

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  ProTable: (props: any) => <ProTable {...props} />,
}));

const mockGetReviewerIdsByReviewId = jest.fn();
jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  getReviewerIdsByReviewId: (...args: any[]) => mockGetReviewerIdsByReviewId(...args),
}));

const mockAssignReviewersApi = jest.fn();
const mockGetReviewerIdsApi = jest.fn();
const mockGetReviewsDetail = jest.fn();
const mockRevokeReviewerApi = jest.fn();

jest.mock('@/services/reviews/api', () => ({
  __esModule: true,
  assignReviewersApi: (...args: any[]) => mockAssignReviewersApi(...args),
  getReviewerIdsApi: (...args: any[]) => mockGetReviewerIdsApi(...args),
  getReviewsDetail: (...args: any[]) => mockGetReviewsDetail(...args),
  revokeReviewerApi: (...args: any[]) => mockRevokeReviewerApi(...args),
}));

const mockGetUsersByIds = jest.fn();
jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUsersByIds: (...args: any[]) => mockGetUsersByIds(...args),
}));

const mockGetReviewMembersApi = jest.fn();
jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getReviewMembersApi: (...args: any[]) => mockGetReviewMembersApi(...args),
}));

const { message } = require('antd');

describe('SelectReviewer component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReviewerIdsByReviewId.mockResolvedValue([]);
    mockGetReviewerIdsApi.mockResolvedValue([]);
    mockGetReviewsDetail.mockResolvedValue(null);
    mockGetUsersByIds.mockResolvedValue([]);
    mockRevokeReviewerApi.mockResolvedValue({ data: [{}], error: null });
    mockAssignReviewersApi.mockResolvedValue({ data: [{}], error: null });
    mockGetReviewMembersApi.mockResolvedValue({
      data: [
        {
          user_id: 'user-2',
          email: 'user2@example.com',
          display_name: 'User Two',
          role: 'review-member',
        },
      ],
      success: true,
      total: 1,
    });
    message.success.mockReset();
    message.error.mockReset();
  });

  it('renders the assignment trigger as a small circular icon button', () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const trigger = screen.getByTestId('icon-user').closest('button');

    expect(trigger).toHaveAttribute('data-shape', 'circle');
    expect(trigger).toHaveAttribute('data-size', 'small');
    expect((trigger as HTMLButtonElement).style.width).toBe('');
  });

  it('does not open reviewer assignment while the selected review scope is loading', () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
        disabled
      />,
    );

    const trigger = screen.getByTestId('icon-user').closest('button') as HTMLButtonElement;
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('drawer')).not.toBeInTheDocument();
  });

  it('does not expose a temporary-save action for unassigned reviews', async () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(mockGetReviewerIdsApi).toHaveBeenCalledWith(['review-1']));
    expect(screen.queryByRole('button', { name: 'Temporary Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm assignment' })).toBeInTheDocument();
  });

  it('assigns reviewers with the selected deadline', async () => {
    const actionRef = { current: { reload: jest.fn() } };

    render(<SelectReviewer reviewIds={['review-1']} tabType='unassigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByText('select-row'));
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: '2026-04-01' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    });

    expect(mockAssignReviewersApi).toHaveBeenCalledWith(
      ['review-1'],
      ['user-2'],
      '2026-04-01T00:00:00.000Z',
    );
    expect(message.success).toHaveBeenCalledWith('Reviewer assignments saved successfully.');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('merges existing assigned reviewers and filters them from the selectable list', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewerIdsByReviewId.mockResolvedValue([
      { reviewer_id: 'user-1', state_code: 0 },
      { reviewer_id: 'user-3', state_code: -3 },
      { reviewer_id: 'user-4', state_code: -2 },
    ]);
    mockGetReviewsDetail.mockResolvedValue({
      deadline: '2026-03-20T10:00:00.000Z',
    });
    mockGetUsersByIds.mockResolvedValue([
      { id: 'user-1', display_name: 'User One' },
      { id: 'user-3', display_name: 'User Three' },
    ]);
    mockGetReviewMembersApi.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          email: 'user1@example.com',
          display_name: 'User One',
          role: 'review-member',
        },
        {
          user_id: 'user-2',
          email: 'user2@example.com',
          display_name: 'User Two',
          role: 'review-member',
        },
        {
          user_id: 'user-3',
          email: 'user3@example.com',
          display_name: 'User Three',
          role: 'review-member',
        },
        {
          user_id: 'user-4',
          email: 'user4@example.com',
          display_name: 'User Four',
          role: 'review-member',
        },
      ],
      success: true,
      total: 4,
    });

    render(<SelectReviewer reviewIds={['review-1']} tabType='assigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(mockGetReviewerIdsByReviewId).toHaveBeenCalledWith('review-1'));
    await waitFor(() => expect(mockGetReviewsDetail).toHaveBeenCalledWith('review-1'));
    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());

    expect(screen.getAllByText('User One')).toHaveLength(2);
    expect(screen.getAllByText('User Three')).toHaveLength(2);
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByText('user3@example.com')).toBeInTheDocument();
    expect(screen.getByText('user4@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Temporary Save' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('select-row'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    });

    expect(mockAssignReviewersApi).toHaveBeenCalledWith(
      ['review-1'],
      ['user-1', 'user-3', 'user-2'],
      '2026-03-20T10:00:00.000Z',
    );
    expect(message.success).toHaveBeenCalledWith('Reviewer assignments saved successfully.');
  });

  it('revokes a pending current reviewer immediately', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewerIdsByReviewId.mockResolvedValue([{ reviewer_id: 'user-1', state_code: 0 }]);
    mockGetUsersByIds.mockResolvedValue([{ id: 'user-1', display_name: 'User One' }]);

    render(<SelectReviewer reviewIds={['review-1']} tabType='assigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('User One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('icon-delete').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(mockRevokeReviewerApi).toHaveBeenCalledWith('review-1', 'user-1'));
    expect(message.success).toHaveBeenCalledWith('Reviewer assignment revoked.');
    expect(actionRef.current.reload).toHaveBeenCalled();
    expect(screen.queryByText('Current reviewers')).not.toBeInTheDocument();
  });

  it('keeps the current reviewer when immediate revocation fails', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewerIdsByReviewId.mockResolvedValue([{ reviewer_id: 'user-1', state_code: 0 }]);
    mockGetUsersByIds.mockResolvedValue([{ id: 'user-1', display_name: 'User One' }]);
    mockRevokeReviewerApi.mockResolvedValueOnce({ data: [{}], error: new Error('revoke failed') });

    render(<SelectReviewer reviewIds={['review-1']} tabType='assigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('User One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('icon-delete').closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith('Failed to revoke the reviewer assignment.'),
    );
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(screen.getByText('User One')).toBeInTheDocument();
  });

  it('keeps the current reviewer when revocation returns no changed row', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewerIdsByReviewId.mockResolvedValue([{ reviewer_id: 'user-1', state_code: 0 }]);
    mockGetUsersByIds.mockResolvedValue([{ id: 'user-1', display_name: 'User One' }]);
    mockRevokeReviewerApi.mockResolvedValueOnce({ data: [], error: null });

    render(<SelectReviewer reviewIds={['review-1']} tabType='assigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('User One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('icon-delete').closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith('Failed to revoke the reviewer assignment.'),
    );
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(screen.getByText('User One')).toBeInTheDocument();
  });

  it('keeps the current reviewer when revocation returns no data payload', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewerIdsByReviewId.mockResolvedValue([{ reviewer_id: 'user-1', state_code: 0 }]);
    mockGetUsersByIds.mockResolvedValue([{ id: 'user-1', display_name: 'User One' }]);
    mockRevokeReviewerApi.mockResolvedValueOnce({ data: undefined, error: null });

    render(<SelectReviewer reviewIds={['review-1']} tabType='assigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('User One')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('icon-delete').closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith('Failed to revoke the reviewer assignment.'),
    );
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(screen.getByText('User One')).toBeInTheDocument();
  });

  it('renders deadline controls and supports both close actions', async () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(screen.getByTestId('drawer')).toHaveAttribute('data-container', 'body'),
    );
    expect(screen.getByText('Review Deadline')).toBeInTheDocument();
    expect(screen.getByTestId('date-picker')).toHaveAttribute('data-past-disabled', 'true');
    expect(screen.getByTestId('date-picker')).toHaveAttribute('data-future-disabled', 'false');

    fireEvent.click(screen.getByTestId('icon-close').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'drawer-on-close' }));
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());
  });

  it('shows an error when assigning reviewers fails', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockAssignReviewersApi.mockResolvedValueOnce({ data: [], error: new Error('failed') });

    render(<SelectReviewer reviewIds={['review-1']} tabType='unassigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByText('select-row'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    });

    expect(message.error).toHaveBeenCalledWith('Save failed');
    expect(actionRef.current.reload).not.toHaveBeenCalled();
  });

  it('submits a null deadline when the deadline picker is cleared', async () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByText('select-row'));
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: '' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    });

    expect(mockAssignReviewersApi).toHaveBeenCalledWith(['review-1'], ['user-2'], null);
  });

  it('renders admin and fallback role labels when assigned reviewers are loaded from sparse history', async () => {
    mockGetReviewerIdsByReviewId.mockResolvedValueOnce(undefined);
    mockGetReviewMembersApi.mockResolvedValue({
      data: [
        {
          user_id: 'user-admin',
          email: 'admin@example.com',
          display_name: 'Admin User',
          role: 'review-admin',
        },
        {
          user_id: 'user-unknown',
          email: 'unknown@example.com',
          display_name: 'Unknown User',
          role: 'mystery-role',
        },
      ],
      success: true,
      total: 2,
    });

    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='assigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(mockGetReviewerIdsByReviewId).toHaveBeenCalledWith('review-1'));
    await waitFor(() => expect(screen.getByText('admin@example.com')).toBeInTheDocument());
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('unknown@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Temporary Save' })).not.toBeInTheDocument();
  });

  it('closes from the footer cancel action', async () => {
    render(
      <SelectReviewer
        reviewIds={['review-1']}
        tabType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());
  });

  it('submits a null deadline and shows an error toast when reviewer assignment fails', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockAssignReviewersApi.mockResolvedValueOnce({
      data: [],
      error: new Error('assign failed'),
    });

    render(<SelectReviewer reviewIds={['review-1']} tabType='unassigned' actionRef={actionRef} />);

    fireEvent.click(screen.getByTestId('icon-user').closest('button') as HTMLButtonElement);

    await waitFor(() => expect(screen.getByText('user2@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByText('select-row'));
    fireEvent.change(screen.getByTestId('date-picker'), { target: { value: '' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    });

    expect(mockAssignReviewersApi).toHaveBeenCalledWith(['review-1'], ['user-2'], null);
    expect(message.error).toHaveBeenCalledWith('Save failed');
    expect(actionRef.current.reload).not.toHaveBeenCalled();
  });
});
