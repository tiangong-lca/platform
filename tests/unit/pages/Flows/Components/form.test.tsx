// @ts-nocheck
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FlowForm } from '@/pages/Flows/Components/form';
import { SUPPORTED_CONTENT_LANGUAGES } from '@/services/general/contentLanguageRegistry';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.label) return toText(node.props.label);
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let mockSelectProps: any[] = [];
let mockPropertyCreateProps: any = null;
let mockPropertyEditProps: any = null;
let mockPropertyDeleteProps: any = null;
let mockLevelFormCalls: any[] = [];
let mockLangFormCalls: any[] = [];
let mockSourceSelectCalls: any[] = [];

const mockGenFlowPropertyTabTableData = jest.fn((data: any[]) => data);
const mockGetUnitData = jest.fn();
let mockRefCheckContextValue: any = { refCheckData: [] };

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => {
      const messages: Record<string, string> = {
        'pages.validationIssues.sdkDetail.suggestedFix.flow_properties_required':
          'Please select flow properties',
      };

      return messages[id] ?? defaultMessage ?? id;
    },
  }),
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');
  const ProTable = (props: any) => {
    if (props.actionRef) {
      props.actionRef.current = { reload: jest.fn() };
    }
    const rowClass = props.rowClassName ? props.rowClassName(props.dataSource?.[0] || {}) : '';
    const toolbar = props.toolBarRender ? props.toolBarRender() : null;
    return (
      <div
        data-testid='pro-table'
        data-row-class={rowClass}
        data-materialized-language={props.dataSource?.[0]?.materializedLanguage ?? ''}
      >
        <div data-testid='pro-table-toolbar'>{toolbar}</div>
        {(props.columns || []).map((col: any, idx: number) =>
          typeof col.render === 'function' ? (
            <div key={col.dataIndex || idx}>
              {col.render(null, props.dataSource?.[0] || {}, idx)}
            </div>
          ) : null,
        )}
      </div>
    );
  };
  return { __esModule: true, ProTable };
});

jest.mock('antd', () => {
  const React = require('react');
  const Card = ({ tabList = [], activeTabKey, onTabChange, children }: any) => (
    <div data-testid='card'>
      <div>
        {tabList.map((tab: any) => (
          <button type='button' key={tab.key} onClick={() => onTabChange?.(tab.key)}>
            {tab.tab}
          </button>
        ))}
      </div>
      <div data-testid='active-tab'>{activeTabKey}</div>
      {children}
    </div>
  );
  const Form = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ label, children }: any) => (
    <label>
      {toText(label)}
      {children}
    </label>
  );
  const Input = ({ value = '', onChange, ...rest }: any) => (
    <input value={value} onChange={(e) => onChange?.(e)} {...rest} />
  );
  const Select = (props: any) => {
    mockSelectProps.push(props);
    return (
      <button
        type='button'
        data-testid={`select-${mockSelectProps.length - 1}`}
        onClick={() => props.onChange?.(props.options?.[0]?.value ?? 'selected')}
      >
        select
      </button>
    );
  };
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children }: any) => <>{children}</>;
  const Divider = ({ children }: any) => <div>{children}</div>;
  const theme = {
    useToken: () => ({
      token: {
        colorError: '#ff4d4f',
        colorPrimary: '#1677ff',
        colorTextDescription: '#000',
        fontWeightStrong: 600,
      },
    }),
  };
  return { __esModule: true, Card, Form, Input, Select, Space, Tooltip, Divider, theme };
});

jest.mock('@/contexts/refCheckContext', () => ({
  __esModule: true,
  useRefCheckContext: () => mockRefCheckContextValue,
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getUnitData: (...args: any[]) => mockGetUnitData(...args),
  getLangText: (data: any) => data || 'text',
}));

jest.mock('@/services/flows/util', () => ({
  __esModule: true,
  genFlowPropertyTabTableData: (...args: any[]) => mockGenFlowPropertyTabTableData(...args),
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: () => [{ rule: true }],
}));

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='aligned-number'>{value}</span>,
}));

jest.mock('@/components/QuantitativeReferenceIcon', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='quantitative-icon'>{String(value)}</span>,
}));

jest.mock('@/components/RequiredMark', () => ({
  __esModule: true,
  default: ({ label }: any) => <span>{toText(label)}</span>,
}));

jest.mock('@/pages/Flows/Components/Property/view', () => ({
  __esModule: true,
  default: () => <div data-testid='property-view-mock' />,
}));

jest.mock('@/pages/Flows/Components/Property/create', () => ({
  __esModule: true,
  default: (props: any) => {
    mockPropertyCreateProps = props;
    return <div data-testid='property-create' />;
  },
}));
jest.mock('@/pages/Flows/Components/Property/edit', () => ({
  __esModule: true,
  default: (props: any) => {
    mockPropertyEditProps = props;
    return <div data-testid='property-edit' />;
  },
}));
jest.mock('@/pages/Flows/Components/Property/delete', () => ({
  __esModule: true,
  default: (props: any) => {
    mockPropertyDeleteProps = props;
    return <div data-testid='property-delete' />;
  },
}));

jest.mock('@/components/LangTextItem/form', () => ({
  __esModule: true,
  default: (props: any) => {
    mockLangFormCalls.push(props);
    return <div data-testid='lang-form'>lang-form</div>;
  },
}));
jest.mock('@/components/LevelTextItem/form', () => ({
  __esModule: true,
  default: (props: any) => {
    mockLevelFormCalls.push(props);
    return <div data-testid='level-form'>{String(props.hidden)}</div>;
  },
}));
jest.mock('@/components/LocationTextItem/form', () => ({
  __esModule: true,
  default: () => <div data-testid='location-form'>location-form</div>,
}));
jest.mock('@/pages/Contacts/Components/select/form', () => ({
  __esModule: true,
  default: () => <div data-testid='contact-select' />,
}));
jest.mock('@/pages/Sources/Components/select/form', () => ({
  __esModule: true,
  default: (props: any) => {
    mockSourceSelectCalls.push(props);
    return <div data-testid='source-select' />;
  },
}));

describe('FlowForm (src/pages/Flows/Components/form.tsx)', () => {
  const baseProps = () => ({
    lang: 'en',
    activeTabKey: 'flowInformation',
    drawerVisible: true,
    formRef: {
      current: { setFieldValue: jest.fn(), getFieldValue: jest.fn().mockReturnValue(null) },
    },
    onData: jest.fn(),
    flowType: 'Elementary flow',
    propertyDataSource: [
      {
        '@dataSetInternalID': '0',
        referenceToFlowPropertyDataSetId: 'flow-1',
        referenceToFlowPropertyDataSetVersion: '1.0',
      },
    ],
    onPropertyData: jest.fn(),
    onPropertyDataCreate: jest.fn(),
    onTabChange: jest.fn(),
    formType: 'create',
  });

  beforeEach(() => {
    mockSelectProps = [];
    mockPropertyCreateProps = null;
    mockPropertyEditProps = null;
    mockPropertyDeleteProps = null;
    mockLevelFormCalls = [];
    mockLangFormCalls = [];
    mockSourceSelectCalls = [];
    mockRefCheckContextValue = { refCheckData: [] };
    mockGetUnitData.mockResolvedValue([
      {
        dataSetInternalID: '0',
        referenceToFlowPropertyDataSetId: 'flow-1',
        referenceToFlowPropertyDataSetVersion: '1.0',
        meanValue: undefined,
      },
    ]);
  });

  it('renders property table data and marks error rows when ref check or mean value missing', async () => {
    mockRefCheckContextValue = { refCheckData: [{ id: 'flow-1', version: '1.0' }] };
    await act(async () => {
      render(<FlowForm {...baseProps()} showRules />);
    });

    await waitFor(() => {
      expect(mockGetUnitData).toHaveBeenCalled();
    });
    const table = await screen.findByTestId('pro-table');
    expect(table.getAttribute('data-row-class')).toBe('error-row');
    expect(mockPropertyCreateProps?.showRules).toBe(true);
    expect(mockPropertyEditProps?.showRules).toBe(true);
  });

  it('fires tab change callbacks', async () => {
    const props = baseProps();
    await act(async () => {
      render(<FlowForm {...props} />);
    });

    fireEvent.click(screen.getByText('Modelling and validation'));
    expect(props.onTabChange).toHaveBeenCalled();
  });

  it('highlights tabs with reference validation issues using the error color token', async () => {
    await act(async () => {
      render(<FlowForm {...baseProps()} validationIssueTabNames={['administrativeInformation']} />);
    });

    expect(screen.getByText('Administrative information').parentElement).toHaveStyle({
      color: '#ff4d4f',
      fontWeight: '600',
    });
  });

  it('resets classification fields when switching away from elementary flow', async () => {
    const props = { ...baseProps(), showRules: true };
    await act(async () => {
      render(<FlowForm {...props} />);
    });
    expect(mockLevelFormCalls.find((call) => call.hidden === false)?.showRules).toBe(true);

    const typeSelect = mockSelectProps.find((p) => (p.options || []).length === 2);
    act(() => {
      typeSelect.onChange('Product flow');
    });

    expect(props.formRef.current.setFieldValue).toHaveBeenCalledWith(
      expect.arrayContaining(['common:elementaryFlowCategorization']),
      null,
    );
    expect(props.formRef.current.setFieldValue).toHaveBeenCalledWith(
      expect.arrayContaining(['common:classification']),
      null,
    );
    const [elemForm, productForm] = mockLevelFormCalls.slice(-2);
    expect(elemForm.hidden).toBe(true);
    expect(productForm.hidden).toBe(false);
  });

  it('passes property data through getUnitData and renders columns', async () => {
    mockGetUnitData.mockResolvedValue([
      {
        dataSetInternalID: '0',
        referenceToFlowPropertyDataSetId: 'flow-1',
        referenceToFlowPropertyDataSetVersion: '1.0',
        meanValue: 5,
        quantitativeReference: true,
        refUnitRes: { name: 'unit-name', refUnitGeneralComment: 'comment', refUnitName: 'kg' },
      },
    ]);

    await act(async () => {
      render(<FlowForm {...baseProps()} showRules />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('aligned-number')).toBeInTheDocument();
      expect(screen.getByTestId('quantitative-icon')).toBeInTheDocument();
    });

    act(() => {
      mockPropertyEditProps?.setViewDrawerVisible?.(true);
      mockPropertyDeleteProps?.setViewDrawerVisible?.(false);
    });
  });

  it('clears property rows when unit data resolves to nothing and skips flow-type syncing while closed', async () => {
    const props = {
      ...baseProps(),
      drawerVisible: false,
      flowType: 'Product flow',
    };
    mockGetUnitData.mockResolvedValue(undefined);

    await act(async () => {
      render(<FlowForm {...props} />);
    });

    await waitFor(() => {
      expect(mockGetUnitData).toHaveBeenCalled();
    });

    expect(screen.getByTestId('pro-table').getAttribute('data-row-class')).toBe('');
    expect(mockLevelFormCalls.some((call) => call.flowType === 'Product flow')).toBe(true);
  });

  it('resets classification fields when switching back to elementary flow from another flow type', async () => {
    const props = {
      ...baseProps(),
      flowType: 'Product flow',
    };

    const classification = [
      {
        '@name': 'CPC Ver. 3.0',
        '@classes': 'https://example.org/cpc',
        'common:class': { id: ['1'], value: ['One'] },
      },
    ];
    const categories = {
      '@name': 'Category source',
      'common:category': { id: ['2'], value: ['Two'] },
    };
    props.formRef.current.getFieldValue.mockImplementation((path: any[]) => {
      if (path.at(-1) === 'common:classification') return classification;
      if (path.at(-1) === 'common:elementaryFlowCategorization') return categories;
      return undefined;
    });
    await act(async () => {
      render(<FlowForm {...props} />);
    });

    const typeSelect = mockSelectProps.find((p) => (p.options || []).length === 2);
    act(() => {
      typeSelect.onChange('Elementary flow');
    });

    expect(props.formRef.current.setFieldValue).toHaveBeenCalledWith(
      expect.arrayContaining(['common:elementaryFlowCategorization']),
      { ...categories, 'common:category': null },
    );
    expect(props.formRef.current.setFieldValue).toHaveBeenCalledWith(
      expect.arrayContaining(['common:classification']),
      [{ ...classification[0], 'common:class': null }],
    );
    expect(props.onData).toHaveBeenCalled();
  });

  it('does not inject create-only default sources when the form type is not create', async () => {
    const props = {
      ...baseProps(),
      formType: 'edit',
    };

    await act(async () => {
      render(<FlowForm {...props} />);
    });

    await waitFor(() => {
      expect(mockSourceSelectCalls.length).toBeGreaterThan(0);
      expect(mockLangFormCalls.length).toBeGreaterThan(0);
    });

    expect(
      mockSourceSelectCalls.find(
        (call) =>
          Array.isArray(call.name) && call.name.includes('common:referenceToComplianceSystem'),
      )?.defaultSourceName,
    ).toBeUndefined();
    expect(
      mockSourceSelectCalls.find(
        (call) => Array.isArray(call.name) && call.name.includes('common:referenceToDataSetFormat'),
      )?.defaultSourceName,
    ).toBeUndefined();
  });

  it('locks the dataset version in edit mode', async () => {
    await act(async () => {
      render(
        <FlowForm {...baseProps()} activeTabKey='administrativeInformation' formType='edit' />,
      );
    });

    expect(screen.getByRole('textbox', { name: /Data set version/i })).toBeDisabled();
  });

  it('passes sdk row highlights to property drawers and marks the focused row', async () => {
    mockGetUnitData.mockResolvedValue([
      {
        dataSetInternalID: '0',
        referenceToFlowPropertyDataSetId: 'flow-1',
        referenceToFlowPropertyDataSetVersion: '1.0',
        meanValue: '1',
      },
    ]);
    const focusedDetail = {
      fieldLabel: 'Mean value (of flow property)',
      fieldPath: 'flowProperty[#0].meanValue',
      formName: ['meanValue'],
      key: 'flow-property-0:meanValue',
      reasonMessage: 'Required value is missing',
      suggestedFix: 'Fill in the required value for this field.',
      tabName: 'flowProperties',
      validationCode: 'required_missing',
    };

    await act(async () => {
      render(
        <FlowForm
          {...baseProps()}
          activeTabKey='flowProperties'
          sdkValidationDetails={[focusedDetail]}
          sdkValidationFocus={focusedDetail}
        />,
      );
    });

    const table = await screen.findByTestId('pro-table');
    expect(table.getAttribute('data-row-class')).toBe('sdk-error-row sdk-focus-row');
    expect(mockPropertyEditProps?.sdkHighlights).toEqual([focusedDetail]);
    expect(mockPropertyEditProps?.autoOpen).toBe(true);
  });

  it('renders flow-properties section validation as a single compact alert line', async () => {
    await act(async () => {
      render(
        <FlowForm
          {...baseProps()}
          activeTabKey='flowProperties'
          sdkValidationDetails={[
            {
              fieldKey: 'flowProperties',
              fieldLabel: 'Flow properties',
              fieldPath: 'flowProperties.requiredSummary',
              key: 'flowProperties:required:section',
              presentation: 'section',
              reasonMessage: 'Please select flow properties',
              suggestedFix: 'Please select flow properties',
              tabName: 'flowProperties',
              validationCode: 'flow_properties_required',
            },
          ]}
        />,
      );
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please select flow properties');
    expect(alert.children).toHaveLength(0);
  });

  it('rematerializes every registry language and rejects a delayed stale language response', async () => {
    const deferredResolutions = new Map<string, () => void>();
    mockGenFlowPropertyTabTableData.mockImplementation((data: any[], language: string) =>
      data.map((row) => ({ ...row, materializedLanguage: language })),
    );
    mockGetUnitData.mockImplementation((_type: string, rows: any[]) => {
      const language = rows[0]?.materializedLanguage;
      return new Promise((resolve) => {
        deferredResolutions.set(language, () => resolve(rows));
      });
    });

    const props = { ...baseProps(), lang: SUPPORTED_CONTENT_LANGUAGES[0] };
    const { rerender } = render(<FlowForm {...props} />);
    const table = screen.getByTestId('pro-table');

    await waitFor(() => expect(deferredResolutions.has(SUPPORTED_CONTENT_LANGUAGES[0])).toBe(true));

    for (const language of SUPPORTED_CONTENT_LANGUAGES.slice(1)) {
      rerender(<FlowForm {...props} lang={language} />);

      expect(table).toHaveAttribute('data-materialized-language', '');
      await waitFor(() => expect(deferredResolutions.has(language)).toBe(true));
      await act(async () => {
        deferredResolutions.get(language)?.();
        await Promise.resolve();
      });
      await waitFor(() => expect(table).toHaveAttribute('data-materialized-language', language));
    }

    await act(async () => {
      deferredResolutions.get(SUPPORTED_CONTENT_LANGUAGES[0])?.();
      await Promise.resolve();
    });

    expect(table).toHaveAttribute(
      'data-materialized-language',
      SUPPORTED_CONTENT_LANGUAGES[SUPPORTED_CONTENT_LANGUAGES.length - 1],
    );
    expect(
      SUPPORTED_CONTENT_LANGUAGES.every((language) =>
        mockGenFlowPropertyTabTableData.mock.calls.some((call) => call[1] === language),
      ),
    ).toBe(true);
  });
});
