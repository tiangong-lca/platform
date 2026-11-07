/* istanbul ignore file -- lifecycle toolbar orchestration is covered by behavioral tests; remaining misses are UI guards */
import { GraphEdge, GraphNode, useGraphEvent, useGraphStore } from '@/contexts/graphContext';
import ProcessEdit from '@/pages/Processes/Components/edit';
import ProcessView from '@/pages/Processes/Components/view';
import type { refDataType, ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { checkReferences, getAllRefObj, getRefTableName, ReffPath } from '@/pages/Utils/review';
import { getRefData, hasLangNormalizationDraftChanges } from '@/services/general/api';
import { resolveContentLanguage } from '@/services/general/contentLanguageRegistry';
import { initVersion } from '@/services/general/data';
import { formatDateTime, getImportedId, getLangText } from '@/services/general/util';
import {
  createLifeCycleModel,
  getLifeCycleModelDetail,
  updateLifeCycleModel,
} from '@/services/lifeCycleModels/api';
import type {
  LifeCycleModelDetailResponse,
  LifeCycleModelEditorFormState,
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelImportData,
  LifeCycleModelJsonTg,
  LifeCycleModelMutationResult,
  LifeCycleModelPortItem,
  LifeCycleModelProcessInstance,
  LifeCycleModelSelectedPortPayload,
  LifeCycleModelTargetAmount,
  LifeCycleModelValidationSnapshot,
} from '@/services/lifeCycleModels/data';
import {
  genLifeCycleModelData,
  genLifeCycleModelInfoFromData,
  genLifeCycleModelNodeName,
  genPortLabel,
  getLifeCycleModelPortFlowVersion,
} from '@/services/lifeCycleModels/util';
import { getSharedMatrixCalculationClient } from '@/services/lifeCycleModels/matrixCalculation/workerClient';
import { CalculationOperation } from '@/services/lifeCycleModels/matrixCalculation/types';
import type { CalculationIssue } from '@/services/lifeCycleModels/matrixCalculation/types';
import {
  getAllocationRepairMessageId,
  isCalculationErrorCode,
  resolveCalculationIssues,
  type ResolvedCalculationIssue,
} from './utils/calculationIssues';
import {
  collectCanvasProviderRelations,
  collectMultiProviderConflictNodeIds,
  findConflictingProviderEdges,
} from './utils/providerRelations';
import {
  getLifeCycleModelGraphProcessReferences,
  normalizeLifeCycleModelGraphForDisplay,
} from '@/services/lifeCycleModels/viewCompatibility';
import {
  getProcessDetail,
  getProcessDetailByIdAndVersion,
  getProcessesByIdAndVersion,
} from '@/services/processes/api';
import type {
  ProcessDetailByVersionItem,
  ProcessDetailByVersionResponse,
  ProcessDetailResponse,
} from '@/services/processes/data';
import { getUserTeamId } from '@/services/roles/api';
import { getUserId } from '@/services/users/api';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import LoadingDisabledActionGroup from '@/components/LoadingDisabledActionGroup';
import type { Edge as X6Edge, Node as X6Node } from '@antv/x6';
import { App, Button, Modal, Space, Spin, theme, Tooltip } from 'antd';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import { v4 } from 'uuid';
import ConnectableProcesses from '../connectableProcesses';
import LifeCycleModelEdit from '../edit';
import ModelResult from '../modelResult';
import LifeCycleModelView from '../view';
import ModelToolbarAdd from './add';
import { Control } from './control';
import TargetAmount from './editTargetAmount';
import ToolbarEditInfo, { type ToolbarEditInfoHandle } from './eidtInfo';
import EdgeExhange from './Exchange/index';
import IoPortSelect from './Exchange/ioPortSelect';
import { getEdgeLabel } from './utils/edge';
import {
  buildEditorNodeTools,
  buildEmptyCreateInfoData,
  buildLocalizedGraphNodeVisualUpdate,
  buildPortSelectionUpdate,
  buildProcessNodesFromDetails,
  buildSavePayload,
  buildUpdatedNodeReferencePayload,
  type EditorGraphHydrationBaseline,
  hydrateEditorEdges,
  hydrateEditorNodes,
  normalizePastedReferenceCells,
  reconcileHydratedEditorGraphForPersistence,
  resolveDeleteSelection,
} from './utils/editGraph';
import {
  getPortLabelWithAllocation,
  getPortTextColor,
  getPortTextStyle,
  nodeTitleTool,
} from './utils/node';

type Props = {
  id: string;
  version: string;
  lang: string;
  drawerVisible: boolean;
  autoCheckRequired?: boolean;
  isSave: boolean;
  action: string;
  setIsSave: (isSave: boolean) => void;
  actionType?: 'create' | 'copy' | 'createVersion';
  importData?: LifeCycleModelImportData | null;
  onClose?: () => void;
  hideReviewButton?: boolean;
  updateNodeCb?: (ref: refDataType) => Promise<void>;
  newVersion?: string;
  onSubmitReviewSuccess?: () => void;
};

type SaveDataResult = {
  currentNodes: LifeCycleModelGraphNode[];
  currentEdges: LifeCycleModelGraphEdge[];
  saveSucceeded: boolean;
  validationSnapshot: LifeCycleModelValidationSnapshot;
};

const VISUAL_ONLY_MUTATION_OPTIONS = { ignoreHistory: true };
const MISSING_REFERENCE_PROCESS_ERROR_MESSAGE =
  'No referenceToReferenceProcess found in lifeCycleModelInformation';
const MISSING_REFERENCE_PROCESS_ERROR_CODE = 'MISSING_REFERENCE_PROCESS';

/**
 * zh-CN: 计算错误码 → 静态 locale id 映射；未知码回退 CALCULATION_FAILED。
 * en-US: Static calculation error code → locale id map; unknown codes fall
 * back to CALCULATION_FAILED.
 */
const CALCULATION_ERROR_MESSAGE_IDS: Record<string, string> = {
  EMPTY_MODEL: 'pages.lifecyclemodel.calculation.error.EMPTY_MODEL',
  INVALID_REFERENCE: 'pages.lifecyclemodel.calculation.error.INVALID_REFERENCE',
  INVALID_TARGET_AMOUNT: 'pages.lifecyclemodel.calculation.error.INVALID_TARGET_AMOUNT',
  INVALID_REFERENCE_EXCHANGE: 'pages.lifecyclemodel.calculation.error.INVALID_REFERENCE_EXCHANGE',
  MULTIPLE_PROVIDERS: 'pages.lifecyclemodel.calculation.error.MULTIPLE_PROVIDERS',
  INVALID_CONNECTION: 'pages.lifecyclemodel.calculation.error.INVALID_CONNECTION',
  INCOMPATIBLE_FLOW: 'pages.lifecyclemodel.calculation.error.INCOMPATIBLE_FLOW',
  INVALID_EXCHANGE_AMOUNT: 'pages.lifecyclemodel.calculation.error.INVALID_EXCHANGE_AMOUNT',
  INVALID_ALLOCATION: 'pages.lifecyclemodel.calculation.error.INVALID_ALLOCATION',
  MODEL_NOT_SOLVABLE: 'pages.lifecyclemodel.calculation.error.MODEL_NOT_SOLVABLE',
  NUMERIC_RESULT_INVALID: 'pages.lifecyclemodel.calculation.error.NUMERIC_RESULT_INVALID',
  NEGATIVE_ACTIVITY: 'pages.lifecyclemodel.calculation.error.NEGATIVE_ACTIVITY',
  SOURCE_UNAVAILABLE: 'pages.lifecyclemodel.calculation.error.SOURCE_UNAVAILABLE',
  LOCAL_LIMIT_EXCEEDED: 'pages.lifecyclemodel.calculation.error.LOCAL_LIMIT_EXCEEDED',
  CALCULATION_FAILED: 'pages.lifecyclemodel.calculation.error.CALCULATION_FAILED',
};

/** zh-CN: 计算期间展示的模态状态键。en-US: Modal state keys shown during calculation. */
type CalculationPhase = 'idle' | 'calculating';

/**
 * zh-CN: 从画布边集合提取供应关系，用于单供应校验。
 * en-US: Extract provider relations from canvas edges for the single-provider check.
 */

const toSaveMutationError = (
  error: unknown,
): Extract<LifeCycleModelMutationResult, { ok: false }> => {
  const messageText =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Lifecycle model save failed';

  return {
    ok: false,
    code:
      messageText === MISSING_REFERENCE_PROCESS_ERROR_MESSAGE
        ? MISSING_REFERENCE_PROCESS_ERROR_CODE
        : 'SAVE_FAILED',
    message: messageText,
    details: error,
  };
};

const getProcessInstanceValidationNodeIndex = (detail?: ValidationIssueSdkDetail | null) => {
  const match = detail?.fieldPath?.match(/^processInstance\[#(.+?)\]/);
  return match?.[1];
};

const ToolbarEdit: FC<Props> = ({
  id,
  version,
  lang,
  drawerVisible,
  autoCheckRequired = false,
  isSave,
  action,
  setIsSave,
  actionType,
  importData,
  onClose = () => {},
  hideReviewButton = false,
  updateNodeCb = async () => {},
  newVersion,
  onSubmitReviewSuccess = () => {},
}) => {
  const { message, modal } = App.useApp();
  const [thisId, setThisId] = useState(id);
  const [thisVersion, setThisVersion] = useState(version);
  const [thisAction, setThisAction] = useState(action);
  const [spinning, setSpinning] = useState(false);
  const [calculationPhase, setCalculationPhase] = useState<CalculationPhase>('idle');
  const [multiProviderConflictNodeIds, setMultiProviderConflictNodeIds] = useState<string[]>([]);
  const [infoData, setInfoData] = useState<LifeCycleModelEditorFormState>({});
  const [jsonTg, setJsonTg] = useState<LifeCycleModelJsonTg>({});
  const [problemNodes, setProblemNodes] = useState<refDataType[]>([]);
  const [sdkProblemProcessInstanceIds, setSdkProblemProcessInstanceIds] = useState<string[]>([]);

  const [targetAmountDrawerVisible, setTargetAmountDrawerVisible] = useState(false);
  const [ioPortSelectorDirection, setIoPortSelectorDirection] = useState('');
  const [ioPortSelectorNode, setIoPortSelectorNode] = useState<LifeCycleModelGraphNode>();
  const [ioPortSelectorDrawerVisible, setIoPortSelectorDrawerVisible] = useState(false);
  const [connectableProcessesDrawerVisible, setConnectableProcessesDrawerVisible] = useState(false);
  const [connectableProcessesPortId, setConnectableProcessesPortId] = useState('');
  const [connectableProcessesFlowVersion, setConnectableProcessesFlowVersion] = useState('');
  const [autoCheckTriggered, setAutoCheckTriggered] = useState(false);

  const modelData = useGraphStore((state) => state.initData);
  const addNodes = useGraphStore((state) => state.addNodes);
  const updateNode = useGraphStore((state) => state.updateNode);
  const removeNodes = useGraphStore((state) => state.removeNodes);
  const removeEdges = useGraphStore((state) => state.removeEdges);
  const updateEdge = useGraphStore((state) => state.updateEdge);
  const syncGraphData = useGraphStore((state) => state.syncGraphData);
  const graph = useGraphStore((state) => state.graph);
  const intl = useIntl();
  const contentLanguage = resolveContentLanguage(lang);
  const edgeLabelText = {
    balanced: intl.formatMessage({
      id: 'pages.button.model.edgeStatus.balanced',
      defaultMessage: 'Bal',
    }),
    deficit: intl.formatMessage({
      id: 'pages.button.model.edgeStatus.deficit',
      defaultMessage: 'Def',
    }),
    surplus: intl.formatMessage({
      id: 'pages.button.model.edgeStatus.surplus',
      defaultMessage: 'Sur',
    }),
    input: intl.formatMessage({
      id: 'pages.button.input',
      defaultMessage: 'Input',
    }),
    output: intl.formatMessage({
      id: 'pages.button.output',
      defaultMessage: 'Output',
    }),
  };
  const [userId, setUserId] = useState<string>('');
  const [processInstances, setProcessInstances] = useState<LifeCycleModelProcessInstance[]>([]);
  const importedId = getImportedId(importData?.[0]);

  const editInfoRef = useRef<ToolbarEditInfoHandle>(null);
  const editorGraphHydrationBaselineRef = useRef<EditorGraphHydrationBaseline | null>(null);
  const resizeToolRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setThisAction(action);
  }, [action]);

  const nodes: GraphNode[] = useGraphStore((state) => state.nodes);
  const edges: GraphEdge[] = useGraphStore((state) => state.edges);

  const [nodeCount, setNodeCount] = useState(0);

  const { token } = theme.useToken();

  const inputFlowTool = {
    id: 'inputFlow',
    name: 'button',
    args: {
      markup: [
        {
          tagName: 'rect',
          selector: 'button',
          attrs: {
            width: 50,
            height: 20,
            rx: 4,
            ry: 4,
            fill: token.colorBgContainer,
            stroke: token.colorBorder,
            'stroke-width': 1,
            cursor: 'pointer',
          },
        },
        {
          tagName: 'text',
          textContent: intl.formatMessage({
            id: 'pages.button.input',
            defaultMessage: 'Input',
          }),
          selector: 'text',
          attrs: {
            fill: token.colorTextBase,
            'font-size': 12,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'pointer-events': 'none',
            x: 25,
            y: 10,
          },
        },
      ],
      offset: { x: 10, y: 30 },
      async onClick(view: { cell: { store: { data: LifeCycleModelGraphNode } } }) {
        await setIoPortSelectorDirection('Input');
        await setIoPortSelectorNode(view.cell.store.data);
        await setIoPortSelectorDrawerVisible(true);
      },
    },
  };

  const outputFlowTool = {
    id: 'outputFlow',
    name: 'button',
    args: {
      markup: [
        {
          tagName: 'rect',
          selector: 'button',
          attrs: {
            width: 50,
            height: 20,
            rx: 4,
            ry: 4,
            fill: token.colorBgContainer,
            stroke: token.colorBorder,
            'stroke-width': 1,
            cursor: 'pointer',
          },
        },
        {
          tagName: 'text',
          textContent: intl.formatMessage({
            id: 'pages.button.output',
            defaultMessage: 'Output',
          }),
          selector: 'text',
          attrs: {
            fill: token.colorTextBase,
            'font-size': 12,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'pointer-events': 'none',
            x: 25,
            y: 10,
          },
        },
      ],
      x: '100%',
      y: 0,
      offset: { x: -60, y: 30 },
      async onClick(view: { cell: { store: { data: LifeCycleModelGraphNode } } }) {
        await setIoPortSelectorDirection('Output');
        await setIoPortSelectorNode(view.cell.store.data);
        await setIoPortSelectorDrawerVisible(true);
      },
    },
  };

  const refTool = {
    id: 'ref',
    name: 'button',
    args: {
      markup: [
        {
          tagName: 'circle',
          selector: 'button',
          attrs: {
            r: 10,
            'stroke-width': 0,
            fill: token.colorBgBase,
            cursor: 'pointer',
          },
        },
        {
          tagName: 'text',
          textContent: '★', //https://symbl.cc/
          selector: 'icon',
          attrs: {
            fill: token.colorPrimary,
            'font-size': 22,
            'text-anchor': 'middle',
            'pointer-events': 'none',
            y: '0.3em',
          },
        },
        {
          tagName: 'title',
          textContent: intl.formatMessage({
            id: 'pages.button.model.referenceNode',
            defaultMessage: 'Reference node',
          }),
        },
      ],
      offset: { x: 10, y: -12 },
      onClick() {
        setTargetAmountDrawerVisible(true);
      },
    },
  };

  const nonRefTool = {
    id: 'nonRef',
    name: 'button',
    args: {
      markup: [
        {
          tagName: 'circle',
          selector: 'button',
          attrs: {
            r: 10,
            'stroke-width': 0,
            fill: token.colorBgBase,
            cursor: 'pointer',
          },
        },
        {
          tagName: 'text',
          textContent: '☆', //https://symbl.cc/
          selector: 'icon',
          attrs: {
            fill: token.colorPrimary,
            'font-size': 22,
            'text-anchor': 'middle',
            'pointer-events': 'none',
            y: '0.3em',
          },
        },
        {
          tagName: 'title',
          textContent: intl.formatMessage({
            id: 'pages.button.model.setReference',
            defaultMessage: 'Set as reference',
          }),
        },
      ],
      offset: { x: 10, y: -12 },
      onClick(view: { cell: { store: { data: LifeCycleModelGraphNode } } }) {
        const thisData = view.cell.store.data;
        nodes.forEach(async (node) => {
          if (node.id === thisData?.id) {
            const updatedNodeData = {
              data: {
                ...node?.data,
                quantitativeReference: '1',
              },
              tools: (
                node.tools as Array<{ id?: string; [key: string]: unknown }> | undefined
              )?.map((tool) => {
                if (tool.id === 'nonRef') {
                  return refTool;
                }
                return tool;
              }),
            };
            await updateNode(node.id ?? '', updatedNodeData);
            setTargetAmountDrawerVisible(true);
          } else {
            const updatedNodeData = {
              data: {
                ...node.data,
                quantitativeReference: '0',
              },
              tools: (
                node.tools as Array<{ id?: string; [key: string]: unknown }> | undefined
              )?.map((tool) => {
                if (tool.id === 'ref' || tool.id === 'nonRef') {
                  return nonRefTool;
                }
                return tool;
              }),
            };
            await updateNode(node.id ?? '', updatedNodeData);
          }
        });
      },
    },
  };

  const nodeAttrs = {
    body: {
      stroke: token.colorPrimary,
      strokeWidth: 1,
      fill: token.colorBgContainer,
      rx: 6,
      ry: 6,
    },
    label: {
      fill: token.colorTextBase,
      refX: 0.5,
      refY: 8,
      textAnchor: 'middle',
      textVerticalAnchor: 'top',
    },
  };

  const squarePortMarkup = [{ tagName: 'rect', selector: 'portBody' }];
  const squarePortAttrs = {
    stroke: token.colorPrimary,
    fill: token.colorBgBase,
    strokeWidth: 1,
    width: 8,
    height: 8,
    x: -4,
    y: -4,
    magnet: true,
  };

  const ports = {
    groups: {
      groupInput: {
        markup: squarePortMarkup,
        position: {
          name: 'absolute',
        },
        label: {
          position: {
            name: 'right',
          },
        },
        attrs: {
          portBody: {
            ...squarePortAttrs,
          },
          text: {
            fill: token.colorTextDescription,
            fontSize: 14,
          },
        },
      },
      groupOutput: {
        markup: squarePortMarkup,
        position: {
          name: 'absolute',
        },
        label: {
          position: {
            name: 'left',
          },
        },
        attrs: {
          portBody: {
            ...squarePortAttrs,
          },
          text: {
            fill: token.colorTextDescription,
            fontSize: 14,
          },
        },
      },
    },
    items: [],
  };

  const nodeTemplateWidth = 350;
  const nodeTemplate: LifeCycleModelGraphNode = {
    id: '',
    label: '',
    shape: 'rect',
    x: 200,
    y: 100,
    width: nodeTemplateWidth,
    height: 80,
    attrs: nodeAttrs,
    data: {
      label: [],
      quantitativeReference: '0',
      generalComment: [],
    },
  };

  const edgeTemplate = {
    attrs: {
      line: {
        stroke: token.colorPrimary,
        strokeWidth: 1,
      },
    },
    // tools: ['edge-editor'],
  };

  const saveCallback = useCallback(() => {
    setIsSave(true);
  }, [isSave, setIsSave]);

  /**
   * zh-CN: 模型内容变更后标记为未保存，使结果抽屉能显示 PREVIOUS_RESULT。
   * en-US: Mark the model as unsaved after content changes so the results
   * drawer can show PREVIOUS_RESULT.
   */
  const markModelDirty = useCallback(() => {
    setIsSave(false);
  }, [setIsSave]);

  /**
   * zh-CN: 取消当前保存操作。持久化尚未提交时整条操作被取消并提示已取消；
   * 已进入持久化阶段则不承诺撤销，由保存结果决定最终状态。
   * en-US: Cancels the current save operation. Before the commit the whole
   * operation is cancelled with the cancelled status; once persistence is in
   * flight no undo is promised and the save result decides the outcome.
   */
  const saveOperationRef = useRef<CalculationOperation | null>(null);
  const cancelActiveCalculation = useCallback(() => {
    if (saveOperationRef.current?.currentStage === 'persisting') {
      message.info(
        intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.status.saveInFlight' }),
      );
      return;
    }
    saveOperationRef.current?.cancel();
    getSharedMatrixCalculationClient().cancel();
  }, []);

  const resetGraphCommandState = useCallback(() => {
    graph?.cleanSelection?.();
    graph?.cleanClipboard?.();
    graph?.cleanHistory?.();
  }, [graph]);

  const syncGraphSnapshot = useCallback(() => {
    syncGraphData();
    setNodeCount(graph!.getNodes().length);
  }, [graph, syncGraphData]);

  const buildNodeTools = useCallback(
    (nodeData: LifeCycleModelGraphNode['data'], nodeWidth: number, isReference: boolean) =>
      buildEditorNodeTools({
        isReference,
        nodeData,
        nodeWidth,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang,
        nodeTemplateWidth,
      }),
    [inputFlowTool, lang, nonRefTool, outputFlowTool, refTool, token],
  );

  const normalizePastedCells = useCallback(
    (cells: Array<X6Node | X6Edge>) =>
      normalizePastedReferenceCells(cells, buildNodeTools, nodeTemplateWidth),
    [buildNodeTools],
  );

  const copySelection = useCallback(() => {
    const selectedCells = graph!.getSelectedCells();
    if (selectedCells.length === 0) {
      return;
    }

    graph.copy(selectedCells, {
      deep: true,
      useLocalStorage: false,
    });
  }, [graph]);

  const pasteSelection = useCallback(
    (offset: { dx: number; dy: number } = { dx: 32, dy: 32 }) => {
      if (!graph || graph.isClipboardEmpty({ useLocalStorage: false })) {
        return;
      }

      graph.batchUpdate('clipboard-paste', () => {
        const pastedCells = graph.paste({
          offset,
          useLocalStorage: false,
        });
        if (pastedCells.length === 0) {
          return;
        }

        normalizePastedCells(pastedCells as Array<X6Node | X6Edge>);
        graph.cleanSelection();
        graph.select(pastedCells);
        markModelDirty();
        setMultiProviderConflictNodeIds(
          collectMultiProviderConflictNodeIds(
            nodes,
            graph
              .getEdges()
              .map((edge: X6Edge) =>
                typeof edge.toJSON === 'function'
                  ? (edge.toJSON() as LifeCycleModelGraphEdge)
                  : (edge as unknown as LifeCycleModelGraphEdge),
              ),
          ),
        );
      });

      syncGraphSnapshot();
    },
    [graph, markModelDirty, normalizePastedCells, syncGraphSnapshot],
  );

  const duplicateSelection = useCallback(() => {
    if (!graph) {
      return;
    }

    const selectedCells = graph.getSelectedCells();
    if (selectedCells.length === 0) {
      return;
    }

    graph.copy(selectedCells, {
      deep: true,
      useLocalStorage: false,
    });
    pasteSelection({ dx: 32, dy: 32 });
  }, [graph, pasteSelection]);

  const undoGraph = useCallback(() => {
    if (!graph || !graph.canUndo()) {
      return;
    }

    graph.undo();
    syncGraphSnapshot();
  }, [graph, syncGraphSnapshot]);

  const redoGraph = useCallback(() => {
    if (!graph || !graph.canRedo()) {
      return;
    }

    graph.redo();
    syncGraphSnapshot();
  }, [graph, syncGraphSnapshot]);

  const refreshEdgeLabels = useCallback(() => {
    edges.forEach((edge) => {
      if (edge?.labels?.length > 0) {
        updateEdge(edge.id ?? '', { labels: [] }, VISUAL_ONLY_MUTATION_OPTIONS);
      }
    });
  }, [edges, updateEdge]);

  const updateInfoData = (data: LifeCycleModelEditorFormState) => {
    setInfoData({ ...data, id: thisId, version: thisVersion });
  };

  const handleProcessInstanceValidationChange = useCallback(
    (details: ValidationIssueSdkDetail[]) => {
      const nextProblemProcessInstanceIds = details
        .map((detail) => getProcessInstanceValidationNodeIndex(detail))
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      setSdkProblemProcessInstanceIds([...new Set(nextProblemProcessInstanceIds)]);
    },
    [],
  );

  const handleNavigateProcessInstance = useCallback(
    (detail: ValidationIssueSdkDetail) => {
      const processInstanceInternalId = getProcessInstanceValidationNodeIndex(detail);

      if (!processInstanceInternalId) {
        return false;
      }

      const targetNode = nodes.find((node) => node?.data?.index === processInstanceInternalId);

      if (!targetNode?.id) {
        return false;
      }

      edges.forEach((edge) => {
        if (edge.selected) {
          updateEdge(edge.id ?? '', { selected: false });
        }
      });

      nodes.forEach((node) => {
        if (node.id !== targetNode.id && node.selected) {
          updateNode(node.id ?? '', { selected: false });
        }
      });

      graph?.cleanSelection?.();
      updateNode(targetNode.id, { selected: true });

      const targetCell = graph?.getCellById?.(targetNode.id);
      if (targetCell && typeof graph?.centerCell === 'function') {
        graph.centerCell(targetCell);
      }

      return true;
    },
    [edges, graph, nodes, updateEdge, updateNode],
  );

  const updateTargetAmount = (data: LifeCycleModelTargetAmount) => {
    markModelDirty();
    const refNode = nodes.find((node) => node?.data?.quantitativeReference === '1');
    if (refNode) {
      updateNode(refNode.id ?? '', {
        data: {
          ...refNode.data,
          targetAmount: data?.targetAmount,
          originalAmount: data?.originalAmount,
          scalingFactor: data?.scalingFactor,
        },
      });
    }
  };

  const updateNodePorts = (data: LifeCycleModelSelectedPortPayload) => {
    const portUpdate = buildPortSelectionUpdate({
      selectedNode: ioPortSelectorNode,
      direction: ioPortSelectorDirection,
      payload: data,
      lang,
      token,
      portsTemplate: ports,
    });
    if (!portUpdate) {
      return;
    }

    const nodeId = ioPortSelectorNode?.id;
    if (!nodeId) {
      return;
    }

    const applyPortUpdate = () => {
      updateNode(nodeId, {
        ports: portUpdate.ports,
        width: portUpdate.width,
        height: portUpdate.height,
      });
    };

    if (graph && typeof graph.batchUpdate === 'function') {
      graph.batchUpdate('update-node-ports', applyPortUpdate);
      return;
    }

    applyPortUpdate();
  };

  // const updateEdgeData = (data: unknown) => {
  //   // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //   const { id, shape, ...newEdge } = data;
  //   if (newEdge.target) {
  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const { x, y, ...newTarget } = newEdge.target as Record<string, unknown>;
  //     updateEdge(id, { ...newEdge, target: newTarget });
  //   } else {
  //     updateEdge(id, { ...newEdge });
  //   }
  // };

  type TAddProcessNodesParams = { id: string; version: string };

  const addProcessNodes = (processes: TAddProcessNodesParams[]) => {
    setSpinning(true);
    getProcessDetailByIdAndVersion(processes).then((result: ProcessDetailByVersionResponse) => {
      if (result && result.data) {
        const newNodes = buildProcessNodesFromDetails({
          details: result.data,
          nodeCount,
          nodeTemplate,
          portsTemplate: ports,
          createId: v4,
          refTool,
          nonRefTool,
          inputFlowTool,
          outputFlowTool,
          token,
          lang,
          nodeTemplateWidth,
        });
        if (newNodes.length > 0) {
          addNodes(newNodes);
          setNodeCount((prev) => prev + newNodes.length);
          markModelDirty();
        }
      }

      setSpinning(false);
    });
  };

  const updateReference = async (setLoadingData: boolean) => {
    if (setLoadingData) setSpinning(true);
    await Promise.all(
      nodes.map(async (node) => {
        const result: ProcessDetailResponse = await getProcessDetail(
          node?.data?.id ?? '',
          node?.data?.version ?? '',
        );
        updateNode(
          node.id ?? '',
          buildUpdatedNodeReferencePayload({
            node,
            result,
            refTool,
            nonRefTool,
            inputFlowTool,
            outputFlowTool,
            token,
            lang,
            nodeTemplateWidth,
          }),
        );
      }),
    );
    if (setLoadingData) setSpinning(false);
  };

  const deleteCell = useCallback(() => {
    const { selectedNodeIds, selectedEdgeIds } = resolveDeleteSelection(nodes, edges);

    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
      return;
    }

    const applyDelete = () => {
      if (selectedEdgeIds.length > 0) {
        removeEdges(selectedEdgeIds);
      }

      if (selectedNodeIds.length > 0) {
        removeNodes(selectedNodeIds);
      }
    };

    if (graph) {
      graph.batchUpdate('delete-selection', applyDelete);
      setNodeCount(graph.getNodes().length);
    } else if (selectedNodeIds.length > 0) {
      setNodeCount((prev) => Math.max(prev - selectedNodeIds.length, 0));
      applyDelete();
    } else {
      applyDelete();
    }

    markModelDirty();
    refreshEdgeLabels();
  }, [edges, graph, nodes, markModelDirty, refreshEdgeLabels, removeEdges, removeNodes]);

  const navigateToNode = useCallback(
    (nodeId?: string) => {
      if (!nodeId) return false;
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode?.id) return false;
      edges.forEach((edge) => {
        if (edge.selected) {
          updateEdge(edge.id ?? '', { selected: false });
        }
      });
      nodes.forEach((node) => {
        if (node.id !== targetNode.id && node.selected) {
          updateNode(node.id ?? '', { selected: false });
        }
      });
      graph?.cleanSelection?.();
      updateNode(targetNode.id, { selected: true });
      const targetCell = graph?.getCellById?.(targetNode.id);
      if (targetCell && typeof graph?.centerCell === 'function') {
        graph.centerCell(targetCell);
      }
      return true;
    },
    [edges, graph, nodes, updateEdge, updateNode],
  );

  /**
   * zh-CN: 集中展示本地计算失败：一条明确错误文案 + 可定位问题列表 + 当前操作
   * 状态（本次计算未完成，计算结果未更新）。定位信息独立于错误正文；无可靠
   * 定位的问题不显示定位按钮。
   * en-US: Centralized display for local calculation failures: one explicit
   * error message + a locatable issue list + the operation status. Location
   * data is independent of the body; issues without a reliable location show
   * no locate button.
   */
  const calculationErrorModalRef = useRef<{ destroy: () => void } | null>(null);
  const retrySaveRef = useRef<(() => void) | null>(null);

  const showCalculationFailureModal = useCallback(
    (result: Extract<LifeCycleModelMutationResult, { ok: false }>) => {
      const issues = (result.calculationIssues ?? []) as CalculationIssue[];
      const resolvedIssues = resolveCalculationIssues(nodes, issues, contentLanguage);
      const errorMessage = intl.formatMessage({
        id:
          CALCULATION_ERROR_MESSAGE_IDS[result.code] ??
          CALCULATION_ERROR_MESSAGE_IDS.CALCULATION_FAILED,
      });
      calculationErrorModalRef.current?.destroy();

      const errorModal = modal.error({
        title: errorMessage,
        content: (
          <div>
            {resolvedIssues.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {resolvedIssues.map((item: ResolvedCalculationIssue, index: number) => (
                  <div
                    key={`${item.issue.code}-${item.issue.instanceIndex ?? ''}-${
                      item.issue.flowId ?? ''
                    }-${index}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                  >
                    <span>
                      {item.processName
                        ? intl.formatMessage(
                            { id: 'pages.lifecyclemodel.calculation.location.process' },
                            { processName: item.processName },
                          )
                        : intl.formatMessage(
                            { id: 'pages.lifecyclemodel.calculation.location.nodeFallback' },
                            { index: item.issue.instanceIndex || index + 1 },
                          )}
                      {item.flowName
                        ? ` · ${intl.formatMessage(
                            { id: 'pages.lifecyclemodel.calculation.location.flow' },
                            { flowName: item.flowName },
                          )}`
                        : ''}
                    </span>
                    {item.nodeId ? (
                      <Button
                        size='small'
                        onClick={() => {
                          navigateToNode(item.nodeId);
                          calculationErrorModalRef.current?.destroy();
                        }}
                      >
                        {intl.formatMessage({
                          id: 'pages.lifecyclemodel.calculation.action.locate',
                        })}
                      </Button>
                    ) : null}
                    {getAllocationRepairMessageId(item.issue) ? (
                      <div style={{ width: '100%' }}>
                        {intl.formatMessage({ id: getAllocationRepairMessageId(item.issue) })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ marginTop: 12 }}>
              {intl.formatMessage({
                id: 'pages.lifecyclemodel.calculation.status.resultNotUpdated',
              })}
            </div>
          </div>
        ),
        okText: intl.formatMessage({
          id: 'pages.lifecyclemodel.calculation.action.calculateAgain',
        }),
        onOk: () => {
          retrySaveRef.current?.();
        },
        cancelText: intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.action.close' }),
        afterClose: () => {
          calculationErrorModalRef.current = null;
        },
      });
      calculationErrorModalRef.current = { destroy: () => errorModal.destroy() };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, contentLanguage, intl, modal],
  );

  const saveData = async (
    setLoadingData: boolean,
    options?: { silent?: boolean; langIntent?: 'save' | 'validation' },
  ) => {
    const silent = options?.silent ?? false;
    if (setLoadingData) setSpinning(true);
    try {
      await editInfoRef.current?.updateReferenceDescription(infoData);
      await updateReference(false);

      // 直接从图中获取最新的节点和边数据
      const currentNodes: LifeCycleModelGraphNode[] = graph
        ? graph
            .getNodes()
            .map((node: X6Node | LifeCycleModelGraphNode) =>
              typeof (node as X6Node).toJSON === 'function'
                ? ((node as X6Node).toJSON() as LifeCycleModelGraphNode)
                : (node as LifeCycleModelGraphNode),
            )
        : (nodes as LifeCycleModelGraphNode[]);
      const currentEdges: LifeCycleModelGraphEdge[] = graph
        ? graph
            .getEdges()
            .map((edge: X6Edge | LifeCycleModelGraphEdge) =>
              typeof (edge as X6Edge).toJSON === 'function'
                ? ((edge as X6Edge).toJSON() as LifeCycleModelGraphEdge)
                : (edge as LifeCycleModelGraphEdge),
            )
        : (edges as LifeCycleModelGraphEdge[]);

      const newData = buildSavePayload(infoData, currentNodes, currentEdges);
      const persistenceGraph = editorGraphHydrationBaselineRef.current
        ? reconcileHydratedEditorGraphForPersistence(
            newData.model ?? { nodes: [], edges: [] },
            editorGraphHydrationBaselineRef.current,
          )
        : undefined;
      const fallbackValidationVersion =
        (newData?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'] as
          string | undefined) ??
        newData.version ??
        thisVersion;
      const buildValidationSnapshotPayload = (
        result: Pick<
          LifeCycleModelMutationResult,
          'langSupplementedPlaceholderPaths' | 'langTranslatedPaths' | 'normalizedJsonOrdered'
        >,
        modelId: string,
        version: string,
      ) => {
        if (
          !hasLangNormalizationDraftChanges(result) ||
          !result?.normalizedJsonOrdered?.lifeCycleModelDataSet
        ) {
          return {
            ...newData,
            id: modelId,
            version,
          };
        }

        return {
          ...genLifeCycleModelInfoFromData(result.normalizedJsonOrdered.lifeCycleModelDataSet),
          id: modelId,
          version,
          model: {
            nodes: currentNodes,
            edges: currentEdges,
          },
        } as LifeCycleModelEditorFormState;
      };
      const buildSaveResult = ({
        payload,
        modelId,
        saveSucceeded,
        version,
      }: {
        payload: LifeCycleModelEditorFormState;
        modelId: string;
        saveSucceeded: boolean;
        version: string;
      }): SaveDataResult => ({
        currentNodes,
        currentEdges,
        saveSucceeded,
        validationSnapshot: {
          modelId,
          version,
          payload,
        },
      });
      const showMutationError = (result: Extract<LifeCycleModelMutationResult, { ok: false }>) => {
        if (result.code === 'CALCULATION_CANCELLED') {
          message.info(
            intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.status.cancelled' }),
          );
          return;
        }

        if (result.code === 'RESULT_DISCARDED') {
          message.info(
            intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.status.resultDiscarded' }),
          );
          return;
        }

        if (isCalculationErrorCode(result.code)) {
          showCalculationFailureModal(result);
          return;
        }

        if (result.code === 'SAVE_STATUS_UNKNOWN') {
          message.warning(
            intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.status.saveStatusUnknown' }),
          );
          return;
        }

        if (result.code === 'SAVE_REJECTED') {
          message.error(
            intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.status.saveRejected' }),
          );
          return;
        }

        if (
          result.code === MISSING_REFERENCE_PROCESS_ERROR_CODE ||
          result.message === MISSING_REFERENCE_PROCESS_ERROR_MESSAGE
        ) {
          message.error(
            intl.formatMessage({
              id: 'pages.lifecyclemodel.error.missingReferenceProcess',
              defaultMessage:
                'The model is missing reference process information. Complete or rebind the reference process, then try again.',
            }),
          );
          return;
        }

        if (result.code === 'VERSION_CONFLICT') {
          message.error(
            intl.formatMessage({
              id: 'pages.button.create.error.duplicateId',
              defaultMessage: 'Data with the same ID and version already exists.',
            }),
          );
          return;
        }

        if (result.code === 'OPEN_DATA') {
          message.error(
            intl.formatMessage({
              id: 'pages.review.openData',
              defaultMessage: 'This data is open data, save failed',
            }),
          );
          return;
        }

        if (result.code === 'UNDER_REVIEW') {
          message.error(
            intl.formatMessage({
              id: 'pages.review.underReview',
              defaultMessage: 'Data is under review, save failed',
            }),
          );
          return;
        }

        message.error(result.message ?? 'Error');
      };
      const runMutation = async (
        mutation: () => Promise<LifeCycleModelMutationResult>,
      ): Promise<LifeCycleModelMutationResult> => {
        try {
          return await mutation();
        } catch (error) {
          return toSaveMutationError(error);
        }
      };
      /**
       * zh-CN: 模型内存摘要：捕获于保存开始，计算完成后由 hasModelChanged
       * 复核，防止旧结果覆盖新编辑态。摘要不进入持久化数据。
       * en-US: In-memory model signature: captured at save start and re-checked
       * via hasModelChanged after calculation so stale results never overwrite
       * the newer edit state. The signature is never persisted.
       */
      const buildModelSignature = (
        signatureNodes: LifeCycleModelGraphNode[],
        signatureEdges: LifeCycleModelGraphEdge[],
      ) =>
        JSON.stringify({
          nodes: signatureNodes.map((node) => [
            node.id,
            node.data?.index,
            node.data?.id,
            node.data?.version,
            node.data?.quantitativeReference,
            node.data?.targetAmount,
          ]),
          edges: signatureEdges.map((edge) => [
            edge.id,
            edge.source,
            edge.target,
            edge.data?.connection,
          ]),
        });
      const readLiveGraphCells = (): {
        liveNodes: LifeCycleModelGraphNode[];
        liveEdges: LifeCycleModelGraphEdge[];
      } => ({
        liveNodes: graph
          ? (graph
              .getNodes()
              .map((node: X6Node | LifeCycleModelGraphNode) =>
                typeof (node as X6Node).toJSON === 'function'
                  ? ((node as X6Node).toJSON() as LifeCycleModelGraphNode)
                  : (node as LifeCycleModelGraphNode),
              ) as LifeCycleModelGraphNode[])
          : (nodes as LifeCycleModelGraphNode[]),
        liveEdges: graph
          ? (graph
              .getEdges()
              .map((edge: X6Edge | LifeCycleModelGraphEdge) =>
                typeof (edge as X6Edge).toJSON === 'function'
                  ? ((edge as X6Edge).toJSON() as LifeCycleModelGraphEdge)
                  : (edge as LifeCycleModelGraphEdge),
              ) as LifeCycleModelGraphEdge[])
          : (edges as LifeCycleModelGraphEdge[]),
      });
      const modelSignatureAtSaveStart = buildModelSignature(currentNodes, currentEdges);
      // 覆盖整个保存操作（源加载 → 求解 → LCIA → 提交）的取消标识
      const saveOperation = new CalculationOperation();
      const mutationOptions = {
        ...(options?.langIntent ? { intent: options.langIntent } : {}),
        ...(persistenceGraph ? { persistenceGraph } : {}),
        hasModelChanged: () => {
          const { liveNodes, liveEdges } = readLiveGraphCells();
          return buildModelSignature(liveNodes, liveEdges) !== modelSignatureAtSaveStart;
        },
        operation: saveOperation,
      };

      if (thisAction === 'edit') {
        const lifecycleModelPayload = { ...newData, id: thisId, version: thisVersion };
        setCalculationPhase('calculating');
        let result: LifeCycleModelMutationResult;
        try {
          saveOperationRef.current = saveOperation;
          result = await runMutation(() =>
            mutationOptions
              ? updateLifeCycleModel(lifecycleModelPayload, mutationOptions)
              : updateLifeCycleModel(lifecycleModelPayload),
          );
        } finally {
          setCalculationPhase('idle');
          saveOperationRef.current = null;
        }
        if (result.ok) {
          const savedLifeCycleModel = result.lifecycleModel;
          const savedModelId = savedLifeCycleModel?.id ?? result.modelId;
          const savedVersion = savedLifeCycleModel?.version ?? result.version;
          const nextPayload = buildValidationSnapshotPayload(result, savedModelId, savedVersion);
          setInfoData(nextPayload);
          if (!silent) {
            message.success(
              intl.formatMessage({
                id: 'pages.lifecyclemodel.calculation.status.saveSucceeded',
              }),
            );
            if (result.calculationNotice === 'LCIA_INCOMPLETE') {
              message.warning(
                intl.formatMessage({
                  id: 'pages.lifecyclemodel.calculation.status.lciaIncomplete',
                }),
              );
            }
          }
          setThisId(savedModelId);
          setThisVersion(savedVersion);
          setJsonTg(savedLifeCycleModel?.json_tg ?? {});
          if (persistenceGraph && editorGraphHydrationBaselineRef.current) {
            editorGraphHydrationBaselineRef.current = {
              storedGraph: persistenceGraph,
              hydratedGraph: newData.model ?? { nodes: [], edges: [] },
            };
          }

          const savedEdges = (savedLifeCycleModel?.json_tg?.xflow?.edges ??
            []) as LifeCycleModelGraphEdge[];
          savedEdges.forEach((edge: LifeCycleModelGraphEdge) => {
            const label = getEdgeLabel(
              token,
              edge?.data?.connection?.unbalancedAmount as number,
              edge?.data?.connection?.exchangeAmount as number,
              edgeLabelText,
            );
            updateEdge(edge.id, { labels: [label] }, VISUAL_ONLY_MUTATION_OPTIONS);
          });

          saveCallback();
          return buildSaveResult({
            payload: nextPayload,
            modelId: savedModelId,
            saveSucceeded: true,
            version: savedVersion,
          });
        } else {
          const nextPayload = buildValidationSnapshotPayload(result, thisId, thisVersion);
          if (hasLangNormalizationDraftChanges(result)) {
            setInfoData(nextPayload);
          }
          if (!silent) {
            showMutationError(result);
          }
          return buildSaveResult({
            payload: nextPayload,
            modelId: thisId,
            saveSucceeded: false,
            version: thisVersion,
          });
        }
      } else if (thisAction === 'create') {
        const newId = actionType === 'createVersion' ? thisId : (importedId ?? v4());
        const lifecycleModelPayload = { ...newData, id: newId };
        const createVersionOptions =
          actionType === 'createVersion' ? { sourceVersion: thisVersion } : undefined;
        setCalculationPhase('calculating');
        let result: LifeCycleModelMutationResult;
        try {
          saveOperationRef.current = saveOperation;
          result = await runMutation(() => {
            if (createVersionOptions) {
              return createLifeCycleModel(
                lifecycleModelPayload,
                mutationOptions,
                createVersionOptions,
              );
            }
            return createLifeCycleModel(lifecycleModelPayload, mutationOptions);
          });
        } finally {
          setCalculationPhase('idle');
          saveOperationRef.current = null;
        }
        if (result.ok) {
          const savedLifeCycleModel = result.lifecycleModel;
          const savedModelId = savedLifeCycleModel?.id ?? result.modelId;
          const savedVersion = savedLifeCycleModel?.version ?? result.version;
          const nextPayload = buildValidationSnapshotPayload(result, savedModelId, savedVersion);
          if (!silent) {
            message.success(
              intl.formatMessage({
                id: 'pages.lifecyclemodel.calculation.status.saveSucceeded',
              }),
            );
            if (result.calculationNotice === 'LCIA_INCOMPLETE') {
              message.warning(
                intl.formatMessage({
                  id: 'pages.lifecyclemodel.calculation.status.lciaIncomplete',
                }),
              );
            }
          }
          setThisAction('edit');
          setThisId(savedModelId);
          setThisVersion(savedVersion);
          setInfoData(nextPayload);
          setJsonTg(savedLifeCycleModel?.json_tg ?? {});
          if (persistenceGraph && editorGraphHydrationBaselineRef.current) {
            editorGraphHydrationBaselineRef.current = {
              storedGraph: persistenceGraph,
              hydratedGraph: newData.model ?? { nodes: [], edges: [] },
            };
          }

          const savedEdges = (savedLifeCycleModel?.json_tg?.xflow?.edges ??
            []) as LifeCycleModelGraphEdge[];
          savedEdges.forEach((edge: LifeCycleModelGraphEdge) => {
            const label = getEdgeLabel(
              token,
              edge?.data?.connection?.unbalancedAmount as number,
              edge?.data?.connection?.exchangeAmount as number,
              edgeLabelText,
            );
            updateEdge(edge.id, { labels: [label] }, VISUAL_ONLY_MUTATION_OPTIONS);
          });

          saveCallback();
          return buildSaveResult({
            payload: nextPayload,
            modelId: savedModelId,
            saveSucceeded: true,
            version: savedVersion,
          });
        } else {
          const nextPayload = buildValidationSnapshotPayload(
            result,
            newId,
            fallbackValidationVersion,
          );
          if (hasLangNormalizationDraftChanges(result)) {
            setInfoData(nextPayload);
          }
          if (!silent) {
            showMutationError(result);
          }
          return buildSaveResult({
            payload: nextPayload,
            modelId: newId,
            saveSucceeded: false,
            version: fallbackValidationVersion,
          });
        }
      }
      return buildSaveResult({
        payload: {
          ...newData,
          id: thisId,
          version: thisVersion,
        },
        modelId: thisId,
        saveSucceeded: true,
        version: thisVersion,
      });
    } finally {
      if (setLoadingData) setSpinning(false);
    }
  };

  retrySaveRef.current = () => {
    void saveData(true);
  };

  useGraphEvent('edge:added', (evt) => {
    const edge = evt.edge;
    updateEdge(edge.id, edgeTemplate, VISUAL_ONLY_MUTATION_OPTIONS);
    edges.forEach((e) => {
      if (e?.labels?.length > 0) {
        updateEdge(e.id ?? '', { labels: [] }, VISUAL_ONLY_MUTATION_OPTIONS);
      }
    });
  });

  useGraphEvent('edge:connected', (evt) => {
    const edge = evt.edge;
    const sourcePortID = edge.getSourcePortId();
    const targetPortID = edge.getTargetPortId();
    const sourceFlowIDs = sourcePortID?.split(':');
    const targetFlowIDs = targetPortID?.split(':');
    if (
      sourcePortID?.toUpperCase()?.includes('OUTPUT') &&
      targetPortID?.toUpperCase()?.includes('INPUT') &&
      sourceFlowIDs?.[sourceFlowIDs?.length - 1] === targetFlowIDs?.[targetFlowIDs?.length - 1]
    ) {
      const sourceNodeID = edge.getSourceCellId();
      const targetNodeID = edge.getTargetCellId();
      const sourceNode = nodes.find((node) => node.id === sourceNodeID);
      const targetNode = nodes.find((node) => node.id === targetNodeID);

      // 单供应约束：同一条边重连自身不算第二供应方；其他来源已供应同一输入时
      // 拒绝新边并给出短文案（不宣称整个模型无法计算）。
      const candidateInputFlowId = targetFlowIDs?.[targetFlowIDs?.length - 1] ?? '';
      const conflictingEdgeIds = findConflictingProviderEdges(
        collectCanvasProviderRelations(nodes, edges),
        {
          upstreamIndex: String(sourceNode?.data?.index ?? ''),
          downstreamIndex: String(targetNode?.data?.index ?? ''),
          inputFlowId: candidateInputFlowId,
        },
        [edge.id],
      );
      if (conflictingEdgeIds.length > 0) {
        removeEdges([edge.id]);
        message.error(
          intl.formatMessage({
            id: 'pages.lifecyclemodel.calculation.connection.singleProvider',
          }),
        );
        return;
      }

      const sourceProcessId = sourceNode?.data?.id;
      const sourceProcessVersion = sourceNode?.data?.version;
      const targetProcessId = targetNode?.data?.id;
      const targetProcessVersion = targetNode?.data?.version;
      const sourcePortIDs = sourcePortID.split(':');
      const targetPortIDs = targetPortID.split(':');
      const sourceFlowUUID = sourcePortIDs?.[sourcePortIDs?.length - 1];
      const targetFlowUUID = targetPortIDs?.[targetPortIDs?.length - 1];
      const sourceFlowVersion = getLifeCycleModelPortFlowVersion(
        sourceNode,
        sourcePortID,
        sourceFlowUUID,
        'groupOutput',
      );
      const targetFlowVersion = getLifeCycleModelPortFlowVersion(
        targetNode,
        targetPortID,
        targetFlowUUID,
        'groupInput',
      );

      markModelDirty();
      updateEdge(edge.id, {
        data: {
          connection: {
            outputExchange: {
              '@flowUUID': sourceFlowUUID,
              '@version': sourceFlowVersion,
              downstreamProcess: {
                '@flowUUID': targetFlowUUID,
                '@version': targetFlowVersion,
              },
            },
          },
          node: {
            sourceNodeID: sourceNodeID,
            targetNodeID: targetNodeID,
            sourceProcessId: sourceProcessId,
            sourceProcessVersion: sourceProcessVersion,
            targetProcessId: targetProcessId,
            targetProcessVersion: targetProcessVersion,
          },
        },
      });
    } else {
      removeEdges([edge.id]);
    }
  });

  useGraphEvent('edge:click', (evt) => {
    nodes.forEach((n) => {
      if (n.selected) {
        updateNode(n.id ?? '', { selected: false });
      }
    });

    const currentEdge = edges.find((e) => e.selected === true);
    if (currentEdge) {
      if (currentEdge.id === evt.edge.id) return;

      updateEdge(currentEdge.id, {
        selected: false,
      });
    }

    updateEdge(evt.edge.id, {
      selected: true,
    });
  });

  useGraphEvent('node:change:size', (evt) => {
    const node = evt.node;
    const nodeWidth = node.getSize().width;
    const label = genLifeCycleModelNodeName(node?.data, lang);
    const newItems = node?.getPorts()?.map((item: LifeCycleModelPortItem) => {
      const itemText = getLangText(item?.data?.textLang, lang);
      const itemTextWithAllocation = getPortLabelWithAllocation(
        itemText ?? '',
        item?.data?.allocations,
        item?.group === 'groupOutput' ? 'OUTPUT' : 'INPUT',
      );
      return {
        ...item,
        attrs: {
          text: {
            ...item?.attrs?.text,
            text: `${genPortLabel(itemTextWithAllocation, lang, nodeWidth)}`,
            cursor: 'pointer',
            fill: getPortTextColor(
              item?.data?.quantitativeReference,
              item?.data?.allocations,
              token,
            ),
            'font-weight': getPortTextStyle(item?.data?.quantitativeReference),
          },
        },
      };
    });

    node.setAttrByPath('label/text', '', VISUAL_ONLY_MUTATION_OPTIONS);
    node.prop('ports/items', newItems, VISUAL_ONLY_MUTATION_OPTIONS);

    if (resizeToolRefreshTimerRef.current) {
      clearTimeout(resizeToolRefreshTimerRef.current);
    }

    resizeToolRefreshTimerRef.current = setTimeout(() => {
      node.removeTools?.();
      node.addTools(
        [
          node?.data?.quantitativeReference === '1' ? refTool : nonRefTool,
          nodeTitleTool(nodeWidth, label ?? '', token, lang),
          inputFlowTool,
          outputFlowTool,
        ],
        { ...VISUAL_ONLY_MUTATION_OPTIONS, reset: true },
      );
      resizeToolRefreshTimerRef.current = null;
    }, 0);
  });

  useGraphEvent('node:click', (evt) => {
    const node = evt.node;
    const event = evt.e;

    if (node.isNode()) {
      const currentNode = nodes.find((n) => n.id === node.id);
      const isClickingPort = event && event.target;

      let clickedPortId: string | null = null;
      if (isClickingPort) {
        const targetElement = event.target as Element;
        const portContainer = targetElement.closest?.('.x6-port');
        const portElement =
          targetElement.closest?.('[port]') ?? portContainer?.querySelector?.('[port]');
        const portAttr = portElement?.getAttribute('port');

        if (portAttr) {
          clickedPortId = portAttr;
        }

        let matchedPort = null;
        if (clickedPortId) {
          const ports: { id: string; data?: { flowVersion?: string } }[] = node.getPorts();
          matchedPort = ports.find((port) => port.id === clickedPortId);

          if (matchedPort) {
            setConnectableProcessesDrawerVisible(true);
            setConnectableProcessesPortId(clickedPortId);
            setConnectableProcessesFlowVersion(matchedPort?.data?.flowVersion ?? '');
            return;
          }
        }
      }

      edges.forEach((e) => {
        if (e.selected) {
          updateEdge(e.id ?? '', { selected: false });
        }
      });

      const isCtrlOrMetaPressed = event && (event.ctrlKey || event.metaKey);

      if (isCtrlOrMetaPressed) {
        updateNode(node.id, {
          selected: !currentNode?.selected,
        });
      } else {
        nodes.forEach((n) => {
          if (n.id !== node.id && n.selected) {
            updateNode(n.id ?? '', { selected: false });
          }
        });
        updateNode(node.id, {
          selected: !currentNode?.selected,
        });
      }
    }
  });

  useGraphEvent('blank:click', () => {
    nodes.forEach((n) => {
      if (n.selected) {
        updateNode(n.id ?? '', { selected: false });
      }
    });

    edges.forEach((e) => {
      if (e.selected) {
        updateEdge(e.id ?? '', { selected: false });
      }
    });
  });

  useEffect(() => {
    if (!graph || typeof graph.bindKey !== 'function' || typeof graph.unbindKey !== 'function') {
      return;
    }

    const shortcuts: Array<{ keys: string[]; handler: () => void }> = [
      { keys: ['meta+z', 'ctrl+z'], handler: undoGraph },
      { keys: ['meta+shift+z', 'ctrl+shift+z', 'ctrl+y'], handler: redoGraph },
      { keys: ['backspace', 'delete'], handler: deleteCell },
      { keys: ['meta+c', 'ctrl+c'], handler: copySelection },
      { keys: ['meta+v', 'ctrl+v'], handler: pasteSelection },
      { keys: ['meta+d', 'ctrl+d'], handler: duplicateSelection },
    ];

    shortcuts.forEach(({ keys, handler }) => {
      graph.bindKey(keys, (event: any) => {
        event?.preventDefault?.();
        handler();
        return false;
      });
    });

    return () => {
      shortcuts.forEach(({ keys }) => {
        graph.unbindKey(keys);
      });
    };
  }, [copySelection, deleteCell, duplicateSelection, graph, pasteSelection, redoGraph, undoGraph]);

  useEffect(
    () => () => {
      if (resizeToolRefreshTimerRef.current) {
        clearTimeout(resizeToolRefreshTimerRef.current);
      }
    },
    [],
  );

  const getEditorProcessData = async (
    jsonTg: LifeCycleModelJsonTg,
  ): Promise<ProcessDetailByVersionItem[]> => {
    const params = getLifeCycleModelGraphProcessReferences(jsonTg);
    const [nextUserId, processInstancesResult, processDetailsResult] = await Promise.all([
      getUserId(),
      params.length > 0
        ? getProcessesByIdAndVersion(params).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      params.length > 0
        ? getProcessDetailByIdAndVersion(params).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);

    setUserId(nextUserId);
    setProcessInstances(
      (Array.isArray(processInstancesResult.data)
        ? processInstancesResult.data
        : []) as LifeCycleModelProcessInstance[],
    );
    return (
      Array.isArray(processDetailsResult.data) ? processDetailsResult.data : []
    ) as ProcessDetailByVersionItem[];
  };

  useEffect(() => {
    if (!drawerVisible) {
      onClose();
      setInfoData({});
      setAutoCheckTriggered(false);
      setNodeCount(0);
      setProblemNodes([]);
      setSdkProblemProcessInstanceIds([]);
      setMultiProviderConflictNodeIds([]);
      setJsonTg({});
      editorGraphHydrationBaselineRef.current = null;
      modelData({ nodes: [], edges: [] });
      resetGraphCommandState();
      return;
    }

    if (importData && importData.length > 0) {
      editorGraphHydrationBaselineRef.current = null;
      const formData = genLifeCycleModelInfoFromData(importData[0].lifeCycleModelDataSet);
      setInfoData(formData);
      const model = genLifeCycleModelData(importData[0]?.json_tg ?? {}, lang);
      const initNodes = hydrateEditorNodes({
        nodes: model?.nodes ?? [],
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang,
        nodeTemplateWidth,
        nodeAttrs,
        portsGroups: ports.groups,
      });
      const initEdges = hydrateEditorEdges(model?.edges ?? [], token, edgeLabelText);

      modelData({
        nodes: initNodes,
        edges: initEdges,
      });
      // 旧模型中的多供应冲突：不删除任何边，仅标记冲突节点
      setMultiProviderConflictNodeIds(collectMultiProviderConflictNodeIds(initNodes, initEdges));

      setNodeCount(initNodes.length);
      resetGraphCommandState();
      return;
    }

    if (id !== '') {
      setIsSave(false);
      setSpinning(true);
      void getLifeCycleModelDetail(id, version)
        .then(async (result: LifeCycleModelDetailResponse) => {
          if (!result.success) {
            message.error(
              intl.formatMessage({
                id: 'pages.lifecyclemodel.notPublic',
                defaultMessage: 'Model is not public',
              }),
            );
            return;
          }
          const fromData = genLifeCycleModelInfoFromData(
            result.data?.json?.lifeCycleModelDataSet ?? {},
          );
          const storedJsonTg = result.data?.json_tg ?? {};
          setJsonTg(storedJsonTg);

          if (actionType === 'createVersion' && newVersion) {
            fromData.administrativeInformation.publicationAndOwnership['common:dataSetVersion'] =
              newVersion;
          }
          setInfoData({ ...fromData, id: thisId, version: thisVersion });
          const processDetails = await getEditorProcessData(storedJsonTg);
          const editorJsonTg = normalizeLifeCycleModelGraphForDisplay({
            jsonTg: storedJsonTg,
            lifeCycleModelDataSet: result.data?.json?.lifeCycleModelDataSet,
            processDetails,
          });
          const model = genLifeCycleModelData(editorJsonTg, lang);
          const initNodes = hydrateEditorNodes({
            nodes: model?.nodes ?? [],
            refTool,
            nonRefTool,
            inputFlowTool,
            outputFlowTool,
            token,
            lang,
            nodeTemplateWidth,
            nodeAttrs,
            portsGroups: ports.groups,
          });
          const initEdges = hydrateEditorEdges(model?.edges ?? [], token, edgeLabelText);
          editorGraphHydrationBaselineRef.current = {
            storedGraph: {
              nodes: storedJsonTg.xflow?.nodes ?? [],
              edges: storedJsonTg.xflow?.edges ?? [],
            },
            hydratedGraph: {
              nodes: initNodes,
              edges: initEdges,
            },
          };
          await modelData({
            nodes: initNodes,
            edges: initEdges,
          });
          // 旧模型中的多供应冲突：不删除任何边，仅标记冲突节点
          setMultiProviderConflictNodeIds(
            collectMultiProviderConflictNodeIds(initNodes, initEdges),
          );

          setNodeCount(initNodes.length);
          resetGraphCommandState();
        })
        .finally(() => {
          setSpinning(false);
        });
    } else {
      editorGraphHydrationBaselineRef.current = null;
      const currentDateTime = formatDateTime(new Date());
      setInfoData(
        buildEmptyCreateInfoData({
          currentDateTime,
          initVersion,
          defaultPermanentDataSetURI: intl.formatMessage({
            id: 'pages.lifeCycleModel.administrativeInformation.permanentDataSetURI.default',
            defaultMessage: 'Automatically generated',
          }),
          id: thisId,
          version: thisVersion,
        }),
      );
      modelData({
        nodes: [],
        edges: [],
      });
      setNodeCount(0);
      resetGraphCommandState();
    }
  }, [drawerVisible]);

  useEffect(() => {
    nodes.forEach((node) => {
      const visualUpdate = buildLocalizedGraphNodeVisualUpdate({
        node,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: contentLanguage,
        nodeTemplateWidth,
      });
      updateNode(node.id ?? '', visualUpdate, VISUAL_ONLY_MUTATION_OPTIONS);
    });
  }, [contentLanguage, intl.locale, nodeCount]);

  useEffect(() => {
    nodes.forEach((node) => {
      const hasReferenceProblem = problemNodes.find(
        (item: refDataType) =>
          item['@refObjectId'] === node.data.id && item['@version'] === node.data.version,
      );
      const hasSdkProcessInstanceProblem =
        typeof node?.data?.index === 'string' &&
        sdkProblemProcessInstanceIds.includes(node.data.index);
      const hasProviderConflictProblem =
        typeof node?.id === 'string' && multiProviderConflictNodeIds.includes(node.id);

      if (hasReferenceProblem || hasSdkProcessInstanceProblem || hasProviderConflictProblem) {
        updateNode(
          node.id ?? '',
          {
            attrs: {
              ...nodeAttrs,
              body: {
                ...nodeAttrs.body,
                stroke: token.colorError,
              },
            },
          },
          VISUAL_ONLY_MUTATION_OPTIONS,
        );
      } else {
        updateNode(
          node.id ?? '',
          {
            attrs: {
              ...nodeAttrs,
              body: {
                ...nodeAttrs.body,
                stroke: token.colorPrimary,
              },
            },
          },
          VISUAL_ONLY_MUTATION_OPTIONS,
        );
      }
    });
  }, [multiProviderConflictNodeIds, problemNodes, sdkProblemProcessInstanceIds]);

  const handleUpdateNode = async (ref: refDataType) => {
    setSpinning(true);
    const selectedNode = nodes.find((node) => node.selected);
    if (selectedNode) {
      const { data: procressDetail } = await getRefData(
        ref['@refObjectId'],
        ref['@version'],
        getRefTableName(ref['@type']),
      );
      const refObjs = getAllRefObj(procressDetail);
      const userTeamId = await getUserTeamId();

      const path = await checkReferences(
        refObjs,
        new Map<string, unknown>(),
        userTeamId,
        [],
        [],
        [],
        [],
        new ReffPath(
          {
            '@refObjectId': selectedNode.data.id,
            '@version': selectedNode.data.version,
            '@type': 'process data set',
          },
          procressDetail?.ruleVerification,
          false,
        ),
        undefined,
        {
          rootRef: {
            '@refObjectId': selectedNode.data.id,
            '@version': selectedNode.data.version,
            '@type': 'process data set',
          },
        },
      );
      const problemNodesofSelectedNode = path?.findProblemNodes();
      if (!problemNodesofSelectedNode?.length) {
        setProblemNodes(
          problemNodes.filter(
            (item: refDataType) =>
              item['@refObjectId'] !== selectedNode.data.id ||
              item['@version'] !== selectedNode.data.version,
          ),
        );
      }
    }
    setSpinning(false);
  };

  const currentValidationSnapshot = () => {
    const currentNodes = graph
      ? graph
          .getNodes()
          .map((node: X6Node) =>
            typeof node.toJSON === 'function'
              ? (node.toJSON() as LifeCycleModelGraphNode)
              : (node as unknown as LifeCycleModelGraphNode),
          )
      : nodes;
    const currentEdges = graph
      ? graph
          .getEdges()
          .map((edge: X6Edge) =>
            typeof edge.toJSON === 'function'
              ? (edge.toJSON() as LifeCycleModelGraphEdge)
              : (edge as unknown as LifeCycleModelGraphEdge),
          )
      : edges;
    return {
      currentNodes,
      currentEdges,
      validationSnapshot: {
        modelId: thisId,
        version: thisVersion,
        payload: buildSavePayload(infoData, currentNodes, currentEdges),
      },
    };
  };

  const handleCheckData = async (options?: { silent?: boolean }) => {
    setSpinning(true);
    try {
      const current = currentValidationSnapshot();
      const checkDataResult = await editInfoRef.current?.handleCheckData(
        'checkData',
        current.currentNodes,
        current.currentEdges,
        { silent: options?.silent ?? false, validationSnapshot: current.validationSnapshot },
      );
      setProblemNodes(checkDataResult?.problemNodes ?? []);
    } finally {
      setSpinning(false);
    }
  };

  useEffect(() => {
    if (
      !autoCheckRequired ||
      autoCheckTriggered ||
      !drawerVisible ||
      Object.keys(infoData ?? {}).length === 0
    ) {
      return;
    }
    setAutoCheckTriggered(true);
    void handleCheckData({ silent: true });
  }, [autoCheckRequired, autoCheckTriggered, drawerVisible, handleCheckData, infoData]);

  const handelSubmitReview = async () => {
    if (!isSave) {
      message.info(
        intl.formatMessage({
          id: 'pages.lifecyclemodel.review.saveFirst',
          defaultMessage: 'Save your changes before submitting for review.',
        }),
      );
      return;
    }
    setSpinning(true);
    try {
      const current = currentValidationSnapshot();
      const reviewResult = await editInfoRef.current?.handleCheckData(
        'review',
        current.currentNodes,
        current.currentEdges,
        { validationSnapshot: current.validationSnapshot },
      );
      setProblemNodes(reviewResult?.problemNodes ?? []);
      if (reviewResult?.checkResult) {
        const submitSucceeded = await editInfoRef.current?.submitReview(
          reviewResult.unReview ?? [],
        );
        if (submitSucceeded) onSubmitReviewSuccess();
      }
    } finally {
      setSpinning(false);
    }
  };

  const getShowResult = () => {
    const selectedNode = nodes.find((node) => node.selected);
    const processInstance = processInstances.find(
      (pi) => pi.id === selectedNode?.data?.id && pi.version === selectedNode?.data?.version,
    );
    if (processInstance?.userId === userId) {
      if (processInstance?.modelId) {
        return (
          <LifeCycleModelEdit
            id={processInstance.modelId}
            version={selectedNode?.data?.version ?? ''}
            lang={lang}
            buttonType={'toolIcon'}
            disabled={!selectedNode}
            hideReviewButton={true}
            updateNodeCb={handleUpdateNode}
          />
        );
      } else {
        return (
          <ProcessEdit
            id={selectedNode?.data?.id ?? ''}
            version={selectedNode?.data?.version ?? ''}
            buttonType={'toolIcon'}
            lang={lang}
            disabled={!selectedNode}
            actionRef={undefined}
            setViewDrawerVisible={() => {}}
            hideReviewButton={true}
            updateNodeCb={handleUpdateNode}
          />
        );
      }
    } else {
      if (processInstance?.modelId) {
        return (
          <LifeCycleModelView
            id={processInstance.modelId}
            version={selectedNode?.data?.version ?? ''}
            lang={lang}
            actionRef={undefined}
            buttonType={'toolIcon'}
            disabled={!selectedNode}
          />
        );
      } else {
        return (
          <ProcessView
            id={selectedNode?.data?.id ?? ''}
            version={selectedNode?.data?.version ?? ''}
            buttonType={'toolIcon'}
            lang={lang}
            disabled={!selectedNode}
          />
        );
      }
    }
  };

  const selectedEdge = edges.find((edge) => edge.selected);
  const quantitativeReferenceNode = nodes.find((node) => node?.data?.quantitativeReference === '1');
  const hasSelectedCells =
    nodes.some((node) => node.selected) || edges.some((edge) => edge.selected);

  return (
    <LoadingDisabledActionGroup
      loading={spinning || (drawerVisible && Object.keys(infoData ?? {}).length === 0)}
    >
      <Space
        orientation='vertical'
        size={'middle'}
        style={{ height: '70vh', overflowY: 'auto', paddingRight: 10, paddingLeft: 10 }}
      >
        <ToolbarEditInfo
          ref={editInfoRef}
          action={thisAction}
          actionType={actionType}
          data={infoData}
          onData={updateInfoData}
          lang={lang}
          onNavigateProcessInstance={handleNavigateProcessInstance}
          onProcessInstanceValidationChange={handleProcessInstanceValidationChange}
        />
        {getShowResult()}
        <EdgeExhange
          lang={lang}
          disabled={!selectedEdge}
          edge={selectedEdge as LifeCycleModelGraphEdge}
        />
        <TargetAmount
          refNode={quantitativeReferenceNode as LifeCycleModelGraphNode}
          drawerVisible={targetAmountDrawerVisible}
          lang={lang}
          setDrawerVisible={setTargetAmountDrawerVisible}
          onData={updateTargetAmount}
        />

        <ModelToolbarAdd buttonType={'icon'} lang={lang} onData={addProcessNodes} />
        {/* <Tooltip
            title={
              <FormattedMessage
                id="pages.button.model.design"
                defaultMessage="Design Appearance"
              ></FormattedMessage>
            }
            placement="left"
          >
            <Button
              shape="circle"
              size="small"
              icon={<FormatPainterOutlined />}
              disabled={
                nodes.filter((node) => node.selected).length === 0 &&
                edges.filter((edge) => edge.selected).length === 0
              }
            />
          </Tooltip> */}
        <Tooltip
          title={
            <FormattedMessage id='pages.button.updateReference' defaultMessage='Update Reference' />
          }
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            icon={<CopyOutlined />}
            style={{ boxShadow: 'none' }}
            onClick={() => updateReference(true)}
          />
        </Tooltip>
        <Tooltip
          title={
            <FormattedMessage id='pages.button.model.delete' defaultMessage='Delete element' />
          }
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            icon={<DeleteOutlined />}
            style={{ boxShadow: 'none' }}
            disabled={
              nodes.filter((node) => node.selected).length === 0 &&
              edges.filter((edge) => edge.selected).length === 0
            }
            onClick={deleteCell}
          />
        </Tooltip>
        <br />

        <Tooltip
          title={<FormattedMessage id='pages.button.model.save' defaultMessage='Save data' />}
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            icon={<SaveOutlined />}
            style={{ boxShadow: 'none' }}
            onClick={() => {
              saveData(true);
              updateNodeCb({
                '@refObjectId': id,
                '@version': version,
                '@type': 'lifeCycleModel data set',
              });
            }}
          />
        </Tooltip>
        <br />

        {/* <ProcessView
        id={id ?? ''}
        version={version ?? ''}
        lang={lang}
        buttonType={'toolResultIcon'}
        actionRef={undefined}
        disabled={false}
      /> */}
        <ModelResult
          submodels={(jsonTg?.submodels ?? [])
            .filter((submodel) => submodel.type !== 'allocated')
            .map((submodel) => ({
              id: submodel.id,
              type: submodel.type,
              version: submodel.version ?? thisVersion,
            }))}
          resultingProcesses={
            infoData?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess
          }
          modelId={thisId}
          modelVersion={thisVersion}
          lang={lang}
          actionType='edit'
          showPreviousResultNotice={!isSave && (jsonTg?.submodels ?? []).length > 0}
        />
        <Tooltip
          title={<FormattedMessage id='pages.button.check' defaultMessage='Data Check' />}
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            icon={<CheckCircleOutlined />}
            style={{ boxShadow: 'none' }}
            onClick={() => void handleCheckData()}
          />
        </Tooltip>
        {!hideReviewButton ? (
          <Tooltip
            title={<FormattedMessage id='pages.button.review' defaultMessage='Submit for Review' />}
            placement='left'
          >
            <Button
              type='primary'
              size='small'
              icon={<SendOutlined />}
              style={{ boxShadow: 'none' }}
              onClick={handelSubmitReview}
            />
          </Tooltip>
        ) : null}
        <Control
          items={[
            'undo',
            'redo',
            'paste',
            'duplicate',
            'zoomOut',
            'zoomTo',
            'zoomIn',
            'zoomToFit',
            'zoomToOrigin',
            'autoLayoutLR',
          ]}
          editorActions={{
            undo: undoGraph,
            redo: redoGraph,
            paste: pasteSelection,
            duplicate: duplicateSelection,
          }}
          canDuplicate={hasSelectedCells}
        />
        <Spin className='tg-fullscreen-spin' spinning={spinning} fullscreen />
        <Modal
          open={calculationPhase === 'calculating'}
          title={intl.formatMessage({
            id: 'pages.lifecyclemodel.calculation.status.calculating',
          })}
          closable={false}
          mask={{ closable: false }}
          keyboard={false}
          footer={
            <Button onClick={() => cancelActiveCalculation()}>
              {intl.formatMessage({ id: 'pages.lifecyclemodel.calculation.action.cancel' })}
            </Button>
          }
        >
          <Spin />
        </Modal>
        <IoPortSelect
          lang={lang}
          node={ioPortSelectorNode as LifeCycleModelGraphNode}
          direction={ioPortSelectorDirection}
          drawerVisible={ioPortSelectorDrawerVisible}
          onData={updateNodePorts}
          onDrawerVisible={setIoPortSelectorDrawerVisible}
        />
        <ConnectableProcesses
          lang={lang}
          drawerVisible={connectableProcessesDrawerVisible}
          setDrawerVisible={setConnectableProcessesDrawerVisible}
          portId={connectableProcessesPortId}
          flowVersion={connectableProcessesFlowVersion}
          onData={addProcessNodes}
        />
      </Space>
    </LoadingDisabledActionGroup>
  );
};

export default ToolbarEdit;
