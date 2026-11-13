// @ts-nocheck
import { ProcessForm } from '@/pages/Processes/Components/form';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/components/TidasRepeatedField', () => ({
  __esModule: true,
  default: ({ name, children, keepFirst }: any) => (
    <div data-repeated-path={name.join('.')} data-keep-first={String(!!keepFirst)}>
      {children(name)}
    </div>
  ),
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const proTableInstances: any[] = [];
const formListInstances: Record<string, any> = {};

const mockProcessExchangeCreate = jest.fn();
const mockProcessExchangeEdit = jest.fn();
const mockProcessExchangeDelete = jest.fn();
const mockProcessExchangeView = jest.fn();
const mockProcessLciaResultsPanel = jest.fn();
const mockSourceSelectForm = jest.fn();
const mockGetLangText = jest.fn(() => 'text');
const mockJsonToList = jest.fn((value: any) =>
  Array.isArray(value) ? value : value ? [value] : [],
);

let mockRefCheckContextValue: any = { refCheckData: [] };
let mockIntlMessageOverrides: Record<string, string> = {};
const normalizeFieldName = (name: any) => JSON.stringify(Array.isArray(name) ? name : [name]);

const createMockFormInstance = () => {
  const errorStore = new Map<string, string[]>();

  return {
    getFieldError: jest.fn((name: any) => errorStore.get(normalizeFieldName(name)) ?? []),
    scrollToField: jest.fn(),
    setFields: jest.fn((fields: Array<{ errors?: string[]; name: any }>) => {
      fields.forEach((field) => {
        errorStore.set(normalizeFieldName(field.name), [...(field.errors ?? [])]);
      });
      ((globalThis as any).__TEST_PROCESS_FORM_LISTENERS__ ?? []).forEach((notify: () => void) =>
        notify(),
      );
    }),
  };
};

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, any>) => {
      const messages: Record<string, string> = {
        'pages.validationIssues.sdkDetail.suggestedFix.required_missing': 'Fill in this field',
        'pages.validationIssues.sdkDetail.suggestedFix.invalid_type':
          'Enter this in the correct format',
        'pages.validationIssues.sdkDetail.suggestedFix.invalid_union':
          'Complete this field as required',
        'pages.validationIssues.sdkDetail.suggestedFix.exchanges_required':
          'Add at least one exchange',
        'pages.validationIssues.sdkDetail.suggestedFix.quantitative_reference_count_invalid':
          'Select exactly one item as the quantitative reference',
        'pages.validationIssues.sdkDetail.suggestedFix.localized_text_zh_must_include_chinese_character':
          'Chinese text must include at least one Chinese character',
      };
      const template = mockIntlMessageOverrides[id] ?? messages[id] ?? defaultMessage ?? id ?? '';

      return Object.entries(values ?? {}).reduce((message, [key, value]) => {
        return message.split(`{${key}}`).join(String(value));
      }, template);
    },
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span data-testid='icon-close' />,
}));

jest.mock('@/contexts/refCheckContext', () => ({
  __esModule: true,
  useRefCheckContext: () => mockRefCheckContextValue,
}));

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='aligned-number'>{value}</span>,
}));

jest.mock('@/components/RequiredMark', () => ({
  __esModule: true,
  default: ({ label }: any) => <span>{toText(label)}</span>,
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: () => [],
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessExchangeTableData: (data: any[]) => data,
}));

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessExchange: jest.fn(() => Promise.resolve({ error: null, data: [] })),
}));

jest.mock('@/services/flows/api', () => ({
  __esModule: true,
  getFlowStateCodeByIdsAndVersions: jest.fn(() => Promise.resolve({ error: null, data: [] })),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getLangText: (...args: any[]) => mockGetLangText(...args),
  getUnitData: jest.fn(() => Promise.resolve([])),
  jsonToList: (...args: any[]) => mockJsonToList(...args),
}));

const { getProcessExchange: mockGetProcessExchange } = jest.requireMock('@/services/processes/api');
const { getFlowStateCodeByIdsAndVersions: mockGetFlowStateCodeByIdsAndVersions } =
  jest.requireMock('@/services/flows/api');
const { getUnitData: mockGetUnitData } = jest.requireMock('@/services/general/util');

jest.mock('@/components/ToolBarButton', () => ({
  __esModule: true,
  default: ({ tooltip, onClick }: any) => (
    <button type='button' onClick={onClick}>
      {toText(tooltip) || 'button'}
    </button>
  ),
}));

jest.mock('@/pages/Processes/Components/processLciaResultsPanel', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessLciaResultsPanel(props);
    return <div data-testid='process-lcia-results-panel'>process-lcia-results-panel</div>;
  },
}));

jest.mock('@/pages/Flows/Components/select/form', () => ({
  __esModule: true,
  default: () => <div data-testid='flow-select'>flow-select</div>,
}));

jest.mock('@/pages/Sources/Components/select/form', () => ({
  __esModule: true,
  default: (props: any) => {
    mockSourceSelectForm(props);
    return <div data-testid='source-select'>source-select</div>;
  },
}));

jest.mock('@/pages/Contacts/Components/select/form', () => ({
  __esModule: true,
  default: () => <div data-testid='contact-select'>contact-select</div>,
}));

jest.mock('@/components/LangTextItem/form', () => ({
  __esModule: true,
  default: () => <div data-testid='lang-form'>lang-form</div>,
}));

jest.mock('@/components/LevelTextItem/form', () => ({
  __esModule: true,
  default: () => <div data-testid='level-form'>level-form</div>,
}));

jest.mock('@/components/LocationTextItem/form', () => ({
  __esModule: true,
  default: () => <div data-testid='location-form'>location-form</div>,
}));

jest.mock('@/components/QuantitativeReferenceIcon', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='quantitative-icon'>{String(value)}</span>,
}));

jest.mock('@/pages/Processes/Components/Exchange/create', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessExchangeCreate(props);
    return <div data-testid='exchange-create' />;
  },
}));

jest.mock('@/pages/Processes/Components/Exchange/edit', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessExchangeEdit(props);
    return (
      <button type='button' onClick={() => props.setViewDrawerVisible?.(false)}>
        exchange-edit
      </button>
    );
  },
}));

jest.mock('@/pages/Processes/Components/Exchange/delete', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessExchangeDelete(props);
    return (
      <button type='button' onClick={() => props.setViewDrawerVisible?.(false)}>
        exchange-delete
      </button>
    );
  },
}));

jest.mock('@/pages/Processes/Components/Exchange/view', () => ({
  __esModule: true,
  default: (props: any) => {
    mockProcessExchangeView(props);
    return <button type='button'>exchange-view</button>;
  },
}));

jest.mock('@/pages/Processes/Components/Compliance/form', () => ({
  __esModule: true,
  default: () => <div data-testid='compliance-form'>compliance-form</div>,
}));

jest.mock('@/pages/Processes/Components/Review/form', () => ({
  __esModule: true,
  default: () => <div data-testid='review-form'>review-form</div>,
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const ProTable = (props: any) => {
    const { actionRef, dataSource, request, rowKey, toolBarRender, columns = [] } = props;
    React.useEffect(() => {
      if (actionRef) {
        actionRef.current = {
          reload: jest.fn(),
        };
      }
    }, [actionRef]);
    React.useEffect(() => {
      proTableInstances.push(props);
    }, [props]);

    const sampleRow = {
      dataSetInternalID: 'row-0',
      referenceToFlowDataSetId: 'flow-1',
      referenceToFlowDataSetVersion: '1.0',
      meanAmount: '-',
      resultingAmount: '-',
      dataDerivationTypeStatus: '-',
    };

    const toolbar = toolBarRender ? toolBarRender() : null;
    const renderedRows =
      Array.isArray(dataSource) && dataSource.length > 0 ? dataSource : request ? [sampleRow] : [];

    return (
      <section data-testid='pro-table'>
        {toolbar}
        {renderedRows.map((row: any, rowIndex: number) => {
          const key = rowKey ? rowKey(row) : `row-${rowIndex}`;
          return (
            <div data-testid={`pro-row-${key}`} key={key}>
              {columns.map((column: any, index: number) => {
                if (typeof column?.render !== 'function') return null;
                return (
                  <div key={column?.dataIndex ?? index}>{column.render(null, row, index)}</div>
                );
              })}
            </div>
          );
        })}
      </section>
    );
  };

  return {
    __esModule: true,
    ProTable,
  };
});

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, onClick, disabled }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {toText(children) || 'icon-button'}
    </button>
  );

  const Space = ({ children }: any) => <div>{children}</div>;
  Space.Compact = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;

  const Card = ({ tabList = [], activeTabKey, onTabChange, children }: any) => (
    <div data-testid='card' data-active-key={activeTabKey}>
      {tabList.map((item: any) => (
        <button type='button' key={item.key} onClick={() => onTabChange?.(item.key)}>
          {item.tab}
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

  const FormComponent = ({ children }: any) => <form>{children}</form>;
  const FormItem = ({ children, name, getValueProps }: any) => {
    getValueProps?.(undefined);
    const [, forceRender] = React.useState(0);
    const notifyRef = React.useRef<() => void>();
    const listeners = ((globalThis as any).__TEST_PROCESS_FORM_LISTENERS__ ??= new Set<
      () => void
    >());

    if (!notifyRef.current) {
      notifyRef.current = () => forceRender((renderCount: number) => renderCount + 1);
    }

    listeners.add(notifyRef.current);

    React.useEffect(() => {
      return () => {
        if (notifyRef.current) {
          listeners.delete(notifyRef.current);
        }
      };
    }, [listeners]);

    const activeFormInstance = (globalThis as any).__TEST_PROCESS_FORM_INSTANCE__;
    const rawErrors =
      name && typeof activeFormInstance?.getFieldError === 'function'
        ? activeFormInstance.getFieldError(name)
        : [];
    const errors = Array.isArray(rawErrors) ? rawErrors : [];

    return (
      <div
        data-testid={name ? `form-item-${Array.isArray(name) ? name.join('.') : name}` : undefined}
      >
        {children}
        {errors.map((errorMessage: string, index: number) => (
          <div key={`${Array.isArray(name) ? name.join('.') : (name ?? 'field')}-${index}`}>
            {errorMessage}
          </div>
        ))}
      </div>
    );
  };
  FormComponent.Item = FormItem;
  const MockFormList = ({ children, name, initialValue = [], rules = [] }: any) => {
    const initialCount = initialValue.length > 0 ? initialValue.length : 1;
    const [fieldCount, setFieldCount] = React.useState(initialCount);
    const fields = Array.from({ length: fieldCount }, (_, index) => ({ key: index, name: index }));
    const operations = {
      add: jest.fn(() => setFieldCount((count: number) => count + 1)),
      remove: jest.fn(() => setFieldCount((count: number) => Math.max(1, count - 1))),
    };
    formListInstances[JSON.stringify(name ?? [])] = { rules, operations, fieldCount };
    return children(fields, operations);
  };
  FormComponent.List = MockFormList;

  const Input = ({
    onChange,
    value,
    'data-testid': dataTestId,
    'aria-label': ariaLabel,
    disabled,
    status,
    style,
  }: any) => (
    <input
      aria-label={ariaLabel}
      data-status={status}
      data-testid={dataTestId}
      disabled={disabled}
      style={style}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );

  const Select = ({ options = [], onChange }: any) => (
    <select onChange={(event) => onChange?.(event.target.value)}>
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const InputNumber = ({ value, onChange }: any) => (
    <input
      type='number'
      value={value ?? ''}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );

  const Switch = ({ checked, onChange }: any) => (
    <input
      type='checkbox'
      checked={checked}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );

  const Tooltip = ({ children }: any) => <>{children}</>;
  const Divider = () => <hr />;

  return {
    __esModule: true,
    Button,
    Col,
    Space,
    Card,
    Collapse,
    Form: FormComponent,
    Input,
    Row,
    Select,
    InputNumber,
    Switch,
    Tooltip,
    Divider,
    theme: {
      defaultAlgorithm: {},
      darkAlgorithm: {},
      useToken: () => ({ token: { colorError: 'red', fontWeightStrong: 600 } }),
    },
  };
});

const sampleExchange = {
  '@dataSetInternalID': '0',
  exchangeDirection: 'OUTPUT',
  referenceToFlowDataSet: {
    '@refObjectId': 'flow-1',
    '@version': '1.0',
  },
  refUnitRes: {
    name: 'Unit',
    refUnitName: 'kg',
  },
  meanAmount: 1,
  resultingAmount: 1,
  dataDerivationTypeStatus: 'provided',
};

const defaultProps = {
  lang: 'en',
  activeTabKey: 'processInformation',
  formRef: { current: null },
  onData: jest.fn(),
  onExchangeData: jest.fn(),
  onExchangeDataCreate: jest.fn(),
  onTabChange: jest.fn(),
  exchangeDataSource: [sampleExchange],
  formType: 'create',
  showRules: false,
  lciaResults: [],
  actionFrom: undefined,
};

describe('ProcessForm component', () => {
  const getLatestExchangeTables = async () => {
    await waitFor(() => {
      expect(proTableInstances.length).toBeGreaterThanOrEqual(2);
    });

    return proTableInstances.slice(-2);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    proTableInstances.length = 0;
    Object.keys(formListInstances).forEach((key) => delete formListInstances[key]);
    mockRefCheckContextValue = { refCheckData: [] };
    mockIntlMessageOverrides = {};
    (globalThis as any).__TEST_PROCESS_FORM_LISTENERS__ = new Set();
    (globalThis as any).__TEST_PROCESS_FORM_INSTANCE__ = createMockFormInstance();
    defaultProps.formRef = { current: (globalThis as any).__TEST_PROCESS_FORM_INSTANCE__ };
    mockSourceSelectForm.mockClear();
    mockProcessLciaResultsPanel.mockClear();
    mockGetLangText.mockReset();
    mockGetLangText.mockReturnValue('text');
    mockGetProcessExchange.mockReset();
    mockGetProcessExchange.mockResolvedValue({ error: null, data: [] });
    mockGetUnitData.mockReset();
    mockGetUnitData.mockResolvedValue([]);
    mockGetFlowStateCodeByIdsAndVersions.mockReset();
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValue({ error: null, data: [] });
  });

  it('pins the optional completeness block without adding required rules', async () => {
    const { container } = render(
      <ProcessForm {...defaultProps} activeTabKey='modellingAndValidation' showRules={false} />,
    );
    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-repeated-path="modellingAndValidation.completeness.completenessElementaryFlows"]',
        ),
      ).toHaveAttribute('data-keep-first', 'true'),
    );
  });

  it('marks rows with issues when rules are enabled', async () => {
    mockRefCheckContextValue = {
      refCheckData: [
        {
          id: 'flow-1',
          version: '1.0',
        },
      ],
    };

    render(
      <ProcessForm {...defaultProps} activeTabKey='exchanges' showRules exchangeDataSource={[]} />,
    );

    const [inputTable] = await getLatestExchangeTables();
    const rowClassName = inputTable.rowClassName;
    const errorRow = rowClassName({
      referenceToFlowDataSetId: 'flow-1',
      referenceToFlowDataSetVersion: '1.0',
      meanAmount: '-',
      resultingAmount: '-',
      dataDerivationTypeStatus: '-',
    });
    expect(errorRow).toBe('error-row');

    const validRow = rowClassName({
      referenceToFlowDataSetId: 'flow-2',
      referenceToFlowDataSetVersion: '1.0',
      meanAmount: 1,
      resultingAmount: 2,
      dataDerivationTypeStatus: 'ok',
    });
    expect(validRow).toBe('');
  });

  it('does not mark rows when rules are disabled even if the exchange is incomplete', async () => {
    render(<ProcessForm {...defaultProps} activeTabKey='exchanges' showRules={false} />);

    const [, outputTable] = await getLatestExchangeTables();
    const outputRowClassName = outputTable.rowClassName;
    expect(
      outputRowClassName({
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: '-',
        resultingAmount: '-',
        dataDerivationTypeStatus: '-',
      }),
    ).toBe('');
  });

  it('shows sdk tab counts and marks focused exchange rows for sdk validation findings', async () => {
    const sdkValidationDetail = {
      key: 'sdk-row-0',
      tabName: 'exchanges',
      exchangeInternalId: 'row-0',
      fieldKey: 'generalComment',
      fieldLabel: 'Comment',
      fieldPath: 'exchange[#row-0].generalComment.0.#text',
      reasonMessage: 'Text length 520 exceeds maximum 500',
    };
    const sdkValidationDetailSameExchange = {
      key: 'sdk-row-0-mean',
      tabName: 'exchanges',
      exchangeInternalId: 'row-0',
      fieldKey: 'meanAmount',
      fieldLabel: 'Mean amount',
      fieldPath: 'exchange[#row-0].meanAmount',
      reasonMessage: 'Expected string but found undefined',
    };

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        sdkValidationDetails={[sdkValidationDetail, sdkValidationDetailSameExchange]}
        sdkValidationFocus={sdkValidationDetail}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Inputs and Outputs' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockProcessExchangeEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkHighlights: [
            expect.objectContaining({ key: 'sdk-row-0' }),
            expect.objectContaining({ key: 'sdk-row-0-mean' }),
          ],
        }),
      );
    });
    expect(mockProcessExchangeEdit.mock.calls.at(-1)?.[0]?.autoOpen).toBeUndefined();

    const [inputTable] = await getLatestExchangeTables();
    const rowClassName = inputTable.rowClassName;

    expect(
      rowClassName({
        dataSetInternalID: 'row-0',
        referenceToFlowDataSetId: 'flow-2',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'ok',
      }),
    ).toBe('sdk-error-row sdk-focus-row');
  });

  it('renders exchanges summary sdk messages and only uses highlight-only details for row styling', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        exchangeDataSource={[
          {
            ...sampleExchange,
            '@dataSetInternalID': 'row-0',
            quantitativeReference: true,
          },
          {
            ...sampleExchange,
            '@dataSetInternalID': 'row-1',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-2',
              '@version': '1.0',
            },
          },
        ]}
        sdkValidationDetails={[
          {
            key: 'sdk-quantitative-reference-section',
            tabName: 'exchanges',
            fieldKey: 'quantitativeReference',
            fieldLabel: 'Reference flow(s)',
            fieldPath: 'exchanges.quantitativeReferenceSummary',
            presentation: 'section',
            reasonMessage:
              'The following data must have exactly one item designated as the reference',
            validationCode: 'quantitative_reference_count_invalid',
          },
          {
            key: 'sdk-quantitative-reference-row-0',
            tabName: 'exchanges',
            exchangeInternalId: 'row-0',
            fieldKey: 'quantitativeReference',
            fieldLabel: 'Reference flow(s)',
            fieldPath: 'exchange[#row-0].quantitativeReference',
            presentation: 'highlight-only',
            reasonMessage:
              'The following data must have exactly one item designated as the reference',
            validationCode: 'quantitative_reference_count_invalid',
          },
          {
            key: 'sdk-quantitative-reference-row-1',
            tabName: 'exchanges',
            exchangeInternalId: 'row-1',
            fieldKey: 'quantitativeReference',
            fieldLabel: 'Reference flow(s)',
            fieldPath: 'exchange[#row-1].quantitativeReference',
            presentation: 'highlight-only',
            reasonMessage:
              'The following data must have exactly one item designated as the reference',
            validationCode: 'quantitative_reference_count_invalid',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Inputs and Outputs' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        within(screen.getByTestId('card')).getByText(
          'Select exactly one item as the quantitative reference',
        ),
      ).toBeInTheDocument();
    });

    expect(
      mockProcessExchangeEdit.mock.calls.every(
        (call) => (call[0].sdkHighlights ?? []).length === 0,
      ),
    ).toBe(true);

    const [inputTable] = await getLatestExchangeTables();
    const rowClassName = inputTable.rowClassName;

    expect(
      rowClassName({
        dataSetInternalID: 'row-0',
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'ok',
      }),
    ).toBe('sdk-error-row');

    expect(
      rowClassName({
        dataSetInternalID: 'row-1',
        referenceToFlowDataSetId: 'flow-2',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'ok',
      }),
    ).toBe('sdk-error-row');
  });

  it('renders an exchanges required summary message at the top of the exchanges tab', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        exchangeDataSource={[]}
        sdkValidationDetails={[
          {
            key: 'sdk-exchanges-required-section',
            tabName: 'exchanges',
            fieldKey: 'exchanges',
            fieldLabel: 'Exchanges',
            fieldPath: 'exchanges.requiredSummary',
            presentation: 'section',
            reasonMessage: 'Add at least one exchange',
            suggestedFix: 'Add at least one exchange',
            validationCode: 'exchanges_required',
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Inputs and Outputs' })).toBeInTheDocument();

    await waitFor(() => {
      expect(
        within(screen.getByTestId('card')).getByText('Add at least one exchange'),
      ).toBeInTheDocument();
    });
  });

  it('highlights tabs that contain reference validation issues', () => {
    render(<ProcessForm {...defaultProps} validationIssueTabNames={['exchanges']} />);

    expect(
      screen.getByRole('button', { name: 'Inputs and Outputs' }).querySelector('span'),
    ).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(
      screen.getByRole('button', { name: 'Process information' }).querySelector('span'),
    ).not.toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('counts review and compliance issues on their rendered tabs', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        sdkValidationDetails={[
          {
            key: 'sdk-review-required',
            tabName: 'modellingAndValidation',
            fieldKey: 'review',
            fieldLabel: 'Review',
            fieldPath: 'modellingAndValidation.validation.review',
            formName: ['modellingAndValidation', 'validation', 'review'],
            reasonMessage: 'Invalid input: expected object, received undefined',
            validationCode: 'required_missing',
          },
          {
            key: 'sdk-compliance-required',
            tabName: 'modellingAndValidation',
            fieldKey: 'compliance',
            fieldLabel: 'Compliance',
            fieldPath: 'modellingAndValidation.complianceDeclarations.compliance',
            formName: ['modellingAndValidation', 'complianceDeclarations', 'compliance'],
            reasonMessage: 'Invalid input: expected object, received undefined',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Modelling and validation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Validation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Compliance declarations' })).toBeInTheDocument();
    });
  });

  it('renders sdk messages on the matching root form field and scrolls to the focused field', async () => {
    const sdkValidationDetail = {
      key: 'sdk-root-type-of-data-set',
      tabName: 'modellingAndValidation',
      fieldKey: 'typeOfDataSet',
      fieldLabel: 'Type of data set',
      fieldPath: 'modellingAndValidation.LCIMethodAndAllocation.typeOfDataSet',
      formName: ['modellingAndValidation', 'LCIMethodAndAllocation', 'typeOfDataSet'],
      reasonMessage: 'This value does not match any allowed structure.',
      suggestedFix: 'Adjust the value so it matches one supported structure.',
      validationCode: 'invalid_union',
    };

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        sdkValidationDetails={[sdkValidationDetail]}
        sdkValidationFocus={sdkValidationDetail}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Complete this field as required')).toBeInTheDocument();
      expect(
        screen.queryByText(/This value does not match any allowed structure\./),
      ).not.toBeInTheDocument();
      expect(defaultProps.formRef.current.scrollToField).toHaveBeenCalledWith(
        ['modellingAndValidation', 'LCIMethodAndAllocation', 'typeOfDataSet'],
        { focus: true },
      );
    });
  });

  it('keeps only the local rule error when a required sdk issue hits the same field', async () => {
    const fieldName = ['modellingAndValidation', 'LCIMethodAndAllocation', 'typeOfDataSet'];
    defaultProps.formRef.current.setFields([
      {
        errors: ['Please select a data set type.'],
        name: fieldName,
      },
    ]);

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        sdkValidationDetails={[
          {
            key: 'sdk-root-type-of-data-set-required',
            tabName: 'modellingAndValidation',
            fieldKey: 'typeOfDataSet',
            fieldLabel: 'Type of data set',
            fieldPath: 'modellingAndValidation.LCIMethodAndAllocation.typeOfDataSet',
            formName: fieldName,
            reasonMessage: 'Required value is missing.',
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Please select a data set type.')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Required value is missing\./)).not.toBeInTheDocument();
    expect(screen.queryByText('Fill in this field')).not.toBeInTheDocument();
  });

  it('uses frontend required copy when a required sdk issue hits a direct form field with rules', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[
          {
            key: 'sdk-root-reference-year-required',
            tabName: 'processInformation',
            fieldKey: 'common:referenceYear',
            fieldLabel: 'Reference year',
            fieldPath: 'processInformation.time.common:referenceYear',
            formName: ['processInformation', 'time', 'common:referenceYear'],
            reasonMessage: 'Required value is missing.',
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Please input reference year')).toBeInTheDocument();
    });

    expect(screen.queryByText('Fill in this field')).not.toBeInTheDocument();
  });

  it('renders sdk messages on root selector version fields', async () => {
    const fieldName = [
      'modellingAndValidation',
      'dataSourcesTreatmentAndRepresentativeness',
      'referenceToDataSource',
      0,
      '@version',
    ];

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        sdkValidationDetails={[
          {
            key: 'sdk-root-data-source-version-required',
            tabName: 'modellingAndValidation',
            fieldKey: '@version',
            fieldLabel: 'Version',
            fieldPath:
              'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource.0.@version',
            formName: fieldName,
            reasonMessage: 'Required value is missing.',
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(defaultProps.formRef.current.setFields).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            errors: ['Fill in this field'],
            name: fieldName,
          }),
        ]),
      );
    });

    expect(defaultProps.formRef.current.getFieldError(fieldName)).toEqual(['Fill in this field']);
  });

  it('renders annual supply reference-context sdk issues on the derived context input', async () => {
    const sdkValidationDetail = {
      key: 'sdk-annual-supply-zh-context',
      tabName: 'modellingAndValidation',
      fieldKey: 'annualSupplyOrProductionVolume',
      fieldLabel: 'Annual supply or production volume',
      fieldPath:
        'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.annualSupplyOrProductionVolume.1.#text',
      formName: [
        'modellingAndValidation',
        'dataSourcesTreatmentAndRepresentativeness',
        'annualSupplyOrProductionVolume',
        1,
        '#text',
      ],
      reasonMessage:
        "@xml:lang values starting with 'zh' must include at least one Chinese character",
      suggestedFix: 'Chinese text must include at least one Chinese character',
      validationCode: 'localized_text_zh_must_include_chinese_character',
    };

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        exchangeDataSource={[{ ...sampleExchange, quantitativeReference: false }]}
        sdkValidationDetails={[sdkValidationDetail]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('annual-supply-volume-context')).toHaveAttribute(
        'data-status',
        'error',
      );
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select one input/output as the reference',
    );
    expect(
      screen.queryByText('Chinese text must include at least one Chinese character'),
    ).not.toBeInTheDocument();
  });

  it('keeps the generic annual supply localized-text sdk field error when a reference is selected', async () => {
    const fieldName = [
      'modellingAndValidation',
      'dataSourcesTreatmentAndRepresentativeness',
      'annualSupplyOrProductionVolume',
      1,
      '#text',
    ];

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        exchangeDataSource={[{ ...sampleExchange, quantitativeReference: true }]}
        sdkValidationDetails={[
          {
            key: 'sdk-annual-supply-zh-context-with-reference',
            tabName: 'modellingAndValidation',
            fieldKey: 'annualSupplyOrProductionVolume',
            fieldLabel: 'Annual supply or production volume',
            fieldPath:
              'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.annualSupplyOrProductionVolume.1.#text',
            formName: fieldName,
            reasonMessage:
              "@xml:lang values starting with 'zh' must include at least one Chinese character",
            suggestedFix: 'Chinese text must include at least one Chinese character',
            validationCode: 'localized_text_zh_must_include_chinese_character',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(defaultProps.formRef.current.setFields).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            errors: ['Chinese text must include at least one Chinese character'],
            name: fieldName,
          }),
        ]),
      );
    });

    expect(screen.queryByText('请选择一条输入/输出作为基准')).not.toBeInTheDocument();
    expect(screen.getByLabelText('annual-supply-volume-context')).not.toHaveAttribute(
      'data-status',
      'error',
    );
  });

  it('clears dismissed root sdk messages instead of replaying them on rerender', async () => {
    const fieldName = ['processInformation', 'time', 'common:referenceYear'];
    const sdkValidationDetail = {
      key: 'sdk-root-reference-year-required',
      tabName: 'processInformation',
      fieldKey: 'common:referenceYear',
      fieldLabel: 'Reference year',
      fieldPath: 'processInformation.time.common:referenceYear',
      formName: fieldName,
      reasonMessage: 'Required value is missing.',
      suggestedFix: 'Fill in the required value for this field.',
      validationCode: 'required_missing',
    };

    const { rerender } = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[sdkValidationDetail]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Please input reference year')).toBeInTheDocument();
    });

    defaultProps.formRef.current.setFields.mockClear();

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[sdkValidationDetail]}
        sdkValidationDismissedFieldKeys={new Set(['processInformation.time.common:referenceYear'])}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Please input reference year')).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Process information' }).querySelector('span'),
    ).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(defaultProps.formRef.current.setFields).toHaveBeenCalledWith([
      {
        errors: [],
        name: fieldName,
      },
    ]);
  });

  it('matches dismissed sdk fields by parent and child paths while keeping unrelated details', async () => {
    const sdkValidationDetail = {
      key: 'sdk-root-reference-year-required',
      tabName: 'processInformation',
      fieldKey: 'common:referenceYear',
      fieldLabel: 'Reference year',
      fieldPath: 'processInformation.time.common:referenceYear',
      formName: ['processInformation', 'time', 'common:referenceYear'],
      reasonMessage: 'Required value is missing.',
      suggestedFix: 'Fill in the required value for this field.',
      validationCode: 'required_missing',
    };
    const exchangeValidationDetail = {
      exchangeInternalId: 'row-0',
      key: 'sdk-exchange-mean-amount',
      tabName: 'exchanges',
      fieldKey: 'meanAmount',
      fieldLabel: 'Mean amount',
      fieldPath: 'exchanges.exchange.meanAmount',
      formName: ['exchanges', 'exchange', 0, 'meanAmount'],
      suggestedFix: 'Fill in the exchange amount.',
      validationCode: 'required_missing',
    };

    const { rerender } = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[sdkValidationDetail]}
        sdkValidationDismissedFieldKeys={new Set(['processInformation.time'])}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Please input reference year')).not.toBeInTheDocument();
    });

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[sdkValidationDetail]}
        sdkValidationDismissedFieldKeys={
          new Set(['processInformation.time.common:referenceYear.detail'])
        }
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Please input reference year')).not.toBeInTheDocument();
    });

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[sdkValidationDetail, exchangeValidationDetail]}
        sdkValidationDismissedFieldKeys={new Set(['administrativeInformation.unrelated'])}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Please input reference year')).toBeInTheDocument();
    });
  });

  it('uses the year validation copy for reference year range sdk issues', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        sdkValidationDetails={[
          {
            key: 'sdk-root-reference-year-range',
            tabName: 'processInformation',
            fieldKey: 'common:referenceYear',
            fieldLabel: 'Reference year',
            fieldPath: 'processInformation.time.common:referenceYear',
            formName: ['processInformation', 'time', 'common:referenceYear'],
            reasonMessage: 'Value is below the supported year range.',
            suggestedFix: 'Enter a value of at least 1900.',
            validationCode: 'number_too_small',
            validationParams: {
              minimum: 1900,
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid year (e.g., 2023)')).toBeInTheDocument();
    });

    expect(screen.queryByText('Enter a value of at least 1900')).not.toBeInTheDocument();
  });

  it('renders section label sdk fallback messages when validation items are missing entirely', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='validation'
        sdkValidationDetails={[
          {
            key: 'sdk-validation-review',
            tabName: 'validation',
            fieldKey: 'review',
            fieldLabel: 'Review',
            fieldPath: 'modellingAndValidation.validation.review',
            formName: ['modellingAndValidation', 'validation', 'review'],
            reasonMessage: 'Expected object but found undefined.',
            validationCode: 'invalid_type',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Enter this in the correct format')).toBeInTheDocument();
      expect(screen.getByTestId('review-form')).toBeInTheDocument();
    });
  });

  it('disables exchange actions when actionFrom is modelResult', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        actionFrom='modelResult'
        exchangeDataSource={[
          {
            '@dataSetInternalID': '0',
            exchangeDirection: 'output',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(mockProcessExchangeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
          direction: 'output',
        }),
      );
      expect(mockProcessExchangeEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
        }),
      );
      expect(mockProcessExchangeDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
        }),
      );
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'exchange-edit' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'exchange-delete' })[0]);
  });

  it('notifies parent when tab changes', async () => {
    const propsWithoutShowRules = { ...defaultProps };
    delete propsWithoutShowRules.showRules;

    render(<ProcessForm {...propsWithoutShowRules} />);

    const validationTab = screen.getByRole('button', { name: 'Validation' });
    fireEvent.click(validationTab);

    await waitFor(() => {
      expect(defaultProps.onTabChange).toHaveBeenCalledWith('validation');
    });
  });

  it('renders the shared LCIA panel without exposing local calculation', () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='lciaResults'
        processId='process-1'
        processVersion='1.0.0'
      />,
    );

    expect(screen.getByTestId('process-lcia-results-panel')).toBeInTheDocument();
    expect(mockProcessLciaResultsPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRows: [],
        lang: 'en',
        processId: 'process-1',
        processVersion: '1.0.0',
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Calculate LCIA Results' }),
    ).not.toBeInTheDocument();
  });

  it('loads input exchanges, resolves units, and injects flow state metadata', async () => {
    mockGetProcessExchange.mockResolvedValueOnce({
      data: [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
          meanAmount: 1,
          resultingAmount: 1,
          dataDerivationTypeStatus: 'provided',
        },
      ],
      total: 1,
    });
    mockGetUnitData.mockResolvedValueOnce([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'provided',
      },
    ]);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({
      error: null,
      data: [
        {
          id: 'flow-1',
          version: '1.0',
          stateCode: 20,
          classification: 'class-a',
        },
      ],
    });

    render(<ProcessForm {...defaultProps} activeTabKey='exchanges' />);

    const [inputTable] = await getLatestExchangeTables();
    const result = await inputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetProcessExchange).toHaveBeenCalledWith(
      expect.any(Array),
      'Input',
      expect.objectContaining({ pageSize: 10, current: 1 }),
    );
    expect(mockGetUnitData).toHaveBeenCalledWith(
      'flow',
      expect.arrayContaining([
        expect.objectContaining({
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
        }),
      ]),
    );
    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledWith(
      [{ id: 'flow-1', version: '1.0' }],
      'en',
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        total: 1,
        data: [
          expect.objectContaining({
            referenceToFlowDataSetId: 'flow-1',
            referenceToFlowDataSetVersion: '1.0',
            stateCode: 20,
            classification: 'class-a',
          }),
        ],
      }),
    );
  });

  it('rejects older input and output exchange requests after newer requests start', async () => {
    const pendingInputFlowState = deferred<any>();
    const pendingOutputFlowState = deferred<any>();
    const exchangeRow = {
      referenceToFlowDataSetId: 'flow-1',
      referenceToFlowDataSetVersion: '1.0',
    };

    mockGetProcessExchange.mockResolvedValue({ data: [exchangeRow], total: 1 });
    mockGetUnitData.mockResolvedValue([exchangeRow]);
    mockGetFlowStateCodeByIdsAndVersions
      .mockReset()
      .mockReturnValueOnce(pendingInputFlowState.promise)
      .mockReturnValueOnce(pendingOutputFlowState.promise)
      .mockResolvedValue({ error: null, data: [] });

    render(<ProcessForm {...defaultProps} activeTabKey='exchanges' />);
    const [inputTable, outputTable] = await getLatestExchangeTables();

    const olderInputRequest = inputTable.request({ pageSize: 10, current: 1 });
    const olderOutputRequest = outputTable.request({ pageSize: 10, current: 1 });
    await waitFor(() => expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledTimes(2));

    await expect(inputTable.request({ pageSize: 10, current: 1 })).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    await expect(outputTable.request({ pageSize: 10, current: 1 })).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );

    pendingInputFlowState.resolve({ error: null, data: [] });
    pendingOutputFlowState.resolve({ error: null, data: [] });

    await expect(olderInputRequest).resolves.toEqual(
      expect.objectContaining({ data: [], success: false }),
    );
    await expect(olderOutputRequest).resolves.toEqual(
      expect.objectContaining({ data: [], success: false }),
    );
  });

  it('leaves exchange rows unchanged when flow state lookup fails', async () => {
    mockGetProcessExchange.mockResolvedValueOnce({
      data: [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
          classification: 'legacy-classification',
        },
      ],
      total: 1,
    });
    mockGetUnitData.mockResolvedValueOnce([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        classification: 'legacy-classification',
      },
    ]);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({
      error: new Error('lookup failed'),
      data: [
        {
          id: 'flow-1',
          version: '1.0',
          stateCode: 100,
          classification: 'new-classification',
        },
      ],
    });

    render(<ProcessForm {...defaultProps} activeTabKey='exchanges' />);

    const [, outputTable] = await getLatestExchangeTables();
    const result = await outputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetProcessExchange).toHaveBeenCalledWith(
      expect.any(Array),
      'Output',
      expect.objectContaining({ pageSize: 10, current: 1 }),
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        classification: 'legacy-classification',
      }),
    ]);
    expect(result.data[0].stateCode).toBeUndefined();
  });

  it('handles array and missing flow references for input exchanges, including empty classifications', async () => {
    mockGetProcessExchange.mockResolvedValueOnce({
      data: [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
          meanAmount: 1,
          resultingAmount: 1,
          dataDerivationTypeStatus: 'provided',
        },
      ],
      total: 1,
    });
    mockGetUnitData.mockResolvedValueOnce([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'provided',
      },
    ]);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({
      error: null,
      data: [
        {
          id: 'flow-1',
          version: '1.0',
          stateCode: 30,
        },
      ],
    });

    const exchangeDataSource = [
      {
        ...sampleExchange,
        referenceToFlowDataSet: [
          {
            '@refObjectId': 'flow-1',
            '@version': '1.0',
          },
        ],
      },
    ];

    const firstRender = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        exchangeDataSource={exchangeDataSource}
      />,
    );

    const [inputTable] = await getLatestExchangeTables();
    const result = await inputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledWith(
      [{ id: 'flow-1', version: '1.0' }],
      'en',
    );
    expect(result.data[0].classification).toBe('');

    firstRender.unmount();
    proTableInstances.length = 0;

    mockGetProcessExchange.mockResolvedValueOnce({ data: [], total: 0 });
    mockGetUnitData.mockResolvedValueOnce(undefined);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({ error: null, data: [] });

    const { unmount } = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        exchangeDataSource={[{ ...sampleExchange, referenceToFlowDataSet: undefined }]}
      />,
    );

    const [nextInputTable] = await getLatestExchangeTables();
    await nextInputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenLastCalledWith(
      [{ id: '', version: '' }],
      'en',
    );

    unmount();
  });

  it('passes updated LCIA rows through to the shared panel', () => {
    const initialResults = [
      {
        key: 'lcia-1',
        referenceToLCIAMethodDataSet: {
          '@version': '1.0',
        },
      },
    ];

    const { rerender } = render(
      <ProcessForm {...defaultProps} activeTabKey='lciaResults' lciaResults={initialResults} />,
    );

    expect(mockProcessLciaResultsPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseRows: [expect.objectContaining({ key: 'lcia-1' })],
      }),
    );

    const nextResults = [
      {
        key: 'lcia-2',
        referenceToLCIAMethodDataSet: {
          '@version': '2.0',
        },
      },
    ];

    rerender(
      <ProcessForm {...defaultProps} activeTabKey='lciaResults' lciaResults={nextResults} />,
    );

    expect(mockProcessLciaResultsPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseRows: [expect.objectContaining({ key: 'lcia-2' })],
      }),
    );
  });

  it('passes LCIA rows with missing reference quantity labels through to the shared panel', () => {
    mockGetLangText.mockImplementation((value: any) =>
      value === 'missing-quantity' ? '' : 'text',
    );

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='lciaResults'
        lciaResults={[
          {
            key: 'lcia-empty',
            referenceQuantityDesc: 'missing-quantity',
            referenceToLCIAMethodDataSet: {
              'common:shortDescription': 'available-short-description',
            },
          },
        ]}
      />,
    );

    expect(mockProcessLciaResultsPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseRows: [expect.objectContaining({ key: 'lcia-empty' })],
      }),
    );
  });

  it('validates and mutates modelling data-source references through the form list controls', async () => {
    const onData = jest.fn();
    const listKey = JSON.stringify([
      'modellingAndValidation',
      'dataSourcesTreatmentAndRepresentativeness',
      'referenceToDataSource',
    ]);

    const { rerender } = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        showRules
        onData={onData}
      />,
    );

    await waitFor(() => {
      expect(formListInstances[listKey]).toBeDefined();
    });

    await expect(formListInstances[listKey].rules[0].validator(null, [])).rejects.toThrow();

    fireEvent.click(
      screen.getByRole('button', {
        name: /add.*data source\(s\) used for this data set.*item/i,
      }),
    );

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
      expect(formListInstances[listKey].fieldCount).toBe(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'icon-button' })[0]);

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(2);
      expect(formListInstances[listKey].fieldCount).toBe(1);
    });

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='modellingAndValidation'
        showRules={false}
        onData={onData}
      />,
    );

    await waitFor(() => {
      expect(formListInstances[listKey].rules).toEqual([]);
    });
  });

  it('only applies the default source name in create mode', async () => {
    const { rerender } = render(
      <ProcessForm {...defaultProps} activeTabKey='administrativeInformation' formType='create' />,
    );

    await waitFor(() => {
      expect(mockSourceSelectForm).toHaveBeenCalledWith(
        expect.objectContaining({ defaultSourceName: 'ILCD format' }),
      );
    });

    mockSourceSelectForm.mockClear();

    rerender(
      <ProcessForm {...defaultProps} activeTabKey='administrativeInformation' formType='edit' />,
    );

    await waitFor(() => {
      expect(mockSourceSelectForm).toHaveBeenCalledWith(
        expect.objectContaining({ defaultSourceName: '' }),
      );
    });

    expect(
      within(
        screen.getByTestId(
          'form-item-administrativeInformation.publicationAndOwnership.common:dataSetVersion',
        ),
      ).getByRole('textbox'),
    ).toBeDisabled();
  });

  it('marks output rows with issues and enriches output exchanges with flow state metadata', async () => {
    mockRefCheckContextValue = {
      refCheckData: [{ id: 'flow-1', version: '1.0' }],
    };
    mockGetProcessExchange.mockResolvedValueOnce({
      data: [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '1.0',
          meanAmount: 1,
          resultingAmount: 1,
          dataDerivationTypeStatus: 'provided',
        },
      ],
      total: 1,
    });
    mockGetUnitData.mockResolvedValueOnce([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'provided',
      },
    ]);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({
      error: null,
      data: [
        {
          id: 'flow-1',
          version: '1.0',
          stateCode: 20,
        },
      ],
    });

    render(<ProcessForm {...defaultProps} activeTabKey='exchanges' showRules />);

    const [, outputTable] = await getLatestExchangeTables();
    const outputRowClassName = outputTable.rowClassName;
    expect(
      outputRowClassName({
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: '-',
        resultingAmount: '-',
        dataDerivationTypeStatus: '-',
      }),
    ).toBe('error-row');
    expect(
      outputRowClassName({
        referenceToFlowDataSetId: 'flow-2',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: '-',
        dataDerivationTypeStatus: 'provided',
      }),
    ).toBe('error-row');
    expect(
      outputRowClassName({
        referenceToFlowDataSetId: 'flow-2',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: '-',
      }),
    ).toBe('error-row');

    const result = await outputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetProcessExchange).toHaveBeenCalledWith(
      expect.any(Array),
      'Output',
      expect.objectContaining({ pageSize: 10, current: 1 }),
    );
    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledWith(
      [{ id: 'flow-1', version: '1.0' }],
      'en',
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        stateCode: 20,
        classification: '',
      }),
    ]);
  });

  it('falls back to empty output flow ids and unit rows when output references are missing', async () => {
    mockGetProcessExchange.mockResolvedValueOnce({ data: [], total: 0 });
    mockGetUnitData.mockResolvedValueOnce(undefined);
    mockGetFlowStateCodeByIdsAndVersions.mockResolvedValueOnce({ error: null, data: [] });

    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        exchangeDataSource={[{ ...sampleExchange, referenceToFlowDataSet: undefined }]}
      />,
    );

    const [, outputTable] = await getLatestExchangeTables();
    const result = await outputTable.request({ pageSize: 10, current: 1 });

    expect(mockGetFlowStateCodeByIdsAndVersions).toHaveBeenCalledWith(
      [{ id: '', version: '' }],
      'en',
    );
    expect(result.data).toEqual([]);
  });

  it('derives validation visibility from form names when sdk field paths are missing', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='validation'
        sdkValidationDetails={[
          {
            key: 'sdk-validation-form-name-only',
            formName: ['modellingAndValidation', 'validation', 'review'],
            fieldLabel: 'Review',
            presentation: 'field',
            suggestedFix: 'Validation review is required',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Fill in this field')).toBeInTheDocument();
    });
  });

  it('ignores malformed sdk details and exits field-sync effects when the form instance is missing', async () => {
    mockIntlMessageOverrides = {
      'pages.validationIssues.sdkDetail.suggestedFix.unknown': '',
    };

    await act(async () => {
      render(
        <ProcessForm
          {...defaultProps}
          formRef={{ current: null }}
          sdkValidationDetails={[
            {
              key: 'sdk-broken-root',
              fieldLabel: 'Broken root detail',
              presentation: 'field',
            },
            {
              key: 'sdk-broken-exchange',
              exchangeInternalId: 'row-0',
              fieldPath: 'exchange[#row-0].',
              suggestedFix: 'This should be ignored',
              tabName: 'exchanges',
            },
            {
              key: 'sdk-empty-root-message',
              formName: ['processInformation', 'time', 'common:referenceYear'],
              fieldLabel: 'Reference year',
              presentation: 'field',
              tabName: 'processInformation',
            },
            {
              key: 'sdk-empty-section-message',
              fieldPath: 'processInformation.dataSetInformation',
              presentation: 'section',
              tabName: 'processInformation',
            },
            {
              key: 'sdk-empty-validation-message',
              formName: ['modellingAndValidation', 'validation', 'review'],
              fieldLabel: 'Review',
              presentation: 'field',
              tabName: 'modellingAndValidation',
            },
          ]}
          sdkValidationFocus={{
            key: 'sdk-broken-focus',
            fieldLabel: 'Broken focus',
            presentation: 'field',
            tabName: 'processInformation',
          }}
        />,
      );
    });

    expect(screen.getAllByTestId('card').length).toBeGreaterThan(0);
    expect(screen.queryByText('This should be ignored')).not.toBeInTheDocument();
  });

  it('deduplicates root sdk field messages and marks focused output rows', async () => {
    const rootDetail = {
      key: 'sdk-root-reference-year-1',
      fieldKey: 'common:referenceYear',
      fieldLabel: 'Reference year',
      fieldPath: 'processInformation.time.common:referenceYear',
      formName: ['processInformation', 'time', 'common:referenceYear'],
      suggestedFix: 'Fill in the required value for this field.',
      tabName: 'processInformation',
      validationCode: 'required_missing',
    };
    const exchangeDetail = {
      key: 'sdk-output-row-focus',
      exchangeInternalId: '0',
      fieldKey: 'meanAmount',
      fieldLabel: 'Mean amount',
      fieldPath: 'exchange[#0].meanAmount',
      reasonMessage: 'Expected string but found undefined',
      tabName: 'exchanges',
      validationCode: 'required_missing',
    };

    const { rerender } = render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[rootDetail, { ...rootDetail, key: 'sdk-root-reference-year-2' }]}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Please input reference year')).toHaveLength(1);
    });

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='processInformation'
        showRules
        sdkValidationDetails={[rootDetail]}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Please input reference year')).toHaveLength(1);
    });

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='exchanges'
        sdkValidationDetails={[exchangeDetail]}
        sdkValidationFocus={exchangeDetail}
      />,
    );

    const [, outputTable] = await getLatestExchangeTables();
    const outputRowClassName = outputTable.rowClassName;

    expect(
      outputRowClassName({
        dataSetInternalID: '0',
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '1.0',
        meanAmount: 1,
        resultingAmount: 1,
        dataDerivationTypeStatus: 'provided',
      }),
    ).toBe('sdk-error-row sdk-focus-row');
  });

  it('falls back to an empty root error list when the form api returns undefined field errors', async () => {
    const sdkValidationDetail = {
      key: 'sdk-root-reference-year-invalid-type',
      fieldKey: 'common:referenceYear',
      fieldLabel: 'Reference year',
      fieldPath: 'processInformation.time.common:referenceYear',
      formName: ['processInformation', 'time', 'common:referenceYear'],
      suggestedFix: 'Enter this in the correct format.',
      tabName: 'processInformation',
      validationCode: 'invalid_type',
    };

    const { rerender } = render(
      <ProcessForm {...defaultProps} activeTabKey='processInformation' sdkValidationDetails={[]} />,
    );

    const originalGetFieldError = defaultProps.formRef.current.getFieldError;
    defaultProps.formRef.current.getFieldError = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockImplementation(originalGetFieldError);

    rerender(
      <ProcessForm
        {...defaultProps}
        activeTabKey='validation'
        sdkValidationDetails={[sdkValidationDetail]}
      />,
    );

    await waitFor(() => {
      expect(
        defaultProps.formRef.current.getFieldError([
          'processInformation',
          'time',
          'common:referenceYear',
        ]),
      ).toEqual(['Enter this in the correct format']);
    });
  });

  it('appends distinct root sdk messages and joins repeated section warnings with spaces', async () => {
    render(
      <ProcessForm
        {...defaultProps}
        activeTabKey='validation'
        sdkValidationDetails={[
          {
            key: 'sdk-root-reference-year-invalid-type',
            fieldKey: 'common:referenceYear',
            fieldLabel: 'Reference year',
            fieldPath: 'processInformation.time.common:referenceYear',
            formName: ['processInformation', 'time', 'common:referenceYear'],
            suggestedFix: 'Enter this in the correct format.',
            tabName: 'processInformation',
            validationCode: 'invalid_type',
          },
          {
            key: 'sdk-root-reference-year-invalid-union',
            fieldKey: 'common:referenceYear',
            fieldLabel: 'Reference year',
            fieldPath: 'processInformation.time.common:referenceYear',
            formName: ['processInformation', 'time', 'common:referenceYear'],
            suggestedFix: 'Complete this field as required.',
            tabName: 'processInformation',
            validationCode: 'invalid_union',
          },
          {
            key: 'sdk-validation-review-invalid-type',
            fieldKey: 'review',
            fieldLabel: 'Review',
            fieldPath: 'modellingAndValidation.validation.review',
            presentation: 'section',
            suggestedFix: 'Enter this in the correct format.',
            tabName: 'modellingAndValidation',
            validationCode: 'invalid_type',
          },
          {
            key: 'sdk-validation-review-invalid-union',
            fieldKey: 'review',
            fieldLabel: 'Review',
            fieldPath: 'modellingAndValidation.validation.review',
            presentation: 'section',
            suggestedFix: 'Complete this field as required.',
            tabName: 'modellingAndValidation',
            validationCode: 'invalid_union',
          },
          {
            key: 'sdk-empty-section-anchor',
            fieldKey: 'ignored',
            fieldPath: '',
            presentation: 'section',
            suggestedFix: 'Ignored section anchor fallback.',
            tabName: 'processInformation',
            validationCode: 'invalid_type',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(
        defaultProps.formRef.current.getFieldError([
          'processInformation',
          'time',
          'common:referenceYear',
        ]),
      ).toEqual(['Enter this in the correct format', 'Complete this field as required']);
    });

    expect(document.body.textContent).toContain(
      'Enter this in the correct format Complete this field as required',
    );
  });
});
