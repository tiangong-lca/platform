// @ts-nocheck
import ModelResult from '@/pages/LifeCycleModels/Components/modelResult';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
  act,
} from '../../../../../helpers/testUtils';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

const mockGetProcessesByIdAndVersion = jest.fn();
let mockModelTableProps: Record<string, any> = {};

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({ formatMessage: ({ id, defaultMessage }: any) => defaultMessage ?? id }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close-icon</span>,
  ProductOutlined: () => <span>product-icon</span>,
}));

jest.mock('antd', () => {
  const React = require('react');

  const ConfigProvider = ({ children }: any) => <div>{children}</div>;

  const Button = ({ children, onClick, disabled = false, icon, ...rest }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick} {...rest}>
      {icon}
      {toText(children)}
    </button>
  );

  const Tooltip = ({ title, children }: any) => {
    const label = toText(title);
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        'aria-label': children.props['aria-label'] ?? label,
      });
    }
    return <span title={label}>{children}</span>;
  };

  const Drawer = ({ open, title, extra, children, onClose, getContainer }: any) => {
    if (!open) return null;
    return (
      <section
        role='dialog'
        aria-label={toText(title) || 'drawer'}
        data-container={String(Boolean(getContainer?.()))}
      >
        <header>{extra}</header>
        <div>{children}</div>
        <button type='button' onClick={onClose}>
          mask-close
        </button>
      </section>
    );
  };

  const Input = {
    Search: ({ value, onChange, onSearch }: any) => (
      <>
        <input aria-label='Model product search' value={value} onChange={onChange} />
        <button type='button' onClick={() => onSearch(value)}>
          Search
        </button>
      </>
    ),
  };

  return {
    __esModule: true,
    Input,
    Button,
    ConfigProvider,
    Drawer,
    Tooltip,
  };
});

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const ProTable = ({
    actionRef,
    params,
    request,
    columns = [],
    headerTitle,
    toolbar,
    pagination,
    scroll,
    rowKey,
  }: any) => {
    const [rows, setRows] = React.useState<any[]>([]);
    const [pageInfo, setPageInfo] = React.useState({
      current: 1,
      pageSize: pagination?.defaultPageSize ?? 50,
    });
    const requestRef = React.useRef(request);
    const paramsRef = React.useRef(params);
    const pageInfoRef = React.useRef(pageInfo);
    requestRef.current = request;
    paramsRef.current = params;
    pageInfoRef.current = pageInfo;
    const serializedParams = JSON.stringify(params ?? {});
    const title = toText(headerTitle);
    mockModelTableProps[title] = { columns, pagination, scroll, rowKey, params, request };

    const load = React.useCallback(async () => {
      const result = await requestRef.current({ ...pageInfoRef.current, ...paramsRef.current }, {});
      if (result.success !== false) setRows(result?.data ?? []);
    }, []);

    React.useEffect(() => {
      if (actionRef)
        actionRef.current = {
          reload: load,
          setPageInfo: jest.fn((value: any) =>
            setPageInfo((previous: any) => ({ ...previous, ...value })),
          ),
        };
    }, [actionRef, load]);
    React.useEffect(() => {
      void load();
    }, [load, serializedParams, pageInfo.current, pageInfo.pageSize]);
    const visibleRows = rows.slice(
      (pageInfo.current - 1) * pageInfo.pageSize,
      pageInfo.current * pageInfo.pageSize,
    );

    return (
      <section data-testid='pro-table' aria-label={title}>
        <h2>{title}</h2>
        {toolbar?.search}
        {toolbar?.filter}
        {visibleRows.map((row: any, rowIndex: number) => (
          <div key={rowKey(row)} data-testid={rowKey(row)}>
            {columns.map((column: any, columnIndex: number) => {
              const value =
                column.valueType === 'index'
                  ? (pageInfo.current - 1) * pageInfo.pageSize + rowIndex + 1
                  : row[column.dataIndex];
              return (
                <div key={columnIndex}>
                  {column.render ? column.render(value, row, rowIndex) : value}
                </div>
              );
            })}
          </div>
        ))}
        {!pagination?.hideOnSinglePage || rows.length > pageInfo.pageSize ? (
          <div>
            <button
              type='button'
              disabled={pageInfo.current <= 1}
              onClick={() => setPageInfo({ ...pageInfo, current: pageInfo.current - 1 })}
            >
              Previous page
            </button>
            <button
              type='button'
              disabled={pageInfo.current * pageInfo.pageSize >= rows.length}
              onClick={() => setPageInfo({ ...pageInfo, current: pageInfo.current + 1 })}
            >
              Next page
            </button>
            <select
              aria-label='Page size'
              value={pageInfo.pageSize}
              onChange={(event) =>
                setPageInfo({ current: 1, pageSize: Number(event.target.value) })
              }
            >
              {pagination.pageSizeOptions.map((value: number) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>
    );
  };

  return {
    __esModule: true,
    ProTable,
  };
});

jest.mock('@/pages/Processes/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version, setViewDrawerVisible }: any) => (
    <button type='button' data-testid='process-edit' onClick={() => setViewDrawerVisible?.()}>
      {`edit:${id}:${version}`}
    </button>
  ),
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id, version }: any) => (
    <div data-testid='process-view'>{`view:${id}:${version}`}</div>
  ),
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessesByIdAndVersion: (...args: any[]) => mockGetProcessesByIdAndVersion(...args),
}));

describe('ModelResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModelTableProps = {};
    mockGetProcessesByIdAndVersion.mockImplementation(async (items: any[], lang: string) => ({
      data: items.map((item) => ({
        id: item.id,
        version: item.id === 'model-1' ? undefined : item.version,
        name: `${lang}-${item.id}`,
        generalComment: `comment-${item.id}`,
        modifiedAt: '2024-01-01 00:00',
      })),
      success: true,
    }));
  });

  it('uses six dataset columns and native paging, and filters the complete exact subproduct set including a match beyond page one', async () => {
    const submodels = Array.from({ length: 70 }, (_, index) => ({
      id: `sub-${index + 1}`,
      version: '01.00.000',
    }));
    mockGetProcessesByIdAndVersion.mockImplementation(
      async (items: any[], lang: string, filters: any) => {
        const allRows = items.map((item) => ({
          ...item,
          name: `${lang}-${item.id}`,
          location: 'CN',
          referenceYear: '2024',
          typeOfDataSet: 'Unit process, black box',
        }));
        const rows = filters.classification?.length
          ? allRows.filter((row) => row.id === 'sub-61')
          : allRows;
        return { data: rows, total: rows.length, success: true };
      },
    );
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'main', version: '02.00.000', type: 'primary' }, ...submodels]}
        modelId='main'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    const mainTitle = 'pages.lifeCycleModel.modelResults.mainProduct';
    const subTitle = 'pages.lifeCycleModel.modelResults.subProduct';
    const subTable = within(screen.getByRole('region', { name: subTitle }));
    await waitFor(() => expect(subTable.getByText('en-sub-50')).toBeInTheDocument());
    expect(subTable.queryByText('en-sub-61')).not.toBeInTheDocument();
    expect(
      mockModelTableProps[subTitle].columns.slice(0, 6).map((column: any) => column.dataIndex),
    ).toEqual(['index', 'name', 'location', 'referenceYear', 'typeOfDataSet', 'version']);
    expect(mockModelTableProps[subTitle].pagination).toEqual(
      expect.objectContaining({
        defaultPageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: [20, 50, 100],
      }),
    );
    expect(mockModelTableProps[mainTitle].pagination.hideOnSinglePage).toBe(true);
    expect(mockModelTableProps[mainTitle].scroll.y).toBeUndefined();
    expect(mockModelTableProps[subTitle].scroll.y).toEqual(expect.any(Number));
    expect(
      screen.getByRole('region', { name: subTitle }).closest('.responsive-data-list-viewport'),
    ).toBeTruthy();
    expect(
      screen.getByRole('region', { name: mainTitle }).closest('.responsive-data-list-viewport'),
    ).toBeNull();
    await userEvent.click(subTable.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(subTable.getByText('en-sub-61')).toBeInTheDocument());
    expect(subTable.queryByText('en-sub-1')).not.toBeInTheDocument();
    await userEvent.selectOptions(subTable.getByLabelText('Classification'), 'C');
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenLastCalledWith(submodels, 'en', {
        classification: [{ scope: 'classification', code: 'C', path: ['C'] }],
        keyword: '',
      }),
    );
    await waitFor(() => expect(subTable.getByText('en-sub-61')).toBeInTheDocument());
    expect(subTable.queryByText('en-sub-51')).not.toBeInTheDocument();
    expect(subTable.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(mockGetProcessesByIdAndVersion.mock.calls.at(-1)[0]).toHaveLength(70);
  });

  it('applies independent main/subproduct searches and resets subproduct paging to the complete exact set', async () => {
    const submodels = Array.from({ length: 70 }, (_, index) => ({
      id: `sub-${index + 1}`,
      version: '01.00.000',
    }));
    mockGetProcessesByIdAndVersion.mockImplementation(
      async (references: any[], lang: string, filters: any) => {
        const data = references
          .filter((reference) => !filters.keyword || reference.id === filters.keyword)
          .map((reference) => ({ ...reference, name: `${lang}-${reference.id}` }));
        return { data, success: true, total: data.length };
      },
    );
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'main', version: '02.00.000', type: 'primary' }, ...submodels]}
        modelId='main'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    const main = within(
      screen.getByRole('region', { name: 'pages.lifeCycleModel.modelResults.mainProduct' }),
    );
    const sub = within(
      screen.getByRole('region', { name: 'pages.lifeCycleModel.modelResults.subProduct' }),
    );
    await waitFor(() => expect(main.getByText('en-main')).toBeInTheDocument());
    await userEvent.selectOptions(main.getByLabelText('Classification'), 'C');
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
        [{ id: 'main', version: '02.00.000' }],
        'en',
        { classification: [{ scope: 'classification', code: 'C', path: ['C'] }], keyword: '' },
      ),
    );
    await userEvent.type(main.getByLabelText('Model product search'), 'main');
    await userEvent.click(main.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
        [{ id: 'main', version: '02.00.000' }],
        'en',
        { classification: [{ scope: 'classification', code: 'C', path: ['C'] }], keyword: 'main' },
      ),
    );
    expect(mockModelTableProps['pages.lifeCycleModel.modelResults.subProduct'].params.keyword).toBe(
      '',
    );
    await userEvent.selectOptions(main.getByLabelText('Classification'), '');
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
        [{ id: 'main', version: '02.00.000' }],
        'en',
        { classification: [], keyword: 'main' },
      ),
    );
    await userEvent.click(sub.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(sub.getByText('en-sub-61')).toBeInTheDocument());
    await userEvent.type(sub.getByLabelText('Model product search'), 'sub-61');
    await userEvent.click(sub.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenLastCalledWith(submodels, 'en', {
        classification: [],
        keyword: 'sub-61',
      }),
    );
    await waitFor(() => expect(sub.getByText('en-sub-61')).toBeInTheDocument());
    expect(sub.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    expect(main.getByText('en-main')).toBeInTheDocument();
    await userEvent.clear(sub.getByLabelText('Model product search'));
    await userEvent.click(sub.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenLastCalledWith(submodels, 'en', {
        classification: [],
        keyword: '',
      }),
    );
    await waitFor(() => expect(sub.getByText('en-sub-1')).toBeInTheDocument());
    expect(sub.queryByText('en-sub-61')).not.toBeInTheDocument();
  });

  it('rejects an earlier complete result when a newer classification request has already returned', async () => {
    let resolveEarlier: (value: any) => void = () => {};
    const earlier = new Promise((resolve) => {
      resolveEarlier = resolve;
    });
    mockGetProcessesByIdAndVersion.mockImplementation(
      (items: any[], lang: string, filters: any) => {
        if (items[0]?.id === 'sub-1' && !filters.classification.length) return earlier;
        return Promise.resolve({
          data: items.map((item) => ({ ...item, name: `${lang}-${item.id}` })),
          success: true,
        });
      },
    );
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'sub-1', version: '01.00.000' }]}
        modelId='main'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    const subTable = within(
      screen.getByRole('region', { name: 'pages.lifeCycleModel.modelResults.subProduct' }),
    );
    await userEvent.selectOptions(subTable.getByLabelText('Classification'), 'C');
    await waitFor(() => expect(subTable.getByText('en-sub-1')).toBeInTheDocument());
    await act(async () => {
      resolveEarlier({
        data: [{ id: 'old', version: '01.00.000', name: 'Old unfiltered result' }],
        success: true,
      });
      await earlier;
    });
    expect(subTable.getByText('en-sub-1')).toBeInTheDocument();
    expect(subTable.queryByText('Old unfiltered result')).not.toBeInTheDocument();
  });

  it('refetches an open drawer for changed exact model and subproduct references and rejects the older model response', async () => {
    let resolveOld: (value: any) => void = () => {};
    const old = new Promise((resolve) => {
      resolveOld = resolve;
    });
    mockGetProcessesByIdAndVersion.mockImplementation((items: any[], lang: string) =>
      items[0]?.id === 'model-old'
        ? old
        : Promise.resolve({
            data: items.map((item) => ({ ...item, name: `${lang}-${item.id}` })),
            success: true,
          }),
    );
    const view = renderWithProviders(
      <ModelResult
        submodels={[
          { id: 'model-old', version: '01.00.000', type: 'primary' },
          { id: 'sub-old', version: '01.00.000' },
        ]}
        modelId='model-old'
        modelVersion='01.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    view.rerender(
      <ModelResult
        submodels={[
          { id: 'model-new', version: '02.00.000', type: 'primary' },
          { id: 'sub-new', version: '02.00.000' },
        ]}
        modelId='model-new'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await waitFor(() => expect(screen.getByText('view:model-new:02.00.000')).toBeInTheDocument());
    expect(screen.getByText('view:sub-new:02.00.000')).toBeInTheDocument();
    await act(async () => {
      resolveOld({
        data: [{ id: 'model-old', version: '01.00.000', name: 'Old exact model' }],
        success: true,
      });
      await old;
    });
    expect(screen.queryByText('Old exact model')).not.toBeInTheDocument();
    expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
      [{ id: 'model-new', version: '02.00.000' }],
      'en',
      { classification: [], keyword: '' },
    );
    expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
      [{ id: 'sub-new', version: '02.00.000' }],
      'en',
      { classification: [], keyword: '' },
    );
  });

  it('shows unknown source metadata as em dashes rather than fabricating location, year, or dataset type', async () => {
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [
        {
          id: 'main',
          version: '01.00.000',
          name: 'Incomplete process',
          location: '-',
          referenceYear: 'undefined',
          typeOfDataSet: '',
        },
      ],
      success: true,
    });
    renderWithProviders(
      <ModelResult
        submodels={[]}
        modelId='main'
        modelVersion='01.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    const mainTable = within(
      screen.getByRole('region', { name: 'pages.lifeCycleModel.modelResults.mainProduct' }),
    );
    await waitFor(() => expect(mainTable.getAllByText('—')).toHaveLength(3));
    expect(mainTable.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('loads main and sub process tables and renders edit actions in edit mode', async () => {
    mockGetProcessesByIdAndVersion.mockImplementation(async (references: any[]) => ({
      data: references.map((reference) => ({ ...reference, name: reference.id })),
      success: true,
      total: references.length,
    }));
    renderWithProviders(
      <ModelResult
        submodels={[
          { id: 'model-1', version: '0.9.0' },
          { id: 'sub-1', version: '0.8.0' },
          { id: 'sub-2', version: '0.7.0' },
        ]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='edit'
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));

    expect(screen.getByRole('dialog', { name: /model results/i })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /model results/i })).toHaveAttribute(
      'data-container',
      'true',
    );

    await waitFor(() => expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledTimes(2));
    expect(mockGetProcessesByIdAndVersion).toHaveBeenNthCalledWith(
      1,
      [{ id: 'model-1', version: '0.9.0' }],
      'en',
      { classification: [], keyword: '' },
    );
    expect(mockGetProcessesByIdAndVersion).toHaveBeenNthCalledWith(
      2,
      [
        { id: 'sub-1', version: '0.8.0' },
        { id: 'sub-2', version: '0.7.0' },
      ],
      'en',
      { classification: [], keyword: '' },
    );

    await waitFor(() => expect(screen.getAllByTestId('process-view')).toHaveLength(3));
    expect(screen.getAllByTestId('process-edit')).toHaveLength(3);
    expect(screen.getByText('view:model-1:0.9.0')).toBeInTheDocument();
    expect(screen.getByText('edit:sub-2:0.7.0')).toBeInTheDocument();

    await userEvent.click(screen.getAllByTestId('process-edit')[0]);
  });

  it('shows the previous-result notice only when enabled and submodels exist', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'model-1', version: '0.9.0' }]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='edit'
        showPreviousResultNotice
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /model results/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/saved previously/i)).toBeInTheDocument();
  });

  it('hides the previous-result notice when the model is saved', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'model-1', version: '0.9.0' }]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='edit'
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /model results/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/saved previously/i)).not.toBeInTheDocument();
  });

  it('renders view-only actions in view mode and closes cleanly', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[
          { id: 'model-1', version: '0.9.0' },
          { id: 'sub-1', version: '0.8.0' },
        ]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='view'
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    expect(await screen.findByRole('dialog', { name: /model results/i })).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByTestId('process-view')).toHaveLength(2));
    expect(screen.queryByTestId('process-edit')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close-icon/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a subproduct without returned version keyed and actionable at the model version', async () => {
    mockGetProcessesByIdAndVersion.mockImplementation(async (items: any[], lang: string) => ({
      data: items.map((item) => ({ id: item.id, name: `${lang}-${item.id}` })),
      success: true,
    }));
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'sub-1', version: '01.00.000' }]}
        modelId='main'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    const subproduct = await screen.findByTestId('sub-1:02.00.000');
    expect(within(subproduct).getByText('view:sub-1:02.00.000')).toBeInTheDocument();
    expect(screen.queryByTestId('sub-1:undefined')).not.toBeInTheDocument();
    expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
      [{ id: 'sub-1', version: '01.00.000' }],
      'en',
      { classification: [], keyword: '' },
    );
  });

  it('requests only an empty exact set when the subproduct request omits submodels', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'sub-1', version: '01.00.000' }]}
        modelId='main'
        modelVersion='02.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    await screen.findByText('view:sub-1:01.00.000');
    const table = mockModelTableProps['pages.lifeCycleModel.modelResults.subProduct'];
    const { submodels: omittedSubmodels, ...requestParams } = table.params;
    expect(omittedSubmodels).toEqual([{ id: 'sub-1', version: '01.00.000' }]);
    let result: any;
    await act(async () => {
      result = await table.request(requestParams, {});
    });
    expect(mockGetProcessesByIdAndVersion).toHaveBeenLastCalledWith([], 'en', {
      classification: [],
      keyword: '',
    });
    expect(result).toEqual({ data: [], success: true });
  });

  it('requests an empty submodel table when only the main model is present', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[{ id: 'model-1', version: '0.9.0' }]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='view'
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));

    expect(await screen.findByRole('dialog', { name: /model results/i })).toBeInTheDocument();

    await waitFor(() => expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledTimes(2));
    expect(mockGetProcessesByIdAndVersion).toHaveBeenNthCalledWith(
      1,
      [{ id: 'model-1', version: '0.9.0' }],
      'en',
      { classification: [], keyword: '' },
    );
    expect(mockGetProcessesByIdAndVersion).toHaveBeenNthCalledWith(2, [], 'en', {
      classification: [],
      keyword: '',
    });

    await waitFor(() => expect(screen.getAllByTestId('process-view')).toHaveLength(1));
    expect(screen.queryByTestId('process-edit')).not.toBeInTheDocument();
  });

  it('reloads both tables again when reopened after closing', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[
          { id: 'model-1', version: '0.9.0' },
          { id: 'sub-1', version: '0.8.0' },
        ]}
        modelId='model-1'
        modelVersion='1.0.0'
        lang='en'
        actionType='view'
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    expect(await screen.findByRole('dialog', { name: /model results/i })).toBeInTheDocument();
    await waitFor(() => expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: /mask-close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    expect(await screen.findByRole('dialog', { name: /model results/i })).toBeInTheDocument();

    await waitFor(() => expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledTimes(6));
  });
  it('shows a sole standard result reference even when CLI supplies no UI members', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[]}
        resultingProcesses={{ '@refObjectId': 'cli-result', '@version': '08.00.000' }}
        modelId='model'
        modelVersion='06.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
        [{ id: 'cli-result', version: '08.00.000' }],
        'en',
        { classification: [], keyword: '' },
      ),
    );
    expect(mockGetProcessesByIdAndVersion).not.toHaveBeenCalledWith(
      [{ id: 'model', version: '06.00.000' }],
      expect.anything(),
      expect.anything(),
    );
  });

  it('uses result roles and exact versions even when the primary UUID differs from the Model', async () => {
    renderWithProviders(
      <ModelResult
        submodels={[
          { id: 'secondary', version: '04.00.000', type: 'secondary' },
          { id: 'primary', version: '08.00.000', type: 'primary' },
          { id: 'provider', version: '03.00.000', type: 'allocated' },
        ]}
        modelId='model'
        modelVersion='06.00.000'
        lang='en'
        actionType='view'
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /model result/i }));
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
        [{ id: 'primary', version: '08.00.000' }],
        'en',
        { classification: [], keyword: '' },
      ),
    );
    expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith(
      [
        { id: 'secondary', version: '04.00.000' },
        { id: 'provider', version: '03.00.000' },
      ],
      'en',
      { classification: [], keyword: '' },
    );
  });
});

jest.mock('@/components/DatasetClassificationFilter', () => ({
  __esModule: true,
  default: ({ value = [], onChange }: any) => (
    <select
      aria-label='Classification'
      value={value[0]?.code ?? ''}
      onChange={(event) =>
        onChange(
          event.target.value
            ? [{ scope: 'classification', code: event.target.value, path: [event.target.value] }]
            : [],
        )
      }
    >
      <option value=''>All classifications</option>
      <option value='C'>Classification C</option>
    </select>
  ),
}));
