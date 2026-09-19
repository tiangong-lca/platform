// @ts-nocheck
import ProcessExchangeEdit from '@/pages/Processes/Components/Exchange/edit';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let mockProFormApi: any = null;
let triggerValuesChange: ((_: any, values: any) => void) | null = null;
let mockSourceListAdd = jest.fn();
let mockSourceListRemove = jest.fn();
let mockSourceFields: Array<{ key: string; name: number }> = [];

const mockNormalizeFieldName = (name: any) => JSON.stringify(Array.isArray(name) ? name : [name]);

beforeEach(() => {
  mockProFormApi = null;
  (globalThis as any).__TEST_PROCESS_EXCHANGE_FORM_API__ = null;
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
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, any>) => {
      const messages: Record<string, string> = {
        'pages.validationIssues.sdkDetail.suggestedFix.required_missing': 'Fill in this field',
        'pages.validationIssues.sdkDetail.suggestedFix.string_too_long':
          'Current length is {actualLength} characters; keep this within {maximum} characters',
        'pages.validationIssues.sdkDetail.suggestedFix.invalid_type':
          'Enter this in the correct format',
        'pages.validationIssues.sdkDetail.suggestedFix.empty_test': '',
        'pages.validationIssues.sdkDetail.suggestedFix.localized_text_zh_must_include_chinese_character':
          'Chinese text must include at least one Chinese character',
      };
      const template = messages[id] ?? defaultMessage ?? id ?? '';

      return Object.entries(values ?? {}).reduce((message, [key, value]) => {
        return message.split(`{${key}}`).join(String(value));
      }, template);
    },
  }),
}));

const mockUnitConvertState: { visible: boolean; onOk?: (value: any) => void } = { visible: false };
const mockGetRules = jest.fn(() => [{ required: true }]);

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: (...args: any[]) => mockGetRules(...args),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CaretRightOutlined: ({ rotate }: any) => <span>{`caret-${rotate ?? 0}`}</span>,
  CloseOutlined: (props: any) => (
    <span data-testid={props.onClick ? 'close-action' : 'close-icon'} onClick={props.onClick}>
      close-outlined
    </span>
  ),
  FormOutlined: () => <span>edit-icon</span>,
}));

jest.mock('@/components/UnitConvert', () => ({
  __esModule: true,
  default: ({ visible, onOk, onCancel }: any) => {
    mockUnitConvertState.visible = visible;
    mockUnitConvertState.onOk = onOk;
    return visible ? (
      <div data-testid='unit-convert'>
        <button type='button' onClick={() => onOk?.('88')}>
          convert-unit
        </button>
        <button type='button' onClick={onCancel}>
          close-unit
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
          trigger-flow
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
  default: ({ name, fieldErrorMessages }: any) => {
    const { Form, Input } = require('antd');
    const fieldName = Array.isArray(name) ? [...name, 0, '#text'] : [name, 0, '#text'];
    const fieldErrorEntries = Object.entries(fieldErrorMessages ?? {}) as Array<[string, string[]]>;

    return (
      <div data-testid='lang-form'>
        <Form.Item name={fieldName}>
          <Input />
        </Form.Item>
        {fieldErrorEntries.flatMap(([rowIndex, messages]) =>
          messages.map((message: string, index: number) => (
            <div key={`sdk-lang-error-${rowIndex}-${index}`}>{message}</div>
          )),
        )}
      </div>
    );
  },
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
    const { children, onClick, disabled, icon, type, ...rest } = props;
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
  const Card = ({ children }: any) => <div>{children}</div>;
  const Divider = () => <hr />;

  const Input = ({ onClick, 'data-testid': dataTestId }: any) => (
    <input data-testid={dataTestId} readOnly onClick={onClick} />
  );

  const InputNumber = ({ onChange, value, 'data-testid': dataTestId }: any) => (
    <input
      data-testid={dataTestId}
      type='number'
      value={value ?? ''}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
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
      checked={props.checked}
      onChange={(event) => props.onChange?.(event.target.checked)}
    />
  );

  const FormComponent = ({ children }: any) => <div>{children}</div>;
  FormComponent.Item = ({ children, name }: any) => {
    const React = require('react');
    const nameKey = Array.isArray(name) ? name.join('.') : name;
    const currentFormApi = (globalThis as any).__TEST_PROCESS_EXCHANGE_FORM_API__;
    const rawErrors =
      name && typeof currentFormApi?.getFieldError === 'function'
        ? currentFormApi.getFieldError(name)
        : [];
    const errors = Array.isArray(rawErrors) ? rawErrors : [];
    return (
      <div data-testid={nameKey ? `form-item-${nameKey}` : undefined}>
        {React.Children.map(children, (child: any) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child, {
            'data-testid': child.props['data-testid'] ?? nameKey,
          });
        })}
        {errors.map((errorMessage: string, index: number) => (
          <div key={`${nameKey ?? 'field'}-${index}`}>{errorMessage}</div>
        ))}
      </div>
    );
  };
  FormComponent.List = ({ children }: any) => {
    return children(mockSourceFields, {
      add: (...args: any[]) => mockSourceListAdd(...args),
      remove: (...args: any[]) => mockSourceListRemove(...args),
    });
  };

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
    Tooltip,
    Drawer,
    Space,
    Card,
    Divider,
    Input,
    InputNumber,
    Select,
    Switch,
    Form: FormComponent,
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
    const errorStoreRef = React.useRef(new Map<string, string[]>());

    const buildApi = React.useCallback(() => {
      const api = {
        getFieldError: (name: any) => errorStoreRef.current.get(mockNormalizeFieldName(name)) ?? [],
        scrollToField: jest.fn(),
        setFields: (fields: Array<{ errors?: string[]; name: any }>) => {
          fields.forEach((field) => {
            errorStoreRef.current.set(mockNormalizeFieldName(field.name), [
              ...(field.errors ?? []),
            ]);
          });
        },
        submit: async () => onFinish?.(),
        resetFields: () => {
          valuesRef.current = { ...initialValues };
          errorStoreRef.current = new Map();
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
          errorStoreRef.current.delete(mockNormalizeFieldName(name));
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
      mockProFormApi = api;
      (globalThis as any).__TEST_PROCESS_EXCHANGE_FORM_API__ = api;
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

describe('ProcessExchangeEdit', () => {
  const exchangeList = [
    { '@dataSetInternalID': '0', meanAmount: 5, exchangeDirection: 'output', name: 'first' },
    { '@dataSetInternalID': '1', meanAmount: 6, exchangeDirection: 'input', name: 'second' },
  ];

  const defaultProps = {
    id: '0',
    data: exchangeList,
    lang: 'en',
    buttonType: 'icon',
    setViewDrawerVisible: jest.fn(),
    onData: jest.fn(),
    showRules: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnitConvertState.visible = false;
    mockUnitConvertState.onOk = undefined;
  });

  it('saves the latest flow reference even when the change snapshot has no name', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeEdit {...defaultProps} onData={onData} />);
    fireEvent.click(screen.getByRole('button'));

    const latestValues = {
      ...mockProFormApi.getFieldsValue(),
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
      mockProFormApi.setFieldsValue(latestValues);
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
      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining(latestValues),
        defaultProps.data[1],
      ]);
    });
  });

  it('disables edit button when disabled', () => {
    render(<ProcessExchangeEdit {...defaultProps} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens drawer and preloads exchange data', async () => {
    render(<ProcessExchangeEdit {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    const dialog = screen.getByRole('dialog', { name: 'Edit Exchange' });
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(mockProFormApi?.getFieldsValue()).toEqual(
        expect.objectContaining({ meanAmount: 5, '@dataSetInternalID': '0' }),
      );
    });
  });

  it('normalizes historical undefined amount strings to empty form values', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        data={[
          {
            '@dataSetInternalID': '0',
            meanAmount: 'undefined',
            resultingAmount: 'undefined',
            exchangeDirection: 'output',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockProFormApi?.getFieldValue('meanAmount')).toBeUndefined();
      expect(mockProFormApi?.getFieldValue('resultingAmount')).toBeUndefined();
    });
  });

  it('normalizes legacy multilingual exchange location to a plain string in the form', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        data={[
          {
            '@dataSetInternalID': '0',
            exchangeDirection: 'input',
            location: [{ '@xml:lang': 'en', '#text': 'CN' }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockProFormApi?.getFieldValue('location')).toBe('CN');
    });
  });

  it('submits updated exchange data', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeEdit {...defaultProps} onData={onData} />);

    fireEvent.click(screen.getByRole('button'));

    mockProFormApi?.setFieldsValue({ meanAmount: 15 });
    const updatedValues = mockProFormApi?.getFieldsValue() ?? {};
    await act(async () => {
      triggerValuesChange?.({}, updatedValues);
    });

    await act(async () => {
      await mockProFormApi?.submit();
    });

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining({ meanAmount: 15 }),
        defaultProps.data[1],
      ]);
    });
  });

  it('keeps only the edited exchange selected when saving a quantitative reference', async () => {
    const onData = jest.fn();
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        onData={onData}
        data={[
          {
            '@dataSetInternalID': '0',
            exchangeDirection: 'output',
            quantitativeReference: true,
          },
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'input',
            quantitativeReference: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await act(async () => {
      mockProFormApi?.setFieldValue('quantitativeReference', true);
      triggerValuesChange?.({}, mockProFormApi?.getFieldsValue());
    });

    await act(async () => {
      await mockProFormApi?.submit();
    });

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining({
          '@dataSetInternalID': '0',
          quantitativeReference: true,
        }),
        expect.objectContaining({
          '@dataSetInternalID': '1',
          quantitativeReference: false,
        }),
      ]);
    });
  });

  it('applies unit conversion result to the form', async () => {
    render(<ProcessExchangeEdit {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    const meanAmountInput = screen.getByTestId('meanAmount');
    fireEvent.click(meanAmountInput);

    expect(mockUnitConvertState.visible).toBe(true);
    await act(async () => {
      mockUnitConvertState.onOk?.('200');
    });

    await waitFor(() => {
      expect(mockProFormApi?.getFieldValue('meanAmount')).toBe('200');
    });
  });

  it('opens from the text trigger, updates flow and source references, and saves from the footer', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeEdit {...defaultProps} buttonType='text' onData={onData} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByTestId('flow-select-mode')).toHaveTextContent('false');
    fireEvent.change(screen.getByTestId('exchangeDirection'), { target: { value: 'input' } });
    await act(async () => {
      mockProFormApi?.setFieldValue('exchangeDirection', 'input');
      triggerValuesChange?.({}, mockProFormApi?.getFieldsValue());
    });
    expect(screen.getByTestId('flow-select-mode')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'trigger-flow' }));
    fireEvent.click(screen.getByRole('button', { name: /Data source\(s\)1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add.*Data source\(s\).*Item/i }));
    fireEvent.click(screen.getAllByTestId('close-action')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockSourceListAdd).toHaveBeenCalledWith({});
      expect(mockSourceListRemove).toHaveBeenCalledWith(0);
      expect(onData).toHaveBeenCalledWith([
        expect.objectContaining({
          '@dataSetInternalID': '0',
          exchangeDirection: 'input',
          referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
        }),
        defaultProps.data[1],
      ]);
    });
  });

  it('shows conditional uncertainty and quantitative-reference sections after form changes', async () => {
    render(<ProcessExchangeEdit {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));

    await act(async () => {
      mockProFormApi?.setFieldValue('uncertaintyDistributionType', 'triangular');
      triggerValuesChange?.({}, mockProFormApi?.getFieldsValue());
    });

    expect(screen.getByTestId('minimumAmount')).toBeInTheDocument();
    expect(screen.getByTestId('maximumAmount')).toBeInTheDocument();

    await act(async () => {
      mockProFormApi?.setFieldValue('uncertaintyDistributionType', 'log-normal');
      triggerValuesChange?.({}, mockProFormApi?.getFieldsValue());
    });

    expect(screen.getByTestId('relativeStandardDeviation95In')).toBeInTheDocument();

    await act(async () => {
      mockProFormApi?.setFieldValue('quantitativeReference', true);
      triggerValuesChange?.({}, mockProFormApi?.getFieldsValue());
    });

    expect(screen.getAllByTestId('lang-form')).toHaveLength(2);
  });

  it('closes the unit converter and the drawer through icon, header, and cancel actions', async () => {
    render(<ProcessExchangeEdit {...defaultProps} />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByTestId('resultingAmount'));
    expect(screen.getByTestId('unit-convert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close-unit' }));
    await waitFor(() => expect(screen.queryByTestId('unit-convert')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /close-outlined/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit Exchange' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit Exchange' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit Exchange' })).not.toBeInTheDocument(),
    );
  });

  it('falls back to an empty initial exchange when the target id is missing and showRules is omitted', async () => {
    render(
      <ProcessExchangeEdit
        id='missing'
        data={exchangeList}
        lang='en'
        buttonType='icon'
        setViewDrawerVisible={jest.fn()}
        onData={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockProFormApi?.getFieldsValue()).toEqual({});
    });
  });

  it('uses rule-enabled rendering and falls back to empty objects for undefined form values', async () => {
    const onData = jest.fn();
    render(<ProcessExchangeEdit {...defaultProps} onData={onData} showRules />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockGetRules).toHaveBeenCalled();

    await act(async () => {
      triggerValuesChange?.({}, undefined);
    });

    mockProFormApi.getFieldsValue = () => undefined;
    fireEvent.click(screen.getByRole('button', { name: 'trigger-flow' }));
    mockProFormApi.getFieldsValue = () => undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith([{}, defaultProps.data[1]]);
    });
  });

  it('auto opens and applies sdk field highlights for the targeted exchange issue', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        showRules
        sdkHighlights={[
          {
            key: 'sdk-highlight-1',
            fieldKey: 'meanAmount',
            fieldLabel: 'Mean amount',
            fieldPath: 'exchange[#0].meanAmount',
            formName: ['meanAmount'],
            reasonMessage: 'Expected string but found undefined',
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(screen.getByText('Fill in this field')).toBeInTheDocument();
    expect(screen.queryByText('Please input mean amount')).not.toBeInTheDocument();
    expect(screen.queryByText(/Expected string but found undefined/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('sdk-highlight-meanAmount')).not.toBeInTheDocument();

    expect(mockProFormApi?.scrollToField).not.toHaveBeenCalled();
  });

  it('shows sdk string length errors on localized exchange comments', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        sdkHighlights={[
          {
            key: 'sdk-comment-too-long',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment (EN)',
            fieldPath: 'exchange[#0].generalComment.0.#text',
            formName: ['generalComment', 0, '#text'],
            reasonMessage: 'Text length 1542 exceeds maximum 500',
            suggestedFix: 'Shorten this text to 500 characters or fewer.',
            validationCode: 'string_too_long',
            validationParams: {
              actualLength: 1542,
              maximum: 500,
            },
          },
          {
            key: 'sdk-comment-too-long-without-index',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment',
            fieldPath: 'exchange[#0].generalComment.#text',
            formName: ['generalComment', '#text'],
            reasonMessage: 'Text length 600 exceeds maximum 500',
            suggestedFix: 'Shorten this text to 500 characters or fewer.',
            validationCode: 'string_too_long',
            validationParams: {
              actualLength: 600,
              maximum: 500,
            },
          },
          {
            key: 'sdk-empty-comment-message',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment',
            fieldPath: 'exchange[#0].generalComment.1.#text',
            formName: ['generalComment', 1, '#text'],
            reasonMessage: '',
            suggestedFix: '',
          },
          {
            key: 'sdk-non-string-field-name',
            fieldKey: '0.#text',
            fieldLabel: 'Unknown',
            fieldPath: 'exchange[#0].0.#text',
            formName: [0, '#text'],
            reasonMessage: 'Text length 700 exceeds maximum 500',
            suggestedFix: 'Shorten this text to 500 characters or fewer.',
            validationCode: 'string_too_long',
            validationParams: {
              actualLength: 700,
              maximum: 500,
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText('Current length is 1542 characters; keep this within 500 characters'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Current length is 600 characters; keep this within 500 characters'),
      ).toBeInTheDocument();
    });
    expect(mockProFormApi?.getFieldError(['generalComment', 0, '#text'])).toEqual([]);
    expect(mockProFormApi?.scrollToField).not.toHaveBeenCalled();
  });

  it('ignores localized exchange comment highlights whose resolved message is empty', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        sdkHighlights={[
          {
            key: 'sdk-empty-localized-comment-message',
            fieldKey: 'generalComment',
            fieldPath: 'exchange[#0].generalComment.0.#text',
            formName: ['generalComment', 0, '#text'],
            validationCode: 'empty_test',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Check and fix this field')).not.toBeInTheDocument();
    expect(mockProFormApi?.getFieldError(['generalComment', 0, '#text'])).toEqual([]);
  });

  it('maps raw tidas localized exchange comment paths onto drawer comment rows', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        id='1'
        autoOpen
        sdkHighlights={[
          {
            key: 'sdk-raw-tidas-zh-comment-path',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment (ZH)',
            fieldPath: 'processDataSet.exchanges.exchange.1.generalComment.1.#text',
            reasonMessage:
              "@xml:lang values starting with 'zh' must include at least one Chinese character",
            validationCode: 'localized_text_zh_must_include_chinese_character',
          },
          {
            key: 'sdk-raw-tidas-zh-comment-form-name',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment (ZH)',
            fieldPath: 'exchange[#1].generalComment.1.#text',
            formName: ['processDataSet', 'exchanges', 'exchange', 1, 'generalComment', 1, '#text'],
            reasonMessage:
              "@xml:lang values starting with 'zh' must include at least one Chinese character",
            validationCode: 'localized_text_zh_must_include_chinese_character',
          },
          {
            key: 'sdk-anchored-exchange-comment-form-name',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment (ZH)',
            fieldPath: 'exchange[#1].generalComment.1.#text',
            formName: ['exchange[#1]', 'generalComment', 1, '#text'],
            reasonMessage:
              "@xml:lang values starting with 'zh' must include at least one Chinese character",
            validationCode: 'localized_text_zh_must_include_chinese_character',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(
      screen.getAllByText('Chinese text must include at least one Chinese character'),
    ).toHaveLength(1);
    expect(mockProFormApi?.getFieldError(['generalComment', 1, '#text'])).toEqual([]);
    expect(mockProFormApi?.scrollToField).not.toHaveBeenCalled();
  });

  it('keeps auto-open idempotent when strict-mode replays mount effects', async () => {
    render(
      <React.StrictMode>
        <ProcessExchangeEdit {...defaultProps} autoOpen />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit Exchange' })).not.toBeInTheDocument();
    });
  });

  it('deduplicates repeated sdk field messages and ignores unmappable highlights', async () => {
    const props = {
      ...defaultProps,
      autoOpen: true,
      sdkHighlights: [
        {
          key: 'sdk-ignored-no-path',
          suggestedFix: 'Ignored because no field can be resolved.',
        },
        {
          key: 'sdk-ignored-empty-path',
          fieldPath: 'exchange[#0].',
          suggestedFix: 'Ignored because no field can be resolved.',
        },
        {
          key: 'sdk-duplicate-1',
          fieldKey: 'meanAmount',
          fieldLabel: 'Mean amount',
          fieldPath: 'exchange[#0].meanAmount',
          formName: ['meanAmount'],
          suggestedFix: 'Duplicate sdk warning',
          validationCode: 'invalid_type',
        },
        {
          key: 'sdk-duplicate-2',
          fieldKey: 'meanAmount',
          fieldLabel: 'Mean amount',
          fieldPath: 'exchange[#0].meanAmount',
          formName: ['meanAmount'],
          suggestedFix: 'Duplicate sdk warning',
          validationCode: 'invalid_type',
        },
      ],
    };

    const { rerender } = render(<ProcessExchangeEdit {...props} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Enter this in the correct format')).toHaveLength(1);

    const setFieldsSpy = jest.spyOn(mockProFormApi, 'setFields');
    setFieldsSpy.mockClear();

    rerender(<ProcessExchangeEdit {...props} />);

    await act(async () => {});
    expect(setFieldsSpy).not.toHaveBeenCalled();
  });

  it('skips sdk field updates when rerendered highlights keep the same field errors', async () => {
    const highlight = {
      key: 'sdk-stable-mean-amount',
      fieldKey: 'meanAmount',
      fieldLabel: 'Mean amount',
      fieldPath: 'exchange[#0].meanAmount',
      formName: ['meanAmount'],
      suggestedFix: 'Stable sdk warning',
      validationCode: 'invalid_type',
    };
    const { rerender } = render(
      <ProcessExchangeEdit {...defaultProps} autoOpen sdkHighlights={[highlight]} />,
    );

    await waitFor(() => {
      expect(mockProFormApi?.getFieldError(['meanAmount'])).toEqual([
        'Enter this in the correct format',
      ]);
    });

    const setFieldsSpy = jest.spyOn(mockProFormApi, 'setFields');
    setFieldsSpy.mockClear();

    rerender(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        sdkHighlights={[{ ...highlight, fieldLabel: 'Mean amount' }]}
      />,
    );

    await act(async () => {});
    expect(setFieldsSpy).not.toHaveBeenCalled();
  });

  it('suppresses local required sdk copy for exchange selectors', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        showRules
        sdkHighlights={[
          {
            key: 'sdk-reference-required',
            fieldKey: 'referenceToFlowDataSet',
            fieldLabel: 'Flow',
            fieldPath: 'exchange[#0].referenceToFlowDataSet.@refObjectId',
            formName: ['referenceToFlowDataSet', '@refObjectId'],
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Fill in this field')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Fill in the required value for this field.'),
    ).not.toBeInTheDocument();
  });

  it('renders sdk version errors on exchange selector version fields', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        sdkHighlights={[
          {
            key: 'sdk-flow-version-required',
            fieldKey: '@version',
            fieldLabel: 'Version',
            fieldPath: 'exchange[#0].referenceToFlowDataSet.@version',
            formName: ['referenceToFlowDataSet', '@version'],
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
          {
            key: 'sdk-source-version-required',
            fieldKey: '@version',
            fieldLabel: 'Version',
            fieldPath: 'exchange[#0].referencesToDataSource.referenceToDataSource.0.@version',
            formName: ['referencesToDataSource', 'referenceToDataSource', 0, '@version'],
            suggestedFix: 'Fill in the required value for this field.',
            validationCode: 'required_missing',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(mockProFormApi?.getFieldError(['referenceToFlowDataSet', '@version'])).toEqual([
      'Fill in this field',
    ]);
    expect(
      mockProFormApi?.getFieldError([
        'referencesToDataSource',
        'referenceToDataSource',
        0,
        '@version',
      ]),
    ).toEqual(['Fill in this field']);
  });

  it('does not auto-scroll when sdk highlights are present', async () => {
    render(
      <ProcessExchangeEdit
        {...defaultProps}
        autoOpen
        sdkHighlights={[
          {
            key: 'sdk-invalid-focus',
            fieldPath: 'exchange[#0].',
            suggestedFix: 'Ignored because no field can be resolved.',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(mockProFormApi?.scrollToField).not.toHaveBeenCalled();
  });

  it('parses field-path-only sdk highlights, appends distinct messages, and clears removed entries', async () => {
    const props = {
      ...defaultProps,
      autoOpen: true,
      sdkHighlights: [
        {
          key: 'sdk-fieldkey-only',
          fieldKey: 'meanAmount',
          suggestedFix: 'Need an amount',
          validationCode: 'invalid_type',
        },
        {
          key: 'sdk-source-reference-1',
          fieldPath: 'exchange[#0].referencesToDataSource.referenceToDataSource.1.@refObjectId',
          suggestedFix: 'Choose a source reference',
          validationCode: 'required_missing',
        },
        {
          key: 'sdk-source-reference-2',
          fieldPath: 'exchange[#0].referencesToDataSource.referenceToDataSource.1.@refObjectId',
          suggestedFix: 'Use a valid source reference',
          validationCode: 'invalid_type',
        },
      ],
    };

    const { rerender } = render(<ProcessExchangeEdit {...props} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    expect(mockProFormApi?.scrollToField).not.toHaveBeenCalled();
    expect(mockProFormApi?.getFieldError(['meanAmount'])).toEqual([
      'Enter this in the correct format',
    ]);
    expect(
      mockProFormApi?.getFieldError([
        'referencesToDataSource',
        'referenceToDataSource',
        1,
        '@refObjectId',
      ]),
    ).toEqual(['Fill in this field', 'Enter this in the correct format']);

    rerender(<ProcessExchangeEdit {...props} sdkHighlights={[]} />);

    await waitFor(() => {
      expect(mockProFormApi?.getFieldError(['meanAmount'])).toEqual([]);
    });

    expect(
      mockProFormApi?.getFieldError([
        'referencesToDataSource',
        'referenceToDataSource',
        1,
        '@refObjectId',
      ]),
    ).toEqual([]);
  });

  it('falls back to an empty error list when the form api returns undefined field errors', async () => {
    const props = {
      ...defaultProps,
      autoOpen: true,
    };

    const { rerender } = render(<ProcessExchangeEdit {...props} sdkHighlights={[]} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit Exchange' })).toBeInTheDocument();
    });

    const originalGetFieldError = mockProFormApi.getFieldError;
    const originalSetFields = mockProFormApi.setFields;
    let returnUndefinedForMeanAmount = true;
    mockProFormApi.getFieldError = jest.fn((name: any) => {
      if (
        returnUndefinedForMeanAmount &&
        mockNormalizeFieldName(name) === mockNormalizeFieldName(['meanAmount'])
      ) {
        return undefined;
      }
      return originalGetFieldError(name);
    });
    mockProFormApi.setFields = jest.fn((fields: any) => {
      returnUndefinedForMeanAmount = false;
      return originalSetFields(fields);
    });

    rerender(
      <ProcessExchangeEdit
        {...props}
        sdkHighlights={[
          {
            key: 'sdk-mean-amount-required',
            fieldPath: 'exchange[#0].meanAmount',
            suggestedFix: 'Need an amount',
            validationCode: 'invalid_type',
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(mockProFormApi?.getFieldError(['meanAmount'])).toEqual([
        'Enter this in the correct format',
      ]);
    });
  });
});
