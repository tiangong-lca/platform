import { useGraphEvent, useGraphStore } from '@/contexts/graphContext';
import LifeCycleModelView from '@/pages/LifeCycleModels/Components/view';
import ProcessView from '@/pages/Processes/Components/view';
import { initVersion } from '@/services/general/data';
import { DEFAULT_BROWSER_APP_LOCALE } from '@/services/general/localeRegistry';
import { normalizeRuntimeLocale } from '@/services/general/runtimeLocale';
import { formatDateTime, getLangText } from '@/services/general/util';
import { getLifeCycleModelDetail } from '@/services/lifeCycleModels/api';
import type {
  FormLifeCycleModel,
  LifeCycleModelFormState,
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelJsonTg,
  LifeCycleModelPortItem,
  LifeCycleModelProcessInstance,
} from '@/services/lifeCycleModels/data';
import {
  genLifeCycleModelData,
  genLifeCycleModelInfoFromData,
  genLifeCycleModelNodeName,
  genPortLabel,
} from '@/services/lifeCycleModels/util';
import {
  getLifeCycleModelGraphProcessReferences,
  normalizeLifeCycleModelGraphForDisplay,
} from '@/services/lifeCycleModels/viewCompatibility';
import {
  getProcessDetailByIdAndVersion,
  getProcessesByIdAndVersion,
} from '@/services/processes/api';
import type { ProcessDetailByVersionItem } from '@/services/processes/data';
import { ActionType } from '@ant-design/pro-components';
import { App, Space, Spin, theme } from 'antd';
import type { FC } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';
// import ConnectableProcesses from '../connectableProcesses';
import { GraphEdge, GraphNode } from '@/contexts/graphContext';
import ModelResult from '../modelResult';
import { Control } from './control';
import EdgeExhange from './Exchange/index';
import IoPortView from './Exchange/ioPortView';
import { getEdgeLabel } from './utils/edge';
import {
  getPortLabelWithAllocation,
  getPortTextColor,
  getPortTextStyle,
  nodeTitleTool,
} from './utils/node';
import ToolbarViewInfo from './viewInfo';
import TargetAmount from './viewTargetAmount';
type Props = {
  id: string;
  version: string;
  lang: string;
  drawerVisible: boolean;
  actionRef?: React.RefObject<ActionType | undefined>;
};

const VISUAL_ONLY_MUTATION_OPTIONS = { ignoreHistory: true };

const ToolbarView: FC<Props> = ({ id, version, lang, drawerVisible }) => {
  const readOnlyCursor = 'move';
  const [spinning, setSpinning] = useState(false);
  const [infoData, setInfoData] = useState<LifeCycleModelFormState>({});
  const [jsonTg, setJsonTg] = useState<LifeCycleModelJsonTg>({});
  const [targetAmountDrawerVisible, setTargetAmountDrawerVisible] = useState(false);
  const [ioPortSelectorDirection] = useState('');
  const [ioPortSelectorNode] = useState<LifeCycleModelGraphNode>();
  const [ioPortSelectorDrawerVisible, setIoPortSelectorDrawerVisible] = useState(false);
  const [processInstances, setProcessInstances] = useState<LifeCycleModelProcessInstance[]>([]);
  // const [connectableProcessesDrawerVisible, setConnectableProcessesDrawerVisible] = useState(false);

  const modelData = useGraphStore((state) => state.initData);
  const updateNode = useGraphStore((state) => state.updateNode);
  const intl = useIntl();
  const { message } = App.useApp();
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

  const nodes: GraphNode[] = useGraphStore((state) => state.nodes);
  const edges: GraphEdge[] = useGraphStore((state) => state.edges);
  const removeEdges = useGraphStore((state) => state.removeEdges);
  const updateEdge = useGraphStore((state) => state.updateEdge);

  const [nodeCount, setNodeCount] = useState(0);
  const resizeToolRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelResolutionEpochRef = useRef(0);

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
            cursor: readOnlyCursor,
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
            cursor: readOnlyCursor,
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
            cursor: readOnlyCursor,
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
    magnet: 'passive',
    cursor: readOnlyCursor,
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
            cursor: readOnlyCursor,
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
            cursor: readOnlyCursor,
          },
        },
      },
    },
    items: [],
  };

  const buildReadOnlyNodeTools = (
    nodeWidth: number,
    nodeData: LifeCycleModelGraphNode['data'],
    isReference: boolean,
  ) => [
    isReference ? refTool : '',
    nodeTitleTool(
      nodeWidth,
      genLifeCycleModelNodeName(nodeData, lang) ?? '',
      token,
      lang,
      readOnlyCursor,
    ),
    inputFlowTool,
    outputFlowTool,
  ];

  useGraphEvent('node:click', (evt) => {
    const node = evt.node;
    const event = evt.e;

    if (node.isNode()) {
      const currentNode = nodes.find((n) => n.id === node.id);

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

  useGraphEvent('edge:click', (evt) => {
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

  useGraphEvent('edge:added', (evt) => {
    const edge = evt.edge;
    removeEdges([edge.id]);
  });

  useGraphEvent('node:change:size', (evt) => {
    const node = evt.node;
    const nodeWidth = node.getSize().width;
    const newItems = node?.getPorts?.()?.map((item: LifeCycleModelPortItem) => {
      const itemText = getLangText(item?.data?.textLang, lang);
      const itemTextWithAllocation = getPortLabelWithAllocation(
        itemText ?? '',
        item?.data?.allocations,
        item?.group === 'groupOutput' ? 'OUTPUT' : 'INPUT',
      );

      return {
        ...item,
        attrs: {
          ...item?.attrs,
          text: {
            ...item?.attrs?.text,
            text: `${genPortLabel(itemTextWithAllocation ?? '', lang, nodeWidth)}`,
            title: itemTextWithAllocation,
            fill: getPortTextColor(
              item?.data?.quantitativeReference,
              item?.data?.allocations,
              token,
            ),
            'font-weight': getPortTextStyle(item?.data?.quantitativeReference),
            cursor: readOnlyCursor,
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
        buildReadOnlyNodeTools(nodeWidth, node?.data, node?.data?.quantitativeReference === '1'),
        { ...VISUAL_ONLY_MUTATION_OPTIONS, reset: true },
      );
      resizeToolRefreshTimerRef.current = null;
    }, 0);
  });

  const getProcessDisplayData = async (
    jsonTg: LifeCycleModelJsonTg,
  ): Promise<{
    processInstances: LifeCycleModelProcessInstance[];
    processDetails: ProcessDetailByVersionItem[];
  }> => {
    const params = getLifeCycleModelGraphProcessReferences(jsonTg);
    if (params.length === 0) {
      return { processInstances: [], processDetails: [] };
    }

    const [processInstancesResult, processDetailsResult] = await Promise.all([
      getProcessesByIdAndVersion(params).catch(() => ({ data: [] })),
      getProcessDetailByIdAndVersion(params).catch(() => ({ data: [] })),
    ]);

    return {
      processInstances: (processInstancesResult.data ?? []) as LifeCycleModelProcessInstance[],
      processDetails: (processDetailsResult.data ?? []) as ProcessDetailByVersionItem[],
    };
  };

  const canonicalAppLocale =
    normalizeRuntimeLocale(intl.locale) ??
    normalizeRuntimeLocale(lang) ??
    DEFAULT_BROWSER_APP_LOCALE;

  useEffect(() => {
    const resolutionEpoch = modelResolutionEpochRef.current + 1;
    modelResolutionEpochRef.current = resolutionEpoch;
    const isCurrentResolution = () => modelResolutionEpochRef.current === resolutionEpoch;

    if (!drawerVisible) {
      setJsonTg({});
      setProcessInstances([]);
      setSpinning(false);
      return () => {
        if (isCurrentResolution()) {
          modelResolutionEpochRef.current += 1;
        }
      };
    }
    if (id && version) {
      setSpinning(true);
      setProcessInstances([]);
      void getLifeCycleModelDetail(id, version)
        .then(async (result) => {
          if (!isCurrentResolution()) {
            return;
          }
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
          const nextJsonTg = result.data?.json_tg ?? {};
          setInfoData({ ...fromData, id: id });
          setJsonTg(nextJsonTg);
          const { processInstances: nextProcessInstances, processDetails } =
            await getProcessDisplayData(nextJsonTg);
          if (!isCurrentResolution()) {
            return;
          }
          const displayJsonTg = normalizeLifeCycleModelGraphForDisplay({
            jsonTg: nextJsonTg,
            lifeCycleModelDataSet: result.data?.json?.lifeCycleModelDataSet,
            processDetails,
          });
          const model = genLifeCycleModelData(displayJsonTg, lang);
          const initNodes = (model?.nodes ?? []).map((node: LifeCycleModelGraphNode) => {
            return {
              ...node,
              selected: false,
              attrs: {
                ...nodeAttrs,
                label: {
                  ...nodeAttrs.label,
                  text: '',
                },
              },
              ports: {
                ...node.ports,
                groups: ports.groups,
                items: node?.ports?.items?.map((item: LifeCycleModelPortItem) => {
                  const itemText = getLangText(item?.data?.textLang, lang);
                  const itemTextWithAllocation = getPortLabelWithAllocation(
                    itemText ?? '',
                    item?.data?.allocations,
                    item?.group === 'groupOutput' ? 'OUTPUT' : 'INPUT',
                  );
                  return {
                    ...item,
                    attrs: {
                      ...item?.attrs,
                      text: {
                        ...item?.attrs?.text,
                        'aria-label': itemTextWithAllocation,
                        'data-responsive-label-kind': 'port-label',
                        text: `${genPortLabel(
                          itemTextWithAllocation ?? '',
                          lang,
                          node?.size?.width ?? node?.width ?? 350,
                        )}`,
                        title: itemTextWithAllocation,
                        fill: getPortTextColor(
                          item?.data?.quantitativeReference,
                          item?.data?.allocations,
                          token,
                        ),
                        'font-weight': getPortTextStyle(item?.data?.quantitativeReference),
                        cursor: readOnlyCursor,
                      },
                    },
                  };
                }),
              },
              tools: buildReadOnlyNodeTools(
                node?.size?.width ?? node?.width ?? 350,
                node?.data,
                node?.data?.quantitativeReference === '1',
              ),
            };
          });

          const initEdges =
            model?.edges?.map((edge: LifeCycleModelGraphEdge) => {
              if (edge.target) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { x, y, ...targetRest } = edge.target as { [key: string]: unknown };
                const label = getEdgeLabel(
                  token,
                  edge?.data?.connection?.unbalancedAmount as number,
                  edge?.data?.connection?.exchangeAmount as number,
                  edgeLabelText,
                );
                return {
                  ...edge,
                  selected: false,
                  attrs: {
                    line: {
                      stroke: token.colorPrimary,
                      strokeWidth: 1,
                    },
                  },
                  labels: [label],
                  target: targetRest,
                };
              }
              return {
                ...edge,
                selected: false,
              };
            }) ?? [];

          if (!isCurrentResolution()) {
            return;
          }
          modelData({
            nodes: initNodes,
            edges: initEdges,
          });
          setNodeCount(initNodes.length);
          setProcessInstances(nextProcessInstances);
        })
        .finally(() => {
          if (isCurrentResolution()) {
            setSpinning(false);
          }
        });
    } else {
      const currentDateTime = formatDateTime(new Date());
      const newData = {
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': currentDateTime,
          },
          publicationAndOwnership: {
            'common:dataSetVersion': initVersion,
          },
        },
      };
      setInfoData({ ...newData, id: id });
      setJsonTg({});
      setProcessInstances([]);
      setSpinning(false);
    }

    return () => {
      if (isCurrentResolution()) {
        modelResolutionEpochRef.current += 1;
      }
    };
  }, [canonicalAppLocale, drawerVisible, id, lang, version]);

  useEffect(() => {
    nodes.forEach((node) => {
      updateNode(node.id ?? '', {
        tools: buildReadOnlyNodeTools(
          node?.size?.width ?? node?.width ?? 350,
          node?.data,
          node?.data?.quantitativeReference === '1',
        ),
      });
    });
  }, [nodeCount]);

  useEffect(
    () => () => {
      if (resizeToolRefreshTimerRef.current) {
        clearTimeout(resizeToolRefreshTimerRef.current);
      }
    },
    [],
  );

  const getShowResult = () => {
    const selectedNode = nodes.find((node) => node.selected);
    const processInstance = processInstances.find(
      (pi) => pi.id === selectedNode?.data?.id && pi.version === selectedNode?.data?.version,
    );
    return processInstance?.modelId ? (
      <LifeCycleModelView
        id={processInstance.modelId}
        version={selectedNode?.data?.version ?? ''}
        lang={lang}
        buttonType={'toolIcon'}
      />
    ) : (
      <ProcessView
        id={selectedNode?.data?.id ?? ''}
        version={selectedNode?.data?.version ?? ''}
        buttonType={'toolIcon'}
        lang={lang}
        disabled={!selectedNode}
      />
    );
  };

  const selectedEdge = edges.find((edge) => edge.selected);
  const quantitativeReferenceNode = nodes.find((node) => node?.data?.quantitativeReference === '1');

  return (
    <Space orientation='vertical' size={'middle'}>
      <ToolbarViewInfo
        lang={lang}
        data={infoData as FormLifeCycleModel & { id?: string; version?: string }}
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
        onData={() => {}}
      />
      {React.createElement('div', { style: { height: 8 } })}
      {/* <ProcessView
        id={id ?? ''}
        version={version ?? ''}
        lang={lang}
        buttonType={'toolResultIcon'}
        disabled={false}
      /> */}
      <ModelResult
        submodels={(jsonTg?.submodels ?? [])
          .filter((submodel) => submodel.type !== 'allocated')
          .map((submodel) => ({
            id: submodel.id,
            type: submodel.type,
            version: submodel.version ?? version,
          }))}
        resultingProcesses={
          infoData?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess
        }
        modelId={id}
        modelVersion={version}
        lang={lang}
        actionType='view'
      />
      <Control
        items={['zoomOut', 'zoomTo', 'zoomIn', 'zoomToFit', 'zoomToOrigin', 'autoLayoutLR']}
      />
      <Spin className='tg-fullscreen-spin' spinning={spinning} fullscreen />
      <IoPortView
        lang={lang}
        node={ioPortSelectorNode as LifeCycleModelGraphNode}
        direction={ioPortSelectorDirection}
        drawerVisible={ioPortSelectorDrawerVisible}
        onDrawerVisible={setIoPortSelectorDrawerVisible}
      />
      {/* <ConnectableProcesses
        lang={lang}
        drawerVisible={connectableProcessesDrawerVisible}
        setDrawerVisible={setConnectableProcessesDrawerVisible}
        portId={connectableProcessesPortId}
        flowVersion={connectableProcessesFlowVersion}
        readOnly={true}
      /> */}
    </Space>
  );
};

export default ToolbarView;
