// @ts-nocheck
import ToolbarEdit from '@/pages/LifeCycleModels/Components/toolbar/editIndex';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '../../../../../helpers/testUtils';

const mockUpdateNode = jest.fn();
const mockAddNodes = jest.fn();
const mockRemoveNodes = jest.fn();
const mockRemoveEdges = jest.fn();
const mockUpdateEdge = jest.fn();
const mockInitData = jest.fn();
const mockSyncGraphData = jest.fn();
const mockToolbarHandleCheckData = jest.fn();
const mockToolbarSubmitReview = jest.fn();
const mockToolbarUpdateReferenceDescription = jest.fn();
const mockUpdateNodeCb = jest.fn();
const mockGetRefData = jest.fn();
const mockGetProcessesByIdAndVersion = jest.fn().mockResolvedValue({ data: [] });
const mockGetImportedId = jest.fn().mockReturnValue(undefined);
const mockIsSupabaseDuplicateKeyError = jest.fn().mockReturnValue(false);
const mockGetLangText = jest.fn().mockReturnValue('Flow Name');
const mockJsonToList = jest.fn((value: any) =>
  Array.isArray(value) ? value : value ? [value] : [],
);
const mockFormatDateTime = jest.fn(() => '2024-01-01 00:00');
const mockGetUserTeamId = jest.fn().mockResolvedValue('team-1');
const mockGetUserId = jest.fn().mockResolvedValue('user-1');
const mockCheckReferences = jest.fn();
const mockGetAllRefObj = jest.fn().mockReturnValue([]);
const mockGetRefTableName = jest.fn().mockReturnValue('process');
const mockHasLangNormalizationDraftChanges = jest.fn();

let mockGraphStoreState: any = { nodes: [], edges: [] };
let lastControlProps: any;
let mockGraph: any;

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
  useGraphInstance: () => mockGraphStoreState.graph,
}));

const { useGraphEvent: mockUseGraphEvent } = jest.requireMock('@/contexts/graphContext');

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CopyOutlined: () => <span>copy-icon</span>,
  DeleteOutlined: () => <span>delete-icon</span>,
  SaveOutlined: () => <span>save-icon</span>,
  SendOutlined: () => <span>send-icon</span>,
  CheckCircleOutlined: () => <span>check-icon</span>,
}));

jest.mock('@/style/custom.less', () => ({
  __esModule: true,
  default: { footer_right: 'footer-right' },
}));

jest.mock('antd', () => {
  const React = require('react');
  const { toText } = require('../../../../../helpers/nodeToText');
  const Button = ({ children, onClick, disabled = false, icon, htmlType = 'button' }: any) => (
    <button
      type={htmlType === 'submit' ? 'submit' : htmlType === 'reset' ? 'reset' : 'button'}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {icon}
      {toText(children)}
    </button>
  );
  const Tooltip = ({ children }: any) => <>{children}</>;
  const Space = ({ children, orientation }: any) => (
    <div data-orientation={orientation}>{children}</div>
  );
  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <div>{children}</div>;
  // 与真实 antd 一致：Modal 通过 portal 渲染到 body，不受外层禁用 fieldset 影响
  const { createPortal } = require('react-dom');
  const Modal = ({ children, footer }: any) =>
    createPortal(
      <div data-testid='calculation-modal'>
        {children}
        {footer}
      </div>,
      globalThis.document.body,
    );
  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };
  const modal = {
    error: jest.fn(),
    destroyAll: jest.fn(),
  };

  const App = { useApp: () => ({ message, modal }) };
  const theme = {
    useToken: () => ({
      token: {
        colorPrimary: '#1890ff',
        colorBgContainer: '#fff',
        colorBorder: '#ddd',
        colorBgBase: '#fafafa',
        colorTextBase: '#000',
        colorTextDescription: '#666',
        colorError: '#ff4d4f',
      },
    }),
  };
  return {
    __esModule: true,
    Button,
    Tooltip,
    Space,
    Spin,
    Modal,
    App,
    message,
    modal,
    theme,
  };
});

jest.mock('@/pages/LifeCycleModels/Components/toolbar/editTargetAmount', () => ({
  __esModule: true,
  default: ({ onData, drawerVisible }: any) => (
    <div>
      {drawerVisible ? <span>target-amount-open</span> : null}
      <button
        type='button'
        onClick={() => onData({ targetAmount: 20, originalAmount: 10, scalingFactor: '2' })}
      >
        trigger-target-amount
      </button>
    </div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/add', () => ({
  __esModule: true,
  default: ({ onData }: any) => (
    <button
      type='button'
      onClick={() =>
        onData([
          { id: 'proc-a', version: '1.0' },
          { id: 'proc-b', version: '1.1' },
        ])
      }
    >
      add-processes
    </button>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/control', () => ({
  __esModule: true,
  Control: (props: any) => {
    lastControlProps = props;
    return (
      <div>
        <div data-testid='control-items'>{props.items?.join(',')}</div>
        <button type='button' onClick={() => props.editorActions?.undo?.()}>
          control-undo
        </button>
        <button type='button' onClick={() => props.editorActions?.redo?.()}>
          control-redo
        </button>
        <button type='button' onClick={() => props.editorActions?.paste?.()}>
          control-paste
        </button>
        <button type='button' onClick={() => props.editorActions?.duplicate?.()}>
          control-duplicate
        </button>
      </div>
    );
  },
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/eidtInfo', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        handleCheckData: (...args: any[]) => mockToolbarHandleCheckData(...args),
        submitReview: (...args: any[]) => mockToolbarSubmitReview(...args),
        updateReferenceDescription: (...args: any[]) =>
          mockToolbarUpdateReferenceDescription(...args),
      }));
      const version =
        props?.data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'];
      return (
        <div>
          <div>{`toolbar-edit-info:${props.action}:${version ?? '-'}`}</div>
          <button
            type='button'
            onClick={() =>
              props.onData?.({
                administrativeInformation: {
                  publicationAndOwnership: {
                    'common:dataSetVersion': '2.2.2',
                  },
                },
              })
            }
          >
            emit-info-data
          </button>
          <button
            type='button'
            onClick={() =>
              props.onProcessInstanceValidationChange?.([
                {
                  fieldLabel: 'Reference identifier',
                  fieldPath: 'processInstance[#pi-2].referenceToProcess.@refObjectId',
                  key: 'sdk-process-instance-issue',
                  presentation: 'highlight-only',
                  reasonMessage: 'Required value is missing',
                  tabName: 'lifeCycleModelInformation',
                },
              ])
            }
          >
            emit-process-instance-issues
          </button>
          <button
            type='button'
            onClick={() =>
              props.onNavigateProcessInstance?.({
                fieldLabel: 'Reference identifier',
                fieldPath: 'processInstance[#pi-2].referenceToProcess.@refObjectId',
                key: 'sdk-process-instance-issue',
                presentation: 'highlight-only',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
              })
            }
          >
            navigate-process-instance-issue
          </button>
        </div>
      );
    }),
  };
});

jest.mock('@/pages/LifeCycleModels/Components/connectableProcesses', () => ({
  __esModule: true,
  default: ({ drawerVisible, portId, flowVersion, onData }: any) => (
    <div>
      {drawerVisible ? <span>{`connectable:${portId}:${flowVersion}`}</span> : null}
      {drawerVisible ? (
        <button type='button' onClick={() => onData([{ id: 'proc-connected', version: '3.0' }])}>
          connect-processes
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version, updateNodeCb }: any) => (
    <div>
      <span>{`life-cycle-model-edit:${id}:${version}`}</span>
      {updateNodeCb ? (
        <button
          type='button'
          onClick={() =>
            updateNodeCb({
              '@refObjectId': 'ref-proc-1',
              '@version': '2.0',
              '@type': 'process data set',
            })
          }
        >
          run-model-update-node
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/modelResult', () => ({
  __esModule: true,
  default: ({ modelId, modelVersion, actionType, submodels }: any) => (
    <div
      data-testid='model-result'
      data-submodels={JSON.stringify(submodels)}
    >{`model-result:${modelId}:${modelVersion}:${actionType}`}</div>
  ),
}));

jest.mock('@/pages/LifeCycleModels/Components/view', () => ({
  __esModule: true,
  default: ({ id, version }: any) => <div>{`life-cycle-model-view:${id}:${version}`}</div>,
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/Exchange/index', () => ({
  __esModule: true,
  default: () => <div>edge-exchange</div>,
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortSelect', () => ({
  __esModule: true,
  default: ({ drawerVisible, direction, node, onData }: any) => (
    <div>
      {drawerVisible ? <span>{`io-port:${direction}:${node?.id}`}</span> : null}
      {drawerVisible ? (
        <button
          type='button'
          onClick={() =>
            onData({
              selectedRowData: [
                {
                  referenceToFlowDataSet: {
                    '@refObjectId': `flow-${direction.toLowerCase()}`,
                    '@version': '1.0',
                    'common:shortDescription': [],
                  },
                  allocations: [{ allocatedFraction: '0.5' }],
                  quantitativeReference: true,
                },
              ],
            })
          }
        >
          apply-io-port
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version, updateNodeCb, setViewDrawerVisible }: any) => (
    <div>
      <span>{`process-edit:${id}:${version}`}</span>
      {updateNodeCb ? (
        <button
          type='button'
          onClick={() =>
            updateNodeCb({
              '@refObjectId': 'ref-proc-1',
              '@version': '2.0',
              '@type': 'process data set',
            })
          }
        >
          run-process-update-node
        </button>
      ) : null}
      {setViewDrawerVisible ? (
        <button type='button' onClick={() => setViewDrawerVisible(true)}>
          open-process-view-drawer
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/view', () => ({
  __esModule: true,
  default: ({ id, version }: any) => <div>{`process-view:${id}:${version}`}</div>,
}));

const mockCreateLifeCycleModel = jest.fn().mockResolvedValue({});
const mockGetLifeCycleModelDetail = jest.fn().mockResolvedValue({ data: {} });
const mockUpdateLifeCycleModel = jest.fn().mockResolvedValue({});

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  createLifeCycleModel: (...args: any[]) => mockCreateLifeCycleModel(...args),
  getLifeCycleModelDetail: (...args: any[]) => mockGetLifeCycleModelDetail(...args),
  updateLifeCycleModel: (...args: any[]) => mockUpdateLifeCycleModel(...args),
}));

const mockGenLifeCycleModelData = jest.fn().mockReturnValue({ json: {} });
const mockGenLifeCycleModelInfoFromData = jest.fn().mockReturnValue({});
const mockGenLifeCycleModelNodeName = jest.fn().mockReturnValue('Updated Process');
const mockGenNodeLabel = jest.fn().mockReturnValue('Node Label');
const mockGenPortLabel = jest.fn().mockReturnValue('Port Label');
const resolveMockPortFlowVersion = (node: any, portId: string) =>
  node?.ports?.items?.find((port: any) => port.id === portId)?.data?.flowVersion;
const mockGetLifeCycleModelPortFlowVersion = jest.fn(resolveMockPortFlowVersion);

jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genLifeCycleModelData: (...args: any[]) => mockGenLifeCycleModelData(...args),
  genLifeCycleModelInfoFromData: (...args: any[]) => mockGenLifeCycleModelInfoFromData(...args),
  genLifeCycleModelNodeName: (...args: any[]) => mockGenLifeCycleModelNodeName(...args),
  genNodeLabel: (...args: any[]) => mockGenNodeLabel(...args),
  genPortLabel: (...args: any[]) => mockGenPortLabel(...args),
  getLifeCycleModelPortFlowVersion: (...args: any[]) =>
    mockGetLifeCycleModelPortFlowVersion(...args),
}));

const mockGetProcessDetail = jest.fn();
const mockGetProcessDetailByIdAndVersion = jest.fn().mockResolvedValue({ data: {} });

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
  getProcessDetailByIdAndVersion: (...args: any[]) => mockGetProcessDetailByIdAndVersion(...args),
  getProcessesByIdAndVersion: (...args: any[]) => mockGetProcessesByIdAndVersion(...args),
}));

const mockGenProcessFromData = jest.fn().mockReturnValue({ exchanges: { exchange: [] } });
const mockGenProcessNameJson = jest.fn().mockReturnValue('updated-process');

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
  genProcessNameJson: (...args: any[]) => mockGenProcessNameJson(...args),
}));

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  getRefData: (...args: any[]) => mockGetRefData(...args),
  hasLangNormalizationDraftChanges: (...args: any[]) =>
    mockHasLangNormalizationDraftChanges(...args),
}));

jest.mock('@/services/general/data', () => ({
  __esModule: true,
  initVersion: '1.0',
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  formatDateTime: (...args: any[]) => mockFormatDateTime(...args),
  getImportedId: (...args: any[]) => mockGetImportedId(...args),
  isSupabaseDuplicateKeyError: (...args: any[]) => mockIsSupabaseDuplicateKeyError(...args),
  getLangText: (...args: any[]) => mockGetLangText(...args),
  jsonToList: (...args: any[]) => mockJsonToList(...args),
}));

jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getUserTeamId: (...args: any[]) => mockGetUserTeamId(...args),
}));

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  checkReferences: (...args: any[]) => mockCheckReferences(...args),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  getRefTableName: (...args: any[]) => mockGetRefTableName(...args),
  ReffPath: class {
    findProblemNodes() {
      return [];
    }
  },
}));

jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUserId: (...args: any[]) => mockGetUserId(...args),
}));

jest.mock('uuid', () => ({
  __esModule: true,
  v4: () => 'uuid-123',
}));

beforeEach(() => {
  mockUpdateNode.mockReset();
  mockAddNodes.mockReset();
  mockRemoveNodes.mockReset();
  mockRemoveEdges.mockReset();
  mockUpdateEdge.mockReset();
  mockInitData.mockReset();
  mockToolbarHandleCheckData.mockReset().mockResolvedValue({ problemNodes: [] });
  mockToolbarSubmitReview.mockReset().mockResolvedValue(true);
  mockToolbarUpdateReferenceDescription.mockReset().mockResolvedValue(undefined);
  mockUpdateNodeCb.mockReset().mockResolvedValue(undefined);
  mockSyncGraphData.mockReset();
  mockGetRefData.mockReset().mockResolvedValue({ data: { ruleVerification: true } });
  mockHasLangNormalizationDraftChanges
    .mockReset()
    .mockImplementation((value: any) =>
      Boolean(
        (value?.langSupplementedPlaceholderPaths?.length ?? 0) > 0 ||
        (value?.langTranslatedPaths?.length ?? 0) > 0,
      ),
    );
  mockGetProcessesByIdAndVersion.mockReset().mockResolvedValue({ data: [] });
  mockGetImportedId.mockReset().mockReturnValue(undefined);
  mockIsSupabaseDuplicateKeyError.mockReset().mockReturnValue(false);
  mockGetLangText.mockReset().mockReturnValue('Flow Name');
  mockJsonToList
    .mockReset()
    .mockImplementation((value: any) => (Array.isArray(value) ? value : value ? [value] : []));
  mockFormatDateTime.mockReset().mockReturnValue('2024-01-01 00:00');
  mockGetUserTeamId.mockReset().mockResolvedValue('team-1');
  mockGetUserId.mockReset().mockResolvedValue('user-1');
  mockCheckReferences.mockReset().mockResolvedValue({
    findProblemNodes: () => [],
  });
  mockGetAllRefObj.mockReset().mockReturnValue([]);
  mockGetRefTableName.mockReset().mockReturnValue('process');
  mockUseGraphEvent.mockClear();
  mockGenNodeLabel.mockReset().mockReturnValue('Node Label');
  mockGenPortLabel.mockReset().mockReturnValue('Port Label');
  mockGetLifeCycleModelPortFlowVersion.mockReset().mockImplementation(resolveMockPortFlowVersion);
  mockGetProcessDetail.mockReset().mockResolvedValue({
    data: {
      version: '2.0',
      json: {
        processDataSet: {
          processInformation: {
            dataSetInformation: {
              name: [{ '@xml:lang': 'en', '#text': 'Updated Process' }],
            },
          },
        },
      },
    },
  });
  mockGenProcessFromData.mockReset().mockReturnValue({ exchanges: { exchange: [] } });
  mockGenLifeCycleModelNodeName.mockReset().mockReturnValue('Updated Process');
  mockGenProcessNameJson.mockReset().mockReturnValue('updated-process');
  mockGetProcessDetailByIdAndVersion.mockReset().mockResolvedValue({ data: [] });
  mockGetLifeCycleModelDetail.mockReset().mockResolvedValue({
    success: true,
    data: {
      version: '1.0',
      json: {
        lifeCycleModelDataSet: {},
      },
      json_tg: {
        xflow: {
          nodes: [],
          edges: [],
          submodels: [],
        },
      },
    },
  });
  mockGenLifeCycleModelData.mockReset().mockReturnValue({ nodes: [], edges: [] });
  mockGenLifeCycleModelInfoFromData.mockReset().mockReturnValue({
    administrativeInformation: {
      publicationAndOwnership: {
        'common:dataSetVersion': '1.0',
      },
    },
  });
  mockUpdateLifeCycleModel.mockReset().mockResolvedValue({
    ok: true,
    modelId: 'model-1',
    version: '1.1',
    lifecycleModel: {
      id: 'model-1',
      version: '1.1',
      json_tg: {
        xflow: {
          edges: [],
        },
      },
    },
  });
  mockCreateLifeCycleModel.mockReset().mockResolvedValue({
    ok: true,
    modelId: 'created-model',
    version: '1.1',
    lifecycleModel: {
      id: 'created-model',
      version: '1.1',
      json_tg: {
        xflow: {
          edges: [],
        },
      },
    },
  });
  const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
  antMessage.success.mockReset();
  antMessage.error.mockReset();
  lastControlProps = undefined;
  mockGraph = {
    bindKey: jest.fn(),
    unbindKey: jest.fn(),
    canUndo: jest.fn(() => false),
    canRedo: jest.fn(() => false),
    cleanClipboard: jest.fn(),
    cleanHistory: jest.fn(),
    cleanSelection: jest.fn(),
    copy: jest.fn(),
    centerCell: jest.fn(),
    getEdges: jest.fn(() => mockGraphStoreState.edges),
    getCellById: jest.fn((id: string) => ({ id })),
    getNodes: jest.fn(() => mockGraphStoreState.nodes),
    getSelectedCells: jest.fn(() => []),
    isClipboardEmpty: jest.fn(() => true),
    paste: jest.fn(() => []),
    redo: jest.fn(),
    select: jest.fn(),
    undo: jest.fn(),
    batchUpdate: jest.fn((_name: string, callback: () => void) => callback()),
  };
  mockGraphStoreState = {
    initData: mockInitData,
    addNodes: mockAddNodes,
    updateNode: mockUpdateNode,
    removeNodes: mockRemoveNodes,
    removeEdges: mockRemoveEdges,
    updateEdge: mockUpdateEdge,
    syncGraphData: mockSyncGraphData,
    graph: mockGraph,
    nodes: [
      {
        id: 'node-1',
        size: { width: 350 },
        data: {
          id: 'proc-1',
          index: 'pi-1',
          version: '1.0',
          label: 'Node 1',
          quantitativeReference: '1',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
      {
        id: 'node-2',
        size: { width: 350 },
        data: {
          id: 'proc-2',
          index: 'pi-2',
          version: '1.0',
          label: 'Node 2',
          quantitativeReference: '0',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
    ],
    edges: [],
  };
});

afterEach(() => {
  jest.useRealTimers();
});

const getGraphHandler = (eventName: string) => {
  const call = mockUseGraphEvent.mock.calls.find((item: any[]) => item[0] === eventName);
  return call?.[1];
};

const getNodeTool = (nodeId: string, toolId: string) => {
  const calls = mockUpdateNode.mock.calls.filter(
    ([id, payload]: [string, any]) => id === nodeId && payload?.tools,
  );
  const latestTools = calls[calls.length - 1]?.[1]?.tools ?? [];
  return latestTools.find((tool: any) => tool?.id === toolId);
};

describe('single-provider connection rejection (event handler)', () => {
  const baseProps = {
    id: 'model-1',
    version: '1.0',
    lang: 'en',
    drawerVisible: false,
    isSave: false,
    action: 'edit',
    setIsSave: jest.fn(),
    onClose: jest.fn(),
    updateNodeCb: mockUpdateNodeCb,
  };
  const uuidNodes = [
    {
      id: 'uuid-node-1',
      data: {
        id: 'proc-1',
        index: 'pi-1',
        version: '1.0',
        label: 'Node 1',
        quantitativeReference: '0',
      },
    },
    {
      id: 'uuid-node-2',
      data: {
        id: 'proc-2',
        index: 'pi-2',
        version: '1.0',
        label: 'Node 2',
        quantitativeReference: '0',
      },
    },
    {
      id: 'uuid-node-3',
      data: {
        id: 'proc-3',
        index: 'pi-3',
        version: '1.0',
        label: 'Node 3',
        quantitativeReference: '0',
      },
    },
  ];
  // 画布 UUID 与实例序号(pi-N)完全不同

  const withStore = (edges: unknown[]) => {
    mockGraphStoreState.nodes = uuidNodes;
    mockGraphStoreState.edges = edges as never;
  };

  const connectedEvent = (
    edgeId: string,
    sourceCell: string,
    targetCell: string,
    flowId: string,
  ) => ({
    edge: {
      id: edgeId,
      getSourcePortId: () => `groupOutput:${sourceCell}:${flowId}`,
      getTargetPortId: () => `groupInput:${targetCell}:${flowId}`,
      getSourceCellId: () => sourceCell,
      getTargetCellId: () => targetCell,
    },
  });

  beforeEach(() => {
    withStore([]);
  });

  it('rejects a second provider whose canvas UUID differs from the instance index', async () => {
    withStore([
      {
        id: 'edge-first',
        source: { cell: 'uuid-node-1' },
        target: { cell: 'uuid-node-2' },
        data: {
          node: { sourceNodeID: 'uuid-node-1', targetNodeID: 'uuid-node-2' },
          connection: {
            outputExchange: { '@flowUUID': 'flow-1', downstreamProcess: { '@flowUUID': 'flow-1' } },
          },
        },
      },
    ]);
    render(<ToolbarEdit {...baseProps} drawerVisible />);
    const connectedHandler = getGraphHandler('edge:connected');
    expect(connectedHandler).toBeDefined();

    connectedHandler(connectedEvent('edge-second', 'uuid-node-3', 'uuid-node-2', 'flow-1'));

    await waitFor(() => expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-second']));
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    expect(antMessage.error).toHaveBeenCalledWith(
      'pages.lifecyclemodel.calculation.connection.singleProvider',
    );
  });

  it('accepts reconnecting the same edge and fan-out to different inputs', async () => {
    withStore([
      {
        id: 'edge-first',
        source: { cell: 'uuid-node-1' },
        target: { cell: 'uuid-node-2' },
        data: {
          node: { sourceNodeID: 'uuid-node-1', targetNodeID: 'uuid-node-2' },
          connection: {
            outputExchange: { '@flowUUID': 'flow-1', downstreamProcess: { '@flowUUID': 'flow-1' } },
          },
        },
      },
    ]);
    render(<ToolbarEdit {...baseProps} drawerVisible />);
    const connectedHandler = getGraphHandler('edge:connected');

    // 重连同一条边（排除自身）不被拒绝
    connectedHandler(connectedEvent('edge-first', 'uuid-node-1', 'uuid-node-2', 'flow-1'));
    await waitFor(() => expect(mockRemoveEdges).not.toHaveBeenCalled());

    // 不同输入的独立连线不被拒绝
    connectedHandler(connectedEvent('edge-other-input', 'uuid-node-3', 'uuid-node-2', 'flow-9'));
    await waitFor(() => expect(mockRemoveEdges).not.toHaveBeenCalled());
  });
});

describe('ToolbarEdit', () => {
  const baseProps = {
    id: 'model-1',
    version: '1.0',
    lang: 'en',
    drawerVisible: false,
    isSave: false,
    action: 'edit',
    setIsSave: jest.fn(),
    onClose: jest.fn(),
    updateNodeCb: mockUpdateNodeCb,
  };

  const renderVisibleToolbarEdit = async (props: Record<string, unknown> = {}) => {
    render(<ToolbarEdit {...baseProps} drawerVisible={true} {...props} />);

    expect(screen.getByTestId('spin')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith(
        props.id ?? baseProps.id,
        props.version ?? baseProps.version,
      ),
    );
    await waitFor(() => expect(screen.queryByTestId('spin')).not.toBeInTheDocument());
  };

  it('highlights graph nodes that have sdk process-instance validation issues', async () => {
    await renderVisibleToolbarEdit();

    await userEvent.click(screen.getByRole('button', { name: 'emit-process-instance-issues' }));

    await waitFor(() =>
      expect(
        mockUpdateNode.mock.calls.some(
          ([id, payload]: [string, any]) =>
            id === 'node-2' && payload?.attrs?.body?.stroke === '#ff4d4f',
        ),
      ).toBe(true),
    );
  });

  it('navigates to the sdk-invalid process-instance node from toolbar callbacks', async () => {
    mockGraphStoreState.nodes = mockGraphStoreState.nodes.map((node: any, index: number) => ({
      ...node,
      selected: index === 0,
    }));
    mockGraphStoreState.edges = [{ id: 'edge-1', selected: true }];

    await renderVisibleToolbarEdit();

    await userEvent.click(screen.getByRole('button', { name: 'navigate-process-instance-issue' }));

    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-1', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-2', { selected: true });
    expect(mockGraph.cleanSelection).toHaveBeenCalled();
    expect(mockGraph.centerCell).toHaveBeenCalledWith({ id: 'node-2' });
  });

  it('updates reference node target amounts via TargetAmount callback', async () => {
    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'trigger-target-amount' }));

    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', {
      data: expect.objectContaining({
        targetAmount: 20,
        originalAmount: 10,
        scalingFactor: '2',
      }),
    });
  });

  it('falls back to empty ids when updating target amounts for sparse reference nodes', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      id: undefined,
    };

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'trigger-target-amount' }));

    expect(mockUpdateNode).toHaveBeenCalledWith('', {
      data: expect.objectContaining({
        targetAmount: 20,
        originalAmount: 10,
        scalingFactor: '2',
      }),
    });
  });

  it('refreshes node data when update reference is triggered', async () => {
    mockGetProcessDetail.mockResolvedValue({
      data: {
        version: '2.0',
        json: {
          processDataSet: {},
          json: {},
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      exchanges: {
        exchange: [
          {
            exchangeDirection: 'input',
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '1.0',
              'common:shortDescription': [],
            },
            allocations: null,
          },
        ],
      },
    });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'copy-icon' }));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledTimes(2));
    expect(mockGetProcessDetail).toHaveBeenCalledWith('proc-1', '1.0');
    expect(mockGetProcessDetail).toHaveBeenCalledWith('proc-2', '1.0');
    expect(mockUpdateNode).toHaveBeenCalled();
  });

  it('refreshes sparse node references with empty process ids and versions', async () => {
    mockGraphStoreState.nodes = [
      {
        id: undefined,
        data: {
          quantitativeReference: '1',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
    ];
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        json: {
          processDataSet: {},
        },
      },
    });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'copy-icon' }));

    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('', ''));
    expect(mockUpdateNode).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        data: expect.objectContaining({
          version: '',
        }),
      }),
    );
  });

  it('toggles node selection when modifier key is pressed', () => {
    render(<ToolbarEdit {...baseProps} />);

    const nodeClickCall = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:click',
    );
    const nodeClickHandler = nodeClickCall?.[1];
    expect(typeof nodeClickHandler).toBe('function');

    const fakeNode = {
      id: 'node-1',
      isNode: () => true,
      getPorts: jest.fn(() => []),
    };

    mockUpdateNode.mockClear();
    mockGraphStoreState.nodes[0].selected = false;
    nodeClickHandler({
      node: fakeNode,
      e: { ctrlKey: true, target: null },
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: true });

    mockUpdateNode.mockClear();
    mockGraphStoreState.nodes[0].selected = true;
    nodeClickHandler({
      node: fakeNode,
      e: { metaKey: true, target: null },
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
  });

  it('selects only the clicked node when no modifier is pressed', () => {
    render(<ToolbarEdit {...baseProps} />);

    const nodeClickCall = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'node:click',
    );
    const nodeClickHandler = nodeClickCall?.[1];
    expect(typeof nodeClickHandler).toBe('function');

    mockUpdateNode.mockClear();
    mockGraphStoreState.nodes[0].selected = false;
    mockGraphStoreState.nodes[1].selected = true;

    const fakeNode = {
      id: 'node-1',
      isNode: () => true,
      getPorts: jest.fn(() => []),
    };

    nodeClickHandler({
      node: fakeNode,
      e: { target: null },
    });

    expect(mockUpdateNode).toHaveBeenCalledWith('node-2', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: true });
  });

  it('clears all selections when blank area is clicked', () => {
    render(<ToolbarEdit {...baseProps} />);

    const blankClickCall = mockUseGraphEvent.mock.calls.find(
      (call: any[]) => call[0] === 'blank:click',
    );
    const blankClickHandler = blankClickCall?.[1];
    expect(typeof blankClickHandler).toBe('function');

    mockUpdateNode.mockClear();
    mockGraphStoreState.nodes[0].selected = true;
    mockGraphStoreState.nodes[1].selected = true;

    blankClickHandler();

    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('node-2', { selected: false });
  });

  it('saves lifecycle model data when the save action is clicked', async () => {
    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'model-1',
          version: '1.0',
          model: expect.objectContaining({
            nodes: expect.any(Array),
            edges: expect.any(Array),
          }),
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
    expect(mockToolbarUpdateReferenceDescription).toHaveBeenCalled();
    expect(mockUpdateNodeCb).toHaveBeenCalledWith({
      '@refObjectId': 'model-1',
      '@version': '1.0',
      '@type': 'lifeCycleModel data set',
    });
  });

  it('wires editor controls and keyboard shortcuts to graph actions', async () => {
    await renderVisibleToolbarEdit();

    expect(screen.getByTestId('control-items')).toHaveTextContent(
      'undo,redo,paste,duplicate,zoomOut,zoomTo,zoomIn,zoomToFit,zoomToOrigin,autoLayoutLR',
    );
    expect(lastControlProps?.canDuplicate).toBe(false);
    expect(mockGraph.bindKey).toHaveBeenCalledWith(['meta+z', 'ctrl+z'], expect.any(Function));
    expect(mockGraph.bindKey).toHaveBeenCalledWith(
      ['meta+shift+z', 'ctrl+shift+z', 'ctrl+y'],
      expect.any(Function),
    );
    expect(mockGraph.bindKey).toHaveBeenCalledWith(['backspace', 'delete'], expect.any(Function));
    expect(mockGraph.bindKey).toHaveBeenCalledWith(['meta+c', 'ctrl+c'], expect.any(Function));
    expect(mockGraph.bindKey).toHaveBeenCalledWith(['meta+v', 'ctrl+v'], expect.any(Function));
    expect(mockGraph.bindKey).toHaveBeenCalledWith(['meta+d', 'ctrl+d'], expect.any(Function));

    const shortcutHandlers = mockGraph.bindKey.mock.calls.map(
      ([, handler]: [string[], (event: { preventDefault: () => void }) => boolean]) => handler,
    );
    const preventDefault = jest.fn();
    shortcutHandlers.forEach((handler: (event: { preventDefault: () => void }) => boolean) => {
      expect(handler({ preventDefault })).toBe(false);
    });
    expect(preventDefault).toHaveBeenCalledTimes(shortcutHandlers.length);
  });

  it('marks visual-only node refreshes to ignore history', () => {
    render(<ToolbarEdit {...baseProps} />);

    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        tools: expect.any(Array),
      }),
      { ignoreHistory: true },
    );
    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        attrs: expect.any(Object),
      }),
      { ignoreHistory: true },
    );
  });

  it('rehydrates only graph visuals when content language changes', async () => {
    const { rerender } = render(<ToolbarEdit {...baseProps} />);
    mockInitData.mockClear();
    mockUpdateNode.mockClear();

    rerender(<ToolbarEdit {...baseProps} lang='de' />);

    await waitFor(() => expect(mockUpdateNode).toHaveBeenCalledTimes(2));
    mockUpdateNode.mock.calls.forEach(([, visualUpdate, options]: [string, any, any]) => {
      expect(visualUpdate).toEqual(
        expect.objectContaining({
          ports: expect.any(Object),
          tools: expect.any(Array),
        }),
      );
      expect(visualUpdate).not.toHaveProperty('data');
      expect(visualUpdate).not.toHaveProperty('selected');
      expect(visualUpdate).not.toHaveProperty('x');
      expect(visualUpdate).not.toHaveProperty('y');
      expect(options).toEqual({ ignoreHistory: true });
    });
    expect(mockInitData).not.toHaveBeenCalled();
  });

  it('duplicates selected cells from the control actions and syncs graph state', async () => {
    const selectedCell = { id: 'node-1' };
    const pastedReferenceNode = {
      id: 'node-copy',
      isEdge: () => false,
      isNode: () => true,
      getData: jest.fn(() => ({
        label: [{ '@xml:lang': 'en', '#text': 'Copied Process' }],
        quantitativeReference: '1',
      })),
      setData: jest.fn(),
      removeTools: jest.fn(),
      addTools: jest.fn(),
      getSize: jest.fn(() => ({ width: 350 })),
    };

    mockGraphStoreState.nodes[0].selected = true;
    mockGraph.getSelectedCells.mockReturnValue([selectedCell]);
    mockGraph.isClipboardEmpty.mockReturnValue(false);
    mockGraph.paste.mockReturnValue([pastedReferenceNode]);
    mockGraph.getNodes.mockReturnValue([...mockGraphStoreState.nodes, { id: 'node-copy' }]);

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'control-duplicate' }));

    expect(mockGraph.copy).toHaveBeenCalledWith([selectedCell], {
      deep: true,
      useLocalStorage: false,
    });
    expect(mockGraph.batchUpdate).toHaveBeenCalledWith('clipboard-paste', expect.any(Function));
    expect(mockGraph.paste).toHaveBeenCalledWith({
      offset: { dx: 32, dy: 32 },
      useLocalStorage: false,
    });
    expect(pastedReferenceNode.setData).toHaveBeenCalledWith({
      label: [{ '@xml:lang': 'en', '#text': 'Copied Process' }],
      quantitativeReference: '0',
    });
    expect(mockGraph.cleanSelection).toHaveBeenCalled();
    expect(mockGraph.select).toHaveBeenCalledWith([pastedReferenceNode]);
    expect(mockSyncGraphData).toHaveBeenCalled();
  });

  it('copies selected cells and skips non-node or non-reference clipboard pastes', async () => {
    const selectedCell = { id: 'node-1' };
    const pastedEdge = {
      isNode: () => false,
    };
    const pastedNonReferenceNode = {
      isEdge: () => false,
      isNode: () => true,
      getData: jest.fn(() => ({
        label: [{ '@xml:lang': 'en', '#text': 'Copied Process' }],
        quantitativeReference: '0',
      })),
      setData: jest.fn(),
      addTools: jest.fn(),
      getSize: jest.fn(() => ({ width: 280 })),
    };

    mockGraphStoreState.nodes[0].selected = true;
    mockGraph.getSelectedCells.mockReturnValue([selectedCell]);

    await renderVisibleToolbarEdit();

    const copyHandler = mockGraph.bindKey.mock.calls.find(([keys]: [string[]]) =>
      keys.includes('meta+c'),
    )?.[1];
    const pasteHandler = mockGraph.bindKey.mock.calls.find(([keys]: [string[]]) =>
      keys.includes('meta+v'),
    )?.[1];

    act(() => {
      copyHandler({ preventDefault: jest.fn() });
    });
    expect(mockGraph.copy).toHaveBeenCalledWith([selectedCell], {
      deep: true,
      useLocalStorage: false,
    });

    mockGraph.isClipboardEmpty.mockReturnValue(false);
    mockGraph.paste
      .mockReturnValueOnce([])
      .mockReturnValueOnce([pastedEdge, pastedNonReferenceNode]);

    act(() => {
      pasteHandler({ preventDefault: jest.fn() });
    });
    expect(mockGraph.paste).toHaveBeenCalledWith({
      offset: { dx: 32, dy: 32 },
      useLocalStorage: false,
    });

    act(() => {
      pasteHandler({ preventDefault: jest.fn() });
    });

    expect(pastedNonReferenceNode.setData).not.toHaveBeenCalled();
    expect(pastedNonReferenceNode.addTools).not.toHaveBeenCalled();
    expect(mockGraph.cleanSelection).toHaveBeenCalled();
    expect(mockGraph.select).toHaveBeenCalledWith([pastedEdge, pastedNonReferenceNode]);
  });

  it('executes undo and redo when history commands are available', async () => {
    mockGraph.canUndo.mockReturnValue(true);
    mockGraph.canRedo.mockReturnValue(true);

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'control-undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'control-redo' }));

    expect(mockGraph.undo).toHaveBeenCalledTimes(1);
    expect(mockGraph.redo).toHaveBeenCalledTimes(1);
    expect(mockSyncGraphData).toHaveBeenCalledTimes(2);
  });

  it('updates saved edit edge labels and preserves edges without targets during save', async () => {
    mockGraphStoreState.edges = [
      {
        id: 'edge-with-target',
        target: { cell: 'node-1', x: 10, y: 20 },
      },
      {
        id: 'edge-without-target',
        data: { connection: { exchangeAmount: 0, unbalancedAmount: 0 } },
      },
    ];
    mockUpdateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'model-1',
      version: '1.1',
      lifecycleModel: {
        id: 'model-1',
        version: '1.1',
        json_tg: {
          xflow: {
            edges: [
              {
                id: 'saved-edit-edge',
                data: { connection: { unbalancedAmount: 7, exchangeAmount: 9 } },
              },
            ],
          },
        },
      },
    });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            edges: expect.arrayContaining([
              expect.objectContaining({
                id: 'edge-with-target',
                target: { cell: 'node-1' },
              }),
              expect.objectContaining({
                id: 'edge-without-target',
              }),
            ]),
          }),
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'saved-edit-edge',
      { labels: [expect.anything()] },
      { ignoreHistory: true },
    );
  });

  it('saves from store snapshots when the graph instance is unavailable', async () => {
    mockGraphStoreState.graph = undefined;
    mockGraphStoreState.nodes = [{ id: 'store-node', data: { label: 'Store Node' } }];
    mockGraphStoreState.edges = [{ id: 'store-edge' }];
    mockUpdateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'model-1',
      version: '1.1',
      lifecycleModel: {
        id: 'model-1',
        version: '1.1',
      },
    });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: {
            nodes: [{ id: 'store-node', data: { label: 'Store Node', index: '0' } }],
            edges: [{ id: 'store-edge' }],
          },
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
  });

  it('runs footer data-check through the edit info ref without saving', async () => {
    mockUpdateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'model-1',
      version: '1.0',
      lifecycleModel: {
        id: 'model-1',
        version: '1.0',
        json_tg: {
          xflow: {
            edges: [],
          },
        },
      },
    });
    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));

    await waitFor(() =>
      expect(mockToolbarHandleCheckData).toHaveBeenCalledWith(
        'checkData',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'node-1',
          }),
        ]),
        expect.any(Array),
        expect.objectContaining({
          silent: false,
          validationSnapshot: expect.objectContaining({
            modelId: 'model-1',
            version: '1.0',
            payload: expect.objectContaining({
              model: expect.objectContaining({
                nodes: expect.arrayContaining([
                  expect.objectContaining({
                    id: 'node-1',
                    data: expect.objectContaining({
                      index: '0',
                    }),
                  }),
                ]),
                edges: expect.any(Array),
              }),
            }),
          }),
        }),
      ),
    );
  });

  it('runs a silent auto-check once after lifecycle model info loads when requested', async () => {
    const { unmount } = render(
      <ToolbarEdit {...baseProps} drawerVisible={true} autoCheckRequired onClose={jest.fn()} />,
    );

    await waitFor(() =>
      expect(mockToolbarHandleCheckData).toHaveBeenCalledWith(
        'checkData',
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({ silent: true }),
      ),
    );

    unmount();
  });

  it('reuses the current validation snapshot when the toolbar action is blank', async () => {
    render(<ToolbarEdit {...baseProps} action='' />);

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));

    await waitFor(() =>
      expect(mockToolbarHandleCheckData).toHaveBeenCalledWith(
        'checkData',
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({
          silent: false,
          validationSnapshot: expect.objectContaining({
            modelId: 'model-1',
            version: '1.0',
          }),
        }),
      ),
    );
    expect(mockCreateLifeCycleModel).not.toHaveBeenCalled();
    expect(mockUpdateLifeCycleModel).not.toHaveBeenCalled();
  });

  it('skips the silent auto-check when imported lifecycle model info resolves to undefined', async () => {
    mockGenLifeCycleModelInfoFromData.mockReturnValueOnce(undefined);

    render(
      <ToolbarEdit
        {...baseProps}
        action='create'
        drawerVisible={true}
        autoCheckRequired
        importData={[{ lifeCycleModelDataSet: {}, json_tg: {} }]}
      />,
    );

    await waitFor(() => expect(screen.getByText('toolbar-edit-info:create:-')).toBeInTheDocument());

    expect(mockToolbarHandleCheckData).not.toHaveBeenCalled();
  });

  it('submits a review when review validation passes', async () => {
    mockToolbarHandleCheckData.mockResolvedValue({
      checkResult: true,
      unReview: [{ '@refObjectId': 'proc-1', '@version': '1.0', '@type': 'process data set' }],
      problemNodes: [],
    });

    render(<ToolbarEdit {...baseProps} isSave={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));

    await waitFor(() =>
      expect(mockToolbarHandleCheckData).toHaveBeenCalledWith(
        'review',
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({
          validationSnapshot: expect.objectContaining({
            modelId: 'model-1',
            version: '1.0',
          }),
        }),
      ),
    );
    expect(mockToolbarSubmitReview).toHaveBeenCalledWith([
      { '@refObjectId': 'proc-1', '@version': '1.0', '@type': 'process data set' },
    ]);
  });

  it('notifies the outer editor when review submission succeeds', async () => {
    mockToolbarHandleCheckData.mockResolvedValue({
      checkResult: true,
      unReview: [],
      problemNodes: [],
    });
    const onSubmitReviewSuccess = jest.fn();

    render(
      <ToolbarEdit
        {...baseProps}
        isSave={true}
        drawerVisible={true}
        onSubmitReviewSuccess={onSubmitReviewSuccess}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));

    await waitFor(() =>
      expect(mockToolbarHandleCheckData).toHaveBeenCalledWith(
        'review',
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({
          validationSnapshot: expect.objectContaining({
            modelId: 'model-1',
            version: '1.0',
          }),
        }),
      ),
    );
    expect(mockToolbarSubmitReview).toHaveBeenCalledWith([]);
    expect(onSubmitReviewSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps the outer editor open when review submission fails', async () => {
    mockToolbarHandleCheckData.mockResolvedValue({
      checkResult: true,
      unReview: [],
      problemNodes: [],
    });
    mockToolbarSubmitReview.mockResolvedValueOnce(false);
    const onSubmitReviewSuccess = jest.fn();

    render(
      <ToolbarEdit
        {...baseProps}
        isSave={true}
        drawerVisible={true}
        onSubmitReviewSuccess={onSubmitReviewSuccess}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));

    await waitFor(() => expect(mockToolbarSubmitReview).toHaveBeenCalledWith([]));
    expect(onSubmitReviewSuccess).not.toHaveBeenCalled();
  });

  it('falls back to empty review queues when validation omits them', async () => {
    mockToolbarHandleCheckData.mockResolvedValueOnce({
      checkResult: true,
    });

    render(<ToolbarEdit {...baseProps} isSave={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));

    await waitFor(() => expect(mockToolbarSubmitReview).toHaveBeenCalledWith([]));
  });

  it('does not submit a review when review validation fails and hides the button when requested', async () => {
    mockToolbarHandleCheckData.mockResolvedValue({
      checkResult: false,
      unReview: [],
      problemNodes: [],
    });

    const { rerender } = render(<ToolbarEdit {...baseProps} isSave={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));

    await waitFor(() => expect(mockToolbarHandleCheckData).toHaveBeenCalled());
    expect(mockToolbarSubmitReview).not.toHaveBeenCalled();

    rerender(<ToolbarEdit {...baseProps} isSave={true} hideReviewButton />);

    expect(screen.queryByRole('button', { name: 'send-icon' })).not.toBeInTheDocument();
  });

  it('opens input/output selectors from node tools and updates ports for both directions', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    expect(inputTool).toBeTruthy();

    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    expect(screen.getByText('io-port:Input:node-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          ports: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                id: 'INPUT:flow-input',
              }),
            ]),
          }),
        }),
      ),
    );

    const outputTool = getNodeTool('node-1', 'outputFlow');
    expect(outputTool).toBeTruthy();

    await act(async () => {
      await outputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    expect(screen.getByText('io-port:Output:node-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        width: 350,
        height: expect.any(Number),
      }),
    );
  });

  it('batches flow port and node size updates into a single graph history mutation', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    mockGraph.batchUpdate.mockClear();
    mockUpdateNode.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    await waitFor(() => expect(mockGraph.batchUpdate).toHaveBeenCalledTimes(1));
    expect(mockGraph.batchUpdate).toHaveBeenCalledWith('update-node-ports', expect.any(Function));
    expect(mockUpdateNode).toHaveBeenCalledTimes(1);
    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        ports: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'INPUT:flow-input',
            }),
          ]),
        }),
        width: 350,
        height: expect.any(Number),
      }),
    );
  });

  it('applies port updates directly when the graph instance is unavailable', async () => {
    mockGraphStoreState.graph = undefined;

    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          ports: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                id: 'INPUT:flow-input',
              }),
            ]),
          }),
          width: 350,
          height: expect.any(Number),
        }),
      ),
    );
  });

  it('repositions existing output ports when new input ports are selected', async () => {
    mockGraphStoreState.nodes[0].ports.items = [
      {
        id: 'OUTPUT:existing-output',
        group: 'groupOutput',
        args: { y: 65 },
        attrs: { text: {} },
        data: { textLang: [], allocations: null },
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          ports: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                id: 'OUTPUT:existing-output',
                args: expect.objectContaining({ y: 85 }),
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it('uses zh-specific truncation rules when rebuilding port labels', async () => {
    mockGetLangText.mockReturnValue('这是一个特别长特别长的流名称用于测试中文截断');
    mockGraphStoreState.nodes[0].size.width = 120;

    render(<ToolbarEdit {...baseProps} lang='zh' />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          ports: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                attrs: expect.objectContaining({
                  text: expect.objectContaining({
                    text: expect.stringContaining('...'),
                    title: expect.any(String),
                  }),
                }),
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it('skips port updates when the selected node has no width and clears selected edges on node clicks', async () => {
    mockGraphStoreState.nodes[0].size = undefined;
    mockGraphStoreState.edges = [{ id: 'edge-selected', selected: true }];

    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({ cell: { store: { data: mockGraphStoreState.nodes[0] } } });
    });

    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));
    expect(mockUpdateNode).not.toHaveBeenCalled();

    const nodeClickHandler = getGraphHandler('node:click');
    nodeClickHandler({
      node: {
        id: 'node-1',
        isNode: () => true,
        getPorts: () => [],
      },
      e: { target: document.createElement('div') },
    });

    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-selected', { selected: false });
  });

  it('returns early when the selected io-port node has no id', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const inputTool = getNodeTool('node-1', 'inputFlow');
    await act(async () => {
      await inputTool.args.onClick({
        cell: {
          store: {
            data: {
              ...mockGraphStoreState.nodes[0],
              id: '',
            },
          },
        },
      });
    });

    mockGraph.batchUpdate.mockClear();
    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'apply-io-port' }));

    expect(mockGraph.batchUpdate).not.toHaveBeenCalled();
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it('toggles reference tools and opens the target amount drawer', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const refTool = getNodeTool('node-1', 'ref');
    const nonRefTool = getNodeTool('node-2', 'nonRef');
    expect(refTool).toBeTruthy();
    expect(nonRefTool).toBeTruthy();

    act(() => {
      refTool.args.onClick();
    });
    expect(screen.getByText('target-amount-open')).toBeInTheDocument();

    mockUpdateNode.mockClear();

    await act(async () => {
      await nonRefTool.args.onClick({
        cell: {
          store: {
            data: mockGraphStoreState.nodes[1],
          },
        },
      });
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-2',
      expect.objectContaining({
        data: expect.objectContaining({ quantitativeReference: '1' }),
      }),
    );
    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        data: expect.objectContaining({ quantitativeReference: '0' }),
      }),
    );
  });

  it('replaces ref and non-ref tool definitions when switching the quantitative reference node', async () => {
    mockGraphStoreState.nodes[0].tools = [{ id: 'ref' }, { id: 'inputFlow' }];
    mockGraphStoreState.nodes[1].tools = [{ id: 'nonRef' }, { id: 'outputFlow' }];

    render(<ToolbarEdit {...baseProps} />);

    const nonRefTool = getNodeTool('node-2', 'nonRef');
    expect(nonRefTool).toBeTruthy();

    mockUpdateNode.mockClear();

    await act(async () => {
      await nonRefTool.args.onClick({
        cell: {
          store: {
            data: mockGraphStoreState.nodes[1],
          },
        },
      });
    });

    const node1Payload = mockUpdateNode.mock.calls
      .filter(([id]: [string]) => id === 'node-1')
      .pop()?.[1];
    const node2Payload = mockUpdateNode.mock.calls
      .filter(([id]: [string]) => id === 'node-2')
      .pop()?.[1];

    expect(node2Payload.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'ref' })]),
    );
    expect(node1Payload.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'nonRef' })]),
    );
  });

  it('falls back to empty ids when switching sparse quantitative reference nodes', async () => {
    mockGraphStoreState.nodes = [
      {
        ...mockGraphStoreState.nodes[0],
        id: undefined,
      },
      {
        ...mockGraphStoreState.nodes[1],
        id: undefined,
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    const nonRefTool = mockUpdateNode.mock.calls
      .flatMap(([, payload]: [string, any]) => (payload?.tools ? payload.tools : []))
      .find((tool: any) => tool?.id === 'nonRef');
    expect(nonRefTool).toBeTruthy();

    mockUpdateNode.mockClear();

    await act(async () => {
      await nonRefTool.args.onClick({
        cell: {
          store: {
            data: mockGraphStoreState.nodes[1],
          },
        },
      });
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        data: expect.objectContaining({ quantitativeReference: '1' }),
      }),
    );
  });

  it('falls back to empty ids for sibling nodes when switching quantitative references', async () => {
    mockGraphStoreState.nodes = [
      {
        ...mockGraphStoreState.nodes[0],
        id: undefined,
      },
      {
        ...mockGraphStoreState.nodes[1],
        id: 'node-2',
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    const nonRefTool = getNodeTool('node-2', 'nonRef');
    expect(nonRefTool).toBeTruthy();

    mockUpdateNode.mockClear();

    await act(async () => {
      await nonRefTool.args.onClick({
        cell: {
          store: {
            data: mockGraphStoreState.nodes[1],
          },
        },
      });
    });

    expect(mockUpdateNode).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        data: expect.objectContaining({ quantitativeReference: '0' }),
      }),
    );
  });

  it('updates info data through the toolbar form and highlights problem nodes after data checks', async () => {
    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'emit-info-data' }));

    await waitFor(() => {
      expect(screen.getByText('toolbar-edit-info:edit:2.2.2')).toBeInTheDocument();
    });

    mockUpdateNode.mockClear();
    mockToolbarHandleCheckData.mockResolvedValueOnce({
      problemNodes: [
        {
          '@refObjectId': 'proc-1',
          '@version': '1.0',
          '@type': 'process data set',
        },
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          attrs: expect.objectContaining({
            body: expect.objectContaining({
              stroke: '#ff4d4f',
            }),
          }),
        }),
        { ignoreHistory: true },
      ),
    );
  });

  it('applies problem-node highlights with empty ids and falls back to empty check results', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      id: undefined,
    };

    render(<ToolbarEdit {...baseProps} />);

    mockUpdateNode.mockClear();
    mockToolbarHandleCheckData
      .mockResolvedValueOnce({
        problemNodes: [
          {
            '@refObjectId': 'proc-1',
            '@version': '1.0',
            '@type': 'process data set',
          },
        ],
      })
      .mockResolvedValueOnce(undefined);

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          attrs: expect.objectContaining({
            body: expect.objectContaining({
              stroke: '#ff4d4f',
            }),
          }),
        }),
        { ignoreHistory: true },
      ),
    );

    mockUpdateNode.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          attrs: expect.objectContaining({
            body: expect.objectContaining({
              stroke: '#1890ff',
            }),
          }),
        }),
        { ignoreHistory: true },
      ),
    );
  });

  it('adds process nodes from the toolbar and deletes selected nodes with connected edges', async () => {
    mockGetProcessDetailByIdAndVersion.mockResolvedValue({
      data: [
        {
          id: 'proc-a',
          version: '1.0',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: [{ '@xml:lang': 'en', '#text': 'Process A' }],
                },
              },
            },
          },
        },
        {
          id: 'proc-b',
          version: '1.1',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: [{ '@xml:lang': 'en', '#text': 'Process B' }],
                },
              },
            },
          },
        },
      ],
    });
    mockGenProcessFromData.mockReturnValue({
      exchanges: {
        exchange: [
          {
            quantitativeReference: true,
            exchangeDirection: 'output',
            allocations: [{ allocatedFraction: '1' }],
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-add',
              '@version': '1.0',
              'common:shortDescription': [],
            },
          },
        ],
      },
    });
    mockGraphStoreState.nodes[0].selected = true;
    mockGraphStoreState.edges = [
      {
        id: 'edge-1',
        source: { cell: 'node-1' },
        target: { cell: 'node-2' },
        labels: [{ attrs: {} }],
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'add-processes' }));

    await waitFor(() => expect(mockAddNodes).toHaveBeenCalledTimes(1));
    expect(mockAddNodes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'proc-a',
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'proc-b',
          }),
        }),
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'delete-icon' }));

    await waitFor(() => expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-1']));
    expect(mockRemoveNodes).toHaveBeenCalledWith(['node-1']);
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-1', { labels: [] }, { ignoreHistory: true });
  });

  it('clears edge labels with empty ids when deleting sparse connected selections', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      id: 'node-sparse',
      selected: true,
    };
    mockGraphStoreState.nodes[1].selected = false;
    mockGraphStoreState.edges = [
      {
        id: undefined,
        source: { cell: 'node-sparse' },
        labels: [{ attrs: {} }],
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'delete-icon' }));

    await waitFor(() => expect(mockRemoveEdges).toHaveBeenCalledWith(['']));
    expect(mockUpdateEdge).toHaveBeenCalledWith('', { labels: [] }, { ignoreHistory: true });
  });

  it('deletes selected edges when no node is selected', async () => {
    mockGraphStoreState.nodes[0].selected = false;
    mockGraphStoreState.nodes[1].selected = false;
    mockGraphStoreState.edges = [
      {
        id: 'edge-2',
        selected: true,
        labels: [{ attrs: {} }],
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'delete-icon' }));

    await waitFor(() => expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-2']));
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-2', { labels: [] }, { ignoreHistory: true });
  });

  it('deletes selected cells without batching when the graph instance is unavailable', async () => {
    mockGraphStoreState.graph = null;
    mockGraphStoreState.nodes[0].selected = true;
    mockGraphStoreState.edges = [
      {
        id: 'edge-no-graph',
        selected: true,
        source: { cell: 'node-1' },
        target: { cell: 'node-2' },
        labels: [{ attrs: {} }],
      },
    ];

    render(<ToolbarEdit {...baseProps} drawerVisible={true} onClose={undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'control-undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'control-redo' }));
    await userEvent.click(screen.getByRole('button', { name: 'control-paste' }));
    await userEvent.click(screen.getByRole('button', { name: 'control-duplicate' }));
    await userEvent.click(screen.getByRole('button', { name: 'delete-icon' }));

    expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-no-graph']);
    expect(mockRemoveNodes).toHaveBeenCalledWith(['node-1']);
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'edge-no-graph',
      { labels: [] },
      { ignoreHistory: true },
    );
  });

  it('deletes edge-only selections without a graph instance', async () => {
    mockGraphStoreState.graph = null;
    mockGraphStoreState.nodes[0].selected = false;
    mockGraphStoreState.nodes[1].selected = false;
    mockGraphStoreState.edges = [
      {
        id: 'edge-only-no-graph',
        selected: true,
        labels: [{ attrs: {} }],
      },
    ];

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'delete-icon' }));

    expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-only-no-graph']);
    expect(mockRemoveNodes).not.toHaveBeenCalled();
  });

  it('creates a lifecycle model from the empty-create state and applies saved edge labels', async () => {
    mockGraphStoreState.graph = {
      bindKey: jest.fn(),
      unbindKey: jest.fn(),
      cleanClipboard: jest.fn(),
      cleanHistory: jest.fn(),
      cleanSelection: jest.fn(),
      getNodes: () => [
        {
          toJSON: () => ({
            id: 'graph-node-1',
            data: { id: 'proc-1', version: '1.0', label: [], quantitativeReference: '1' },
          }),
        },
      ],
      getEdges: () => [
        {
          toJSON: () => ({
            id: 'graph-edge-1',
            target: { cell: 'graph-node-1', x: 10, y: 20 },
            data: { connection: { unbalancedAmount: 1, exchangeAmount: 2 } },
          }),
        },
      ],
    };
    mockCreateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'created-model',
      version: '1.1',
      lifecycleModel: {
        id: 'created-model',
        version: '1.1',
        json_tg: {
          xflow: {
            edges: [
              {
                id: 'saved-edge',
                data: { connection: { unbalancedAmount: 3, exchangeAmount: 4 } },
              },
            ],
          },
        },
      },
    });

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('toolbar-edit-info:create:1.0')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockCreateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'uuid-123',
          model: expect.objectContaining({
            nodes: expect.any(Array),
            edges: expect.any(Array),
          }),
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'saved-edge',
      { labels: [expect.anything()] },
      { ignoreHistory: true },
    );
  });

  it('shows a duplicate-id error when create mode hits a unique conflict', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    mockCreateLifeCycleModel.mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'duplicate',
    });

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith(
        'Data with the same ID and version already exists.',
      ),
    );
  });

  it('uses the existing id for create-version saves and tolerates sparse saved edges', async () => {
    mockCreateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'model-1',
      version: '2.0',
      lifecycleModel: {
        id: 'model-1',
        version: '2.0',
        json_tg: {},
      },
    });

    render(
      <ToolbarEdit
        {...baseProps}
        action='create'
        actionType='createVersion'
        drawerVisible={true}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockCreateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'model-1',
        }),
        expect.objectContaining({
          persistenceGraph: expect.objectContaining({
            nodes: expect.any(Array),
            edges: expect.any(Array),
          }),
          hasModelChanged: expect.any(Function),
        }),
        { sourceVersion: '1.0' },
      ),
    );
    expect(mockUpdateEdge).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ labels: expect.anything() }),
      expect.anything(),
    );
  });

  it('falls back to mutation result ids and versions when create saves omit lifecycleModel payloads', async () => {
    mockCreateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'created-fallback',
      version: '5.0',
    });
    mockUpdateLifeCycleModel.mockResolvedValueOnce({
      ok: true,
      modelId: 'created-fallback',
      version: '5.0',
    });

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockCreateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'uuid-123',
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'created-fallback',
          version: '5.0',
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
  });

  it('falls back to a generic create error when the backend omits a message', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    mockCreateLifeCycleModel.mockResolvedValueOnce({
      ok: false,
      code: 'FUNCTION_ERROR',
    });

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() => expect(antMessage.error).toHaveBeenCalledWith('Error'));
  });

  it('shows a localized missing-reference-process error when create save throws', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    mockCreateLifeCycleModel.mockRejectedValueOnce(
      new Error('No referenceToReferenceProcess found in lifeCycleModelInformation'),
    );

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith(
        'The model is missing reference process information. Complete or rebind the reference process, then try again.',
      ),
    );
  });

  it('shows open-data, under-review, and generic errors when edit saves fail', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;

    render(<ToolbarEdit {...baseProps} />);

    mockUpdateLifeCycleModel
      .mockResolvedValueOnce({
        ok: false,
        code: 'OPEN_DATA',
        message: 'This data is open data, save failed',
      })
      .mockResolvedValueOnce({
        ok: false,
        code: 'UNDER_REVIEW',
        message: 'Data is under review, save failed',
      })
      .mockResolvedValueOnce({ ok: false, code: 'FUNCTION_ERROR', message: 'generic failure' });

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith('This data is open data, save failed'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith('Data is under review, save failed'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() => expect(antMessage.error).toHaveBeenCalledWith('generic failure'));
  });

  it('shows a localized missing-reference-process error when edit save throws', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    mockUpdateLifeCycleModel.mockRejectedValueOnce(
      new Error('No referenceToReferenceProcess found in lifeCycleModelInformation'),
    );

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith(
        'The model is missing reference process information. Complete or rebind the reference process, then try again.',
      ),
    );
  });

  it('falls back to mutation result ids and versions when edit saves omit lifecycleModel payloads', async () => {
    mockUpdateLifeCycleModel
      .mockResolvedValueOnce({
        ok: true,
        modelId: 'model-fallback',
        version: '9.9',
      })
      .mockResolvedValueOnce({
        ok: true,
        modelId: 'model-fallback',
        version: '9.9',
      });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: 'model-1',
          version: '1.0',
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() =>
      expect(mockUpdateLifeCycleModel).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 'model-fallback',
          version: '9.9',
        }),
        expect.objectContaining({ hasModelChanged: expect.any(Function) }),
      ),
    );
  });

  it('initializes imported models when the drawer opens', async () => {
    mockGenLifeCycleModelInfoFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {
          'common:dataSetVersion': '7.7.7',
        },
      },
    });
    mockGenLifeCycleModelData.mockReturnValue({
      nodes: [
        {
          id: 'imported-node',
          size: { width: 360 },
          width: 360,
          data: {
            id: 'proc-imported',
            version: '1.0',
            label: [{ '@xml:lang': 'en', '#text': 'Imported' }],
            quantitativeReference: '1',
          },
          ports: {
            items: [
              {
                id: 'OUTPUT:flow-imported',
                group: 'groupOutput',
                attrs: { text: {} },
                data: { textLang: [], allocations: [{ allocatedFraction: '1' }] },
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'imported-edge',
          target: { cell: 'imported-node', x: 1, y: 2 },
          data: { connection: { unbalancedAmount: 5, exchangeAmount: 6 } },
        },
        {
          id: 'imported-edge-without-target',
          data: { connection: { unbalancedAmount: 0, exchangeAmount: 0 } },
        },
      ],
    });

    render(
      <ToolbarEdit
        {...baseProps}
        action='create'
        drawerVisible={true}
        importData={[{ lifeCycleModelDataSet: {}, json_tg: {} }]}
      />,
    );

    await waitFor(() =>
      expect(mockInitData).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'imported-node',
            }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: 'imported-edge',
              labels: [expect.anything()],
            }),
            expect.objectContaining({
              id: 'imported-edge-without-target',
            }),
          ]),
        }),
      ),
    );
    expect(screen.getByText('toolbar-edit-info:create:7.7.7')).toBeInTheDocument();
  });

  it('initializes sparse imported models without optional callbacks', async () => {
    mockGenLifeCycleModelData.mockReturnValueOnce({});

    render(
      <ToolbarEdit
        {...baseProps}
        id=''
        version=''
        action='create'
        drawerVisible={true}
        importData={[{ lifeCycleModelDataSet: {} }]}
        updateNodeCb={undefined as any}
      />,
    );

    await waitFor(() =>
      expect(mockInitData).toHaveBeenCalledWith({
        nodes: [],
        edges: [],
      }),
    );
    expect(screen.getByText('toolbar-edit-info:create:1.0')).toBeInTheDocument();
  });

  it('loads existing models, applies createVersion overrides, and renders ownership-specific model actions', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [
              {
                id: 'edge-loaded',
                target: { cell: 'node-1', x: 10, y: 20 },
                data: { connection: { unbalancedAmount: 1, exchangeAmount: 2 } },
              },
            ],
          },
          submodels: [{ id: 'submodel-1' }, { id: 'provider-1', type: 'allocated' }],
        },
      },
    });
    mockGenLifeCycleModelInfoFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {
          'common:dataSetVersion': '1.0',
        },
      },
    });
    mockGenLifeCycleModelData.mockReturnValue({
      nodes: [],
      edges: [],
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: 'proc-1', version: '1.0', userId: 'user-1', modelId: 'child-model' }],
    });

    render(
      <ToolbarEdit
        {...baseProps}
        drawerVisible={true}
        actionType='createVersion'
        newVersion='9.9.9'
      />,
    );

    await waitFor(() => expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-1', '1.0'));
    await waitFor(() => expect(mockGetProcessesByIdAndVersion).toHaveBeenCalled());
    expect(screen.getByText('toolbar-edit-info:edit:9.9.9')).toBeInTheDocument();
    expect(screen.getByText('life-cycle-model-edit:child-model:1.0')).toBeInTheDocument();
    expect(screen.getByText('model-result:model-1:1.0:edit')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('model-result').getAttribute('data-submodels')!)).toEqual([
      { id: 'submodel-1', version: '1.0' },
    ]);
  });

  it('loads sparse existing models and falls back to empty editor payloads', async () => {
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {},
    });
    mockGenLifeCycleModelInfoFromData.mockReturnValueOnce({
      administrativeInformation: {
        publicationAndOwnership: {},
      },
    });
    mockGenLifeCycleModelData.mockReturnValueOnce({});

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() => expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-1', '1.0'));
    await waitFor(() =>
      expect(mockInitData).toHaveBeenCalledWith({
        nodes: [],
        edges: [],
      }),
    );
  });

  it('hydrates loaded graph ports and keeps edges without targets unchanged', async () => {
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {},
          submodels: [],
        },
      },
    });
    mockGenLifeCycleModelInfoFromData.mockReturnValue({
      administrativeInformation: {
        publicationAndOwnership: {
          'common:dataSetVersion': '1.0',
        },
      },
    });
    mockGenLifeCycleModelData.mockReturnValue({
      nodes: [
        {
          id: 'loaded-node',
          size: { width: 280 },
          data: {
            id: 'proc-loaded',
            version: '1.0',
            label: [{ '@xml:lang': 'en', '#text': 'Loaded Node' }],
            quantitativeReference: '0',
          },
          ports: {
            items: [
              {
                id: 'OUTPUT:flow-loaded',
                group: 'groupOutput',
                attrs: { text: { text: 'old-text' } },
                data: {
                  textLang: [{ '@xml:lang': 'en', '#text': 'Loaded Flow' }],
                  allocations: [{ allocatedFraction: '0.5' }],
                  quantitativeReference: true,
                },
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'loaded-edge',
          target: { cell: 'loaded-node', x: 10, y: 20 },
          data: { connection: { unbalancedAmount: 1, exchangeAmount: 2 } },
        },
        {
          id: 'loaded-edge-without-target',
          data: { connection: { unbalancedAmount: 0, exchangeAmount: 0 } },
        },
      ],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() =>
      expect(mockInitData).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'loaded-node',
              ports: expect.objectContaining({
                items: expect.arrayContaining([
                  expect.objectContaining({
                    id: 'OUTPUT:flow-loaded',
                    attrs: expect.objectContaining({
                      text: expect.objectContaining({
                        title: 'Flow Name',
                      }),
                    }),
                  }),
                ]),
              }),
            }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: 'loaded-edge',
              selected: false,
              attrs: {
                line: expect.objectContaining({
                  strokeWidth: 1,
                }),
              },
              target: { cell: 'loaded-node' },
              labels: [expect.anything()],
            }),
            expect.objectContaining({
              id: 'loaded-edge-without-target',
              selected: false,
            }),
          ]),
        }),
      ),
    );
  });

  it('hydrates lightweight saved graphs for editing without persisting runtime-only fields', async () => {
    const storedJsonTg = {
      xflow: {
        nodes: [
          { id: '0', data: { id: 'process-a', version: '01.00.000' } },
          { id: '1', data: { id: 'process-b', version: '01.00.021' } },
        ],
        edges: [
          {
            id: 'edge-a',
            source: { cell: '0' },
            target: { cell: '1' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-a',
                  downstreamProcess: { '@flowUUID': 'flow-a' },
                },
              },
            },
          },
        ],
      },
      submodels: [],
    };
    const storedJsonTgSnapshot = JSON.parse(JSON.stringify(storedJsonTg));
    const lifeCycleModelDataSet = {
      lifeCycleModelInformation: {
        quantitativeReference: {
          referenceToReferenceProcess: '0',
        },
      },
    };
    const processDetails = [
      {
        id: 'process-a',
        version: '01.00.000',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: [{ '@xml:lang': 'en', '#text': 'Process A' }],
              },
            },
            exchanges: {
              exchange: {
                exchangeDirection: 'OUTPUT',
                quantitativeReference: true,
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-a',
                  '@version': '01.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Output flow A' }],
                },
              },
            },
          },
        },
      },
      {
        id: 'process-b',
        version: '01.00.021',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: [{ '@xml:lang': 'en', '#text': 'Process B' }],
              },
            },
            exchanges: {
              exchange: {
                exchangeDirection: 'INPUT',
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-a',
                  '@version': '01.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Input flow A' }],
                },
              },
            },
          },
        },
      },
    ];
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '01.00.000',
        json: { lifeCycleModelDataSet },
        json_tg: storedJsonTg,
      },
    });
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({ data: processDetails });
    mockGenLifeCycleModelData.mockImplementationOnce((jsonTg: any) => jsonTg.xflow);

    await renderVisibleToolbarEdit({ version: '01.00.000' });

    expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalledWith([
      { id: 'process-a', version: '01.00.000' },
      { id: 'process-b', version: '01.00.021' },
    ]);
    const initializedGraph = mockInitData.mock.calls.at(-1)?.[0];
    expect(initializedGraph).toEqual(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            id: '0',
            height: 80,
            data: expect.objectContaining({
              label: [{ '@xml:lang': 'en', '#text': 'Process A' }],
              quantitativeReference: '1',
            }),
            ports: expect.objectContaining({
              items: [expect.objectContaining({ id: 'OUTPUT:flow-a' })],
            }),
            tools: expect.arrayContaining([expect.objectContaining({ id: 'ref' })]),
          }),
          expect.objectContaining({
            id: '1',
            height: 80,
            data: expect.objectContaining({
              label: [{ '@xml:lang': 'en', '#text': 'Process B' }],
              quantitativeReference: '0',
            }),
            ports: expect.objectContaining({
              items: [expect.objectContaining({ id: 'INPUT:flow-a' })],
            }),
            tools: expect.arrayContaining([expect.objectContaining({ id: 'nonRef' })]),
          }),
        ],
        edges: [
          expect.objectContaining({
            id: 'edge-a',
            source: { cell: '0', port: 'OUTPUT:flow-a' },
            target: { cell: '1', port: 'INPUT:flow-a' },
          }),
        ],
      }),
    );
    expect(storedJsonTg).toEqual(storedJsonTgSnapshot);

    mockGraph.getNodes.mockReturnValue(initializedGraph.nodes);
    mockGraph.getEdges.mockReturnValue(initializedGraph.edges);
    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() => expect(mockUpdateLifeCycleModel).toHaveBeenCalled());
    const [runtimePayload, mutationOptions] = mockUpdateLifeCycleModel.mock.calls.at(-1);
    expect(runtimePayload.model.nodes[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ quantitativeReference: '1' }),
        ports: expect.objectContaining({
          items: [expect.objectContaining({ id: 'OUTPUT:flow-a' })],
        }),
      }),
    );
    expect(mutationOptions.persistenceGraph).toEqual(storedJsonTg.xflow);
  });

  it('renders process-view actions for non-owned process instances', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0', userId: 'someone-else' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() => expect(screen.getByText('process-view:proc-1:1.0')).toBeInTheDocument());
  });

  it('renders lifecycle-model view actions for non-owned model-backed process instances', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [{ id: 'child-model' }],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0', userId: 'someone-else', modelId: 'child-model' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() =>
      expect(screen.getByText('life-cycle-model-view:child-model:1.0')).toBeInTheDocument(),
    );
  });

  it('falls back to empty versions in non-owned model-backed process views', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      selected: true,
      data: {
        id: undefined,
        version: undefined,
        label: 'Node 1',
        quantitativeReference: '1',
      },
    };
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [{ id: 'child-model' }],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: undefined, version: undefined, userId: 'someone-else', modelId: 'child-model' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() =>
      expect(screen.getByText('life-cycle-model-view:child-model:')).toBeInTheDocument(),
    );
  });

  it('ignores empty process-instance responses and falls back to empty selected-node ids', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      selected: true,
      data: {
        id: undefined,
        version: undefined,
        label: 'Node 1',
        quantitativeReference: '1',
      },
    };
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({});

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() =>
      expect(mockGetProcessesByIdAndVersion).toHaveBeenCalledWith([
        { id: 'proc-1', version: '1.0' },
      ]),
    );
    await waitFor(() => expect(screen.getByText('process-view::')).toBeInTheDocument());
  });

  it('shows an error when the existing model is not public', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: false,
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() => expect(antMessage.error).toHaveBeenCalledWith('Model is not public'));
  });

  it('refreshes references with matched and unmatched exchanges', async () => {
    mockGraphStoreState.nodes[0].ports.items = [
      {
        id: 'INPUT:flow-1',
        group: 'groupInput',
        attrs: { text: {} },
        data: { textLang: [], allocations: null },
      },
    ];
    mockGraphStoreState.nodes[1].ports.items = [
      {
        id: 'OUTPUT:missing-flow',
        group: 'groupOutput',
        attrs: { text: {} },
        data: { textLang: [], allocations: null },
      },
    ];
    mockGetProcessDetail.mockResolvedValue({
      data: {
        version: '2.0',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: [{ '@xml:lang': 'en', '#text': 'Updated Process' }],
              },
            },
          },
        },
      },
    });
    mockGenProcessFromData.mockReturnValue({
      exchanges: {
        exchange: [
          {
            exchangeDirection: 'input',
            quantitativeReference: true,
            allocations: [{ allocatedFraction: '1' }],
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-1',
              '@version': '2.0',
              'common:shortDescription': [],
            },
          },
        ],
      },
    });

    render(<ToolbarEdit {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'copy-icon' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          ports: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  flowVersion: '2.0',
                }),
              }),
            ]),
          }),
        }),
      ),
    );
    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-2',
      expect.objectContaining({
        ports: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: '-',
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('handles edge and node graph events, including invalid connections and port clicks', async () => {
    jest.useFakeTimers();
    mockGraphStoreState.nodes[0].selected = true;
    mockGraphStoreState.edges = [
      {
        id: 'edge-existing',
        labels: [{ attrs: {} }],
        selected: true,
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    const edgeAddedHandler = getGraphHandler('edge:added');
    const edgeConnectedHandler = getGraphHandler('edge:connected');
    const edgeClickHandler = getGraphHandler('edge:click');
    const nodeResizeHandler = getGraphHandler('node:change:size');
    const nodeClickHandler = getGraphHandler('node:click');
    const blankClickHandler = getGraphHandler('blank:click');

    edgeAddedHandler({
      edge: { id: 'edge-new' },
    });
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'edge-new',
      expect.objectContaining({
        attrs: expect.objectContaining({
          line: expect.objectContaining({
            strokeWidth: 1,
          }),
        }),
      }),
      { ignoreHistory: true },
    );
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'edge-existing',
      { labels: [] },
      { ignoreHistory: true },
    );

    mockGraphStoreState.nodes[0].ports.items = [
      {
        id: 'OUTPUT:flow-a',
        group: 'groupOutput',
        data: { flowId: 'flow-a', flowVersion: '01.02.003' },
      },
    ];
    mockGraphStoreState.nodes[1].ports.items = [
      {
        id: 'INPUT:flow-a',
        group: 'groupInput',
        data: { flowId: 'flow-a', flowVersion: '04.05.006' },
      },
    ];

    const validEdge = {
      id: 'edge-valid',
      getSourcePortId: () => 'OUTPUT:flow-a',
      getTargetPortId: () => 'INPUT:flow-a',
      getSourceCellId: () => 'node-1',
      getTargetCellId: () => 'node-2',
    };
    edgeConnectedHandler({ edge: validEdge });
    expect(mockUpdateEdge).toHaveBeenCalledWith(
      'edge-valid',
      expect.objectContaining({
        data: expect.objectContaining({
          connection: {
            outputExchange: {
              '@flowUUID': 'flow-a',
              '@version': '01.02.003',
              downstreamProcess: {
                '@flowUUID': 'flow-a',
                '@version': '04.05.006',
              },
            },
          },
        }),
      }),
    );

    const invalidEdge = {
      id: 'edge-invalid',
      getSourcePortId: () => 'OUTPUT:flow-a',
      getTargetPortId: () => 'INPUT:flow-b',
    };
    edgeConnectedHandler({ edge: invalidEdge });
    expect(mockRemoveEdges).toHaveBeenCalledWith(['edge-invalid']);

    const resizeNode = {
      data: { label: [{ '@xml:lang': 'en', '#text': 'Resizable' }], quantitativeReference: '1' },
      getSize: () => ({ width: 420 }),
      getPorts: () => [
        {
          id: 'OUTPUT:flow-resize',
          group: 'groupOutput',
          attrs: { text: {} },
          data: { textLang: [], allocations: null },
        },
      ],
      setAttrByPath: jest.fn(),
      prop: jest.fn(),
      removeTools: jest.fn(),
      addTools: jest.fn(),
    };
    nodeResizeHandler({ node: resizeNode });
    act(() => {
      jest.runAllTimers();
    });
    expect(resizeNode.setAttrByPath).toHaveBeenCalledWith('label/text', '', {
      ignoreHistory: true,
    });
    expect(resizeNode.prop).toHaveBeenCalled();
    expect(resizeNode.removeTools).toHaveBeenCalled();
    expect(resizeNode.addTools).toHaveBeenCalled();
    expect(resizeNode.addTools).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'nodeTitle',
          args: expect.objectContaining({
            markup: expect.arrayContaining([
              expect.objectContaining({
                tagName: 'rect',
                attrs: expect.objectContaining({
                  width: 420,
                }),
              }),
            ]),
          }),
        }),
      ]),
      { ignoreHistory: true, reset: true },
    );

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('port', 'OUTPUT:flow-a');

    const clickableNode = {
      id: 'node-1',
      isNode: () => true,
      getPorts: () => [{ id: 'OUTPUT:flow-a', data: { flowVersion: '3.0' } }],
    };

    await act(async () => {
      nodeClickHandler({
        node: clickableNode,
        e: { target: rect },
      });
    });

    expect(screen.getByText('connectable:OUTPUT:flow-a:3.0')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'connect-processes' }).click();
    });
    await waitFor(() => expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalled());

    edgeClickHandler({
      edge: { id: 'edge-clicked' },
    });
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-existing', { selected: false });
    expect(mockUpdateEdge).toHaveBeenCalledWith('edge-clicked', { selected: true });

    blankClickHandler();
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: false });
  });

  it('does not open connectable processes when clicking node content outside a port', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const nodeClickHandler = getGraphHandler('node:click');
    const contentTarget = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    contentTarget.textContent = '工业空气生产; 7553010026';

    await act(async () => {
      nodeClickHandler({
        node: {
          id: 'node-1',
          isNode: () => true,
          getPorts: () => [{ id: 'OUTPUT:flow-a', data: { flowVersion: '3.0' } }],
        },
        e: { target: contentTarget },
      });
    });

    expect(screen.queryByText('connectable:OUTPUT:flow-a:3.0')).not.toBeInTheDocument();
    expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: true });
  });

  it('opens connectable processes when clicking text inside a port group', async () => {
    render(<ToolbarEdit {...baseProps} />);

    const nodeClickHandler = getGraphHandler('node:click');
    const textTarget = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textTarget.textContent = 'Flow Name';
    const portGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    portGroup.setAttribute('class', 'x6-port');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('port', 'OUTPUT:flow-a');
    portGroup.appendChild(rect);
    portGroup.appendChild(textTarget);

    await act(async () => {
      nodeClickHandler({
        node: {
          id: 'node-1',
          isNode: () => true,
          getPorts: () => [{ id: 'OUTPUT:flow-a', data: { flowVersion: '3.0' } }],
        },
        e: { target: textTarget },
      });
    });

    expect(screen.getByText('connectable:OUTPUT:flow-a:3.0')).toBeInTheDocument();
  });

  it('clears pending resize tool refresh timers before rescheduling and on unmount', () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = render(<ToolbarEdit {...baseProps} />);

    const nodeResizeHandler = getGraphHandler('node:change:size');
    const resizeNode = {
      data: { label: [{ '@xml:lang': 'en', '#text': 'Resize Timer' }], quantitativeReference: '0' },
      getSize: () => ({ width: 360 }),
      getPorts: () => [],
      setAttrByPath: jest.fn(),
      prop: jest.fn(),
      removeTools: jest.fn(),
      addTools: jest.fn(),
    };

    nodeResizeHandler({ node: resizeNode });
    nodeResizeHandler({ node: resizeNode });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);

    clearTimeoutSpy.mockRestore();
  });

  it('handles sparse event payloads and default fallbacks in graph handlers', async () => {
    jest.useFakeTimers();
    mockGraphStoreState.nodes = [
      {
        id: 'node-1',
        width: 220,
        selected: false,
        data: {
          id: 'proc-1',
          version: '1.0',
          label: undefined,
          quantitativeReference: '0',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
      {
        id: undefined,
        selected: true,
        data: {
          id: 'proc-2',
          version: '1.0',
          label: undefined,
          quantitativeReference: '1',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
      {
        id: 'node-3',
        selected: false,
        data: {
          id: undefined,
          version: undefined,
          label: undefined,
          quantitativeReference: '0',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
    ];
    mockGraphStoreState.edges = [
      {
        id: undefined,
        labels: [{ attrs: {} }],
        selected: true,
      },
    ];

    render(<ToolbarEdit {...baseProps} />);

    const edgeAddedHandler = getGraphHandler('edge:added');
    const edgeClickHandler = getGraphHandler('edge:click');
    const nodeResizeHandler = getGraphHandler('node:change:size');
    const nodeClickHandler = getGraphHandler('node:click');
    const blankClickHandler = getGraphHandler('blank:click');

    edgeAddedHandler({
      edge: { id: 'edge-new-sparse' },
    });
    expect(mockUpdateEdge).toHaveBeenCalledWith('', { labels: [] }, { ignoreHistory: true });

    const resizeNode = {
      data: { label: undefined, quantitativeReference: '0' },
      getSize: () => ({ width: 200 }),
      getPorts: () => [
        {
          id: 'INPUT:flow-resize',
          group: 'groupInput',
          attrs: { text: {} },
          data: {},
        },
      ],
      setAttrByPath: jest.fn(),
      prop: jest.fn(),
      addTools: jest.fn(),
    };
    mockGenLifeCycleModelNodeName.mockReturnValueOnce(undefined);
    mockGetLangText.mockReturnValueOnce(undefined);
    mockGenPortLabel.mockReturnValueOnce('');
    nodeResizeHandler({ node: resizeNode });
    act(() => {
      jest.runAllTimers();
    });
    expect(resizeNode.setAttrByPath).toHaveBeenCalledWith('label/text', '', {
      ignoreHistory: true,
    });
    expect(resizeNode.addTools).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'nonRef' })]),
      { ignoreHistory: true, reset: true },
    );

    const portRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    portRect.setAttribute('port', 'OUTPUT:flow-sparse');

    await act(async () => {
      nodeClickHandler({
        node: {
          id: 'node-1',
          isNode: () => true,
          getPorts: () => [{ id: 'OUTPUT:flow-sparse' }],
        },
        e: { target: portRect },
      });
    });
    expect(screen.getByText('connectable:OUTPUT:flow-sparse:')).toBeInTheDocument();

    mockUpdateEdge.mockClear();
    mockUpdateNode.mockClear();

    nodeClickHandler({
      node: {
        id: 'node-1',
        isNode: () => true,
        getPorts: () => [],
      },
      e: { target: document.createElement('div') },
    });

    expect(mockUpdateEdge).toHaveBeenCalledWith('', { selected: false });
    expect(mockUpdateNode).toHaveBeenCalledWith('', { selected: false });

    mockUpdateEdge.mockClear();
    mockUpdateNode.mockClear();

    edgeClickHandler({
      edge: { id: undefined },
    });
    expect(mockUpdateNode).toHaveBeenCalledWith('', { selected: false });
    expect(mockUpdateEdge).not.toHaveBeenCalledWith('', { selected: false });

    mockUpdateEdge.mockClear();
    mockUpdateNode.mockClear();

    blankClickHandler();
    expect(mockUpdateNode).toHaveBeenCalledWith('', { selected: false });
    expect(mockUpdateEdge).toHaveBeenCalledWith('', { selected: false });
  });

  it('falls back to template widths and empty titles when refreshing node tools', () => {
    mockGraphStoreState.nodes = [
      {
        id: 'node-template-width',
        data: {
          id: 'proc-template',
          version: '1.0',
          label: undefined,
          quantitativeReference: '0',
        },
        tools: [],
        ports: {
          items: [],
        },
      },
    ];
    mockGenLifeCycleModelNodeName.mockReturnValueOnce(undefined);

    render(<ToolbarEdit {...baseProps} />);

    expect(mockUpdateNode).toHaveBeenCalledWith(
      'node-template-width',
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({
            id: 'nodeTitle',
            args: expect.objectContaining({
              markup: expect.arrayContaining([
                expect.objectContaining({
                  attrs: expect.objectContaining({
                    width: 350,
                  }),
                }),
                expect.objectContaining({
                  textContent: '',
                }),
              ]),
            }),
          }),
        ]),
      }),
      { ignoreHistory: true },
    );
  });

  it('runs the selected-node update callback through the result action components', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0', userId: 'user-1' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() => expect(screen.getByText('process-edit:proc-1:1.0')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'run-process-update-node' }));

    await waitFor(() =>
      expect(mockGetRefData).toHaveBeenCalledWith('ref-proc-1', '2.0', 'process'),
    );
    expect(mockGetUserTeamId).toHaveBeenCalled();
    expect(mockCheckReferences).toHaveBeenCalled();
  });

  it('falls back to empty versions in owned model result action components', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      selected: true,
      data: {
        id: undefined,
        version: undefined,
        label: 'Node 1',
        quantitativeReference: '1',
      },
    };

    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [{ id: 'child-model' }],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: undefined, version: undefined, userId: 'user-1', modelId: 'child-model' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() =>
      expect(screen.getByText('life-cycle-model-edit:child-model:')).toBeInTheDocument(),
    );
  });

  it('falls back to empty ids and versions in owned process result action components', async () => {
    mockGraphStoreState.nodes[0] = {
      ...mockGraphStoreState.nodes[0],
      selected: true,
      data: {
        id: undefined,
        version: undefined,
        label: 'Node 1',
        quantitativeReference: '1',
      },
    };
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: undefined, version: undefined, userId: 'user-1' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    await waitFor(() => expect(screen.getByText('process-edit::')).toBeInTheDocument());
  });

  it('invokes default optional callbacks through owned process result actions', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValueOnce({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: 'proc-1', version: '1.0', userId: 'user-1' }],
    });

    const { rerender } = render(
      <ToolbarEdit
        {...baseProps}
        drawerVisible={true}
        onClose={undefined as any}
        updateNodeCb={undefined as any}
      />,
    );

    await waitFor(() => expect(screen.getByText('process-edit:proc-1:1.0')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'open-process-view-drawer' }));
    await userEvent.click(screen.getByRole('button', { name: 'run-process-update-node' }));

    rerender(
      <ToolbarEdit
        {...baseProps}
        drawerVisible={false}
        onClose={undefined as any}
        updateNodeCb={undefined as any}
      />,
    );
  });

  it('invokes the default update callback when saving without an external handler', async () => {
    render(<ToolbarEdit {...baseProps} updateNodeCb={undefined as any} />);

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));

    await waitFor(() => expect(mockUpdateLifeCycleModel).toHaveBeenCalled());
  });

  it('clears resolved problem nodes after refreshing the selected node reference', async () => {
    mockGraphStoreState.nodes[0].selected = true;
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        version: '1.0',
        json: {
          lifeCycleModelDataSet: {},
        },
        json_tg: {
          xflow: {
            nodes: [{ data: { id: 'proc-1', version: '1.0' } }],
            edges: [],
          },
          submodels: [],
        },
      },
    });
    mockGetProcessesByIdAndVersion.mockResolvedValue({
      data: [{ id: 'proc-1', version: '1.0', userId: 'user-1' }],
    });

    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);

    mockUpdateNode.mockClear();
    mockToolbarHandleCheckData.mockResolvedValueOnce({
      problemNodes: [
        {
          '@refObjectId': 'proc-1',
          '@version': '1.0',
          '@type': 'process data set',
        },
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'check-icon' }));
    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          attrs: expect.objectContaining({
            body: expect.objectContaining({ stroke: '#ff4d4f' }),
          }),
        }),
        { ignoreHistory: true },
      ),
    );

    mockUpdateNode.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'run-process-update-node' }));

    await waitFor(() =>
      expect(mockUpdateNode).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          attrs: expect.objectContaining({
            body: expect.objectContaining({ stroke: '#1890ff' }),
          }),
        }),
        { ignoreHistory: true },
      ),
    );
  });

  it('cancels the whole save operation when cancel is clicked before persistence', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    let capturedOperation: { isCancelled: () => boolean } | null = null;
    let releaseSave: (value: unknown) => void = () => {};
    mockUpdateLifeCycleModel.mockImplementationOnce(
      (_payload: unknown, options: { operation?: { isCancelled: () => boolean } }) => {
        capturedOperation = options?.operation ?? null;
        return new Promise((resolve) => {
          releaseSave = resolve;
        });
      },
    );

    await renderVisibleToolbarEdit();

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() => expect(mockUpdateLifeCycleModel).toHaveBeenCalled());
    expect(capturedOperation).not.toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'pages.lifecyclemodel.calculation.action.cancel' }),
    );

    // 持久化尚未开始：整个操作被取消，不提示“保存已提交”
    expect(antMessage.info).not.toHaveBeenCalledWith(
      'pages.lifecyclemodel.calculation.status.saveInFlight',
    );
    expect(capturedOperation!.isCancelled()).toBe(true);

    releaseSave({ ok: false, code: 'CALCULATION_CANCELLED', message: 'cancelled' });
    await waitFor(() =>
      expect(antMessage.info).toHaveBeenCalledWith(
        'pages.lifecyclemodel.calculation.status.cancelled',
      ),
    );
  });

  it('keeps the save in flight when cancel is clicked during the persisting stage', async () => {
    const antMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;
    let capturedOperation: { isCancelled: () => boolean } | null = null;
    let releaseSave: (value: unknown) => void = () => {};
    mockUpdateLifeCycleModel.mockImplementationOnce(
      (
        _payload: unknown,
        options: {
          operation?: { isCancelled: () => boolean; beginStage: (stage: string) => void };
        },
      ) => {
        capturedOperation = options?.operation ?? null;
        capturedOperation?.beginStage('persisting');
        return new Promise((resolve) => {
          releaseSave = resolve;
        });
      },
    );

    await renderVisibleToolbarEdit();

    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() => expect(mockUpdateLifeCycleModel).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: 'pages.lifecyclemodel.calculation.action.cancel' }),
    );

    // 已进入持久化阶段：不取消操作，提示保存已提交
    expect(antMessage.info).toHaveBeenCalledWith(
      'pages.lifecyclemodel.calculation.status.saveInFlight',
    );
    expect(capturedOperation!.isCancelled()).toBe(false);

    releaseSave({ ok: false, code: 'VERSION_CONFLICT', message: 'conflict' });
    await waitFor(() =>
      expect(antMessage.error).toHaveBeenCalledWith(
        'Data with the same ID and version already exists.',
      ),
    );
  });
  it.each([
    ['MISSING_PRODUCT_ALLOCATION', 'missingProductAllocation'],
    ['MISSING_REFERENCE_ALLOCATION', 'missingReferenceAllocation'],
  ])(
    'shows repair guidance and locates the affected product for %s',
    async (allocationReason, suffix) => {
      const modal = jest.requireMock('antd').modal;
      const destroy = jest.fn();
      modal.error.mockReset().mockReturnValue({ destroy });
      mockUpdateLifeCycleModel.mockResolvedValueOnce({
        ok: false,
        code: 'INVALID_ALLOCATION',
        calculationIssues: [
          { code: 'INVALID_ALLOCATION', allocationReason, instanceIndex: 'pi-1', nodeId: 'node-1' },
        ],
      });
      render(<ToolbarEdit {...baseProps} drawerVisible={true} />);
      await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
      await waitFor(() => expect(modal.error).toHaveBeenCalled());
      render(modal.error.mock.calls[0][0].content);
      expect(
        screen.getByText(`pages.lifecyclemodel.calculation.repair.${suffix}`),
      ).toBeInTheDocument();
      expect(
        screen.getByText('pages.lifecyclemodel.calculation.status.resultNotUpdated'),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'pages.lifecyclemodel.calculation.action.locate' }),
      );
      expect(mockUpdateNode).toHaveBeenCalledWith('node-1', { selected: true });
      expect(destroy).toHaveBeenCalled();
    },
  );
  it('offers visible cancellation and target repair without retrying or discarding edits', async () => {
    const modal = jest.requireMock('antd').modal;
    const destroy = jest.fn();
    modal.error.mockReset().mockReturnValue({ destroy });
    mockUpdateLifeCycleModel.mockResolvedValueOnce({ ok: false, code: 'INVALID_TARGET_AMOUNT' });
    render(<ToolbarEdit {...baseProps} drawerVisible={true} />);
    await userEvent.click(screen.getByRole('button', { name: 'save-icon' }));
    await waitFor(() => expect(modal.error).toHaveBeenCalled());
    const config = modal.error.mock.calls[0][0];
    expect(config).toMatchObject({
      okCancel: true,
      closable: true,
      cancelText: 'pages.lifecyclemodel.calculation.action.close',
    });
    render(config.content);
    await userEvent.click(
      screen.getByRole('button', { name: 'pages.lifeCycleModel.targetAmount' }),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(mockUpdateLifeCycleModel).toHaveBeenCalledTimes(1);
  });
  test('unsaved review requests stop before validation or persistence', async () => {
    render(<ToolbarEdit {...baseProps} isSave={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'send-icon' }));
    expect(mockToolbarHandleCheckData).not.toHaveBeenCalled();
    expect(mockToolbarSubmitReview).not.toHaveBeenCalled();
    expect(mockUpdateLifeCycleModel).not.toHaveBeenCalled();
    expect(mockCreateLifeCycleModel).not.toHaveBeenCalled();
  });
});
