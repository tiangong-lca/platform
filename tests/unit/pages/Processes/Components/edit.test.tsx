// @ts-nocheck
import ProcessEdit, {
  normalizeQuantitativeReferenceSelection,
} from '@/pages/Processes/Components/edit';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let proFormApi: any = null;
let triggerValuesChange: ((_: any, values: any) => void) | null = null;
let latestProcessFormProps: any = null;
let latestRefsDrawerProps: any = null;
let mockValidateFields = jest.fn();
let mockLatestAISuggestionJson: any = {
  processDataSet: {
    processInformation: { name: 'AI suggested process' },
    exchanges: { exchange: [] },
  },
};

beforeEach(() => {
  proFormApi = null;
  triggerValuesChange = null;
  latestProcessFormProps = null;
  latestRefsDrawerProps = null;
  mockValidateFields = jest.fn(async () => proFormApi?.getFieldsValue?.() ?? {});
  mockLatestAISuggestionJson = {
    processDataSet: {
      processInformation: { name: 'AI suggested process' },
      exchanges: { exchange: [] },
    },
  };
});

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    locale: 'en-US',
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, unknown>) =>
      Object.entries(values ?? {}).reduce(
        (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
        defaultMessage ?? id,
      ),
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close-icon</span>,
  FormOutlined: () => <span>form-icon</span>,
  ProductOutlined: () => <span>product-icon</span>,
}));

jest.mock('@/components/AISuggestion', () => ({
  __esModule: true,
  default: ({ onClose, onLatestJsonChange }: any) => (
    <div>
      suggestion
      <button
        type='button'
        onClick={() => {
          onLatestJsonChange?.(mockLatestAISuggestionJson);
          onClose?.();
        }}
      >
        close-suggestion
      </button>
    </div>
  ),
}));

jest.mock('@/contexts/refCheckContext', () => ({
  __esModule: true,
  RefCheckContext: {
    Provider: ({ children }: any) => <div>{children}</div>,
  },
}));

const mockGetFlowDetail = jest.fn();

jest.mock('@/services/flows/api', () => ({
  __esModule: true,
  getFlowDetail: (...args: any[]) => mockGetFlowDetail(...args),
}));

const mockGenFlowFromData = jest.fn();
const mockGenFlowNameJson = jest.fn();

jest.mock('@/services/flows/util', () => ({
  __esModule: true,
  genFlowFromData: (...args: any[]) => mockGenFlowFromData(...args),
  genFlowNameJson: (...args: any[]) => mockGenFlowNameJson(...args),
}));

jest.mock('@/services/lciaMethods/data', () => ({
  __esModule: true,
}));

const mockUpdateProcess = jest.fn();
const mockGetProcessDetail = jest.fn();
const updateNodeCbMock = jest.fn();

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  updateProcess: (...args: any[]) => mockUpdateProcess(...args),
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
}));

const mockGenProcessFromData = jest.fn();
const mockGenProcessJsonOrdered = jest.fn();

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
  genProcessJsonOrdered: (...args: any[]) => mockGenProcessJsonOrdered(...args),
}));

jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getUserTeamId: jest.fn(() => Promise.resolve('team-1')),
}));

const mockCheckReferences = jest.fn();
const mockCheckVersions = jest.fn();
const mockDealProcress = jest.fn();
const mockGetAllRefObj = jest.fn();
const mockGetErrRefTab = jest.fn();
const mockBuildValidationIssues = jest.fn(() => []);
const mockEnrichValidationIssuesWithOwner = jest.fn(async (issues: any[]) => issues);
const mockMapValidationIssuesToRefCheckData = jest.fn(() => []);
const mockSubmitDatasetReview = jest.fn();
const mockValidateDatasetWithSdk = jest.fn(() => ({ success: true, issues: [] }));

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  ReffPath: function () {
    return {};
  },
  buildValidationIssues: (...args: any[]) => mockBuildValidationIssues(...args),
  checkReferences: (...args: any[]) => mockCheckReferences(...args),
  checkVersions: (...args: any[]) => mockCheckVersions(...args),
  collectValidationIssueRefTabNames: ({ refs, resolveTabName }: any) => {
    const tabNames: string[] = [];
    const tabNamesByKey = new Map<string, string[]>();

    refs.forEach((ref: any) => {
      const tabName = resolveTabName(ref);
      if (!tabName) return;
      if (!tabNames.includes(tabName)) tabNames.push(tabName);
      const key = `${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`;
      const refTabNames = tabNamesByKey.get(key) ?? [];
      if (!refTabNames.includes(tabName)) tabNamesByKey.set(key, [...refTabNames, tabName]);
    });

    return {
      getRefTabNames: (ref: any) =>
        tabNamesByKey.get(`${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`),
      tabNames,
    };
  },
  dealProcress: (...args: any[]) => mockDealProcress(...args),
  enrichValidationIssuesWithOwner: (...args: any[]) => mockEnrichValidationIssuesWithOwner(...args),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  getErrRefTab: (...args: any[]) => mockGetErrRefTab(...args),
  mapValidationIssuesToRefCheckData: (...args: any[]) =>
    mockMapValidationIssuesToRefCheckData(...args),
  submitDatasetReview: (...args: any[]) => mockSubmitDatasetReview(...args),
  validateDatasetWithSdk: (...args: any[]) => mockValidateDatasetWithSdk(...args),
}));

jest.mock('@/components/ValidationIssueModal', () => ({
  __esModule: true,
  showValidationIssueModal: jest.fn(),
}));

const mockGetRefsOfCurrentVersion = jest.fn();
const mockGetRefsOfNewVersion = jest.fn();
const mockUpdateRefsData = jest.fn();

jest.mock('@/pages/Utils/updateReference', () => ({
  __esModule: true,
  getRefsOfCurrentVersion: (...args: any[]) => mockGetRefsOfCurrentVersion(...args),
  getRefsOfNewVersion: (...args: any[]) => mockGetRefsOfNewVersion(...args),
  updateRefsData: (...args: any[]) => mockUpdateRefsData(...args),
}));

jest.mock('@/components/RefsOfNewVersionDrawer', () => ({
  __esModule: true,
  default: (props: any) => {
    latestRefsDrawerProps = props;
    if (!props.open) return null;
    return (
      <div data-testid='refs-drawer'>
        <button type='button' onClick={props.onKeep}>
          keep-current
        </button>
        <button type='button' onClick={() => props.onUpdate(props.dataSource)}>
          update-latest
        </button>
        <button type='button' onClick={props.onCancel}>
          cancel-refs
        </button>
      </div>
    );
  },
}));

const mockValidateEnhanced = jest.fn();

jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  __esModule: true,
  createProcess: jest.fn(() => ({
    validateEnhanced: (...args: any[]) => mockValidateEnhanced(...args),
  })),
}));

jest.mock('uuid', () => ({
  __esModule: true,
  v4: jest.fn(() => 'review-uuid'),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, onClick, disabled, icon }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {icon}
      {toText(children)}
    </button>
  );

  const Tooltip = ({ children }: any) => <>{children}</>;

  const Drawer = ({ open, title, extra, footer, children, onClose, getContainer }: any) => {
    if (!open) return null;
    getContainer?.();
    const label = toText(title) || 'drawer';
    return (
      <section role='dialog' aria-label={label}>
        <header>
          {extra}
          <button type='button' onClick={onClose}>
            close
          </button>
        </header>
        <div>{children}</div>
        <footer>{footer}</footer>
      </section>
    );
  };

  const Space = ({ children }: any) => <div>{children}</div>;
  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <div>{children}</div>;
  const FormComponent = ({ children }: any) => <div>{children}</div>;
  FormComponent.Item = ({ children }: any) => <div>{children}</div>;
  const Input = (props: any) => <input {...props} />;
  const Alert = ({ message, description }: any) => (
    <div role='alert'>
      <div>{toText(message)}</div>
      <div>{description}</div>
    </div>
  );

  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };

  const App = require('../../../../mocks/antdApp').createAntdAppMock({ message });
  return {
    __esModule: true,
    App,
    Button,
    Alert,
    Tooltip,
    Drawer,
    Space,
    Spin,
    Form: FormComponent,
    Input,
    message,
  };
});

const { message: mockAntdMessage } = jest.requireMock('antd');
const { showValidationIssueModal: mockShowValidationIssueModal } = jest.requireMock(
  '@/components/ValidationIssueModal',
);
const { showValidationIssueModal } = jest.requireMock('@/components/ValidationIssueModal');

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const ProForm = ({
    formRef,
    initialValues = {},
    onFinish,
    onValuesChange,
    submitter,
    children,
  }: any) => {
    const valuesRef = React.useRef({ ...initialValues });

    React.useLayoutEffect(() => {
      const api = {
        submit: async () => onFinish?.(),
        resetFields: () => {
          valuesRef.current = { ...initialValues };
        },
        validateFields: (...args: any[]) => mockValidateFields(...args),
        getFieldsValue: () => ({ ...valuesRef.current }),
        setFieldsValue: (next: any) => {
          valuesRef.current = { ...valuesRef.current, ...next };
        },
        setFieldValue: (name: any, value: any) => {
          if (Array.isArray(name)) {
            const next = { ...valuesRef.current };
            let cursor = next;
            for (let i = 0; i < name.length - 1; i += 1) {
              const key = name[i];
              cursor[key] = { ...(cursor[key] ?? {}) };
              cursor = cursor[key];
            }
            cursor[name[name.length - 1]] = value;
            valuesRef.current = next;
          } else {
            valuesRef.current = { ...valuesRef.current, [name]: value };
          }
        },
        getFieldValue: (name: any) => {
          if (Array.isArray(name)) {
            return name.reduce((acc, key) => (acc ? acc[key] : undefined), valuesRef.current);
          }
          return valuesRef.current[name];
        },
      };
      if (formRef) {
        formRef.current = api;
      }
      proFormApi = api;
    });

    React.useEffect(() => {
      triggerValuesChange = onValuesChange;
    }, [onValuesChange]);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onFinish?.();
        }}
      >
        {typeof children === 'function' ? children(valuesRef.current) : children}
        {submitter?.render?.() ?? null}
      </form>
    );
  };

  return {
    __esModule: true,
    ProForm,
  };
});

jest.mock('@/pages/Processes/Components/form', () => ({
  __esModule: true,
  ProcessForm: (props: any) => {
    latestProcessFormProps = props;
    return <div data-testid='process-form'>form</div>;
  },
}));

describe('ProcessEdit component', () => {
  const actionRef = { current: { reload: jest.fn() } };
  const setViewDrawerVisible = jest.fn();
  const baseProps = {
    id: 'process-1',
    version: '1.0.0',
    lang: 'en',
    buttonType: 'icon',
    actionRef,
    setViewDrawerVisible,
    updateNodeCb: updateNodeCbMock,
    showRules: false,
  };

  const processDataset = {
    processInformation: { name: 'Existing process' },
    exchanges: {
      exchange: [
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
        },
      ],
    },
  };

  const createProcessDetailResponse = () => ({
    data: {
      id: 'process-1',
      version: '1.0.0',
      json: { processDataSet: processDataset },
      teamId: 'team-1',
      stateCode: 10,
      ruleVerification: false,
      state_code: 10,
      rule_verification: false,
    },
  });

  const createSyntheticReviewDraft = () => {
    const realUtil = jest.requireActual('@/services/processes/util');
    const formData = {
      processInformation: {
        dataSetInformation: {
          name: {
            baseName: [
              { '@xml:lang': 'en', '#text': 'Synthetic filter treatment' },
              { '@xml:lang': 'zh', '#text': '合成滤芯处理' },
            ],
          },
        },
      },
      modellingAndValidation: {
        dataSourcesTreatmentAndRepresentativeness: {
          annualSupplyOrProductionVolume: [
            { '@xml:lang': 'en', '#text': '200 items/year; fixed example, actual supply unknown' },
            { '@xml:lang': 'zh', '#text': '200 件/年；固定示例，实际供应量未知' },
          ],
          useAdviceForDataSet: [
            { '@xml:lang': 'en', '#text': 'Screening only; missing emissions remain unknown.' },
            { '@xml:lang': 'zh', '#text': '仅限筛查；缺失排放仍为未知。' },
          ],
        },
      },
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            meanAmount: '1',
            referenceToFlowDataSet: {
              '@type': 'flow data set',
              '@refObjectId': 'synthetic-flow',
              '@version': '01.00.000',
              'common:shortDescription': [
                { '@xml:lang': 'en', '#text': 'Used filter' },
                { '@xml:lang': 'zh', '#text': '废滤芯' },
              ],
            },
          },
        ],
      },
    };
    const processDataSet = realUtil.genProcessJsonOrdered('process-1', formData, {
      preserveAnnualSupplyVolumeText: true,
    }).processDataSet;

    mockGenProcessFromData.mockReturnValue(formData);
    mockGenProcessJsonOrdered.mockImplementation(realUtil.genProcessJsonOrdered);
    mockGetProcessDetail.mockResolvedValue({
      data: {
        id: 'process-1',
        version: '1.0.0',
        json: { processDataSet },
        stateCode: 10,
        ruleVerification: true,
        teamId: 'team-1',
      },
    });
    return processDataSet;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildValidationIssues.mockReturnValue([]);
    mockEnrichValidationIssuesWithOwner.mockImplementation(async (issues: any[]) => issues);
    actionRef.current.reload.mockClear();
    mockGetFlowDetail.mockResolvedValue({
      data: { json: { flowDataSet: {} }, version: '1.0.1' },
    });
    mockGenFlowFromData.mockReturnValue({
      flowInformation: {
        dataSetInformation: {
          name: { baseName: [{ '@xml:lang': 'en', '#text': 'Updated flow' }] },
        },
      },
    });
    mockGenFlowNameJson.mockReturnValue([{ '@xml:lang': 'en', '#text': 'Updated flow' }]);
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: { processDataSet: processDataset },
          state_code: 10,
          rule_verification: true,
        },
      ],
    });
    mockGetProcessDetail.mockResolvedValue({
      data: {
        id: 'process-1',
        version: '1.0.0',
        json: { processDataSet: processDataset },
        teamId: 'team-1',
        stateCode: 10,
        ruleVerification: false,
        state_code: 10,
        rule_verification: false,
      },
    });
    mockGenProcessFromData.mockReturnValue({ ...processDataset });
    mockGenProcessJsonOrdered.mockReset();
    mockGenProcessJsonOrdered.mockImplementation((_processId, processDetail) => ({
      processDataSet: processDetail,
    }));
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    mockCheckVersions.mockResolvedValue(undefined);
    mockDealProcress.mockImplementation(() => undefined);
    mockGetAllRefObj.mockReturnValue([]);
    mockGetErrRefTab.mockReturnValue('');
    mockMapValidationIssuesToRefCheckData.mockReturnValue([]);
    mockSubmitDatasetReview.mockResolvedValue({
      data: [{ review: { id: 'review-1' } }],
      error: null,
    });
    mockGetRefsOfCurrentVersion.mockResolvedValue({ oldRefs: [] });
    mockGetRefsOfNewVersion.mockResolvedValue({ newRefs: [], oldRefs: [] });
    mockUpdateRefsData.mockImplementation((data: any) => data);
    mockValidateDatasetWithSdk.mockReturnValue({ success: true, issues: [] });
    mockValidateEnhanced.mockReturnValue({ success: true });
  });

  it('loads process data and submits updates successfully', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0');
    });

    expect(latestProcessFormProps).toBeTruthy();
    expect(latestProcessFormProps.formType).toBe('edit');

    const currentValues = proFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      proFormApi?.setFieldsValue({ processInformation: { name: 'Updated name' } });
      triggerValuesChange?.({}, { ...currentValues, processInformation: { name: 'Updated name' } });
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    await waitFor(() =>
      expect(mockUpdateProcess).toHaveBeenCalledWith('process-1', '1.0.0', expect.any(Object)),
    );
    expect(mockAntdMessage.success).toHaveBeenCalled();
    expect(actionRef.current.reload).toHaveBeenCalled();
    expect(setViewDrawerVisible).toHaveBeenCalledWith(false);
    expect(updateNodeCbMock).toHaveBeenCalledWith({
      '@refObjectId': 'process-1',
      '@version': '1.0.0',
      '@type': 'process data set',
    });
  });

  it('saves successfully when updateNodeCb falls back to the default no-op handler', async () => {
    const propsWithoutNodeCb = { ...baseProps };
    delete propsWithoutNodeCb.updateNodeCb;

    render(<ProcessEdit {...propsWithoutNodeCb} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));
    await waitFor(() => expect(latestProcessFormProps).toBeTruthy());

    await act(async () => {
      await proFormApi?.submit();
    });

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Saved successfully!');
  });

  it('handles validation-tab sync callbacks before saving', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('validation');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('validation'));
    await act(async () => {
      proFormApi?.setFieldValue(['modellingAndValidation', 'validation'], {
        review: [{ id: 'validation-review' }],
      });
      await latestProcessFormProps.onData();
    });
    await act(async () => {});
    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalled();
  });

  it('handles compliance-tab sync callbacks before saving', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('complianceDeclarations');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('complianceDeclarations'));
    await act(async () => {
      proFormApi?.setFieldValue(['modellingAndValidation', 'complianceDeclarations'], {
        compliance: [{ id: 'compliance-review' }],
      });
      await latestProcessFormProps.onData();
    });
    await act(async () => {});
    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalled();
  });

  it('handles validation-tab value changes through the form change handler', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('validation');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('validation'));

    await act(async () => {
      triggerValuesChange?.(
        {},
        {
          modellingAndValidation: {
            validation: { review: [{ id: 'validation-review' }] },
          },
        },
      );
    });

    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('handles compliance-tab value changes through the form change handler', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('complianceDeclarations');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('complianceDeclarations'));

    await act(async () => {
      triggerValuesChange?.(
        {},
        {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [{ id: 'compliance-review' }] },
          },
        },
      );
    });

    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('handles generic-tab value changes through the form change handler', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('technology');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('technology'));

    await act(async () => {
      triggerValuesChange?.({}, {});
    });

    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('handles generic-tab sync callbacks with empty values', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onTabChange('technology');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('technology'));
    await act(async () => {
      await latestProcessFormProps.onData();
    });
    await act(async () => {});
    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalled();
  });

  it('creates exchange rows through the process-form callback with generated internal ids', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeDataCreate({
        exchangeDirection: 'INPUT',
        quantitativeReference: false,
      });
    });
    await waitFor(() => expect(latestProcessFormProps.exchangeDataSource).toHaveLength(2));
    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalledWith(
      'process-1',
      '1.0.0',
      expect.objectContaining({
        exchanges: {
          exchange: expect.arrayContaining([
            expect.objectContaining({
              '@dataSetInternalID': '1',
              exchangeDirection: 'INPUT',
            }),
          ]),
        },
      }),
    );
  });

  it('normalizes newly created quantitative-reference exchanges so only one row remains selected', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeDataCreate({
        exchangeDirection: 'INPUT',
        quantitativeReference: true,
      });
    });

    await waitFor(() =>
      expect(latestProcessFormProps.exchangeDataSource).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            '@dataSetInternalID': '0',
            quantitativeReference: false,
          }),
          expect.objectContaining({
            '@dataSetInternalID': '1',
            quantitativeReference: true,
          }),
        ]),
      ),
    );
  });

  it('blocks submission when allocated fractions exceed 100%', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockGetProcessDetail).toHaveBeenCalled();
    });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          allocations: { allocation: { '@allocatedFraction': '150%' } },
        },
      ]);
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'The total allocated fraction for outputs cannot exceed 100%. Current total: 150%.',
    );
  });

  it('falls back to zero when an allocated fraction string cannot be derived', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockGetProcessDetail).toHaveBeenCalled();
    });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          allocations: {
            allocation: {
              '@allocatedFraction': {
                toString: null,
              },
            },
          },
        },
      ]);
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalled();
  });

  it('opens automatically when autoOpen is enabled', async () => {
    render(<ProcessEdit {...baseProps} autoOpen />);

    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
    expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0');
  });

  it('runs a silent automatic data check once after loading when autoCheckRequired is enabled', async () => {
    render(<ProcessEdit {...baseProps} autoOpen autoCheckRequired />);

    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledTimes(1));
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Data validation passed.');
    expect(mockAntdMessage.error).not.toHaveBeenCalledWith(
      'Data check failed, please check the data!',
    );
  });

  it('auto-fills a 100% allocation for the quantitative reference output when none is provided', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockGetProcessDetail).toHaveBeenCalled();
    });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
        },
      ]);
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockUpdateProcess).toHaveBeenCalledWith(
      'process-1',
      '1.0.0',
      expect.objectContaining({
        exchanges: {
          exchange: [
            expect.objectContaining({
              allocations: {
                allocation: {
                  '@allocatedFraction': '100%',
                },
              },
            }),
          ],
        },
      }),
    );
  });

  it('applies the latest AI suggestion payload when the suggestion panel closes', async () => {
    mockLatestAISuggestionJson = {
      processDataSet: {
        processInformation: { name: 'AI applied process' },
        exchanges: { exchange: [] },
      },
    };
    mockGenProcessFromData.mockImplementation((payload: any) => {
      if (payload === mockLatestAISuggestionJson.processDataSet) {
        return {
          processInformation: { name: 'AI applied process' },
          exchanges: { exchange: [] },
        };
      }
      return { ...processDataset };
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'close-suggestion' }));

    expect(proFormApi?.getFieldsValue()).toEqual(
      expect.objectContaining({
        id: 'process-1',
        processInformation: { name: 'AI applied process' },
      }),
    );
  });

  it('falls back to an empty AI suggestion payload when no latest json was stored', async () => {
    mockLatestAISuggestionJson = undefined;
    mockGenProcessFromData.mockImplementation((payload: any) => {
      if (payload && Object.keys(payload).length > 0) {
        return { ...processDataset };
      }
      return {
        exchanges: { exchange: [] },
      };
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'close-suggestion' }));

    expect(proFormApi?.getFieldsValue()).toEqual(
      expect.objectContaining({
        id: 'process-1',
      }),
    );
  });

  it('falls back to an empty exchange list when an empty AI suggestion payload is applied', async () => {
    mockLatestAISuggestionJson = undefined;
    mockGenProcessFromData.mockImplementation((payload: any) => {
      if (payload && Object.keys(payload).length > 0) {
        return { ...processDataset };
      }
      return {};
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'close-suggestion' }));

    expect(proFormApi?.getFieldsValue()).toEqual(
      expect.objectContaining({
        id: 'process-1',
      }),
    );
  });

  it('falls back to an empty saved process dataset when data-check refresh returns no process json', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          state_code: 10,
          rule_verification: true,
        },
      ],
    });
    mockGenProcessFromData.mockImplementation((payload: any) => {
      if (payload && Object.keys(payload).length > 0) {
        return { ...processDataset };
      }
      return {};
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
  });

  it('opens the refs drawer when newer references exist and keeps the current versions on demand', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'flow-1', version: '2.0.0' }],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-1',
            '@version': '1.0.0',
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();
    expect(latestRefsDrawerProps.dataSource).toEqual([{ id: 'flow-1', version: '2.0.0' }]);

    fireEvent.click(screen.getByRole('button', { name: 'keep-current' }));

    await waitFor(() =>
      expect(mockUpdateRefsData).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'process-1' }),
        [{ id: 'flow-1', version: '1.0.0' }],
        false,
      ),
    );
    expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-1', '1.0.0');
  });

  it('keeps exchange references unchanged when the latest flow lookup returns no data', async () => {
    mockGetFlowDetail.mockResolvedValueOnce({});
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-1',
            '@version': '1.0.0',
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    await waitFor(() => expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-1', '1.0.0'));
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('resolves array-based flow references and filters invalid short descriptions during reference updates', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });
    mockGetFlowDetail.mockResolvedValueOnce({
      data: { json: {} },
      version: undefined,
    });
    mockGenFlowFromData.mockReturnValue({
      flowInformation: {
        dataSetInformation: {
          name: { baseName: [] },
        },
      },
    });
    mockGenFlowNameJson.mockReturnValue([
      { '@xml:lang': 'en' },
      { '#text': 'missing-lang' },
      { '@xml:lang': 'en', '#text': 'Valid flow name' },
    ]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: [
            {
              '@refObjectId': 'flow-1',
              '@version': '1.0.0',
            },
          ],
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    await waitFor(() => expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-1', '1.0.0'));
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('falls back to an empty short-description list when flow names are unavailable during reference updates', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });
    mockGetFlowDetail.mockResolvedValueOnce({
      data: { json: {} },
      version: '1.0.1',
    });
    mockGenFlowFromData.mockReturnValue({
      flowInformation: {
        dataSetInformation: {
          name: { baseName: [] },
        },
      },
    });
    mockGenFlowNameJson.mockReturnValue(undefined);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-1',
            '@version': '1.0.0',
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    await waitFor(() => expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-1', '1.0.0'));
  });

  it('updates references inline when no newer versions exist', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-1',
            '@version': '1.0.0',
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    await waitFor(() => expect(mockUpdateRefsData).toHaveBeenCalled());
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
    expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-1', '1.0.0');
  });

  it('shows the open-data error when save fails with state_code 100', async () => {
    mockUpdateProcess.mockResolvedValue({
      error: { state_code: 100, message: 'open data' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('This data is open data, save failed');
    expect(actionRef.current.reload).not.toHaveBeenCalled();
  });

  it('shows the under-review error when save fails with state_code 20', async () => {
    mockUpdateProcess.mockResolvedValue({
      error: { state_code: 20, message: 'under review' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('Data is under review, save failed');
    expect(actionRef.current.reload).not.toHaveBeenCalled();
  });

  it('shows the backend message when save fails with a generic error', async () => {
    mockUpdateProcess.mockResolvedValue({
      error: { message: 'unexpected save error' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('unexpected save error');
  });

  it('returns early from save and reference actions until the initial process detail has loaded', async () => {
    let resolveProcessDetail: (value: any) => void = () => undefined;
    mockGetProcessDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveProcessDetail = resolve;
      }),
    );

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await latestRefsDrawerProps.onUpdate([{ id: 'flow-1', version: '2.0.0' }]);
      await latestRefsDrawerProps.onKeep();
    });

    expect(mockGetRefsOfNewVersion).not.toHaveBeenCalled();
    expect(mockGetRefsOfCurrentVersion).not.toHaveBeenCalled();
    expect(mockUpdateRefsData).not.toHaveBeenCalled();
    expect(mockUpdateProcess).not.toHaveBeenCalled();

    await act(async () => {
      resolveProcessDetail(createProcessDetailResponse());
    });
  });

  it('falls back to an empty form payload when the form api returns undefined', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));
    await waitFor(() => expect(latestProcessFormProps).toBeTruthy());

    const originalGetFieldsValue = proFormApi.getFieldsValue;
    proFormApi.getFieldsValue = jest.fn(() => undefined);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
    proFormApi.getFieldsValue = originalGetFieldsValue;
  });

  it('does not refresh or remove exchange references during an ordinary save', async () => {
    mockUpdateRefsData.mockReturnValue(undefined);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() =>
      expect(mockUpdateProcess).toHaveBeenCalledWith(
        'process-1',
        '1.0.0',
        expect.objectContaining({
          exchanges: {
            exchange: [
              expect.objectContaining({ '@dataSetInternalID': '0', quantitativeReference: true }),
            ],
          },
        }),
      ),
    );
    expect(mockGetRefsOfCurrentVersion).not.toHaveBeenCalled();
    expect(mockUpdateRefsData).not.toHaveBeenCalled();
  });

  it('blocks data check when the updated process is already under review', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: { processDataSet: processDataset },
          state_code: 30,
          rule_verification: true,
        },
      ],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith(
        'This data set is under review and cannot be validated',
      ),
    );
  });

  it('reviews the persisted draft without invoking a background save', async () => {
    mockUpdateProcess.mockResolvedValue({
      error: { message: 'save failed before review' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() => expect(mockSubmitDatasetReview).toHaveBeenCalled());
    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockValidateDatasetWithSdk).toHaveBeenCalled();
  });

  it('sends unchanged authored annual text and reference descriptions in a synthetic save payload', async () => {
    const processDataSet = createSyntheticReviewDraft();
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
    const savedFormData = mockUpdateProcess.mock.calls[0][2];
    expect(
      savedFormData.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    ).toEqual(
      processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    );
    expect(
      savedFormData.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .useAdviceForDataSet,
    ).toEqual(
      processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .useAdviceForDataSet,
    );
    expect(
      savedFormData.exchanges.exchange[0].referenceToFlowDataSet['common:shortDescription'],
    ).toEqual(
      processDataSet.exchanges.exchange[0].referenceToFlowDataSet['common:shortDescription'],
    );
    expect(mockGetRefsOfCurrentVersion).not.toHaveBeenCalled();
    expect(mockGetFlowDetail).not.toHaveBeenCalled();
  });

  it('validates a fresh synthetic saved draft without posting a save payload before review', async () => {
    const processDataSet = createSyntheticReviewDraft();
    const originalJson = JSON.stringify(processDataSet);
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() => expect(mockSubmitDatasetReview).toHaveBeenCalled());
    const checkedJson = mockValidateDatasetWithSdk.mock.calls.at(-1)?.[1]?.processDataSet;
    expect(
      checkedJson.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    ).toEqual(
      processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    );
    expect(
      checkedJson.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .useAdviceForDataSet,
    ).toEqual(
      processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .useAdviceForDataSet,
    );
    expect(
      checkedJson.exchanges.exchange[0].referenceToFlowDataSet['common:shortDescription'],
    ).toEqual(
      processDataSet.exchanges.exchange[0].referenceToFlowDataSet['common:shortDescription'],
    );
    expect(JSON.stringify(processDataSet)).toBe(originalJson);
    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('blocks review when the form has unsaved changes instead of submitting the old draft', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    await act(async () => {
      triggerValuesChange?.(
        { processInformation: { dataSetInformation: { name: 'Changed process' } } },
        { processInformation: { dataSetInformation: { name: 'Changed process' } } },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.warning).toHaveBeenCalledWith(
        'Save your changes before submitting for review.',
      ),
    );
    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
  });

  it('blocks review when the form changes while saved-draft validation is pending', async () => {
    let resolveReferences!: (value: unknown) => void;
    const pendingReferences = new Promise((resolve) => {
      resolveReferences = resolve;
    });
    mockCheckReferences.mockReturnValueOnce(pendingReferences);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));
    await waitFor(() => expect(mockCheckReferences).toHaveBeenCalled());

    await act(async () => {
      triggerValuesChange?.(
        { processInformation: { dataSetInformation: { name: 'Changed process' } } },
        { processInformation: { dataSetInformation: { name: 'Changed process' } } },
      );
      resolveReferences({ findProblemNodes: () => [] });
      await pendingReferences;
    });

    await waitFor(() =>
      expect(mockAntdMessage.warning).toHaveBeenCalledWith(
        'Save your changes before submitting for review.',
      ),
    );
    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
  });

  it('continues data-check when the saved process shape is incomplete', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: { processDataSet: processDataset },
          rule_verification: true,
        },
      ],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
    expect(mockValidateDatasetWithSdk).toHaveBeenCalled();
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Data validation passed.');
  });

  it('submits after the saved process and its recursive reference chain pass validation', async () => {
    const findProblemNodes = jest.fn(() => []);
    mockGetAllRefObj.mockReturnValueOnce([
      {
        '@refObjectId': 'flow-1',
        '@version': '1.0.0',
        '@type': 'flow data set',
      },
    ]);
    mockCheckReferences.mockResolvedValueOnce({ findProblemNodes });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockSubmitDatasetReview).toHaveBeenCalledWith('processes', 'process-1', '1.0.0'),
    );
    expect(mockDealProcress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'process-1', version: '1.0.0' }),
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
    );
    expect(mockGetAllRefObj).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'process-1', version: '1.0.0' }),
    );
    expect(mockCheckReferences).toHaveBeenCalledWith(
      [
        {
          '@refObjectId': 'flow-1',
          '@version': '1.0.0',
          '@type': 'flow data set',
        },
      ],
      expect.any(Map),
      'team-1',
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      expect.any(Object),
      expect.any(Set),
      {
        rootRef: {
          '@refObjectId': 'process-1',
          '@version': '1.0.0',
          '@type': 'process data set',
        },
      },
    );
    expect(mockCheckVersions).toHaveBeenCalledWith(expect.any(Set), expect.any(Object));
    expect(findProblemNodes).toHaveBeenCalledWith('review');
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Review submitted successfully');
  });

  it('does not reload or close while the review request is pending', async () => {
    let resolveSubmit!: (value: unknown) => void;
    const pendingSubmit = new Promise((resolve) => {
      resolveSubmit = resolve;
    });
    mockSubmitDatasetReview.mockReturnValueOnce(pendingSubmit);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() => expect(mockSubmitDatasetReview).toHaveBeenCalled());
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('spin')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
    expect(setViewDrawerVisible).not.toHaveBeenCalledWith(false);

    await act(async () => {
      resolveSubmit({ data: [{ review: { id: 'review-1' } }], error: null });
      await pendingSubmit;
    });

    await waitFor(() => expect(actionRef.current.reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Edit process' })).not.toBeInTheDocument();
  });

  it('blocks review submission when the recursive reference chain contains a missing reference', async () => {
    const missingRef = {
      '@refObjectId': 'missing-flow',
      '@version': '1.0.0',
      '@type': 'flow data set',
    };
    mockCheckReferences.mockImplementationOnce(async (...args: any[]) => {
      args[6].push(missingRef);
      return { findProblemNodes: () => [] };
    });
    mockBuildValidationIssues.mockReturnValueOnce([{ id: 'missing-reference' }]);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ key: 'missing-reference' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockShowValidationIssueModal).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: [{ id: 'missing-reference' }],
          title: {
            id: 'pages.validationIssues.modal.reviewTitle',
            defaultMessage: 'Review submission blocked',
          },
        }),
      ),
    );
    expect(mockBuildValidationIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionFrom: 'review',
        nonExistentRef: [missingRef],
      }),
    );
    expect(mockCheckVersions).toHaveBeenCalled();
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
  });

  it('keeps the drawer open when direct review submission fails', async () => {
    mockSubmitDatasetReview.mockResolvedValueOnce({
      data: null,
      error: { message: 'review submission failed' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('review submission failed'),
    );
    expect(screen.getByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
    expect(setViewDrawerVisible).not.toHaveBeenCalledWith(false);
    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('does not submit a saved process that entered review after the editor opened', async () => {
    mockGetProcessDetail
      .mockResolvedValueOnce(createProcessDetailResponse())
      .mockResolvedValueOnce({
        data: { ...createProcessDetailResponse().data, stateCode: 20 },
      });

    render(<ProcessEdit {...baseProps} />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('Review submission failed'),
    );
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('uses the direct-submit fallback when the server omits an error message', async () => {
    mockSubmitDatasetReview.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('Review submission failed'),
    );
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
  });
  it('stops review submission when the saved process shape is incomplete', async () => {
    mockGetProcessDetail
      .mockResolvedValueOnce(createProcessDetailResponse())
      .mockResolvedValueOnce({ data: { id: 'process-1', version: '1.0.0', stateCode: 10 } });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('Review submission failed'),
    );
    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
  });

  it('applies the latest reference versions when the user confirms the update drawer', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'flow-1', version: '2.0.0' }],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-1',
            '@version': '1.0.0',
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'update-latest' }));

    await waitFor(() =>
      expect(mockUpdateRefsData).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'process-1' }),
        [{ id: 'flow-1', version: '2.0.0' }],
        true,
      ),
    );
  });

  it('closes the refs drawer when the user cancels the reference update flow', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'flow-1', version: '2.0.0' }],
      oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'cancel-refs' }));
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('hides the review action when hideReviewButton is enabled', async () => {
    render(<ProcessEdit {...baseProps} hideReviewButton />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    expect(screen.queryByRole('button', { name: 'Submit for Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Reference' })).toBeInTheDocument();
  });

  it('closes the drawer when cancel is clicked', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit process' })).not.toBeInTheDocument(),
    );
  });

  it('closes the drawer from the icon button and drawer onClose handler', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-icon' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit process' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit process' })).not.toBeInTheDocument(),
    );
  });

  it('continues data-check after save when the intermediate save result has an error', async () => {
    mockUpdateProcess.mockResolvedValue({
      error: { message: 'save before check failed' },
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('save before check failed'),
    );
    expect(mockValidateDatasetWithSdk).toHaveBeenCalled();
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Data validation passed.');
  });

  it('shows a validation error when data check runs without exchanges', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: { processDataSet: { processInformation: { name: 'Existing process' } } },
          state_code: 10,
          rule_verification: true,
        },
      ],
    });
    mockGenProcessFromData.mockImplementation(() => ({
      processInformation: { name: 'Existing process' },
      exchanges: {},
    }));

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('Add at least one exchange'),
    );

    expect(latestProcessFormProps.sdkValidationDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'exchanges.requiredSummary',
          key: 'exchanges:required:section',
          presentation: 'section',
          tabName: 'exchanges',
          validationCode: 'exchanges_required',
        }),
      ]),
    );
  });

  it('dismisses changed sdk field messages for the current process validation run', async () => {
    mockGenProcessJsonOrdered.mockImplementation((_id, processDetail) => ({
      processDataSet: processDetail,
    }));
    mockValidateDatasetWithSdk
      .mockReturnValueOnce({
        success: false,
        issues: [
          {
            code: 'required_missing',
            message: 'Required value is missing.',
            path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
          },
        ],
      })
      .mockReturnValueOnce({ success: true, issues: [] });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => {
      expect(latestProcessFormProps.sdkValidationDetails.length).toBeGreaterThan(0);
    });
    expect(latestProcessFormProps.sdkValidationDismissedFieldKeys.size).toBe(0);

    await act(async () => {
      await triggerValuesChange?.(
        {
          processInformation: {
            time: {
              'common:referenceYear': 2026,
            },
          },
        },
        {
          processInformation: {
            time: {
              'common:referenceYear': 2026,
            },
          },
        },
      );
    });

    await waitFor(() => {
      expect(Array.from(latestProcessFormProps.sdkValidationDismissedFieldKeys)).toContain(
        'processInformation.time.common:referenceYear',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => {
      expect(latestProcessFormProps.sdkValidationDismissedFieldKeys.size).toBe(0);
    });
  });

  it('shows a validation error when exchanges do not contain exactly one quantitative reference', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: {
            processDataSet: {
              processInformation: { name: 'Existing process' },
              exchanges: {
                exchange: [
                  { exchangeDirection: 'OUTPUT', quantitativeReference: true },
                  { exchangeDirection: 'OUTPUT', quantitativeReference: true },
                ],
              },
            },
          },
          state_code: 10,
          rule_verification: true,
        },
      ],
    });
    mockGenProcessFromData.mockImplementation(() => ({
      processInformation: { name: 'Existing process' },
      exchanges: {
        exchange: [
          { exchangeDirection: 'OUTPUT', quantitativeReference: true },
          { exchangeDirection: 'OUTPUT', quantitativeReference: true },
        ],
      },
    }));
    mockGenProcessJsonOrdered.mockImplementation((_id, processDetail) => ({
      processDataSet: processDetail,
    }));

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith(
        'Select exactly one item as the quantitative reference.',
      ),
    );

    expect(latestProcessFormProps.sdkValidationDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'exchanges.quantitativeReferenceSummary',
          key: 'exchanges:quantitative-reference-count:section',
          presentation: 'section',
          tabName: 'exchanges',
          validationCode: 'quantitative_reference_count_invalid',
        }),
      ]),
    );

    const highlightOnlyDetails = latestProcessFormProps.sdkValidationDetails.filter(
      (detail: any) => detail.presentation === 'highlight-only',
    );
    expect(highlightOnlyDetails).toHaveLength(2);
    expect(highlightOnlyDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exchangeInternalId: expect.any(String),
          fieldPath: expect.stringMatching(/^exchange\[#.+\]\.quantitativeReference$/),
          tabName: 'exchanges',
          validationCode: 'quantitative_reference_count_invalid',
        }),
      ]),
    );
  });

  it('surfaces current-process under-review version conflicts during data check', async () => {
    const validationIssues = [{ type: 'current-process-under-review' }];
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'process-1',
          '@version': '1.0.0',
          underReviewVersion: '2.0.0',
        },
      ],
    });
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['processDataSet', 'processInformation', 'quantitativeReference'] }],
    });
    mockBuildValidationIssues.mockImplementationOnce(({ sdkInvalidTabNames }: any) => {
      expect(sdkInvalidTabNames).toContain('exchanges');
      return validationIssues;
    });
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ id: 'ref-check-1' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(showValidationIssueModal).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: validationIssues,
          title: {
            id: 'pages.validationIssues.modal.checkDataTitle',
            defaultMessage: 'Data validation issues',
          },
        }),
      ),
    );
  });

  it('surfaces current-process published-version conflicts in the validation modal during data check', async () => {
    const validationIssues = [{ code: 'versionIsInTg' }];
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'process-1',
          '@version': '1.0.0',
          versionIsInTg: true,
        },
      ],
    });
    mockBuildValidationIssues.mockImplementationOnce(({ problemNodes }: any) => {
      expect(problemNodes).toEqual([
        expect.objectContaining({
          '@refObjectId': 'process-1',
          '@version': '1.0.0',
          versionIsInTg: true,
        }),
      ]);
      return validationIssues;
    });
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ id: 'ref-check-version-tg' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(showValidationIssueModal).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: validationIssues,
          title: {
            id: 'pages.validationIssues.modal.checkDataTitle',
            defaultMessage: 'Data validation issues',
          },
        }),
      ),
    );
  });

  it('passes reference issue tabs into the validation modal and process form during data check', async () => {
    const sourceRef = {
      '@type': 'source data set',
      '@refObjectId': 'source-1',
      '@version': '01.00.000',
    };
    const validationIssues = [
      {
        code: 'ruleVerificationFailed',
        ref: sourceRef,
        tabName: 'modellingAndValidation',
        tabNames: ['modellingAndValidation'],
      },
    ];
    mockDealProcress.mockImplementationOnce(
      (_processDetail, _unReview, _underReview, unRuleVerification) => {
        unRuleVerification.push(sourceRef);
      },
    );
    mockGetErrRefTab.mockImplementationOnce((ref: any) =>
      ref?.['@refObjectId'] === 'source-1' ? 'modellingAndValidation' : '',
    );
    mockBuildValidationIssues.mockImplementationOnce(({ getRefTabNames, unRuleVerification }) => {
      expect(unRuleVerification).toEqual([sourceRef]);
      expect(getRefTabNames(sourceRef)).toEqual(['modellingAndValidation']);
      return validationIssues;
    });
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ id: 'source-1' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(latestProcessFormProps.validationIssueTabNames).toEqual(['modellingAndValidation']),
    );
    await waitFor(() =>
      expect(mockShowValidationIssueModal).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: validationIssues,
          title: {
            id: 'pages.validationIssues.modal.checkDataTitle',
            defaultMessage: 'Data validation issues',
          },
        }),
      ),
    );
  });

  it('falls back to empty exchanges when reference updates return no exchange payload', async () => {
    mockUpdateRefsData.mockReturnValue(undefined);
    mockGetRefsOfNewVersion
      .mockResolvedValueOnce({
        newRefs: [{ id: 'flow-1', version: '2.0.0' }],
        oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
      })
      .mockResolvedValueOnce({
        newRefs: [{ id: 'flow-1', version: '2.0.0' }],
        oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
      })
      .mockResolvedValueOnce({
        newRefs: [],
        oldRefs: [{ id: 'flow-1', version: '1.0.0' }],
      });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'update-latest' }));
    await waitFor(() => expect(mockUpdateRefsData).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'keep-current' }));
    await waitFor(() => expect(mockUpdateRefsData).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    await waitFor(() => expect(mockUpdateRefsData).toHaveBeenCalledTimes(3));
    expect(mockGetFlowDetail).not.toHaveBeenCalled();
  });

  it('surfaces tab-level check errors and triggers field validation after switching tabs', async () => {
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['processDataSet', 'processInformation'] }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith(
        'Data check failed in Process information. Please check the data!',
      ),
    );

    await act(async () => {
      latestProcessFormProps.onTabChange('validation');
    });

    await waitFor(() => expect(mockValidateFields).toHaveBeenCalled());
  });

  it('falls back to a generic data-check error when issues do not map to a tab', async () => {
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['processDataSet', undefined] }],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith(
        'Data check failed, please check the data!',
      ),
    );
  });

  it('treats missing reference-path results as an empty problem-node list', async () => {
    mockCheckReferences.mockResolvedValue(undefined);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.success).toHaveBeenCalledWith('Data validation passed.'),
    );
  });

  it('surfaces reference-tab errors collected from missing, unverified, and problem refs', async () => {
    mockDealProcress.mockImplementation(
      (
        _processDetail: any,
        _unReview: any[],
        _underReview: any[],
        unRuleVerification: any[],
        nonExistentRef: any[],
      ) => {
        nonExistentRef.push({
          '@refObjectId': 'flow-1',
          '@version': '1.0.0',
          refTab: 'administrativeInformation',
        });
        unRuleVerification.push({
          '@refObjectId': 'source-1',
          '@version': '1.0.0',
          refTab: 'modellingAndValidation',
        });
      },
    );
    mockGetErrRefTab.mockImplementation((item: any) => item.refTab ?? null);
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'contact-1',
          '@version': '1.0.0',
          refTab: 'technology',
        },
      ],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith(
        'Data check failed in Administrative information, Modelling and validation, and Unknown section (technology). Please check the data!',
      ),
    );
  });

  it('stops review submission when the saved draft cannot be read back', async () => {
    mockGetProcessDetail
      .mockResolvedValueOnce(createProcessDetailResponse())
      .mockResolvedValueOnce({ data: null });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockAntdMessage.error).toHaveBeenCalledWith('Review submission failed'),
    );
    expect(mockUpdateProcess).not.toHaveBeenCalled();
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
  });

  it('passes process identity for the shared LCIA panel to the process form', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    expect(latestProcessFormProps).toMatchObject({
      processId: 'process-1',
      processVersion: '1.0.0',
    });
    expect(latestProcessFormProps).not.toHaveProperty('onLciaResults');
  });

  it('ignores reference updates and saves until the process payload has loaded', async () => {
    mockGetProcessDetail.mockImplementation(
      () =>
        new Promise(() => {
          // keep the initial payload unresolved so guard paths execute
        }),
    );

    render(<ProcessEdit {...baseProps} />);

    await act(async () => {
      await latestRefsDrawerProps.onUpdate([{ id: 'flow-1', version: '2.0.0' }]);
      await latestRefsDrawerProps.onKeep();
    });

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {});

    expect(mockGetRefsOfNewVersion).not.toHaveBeenCalled();
    expect(mockGetRefsOfCurrentVersion).not.toHaveBeenCalled();
    expect(mockUpdateRefsData).not.toHaveBeenCalled();
    expect(mockUpdateProcess).not.toHaveBeenCalled();
  });

  it('shows the validation issue modal and blocks review for quantitative-reference sdk issues', async () => {
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['processDataSet', 'processInformation', 'quantitativeReference'] }],
    });
    mockBuildValidationIssues.mockReturnValueOnce([{ id: 'sdk-issue' }]);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ key: 'sdk-issue' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockShowValidationIssueModal).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: [{ id: 'sdk-issue' }],
          title: {
            id: 'pages.validationIssues.modal.reviewTitle',
            defaultMessage: 'Review submission blocked',
          },
        }),
      ),
    );
    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
  });

  it('revalidates the target tab after navigating from the sdk issue modal', async () => {
    const sdkDetail = {
      key: 'sdk-nav-commissioner',
      tabName: 'administrativeInformation',
      fieldKey: 'common:referenceToCommissioner',
      fieldLabel: 'Commissioner of data set',
      fieldPath:
        'administrativeInformation.common:commissionerAndGoal.common:referenceToCommissioner.@refObjectId',
      formName: [
        'administrativeInformation',
        'common:commissionerAndGoal',
        'common:referenceToCommissioner',
        '@refObjectId',
      ],
      presentation: 'field',
      reasonMessage: 'Invalid input: expected object, received undefined',
      validationCode: 'required_missing',
    };
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [
        { path: ['processDataSet', 'administrativeInformation', 'common:commissionerAndGoal'] },
      ],
    });
    mockBuildValidationIssues.mockReturnValueOnce([
      {
        code: 'sdkInvalid',
        link: 'http://localhost:8000/#/mydata/processes?id=process-1&version=1.0.0&required=1',
        ref: {
          '@refObjectId': 'process-1',
          '@type': 'process data set',
          '@version': '1.0.0',
        },
        sdkDetails: [sdkDetail],
        tabNames: ['administrativeInformation'],
      },
    ]);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ key: 'sdk-issue' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => expect(mockShowValidationIssueModal).toHaveBeenCalledTimes(1));

    mockValidateFields.mockClear();

    const navigate = mockShowValidationIssueModal.mock.calls[0][0].onNavigate;

    await act(async () => {
      navigate({ detail: sdkDetail, tabName: 'administrativeInformation' });
    });

    await waitFor(() =>
      expect(latestProcessFormProps.activeTabKey).toBe('administrativeInformation'),
    );
    await waitFor(() => expect(mockValidateFields).toHaveBeenCalled());
    expect(latestProcessFormProps.sdkValidationFocus).toEqual(sdkDetail);
  });

  it('revalidates tab-only modal navigation targets without focusing a specific field', async () => {
    const sdkDetail = {
      key: 'sdk-nav-admin-section',
      tabName: 'administrativeInformation',
      fieldKey: 'common:referenceToCommissioner',
      fieldLabel: 'Commissioner of data set',
      fieldPath:
        'administrativeInformation.common:commissionerAndGoal.common:referenceToCommissioner.@refObjectId',
      formName: [
        'administrativeInformation',
        'common:commissionerAndGoal',
        'common:referenceToCommissioner',
        '@refObjectId',
      ],
      presentation: 'field',
      reasonMessage: 'Invalid input: expected object, received undefined',
      validationCode: 'required_missing',
    };
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [
        { path: ['processDataSet', 'administrativeInformation', 'common:commissionerAndGoal'] },
      ],
    });
    mockBuildValidationIssues.mockReturnValueOnce([
      {
        code: 'sdkInvalid',
        link: 'http://localhost:8000/#/mydata/processes?id=process-1&version=1.0.0&required=1',
        ref: {
          '@refObjectId': 'process-1',
          '@type': 'process data set',
          '@version': '1.0.0',
        },
        sdkDetails: [sdkDetail],
        tabNames: ['administrativeInformation'],
      },
    ]);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ key: 'sdk-issue' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => expect(mockShowValidationIssueModal).toHaveBeenCalledTimes(1));

    mockValidateFields.mockClear();

    const navigate = mockShowValidationIssueModal.mock.calls[0][0].onNavigate;

    await act(async () => {
      navigate({
        detail: {
          ...sdkDetail,
          presentation: 'section',
          tabName: undefined,
        },
        tabName: 'administrativeInformation',
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(latestProcessFormProps.activeTabKey).toBe('administrativeInformation'),
    );
    await waitFor(() => expect(mockValidateFields).toHaveBeenCalled());
    expect(latestProcessFormProps.sdkValidationFocus).toBeNull();
  });

  it('drops field focus when sdk navigation targets a tab-level section detail directly', async () => {
    const sdkDetail = {
      key: 'sdk-nav-admin-section-direct',
      tabName: 'administrativeInformation',
      fieldKey: 'common:referenceToCommissioner',
      fieldLabel: 'Commissioner of data set',
      fieldPath:
        'administrativeInformation.common:commissionerAndGoal.common:referenceToCommissioner.@refObjectId',
      formName: [
        'administrativeInformation',
        'common:commissionerAndGoal',
        'common:referenceToCommissioner',
        '@refObjectId',
      ],
      presentation: 'section',
      reasonMessage: 'Invalid input: expected object, received undefined',
      validationCode: 'required_missing',
    };
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [
        { path: ['processDataSet', 'administrativeInformation', 'common:commissionerAndGoal'] },
      ],
    });
    mockBuildValidationIssues.mockReturnValueOnce([
      {
        code: 'sdkInvalid',
        link: 'http://localhost:8000/#/mydata/processes?id=process-1&version=1.0.0&required=1',
        ref: {
          '@refObjectId': 'process-1',
          '@type': 'process data set',
          '@version': '1.0.0',
        },
        sdkDetails: [sdkDetail],
        tabNames: ['administrativeInformation'],
      },
    ]);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce([{ key: 'sdk-issue' }]);

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Data Check' }));

    await waitFor(() => expect(mockShowValidationIssueModal).toHaveBeenCalledTimes(1));

    const navigate = mockShowValidationIssueModal.mock.calls[0][0].onNavigate;

    await act(async () => {
      navigate({ detail: sdkDetail, tabName: 'administrativeInformation' });
    });

    await waitFor(() =>
      expect(latestProcessFormProps.activeTabKey).toBe('administrativeInformation'),
    );
    expect(latestProcessFormProps.sdkValidationFocus).toBeNull();
  });

  it('leaves exchange selections unchanged when no quantitative-reference target is provided', () => {
    const source = [
      { '@dataSetInternalID': 'input-1', quantitativeReference: true },
      { '@dataSetInternalID': 'output-1', quantitativeReference: false },
    ];

    expect(normalizeQuantitativeReferenceSelection(source, undefined)).toEqual(source);
  });

  it('runs the initial data check automatically once when autoCheckRequired is enabled', async () => {
    render(<ProcessEdit {...baseProps} autoOpen autoCheckRequired />);

    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalledTimes(1));
    expect(mockValidateDatasetWithSdk).toHaveBeenCalled();
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Data validation passed.');
  });

  it('submits through the footer save button', async () => {
    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdateProcess).toHaveBeenCalled());
  });

  it('renders the result toolbar button as disabled when no process id is available', () => {
    render(<ProcessEdit {...baseProps} id='' buttonType='toolResultIcon' />);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'Edit process' })).not.toBeInTheDocument();
  });

  it('renders the tool-icon trigger as disabled when requested', () => {
    render(<ProcessEdit {...baseProps} buttonType='toolIcon' disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens from the tool-result toolbar variant', async () => {
    render(<ProcessEdit {...baseProps} buttonType='tool' />);

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
  });

  it('opens from the text-button edit variant', async () => {
    render(<ProcessEdit {...baseProps} buttonType='text' />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit process' })).toBeInTheDocument();
  });

  it('submits a review successfully when rule_verification is null', async () => {
    mockUpdateProcess.mockResolvedValue({
      data: [
        {
          id: 'process-1',
          version: '1.0.0',
          json: { processDataSet: processDataset },
          state_code: 10,
          rule_verification: null,
        },
      ],
    });

    render(<ProcessEdit {...baseProps} />);

    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('dialog', { name: 'Edit process' });

    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

    await waitFor(() =>
      expect(mockSubmitDatasetReview).toHaveBeenCalledWith('processes', 'process-1', '1.0.0'),
    );
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Review submitted successfully');
    expect(actionRef.current.reload).toHaveBeenCalledTimes(1);
    expect(setViewDrawerVisible).toHaveBeenCalledWith(false);
  });
});
