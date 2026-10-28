// @ts-nocheck
import ProcessCreate from '@/pages/Processes/Components/create';
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

beforeEach(() => {
  proFormApi = null;
  triggerValuesChange = null;
  latestProcessFormProps = null;
});

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
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
  CopyOutlined: () => <span>copy-icon</span>,
  PlusOutlined: () => <span>plus-icon</span>,
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

  const Drawer = ({ open, title, extra, footer, children, getContainer, onClose }: any) => {
    if (!open) return null;
    getContainer?.();
    const label = toText(title) || 'drawer';
    return (
      <section role='dialog' aria-label={label}>
        <header>{extra}</header>
        <div>{children}</div>
        <footer>{footer}</footer>
        <button type='button' onClick={onClose}>
          drawer-close
        </button>
      </section>
    );
  };

  const Space = ({ children }: any) => <div>{children}</div>;

  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <div>{children}</div>;

  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };

  return (() => {
    const antdModuleMock = {
      __esModule: true,
      Alert: ({ title }: any) => <div role='alert'>{title}</div>,
      Button,
      Tooltip,
      Drawer,
      Space,
      Spin,
      message,
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

const { message: mockAntdMessage } = jest.requireMock('antd');

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const setNestedValue = (source: any, path: any[], value: any) => {
    const next = { ...source };
    let cursor = next;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      cursor[key] = { ...(cursor[key] ?? {}) };
      cursor = cursor[key];
    }
    cursor[path[path.length - 1]] = value;
    return next;
  };

  const getNestedValue = (source: any, path: any[]) => {
    return path.reduce((acc, key) => (acc ? acc[key] : undefined), source);
  };

  const ProForm = ({
    formRef,
    initialValues = {},
    onFinish,
    onValuesChange,
    submitter,
    children,
  }: any) => {
    const valuesRef = React.useRef({ ...initialValues });

    const buildApi = React.useCallback(() => {
      const api = {
        submit: async () => onFinish?.(),
        resetFields: () => {
          valuesRef.current = { ...initialValues };
        },
        getFieldsValue: () => ({ ...valuesRef.current }),
        setFieldsValue: (next: any) => {
          valuesRef.current = { ...valuesRef.current, ...next };
        },
        setFieldValue: (name: any, value: any) => {
          if (Array.isArray(name)) {
            valuesRef.current = setNestedValue(valuesRef.current, name, value);
          } else {
            valuesRef.current = { ...valuesRef.current, [name]: value };
          }
        },
        getFieldValue: (name: any) => {
          if (Array.isArray(name)) {
            return getNestedValue(valuesRef.current, name);
          }
          return valuesRef.current[name];
        },
      };
      if (formRef) {
        formRef.current = api;
      }
      proFormApi = api;
      return api;
    }, [formRef, initialValues, onFinish]);

    React.useEffect(() => {
      buildApi();
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
        {submitter?.render?.()}
        {typeof children === 'function' ? children(valuesRef.current) : children}
      </form>
    );
  };

  return {
    __esModule: true,
    ProForm,
  };
});

jest.mock('@/components/ToolBarButton', () => ({
  __esModule: true,
  default: ({ onClick, disabled }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      create
    </button>
  ),
}));

jest.mock('@/services/general/util', () => {
  const actual = jest.requireActual('@/services/general/util');
  return {
    __esModule: true,
    ...actual,
    formatDateTime: () => '2024-01-01 00:00',
  };
});

const mockCreateProcess = jest.fn();
const mockCreateProcessVersion = jest.fn();
const mockGetProcessDetail = jest.fn();

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  createProcess: (...args: any[]) => mockCreateProcess(...args),
  createProcessVersion: (...args: any[]) => mockCreateProcessVersion(...args),
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
}));

const mockGenProcessFromData = jest.fn();

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
}));

jest.mock('@/pages/Processes/Components/form', () => ({
  __esModule: true,
  ProcessForm: (props: any) => {
    latestProcessFormProps = props;
    return <div data-testid='process-form'>form</div>;
  },
}));

jest.mock('uuid', () => ({
  __esModule: true,
  v4: () => 'generated-id',
}));

describe('ProcessCreate component', () => {
  const actionRef = { current: { reload: jest.fn() } };

  const baseProps = {
    lang: 'en',
    actionRef,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actionRef.current.reload.mockClear();
    actionRef.current.reload.mockResolvedValue(undefined);
    mockCreateProcess.mockResolvedValue({ data: { id: 'generated-id' } });
    mockCreateProcessVersion.mockResolvedValue({ data: { id: 'generated-id' } });
  });

  it.each(['create', 'copy', 'createVersion'])(
    'preserves complete scientific data through partial modelling form snapshots in %s',
    async (actionType) => {
      const scientificData = {
        processInformation: {
          dataSetInformation: {
            'common:generalComment': [{ '@xml:lang': 'en', '#text': 'Boundary.' }],
          },
          technology: {
            technologyDescriptionAndIncludedProcesses: [
              { '@xml:lang': 'en', '#text': 'Production technology.' },
            ],
          },
          time: {
            'common:referenceYear': '2025',
            'common:timeRepresentativenessDescription': [
              { '@xml:lang': 'en', '#text': 'Year boundary.' },
            ],
          },
          geography: {
            locationOfOperationSupplyOrProduction: {
              '@location': 'CN',
              descriptionOfRestrictions: [{ '@xml:lang': 'en', '#text': 'Regional boundary.' }],
            },
          },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: {
            modellingConstants: [{ '@xml:lang': 'en', '#text': 'Cut-off.' }],
          },
          dataSourcesTreatmentAndRepresentativeness: {
            useAdviceForDataSet: [
              { '@xml:lang': 'en', '#text': 'Use within the documented boundary.' },
            ],
            annualSupplyOrProductionVolume: [{ '@xml:lang': 'en', '#text': '100 kg/year' }],
            samplingProcedure: [{ '@xml:lang': 'en', '#text': 'Sample.' }],
            dataCutOffAndCompletenessPrinciples: [
              { '@xml:lang': 'en', '#text': 'Coverage principle.' },
            ],
            deviationsFromCutOffAndCompletenessPrinciples: [
              { '@xml:lang': 'en', '#text': 'Coverage exceptions.' },
            ],
            dataSelectionAndCombinationPrinciples: [
              { '@xml:lang': 'en', '#text': 'Selection principle.' },
            ],
            deviationsFromSelectionAndCombinationPrinciples: [
              { '@xml:lang': 'en', '#text': 'Selection exceptions.' },
            ],
            dataTreatmentAndExtrapolationsPrinciples: [
              { '@xml:lang': 'en', '#text': 'Treatment principle.' },
            ],
            deviationsFromTreatmentAndExtrapolationPrinciples: [
              { '@xml:lang': 'en', '#text': 'Treatment exceptions.' },
            ],
            dataCollectionPeriod: [{ '@xml:lang': 'en', '#text': 'Annual collection.' }],
            uncertaintyAdjustments: [{ '@xml:lang': 'en', '#text': 'Uncertainty basis.' }],
          },
          completeness: { completenessProductModel: 'All relevant flows quantified' },
          validation: { review: [{ '@type': 'Not reviewed' }] },
          complianceDeclarations: {
            compliance: [{ 'common:approvalOfOverallCompliance': 'Fully compliant' }],
          },
        },
        administrativeInformation: {
          publicationAndOwnership: { 'common:dataSetVersion': '01.01.000' },
        },
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '0',
              quantitativeReference: true,
              meanAmount: '1',
              functionalUnitOrOther: [
                { '@xml:lang': 'en', '#text': '1 kg product at the factory gate.' },
              ],
            },
          ],
        },
        LCIAResults: { LCIAResult: [{ meanAmount: '0.5' }] },
      };
      mockGenProcessFromData.mockReturnValue(scientificData);
      mockGetProcessDetail.mockResolvedValue({ data: { json: { processDataSet: {} } } });
      render(
        <ProcessCreate
          {...baseProps}
          actionType={actionType}
          id='process-1'
          version='01.01.000'
          importData={actionType === 'create' ? [{ processDataSet: {} }] : undefined}
        />,
      );
      if (actionType !== 'create')
        fireEvent.click(
          screen.getByRole('button', { name: actionType === 'copy' ? /copy-icon/ : 'create' }),
        );
      await waitFor(() =>
        expect(latestProcessFormProps?.exchangeDataSource).toEqual(
          scientificData.exchanges.exchange,
        ),
      );
      await act(async () => {
        latestProcessFormProps.onTabChange('modellingAndValidation');
      });
      const updatedSampling = [{ '@xml:lang': 'en', '#text': 'Updated sample.' }];
      // Model the mounted tab returning only its registered fields.
      await act(async () => {
        proFormApi.setFieldsValue({
          modellingAndValidation: {
            dataSourcesTreatmentAndRepresentativeness: { samplingProcedure: updatedSampling },
          },
        });
        triggerValuesChange?.({}, {});
        await latestProcessFormProps.onData();
      });
      // Programmatic form changes must also be read by the final Save.
      proFormApi.setFieldsValue({
        processInformation: { technology: { technologyDescriptionAndIncludedProcesses: [] } },
      });
      await act(async () => {
        await proFormApi.submit();
      });
      const save = actionType === 'createVersion' ? mockCreateProcessVersion : mockCreateProcess;
      const payload = save.mock.calls[0][actionType === 'createVersion' ? 2 : 1];
      expect(payload).toMatchObject({
        ...scientificData,
        processInformation: {
          ...scientificData.processInformation,
          technology: { technologyDescriptionAndIncludedProcesses: [] },
        },
        modellingAndValidation: {
          ...scientificData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            ...scientificData.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness,
            samplingProcedure: updatedSampling,
          },
        },
      });
    },
  );

  it('submits new process and normalizes allocations when no fraction is set', async () => {
    render(<ProcessCreate {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(screen.getByRole('dialog', { name: 'Create process' })).toBeInTheDocument();
    expect(latestProcessFormProps).toBeTruthy();

    await act(async () => {
      latestProcessFormProps.onExchangeDataCreate({
        '@dataSetInternalID': '0',
        exchangeDirection: 'OUTPUT',
        quantitativeReference: true,
      });
    });

    const currentValues = proFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      proFormApi?.setFieldsValue({ processInformation: { name: 'New process' } });
      triggerValuesChange?.({}, { ...currentValues, processInformation: { name: 'New process' } });
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockCreateProcess).toHaveBeenCalledWith('generated-id', expect.any(Object));
    expect(mockAntdMessage.success).toHaveBeenCalled();
    expect(actionRef.current.reload).toHaveBeenCalledWith(true);
  });

  it('waits for the first-page reload before completing a successful submission', async () => {
    let resolveReload!: () => void;
    actionRef.current.reload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveReload = resolve;
        }),
    );

    render(<ProcessCreate {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    let submissionSettled = false;
    let submission: Promise<void> | undefined;
    await act(async () => {
      submission = proFormApi?.submit().then(() => {
        submissionSettled = true;
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(actionRef.current.reload).toHaveBeenCalledWith(true));
    expect(submissionSettled).toBe(false);

    await act(async () => {
      resolveReload();
      await submission;
    });
    expect(submissionSettled).toBe(true);
  });

  it.each(['create', 'createVersion'])(
    'imports unchanged allocation problems as an unverified %s draft',
    async (actionType) => {
      const draft = {
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '0',
              exchangeDirection: 'OUTPUT',
              quantitativeReference: true,
              allocations: { allocation: { '@allocatedFraction': '70' } },
            },
          ],
        },
      };
      mockGenProcessFromData.mockReturnValue(draft);
      mockCreateProcess.mockResolvedValue({ data: [{}] });
      render(
        <ProcessCreate
          {...baseProps}
          actionType={actionType}
          importData={[{ processDataSet: draft }]}
        />,
      );
      await screen.findByRole('dialog');
      await act(async () => {
        await proFormApi?.submit();
      });
      const save = actionType === 'createVersion' ? mockCreateProcessVersion : mockCreateProcess;
      expect(save.mock.calls.at(-1).at(-1)).toEqual({ allocationDraft: true });
      expect(mockAntdMessage.warning).toHaveBeenCalledWith(
        expect.stringContaining('Saved as a draft'),
      );
    },
  );

  it.each(['copy', 'createVersion'])(
    'retains inherited allocation issues when saving %s',
    async (actionType) => {
      const draft = {
        id: 'source-process',
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '7',
              exchangeDirection: 'OUTPUT',
              allocations: { allocation: { '@allocatedFraction': '70' } },
            },
          ],
        },
      };
      mockGenProcessFromData.mockReturnValue(draft);
      mockGetProcessDetail.mockResolvedValue({ data: { json: { processDataSet: draft } } });
      render(
        <ProcessCreate
          {...baseProps}
          actionType={actionType}
          id='source-process'
          version='01.00.000'
        />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: actionType === 'copy' ? 'copy-icon' : 'create' }),
      );
      await waitFor(() => expect(latestProcessFormProps.exchangeDataSource).toHaveLength(1));
      await act(async () => {
        await proFormApi.submit();
      });
      const save = actionType === 'copy' ? mockCreateProcess : mockCreateProcessVersion;
      expect(save).toHaveBeenCalled();
      expect(save.mock.calls.at(-1).at(-1)).toEqual({ allocationDraft: true });
      expect(mockAntdMessage.warning).toHaveBeenCalledWith(
        expect.stringContaining('Saved as a draft'),
      );
    },
  );

  it('prevents submission when allocated fraction exceeds 100%', async () => {
    render(<ProcessCreate {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await act(async () => {
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          allocations: { allocation: { '@allocatedFraction': '120%' } },
        },
      ]);
    });

    const currentValues = proFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      proFormApi?.setFieldsValue({ processInformation: { name: 'Invalid process' } });
      triggerValuesChange?.(
        {},
        { ...currentValues, processInformation: { name: 'Invalid process' } },
      );
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockCreateProcess).not.toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('Each share must be a number from 0 to 100.'),
    );
  });

  it('loads existing data and overrides the version when creating a new version', async () => {
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: 'Existing process',
              },
            },
          },
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {
          'common:dataSetVersion': '01.01.000',
        },
      },
      exchanges: {
        exchange: [{ '@dataSetInternalID': '0' }],
      },
    });

    render(
      <ProcessCreate
        {...baseProps}
        actionType='createVersion'
        id='process-1'
        version='1.0.0'
        newVersion='02.00.000'
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));
    await waitFor(() =>
      expect(
        proFormApi?.getFieldValue([
          'administrativeInformation',
          'publicationAndOwnership',
          'common:dataSetVersion',
        ]),
      ).toBe('02.00.000'),
    );
    expect(latestProcessFormProps.formType).toBe('createVersion');
    expect(latestProcessFormProps.exchangeDataSource).toEqual([{ '@dataSetInternalID': '0' }]);
  });

  it('shows the duplicate-id error when createProcess returns a unique constraint violation', async () => {
    mockCreateProcess.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    render(<ProcessCreate {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    const currentValues = proFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      proFormApi?.setFieldsValue({ processInformation: { name: 'Duplicate process' } });
      triggerValuesChange?.(
        {},
        { ...currentValues, processInformation: { name: 'Duplicate process' } },
      );
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockCreateProcess).toHaveBeenCalledWith('generated-id', expect.any(Object));
    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'Data with the same ID and version already exists.',
    );
    expect(actionRef.current.reload).not.toHaveBeenCalled();
  });

  it('supports copy triggers, close controls, and sparse detail payloads', async () => {
    const onClose = jest.fn();
    mockGetProcessDetail.mockResolvedValue({
      data: {},
    });
    mockGenProcessFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {},
      },
    });

    render(
      <ProcessCreate
        {...baseProps}
        actionType='copy'
        id='process-1'
        version='1.0.0'
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'copy-icon' }));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));
    expect(latestProcessFormProps.exchangeDataSource).toEqual([]);
    onClose.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'close-icon' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'copy-icon' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Copy process' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'drawer-close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('skips detail lookup when copy identifiers are missing and closes from the footer cancel action', async () => {
    const onClose = jest.fn();

    render(
      <ProcessCreate
        {...baseProps}
        actionType={'copy' as any}
        id={undefined as any}
        version={undefined as any}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'copy-icon' }));

    expect(mockGetProcessDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Copy process' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('reloads the first page after a copied process is saved', async () => {
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {
          processDataSet: {},
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {},
      },
      exchanges: {
        exchange: [],
      },
    });

    render(<ProcessCreate {...baseProps} actionType='copy' id='process-1' version='01.00.000' />);

    fireEvent.click(screen.getByRole('button', { name: 'copy-icon' }));
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockCreateProcess).toHaveBeenCalledWith('generated-id', expect.any(Object));
    expect(actionRef.current.reload).toHaveBeenCalledWith(true);
  });

  it('handles tab snapshots, lcia results, and createVersion save errors', async () => {
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {
          processDataSet: {},
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      processInformation: {
        name: 'Existing process',
      },
      administrativeInformation: {
        publicationAndOwnership: {
          'common:dataSetVersion': '01.01.000',
        },
      },
      modellingAndValidation: {
        validation: {
          review: [{ scope: 'initial' }],
        },
        complianceDeclarations: {
          compliance: [{ status: 'initial' }],
        },
      },
      exchanges: {
        exchange: [],
      },
    });
    mockCreateProcessVersion.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    render(
      <ProcessCreate
        {...baseProps}
        actionType='createVersion'
        id='process-1'
        version='1.0.0'
        newVersion='03.00.000'
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));

    await act(async () => {
      latestProcessFormProps.onTabChange('validation');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('validation'));
    await act(async () => {
      proFormApi?.setFieldsValue({
        modellingAndValidation: {
          validation: { review: [{ scope: 'validation-snapshot' }] },
        },
      });
      triggerValuesChange?.(
        {},
        {
          modellingAndValidation: {
            validation: { review: [{ scope: 'validation-change' }] },
          },
        },
      );
      await latestProcessFormProps.onData();
    });

    await act(async () => {
      latestProcessFormProps.onTabChange('complianceDeclarations');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('complianceDeclarations'));
    await act(async () => {
      proFormApi?.setFieldsValue({
        modellingAndValidation: {
          complianceDeclarations: { compliance: [{ status: 'compliance-snapshot' }] },
        },
      });
      triggerValuesChange?.(
        {},
        {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [{ status: 'compliance-change' }] },
          },
        },
      );
      await latestProcessFormProps.onData();
    });

    await act(async () => {
      latestProcessFormProps.onTabChange('processInformation');
    });
    await waitFor(() => expect(latestProcessFormProps.activeTabKey).toBe('processInformation'));
    await act(async () => {
      proFormApi?.setFieldsValue({
        processInformation: undefined,
      });
      triggerValuesChange?.({}, {});
      await latestProcessFormProps.onData();
      latestProcessFormProps.onExchangeData([
        {
          '@dataSetInternalID': '0',
          exchangeDirection: 'OUTPUT',
          quantitativeReference: true,
          allocations: {
            allocation: {
              '@allocatedFraction': '100%',
            },
          },
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockCreateProcessVersion).toHaveBeenCalledWith(
        'process-1',
        '1.0.0',
        expect.not.objectContaining({
          LCIAResults: expect.anything(),
        }),
      ),
    );
    expect(mockAntdMessage.error).toHaveBeenCalledWith('Error');
  });

  it('shows the backend error message when createProcess fails without a duplicate error', async () => {
    mockCreateProcess.mockResolvedValueOnce({
      data: null,
      error: { message: 'Backend error' },
    });

    render(<ProcessCreate {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockCreateProcess).toHaveBeenCalled());
    expect(mockAntdMessage.error).toHaveBeenCalledWith('Backend error');
  });

  it('falls back to an empty exchange list when imported data has no exchanges', async () => {
    mockGenProcessFromData.mockReturnValue({
      processInformation: {
        dataSetInformation: {
          name: 'Imported process without exchanges',
        },
      },
    });

    render(
      <ProcessCreate
        {...baseProps}
        importData={[
          {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  'common:UUID': 'imported-no-exchanges',
                },
              },
            },
          },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Create process' })).toBeInTheDocument(),
    );
    expect(latestProcessFormProps.exchangeDataSource).toEqual([]);
  });

  it('falls back to empty create-version identifiers when runtime props are missing', async () => {
    render(
      <ProcessCreate
        {...baseProps}
        actionType={'createVersion' as any}
        id={undefined as any}
        version={undefined as any}
        newVersion='03.00.000'
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockCreateProcessVersion).toHaveBeenCalledWith('', '', expect.anything()),
    );
    expect(actionRef.current.reload).toHaveBeenCalledWith(true);
  });

  it('opens automatically from imported data and reuses the imported UUID on submit', async () => {
    const importedId = '123e4567-e89b-12d3-a456-426614174000';
    mockGenProcessFromData.mockReturnValue({
      processInformation: {
        dataSetInformation: {
          name: 'Imported process',
        },
      },
      exchanges: {
        exchange: [],
      },
    });

    render(
      <ProcessCreate
        {...baseProps}
        importData={[
          {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  'common:UUID': importedId,
                },
              },
            },
          },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Create process' })).toBeInTheDocument(),
    );

    await act(async () => {
      await proFormApi?.submit();
    });

    expect(mockCreateProcess).toHaveBeenCalledWith(importedId, expect.any(Object));
    expect(mockAntdMessage.success).toHaveBeenCalled();
  });
});
