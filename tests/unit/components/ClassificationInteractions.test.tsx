import ClassificationSystemsForm from '@/components/LevelTextItem/form';
import TidasRepeatedField from '@/components/TidasRepeatedField';
import { getILCDClassification, getILCDFlowCategorization } from '@/services/classifications/api';
import { getClassificationSource } from '@/services/classifications/system';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form, Input } from 'antd';

let mockSelectFromTree = false;

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    TreeSelect: ({ onChange, ...props }: any) =>
      mockSelectFromTree ? (
        <button type='button' onClick={() => onChange('A')}>
          Select test classification
        </button>
      ) : (
        <actual.TreeSelect {...props} onChange={onChange} />
      ),
  };
});

afterEach(() => {
  mockSelectFromTree = false;
});

jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage, values = {} }: any) =>
    Object.entries(values).reduce(
      (text, [key, value]) => text.replace(`{${key}}`, String(value)),
      defaultMessage,
    ),
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

const custom = (name: string) => ({
  '@name': name,
  '@classes': `https://example.org/${name}`,
  'common:class': [{ '@level': '0', '@classId': name, '#text': name }],
});

it.each([
  ['Process', undefined, 'common:class', undefined],
  ['Process', undefined, 'common:class', getClassificationSource('Process')],
  ['Flow', 'Elementary flow', 'common:category', undefined],
] as const)(
  'records source identity only on an actual %s class selection (%s)',
  async (dataType, flowType, classKey, existingSource) => {
    let form: any;
    mockSelectFromTree = true;
    const source = getClassificationSource(dataType);
    const name = ['classification', classKey];
    const initial = existingSource
      ? { '@name': existingSource.name, '@classes': existingSource.uri }
      : undefined;
    const load = classKey === 'common:category' ? getILCDFlowCategorization : getILCDClassification;
    jest.mocked(load).mockResolvedValueOnce({
      success: true,
      data: [{ id: 'A', value: 'Agriculture', label: 'Agriculture', children: [] }],
    });
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form form={form} initialValues={{ classification: initial }}>
          <ClassificationSystemsForm
            name={name}
            dataType={dataType}
            flowType={flowType}
            lang='en'
            formRef={{ current: form }}
            onData={() => {}}
          />
        </Form>
      );
    }
    await act(async () => {
      render(<Harness />);
    });
    expect(form.getFieldValue(['classification', '@name'])).toBe(initial?.['@name']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select test classification' }));
    });
    expect(form.getFieldValue(name)).toMatchObject({ id: ['A'], value: ['Agriculture'] });
    expect(form.getFieldValue(['classification', '@name'])).toBe(
      classKey === 'common:class' ? source.name : undefined,
    );
    expect(form.getFieldValue(['classification', '@classes'])).toBe(
      classKey === 'common:class' ? source.uri : undefined,
    );
  },
);

it('removes the selected system and keeps the editor visible after the last removal', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: [custom('A'), custom('B')] }}>
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          dataType='Process'
          lang='en'
          formRef={{ current: form }}
          onData={() => {}}
          showRules
        />
      </Form>
    );
  }
  render(<Harness />);
  expect(screen.getAllByRole('button', { name: 'Remove system' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove system' })[0]);
  await waitFor(() => expect(form.getFieldValue('classification')).toEqual([custom('B')]));
  expect(document.getElementById('classification_0_common:class')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove system' }));
  await waitFor(() => expect(form.getFieldValue('classification')).toEqual([]));
  expect(screen.queryByRole('button', { name: 'Remove system' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeInTheDocument();
  expect(document.getElementById('classification')).toBeInTheDocument();
});

it('repairs an empty required collection to an editable row and still rejects missing classification', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: [] }}>
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          dataType='Process'
          lang='en'
          formRef={{ current: form }}
          onData={() => {}}
          showRules
        />
      </Form>
    );
  }
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
  expect(screen.getByLabelText('Classification system')).toHaveAttribute(
    'placeholder',
    'ISIC Rev. 5',
  );
  await act(async () => {
    await expect(form.validateFields()).rejects.toHaveProperty('errorFields');
  });
  expect(form.getFieldValue('classification')).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Add system/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add system/ }));
  await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove system' })[0]);
  await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(1));
});

it('repairs an empty custom collection and can remove the completed class independently', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form
        form={form}
        initialValues={{ classification: [{ ...custom('A'), 'common:class': [] }] }}
      >
        <ClassificationSystemsForm
          name={['classification', 'common:class']}
          dataType='Process'
          lang='en'
          formRef={{ current: form }}
          onData={() => {}}
          showRules
        />
      </Form>
    );
  }
  render(<Harness />);
  await waitFor(() => expect(screen.getByLabelText('Class name')).toBeInTheDocument());
  await act(async () => {
    await expect(form.validateFields()).rejects.toHaveProperty('errorFields');
  });
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'K' } });
  fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Kept' } });
  await act(async () => {
    await form.validateFields();
  });
  expect(form.getFieldValue(['classification', 0, 'common:class'])).toEqual([
    { '@level': '3', '@classId': 'K', '#text': 'Kept' },
  ]);
  expect(screen.getByRole('button', { name: /Add class/ })).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove class' }));
  });
  await waitFor(() =>
    expect(form.getFieldValue(['classification', 0, 'common:class'])).toEqual([]),
  );
  expect(form.getFieldValue(['classification', 0, '@classes'])).toBe('https://example.org/A');
  expect(screen.getByLabelText('Class name')).toHaveValue('');
});

it('hides the entire inactive flow editor and preserves its stored data', async () => {
  let form: any;
  const initial = custom('Custom');
  function Harness({ hidden }: { hidden: boolean }) {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: initial }}>
        <ClassificationSystemsForm
          hidden={hidden}
          name={['classification', 'common:class']}
          dataType='Flow'
          flowType='Elementary flow'
          lang='en'
          formRef={{ current: form }}
          onData={() => {}}
          showRules
        />
      </Form>
    );
  }
  const { rerender } = render(<Harness hidden />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Classification system')).not.toBeInTheDocument();
  await act(async () => {
    await form.validateFields();
  });
  expect(form.getFieldValue('classification')).toEqual(initial);
  rerender(<Harness hidden={false} />);
  expect(screen.getByLabelText('Classification system')).toHaveValue('Custom');
});

it('keeps zero-item deletion available for unrelated optional repeated fields', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ items: [{ value: 'x' }] }}>
        <TidasRepeatedField name={['items']} onChange={() => {}}>
          {(path) => (
            <Form.Item name={[...path, 'value']}>
              <Input />
            </Form.Item>
          )}
        </TidasRepeatedField>
      </Form>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(form.getFieldValue('items')).toEqual([]));
});

it('adds and removes a custom class without inventing an empty first entry', async () => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form
        form={form}
        initialValues={{
          classification: { '@name': 'Custom', '@classes': 'https://example.org/custom' },
        }}
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
  // Required markers do not change the existing incomplete-draft save mode.
  await act(async () => {
    await form.validateFields();
  });
  fireEvent.click(screen.getByRole('button', { name: /Add class/ }));
  await waitFor(() => expect(form.getFieldValue(['classification', 'common:class'])).toEqual([{}]));
  expect(screen.getAllByLabelText('Class name')).toHaveLength(1);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove class' }));
  });
  expect(form.getFieldValue(['classification', '@name'])).toBe('Custom');
});

it('preserves raw custom classes while editing their system name and URI', async () => {
  let form: any;
  const initial = custom('Original');
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: initial }}>
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
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Classification system'), {
      target: { value: 'Renamed custom system' },
    });
    fireEvent.change(screen.getByLabelText('Classification system URI'), {
      target: { value: 'https://example.org/renamed.xml' },
    });
  });
  expect(form.getFieldValue('classification')).toEqual({
    ...initial,
    '@name': 'Renamed custom system',
    '@classes': 'https://example.org/renamed.xml',
  });
  expect(screen.getByLabelText('Class name')).toHaveValue('Original');
});
