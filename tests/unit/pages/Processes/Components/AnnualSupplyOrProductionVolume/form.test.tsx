// @ts-nocheck
import AnnualSupplyOrProductionVolumeForm from '@/pages/Processes/Components/AnnualSupplyOrProductionVolume/form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetAnnualUnit = jest.fn(async () => 'kg');
const mockFormItems: any[] = [];
const mockThemeToken = jest.fn(() => ({ colorError: '#ff4d4f', fontSizeSM: 12, marginXXS: 4 }));

const findFormItem = (name: Array<string | number>) => {
  return mockFormItems.findLast((item) => JSON.stringify(item.name) === JSON.stringify(name));
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

jest.mock('@/services/processes/annualSupplyVolumeUnit', () => ({
  getAnnualSupplyVolumeUnit: (...args: any[]) => mockGetAnnualUnit(...args),
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
      useToken: () => ({ token: mockThemeToken() }),
    },
  };
});

describe('AnnualSupplyOrProductionVolumeForm', () => {
  const data = [
    {
      '@dataSetInternalID': '1',
      exchangeDirection: 'Output',
      quantitativeReference: true,
      referenceToFlowDataSet: { '@refObjectId': 'flow-1', '@version': '01.00.000' },
    },
  ];
  const annual = (en: string, zh?: string) => [
    { '@xml:lang': 'en', '#text': en },
    ...(zh ? [{ '@xml:lang': 'zh', '#text': zh }] : []),
  ];
  const renderInput = (value?: unknown, lang = 'zh', props = {}) => {
    const form = buildForm(value);
    const onData = jest.fn();
    const element = (
      <AnnualSupplyOrProductionVolumeForm
        exchangeDataSource={data}
        formRef={{ current: form }}
        label='Annual volume'
        lang={lang}
        name={['annualSupply']}
        onData={onData}
        rules={[{ required: true }]}
        {...props}
      />
    );
    return { ...render(element), element, form, onData };
  };
  const getItem = () => findFormItem(['annualSupply']);
  const context = () => screen.getByLabelText('annual-supply-volume-context');

  beforeEach(() => {
    mockFormItems.length = 0;
    mockGetAnnualUnit.mockReset().mockResolvedValue('kg');
  });

  it('shows the converted number and unit without changing the stored form during lookup', async () => {
    const value = annual('40900 t/year', '40900 吨/年');
    const { form, onData } = renderInput(value);
    await waitFor(() => expect(context()).toHaveValue('kg/年'));
    expect(mockGetAnnualUnit).toHaveBeenCalledWith(data);
    expect(context()).toBeDisabled();
    const normalized = mockFormItems.filter((item) => item.name?.[0] === 'annualSupply').at(-1);
    expect(normalized.getValueProps(value)).toEqual({ value: '40900000' });
    expect(normalized.normalize('123')).toEqual(annual('123 kg/year', '123 kg/年'));
    expect(form.setFieldValue).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('annual-volume'), { target: { value: '300' } });
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('keeps the 3.6 MJ control separate from its stored product context', async () => {
    mockGetAnnualUnit.mockResolvedValue('MJ');
    const value = annual('3.6 electricity');
    renderInput(value);
    await waitFor(() => expect(context()).toHaveValue('MJ/年'));
    expect(mockFormItems.at(-1).getValueProps(value)).toEqual({ value: '3.6' });
  });

  it('preserves authored annual units when lookup is unavailable', async () => {
    mockGetAnnualUnit.mockResolvedValue(undefined);
    const { form } = renderInput(annual('40900 t/year'), 'en');
    await waitFor(() => expect(mockGetAnnualUnit).toHaveBeenCalled());
    expect(context()).toHaveValue('t/year');
    expect(getItem().normalize('3')).toEqual(annual('3 t/year'));
    expect(form.setFieldValue).not.toHaveBeenCalled();
  });

  it('keeps edits in the displayed unit across enabled existing languages', async () => {
    const value = annual('40 m3/year', '40 m3/年');
    renderInput(value);
    await waitFor(() => expect(mockGetAnnualUnit).toHaveBeenCalled());
    expect(context()).toHaveValue('m3/年');
    expect(getItem().normalize('42')).toEqual(annual('42 m3/year', '42 m3/年'));
  });

  it('ignores a lookup that completes after the exact reference has changed', async () => {
    let firstResolve: (unit: string) => void;
    mockGetAnnualUnit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          firstResolve = resolve;
        }),
    );
    const { rerender, element } = renderInput(annual('3.6'));
    mockGetAnnualUnit.mockResolvedValueOnce('MJ');
    rerender({
      ...element,
      props: {
        ...element.props,
        exchangeDataSource: [
          {
            ...data[0],
            referenceToFlowDataSet: { '@refObjectId': 'flow-1', '@version': '02.00.000' },
          },
        ],
      },
    });
    await waitFor(() => expect(context()).toHaveValue('MJ/年'));
    await act(async () => firstResolve('kg'));
    expect(context()).toHaveValue('MJ/年');
  });

  it('keeps a historical nonannual period visible while exact annual context resolves', async () => {
    const amount = annual('24 kg/day', '24 kg/日');
    renderInput(amount);
    await waitFor(() => expect(mockGetAnnualUnit).toHaveBeenCalled());
    expect(context()).toHaveValue('kg/日');
    expect(getItem().getValueProps(amount)).toEqual({ value: '24' });
  });

  it('uses the German annual period without inventing other locales', async () => {
    renderInput(annual('100 product text'), 'de-DE');
    await waitFor(() => expect(context()).toHaveValue('kg/Jahr'));
    expect(mockFormItems.at(-1).normalize('12')).toEqual([
      { '@xml:lang': 'en', '#text': '12 kg/year' },
      { '@xml:lang': 'de', '#text': '12 kg/Jahr' },
    ]);
  });

  it('validates the number and preserves optional behavior', async () => {
    const setRuleErrorState = jest.fn();
    renderInput(undefined, 'en', {
      setRuleErrorState,
      rules: [{ required: true, defaultMessage: 'Annual volume is required' }],
    });
    const validator = getItem().rules[0].validator;
    await expect(validator(null, '')).rejects.toThrow('Annual volume is required');
    await expect(validator(null, '1E-')).rejects.toThrow('Please enter a number.');
    expect(setRuleErrorState).toHaveBeenLastCalledWith(true);
    await expect(validator(null, '123')).resolves.toBeUndefined();
    expect(setRuleErrorState).toHaveBeenLastCalledWith(false);
  });

  it('uses default rules, validation copy and theme fallbacks when absent', async () => {
    mockThemeToken.mockReturnValueOnce({ colorError: '#ff4d4f' });
    renderInput(undefined, 'en', { rules: undefined, contextErrorMessage: 'No reference unit' });
    expect(getItem().rules).toEqual([]);
    expect(screen.getByRole('alert')).toHaveStyle({ fontSize: '12px', marginTop: '4px' });
    renderInput(annual('2 kg/year'), 'en');
    const validator = getItem().rules[0].validator;
    await expect(validator(null, '')).rejects.toThrow('Please input this field!');
    await expect(validator(null, '2')).resolves.toBeUndefined();
  });

  it('renders optional and invalid-context states', () => {
    renderInput(undefined, 'en', {
      formRef: { current: undefined },
      contextErrorMessage: 'Missing reference unit',
      rules: [],
    });
    expect(getItem().rules).toEqual([]);
    expect(context()).toHaveAttribute('data-status', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Missing reference unit');
  });
});
