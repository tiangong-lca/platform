// @ts-nocheck
import ReviewItemForm from '@/pages/Review/Components/ReviewForm/form';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../../../helpers/testUtils';

let mockFormListInitialCount = 1;

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@/components/RequiredMark', () => ({
  __esModule: true,
  default: ({ label, showError }: any) => (
    <div data-testid='required-mark'>{`${label?.props?.defaultMessage ?? label}:${showError}`}</div>
  ),
}));

jest.mock('@/components/LangTextItem/form', () => ({
  __esModule: true,
  default: ({ name, label, listName }: any) => (
    <div data-testid='lang-text-form'>
      {JSON.stringify({
        name,
        listName,
        label: label?.props?.defaultMessage ?? label,
      })}
    </div>
  ),
}));

jest.mock('@/pages/Contacts/Components/select/form', () => ({
  __esModule: true,
  default: ({ parentName, name, label, disabled }: any) => (
    <div data-testid='contact-select'>
      {JSON.stringify({
        parentName,
        name,
        label: label?.props?.defaultMessage ?? label,
        disabled,
      })}
    </div>
  ),
}));

jest.mock('@/pages/Sources/Components/select/form', () => ({
  __esModule: true,
  default: ({ parentName, name, label, type, rules }: any) => (
    <div data-testid='source-select'>
      {JSON.stringify({
        parentName,
        name,
        label: label?.props?.defaultMessage ?? label,
        type,
        rules,
      })}
    </div>
  ),
}));

jest.mock('@/pages/Review/Components/ReviewForm/Scope/form', () => ({
  __esModule: true,
  default: ({ name }: any) => <div data-testid='scope-form'>{JSON.stringify(name)}</div>,
}));

jest.mock('@/pages/Review/Components/ReviewForm/DataQualityIndicator/form', () => ({
  __esModule: true,
  default: ({ name }: any) => <div data-testid='dqi-form'>{JSON.stringify(name)}</div>,
}));

jest.mock('@/pages/Processes/Components/optiondata', () => ({
  __esModule: true,
  reviewTypeOptions: [{ value: 'peer-review', label: 'Peer review' }],
}));

jest.mock('@/pages/Processes/processes_schema.json', () => ({
  processDataSet: {
    modellingAndValidation: {
      validation: {
        review: {
          '@type': { rules: [] },
          'common:reviewDetails': { rules: [] },
          'common:referenceToNameOfReviewerAndInstitution': {
            '@refObjectId': { rules: [] },
          },
          'common:referenceToCompleteReviewReport': {
            '@refObjectId': { rules: [] },
          },
        },
      },
    },
  },
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getRules: () => [],
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: ({ onClick }: any) => (
    <button type='button' aria-label='remove-review' onClick={onClick}>
      remove
    </button>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');
  const { toText } = require('../../../../../helpers/nodeToText');

  const Card = ({ children, title, extra }: any) => (
    <section>
      <header>{toText(title)}</header>
      <div>{extra}</div>
      <div>{children}</div>
    </section>
  );
  const Col = ({ children }: any) => <div>{children}</div>;
  const Divider = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Select = ({ options = [] }: any) => <div>{options.map((o: any) => o.label).join(',')}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Form = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ children }: any) => <div>{children}</div>;
  const MockFormList = ({ children }: any) => {
    const [items, setItems] = React.useState(
      Array.from({ length: mockFormListInitialCount }, (_, index) => ({
        key: index,
        name: index,
      })),
    );
    const add = () =>
      setItems((current: any[]) => [...current, { key: current.length, name: current.length }]);
    const remove = (name: number) =>
      setItems((current: any[]) => current.filter((item) => item.name !== name));
    return <div>{children(items, { add, remove })}</div>;
  };
  Form.List = MockFormList;

  return {
    __esModule: true,
    Card,
    Col,
    Divider,
    Form,
    Row,
    Select,
    Space,
  };
});

describe('ReviewFormForm', () => {
  beforeEach(() => {
    mockFormListInitialCount = 1;
  });

  it('renders nested scope and indicator forms plus reviewer references for the current row', () => {
    render(
      <ReviewItemForm
        name={['review']}
        lang='en'
        formRef={{ current: undefined }}
        onData={jest.fn()}
        disabled
      />,
    );

    expect(screen.getByText('Peer review')).toBeInTheDocument();
    expect(screen.getByTestId('scope-form')).toHaveTextContent('[0,"common:scope"]');
    expect(screen.getByTestId('dqi-form')).toHaveTextContent(
      '[0,"common:dataQualityIndicators","common:dataQualityIndicator"]',
    );
    expect(screen.getByTestId('contact-select')).toHaveTextContent('"parentName":["review"]');
    expect(screen.getByTestId('contact-select')).toHaveTextContent('"disabled":true');
    expect(screen.getByTestId('source-select')).toHaveTextContent('"type":"reviewReport"');
    expect(screen.getByTestId('source-select')).not.toHaveTextContent('"rules"');
    expect(screen.getAllByTestId('lang-text-form')).toHaveLength(2);
    expect(screen.getByTestId('required-mark')).toHaveTextContent('Review details:false');
  });

  it('does not remove the only remaining review row', async () => {
    render(
      <ReviewItemForm
        name={['review']}
        lang='en'
        formRef={{ current: undefined }}
        onData={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText('remove-review'));
    expect(screen.getAllByLabelText('remove-review')).toHaveLength(1);
  });

  it('removes a review row when multiple rows are present', async () => {
    mockFormListInitialCount = 2;

    render(
      <ReviewItemForm
        name={['review']}
        lang='en'
        formRef={{ current: undefined }}
        onData={jest.fn()}
      />,
    );

    expect(screen.getAllByLabelText('remove-review')).toHaveLength(2);

    await userEvent.click(screen.getAllByLabelText('remove-review')[1]);
    expect(screen.getAllByLabelText('remove-review')).toHaveLength(1);
  });
});
