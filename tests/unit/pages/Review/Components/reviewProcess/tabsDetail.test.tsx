// @ts-nocheck
import { act, renderWithProviders, screen, waitFor } from '../../../../../helpers/testUtils';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

const mockGetUserDetail = jest.fn();
const mockGetProcessExchange = jest.fn();
const mockGetFlowStateCodeByIdsAndVersions = jest.fn();
const mockGetUnitData = jest.fn();
const mockGenProcessExchangeTableData = jest.fn((data: any) => data);

const proTableRequests: Array<{ title: string; data: any[] }> = [];

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');
  return {
    __esModule: true,
    ProTable: ({ request, actionRef, columns, scroll }: any) => {
      const [rows, setRows] = React.useState<any[]>([]);
      const title = toText(columns?.[0]?.title) || 'table';

      const runRequest = React.useCallback(async () => {
        const response = await request?.({ pageSize: 10, current: 1 });
        const nextRows = response?.data ?? [];
        proTableRequests.push({ title, data: nextRows });
        setRows(nextRows);
        return response;
      }, [request, title]);

      React.useEffect(() => {
        actionRef.current = { reload: jest.fn(() => runRequest()) };
        void runRequest();
      }, [actionRef, runRequest]);

      return (
        <div data-testid={`table-${title}`} data-scroll={scroll?.x ?? ''}>
          <div data-testid={`table-columns-${title}`}>
            {(columns ?? []).map((column: any) => toText(column.title)).join('|')}
          </div>
          {rows.map((row, index) => (
            <div key={`${title}-${index}`}>
              <div>{`${row.referenceToFlowDataSetId}:${row.stateCode ?? 'na'}:${row.classification ?? '-'}`}</div>
              {(columns ?? []).map((column: any, columnIndex: number) => {
                const rendered = column.render
                  ? column.render(row?.[column.dataIndex], row, index)
                  : row?.[column.dataIndex];
                return <div key={`${title}-${index}-${columnIndex}`}>{toText(rendered)}</div>;
              })}
            </div>
          ))}
        </div>
      );
    },
  };
});

jest.mock('antd', () => {
  const React = require('react');
  const ConfigProvider = ({ children }: any) => <div>{children}</div>;
  const Card = ({ children, tabList, activeTabKey, onTabChange }: any) => (
    <section>
      <div>
        {(tabList ?? []).map((tab: any) => (
          <button key={tab.key} type='button' onClick={() => onTabChange?.(tab.key)}>
            {toText(tab.tab)}
          </button>
        ))}
      </div>
      <div data-active-tab={activeTabKey}>{children}</div>
    </section>
  );
  const Collapse = ({ items }: any) => (
    <div>
      {items?.map((item: any) => (
        <div key={item.key}>{item.children}</div>
      ))}
    </div>
  );
  const Descriptions = ({ items = [] }: any) => (
    <dl>
      {items.map((item: any, index: number) => (
        <div key={item.key ?? index}>
          {item.label === undefined ? null : <dt>{toText(item.label)}</dt>}
          <dd>{item.children}</dd>
        </div>
      ))}
    </dl>
  );
  const Divider = ({ children }: any) => <div>{toText(children)}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children }: any) => <>{children}</>;
  return {
    __esModule: true,
    Card,
    Collapse,
    ConfigProvider,
    Descriptions,
    Divider,
    Space,
    Tooltip,
  };
});

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span>{value}</span>,
}));

jest.mock('@/components/LangTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div>{JSON.stringify(data ?? null)}</div>,
}));

jest.mock('@/components/LevelTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div>{JSON.stringify(data ?? null)}</div>,
}));

jest.mock('@/components/LocationTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div>{JSON.stringify(data ?? null)}</div>,
}));

jest.mock('@/components/QuantitativeReferenceIcon', () => ({
  __esModule: true,
  default: ({ value }: any) => <span>{String(value)}</span>,
}));

jest.mock('@/pages/Contacts/Components/select/description', () => ({
  __esModule: true,
  default: ({ title }: any) => <div>{toText(title)}</div>,
}));

jest.mock('@/pages/Sources/Components/select/description', () => ({
  __esModule: true,
  default: ({ title }: any) => <div>{toText(title)}</div>,
}));

jest.mock('@/pages/Review/Components/Compliance/form', () => ({
  __esModule: true,
  default: () => <div>compliance-form</div>,
}));

jest.mock('@/pages/Review/Components/Compliance/view', () => ({
  __esModule: true,
  default: ({ data }: any) => (
    <div>{`compliance-view-${Array.isArray(data) ? data.length : 0}`}</div>
  ),
}));

jest.mock('@/pages/Review/Components/Exchange/view', () => ({
  __esModule: true,
  default: ({ id }: any) => <span>{`exchange-view-${id}`}</span>,
}));

jest.mock('@/pages/Review/Components/ReviewForm/form', () => ({
  __esModule: true,
  default: () => <div>review-form</div>,
}));

jest.mock('@/pages/Review/Components/ReviewForm/view', () => ({
  __esModule: true,
  default: ({ data }: any) => <div>{`review-view-${Array.isArray(data) ? data.length : 0}`}</div>,
}));

jest.mock('@/pages/Processes/Components/optiondata', () => ({
  __esModule: true,
  completenessElementaryFlowsTypeOptions: [{ value: 'type-a', label: 'Type A' }],
  completenessElementaryFlowsValueOptions: [{ value: 'value-a', label: 'Value A' }],
  completenessProductModelOptions: [{ value: 'product-a', label: 'Product A' }],
  copyrightOptions: [{ value: 'yes', label: 'Yes' }],
  LCIMethodApproachOptions: [{ value: 'approach-a', label: 'Approach A' }],
  LCIMethodPrincipleOptions: [{ value: 'principle-a', label: 'Principle A' }],
  licenseTypeOptions: [{ value: 'license-a', label: 'License A' }],
  processtypeOfDataSetOptions: [{ value: 'process-a', label: 'Process A' }],
  uncertaintyDistributionTypeOptions: [{ value: 'distribution-a', label: 'Distribution A' }],
}));

jest.mock('@/services/flows/api', () => ({
  __esModule: true,
  getFlowStateCodeByIdsAndVersions: (...args: any[]) =>
    mockGetFlowStateCodeByIdsAndVersions(...args),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getLangText: jest.fn((value: any) => {
    if (Array.isArray(value)) return value[0]?.['#text'] ?? '-';
    if (typeof value === 'string') return value;
    return value?.['#text'] ?? '-';
  }),
  getUnitData: (...args: any[]) => mockGetUnitData(...args),
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessExchange: (...args: any[]) => mockGetProcessExchange(...args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessExchangeTableData: (...args: any[]) => mockGenProcessExchangeTableData(...args),
}));

jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUserDetail: (...args: any[]) => mockGetUserDetail(...args),
}));

describe('Review process TabsDetail', () => {
  const TabsDetail = require('@/pages/Review/Components/reviewProcess/tabsDetail').TabsDetail;

  const renderTabsDetail = async (props: any) => {
    let view: any;
    await act(async () => {
      view = renderWithProviders(<TabsDetail {...props} />);
      await Promise.resolve();
    });
    return view!;
  };

  const exchangeRow = {
    dataSetInternalID: 'ex-1',
    referenceToFlowDataSetId: 'flow-1',
    referenceToFlowDataSetVersion: '1.0.0',
    referenceToFlowDataSet: [{ '@refObjectId': 'flow-1', '@version': '1.0.0' }],
    stateCode: undefined,
    classification: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    proTableRequests.length = 0;
    mockGetUserDetail.mockResolvedValue({
      data: {
        contact: {
          '@refObjectId': 'contact-1',
          '@version': '1.0.0',
          '@type': 'contact data set',
        },
      },
    });
    mockGetProcessExchange.mockImplementation(async (_data: any, direction: string) => ({
      success: true,
      data: [{ ...exchangeRow, direction }],
    }));
    mockGetUnitData.mockImplementation(async (_type: string, data: any[]) => data);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValue({
      error: null,
      data: [{ id: 'flow-1', version: '1.0.0', stateCode: 30, classification: 'class-a' }],
    });
  });

  it('initializes validation review data and reviewer contact in edit mode', async () => {
    const fieldValues: Record<string, any> = {};
    const getFieldValue = jest.fn((path: any[]) => fieldValues[path.join('.')]);
    const setFieldValue = jest.fn((path: any[], value: any) => {
      fieldValues[path.join('.')] = value;
    });
    const formRef = { current: { getFieldValue, setFieldValue } };

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'validation',
      formRef: formRef as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      type: 'edit',
    });

    await waitFor(() =>
      expect(setFieldValue).toHaveBeenCalledWith(
        ['modellingAndValidation', 'validation', 'review'],
        [{ 'common:scope': [{}] }],
      ),
    );
    await waitFor(() =>
      expect(setFieldValue).toHaveBeenCalledWith(
        [
          'modellingAndValidation',
          'validation',
          'review',
          0,
          'common:referenceToNameOfReviewerAndInstitution',
        ],
        expect.objectContaining({ '@refObjectId': 'contact-1' }),
      ),
    );
  });

  it('keeps existing validation review rows without injecting a default row', async () => {
    const existingReview = [{ id: 'existing-review' }];
    const getFieldValue = jest.fn(() => existingReview);
    const setFieldValue = jest.fn();

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'validation',
      formRef: { current: { getFieldValue, setFieldValue } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: { validation: { review: existingReview } } },
      type: 'edit',
    });

    await waitFor(() => expect(mockGetUserDetail).toHaveBeenCalled());
    expect(setFieldValue).not.toHaveBeenCalledWith(
      ['modellingAndValidation', 'validation', 'review'],
      [{ 'common:scope': [{}] }],
    );
    expect(setFieldValue).toHaveBeenCalledWith(
      [
        'modellingAndValidation',
        'validation',
        'review',
        0,
        'common:referenceToNameOfReviewerAndInstitution',
      ],
      expect.objectContaining({ '@refObjectId': 'contact-1' }),
    );
  });

  it('keeps the default review row when the current user has no contact reference', async () => {
    const setFieldValue = jest.fn();
    mockGetUserDetail.mockResolvedValueOnce({ data: {} });

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'validation',
      formRef: {
        current: { getFieldValue: jest.fn(() => undefined), setFieldValue },
      } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      type: 'edit',
    });

    await waitFor(() => expect(mockGetUserDetail).toHaveBeenCalled());
    expect(setFieldValue).toHaveBeenCalledTimes(1);
    expect(setFieldValue).toHaveBeenCalledWith(
      ['modellingAndValidation', 'validation', 'review'],
      [{ 'common:scope': [{}] }],
    );
  });

  it('flattens rejected validation and compliance comments in edit mode', async () => {
    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'validation',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      rejectedComments: [
        {
          modellingAndValidation: {
            validation: { review: [{ id: 'review-1' }, { id: 'review-2' }] },
          },
        },
        {
          modellingAndValidation: {
            validation: { review: { id: 'review-3' } },
            complianceDeclarations: { compliance: [{ id: 'compliance-1' }] },
          },
        },
      ],
      type: 'edit',
    });

    expect(await screen.findByText('review-view-3')).toBeInTheDocument();

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'complianceDeclarations',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      rejectedComments: [
        {
          modellingAndValidation: {
            complianceDeclarations: { compliance: { id: 'compliance-1' } },
          },
        },
        {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [{ id: 'compliance-2' }] },
          },
        },
      ],
      type: 'edit',
    });

    expect(await screen.findByText('compliance-view-2')).toBeInTheDocument();
  });

  it('loads exchange tables and enriches rows with flow review state data', async () => {
    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'exchanges',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      type: 'view',
    });

    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalledTimes(4));
    expect(mockGenProcessExchangeTableData).toHaveBeenCalledWith([exchangeRow], 'en');
    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledWith(
      [{ id: 'flow-1', version: '1.0.0' }],
      'en',
    );
    expect(await screen.findAllByText('flow-1:30:class-a')).toHaveLength(2);
    expect(screen.getAllByTestId('table-Index')).toHaveLength(2);
    expect(screen.getAllByTestId('table-Index')[0]).toHaveAttribute('data-scroll', 'max-content');
    expect(screen.getAllByTestId('table-columns-Index')[0]).toHaveTextContent('Flow type');
    expect(screen.getAllByTestId('table-columns-Index')[0]).toHaveTextContent('Classification');
  });

  it('uses empty exchange rows when unit enrichment and flow state lookup fail', async () => {
    mockGetUnitData.mockResolvedValue(undefined);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValue({
      error: new Error('flow state unavailable'),
      data: [],
    });

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'exchanges',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      type: 'view',
    });

    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalledTimes(4));
    expect(proTableRequests).toHaveLength(4);
    expect(proTableRequests.every(({ data }) => data.length === 0)).toBe(true);
  });

  it('falls back to an empty classification when flow state metadata omits it', async () => {
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValue({
      error: null,
      data: [{ id: 'flow-1', version: '1.0.0', stateCode: 30 }],
    });

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'exchanges',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      initData: { modellingAndValidation: {} },
      type: 'view',
    });

    expect(await screen.findAllByText('flow-1:30:')).toHaveLength(2);
  });

  it('renders mapped option labels across process, modelling, and administrative tabs', async () => {
    const sharedProps = {
      lang: 'en',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [exchangeRow],
      type: 'view' as const,
    };

    const { rerender } = await renderTabsDetail({
      ...sharedProps,
      activeTabKey: 'processInformation',
      initData: {
        processInformation: {
          mathematicalRelations: {
            variableParameter: {
              uncertaintyDistributionType: 'distribution-a',
            },
          },
        },
      },
    });

    expect(screen.getByText('Distribution A')).toBeInTheDocument();

    await act(async () => {
      rerender(
        <TabsDetail
          {...sharedProps}
          activeTabKey='modellingAndValidation'
          initData={{
            modellingAndValidation: {
              LCIMethodAndAllocation: {
                typeOfDataSet: 'process-a',
                LCIMethodPrinciple: 'principle-a',
                LCIMethodApproaches: 'approach-a',
              },
              completeness: {
                completenessProductModel: 'product-a',
                completenessElementaryFlows: {
                  '@type': 'type-a',
                  '@value': 'value-a',
                },
              },
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByText('Process A')).toBeInTheDocument();
    expect(screen.getByText('Principle A')).toBeInTheDocument();
    expect(screen.getByText('Approach A')).toBeInTheDocument();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Type A')).toBeInTheDocument();
    expect(screen.getByText('Value A')).toBeInTheDocument();

    await act(async () => {
      rerender(
        <TabsDetail
          {...sharedProps}
          activeTabKey='administrativeInformation'
          initData={{
            administrativeInformation: {
              publicationAndOwnership: {
                'common:copyright': 'yes',
                'common:licenseType': 'license-a',
              },
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('License A')).toBeInTheDocument();
  });

  it('renders exchange column renderers for reviewed, unreviewed, and unknown flows', async () => {
    const reviewedRow = {
      dataSetInternalID: 'ex-reviewed',
      referenceToFlowDataSetId: 'flow-reviewed',
      referenceToFlowDataSetVersion: '1.0.0',
      referenceToFlowDataSet: 'Reviewed flow',
      generalComment: 'Reviewed comment',
      meanAmount: 1.23,
      resultingAmount: 4.56,
      refUnitRes: {
        name: 'Kilogram',
        refUnitGeneralComment: 'kg comment',
        refUnitName: 'kg',
      },
      quantitativeReference: true,
    };
    const unreviewedRow = {
      ...reviewedRow,
      dataSetInternalID: 'ex-unreviewed',
      referenceToFlowDataSetId: 'flow-unreviewed',
      referenceToFlowDataSet: 'Unreviewed flow',
      quantitativeReference: false,
    };
    const unknownRow = {
      ...reviewedRow,
      dataSetInternalID: 'ex-unknown',
      referenceToFlowDataSetId: 'flow-unknown',
      referenceToFlowDataSet: 'Unknown flow',
      referenceToFlowDataSetVersion: '2.0.0',
    };

    mockGenProcessExchangeTableData.mockReturnValue([reviewedRow, unreviewedRow, unknownRow]);
    mockGetProcessExchange.mockImplementation(async (data: any[]) => ({
      success: true,
      data,
    }));
    mockGetUnitData.mockImplementation(async (_type: string, data: any[]) => data);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValue({
      error: null,
      data: [
        {
          id: 'flow-reviewed',
          version: '1.0.0',
          stateCode: 100,
          classification: 'class-reviewed',
        },
        {
          id: 'flow-unreviewed',
          version: '1.0.0',
          stateCode: 30,
          classification: 'class-unreviewed',
        },
      ],
    });

    await renderTabsDetail({
      lang: 'en',
      activeTabKey: 'exchanges',
      formRef: { current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() } } as any,
      onData: jest.fn(),
      onExchangeData: jest.fn(),
      onTabChange: jest.fn(),
      exchangeDataSource: [reviewedRow, unreviewedRow, unknownRow],
      initData: { modellingAndValidation: {} },
      type: 'view',
    });

    await waitFor(() => expect(mockGetProcessExchange).toHaveBeenCalledTimes(4));
    expect(await screen.findAllByText('Reviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('Unreviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('ex-reviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('ex-unreviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('ex-unknown')).not.toHaveLength(0);
    expect(
      await screen.findAllByText((text) => text.includes('Kilogram') && text.includes('kg')),
    ).not.toHaveLength(0);
    expect(await screen.findAllByText('flow-reviewed:100:class-reviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('flow-unreviewed:30:class-unreviewed')).not.toHaveLength(0);
    expect(await screen.findAllByText('flow-unknown:na:-')).not.toHaveLength(0);
  });
});
