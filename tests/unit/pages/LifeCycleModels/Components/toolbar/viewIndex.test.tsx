// @ts-nocheck
import ToolbarView from '@/pages/LifeCycleModels/Components/toolbar/viewIndex';
import { act } from '@testing-library/react';
import { fireEvent, render, screen, waitFor } from '../../../../../helpers/testUtils';

const mockUpdateNode = jest.fn();
const mockUpdateEdge = jest.fn();
const mockRemoveEdges = jest.fn();
const mockInitData = jest.fn();

let mockGraphStoreState: any = {};

const createDeferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@/contexts/graphContext', () => ({
  __esModule: true,
  useGraphStore: (selector: any) => selector(mockGraphStoreState),
  useGraphEvent: jest.fn(),
}));

const { useGraphEvent: mockUseGraphEvent } = jest.requireMock('@/contexts/graphContext');

jest.mock('antd', () => {
  const React = require('react');

  const Space = ({ children }: any) => <div>{children}</div>;
  const Spin = ({ children }: any) => <div>{children}</div>;
  const message = {
    error: jest.fn(),
    success: jest.fn(),
  };

  const App = { useApp: () => ({ message }) };
  const theme = {
    useToken: () => ({
      token: {
        colorPrimary: '#1677ff',
        colorBgContainer: '#fff',
        colorBorder: '#d9d9d9',
        colorBgBase: '#fafafa',
        colorTextBase: '#000',
        colorTextDescription: '#8c8c8c',
      },
    }),
  };

  return {
    __esModule: true,
    Space,
    Spin,
    App,
    message,
    theme,
  };
});

jest.mock('@/pages/LifeCycleModels/Components/toolbar/viewInfo', () => ({
  __esModule: true,
  default: ({ data, lang }: any) => (
    <div data-testid='toolbar-view-info'>{`${lang}:${data?.id}:${data?.version ?? ''}`}</div>
  ),
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType, disabled, lang }: any) => (
    <div data-testid='process-view'>{`${id}:${version}:${buttonType}:${disabled}:${lang}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/view', () => ({
  __esModule: true,
  default: ({ id, version, buttonType, lang }: any) => (
    <div data-testid='life-cycle-model-view'>{`${id}:${version}:${buttonType}:${lang}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/Exchange/index', () => ({
  __esModule: true,
  default: ({ disabled, edge, lang }: any) => (
    <div data-testid='edge-exchange'>{`${disabled}:${edge?.id ?? 'none'}:${lang}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/viewTargetAmount', () => ({
  __esModule: true,
  default: ({ refNode, drawerVisible, lang, onData }: any) => (
    <div>
      <div data-testid='target-amount'>{`${refNode?.id ?? refNode?.data?.id ?? 'none'}:${drawerVisible}:${lang}`}</div>
      <button type='button' data-testid='target-amount-on-data' onClick={onData}>
        target-amount-on-data
      </button>
    </div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/modelResult', () => ({
  __esModule: true,
  default: ({ modelId, modelVersion, actionType, submodels }: any) => (
    <div data-testid='model-result'>{`${modelId}:${modelVersion}:${actionType}:${submodels?.length ?? 0}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/control', () => ({
  __esModule: true,
  Control: ({ items }: any) => (
    <div data-testid='control'>{Array.isArray(items) ? items.join('|') : ''}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortView', () => ({
  __esModule: true,
  default: ({ direction, drawerVisible, node, lang }: any) => (
    <div data-testid='io-port-view'>{`${direction}:${drawerVisible}:${node?.id ?? node?.data?.id ?? 'none'}:${lang}`}</div>
  ),
}));

const mockGetLifeCycleModelDetail = jest.fn();
jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCycleModelDetail: (...args: any[]) => mockGetLifeCycleModelDetail(...args),
}));

const mockGetLifeCycleModelGraphProcessReferences = jest.fn((jsonTg: any) =>
  (jsonTg?.xflow?.nodes ?? [])
    .map((node: any) => ({ id: node?.data?.id, version: node?.data?.version }))
    .filter((item: any) => item.id && item.version),
);
const mockNormalizeLifeCycleModelGraphForDisplay = jest.fn(({ jsonTg }: any) => jsonTg);
jest.mock('@/services/lifeCycleModels/viewCompatibility', () => ({
  __esModule: true,
  getLifeCycleModelGraphProcessReferences: (...args: any[]) =>
    mockGetLifeCycleModelGraphProcessReferences(...args),
  normalizeLifeCycleModelGraphForDisplay: (...args: any[]) =>
    mockNormalizeLifeCycleModelGraphForDisplay(...args),
}));

const mockGenLifeCycleModelInfoFromData = jest.fn();
const mockGenLifeCycleModelData = jest.fn();
const mockGenLifeCycleModelNodeName = jest.fn();
const mockGetLangText = jest.fn();
const mockGetPortLabelWithAllocation = jest.fn();
const mockGetPortTextColor = jest.fn();
const mockGetPortTextStyle = jest.fn();
const mockNodeTitleTool = jest.fn();
jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genLifeCycleModelInfoFromData: (...args: any[]) => mockGenLifeCycleModelInfoFromData(...args),
  genLifeCycleModelData: (...args: any[]) => mockGenLifeCycleModelData(...args),
  genLifeCycleModelNodeName: (...args: any[]) => mockGenLifeCycleModelNodeName(...args),
  genPortLabel: jest.fn((label: string) => label),
}));

const mockGetProcessesByIdAndVersion = jest.fn();
const mockGetProcessDetailByIdAndVersion = jest.fn();
jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessesByIdAndVersion: (...args: any[]) => mockGetProcessesByIdAndVersion(...args),
  getProcessDetailByIdAndVersion: (...args: any[]) => mockGetProcessDetailByIdAndVersion(...args),
}));

jest.mock('@/services/general/data', () => ({
  __esModule: true,
  initVersion: '1.0.0',
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  formatDateTime: () => '2026-03-12 12:00',
  getLangText: (...args: any[]) => mockGetLangText(...args),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/utils/edge', () => ({
  __esModule: true,
  getEdgeLabel: jest.fn(() => ({ attrs: { text: { text: 'edge-label' } } })),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/utils/node', () => ({
  __esModule: true,
  getPortLabelWithAllocation: (...args: any[]) => mockGetPortLabelWithAllocation(...args),
  getPortTextColor: (...args: any[]) => mockGetPortTextColor(...args),
  getPortTextStyle: (...args: any[]) => mockGetPortTextStyle(...args),
  nodeTitleTool: (...args: any[]) => mockNodeTitleTool(...args),
}));

describe('ToolbarView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenLifeCycleModelNodeName.mockImplementation(
      (nodeData: any) => nodeData?.label ?? 'process-name',
    );
    mockGetLangText.mockReturnValue('Flow label');
    mockGetPortLabelWithAllocation.mockImplementation((label: string) => label);
    mockGetPortTextColor.mockReturnValue('#1677ff');
    mockGetPortTextStyle.mockReturnValue('bold');
    mockNodeTitleTool.mockImplementation((width: number, title: string) => ({
      id: 'nodeTitle',
      width,
      title,
    }));
    mockGraphStoreState = {
      initData: mockInitData,
      updateNode: mockUpdateNode,
      updateEdge: mockUpdateEdge,
      removeEdges: mockRemoveEdges,
      nodes: [
        {
          id: 'node-1',
          selected: true,
          size: { width: 300 },
          data: {
            id: 'proc-1',
            version: '1.0',
            label: 'Process One',
            quantitativeReference: '1',
          },
          ports: { items: [] },
        },
        {
          id: 'node-2',
          selected: false,
          size: { width: 300 },
          data: {
            id: 'proc-2',
            version: '1.0',
            label: 'Process Two',
            quantitativeReference: '0',
          },
          ports: { items: [] },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          selected: true,
          data: {
            node: {
              sourceProcessId: 'proc-1',
              sourceProcessVersion: '1.0',
              targetProcessId: 'proc-2',
              targetProcessVersion: '1.0',
            },
            connection: {
              outputExchange: {
                '@flowUUID': 'flow-1',
                downstreamProcess: {
                  '@flowUUID': 'flow-2',
                },
              },
            },
          },
        },
      ],
    };

    mockGenLifeCycleModelInfoFromData.mockReturnValue({
      lifeCycleModelInformation: {
        dataSetInformation: {
          'common:UUID': 'model-uuid',
        },
      },
    });
    mockGenLifeCycleModelData.mockReturnValue({
      nodes: [
        {
          id: 'node-a',
          size: { width: 320 },
          data: {
            id: 'proc-1',
            version: '1.0',
            label: 'Graph Process',
            quantitativeReference: '1',
          },
          ports: {
            items: [
              {
                id: 'port-input',
                group: 'groupInput',
                data: {
                  textLang: 'Input Flow',
                  allocations: [1],
                  quantitativeReference: '0',
                },
                attrs: { text: {} },
              },
              {
                id: 'port-output',
                group: 'groupOutput',
                data: {
                  textLang: 'Output Flow',
                  allocations: [2],
                  quantitativeReference: '1',
                },
                attrs: { text: {} },
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'graph-edge-1',
          data: {
            connection: {
              unbalancedAmount: 2,
              exchangeAmount: 5,
            },
          },
          target: { x: 1, y: 2, cell: 'node-a' },
        },
        {
          id: 'graph-edge-2',
          data: {
            connection: {
              exchangeAmount: 1,
            },
          },
        },
      ],
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        json: {
          lifeCycleModelDataSet: {
            mocked: true,
          },
        },
        json_tg: {
          submodels: [{ id: 'sub-1' }, { id: 'provider-1', type: 'allocated' }],
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
          },
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0' }],
    });
    mockGetProcessDetailByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0', json: { processDataSet: {} } }],
    });
  });

  it('loads graph data and renders process-oriented tools when the drawer is visible', async () => {
    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() =>
      expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-1', '1.0.0'),
    );
    await waitFor(() => expect(mockInitData).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith([
        { id: 'proc-1', version: '1.0' },
      ]),
    );
    expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalledWith([
      { id: 'proc-1', version: '1.0' },
    ]);
    expect(mockNormalizeLifeCycleModelGraphForDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonTg: expect.objectContaining({
          xflow: expect.objectContaining({
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
          }),
        }),
        processDetails: [{ id: 'proc-1', version: '1.0', json: { processDataSet: {} } }],
      }),
    );

    expect(screen.getByTestId('toolbar-view-info')).toHaveTextContent('en:model-1');
    expect(screen.getByTestId('process-view')).toHaveTextContent('proc-1:1.0:toolIcon:false:en');
    expect(screen.getByTestId('edge-exchange')).toHaveTextContent('false:edge-1:en');
    expect(screen.getByTestId('target-amount')).toHaveTextContent('node-1:false:en');
    expect(screen.getByTestId('model-result')).toHaveTextContent('model-1:1.0.0:view:1');
    expect(screen.getByTestId('control')).toHaveTextContent('zoomOut|zoomTo|zoomIn');

    const initGraph = mockInitData.mock.calls[0][0];
    expect(initGraph.nodes[0].ports.items[0].attrs.text.title).toBe('Flow label');
    expect(initGraph.nodes[0].ports.items[1].attrs.text.title).toBe('Flow label');
    expect(initGraph.edges.find((edge: any) => edge.id === 'graph-edge-1')).toEqual(
      expect.objectContaining({
        selected: false,
        attrs: {
          line: expect.objectContaining({
            strokeWidth: 1,
          }),
        },
      }),
    );
    expect(initGraph.edges.find((edge: any) => edge.id === 'graph-edge-2')).toEqual(
      expect.objectContaining({ id: 'graph-edge-2', selected: false }),
    );
  });

  it('keeps read-only flow and reference tools non-interactive', async () => {
    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(mockInitData).toHaveBeenCalled());
    expect(mockNodeTitleTool).toHaveBeenCalledWith(
      300,
      'Process One',
      expect.any(Object),
      'en',
      'move',
    );

    const initGraph = mockInitData.mock.calls[0][0];
    const tools = initGraph.nodes[0].tools.filter(Boolean);
    const nodeTitleTool = tools.find((tool: any) => tool.id === 'nodeTitle');
    const inputTool = tools.find((tool: any) => tool.id === 'inputFlow');
    const outputTool = tools.find((tool: any) => tool.id === 'outputFlow');
    const referenceTool = tools.find((tool: any) => tool.id === 'ref');

    expect(nodeTitleTool).toEqual(expect.objectContaining({ id: 'nodeTitle' }));
    expect(initGraph.nodes[0].ports.groups.groupInput.attrs.portBody).toEqual(
      expect.objectContaining({
        magnet: 'passive',
        cursor: 'move',
      }),
    );
    expect(initGraph.nodes[0].ports.items[0].attrs.text.cursor).toBe('move');
    expect(initGraph.nodes[0].ports.items[0].attrs.text).toEqual(
      expect.objectContaining({
        'aria-label': 'Flow label',
        'data-responsive-label-kind': 'port-label',
      }),
    );
    expect(inputTool.args.onClick).toBeUndefined();
    expect(inputTool.args.markup[0].attrs.cursor).toBe('move');
    expect(outputTool.args.onClick).toBeUndefined();
    expect(outputTool.args.markup[0].attrs.cursor).toBe('move');
    expect(referenceTool.args.onClick).toBeUndefined();
    expect(referenceTool.args.markup[0].attrs.cursor).toBe('move');
    expect(screen.getByTestId('io-port-view')).toHaveTextContent(':false:none:en');
    expect(screen.getByTestId('target-amount')).toHaveTextContent('node-1:false:en');

    fireEvent.click(screen.getByTestId('target-amount-on-data'));
  });

  it.each([
    [undefined, '1.0'],
    ['01.01.023', '01.01.023'],
  ])(
    'opens the selected submodel with its exact version (%s)',
    async (modelVersion, expectedVersion) => {
      mockGetProcessesByIdAndVersion.mockResolvedValue({
        data: [{ id: 'proc-1', version: '1.0', modelId: 'submodel-1', modelVersion }],
      });

      render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

      await waitFor(() => expect(screen.getByTestId('life-cycle-model-view')).toBeInTheDocument());
      expect(screen.getByTestId('life-cycle-model-view')).toHaveTextContent(
        `submodel-1:${expectedVersion}:toolIcon:en`,
      );
    },
  );

  it.each([
    [{}, 'unavailable'],
    [{ error: { message: 'network' } }, 'failed'],
  ])('reports the model read outcome (%j)', async (fields, expected) => {
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({ success: false, ...fields });
    const onReadProblem = jest.fn();
    render(
      <ToolbarView
        id='model-1'
        version='1.0.0'
        lang='en'
        drawerVisible
        onReadProblem={onReadProblem}
      />,
    );
    await waitFor(() => expect(onReadProblem).toHaveBeenCalledWith(expected));
  });

  it('builds default view state without loading a model and keeps process and edge actions disabled', async () => {
    mockGraphStoreState.nodes = [
      {
        id: 'node-1',
        selected: false,
        size: { width: 300 },
        data: {
          id: 'proc-1',
          version: '1.0',
          label: 'Process One',
          quantitativeReference: '0',
        },
        ports: { items: [] },
      },
    ];
    mockGraphStoreState.edges = [
      {
        id: 'edge-1',
        selected: false,
        data: {
          connection: {
            outputExchange: {
              '@flowUUID': 'flow-1',
            },
          },
        },
      },
    ];

    render(<ToolbarView id='' version='' lang='en' drawerVisible />);

    await waitFor(() => expect(mockGetLifeCycleModelDetail).not.toHaveBeenCalled());
    expect(screen.getByTestId('toolbar-view-info')).toHaveTextContent('en::');
    expect(screen.getByTestId('process-view')).toHaveTextContent('::toolIcon:true:en');
    expect(screen.getByTestId('edge-exchange')).toHaveTextContent('true:none:en');
    expect(screen.getByTestId('target-amount')).toHaveTextContent('none:false:en');
  });

  it('uses empty defaults when the model payload is sparse or missing', async () => {
    mockGraphStoreState.nodes = [
      {
        id: 'node-width',
        selected: false,
        width: 280,
        data: {
          id: 'proc-2',
          version: '2.0',
          quantitativeReference: '0',
        },
        ports: { items: [] },
      },
      {
        selected: false,
        data: {
          id: 'proc-3',
          version: '3.0',
          quantitativeReference: '0',
        },
        ports: { items: [] },
      },
    ];
    mockGraphStoreState.edges = [];

    mockGenLifeCycleModelInfoFromData.mockReturnValueOnce({});
    mockGenLifeCycleModelData.mockReturnValueOnce({
      nodes: [
        {
          id: 'node-b',
          width: 280,
          data: {
            id: 'proc-2',
            version: '2.0',
            quantitativeReference: '0',
          },
          ports: {
            items: [
              {
                id: 'port-width',
                group: 'groupInput',
                data: {
                  textLang: 'Input Flow',
                  quantitativeReference: '0',
                },
                attrs: { text: {} },
              },
            ],
          },
        },
        {
          id: 'node-c',
          data: {
            id: 'proc-3',
            version: '3.0',
            quantitativeReference: '0',
          },
          ports: {
            items: [
              {
                id: 'port-default-width',
                group: 'groupOutput',
                data: {
                  textLang: 'Output Flow',
                  quantitativeReference: '0',
                },
                attrs: { text: {} },
              },
            ],
          },
        },
      ],
    });
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        json: {},
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-2', version: '2.0' } }],
          },
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({});
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({});
    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce(undefined);
    mockGenLifeCycleModelNodeName.mockReturnValue(undefined);

    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(mockInitData).toHaveBeenCalled());

    const initGraph = mockInitData.mock.calls[0][0];
    expect(initGraph.edges).toEqual([]);
    expect(initGraph.nodes[0].tools.some((tool: any) => tool && tool.id === 'ref')).toBe(false);
    expect(initGraph.nodes[0].ports.items[0].attrs.text.text).toBe('');
    expect(initGraph.nodes[0].ports.items[0].attrs.text.title).toBeUndefined();
    expect(initGraph.nodes[0].tools.find((tool: any) => tool?.id === 'nodeTitle')).toEqual(
      expect.objectContaining({ width: 280, title: '' }),
    );
    expect(initGraph.nodes[1].tools.find((tool: any) => tool?.id === 'nodeTitle')).toEqual(
      expect.objectContaining({ width: 350, title: '' }),
    );

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-width',
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ id: 'nodeTitle', width: 280, title: '' }),
          ]),
        }),
      ),
    );
    expect(mockUpdateNode).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ id: 'nodeTitle', width: 350, title: '' }),
        ]),
      }),
    );
  });

  it('falls back to empty model detail payloads and empty graph data', async () => {
    mockGenLifeCycleModelInfoFromData.mockReturnValueOnce({});
    mockGenLifeCycleModelData.mockReturnValueOnce(undefined);
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {},
    });

    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(mockGenLifeCycleModelInfoFromData).toHaveBeenCalledWith({}));
    await waitFor(() => expect(mockGenLifeCycleModelData).toHaveBeenCalledWith({}, 'en'));
    await waitFor(() =>
      expect(mockInitData).toHaveBeenCalledWith({
        nodes: [],
        edges: [],
      }),
    );
    expect(mockGetProcessesByIdAndVersion).not.toHaveBeenCalled();
  });

  it('fails soft when process display lookups reject', async () => {
    mockGetProcessesByIdAndVersion.mockRejectedValueOnce(new Error('table lookup failed'));
    mockGetProcessDetailByIdAndVersion.mockRejectedValueOnce(new Error('detail lookup failed'));

    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(mockInitData).toHaveBeenCalled());
    expect(mockNormalizeLifeCycleModelGraphForDisplay).toHaveBeenCalledWith(
      expect.objectContaining({
        processDetails: [],
      }),
    );
  });

  it('falls back to an empty selected version when the chosen process instance points to a submodel', async () => {
    mockGraphStoreState.nodes = [
      {
        id: 'node-1',
        selected: true,
        size: { width: 300 },
        data: {
          id: 'proc-1',
          label: 'Process One',
          quantitativeReference: '1',
        },
        ports: { items: [] },
      },
    ];
    mockGraphStoreState.edges = [];
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: 'proc-1', version: undefined, modelId: 'submodel-1' }],
    });

    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(screen.getByTestId('life-cycle-model-view')).toBeInTheDocument());
    expect(screen.getByTestId('life-cycle-model-view')).toHaveTextContent(
      'submodel-1::toolIcon:en',
    );
  });

  it('registers graph handlers that toggle node and edge selection', () => {
    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible={false} />);

    const nodeClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:click',
    )?.[1];
    const blankClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'blank:click',
    )?.[1];
    const edgeClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'edge:click',
    )?.[1];
    const edgeAdded = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'edge:added',
    )?.[1];

    nodeClick({
      node: {
        id: 'node-1',
        isNode: () => true,
      },
      e: { ctrlKey: true },
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });

    mockUpdateNode.mockClear();
    mockUpdateEdge.mockClear();

    blankClick();
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-1', { selected: false });

    mockUpdateEdge.mockClear();
    mockGraphStoreState.edges.push({ id: 'edge-2', selected: false });
    edgeClick({ edge: { id: 'edge-2' } });
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-1', { selected: false });
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-2', { selected: true });

    edgeAdded({ edge: { id: 'edge-new' } });
    expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-new']);
  });

  it('rebuilds read-only node tools after resize and clears pending refresh timers on unmount', () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = render(
      <ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />,
    );

    const nodeResize = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:change:size',
    )?.[1];

    const resizeNode = {
      data: {
        label: 'Resized View Node',
        quantitativeReference: '1',
      },
      getSize: () => ({ width: 420 }),
      getPorts: () => [
        {
          id: 'port-output',
          group: 'groupOutput',
          data: {
            textLang: 'Output Flow',
            allocations: [1],
            quantitativeReference: '1',
          },
          attrs: { text: {} },
        },
      ],
      setAttrByPath: jest.fn(),
      prop: jest.fn(),
      removeTools: jest.fn(),
      addTools: jest.fn(),
    };

    nodeResize({ node: resizeNode });
    nodeResize({ node: resizeNode });

    act(() => {
      jest.runAllTimers();
    });

    expect(resizeNode.setAttrByPath).toHaveBeenCalledWith('label/text', '', {
      ignoreHistory: true,
    });
    expect(resizeNode.prop).toHaveBeenCalledWith(
      'ports/items',
      [
        expect.objectContaining({
          attrs: expect.objectContaining({
            text: expect.objectContaining({
              text: 'Flow label',
              title: 'Flow label',
              cursor: 'move',
            }),
          }),
        }),
      ],
      { ignoreHistory: true },
    );
    expect(resizeNode.removeTools).toHaveBeenCalled();
    expect(resizeNode.addTools).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'nodeTitle', width: 420 })]),
      { ignoreHistory: true, reset: true },
    );
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    const fallbackResizeNode = {
      data: {
        label: 'Fallback Resize Node',
        quantitativeReference: '0',
      },
      getSize: () => ({ width: 280 }),
      getPorts: () => [
        {
          id: 'port-input',
          group: 'groupInput',
          data: {
            allocations: undefined,
            quantitativeReference: '0',
          },
          attrs: {},
        },
      ],
      setAttrByPath: jest.fn(),
      prop: jest.fn(),
      removeTools: jest.fn(),
      addTools: jest.fn(),
    };

    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce(undefined);
    nodeResize({ node: fallbackResizeNode });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(fallbackResizeNode.prop).toHaveBeenCalledWith(
      'ports/items',
      [
        expect.objectContaining({
          attrs: expect.objectContaining({
            text: expect.objectContaining({
              text: '',
              title: undefined,
              cursor: 'move',
            }),
          }),
        }),
      ],
      { ignoreHistory: true },
    );

    nodeResize({ node: resizeNode });
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);

    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('enforces exclusive node selection on plain clicks and ignores repeated edge clicks', () => {
    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible={false} />);

    const nodeClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:click',
    )?.[1];
    const edgeClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'edge:click',
    )?.[1];

    nodeClick({
      node: {
        id: 'node-2',
        isNode: () => true,
      },
      e: {},
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-2', { selected: true });

    mockUpdateEdge.mockClear();
    edgeClick({ edge: { id: 'edge-1' } });
    expect(mockUpdateEdge).not.toHaveBeenCalled();
  });

  it('falls back to empty ids when deselecting nodes and edges without ids', () => {
    mockGraphStoreState.nodes = [
      {
        selected: true,
        data: {
          quantitativeReference: '0',
        },
        ports: { items: [] },
      },
      {
        id: 'node-2',
        selected: false,
        data: {
          quantitativeReference: '0',
        },
        ports: { items: [] },
      },
    ];
    mockGraphStoreState.edges = [{ selected: true }];

    render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible={false} />);

    const nodeClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:click',
    )?.[1];
    const blankClick = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'blank:click',
    )?.[1];

    nodeClick({
      node: {
        id: 'node-2',
        isNode: () => true,
      },
      e: {},
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-2', { selected: true });

    mockUpdateNode.mockClear();
    mockUpdateEdge.mockClear();

    blankClick();
    expect(mockUpdateNode).toHaveBeenCalledWith('', { selected: false });
    expect(mockUpdateEdge).toHaveBeenCalledWith('', { selected: false });
  });

  it('rebuilds graph-derived labels for the latest language and rejects stale detail responses', async () => {
    const englishResolution = createDeferred();
    const frenchResolution = createDeferred();
    mockGetLifeCycleModelDetail
      .mockReset()
      .mockImplementationOnce(() => englishResolution.promise)
      .mockImplementationOnce(() => frenchResolution.promise);
    mockGenLifeCycleModelData.mockImplementation((_jsonTg: any, lang: string) => ({
      nodes: [
        {
          id: `node-${lang}`,
          size: { width: 320 },
          data: {
            id: 'proc-1',
            version: '1.0',
            label: `Process ${lang}`,
            quantitativeReference: '1',
          },
          ports: {
            items: [
              {
                id: `port-${lang}`,
                group: 'groupInput',
                data: {
                  textLang: `Flow ${lang}`,
                  quantitativeReference: '0',
                },
                attrs: { text: {} },
              },
            ],
          },
        },
      ],
      edges: [],
    }));
    mockGetLangText.mockImplementation((_value: any, lang: string) => `Flow label ${lang}`);

    const { rerender } = render(
      <ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />,
    );
    await waitFor(() => expect(mockGetLifeCycleModelDetail).toHaveBeenCalledTimes(1));

    rerender(<ToolbarView id='model-1' version='1.0.0' lang='fr' drawerVisible />);
    await waitFor(() => expect(mockGetLifeCycleModelDetail).toHaveBeenCalledTimes(2));

    await act(async () => {
      frenchResolution.resolve({
        success: true,
        data: {
          json: { lifeCycleModelDataSet: {} },
          json_tg: { xflow: { nodes: [] } },
        },
      });
    });
    await waitFor(() => expect(mockInitData).toHaveBeenCalledTimes(1));
    expect(mockGenLifeCycleModelData).toHaveBeenCalledWith({ xflow: { nodes: [] } }, 'fr');
    expect(mockInitData.mock.calls[0][0].nodes[0]).toEqual(
      expect.objectContaining({
        id: 'node-fr',
        ports: expect.objectContaining({
          items: [
            expect.objectContaining({
              attrs: expect.objectContaining({
                text: expect.objectContaining({ title: 'Flow label fr' }),
              }),
            }),
          ],
        }),
      }),
    );

    await act(async () => {
      englishResolution.resolve({
        success: true,
        data: {
          json: { lifeCycleModelDataSet: {} },
          json_tg: { xflow: { nodes: [] } },
        },
      });
    });

    expect(mockGenLifeCycleModelData).toHaveBeenCalledTimes(1);
    expect(mockInitData).toHaveBeenCalledTimes(1);
  });

  it('uses the browser locale fallback when neither runtime locale is supported', () => {
    render(
      <ToolbarView id='model-1' version='1.0.0' lang='unsupported-locale' drawerVisible={false} />,
    );

    expect(mockGetLifeCycleModelDetail).not.toHaveBeenCalled();
  });

  it('abandons graph materialization when unmount invalidates the resolution mid-transform', async () => {
    const detailResolution = createDeferred();
    mockGetLifeCycleModelDetail.mockReturnValueOnce(detailResolution.promise);

    let unmountView = () => {};
    mockGenLifeCycleModelData.mockImplementationOnce(() => {
      unmountView();
      return { nodes: [], edges: [] };
    });

    const rendered = render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);
    unmountView = rendered.unmount;

    await waitFor(() => expect(mockGetLifeCycleModelDetail).toHaveBeenCalledTimes(1));
    await act(async () => {
      detailResolution.resolve({
        success: true,
        data: {
          json: { lifeCycleModelDataSet: {} },
          json_tg: { xflow: { nodes: [] } },
        },
      });
      await detailResolution.promise;
      await Promise.resolve();
    });

    expect(mockGenLifeCycleModelData).toHaveBeenCalledTimes(1);
    expect(mockInitData).not.toHaveBeenCalled();
  });

  it('abandons graph materialization when process display loading becomes stale', async () => {
    const processInstancesResolution = createDeferred();
    const processDetailsResolution = createDeferred();
    mockGetProcessesByIdAndVersion.mockReturnValueOnce(processInstancesResolution.promise);
    mockGetProcessDetailByIdAndVersion.mockReturnValueOnce(processDetailsResolution.promise);
    mockNormalizeLifeCycleModelGraphForDisplay.mockClear();

    const rendered = render(<ToolbarView id='model-1' version='1.0.0' lang='en' drawerVisible />);

    await waitFor(() => expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalled());
    rendered.unmount();

    await act(async () => {
      processInstancesResolution.resolve({ data: [] });
      processDetailsResolution.resolve({ data: [] });
      await Promise.all([processInstancesResolution.promise, processDetailsResolution.promise]);
      await Promise.resolve();
    });

    expect(mockNormalizeLifeCycleModelGraphForDisplay).not.toHaveBeenCalled();
  });
});
