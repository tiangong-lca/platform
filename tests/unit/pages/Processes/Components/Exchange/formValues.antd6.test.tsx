import ProcessExchangeCreate from '@/pages/Processes/Components/Exchange/create';
import ProcessExchangeEdit from '@/pages/Processes/Components/Exchange/edit';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockForm: {
  setFieldsValue: (values: Record<string, unknown>) => void;
  getFieldValue: (name: string) => unknown;
};
let mockImmediateReference: unknown;

const mockSelectedReference = {
  '@refObjectId': '00000000-0000-4000-8000-000000000001',
  '@version': '01.01.002',
  'common:shortDescription': [
    { '@xml:lang': 'zh', '#text': '测试流' },
    { '@xml:lang': 'en', '#text': 'Test flow' },
  ],
};

jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({ formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id }),
}));
jest.mock('@/pages/Utils', () => ({ getRules: () => [] }));
jest.mock('@/pages/Processes/sdkValidationUi', () => ({
  getSdkSuggestedFixMessage: () => '',
  resolveRequiredValidationMessage: () => '',
}));
jest.mock('@/components/LangTextItem/form', () => () => null);
jest.mock('@/components/LocationTextItem/codeSelect', () => () => null);
jest.mock('@/components/UnitConvert', () => () => null);
jest.mock('@/pages/Sources/Components/select/form', () => () => null);
jest.mock('@/components/ToolBarButton', () => ({ onClick }: any) => (
  <button type='button' onClick={onClick}>
    Open exchange
  </button>
));

// Keep the real ProForm lifecycle and antd store; replace only network-backed
// selectors and unrelated form controls.
jest.mock('@ant-design/pro-components', () => {
  const { ProForm } = jest.requireActual('@ant-design/pro-components');
  return {
    ProForm: (props: any) => (
      <ProForm
        {...props}
        onInit={(_: unknown, form: typeof mockForm) => {
          mockForm = form;
        }}
      />
    ),
  };
});

jest.mock('@/pages/Flows/Components/select/form', () => {
  const { Form, Input } = jest.requireActual('antd');
  return ({ name, formRef, onData }: any) => (
    <>
      <button
        type='button'
        onClick={() => {
          void Promise.resolve().then(async () => {
            await formRef.current.setFieldValue(name, mockSelectedReference);
            mockImmediateReference = formRef.current.getFieldsValue().referenceToFlowDataSet;
            onData();
          });
        }}
      >
        Select flow
      </button>
      <Form.Item name={[...name, '@refObjectId']}>
        <Input />
      </Form.Item>
      <Form.Item name={[...name, '@version']}>
        <Input />
      </Form.Item>
      <Form.List name={[...name, 'common:shortDescription']}>
        {(fields: Array<{ key: number; name: number }>) =>
          fields.map((field) => (
            <div key={field.key}>
              <Form.Item name={[field.name, '@xml:lang']}>
                <Input />
              </Form.Item>
              <Form.Item name={[field.name, '#text']}>
                <Input />
              </Form.Item>
            </div>
          ))
        }
      </Form.List>
    </>
  );
});

it.each(['create', 'edit'] as const)(
  '%s saves multilingual flow names selected last without another field change',
  async (mode) => {
    const onData = jest.fn();
    const otherExchange = { '@dataSetInternalID': '1', exchangeDirection: 'Output', meanAmount: 2 };
    if (mode === 'create') {
      render(<ProcessExchangeCreate direction='input' lang='en' onData={onData} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open exchange' }));
    } else {
      render(
        <ProcessExchangeEdit
          id='0'
          data={[{ '@dataSetInternalID': '0', exchangeDirection: 'Input' }, otherExchange]}
          lang='en'
          buttonType='text'
          setViewDrawerVisible={jest.fn()}
          onData={onData}
          showRules={false}
          autoOpen
        />,
      );
    }
    await screen.findByRole('button', { name: 'Select flow' });
    await act(async () => {
      mockForm.setFieldsValue({ meanAmount: 1, resultingAmount: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'Select flow' }));
    });
    // Reproduce the actual antd 6 boundary, rather than mocking away the race.
    expect(mockImmediateReference).toEqual({
      ...mockSelectedReference,
      'common:shortDescription': [],
    });
    expect(await screen.findByDisplayValue('测试流')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const expectedExchange = expect.objectContaining({
      referenceToFlowDataSet: mockSelectedReference,
      meanAmount: 1,
      resultingAmount: 1,
    });
    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith(
        mode === 'create' ? expectedExchange : [expectedExchange, otherExchange],
      );
    });
  },
);

it.each([
  ['input', 'Input', 'Output'],
  ['output', 'Output', 'Input'],
])(
  'defaults to %s on first open and restores it after reopening',
  async (direction, expected, other) => {
    const onData = jest.fn();
    render(<ProcessExchangeCreate direction={direction} lang='en' onData={onData} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open exchange' }));
    await screen.findByRole('button', { name: 'Select flow' });
    expect(mockForm.getFieldValue('exchangeDirection')).toBe(expected);
    expect(screen.getByText(expected, { exact: true })).toBeVisible();

    const directionInput = screen.getByRole('combobox', { name: 'Exchange direction' });
    fireEvent.mouseDown(directionInput);
    fireEvent.keyDown(directionInput, {
      key: expected === 'Input' ? 'ArrowDown' : 'ArrowUp',
      keyCode: expected === 'Input' ? 40 : 38,
    });
    fireEvent.keyDown(directionInput, { key: 'Enter', keyCode: 13 });
    expect(mockForm.getFieldValue('exchangeDirection')).toBe(other);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Open exchange' }));
    await screen.findByRole('button', { name: 'Select flow' });
    expect(mockForm.getFieldValue('exchangeDirection')).toBe(expected);
    expect(screen.getByText(expected, { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onData).toHaveBeenCalledWith(expect.objectContaining({ exchangeDirection: expected }));
    });
  },
);
