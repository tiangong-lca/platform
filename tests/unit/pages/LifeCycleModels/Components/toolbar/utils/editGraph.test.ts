import {
  buildEditorNodeTools,
  buildEmptyCreateInfoData,
  buildLocalizedGraphNodeVisualUpdate,
  buildPortSelectionUpdate,
  buildProcessNodesFromDetails,
  buildSavePayload,
  buildUpdatedNodeReferencePayload,
  hydrateEditorEdges,
  hydrateEditorNodes,
  normalizePastedReferenceCells,
  reconcileHydratedEditorGraphForPersistence,
  resolveDeleteSelection,
  withoutEditorLayout,
} from '@/pages/LifeCycleModels/Components/toolbar/utils/editGraph';
import { SUPPORTED_CONTENT_LANGUAGES } from '@/services/general/contentLanguageRegistry';

const mockGetLangText = jest.fn();
const mockGenPortLabel = jest.fn();
const mockGenLifeCycleModelNodeName = jest.fn();
const mockGenProcessFromData = jest.fn();
const mockGenProcessNameJson = jest.fn();
const mockGetEdgeLabel = jest.fn();
const mockGetPortLabelWithAllocation = jest.fn();
const mockGetPortTextColor = jest.fn();
const mockGetPortTextStyle = jest.fn();
const mockNodeTitleTool = jest.fn();

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getLangText: (...args: any[]) => mockGetLangText(...args),
}));

jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genLifeCycleModelNodeName: (...args: any[]) => mockGenLifeCycleModelNodeName(...args),
  genPortLabel: (...args: any[]) => mockGenPortLabel(...args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
  genProcessNameJson: (...args: any[]) => mockGenProcessNameJson(...args),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/utils/edge', () => ({
  __esModule: true,
  getEdgeLabel: (...args: any[]) => mockGetEdgeLabel(...args),
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/utils/node', () => ({
  __esModule: true,
  getPortLabelWithAllocation: (...args: any[]) => mockGetPortLabelWithAllocation(...args),
  getPortTextColor: (...args: any[]) => mockGetPortTextColor(...args),
  getPortTextStyle: (...args: any[]) => mockGetPortTextStyle(...args),
  nodeTitleTool: (...args: any[]) => mockNodeTitleTool(...args),
}));

describe('toolbar/utils/editGraph', () => {
  const token = {
    colorPrimary: '#1677ff',
    colorTextDescription: '#999',
    colorText: '#111',
    colorBgBase: '#fafafa',
  } as any;
  const refTool = { id: 'ref' };
  const nonRefTool = { id: 'nonRef' };
  const inputFlowTool = { id: 'inputFlow' };
  const outputFlowTool = { id: 'outputFlow' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLangText.mockImplementation((textLang: any) => {
      if (typeof textLang === 'string') return textLang;
      if (Array.isArray(textLang)) return textLang.map((item) => item?.['#text'] ?? item).join('');
      return 'Flow Name';
    });
    mockGenPortLabel.mockImplementation(
      (label: string, lang: string, width: number) => `PORT:${label}:${lang}:${width}`,
    );
    mockGenLifeCycleModelNodeName.mockImplementation(
      (nodeData: any, lang: string) => `PROC:${lang}:${String(nodeData?.label)}`,
    );
    mockGenProcessNameJson.mockImplementation((label: any) => `PROC_JSON:${String(label)}`);
    mockGetEdgeLabel.mockImplementation(
      (_token: any, unbalanced: number, exchange: number) => `EDGE:${unbalanced}:${exchange}`,
    );
    mockGetPortLabelWithAllocation.mockImplementation(
      (label: string, allocations: any, direction: string) =>
        `${direction}:${allocations?.[0]?.allocatedFraction ?? allocations?.allocation?.['@allocatedFraction'] ?? '-'}:${label}`,
    );
    mockGetPortTextColor.mockImplementation((quantRef: boolean) =>
      quantRef ? 'primary' : 'default',
    );
    mockGetPortTextStyle.mockImplementation((quantRef: boolean) => (quantRef ? 'bold' : 'normal'));
    mockNodeTitleTool.mockImplementation((width: number, title: string) => ({
      id: 'nodeTitle',
      width,
      title,
    }));
  });

  it('builds editor node tools and normalizes pasted reference nodes only', () => {
    const tools = buildEditorNodeTools({
      isReference: true,
      nodeData: { label: 'Process A' },
      nodeWidth: 240,
      refTool,
      nonRefTool,
      inputFlowTool,
      outputFlowTool,
      token,
      lang: 'en',
      nodeTemplateWidth: 350,
    });

    expect(tools).toEqual([
      refTool,
      expect.objectContaining({ id: 'nodeTitle', width: 240, title: 'PROC:en:Process A' }),
      inputFlowTool,
      outputFlowTool,
    ]);
    expect(
      buildEditorNodeTools({
        isReference: false,
        nodeData: { label: 'Process B' },
        nodeWidth: 180,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
      })[0],
    ).toBe(nonRefTool);

    const buildNodeTools = jest.fn(() => ['normalized-tools']);
    const edgeCell = { isNode: () => false };
    const nonReferenceNode = {
      isNode: () => true,
      getData: () => ({ label: 'B', quantitativeReference: '0' }),
      setData: jest.fn(),
      addTools: jest.fn(),
      getSize: () => ({ width: 120 }),
    };
    const referenceNode = {
      isNode: () => true,
      getData: () => ({ label: 'A', quantitativeReference: '1' }),
      setData: jest.fn(),
      addTools: jest.fn(),
      getSize: () => ({ width: 0 }),
    };

    normalizePastedReferenceCells(
      [edgeCell as any, nonReferenceNode as any, referenceNode as any],
      buildNodeTools,
      350,
    );

    expect(buildNodeTools).toHaveBeenCalledWith(
      { label: 'A', quantitativeReference: '1' },
      350,
      false,
    );
    expect(referenceNode.setData).toHaveBeenCalledWith({
      label: 'A',
      quantitativeReference: '0',
    });
    expect(referenceNode.addTools).toHaveBeenCalledWith(['normalized-tools'], { reset: true });
    expect(nonReferenceNode.setData).not.toHaveBeenCalled();
    expect(nonReferenceNode.addTools).not.toHaveBeenCalled();
  });

  it('rebuilds registry-language visuals without returning topology or editor state', () => {
    const processLabels = {
      en: 'Process',
      zh: '过程',
      de: 'Prozess',
      fr: 'Procédé',
    } as const;
    const portLabels = {
      en: 'Electricity',
      zh: '电力',
      de: 'Strom',
      fr: 'Électricité',
    } as const;
    const asLocalizedText = (labels: Record<string, string>) =>
      Object.entries(labels).map(([language, text]) => ({
        '#text': text,
        '@xml:lang': language,
      }));
    mockGetLangText.mockImplementation((value: any[], language: string) => {
      return value.find((item) => item['@xml:lang'] === language)?.['#text'];
    });
    mockGenLifeCycleModelNodeName.mockImplementation((nodeData: any, language: string) => {
      return nodeData?.label.find((item: any) => item['@xml:lang'] === language)?.['#text'];
    });
    const node = {
      id: 'node-localized',
      x: 42,
      y: 84,
      selected: true,
      data: {
        label: asLocalizedText(processLabels),
        quantitativeReference: '1',
      },
      ports: {
        groups: { groupOutput: { position: 'absolute' } },
        items: [
          {
            id: 'OUTPUT:electricity',
            group: 'groupOutput',
            attrs: { text: { text: 'stale-label' } },
            data: { textLang: asLocalizedText(portLabels) },
          },
        ],
      },
      size: { width: 320, height: 100 },
    } as any;

    SUPPORTED_CONTENT_LANGUAGES.forEach((language) => {
      const visualUpdate = buildLocalizedGraphNodeVisualUpdate({
        node,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: language,
        nodeTemplateWidth: 350,
      });

      expect(visualUpdate).toEqual({
        ports: expect.objectContaining({
          groups: node.ports.groups,
          items: [
            expect.objectContaining({
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: `PORT:OUTPUT:-:${portLabels[language]}:${language}:320`,
                }),
              }),
            }),
          ],
        }),
        tools: [
          refTool,
          expect.objectContaining({ title: processLabels[language], width: 320 }),
          inputFlowTool,
          outputFlowTool,
        ],
      });
      expect(visualUpdate).not.toHaveProperty('data');
      expect(visualUpdate).not.toHaveProperty('selected');
      expect(visualUpdate).not.toHaveProperty('x');
      expect(visualUpdate).not.toHaveProperty('y');
    });

    expect(node).toEqual(expect.objectContaining({ x: 42, y: 84, selected: true }));
    expect(node.ports.items[0].attrs.text.text).toBe('stale-label');
  });

  it('resolves selected node and edge deletions, including connected edges', () => {
    expect(
      resolveDeleteSelection([{ id: 'node-1', selected: true }], [
        { id: 'edge-connected', source: { cell: 'node-1' } },
        { id: 'edge-selected', selected: true },
        { id: 'edge-other', target: { cell: 'node-9' } },
      ] as any),
    ).toEqual({
      selectedNodeIds: ['node-1'],
      selectedEdgeIds: expect.arrayContaining(['edge-connected', 'edge-selected']),
    });

    expect(resolveDeleteSelection([], [])).toEqual({
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });

    expect(
      resolveDeleteSelection([{ id: undefined, selected: true }], [
        { id: undefined, selected: true },
      ] as any),
    ).toEqual({
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });

    expect(
      resolveDeleteSelection([{ id: 'node-connected', selected: true }], [
        { id: undefined, source: { cell: 'node-connected' } },
      ] as any),
    ).toEqual({
      selectedNodeIds: ['node-connected'],
      selectedEdgeIds: [''],
    });
  });

  it('builds port selection updates for input and output directions and returns null without width', () => {
    expect(
      buildPortSelectionUpdate({
        selectedNode: { id: 'node-1' } as any,
        direction: 'Input',
        payload: { selectedRowData: [] },
        lang: 'en',
        token,
        portsTemplate: { groups: {}, items: [] },
      }),
    ).toBeNull();

    const inputUpdate = buildPortSelectionUpdate({
      selectedNode: {
        id: 'node-1',
        size: { width: 120, height: 80 },
        ports: {
          items: [
            {
              id: 'OUTPUT:existing',
              group: 'groupOutput',
              args: { y: 65 },
              attrs: { text: { text: 'old' } },
              data: { textLang: 'Existing', allocations: [{ allocatedFraction: '1' }] },
            },
          ],
        },
      } as any,
      direction: 'Input',
      payload: {
        selectedRowData: [
          {
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-input',
              '@version': '1.0',
              'common:shortDescription': '这是一个很长很长很长的中文名称',
            },
            allocations: [{ allocatedFraction: '0.5' }],
            quantitativeReference: true,
          },
        ],
      } as any,
      lang: 'zh',
      token,
      portsTemplate: { groups: { groupInput: {}, groupOutput: {} }, items: [] },
    });

    expect(inputUpdate).toEqual({
      ports: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'INPUT:flow-input',
            attrs: expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining('...'),
                title: 'INPUT:0.5:这是一个很长很长很长的中文名称',
              }),
            }),
          }),
          expect.objectContaining({
            id: 'OUTPUT:existing',
            args: expect.objectContaining({ y: 85 }),
          }),
        ]),
      }),
      width: 120,
      height: 100,
    });

    const outputUpdate = buildPortSelectionUpdate({
      selectedNode: {
        id: 'node-1',
        size: { width: 200, height: 80 },
        ports: {
          items: [
            {
              id: 'INPUT:existing',
              group: 'groupInput',
              args: { y: 65 },
              attrs: { text: {} },
              data: { textLang: 'Existing Input', allocations: [] },
            },
          ],
        },
      } as any,
      direction: 'Output',
      payload: {
        selectedRowData: [
          {
            referenceToFlowDataSet: [
              {
                '@refObjectId': 'flow-output',
                '@version': '2.0',
                'common:shortDescription': 'Output Name',
              },
            ],
            allocations: [{ allocatedFraction: '1' }],
            quantitativeReference: false,
          },
        ],
      } as any,
      lang: 'en',
      token,
      portsTemplate: { groups: { groupInput: {}, groupOutput: {} }, items: [] },
    });

    expect(outputUpdate?.ports.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'INPUT:existing' }),
        expect.objectContaining({
          id: 'OUTPUT:flow-output',
          args: expect.objectContaining({ x: '100%', y: 85 }),
        }),
      ]),
    );
  });

  it('builds process nodes from process details with first-node reference semantics', () => {
    mockGenProcessFromData
      .mockReturnValueOnce({
        exchanges: {
          exchange: [
            {
              quantitativeReference: true,
              exchangeDirection: 'OUTPUT',
              allocations: [{ allocatedFraction: '1' }],
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-a',
                '@version': '1.0',
                'common:shortDescription': 'Flow A',
              },
            },
          ],
        },
      })
      .mockReturnValueOnce({
        exchanges: {
          exchange: [
            {
              quantitativeReference: true,
              exchangeDirection: 'INPUT',
              allocations: [{ allocatedFraction: '0.25' }],
              referenceToFlowDataSet: [
                {
                  '@refObjectId': 'flow-b',
                  '@version': '2.0',
                  'common:shortDescription': 'Flow B',
                },
              ],
            },
          ],
        },
      });

    const createdIds = ['node-a', 'node-b'];
    const createId = jest.fn(() => createdIds.shift() as string);
    const nodes = buildProcessNodesFromDetails({
      details: [
        {
          id: 'proc-a',
          version: '1.0',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: 'Proc A',
                },
              },
            },
          },
        },
        {
          id: 'proc-b',
          version: '2.0',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: 'Proc B',
                },
              },
            },
          },
        },
      ] as any,
      nodeCount: 0,
      nodeTemplate: { width: 350, height: 80 } as any,
      portsTemplate: { groups: { groupInput: {}, groupOutput: {} } } as any,
      createId,
      refTool,
      nonRefTool,
      inputFlowTool,
      outputFlowTool,
      token,
      lang: 'en',
      nodeTemplateWidth: 350,
    });

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-a',
          data: expect.objectContaining({
            id: 'proc-a',
            quantitativeReference: '1',
            shortDescription: 'PROC_JSON:Proc A',
          }),
          tools: [
            expect.objectContaining({ id: 'nodeTitle', title: 'PROC:en:Proc A' }),
            refTool,
            inputFlowTool,
            outputFlowTool,
          ],
          ports: expect.objectContaining({
            items: [expect.objectContaining({ id: 'OUTPUT:flow-a' })],
          }),
        }),
        expect.objectContaining({
          id: 'node-b',
          data: expect.objectContaining({
            id: 'proc-b',
            quantitativeReference: '0',
          }),
          tools: [
            expect.objectContaining({ id: 'nodeTitle', title: 'PROC:en:Proc B' }),
            nonRefTool,
            inputFlowTool,
            outputFlowTool,
          ],
          ports: expect.objectContaining({
            items: [expect.objectContaining({ id: 'INPUT:flow-b' })],
          }),
        }),
      ]),
    );
  });

  it('builds updated node reference payloads for matched, unmatched, and malformed port ids', () => {
    mockGenProcessFromData.mockReturnValue({
      exchanges: {
        exchange: [
          {
            exchangeDirection: 'OUTPUT',
            quantitativeReference: true,
            allocations: [{ allocatedFraction: '1' }],
            referenceToFlowDataSet: {
              '@refObjectId': 'matched-flow',
              '@version': '3.0',
              'common:shortDescription': 'Matched Flow',
            },
          },
        ],
      },
    });

    const payload = buildUpdatedNodeReferencePayload({
      node: {
        data: {
          id: 'proc-1',
          version: '1.0',
          label: 'Old Label',
          quantitativeReference: '1',
        },
        ports: {
          items: [
            { id: 'OUTPUT:matched-flow', attrs: { text: {} }, data: {} },
            { id: 'broken', attrs: { text: {} }, data: {} },
          ],
        },
      } as any,
      result: {
        data: {
          version: '9.9',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: 'New Label',
                },
              },
            },
          },
        },
      } as any,
      refTool,
      nonRefTool,
      inputFlowTool,
      outputFlowTool,
      token,
      lang: 'en',
      nodeTemplateWidth: 350,
    });

    expect(payload).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'New Label',
          shortDescription: 'PROC_JSON:New Label',
          version: '9.9',
        }),
        tools: [refTool, expect.any(Object), inputFlowTool, outputFlowTool],
        ports: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'OUTPUT:matched-flow',
              data: expect.objectContaining({
                flowVersion: '3.0',
                quantitativeReference: true,
              }),
            }),
            expect.objectContaining({
              id: 'broken',
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: '-',
                  title: '-',
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('matches sparse exchange identifiers with fallback tokens', () => {
    mockGenProcessFromData.mockReturnValueOnce({
      exchanges: {
        exchange: [
          {
            quantitativeReference: false,
          },
        ],
      },
    });
    mockGetPortLabelWithAllocation.mockReturnValueOnce('MATCHED');

    const payload = buildUpdatedNodeReferencePayload({
      node: {
        data: { quantitativeReference: '0' },
        width: 210,
        ports: {
          items: [
            { id: undefined, attrs: { text: {} }, data: {} },
            { id: '-:-', attrs: { text: {} }, data: {} },
          ],
        },
      } as any,
      result: { data: {} } as any,
      refTool,
      nonRefTool,
      inputFlowTool,
      outputFlowTool,
      token,
      lang: 'en',
      nodeTemplateWidth: 350,
    });

    expect(payload.ports.items).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({
          text: expect.objectContaining({
            text: '-',
            title: '-',
          }),
        }),
      }),
      expect.objectContaining({
        id: '-:-',
        attrs: expect.objectContaining({
          text: expect.objectContaining({
            text: 'PORT:MATCHED:en:210',
            title: 'MATCHED',
          }),
        }),
      }),
    ]);

    mockGenProcessFromData.mockReturnValueOnce({});
    expect(
      buildUpdatedNodeReferencePayload({
        node: {
          data: { quantitativeReference: '0' },
        } as any,
        result: { data: {} } as any,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
      }),
    ).toEqual(
      expect.objectContaining({
        ports: expect.objectContaining({
          items: [],
        }),
      }),
    );
  });

  it('preserves existing instance identities across reordering and allocates a fresh index for a new node', () => {
    const survivors = [
      { id: 'second', data: { index: '2' } },
      { id: 'first', data: { index: '1' } },
    ];
    const storedNodes = [survivors[1], { id: 'removed', data: { index: '0' } }, survivors[0]];
    const newNode = { id: 'new', data: { index: '2' } };
    const payload = buildSavePayload({}, [...survivors, newNode], [], storedNodes);
    expect(payload.model.nodes.map((node) => [node.id, node.data.index])).toEqual([
      ['second', '2'],
      ['first', '1'],
      ['new', '3'],
    ]);
  });

  it('ignores node geometry and edge routing while detecting edited connections', () => {
    const model = {
      nodes: [{ id: 'node', x: 1 }],
      edges: [{ id: 'edge', source: { cell: 'node' }, vertices: [{ x: 1, y: 2 }] }],
    };
    const moved = {
      nodes: [{ id: 'node', x: 9 }],
      edges: [{ id: 'edge', source: { cell: 'node' }, vertices: [{ x: 5, y: 6 }] }],
    };
    expect(withoutEditorLayout({ model })).toBe(withoutEditorLayout({ model: moved }));
    moved.edges[0].source.cell = 'other';
    expect(withoutEditorLayout({ model })).not.toBe(withoutEditorLayout({ model: moved }));
  });

  it('builds persisted save payloads, hydrates editor graph data, and creates empty defaults', () => {
    const savePayload = buildSavePayload(
      { foo: 'bar' } as any,
      [
        { id: 'node-1', data: { label: 'A' }, selected: true },
        { id: 'node-2', data: { label: 'B' } },
      ] as any,
      [
        { id: 'edge-1', target: { cell: 'node-1', x: 10, y: 20 }, selected: true },
        { id: 'edge-2' },
      ] as any,
    );

    expect(savePayload).toEqual({
      foo: 'bar',
      model: {
        nodes: [
          { id: 'node-1', data: { label: 'A', index: '0' } },
          { id: 'node-2', data: { label: 'B', index: '1' } },
        ],
        edges: [{ id: 'edge-1', target: { cell: 'node-1' } }, { id: 'edge-2' }],
      },
    });

    const hydratedNodes = hydrateEditorNodes({
      nodes: [
        {
          id: 'node-ref',
          width: 320,
          data: { label: 'Ref Node', quantitativeReference: '1' },
          ports: {
            items: [
              {
                id: 'OUTPUT:flow-ref',
                group: 'groupOutput',
                attrs: { text: { text: 'old' } },
                data: { textLang: 'Ref Flow', allocations: [{ allocatedFraction: '1' }] },
              },
            ],
          },
        },
      ] as any,
      refTool,
      nonRefTool,
      inputFlowTool,
      outputFlowTool,
      token,
      lang: 'en',
      nodeTemplateWidth: 350,
      nodeAttrs: { body: { stroke: '#1677ff' } },
      portsGroups: { groupInput: {}, groupOutput: {} },
    });

    expect(hydratedNodes).toEqual([
      expect.objectContaining({
        selected: false,
        attrs: { body: { stroke: '#1677ff' } },
        ports: expect.objectContaining({
          groups: { groupInput: {}, groupOutput: {} },
          items: [
            expect.objectContaining({
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: 'PORT:OUTPUT:1:Ref Flow:en:320',
                }),
              }),
            }),
          ],
        }),
        tools: [refTool, expect.any(Object), inputFlowTool, outputFlowTool],
      }),
    ]);

    expect(
      hydrateEditorEdges(
        [
          {
            id: 'edge-1',
            target: { cell: 'node-ref', x: 10, y: 20 },
            data: { connection: { unbalancedAmount: 1, exchangeAmount: 2 } },
          },
          {
            id: 'edge-2',
            data: { connection: { unbalancedAmount: 0, exchangeAmount: 0 } },
          },
        ] as any,
        token,
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'edge-1',
        selected: false,
        attrs: {
          line: {
            stroke: '#1677ff',
            strokeWidth: 1,
          },
        },
        target: { cell: 'node-ref' },
        labels: ['EDGE:1:2'],
      }),
      expect.objectContaining({
        id: 'edge-2',
        selected: false,
      }),
    ]);

    expect(
      buildEmptyCreateInfoData({
        currentDateTime: '2024-01-01 00:00',
        initVersion: '1.0',
        defaultPermanentDataSetURI: 'Automatically generated',
        id: 'model-1',
        version: '1.0',
      }),
    ).toEqual({
      modellingAndValidation: {
        complianceDeclarations: {},
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': '2024-01-01 00:00',
        },
        publicationAndOwnership: {
          'common:dataSetVersion': '1.0',
          'common:permanentDataSetURI': 'Automatically generated',
        },
      },
      id: 'model-1',
      version: '1.0',
    });
  });

  it('restores untouched compatibility and editor hydration before persistence', () => {
    const storedGraph = {
      nodes: [
        {
          id: 'node-a',
          selected: true,
          size: { width: 350, height: 80 },
          data: { id: 'process-a', version: '01.00.000' },
        },
        {
          height: 80,
          data: { id: 'process-b', version: '01.00.000' },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          selected: true,
          source: { cell: 'node-a' },
          target: { cell: 'node-b', x: 10, y: 20 },
          data: { connection: { outputExchange: { '@flowUUID': 'flow-a' } } },
        },
        {
          data: { connection: { outputExchange: { '@flowUUID': 'flow-b' } } },
        },
      ],
    } as any;
    const hydratedGraph = {
      nodes: [
        {
          id: 'node-a',
          selected: false,
          size: { width: 350, height: 100 },
          attrs: { body: { stroke: '#1677ff' } },
          tools: [{ id: 'ref' }],
          data: {
            id: 'process-a',
            version: '01.00.000',
            index: '0',
            label: [{ '@xml:lang': 'en', '#text': 'Process A' }],
            quantitativeReference: '1',
          },
          ports: {
            groups: { groupOutput: {} },
            items: [
              {
                id: 'OUTPUT:flow-a',
                group: 'groupOutput',
                attrs: { text: { text: 'Flow A' } },
                data: { flowId: 'flow-a' },
              },
            ],
          },
        },
        {
          selected: false,
          height: 100,
          attrs: { body: { stroke: '#1677ff' } },
          tools: [{ id: 'nonRef' }],
          data: {
            id: 'process-b',
            version: '01.00.000',
            index: '1',
            label: [{ '@xml:lang': 'en', '#text': 'Process B' }],
            quantitativeReference: '0',
          },
          ports: { groups: { groupInput: {} }, items: [] },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          selected: false,
          source: { cell: 'node-a', port: 'OUTPUT:flow-a' },
          target: { cell: 'node-b', port: 'INPUT:flow-a' },
          attrs: { line: { stroke: '#1677ff' } },
          labels: ['calculated-label'],
          data: { connection: { outputExchange: { '@flowUUID': 'flow-a' } } },
        },
        {
          selected: false,
          source: {},
          target: {},
          attrs: { line: { stroke: '#1677ff' } },
          labels: ['calculated-label'],
          data: { connection: { outputExchange: { '@flowUUID': 'flow-b' } } },
        },
      ],
    } as any;
    const currentGraph = buildSavePayload(
      {} as any,
      hydratedGraph.nodes,
      hydratedGraph.edges,
    ).model;
    const originalStored = JSON.parse(JSON.stringify(storedGraph));
    const originalHydrated = JSON.parse(JSON.stringify(hydratedGraph));
    const originalCurrent = JSON.parse(JSON.stringify(currentGraph));

    expect(
      reconcileHydratedEditorGraphForPersistence(currentGraph, {
        storedGraph,
        hydratedGraph,
      }),
    ).toEqual({
      nodes: [
        {
          id: 'node-a',
          size: { width: 350, height: 80 },
          data: { id: 'process-a', version: '01.00.000' },
        },
        {
          height: 80,
          data: { id: 'process-b', version: '01.00.000' },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
          data: { connection: { outputExchange: { '@flowUUID': 'flow-a' } } },
        },
        {
          data: { connection: { outputExchange: { '@flowUUID': 'flow-b' } } },
        },
      ],
    });
    expect(storedGraph).toEqual(originalStored);
    expect(hydratedGraph).toEqual(originalHydrated);
    expect(currentGraph).toEqual(originalCurrent);
  });

  it('keeps intentional graph edits and graph cells added after hydration', () => {
    const storedGraph = {
      nodes: [
        {
          id: 'node-a',
          size: { width: 350, height: 80 },
          data: { id: 'process-a', version: '01.00.000' },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
        },
      ],
    } as any;
    const hydratedGraph = {
      nodes: [
        {
          id: 'node-a',
          selected: false,
          size: { width: 350, height: 100 },
          attrs: { body: { stroke: '#1677ff' } },
          tools: [{ id: 'ref' }],
          data: {
            id: 'process-a',
            version: '01.00.000',
            index: '0',
            label: 'Hydrated name',
            quantitativeReference: '1',
          },
          ports: {
            items: [
              {
                id: 'OUTPUT:flow-a',
                group: 'groupOutput',
                data: { flowId: 'flow-a' },
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          selected: false,
          source: { cell: 'node-a', port: 'OUTPUT:flow-a' },
          target: { cell: 'node-b', port: 'INPUT:flow-a' },
          attrs: { line: { stroke: '#1677ff' } },
          labels: ['calculated-label'],
        },
      ],
    } as any;
    const currentGraph = {
      nodes: [
        {
          ...hydratedGraph.nodes[0],
          selected: undefined,
          x: 420,
          size: { width: 350, height: 140 },
          data: {
            ...hydratedGraph.nodes[0].data,
            index: '0',
            label: 'Renamed process',
            quantitativeReference: '0',
          },
          ports: {
            items: [
              ...hydratedGraph.nodes[0].ports.items,
              {
                id: 'INPUT:flow-b',
                group: 'groupInput',
                data: { flowId: 'flow-b' },
              },
            ],
          },
        },
        {
          id: 'node-new',
          data: { id: 'process-new', version: '01.00.000', index: '1' },
        },
        {
          data: { id: 'process-new-without-cell-id', version: '01.00.000', index: '2' },
        },
      ],
      edges: [
        {
          ...hydratedGraph.edges[0],
          selected: undefined,
          source: { cell: 'node-a', port: 'OUTPUT:manual-flow' },
        },
        {
          id: 'edge-new',
          source: { cell: 'node-new' },
          target: { cell: 'node-a' },
        },
        {
          source: { cell: 'node-new' },
          target: { cell: 'node-a' },
        },
      ],
    } as any;

    const result = reconcileHydratedEditorGraphForPersistence(currentGraph, {
      storedGraph,
      hydratedGraph,
    });

    expect(result.nodes[0]).toEqual(
      expect.objectContaining({
        id: 'node-a',
        x: 420,
        size: { width: 350, height: 140 },
        data: expect.objectContaining({
          label: 'Renamed process',
          quantitativeReference: '0',
        }),
        ports: expect.objectContaining({
          items: expect.arrayContaining([expect.objectContaining({ id: 'INPUT:flow-b' })]),
        }),
      }),
    );
    expect(result.nodes[0]).not.toHaveProperty('attrs');
    expect(result.nodes[0]).not.toHaveProperty('tools');
    expect(result.nodes[1]).toBe(currentGraph.nodes[1]);
    expect(result.nodes[2]).toBe(currentGraph.nodes[2]);
    expect(result.edges[0]).toEqual(
      expect.objectContaining({
        source: { cell: 'node-a', port: 'OUTPUT:manual-flow' },
        target: { cell: 'node-b' },
      }),
    );
    expect(result.edges[0]).not.toHaveProperty('attrs');
    expect(result.edges[0]).not.toHaveProperty('labels');
    expect(result.edges[1]).toBe(currentGraph.edges[1]);
    expect(result.edges[2]).toBe(currentGraph.edges[2]);
  });

  it('covers fallback branches for missing optional data in helper transforms', () => {
    mockGenProcessFromData.mockReturnValueOnce({}).mockReturnValueOnce({
      exchanges: {
        exchange: [
          {
            exchangeDirection: 'INPUT',
            quantitativeReference: false,
            allocations: [],
            referenceToFlowDataSet: [
              {
                '@refObjectId': 'array-flow',
                '@version': '1.5',
                'common:shortDescription': 'Array Flow',
              },
            ],
          },
        ],
      },
    });

    expect(
      resolveDeleteSelection([{ id: 'node-1', selected: true }], [
        { id: 'edge-target', target: { cell: 'node-1' } },
      ] as any),
    ).toEqual({
      selectedNodeIds: ['node-1'],
      selectedEdgeIds: ['edge-target'],
    });

    expect(
      buildPortSelectionUpdate({
        selectedNode: {
          id: 'node-1',
          size: { width: 200, height: 80 },
        } as any,
        direction: 'Output',
        payload: {} as any,
        lang: 'en',
        token,
        portsTemplate: { groups: { groupInput: {}, groupOutput: {} }, items: [] },
      }),
    ).toEqual({
      ports: {
        groups: { groupInput: {}, groupOutput: {} },
        items: [],
      },
      width: 200,
      height: 60,
    });

    expect(
      buildProcessNodesFromDetails({
        details: [{ id: 'proc-empty', json: {} }] as any,
        nodeCount: 1,
        nodeTemplate: { width: 300 } as any,
        portsTemplate: { groups: { groupInput: {}, groupOutput: {} } } as any,
        createId: () => 'node-empty',
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 300,
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'node-empty',
        data: expect.objectContaining({
          shortDescription: 'PROC_JSON:[object Object]',
          quantitativeReference: '0',
        }),
        ports: expect.objectContaining({
          items: [expect.objectContaining({ id: 'OUTPUT:-' })],
        }),
        tools: [
          expect.objectContaining({ id: 'nodeTitle', title: 'PROC:en:[object Object]' }),
          nonRefTool,
          inputFlowTool,
          outputFlowTool,
        ],
      }),
    ]);

    expect(
      buildUpdatedNodeReferencePayload({
        node: {
          data: { label: 'Old', quantitativeReference: '0' },
          ports: {
            items: [{ id: 'INPUT:array-flow', attrs: {}, data: {} }],
          },
          size: { width: 200, height: 80 },
        } as any,
        result: {
          data: {
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: {},
                  },
                },
              },
            },
          },
        } as any,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
      }),
    ).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          shortDescription: 'PROC_JSON:[object Object]',
          version: '',
        }),
        tools: [nonRefTool, expect.any(Object), inputFlowTool, outputFlowTool],
        ports: expect.objectContaining({
          items: [
            expect.objectContaining({
              id: 'INPUT:array-flow',
              data: expect.objectContaining({
                flowVersion: '1.5',
                quantitativeReference: false,
              }),
            }),
          ],
        }),
      }),
    );

    expect(buildSavePayload(undefined as any, [] as any, [{ id: 'edge-1' }] as any)).toEqual({
      model: {
        nodes: [],
        edges: [{ id: 'edge-1' }],
      },
    });

    expect(
      hydrateEditorNodes({
        nodes: [
          {
            id: 'node-non-ref',
            size: { width: 210, height: 80 },
            data: { label: 'Non Ref', quantitativeReference: '0' },
          },
        ] as any,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
        nodeAttrs: { body: { stroke: '#999' } },
        portsGroups: { groupInput: {}, groupOutput: {} },
      }),
    ).toEqual([
      expect.objectContaining({
        tools: [nonRefTool, expect.any(Object), inputFlowTool, outputFlowTool],
        ports: {
          groups: { groupInput: {}, groupOutput: {} },
          items: [],
        },
      }),
    ]);
  });

  it('covers nullish fallbacks in display and title builders', () => {
    mockGenLifeCycleModelNodeName.mockReturnValueOnce(undefined);
    expect(
      buildEditorNodeTools({
        isReference: false,
        nodeData: undefined,
        nodeWidth: 160,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
      })[1],
    ).toEqual(expect.objectContaining({ title: '' }));

    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce('');
    expect(
      hydrateEditorNodes({
        nodes: [
          {
            id: 'node-display-fallback',
            width: 180,
            data: { label: 'Display Fallback', quantitativeReference: '0' },
            ports: {
              items: [
                {
                  id: 'INPUT:flow-display',
                  group: 'groupInput',
                  data: {},
                },
              ],
            },
          },
        ] as any,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 350,
        nodeAttrs: { body: { stroke: '#333' } },
        portsGroups: { groupInput: {}, groupOutput: {} },
      }),
    ).toEqual([
      expect.objectContaining({
        ports: expect.objectContaining({
          items: [
            expect.objectContaining({
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: 'PORT::en:180',
                  title: '',
                }),
              }),
            }),
          ],
        }),
      }),
    ]);

    const defaultWidthNode = {
      isNode: () => true,
      getData: () => ({ label: 'Fallback Width', quantitativeReference: '1' }),
      setData: jest.fn(),
      addTools: jest.fn(),
      getSize: () => ({ width: 0 }),
    };
    const buildNodeTools = jest.fn(() => ['fallback-tools']);
    normalizePastedReferenceCells([defaultWidthNode as any], buildNodeTools, 0);
    expect(buildNodeTools).toHaveBeenCalledWith(
      { label: 'Fallback Width', quantitativeReference: '1' },
      350,
      false,
    );

    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce('');
    expect(
      buildPortSelectionUpdate({
        selectedNode: {
          id: 'node-port-fallback',
          size: { width: 180, height: 80 },
        } as any,
        direction: 'Output',
        payload: {
          selectedRowData: [
            {
              referenceToFlowDataSet: {},
              quantitativeReference: false,
            },
          ],
        } as any,
        lang: 'en',
        token,
        portsTemplate: { groups: { groupInput: {}, groupOutput: {} }, items: [] },
      }),
    ).toEqual({
      ports: expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'OUTPUT:-',
            attrs: expect.objectContaining({
              text: expect.objectContaining({
                text: '',
                title: '',
              }),
            }),
          }),
        ],
      }),
      width: 180,
      height: 80,
    });

    mockGenProcessFromData.mockReturnValueOnce({ exchanges: { exchange: [] } });
    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce('');
    mockGenLifeCycleModelNodeName.mockReturnValueOnce(undefined);
    expect(
      buildProcessNodesFromDetails({
        details: [{ id: 'proc-fallback', json: {} }] as any,
        nodeCount: 2,
        nodeTemplate: {} as any,
        portsTemplate: { groups: { groupInput: {}, groupOutput: {} } } as any,
        createId: () => 'node-fallback',
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 200,
      })[0],
    ).toEqual(
      expect.objectContaining({
        tools: [expect.objectContaining({ title: '' }), nonRefTool, inputFlowTool, outputFlowTool],
        ports: expect.objectContaining({
          items: [
            expect.objectContaining({
              id: 'OUTPUT:-',
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: 'PORT::en:350',
                  title: '',
                }),
              }),
            }),
          ],
        }),
      }),
    );

    mockGenProcessFromData.mockReturnValueOnce({
      exchanges: {
        exchange: [
          {
            exchangeDirection: 'INPUT',
            quantitativeReference: false,
            allocations: [],
            referenceToFlowDataSet: {
              '@refObjectId': 'fallback-flow',
            },
          },
        ],
      },
    });
    mockGetLangText.mockReturnValueOnce(undefined);
    mockGetPortLabelWithAllocation.mockReturnValueOnce('');
    expect(
      buildUpdatedNodeReferencePayload({
        node: {
          data: { quantitativeReference: '0' },
          width: 220,
          ports: {
            items: [{ id: 'INPUT:fallback-flow', attrs: { text: {} }, data: {} }],
          },
        } as any,
        result: { data: { json: { processDataSet: {} } } } as any,
        refTool,
        nonRefTool,
        inputFlowTool,
        outputFlowTool,
        token,
        lang: 'en',
        nodeTemplateWidth: 200,
      }),
    ).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          shortDescription: 'PROC_JSON:[object Object]',
          version: '',
        }),
        ports: expect.objectContaining({
          items: [
            expect.objectContaining({
              id: 'INPUT:fallback-flow',
              attrs: expect.objectContaining({
                text: expect.objectContaining({
                  text: 'PORT::en:220',
                  title: '',
                }),
              }),
            }),
          ],
        }),
      }),
    );
  });
});
