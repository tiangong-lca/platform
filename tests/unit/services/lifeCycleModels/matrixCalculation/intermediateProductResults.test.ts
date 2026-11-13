import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import type {
  MatrixCalculationPayload,
  MatrixConnectionPayload,
  MatrixExchangePayload,
  MatrixInstancePayload,
} from '@/services/lifeCycleModels/matrixCalculation/types';

const exchange = (
  id: string,
  direction: 'INPUT' | 'OUTPUT',
  amount: number,
  share?: number,
): MatrixExchangePayload => ({
  internalId: id,
  flowId: id,
  direction,
  amount,
  ...(share === undefined
    ? {}
    : { allocations: { allocation: { '@allocatedFraction': String(share) } } }),
});
const edge = (
  upstreamIndex: string,
  downstreamIndex: string,
  flowId: string,
): MatrixConnectionPayload => ({
  upstreamIndex,
  downstreamIndex,
  inputFlowId: flowId,
  outputFlowId: flowId,
  edgeId: `${upstreamIndex}->${downstreamIndex}:${flowId}`,
});
const instance = (
  id: string,
  reference: string,
  exchanges: MatrixExchangePayload[],
  connections: MatrixConnectionPayload[] = [],
): MatrixInstancePayload => ({
  instanceIndex: id,
  processId: id,
  processVersion: '01.00.000',
  connections,
  process: { id, version: '01.00.000', refExchangeInternalId: reference, exchanges },
});
const calculate = (instances: MatrixInstancePayload[], targetAmount = 10) => {
  const payload: MatrixCalculationPayload = { refInstanceIndex: 'C', targetAmount, instances };
  const response = runMatrixCalculation({ type: 'calculate', runId: 'intermediate', payload });
  if (!response.ok) throw new Error(JSON.stringify(response.error));
  return response.result;
};
const chain = () => [
  instance(
    'A',
    'a',
    [exchange('a', 'OUTPUT', 2), exchange('raw', 'INPUT', 8)],
    [edge('A', 'B', 'a')],
  ),
  instance(
    'B',
    'b',
    [exchange('b', 'OUTPUT', 5), exchange('a', 'INPUT', 3)],
    [edge('B', 'C', 'b')],
  ),
  instance('C', 'c', [exchange('c', 'OUTPUT', 1), exchange('b', 'INPUT', 2)]),
];

describe('independent intermediate product results', () => {
  it('generates every chain product without changing primary demand, multipliers or edge quantities', () => {
    const result = calculate(chain());
    expect(result.groups.map((g) => `${g.type}:${g.pivotFlowId}`).sort()).toEqual([
      'primary:c',
      'secondary:a',
      'secondary:b',
    ]);
    expect(result.instanceMultipliers).toEqual({ A: 6, B: 4, C: 10 });
    expect(result.edgeAmounts).toEqual({ 'A->B:a': 12, 'B->C:b': 20 });
    const primary = result.groups.find((g) => g.type === 'primary')!;
    expect(primary.exchanges.find((e) => e.flowId === 'c')?.amount).toBe(10);
    expect(primary.exchanges.find((e) => e.flowId === 'raw')?.amount).toBe(-48);
    const b = result.groups.find((g) => g.pivotFlowId === 'b')!;
    expect(b.exchanges.find((e) => e.quantitativeReference)?.amount).toBe(5);
    expect(b.exchanges.find((e) => e.flowId === 'raw')?.amount).toBe(-12);
    expect(b.refProcesses.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(b.exchanges.some((e) => e.flowId === 'a' || e.flowId === 'c')).toBe(false);
    const a = result.groups.find((g) => g.pivotFlowId === 'a')!;
    expect(a.exchanges.find((e) => e.quantitativeReference)?.amount).toBe(2);
    expect(a.exchanges.find((e) => e.flowId === 'raw')?.amount).toBe(-8);
    expect(result.productSystem.instances.every((i) => !i.materialize)).toBe(true);
    expect(calculate(chain(), 100).groups.filter((g) => g.type === 'secondary')).toEqual(
      result.groups.filter((g) => g.type === 'secondary'),
    );
  });

  it.each([false, true])(
    'keeps allocated product results when a coproduct acquires a consumer (%s)',
    (connected) => {
      const result = calculate([
        instance(
          'B',
          'p',
          [
            exchange('p', 'OUTPUT', 100, 80),
            exchange('q', 'OUTPUT', 20, 20),
            exchange('emission', 'OUTPUT', 100),
          ],
          [edge('B', 'C', 'p'), ...(connected ? [edge('B', 'C', 'q')] : [])],
        ),
        instance('C', 'c', [
          exchange('c', 'OUTPUT', 1),
          exchange('p', 'INPUT', 10),
          ...(connected ? [exchange('q', 'INPUT', 1)] : []),
        ]),
      ]);
      expect(result.groups.map((g) => g.pivotFlowId).sort()).toEqual(['c', 'p', 'q']);
      const q = result.groups.find((g) => g.pivotFlowId === 'q')!;
      expect(q.exchanges.find((e) => e.quantitativeReference)?.amount).toBe(20);
      expect(q.exchanges.find((e) => e.flowId === 'emission')?.amount).toBe(20);
      expect(q.refProcesses.map((p) => p.id)).toEqual(['B']);
      expect(result.productSystem.instances.filter((i) => i.materialize)).toHaveLength(2);
    },
  );

  it('keeps repeated source processes separate and creates a zero-primary-demand standalone result', () => {
    const sources = chain();
    sources.push({
      ...instance('A2', 'a', [exchange('a', 'OUTPUT', 2), exchange('raw', 'INPUT', 12)]),
      processId: 'A',
    });
    const result = calculate(sources);
    const aResults = result.groups.filter((g) => g.pivotFlowId === 'a');
    expect(aResults).toHaveLength(2);
    expect(
      aResults
        .map((g) => g.exchanges.find((e) => e.flowId === 'raw')?.amount)
        .sort((a, b) => a! - b!),
    ).toEqual([-12, -8]);
    expect(result.productSystem.instances.find((i) => i.instanceIndex === 'A2')?.multiplier).toBe(
      0,
    );
    expect(
      result.groups.find((g) => g.type === 'primary')?.exchanges.find((e) => e.flowId === 'raw')
        ?.amount,
    ).toBe(-48);
  });

  it('solves feedback separately for the intermediate target, including its actual supply dependency', () => {
    const result = calculate(
      [
        instance(
          'B',
          'b',
          [exchange('b', 'OUTPUT', 1), exchange('c', 'INPUT', 0.2), exchange('raw', 'INPUT', 1)],
          [edge('B', 'C', 'b')],
        ),
        instance(
          'C',
          'c',
          [exchange('c', 'OUTPUT', 1), exchange('b', 'INPUT', 0.5)],
          [edge('C', 'B', 'c')],
        ),
      ],
      1,
    );
    expect(result.edgeAmounts['B->C:b']).toBeCloseTo(5 / 9);
    const b = result.groups.find((g) => g.pivotFlowId === 'b')!;
    expect(b.exchanges.find((e) => e.quantitativeReference)?.amount).toBeCloseTo(1);
    expect(b.exchanges.find((e) => e.flowId === 'raw')?.amount).toBeCloseTo(-10 / 9);
    expect(b.refProcesses.map((p) => p.id).sort()).toEqual(['B', 'C']);
    expect(b.exchanges.some((e) => e.flowId === 'c')).toBe(false);
  });

  it('supports a standalone input-reference treatment result without promoting its emissions', () => {
    const sources = chain();
    sources.push(
      instance('T', 'waste', [exchange('waste', 'INPUT', 3), exchange('emission', 'OUTPUT', 7)]),
    );
    const result = calculate(sources);
    const treatment = result.groups.find((g) => g.root.instanceIndex === 'T')!;
    expect(treatment.pivotDirection).toBe('INPUT');
    expect(treatment.exchanges.find((e) => e.quantitativeReference)).toMatchObject({
      direction: 'INPUT',
      amount: -3,
    });
    expect(treatment.exchanges.find((e) => e.flowId === 'emission')?.amount).toBe(7);
    expect(result.groups.some((g) => g.pivotFlowId === 'emission')).toBe(false);
  });
});
