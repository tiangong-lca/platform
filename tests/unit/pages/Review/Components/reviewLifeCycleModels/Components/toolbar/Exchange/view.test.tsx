// @ts-nocheck
import EdgeExchangeView from '@/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/Exchange/view';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../../../../../../../helpers/testUtils';

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close</span>,
}));

jest.mock('@/components/LangTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='lang-text'>{JSON.stringify(data)}</div>,
}));

jest.mock('@/components/QuantitativeReferenceIcon', () => ({
  __esModule: true,
  default: ({ value }: any) => <span>{value ? 'quantitative-yes' : 'quantitative-no'}</span>,
}));

jest.mock('@/pages/Flows/Components/select/description', () => ({
  __esModule: true,
  default: ({ title, data, lang }: any) => (
    <div data-testid='flow-description'>{`${lang}:${data?.['@refObjectId'] ?? 'none'}:${title?.props?.defaultMessage ?? title}`}</div>
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
  const { toText } = require('../../../../../../../../helpers/nodeToText');

  const Button = ({ children, onClick, disabled = false, icon }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick}>
      {icon}
      {toText(children)}
    </button>
  );

  const Drawer = ({ open, title, extra, children, onClose, getContainer }: any) =>
    open ? (
      <section
        role='dialog'
        aria-label={toText(title) || 'drawer'}
        data-container={String(getContainer?.() === global.document?.body)}
      >
        <header>
          <div>{extra}</div>
          <button type='button' onClick={onClose}>
            close
          </button>
        </header>
        <div>{children}</div>
      </section>
    ) : null;

  const Card = ({ children, title }: any) => (
    <section>
      <header>{toText(title)}</header>
      <div>{children}</div>
    </section>
  );

  const Row = ({ children, gutter }: any) => (
    <div
      data-testid='exchange-grid'
      data-gutter={Array.isArray(gutter) ? gutter.join(',') : gutter}
    >
      {children}
    </div>
  );
  const Col = ({ children, xs, xl }: any) => (
    <div data-testid='exchange-column' data-xs={xs} data-xl={xl}>
      {children}
    </div>
  );
  const Spin = ({ children }: any) => <div>{children}</div>;

  const Descriptions = ({ items = [], styles }: any) => (
    <dl>
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
    Col,
    Descriptions,
    Divider,
    Drawer,
    Row,
    Spin,
  };
});

describe('ReviewLifeCycleModelEdgeExchangeView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProcessDetail
      .mockResolvedValueOnce({
        data: {
          json: {
            processDataSet: {
              mocked: 'source',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          json: {
            processDataSet: {
              mocked: 'target',
            },
          },
        },
      });

    mockGenProcessFromData
      .mockReturnValueOnce({
        exchanges: {
          exchange: [
            {
              exchangeDirection: 'output',
              referenceToFlowDataSet: [{ '@refObjectId': 'flow-output' }],
              meanAmount: 10,
              resultingAmount: 12,
              dataDerivationTypeStatus: 'measured',
              generalComment: [{ '@xml:lang': 'en', '#text': 'Output comment' }],
              quantitativeReference: true,
              functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': 'Output unit' }],
            },
          ],
        },
      })
      .mockReturnValueOnce({
        exchanges: {
          exchange: [
            {
              exchangeDirection: 'input',
              referenceToFlowDataSet: [{ '@refObjectId': 'flow-input' }],
              meanAmount: 3,
              resultingAmount: 4,
              dataDerivationTypeStatus: 'estimated',
              generalComment: [{ '@xml:lang': 'en', '#text': 'Input comment' }],
              quantitativeReference: false,
              functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': 'Input unit' }],
            },
          ],
        },
      });
  });

  it('loads source and target exchange data when the drawer is opened', async () => {
    const onDrawerClose = jest.fn();

    render(
      <EdgeExchangeView
        lang='en'
        sourceProcessId='process-source'
        sourceProcessVersion='1.0.0'
        targetProcessId='process-target'
        targetProcessVersion='2.0.0'
        sourceOutputFlowID='flow-output'
        targetInputFlowID='flow-input'
        drawerVisible
        onDrawerClose={onDrawerClose}
      />,
    );

    await waitFor(() =>
      expect(mockGetProcessDetail).toHaveBeenNthCalledWith(1, 'process-source', '1.0.0'),
    );
    await waitFor(() =>
      expect(mockGetProcessDetail).toHaveBeenNthCalledWith(2, 'process-target', '2.0.0'),
    );

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByTestId('flow-description')[0]).toHaveTextContent('en:flow-output:Flow');
    expect(screen.getAllByTestId('flow-description')[1]).toHaveTextContent('en:flow-input:Flow');
    expect(screen.getByText('quantitative-yes')).toBeInTheDocument();
    expect(screen.getByText('quantitative-no')).toBeInTheDocument();

    expect(screen.getByTestId('exchange-grid')).toHaveAttribute('data-gutter', '16,16');
    for (const column of screen.getAllByTestId('exchange-column')) {
      expect(column).toHaveAttribute('data-xs', '24');
      expect(column).toHaveAttribute('data-xl', '12');
    }
    for (const label of screen.getAllByText('Exchange direction')) {
      expect(label.closest('dt')).toHaveStyle({
        width: 'auto',
        maxWidth: 'min(42vw, 22rem)',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
      });
    }

    await userEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
  });

  it('does not request exchange data while the drawer is closed', () => {
    render(
      <EdgeExchangeView
        lang='en'
        sourceProcessId='process-source'
        sourceProcessVersion='1.0.0'
        targetProcessId='process-target'
        targetProcessVersion='2.0.0'
        sourceOutputFlowID='flow-output'
        targetInputFlowID='flow-input'
        drawerVisible={false}
        onDrawerClose={jest.fn()}
      />,
    );

    expect(mockGetProcessDetail).not.toHaveBeenCalled();
  });

  it('falls back to empty exchange payloads when process details are missing', async () => {
    mockGetProcessDetail.mockReset();
    mockGenProcessFromData.mockReset();
    mockGetProcessDetail.mockResolvedValue({ data: { json: {} } });
    mockGenProcessFromData.mockReturnValue({});

    render(
      <EdgeExchangeView
        lang='en'
        sourceProcessId='process-source'
        sourceProcessVersion='1.0.0'
        targetProcessId='process-target'
        targetProcessVersion='2.0.0'
        sourceOutputFlowID='flow-output'
        targetInputFlowID='flow-input'
        drawerVisible
        onDrawerClose={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-container', 'true');
    expect(mockGenProcessFromData).toHaveBeenNthCalledWith(1, {});
    expect(mockGenProcessFromData).toHaveBeenNthCalledWith(2, {});
    expect(screen.getAllByText('-')).not.toHaveLength(0);
    expect(screen.getAllByTestId('flow-description')[0]).toHaveTextContent('en:none:Flow');
    expect(screen.getAllByTestId('flow-description')[1]).toHaveTextContent('en:none:Flow');
    expect(screen.getAllByText('quantitative-no')).toHaveLength(2);
  });
});
