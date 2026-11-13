/**
 * Golden numeric fixtures for the matrix calculation pipeline
 * (compile → solve → assemble, exercised through runMatrixCalculation).
 *
 * zh-CN: 数值黄金案例。编译系数正确性与数值求解正确性分离验收：
 *  - 普通链（非 1 参考量倍率换算）；
 *  - 一个输出供应两个下游（需求累加）；
 *  - 两节点循环 A=[[0,0.1],[0.2,0]], y=(1,0) → (50/49, 10/49)；
 *  - 自回用 20% x=1.25；100% 不可解；120% 代数解为负；
 *  - 多产品旧式份额 P=2/Q=1、共同负荷 10、份额 60/40 → 单位产品负荷 3/4；
 *  - 标准 exchange-target allocation、零份额、无效份额；
 *  - 多产品模型内部连接、部分外供、主副结果与原实例倍率映射；
 *  - 同源 Process 多实例、流版本不匹配、低数量级、未连接边界。
 */

import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import type {
  MatrixCalculationPayload,
  MatrixExchangePayload,
} from '@/services/lifeCycleModels/matrixCalculation/types';

const exchange = (
  internalId: string,
  direction: 'INPUT' | 'OUTPUT',
  flowId: string,
  amount: number,
  extra: Partial<MatrixExchangePayload> = {},
): MatrixExchangePayload => ({
  internalId,
  direction,
  flowId,
  amount,
  ...extra,
});

const expectCloseTo = (actual: number, expected: number, precision = 9): void => {
  expect(actual).toBeCloseTo(expected, precision);
};

const okResult = (payload: MatrixCalculationPayload) => {
  const response = runMatrixCalculation({ type: 'calculate', runId: 'fixture', payload });
  if (!response.ok) {
    throw new Error(`fixture unexpectedly failed: ${response.error.code}`);
  }
  return response.result;
};

const failCode = (payload: MatrixCalculationPayload): string => {
  const response = runMatrixCalculation({ type: 'calculate', runId: 'fixture', payload });
  if (response.ok) {
    throw new Error('fixture unexpectedly succeeded');
  }
  return response.error.code;
};

describe('matrix calculation golden fixtures', () => {
  it('solves a plain chain with non-1 reference amounts (multiplier conversion)', () => {
    // P0: ref F0 (5) consumes F1 (2); P1: ref F1 (3) consumes raw (7)
    // target 10 on P0 → x0=2, x1=4/3; multipliers 2 and 4/3
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeA',
      targetAmount: 10,
      instances: [
        {
          instanceIndex: 'nodeA',
          processId: 'procA',
          processVersion: '1',
          process: {
            id: 'procA',
            version: '1',
            refExchangeInternalId: 'exA_out',
            exchanges: [
              exchange('exA_in', 'INPUT', 'flow-F1', 2),
              exchange('exA_out', 'OUTPUT', 'flow-F0', 5),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_out',
            exchanges: [
              exchange('exB_out', 'OUTPUT', 'flow-F1', 3),
              exchange('exB_in', 'INPUT', 'flow-raw', 7),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeB->nodeA:flow-F1',
            },
          ],
        },
      ],
    };

    const result = okResult(payload);

    expect(result.instanceMultipliers.nodeA).toBeCloseTo(2, 9);
    expect(result.instanceMultipliers.nodeB).toBeCloseTo(4 / 3, 9);

    const primary = result.groups.find((group) => group.type === 'primary');
    expect(primary).toBeDefined();
    const byFlow = new Map(
      primary!.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-F0')!.amount, 10);
    expect(byFlow.get('OUTPUT:flow-F0')!.quantitativeReference).toBe(true);
    // 普通链：P1 的原料 7 × 4/3 = 28/3；单一产出无分配 → 全额归属
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -(28 / 3), 9);

    // 内部流被消去，不重复进入外部清单
    expect(byFlow.has('INPUT:flow-F1')).toBe(false);
    expect(byFlow.has('OUTPUT:flow-F1')).toBe(false);
  });

  it('accumulates demand when one output supplies two downstream inputs (fan-out)', () => {
    // P0（参考，目标 3）消耗 F1(1) 与 F3(3)；P1 的 F1 同时供应 P0 与 P2；
    // P2 由其输出 F3 供 P0 而成为需求驱动 → P1 需求 = 1·3 + 2·9 = 21
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeP0',
      targetAmount: 3,
      instances: [
        {
          instanceIndex: 'nodeP0',
          processId: 'p0',
          processVersion: '1',
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'ex0_out',
            exchanges: [
              exchange('ex0_out', 'OUTPUT', 'flow-F0', 1),
              exchange('ex0_in_f1', 'INPUT', 'flow-F1', 1),
              exchange('ex0_in_f3', 'INPUT', 'flow-F3', 3),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeP2',
          processId: 'p2',
          processVersion: '1',
          process: {
            id: 'p2',
            version: '1',
            refExchangeInternalId: 'ex2_out',
            exchanges: [
              exchange('ex2_out', 'OUTPUT', 'flow-F3', 1),
              exchange('ex2_in', 'INPUT', 'flow-F1', 2),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeP2',
              downstreamIndex: 'nodeP0',
              outputFlowId: 'flow-F3',
              inputFlowId: 'flow-F3',
              edgeId: 'nodeP2->nodeP0:flow-F3',
            },
          ],
        },
        {
          instanceIndex: 'nodeP1',
          processId: 'p1',
          processVersion: '1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'ex1_out',
            exchanges: [
              exchange('ex1_out', 'OUTPUT', 'flow-F1', 1),
              exchange('ex1_in', 'INPUT', 'flow-raw', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeP1',
              downstreamIndex: 'nodeP0',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeP1->nodeP0:flow-F1',
            },
            {
              upstreamIndex: 'nodeP1',
              downstreamIndex: 'nodeP2',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeP1->nodeP2:flow-F1',
            },
          ],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.nodeP0).toBeCloseTo(3, 9);
    // P2 需求驱动：x = 3 单位 P0 × 3 F3/单位 = 9
    expect(result.instanceMultipliers.nodeP2).toBeCloseTo(9, 9);
    // 需求正确累加：x_P1 = 1·3 + 2·9 = 21
    expect(result.instanceMultipliers.nodeP1).toBeCloseTo(21, 9);
    expect(result.edgeAmounts['nodeP1->nodeP0:flow-F1']).toBeCloseTo(3, 9);
    expect(result.edgeAmounts['nodeP1->nodeP2:flow-F1']).toBeCloseTo(18, 9);
  });

  it('solves the two-node loop A=[[0,0.1],[0.2,0]], y=(1,0) exactly', () => {
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'n0',
          processId: 'p0',
          processVersion: '1',
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1),
              exchange('i0', 'INPUT', 'flow-F1', 0.2),
            ],
          },
          connections: [
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'n1',
              outputFlowId: 'flow-F0',
              inputFlowId: 'flow-F0',
              edgeId: 'n0->n1:flow-F0',
            },
          ],
        },
        {
          instanceIndex: 'n1',
          processId: 'p1',
          processVersion: '1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'e1',
            exchanges: [
              exchange('e1', 'OUTPUT', 'flow-F1', 1),
              exchange('i1', 'INPUT', 'flow-F0', 0.1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'n1',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'n1->n0:flow-F1',
            },
          ],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.n0).toBeCloseTo(50 / 49, 9);
    expect(result.instanceMultipliers.n1).toBeCloseTo(10 / 49, 9);
  });

  it('solves 20% self-reuse at x=1.25, flags 100% as unsolvable and 120% as negative', () => {
    const buildSelfLoopPayload = (inputAmount: number): MatrixCalculationPayload => ({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'n0',
          processId: 'p0',
          processVersion: '1',
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1),
              exchange('i0', 'INPUT', 'flow-F0', inputAmount),
            ],
          },
          connections: [
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-F0',
              inputFlowId: 'flow-F0',
              edgeId: 'n0->n0:flow-F0',
            },
          ],
        },
      ],
    });

    const solved = okResult(buildSelfLoopPayload(0.2));
    expect(solved.instanceMultipliers.n0).toBeCloseTo(1.25, 9);

    expect(failCode(buildSelfLoopPayload(1))).toBe('MODEL_NOT_SOLVABLE');
    expect(failCode(buildSelfLoopPayload(1.2))).toBe('NEGATIVE_ACTIVITY');
  });

  it('attributes legacy uniform shares P=2/Q=1 with load 10 and 60/40 to unit loads 3/4', () => {
    const multiProductInstance = {
      instanceIndex: 'nPQ',
      processId: 'pq',
      processVersion: '1',
      process: {
        id: 'pq',
        version: '1',
        refExchangeInternalId: 'exP',
        exchanges: [
          exchange('exP', 'OUTPUT', 'flow-P', 2, {
            allocations: { allocation: { '@allocatedFraction': '60%' } },
          }),
          exchange('exQ', 'OUTPUT', 'flow-Q', 1, {
            allocations: { allocation: { '@allocatedFraction': '40%' } },
          }),
          exchange('exL', 'INPUT', 'flow-L', 10),
        ],
      },
      connections: [
        {
          upstreamIndex: 'nPQ',
          downstreamIndex: 'nE',
          outputFlowId: 'flow-Q',
          inputFlowId: 'flow-Q',
          edgeId: 'nPQ->nE:flow-Q',
        },
      ],
    };

    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        multiProductInstance,
        {
          instanceIndex: 'nE',
          processId: 'pe',
          processVersion: '1',
          process: {
            id: 'pe',
            version: '1',
            refExchangeInternalId: 'exE',
            exchanges: [
              exchange('exE_in', 'INPUT', 'flow-Q', 1),
              exchange('exE', 'OUTPUT', 'flow-E', 1),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);

    // 主情景只需求 P；Q 与终端 E 的活动量为零，独立副情景另行求解。
    expect(result.instanceMultipliers.nPQ).toBeUndefined();
    expect(result.instanceMultipliers.nE).toBeUndefined();

    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    // 单位产品负荷 3：2 单位 P → 共同负荷 10×0.6/2×2 = 6
    expectCloseTo(byFlow.get('INPUT:flow-L')!.amount, -6, 9);
    expectCloseTo(byFlow.get('OUTPUT:flow-P')!.amount, 2, 9);
    expect(byFlow.get('OUTPUT:flow-P')!.quantitativeReference).toBe(true);

    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-E',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    // 单位产品负荷 4：Q 视图 1 单位 → 10×0.4/1×1 = 4
    expectCloseTo(secondaryByFlow.get('INPUT:flow-L')!.amount, -4, 9);
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-E')!.amount, 1, 9);
    expect(secondaryByFlow.get('OUTPUT:flow-E')!.quantitativeReference).toBe(true);
  });

  it('selects standard exchange-target allocation items per target product and treats sparse zeros as zero', () => {
    const standardInstance = (lFractions: Array<[string, number]> | null) => ({
      instanceIndex: 'nPQ',
      processId: 'pq',
      processVersion: '1',
      process: {
        id: 'pq',
        version: '1',
        refExchangeInternalId: 'exP',
        exchanges: [
          exchange('exP', 'OUTPUT', 'flow-P', 2),
          exchange('exQ', 'OUTPUT', 'flow-Q', 1),
          exchange(
            'exL',
            'INPUT',
            'flow-L',
            10,
            lFractions
              ? {
                  allocations: {
                    allocation: lFractions.map(([target, fraction]) => ({
                      '@internalReferenceToCoProduct': target,
                      '@allocatedFraction': `${fraction * 100}`,
                    })),
                  },
                }
              : {},
          ),
        ],
      },
      connections: [
        {
          upstreamIndex: 'nPQ',
          downstreamIndex: 'nE',
          outputFlowId: 'flow-Q',
          inputFlowId: 'flow-Q',
          edgeId: 'nPQ->nE:flow-Q',
        },
      ],
    });

    const downstream = {
      instanceIndex: 'nE',
      processId: 'pe',
      processVersion: '1',
      process: {
        id: 'pe',
        version: '1',
        refExchangeInternalId: 'exE',
        exchanges: [
          exchange('exE_in', 'INPUT', 'flow-Q', 1),
          exchange('exE', 'OUTPUT', 'flow-E', 1),
        ],
      },
      connections: [],
    };

    // 目标数组：exL 60% → P、40% → Q
    const result = okResult({
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        standardInstance([
          ['exP', 0.6],
          ['exQ', 0.4],
        ]),
        downstream,
      ],
    });
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('INPUT:flow-L')!.amount, -6, 9);
    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-E',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(secondaryByFlow.get('INPUT:flow-L')!.amount, -4, 9);

    // 稀疏零：exL 只分配给 P → Q 视图负荷为 0
    const sparseResult = okResult({
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [standardInstance([['exP', 1]]), downstream],
    });
    const sparseSecondary = sparseResult.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-E',
    )!;
    expect(sparseSecondary.exchanges.find((entry) => entry.flowId === 'flow-L')).toBeUndefined();

    // 不闭合：60+30 ≠ 100 → INVALID_ALLOCATION
    expect(
      failCode({
        refInstanceIndex: 'nPQ',
        targetAmount: 2,
        instances: [
          standardInstance([
            ['exP', 0.6],
            ['exQ', 0.3],
          ]),
          downstream,
        ],
      }),
    ).toBe('INVALID_ALLOCATION');
  });

  it('maps multi-product internal connection, partial external supply and instance multipliers (A←B→C)', () => {
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeA',
      targetAmount: 10,
      instances: [
        {
          instanceIndex: 'nodeA',
          processId: 'procA',
          processVersion: '1',
          process: {
            id: 'procA',
            version: '1',
            refExchangeInternalId: 'exA_out',
            exchanges: [
              exchange('exA_in', 'INPUT', 'flow-B-to-A', 2),
              exchange('exA_out', 'OUTPUT', 'flow-A-final', 5),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_out_toA',
            exchanges: [
              exchange('exB_out_toA', 'OUTPUT', 'flow-B-to-A', 3, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('exB_out_toC', 'OUTPUT', 'flow-B-to-C', 4, {
                allocations: { allocation: { '@allocatedFraction': '40%' } },
              }),
              exchange('exB_in', 'INPUT', 'flow-raw', 7),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-B-to-A',
              inputFlowId: 'flow-B-to-A',
              edgeId: 'nodeB->nodeA:flow-B-to-A',
            },
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeC',
              outputFlowId: 'flow-B-to-C',
              inputFlowId: 'flow-B-to-C',
              edgeId: 'nodeB->nodeC:flow-B-to-C',
            },
          ],
        },
        {
          instanceIndex: 'nodeC',
          processId: 'procC',
          processVersion: '1',
          process: {
            id: 'procC',
            version: '1',
            refExchangeInternalId: 'exC_out',
            exchanges: [
              exchange('exC_in', 'INPUT', 'flow-B-to-C', 1),
              exchange('exC_out', 'OUTPUT', 'flow-C-final', 1),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);

    // 主情景 A 需要 B 的第一种产品 4；B 的另一产品和终端 C 无主情景需求。
    expect(result.instanceMultipliers.nodeA).toBeCloseTo(2, 9);
    expect(result.instanceMultipliers.nodeB).toBeUndefined();
    expect(result.instanceMultipliers.nodeC).toBeUndefined();

    expect(result.edgeAmounts['nodeB->nodeA:flow-B-to-A']).toBeCloseTo(4, 9);
    expect(result.edgeAmounts['nodeB->nodeC:flow-B-to-C']).toBe(0);

    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-A-final')!.amount, 10, 9);
    expect(byFlow.get('OUTPUT:flow-A-final')!.quantitativeReference).toBe(true);
    // B 的 A 产品归因原料：7 × 0.6 / 3 × 4 = 5.6
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -5.6, 9);
    expect(byFlow.has('OUTPUT:flow-C-final')).toBe(false);

    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-C-final',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-C-final')!.amount, 1, 9);
    expect(secondaryByFlow.get('OUTPUT:flow-C-final')!.quantitativeReference).toBe(true);
    // C 独立情景需求 1，原料负荷为 7 × 0.4 / 4 = 0.7。
    expectCloseTo(secondaryByFlow.get('INPUT:flow-raw')!.amount, -0.7, 9);
    expect(secondary.refProcesses).toEqual(
      expect.arrayContaining([
        { id: 'procB', version: '1' },
        { id: 'procC', version: '1' },
      ]),
    );
  });

  it('keeps same-source process instances independent and flags version-incompatible flows', () => {
    const sharedProcess = {
      id: 'procB',
      version: '1',
      refExchangeInternalId: 'exB_out',
      exchanges: [
        exchange('exB_out', 'OUTPUT', 'flow-F1', 3),
        exchange('exB_in', 'INPUT', 'flow-raw', 7),
      ],
    };
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeA',
      targetAmount: 3,
      instances: [
        {
          instanceIndex: 'nodeA',
          processId: 'procA',
          processVersion: '1',
          process: {
            id: 'procA',
            version: '1',
            refExchangeInternalId: 'exA_out',
            exchanges: [
              exchange('exA_out', 'OUTPUT', 'flow-F0', 1),
              exchange('exA_in_f1', 'INPUT', 'flow-F1', 1),
              exchange('exA_in_f2', 'INPUT', 'flow-F2', 1),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeB1',
          processId: 'procB',
          processVersion: '1',
          process: sharedProcess,
          connections: [
            {
              upstreamIndex: 'nodeB1',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeB1->nodeA:flow-F1',
            },
          ],
        },
        {
          instanceIndex: 'nodeB2',
          processId: 'procB',
          processVersion: '1',
          process: sharedProcess,
          connections: [
            {
              upstreamIndex: 'nodeB2',
              downstreamIndex: 'nodeP2',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeB2->nodeP2:flow-F1',
            },
          ],
        },
        {
          instanceIndex: 'nodeP2',
          processId: 'procP2',
          processVersion: '1',
          process: {
            id: 'procP2',
            version: '1',
            refExchangeInternalId: 'exP2_out',
            exchanges: [
              exchange('exP2_out', 'OUTPUT', 'flow-F2', 1),
              exchange('exP2_in', 'INPUT', 'flow-F1', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeP2',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-F2',
              inputFlowId: 'flow-F2',
              edgeId: 'nodeP2->nodeA:flow-F2',
            },
          ],
        },
      ],
    };

    const result = okResult(payload);
    // 同源 Process 的两个实例保持独立：各自按需求求解，不合并倍率
    // nodeA 目标 3：F1 需求 3（B1）+ F2 需求 3（P2）→ B2 = 3
    expect(result.instanceMultipliers.nodeA).toBeCloseTo(3, 9);
    expect(result.instanceMultipliers.nodeB1).toBeCloseTo(1, 9);
    expect(result.instanceMultipliers.nodeB2).toBeCloseTo(1, 9);
    expect(result.instanceMultipliers.nodeP2).toBeCloseTo(3, 9);

    // 同一 Flow UUID 不同版本 → INCOMPATIBLE_FLOW
    const versionMismatch: MatrixCalculationPayload = {
      ...payload,
      instances: payload.instances.map((instance) =>
        instance.instanceIndex === 'nodeB1'
          ? {
              ...instance,
              connections: [
                {
                  ...instance.connections[0],
                  outputFlowVersion: '1',
                  inputFlowVersion: '2',
                },
              ],
            }
          : instance,
      ),
    };
    const response = runMatrixCalculation({
      type: 'calculate',
      runId: 'fixture',
      payload: versionMismatch,
    });
    if (response.ok) {
      throw new Error('fixture unexpectedly succeeded');
    }
    expect(response.error.code).toBe('INCOMPATIBLE_FLOW');
  });

  it('keeps low-magnitude data accurate and preserves unconnected boundary flows', () => {
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'n0',
      targetAmount: 1e-6,
      instances: [
        {
          instanceIndex: 'n0',
          processId: 'p0',
          processVersion: '1',
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1e-6, {
                allocations: { allocation: { '@allocatedFraction': '99%' } },
              }),
              exchange('i0', 'INPUT', 'flow-F1', 2e-8),
              exchange('u0', 'OUTPUT', 'flow-U', 3e-9, {
                allocations: { allocation: { '@allocatedFraction': '1%' } },
              }),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'n1',
          processId: 'p1',
          processVersion: '1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'e1',
            exchanges: [
              exchange('e1', 'OUTPUT', 'flow-F1', 1e-8),
              exchange('i1', 'INPUT', 'flow-raw', 5e-8),
            ],
          },
          connections: [
            {
              upstreamIndex: 'n1',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'n1->n0:flow-F1',
            },
          ],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.n0).toBeUndefined();
    // 主情景只归属 e0 的 99% 输入：n1 活动量为 1.98e-8。
    expect(result.instanceMultipliers.n1).toBeCloseTo(1.98, 9);
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-F0')!.amount, 1e-6, 12);
    // 已连接输入在组内抵消，不进入外部清单
    expect(byFlow.has('INPUT:flow-F1')).toBe(false);
    // n1 的未连接原料按其主情景活动量归属保留：5e-8 × 1.98 = 9.9e-8
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -9.9e-8, 15);
    // 已分配的未连接输出 u0 有独立情景，不再混入主结果
    expect(byFlow.has('OUTPUT:flow-U')).toBe(false);
    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-U',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    // u0 情景：份额 1% 且已闭合 → 无负担运输，仅保留产出
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-U')!.amount, 3e-9, 15);
    expect(secondaryByFlow.get('OUTPUT:flow-U')!.quantitativeReference).toBe(true);
  });

  it('carries ordinary emissions at full scale without allocation declarations', () => {
    // 反例（审查 1）：参考产品 1 + 未分配 CO2 输出 10，无分配声明。
    // 排放不是需要分配份额的联产品：按参考默认语义全额随参考活动缩放。
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'n0',
      targetAmount: 2,
      instances: [
        {
          instanceIndex: 'n0',
          processId: 'p0',
          processVersion: '1',
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-P', 1),
              exchange('eCO2', 'OUTPUT', 'flow-CO2', 10),
              exchange('i0', 'INPUT', 'flow-raw', 5),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.n0).toBeCloseTo(2, 9);
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-P')!.amount, 2, 9);
    expect(byFlow.get('OUTPUT:flow-P')!.quantitativeReference).toBe(true);
    // 排放按参考活动全额缩放：10 × 2
    expectCloseTo(byFlow.get('OUTPUT:flow-CO2')!.amount, 20, 9);
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -10, 9);
  });

  it('attributes shared upstream inventory per product scenario', () => {
    // 反例（审查 2）：P 产 P2/Q1（60/40）耗 L10；R 产 L1 耗 raw1；Q 接末端 E。
    // 主/副结果按归因情景求上游活动量：raw 6 与 4，内部 L 抵消。
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        {
          instanceIndex: 'nPQ',
          processId: 'pq',
          processVersion: '1',
          process: {
            id: 'pq',
            version: '1',
            refExchangeInternalId: 'exP',
            exchanges: [
              exchange('exP', 'OUTPUT', 'flow-P', 2, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('exQ', 'OUTPUT', 'flow-Q', 1, {
                allocations: { allocation: { '@allocatedFraction': '40%' } },
              }),
              exchange('exL', 'INPUT', 'flow-L', 10),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nPQ',
              downstreamIndex: 'nE',
              outputFlowId: 'flow-Q',
              inputFlowId: 'flow-Q',
              edgeId: 'nPQ->nE:flow-Q',
            },
          ],
        },
        {
          instanceIndex: 'nR',
          processId: 'pr',
          processVersion: '1',
          process: {
            id: 'pr',
            version: '1',
            refExchangeInternalId: 'exR_L',
            exchanges: [
              exchange('exR_L', 'OUTPUT', 'flow-L', 1),
              exchange('exR_raw', 'INPUT', 'flow-raw', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nR',
              downstreamIndex: 'nPQ',
              outputFlowId: 'flow-L',
              inputFlowId: 'flow-L',
              edgeId: 'nR->nPQ:flow-L',
            },
          ],
        },
        {
          instanceIndex: 'nE',
          processId: 'pe',
          processVersion: '1',
          process: {
            id: 'pe',
            version: '1',
            refExchangeInternalId: 'exE',
            exchanges: [
              exchange('exE_in', 'INPUT', 'flow-Q', 1),
              exchange('exE', 'OUTPUT', 'flow-E', 1),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.nPQ).toBeUndefined();
    expect(result.instanceMultipliers.nR).toBeCloseTo(6, 9);
    expect(result.instanceMultipliers.nE).toBeUndefined();

    const primary = result.groups.find((group) => group.type === 'primary')!;
    const primaryByFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(primaryByFlow.get('OUTPUT:flow-P')!.amount, 2, 9);
    expect(primaryByFlow.get('OUTPUT:flow-P')!.quantitativeReference).toBe(true);
    // 主情景的归因上游：raw 6；内部 L 与 R 的 L 产出完全抵消，均不进入清单
    expect(primaryByFlow.has('INPUT:flow-L')).toBe(false);
    expectCloseTo(primaryByFlow.get('INPUT:flow-raw')!.amount, -6, 9);
    expect(primaryByFlow.has('OUTPUT:flow-L')).toBe(false);
    expect(primaryByFlow.has('OUTPUT:flow-Q')).toBe(false);

    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-E',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-E')!.amount, 1, 9);
    expect(secondaryByFlow.get('OUTPUT:flow-E')!.quantitativeReference).toBe(true);
    // 副情景的归因上游：raw 4；内部 L 抵消
    expect(secondaryByFlow.has('INPUT:flow-L')).toBe(false);
    expectCloseTo(secondaryByFlow.get('INPUT:flow-raw')!.amount, -4, 9);
    expect(secondaryByFlow.has('OUTPUT:flow-L')).toBe(false);
  });

  it('keeps independent secondary results for unconnected allocated coproducts', () => {
    // 反例（审查 3）：单实例 P2/Q1（60/40）耗 L10，目标 P2。
    // 未连接的已分配副产品保留独立结果：Q=1、L=-4；主结果不携带 Q。
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        {
          instanceIndex: 'nPQ',
          processId: 'pq',
          processVersion: '1',
          process: {
            id: 'pq',
            version: '1',
            refExchangeInternalId: 'exP',
            exchanges: [
              exchange('exP', 'OUTPUT', 'flow-P', 2, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('exQ', 'OUTPUT', 'flow-Q', 1, {
                allocations: { allocation: { '@allocatedFraction': '40%' } },
              }),
              exchange('exL', 'INPUT', 'flow-L', 10),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.nPQ).toBeUndefined();

    const primary = result.groups.find((group) => group.type === 'primary')!;
    const primaryByFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(primaryByFlow.get('OUTPUT:flow-P')!.amount, 2, 9);
    expect(primaryByFlow.get('OUTPUT:flow-P')!.quantitativeReference).toBe(true);
    expectCloseTo(primaryByFlow.get('INPUT:flow-L')!.amount, -6, 9);
    // 主结果不携带另一产品的数量
    expect(primaryByFlow.has('OUTPUT:flow-Q')).toBe(false);

    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-Q',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-Q')!.amount, 1, 9);
    expect(secondaryByFlow.get('OUTPUT:flow-Q')!.quantitativeReference).toBe(true);
    // 副产品情景承载 40% 负荷
    expectCloseTo(secondaryByFlow.get('INPUT:flow-L')!.amount, -4, 9);
  });

  it('rejects legacy models where one input has multiple providers instead of silently picking one', () => {
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeA',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'nodeA',
          processId: 'procA',
          processVersion: '1',
          process: {
            id: 'procA',
            version: '1',
            refExchangeInternalId: 'exA_out',
            exchanges: [
              exchange('exA_out', 'OUTPUT', 'flow-F0', 1),
              exchange('exA_in', 'INPUT', 'flow-F1', 1),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_out',
            exchanges: [exchange('exB_out', 'OUTPUT', 'flow-F1', 1)],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeB->nodeA:flow-F1',
            },
          ],
        },
        {
          instanceIndex: 'nodeD',
          processId: 'procD',
          processVersion: '1',
          process: {
            id: 'procD',
            version: '1',
            refExchangeInternalId: 'exD_out',
            exchanges: [exchange('exD_out', 'OUTPUT', 'flow-F1', 1)],
          },
          connections: [
            {
              upstreamIndex: 'nodeD',
              downstreamIndex: 'nodeA',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-F1',
              edgeId: 'nodeD->nodeA:flow-F1',
            },
          ],
        },
      ],
    };

    expect(failCode(payload)).toBe('MULTIPLE_PROVIDERS');
  });

  it('validates reference, target amount and empty model inputs', () => {
    expect(failCode({ refInstanceIndex: 'nodeX', targetAmount: 1, instances: [] })).toBe(
      'EMPTY_MODEL',
    );

    const baseInstance = {
      instanceIndex: 'nodeA',
      processId: 'procA',
      processVersion: '1',
      process: {
        id: 'procA',
        version: '1',
        refExchangeInternalId: 'exA_out',
        exchanges: [exchange('exA_out', 'OUTPUT', 'flow-F0', 1)],
      },
      connections: [],
    };

    expect(
      failCode({ refInstanceIndex: 'nodeMissing', targetAmount: 1, instances: [baseInstance] }),
    ).toBe('INVALID_REFERENCE');
    expect(
      failCode({ refInstanceIndex: 'nodeA', targetAmount: 0, instances: [baseInstance] }),
    ).toBe('INVALID_TARGET_AMOUNT');
    expect(
      failCode({
        refInstanceIndex: 'nodeA',
        targetAmount: Number.POSITIVE_INFINITY,
        instances: [baseInstance],
      }),
    ).toBe('INVALID_TARGET_AMOUNT');
  });

  it('keeps a connected non-reference supplier demand-driven when the reference product is an unconnected boundary view', () => {
    // 复审发现 1 反例：B 参考产品 P=2（60%）+ 联产品 Q=1（40%），raw=10；
    // 仅 Q 连接到星标过程 E（耗 Q=1 产 E=1），目标 E=1。
    // 加边界 P 视图后行主仍取 Q：需求经 Q 驱动 B，E 归因 raw=4，
    // 边界 P 保留独立副结果（raw=-6, P=+2）。
    const buildPayload = (): MatrixCalculationPayload => ({
      refInstanceIndex: 'nodeE',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_P',
            exchanges: [
              exchange('exB_P', 'OUTPUT', 'flow-P', 2, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('exB_Q', 'OUTPUT', 'flow-Q', 1, {
                allocations: { allocation: { '@allocatedFraction': '40%' } },
              }),
              exchange('exB_raw', 'INPUT', 'flow-raw', 10),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeE',
              outputFlowId: 'flow-Q',
              inputFlowId: 'flow-Q',
              edgeId: 'nodeB->nodeE:flow-Q',
            },
          ],
        },
        {
          instanceIndex: 'nodeE',
          processId: 'procE',
          processVersion: '1',
          process: {
            id: 'procE',
            version: '1',
            refExchangeInternalId: 'exE_out',
            exchanges: [
              exchange('exE_in', 'INPUT', 'flow-Q', 1),
              exchange('exE_out', 'OUTPUT', 'flow-E', 1),
            ],
          },
          connections: [],
        },
      ],
    });

    const result = okResult(buildPayload());
    expect(result.instanceMultipliers.nodeE).toBeCloseTo(1, 9);
    // 主情景只需求 Q：x_Q = 1，x_P = 0，无共同倍率。
    expect(result.instanceMultipliers.nodeB).toBeUndefined();
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-E')!.amount, 1, 9);
    // 组内连通的 Q 交付在主组内抵消，不进入外部清单
    expect(byFlow.has('INPUT:flow-Q')).toBe(false);
    // E 归因 raw 负荷 = 10 × 40% = 4
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -4, 9);
    expect(byFlow.has('OUTPUT:flow-P')).toBe(false);

    // 边界 P 的独立副结果
    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'flow-P',
    )!;
    const secondaryByFlow = new Map(
      secondary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(secondaryByFlow.get('OUTPUT:flow-P')!.amount, 2, 9);
    expectCloseTo(secondaryByFlow.get('INPUT:flow-raw')!.amount, -6, 9);

    // 交换顺序置换（视图创建顺序不同）：行主选择与结果不变
    const permuted = buildPayload();
    const procBExchanges = permuted.instances[0].process!.exchanges;
    permuted.instances[0].process!.exchanges = [
      procBExchanges[2],
      procBExchanges[1],
      procBExchanges[0],
    ];
    const permutedResult = okResult(permuted);
    const permutedPrimary = permutedResult.groups.find((group) => group.type === 'primary')!;
    const permutedByFlow = new Map(
      permutedPrimary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(permutedByFlow.get('INPUT:flow-raw')!.amount, -4, 9);
    expect(permutedResult.instanceMultipliers.nodeB).toBeUndefined();
  });

  it('preserves small positive activities so material upstream loads are not lost', () => {
    // 复审发现 2 反例：E 产 1、耗 P=1e-13；B 产 P=1、raw=1e13。
    // 精确解 x_B=1e-13 → raw=1（实质负荷）；小活动量不得被吸附为 0。
    const payload: MatrixCalculationPayload = {
      refInstanceIndex: 'nodeE',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_out',
            exchanges: [
              exchange('exB_out', 'OUTPUT', 'flow-P', 1),
              exchange('exB_raw', 'INPUT', 'flow-raw', 1e13),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeE',
              outputFlowId: 'flow-P',
              inputFlowId: 'flow-P',
              edgeId: 'nodeB->nodeE:flow-P',
            },
          ],
        },
        {
          instanceIndex: 'nodeE',
          processId: 'procE',
          processVersion: '1',
          process: {
            id: 'procE',
            version: '1',
            refExchangeInternalId: 'exE_out',
            exchanges: [
              exchange('exE_in', 'INPUT', 'flow-P', 1e-13),
              exchange('exE_out', 'OUTPUT', 'flow-E', 1),
            ],
          },
          connections: [],
        },
      ],
    };

    const result = okResult(payload);
    expect(result.instanceMultipliers.nodeE).toBeCloseTo(1, 12);
    expect(result.instanceMultipliers.nodeB).toBeCloseTo(1e-13, 18);
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const byFlow = new Map(
      primary.exchanges.map((entry) => [`${entry.direction}:${entry.flowId}`, entry]),
    );
    expectCloseTo(byFlow.get('OUTPUT:flow-E')!.amount, 1, 12);
    // 组内连通的 P 交付在主组内抵消，不进入外部清单
    expect(byFlow.has('INPUT:flow-P')).toBe(false);
    // 上游实质负荷：1e13 × 1e-13 = 1
    expectCloseTo(byFlow.get('INPUT:flow-raw')!.amount, -1, 9);
  });

  it('keeps the functional-unit reference exchange for tiny targets and validates it against the target', () => {
    // 复审发现 1 反例：E 产 E=1、耗 raw=1e13，目标 E=1e-13。
    // 活动量 1e-13 是合法量级：功能单位交换与原料负荷都必须完整保留，
    // 且主组必须携带定量参考交换。
    const buildPayload = (scale: number): MatrixCalculationPayload => ({
      refInstanceIndex: 'nodeE',
      targetAmount: 1e-13 * scale,
      instances: [
        {
          instanceIndex: 'nodeE',
          processId: 'procE',
          processVersion: '1',
          process: {
            id: 'procE',
            version: '1',
            refExchangeInternalId: 'exE_out',
            exchanges: [
              exchange('exE_out', 'OUTPUT', 'flow-E', 1 * scale),
              exchange('exE_raw', 'INPUT', 'flow-raw', 1e13 * scale),
            ],
          },
          connections: [],
        },
      ],
    });

    for (const scale of [1, 1e6]) {
      const result = okResult(buildPayload(scale));
      const primary = result.groups.find((group) => group.type === 'primary')!;
      const refExchange = primary.exchanges.find((entry) => entry.quantitativeReference)!;
      expect(refExchange.direction).toBe('OUTPUT');
      expect(refExchange.flowId).toBe('flow-E');
      expectCloseTo(refExchange.amount, 1e-13 * scale, 18);
      const raw = primary.exchanges.find((entry) => entry.flowId === 'flow-raw')!;
      // 单位等价模型：raw 负荷 = 1e13 × 目标/参考量 = scale（原始单位下为 1），
      // 量级过滤不得删除任何一侧
      expectCloseTo(raw.amount, -scale, 9);
      expect(result.instanceMultipliers.nodeE).toBeCloseTo(1e-13, 18);
      // 序列化输出保留功能单位交换
      const serialized = JSON.parse(JSON.stringify(primary)) as typeof primary;
      expect(serialized.exchanges.some((entry) => entry.quantitativeReference)).toBe(true);
      expectCloseTo(
        serialized.exchanges.find((entry) => entry.flowId === 'flow-E')!.amount,
        1e-13 * scale,
        18,
      );
    }
  });

  it('keeps boundary exchanges of different Flow revisions separate', () => {
    // 复审发现 2 反例：星标 E 耗 B 产品 1 与边界原料 R v1 数量 2；
    // B 耗同一 UUID R v2 数量 3。两个修订必须保留为两个边界交换，
    // 不得合并成 -5 并只保留第一个模板。
    const rawRef = (version: string) => ({
      raw: { referenceToFlowDataSet: { '@refObjectId': 'flow-raw', '@version': version } },
    });
    const buildPayload = (): MatrixCalculationPayload => ({
      refInstanceIndex: 'nodeE',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'nodeE',
          processId: 'procE',
          processVersion: '1',
          process: {
            id: 'procE',
            version: '1',
            refExchangeInternalId: 'exE_out',
            exchanges: [
              exchange('exE_inB', 'INPUT', 'flow-B', 1),
              exchange('exE_raw', 'INPUT', 'flow-raw', 2, rawRef('01.00.000')),
              exchange('exE_out', 'OUTPUT', 'flow-E', 1),
            ],
          },
          connections: [],
        },
        {
          instanceIndex: 'nodeB',
          processId: 'procB',
          processVersion: '1',
          process: {
            id: 'procB',
            version: '1',
            refExchangeInternalId: 'exB_out',
            exchanges: [
              exchange('exB_out', 'OUTPUT', 'flow-B', 1),
              exchange('exB_raw', 'INPUT', 'flow-raw', 3, rawRef('02.00.000')),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nodeB',
              downstreamIndex: 'nodeE',
              outputFlowId: 'flow-B',
              inputFlowId: 'flow-B',
              edgeId: 'nodeB->nodeE:flow-B',
            },
          ],
        },
      ],
    });

    for (const reversed of [false, true]) {
      const payload = buildPayload();
      if (reversed) {
        payload.instances = [payload.instances[1], payload.instances[0]];
      }
      const result = okResult(payload);
      const primary = result.groups.find((group) => group.type === 'primary')!;
      const rawExchanges = primary.exchanges.filter((entry) => entry.flowId === 'flow-raw');
      expect(rawExchanges).toHaveLength(2);
      const byVersion = new Map(
        rawExchanges.map((entry) => [
          String(
            (entry.template.raw as { referenceToFlowDataSet?: { '@version'?: string } })
              ?.referenceToFlowDataSet?.['@version'],
          ),
          entry,
        ]),
      );
      expectCloseTo(byVersion.get('01.00.000')!.amount, -2, 9);
      expectCloseTo(byVersion.get('02.00.000')!.amount, -3, 9);
      // B 的产品交付在组内抵消，主组清单只有 E 与两个原料修订
      const refExchange = primary.exchanges.find((entry) => entry.quantitativeReference)!;
      expect(refExchange.flowId).toBe('flow-E');
      expectCloseTo(refExchange.amount, 1, 9);
    }
  });
});

describe('per-exchange product allocation requirements', () => {
  it('rejects a used coproduct without an explicit allocation', () => {
    const result = failCode({
      refInstanceIndex: 'consumer',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'supplier',
          processId: 'supplier',
          processVersion: '1',
          process: {
            id: 'supplier',
            version: '1',
            refExchangeInternalId: 'a',
            exchanges: [
              exchange('a', 'OUTPUT', 'A', 2),
              exchange('b', 'OUTPUT', 'B', 1),
              exchange('raw', 'INPUT', 'raw', 100),
            ],
          },
          connections: [
            {
              upstreamIndex: 'supplier',
              downstreamIndex: 'consumer',
              outputFlowId: 'B',
              inputFlowId: 'B',
              edgeId: 'B',
            },
          ],
        },
        {
          instanceIndex: 'consumer',
          processId: 'consumer',
          processVersion: '1',
          process: {
            id: 'consumer',
            version: '1',
            refExchangeInternalId: 'c',
            exchanges: [exchange('b-in', 'INPUT', 'B', 1), exchange('c', 'OUTPUT', 'C', 1)],
          },
          connections: [],
        },
      ],
    });
    expect(result).toBe('INVALID_ALLOCATION');
  });

  it('attributes electricity, raw material and emissions independently, then reuses allocated inventories', () => {
    const allocate = (a: string, b: string) => ({
      allocation: [
        { '@internalReferenceToCoProduct': '1', '@allocatedFraction': a },
        { '@internalReferenceToCoProduct': '2', '@allocatedFraction': b },
      ],
    });
    const instance = {
      instanceIndex: 'p',
      processId: 'p',
      processVersion: '1',
      connections: [],
      process: {
        id: 'p',
        version: '1',
        refExchangeInternalId: '1',
        exchanges: [
          exchange('1', 'OUTPUT', 'A', 2),
          exchange('2', 'OUTPUT', 'B', 1),
          exchange('3', 'INPUT', 'electricity', 100, { allocations: allocate('70', '30') }),
          exchange('4', 'INPUT', 'raw', 50, { allocations: allocate('40', '60') }),
          exchange('5', 'OUTPUT', 'emission', 10, { allocations: allocate('80', '20') }),
        ],
      },
    };
    const before = JSON.stringify(instance);
    const result = okResult({ refInstanceIndex: 'p', targetAmount: 2, instances: [instance] });
    const primary = result.groups.find((group) => group.type === 'primary')!;
    const secondary = result.groups.find(
      (group) => group.type === 'secondary' && group.pivotFlowId === 'B',
    )!;
    const amount = (group: typeof primary, flow: string) =>
      group.exchanges.find((entry) => entry.flowId === flow)?.amount;
    expect(amount(primary, 'electricity')).toBeCloseTo(-70);
    expect(amount(primary, 'raw')).toBeCloseTo(-20);
    expect(amount(primary, 'emission')).toBeCloseTo(8);
    expect(amount(secondary, 'electricity')).toBeCloseTo(-30);
    expect(amount(secondary, 'raw')).toBeCloseTo(-30);
    expect(amount(secondary, 'emission')).toBeCloseTo(2);
    for (const group of [primary, secondary]) {
      const reference = group.exchanges.find((entry) => entry.quantitativeReference)!;
      const exchanges = group.exchanges.map((entry, index) =>
        exchange(String(index + 1), entry.direction, entry.flowId, entry.amount),
      );
      const referenceIndex = group.exchanges.indexOf(reference);
      const reused = okResult({
        refInstanceIndex: 'result',
        targetAmount: reference.amount,
        instances: [
          {
            instanceIndex: 'result',
            processId: 'result',
            processVersion: '1',
            connections: [],
            process: {
              id: 'result',
              version: '1',
              refExchangeInternalId: String(referenceIndex + 1),
              exchanges,
            },
          },
        ],
      });
      const reusedPrimary = reused.groups.find((entry) => entry.type === 'primary')!;
      for (const flow of ['electricity', 'raw', 'emission']) {
        expect(Math.abs(amount(reusedPrimary, flow)!)).toBeCloseTo(Math.abs(amount(group, flow)!));
      }
    }
    expect(JSON.stringify(instance)).toBe(before);
  });
});
