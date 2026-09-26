// @ts-nocheck
import AssignmentReview, {
  REVIEW_DATA_TYPE_FILTER_WIDTH,
  REVIEW_DISPLAY_MODE_FILTER_WIDTH,
  SELECTED_REVIEW_ROW_BUTTON_STYLE,
  isExpandableRootReview,
  isReferenceMatchingReviewTab,
  isReviewTargetTableCompatible,
} from '@/pages/Review/Components/AssignmentReview';
import { LOCALE_CAPABILITY_MATRIX } from '@/services/general/localeCapabilities';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '../../../../helpers/testUtils';

let mockLocale = 'en-US';
let mockMainTableProps: any;

jest.mock('@umijs/max', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id, values = {} }: any) =>
    Object.entries(values).reduce(
      (message, [key, value]) => message.replace(`{${key}}`, String(value)),
      defaultMessage ?? id,
    ),
  useIntl: () => ({
    locale: mockLocale,
    formatMessage: ({ defaultMessage, id }: any, values: Record<string, unknown> = {}) =>
      Object.entries(values).reduce(
        (message, [key, value]) => message.replace(`{${key}}`, String(value)),
        defaultMessage ?? id,
      ),
  }),
}));

jest.mock('@/pages/Account/view', () => ({
  __esModule: true,
  default: ({ userId }: any) => <span data-testid='account-view'>{userId}</span>,
}));

jest.mock('@/pages/Contacts/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType }: any) => (
    <span data-testid='contact-view'>{`${id}:${version}:${buttonType}`}</span>
  ),
}));

jest.mock('@/pages/Flowproperties/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType }: any) => (
    <span data-testid='flowproperty-view'>{`${id}:${version}:${buttonType}`}</span>
  ),
}));

jest.mock('@/pages/Flows/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType, tooltipTitle }: any) => (
    <span data-testid='flow-view' data-tooltip-title={tooltipTitle}>
      {`${id}:${version}:${buttonType}`}
    </span>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType }: any) => (
    <span data-testid='lifecycle-view'>{`${id}:${version}:${buttonType}`}</span>
  ),
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType, tooltipTitle }: any) => (
    <span data-testid='process-view' data-tooltip-title={tooltipTitle}>
      {`${id}:${version}:${buttonType}`}
    </span>
  ),
}));

jest.mock('@/pages/Sources/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType }: any) => (
    <span data-testid='source-view'>{`${id}:${version}:${buttonType}`}</span>
  ),
}));

jest.mock('@/pages/Unitgroups/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType }: any) => (
    <span data-testid='unitgroup-view'>{`${id}:${version}:${buttonType}`}</span>
  ),
}));

jest.mock('@/pages/Review/Components/RejectReview', () => ({
  __esModule: true,
  default: ({ reviewId }: any) => <span data-testid='reject-review'>{reviewId}</span>,
}));

jest.mock('@/pages/Review/Components/reviewLifeCycleModels', () => ({
  __esModule: true,
  default: ({ type, tabType, reviewId }: any) => (
    <span data-testid='review-lifecycle-detail'>{`${type}:${tabType}:${reviewId}`}</span>
  ),
}));

jest.mock('@/pages/Review/Components/reviewProcess', () => ({
  __esModule: true,
  default: ({ type, tabType, reviewId, hideButton }: any) => (
    <span data-testid='review-process-detail'>
      {`${type}:${tabType}:${reviewId}:${hideButton ? 'hide' : 'show'}`}
    </span>
  ),
}));

jest.mock('@/pages/Review/Components/ReviewProgress', () => ({
  __esModule: true,
  default: ({ reviewId, actionType }: any) => (
    <span data-testid='review-progress'>{`${reviewId}:${actionType}`}</span>
  ),
}));

jest.mock('@/pages/Review/Components/SelectReviewer', () => ({
  __esModule: true,
  default: ({ reviewIds, tabType, disabled }: any) => (
    <div data-testid='select-reviewer' data-disabled={String(!!disabled)}>
      {`${tabType}:${JSON.stringify(reviewIds)}`}
    </div>
  ),
}));

jest.mock('@/pages/Review/Components/BatchReviewActions', () => ({
  __esModule: true,
  default: ({ role, reviewIds, allowApprove, disabled, onFinished }: any) => (
    <div data-testid='batch-review-actions' data-disabled={String(!!disabled)}>
      {`${role}:${String(allowApprove)}:${JSON.stringify(reviewIds)}`}
      <button type='button' onClick={() => onFinished?.([...reviewIds, 'reference-review-1'])}>
        finish-batch-with-failures
      </button>
    </div>
  ),
}));

jest.mock('@/pages/Review/Components/SimpleReviewActions', () => ({
  __esModule: true,
  default: ({ reviewId, role, targetTable, actionRef }: any) => (
    <button
      type='button'
      data-testid='simple-review-actions'
      onClick={() => actionRef?.current?.reload?.()}
    >
      {`${reviewId}:${role}:${targetTable}`}
    </button>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Card = ({ children }: any) => <section>{children}</section>;
  const Button = ({ children, icon, onClick, 'aria-label': ariaLabel }: any) => (
    <button type='button' aria-label={ariaLabel} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
  const Col = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Select = ({ value, onChange, options = [], labelRender, 'aria-label': ariaLabel }: any) => {
    const selectedOption = options.find((option: any) => option.value === value);

    return (
      <div>
        {labelRender?.({ label: selectedOption?.label })}
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option: any) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };
  const Space = ({ children }: any) => <div>{children}</div>;
  const Spin = ({ children }: any) => <div data-testid='spin'>{children}</div>;
  const Table = ({ columns = [], dataSource = [], rowSelection }: any) => (
    <div data-testid='subtable'>
      {dataSource.map((row: any) => (
        <div
          key={row.id ?? row.reference_review_id}
          data-testid={`subrow-${row.id ?? row.reference_review_id}`}
        >
          {rowSelection && (
            <button
              type='button'
              aria-pressed={rowSelection.selectedRowKeys?.includes(row.reference_review_id)}
              onClick={() => {
                const currentKeys = rowSelection.selectedRowKeys ?? [];
                const nextKeys = currentKeys.includes(row.reference_review_id)
                  ? currentKeys.filter((id: React.Key) => id !== row.reference_review_id)
                  : [...currentKeys, row.reference_review_id];
                rowSelection.onChange?.(nextKeys);
              }}
            >
              {`select-child-${row.reference_review_id}`}
            </button>
          )}
          {columns.map((column: any, index: number) => (
            <div key={index}>
              {column.render
                ? column.render(row[column.dataIndex], row, index)
                : row[column.dataIndex]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const Search = ({ placeholder, onSearch }: any) => (
    <div>
      <input data-testid='search-input' placeholder={placeholder} defaultValue='keyword' />
      <button
        type='button'
        onClick={() =>
          onSearch?.(
            (globalThis.document.querySelector('[data-testid=search-input]') as HTMLInputElement)
              .value,
            {},
            { source: 'manual' },
          )
        }
      >
        trigger-search
      </button>
      <button type='button' onClick={() => onSearch?.('', {}, { source: 'clear' })}>
        clear-search
      </button>
    </div>
  );
  const Input: any = {};
  Input.Search = Search;

  const theme = {
    useToken: () => ({ token: { colorPrimary: '#1677ff', fontSize: 14 } }),
  };
  const Tag = ({ children, color }: any) => <span data-color={color}>{children}</span>;
  const Tooltip = ({ children, title }: any) => <span title={title}>{children}</span>;

  return {
    __esModule: true,
    Alert: ({ title }: any) => <div role='alert'>{title}</div>,
    Button,
    Card,
    Col,
    Input,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    theme,
    Tooltip,
  };
});

const MockProTable = ({
  dataSource,
  params,
  request,
  actionRef,
  rowSelection,
  toolBarRender,
  headerTitle,
  columns,
  expandable,
  tableAlertRender,
  tableAlertOptionRender,
  pagination,
  scroll,
  style,
  tableLayout,
}: any) => {
  mockMainTableProps = { columns, expandable, params, request, scroll, style, tableLayout };
  const React = require('react');
  const [rows, setRows] = React.useState<any[]>([]);
  const requestRef = React.useRef(request);
  const actionRefRef = React.useRef(actionRef);

  requestRef.current = request;
  actionRefRef.current = actionRef;

  React.useEffect(() => {
    const reload = jest.fn(async () => {
      const result = await requestRef.current?.(
        { ...params, pageSize: pagination?.pageSize ?? 50, current: 1 },
        {},
      );
      if (result?.success !== false) setRows(result?.data ?? []);
      return result;
    });

    if (actionRefRef.current) {
      actionRefRef.current.current = { reload, setPageInfo: jest.fn() };
    }

    reload();
  }, [JSON.stringify(params)]);

  tableAlertRender?.({
    intl: {
      getMessage: (_id: string, defaultMessage: string) => defaultMessage,
    },
    selectedRowKeys: undefined,
  });

  return (
    <section data-testid='protable'>
      <div data-testid='header-title'>{headerTitle}</div>
      <div data-testid='toolbar'>{toolBarRender?.()}</div>
      <div data-testid='table-alert'>
        {(rowSelection?.selectedRowKeys?.length ?? 0) > 0 &&
          tableAlertRender?.({
            selectedRowKeys: rowSelection?.selectedRowKeys ?? [],
            intl: {
              getMessage: (id: string, defaultMessage: string) => defaultMessage,
            },
          })}
        {tableAlertOptionRender?.({
          selectedRowKeys: rowSelection?.selectedRowKeys ?? [],
          onCleanSelected: () => rowSelection?.onChange?.([]),
        })}
      </div>
      {(dataSource ?? rows).map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {columns.map((column: any, index: number) => (
            <div key={index}>
              {column.render
                ? column.render(row[column.dataIndex], row, index)
                : row[column.dataIndex]}
            </div>
          ))}
          {rowSelection && (
            <>
              <button
                type='button'
                disabled={rowSelection.getCheckboxProps?.(row)?.disabled}
                aria-pressed={rowSelection.selectedRowKeys?.includes(row.id)}
                onClick={() => {
                  const currentKeys = rowSelection.selectedRowKeys ?? [];
                  rowSelection.onChange?.(
                    currentKeys.includes(row.id)
                      ? currentKeys.filter((id: React.Key) => id !== row.id)
                      : [...currentKeys, row.id],
                  );
                }}
              >
                {`select-${row.id}`}
              </button>
              <button type='button' onClick={() => rowSelection.onChange?.([row.id, row.id])}>
                {`select-duplicate-${row.id}`}
              </button>
            </>
          )}
          {expandable?.rowExpandable?.(row) && (
            <>
              <button type='button' onClick={() => expandable.onExpand?.(true, row)}>
                {`expand-${row.id}`}
              </button>
              <button
                type='button'
                onClick={() => {
                  const preview = expandable.expandedRowRender?.(row);
                  preview?.props?.children?.props?.rowSelection?.onChange?.([]);
                }}
              >
                {`preview-empty-${row.id}`}
              </button>
            </>
          )}
          {expandable?.expandedRowKeys?.includes(row.id) && (
            <div data-testid={`expanded-${row.id}`}>
              {expandable.expandedRowRender?.(row)}
              <button type='button' onClick={() => expandable.onExpand?.(false, row)}>
                {`collapse-${row.id}`}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
};

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  ProTable: (props: any) => <MockProTable {...props} />,
}));

const mockGetRootReviewReferenceProgress = jest.fn();
const mockGetReviewsTableDataOfReviewAdmin = jest.fn();
const mockGetReviewsTableDataOfReviewMember = jest.fn();

jest.mock('@/services/reviews/api', () => ({
  __esModule: true,
  getRootReviewReferenceProgress: (...args: any[]) => mockGetRootReviewReferenceProgress(...args),
  getReviewsTableDataOfReviewAdmin: (...args: any[]) =>
    mockGetReviewsTableDataOfReviewAdmin(...args),
  getReviewsTableDataOfReviewMember: (...args: any[]) =>
    mockGetReviewsTableDataOfReviewMember(...args),
}));

const getSelectReviewerByContent = (content: string) => {
  const action = screen
    .getAllByTestId('select-reviewer')
    .find((item) => item.textContent === content);
  if (!action) throw new Error(`SelectReviewer action not found: ${content}`);
  return action;
};

const getDisabledSelectReviewer = () => {
  const action = screen
    .getAllByTestId('select-reviewer')
    .find((item) => item.getAttribute('data-disabled') === 'true');
  if (!action) throw new Error('Disabled SelectReviewer action not found');
  return action;
};

describe('AssignmentReview', () => {
  it.each([
    'unassigned',
    'in-progress',
    'completed',
    'pending',
    'submitted',
    'assigned',
    'reviewed',
    'reviewer-rejected',
    'admin-rejected',
  ])('keeps the %s main-table action column fixed and centered', async (tableType) => {
    const role = ['pending', 'submitted', 'reviewed', 'reviewer-rejected'].includes(tableType)
      ? 'review-member'
      : 'review-admin';
    render(
      <AssignmentReview
        userData={{ user_id: 'user-1', role }}
        tableType={tableType as any}
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId(role === 'review-member' ? 'row-review-2' : 'row-review-1');
    expect(mockMainTableProps.scroll).toEqual({ x: 'max-content' });
    expect(
      mockMainTableProps.columns.find((column: any) => column.dataIndex === 'actions'),
    ).toMatchObject({ align: 'center', fixed: 'right', width: 168 });
  });

  it('shows reviewer-opinion totals on the admin in-progress progress tooltip', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-with-opinions',
          name: 'Review with opinions',
          targetTable: 'flows',
          reviewerCount: 3,
          completedReviewerCount: 2,
          approveOpinionCount: 1,
          rejectOpinionCount: 1,
          json: { data: { id: 'flow-1', version: '1.0.0' } },
        },
        {
          id: 'review-without-reviewers',
          name: 'Review without reviewers',
          targetTable: 'flows',
          reviewerCount: 0,
          completedReviewerCount: 0,
          json: { data: { id: 'flow-2', version: '1.0.0' } },
        },
        {
          id: 'review-with-defaulted-opinions',
          name: 'Review with defaulted opinions',
          targetTable: 'flows',
          reviewerCount: 2,
          completedReviewerCount: 0,
          json: { data: { id: 'flow-3', version: '1.0.0' } },
        },
      ],
      total: 3,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='in-progress'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const progress = (await screen.findByTestId('row-review-with-opinions')).querySelector(
      '[aria-label^="2/3"]',
    );
    expect(progress).toHaveTextContent('2/3');
    expect(progress).toHaveAttribute('tabindex', '0');
    expect(progress).toHaveAttribute(
      'aria-label',
      '2/3; Reviewer opinions: Approve: 1; reject: 1; pending: 1.',
    );
    expect(progress?.parentElement).toHaveAttribute(
      'title',
      'Reviewer opinions: Approve: 1; reject: 1; pending: 1.',
    );

    const noReviewers = screen
      .getByTestId('row-review-without-reviewers')
      .querySelector('[aria-label^="0/0"]');
    expect(noReviewers).toHaveTextContent('0/0');
    expect(noReviewers?.parentElement).toHaveAttribute(
      'title',
      'Reviewer opinions: No reviewers assigned yet.',
    );

    const defaultedOpinions = screen
      .getByTestId('row-review-with-defaulted-opinions')
      .querySelector('[aria-label^="0/2"]');
    expect(defaultedOpinions?.parentElement).toHaveAttribute(
      'title',
      'Reviewer opinions: Approve: 0; reject: 0; pending: 2.',
    );
  });

  it('shows readable review data beside a plain task name without exposing unreadable data', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'readable-review',
          name: 'Readable flow',
          reviewKind: 'root',
          targetTable: 'flows',
          rootCanRead: true,
          json: { data: { id: 'flow-visible', version: '1.0.0' } },
        },
        {
          id: 'unreadable-review',
          name: 'Unreadable flow',
          reviewKind: 'root',
          targetTable: 'flows',
          rootCanRead: false,
          json: { data: { id: 'flow-hidden', version: '1.0.0' } },
        },
      ],
      total: 2,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const readableRow = await screen.findByTestId('row-readable-review');
    const unreadableRow = screen.getByTestId('row-unreadable-review');
    expect(readableRow).toHaveTextContent('Readable flow');
    expect(readableRow.querySelector('[data-testid="flow-view"]')).toHaveTextContent(
      'flow-visible:1.0.0:icon',
    );
    expect(readableRow.querySelector('[data-testid="flow-view"]')).toHaveAttribute(
      'data-tooltip-title',
      'View data',
    );
    expect(unreadableRow).toHaveTextContent('Unreadable flow');
    expect(unreadableRow.querySelector('[data-testid="flow-view"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Readable flow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the review table within its panel and gives dense columns stable widths', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId('row-review-1');

    expect(mockMainTableProps.style).toEqual({ maxWidth: '100%' });
    expect(mockMainTableProps.tableLayout).toBe('fixed');
    expect(mockMainTableProps.scroll).toEqual({ x: 'max-content' });
    expect(
      Object.fromEntries(
        mockMainTableProps.columns.map((column: any) => [column.dataIndex, column.width]),
      ),
    ).toMatchObject({
      index: 72,
      processName: 420,
      userName: 220,
      createAt: 180,
      deadline: 180,
      stateCode: 140,
      actions: 168,
    });

    const expandedRow = mockMainTableProps.expandable.expandedRowRender({ id: 'review-1' });
    const childTable = expandedRow.props.children;
    expect(childTable.props.scroll).toEqual({ x: 'max-content' });
    expect(childTable.props.columns.find((column: any) => column.key === 'actions')).toMatchObject({
      align: 'center',
      fixed: 'right',
      width: 168,
    });
  });

  it('keeps review filters at their Chinese-option widths across locales', () => {
    expect(REVIEW_DISPLAY_MODE_FILTER_WIDTH).toBe('10.5em');
    expect(REVIEW_DATA_TYPE_FILTER_WIDTH).toBe('9.5em');
  });

  it('removes button rings outside action columns', () => {
    expect(SELECTED_REVIEW_ROW_BUTTON_STYLE).toContain(
      '.ant-table-cell:not(.review-action-column)',
    );
    expect(SELECTED_REVIEW_ROW_BUTTON_STYLE).toContain('background: transparent !important');
    expect(SELECTED_REVIEW_ROW_BUTTON_STYLE).toContain('border-color: transparent !important');
    expect(SELECTED_REVIEW_ROW_BUTTON_STYLE).toContain('box-shadow: none');
  });

  it.each([
    [{ reviewKind: 'root', targetTable: 'processes' }, true],
    [{ reviewKind: 'root', targetTable: 'lifecyclemodels' }, true],
    [{ reviewKind: 'root', targetTable: 'contacts' }, false],
    [{ reviewKind: 'reference', targetTable: 'processes' }, false],
  ])('limits reference subtables to process/model root rows', (record, expected) => {
    expect(isExpandableRootReview(record as any)).toBe(expected);
  });

  it.each([
    ['all', 'processes', true],
    ['all', 'sources', true],
    ['model_process', 'processes', true],
    ['model_process', 'lifecyclemodels', true],
    ['model_process', 'sources', false],
    ['other', 'sources', true],
    ['other', 'processes', false],
  ])('matches %s display mode compatibility for %s', (displayMode, targetTable, expected) => {
    expect(isReviewTargetTableCompatible(displayMode as any, targetTable as any)).toBe(expected);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocale = 'en-US';
    mockGetRootReviewReferenceProgress.mockResolvedValue({
      data: [
        {
          reference_review_id: 'reference-review-1',
          target_table: 'flows',
          data_id: 'flow-1',
          data_version: '1.0.0',
          data_name: {
            baseName: { en: 'Reference Flow' },
          },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
          relation_paths: [{ path: ['process', 'flow'] }],
        },
      ],
      error: null,
    });
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'review-1',
          name: 'Model Review',
          userName: 'Owner',
          isFromLifeCycle: true,
          reviewKind: 'root',
          targetTable: 'lifecyclemodels',
          modelData: { id: 'model-1', version: '1.0.0' },
          json: {
            data: { id: 'model-1', version: '1.0.0' },
            user: { id: 'user-0' },
          },
        },
      ],
      total: 1,
    });
    mockGetReviewsTableDataOfReviewMember.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'review-2',
          name: 'Process Review',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'processes',
          json: {
            data: { id: 'process-2', version: '2.0.0' },
            user: { id: 'user-2' },
          },
        },
      ],
      total: 1,
    });
  });

  it.each([
    ['unassigned', { state_code: 0 }, true],
    ['in-progress', { state_code: 1 }, true],
    ['assigned', { state_code: 1 }, true],
    ['admin-rejected', { state_code: -1 }, true],
    ['pending', { state_code: 1, actor_comment_state_code: 0 }, true],
    ['pending', { state_code: 0, actor_comment_state_code: 0 }, false],
    ['submitted', { state_code: 1, actor_comment_state_code: -3 }, true],
    ['reviewed', { state_code: 1, actor_comment_state_code: 1 }, true],
    ['reviewed', { state_code: 0, actor_comment_state_code: 1 }, false],
    ['reviewer-rejected', { state_code: -1, actor_comment_state_code: -1 }, true],
    ['reviewer-rejected', { state_code: 1, actor_comment_state_code: -1 }, false],
    ['unsupported', { state_code: 1 }, false],
  ])('matches reference state against the %s tab', (tableType, record, expected) => {
    expect(isReferenceMatchingReviewTab(record as any, tableType as any)).toBe(expected);
  });

  it.each(
    LOCALE_CAPABILITY_MATRIX.map(({ appLocale, contentLanguage }) => [appLocale, contentLanguage]),
  )(
    'uses registry content language %s -> %s for review requests',
    async (appLocale, languageCode) => {
      mockLocale = appLocale;
      render(
        <AssignmentReview
          userData={{ user_id: 'admin-1', role: 'review-admin' }}
          tableType='unassigned'
          actionRef={{ current: { reload: jest.fn() } }}
        />,
      );

      await waitFor(() =>
        expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
          { pageSize: 50, current: 1 },
          {},
          'unassigned',
          languageCode,
        ),
      );
    },
  );

  it('reloads the same table instance and clears root-reference expansion after locale changes', async () => {
    const actionRef = { current: undefined };
    const { rerender } = render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-1' }));
    await waitFor(() =>
      expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledWith('review-1'),
    );
    expect(screen.getByTestId('expanded-review-1')).toBeInTheDocument();

    mockLocale = 'de-DE';
    rerender(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'de',
      ),
    );
    expect(screen.getAllByTestId('protable')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('expanded-review-1')).not.toBeInTheDocument());
  });

  it('loads unassigned admin data, shows reviewer selection toolbar, and expands references', async () => {
    const actionRef = { current: { reload: jest.fn() } };

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
      ),
    );
    expect(screen.getByTestId('search-input')).toHaveAttribute(
      'placeholder',
      'pages.search.keyWord',
    );
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    expect(screen.getByTestId('reject-review')).toHaveTextContent('review-1');

    await userEvent.click(screen.getByRole('button', { name: 'select-review-1' }));
    await waitFor(() =>
      expect(
        getSelectReviewerByContent('unassigned:["review-1","reference-review-1"]'),
      ).toHaveTextContent('unassigned:["review-1","reference-review-1"]'),
    );
    expect(getSelectReviewerByContent('unassigned:["review-1"]')).toBeInTheDocument();
    expect(screen.getAllByTestId('select-reviewer')).toHaveLength(2);
    expect(screen.getByText('Selected 1 root reviews and 1 reference reviews')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).not.toHaveTextContent(
      'Selected 1 root reviews and 1 reference reviews',
    );
    expect(screen.getByTestId('table-alert')).toHaveTextContent(
      'Selected 2 itemsSelected 1 root reviews and 1 reference reviews',
    );
    expect(screen.getByTestId('batch-review-actions')).toHaveTextContent(
      'admin:false:["review-1","reference-review-1"]',
    );

    await userEvent.click(screen.getByRole('button', { name: 'expand-review-1' }));
    await waitFor(() =>
      expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledWith('review-1'),
    );
    expect(screen.getByText('flows')).toBeInTheDocument();
    expect(screen.getAllByText('1.0.0')).toHaveLength(2);
    expect(screen.getByText('Unassigned Task')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.queryByText('{"path":["process","flow"]}')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'select-child-reference-review-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'finish-batch-with-failures' }));
    await waitFor(() =>
      expect(screen.getByTestId('batch-review-actions')).toHaveTextContent(
        'admin:false:["review-1","reference-review-1"]',
      ),
    );
  });

  it('filters server-side by display mode and data type while clearing incompatible state', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const displayModeSelect = await screen.findByRole('combobox', { name: 'Display mode' });
    const dataTypeSelect = screen.getByRole('combobox', { name: 'Data type' });
    expect(displayModeSelect).toHaveValue('all');
    expect(dataTypeSelect).toHaveValue('all');

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));
    expect(
      await screen.findByText('Selected 1 root reviews and 1 reference reviews'),
    ).toBeInTheDocument();

    await userEvent.selectOptions(displayModeSelect, 'model_process');
    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenLastCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
        { displayMode: 'model_process' },
      ),
    );
    expect(
      screen.queryByText('Selected 1 root reviews and 1 reference reviews'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'menu.mydata.sources' })).not.toBeInTheDocument();

    await userEvent.selectOptions(dataTypeSelect, 'processes');
    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenLastCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
        { displayMode: 'model_process', targetTable: 'processes' },
      ),
    );

    await userEvent.selectOptions(dataTypeSelect, 'all');
    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenLastCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
        { displayMode: 'model_process' },
      ),
    );
    await userEvent.selectOptions(dataTypeSelect, 'processes');

    await userEvent.selectOptions(displayModeSelect, 'other');
    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenLastCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'en',
        { displayMode: 'other' },
      ),
    );
    expect(dataTypeSelect).toHaveValue('all');
    expect(screen.queryByRole('option', { name: 'menu.processes' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'menu.mydata.sources' })).toBeInTheDocument();
  });

  it('opens the Review Admin quality diagnostic from the list toolbar', async () => {
    const onOpenQualityDiagnostic = jest.fn();
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
        onOpenQualityDiagnostic={onOpenQualityDiagnostic}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Run quality diagnostic' }));

    expect(onOpenQualityDiagnostic).toHaveBeenCalledTimes(1);
  });

  it('hides the quality diagnostic action from the rejected admin list', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='admin-rejected'
        actionRef={{ current: { reload: jest.fn() } }}
        onOpenQualityDiagnostic={jest.fn()}
      />,
    );

    await screen.findByTestId('protable');
    expect(
      screen.queryByRole('button', { name: 'Run quality diagnostic' }),
    ).not.toBeInTheDocument();
  });

  it('selects a flat reference row directly without loading a child table', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'flat-reference-review',
          name: 'Flat reference',
          userName: 'Owner',
          reviewKind: 'reference',
          targetTable: 'flows',
          rootMatchesStatus: true,
          rootCanRead: true,
          json: {
            data: { id: 'flow-flat', version: '1.0.0' },
            user: { id: 'owner-flat' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'select-flat-reference-review' }),
    );
    expect(screen.getByText('Selected 0 root reviews and 1 reference reviews')).toBeInTheDocument();
    expect(getSelectReviewerByContent('unassigned:["flat-reference-review"]')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'expand-flat-reference-review' }),
    ).not.toBeInTheDocument();
    expect(mockGetRootReviewReferenceProgress).not.toHaveBeenCalled();
  });

  it('shows review-admin batch approve and reject actions for assigned selections', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));

    expect(await screen.findByTestId('batch-review-actions')).toHaveTextContent(
      'admin:true:["review-1"]',
    );
    expect(screen.getByTestId('select-reviewer')).toHaveTextContent('assigned:["review-1"]');
  });

  it('shows reviewer opinion batch actions for pending selections', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-2' }));

    expect(await screen.findByTestId('batch-review-actions')).toHaveTextContent(
      'reviewer:true:["review-2"]',
    );
  });

  it('clears the unified root and reference selection from the table alert', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));
    expect(
      await screen.findByText('Selected 1 root reviews and 1 reference reviews'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Selected 1 root reviews and 1 reference reviews'),
      ).not.toBeInTheDocument(),
    );
  });

  it('reuses an in-flight reference request and deduplicates selection loading failures', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let resolveReferences: (value: any) => void = () => undefined;
    mockGetRootReviewReferenceProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReferences = resolve;
      }),
    );

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-duplicate-review-1' }));
    expect(screen.queryByText('Loading referenced reviews...')).not.toBeInTheDocument();
    expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(1);

    resolveReferences({ data: [], error: new Error('duplicate selection load failed') });
    expect(
      await screen.findByText(
        'Failed to load referenced reviews. Reselect the root review to retry.',
      ),
    ).toBeInTheDocument();
    expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('shares one in-flight reference request between expansion and root selection', async () => {
    let resolveReferences: (value: any) => void = () => undefined;
    mockGetRootReviewReferenceProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReferences = resolve;
      }),
    );

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'select-review-1' }));
    expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(1);

    resolveReferences({ data: [], error: null });
    await waitFor(() => expect(screen.getByTestId('expanded-review-1')).toBeInTheDocument());
  });

  it('does not auto-select references when a root is deselected before loading completes', async () => {
    let resolveReferences: (value: any) => void = () => undefined;
    mockGetRootReviewReferenceProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReferences = resolve;
      }),
    );

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const rootSelection = await screen.findByRole('button', { name: 'select-review-1' });
    await userEvent.click(rootSelection);
    expect(screen.queryByText('Loading referenced reviews...')).not.toBeInTheDocument();
    await userEvent.click(rootSelection);

    resolveReferences({
      data: [
        {
          reference_review_id: 'late-reference-review',
          target_table: 'flows',
          data_id: 'late-flow',
          data_version: '1.0.0',
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    });

    await waitFor(() =>
      expect(screen.queryByText('Loading referenced reviews...')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/Selected .* root reviews/)).not.toBeInTheDocument();
  });

  it('uses empty reference rows safely before a root scope has loaded', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'preview-empty-review-1' }));
    expect(mockGetRootReviewReferenceProgress).not.toHaveBeenCalled();
  });

  it('disables batch assignment while selecting a root loads its current-tab references', async () => {
    let resolveReferences: (value: any) => void = () => undefined;
    mockGetRootReviewReferenceProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReferences = resolve;
      }),
    );

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));
    expect(screen.queryByText('Loading referenced reviews...')).not.toBeInTheDocument();
    expect(getDisabledSelectReviewer()).toHaveAttribute('data-disabled', 'true');

    resolveReferences({
      data: [
        {
          reference_review_id: 'reference-review-loading',
          target_table: 'flows',
          data_id: 'flow-loading',
          data_version: '1.0.0',
          data_name: { baseName: { en: 'Loading flow' } },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    });

    await waitFor(() =>
      expect(
        getSelectReviewerByContent('unassigned:["review-1","reference-review-loading"]'),
      ).toHaveTextContent('unassigned:["review-1","reference-review-loading"]'),
    );
    expect(
      getSelectReviewerByContent('unassigned:["review-1","reference-review-loading"]'),
    ).toHaveAttribute('data-disabled', 'false');
  });

  it('keeps batch assignment disabled when a selected root reference scope fails to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetRootReviewReferenceProgress.mockRejectedValueOnce(new Error('scope load failed'));

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));

    expect(
      await screen.findByText(
        'Failed to load referenced reviews. Reselect the root review to retry.',
      ),
    ).toBeInTheDocument();
    expect(getDisabledSelectReviewer()).toHaveTextContent('unassigned:["review-1"]');
    expect(getDisabledSelectReviewer()).toHaveAttribute('data-disabled', 'true');

    const rootSelection = screen.getByRole('button', { name: 'select-review-1' });
    await userEvent.click(rootSelection);
    await userEvent.click(rootSelection);
    await waitFor(() =>
      expect(
        getSelectReviewerByContent('unassigned:["review-1","reference-review-1"]'),
      ).toHaveTextContent('unassigned:["review-1","reference-review-1"]'),
    );
    consoleError.mockRestore();
  });

  it('supports selecting a child review independently when its root is not actionable', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'assigned-root',
          name: 'Assigned root',
          userName: 'Owner',
          reviewKind: 'root',
          targetTable: 'processes',
          rootMatchesStatus: false,
          json: {
            data: { id: 'process-1', version: '1.0.0' },
            user: { id: 'owner-1' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-assigned-root' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'select-child-reference-review-1' }),
    );

    expect(screen.getByText('Selected 0 root reviews and 1 reference reviews')).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId('select-reviewer')
        .some((item) => item.textContent === 'unassigned:["reference-review-1"]'),
    ).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'select-child-reference-review-1' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Selected 0 root reviews and 1 reference reviews'),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps manually selected children when the root is deselected', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const rootSelection = await screen.findByRole('button', { name: 'select-review-1' });
    await userEvent.click(rootSelection);
    await waitFor(() =>
      expect(
        getSelectReviewerByContent('unassigned:["review-1","reference-review-1"]'),
      ).toHaveTextContent('unassigned:["review-1","reference-review-1"]'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'expand-review-1' }));
    const childSelection = await screen.findByRole('button', {
      name: 'select-child-reference-review-1',
    });
    expect(childSelection).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(childSelection);
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('select-reviewer')
          .some((item) => item.textContent === 'unassigned:["review-1"]'),
      ).toBe(true),
    );
    await userEvent.click(childSelection);
    await userEvent.click(rootSelection);

    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('select-reviewer')
          .some((item) => item.textContent === 'unassigned:["reference-review-1"]'),
      ).toBe(true),
    );
    expect(screen.getByText('Selected 0 root reviews and 1 reference reviews')).toBeInTheDocument();
  });

  it('deduplicates a shared reference when multiple roots are selected together', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: ['root-a', 'root-b'].map((id) => ({
        id,
        name: id,
        userName: 'Owner',
        reviewKind: 'root',
        targetTable: 'processes',
        rootMatchesStatus: true,
        json: {
          data: { id: `process-${id}`, version: '1.0.0' },
          user: { id: 'owner-1' },
        },
      })),
      total: 2,
    });
    mockGetRootReviewReferenceProgress.mockImplementation(async () => ({
      data: [
        {
          reference_review_id: 'shared-reference-review',
          target_table: 'sources',
          data_id: 'shared-source',
          data_version: '1.0.0',
          data_name: { baseName: { en: 'Shared source' } },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    }));

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-root-a' }));
    await userEvent.click(screen.getByRole('button', { name: 'select-root-b' }));

    await waitFor(() =>
      expect(
        getSelectReviewerByContent('unassigned:["root-a","root-b","shared-reference-review"]'),
      ).toHaveTextContent('unassigned:["root-a","root-b","shared-reference-review"]'),
    );
    expect(screen.getByText('Selected 2 root reviews and 1 reference reviews')).toBeInTheDocument();
  });

  it('reconciles excluded shared references while root selections change', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: ['root-a', 'root-b'].map((id) => ({
        id,
        name: id,
        userName: 'Owner',
        reviewKind: 'root',
        targetTable: 'processes',
        rootMatchesStatus: true,
        json: {
          data: { id: `process-${id}`, version: '1.0.0' },
          user: { id: 'owner-1' },
        },
      })),
      total: 2,
    });
    mockGetRootReviewReferenceProgress.mockResolvedValue({
      data: [
        {
          reference_review_id: 'shared-reference-review',
          target_table: 'sources',
          data_id: 'shared-source',
          data_version: '1.0.0',
          data_name: { baseName: { en: 'Shared source' } },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const rootASelection = await screen.findByRole('button', { name: 'select-root-a' });
    await userEvent.click(rootASelection);
    await userEvent.click(screen.getByRole('button', { name: 'expand-root-a' }));
    const childSelection = await screen.findByRole('button', {
      name: 'select-child-shared-reference-review',
    });
    await waitFor(() => expect(childSelection).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(childSelection);
    await waitFor(() => expect(childSelection).toHaveAttribute('aria-pressed', 'false'));
    await userEvent.click(screen.getByRole('button', { name: 'select-root-b' }));
    await waitFor(() => expect(childSelection).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(childSelection);
    await waitFor(() => expect(childSelection).toHaveAttribute('aria-pressed', 'false'));
    await userEvent.click(rootASelection);
    await waitFor(() =>
      expect(
        screen.getByText('Selected 1 root reviews and 0 reference reviews'),
      ).toBeInTheDocument(),
    );
  });

  it('keeps another root load failure when selecting a different root', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: ['root-a', 'root-b'].map((id) => ({
        id,
        name: id,
        userName: 'Owner',
        reviewKind: 'root',
        targetTable: 'processes',
        rootMatchesStatus: true,
        json: {
          data: { id: `process-${id}`, version: '1.0.0' },
          user: { id: 'owner-1' },
        },
      })),
      total: 2,
    });
    mockGetRootReviewReferenceProgress
      .mockRejectedValueOnce(new Error('root-a load failed'))
      .mockResolvedValueOnce({ data: [], error: null });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'select-root-a' }));
    expect(
      await screen.findByText(
        'Failed to load referenced reviews. Reselect the root review to retry.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'select-root-b' }));
    await waitFor(() => expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText('Failed to load referenced reviews. Reselect the root review to retry.'),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('keeps a root in the unassigned tab for a matching child while isolating root actions', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'root-assigned-child-unassigned',
          name: 'Assigned root',
          userName: 'Owner',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'processes',
          rootMatchesStatus: false,
          json: {
            data: { id: 'process-root', version: '1.0.0' },
            user: { id: 'owner-1' },
          },
        },
      ],
      total: 1,
    });
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'reference-unassigned-only',
          target_table: 'flows',
          data_id: 'flow-unassigned',
          data_version: '1.0.0',
          data_name: { baseName: { en: 'Unassigned flow' } },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    const rootSelection = await screen.findByRole('button', {
      name: 'select-root-assigned-child-unassigned',
    });
    expect(rootSelection).toBeDisabled();
    expect(screen.queryByTestId('reject-review')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'expand-root-assigned-child-unassigned' }),
    );

    expect(await screen.findByTestId('subrow-reference-unassigned-only')).toBeInTheDocument();
    expect(screen.getByTestId('select-reviewer')).toHaveTextContent(
      'unassigned:["reference-unassigned-only"]',
    );
    expect(screen.getByTestId('reject-review')).toHaveTextContent('reference-unassigned-only');
  });

  it('renders one shared reference review under each related root with the same review id', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: ['root-a', 'root-b'].map((id) => ({
        id,
        name: id,
        userName: 'Owner',
        isFromLifeCycle: false,
        reviewKind: 'root',
        targetTable: 'processes',
        rootMatchesStatus: false,
        json: {
          data: { id: `process-${id}`, version: '1.0.0' },
          user: { id: 'owner-1' },
        },
      })),
      total: 2,
    });
    mockGetRootReviewReferenceProgress.mockImplementation(async () => ({
      data: [
        {
          reference_review_id: 'shared-reference-review',
          target_table: 'sources',
          data_id: 'shared-source',
          data_version: '2.0.0',
          data_name: { baseName: { en: 'Shared source' } },
          state_code: 1,
          completed_reviewer_count: 0,
          reviewer_count: 1,
        },
      ],
      error: null,
    }));

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-root-a' }));
    await userEvent.click(screen.getByRole('button', { name: 'expand-root-b' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('subrow-shared-reference-review')).toHaveLength(2),
    );
    expect(mockGetRootReviewReferenceProgress).toHaveBeenNthCalledWith(1, 'root-a');
    expect(mockGetRootReviewReferenceProgress).toHaveBeenNthCalledWith(2, 'root-b');
  });

  it('renders every assigned-reference approval readiness state', async () => {
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'reference-without-reviewer',
          target_table: 'sources',
          data_id: 'source-0',
          data_version: '1.0.0',
          state_code: 1,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
        {
          reference_review_id: 'reference-pending-opinion',
          target_table: 'sources',
          data_id: 'source-1',
          data_version: '1.0.0',
          state_code: 1,
          completed_reviewer_count: 0,
          reviewer_count: 1,
        },
        {
          reference_review_id: 'reference-ready',
          target_table: 'sources',
          data_id: 'source-2',
          data_version: '1.0.0',
          state_code: 1,
          completed_reviewer_count: 1,
          reviewer_count: 1,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-1' }));
    expect(await screen.findByTestId('subrow-reference-without-reviewer')).toBeInTheDocument();
    expect(screen.getByTestId('subrow-reference-pending-opinion')).toBeInTheDocument();
    expect(screen.getByTestId('subrow-reference-ready')).toBeInTheDocument();
  });

  it('loads reviewer pending data without the top search card and renders process review actions', async () => {
    const actionRef = { current: { reload: jest.fn() } };

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={actionRef}
        actionFrom='reviewMember'
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'pending',
        'en',
        { user_id: 'member-1' },
      ),
    );

    await waitFor(() => expect(screen.getByTestId('row-review-2')).toBeInTheDocument());
    expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-process-detail')).toHaveTextContent(
      'edit:review:review-2:show',
    );
    expect(screen.queryByText('view:review:review-2:hide')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Display mode' }), 'other');
    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenLastCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'pending',
        'en',
        { user_id: 'member-1' },
        { displayMode: 'other' },
      ),
    );
  });

  it('loads assigned admin data and renders lifecycle review progress actions', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-3',
          name: 'Assigned Model Review',
          userName: 'Owner',
          isFromLifeCycle: true,
          comments: [{ state_code: 0 }, { state_code: 1 }, { state_code: -3 }, { state_code: -2 }],
          reviewerCount: 3,
          completedReviewerCount: 2,
          json: {
            data: { id: 'model-3', version: '3.0.0' },
            user: { id: 'user-3' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'assigned',
        'en',
      ),
    );

    await waitFor(() => expect(screen.getByTestId('row-review-3')).toBeInTheDocument());
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByTestId('simple-review-actions')).toHaveTextContent(
      'review-3:admin:undefined',
    );
    expect(screen.getByTestId('review-progress')).toHaveTextContent('review-3:model');
  });

  it('loads assigned process reviews, falls back to zero progress without comments, and renders process actions', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-3b',
          name: 'Assigned Process Review',
          userName: 'Owner',
          isFromLifeCycle: false,
          targetTable: 'processes',
          reviewerCount: 0,
          completedReviewerCount: 0,
          json: {
            data: { id: 'process-3b', version: '3.1.0' },
            user: { id: 'user-3b' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('row-review-3b')).toBeInTheDocument());
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByTestId('simple-review-actions')).toHaveTextContent(
      'review-3b:admin:processes',
    );
    expect(screen.getByTestId('review-progress')).toHaveTextContent('review-3b:process');
  });

  it('renders simple root-data actions for an assigned admin review', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-contact',
          name: 'Contact Review',
          userName: 'Owner',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'contacts',
          reviewerCount: 1,
          completedReviewerCount: 1,
          json: {
            data: { id: 'contact-1', version: '1.0.0' },
            user: { id: 'contact-owner' },
          },
        },
      ],
      total: 1,
    });
    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='assigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    expect(await screen.findByTestId('simple-review-actions')).toHaveTextContent(
      'review-contact:admin:contacts',
    );
    expect(screen.getByTestId('contact-view')).toHaveTextContent('contact-1:1.0.0:icon');
    expect(screen.queryByRole('button', { name: 'Contact Review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'expand-review-contact' })).not.toBeInTheDocument();
    expect(mockGetRootReviewReferenceProgress).not.toHaveBeenCalled();
  });

  it('renders unit-group and flow-property views for flat reference rows', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-unitgroup-reference',
          name: 'Unit group reference',
          reviewKind: 'reference',
          targetTable: 'unitgroups',
          json: {
            data: { id: 'unitgroup-1', version: '1.0.0' },
            user: { id: 'owner-1' },
          },
        },
        {
          id: 'review-flowproperty-reference',
          name: 'Flow property reference',
          reviewKind: 'reference',
          targetTable: 'flowproperties',
          json: {
            data: { id: 'flowproperty-1', version: '2.0.0' },
            user: { id: 'owner-2' },
          },
        },
        {
          id: 'review-unknown-reference',
          name: 'Unknown reference',
          reviewKind: 'reference',
          targetTable: 'unknown-table',
          json: {
            data: { id: 'unknown-1', version: '3.0.0' },
            user: { id: 'owner-3' },
          },
        },
      ],
      total: 3,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId('row-review-unitgroup-reference');
    expect(screen.getByTestId('unitgroup-view')).toHaveTextContent('unitgroup-1:1.0.0:icon');
    expect(screen.getByTestId('flowproperty-view')).toHaveTextContent('flowproperty-1:2.0.0:icon');
    expect(screen.queryByRole('button', { name: 'Unit group reference' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Flow property reference' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByTestId('row-review-unknown-reference')).toHaveTextContent(
      'Unknown reference',
    );
  });

  it('reloads and resets the main table after a pending child action', async () => {
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'pending-child-review',
          target_table: 'flows',
          data_id: 'flow-child',
          data_version: '1.0.0',
          state_code: 1,
          actor_comment_state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 1,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-2' }));
    const childAction = await screen.findByRole('button', {
      name: 'pending-child-review:reviewer:flows',
    });
    await userEvent.click(childAction);

    await waitFor(() => expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('expanded-review-2')).not.toBeInTheDocument();
  });

  it('renders simple actions for a pending reference review', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-flow-reference',
          name: 'Flow Reference Review',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          reviewKind: 'reference',
          targetTable: 'flows',
          rootMatchesStatus: true,
          rootCanRead: true,
          json: {
            data: { id: 'flow-1', version: '2.0.0' },
            user: { id: 'process-owner' },
          },
        },
      ],
      total: 1,
    });
    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    expect(await screen.findByTestId('simple-review-actions')).toHaveTextContent(
      'review-flow-reference:reviewer:flows',
    );
    expect(
      screen.queryByRole('button', { name: 'expand-review-flow-reference' }),
    ).not.toBeInTheDocument();
    expect(mockGetRootReviewReferenceProgress).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('simple-review-actions'));
    await waitFor(() => expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenCalledTimes(2));
  });

  it('renders reviewer actions for a matching simple root review', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'pending-contact-root',
          name: 'Contact root',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'contacts',
          rootMatchesStatus: true,
          json: {
            data: { id: 'contact-1', version: '1.0.0' },
            user: { id: 'contact-owner' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    expect(await screen.findByTestId('simple-review-actions')).toHaveTextContent(
      'pending-contact-root:reviewer:contacts',
    );
  });

  it('suppresses pending actions when the root does not match the current status', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'pending-nonmatching-reference',
          name: 'Nonmatching reference',
          reviewKind: 'reference',
          targetTable: 'sources',
          actorCommentStateCode: 1,
          rootMatchesStatus: false,
          rootCanRead: false,
          json: {
            data: { id: 'source-hidden', version: '1.0.0' },
            user: { id: 'source-owner' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId('row-pending-nonmatching-reference');
    expect(screen.queryByTestId('simple-review-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-view')).not.toBeInTheDocument();
  });

  it('keeps reviewed and rejected simple reviews view-only', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-source-reference',
          name: 'Source Reference Review',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          reviewKind: 'reference',
          targetTable: 'sources',
          actorCommentStateCode: -3,
          json: {
            data: { id: 'source-1', version: '3.0.0' },
            user: { id: 'source-owner' },
          },
        },
      ],
      total: 1,
    });

    const { unmount } = render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId('row-review-source-reference');
    expect(screen.queryByTestId('simple-review-actions')).not.toBeInTheDocument();
    unmount();

    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-source-rejected',
          name: 'Rejected Source Reference',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          reviewKind: 'reference',
          targetTable: 'sources',
          json: {
            data: { id: 'source-2', version: '3.0.0' },
            user: { id: 'source-owner' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewer-rejected'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await screen.findByTestId('row-review-source-rejected');
    expect(screen.queryByTestId('simple-review-actions')).not.toBeInTheDocument();
  });

  it('renders rejected review tables as view-only actions for reviewer members', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-4',
          name: 'Rejected Process Review',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          json: {
            data: { id: 'process-4', version: '4.0.0' },
            user: { id: 'user-4' },
          },
        },
        {
          id: 'review-4-model',
          name: 'Rejected Model Review',
          userName: 'Reviewer',
          isFromLifeCycle: true,
          json: {
            data: { id: 'model-4', version: '4.0.0' },
            user: { id: 'user-4' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewer-rejected'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'reviewer-rejected',
        'en',
        undefined,
      ),
    );

    await waitFor(() => expect(screen.getByTestId('row-review-4')).toBeInTheDocument());
    expect(screen.getByTestId('review-process-detail')).toHaveTextContent(
      'view:reviewer-rejected:review-4:hide',
    );
    expect(screen.getByTestId('review-lifecycle-detail')).toHaveTextContent(
      'view:reviewer-rejected:review-4-model',
    );
  });

  it('renders admin rejected lifecycle items as view-only actions', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-5',
          name: 'Rejected Model Review',
          userName: 'Owner',
          isFromLifeCycle: true,
          json: {
            data: { id: 'model-5', version: '5.0.0' },
            user: { id: 'user-5' },
          },
        },
        {
          id: 'review-5-context-only',
          name: 'Context-only rejected root',
          userName: 'Owner',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'processes',
          rootMatchesStatus: false,
          json: {
            data: { id: 'process-context', version: '1.0.0' },
            user: { id: 'user-context' },
          },
        },
        {
          id: 'review-5-process',
          name: 'Rejected Process Review',
          userName: 'Owner',
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'processes',
          rootMatchesStatus: true,
          json: {
            data: { id: 'process-5', version: '5.0.0' },
            user: { id: 'user-5' },
          },
        },
      ],
      total: 2,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='admin-rejected'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'admin-rejected',
        'en',
      ),
    );

    await waitFor(() => expect(screen.getByTestId('row-review-5')).toBeInTheDocument());
    expect(screen.getByTestId('review-lifecycle-detail')).toHaveTextContent(
      'view:admin-rejected:review-5',
    );
    expect(screen.getByTestId('review-process-detail')).toHaveTextContent(
      'view:admin-rejected:review-5-process:hide',
    );
  });

  it('renders the reviewed subtitle for reviewed member tables', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewMember).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'reviewed',
        'en',
        undefined,
      ),
    );

    expect(screen.getByTestId('header-title')).toHaveTextContent('Review Management / Reviewed');
    expect(await screen.findByRole('button', { name: 'expand-review-2' })).toBeInTheDocument();
  });

  it('uses zh review APIs when the locale is zh-CN', async () => {
    mockLocale = 'zh-CN';
    const actionRef = { current: { reload: jest.fn() } };

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-zh', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await waitFor(() =>
      expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledWith(
        { pageSize: 50, current: 1 },
        {},
        'unassigned',
        'zh',
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-1' }));
    await waitFor(() =>
      expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledWith('review-1'),
    );
  });

  it('returns an empty table without hitting review APIs when user role is missing', async () => {
    const actionRef = { current: { reload: jest.fn() } };

    render(<AssignmentReview userData={null} tableType='pending' actionRef={actionRef} />);

    await waitFor(() => expect(screen.getByTestId('protable')).toBeInTheDocument());
    expect(mockGetReviewsTableDataOfReviewAdmin).not.toHaveBeenCalled();
    expect(mockGetReviewsTableDataOfReviewMember).not.toHaveBeenCalled();
    expect(screen.queryByTestId('row-review-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-review-2')).not.toBeInTheDocument();
  });

  it('renders reviewed lifecycle rows and hides the edit action when hideReviewButton is true', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-8',
          name: 'Reviewed Lifecycle Review',
          userName: 'Reviewer',
          isFromLifeCycle: true,
          json: {
            data: { id: 'model-8', version: '8.0.0' },
            user: { id: 'user-8' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={actionRef}
        hideReviewButton={true}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('row-review-8')).toBeInTheDocument());
    expect(screen.getByTestId('review-lifecycle-detail')).toHaveTextContent('view:review:review-8');
    expect(screen.queryByText('edit:review:review-8')).not.toBeInTheDocument();
  });

  it('renders reviewed process rows in view mode when hideReviewButton is true', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-8-process',
          name: 'Reviewed Process',
          userName: 'Reviewer',
          isFromLifeCycle: false,
          json: {
            data: { id: 'process-8', version: '8.0.0' },
            user: { id: 'user-8' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={{ current: { reload: jest.fn() } }}
        hideReviewButton={true}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('row-review-8-process')).toBeInTheDocument());
    expect(screen.getByTestId('review-process-detail')).toHaveTextContent(
      'view:review:review-8-process:hide',
    );
  });

  it('renders reviewed lifecycle rows with only the review action when review buttons are enabled', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-8b',
          name: 'Editable Lifecycle Review',
          userName: 'Reviewer',
          isFromLifeCycle: true,
          json: {
            data: { id: 'model-8b', version: '8.1.0' },
            user: { id: 'user-8b' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='reviewed'
        actionRef={actionRef}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('row-review-8b')).toBeInTheDocument());
    expect(screen.getByTestId('review-lifecycle-detail')).toHaveTextContent(
      'edit:review:review-8b',
    );
    expect(screen.queryByText('view:review:review-8b')).not.toBeInTheDocument();
  });

  it('logs reference query failures, shows loading, and supports collapsing root rows', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let resolveReferenceRequest: (result: unknown) => void = () => undefined;
    mockGetRootReviewReferenceProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReferenceRequest = resolve;
      }),
    );
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-6',
          name: 'Model Review',
          userName: 'Owner',
          isFromLifeCycle: true,
          reviewKind: 'root',
          targetTable: 'lifecyclemodels',
          modelData: { id: 'model-6', version: '6.0.0' },
          json: {
            data: { id: 'model-6', version: '6.0.0' },
            user: { id: 'user-6' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-6' }));
    expect(await screen.findByTestId('spin')).toBeInTheDocument();
    resolveReferenceRequest({ data: [], error: new Error('reference query failed') });
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to load reference review data:',
        expect.any(Error),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'collapse-review-6' }));
    await waitFor(() => expect(screen.queryByTestId('expanded-review-6')).not.toBeInTheDocument());

    errorSpy.mockRestore();
  });

  it('shows only references matching the current admin tab and omits relation paths', async () => {
    const actionRef = { current: { reload: jest.fn() } };
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'reference-approved',
          target_table: 'processes',
          data_id: 'process-reference',
          data_version: '1.0.0',
          data_name: { baseName: { en: 'Approved reference' } },
          state_code: 2,
          completed_reviewer_count: 2,
          reviewer_count: 2,
          relation_paths: [],
        },
        {
          reference_review_id: 'reference-rejected',
          target_table: 'sources',
          data_id: 'source-reference',
          data_version: '2.0.0',
          data_name: { baseName: { en: 'Rejected reference' } },
          state_code: -1,
          completed_reviewer_count: 1,
          reviewer_count: 1,
          relation_paths: null,
        },
        {
          reference_review_id: 'reference-unassigned',
          target_table: 'contacts',
          data_id: 'contact-reference',
          data_version: '3.0.0',
          data_name: { baseName: { en: 'Unassigned reference' } },
          state_code: 0,
          completed_reviewer_count: 0,
          reviewer_count: 0,
          relation_paths: [{ source: 'reviewer-added' }],
        },
      ],
      error: null,
    });
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-7',
          name: 'Lifecycle Review',
          userName: 'Owner',
          isFromLifeCycle: true,
          reviewKind: 'root',
          targetTable: 'lifecyclemodels',
          modelData: { id: 'model-7', version: '7.0.0' },
          json: {
            data: { id: 'model-7', version: '7.0.0' },
            user: { id: 'user-7' },
          },
        },
      ],
      total: 1,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={actionRef}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-7' }));

    expect(await screen.findByText('Unassigned Task')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.queryByText('{"source":"reviewer-added"}')).not.toBeInTheDocument();
    const subtable = screen.getByTestId('subtable');
    expect(subtable.children).toHaveLength(1);
    expect(subtable.firstElementChild).toHaveAttribute(
      'data-testid',
      'subrow-reference-unassigned',
    );
  });

  it('renders an approved reference in the completed member tab', async () => {
    mockGetReviewsTableDataOfReviewMember.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'review-2',
          name: 'Completed Process Review',
          userName: 'Reviewer',
          stateCode: 2,
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'processes',
          json: {
            data: { id: 'process-2' },
            user: { id: 'user-2' },
          },
        },
        {
          id: 'review-returned',
          name: 'Returned Contact Review',
          userName: 'Reviewer',
          stateCode: -1,
          isFromLifeCycle: false,
          reviewKind: 'root',
          targetTable: 'contacts',
          json: {
            data: { id: 'contact-returned', version: '1.0.0' },
            user: { id: 'user-2' },
          },
        },
      ],
      total: 2,
    });
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'reference-approved',
          target_table: 'sources',
          data_id: 'source-approved',
          data_version: '1.0.0',
          state_code: 2,
          actor_comment_state_code: 1,
          completed_reviewer_count: 1,
          reviewer_count: 1,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='completed'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-2' }));
    expect(await screen.findAllByText('Approved')).toHaveLength(2);
    expect(await screen.findByText('Returned')).toBeInTheDocument();
    expect(screen.getByTestId('row-review-2')).toHaveTextContent('-');
  });

  it('renders a rejected reference in the admin rejected tab', async () => {
    mockGetRootReviewReferenceProgress.mockResolvedValueOnce({
      data: [
        {
          reference_review_id: 'reference-rejected',
          target_table: 'contacts',
          data_id: 'contact-rejected',
          data_version: '1.0.0',
          state_code: -1,
          completed_reviewer_count: 0,
          reviewer_count: 0,
        },
      ],
      error: null,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='admin-rejected'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'expand-review-1' }));
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
  });

  it('treats a successful queue response without data as an empty page', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      success: true,
      total: 0,
    });

    render(
      <AssignmentReview
        userData={{ user_id: 'admin-1', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await waitFor(() => expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('row-review-1')).not.toBeInTheDocument();
  });

  it('returns an empty success payload when the table type is unsupported and falls back on request errors', async () => {
    const unsupportedActionRef = { current: { reload: jest.fn() } };
    render(
      <AssignmentReview
        userData={{ user_id: 'user-x', role: 'guest' }}
        tableType={'other' as any}
        actionRef={unsupportedActionRef}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('protable')).toBeInTheDocument());
    expect(mockGetReviewsTableDataOfReviewAdmin).not.toHaveBeenCalled();
    expect(mockGetReviewsTableDataOfReviewMember).not.toHaveBeenCalled();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetReviewsTableDataOfReviewMember.mockRejectedValueOnce(new Error('request failed'));

    render(
      <AssignmentReview
        userData={{ user_id: 'member-1', role: 'review-member' }}
        tableType='pending'
        actionRef={{ current: { reload: jest.fn() } }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('component.request.failed'),
    );
    expect(screen.queryByTestId('row-review-2')).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });
  it.each([
    ['unassigned', 'review-admin'],
    ['assigned', 'review-admin'],
    ['admin-rejected', 'review-admin'],
    ['pending', 'review-member'],
    ['reviewed', 'review-member'],
    ['reviewer-rejected', 'review-member'],
  ] as const)('searches, repeats and clears %s', async (tableType, role) => {
    const actionRef: any = { current: {} };
    render(
      <AssignmentReview
        userData={{ user_id: 'actor', role }}
        tableType={tableType}
        actionRef={actionRef}
      />,
    );
    const api =
      role === 'review-admin'
        ? mockGetReviewsTableDataOfReviewAdmin
        : mockGetReviewsTableDataOfReviewMember;
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const input = screen.getByTestId('search-input');
    await userEvent.clear(input);
    await userEvent.type(input, '变压器');
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls.at(-1).at(-1)).toEqual({ displayMode: 'all', query: '变压器' });
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    await userEvent.click(screen.getByRole('button', { name: 'clear-search' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
    expect(api.mock.calls.at(-1)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ query: '变压器' })]),
    );
  });

  it('shows a query failure separately from an empty result and clears it after retry', async () => {
    mockGetReviewsTableDataOfReviewAdmin.mockResolvedValueOnce({
      data: [],
      success: false,
      total: 0,
    });
    render(
      <AssignmentReview
        userData={{ user_id: 'admin', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: {} }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('component.request.failed');
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('does not let an older request replace the latest searched rows', async () => {
    let resolveOld!: (value: any) => void;
    mockGetReviewsTableDataOfReviewAdmin.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(
      <AssignmentReview
        userData={{ user_id: 'admin', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: {} }}
      />,
    );
    await waitFor(() => expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await screen.findByTestId('row-review-1');
    await act(async () => {
      resolveOld({ success: true, data: [{ id: 'stale-review' }], total: 1 });
    });
    expect(screen.queryByTestId('row-stale-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-review-1')).toBeInTheDocument();
  });

  it('ignores an older request failure after a newer search has completed', async () => {
    let rejectOld!: (reason: Error) => void;
    mockGetReviewsTableDataOfReviewAdmin.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    );

    render(
      <AssignmentReview
        userData={{ user_id: 'admin', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: {} }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await waitFor(() => expect(screen.getByTestId('row-review-1')).toBeInTheDocument());

    await act(async () => {
      rejectOld(new Error('stale request failed'));
      await Promise.resolve();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-review-1')).toBeInTheDocument();
  });
  it('preserves the searched scope for paging and sorting and rejects an obsolete scheduled request', async () => {
    render(
      <AssignmentReview
        userData={{ user_id: 'admin', role: 'review-admin' }}
        tableType='unassigned'
        actionRef={{ current: {} }}
      />,
    );
    await screen.findByTestId('row-review-1');
    const oldProps = mockMainTableProps;
    await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
    await waitFor(() => expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledTimes(2));
    let staleResult: any;
    await act(async () => {
      staleResult = await oldProps.request({ ...oldProps.params, current: 2, pageSize: 50 }, {});
    });
    expect(staleResult.success).toBe(false);
    expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledTimes(2);
    await act(async () => {
      await mockMainTableProps.request(
        { ...mockMainTableProps.params, current: 2, pageSize: 20 },
        { createdAt: 'ascend' },
      );
    });
    expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenLastCalledWith(
      { current: 2, pageSize: 20 },
      { createdAt: 'ascend' },
      'unassigned',
      'en',
      { displayMode: 'all', query: 'keyword' },
    );
    await act(async () => {
      await mockMainTableProps.request({}, {});
    });
    expect(mockGetReviewsTableDataOfReviewAdmin.mock.calls.at(-1)[0]).toEqual({
      current: 1,
      pageSize: 50,
    });
  });

  it.each(['resolve', 'reject'])(
    'ignores an old reference %s while the searched root is selected again',
    async (outcome) => {
      let resolveOld: any;
      let rejectOld: any;
      let resolveNew: any;
      mockGetRootReviewReferenceProgress
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveOld = resolve;
              rejectOld = reject;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveNew = resolve;
            }),
        );
      render(
        <AssignmentReview
          userData={{ user_id: 'admin', role: 'review-admin' }}
          tableType='unassigned'
          actionRef={{ current: {} }}
        />,
      );
      await userEvent.click(await screen.findByRole('button', { name: 'select-review-1' }));
      await waitFor(() => expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(1));
      await userEvent.click(screen.getByRole('button', { name: 'trigger-search' }));
      await waitFor(() => expect(mockGetReviewsTableDataOfReviewAdmin).toHaveBeenCalledTimes(2));
      await userEvent.click(screen.getByRole('button', { name: 'select-review-1' }));
      await waitFor(() => expect(mockGetRootReviewReferenceProgress).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (outcome === 'resolve')
          resolveOld({ data: [{ reference_review_id: 'old-reference' }], error: null });
        else rejectOld(new Error('old reference failed'));
      });
      expect(getDisabledSelectReviewer()).toHaveAttribute('data-disabled', 'true');
      expect(getDisabledSelectReviewer()).not.toHaveTextContent('old-reference');
      await act(async () => {
        resolveNew({
          data: [{ reference_review_id: 'new-reference', state_code: 0 }],
          error: null,
        });
      });
      await waitFor(() =>
        expect(
          getSelectReviewerByContent('unassigned:["review-1","new-reference"]'),
        ).toHaveTextContent('new-reference'),
      );
      expect(getSelectReviewerByContent('unassigned:["review-1","new-reference"]')).toHaveAttribute(
        'data-disabled',
        'false',
      );
    },
  );
});
