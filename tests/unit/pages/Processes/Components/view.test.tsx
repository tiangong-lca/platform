// @ts-nocheck
import ProcessView, {
  buildMergedLciaRows,
  getLciaMethodMetaMap,
  toReferenceValue,
} from '@/pages/Processes/Components/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const getDescriptionItemValue = (label: string) => {
  const labelNode = screen.getByText(label);
  const item = labelNode.closest('[data-testid="description-item"]');
  if (!item) {
    throw new Error(`Description item not found for label: ${label}`);
  }
  return within(item).getByTestId('description-value');
};

const mockGetProcessDetail = jest.fn();
const mockGetProcessExchange = jest.fn();
const mockGetUnitData = jest.fn();
const mockGetFlowStateCode = jest.fn();
const mockGenProcessFromData = jest.fn();
const mockGenProcessExchangeTableData = jest.fn();
const mockProcessExchangeView = jest.fn();
const mockGetLangText = jest.fn();
const mockGetLangJson = jest.fn();
const mockQueryLcaResults = jest.fn();
const mockIsLcaFunctionInvokeError = jest.fn(() => false);
const mockGetPublishedLciaResultPackage = jest.fn();
const mockCacheAndDecompressMethod = jest.fn();
const mockGetDecompressedMethod = jest.fn();
const mockGetReferenceQuantityFromMethod = jest.fn();
const mockJsonToList = jest.fn((value: any) =>
  Array.isArray(value) ? value : value ? [value] : [],
);
const mockGetRejectedComments = jest.fn();
const mockMergeCommentsToData = jest.fn();
const mockUseLocation = jest.fn(() => ({ pathname: '/', search: '' }));
const mockGetClassificationValues = jest.fn(() => []);

jest.mock('@/pages/Processes/Components/finalResultsPanel', () => ({
  __esModule: true,
  default: ({ id, version }: any) => (
    <div data-testid='final-source-results'>
      {id}@{version}
    </div>
  ),
}));

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, unknown>) => {
      const template = defaultMessage ?? id;
      return Object.entries(values ?? {}).reduce(
        (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
        template,
      );
    },
  }),
  useLocation: () => mockUseLocation(),
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
  getProcessExchange: (...args: any[]) => mockGetProcessExchange(...args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
  genProcessExchangeTableData: (...args: any[]) => mockGenProcessExchangeTableData(...args),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getDataSource: (pathname: string) => {
    if (pathname.includes('/mydata')) return 'my';
    if (pathname.includes('/tgdata')) return 'tg';
    if (pathname.includes('/codata')) return 'co';
    if (pathname.includes('/tedata')) return 'te';
    return '';
  },
  getLangJson: (...args: any[]) => mockGetLangJson(...args),
  getLangText: (...args: any[]) => mockGetLangText(...args),
  getUnitData: (...args: any[]) => mockGetUnitData(...args),
  jsonToList: (...args: any[]) => mockJsonToList(...args),
}));

jest.mock('@/services/flows/api', () => ({
  __esModule: true,
  getFlowStateCodeByIdsAndVersions: (...args: any[]) => mockGetFlowStateCode(...args),
}));

jest.mock('@/services/lca', () => ({
  __esModule: true,
  queryLcaResults: (...args: any[]) => mockQueryLcaResults(...args),
  isLcaFunctionInvokeError: (...args: any[]) => mockIsLcaFunctionInvokeError(...args),
}));

jest.mock('@/services/dataProducts', () => ({
  __esModule: true,
  getPublishedLciaResultPackage: (...args: any[]) => mockGetPublishedLciaResultPackage(...args),
}));

jest.mock('@/services/lciaMethods/util', () => ({
  __esModule: true,
  cacheAndDecompressMethod: (...args: any[]) => mockCacheAndDecompressMethod(...args),
  getDecompressedMethod: (...args: any[]) => mockGetDecompressedMethod(...args),
  getVerifiedDecompressedMethodEntry: async (...args: any[]) => {
    let data = await mockGetDecompressedMethod(...args);
    const needsRefresh = data && !data.files?.[0]?.referenceQuantity;
    if (!data || needsRefresh) {
      const refreshed = await mockCacheAndDecompressMethod(...args);
      if (!refreshed) return null;
      data = await mockGetDecompressedMethod(...args);
    }
    return data ? { data, sha256: 'verified-test-sha' } : null;
  },
  getReferenceQuantityFromMethod: (...args: any[]) => mockGetReferenceQuantityFromMethod(...args),
}));

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='aligned-number'>{value}</span>,
}));

jest.mock('@/pages/Processes/Components/Exchange/view', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessExchangeView(props);
    return <div data-testid='exchange-view' />;
  },
}));

jest.mock('@/pages/Processes/Components/Review/view', () => ({
  __esModule: true,
  default: () => <div data-testid='review-view'>review-view</div>,
}));

jest.mock('@/pages/Processes/Components/Compliance/view', () => ({
  __esModule: true,
  default: () => <div data-testid='compliance-view'>compliance-view</div>,
}));

jest.mock('@/components/LangTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='lang-description'>{toText(data)}</div>,
}));

jest.mock('@/components/LevelTextItem/description', () => ({
  __esModule: true,
  default: () => <div data-testid='level-description'>level</div>,
}));

jest.mock('@/components/LocationTextItem/description', () => ({
  __esModule: true,
  default: () => <div data-testid='location-description'>location</div>,
}));

jest.mock('@/pages/Contacts/Components/select/description', () => ({
  __esModule: true,
  default: () => <div data-testid='contact-description'>contact</div>,
}));

jest.mock('@/pages/Sources/Components/select/description', () => ({
  __esModule: true,
  default: () => <div data-testid='source-description'>source</div>,
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getClassificationValues: (...args: any[]) => mockGetClassificationValues(...args),
}));

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  getRejectedComments: (...args: any[]) => mockGetRejectedComments(...args),
  mergeCommentsToData: (...args: any[]) => mockMergeCommentsToData(...args),
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const MockProTable = ({ request, dataSource = [], columns = [], rowKey }: any) => {
    const [requestRows, setRequestRows] = React.useState<any[]>([]);

    React.useEffect(() => {
      let active = true;
      if (request) {
        void Promise.resolve(request({ current: 1, pageSize: 10 })).then((result: any) => {
          if (active) {
            setRequestRows(Array.isArray(result?.data) ? result.data : []);
          }
        });
      }
      return () => {
        active = false;
      };
    }, [request]);

    const rows = request ? requestRows : dataSource;

    const resolveRowKey = (row: any, index: number) => {
      if (typeof rowKey === 'function') return rowKey(row);
      if (typeof rowKey === 'string') return row?.[rowKey];
      return row.key ?? row.referenceToLCIAMethodDataSet?.['@refObjectId'] ?? index;
    };

    return (
      <div data-testid='pro-table'>
        {rows.map((row: any, index: number) => (
          <div
            key={resolveRowKey(row, index)}
            data-testid={`pro-row-${String(resolveRowKey(row, index))}`}
          >
            {columns.map((column: any, columnIndex: number) => (
              <div key={column.key ?? column.dataIndex ?? columnIndex}>
                {column.render
                  ? column.render(row[column.dataIndex], row, index)
                  : toText(row[column.dataIndex])}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return {
    __esModule: true,
    ProTable: MockProTable,
  };
});

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close-icon</span>,
  ProductOutlined: () => <span>product-icon</span>,
  ProfileOutlined: () => <span>profile-icon</span>,
  CheckCircleOutlined: () => <span>check-circle-icon</span>,
  CloseCircleOutlined: () => <span>close-circle-icon</span>,
  InfoCircleOutlined: () => <span>info-circle-icon</span>,
  WarningOutlined: () => <span>warning-icon</span>,
}));

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, icon, onClick, disabled, ...props }: any) => {
    delete props.loading;

    return (
      <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick} {...props}>
        {icon}
        {toText(children)}
      </button>
    );
  };

  const Tooltip = ({ children, title }: any) => (
    <span data-testid='tooltip' data-title={toText(title)}>
      {children}
    </span>
  );

  const Drawer = ({ open, title, extra, children, getContainer, onClose }: any) => {
    if (!open) return null;
    getContainer?.();
    return (
      <section role='dialog' aria-label={toText(title) || 'drawer'}>
        <header>{extra}</header>
        <div>{children}</div>
        <button type='button' onClick={onClose}>
          drawer-close
        </button>
      </section>
    );
  };

  const Spin = ({ spinning, children }: any) => (
    <div data-testid='spin' data-spinning={String(spinning)}>
      {children}
    </div>
  );

  const Card = ({ tabList = [], activeTabKey, onTabChange, title, children }: any) => (
    <div data-testid='card' data-active-key={activeTabKey}>
      {title ? <div>{toText(title)}</div> : null}
      {tabList.map((item: any) => (
        <button type='button' key={item.key} onClick={() => onTabChange?.(item.key)}>
          {toText(item.tab)}
        </button>
      ))}
      <div>{children}</div>
    </div>
  );

  const Collapse = ({ items = [] }: any) => (
    <div>
      {items.map((item: any) => (
        <div key={item.key}>{item.children}</div>
      ))}
    </div>
  );

  const Space = ({ children }: any) => <div>{children}</div>;
  const Alert = ({ message, description }: any) => (
    <div role='alert'>
      <div>{message}</div>
      <div>{description}</div>
    </div>
  );
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const DescriptionsItem = ({ label, children }: any) => (
    <div data-testid='description-item'>
      <div>{toText(label)}</div>
      <div data-testid='description-value'>{children}</div>
    </div>
  );
  const Descriptions = ({ items = [], styles }: any) => (
    <div>
      {items.map((item, index) => (
        <DescriptionsItem key={item.key ?? index} {...item} styles={item.styles ?? styles} />
      ))}
    </div>
  );
  const Divider = ({ children }: any) => <div>{children}</div>;
  const Statistic = ({ title, value, formatter }: any) => (
    <div>
      <div>{toText(title)}</div>
      <div>{formatter ? formatter(value) : value}</div>
    </div>
  );
  const Progress = ({ percent = 0, showInfo = true }: any) => (
    <div data-testid='progress'>{showInfo ? `${percent}%` : null}</div>
  );
  const Table = ({ columns = [], dataSource = [], rowKey }: any) => (
    <table data-testid='table'>
      <thead>
        <tr>
          {columns.map((column: any, index: number) => (
            <th key={column.key ?? column.dataIndex ?? index}>{toText(column.title)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(dataSource ?? []).map((row: any, rowIndex: number) => {
          const resolvedRowKey =
            typeof rowKey === 'function'
              ? rowKey(row)
              : typeof rowKey === 'string'
                ? row?.[rowKey]
                : (row?.key ?? rowIndex);

          return (
            <tr key={resolvedRowKey}>
              {columns.map((column: any, columnIndex: number) => {
                const value = column?.dataIndex ? row?.[column.dataIndex] : undefined;
                const content = column?.render ? column.render(value, row, rowIndex) : value;
                return <td key={column.key ?? column.dataIndex ?? columnIndex}>{content}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const Typography = {
    Text: ({ children }: any) => <span data-testid='typography-text'>{children}</span>,
    Link: ({ children, onClick }: any) => (
      <button type='button' data-testid='typography-link' onClick={onClick}>
        {children}
      </button>
    ),
    Paragraph: ({ children }: any) => <p>{children}</p>,
  };
  return {
    __esModule: true,
    Button,
    Tooltip,
    Drawer,
    Spin,
    Card,
    Collapse,
    Space,
    Alert,
    Tag,
    Row,
    Col,
    Descriptions,
    Divider,
    Statistic,
    Progress,
    Table,
    Typography,
    Input: {
      TextArea: ({ children, ...props }: any) => <textarea {...props}>{children}</textarea>,
    },
    theme: {
      defaultAlgorithm: {},
      darkAlgorithm: {},
      useToken: () => ({
        token: {
          colorTextDescription: '#8c8c8c',
          colorTextSecondary: '#8c8c8c',
        },
      }),
    },
  };
});

const defaultProps = {
  id: 'process-1',
  version: '1.0.0',
  lang: 'en',
  buttonType: 'icon',
  disabled: false,
};

const processDataSet = {
  processInformation: {
    dataSetInformation: {
      'common:UUID': 'uuid-123',
    },
  },
  exchanges: {
    exchange: [
      {
        '@dataSetInternalID': '0',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-1',
          '@version': '1.0',
        },
      },
    ],
  },
  LCIAResults: {
    LCIAResult: [{ key: 'lcia-1', meanAmount: 10 }],
  },
};

describe('ProcessView component', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.APP_PUBLIC_LCIA_RESULTS_ENABLED;
    jest.useRealTimers();
    mockGetLangText.mockImplementation((value: any) => {
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value[0]?.['#text'] ?? '';
      if (value?.['#text']) return value['#text'];
      return '';
    });
    mockGetLangJson.mockImplementation((value: any) => value);
    mockJsonToList.mockImplementation((value: any) =>
      Array.isArray(value) ? value : value ? [value] : [],
    );
    mockIsLcaFunctionInvokeError.mockImplementation(() => false);
    mockGetProcessDetail.mockResolvedValue({
      data: { stateCode: 100, json: { processDataSet: processDataSet } },
    });
    mockGenProcessFromData.mockReturnValue(processDataSet);
    mockGenProcessExchangeTableData.mockReturnValue([{ id: 'row-1' }]);
    mockGetProcessExchange.mockResolvedValue({ data: [], success: true });
    mockGetUnitData.mockResolvedValue([]);
    mockGetFlowStateCode.mockResolvedValue({ error: null, data: [] });
    mockGetReferenceQuantityFromMethod.mockResolvedValue(undefined);
    mockGetDecompressedMethod.mockResolvedValue({ files: [] });
    mockCacheAndDecompressMethod.mockResolvedValue(true);
    mockGetRejectedComments.mockResolvedValue([]);
    mockUseLocation.mockReturnValue({ pathname: '/', search: '' });
    mockGetClassificationValues.mockReturnValue([]);
    mockQueryLcaResults.mockResolvedValue({
      snapshot_id: 'snapshot-1',
      result_id: 'result-1',
      source: 'all_unit',
      meta: { computed_at: '2026-03-09T00:00:00Z' },
      data: {
        values: [
          {
            impact_id: 'impact-1',
            impact_index: 0,
            impact_name: 'Climate change',
            unit: 'kg CO2-eq',
            value: 42,
          },
        ],
      },
    });
    mockGetPublishedLciaResultPackage.mockResolvedValue({
      data: {
        publication: null,
        package: null,
        rowCount: 0,
        values: [],
      },
      error: null,
    });
  });

  it('opens drawer and fetches process detail', async () => {
    render(<ProcessView {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0');
    });

    await waitFor(() => {
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false');
    });
  });

  it('rejects older input and output exchange requests after a language rerender', async () => {
    const pendingInputFlowState = deferred<any>();
    const pendingOutputFlowState = deferred<any>();
    const exchangeRow = {
      referenceToFlowDataSetId: 'flow-1',
      referenceToFlowDataSetVersion: '1.0',
    };

    mockGetProcessExchange.mockResolvedValue({ data: [exchangeRow], success: true });
    mockGetUnitData.mockResolvedValue([exchangeRow]);
    mockGetFlowStateCode
      .mockReset()
      .mockReturnValueOnce(pendingInputFlowState.promise)
      .mockReturnValueOnce(pendingOutputFlowState.promise)
      .mockResolvedValue({ error: null, data: [] });

    const { rerender } = render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Inputs and Outputs' }));
    await waitFor(() => expect(mockGetFlowStateCode).toHaveBeenCalledTimes(2));
    rerender(<ProcessView {...defaultProps} lang='fr' />);
    await waitFor(() => expect(mockGetFlowStateCode.mock.calls.length).toBeGreaterThanOrEqual(4));

    await act(async () => {
      pendingInputFlowState.resolve({ error: null, data: [] });
      pendingOutputFlowState.resolve({ error: null, data: [] });
      await Promise.all([pendingInputFlowState.promise, pendingOutputFlowState.promise]);
      await Promise.resolve();
    });
  });

  it('uses the first classification entry when process classification is an array', async () => {
    const classificationClass = [{ value: 'process-array-classification' }];
    mockGenProcessFromData.mockReturnValueOnce({
      processInformation: {
        dataSetInformation: {
          classificationInformation: {
            'common:classification': [
              {
                'common:class': classificationClass,
              },
            ],
          },
        },
      },
    });

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockGetClassificationValues).toHaveBeenCalledWith(classificationClass);
    });
  });

  it('changes active tab when user selects new tab', async () => {
    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    const lciaTab = await screen.findByRole('button', { name: 'Calculation results' });
    fireEvent.click(lciaTab);

    await waitFor(() => {
      expect(screen.getAllByTestId('card')[0]).toHaveAttribute(
        'data-active-key',
        'calculationResults',
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('final-source-results')).toBeInTheDocument();
    });
  });

  it.each([0, 10, 20, 99, undefined])(
    'hides calculation results for non-public or unknown state %s',
    async (stateCode) => {
      mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
      mockGetProcessDetail.mockResolvedValueOnce({ data: { stateCode, json: { processDataSet } } });
      render(<ProcessView {...defaultProps} />);
      fireEvent.click(screen.getByRole('button'));
      await waitFor(() =>
        expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false'),
      );
      expect(screen.queryByRole('button', { name: 'Calculation results' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Published results' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'LCIA Results' })).not.toBeInTheDocument();
      expect(mockQueryLcaResults).not.toHaveBeenCalled();
      expect(mockGetPublishedLciaResultPackage).not.toHaveBeenCalled();
    },
  );

  it('uses the Release reader for an already public record even from My data', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/mydata/processes', search: '' });
    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(await screen.findByRole('button', { name: 'Calculation results' }));
    expect(screen.getByTestId('final-source-results')).toHaveTextContent(
      `${defaultProps.id}@${defaultProps.version}`,
    );
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    expect(mockGetPublishedLciaResultPackage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Published results' })).not.toBeInTheDocument();
  });

  it('does not expose release controls from the Process drawer', async () => {
    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Releases' })).not.toBeInTheDocument();
  });

  it('disables the view button when disabled prop is true', () => {
    render(<ProcessView {...defaultProps} buttonType='toolIcon' disabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('renders secondary text instead of a clickable link when link mode is disabled', () => {
    render(
      <ProcessView {...defaultProps} buttonType='link' disabled triggerLabel='Open process' />,
    );

    expect(screen.getByTestId('typography-text')).toHaveTextContent('Open process');
    expect(screen.queryByTestId('typography-link')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to the default View label when link mode is disabled and no trigger label is provided', () => {
    render(<ProcessView {...defaultProps} buttonType='link' disabled />);

    expect(screen.getByTestId('typography-text')).toHaveTextContent('View');
    expect(screen.queryByTestId('typography-link')).not.toBeInTheDocument();
  });

  it('renders a clickable Typography.Link trigger when link mode is enabled', async () => {
    render(<ProcessView {...defaultProps} buttonType='link' triggerLabel='Open process' />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('typography-link'));
    });

    expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
  });

  it('falls back to the default View label for clickable link mode when no trigger label is provided', async () => {
    render(<ProcessView {...defaultProps} buttonType='link' />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('typography-link'));
    });

    expect(screen.getByTestId('typography-link')).toHaveTextContent('View');
    expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
  });

  it('disables the result icon button when no process id is available', () => {
    render(<ProcessView {...defaultProps} id='' buttonType='toolResultIcon' />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('merges rejected comments into form data for under-review processes', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: { stateCode: 50, json: { processDataSet } },
    });
    mockGetRejectedComments.mockResolvedValueOnce([{ message: 'Rejected once' }]);

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mockGetRejectedComments).toHaveBeenCalledWith('process-1', '1.0.0'));
    expect(mockMergeCommentsToData).toHaveBeenCalledWith(
      [{ message: 'Rejected once' }],
      processDataSet,
    );
  });

  it('opens with the result-icon trigger and renders fallback labels for unsupported option codes', async () => {
    mockGenProcessFromData.mockReturnValueOnce({
      processInformation: {
        dataSetInformation: { baseName: { '#text': 'Process with fallback labels' } },
        mathematicalRelations: {
          variableParameter: {
            uncertaintyDistributionType: 'unsupported-value',
          },
        },
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: 'unsupported-value',
          LCIMethodPrinciple: 'unsupported-value',
          LCIMethodApproaches: 'unsupported-value',
        },
        completeness: {
          completenessProductModel: 'unsupported-value',
          completenessElementaryFlows: {
            '@type': 'unsupported-value',
            '@value': 'unsupported-value',
          },
        },
      },
      administrativeInformation: {
        publicationAndOwnership: {
          'common:copyright': 'unsupported-value',
          'common:licenseType': 'unsupported-value',
        },
      },
    });

    render(<ProcessView {...defaultProps} buttonType='toolResultIcon' />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Modelling and validation' }));
    expect(getDescriptionItemValue('Dataset type')).toHaveTextContent('-');
    expect(getDescriptionItemValue('LCI method principle')).toHaveTextContent('-');
    expect(getDescriptionItemValue('LCI method approaches')).toHaveTextContent('-');
    expect(getDescriptionItemValue('Completeness product model')).toHaveTextContent('-');
    expect(getDescriptionItemValue('completeness type')).toHaveTextContent('-');
    expect(getDescriptionItemValue('value')).toHaveTextContent('-');

    fireEvent.click(screen.getByRole('button', { name: 'Process information' }));
    expect(getDescriptionItemValue('Uncertainty distribution type')).toHaveTextContent('-');

    fireEvent.click(screen.getByRole('button', { name: 'Administrative information' }));
    expect(getDescriptionItemValue('Copyright?')).toHaveTextContent('-');
    expect(getDescriptionItemValue('License type')).toHaveTextContent('-');
  });

  it('renders supported option labels when known process codes are provided', async () => {
    mockGenProcessFromData.mockReturnValueOnce({
      processInformation: {
        dataSetInformation: { baseName: { '#text': 'Process with supported labels' } },
        mathematicalRelations: {
          variableParameter: {
            uncertaintyDistributionType: 'uniform',
          },
        },
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: 'LCI result',
          LCIMethodPrinciple: 'Attributional',
          LCIMethodApproaches: ['Allocation - mass', 'unknown additional approach'],
        },
        completeness: {
          completenessProductModel: 'Relevant flows missing',
          completenessElementaryFlows: {
            '@type': 'Noise',
            '@value': 'No statement',
          },
        },
      },
      administrativeInformation: {
        publicationAndOwnership: {
          'common:copyright': 'true',
          'common:licenseType': 'Free of charge for all users and uses',
        },
      },
    });

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Modelling and validation' }));
    expect(getDescriptionItemValue('Dataset type')).toHaveTextContent('LCI result');
    expect(getDescriptionItemValue('LCI method principle')).toHaveTextContent('Attributional');
    expect(getDescriptionItemValue('LCI method approaches')).toHaveTextContent('Allocation - mass');
    expect(getDescriptionItemValue('Completeness product model')).toHaveTextContent(
      'Relevant flows missing',
    );
    expect(getDescriptionItemValue('completeness type')).toHaveTextContent('Noise');
    expect(getDescriptionItemValue('value')).toHaveTextContent('No statement');

    fireEvent.click(screen.getByRole('button', { name: 'Process information' }));
    expect(getDescriptionItemValue('Uncertainty distribution type')).toHaveTextContent('Uniform');

    fireEvent.click(screen.getByRole('button', { name: 'Administrative information' }));
    expect(getDescriptionItemValue('Copyright?')).toHaveTextContent('Yes');
    expect(getDescriptionItemValue('License type')).toHaveTextContent(
      'Free of charge for all users and uses',
    );
  });

  it('loads both input and output exchange tables with flow state lookups', async () => {
    mockGetProcessExchange.mockResolvedValue({
      data: [
        {
          id: 'exchange-1',
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
        },
      ],
      success: true,
      total: 1,
    });
    mockGetUnitData.mockImplementation(async (_type, data) => data);
    mockGetFlowStateCode.mockResolvedValue({
      error: null,
      data: [
        {
          id: 'flow-1',
          version: '1.0',
          stateCode: 20,
          classification: 'Class A',
        },
      ],
    });

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Inputs and Outputs' }));

    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalledTimes(2));
    expect(mockGetProcessExchange).toHaveBeenNthCalledWith(1, [{ id: 'row-1' }], 'Input', {
      current: 1,
      pageSize: 10,
    });
    expect(mockGetProcessExchange).toHaveBeenNthCalledWith(2, [{ id: 'row-1' }], 'Output', {
      current: 1,
      pageSize: 10,
    });
    await waitFor(() => expect(mockGetUnitData.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(mockGetFlowStateCode).toHaveBeenCalledWith([{ id: 'flow-1', version: '1.0' }], 'en'),
    );
  });

  it('handles array-based exchange references, missing flow metadata, and unit lookup fallbacks', async () => {
    mockGenProcessFromData.mockReturnValueOnce({
      ...processDataSet,
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': '0',
            referenceToFlowDataSet: [{}],
          },
        ],
      },
    });
    mockGetProcessExchange.mockResolvedValue({
      data: [
        {
          id: 'exchange-empty',
          referenceToFlowDataSetId: '',
          referenceToFlowDataSetVersion: '',
        },
      ],
      success: true,
      total: 1,
    });
    mockGetUnitData.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      {
        id: 'exchange-empty',
        referenceToFlowDataSetId: '',
        referenceToFlowDataSetVersion: '',
      },
    ]);
    mockGetFlowStateCode.mockResolvedValueOnce({ error: 'boom', data: [] }).mockResolvedValueOnce({
      error: null,
      data: [
        {
          id: '',
          version: '',
          stateCode: 100,
          classification: undefined,
        },
      ],
    });

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Inputs and Outputs' }));

    await waitFor(() => expect(mockGetProcessExchange.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(
        mockGetFlowStateCode.mock.calls.filter(
          (call) =>
            JSON.stringify(call[0]) === JSON.stringify([{ id: '', version: '' }]) &&
            call[1] === 'en',
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('falls back to an empty output unit list when the output unit lookup returns nothing', async () => {
    mockGenProcessFromData.mockReturnValueOnce({
      ...processDataSet,
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': '0',
            referenceToFlowDataSet: [{}],
          },
        ],
      },
    });
    mockGetProcessExchange.mockResolvedValue({
      data: [
        {
          id: 'exchange-empty',
          referenceToFlowDataSetId: '',
          referenceToFlowDataSetVersion: '',
        },
      ],
      success: true,
      total: 1,
    });
    mockGetUnitData
      .mockResolvedValueOnce([
        {
          id: 'exchange-empty',
          referenceToFlowDataSetId: '',
          referenceToFlowDataSetVersion: '',
        },
      ])
      .mockResolvedValueOnce(undefined);
    mockGetFlowStateCode.mockResolvedValue({
      error: null,
      data: [
        {
          id: '',
          version: '',
          stateCode: 100,
          classification: undefined,
        },
      ],
    });

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Inputs and Outputs' }));

    await waitFor(() => expect(mockGetProcessExchange.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(
        mockGetUnitData.mock.calls.filter((call) => call[0] === 'flow' && Array.isArray(call[1]))
          .length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('falls back to empty process payloads without crashing', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({ data: { json: {} } });
    mockGenProcessFromData.mockReturnValueOnce({});

    render(<ProcessView {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false');
    });

    expect(screen.queryByRole('button', { name: 'Calculation results' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inputs and Outputs' }));
    await waitFor(() => expect(mockGetProcessExchange.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('supports the text button variant and closes the drawer through both close actions', async () => {
    render(<ProcessView {...defaultProps} buttonType='text' />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'close-icon' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'View process' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'drawer-close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'View process' })).not.toBeInTheDocument(),
    );
  });

  it('opens automatically without rendering a manual trigger when autoOpen is enabled', async () => {
    const onDrawerClose = jest.fn();

    render(<ProcessView {...defaultProps} autoOpen onDrawerClose={onDrawerClose} />);

    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'View process' })).toBeInTheDocument();
      expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0');
    });
    await waitFor(() => {
      expect(screen.getByTestId('spin')).toHaveAttribute('data-spinning', 'false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'drawer-close' }));
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
  });

  it('returns a method meta map only for requested method ids', async () => {
    mockGetDecompressedMethod.mockResolvedValueOnce({
      files: [
        {
          version: 'ignored',
          referenceQuantity: { 'common:shortDescription': { '#text': 'ignored' } },
        },
        { id: 'other-impact', version: 'ignored' },
        {
          id: 'impact-1',
          version: '',
          description: { '#text': 'Target description' },
          referenceQuantity: { 'common:shortDescription': { '#text': 'kg eq' } },
        },
      ],
    });

    const result = await getLciaMethodMetaMap(['impact-1']);

    expect(result.size).toBe(1);
    expect(result.get('impact-1')).toEqual({
      description: { '#text': 'Target description' },
      version: '',
      referenceQuantityDesc: { '#text': 'kg eq' },
    });
  });

  it('returns an empty method meta map when the decompressed list uses a non-array files payload', async () => {
    mockGetDecompressedMethod.mockResolvedValueOnce({
      files: {
        0: {
          referenceQuantity: { 'common:shortDescription': { '#text': 'kg eq' } },
        },
        id: 'impact-1',
      },
    });

    const result = await getLciaMethodMetaMap(['impact-1']);

    expect(result.size).toBe(0);
  });

  it('returns an empty method meta map when the method list is unavailable after refresh', async () => {
    mockGetDecompressedMethod.mockResolvedValueOnce(null);
    mockCacheAndDecompressMethod.mockResolvedValueOnce(false);

    const result = await getLciaMethodMetaMap(['impact-1']);

    expect(result.size).toBe(0);
    expect(mockCacheAndDecompressMethod).toHaveBeenCalledWith('list.json');
  });

  it('refreshes cached method metadata when the initial list is missing reference quantities', async () => {
    mockGetDecompressedMethod
      .mockResolvedValueOnce({
        files: [{ id: 'impact-1', version: 'stale-version' }],
      })
      .mockResolvedValueOnce({
        files: [
          {
            id: 'impact-1',
            version: '2.0.0',
            description: { '#text': 'Fresh description' },
            referenceQuantity: { 'common:shortDescription': { '#text': 'fresh unit' } },
          },
        ],
      });
    mockCacheAndDecompressMethod.mockResolvedValueOnce(true);

    const result = await getLciaMethodMetaMap(['impact-1']);

    expect(mockCacheAndDecompressMethod).toHaveBeenCalledWith('list.json');
    expect(result.get('impact-1')).toEqual({
      description: { '#text': 'Fresh description' },
      version: '2.0.0',
      referenceQuantityDesc: { '#text': 'fresh unit' },
    });
  });

  it('merges solver rows using impact-id and hyphen fallbacks for missing method metadata', () => {
    const mergedWithImpactId = buildMergedLciaRows(
      [
        {
          key: 'base-key',
          meanAmount: 1,
          referenceToLCIAMethodDataSet: {
            '@refObjectId': 'impact-1',
            '@version': '',
          },
        },
      ],
      [
        {
          impact_id: 'impact-1',
          impact_index: 1,
          impact_name: '   ',
          unit: 'unknown',
          value: 9,
        },
      ],
      new Map([
        [
          'impact-1',
          {
            description: undefined,
            version: '',
            referenceQuantityDesc: undefined,
          },
        ],
      ]),
    );

    expect(mergedWithImpactId[0].referenceToLCIAMethodDataSet['common:shortDescription']).toEqual({
      '@xml:lang': 'en',
      '#text': 'impact-1',
    });
    expect(mergedWithImpactId[0].referenceToLCIAMethodDataSet['@version']).toBe('');

    const mergedWithHyphen = buildMergedLciaRows(
      [],
      [
        {
          impact_id: '',
          impact_index: 1,
          impact_name: '   ',
          unit: 'unknown',
          value: 2,
        },
      ],
      new Map(),
    );

    expect(mergedWithHyphen[0].referenceToLCIAMethodDataSet['common:shortDescription']).toEqual({
      '@xml:lang': 'en',
      '#text': '-',
    });
    expect(mergedWithHyphen[0].referenceToLCIAMethodDataSet['@version']).toBe('');
  });

  it('returns the first reference entry when a flow reference array is provided', () => {
    expect(
      toReferenceValue([
        { '@refObjectId': 'flow-1', '@version': '1.0' },
        { '@refObjectId': 'flow-2', '@version': '2.0' },
      ]),
    ).toEqual({ '@refObjectId': 'flow-1', '@version': '1.0' });
  });
});
