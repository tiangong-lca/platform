// @ts-nocheck
import AnnualSupplyOrProductionVolumeForm from '@/pages/Processes/Components/AnnualSupplyOrProductionVolume/form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetUnitData = jest.fn(async (_idType: string, rows: any[]) => rows);
const mockFormItems: any[] = [];

const findFormItem = (name: Array<string | number>) => {
  return mockFormItems.find((item) => JSON.stringify(item.name) === JSON.stringify(name));
};

const buildForm = (value: unknown) => ({
  getFieldValue: jest.fn(() => value),
  setFieldValue: jest.fn(),
});

jest.mock('umi', () => ({
  __esModule: true,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getUnitData: (...args: any[]) => mockGetUnitData(...args),
  getExactLangText: (value: any, lang: string) => {
    if (typeof value === 'string') return value;
    const normalizedLanguage =
      ({ 'de-DE': 'de', 'fr-FR': 'fr', 'en-US': 'en', 'zh-CN': 'zh' } as any)[lang] ?? lang;
    if (Array.isArray(value)) {
      return (
        value.find(
          (item) =>
            item?.['@xml:lang'] === normalizedLanguage &&
            typeof item?.['#text'] === 'string' &&
            item['#text'].trim() &&
            item['#text'].trim() !== '-',
        )?.['#text'] ?? '-'
      );
    }
    if (value?.['@xml:lang'] && value['@xml:lang'] !== normalizedLanguage) return '-';
    return value?.['#text'] ?? '-';
  },
  getLangText: (value: any, lang: string) => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return (
        value.find((item) => item?.['@xml:lang'] === lang)?.['#text'] ??
        value.find((item) => item?.['#text'])?.['#text'] ??
        ''
      );
    }
    return value?.['#text'] ?? '';
  },
}));

jest.mock('antd', () => {
  const FormComponent = ({ children }: any) => <form>{children}</form>;
  const FormItem = (props: any) => {
    mockFormItems.push(props);
    return (
      <div data-testid={props.name ? `form-item-${props.name.join('.')}` : 'form-item'}>
        {props.children}
      </div>
    );
  };
  FormComponent.Item = FormItem;

  const InputNumber = ({ onChange, style }: any) => (
    <label>
      <input
        aria-label='annual-volume'
        onChange={(event) => onChange?.(event.target.value)}
        style={style}
      />
    </label>
  );
  const Input = ({ 'aria-label': ariaLabel, disabled, status, style, value = '' }: any) => (
    <input
      aria-label={ariaLabel}
      data-status={status}
      disabled={disabled}
      style={style}
      value={value}
    />
  );
  const Space = ({ children }: any) => <div>{children}</div>;
  Space.Compact = ({ children }: any) => <div data-testid='annual-volume-compact'>{children}</div>;

  return {
    __esModule: true,
    Form: FormComponent,
    Input,
    InputNumber,
    Space,
    theme: {
      useToken: () => ({
        token: {
          colorError: '#ff4d4f',
          fontSizeSM: 12,
          lineHeightSM: 1.5,
          marginXXS: 4,
        },
      }),
    },
  };
});

describe('AnnualSupplyOrProductionVolumeForm', () => {
  const defaultExchangeDataSource = [
    {
      '@dataSetInternalID': '1',
      exchangeDirection: 'Output',
      quantitativeReference: true,
      referenceToFlowDataSet: {
        'common:shortDescription': [
          { '@xml:lang': 'en', '#text': 'Steel' },
          { '@xml:lang': 'zh', '#text': '钢材' },
        ],
      },
      refUnitRes: {
        refUnitName: 'kg',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFormItems.length = 0;
    mockGetUnitData.mockImplementation(async (_idType: string, rows: any[]) => rows);
  });

  it('resolves the reference flow unit and displays the current-language suffix in a disabled input', async () => {
    mockGetUnitData.mockResolvedValueOnce([
      {
        referenceToFlowDataSetId: 'flow-1',
        referenceToFlowDataSetVersion: '01.00.000',
        refUnitRes: {
          refUnitName: 'kg',
        },
      },
    ]);
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '01.00.000',
              'common:shortDescription': [
                { '@xml:lang': 'en', '#text': 'Steel' },
                { '@xml:lang': 'zh', '#text': '钢材' },
              ],
            },
          },
        ]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='zh'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    await waitFor(() => {
      expect(mockGetUnitData).toHaveBeenCalledWith('flow', [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '01.00.000',
        },
      ]);
    });
    expect(form.setFieldValue).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('kg 钢材'),
    );
    expect(screen.getByLabelText('annual-supply-volume-context')).toBeDisabled();
    expect(screen.queryByLabelText('language')).not.toBeInTheDocument();
  });

  it('falls back to the raw exchange suffix when unit resolution fails', async () => {
    mockGetUnitData.mockRejectedValueOnce(new Error('unit lookup failed'));
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
            },
          },
        ]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='en'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('Steel');
  });

  it('normalizes numeric-only input into multilingual storage and validates required values', async () => {
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);
    const onData = jest.fn();
    const setRuleErrorState = jest.fn();

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={defaultExchangeDataSource}
        formRef={{ current: form }}
        label='Annual volume'
        lang='en'
        name={['modelling', 'annualSupply']}
        onData={onData}
        rules={[
          {
            required: true,
            messageKey: 'annual.required',
            defaultMessage: 'Annual volume is required',
          },
        ]}
        setRuleErrorState={setRuleErrorState}
      />,
    );

    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('kg Steel');

    const formItem = findFormItem(['modelling', 'annualSupply']);
    expect(formItem.getValueProps([{ '@xml:lang': 'en', '#text': '123 kg Steel' }])).toEqual({
      value: '123',
    });
    expect(formItem.getValueProps([{ '@xml:lang': 'zh', '#text': '456 kg 钢材' }])).toEqual({
      value: '',
    });
    expect(formItem.normalize('789', [{ '@xml:lang': 'en', '#text': '100 old suffix' }])).toEqual([
      { '@xml:lang': 'en', '#text': '789 old suffix' },
    ]);
    expect(formItem.normalize('abc789')).toEqual([{ '@xml:lang': 'en', '#text': '789 kg Steel' }]);

    await expect(formItem.rules[0].validator(null, '')).rejects.toThrow(
      'Annual volume is required',
    );
    expect(setRuleErrorState).toHaveBeenLastCalledWith(true);
    await expect(formItem.rules[0].validator(null, '1E-')).rejects.toThrow(
      'Please enter a number.',
    );
    expect(setRuleErrorState).toHaveBeenLastCalledWith(true);
    await expect(formItem.rules[0].validator(null, '123')).resolves.toBeUndefined();
    expect(setRuleErrorState).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText('annual-volume'), { target: { value: '300' } });
    expect(onData).toHaveBeenCalled();
  });

  it('persists the current German content language without fabricating unrelated languages', async () => {
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '01.00.000',
              'common:shortDescription': [
                { '@xml:lang': 'en', '#text': 'Steel' },
                { '@xml:lang': 'de', '#text': 'Stahl' },
              ],
            },
            refUnitRes: { refUnitName: 'kg' },
          },
        ]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='de'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('kg Stahl');
  });

  it.each([
    ['de-DE', 'de'],
    ['fr-FR', 'fr'],
  ])(
    'keeps %s numeric-only when its unit and flow context are missing instead of persisting English fallback text',
    async (appLocale, contentLanguage) => {
      const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

      render(
        <AnnualSupplyOrProductionVolumeForm
          exchangeDataSource={[
            {
              '@dataSetInternalID': '1',
              exchangeDirection: 'Output',
              quantitativeReference: true,
              referenceToFlowDataSet: {
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
              },
              refUnitRes: {
                name: [{ '@xml:lang': 'en', '#text': 'kilogram' }],
              },
            },
          ]}
          formRef={{ current: form }}
          label='Annual volume'
          lang={appLocale}
          name={['annualSupply']}
          onData={jest.fn()}
          rules={[{ required: true }]}
        />,
      );

      expect(form.setFieldValue).not.toHaveBeenCalled();
      const formItem = findFormItem(['annualSupply']);
      expect(formItem.normalize('200')).toEqual([
        { '@xml:lang': 'en', '#text': '200 kilogram Steel' },
        { '@xml:lang': contentLanguage, '#text': '200' },
      ]);
      expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('');
    },
  );

  it('skips required rules for optional fields and tolerates empty or missing form state', () => {
    const form = buildForm(undefined);
    const onData = jest.fn();

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='fr'
        name={['annualSupply']}
        onData={onData}
      />,
    );

    const formItem = findFormItem(['annualSupply']);
    expect(formItem.rules).toEqual([]);
    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('');

    mockFormItems.length = 0;
    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[]}
        formRef={{ current: undefined }}
        label='Annual volume'
        lang='en'
        name={['annualSupplyWithoutForm']}
        onData={onData}
        rules={[{ required: true }]}
      />,
    );
    expect(findFormItem(['annualSupplyWithoutForm']).rules).toHaveLength(1);
  });

  it('keeps unit and flow context blank when no reference flow exists', async () => {
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='en'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('');

    const formItem = findFormItem(['annualSupply']);
    expect(formItem.normalize('789')).toEqual([{ '@xml:lang': 'en', '#text': '789' }]);
    await expect(formItem.rules[0].validator(null, '123')).resolves.toBeUndefined();
  });

  it('keeps unit and flow context blank when exchanges exist but no reference flow is selected', async () => {
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 old suffix' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={[
          {
            '@dataSetInternalID': '1',
            exchangeDirection: 'Output',
            quantitativeReference: false,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '01.00.000',
              'common:shortDescription': [
                { '@xml:lang': 'en', '#text': 'Steel' },
                { '@xml:lang': 'zh', '#text': '钢材' },
              ],
            },
            refUnitRes: {
              refUnitName: 'kg',
            },
          },
        ]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='zh'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('');
  });

  it('normalizes an undeclared locale tag and leaves a missing locale suffix blank', async () => {
    const form = buildForm([{ '@xml:lang': 'en', '#text': '100 kg Steel' }]);

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={defaultExchangeDataSource}
        formRef={{ current: form }}
        label='Annual volume'
        lang='es-MX'
        name={['annualSupply']}
        onData={jest.fn()}
        rules={[{ required: true }]}
      />,
    );

    await waitFor(() => {
      expect(form.setFieldValue).not.toHaveBeenCalled();
    });
    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveValue('');
  });

  it('marks the derived context input and renders red help text when context is invalid', () => {
    const form = buildForm(undefined);

    render(
      <AnnualSupplyOrProductionVolumeForm
        contextErrorMessage='请选择一条输入/输出作为基准'
        exchangeDataSource={[]}
        formRef={{ current: form }}
        label='Annual volume'
        lang='zh'
        name={['annualSupply']}
        onData={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('annual-supply-volume-context')).toHaveAttribute(
      'data-status',
      'error',
    );
    expect(screen.getByLabelText('annual-supply-volume-context')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('请选择一条输入/输出作为基准');
    expect(screen.getByRole('alert')).toHaveStyle({ color: '#ff4d4f' });
  });

  it('normalizes single-object form values and uses default required validation copy', async () => {
    const form = buildForm({ '@xml:lang': 'en', '#text': '321 kg Steel' });
    const onData = jest.fn();

    render(
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={defaultExchangeDataSource}
        formRef={{ current: form }}
        label='Annual volume'
        lang='en'
        name={['annualSupply']}
        onData={onData}
        rules={[{ required: true }]}
      />,
    );

    expect(form.setFieldValue).not.toHaveBeenCalled();

    const formItem = findFormItem(['annualSupply']);
    await expect(formItem.rules[0].validator(null, '')).rejects.toThrow('Please input this field!');
  });
});
