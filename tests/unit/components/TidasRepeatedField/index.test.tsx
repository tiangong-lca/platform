import { getClassificationSource } from '@/services/classifications/system';
import ClassificationSystemsForm from '@/components/LevelTextItem/form';
import TidasRepeatedField from '@/components/TidasRepeatedField';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form, Input } from 'antd';

jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => <>{defaultMessage}</>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: any, values: any = {}) =>
      Object.entries(values).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, String(value)),
        defaultMessage,
      ),
  }),
}));
jest.mock('@/services/classifications/api', () => ({
  getILCDClassification: jest.fn(async () => ({ success: true, data: [] })),
  getILCDFlowCategorization: jest.fn(async () => ({ success: true, data: [] })),
}));

it('edits, appends and removes repeated entries without changing the untouched entry', async () => {
  let form: any;
  const changed = jest.fn();
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ parameters: { '@name': 'first', meanValue: '0' } }}>
        <TidasRepeatedField name={['parameters']} onChange={changed}>
          {(path) => (
            <Form.Item name={[...path, '@name']} label='Parameter'>
              <Input />
            </Form.Item>
          )}
        </TidasRepeatedField>
      </Form>
    );
  }
  render(<Harness />);
  expect(screen.getByLabelText('Parameter')).toHaveValue('first');
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  await waitFor(() => expect(screen.getAllByLabelText('Parameter')).toHaveLength(2));
  fireEvent.change(screen.getAllByLabelText('Parameter')[1], { target: { value: 'second' } });
  expect(form.getFieldsValue(true).parameters).toEqual([
    { '@name': 'first', meanValue: '0' },
    { '@name': 'second' },
  ]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  await waitFor(() => expect(screen.getAllByLabelText('Parameter')).toHaveLength(1));
  expect(form.getFieldsValue(true).parameters).toEqual([{ '@name': 'second' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(form.getFieldValue('parameters')).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  await waitFor(() => expect(screen.getByLabelText('Parameter')).toBeInTheDocument());
  expect(changed).toHaveBeenCalledTimes(4);
});

it('edits classes in the second named system while preserving both system identities', async () => {
  let form: any;
  const systems = [
    {
      '@name': 'A',
      '@classes': 'https://example.org/a',
      'common:class': [{ '@level': '2', '@classId': 'a', '#text': 'Alpha' }],
    },
    {
      '@name': 'B',
      '@classes': 'https://example.org/b',
      'common:class': [{ '@level': '0', '@classId': 'b', '#text': 'Beta' }],
    },
  ];
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: systems }}>
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          lang='en'
          dataType='Process'
          formRef={{ current: form }}
          onData={() => {}}
        />
      </Form>
    );
  }
  render(<Harness />);
  await act(async () => {
    fireEvent.change(screen.getAllByLabelText('Class name')[1], {
      target: { value: 'Updated beta' },
    });
  });
  const result = form.getFieldsValue(true).classification;
  expect(result[0]).toEqual(systems[0]);
  expect(result[1]['@name']).toBe('B');
  expect(result[1]['@classes']).toBe(systems[1]['@classes']);
  expect(result[1]['common:class'][0]).toEqual({
    '@level': '0',
    '@classId': 'b',
    '#text': 'Updated beta',
  });
});

it.each([undefined, { '@level': '0', '#text': 'Alpha' }])(
  'normalizes array-only classes before editing (%p)',
  async (initial) => {
    let form: any;
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form form={form} initialValues={{ classes: initial }}>
          <TidasRepeatedField name={['classes']} arrayOnly onChange={() => {}}>
            {(path) => (
              <Form.Item name={[...path, '#text']} label='Class'>
                <Input />
              </Form.Item>
            )}
          </TidasRepeatedField>
        </Form>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(form.getFieldValue('classes')).toEqual(initial ? [initial] : []));
  },
);

it('can change a pinned singleton classification to a named system and back', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form
        form={form}
        initialValues={{ classification: { 'common:class': { id: ['a'], value: ['Alpha'] } } }}
      >
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          lang='en'
          dataType='Process'
          formRef={{ current: form }}
          onData={() => {}}
        />
      </Form>
    );
  }
  await act(async () => {
    render(<Harness />);
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Classification system'), {
      target: { value: 'Custom' },
    });
  });
  expect(form.getFieldValue(['classification', 'common:class'])).toEqual({
    '@level': '0',
    '@classId': 'a',
    '#text': 'Alpha',
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Classification system'), { target: { value: '' } });
  });
  expect(form.getFieldValue(['classification', 'common:class']).value).toEqual(['Alpha']);
});

it.each([
  ['Process', 'ISIC Rev. 5'],
  ['LifeCycleModel', 'ISIC Rev. 5'],
  ['Flow', 'CPC Ver. 3.0'],
  ['Contact', 'ILCD'],
  ['Source', 'ILCD'],
  ['FlowProperty', 'ILCD'],
  ['UnitGroup', 'ILCD'],
])('prefills %s classification without replacing the taxonomy selector', async (dataType, name) => {
  let form: any;
  const changed = jest.fn();
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form}>
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          lang='en'
          dataType={dataType}
          flowType='Product flow'
          formRef={{ current: form }}
          onData={changed}
        />
      </Form>
    );
  }
  render(<Harness />);
  await waitFor(() => expect(screen.getByLabelText('Classification system')).toHaveValue(name));
  expect(screen.getByRole('combobox')).toBeInTheDocument();
  expect(screen.queryByLabelText('Class name')).not.toBeInTheDocument();
  expect(form.getFieldValue(['classification', '@name'])).toBe(name);
  expect(screen.getByLabelText('Classification system URI')).toHaveValue(
    getClassificationSource(dataType).uri,
  );
  expect(form.getFieldValue(['classification', '@classes'])).toBe(
    getClassificationSource(dataType).uri,
  );
  expect(changed).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  await waitFor(() => expect(screen.getAllByLabelText('Classification system')).toHaveLength(2));
  expect(screen.getAllByLabelText('Classification system')[1]).toHaveValue(name);
  expect(screen.getAllByLabelText('Classification system URI')[1]).toHaveValue(
    getClassificationSource(dataType).uri,
  );
});

it('preserves selected classes when changing the system URI and returning to the built-in resource', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form
        form={form}
        initialValues={{
          classification: { 'common:class': { id: ['A'], value: ['Agriculture'] } },
        }}
      >
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          lang='en'
          dataType='Process'
          formRef={{ current: form }}
          onData={() => {}}
        />
      </Form>
    );
  }
  render(<Harness />);
  await waitFor(() =>
    expect(screen.getByLabelText('Classification system')).toHaveValue('ISIC Rev. 5'),
  );
  fireEvent.change(screen.getByLabelText('Classification system URI'), {
    target: { value: 'https://example.org/custom.xml' },
  });
  await waitFor(() => expect(screen.getByLabelText('Class name')).toHaveValue('Agriculture'));
  expect(form.getFieldValue(['classification', 'common:class'])).toEqual({
    '@level': '0',
    '@classId': 'A',
    '#text': 'Agriculture',
  });
  fireEvent.change(screen.getByLabelText('Classification system URI'), { target: { value: '' } });
  await waitFor(() => expect(screen.queryByLabelText('Class name')).not.toBeInTheDocument());
  expect(form.getFieldValue(['classification', 'common:class'])).toMatchObject({
    id: ['A'],
    value: ['Agriculture'],
  });
  await act(async () => form.resetFields());
  expect(screen.getByLabelText('Classification system')).toHaveValue('ISIC Rev. 5');
});

it('does not seed hidden, untyped or elementary-flow classifications', async () => {
  let form: any;
  function Harness({
    hidden = false,
    flowType,
    category = false,
  }: {
    hidden?: boolean;
    flowType?: string;
    category?: boolean;
  }) {
    [form] = Form.useForm();
    return (
      <Form form={form}>
        <ClassificationSystemsForm
          name={['classification', category ? 'common:category' : 'common:class']}
          lang='en'
          dataType='Flow'
          flowType={flowType}
          hidden={hidden}
          formRef={{ current: form }}
          onData={() => {}}
        />
      </Form>
    );
  }
  const { rerender } = render(<Harness />);
  expect(form.getFieldValue(['classification', '@name'])).toBeUndefined();
  expect(form.getFieldValue(['classification', '@classes'])).toBeUndefined();
  rerender(<Harness hidden flowType='Product flow' />);
  expect(form.getFieldValue(['classification', '@name'])).toBeUndefined();
  expect(form.getFieldValue(['classification', '@classes'])).toBeUndefined();
  rerender(<Harness category flowType='Elementary flow' />);
  expect(form.getFieldValue(['classification', '@name'])).toBeUndefined();
  expect(form.getFieldValue(['classification', '@classes'])).toBeUndefined();
  rerender(<Harness flowType='Elementary flow' />);
  expect(form.getFieldValue(['classification', '@name'])).toBeUndefined();
  expect(form.getFieldValue(['classification', '@classes'])).toBeUndefined();
  rerender(<Harness flowType='Product flow' />);
  await waitFor(() =>
    expect(screen.getByLabelText('Classification system')).toHaveValue('CPC Ver. 3.0'),
  );
});

it('keeps custom entries when defaulting and deleting entries in a mixed repeated system', async () => {
  let form: any;
  const custom = {
    '@name': 'Custom',
    '@classes': 'https://example.org/custom.xml',
    'common:class': [{ '@level': '3', '@classId': 'x', '#text': 'External' }],
  };
  function Harness({ lang }: { lang: string }) {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: [custom, {}] }}>
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          lang={lang}
          dataType='Process'
          formRef={{ current: form }}
          onData={() => {}}
        />
      </Form>
    );
  }
  const { rerender } = render(<Harness lang='en' />);
  await waitFor(() =>
    expect(screen.getAllByLabelText('Classification system')[1]).toHaveValue('ISIC Rev. 5'),
  );
  rerender(<Harness lang='zh' />);
  expect(form.getFieldValue(['classification', 0])).toEqual(custom);
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  await waitFor(() => expect(screen.getAllByLabelText('Classification system')).toHaveLength(1));
  expect(form.getFieldValue('classification')).toEqual([custom]);
});

it.each([
  { '@name': 'ISIC Rev. 5' },
  {
    '@classes':
      'https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/ISIC_Rev_5_english_structure.csv',
  },
])(
  'completes the missing built-in identity without changing selected classes: %p',
  async (identity) => {
    let form: any;
    const classes = { id: ['A'], value: ['Agriculture'] };
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form
          form={form}
          initialValues={{ classification: { ...identity, 'common:class': classes } }}
        >
          <ClassificationSystemsForm
            name={['classification', 'common:class']}
            dataType='Process'
            lang='en'
            formRef={{ current: form }}
            onData={() => {}}
          />
        </Form>
      );
    }
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByLabelText('Classification system')).toHaveValue('ISIC Rev. 5'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Classification system URI')).toHaveValue(
        getClassificationSource('Process').uri,
      ),
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(form.getFieldValue(['classification', 'common:class'])).toMatchObject(classes);
  },
);
