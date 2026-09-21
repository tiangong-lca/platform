// @ts-nocheck
import TargetAmount from '@/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/viewTargetAmount';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../../../../../../helpers/testUtils';

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close</span>,
  StarOutlined: () => <span>star</span>,
}));

jest.mock('@/pages/Flows/Components/view', () => ({
  __esModule: true,
  default: ({ id, version }: any) => <span>{`flow-view:${id}:${version}`}</span>,
}));

jest.mock('@/components/LangTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='lang-text'>{JSON.stringify(data)}</div>,
}));

jest.mock('@/pages/Unitgroups/Components/select/descriptionMini', () => ({
  __esModule: true,
  default: ({ id, version, idType }: any) => (
    <div data-testid='unit-group-mini'>{`${idType}:${id}:${version}`}</div>
  ),
}));

const mockGetProcessDetail = jest.fn();
jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
}));

const mockGenProcessFromData = jest.fn();
jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
}));

jest.mock('antd', () => {
  const React = require('react');
  const { toText } = require('../../../../../../../helpers/nodeToText');

  const Button = ({ children, onClick, disabled = false, icon }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {icon}
      {toText(children)}
    </button>
  );

  const Tooltip = ({ children }: any) => <>{children}</>;

  const Drawer = ({ open, title, extra, children, onClose, getContainer }: any) => {
    if (!open) return null;
    getContainer?.();
    return (
      <section role='dialog' aria-label={toText(title) || 'drawer'}>
        <header>
          <div>{extra}</div>
          <button type='button' onClick={onClose}>
            close
          </button>
        </header>
        <div>{children}</div>
      </section>
    );
  };

  const Space = ({ children, orientation, style, styles, wrap }: any) => (
    <div
      data-item-max-width={styles?.item?.maxWidth}
      data-item-min-width={styles?.item?.minWidth}
      data-orientation={orientation}
      data-wrap={String(Boolean(wrap))}
      style={style}
    >
      {children}
    </div>
  );

  const Card = ({ children, title }: any) => (
    <section>
      <header>{toText(title)}</header>
      <div>{children}</div>
    </section>
  );

  const Descriptions = ({ items = [], style, styles }: any) => (
    <dl
      data-label-max-width={styles?.label?.maxWidth}
      data-label-overflow-wrap={styles?.label?.overflowWrap}
      style={style}
    >
      {items.map((item: any, index: number) => (
        <div key={item.key ?? index}>
          {item.label === undefined ? null : <dt style={styles?.label}>{toText(item.label)}</dt>}
          <dd>{item.children}</dd>
        </div>
      ))}
    </dl>
  );

  const Divider = ({ children }: any) => <div>{toText(children)}</div>;

  return {
    __esModule: true,
    Button,
    Card,
    Descriptions,
    Divider,
    Drawer,
    Space,
    Tooltip,
  };
});

describe('ReviewLifeCycleModelViewTargetAmount', () => {
  const refNode = {
    data: {
      id: 'process-1',
      version: '1.0.0',
      targetAmount: 10,
      originalAmount: 5,
      scalingFactor: 2,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProcessDetail.mockResolvedValue({
      data: {
        json: {
          processDataSet: {
            mocked: true,
          },
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      processInformation: {
        quantitativeReference: {
          referenceToReferenceFlow: 'ex-1',
        },
        dataSetInformation: {
          name: {
            baseName: [{ '@xml:lang': 'en', '#text': 'Ref process' }],
          },
          'common:generalComment': [{ '@xml:lang': 'en', '#text': 'Process comment' }],
        },
      },
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'ex-1',
            referenceToFlowDataSet: [
              {
                '@refObjectId': 'flow-1',
                '@version': '2.0.0',
                '@type': 'flow data set',
                '@uri': '../flows/flow-1.xml',
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Reference flow' }],
              },
            ],
          },
        ],
      },
    });
  });

  it('opens from the trigger button when a reference node exists', async () => {
    const setDrawerVisible = jest.fn();

    render(
      <TargetAmount
        refNode={refNode as any}
        drawerVisible={false}
        lang='en'
        setDrawerVisible={setDrawerVisible}
        onData={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /star/i }));

    expect(setDrawerVisible).toHaveBeenCalledWith(true);
  });

  it('disables the trigger when no reference node exists', () => {
    render(
      <TargetAmount
        refNode={null}
        drawerVisible={false}
        lang='en'
        setDrawerVisible={jest.fn()}
        onData={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /star/i })).toBeDisabled();
  });

  it('loads process detail and renders review target amount reference flow information', async () => {
    const setDrawerVisible = jest.fn();

    render(
      <TargetAmount
        refNode={refNode as any}
        drawerVisible
        lang='en'
        setDrawerVisible={setDrawerVisible}
        onData={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '1.0.0'));

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(await screen.findByText('flow-1')).toBeInTheDocument();
    expect(screen.getByText('flow data set')).toBeInTheDocument();
    expect(screen.getByText('../flows/flow-1.xml')).toBeInTheDocument();
    expect(screen.getByText('2.0.0')).toBeInTheDocument();
    expect(screen.getByText('flow-view:flow-1:2.0.0')).toBeInTheDocument();
    expect(screen.getByTestId('unit-group-mini')).toHaveTextContent('flow:flow-1:2.0.0');

    await userEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);
    expect(setDrawerVisible).toHaveBeenCalledWith(false);
  });

  it('keeps the review reference-flow description inside a 450px drawer viewport', async () => {
    render(
      <TargetAmount
        refNode={refNode as any}
        drawerVisible
        lang='en'
        setDrawerVisible={jest.fn()}
        onData={jest.fn()}
      />,
    );

    const referenceLabel = await screen.findByText('Reference flow dataset identifier');
    const description = referenceLabel.closest('dl');
    expect(description).toHaveStyle({ width: '100%', maxWidth: '450px' });
    expect(description).toHaveAttribute('data-label-max-width', 'min(42vw, 22rem)');
    expect(description).toHaveAttribute('data-label-overflow-wrap', 'anywhere');
    expect(description?.parentElement).toHaveAttribute('data-wrap', 'true');
    expect(description?.parentElement).toHaveAttribute('data-item-min-width', '0');
    expect(description?.parentElement).toHaveAttribute('data-item-max-width', '100%');
    expect(description?.parentElement).toHaveStyle({ width: '100%' });
  });

  it('renders fallback placeholders when target values or reference exchange data are missing', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {},
    });
    mockGenProcessFromData.mockReturnValueOnce({
      processInformation: {
        quantitativeReference: {
          referenceToReferenceFlow: 'missing-ref',
        },
        dataSetInformation: {},
      },
    });

    render(
      <TargetAmount
        refNode={{ data: { id: 'process-2', version: '2.0.0' } } as any}
        drawerVisible
        lang='en'
        setDrawerVisible={jest.fn()}
        onData={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-2', '2.0.0'));

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText(/flow-view:/)).not.toBeInTheDocument();
    expect(screen.getByTestId('unit-group-mini')).toHaveTextContent('flow:undefined:undefined');
  });
});
