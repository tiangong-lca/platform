/**
 * Integration tests for the matrix-based genLifeCycleModelProcesses
 * Path: src/services/lifeCycleModels/util_calculate.ts
 *
 * zh-CN: 浏览器本地矩阵计算的集成测试。数值正确性由 matrixSolveFixtures.test.ts
 * 的黄金案例覆盖；这里验证 保存外壳集成：exact Process 查询、主/副子模型组装、
 * 副产品 ID 复用、倍率回写、边数值与错误映射。
 */

import { writeFileSync } from 'node:fs';
import { genProcessJsonOrdered } from '@/services/processes/util';
import { getSharedMatrixCalculationClient } from '@/services/lifeCycleModels/matrixCalculation/workerClient';
import { CalculationOperation } from '@/services/lifeCycleModels/matrixCalculation/types';
import { genLifeCycleModelProcesses } from '@/services/lifeCycleModels/util_calculate';

jest.mock('@/services/supabase', () => {
  const mockOr = jest.fn();
  const mockSelect = jest.fn(() => ({ or: mockOr }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));

  return {
    supabase: {
      from: mockFrom,
    },
    __mock: {
      mockOr,
      mockSelect,
      mockFrom,
    },
  };
});

const {
  __mock: { mockOr, mockSelect, mockFrom },
} = jest.requireMock('@/services/supabase') as {
  __mock: {
    mockOr: jest.Mock;
    mockSelect: jest.Mock;
    mockFrom: jest.Mock;
  };
};

jest.mock('@/services/lciaMethods/util', () => ({
  __esModule: true,
  default: jest.fn(),
  LCIAResultCalculationWithEvidence: async (...args: unknown[]) => {
    const calculate = jest.requireMock('@/services/lciaMethods/util').default;
    return { results: await calculate(...args), report: { schema_version: 'test-report' } };
  },
}));

jest.mock('@/services/lciaMethods/evidence', () => ({
  __esModule: true,
  ...jest.requireActual('@/services/lciaMethods/evidence'),
  serializeStaticLciaReport: (report: unknown) => ({ 'tg:testEvidence': report }),
}));

jest.mock('uuid', () => ({
  __esModule: true,
  v4: jest.fn(() => 'generated-secondary-id'),
}));

const mockLCIAResultCalculation = jest.requireMock('@/services/lciaMethods/util')
  .default as jest.Mock;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createLifeCycleModelData = () => ({
  lifeCycleModelDataSet: {
    lifeCycleModelInformation: {
      quantitativeReference: {
        referenceToReferenceProcess: 'nodeA',
      },
      dataSetInformation: {
        name: {
          baseName: [
            { '@xml:lang': 'en', '#text': 'Reference Process' },
            { '@xml:lang': 'zh', '#text': '参考过程' },
          ],
        },
      },
      technology: {
        processes: {
          processInstance: [
            {
              '@dataSetInternalID': 'nodeA',
              referenceToProcess: {
                '@refObjectId': 'procA',
                '@version': '1',
                'common:shortDescription': [
                  { '@xml:lang': 'en', '#text': 'Process A' },
                  { '@xml:lang': 'zh', '#text': '过程A' },
                ],
              },
              connections: {
                outputExchange: [
                  {
                    '@flowUUID': 'flow-A-final',
                    downstreamProcess: [],
                  },
                ],
              },
            },
            {
              '@dataSetInternalID': 'nodeB',
              referenceToProcess: {
                '@refObjectId': 'procB',
                '@version': '1',
                'common:shortDescription': [
                  { '@xml:lang': 'en', '#text': 'Process B' },
                  { '@xml:lang': 'zh', '#text': '过程B' },
                ],
              },
              connections: {
                outputExchange: [
                  {
                    '@flowUUID': 'flow-B-to-A',
                    downstreamProcess: {
                      '@id': 'nodeA',
                    },
                  },
                  {
                    '@flowUUID': 'flow-B-to-C',
                    downstreamProcess: {
                      '@id': 'nodeC',
                    },
                  },
                ],
              },
            },
            {
              '@dataSetInternalID': 'nodeC',
              referenceToProcess: {
                '@refObjectId': 'procC',
                '@version': '1',
                'common:shortDescription': [
                  { '@xml:lang': 'en', '#text': 'Process C' },
                  { '@xml:lang': 'zh', '#text': '过程C' },
                ],
              },
              connections: {
                outputExchange: {
                  '@flowUUID': 'flow-C-final',
                  downstreamProcess: [],
                },
              },
            },
          ],
        },
      },
    },
  },
});

const createSupabaseProcesses = () => [
  {
    id: 'procA',
    version: '1',
    exchange: [
      {
        '@dataSetInternalID': 'exA_in',
        exchangeDirection: 'INPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-B-to-A',
        },
        meanAmount: '2',
        resultingAmount: '2',
      },
      {
        '@dataSetInternalID': 'exA_out',
        exchangeDirection: 'OUTPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-A-final',
          'common:shortDescription': [
            { '@xml:lang': 'en', '#text': 'A final' },
            { '@xml:lang': 'zh', '#text': 'A终' },
          ],
        },
        meanAmount: '5',
        resultingAmount: '5',
      },
    ],
    quantitativeReference: {
      referenceToReferenceFlow: 'exA_out',
    },
  },
  {
    id: 'procB',
    version: '1',
    exchange: [
      {
        '@dataSetInternalID': 'exB_out_toA',
        exchangeDirection: 'OUTPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-B-to-A',
        },
        meanAmount: '3',
        resultingAmount: '3',
        allocations: {
          allocation: {
            '@allocatedFraction': '60%',
          },
        },
      },
      {
        '@dataSetInternalID': 'exB_out_toC',
        exchangeDirection: 'OUTPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-B-to-C',
        },
        meanAmount: '4',
        resultingAmount: '4',
        allocations: {
          allocation: {
            '@allocatedFraction': '40%',
          },
        },
      },
      {
        '@dataSetInternalID': 'exB_in',
        exchangeDirection: 'INPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-raw',
        },
        meanAmount: '7',
        resultingAmount: '7',
      },
    ],
    quantitativeReference: {
      referenceToReferenceFlow: 'exB_out_toA',
    },
  },
  {
    id: 'procC',
    version: '1',
    exchange: [
      {
        '@dataSetInternalID': 'exC_in',
        exchangeDirection: 'INPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-B-to-C',
        },
        meanAmount: '1',
        resultingAmount: '1',
      },
      {
        '@dataSetInternalID': 'exC_out',
        exchangeDirection: 'OUTPUT',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-C-final',
          'common:shortDescription': [
            { '@xml:lang': 'en', '#text': 'C Product' },
            { '@xml:lang': 'zh', '#text': 'C产品' },
          ],
        },
        meanAmount: '1',
        resultingAmount: '1',
      },
    ],
    quantitativeReference: {
      referenceToReferenceFlow: 'exC_out',
    },
  },
];

const createIndexedModelNodes = () => [
  {
    id: 'graph-node-a',
    data: {
      index: 'nodeA',
      quantitativeReference: '1',
      targetAmount: 10,
    },
  },
  {
    id: 'graph-node-b',
    data: {
      index: 'nodeB',
    },
  },
  {
    id: 'graph-node-c',
    data: {
      index: 'nodeC',
    },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockImplementation(() => ({ or: mockOr }));
  mockFrom.mockImplementation(() => ({ select: mockSelect }));
});

describe('genLifeCycleModelProcesses (matrix calculation)', () => {
  it('throws the calculation INVALID_REFERENCE error when the reference process is missing', async () => {
    await expect(genLifeCycleModelProcesses('model-1', null, {}, [])).rejects.toMatchObject({
      code: 'INVALID_REFERENCE',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws INVALID_REFERENCE when the reference process cannot be found in the database', async () => {
    const data = createLifeCycleModelData();
    mockOr.mockResolvedValue({ data: [] });

    await expect(
      genLifeCycleModelProcesses('model-2', createIndexedModelNodes() as any, data, []),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(mockSelect).toHaveBeenCalledWith(
      expect.stringContaining('json->processDataSet->processInformation->quantitativeReference'),
    );
  });

  it('returns INVALID_REFERENCE when supabase omits the data payload', async () => {
    mockOr.mockResolvedValue({});

    await expect(
      genLifeCycleModelProcesses(
        'model-missing-payload',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });
    expect(mockFrom).toHaveBeenCalledWith('processes');
  });

  it('throws INVALID_TARGET_AMOUNT when the target amount is missing or non-positive', async () => {
    const data = createLifeCycleModelData();
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });

    await expect(
      genLifeCycleModelProcesses(
        'model-target-missing',
        [{ id: 'graph-node-a', data: { index: 'nodeA', quantitativeReference: '1' } }] as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TARGET_AMOUNT' });

    await expect(
      genLifeCycleModelProcesses(
        'model-target-zero',
        [
          {
            id: 'graph-node-a',
            data: { index: 'nodeA', quantitativeReference: '1', targetAmount: 0 },
          },
        ] as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TARGET_AMOUNT' });
  });

  it('generates primary and secondary process payloads, writes multipliers and reuses existing secondary id', async () => {
    const data = createLifeCycleModelData();
    data.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.name.baseName.push(
      { '@xml:lang': 'de', '#text': 'Referenzprozess' },
      { '@xml:lang': 'fr', '#text': 'Processus de référence' },
    );
    const databaseProcesses = createSupabaseProcesses();
    const secondaryReferenceFlow = databaseProcesses[2].exchange[1].referenceToFlowDataSet as any;
    secondaryReferenceFlow['common:shortDescription'].push(
      { '@xml:lang': 'de', '#text': 'C-Produkt' },
      { '@xml:lang': 'fr', '#text': 'Produit C' },
    );
    mockOr.mockResolvedValue({ data: clone(databaseProcesses) });

    mockLCIAResultCalculation
      .mockResolvedValueOnce([{ '@id': 'LCIA_PRIMARY' }])
      .mockResolvedValueOnce([{ '@id': 'LCIA_SECONDARY' }]);

    const oldSubmodels = [
      {
        id: 'existing-secondary',
        type: 'secondary',
        finalId: {
          nodeId: 'nodeC',
          processId: 'procC',
          allocatedExchangeFlowId: 'flow-C-final',
          allocatedExchangeDirection: 'OUTPUT',
        },
      },
    ];

    const { lifeCycleModelProcesses, up2DownEdges, lciaIncomplete } =
      await genLifeCycleModelProcesses(
        'model-123',
        createIndexedModelNodes() as any,
        data,
        oldSubmodels,
      );

    expect(lciaIncomplete).toBe(false);
    expect(lifeCycleModelProcesses).toHaveLength(4);

    const primary = lifeCycleModelProcesses.find((item) => item?.modelInfo?.type === 'primary');
    const secondary = lifeCycleModelProcesses.find((item) => item?.modelInfo?.type === 'secondary');

    expect(primary).toBeDefined();
    expect(primary?.option).toBe('create');
    expect(primary?.modelInfo?.id).toBe('model-123');

    const primaryRefExchange = primary?.data?.processDataSet?.exchanges?.exchange?.find(
      (exchange: any) => exchange?.quantitativeReference,
    );
    // 求解成功后的参考交换满足目标量
    expect(primaryRefExchange?.meanAmount).toBe(10);

    // 主模型边界：B 的 A 产品归因原料 7 × 0.6 / 3 × 4 = 5.6
    const primaryRaw = primary?.data?.processDataSet?.exchanges?.exchange?.find(
      (exchange: any) => exchange?.referenceToFlowDataSet?.['@refObjectId'] === 'flow-raw',
    );
    expect(Number(primaryRaw?.meanAmount)).toBeCloseTo(5.6, 9);

    expect(secondary).toBeDefined();
    expect(secondary?.option).toBe('update');
    expect(secondary?.modelInfo?.id).toBe('existing-secondary');
    expect(secondary?.modelInfo?.finalId?.allocatedExchangeFlowId).toBe('flow-C-final');
    const secondaryBaseName =
      secondary?.data?.processDataSet?.processInformation?.dataSetInformation?.name?.baseName;
    expect(secondaryBaseName?.map((item: any) => item['@xml:lang'])).toEqual([
      'en',
      'zh',
      'de',
      'fr',
    ]);
    expect(secondaryBaseName).toEqual([
      { '@xml:lang': 'en', '#text': '[Subproduct: C Product] Reference Process' },
      { '@xml:lang': 'zh', '#text': '[子产品: C产品] 参考过程' },
      { '@xml:lang': 'de', '#text': '[Nebenprodukt: C-Produkt] Referenzprozess' },
      { '@xml:lang': 'fr', '#text': '[Sous-produit : Produit C] Processus de référence' },
    ]);

    // 副情景以 C 的参考量 1 为需求，原料负荷为 7 × 0.4 / 4。
    const secondaryExchanges = secondary?.data?.processDataSet?.exchanges?.exchange ?? [];
    const secondaryFinal = secondaryExchanges.find(
      (exchange: any) => exchange?.referenceToFlowDataSet?.['@refObjectId'] === 'flow-C-final',
    );
    expect(Number(secondaryFinal?.meanAmount)).toBeCloseTo(1, 9);
    const secondaryRaw = secondaryExchanges.find(
      (exchange: any) => exchange?.referenceToFlowDataSet?.['@refObjectId'] === 'flow-raw',
    );
    expect(Number(secondaryRaw?.meanAmount)).toBeCloseTo(0.7, 9);

    for (const generated of lifeCycleModelProcesses) {
      const entries = generated.data.processDataSet.exchanges.exchange;
      const exchanges = Array.isArray(entries) ? entries : [entries];
      exchanges.forEach((entry: any) => expect(entry.allocations).toBeUndefined());
    }

    expect(mockLCIAResultCalculation).toHaveBeenCalledTimes(2);

    // 标准实例引用单位产品清单：A 倍率 2，B 的第一产品需求 4，C 主情景活动为 0。
    const processInstance =
      data.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes.processInstance;
    const multiplierByIndex = new Map(
      (processInstance as any[]).map((instance: any) => [
        instance['@dataSetInternalID'] as string,
        instance['@multiplicationFactor'] as string,
      ]),
    );
    expect(multiplierByIndex.get('nodeA')).toBe('2');
    expect(Number(multiplierByIndex.get('nodeB'))).toBeCloseTo(4, 9);
    expect(Number(multiplierByIndex.get('nodeC'))).toBe(0);

    // 边数值：成功求解下全部平衡
    const edgeByFlow = new Map(up2DownEdges.map((edge) => [edge.flowUUID, edge]));
    expect(edgeByFlow.get('flow-B-to-A')?.exchangeAmount).toBeCloseTo(4, 9);
    expect(edgeByFlow.get('flow-B-to-A')?.isBalanced).toBe(true);
    expect(edgeByFlow.get('flow-B-to-C')?.exchangeAmount).toBe(0);
    expect(edgeByFlow.get('flow-B-to-C')?.upstreamNodeId).toBe('graph-node-b');
    expect(edgeByFlow.get('flow-B-to-C')?.downstreamNodeId).toBe('graph-node-c');
    mockOr.mockResolvedValue({ data: clone(databaseProcesses) });
    const reused = await genLifeCycleModelProcesses(
      'model-123',
      createIndexedModelNodes() as any,
      createLifeCycleModelData(),
      [{ id: 'independent-primary', version: '08.00.000', type: 'primary' }, ...oldSubmodels],
    );
    expect(
      reused.lifeCycleModelProcesses.find((item) => item.modelInfo.type === 'primary'),
    ).toMatchObject({
      option: 'update',
      modelInfo: { id: 'independent-primary', version: '08.00.000', type: 'primary' },
    });
  });

  it('creates a new secondary id when no previous secondary matches', async () => {
    const data = createLifeCycleModelData();
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });

    mockLCIAResultCalculation
      .mockResolvedValueOnce([{ '@id': 'LCIA_PRIMARY' }])
      .mockResolvedValueOnce([{ '@id': 'LCIA_SECONDARY' }]);

    const { lifeCycleModelProcesses } = await genLifeCycleModelProcesses(
      'model-999',
      createIndexedModelNodes() as any,
      data,
      [],
    );

    const secondary = lifeCycleModelProcesses.find((item) => item?.modelInfo?.type === 'secondary');

    expect(secondary?.option).toBe('create');
    expect(secondary?.modelInfo?.id).toBe('generated-secondary-id');
    expect(secondary?.modelInfo?.finalId).toEqual(
      expect.objectContaining({
        nodeId: 'nodeC',
        processId: 'procC',
        allocatedExchangeFlowId: 'flow-C-final',
        allocatedExchangeDirection: 'OUTPUT',
      }),
    );
  });

  it('rejects legacy models where one input is fed by multiple providers', async () => {
    const data = createLifeCycleModelData();
    const processInstances = data.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];
    // procD 的输出与 procB 的输出指向同一个 nodeA 输入流
    processInstances.push({
      '@dataSetInternalID': 'nodeD',
      referenceToProcess: {
        '@refObjectId': 'procD',
        '@version': '1',
        'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Process D' }],
      },
      connections: {
        outputExchange: {
          '@flowUUID': 'flow-B-to-A',
          downstreamProcess: {
            '@id': 'nodeA',
          },
        },
      },
    });
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });

    await expect(
      genLifeCycleModelProcesses(
        'model-multi-provider',
        [...createIndexedModelNodes(), { id: 'graph-node-d', data: { index: 'nodeD' } }] as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({
      code: 'MULTIPLE_PROVIDERS',
      issues: expect.arrayContaining([
        expect.objectContaining({ instanceIndex: 'nodeA', flowId: 'flow-B-to-A' }),
      ]),
    });
  });

  it('flags incompatible flow versions between connected ports', async () => {
    const data = createLifeCycleModelData();
    const processInstances = data.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];
    processInstances[1].connections.outputExchange[0]['@version'] = '1';
    processInstances[1].connections.outputExchange[0].downstreamProcess['@version'] = '2';
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });

    await expect(
      genLifeCycleModelProcesses(
        'model-version-mismatch',
        createIndexedModelNodes() as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_FLOW' });
  });

  it('solves a cycle fully instead of breaking it and keeps the reference exchange at the target', async () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: {
            referenceToReferenceProcess: 'nodeA',
          },
          dataSetInformation: {
            name: {
              baseName: [{ '@xml:lang': 'en', '#text': 'Cycle Model' }],
            },
          },
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': 'nodeA',
                  referenceToProcess: {
                    '@refObjectId': 'procA',
                    '@version': '1',
                  },
                  connections: {
                    outputExchange: {
                      '@flowUUID': 'flow-A-to-B',
                      downstreamProcess: {
                        '@id': 'nodeB',
                      },
                    },
                  },
                },
                {
                  '@dataSetInternalID': 'nodeB',
                  referenceToProcess: {
                    '@refObjectId': 'procB',
                    '@version': '1',
                  },
                  connections: {
                    outputExchange: {
                      '@flowUUID': 'flow-B-to-A',
                      downstreamProcess: {
                        '@id': 'nodeA',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };
    mockOr.mockResolvedValue({
      data: clone([
        {
          id: 'procA',
          version: '1',
          exchange: [
            {
              '@dataSetInternalID': 'exA_out',
              exchangeDirection: 'OUTPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-A-to-B' },
              meanAmount: '1',
              resultingAmount: '1',
            },
            {
              '@dataSetInternalID': 'exA_in',
              exchangeDirection: 'INPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-B-to-A' },
              meanAmount: '0.2',
              resultingAmount: '0.2',
            },
          ],
          quantitativeReference: { referenceToReferenceFlow: 'exA_out' },
        },
        {
          id: 'procB',
          version: '1',
          exchange: [
            {
              '@dataSetInternalID': 'exB_out',
              exchangeDirection: 'OUTPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-B-to-A' },
              meanAmount: '1',
              resultingAmount: '1',
            },
            {
              '@dataSetInternalID': 'exB_in',
              exchangeDirection: 'INPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-A-to-B' },
              meanAmount: '0.1',
              resultingAmount: '0.1',
            },
          ],
          quantitativeReference: { referenceToReferenceFlow: 'exB_out' },
        },
      ]),
    });

    mockLCIAResultCalculation.mockResolvedValue([]);

    const { lifeCycleModelProcesses } = await genLifeCycleModelProcesses(
      'cycle-model',
      [
        {
          id: 'graph-node-a',
          data: { index: 'nodeA', quantitativeReference: '1', targetAmount: 1 },
        },
        { id: 'graph-node-b', data: { index: 'nodeB' } },
      ] as any,
      data,
      [],
    );

    const primary = lifeCycleModelProcesses.find((item) => item?.modelInfo?.type === 'primary');
    const refExchange = primary?.data?.processDataSet?.exchanges?.exchange?.find(
      (exchange: any) => exchange?.quantitativeReference,
    );
    expect(Number(refExchange?.meanAmount)).toBeCloseTo(1, 9);

    const processInstance = data.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];
    // 循环完整求解：A = 50/49、B = 10/49
    expect(Number(processInstance[0]['@multiplicationFactor'])).toBeCloseTo(50 / 49, 9);
    expect(Number(processInstance[1]['@multiplicationFactor'])).toBeCloseTo(10 / 49, 9);
  });
});

describe('genLifeCycleModelProcesses worker-run mapping', () => {
  it('maps a cancelled worker run to CalculationCancelledError', async () => {
    const client = getSharedMatrixCalculationClient();
    const runSpy = jest.spyOn(client, 'run').mockResolvedValueOnce({ status: 'cancelled' });

    await expect(
      genLifeCycleModelProcesses(
        'model-cancelled',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ name: 'CalculationCancelledError' });

    runSpy.mockRestore();
  });

  it('treats exchanges without amount fields as invalid amounts', async () => {
    const databaseProcesses = clone(createSupabaseProcesses()) as any[];
    delete databaseProcesses[0].exchange[0].meanAmount;
    delete databaseProcesses[0].exchange[0].resultingAmount;
    delete databaseProcesses[0].exchange[0].meanValue;
    mockOr.mockResolvedValue({ data: databaseProcesses });

    await expect(
      genLifeCycleModelProcesses(
        'model-amount-less',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_EXCHANGE_AMOUNT' });
  });

  it('skips the process query when no instance carries a process reference', async () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: { referenceToReferenceProcess: 'nodeA' },
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': 'nodeA',
                  referenceToProcess: {},
                  connections: {},
                },
              ],
            },
          },
        },
      },
    };
    mockOr.mockResolvedValue({ data: [] });

    await expect(
      genLifeCycleModelProcesses(
        'model-no-refs',
        [
          { id: 'ga', data: { index: 'nodeA', quantitativeReference: '1', targetAmount: 1 } },
        ] as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });

    // 查询条件为空时不触发数据库查询
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('treats a missing quantitative reference on a database process as invalid', async () => {
    const databaseProcesses = clone(createSupabaseProcesses()) as any[];
    delete databaseProcesses[1].quantitativeReference;
    mockOr.mockResolvedValue({ data: databaseProcesses });

    await expect(
      genLifeCycleModelProcesses(
        'model-missing-db-ref',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });
  });

  it('skips the process query when every instance lacks a process reference', async () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: { referenceToReferenceProcess: 'nodeA' },
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': 'nodeA',
                  referenceToProcess: {},
                  connections: {},
                },
              ],
            },
          },
        },
      },
    };
    mockOr.mockResolvedValue({ data: [] });

    await expect(
      genLifeCycleModelProcesses(
        'model-all-no-refs',
        [
          { id: 'ga', data: { index: 'nodeA', quantitativeReference: '1', targetAmount: 1 } },
        ] as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects instances without process references and covers sparse exchange shapes', async () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: { referenceToReferenceProcess: 'nodeA' },
          technology: {
            processes: {
              processInstance: [
                {
                  // 无 @dataSetInternalID 与 referenceToProcess：processKey 缺失，
                  // 查询条件为空，参考交换缺失 → 校验失败
                  referenceToProcess: {},
                },
                {
                  // 缺 @dataSetInternalID 的实例：写回键为空串
                  referenceToProcess: { '@refObjectId': 'procB', '@version': '1' },
                  connections: {},
                },
                {
                  '@dataSetInternalID': 'nodeA',
                  referenceToProcess: { '@refObjectId': 'procA', '@version': '1' },
                  connections: {},
                },
              ],
            },
          },
        },
      },
    };
    mockOr.mockResolvedValue({ data: [] });

    await expect(
      genLifeCycleModelProcesses(
        'model-degenerate',
        [
          { id: 'ga', data: { index: 'nodeA', quantitativeReference: '1', targetAmount: 1 } },
        ] as any,
        data,
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE_EXCHANGE' });
  });

  it('flags exchanges with no amount fields at all', async () => {
    const databaseProcesses = clone(createSupabaseProcesses()) as any[];
    delete databaseProcesses[0].exchange[0].meanAmount;
    delete databaseProcesses[0].exchange[0].resultingAmount;
    delete databaseProcesses[0].exchange[0].meanValue;
    mockOr.mockResolvedValue({ data: databaseProcesses });

    await expect(
      genLifeCycleModelProcesses(
        'model-amount-less',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_EXCHANGE_AMOUNT' });
  });

  it('resolves unparseable exchange amounts to validation errors', async () => {
    const databaseProcesses = clone(createSupabaseProcesses()) as any[];
    databaseProcesses[0].exchange[0].meanAmount = 'not-a-number';
    databaseProcesses[0].exchange[0].resultingAmount = '';
    mockOr.mockResolvedValue({ data: databaseProcesses });

    await expect(
      genLifeCycleModelProcesses(
        'model-unparseable-amount',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'INVALID_EXCHANGE_AMOUNT' });
  });
});

describe('genLifeCycleModelProcesses sparse payload branches', () => {
  it('handles legacy and new connection shapes, unmatched nodes, disconnected instances and absent names', async () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          quantitativeReference: { referenceToReferenceProcess: 'nodeA' },
          // 无 dataSetInformation.name：主模型命名缺失分支
          technology: {
            processes: {
              processInstance: [
                {
                  // 无画布节点匹配、无连接的实例：无活动，不写倍率
                  '@dataSetInternalID': 'nodeEmpty',
                  referenceToProcess: { '@refObjectId': 'procA', '@version': '1' },
                  connections: {},
                },
                {
                  // 缺 @dataSetInternalID 的实例：写回键为空串
                  referenceToProcess: { '@refObjectId': 'procB', '@version': '1' },
                  connections: {},
                },
                {
                  '@dataSetInternalID': 'nodeA',
                  referenceToProcess: { '@refObjectId': 'procA', '@version': '1' },
                  connections: {
                    // 缺 @flowUUID 的输出与缺 @id 的下游被跳过；
                    // 单对象形态 + 新格式 downstreamProcess（带 @flowUUID/@version）
                    outputExchange: [
                      { downstreamProcess: { '@id': 'nodeB' } },
                      {
                        '@flowUUID': 'flow-A-to-B',
                        downstreamProcess: [{ '@flowUUID': 'flow-A-to-B' }],
                      },
                      {
                        '@flowUUID': 'flow-A-to-B',
                        downstreamProcess: {
                          '@id': 'nodeB',
                          '@flowUUID': 'flow-A-to-B',
                          '@version': '1',
                        },
                      },
                    ],
                  },
                },
                {
                  '@dataSetInternalID': 'nodeB',
                  referenceToProcess: { '@refObjectId': 'procB', '@version': '1' },
                  connections: {
                    // 重复边被去重；@flowUUID 缺失时回退为输出流
                    outputExchange: [
                      {
                        '@flowUUID': 'flow-B-final',
                        downstreamProcess: { '@id': 'nodeA', '@flowUUID': 'flow-B-final' },
                      },
                      {
                        '@flowUUID': 'flow-B-final',
                        downstreamProcess: { '@id': 'nodeA', '@flowUUID': 'flow-B-final' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    };
    mockOr.mockResolvedValue({
      data: clone([
        {
          id: 'procA',
          version: '1',
          exchange: [
            {
              '@dataSetInternalID': 'exA_out',
              exchangeDirection: 'OUTPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-A-to-B' },
              meanAmount: '1',
              resultingAmount: '1',
            },
            {
              '@dataSetInternalID': 'exA_in',
              exchangeDirection: 'INPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-B-final' },
              meanAmount: '0.5',
              resultingAmount: '0.5',
            },
          ],
          quantitativeReference: { referenceToReferenceFlow: 'exA_out' },
        },
        {
          id: 'procB',
          version: '1',
          exchange: [
            {
              '@dataSetInternalID': 'exB_in',
              exchangeDirection: 'INPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-A-to-B' },
              meanAmount: '1',
              resultingAmount: '1',
            },
            {
              '@dataSetInternalID': 'exB_out',
              exchangeDirection: 'OUTPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-B-final' },
              meanAmount: '1',
              resultingAmount: '1',
              allocations: { allocation: { '@allocatedFraction': '100%' } },
            },
            {
              // 缺方向/内部ID/流引用的交换：规整为空流引用、数量 0，被编译忽略
              meanValue: '1',
              allocations: { allocation: { '@allocatedFraction': '0%' } },
            },
            {
              '@dataSetInternalID': 'exB_in_aux',
              exchangeDirection: 'INPUT',
              referenceToFlowDataSet: { '@refObjectId': 'flow-aux' },
              meanValue: '1',
            },
          ],
          quantitativeReference: { referenceToReferenceFlow: 'exB_out' },
        },
      ]),
    });

    // 画布节点不含 nodeB/nodeEmpty → nodeId 未匹配分支；nodeA 目标量为字符串
    const { lifeCycleModelProcesses, up2DownEdges } = await genLifeCycleModelProcesses(
      'sparse-model',
      [
        { id: 'ga', data: { index: 'nodeA', quantitativeReference: '1', targetAmount: '2' } },
      ] as any,
      data,
      [],
    );

    const primary = lifeCycleModelProcesses.find((item) => item?.modelInfo?.type === 'primary');
    expect(primary).toBeDefined();

    const processInstance = data.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];
    const multiplierByIndex = new Map(
      processInstance.map((instance: any) => [
        instance['@dataSetInternalID'] as string,
        instance['@multiplicationFactor'],
      ]),
    );
    // nodeEmpty 无活动：无 @multiplicationFactor（removeEmptyObjects 移除空对象）
    expect(multiplierByIndex.get('nodeEmpty')).toBeUndefined();
    // 循环解：x_A − x_B = 2、x_B = 0.5·x_A → x_A = 4、x_B = 2；倍率 = x/参考量 1
    expect(Number(multiplierByIndex.get('nodeA'))).toBeCloseTo(4, 9);
    expect(Number(multiplierByIndex.get('nodeB'))).toBeCloseTo(2, 9);

    // 单供应去重：每条流只保留一条边
    const edgeFlows = up2DownEdges.map((edge) => `${edge.upstreamId}->${edge.downstreamId}`).sort();
    expect(edgeFlows).toEqual(['nodeA->nodeB', 'nodeB->nodeA']);
    expect(
      Number(up2DownEdges.find((edge) => edge.flowUUID === 'flow-A-to-B')?.exchangeAmount),
    ).toBeCloseTo(2, 9);
  });
});

describe('genLifeCycleModelProcesses operation cancellation', () => {
  it('aborts before the worker run when the operation is already cancelled', async () => {
    const operation = new CalculationOperation();
    operation.cancel();

    await expect(
      genLifeCycleModelProcesses(
        'model-cancelled-early',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
        { operation },
      ),
    ).rejects.toMatchObject({ name: 'CalculationCancelledError' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('aborts after deferred loads when cancelled mid-flight', async () => {
    let releaseSource: (value: unknown) => void = () => {};
    const sourcePromise = new Promise((resolve) => {
      releaseSource = resolve;
    });
    mockOr.mockReturnValueOnce(sourcePromise);

    const operation = new CalculationOperation();
    const pending = genLifeCycleModelProcesses(
      'model-cancel-source',
      createIndexedModelNodes() as any,
      createLifeCycleModelData(),
      [],
      { operation },
    );

    operation.cancel();
    releaseSource({ data: clone(createSupabaseProcesses()) });

    await expect(pending).rejects.toMatchObject({ name: 'CalculationCancelledError' });
  });

  it('aborts between LCIA evaluations when cancelled while LCIA promises are pending', async () => {
    let releaseLcia: (value: unknown) => void = () => {};
    const lciaPromise = new Promise((resolve) => {
      releaseLcia = resolve;
    });
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });
    mockLCIAResultCalculation.mockImplementationOnce(() => lciaPromise);

    const operation = new CalculationOperation();
    const pending = genLifeCycleModelProcesses(
      'model-cancel-lcia',
      createIndexedModelNodes() as any,
      createLifeCycleModelData(),
      [],
      { operation },
    );

    operation.cancel();
    releaseLcia([{ '@id': 'LCIA_PRIMARY' }]);

    await expect(pending).rejects.toMatchObject({ name: 'CalculationCancelledError' });
  });

  it('aborts after the run resolves when the operation was cancelled while the run was in flight', async () => {
    // 求解期间的取消不中断 worker 本身：运行正常返回后，运行后置检查仍须中止
    let checks = 0;
    const operation = {
      isCancelled: () => (checks += 1) >= 5,
      beginStage: () => {},
    };
    mockOr.mockResolvedValue({ data: clone(createSupabaseProcesses()) });

    await expect(
      genLifeCycleModelProcesses(
        'model-cancel-post-run',
        createIndexedModelNodes() as any,
        createLifeCycleModelData(),
        [],
        { operation: operation as any },
      ),
    ).rejects.toMatchObject({ name: 'CalculationCancelledError' });
  });
});

it('rejects invalid inherited allocations before solving and identifies the source exchange', async () => {
  const rows = createSupabaseProcesses();
  (rows[1].exchange[1] as any).allocations.allocation['@allocatedFraction'] = '20%';
  mockOr.mockResolvedValue({ data: rows });
  await expect(
    genLifeCycleModelProcesses(
      'invalid-draft',
      createIndexedModelNodes() as any,
      createLifeCycleModelData(),
      [],
    ),
  ).rejects.toMatchObject({
    code: 'INVALID_ALLOCATION',
    issues: expect.arrayContaining([
      expect.objectContaining({ instanceIndex: 'nodeB', exchangeInternalId: 'exB_out_toA' }),
    ]),
  });
});

describe('Worker allocation materialization contract', () => {
  it('persists direction-aware primary and coproduct amounts and exports the exact Worker fixture', async () => {
    const timestamp = jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2026-09-29T00:00:00.000Z');
    try {
      const processId = '11111111-1111-4111-8111-111111111111';
      const modelId = '22222222-2222-4222-8222-222222222222';
      const flowIds = [1, 2, 3, 4, 5].map(
        (id) => `33333333-3333-4333-8333-${String(id).padStart(12, '0')}`,
      );
      const version = '01.00.000';
      const vector = (a: number) => ({
        allocation: [
          { '@internalReferenceToCoProduct': '1', '@allocatedFraction': a },
          { '@internalReferenceToCoProduct': '2', '@allocatedFraction': 100 - a },
        ],
      });
      mockFrom.mockImplementation((table: string) =>
        table === 'flows'
          ? {
              select: () => ({
                in: () => ({
                  order: async () => ({
                    data: flowIds
                      .slice(0, 2)
                      .map((id) => ({ id, version, typeOfDataSet: 'Product flow' })),
                  }),
                }),
              }),
            }
          : { select: mockSelect },
      );
      const cases: any[] = [];
      for (const legacy of [false, true]) {
        const rows = [2, 1, 100, 50, 10].map((amount, index) => ({
          '@dataSetInternalID': String(index + 1),
          exchangeDirection: index === 2 || index === 3 ? 'Input' : 'Output',
          meanAmount: String(amount),
          resultingAmount: String(amount),
          referenceToFlowDataSet: {
            '@refObjectId': flowIds[index],
            '@version': version,
            '@type': 'flow data set',
          },
          ...(legacy
            ? index < 2
              ? {
                  allocations: {
                    allocation: { '@allocatedFraction': index === 0 ? '70%' : '30%' },
                  },
                }
              : {}
            : index >= 2
              ? { allocations: vector([70, 40, 80][index - 2]) }
              : {}),
        }));
        // The first read is the Process; subsequent reads verify exact Product Flow identities.
        mockOr.mockResolvedValueOnce({
          data: [
            {
              id: processId,
              version,
              exchange: rows,
              quantitativeReference: { referenceToReferenceFlow: '1' },
            },
          ],
        });
        mockOr.mockResolvedValue({
          data: flowIds.slice(0, 2).map((id) => ({ id, version, typeOfDataSet: 'Product flow' })),
        });
        mockLCIAResultCalculation.mockResolvedValue([]);
        const data = {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              quantitativeReference: { referenceToReferenceProcess: 'p' },
              dataSetInformation: {
                name: { baseName: [{ '@xml:lang': 'en', '#text': 'Allocation parity' }] },
              },
              technology: {
                processes: {
                  processInstance: [
                    {
                      '@dataSetInternalID': 'p',
                      referenceToProcess: { '@refObjectId': processId, '@version': version },
                    },
                  ],
                },
              },
            },
            administrativeInformation: {
              publicationAndOwnership: { 'common:dataSetVersion': version },
            },
          },
        };
        const { lifeCycleModelProcesses } = await genLifeCycleModelProcesses(
          modelId,
          [{ id: 'p', data: { index: 'p', quantitativeReference: '1', targetAmount: 2 } }] as any,
          data,
          [],
        );
        expect(lifeCycleModelProcesses).toHaveLength(4);
        for (const record of lifeCycleModelProcesses.filter(
          (item) => item.modelInfo.type !== 'allocated',
        )) {
          const primary = record.modelInfo.type === 'primary';
          const id = primary ? modelId : '44444444-4444-4444-8444-444444444444';
          const persisted = genProcessJsonOrdered(id, record.data.processDataSet);
          const dataset = persisted.processDataSet;
          const entries = Array.isArray(dataset.exchanges.exchange)
            ? dataset.exchanges.exchange
            : [dataset.exchanges.exchange];
          const reference =
            dataset.processInformation.quantitativeReference.referenceToReferenceFlow;
          const pivot = entries.find((entry: any) => entry['@dataSetInternalID'] === reference)!;
          expect(pivot.referenceToFlowDataSet['@refObjectId']).toBe(flowIds[primary ? 0 : 1]);
          const expected = legacy
            ? primary
              ? [70, 35, 7]
              : [30, 15, 3]
            : primary
              ? [70, 20, 8]
              : [30, 30, 2];
          const balances = expected.map((amount, index) => {
            const flowId = flowIds[index + 2];
            const entry = entries.find(
              (entry: any) => entry.referenceToFlowDataSet['@refObjectId'] === flowId,
            )!;
            expect(entry.exchangeDirection).toBe(index < 2 ? 'Input' : 'Output');
            expect(Number(entry.resultingAmount)).toBeCloseTo(amount, 9);
            expect(Number(entry.meanAmount)).toBeCloseTo(amount, 9);
            return {
              flowId,
              signedAmountPerReference:
                (index < 2 ? -amount : amount) / Number(pivot.resultingAmount),
            };
          });
          for (const entry of entries) expect(entry.allocations).toBeUndefined();
          cases.push({
            name: `${legacy ? 'legacy' : 'targeted'}-${record.modelInfo.type}`,
            id,
            version,
            process: persisted,
            balances,
          });
        }
      }
      // Optional local cross-repository qualification artifact; no network or DB writes.
      if (process.env.ALLOCATION_PARITY_OUTPUT) {
        writeFileSync(
          process.env.ALLOCATION_PARITY_OUTPUT,
          JSON.stringify({ schema: 'platform-worker-allocation-fixture.v1', cases }, null, 2) +
            '\n',
        );
      }
    } finally {
      timestamp.mockRestore();
    }
  });
});
