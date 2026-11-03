import ScopeItemForm from '@/pages/Review/Components/ReviewForm/Scope/form';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@/components/RequiredMark', () => ({
  __esModule: true,
  default: ({ label }: any) => <span>{label}</span>,
}));

jest.mock('@/pages/Processes/Components/optiondata', () => ({
  __esModule: true,
  scopeNameOptions: [{ value: 'gate-to-gate', label: 'Gate to gate' }],
  methodNameOptions: [{ value: 'review-method', label: 'Review method' }],
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: () => [],
}));

describe('ReviewFormScopeForm with Ant Design 6', () => {
  it('submits every registered Form.List child through the real antd form store', async () => {
    const onFinish = jest.fn();
    const initialValues = {
      review: {
        scope: [
          {
            '@name': 'gate-to-gate',
            'common:method': { '@name': 'review-method' },
          },
        ],
      },
    };

    render(
      <Form initialValues={initialValues} onFinish={onFinish}>
        <ScopeItemForm name={['review', 'scope']} />
        <button type='submit'>submit-real-antd-form</button>
      </Form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'submit-real-antd-form' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith(initialValues));
  });
});
