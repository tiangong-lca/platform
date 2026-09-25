// @ts-nocheck
import ProcessesPage, { getProcesstypeOfDataSetOptions } from '@/pages/Processes';
import userEvent from '@testing-library/user-event';
import { act, renderWithProviders, screen, waitFor, within } from '../../../helpers/testUtils';

jest.mock('@/contexts/AntdAppContext', () => ({
  __esModule: true,
  dispatchAntdAppAction: (action: (api: unknown) => void) =>
    action(jest.requireMock('antd').App.useApp()),
}));

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let mockLocation = {
  pathname: '/mydata/processes',
  search: '?tid=team-1',
};
let mockIntlLocale = 'en-US';
let mockFormatMessage: (message: any, values?: Record<string, string>) => string = ({
  defaultMessage,
  id,
}) => defaultMessage ?? id;
let mockBreakpointScreens: Record<string, boolean | undefined> = {};
let mockCurrentUserAccess: string | undefined;

const mockGetProcessTableAll = jest.fn();
const mockGetProcessTablePgroongaSearch = jest.fn();
const mockGetProcessTableUuidMentionSearch = jest.fn();
const mockProcessHybridSearch = jest.fn();
const mockContributeProcess = jest.fn();
const mockContributeLifeCycleModel = jest.fn();
const mockGetDataSource = jest.fn(() => 'my');
const mockGetLang = jest.fn(() => 'en');
const mockGetLangText = jest.fn((value: any) => value?.[0]?.['#text'] ?? 'Team title');
const mockGetTeamById = jest.fn();
const mockDatasetUuidMentionSearch = jest.fn();
const mockPublishOpenDataProcesses = jest.fn();
let latestRequest: any = null;
let latestPublishHandler: (() => Promise<void>) | undefined;

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  history: {
    push: jest.fn(),
  },
  useIntl: () => ({
    locale: mockIntlLocale,
    formatMessage: (...args: any[]) => mockFormatMessage(...args),
  }),
  useLocation: () => mockLocation,
  useModel: () => ({ initialState: { currentUser: { access: mockCurrentUserAccess } } }),
}));

jest.mock('@/services/openDataCatalog/api', () => ({
  __esModule: true,
  publishOpenDataProcesses: (...args: any[]) => mockPublishOpenDataProcesses(...args),
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  contributeProcess: (...args: any[]) => mockContributeProcess(...args),
  getProcessTableAll: (...args: any[]) => mockGetProcessTableAll(...args),
  getProcessTablePgroongaSearch: (...args: any[]) => mockGetProcessTablePgroongaSearch(...args),
  getProcessTableUuidMentionSearch: (...args: any[]) =>
    mockGetProcessTableUuidMentionSearch(...args),
  process_hybrid_search: (...args: any[]) => mockProcessHybridSearch(...args),
}));

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  contributeLifeCycleModel: (...args: any[]) => mockContributeLifeCycleModel(...args),
}));

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  attachStateCodesToRows: jest.fn(async (_table: string, rows: any[]) => rows),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getDataSource: (...args: any[]) => mockGetDataSource(...args),
  getLang: (...args: any[]) => mockGetLang(...args),
  getLangText: (...args: any[]) => mockGetLangText(...args),
  isDataUnderReview: () => false,
}));

jest.mock('@/services/teams/api', () => ({
  __esModule: true,
  getTeamById: (...args: any[]) => mockGetTeamById(...args),
}));

jest.mock('@/components/AllVersions', () => ({
  __esModule: true,
  default: ({ id, addVersionComponent, operationRender }: any) => {
    operationRender?.({ id, version: '2.0.0' });
    return <div data-testid='all-versions'>{addVersionComponent?.({ newVersion: '2.0.0' })}</div>;
  },
}));

jest.mock('@/components/ContributeData', () => ({
  __esModule: true,
  default: ({ onOk, disabled }: any) => (
    <button type='button' disabled={disabled} onClick={() => onOk?.()}>
      contribute-action
    </button>
  ),
}));

jest.mock('@/components/ExportData', () => ({
  __esModule: true,
  default: ({ tableName, id, version }: any) => (
    <div data-testid='export-data'>{`${tableName}:${id}:${version}`}</div>
  ),
}));

jest.mock('@/components/ImportData', () => ({
  __esModule: true,
  default: ({ onJsonData }: any) => (
    <button type='button' onClick={() => onJsonData?.([{ processDataSet: {} }])}>
      import-data
    </button>
  ),
}));

jest.mock('@/components/TableFilter', () => ({
  __esModule: true,
  default: ({ onChange }: any) => (
    <button type='button' onClick={() => onChange?.('20')}>
      table-filter
    </button>
  ),
}));

jest.mock('@/components/DatasetUuidMentionSearch', () => ({
  __esModule: true,
  default: (props: any) => {
    mockDatasetUuidMentionSearch(props);
    return (
      <div data-testid='dataset-uuid-mention-search'>
        {JSON.stringify({
          dataSource: props.dataSource,
          queryText: props.queryText,
          sourceEntityKinds: props.sourceEntityKinds,
          stateCode: props.getStateCodeFilter?.(),
          teamId: props.teamId,
        })}
      </div>
    );
  },
}));

jest.mock('@/components/ToolBarButton', () => ({
  __esModule: true,
  default: ({ tooltip, onClick, placement = 'action' }: any) => (
    <button data-placement={placement} type='button' onClick={onClick}>
      {toText(tooltip)}
    </button>
  ),
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getAllVersionsColumns: jest.fn(() => []),
  getDataTitle: jest.fn(() => 'My Data'),
}));

jest.mock('@/pages/Processes/Components/create', () => ({
  __esModule: true,
  default: ({ actionType = 'create', id, version, newVersion, importData, onClose }: any) => (
    <div data-testid='process-create'>
      {JSON.stringify({
        actionType,
        id,
        version,
        newVersion,
        importCount: importData?.length ?? 0,
      })}
      <button type='button' onClick={() => onClose?.()}>
        process-create-close
      </button>
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/delete', () => ({
  __esModule: true,
  default: ({ id, version, setViewDrawerVisible }: any) => (
    <div data-testid='process-delete'>
      {`${id}:${version}`}
      <button type='button' onClick={() => setViewDrawerVisible?.()}>
        process-delete-close
      </button>
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version, autoOpen, setViewDrawerVisible }: any) => (
    <div data-testid='process-edit'>
      {JSON.stringify({ id, version, autoOpen })}
      <button type='button' onClick={() => setViewDrawerVisible?.()}>
        process-edit-close
      </button>
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, autoOpen, onDrawerClose }: any) => (
    <div data-testid='process-view'>
      {JSON.stringify({ id, version, autoOpen })}
      <button type='button' onClick={() => onDrawerClose?.()}>
        process-view-close
      </button>
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/lcaSolveToolbar', () => ({
  __esModule: true,
  default: ({ placement = 'action' }: any) => (
    <div data-placement={placement} data-testid='lca-solve-toolbar' />
  ),
}));

jest.mock('@/pages/Processes/Components/ReviewDetail', () => ({
  __esModule: true,
  default: ({ processId, processVersion }: any) => (
    <div data-testid='review-detail'>{`${processId}:${processVersion}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/create', () => ({
  __esModule: true,
  default: ({ actionType = 'create', id, version }: any) => (
    <div data-testid='lifecycle-create'>{JSON.stringify({ actionType, id, version })}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version }: any) => <div data-testid='lifecycle-edit'>{`${id}:${version}`}</div>,
}));

jest.mock('@/pages/LifeCycleModels/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, disabled }: any) => (
    <div data-testid='lifecycle-view'>{JSON.stringify({ id, version, disabled })}</div>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const ConfigProvider = ({ children }: any) => <div>{children}</div>;
  const Card = ({ children }: any) => <section>{children}</section>;
  const Button = ({ children, disabled, icon, loading, onClick }: any) => {
    if (toText(children).includes('Publish selected')) latestPublishHandler = onClick;
    return (
      <button type='button' disabled={disabled || loading} onClick={onClick}>
        {icon}
        {children}
      </button>
    );
  };
  const Checkbox = ({ children, onChange }: any) => {
    const [checked, setChecked] = React.useState(false);
    return (
      <label>
        <input
          aria-label={toText(children)}
          checked={checked}
          type='checkbox'
          onChange={() => {
            const next = !checked;
            setChecked(next);
            onChange?.({ target: { checked: next } });
          }}
        />
        {toText(children)}
      </label>
    );
  };
  const Col = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children, title }: any) => (
    <div>
      {toText(title)}
      {children}
    </div>
  );
  const Search = ({ onSearch, placeholder }: any) => (
    <div>
      <input aria-label='search-input' placeholder={placeholder} />
      <button type='button' onClick={() => onSearch?.('cement')}>
        search
      </button>
      <button type='button' onClick={() => onSearch?.('D1380000-0000-4000-8000-000000000001')}>
        uuid-lookup
      </button>
    </div>
  );
  const Input = { Search };
  const Select = ({ 'aria-label': ariaLabel, onChange }: any) => (
    <button
      type='button'
      aria-label={ariaLabel ?? 'dataset-filter'}
      onClick={() => onChange?.(ariaLabel ? 'published' : 'gate to gate')}
    >
      {ariaLabel ?? 'dataset-filter'}
    </button>
  );
  const Tag = ({ children, color }: any) => <span data-color={color}>{children}</span>;
  const message = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  };
  const theme = {
    useToken: () => ({
      token: {
        colorPrimary: '#1677ff',
      },
    }),
  };

  return (() => {
    const antdModuleMock = {
      __esModule: true,
      Card,
      Button,
      Checkbox,
      Col,
      ConfigProvider,
      Grid: {
        useBreakpoint: () => mockBreakpointScreens,
      },
      Input,
      Select,
      Tag,
      Row,
      Space,
      Tooltip,
      message,
      theme,
    };
    return {
      ...antdModuleMock,
      App: {
        useApp: () => ({
          message: antdModuleMock.message,
        }),
      },
    };
  })();
});

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const PageContainer = ({ children, header }: any) => (
    <div>
      <h1>{toText(header?.title)}</h1>
      {children}
    </div>
  );
  const TableDropdown = ({ menus = [] }: any) => (
    <div data-testid='table-dropdown'>
      {menus.map((menu: any) => (
        <div key={menu.key}>{menu.name}</div>
      ))}
    </div>
  );

  const ProTable = ({
    actionRef,
    request,
    columns = [],
    toolBarRender,
    headerTitle,
    optionsRender,
    rowKey,
    rowSelection,
    params,
  }: any) => {
    const [rows, setRows] = React.useState<any[]>([]);
    const requestRef = React.useRef(request);
    const paramsRef = React.useRef(params);
    paramsRef.current = params;
    const paramsKey = JSON.stringify(params);

    React.useEffect(() => {
      requestRef.current = request;
      latestRequest = (requestParams: any, sort: any) =>
        requestRef.current?.({ ...requestParams, ...paramsRef.current }, sort);
    }, [request]);

    const reload = React.useCallback(async () => {
      const result = await requestRef.current?.(
        { pageSize: 10, current: 1, ...paramsRef.current },
        {},
      );
      setRows(result?.data ?? []);
      return result;
    }, []);
    const reloadAndRest = React.useCallback(
      async () => requestRef.current?.({ pageSize: 10, current: 1, ...paramsRef.current }, {}),
      [],
    );

    React.useEffect(() => {
      if (actionRef) {
        actionRef.current = {
          reload,
          reloadAndRest,
          setPageInfo: jest.fn(),
        };
      }
      void reload();
    }, [actionRef, paramsKey, reload, reloadAndRest]);

    return (
      <section data-testid='pro-table'>
        <div>{toText(headerTitle)}</div>
        <div data-testid='options-with-reload'>
          {optionsRender?.({}, [
            <button key='reload' type='button'>
              reload-option
            </button>,
            <button key='density' type='button'>
              density-option
            </button>,
          ])}
        </div>
        <div data-testid='options-without-reload'>
          {optionsRender?.({}, [
            <button key='density' type='button'>
              density-option-2
            </button>,
          ])}
        </div>
        <div data-testid='options-with-undefined'>{optionsRender?.({}, undefined)}</div>
        <div>{toolBarRender?.()}</div>
        {rows.map((row: any, rowIndex: number) => (
          <div key={rowKey ? rowKey(row) : `${row.id}-${rowIndex}`}>
            {rowSelection && (
              <button
                type='button'
                aria-label={`select-${row.id}`}
                onClick={() => rowSelection.onChange?.([rowKey(row)], [row])}
              >
                select row
              </button>
            )}
            {columns.map((column: any, columnIndex: number) => (
              <div key={`${row.id ?? 'row'}-${columnIndex}`}>
                {column.render ? column.render(undefined, row) : row[column.dataIndex]}
              </div>
            ))}
          </div>
        ))}
      </section>
    );
  };

  return {
    __esModule: true,
    PageContainer,
    ProTable,
    TableDropdown,
  };
});

const { message } = require('antd');

describe('ProcessesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestRequest = null;
    latestPublishHandler = undefined;
    mockLocation = {
      pathname: '/mydata/processes',
      search: '?tid=team-1',
    };
    mockIntlLocale = 'en-US';
    mockFormatMessage = ({ defaultMessage, id }: any) => defaultMessage ?? id;
    mockBreakpointScreens = {};
    mockCurrentUserAccess = undefined;
    mockGetDataSource.mockReturnValue('my');
    mockContributeProcess.mockResolvedValue({ error: null });
    mockContributeLifeCycleModel.mockResolvedValue({ error: null });
    mockGetTeamById.mockResolvedValue({
      data: [{ json: { title: [{ '@xml:lang': 'en', '#text': 'Process Team' }] } }],
    });
    mockGetProcessTableAll.mockResolvedValue({
      data: [
        {
          id: 'proc-1',
          version: '1.0.0',
          name: 'Cement process',
          generalComment: 'General comment',
          classification: 'Materials',
          typeOfDataSet: 'gate to gate',
          referenceYear: '2024',
          location: 'CN',
          modifiedAt: '2024-01-01T00:00:00Z',
          modelId: '',
          teamId: '',
        },
      ],
      success: true,
    });
    mockGetProcessTablePgroongaSearch.mockResolvedValue({ data: [], success: true });
    mockGetProcessTableUuidMentionSearch.mockResolvedValue({ data: [], success: true, total: 0 });
    mockProcessHybridSearch.mockResolvedValue({ data: [], success: true });
    mockPublishOpenDataProcesses.mockResolvedValue({
      data: { publishedCount: 1 },
      error: null,
    });
    message.success.mockReset();
    message.error.mockReset();
  });

  it('falls back to the default browser locale when the runtime locale is unsupported', async () => {
    mockIntlLocale = 'unsupported-locale';

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetLang).toHaveBeenCalledWith('zh-CN'));
  });

  it('maps known process dataset types and falls back to dash for unknown ones', () => {
    expect(toText(getProcesstypeOfDataSetOptions('LCI result'))).toBe('LCI result');
    expect(getProcesstypeOfDataSetOptions('not-a-real-type')).toBe('-');
  });

  it('loads the default table and keeps imported data in the create action', async () => {
    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetTeamById).toHaveBeenCalledWith('team-1'));
    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    expect(mockGetProcessTableAll).toHaveBeenCalledWith(
      { pageSize: 10, current: 1 },
      {},
      'en',
      'my',
      'team-1',
      'all',
      'all',
    );
    expect(screen.getByRole('heading', { name: 'Process Team' })).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_content, element) => element?.textContent === 'General commentCement process',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('CN')).toBeInTheDocument();
    const desktopCalcActions = screen.getAllByTestId('lca-solve-toolbar');
    const desktopAnalysisActions = screen.getAllByRole('button', { name: 'LCA Analysis' });
    expect(desktopCalcActions).toHaveLength(3);
    desktopCalcActions.forEach((action) =>
      expect(action).toHaveAttribute('data-placement', 'option'),
    );
    desktopAnalysisActions.forEach((action) =>
      expect(action).toHaveAttribute('data-placement', 'option'),
    );
    expect(screen.getByRole('checkbox', { name: 'Reference Lookup' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /import-data/i }));
    const createAction = screen
      .getAllByTestId('process-create')
      .find((node) => node.textContent?.includes('"actionType":"create"'));
    expect(createAction).toHaveTextContent('"importCount":1');

    await userEvent.click(
      within(createAction!).getByRole('button', { name: /process-create-close/i }),
    );
    await waitFor(() => expect(createAction).toHaveTextContent('"importCount":0'));
  });

  it('shows confirmed and unresolved sites beside unchanged process names', async () => {
    mockFormatMessage = ({ defaultMessage, id }: any, values?: Record<string, string>) =>
      String(defaultMessage ?? id).replace(/\{(\w+)\}/g, (match, key) => values?.[key] ?? match);
    mockGetProcessTableAll.mockResolvedValue({
      data: [
        {
          id: 'proc-verified',
          version: '1.0.0',
          name: 'Coke production',
          generalComment: 'Reference comment',
          site: { status: 'verified', code: 'Z17' },
        },
        {
          id: 'proc-unresolved',
          version: '1.0.0',
          name: 'Coke production',
          generalComment: 'Reference comment',
          site: { status: 'needs_review' },
        },
        {
          id: 'proc-no-site',
          version: '1.0.0',
          name: 'Water supply',
          generalComment: 'No factory code',
        },
        {
          version: '1.0.0',
          name: 'Process awaiting an identifier',
          generalComment: 'Incomplete search result',
        },
      ],
      success: true,
    });

    renderWithProviders(<ProcessesPage />);

    expect(await screen.findByText('Site Z17')).toBeInTheDocument();
    expect(screen.getByText('Site to verify')).toBeInTheDocument();
    expect(screen.getByText('ID proc-ver')).toHaveAttribute('title', 'proc-verified');
    expect(screen.getByText('ID proc-unr')).toHaveAttribute('title', 'proc-unresolved');
    expect(screen.getByText('ID proc-no-')).toHaveAttribute('title', 'proc-no-site');
    expect(screen.getByText('Process awaiting an identifier')).toBeInTheDocument();
    expect(screen.queryByText('ID undefine')).not.toBeInTheDocument();
    expect(screen.getAllByText('Coke production')).toHaveLength(2);
    expect(screen.getByText('Site Z17').parentElement?.parentElement).toHaveTextContent(
      'Coke production',
    );
    expect(screen.getByText('Site to verify').parentElement?.parentElement).toHaveTextContent(
      'Coke production',
    );
  });

  it('uses compact mobile controls for my data rows', async () => {
    const { history } = jest.requireMock('umi');
    mockBreakpointScreens = { md: false };

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /dataset-filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table-filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import-data/i })).toBeInTheDocument();
    expect(screen.getByTestId('lca-solve-toolbar')).toHaveAttribute('data-placement', 'action');
    expect(screen.getByRole('button', { name: 'LCA Analysis' })).toHaveAttribute(
      'data-placement',
      'action',
    );

    await userEvent.click(screen.getByRole('button', { name: 'LCA Analysis' }));
    expect(history.push).toHaveBeenCalledWith('/mydata/processes/analysis');

    const createAction = screen
      .getAllByTestId('process-create')
      .find((node) => node.textContent?.includes('"actionType":"create"'));
    await userEvent.click(
      within(createAction!).getByRole('button', { name: /process-create-close/i }),
    );
    await waitFor(() => expect(createAction).toHaveTextContent('"importCount":0'));
  });

  it('navigates to the analysis page from the my-data toolbar action', async () => {
    const { history } = jest.requireMock('umi');

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    await userEvent.click(screen.getAllByRole('button', { name: 'LCA Analysis' })[0]);

    expect(history.push).toHaveBeenCalledWith('/mydata/processes/analysis');
  });

  it('reloads the table when dataset type and state filters change', async () => {
    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /dataset-filter/i }));
    await waitFor(() =>
      expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        'team-1',
        'all',
        'gate to gate',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /table-filter/i }));
    await waitFor(() =>
      expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        'team-1',
        '20',
        'gate to gate',
      ),
    );
  });

  it('uses the current dataset type and state filter for pgroonga and AI recommendation', async () => {
    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /dataset-filter/i }));
    await waitFor(() =>
      expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        'team-1',
        'all',
        'gate to gate',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /table-filter/i }));
    await waitFor(() =>
      expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        'team-1',
        '20',
        'gate to gate',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() =>
      expect(mockGetProcessTablePgroongaSearch).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        'en',
        'my',
        'cement',
        {},
        '20',
        'gate to gate',
        undefined,
        'team-1',
      ),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /ai recommendation/i }));
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() =>
      expect(mockProcessHybridSearch).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        'en',
        'my',
        'cement',
        {},
        '20',
        'gate to gate',
        'team-1',
      ),
    );
  });

  it('maps search and table sort fields for pgroonga and table-all requests', async () => {
    renderWithProviders(<ProcessesPage />);

    const requestTable = async (requestParams: any, sort: any) => {
      await act(async () => {
        await latestRequest(requestParams, sort);
      });
    };

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() => expect(mockGetProcessTablePgroongaSearch).toHaveBeenCalled());

    await requestTable({ pageSize: 10, current: 1 }, { name: 'ascend' });
    expect(mockGetProcessTablePgroongaSearch).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      'en',
      'my',
      'cement',
      {},
      'all',
      'all',
      { key: 'baseName', lang: 'en', order: 'asc' },
      'team-1',
    );

    await requestTable({ pageSize: 10, current: 1 }, { name: 'descend' });
    expect(mockGetProcessTablePgroongaSearch).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      'en',
      'my',
      'cement',
      {},
      'all',
      'all',
      { key: 'baseName', lang: 'en', order: 'desc' },
      'team-1',
    );

    await requestTable({ pageSize: 10, current: 1 }, { classification: 'descend' });
    expect(mockGetProcessTablePgroongaSearch).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      'en',
      'my',
      'cement',
      {},
      'all',
      'all',
      { key: 'common:class', order: 'desc' },
      'team-1',
    );

    await requestTable({ pageSize: 10, current: 1 }, { classification: 'ascend' });
    expect(mockGetProcessTablePgroongaSearch).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      'en',
      'my',
      'cement',
      {},
      'all',
      'all',
      { key: 'common:class', order: 'asc' },
      'team-1',
    );

    await requestTable({ pageSize: 10, current: 1 }, { name: undefined });
    expect(mockGetProcessTablePgroongaSearch).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      'en',
      'my',
      'cement',
      {},
      'all',
      'all',
      undefined,
      'team-1',
    );

    mockLocation = {
      pathname: '/mydata/processes',
      search: '?tid=team-1',
    };
    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    await requestTable({ pageSize: 10, current: 1 }, { name: 'ascend' });
    expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      {
        'json->processDataSet->processInformation->dataSetInformation->name': 'ascend',
      },
      'en',
      'my',
      'team-1',
      'all',
      'all',
    );

    await requestTable({ pageSize: 10, current: 1 }, { location: 'descend' });
    expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      { location: 'descend' },
      'en',
      'my',
      'team-1',
      'all',
      'all',
    );

    await requestTable({ pageSize: 10, current: 1 }, { name: undefined });
    expect(mockGetProcessTableAll).toHaveBeenLastCalledWith(
      { pageSize: 10, current: 1 },
      {},
      'en',
      'my',
      'team-1',
      'all',
      'all',
    );
  });

  it('opens and closes the route-driven edit drawer for my-data links', async () => {
    mockLocation = {
      pathname: '/mydata/processes',
      search: '?tid=team-1&id=proc-99&version=9.9.9',
    };

    renderWithProviders(<ProcessesPage />);

    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('process-edit')
          .some((node) => node.textContent?.includes('"autoOpen":true')),
      ).toBe(true),
    );

    const autoOpenEdit = screen
      .getAllByTestId('process-edit')
      .find((node) => node.textContent?.includes('"autoOpen":true'));
    expect(autoOpenEdit).toHaveTextContent('"id":"proc-99"');
    expect(autoOpenEdit).toHaveTextContent('"version":"9.9.9"');

    await userEvent.click(
      within(autoOpenEdit!).getByRole('button', { name: /process-edit-close/i }),
    );

    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId('process-edit')
          .some((node) => node.textContent?.includes('"autoOpen":true')),
      ).toBe(false),
    );
  });

  it('opens and closes the route-driven view drawer for my-data view links', async () => {
    mockLocation = {
      pathname: '/mydata/processes',
      search: '?tid=team-1&id=proc-view&version=8.8.8&mode=view',
    };

    renderWithProviders(<ProcessesPage />);

    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('process-view')
          .some((node) => node.textContent?.includes('"autoOpen":true')),
      ).toBe(true),
    );

    const autoOpenView = screen
      .getAllByTestId('process-view')
      .find((node) => node.textContent?.includes('"autoOpen":true'));
    expect(autoOpenView).toHaveTextContent('"id":"proc-view"');
    expect(autoOpenView).toHaveTextContent('"version":"8.8.8"');
    expect(
      screen
        .queryAllByTestId('process-edit')
        .some((node) => node.textContent?.includes('"autoOpen":true')),
    ).toBe(false);

    await userEvent.click(
      within(autoOpenView!).getByRole('button', { name: /process-view-close/i }),
    );

    await waitFor(() =>
      expect(
        screen
          .queryAllByTestId('process-view')
          .some((node) => node.textContent?.includes('"autoOpen":true')),
      ).toBe(false),
    );
  });

  it('renders my-data process actions and contributes process data successfully', async () => {
    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    expect(await screen.findByTestId('process-view')).toHaveTextContent('"id":"proc-1"');
    expect(screen.getByTestId('process-view')).toHaveTextContent('"version":"1.0.0"');
    expect(screen.getByTestId('process-delete')).toHaveTextContent('proc-1:1.0.0');
    expect(screen.getByTestId('review-detail')).toHaveTextContent('proc-1:1.0.0');
    expect(screen.getByTestId('export-data')).toHaveTextContent('processes:proc-1:1.0.0');
    expect(screen.getByTestId('lifecycle-view')).toHaveTextContent('"disabled":true');
    expect(
      screen
        .getAllByTestId('process-create')
        .some((node) => node.textContent?.includes('"actionType":"copy"')),
    ).toBe(true);
    expect(
      screen
        .getAllByTestId('process-create')
        .some((node) => node.textContent?.includes('"actionType":"createVersion"')),
    ).toBe(true);

    await userEvent.click(
      within(screen.getByTestId('process-edit')).getByRole('button', {
        name: /process-edit-close/i,
      }),
    );
    await userEvent.click(
      within(screen.getByTestId('process-delete')).getByRole('button', {
        name: /process-delete-close/i,
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: /contribute-action/i }));
    await waitFor(() => expect(mockContributeProcess).toHaveBeenCalledWith('proc-1', '1.0.0'));
    expect(message.success).toHaveBeenCalledWith('Data contributed to the team successfully.');
  });

  it('logs process contribution errors without showing success', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockContributeProcess.mockResolvedValue({ error: { message: 'failed' } });

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole('button', { name: /contribute-action/i }));

    await waitFor(() => expect(consoleLogSpy).toHaveBeenCalledWith({ message: 'failed' }));
    expect(message.success).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('logs lifecycle-model contribution errors for model-backed rows', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockContributeLifeCycleModel.mockResolvedValue({ error: { message: 'model-failed' } });
    mockGetProcessTableAll.mockResolvedValue({
      data: [
        {
          id: 'proc-2',
          version: '2.0.0',
          name: 'Model-backed process',
          generalComment: '',
          classification: 'Energy',
          typeOfDataSet: 'LCI result',
          referenceYear: '2024',
          location: 'EU',
          modifiedAt: '2024-02-01T00:00:00Z',
          modelId: 'model-2',
          modelVersion: '01.01.021',
          teamId: '',
        },
      ],
      success: true,
    });

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole('button', { name: /contribute-action/i }));

    await waitFor(() =>
      expect(mockContributeLifeCycleModel).toHaveBeenCalledWith('model-2', '01.01.021'),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith({ message: 'model-failed' });
    expect(message.success).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('renders model-backed my-data actions and contributes lifecycle models', async () => {
    mockGetProcessTableAll.mockResolvedValue({
      data: [
        {
          id: 'proc-2',
          version: '2.0.0',
          name: 'Model-backed process',
          generalComment: '',
          classification: 'undefined',
          typeOfDataSet: 'unknown',
          referenceYear: '',
          location: '',
          modifiedAt: '2024-02-01T00:00:00Z',
          modelId: 'model-2',
          teamId: '',
        },
      ],
      success: true,
    });

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());

    expect(await screen.findByTestId('lifecycle-view')).toHaveTextContent('"id":"model-2"');
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('lifecycle-edit')).toHaveTextContent('model-2:2.0.0');
    expect(screen.queryByTestId('process-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-create')).toHaveTextContent('"actionType":"copy"');

    await userEvent.click(screen.getByRole('button', { name: /contribute-action/i }));
    await waitFor(() =>
      expect(mockContributeLifeCycleModel).toHaveBeenCalledWith('model-2', '2.0.0'),
    );
    expect(message.success).toHaveBeenCalledWith('Data contributed to the team successfully.');
  });

  it.each(['tg', 'ex'])(
    'renders %s and shared-data action layouts without my-data controls',
    async (scope) => {
      mockGetProcessTableAll.mockResolvedValue({
        data: [
          {
            id: 'proc-3',
            version: '3.0.0',
            name: 'TG process',
            generalComment: '',
            classification: 'Energy',
            typeOfDataSet: 'gate to gate',
            referenceYear: '2023',
            location: 'EU',
            modifiedAt: '2024-03-01T00:00:00Z',
            modelId: '',
            teamId: 'team-1',
          },
        ],
        success: true,
      });
      mockGetDataSource.mockReturnValue(scope);

      const { rerender } = renderWithProviders(<ProcessesPage />);

      await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /table-filter/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /import-data/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('process-delete')).not.toBeInTheDocument();
      expect(await screen.findByTestId('review-detail')).toHaveTextContent('proc-3:3.0.0');
      expect(screen.getByText('reload-option')).toBeInTheDocument();
      expect(screen.queryByTestId('lca-solve-toolbar')).not.toBeInTheDocument();

      mockGetDataSource.mockReturnValue('co');
      rerender(<ProcessesPage />);

      await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalledTimes(2));
      expect(screen.queryByTestId('review-detail')).not.toBeInTheDocument();
      expect(screen.queryByTestId('process-delete')).not.toBeInTheDocument();
      expect(
        (await screen.findAllByTestId('process-create')).some((node) =>
          node.textContent?.includes('"actionType":"copy"'),
        ),
      ).toBe(true);
    },
  );

  it.each(['tg', 'ex'])('uses compact mobile controls for %s process data', async (scope) => {
    mockBreakpointScreens = { md: false };
    mockGetDataSource.mockReturnValue(scope);

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /dataset-filter/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /table-filter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import-data/i })).not.toBeInTheDocument();
  });

  it('allows the data product manager to select and publish open process versions', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockCurrentUserAccess = 'data_product_manager';
    mockGetProcessTableAll.mockResolvedValue({
      data: [
        {
          id: 'proc-open',
          version: '1.0.0',
          name: 'Published process',
          generalComment: '',
          classification: 'Energy',
          typeOfDataSet: 'gate to gate',
          referenceYear: '2024',
          location: 'CN',
          modifiedAt: '2024-01-01T00:00:00Z',
          isPublished: true,
          modelId: '',
          teamId: '',
        },
      ],
      success: true,
    });

    renderWithProviders(<ProcessesPage />);

    await screen.findByRole('button', { name: 'select-proc-open' });
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(mockGetProcessTableAll).toHaveBeenCalledWith(
      { pageSize: 10, current: 1 },
      {},
      'en',
      'tg',
      'team-1',
      'all',
      'all',
      { publicationFilter: 'all', sourceFilter: 'all' },
    );

    const publishButtons = screen.getAllByRole('button', { name: 'Publish selected ({count})' });
    expect(publishButtons[0]).toBeDisabled();
    await act(async () => latestPublishHandler?.());
    expect(mockPublishOpenDataProcesses).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'select-proc-open' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Publish selected ({count})' })[0]);

    await waitFor(() =>
      expect(mockPublishOpenDataProcesses).toHaveBeenCalledWith([
        { id: 'proc-open', version: '1.0.0' },
      ]),
    );
    expect(message.success).toHaveBeenCalledWith('Published {count} process versions.');
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Publish selected ({count})' })[0],
      ).toBeDisabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() =>
      expect(mockGetProcessTablePgroongaSearch).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        'en',
        'tg',
        'cement',
        {},
        'all',
        'all',
        undefined,
        'team-1',
        false,
        { publicationFilter: 'all', sourceFilter: 'all' },
      ),
    );
  });

  it('reports process publication command failures and keeps non-managers read-only', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDataSource.mockReturnValue('tg');
    mockCurrentUserAccess = 'data_product_manager';
    mockPublishOpenDataProcesses.mockResolvedValue({
      data: null,
      error: new Error('publish failed'),
    });

    const { unmount } = renderWithProviders(<ProcessesPage />);
    await screen.findByRole('button', { name: 'select-proc-1' });
    await userEvent.click(screen.getByRole('button', { name: 'select-proc-1' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Publish selected ({count})' })[0]);

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith('Failed to publish selected processes.'),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));

    mockPublishOpenDataProcesses.mockResolvedValue({ data: null, error: null });
    await userEvent.click(screen.getAllByRole('button', { name: 'Publish selected ({count})' })[0]);
    await waitFor(() => expect(mockPublishOpenDataProcesses).toHaveBeenCalledTimes(2));
    expect(message.error).toHaveBeenCalledTimes(2);
    unmount();

    jest.clearAllMocks();
    mockCurrentUserAccess = 'member';
    mockGetProcessTableAll.mockResolvedValue({ data: [], success: true });
    renderWithProviders(<ProcessesPage />);
    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Publish selected/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select-/ })).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('falls back to empty tid and null team when the route has no team query or team data payload', async () => {
    mockLocation = {
      pathname: '/mydata/processes',
      search: '',
    };
    mockGetTeamById.mockResolvedValue({
      data: [undefined],
    });

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetTeamById).toHaveBeenCalledWith(''));
    await waitFor(() =>
      expect(mockGetProcessTableAll).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        '',
        'all',
        'all',
      ),
    );
    expect(screen.getByRole('heading').textContent).toBe('');

    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() =>
      expect(mockGetProcessTablePgroongaSearch).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        'en',
        'my',
        'cement',
        {},
        'all',
        'all',
        undefined,
        '',
      ),
    );
  });

  it('falls back to an empty table result when the process list request returns undefined', async () => {
    mockGetProcessTableAll.mockResolvedValueOnce(undefined);

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Process Team' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('process-view')).toHaveLength(0);
  });

  it('uses the main table for reference lookup and clears rows for incomplete UUIDs', async () => {
    const referenceRows = [
      {
        id: 'proc-ref',
        version: '1.0.0',
        name: 'Referenced process',
        generalComment: 'Referenced comment',
        classification: 'Materials',
        typeOfDataSet: 'gate to gate',
        referenceYear: '2024',
        location: 'CN',
        modifiedAt: '2024-01-01T00:00:00Z',
        modelId: '',
        teamId: '',
      },
    ];
    mockGetProcessTableUuidMentionSearch.mockResolvedValue({
      data: referenceRows,
      success: true,
      total: 1,
      capped: true,
    });

    renderWithProviders(<ProcessesPage />);

    await screen.findByTestId('process-view');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reference Lookup' }));
    expect(screen.getByRole('textbox', { name: /search-input/i })).toHaveAttribute(
      'placeholder',
      'pages.search.referenceLookup.placeholder',
    );

    await userEvent.click(screen.getByRole('button', { name: 'search' }));
    await waitFor(() =>
      expect(message.warning).toHaveBeenCalledWith(
        'Enter a complete dataset UUID before running Reference Lookup.',
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('process-view')).not.toBeInTheDocument());
    expect(mockGetProcessTableUuidMentionSearch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'uuid-lookup' }));
    await waitFor(() =>
      expect(mockGetProcessTableUuidMentionSearch).toHaveBeenCalledWith(
        { pageSize: 10, current: 1 },
        'en',
        'my',
        'd1380000-0000-4000-8000-000000000001',
        'all',
        'all',
        'team-1',
      ),
    );
    expect((await screen.findAllByText('Referenced process')).length).toBeGreaterThan(0);
    expect(message.info).toHaveBeenCalledWith(
      'Showing up to the first 50 reference lookup results.',
    );

    const callCountBeforeUncappedLookup = mockGetProcessTableUuidMentionSearch.mock.calls.length;
    mockGetProcessTableUuidMentionSearch.mockResolvedValue({
      data: referenceRows,
      success: true,
      total: 1,
      capped: false,
    });
    await userEvent.click(screen.getByRole('button', { name: 'uuid-lookup' }));
    await waitFor(() =>
      expect(mockGetProcessTableUuidMentionSearch.mock.calls.length).toBeGreaterThan(
        callCountBeforeUncappedLookup,
      ),
    );
  });

  it('falls back to an empty table and shows a toast when loading the process list throws', async () => {
    mockGetProcessTableAll.mockRejectedValue(new Error('network down'));

    renderWithProviders(<ProcessesPage />);

    await waitFor(() => expect(mockGetProcessTableAll).toHaveBeenCalled());
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('Failed to load process list.'));
    expect(screen.queryAllByTestId('process-view')).toHaveLength(0);
  });
});
