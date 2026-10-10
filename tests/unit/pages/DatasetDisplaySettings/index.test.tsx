import Page from '@/pages/DatasetDisplaySettings';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mockList = jest.fn(),
  mockSetDisplay = jest.fn(),
  mockSuccess = jest.fn(),
  mockError = jest.fn(),
  mockLoadErrorDialog = jest.fn(),
  mockReload = jest.fn();
let mockRole = 'data_product_manager',
  mockLocale = 'en-US',
  mockTableProps: any;
const mockRow = {
  datasetKind: 'flow',
  id: 'flow-a',
  version: '01.00.000',
  name: 'Flow A',
  isVisible: false,
};
jest.mock('@/services/datasetDisplay/api', () => ({
  listDatasetDisplay: (...a: any[]) => mockList(...a),
  setDatasetDisplay: (...a: any[]) => mockSetDisplay(...a),
  datasetDisplayKey: (r: any) => `${r.datasetKind}:${r.id}:${r.version}`,
}));
jest.mock('@/components/DatasetKindFilter', () => ({
  __esModule: true,
  default: ({ value, onChange, disabled }: any) => (
    <select
      aria-label='Type'
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value='all'>All</option>
      <option value='flow'>Flow</option>
    </select>
  ),
  datasetKindMessage: (kind: string) => ({ defaultMessage: kind }),
}));
jest.mock('umi', () => ({
  useIntl: () => ({
    locale: mockLocale,
    formatMessage: ({ defaultMessage }: any, v: any = {}) =>
      defaultMessage.replace(/\{(\w+)\}/g, (_: string, k: string) => String(v[k])),
  }),
  useModel: () => ({ initialState: { currentUser: mockRole ? { access: mockRole } : undefined } }),
  FormattedMessage: ({ defaultMessage, values = {} }: any) => (
    <>{defaultMessage.replace(/\{(\w+)\}/g, (_: string, k: string) => String(values[k]))}</>
  ),
}));
jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    App: {
      useApp: () => ({
        message: { success: mockSuccess, error: mockError },
        modal: { error: mockLoadErrorDialog },
      }),
    },
    Select: ({ options, onChange, value, disabled, ...p }: any) => (
      <select
        aria-label={p['aria-label']}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ),
  };
});
jest.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: any) => <main>{children}</main>,
  ProTable: (p: any) => {
    mockTableProps = p;
    p.actionRef.current = { reload: mockReload, reloadAndRest: mockReload };
    return (
      <section>
        {p.headerTitle}
        {p.toolBarRender?.()}
        <button
          type='button'
          disabled={p.rowSelection.getCheckboxProps().disabled}
          onClick={() => p.rowSelection.onChange(['flow:flow-a:01.00.000'], [mockRow])}
        >
          Select row
        </button>
        <button type='button' onClick={() => p.onChange()}>
          Next page
        </button>
        {p.columns.map((c: any) => (
          <span key={c.dataIndex ?? 'index'}>
            {c.title}
            {c.render?.(null, mockRow)}
          </span>
        ))}
      </section>
    );
  },
}));
function deferred() {
  let resolve!: (v: any) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe('manager display settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'data_product_manager';
    mockLocale = 'en-US';
    mockTableProps = undefined;
    mockList.mockResolvedValue({ data: [mockRow], success: true, total: 1 });
    mockSetDisplay.mockResolvedValue({ changedCount: 1, unchangedCount: 0 });
  });
  it.each(['member', 'admin', ''])(
    'denies direct entry for %s without candidate or command I/O',
    (access) => {
      mockRole = access;
      render(<Page />);
      expect(screen.getByText('403')).toBeInTheDocument();
      expect(mockList).not.toHaveBeenCalled();
      expect(mockTableProps).toBeUndefined();
    },
  );
  it('loads unrestricted candidates through the dedicated RPC and exposes a normal full page', async () => {
    render(<Page />);
    expect(screen.queryByRole('link', { name: 'View displayed datasets' })).not.toBeInTheDocument();
    await act(async () => {
      await mockTableProps.request({ current: 2, pageSize: 10 });
    });
    expect(mockList).toHaveBeenCalledWith(
      { current: 2, pageSize: 10, datasetKind: 'all', visibility: 'all', query: '' },
      'en',
      true,
    );
    expect(mockTableProps.search).toBe(false);
    expect(mockTableProps.rowKey(mockRow)).toBe('flow:flow-a:01.00.000');
    expect(mockTableProps.rowSelection.preserveSelectedRowKeys).toBe(false);
  });
  it.each([
    [true, 'Show'],
    [false, 'Hide'],
  ] as const)(
    'sends exact mixed-type selection to %s action and refreshes',
    async (isVisible, label) => {
      render(<Page />);
      expect(screen.getByRole('button', { name: /Show selected \(0\)/ })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`${label} selected \\(1\\)`) }),
      );
      await waitFor(() =>
        expect(mockSetDisplay).toHaveBeenCalledWith(
          [{ datasetKind: 'flow', id: 'flow-a', version: '01.00.000' }],
          isVisible,
        ),
      );
      expect(mockSuccess).toHaveBeenCalledWith('Updated 1 items; 0 were already configured.');
      expect(mockReload).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Show selected \(0\)/ })).toBeDisabled();
    },
  );
  it('prevents duplicate actions and keeps failed selection for retry', async () => {
    const pending = deferred();
    mockSetDisplay.mockReturnValueOnce(pending.promise);
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
    fireEvent.click(screen.getByRole('button', { name: /Show selected \(1\)/ }));
    expect(screen.getByRole('button', { name: 'Hide selected (1)' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeDisabled();
    await act(async () => pending.resolve({ changedCount: 0, unchangedCount: 1 }));
    mockSetDisplay.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide selected (1)' }));
    await waitFor(() => expect(mockError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Show selected \(1\)/ })).toBeEnabled();
  });
  it('clears selection on type, visibility, search, page and mockLocale changes', async () => {
    const view = render(<Page />);
    const select = () => fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
    select();
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'flow' } });
    expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
    select();
    fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
      target: { value: 'hidden' },
    });
    expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
    select();
    const search = screen.getByRole('searchbox', { name: 'Search by name or UUID' });
    fireEvent.change(search, { target: { value: 'iron' } });
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });
    expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
    select();
    mockLocale = 'de-DE';
    view.rerender(<Page />);
    expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
  });
  it.each(['response', 'rejection'])(
    'replaces prior rows and selection with an empty table and a dialog on load %s, then recovers',
    async (failure) => {
      render(<Page />);
      await act(async () => {
        expect(await mockTableProps.request({})).toEqual({
          data: [mockRow],
          success: true,
          total: 1,
        });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
      if (failure === 'response')
        mockList.mockResolvedValueOnce({ data: [mockRow], success: false, total: 1 });
      else mockList.mockRejectedValueOnce(new Error('network failure'));
      await act(async () => {
        expect(await mockTableProps.request({})).toEqual({
          data: [],
          success: true,
          total: 0,
        });
      });
      expect(mockLoadErrorDialog).toHaveBeenCalledTimes(1);
      expect(mockLoadErrorDialog).toHaveBeenCalledWith({
        title: 'Failed to load datasets. Please refresh.',
      });
      expect(mockTableProps.rowSelection.selectedRowKeys).toEqual([]);
      expect(screen.getByRole('button', { name: 'Show selected (0)' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Hide selected (0)' })).toBeDisabled();
      expect(
        screen.queryByText('Failed to load datasets. Please refresh.'),
      ).not.toBeInTheDocument();
      await act(async () => {
        expect(await mockTableProps.request({})).toEqual({
          data: [mockRow],
          success: true,
          total: 1,
        });
      });
      expect(mockLoadErrorDialog).toHaveBeenCalledTimes(1);
    },
  );
  it('renders configured visibility and ignores disabled or stale action callbacks', async () => {
    const view = render(<Page />);
    const columns = mockTableProps.columns;
    const visible = columns[4].render(null, { ...mockRow, isVisible: true });
    expect(render(visible).container).toHaveTextContent('Displayed');
    await act(async () => mockTableProps.toolBarRender()[2].props.onClick());
    expect(mockSetDisplay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
    const pending = deferred();
    mockSetDisplay.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: /Show selected \(1\)/ }));
    await act(async () => mockTableProps.toolBarRender()[3].props.onClick());
    expect(mockSetDisplay).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ changedCount: 1, unchangedCount: 0 }));
    view.unmount();
  });
  it.each(['resolve', 'reject'])(
    'does not notify or refresh after an unmounted mutation %ss',
    async (outcome) => {
      let resolve!: (v: any) => void;
      let reject!: (e: Error) => void;
      const pending = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      mockSetDisplay.mockReturnValueOnce(pending);
      const view = render(<Page />);
      fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
      fireEvent.click(screen.getByRole('button', { name: /Show selected \(1\)/ }));
      view.unmount();
      await act(async () => {
        if (outcome === 'resolve') resolve({ changedCount: 1, unchangedCount: 0 });
        else reject(new Error('late'));
      });
      expect(mockSuccess).not.toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
      expect(mockReload).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'ignores stale list success=%s and unmounted completion',
    async (success) => {
      const pending = deferred();
      mockList.mockReturnValueOnce(pending.promise);
      const view = render(<Page />);
      let stale!: Promise<any>;
      act(() => {
        stale = mockTableProps.request({ current: 1 });
      });
      await act(async () => mockTableProps.request({ current: 2 }));
      await act(async () => {
        pending.resolve({ data: [mockRow], success, total: 1 });
        expect(await stale).toEqual({ data: [], success: false, total: 0 });
      });
      expect(mockLoadErrorDialog).not.toHaveBeenCalled();
      const unmounted = deferred();
      mockList.mockReturnValueOnce(unmounted.promise);
      let last!: Promise<any>;
      act(() => {
        last = mockTableProps.request({});
      });
      view.unmount();
      await act(async () => {
        unmounted.resolve({ data: [], success: false, total: 0 });
        expect(await last).toEqual({ data: [], success: false, total: 0 });
      });
      expect(mockLoadErrorDialog).not.toHaveBeenCalled();
    },
  );
});
