// @ts-nocheck
import ScopeItemForm from '@/pages/Review/Components/ReviewForm/Scope/form';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../../../../helpers/testUtils';

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@/components/RequiredMark', () => ({
  __esModule: true,
  default: ({ label }: any) => <div data-testid='required-mark'>{label}</div>,
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

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: ({ onClick }: any) => (
    <button type='button' aria-label='remove-scope' onClick={onClick}>
      remove
    </button>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, onClick }: any) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  );
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Select = ({ options = [] }: any) => <div>{options.map((o: any) => o.label).join(',')}</div>;
  const Form = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ children }: any) => <div>{children}</div>;
  const MockFormList = ({ children }: any) => {
    const [items, setItems] = React.useState([{ key: 0, name: 0 }]);
    const add = () =>
      setItems((current: any[]) => [...current, { key: current.length, name: current.length }]);
    const remove = (name: number) =>
      setItems((current: any[]) => current.filter((item) => item.name !== name));
    return <div>{children(items, { add, remove })}</div>;
  };
  Form.List = MockFormList;

  return {
    __esModule: true,
    Button,
    Col,
    Form,
    Row,
    Select,
  };
});

describe('ReviewFormScopeForm', () => {
  it('shows required labels, adds rows, and keeps the last remaining scope row', async () => {
    render(<ScopeItemForm name={['review', 'scope']} />);

    expect(screen.getAllByTestId('required-mark')).toHaveLength(2);
    expect(screen.getAllByText(/Gate to gate|Review method/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /Add Scope Item/i }));
    expect(screen.getAllByLabelText('remove-scope')).toHaveLength(2);

    await userEvent.click(screen.getAllByLabelText('remove-scope')[1]);
    expect(screen.getAllByLabelText('remove-scope')).toHaveLength(1);

    await userEvent.click(screen.getAllByLabelText('remove-scope')[0]);
    expect(screen.getAllByLabelText('remove-scope')).toHaveLength(1);
  });
});
