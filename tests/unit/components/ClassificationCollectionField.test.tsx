import { ClassificationCollectionField } from '@/components/LevelTextItem/collection';
import { act, render, screen } from '@testing-library/react';
import { Form } from 'antd';

it.each([undefined, null, [], [null]])(
  'validates an empty collection independently of child inputs (%p)',
  async (value) => {
    let form: any;
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form form={form} initialValues={{ classification: value }}>
          <ClassificationCollectionField
            name={['classification']}
            required
            enabled
            message='Select a classification'
          />
        </Form>
      );
    }
    render(<Harness />);
    await act(async () => {
      await expect(form.validateFields()).rejects.toMatchObject({
        errorFields: [{ name: ['classification'], errors: ['Select a classification'] }],
      });
    });
    expect(await screen.findByText('Select a classification')).toBeVisible();
    expect(document.getElementById('classification')).toBeInTheDocument();
  },
);

it.each([
  { enabled: false, required: true },
  { enabled: true, required: false },
])('preserves draft or optional collection validation (%p)', async (flags) => {
  let form: any;
  function Harness() {
    [form] = Form.useForm();
    return (
      <Form form={form} initialValues={{ classification: [] }}>
        <ClassificationCollectionField
          name={['classification']}
          {...flags}
          message='Select a classification'
        />
      </Form>
    );
  }
  render(<Harness />);
  await act(async () => {
    await expect(form.validateFields()).resolves.toEqual({ classification: [] });
  });
});

it.each([{}, [{}]])(
  'accepts a present singleton or repeated collection (%p)',
  async (classification) => {
    let form: any;
    function Harness() {
      [form] = Form.useForm();
      return (
        <Form form={form} initialValues={{ classification }}>
          <ClassificationCollectionField
            name={['classification']}
            required
            enabled
            message='Select a classification'
          />
        </Form>
      );
    }
    render(<Harness />);
    await act(async () => {
      await expect(form.validateFields()).resolves.toEqual({ classification });
    });
    expect(screen.queryByText('Select a classification')).not.toBeInTheDocument();
  },
);
