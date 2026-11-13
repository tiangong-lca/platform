import ClassificationSystemsForm from '@/components/LevelTextItem/form';
import TidasRepeatedField from '@/components/TidasRepeatedField';
import { genProcessJsonOrdered } from '@/services/processes/util';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form, Input } from 'antd';

jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage }: any) => <>{defaultMessage}</>,
  useIntl: () => ({ formatMessage: ({ defaultMessage }: any) => defaultMessage }),
}));
jest.mock('@/services/classifications/api', () => ({
  getILCDClassification: jest.fn(async () => ({ success: true, data: [] })),
  getILCDFlowCategorization: jest.fn(async () => ({ success: true, data: [] })),
}));

it('keeps the first block fixed while removing only the selected later block', async () => {
  let form: any;
  const entries = [
    { name: 'first', code: 'A' },
    { name: 'second', code: 'B' },
    { name: 'third', code: 'C' },
  ];
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ entries }}>
        <TidasRepeatedField name={['entries']} keepFirst onChange={() => {}}>
          {(path) => (
            <Form.Item name={[...path, 'name']} label='Name'>
              <Input />
            </Form.Item>
          )}
        </TidasRepeatedField>
      </Form>
    );
  }
  render(<Harness />);
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  expect(form.getFieldValue('entries')).toEqual([entries[0], entries[2]]);
  await waitFor(() => expect(screen.getAllByLabelText('Name')).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(form.getFieldValue('entries')).toEqual([entries[0]]);
  await waitFor(() => expect(screen.getAllByLabelText('Name')).toHaveLength(1));
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  await waitFor(() => expect(screen.getAllByLabelText('Name')).toHaveLength(2));
  expect(form.getFieldValue(['entries', 0])).toEqual(entries[0]);
});

it.each([undefined, [], null])(
  'shows the first optional completeness block and really adds a second block (%p)',
  async (initial) => {
    let form: any;
    const name = ['modellingAndValidation', 'completeness', 'completenessElementaryFlows'];
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form
          form={form}
          initialValues={{
            modellingAndValidation: { completeness: { completenessElementaryFlows: initial } },
          }}
        >
          <TidasRepeatedField name={name} keepFirst onChange={() => {}}>
            {(path) => (
              <>
                <Form.Item name={[...path, '@type']} label='Type'>
                  <Input />
                </Form.Item>
                <Form.Item name={[...path, '@value']} label='Value'>
                  <Input />
                </Form.Item>
              </>
            )}
          </TidasRepeatedField>
        </Form>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getAllByLabelText('Type')).toHaveLength(1));
    await act(async () => {
      await form.validateFields();
    });
    expect(
      genProcessJsonOrdered('00000000-0000-4000-8000-000000000001', form.getFieldsValue(true))
        .processDataSet.modellingAndValidation?.completeness?.completenessElementaryFlows,
    ).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    await waitFor(() => expect(screen.getAllByLabelText('Type')).toHaveLength(2));
    await act(async () => {
      fireEvent.change(screen.getAllByLabelText('Type')[0], {
        target: { value: 'Climate change' },
      });
      fireEvent.change(screen.getAllByLabelText('Value')[0], { target: { value: 'No statement' } });
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    await waitFor(() => expect(screen.getAllByLabelText('Type')).toHaveLength(1));
    expect(form.getFieldValue(name)).toEqual([
      { '@type': 'Climate change', '@value': 'No statement' },
    ]);
  },
);

it('keeps the original classification fields and generic actions without new headings or cards', async () => {
  let form: any;
  const item = (name: string) => ({
    '@name': name,
    '@classes': `https://example.org/${name}`,
    'common:class': [{ '@level': '0', '@classId': name, '#text': name }],
  });
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: [item('A'), item('B')] }}>
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
  const { container } = render(<Harness />);
  expect(container.querySelector('.ant-card')).not.toBeInTheDocument();
  expect(screen.queryByText('Classification systems')).not.toBeInTheDocument();
  expect(screen.queryByText('Classification entries')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  expect(
    screen
      .getAllByRole('button', { name: /Add/ })
      .every((button) => button.textContent?.trim() === '+ Add'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(form.getFieldValue('classification')).toEqual([item('A')]));
});
