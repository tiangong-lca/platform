/**
 * Unit tests for the matrixCalculation validation and compilation edge paths,
 * the LU solve guards (with a controlled ml-matrix fake), the worker entry
 * context, and assemble's balance-issue reporting.
 */

import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import { compileModel } from '@/services/lifeCycleModels/matrixCalculation/compile';
import { solveCompiledSystem } from '@/services/lifeCycleModels/matrixCalculation/solve';
import {
  assertCalculationPayloadValid,
  findConflictingProviderEdges,
  validateCalculationPayload,
} from '@/services/lifeCycleModels/matrixCalculation/validation';
import { CalculationCancelledError } from '@/services/lifeCycleModels/matrixCalculation/types';

/**
 * zh-CN: ml-matrix 假件控制开关；默认 undefined 走真实实现。
 * en-US: ml-matrix fake control switches; undefined defaults to the real module.
 */
const mockLuBehavior: {
  throwOnConstruct?: boolean;
  throwOnSolve?: boolean;
  solution?: 'nonFinite' | 'wrong';
} = {};

jest.mock('ml-matrix', () => {
  const actual = jest.requireActual('ml-matrix');
  class FakeLu {
    // 类型标注内不得出现自由标识符：jest.mock 工厂的提升校验会拒绝
    private mockReal: any;
    constructor(matrix: unknown) {
      if (mockLuBehavior.throwOnConstruct) {
        throw new Error('construct failed');
      }
      this.mockReal = new actual.LuDecomposition(matrix);
    }
    isSingular(): boolean {
      return this.mockReal.isSingular();
    }
    solve(y: unknown) {
      if (mockLuBehavior.throwOnSolve) {
        throw new Error('solve failed');
      }
      if (mockLuBehavior.solution === 'nonFinite') {
        return actual.Matrix.columnVector([Number.NaN]);
      }
      if (mockLuBehavior.solution === 'wrong') {
        return actual.Matrix.columnVector([0.5]);
      }
      return this.mockReal.solve(y);
    }
  }
  return {
    ...actual,
    LuDecomposition: FakeLu,
  };
});

type ExchangeExtra = { allocations?: unknown; raw?: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = Record<string, any>;

const exchange = (
  internalId: string,
  direction: 'INPUT' | 'OUTPUT',
  flowId: string,
  amount: number | null,
  extra: ExchangeExtra = {},
) => ({ internalId, direction, flowId, amount, ...extra });

const baseInstance = (overrides: Record<string, unknown> = {}) => ({
  instanceIndex: 'n0',
  processId: 'p0',
  processVersion: '1',
  process: {
    id: 'p0',
    version: '1',
    refExchangeInternalId: 'e0',
    exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
  },
  connections: [],
  ...overrides,
});

describe('validateCalculationPayload', () => {
  it('reports missing upstream or downstream instances as INVALID_CONNECTION', () => {
    const payload = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          connections: [
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'ghost',
              outputFlowId: 'flow-F0',
              inputFlowId: 'flow-F0',
              edgeId: 'n0->ghost:flow-F0',
            },
          ],
        }),
      ],
    } as never;

    expect(validateCalculationPayload(payload as never)).toEqual([
      expect.objectContaining({ code: 'INVALID_CONNECTION', instanceIndex: 'n0' }),
    ]);
  });

  it('reports connections whose output and input flows differ', () => {
    const payload = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance(),
        baseInstance({
          instanceIndex: 'n1',
          processId: 'p1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'e1',
            exchanges: [exchange('e1', 'OUTPUT', 'flow-F1', 1)],
          },
          connections: [
            {
              upstreamIndex: 'n1',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-other',
              edgeId: 'n1->n0:flow-F1',
            },
          ],
        }),
      ],
    } as never;

    expect(validateCalculationPayload(payload as never)).toEqual([
      expect.objectContaining({ code: 'INVALID_CONNECTION', flowId: 'flow-other' }),
    ]);
  });

  it('reports non-finite exchange amounts with locations', () => {
    const payload = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', null)],
          },
        }),
      ],
    } as never;

    expect(validateCalculationPayload(payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_EXCHANGE_AMOUNT',
          exchangeInternalId: 'e0',
          flowId: 'flow-F0',
        }),
      ]),
    );
  });

  it('reports missing, zero, or absent reference exchanges', () => {
    const zeroRef = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 0),
              exchange('other', 'OUTPUT', 'flow-X', 1),
            ],
          },
        }),
      ],
    } as never;
    expect(validateCalculationPayload(zeroRef)).toEqual([
      expect.objectContaining({ code: 'INVALID_REFERENCE_EXCHANGE', exchangeInternalId: 'e0' }),
    ]);

    const missingRefId = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [baseInstance({ process: { id: 'p0', version: '1', exchanges: [] } })],
    } as never;
    expect(validateCalculationPayload(missingRefId)).toEqual([
      expect.objectContaining({ code: 'INVALID_REFERENCE_EXCHANGE' }),
    ]);
  });

  it('exposes assertCalculationPayloadValid as a throwing wrapper', () => {
    expect(() =>
      assertCalculationPayloadValid({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [],
      } as never),
    ).toThrow(expect.objectContaining({ code: 'EMPTY_MODEL' }));
  });
});

describe('findConflictingProviderEdges', () => {
  const relations = [
    { upstreamIndex: 'A', downstreamIndex: 'T', inputFlowId: 'flow-F', edgeId: 'e1' },
    { upstreamIndex: 'A', downstreamIndex: 'T', inputFlowId: 'flow-G', edgeId: 'e2' },
    { upstreamIndex: 'B', downstreamIndex: 'other', inputFlowId: 'flow-F', edgeId: 'e3' },
  ];

  it('finds conflicts from different upstream sources only', () => {
    expect(
      findConflictingProviderEdges(relations, {
        upstreamIndex: 'B',
        downstreamIndex: 'T',
        inputFlowId: 'flow-F',
      }),
    ).toEqual(['e1']);
  });

  it('ignores excluded edge ids when reconnecting the same edge', () => {
    expect(
      findConflictingProviderEdges(
        [
          ...relations,
          { upstreamIndex: 'B', downstreamIndex: 'T', inputFlowId: 'flow-F', edgeId: 'e4' },
        ],
        { upstreamIndex: 'B', downstreamIndex: 'T', inputFlowId: 'flow-F' },
        ['e4'],
      ),
    ).toEqual(['e1']);
  });

  it('treats the same upstream supplying different inputs as non-conflicting', () => {
    expect(
      findConflictingProviderEdges(relations, {
        upstreamIndex: 'A',
        downstreamIndex: 'T',
        inputFlowId: 'flow-F',
      }),
    ).toEqual([]);
  });
});

describe('compileModel allocation and connection edge paths', () => {
  const compile = (payload: unknown) => compileModel(payload as never);

  it('flags invalid allocation shapes: empty arrays, entries without fractions, unknown or duplicate targets, out-of-range fractions', () => {
    const cases: Array<[string, unknown]> = [
      ['empty-array', { allocation: [] }],
      ['entry-without-fraction', { allocation: [{}] }],
      [
        'unknown-target',
        {
          allocation: [{ '@internalReferenceToCoProduct': 'ghost', '@allocatedFraction': '50' }],
        },
      ],
      [
        'out-of-range-fraction',
        {
          allocation: [{ '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '150' }],
        },
      ],
    ];
    for (const [, allocations] of cases) {
      expect(() =>
        compile({
          refInstanceIndex: 'n0',
          targetAmount: 1,
          instances: [
            baseInstance({
              process: {
                id: 'p0',
                version: '1',
                refExchangeInternalId: 'e0',
                exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1, { allocations })],
              },
            }),
          ],
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
    }
  });

  it('flags mixed targeted and legacy shapes within one instance', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [
                exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                  allocations: {
                    allocation: [
                      { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '60' },
                    ],
                  },
                }),
                exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                  allocations: { allocation: { '@allocatedFraction': '40%' } },
                }),
              ],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
  });

  it('flags multi-output legacy instances with missing or non-closing shares and input allocations', () => {
    const missingShare = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('e1', 'OUTPUT', 'flow-F1', 1),
            ],
          },
        }),
      ],
    };
    expect(() => compile(missingShare)).toThrow(
      expect.objectContaining({ code: 'INVALID_ALLOCATION' }),
    );

    const nonClosing = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '60%' } },
              }),
              exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                allocations: { allocation: { '@allocatedFraction': '30%' } },
              }),
            ],
          },
        }),
      ],
    };
    expect(() => compile(nonClosing)).toThrow(
      expect.objectContaining({ code: 'INVALID_ALLOCATION' }),
    );

    const inputShare = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '100%' } },
              }),
              exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                allocations: { allocation: { '@allocatedFraction': '0%' } },
              }),
              exchange('i0', 'INPUT', 'flow-R', 1, {
                allocations: { allocation: { '@allocatedFraction': '50%' } },
              }),
            ],
          },
        }),
      ],
    };
    expect(() => compile(inputShare)).toThrow(
      expect.objectContaining({ code: 'INVALID_ALLOCATION' }),
    );
  });

  it('flags connections to missing output exchanges and keeps deduplicated edges', () => {
    const payload = {
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
          },
          connections: [
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-ghost',
              inputFlowId: 'flow-ghost',
              edgeId: 'dup',
            },
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-ghost',
              inputFlowId: 'flow-ghost',
              edgeId: 'dup',
            },
          ],
        }),
      ],
    };
    expect(() => compile(payload)).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });

  it('supports input quantitative references in legacy single-output instances and empty reference fallbacks', () => {
    // 单产出 + 旧式份额 → legacy 形态跳过闭合校验；参考交换为输入且无份额 → 兜底 1
    const compilation = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'i0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '100%' } },
              }),
              exchange('i0', 'INPUT', 'flow-R', 1),
            ],
          },
        }),
      ],
    });
    const refView = compilation.viewById.get(compilation.refViewId)!;
    expect(refView.pivotDirection).toBe('INPUT');
    // 输入型枢轴的份额兜底为 1
    expect(compilation.fractionsByView.get('n0::i0')!.get('e0')).toBe(1);
  });

  it('keeps dead-end rows as production when the upstream edge cannot resolve', () => {
    // 上游交换缺失：入边解析失败，死端视图保持生产行（活动量 0），最终报 INVALID_CONNECTION
    expect(() =>
      compile({
        refInstanceIndex: 'nR',
        targetAmount: 1,
        instances: [
          baseInstance({
            instanceIndex: 'nR',
            process: {
              id: 'pr',
              version: '1',
              refExchangeInternalId: 'exR',
              exchanges: [exchange('exR', 'OUTPUT', 'flow-R', 1)],
            },
            connections: [],
          }),
          baseInstance({
            instanceIndex: 'nD',
            processId: 'pd',
            process: {
              id: 'pd',
              version: '1',
              refExchangeInternalId: 'exD',
              exchanges: [
                exchange('exD_in', 'INPUT', 'flow-ghost', 1),
                exchange('exD', 'OUTPUT', 'flow-D', 1),
              ],
            },
            connections: [],
          }),
          {
            ...baseInstance({ instanceIndex: 'nU', processId: 'pu' }),
            connections: [
              {
                upstreamIndex: 'nU',
                downstreamIndex: 'nD',
                outputFlowId: 'flow-ghost',
                inputFlowId: 'flow-ghost',
                edgeId: 'nU->nD:flow-ghost',
              },
            ],
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });

  it('rejects a non-reference product without a declared allocation', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance(),
          baseInstance({
            instanceIndex: 'n1',
            processId: 'p1',
            process: {
              id: 'p1',
              version: '1',
              exchanges: [
                exchange('e1', 'OUTPUT', 'flow-F1', 1),
                exchange('i1', 'INPUT', 'flow-F0', 1),
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
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
  });

  it('reports ambiguous partial declarations but keeps undeclared outputs ordinary', () => {
    // 部分声明（仅 60%，不闭合）属于歧义分配 → 报告数据问题，不自动归一化
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [
                exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                  allocations: { allocation: { '@allocatedFraction': '60%' } },
                }),
                exchange('e1', 'OUTPUT', 'flow-F1', 1),
              ],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
  });

  it('treats null pivot amounts as invalid exchange amounts', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', null)],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_EXCHANGE_AMOUNT' }));
  });

  it('flags reference exchanges that do not resolve to process exchanges', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'ghost',
              exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });

  it('flags zero-amount pivots and missing reference instances', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            connections: [
              {
                upstreamIndex: 'n0',
                downstreamIndex: 'n0',
                outputFlowId: 'flow-F0',
                inputFlowId: 'flow-F0',
                edgeId: 'self',
              },
            ],
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 0)],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_EXCHANGE_AMOUNT' }));

    expect(() =>
      compile({ refInstanceIndex: 'ghost', targetAmount: 1, instances: [baseInstance()] }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_REFERENCE' }));
  });

  it('supports a reference input pivot (treatment) and dead-end driven supply', () => {
    const compilation = compile({
      refInstanceIndex: 'treat',
      targetAmount: 4,
      instances: [
        baseInstance({
          instanceIndex: 'treat',
          processId: 'pt',
          process: {
            id: 'pt',
            version: '1',
            refExchangeInternalId: 'w-in',
            exchanges: [
              exchange('w-in', 'INPUT', 'flow-W', 2),
              exchange('t-out', 'OUTPUT', 'flow-T', 1),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'prod',
          processId: 'pp',
          process: {
            id: 'pp',
            version: '1',
            refExchangeInternalId: 'p-out',
            exchanges: [
              exchange('p-out', 'OUTPUT', 'flow-W', 2),
              exchange('p-in', 'INPUT', 'flow-R', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'prod',
              downstreamIndex: 'treat',
              outputFlowId: 'flow-W',
              inputFlowId: 'flow-W',
              edgeId: 'prod->treat:flow-W',
            },
          ],
        }),
      ],
    });

    const refView = compilation.viewById.get(compilation.refViewId)!;
    expect(refView.pivotDirection).toBe('INPUT');
    // 生产者产出的全部废弃物由处理活动吸收：x_prod = 1 · x_treat
    expect(compilation.entries).toEqual(expect.arrayContaining([{ row: 1, col: 0, value: 1 }]));

    // 输入型枢轴（处理）聚合：枢轴按活动量计入
    const { assembleResult } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/assemble',
    ) as never as {
      assembleResult: (
        c: unknown,
        x: number[],
      ) => {
        groups: Array<{
          type: string;
          exchanges: Array<{ flowId: string; amount: number; quantitativeReference: boolean }>;
        }>;
      };
    };
    const result = assembleResult(compilation, [4, 4]);
    const primary = result.groups.find((group: any) => group.type === 'primary')!;
    // 内部废弃物流抵消；处理后的产出与原料成为边界
    expect(primary.exchanges.find((entry) => entry.flowId === 'flow-W')).toBeUndefined();
    const treated = primary.exchanges.find((entry: any) => entry.flowId === 'flow-T')!;
    expect(treated.amount).toBeCloseTo(2, 9);
    const raw = primary.exchanges.find((entry: any) => entry.flowId === 'flow-R')!;
    expect(raw.amount).toBeCloseTo(-2, 9);
  });

  it('compiles independent product demands and leaves unconnected inputs at the boundary', () => {
    const compilation = compile({
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        baseInstance({
          instanceIndex: 'nPQ',
          processId: 'pq',
          process: {
            id: 'pq',
            version: '1',
            refExchangeInternalId: 'exP',
            exchanges: [
              exchange('exP', 'OUTPUT', 'flow-P', 2, {
                allocations: { allocation: { '@allocatedFraction': '100%' } },
              }),
              exchange('exQ', 'OUTPUT', 'flow-Q', 4, {
                allocations: { allocation: { '@allocatedFraction': '0%' } },
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
        }),
        baseInstance({
          instanceIndex: 'nE',
          processId: 'pe',
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
        }),
      ],
    });

    const qView = compilation.views.find((view) => view.pivotExchangeId === 'exQ')!;
    expect(qView.rowKind).toBe('production');
    // E 的每单位需求消耗 Q 一单位；P 的需求不强制产生 Q。
    expect(compilation.entries).toEqual([{ row: 1, col: 2, value: 1 }]);
  });

  it('attributes standard allocations per target and leaves undeclared exchanges to the reference view', () => {
    const compilation = compile({
      refInstanceIndex: 'nPQ',
      targetAmount: 2,
      instances: [
        baseInstance({
          instanceIndex: 'nPQ',
          processId: 'pq',
          process: {
            id: 'pq',
            version: '1',
            refExchangeInternalId: 'exP',
            exchanges: [
              exchange('exP', 'OUTPUT', 'flow-P', 2),
              exchange('exQ', 'OUTPUT', 'flow-Q', 4),
              exchange('exL', 'INPUT', 'flow-L', 10, {
                allocations: {
                  allocation: [
                    { '@internalReferenceToCoProduct': 'exP', '@allocatedFraction': '60' },
                    { '@internalReferenceToCoProduct': 'exQ', '@allocatedFraction': '40' },
                  ],
                },
              }),
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
        }),
        baseInstance({
          instanceIndex: 'nE',
          processId: 'pe',
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
        }),
      ],
    });

    const fractions = compilation.fractionsByView.get('nPQ::exQ')!;
    // 标准目标分配：exL 对 Q 产品的归属为 40%
    expect(fractions.get('exL')).toBeCloseTo(0.4, 9);
  });

  it('records INVALID_CONNECTION when an edge references an unknown upstream exchange', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
            },
          }),
          baseInstance({
            instanceIndex: 'n1',
            processId: 'p1',
            process: {
              id: 'p1',
              version: '1',
              refExchangeInternalId: 'e1',
              exchanges: [exchange('e1', 'INPUT', 'flow-F0', 1)],
            },
            connections: [],
          }),
          {
            ...baseInstance({ instanceIndex: 'n2', processId: 'p2' }),
            connections: [
              {
                upstreamIndex: 'ghost',
                downstreamIndex: 'n1',
                outputFlowId: 'flow-F0',
                inputFlowId: 'flow-F0',
                edgeId: 'ghost->n1',
              },
            ],
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });
});

describe('solveCompiledSystem numeric guards', () => {
  const buildCompilation = () =>
    compileModel({
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
            exchanges: [{ internalId: 'e0', direction: 'OUTPUT', flowId: 'flow-F0', amount: 1 }],
          },
          connections: [],
        },
      ],
    } as never);

  it('maps LU constructor failures to CALCULATION_FAILED', () => {
    mockLuBehavior.throwOnConstruct = true;
    try {
      expect(() => solveCompiledSystem(buildCompilation())).toThrow(
        expect.objectContaining({ code: 'CALCULATION_FAILED' }),
      );
    } finally {
      mockLuBehavior.throwOnConstruct = false;
    }
  });

  it('maps LU solve failures to MODEL_NOT_SOLVABLE', () => {
    mockLuBehavior.throwOnSolve = true;
    try {
      expect(() => solveCompiledSystem(buildCompilation())).toThrow(
        expect.objectContaining({ code: 'MODEL_NOT_SOLVABLE' }),
      );
    } finally {
      mockLuBehavior.throwOnSolve = false;
    }
  });

  it('maps non-finite solutions to NUMERIC_RESULT_INVALID', () => {
    mockLuBehavior.solution = 'nonFinite';
    try {
      expect(() => solveCompiledSystem(buildCompilation())).toThrow(
        expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
      );
    } finally {
      mockLuBehavior.solution = undefined;
    }
  });

  it('rejects solutions that fail the Mx=y residual check', () => {
    mockLuBehavior.solution = 'wrong';
    try {
      expect(() => solveCompiledSystem(buildCompilation())).toThrow(
        expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
      );
    } finally {
      mockLuBehavior.solution = undefined;
    }
  });
});

describe('runMatrixCalculation worker context and generic failures', () => {
  it('maps unexpected exceptions to CALCULATION_FAILED without leaking library text', () => {
    const response = runMatrixCalculation({
      type: 'calculate',
      runId: 'x',
      payload: {
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: null,
      } as never,
    });
    const failure = response as Extract<typeof response, { ok: false }>;
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('CALCULATION_FAILED');
    expect(failure.error.issues).toEqual([]);
  });

  it('installs the message handler only in a worker global scope', async () => {
    class FakeWorkerGlobalScope {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      posted: unknown[] = [];
      postMessage(message: unknown) {
        this.posted.push(message);
      }
    }
    const fakeSelf = new (
      FakeWorkerGlobalScope as unknown as {
        new (): WorkerGlobalScopeLike;
      }
    )();
    (globalThis as Record<string, unknown>).WorkerGlobalScope = FakeWorkerGlobalScope;
    (globalThis as Record<string, unknown>).self = fakeSelf;

    try {
      jest.isolateModules(() => {
        jest.requireActual('@/services/lifeCycleModels/matrixCalculation/matrixWorker');
        expect(typeof fakeSelf.onmessage).toBe('function');

        const exchange = (
          internalId: string,
          direction: 'INPUT' | 'OUTPUT',
          flowId: string,
          amount: number,
        ) => ({
          internalId,
          direction,
          flowId,
          amount,
        });
        fakeSelf.onmessage?.({
          data: {
            type: 'calculate',
            runId: 'ctx-run',
            payload: {
              refInstanceIndex: 'n0',
              targetAmount: 3,
              instances: [
                {
                  instanceIndex: 'n0',
                  processId: 'p0',
                  processVersion: '1',
                  process: {
                    id: 'p0',
                    version: '1',
                    refExchangeInternalId: 'e0',
                    exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
                  },
                  connections: [],
                },
              ],
            },
          },
        });
        const posted = fakeSelf.posted[0] as {
          ok: boolean;
          runId: string;
          result?: { instanceMultipliers: Record<string, number> };
        };
        expect(posted.ok).toBe(true);
        expect(posted.runId).toBe('ctx-run');
        expect(posted.result?.instanceMultipliers.n0).toBeCloseTo(3, 9);

        // 非 calculate 消息被忽略
        fakeSelf.onmessage?.({ data: { type: 'other' } });
        expect(fakeSelf.posted).toHaveLength(1);
      });
    } finally {
      delete (globalThis as Record<string, unknown>).WorkerGlobalScope;
      delete (globalThis as Record<string, unknown>).self;
    }
  });
});

interface WorkerGlobalScopeLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  posted: unknown[];
  postMessage(message: unknown): void;
}

describe('CalculationCancelledError', () => {
  it('carries the cancellation identity for the save shell mapping', () => {
    const error = new CalculationCancelledError();
    expect(error.name).toBe('CalculationCancelledError');
    expect(error.message).toBe('CALCULATION_CANCELLED');
  });
});

describe('compileModel remaining edge paths', () => {
  const compile = (payload: unknown) => compileModel(payload as never);

  it('rejects malformed Perc fraction values across types', () => {
    const cases: Array<[string, unknown]> = [
      ['numeric-non-finite', Number.NaN],
      ['empty-string', ''],
      ['percent-only', '%'],
      ['non-numeric-string', 'abc'],
      ['whitespace', '   '],
    ];
    for (const [, fraction] of cases) {
      expect(() =>
        compile({
          refInstanceIndex: 'n0',
          targetAmount: 1,
          instances: [
            baseInstance({
              process: {
                id: 'p0',
                version: '1',
                refExchangeInternalId: 'e0',
                exchanges: [
                  exchange('e0', 'OUTPUT', 'flow-F0', 1),
                  exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                    allocations: { allocation: [{ '@allocatedFraction': fraction }] },
                  }),
                ],
              },
            }),
          ],
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
    }
  });

  it('rejects malformed allocation containers and arrays', () => {
    const cases: Array<[string, unknown]> = [
      ['null-allocation', { allocation: null }],
      ['array-with-non-objects', { allocation: [1, 'x'] }],
      [
        'mixed-target-and-targetless',
        {
          allocation: [{ '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '50' }, {}],
        },
      ],
      [
        'duplicate-target',
        {
          allocation: [
            { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '50' },
            { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '50' },
          ],
        },
      ],
      [
        'unknown-target-array',
        {
          allocation: [{ '@internalReferenceToCoProduct': 'ghost', '@allocatedFraction': '100' }],
        },
      ],
      ['string-allocation-field', { allocation: 'not-an-object' }],
      ['null-allocation-field', { allocation: null }],
      ['empty-allocation-object', { allocation: {} }],
      ['targetless-object-with-bad-fraction', { allocation: { '@allocatedFraction': 'abc' } }],
      [
        'unknown-target-object',
        {
          allocation: { '@internalReferenceToCoProduct': 'ghost', '@allocatedFraction': '100' },
        },
      ],
      [
        'out-of-range-target-object',
        {
          allocation: { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': '150' },
        },
      ],
      [
        'unparseable-target-object',
        {
          allocation: { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': 'abc' },
        },
      ],
      ['object-without-fraction', { '@internalReferenceToCoProduct': 'e0' }],
    ];
    for (const [, allocations] of cases) {
      expect(() =>
        compile({
          refInstanceIndex: 'n0',
          targetAmount: 1,
          instances: [
            baseInstance({
              process: {
                id: 'p0',
                version: '1',
                refExchangeInternalId: 'e0',
                exchanges: [
                  exchange('e0', 'OUTPUT', 'flow-F0', 1, { allocations }),
                  exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                    allocations: { allocation: { '@allocatedFraction': '0%' } },
                  }),
                ],
              },
            }),
          ],
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
    }
  });

  it('treats unmatched input flows as zero contributions and rejects exchanges without amounts', () => {
    // 消费端缺少对应输入交换：resolveConsumption 返回 0；有流引用但缺数量 → INVALID_EXCHANGE_AMOUNT
    const compilation = compile({
      refInstanceIndex: 'n0',
      targetAmount: 2,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '100%' } },
              }),
              exchange('i0', 'INPUT', 'flow-F1', 3),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'n1',
          processId: 'p1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'e1',
            exchanges: [
              exchange('e1', 'OUTPUT', 'flow-F1', 1),
              exchange('i1', 'INPUT', 'flow-unlinked', 5),
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
            {
              upstreamIndex: 'n1',
              downstreamIndex: 'n0',
              outputFlowId: 'flow-F1',
              inputFlowId: 'flow-ghost',
              edgeId: 'n1->n0:flow-ghost',
            },
          ],
        }),
      ],
    });
    expect(compilation.views).toHaveLength(2);

    // 有流引用但缺少数量的交换按无效数量拒绝，不再按 0 归属
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [
                exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                  allocations: { allocation: { '@allocatedFraction': '100%' } },
                }),
                exchange('eX', 'OUTPUT', 'flow-X', null, {
                  allocations: { allocation: { '@allocatedFraction': '0%' } },
                }),
              ],
            },
            connections: [],
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_EXCHANGE_AMOUNT' }));

    // 未匹配流按 0 归属，聚合可正常完成（x_n1 = 3 × 2 = 6 与消费平衡一致）
    const { assembleResult } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/assemble',
    ) as never as {
      assembleResult: (c: unknown, x: number[]) => { groups: unknown[] };
    };
    const result = assembleResult(compilation, [2, 6]);
    expect(result.groups).toBeDefined();
  });

  it('rejects an undeclared reference product when legacy coproduct shares are declared', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [
                exchange('e0', 'OUTPUT', 'flow-F0', 1),
                exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                  allocations: { allocation: { '@allocatedFraction': '100%' } },
                }),
                exchange('i0', 'INPUT', 'flow-resource', 10),
              ],
            },
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ALLOCATION' }));
  });

  it('accepts an undeclared non-reference coproduct in a closed legacy allocation', () => {
    // 已声明份额闭合（50/50），第三个连通产品的隐含份额为零。
    const compilation = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: { '@allocatedFraction': '50%' } },
              }),
              exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                allocations: { allocation: { '@allocatedFraction': '50%' } },
              }),
              exchange('e2', 'OUTPUT', 'flow-F2', 2),
            ],
          },
          connections: [
            {
              upstreamIndex: 'n0',
              downstreamIndex: 'n1',
              outputFlowId: 'flow-F2',
              inputFlowId: 'flow-F2',
              edgeId: 'n0->n1:flow-F2',
            },
          ],
        }),
        baseInstance({
          instanceIndex: 'n1',
          processId: 'p1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'r0',
            exchanges: [
              exchange('r0', 'OUTPUT', 'flow-R', 1),
              exchange('i0', 'INPUT', 'flow-F2', 1),
            ],
          },
          connections: [],
        }),
      ],
    });
    const view = compilation.views.find((entry) => entry.pivotExchangeId === 'e2')!;
    expect(view.rowKind).toBe('production');
    expect(compilation.fractionsByView.get(view.id)?.get('e0')).toBe(0);
  });

  it('skips edges whose upstream output exchange is missing and reports INVALID_CONNECTION', () => {
    // 连接引用了上游不存在的输出流：视图构建阶段记录 INVALID_CONNECTION，
    // 失败检查中断编译，不进入边循环
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            connections: [
              {
                upstreamIndex: 'n0',
                downstreamIndex: 'n1',
                outputFlowId: 'flow-ghost',
                inputFlowId: 'flow-ghost',
                edgeId: 'n0->n1:flow-ghost',
              },
            ],
          }),
          baseInstance({
            instanceIndex: 'n1',
            processId: 'p1',
            process: {
              id: 'p1',
              version: '1',
              refExchangeInternalId: 'r0',
              exchanges: [
                exchange('r0', 'OUTPUT', 'flow-R', 1),
                exchange('i0', 'INPUT', 'flow-ghost', 1),
              ],
            },
            connections: [],
          }),
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });

  it('treats connected inputs without amounts as zero consumption during compilation', () => {
    // 非枢轴交换缺数量（编译层防御）：按 0 消费归属编译通过；
    // 完整计算入口会在校验阶段先行拒绝（INVALID_EXCHANGE_AMOUNT）
    const compilation = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1),
              exchange('i0', 'INPUT', 'flow-F1', null),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'n1',
          processId: 'p1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'r0',
            exchanges: [
              exchange('r0', 'OUTPUT', 'flow-F1', 1),
              exchange('i1', 'INPUT', 'flow-raw', 1),
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
        }),
      ],
    });
    expect(compilation.views).toHaveLength(2);

    // 聚合阶段对缺数量交换按 0 归属：n1 无入边活动量为 0，n0 边界输入为 0
    const { assembleResult } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/assemble',
    ) as never as {
      assembleResult: (c: unknown, x: number[]) => { groups: unknown[] };
    };
    const result = assembleResult(compilation, [1, 0]);
    expect(result.groups).toBeDefined();
  });

  it('parses numeric Perc fractions and array/object legacy and targeted single entries', () => {
    // 数值型 Perc（不带百分号）+ 单条目无目标数组 = legacyShare
    const numericLegacy = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1, {
                allocations: { allocation: [{ '@allocatedFraction': 100 }] },
              }),
              exchange('e1', 'OUTPUT', 'flow-F1', 1, {
                allocations: { allocation: [{ '@allocatedFraction': 0 }] },
              }),
            ],
          },
        }),
      ],
    });
    // 旧式统一份额：视图 e0 的全部非枢轴交换按枢轴自身份额（100%）归属
    expect(numericLegacy.fractionsByView.get('n0::e0')!.get('e1')).toBe(1);

    // 对象形态单目标 → targeted
    const targetedObject = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1),
              exchange('e1', 'OUTPUT', 'flow-F1', 1),
              exchange('i0', 'INPUT', 'flow-R', 2, {
                allocations: {
                  allocation: { '@internalReferenceToCoProduct': 'e0', '@allocatedFraction': 100 },
                },
              }),
            ],
          },
        }),
      ],
    });
    // 未声明分配的交换整体归属于参考视图
    expect(targetedObject.fractionsByView.get('n0::e0')!.get('i0')).toBe(1);

    // allocations 字段存在但 allocation 缺失 → 未声明
    const missingAllocationField = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1, { allocations: {} })],
          },
        }),
      ],
    });
    expect(missingAllocationField.fractionsByView.get('n0::e0')!.size).toBe(0);
  });

  it('flags connections whose upstream output exchange cannot back the edge', () => {
    expect(() =>
      compile({
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [exchange('e0', 'OUTPUT', 'flow-F0', 1)],
            },
          }),
          baseInstance({
            instanceIndex: 'n1',
            processId: 'p1',
            process: {
              id: 'p1',
              version: '1',
              refExchangeInternalId: 'e1',
              exchanges: [exchange('e1', 'INPUT', 'flow-F0', 1)],
            },
            connections: [],
          }),
          {
            ...baseInstance({
              instanceIndex: 'n2',
              processId: 'p2',
              process: {
                id: 'p2',
                version: '1',
                refExchangeInternalId: 'e2',
                exchanges: [exchange('e2', 'OUTPUT', 'flow-F0', 1)],
              },
            }),
            connections: [
              {
                upstreamIndex: 'n2',
                downstreamIndex: 'n1',
                outputFlowId: 'flow-missing',
                inputFlowId: 'flow-missing',
                edgeId: 'n2->n1:flow-missing',
              },
            ],
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONNECTION' }));
  });

  it('uses demand equations without creating supply-driven terminal activity', () => {
    // 供应视图同时供应需求驱动消费者与死端：直通行调整项覆盖
    const compilation = compile({
      refInstanceIndex: 'nP0',
      targetAmount: 2,
      instances: [
        baseInstance({
          instanceIndex: 'nP0',
          processId: 'pp0',
          process: {
            id: 'pp0',
            version: '1',
            refExchangeInternalId: 'ex0',
            exchanges: [
              exchange('ex0', 'OUTPUT', 'flow-F0', 1),
              exchange('in0', 'INPUT', 'flow-S', 1),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'nS',
          processId: 'ps',
          process: {
            id: 'ps',
            version: '1',
            refExchangeInternalId: 'exS',
            exchanges: [
              exchange('exS', 'OUTPUT', 'flow-S', 2),
              exchange('inS', 'INPUT', 'flow-R', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nS',
              downstreamIndex: 'nP0',
              outputFlowId: 'flow-S',
              inputFlowId: 'flow-S',
              edgeId: 'nS->nP0:flow-S',
            },
            {
              upstreamIndex: 'nS',
              downstreamIndex: 'nD',
              outputFlowId: 'flow-S',
              inputFlowId: 'flow-S',
              edgeId: 'nS->nD:flow-S',
            },
          ],
        }),
        baseInstance({
          instanceIndex: 'nD',
          processId: 'pd',
          process: {
            id: 'pd',
            version: '1',
            refExchangeInternalId: 'exD',
            exchanges: [
              exchange('exD_in', 'INPUT', 'flow-S', 1),
              exchange('exD', 'OUTPUT', 'flow-D', 1),
            ],
          },
          connections: [],
        }),
      ],
    });

    const deadEnd = compilation.views.find((view) => view.isDeadEnd)!;
    expect(deadEnd.rowKind).toBe('production');
    expect(compilation.entries.some((entry: any) => entry.row === deadEnd.columnIndex)).toBe(false);
  });

  it('keeps zero allocated terminal consumption out of demand coefficients', () => {
    // 死端的参考视图对输入流为稀疏零归属 → 直通行系数为 0
    const compilation = compile({
      refInstanceIndex: 'nS',
      targetAmount: 2,
      instances: [
        baseInstance({
          instanceIndex: 'nS',
          processId: 'ps',
          process: {
            id: 'ps',
            version: '1',
            refExchangeInternalId: 'exS',
            exchanges: [
              exchange('exS', 'OUTPUT', 'flow-S', 2, {
                allocations: { allocation: { '@allocatedFraction': '100%' } },
              }),
              exchange('exS2', 'OUTPUT', 'flow-S2', 1, {
                allocations: { allocation: { '@allocatedFraction': '0%' } },
              }),
              exchange('inS', 'INPUT', 'flow-R', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nS',
              downstreamIndex: 'nD',
              outputFlowId: 'flow-S2',
              inputFlowId: 'flow-S2',
              edgeId: 'nS->nD:flow-S2',
            },
          ],
        }),
        {
          instanceIndex: 'nD',
          processId: 'pd',
          processVersion: '1',
          process: {
            id: 'pd',
            version: '1',
            refExchangeInternalId: 'exD',
            exchanges: [
              exchange('exD_in', 'INPUT', 'flow-S2', 1, {
                allocations: {
                  allocation: [
                    { '@internalReferenceToCoProduct': 'exD_aux', '@allocatedFraction': '100' },
                  ],
                },
              }),
              exchange('exD_aux', 'INPUT', 'flow-Aux', 0.2),
              exchange('exD', 'OUTPUT', 'flow-D', 1),
            ],
          },
          connections: [],
        },
      ],
    });

    const deadEnd = compilation.views.find((view) => view.isDeadEnd)!;
    expect(deadEnd.rowKind).toBe('production');
    expect(
      compilation.entries.some(
        (entry: any) => entry.col === deadEnd.columnIndex && entry.value !== 0,
      ),
    ).toBe(false);
  });
});

describe('assembleResult port-balance issue reporting', () => {
  const { compileModel } = jest.requireActual(
    '@/services/lifeCycleModels/matrixCalculation/compile',
  ) as AnyModule;
  const { assembleResult } = jest.requireActual(
    '@/services/lifeCycleModels/matrixCalculation/assemble',
  ) as AnyModule;

  const compile = (payload: unknown) => compileModel(payload as never);

  it('reports zero-activity branch members and connected pivots that are not fully consumed', () => {
    // 侧支实例（唯一视图仅被死端消费）活动量为零：其死端也归零
    const payload = {
      refInstanceIndex: 'nR',
      targetAmount: 1,
      instances: [
        baseInstance({
          instanceIndex: 'nR',
          processId: 'pr',
          process: {
            id: 'pr',
            version: '1',
            refExchangeInternalId: 'exR',
            exchanges: [
              exchange('exR', 'OUTPUT', 'flow-R', 1),
              exchange('inR', 'INPUT', 'flow-raw', 1),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'nS',
          processId: 'ps',
          process: {
            id: 'ps',
            version: '1',
            refExchangeInternalId: 'exS',
            exchanges: [
              exchange('exS', 'OUTPUT', 'flow-S', 1),
              exchange('inS', 'INPUT', 'flow-R2', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nS',
              downstreamIndex: 'nD',
              outputFlowId: 'flow-S',
              inputFlowId: 'flow-S',
              edgeId: 'nS->nD:flow-S',
            },
          ],
        }),
        baseInstance({
          instanceIndex: 'nD',
          processId: 'pd',
          process: {
            id: 'pd',
            version: '1',
            refExchangeInternalId: 'exD',
            exchanges: [
              exchange('exD_in', 'INPUT', 'flow-S', 1),
              exchange('exD', 'OUTPUT', 'flow-D', 1),
            ],
          },
          connections: [],
        }),
      ],
    };
    const compilation = compile(payload);
    const result = assembleResult(compilation, [1, 0, 0]);
    expect(result.instanceMultipliers.nR).toBeCloseTo(1, 9);
    expect(result.instanceMultipliers.nS).toBeUndefined();
    expect(
      result.groups.find(
        (group: any) => group.type === 'secondary' && group.pivotFlowId === 'flow-D',
      )?.exchanges,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ flowId: 'flow-D', amount: 1 })]));
  });

  it('reports connected pivots that are not fully consumed and inconsistent dead-end pipes', () => {
    const compilation = compile({
      refInstanceIndex: 'n0',
      targetAmount: 1,
      instances: [
        baseInstance({
          process: {
            id: 'p0',
            version: '1',
            refExchangeInternalId: 'e0',
            exchanges: [
              exchange('e0', 'OUTPUT', 'flow-F0', 1),
              exchange('i0', 'INPUT', 'flow-F1', 5e-13),
            ],
          },
          connections: [],
        }),
        baseInstance({
          instanceIndex: 'n1',
          processId: 'p1',
          process: {
            id: 'p1',
            version: '1',
            refExchangeInternalId: 'e1',
            exchanges: [
              exchange('e1', 'OUTPUT', 'flow-F1', 1),
              exchange('i1', 'INPUT', 'flow-F0', 0.25),
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
        }),
      ],
    });

    // 真解为 x = [1/(1-0.125), ...]；构造一个不满足端口平衡的解
    expect(() => assembleResult(compilation, [1, 0.1])).toThrow(
      expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
    );
  });
});

describe('assembleResult grouping edge paths', () => {
  const { assembleResult } = jest.requireActual(
    '@/services/lifeCycleModels/matrixCalculation/assemble',
  ) as AnyModule;

  const compile = (payload: unknown) => compileModel(payload as never);

  const buildABCPayload = () => ({
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
  });

  it('flags reference views that are over-delivered through connected pipes', () => {
    // 参考枢轴输出连通且被需求驱动消费：压低参考活动量触发超额交付
    const payload = {
      refInstanceIndex: 'nR',
      targetAmount: 1,
      instances: [
        {
          instanceIndex: 'nR',
          processId: 'pr',
          processVersion: '1',
          process: {
            id: 'pr',
            version: '1',
            refExchangeInternalId: 'exR',
            exchanges: [
              exchange('exR', 'OUTPUT', 'flow-R', 1),
              exchange('inR', 'INPUT', 'flow-raw', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nR',
              downstreamIndex: 'nC',
              outputFlowId: 'flow-R',
              inputFlowId: 'flow-R',
              edgeId: 'nR->nC:flow-R',
            },
          ],
        },
        {
          instanceIndex: 'nC',
          processId: 'pc',
          processVersion: '1',
          process: {
            id: 'pc',
            version: '1',
            refExchangeInternalId: 'exC',
            exchanges: [
              exchange('exC_in', 'INPUT', 'flow-R', 1),
              exchange('exC', 'OUTPUT', 'flow-C', 1),
            ],
          },
          connections: [],
        },
      ],
    };
    const compilation = compile(payload);
    // 正解 x_R = 1 + x_C；把 x_R 压到 1 而 x_C 保持 3 → 超额交付
    expect(() => assembleResult(compilation, [1, 3])).toThrow(
      expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
    );
  });

  it('reports inconsistent dead-end pipes through the port-balance check', () => {
    const compilation = compile(buildABCPayload());
    // 正确解为 [10, 4, 16/3, 16/3]；篡改死端活动量使直通管失配
    expect(() => assembleResult(compilation, [10, 4, 16 / 3, 1])).toThrow(
      expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
    );
  });

  it('keeps reference-fed dead ends out of the primary group and skips foreign roots in closures', () => {
    const payload = {
      refInstanceIndex: 'nR',
      targetAmount: 2,
      instances: [
        {
          instanceIndex: 'nR',
          processId: 'pr',
          processVersion: '1',
          process: {
            id: 'pr',
            version: '1',
            refExchangeInternalId: 'exR',
            exchanges: [
              exchange('exR', 'OUTPUT', 'flow-R', 1),
              exchange('inR', 'INPUT', 'flow-raw', 1),
            ],
          },
          connections: [
            {
              upstreamIndex: 'nR',
              downstreamIndex: 'nD',
              outputFlowId: 'flow-R',
              inputFlowId: 'flow-R',
              edgeId: 'nR->nD:flow-R',
            },
          ],
        },
        {
          instanceIndex: 'nD',
          processId: 'pd',
          processVersion: '1',
          process: {
            id: 'pd',
            version: '1',
            refExchangeInternalId: 'exD',
            exchanges: [
              exchange('exD_in', 'INPUT', 'flow-R', 1),
              exchange('exD', 'OUTPUT', 'flow-D', 1),
            ],
          },
          connections: [],
        },
      ],
    };
    const compilation = compile(payload);
    const result = assembleResult(compilation, [2, 0]);

    const primary = result.groups.find((group: any) => group.type === 'primary')!;
    // 参考视图的最终需求经死端管道交付：主组边界显示目标量
    const refOutput = primary.exchanges.find((entry: any) => entry.flowId === 'flow-R')!;
    expect(refOutput.amount).toBeCloseTo(2, 9);
    expect(refOutput.quantitativeReference).toBe(true);

    const secondary = result.groups.find(
      (group: any) => group.type === 'secondary' && group.pivotFlowId === 'flow-D',
    )!;
    // 独立副情景包含实际供给它的参考过程，原料需求按自身参考量求解。
    expect(secondary.refProcesses).toEqual(
      expect.arrayContaining([
        { id: 'pd', version: '1' },
        { id: 'pr', version: '1' },
      ]),
    );
    const secondaryInput = secondary.exchanges.find((entry: any) => entry.flowId === 'flow-raw')!;
    expect(secondaryInput.amount).toBeCloseTo(-1, 9);
  });

  it('reports NUMERIC_RESULT_INVALID when a group subsystem solves to a negative activity', () => {
    // 防御性分支：直接以负活动量调用聚合（真实求解阶段不会产生负活动量），
    // 组根锚定负值会让组内成员解出负活动量；T 无归因需求，活动量吸附为 0
    const viewR = {
      id: 'nR::x',
      instanceIndex: 'nR',
      pivotExchangeId: 'x',
      pivotDirection: 'OUTPUT',
      pivotFlowId: 'flow-R',
      pivotAmount: 1,
      isReference: true,
      isDeadEnd: false,
      columnIndex: 0,
      rowKind: 'anchor',
    };
    const viewS = {
      id: 'nS::x',
      instanceIndex: 'nS',
      pivotExchangeId: 'x',
      pivotDirection: 'OUTPUT',
      pivotFlowId: 'flow-S',
      pivotAmount: 1,
      isReference: false,
      isDeadEnd: false,
      columnIndex: 1,
      rowKind: 'production',
    };
    const viewT = {
      id: 'nT::x',
      instanceIndex: 'nT',
      pivotExchangeId: 'x',
      pivotDirection: 'OUTPUT',
      pivotFlowId: 'flow-T',
      pivotAmount: 1,
      isReference: false,
      isDeadEnd: false,
      columnIndex: 2,
      rowKind: 'production',
    };
    const compilation = {
      views: [viewR, viewS, viewT],
      viewById: new Map([
        [viewR.id, viewR],
        [viewS.id, viewS],
        [viewT.id, viewT],
      ]),
      instanceByIndex: new Map([
        [
          'nR',
          {
            instanceIndex: 'nR',
            nodeId: 'node-r',
            refExchangeId: 'x',
            connectedOutputFlowIds: new Set(['flow-R']),
            exchanges: [
              { payload: { internalId: 'x', direction: 'OUTPUT', flowId: 'flow-R', amount: 1 } },
            ],
          },
        ],
        [
          'nS',
          {
            instanceIndex: 'nS',
            nodeId: 'node-s',
            refExchangeId: 'x',
            connectedOutputFlowIds: new Set(['flow-S']),
            exchanges: [
              { payload: { internalId: 'x', direction: 'OUTPUT', flowId: 'flow-S', amount: 1 } },
            ],
          },
        ],
        [
          'nT',
          {
            instanceIndex: 'nT',
            nodeId: 'node-t',
            refExchangeId: 'x',
            connectedOutputFlowIds: new Set(['flow-T']),
            exchanges: [
              { payload: { internalId: 'x', direction: 'OUTPUT', flowId: 'flow-T', amount: 1 } },
            ],
          },
        ],
      ]),
      edges: [
        {
          connection: {
            edgeId: 'nS->nR:flow-S',
            upstreamIndex: 'nS',
            downstreamIndex: 'nR',
            outputFlowId: 'flow-S',
            inputFlowId: 'flow-S',
          },
          supplierViewId: viewS.id,
          consumptions: [{ viewId: viewR.id, amount: 1 }],
          inSystem: true,
        },
        {
          connection: {
            edgeId: 'nT->nR:flow-T',
            upstreamIndex: 'nT',
            downstreamIndex: 'nR',
            outputFlowId: 'flow-T',
            inputFlowId: 'flow-T',
          },
          supplierViewId: viewT.id,
          consumptions: [{ viewId: viewR.id, amount: 0 }],
          inSystem: false,
        },
      ],
      primaryViewIdByInstance: new Map([
        ['nR', viewR.id],
        ['nS', viewS.id],
        ['nT', viewT.id],
      ]),
      demand: [0, 0],
      refViewId: viewR.id,
    } as never;

    expect(() => assembleResult(compilation, [-1, -1, 0])).toThrow(
      expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
    );

    // 容差内的极小负值（数值噪声）在组情景求解中归零（不做量级吸附）；
    // 归零后主组功能单位交换为 0，按新的完整性校验明确失败
    expect(() => assembleResult(compilation, [-1e-15, -1e-15, -1e-15])).toThrow(
      expect.objectContaining({ code: 'NUMERIC_RESULT_INVALID' }),
    );
  });

  it('rejects a singular unit-reuse system before inventory assembly', () => {
    const { runMatrixCalculation } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/matrixWorker',
    );
    const response = runMatrixCalculation({
      type: 'calculate',
      runId: 'singular',
      payload: {
        refInstanceIndex: 'n0',
        targetAmount: 1,
        instances: [
          baseInstance({
            process: {
              id: 'p0',
              version: '1',
              refExchangeInternalId: 'e0',
              exchanges: [
                exchange('e0', 'OUTPUT', 'flow-F0', 1),
                exchange('i0', 'INPUT', 'flow-F0', 1),
              ],
            },
            connections: [
              {
                upstreamIndex: 'n0',
                downstreamIndex: 'n0',
                outputFlowId: 'flow-F0',
                inputFlowId: 'flow-F0',
                edgeId: 'reuse',
              },
            ],
          }),
        ],
      },
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'MODEL_NOT_SOLVABLE' } });
  });
});

describe('buildLifeCycleModelSubmodelRecord rich metadata', () => {
  it('carries present optional metadata fields and NULL geography placeholders through', () => {
    const { buildLifeCycleModelSubmodelRecord } = jest.requireActual(
      '@/services/lifeCycleModels/submodelRecord',
    ) as typeof import('@/services/lifeCycleModels/submodelRecord');
    const record = buildLifeCycleModelSubmodelRecord({
      option: 'update',
      modelId: 'model-id',
      type: 'primary',
      finalId: {
        nodeId: 'n0',
        processId: 'p0',
        allocatedExchangeFlowId: 'f0',
        allocatedExchangeDirection: 'OUTPUT',
      },
      baseName: [{ '@xml:lang': 'en', '#text': 'Name' }],
      newExchanges: [{ '@dataSetInternalID': '1', meanAmount: 3, resultingAmount: 3 }],
      lciaResults: [{ '@id': 'L1' }],
      lciaReport: { evidence: true },
      lifeCycleModelJsonOrdered: {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            dataSetInformation: {
              name: {
                baseName: [{ '@xml:lang': 'en', '#text': 'Model' }],
                treatmentStandardsRoutes: 'tsr',
                mixAndLocationTypes: 'mix',
                functionalUnitFlowProperties: 'funits',
              },
              identifierOfSubDataSet: 'sub-1',
              'common:synonyms': ['syn'],
              classificationInformation: { 'common:classification': { 'common:class': 'class-x' } },
              'common:generalComment': 'comment',
              referenceToExternalDocumentation: {
                '@refObjectId': 'ext-1',
                '@type': 'source data set',
                '@uri': 'u',
                '@version': '1',
                'common:shortDescription': 'ext',
              },
            },
            time: {
              'common:referenceYear': 2024,
              'common:dataSetValidUntil': '2030-01-01',
              'common:timeRepresentativenessDescription': 'repr',
            },
            geography: {
              locationOfOperationSupplyOrProduction: {
                '@location': 'GLO',
                descriptionOfRestrictions: 'd',
              },
              subLocationOfOperationSupplyOrProduction: { '@subLocation': 'RER' },
            },
            technology: {
              technologyDescriptionAndIncludedProcesses: 'tech',
              technologicalApplicability: 'appl',
              referenceToTechnologyPictogramme: { '@refObjectId': 'pic' },
              referenceToTechnologyFlowDiagrammOrPicture: { '@refObjectId': 'dia' },
            },
            mathematicalRelations: {
              modelDescription: 'math',
              variableParameter: { '@name': 'v' },
            },
          },
          modellingAndValidation: {
            LCIMethodAndAllocation: {
              typeOfDataSet: 'LCI',
              LCIMethodPrinciple: 'attributional',
              referenceToLCAMethodDetails: { '@refObjectId': 'm' },
            },
            dataSourcesTreatmentAndRepresentativeness: {
              dataCutOffAndCompletenessPrinciples: 'cut',
              referenceToDataHandlingPrinciples: { '@refObjectId': 'h' },
              referenceToDataSource: { '@refObjectId': 'src' },
              percentageSupplyOrProductionCovered: '100',
              annualSupplyOrProductionVolume: 5,
              samplingProcedure: 'sampling',
              dataCollectionPeriod: '2024',
              uncertaintyAdjustments: 'unc',
              useAdviceForDataSet: 'advice',
            },
            completeness: {
              completenessProductModel: 'model',
              completenessElementaryFlows: { '@type': 't', '@value': 'v' },
              completenessOtherProblemField: 'other',
            },
          },
          administrativeInformation: {
            'common:commissionerAndGoal': {
              'common:referenceToCommissioner': { '@refObjectId': 'c' },
              'common:project': 'proj',
              'common:intendedApplications': 'apps',
            },
            dataGenerator: {
              'common:referenceToPersonOrEntityGeneratingTheDataSet': { '@refObjectId': 'gen' },
            },
            dataEntryBy: {
              'common:timeStamp': 'now',
              'common:referenceToDataSetFormat': { '@refObjectId': 'fmt' },
              'common:referenceToConvertedOriginalDataSetFrom': { '@refObjectId': 'orig' },
              'common:referenceToPersonOrEntityEnteringTheData': { '@refObjectId': 'ent' },
              'common:referenceToDataSetUseApproval': { '@refObjectId': 'appr' },
            },
            publicationAndOwnership: {
              'common:dateOfLastRevision': 'rev',
              'common:dataSetVersion': '1.0',
              'common:permanentDataSetURI': 'uri',
              'common:workflowAndPublicationStatus': 'status',
              'common:referenceToUnchangedRepublication': { '@refObjectId': 'rep' },
              'common:referenceToRegistrationAuthority': { '@refObjectId': 'auth' },
              'common:registrationNumber': 'reg',
              'common:referenceToOwnershipOfDataSet': { '@refObjectId': 'own' },
              'common:copyright': 'copy',
              'common:referenceToEntitiesWithExclusiveAccess': { '@refObjectId': 'exc' },
              'common:licenseType': 'license',
              'common:accessRestrictions': 'restrict',
            },
          },
        },
      },
      refProcesses: [{ id: 'p0', version: '1', 'common:shortDescription': 'P0' }],
    });

    const info = record.data.processDataSet.processInformation.dataSetInformation;
    expect(info.name.treatmentStandardsRoutes).toBe('tsr');
    expect(info.referenceToExternalDocumentation['@refObjectId']).toBe('ext-1');
    const geo = record.data.processDataSet.processInformation.geography;
    expect(geo.locationOfOperationSupplyOrProduction['@location']).toBe('GLO');
    const publication =
      record.data.processDataSet.administrativeInformation.publicationAndOwnership;
    expect(publication['common:licenseType']).toBe('license');
    expect(record.data.processDataSet.exchanges.exchange).toHaveLength(1);
    expect(record.refProcesses[0]['common:shortDescription']).toBe('P0');
  });
});

describe('solveCompiledSystem tiny-activity snapping', () => {
  it('clamps negative noise to zero while preserving small positive activities', () => {
    const { compileModel } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/compile',
    ) as AnyModule;
    const { solveCompiledSystem } = jest.requireActual(
      '@/services/lifeCycleModels/matrixCalculation/solve',
    ) as AnyModule;
    const { LuDecomposition: RealLu, Matrix: RealMatrix } = jest.requireActual(
      'ml-matrix',
    ) as AnyModule;

    const compilation = compileModel({
      refInstanceIndex: 'n0',
      targetAmount: 3,
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
              exchange('i0', 'INPUT', 'flow-F1', 5e-13),
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
              exchange('e1', 'OUTPUT', 'flow-F1', 1e12),
              exchange('i1', 'INPUT', 'flow-raw', 1),
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
    } as never);

    // 在真解第二分量上叠加 1e-13 噪声，验证极小活动量被归零
    const mlModule = require('ml-matrix') as { LuDecomposition: new (m: unknown) => any };
    jest.spyOn(mlModule, 'LuDecomposition').mockImplementation((matrix: unknown) => {
      const real = new (
        RealLu as unknown as new (m: unknown) => {
          isSingular(): boolean;
          solve(rhs: unknown): { to1DArray(): number[] };
        }
      )(matrix);
      return {
        isSingular: () => real.isSingular(),
        solve: (rhs: unknown) => {
          const solved = real.solve(rhs);
          const values = solved.to1DArray();
          // 正噪声方向：小正活动量保留（小活动量不等于可忽略的环境负荷）
          values[1] += 1e-13;
          return RealMatrix.columnVector(values);
        },
      };
    });
    try {
      const { x } = solveCompiledSystem(compilation);
      expect(x[0]).toBeCloseTo(3, 6);
      expect(x[1]).toBeGreaterThan(0);
    } finally {
      jest.restoreAllMocks();
    }

    // 负噪声方向：容差内的极小负值归零（非负活动语义）
    jest.spyOn(mlModule, 'LuDecomposition').mockImplementation((matrix: unknown) => {
      const real = new (
        RealLu as unknown as new (m: unknown) => {
          isSingular(): boolean;
          solve(rhs: unknown): { to1DArray(): number[] };
        }
      )(matrix);
      return {
        isSingular: () => real.isSingular(),
        solve: (rhs: unknown) => {
          const solved = real.solve(rhs);
          const values = solved.to1DArray();
          // 容差内的极小负值（数值噪声）
          values[1] = -1e-13;
          return RealMatrix.columnVector(values);
        },
      };
    });
    try {
      const { x } = solveCompiledSystem(compilation);
      expect(x[0]).toBeCloseTo(3, 6);
      expect(x[1]).toBe(0);
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('buildLifeCycleModelSubmodelRecord without model payload', () => {
  it('falls back to an empty model dataset when the payload is missing', () => {
    const { buildLifeCycleModelSubmodelRecord } = jest.requireActual(
      '@/services/lifeCycleModels/submodelRecord',
    ) as typeof import('@/services/lifeCycleModels/submodelRecord');
    const record = buildLifeCycleModelSubmodelRecord({
      option: 'create',
      modelId: 'm',
      type: 'secondary',
      finalId: {
        nodeId: 'n',
        processId: 'p',
        allocatedExchangeFlowId: 'f',
        allocatedExchangeDirection: 'OUTPUT',
      },
      baseName: [],
      newExchanges: [],
      lciaResults: [],
      lciaReport: {},
      lifeCycleModelJsonOrdered: undefined,
      refProcesses: [],
    });
    expect(record.modelInfo.id).toBe('m');
  });
});

describe('buildLifeCycleModelSubmodelRecord NULL geography', () => {
  it('strips NULL location placeholders and tolerates absent sub-locations', () => {
    const { buildLifeCycleModelSubmodelRecord } = jest.requireActual(
      '@/services/lifeCycleModels/submodelRecord',
    ) as typeof import('@/services/lifeCycleModels/submodelRecord');
    const record = buildLifeCycleModelSubmodelRecord({
      option: 'create',
      modelId: 'm',
      type: 'secondary',
      finalId: {
        nodeId: 'n',
        processId: 'p',
        allocatedExchangeFlowId: 'f',
        allocatedExchangeDirection: 'OUTPUT',
      },
      baseName: [],
      newExchanges: [],
      lciaResults: [],
      lciaReport: {},
      lifeCycleModelJsonOrdered: {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            geography: {
              locationOfOperationSupplyOrProduction: { '@location': 'NULL' },
              subLocationOfOperationSupplyOrProduction: { '@subLocation': 'NULL' },
            },
          },
        },
      },
      refProcesses: [],
    });
    // NULL 占位符变为空对象，随后被 removeEmptyObjects 清除：geography 整体不出现
    expect(record.data.processDataSet.processInformation.geography).toBeUndefined();
  });
});
