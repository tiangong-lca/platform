// @ts-nocheck
import ProcessExchangeCreate from '@/pages/Processes/Components/Exchange/create';
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
let mockSourceListAdd = jest.fn();
let mockSourceListRemove = jest.fn();
let mockSourceFields: Array<{ key: string; name: number }> = [];

beforeEach(() => {
  proFormApi = null;
  triggerValuesChange = null;
  mockSourceListAdd = jest.fn();
  mockSourceListRemove = jest.fn();
  mockSourceFields = [
    { key: '0', name: 0 },
    { key: '1', name: 1 },
  ];
});

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
}));

const mockGetRules = jest.fn(() => [{ required: true }]);

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: (...args: any[]) => mockGetRules(...args),
}));

jest.mock('@/components/ToolBarButton', () => ({
  __esModule: true,
  default: ({ onClick, disabled, icon, tooltip }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {toText(tooltip)}
      {icon ? <span data-testid='toolbar-icon'>{icon}</span> : null}
    </button>
  ),
}));

const mockUnitConvertState: { visible: boolean; onOk?: (value: any) => void } = { visible: false };

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CaretRightOutlined: ({ rotate }: any) => <span>{`caret-${rotate ?? 0}`}</span>,
  CloseOutlined: (props: any) => (
    <span data-testid={props.onClick ? 'close-action' : 'close-icon'} onClick={props.onClick}>
      close-outlined
    </span>
  ),
  PlusOutlined: () => <span>plus-icon</span>,
}));

jest.mock('@/components/UnitConvert', () => ({
  __esModule: true,
  default: ({ visible, onOk, onCancel }: any) => {
    mockUnitConvertState.visible = visible;
    mockUnitConvertState.onOk = onOk;
    return visible ? (
      <div data-testid='unit-convert'>
        <button type='button' onClick={() => onOk?.('42')}>
          confirm-convert
        </button>
        <button type='button' onClick={onCancel}>
          close-convert
        </button>
      </div>
    ) : null;
  },
}));

jest.mock('@/pages/Flows/Components/select/form', () => ({
  __esModule: true,
  default: ({ onData, formRef, name, asInput }: any) => {
    const fieldName = name ?? ['referenceToFlowDataSet'];
    return (
      <div>
        <span data-testid='flow-select-mode'>{String(asInput)}</span>
        <button
          type='button'
          onClick={() => {
            formRef?.current?.setFieldValue(fieldName, { '@refObjectId': 'flow-1' });
            onData?.();
          }}
        >
          trigger-flow-data
        </button>
      </div>
    );
  },
}));

jest.mock('@/pages/Sources/Components/select/form', () => ({
  __esModule: true,
  default: ({ parentName = [], name = [], formRef, onData, label }: any) => {
    const fieldPath = [...parentName, ...name];
    return (
      <button
        type='button'
        onClick={() => {
          formRef?.current?.setFieldValue(fieldPath, { '@refObjectId': `source-${name[0] ?? 0}` });
          onData?.();
        }}
      >
        {toText(label)}
      </button>
    );
  },
}));

jest.mock('@/components/LangTextItem/form', () => ({
  __esModule: true,
  default: () => <div data-testid='lang-form'>lang-form</div>,
}));

jest.mock('@/services/locations/api', () => ({
  __esModule: true,
  getILCDLocationAll: jest.fn(() =>
    Promise.resolve({
      data: [{ location: [{ '@value': 'CN', '#text': 'China' }] }],
      success: true,
    }),
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Button = (props: any) => {
    const { children, onClick, disabled, type, icon, ...rest } = props;
    delete rest.block;
    return (
      <button
        type='button'
        data-button-type={type}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        {...rest}
      >
        {icon ? <span data-testid='button-icon'>{icon}</span> : null}
        {toText(children)}
      </button>
    );
  };

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

  const Input = ({ onClick, 'data-testid': dataTestId }: any) => (
    <input data-testid={dataTestId} readOnly onClick={onClick} />
  );

  const Select = ({ onChange, options = [], 'data-testid': dataTestId }: any) => (
    <select data-testid={dataTestId} onChange={(event) => onChange?.(event.target.value)}>
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const Switch = (props: any) => (
    <input
      type='checkbox'
      data-testid='switch'
      onChange={(event) => props.onChange?.(event.target.checked)}
      checked={props.checked}
    />
  );

  const Divider = () => <hr />;
  const Card = ({ children }: any) => <div>{children}</div>;

  const FormComponent = ({ children }: any) => <div>{children}</div>;
  FormComponent.Item = ({ children, name }: any) => {
    const nameKey = Array.isArray(name) ? name.join('.') : name;
    return (
      <div>
        {React.Children.map(children, (child: any) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child, {
            'data-testid': child.props['data-testid'] ?? nameKey,
          });
        })}
      </div>
    );
  };
  FormComponent.List = ({ children }: any) => {
    return children(mockSourceFields, {
      add: (...args: any[]) => mockSourceListAdd(...args),
      remove: (...args: any[]) => mockSourceListRemove(...args),
    });
  };

  const InputNumber = ({ onChange, value }: any) => (
    <input
      type='number'
      value={value ?? ''}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );

  const Collapse = ({ items, expandIcon }: any) => (
    <div>
      {items?.map((item: any) => (
        <div key={item.key}>
          <div>{expandIcon?.({ isActive: true })}</div>
          <div>{expandIcon?.({ isActive: false })}</div>
          <div>{toText(item.label)}</div>
          {item.children}
        </div>
      ))}
    </div>
  );

  return {
    __esModule: true,
    Button,
    Drawer,
    Space,
    Input,
    Select,
    Switch,
    Divider,
    Card,
    Form: FormComponent,
    InputNumber,
    Collapse,
  };
});

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
    children,
    submitter,
  }: any) => {
    const valuesRef = React.useRef({ ...initialValues });

    const buildFormApi = React.useCallback(() => {
      const api = {
        submit: async () => {
          return onFinish?.();
        },
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
      buildFormApi();
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

describe('ProcessExchangeCreate', () => {
  const defaultProps = {
    direction: 'output',
    lang: 'en',
    onData: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnitConvertState.visible = false;
    mockUnitConvertState.onOk = undefined;
  });

  it('renders disabled create button when disabled prop is true', () => {
    render(<ProcessExchangeCreate {...defaultProps} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens drawer and submits form data', async () => {
    const onData = jest.fn();

    render(<ProcessExchangeCreate {...defaultProps} onData={onData} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog', { name: 'Create Exchange' })).toBeInTheDocument();
    expect(proFormApi).not.toBeNull();
    expect(triggerValuesChange).not.toBeNull();

    const currentValues = proFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      proFormApi?.setFieldsValue({ meanAmount: 10, quantitativeReference: true });
      triggerValuesChange?.({}, { ...currentValues, meanAmount: 10, quantitativeReference: true });
    });

    await waitFor(() => {
      expect(proFormApi?.getFieldsValue()).toEqual({
        meanAmount: 10,
        quantitativeReference: true,
        exchangeDirection: 'Output',
      });
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({ meanAmount: 10, quantitativeReference: true }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create Exchange' })).not.toBeInTheDocument(),
    );
  });

  it('saves the latest flow reference even when the change snapshot has no name', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeCreate {...defaultProps} onData={onData} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    const latestValues = {
      ...proFormApi.getFieldsValue(),
      meanAmount: 1,
      resultingAmount: 1,
      referenceToFlowDataSet: {
        '@refObjectId': 'flow-selected-last',
        '@version': '01.01.002',
        'common:shortDescription': [
          { '@xml:lang': 'zh', '#text': '测试流' },
          { '@xml:lang': 'en', '#text': 'Test flow' },
        ],
      },
    };
    await act(async () => {
      proFormApi.setFieldsValue(latestValues);
      triggerValuesChange?.(
        {},
        {
          ...latestValues,
          referenceToFlowDataSet: {
            ...latestValues.referenceToFlowDataSet,
            'common:shortDescription': [],
          },
        },
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith(expect.objectContaining(latestValues));
    });
  });

  it('shows unit convert dialog when amount field is clicked and applies conversion', async () => {
    render(<ProcessExchangeCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    const meanAmountInput = screen.getByTestId('meanAmount');
    fireEvent.click(meanAmountInput);

    expect(mockUnitConvertState.visible).toBe(true);
    await act(async () => {
      mockUnitConvertState.onOk?.('123');
    });

    await waitFor(() => {
      expect(proFormApi?.getFieldValue('meanAmount')).toBe('123');
    });
  });

  it('normalizes exchange location to a plain string code before saving', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeCreate {...defaultProps} onData={onData} />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await act(async () => {
      proFormApi?.setFieldsValue({
        location: [{ '@xml:lang': 'en', '#text': 'CN' }],
      });
      triggerValuesChange?.({}, proFormApi?.getFieldsValue());
    });

    await act(async () => {
      await proFormApi?.submit();
    });

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith({ exchangeDirection: 'Output', location: 'CN' });
    });
  });

  it('updates flow and source references, switches direction, and saves from the footer button', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeCreate {...defaultProps} onData={onData} />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    expect(screen.getByTestId('flow-select-mode')).toHaveTextContent('false');
    fireEvent.change(screen.getByTestId('exchangeDirection'), { target: { value: 'Input' } });
    await act(async () => {
      proFormApi?.setFieldValue('exchangeDirection', 'Input');
      triggerValuesChange?.({}, proFormApi?.getFieldsValue());
    });
    expect(screen.getByTestId('flow-select-mode')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'trigger-flow-data' }));
    fireEvent.click(screen.getByRole('button', { name: /Data source\(s\)1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add.*Data source\(s\).*Item/i }));
    fireEvent.click(screen.getAllByTestId('close-action')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockSourceListAdd).toHaveBeenCalledWith({});
      expect(mockSourceListRemove).toHaveBeenCalledWith(0);
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          exchangeDirection: 'Input',
          referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
        }),
      );
    });
  });

  it('shows uncertainty and quantitative-reference sections after value changes', async () => {
    render(<ProcessExchangeCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await act(async () => {
      proFormApi?.setFieldValue('uncertaintyDistributionType', 'triangular');
      triggerValuesChange?.({}, proFormApi?.getFieldsValue());
    });

    expect(screen.getByTestId('minimumAmount')).toBeInTheDocument();
    expect(screen.getByTestId('maximumAmount')).toBeInTheDocument();

    await act(async () => {
      proFormApi?.setFieldValue('uncertaintyDistributionType', 'log-normal');
      triggerValuesChange?.({}, proFormApi?.getFieldsValue());
    });

    expect(screen.getByTestId('relativeStandardDeviation95In')).toBeInTheDocument();

    await act(async () => {
      proFormApi?.setFieldValue('quantitativeReference', true);
      triggerValuesChange?.({}, proFormApi?.getFieldsValue());
    });

    expect(screen.getAllByTestId('lang-form')).toHaveLength(2);
  });

  it('closes the unit converter and drawer through icon, header, and cancel actions', async () => {
    render(<ProcessExchangeCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    fireEvent.click(screen.getByTestId('resultingAmount'));
    expect(screen.getByTestId('unit-convert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-convert' }));
    await waitFor(() => expect(screen.queryByTestId('unit-convert')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /close-outlined/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create Exchange' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create Exchange' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create Exchange' })).not.toBeInTheDocument(),
    );
  });

  it('handles input direction, showRules rendering, and undefined form-value fallbacks', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeCreate {...defaultProps} direction='input' onData={onData} showRules />);

    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    expect(mockGetRules).toHaveBeenCalled();
    expect(screen.getByTestId('flow-select-mode')).toHaveTextContent('true');

    await act(async () => {
      triggerValuesChange?.({}, undefined);
    });

    proFormApi.getFieldsValue = () => undefined;
    fireEvent.click(screen.getByRole('button', { name: 'trigger-flow-data' }));
    proFormApi.getFieldsValue = () => undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith({});
    });
  });
});
