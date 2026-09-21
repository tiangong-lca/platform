// @ts-nocheck
import IoPortView from '@/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/Exchange/ioPortView';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '../../../../../../../../helpers/testUtils';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const mockGetProcessDetail = jest.fn();
const mockGetProcessExchange = jest.fn();
const mockGetLangText = jest.fn((value: any) =>
  Array.isArray(value)
    ? value.map((item) => item?.['#text'] ?? '').join(',')
    : (value?.label ?? value ?? '-'),
);
const mockGetUnitData = jest.fn();
const mockGenProcessExchangeTableData = jest.fn(() => 'table-data');
const mockGenProcessFromData = jest.fn();

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close</span>,
}));

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span>{value}</span>,
}));

jest.mock('@/components/QuantitativeReferenceIcon', () => ({
  __esModule: true,
  default: ({ value }: any) => <span>{value ? 'quantitative-yes' : 'quantitative-no'}</span>,
}));

jest.mock('@/pages/Processes/Components/Exchange/view', () => ({
  __esModule: true,
  default: ({ id, lang, buttonType }: any) => (
    <span>{`exchange-view:${id}:${lang}:${buttonType}`}</span>
  ),
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
  getProcessExchange: (...args: any[]) => mockGetProcessExchange(...args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessExchangeTableData: (...args: any[]) => mockGenProcessExchangeTableData(...args),
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getLangText: (...args: any[]) => mockGetLangText(...args),
  getUnitData: (...args: any[]) => mockGetUnitData(...args),
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');
  const { toText } = require('../../../../../../../../helpers/nodeToText');

  const ProTable = ({ actionRef, request, columns, rowSelection }: any) => {
    const [rows, setRows] = React.useState<any[]>([]);
    const requestRef = React.useRef(request);
    requestRef.current = request;

    const reload = jest.fn(() =>
      Promise.resolve()
        .then(() => requestRef.current({ pageSize: 10, current: 1 }))
        .then((result: any) => {
          setRows(result?.data ?? []);
        }),
    );

    React.useLayoutEffect(() => {
      if (actionRef) {
        actionRef.current = { reload };
      }
    }, [actionRef, reload]);

    return (
      <div>
        <div data-testid='selected-keys'>{JSON.stringify(rowSelection?.selectedRowKeys ?? [])}</div>
        <div data-testid='port-columns'>
          {columns.map((column: any) => toText(column.title)).join('|')}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={row.dataSetInternalID ?? rowIndex}>
            {columns.map((column: any, columnIndex: number) => (
              <div key={`${column.dataIndex ?? columnIndex}`}>
                {column.render
                  ? column.render(row[column.dataIndex], row, rowIndex)
                  : row[column.dataIndex]}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return {
    __esModule: true,
    ActionType: {},
    ProColumns: {},
    ProTable,
  };
});

jest.mock('antd', () => {
  const React = require('react');
  const { toText } = require('../../../../../../../../helpers/nodeToText');

  const Button = ({ children, onClick, disabled = false, icon }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {icon}
      {toText(children)}
    </button>
  );

  const Drawer = ({ open, title, extra, children, onClose, getContainer }: any) =>
    open ? (
      <section role='dialog' aria-label={toText(title) || 'drawer'}>
        <header>
          <div>{extra}</div>
          <button type='button' onClick={onClose}>
            close
          </button>
        </header>
        <div data-testid='drawer-container'>{getContainer?.() ? 'has-container' : 'missing'}</div>
        <div>{children}</div>
      </section>
    ) : null;

  const Space = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children }: any) => <>{children}</>;

  return {
    __esModule: true,
    Button,
    Drawer,
    Space,
    Tooltip,
  };
});

describe('ReviewLifeCycleModelIoPortView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {
          processDataSet: {
            mocked: true,
          },
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      exchanges: {
        exchange: [{ '@dataSetInternalID': 'exchange-raw-1' }],
      },
    });
    mockGetProcessExchange.mockResolvedValue({
      data: [
        {
          dataSetInternalID: 'exchange-1',
          referenceToFlowDataSet: 'Flow 1',
          referenceToFlowDataSetVersion: '1.0.0',
          meanAmount: 10,
          resultingAmount: 12,
          dataDerivationTypeStatus: 'measured',
          refUnitRes: {
            name: [{ '@xml:lang': 'en', '#text': 'Kilogram' }],
            refUnitName: 'kg',
            refUnitGeneralComment: [{ '@xml:lang': 'en', '#text': 'Mass unit' }],
          },
          quantitativeReference: true,
          functionalUnitOrOther: 'functional-unit',
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });
    mockGetUnitData.mockImplementation(async (_type: string, data: any[]) => data);
  });

  it('loads process exchanges and renders review lifecycle port rows when the drawer is opened', async () => {
    const onDrawerVisible = jest.fn();

    render(
      <IoPortView
        node={
          {
            data: { id: 'process-1', version: '1.0.0' },
            ports: { items: [{ id: 'port-1' }, { id: 'port-2' }] },
          } as any
        }
        lang='en'
        direction='Output'
        drawerVisible
        onDrawerVisible={onDrawerVisible}
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));
    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalled());

    expect(mockGenProcessExchangeTableData).toHaveBeenCalled();
    expect(mockGetProcessExchange).toHaveBeenCalledWith('table-data', 'Output', {
      current: 1,
      pageSize: 10,
    });
    expect(mockGetUnitData).toHaveBeenCalledWith(
      'flow',
      expect.arrayContaining([
        expect.objectContaining({
          dataSetInternalID: 'exchange-1',
        }),
      ]),
    );
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('["port-1","port-2"]');
    expect(screen.getByTestId('port-columns')).toHaveTextContent('Flow type');
    expect(screen.getByTestId('drawer-container')).toHaveTextContent('has-container');
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => element?.textContent === 'Kilogram (kg)')[0],
    ).toBeInTheDocument();
    expect(screen.getByText('quantitative-yes')).toBeInTheDocument();
    expect(screen.getByText('exchange-view:exchange-1:en:icon')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);
    expect(onDrawerVisible).toHaveBeenCalledWith(false);
  });

  it('does not request process data while the drawer is closed', () => {
    render(
      <IoPortView
        node={{ data: { id: 'process-1', version: '1.0.0' }, ports: { items: [] } } as any}
        lang='en'
        direction='Input'
        drawerVisible={false}
        onDrawerVisible={jest.fn()}
      />,
    );

    expect(mockGetProcessDetail).not.toHaveBeenCalled();
    expect(mockGetProcessExchange).not.toHaveBeenCalled();
  });

  it('ignores a slower detail response after the review node snapshot changes', async () => {
    const requestA = deferred<any>();
    const requestB = deferred<any>();
    mockGetProcessDetail.mockImplementation((processId: string) =>
      processId === 'process-a' ? requestA.promise : requestB.promise,
    );
    mockGenProcessFromData.mockImplementation((data: any) => ({
      exchanges: { exchange: [{ marker: data.marker }] },
    }));

    const commonProps = {
      lang: 'en',
      drawerVisible: true,
      onDrawerVisible: jest.fn(),
    };
    const { rerender } = render(
      <IoPortView
        {...commonProps}
        node={{
          data: { id: 'process-a', version: '1.0.0' },
          ports: { items: [{ id: 'INPUT:flow-A' }] },
        }}
        direction='Input'
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-a', '1.0.0'));

    rerender(
      <IoPortView
        {...commonProps}
        node={{
          data: { id: 'process-b', version: '2.0.0' },
          ports: { items: [{ id: 'OUTPUT:flow-B' }] },
        }}
        direction='Output'
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-b', '2.0.0'));

    await act(async () => {
      requestB.resolve({ data: { json: { processDataSet: { marker: 'B' } } } });
      await requestB.promise;
    });
    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalledWith({ marker: 'B' }));
    expect(screen.getByTestId('selected-keys')).toHaveTextContent('["OUTPUT:flow-B"]');

    const acceptedDetailCount = mockGenProcessFromData.mock.calls.length;
    await act(async () => {
      requestA.resolve({ data: { json: { processDataSet: { marker: 'A' } } } });
      await requestA.promise;
    });

    expect(mockGenProcessFromData).not.toHaveBeenCalledWith({ marker: 'A' });
    expect(mockGenProcessFromData).toHaveBeenCalledTimes(acceptedDetailCount);
  });

  it('falls back to empty process payloads and missing port ids', async () => {
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {},
      },
    });
    mockGenProcessFromData.mockReturnValue({});
    mockGetProcessExchange.mockResolvedValue({
      data: [
        {
          dataSetInternalID: 'exchange-fallback',
          referenceToFlowDataSet: 'Flow fallback',
          referenceToFlowDataSetVersion: '',
          meanAmount: 0,
          resultingAmount: 0,
          dataDerivationTypeStatus: 'estimated',
          quantitativeReference: false,
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });

    render(
      <IoPortView
        node={{ data: {}, ports: { items: [{}] } } as any}
        lang='en'
        direction='Input'
        drawerVisible
        onDrawerVisible={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('', ''));
    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalled());

    expect(screen.getByTestId('selected-keys')).toHaveTextContent('[""]');
    expect(screen.getByText('quantitative-no')).toBeInTheDocument();
  });

  it('falls back to an empty table when review unit enrichment returns no rows', async () => {
    mockGetUnitData.mockResolvedValueOnce(undefined);

    render(
      <IoPortView
        node={{ data: { id: 'process-1', version: '1.0.0' }, ports: { items: [] } } as any}
        lang='en'
        direction='Output'
        drawerVisible
        onDrawerVisible={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetUnitData).toHaveBeenCalled());
    expect(screen.queryByText('exchange-view:exchange-1:en:icon')).not.toBeInTheDocument();
  });

  it('rejects a review table response that finishes after the drawer is unmounted', async () => {
    const pendingUnits = deferred<any>();
    mockGetUnitData.mockReturnValueOnce(pendingUnits.promise);

    const { unmount } = render(
      <IoPortView
        node={{ data: { id: 'process-1', version: '1.0.0' }, ports: { items: [] } } as any}
        lang='en'
        direction='Output'
        drawerVisible
        onDrawerVisible={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetUnitData).toHaveBeenCalled());
    unmount();

    await act(async () => {
      pendingUnits.resolve([{ dataSetInternalID: 'stale-exchange' }]);
      await pendingUnits.promise;
      await Promise.resolve();
    });
  });
});
