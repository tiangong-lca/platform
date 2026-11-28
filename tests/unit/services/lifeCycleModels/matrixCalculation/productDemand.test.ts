import {
  compileAuthoredDemand,
  verifyAuthoredDemand,
} from '@/services/lifeCycleModels/matrixCalculation/authoredDemand';
import { compileModel } from '@/services/lifeCycleModels/matrixCalculation/compile';
import { solveCompiledSystem } from '@/services/lifeCycleModels/matrixCalculation/solve';
import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import type { MatrixCalculationPayload } from '@/services/lifeCycleModels/matrixCalculation/types';

const ex = (internalId: string, direction: 'INPUT' | 'OUTPUT', flowId: string, amount: number) => ({
  internalId,
  direction,
  flowId,
  amount,
});
const edge = (upstreamIndex: string, downstreamIndex: string, flowId: string) => ({
  upstreamIndex,
  downstreamIndex,
  outputFlowId: flowId,
  inputFlowId: flowId,
  edgeId: `${upstreamIndex}->${downstreamIndex}:${flowId}`,
});

function payload(qDemand: number, deadEnd = false): MatrixCalculationPayload {
  return {
    refInstanceIndex: 'R',
    targetAmount: 1,
    instances: [
      {
        instanceIndex: 'R',
        processId: 'R',
        processVersion: '1',
        connections: [],
        process: {
          id: 'R',
          version: '1',
          refExchangeInternalId: 'r',
          exchanges: [
            ex('r', 'OUTPUT', 'r', 1),
            ex('b', 'INPUT', 'b', 1),
            ...(deadEnd ? [] : [ex('c', 'INPUT', 'c', 1)]),
          ],
        },
      },
      {
        instanceIndex: 'B',
        processId: 'B',
        processVersion: '1',
        connections: [edge('B', 'R', 'b')],
        process: {
          id: 'B',
          version: '1',
          refExchangeInternalId: 'b',
          exchanges: [ex('b', 'OUTPUT', 'b', 1), ex('p', 'INPUT', 'p', 100)],
        },
      },
      {
        instanceIndex: 'C',
        processId: 'C',
        processVersion: '1',
        connections: deadEnd ? [] : [edge('C', 'R', 'c')],
        process: {
          id: 'C',
          version: '1',
          refExchangeInternalId: 'c',
          exchanges: [ex('c', 'OUTPUT', 'c', 1), ex('q', 'INPUT', 'q', qDemand)],
        },
      },
      {
        instanceIndex: 'A',
        processId: 'A',
        processVersion: '1',
        connections: [edge('A', 'B', 'p'), edge('A', 'C', 'q')],
        process: {
          id: 'A',
          version: '1',
          refExchangeInternalId: 'p',
          exchanges: [
            {
              ...ex('p', 'OUTPUT', 'p', 100),
              allocations: { allocation: { '@allocatedFraction': '80' } },
            },
            {
              ...ex('q', 'OUTPUT', 'q', 20),
              allocations: { allocation: { '@allocatedFraction': '20' } },
            },
            ex('co2', 'OUTPUT', 'co2', 100),
            ex('raw', 'INPUT', 'raw', 100),
          ],
        },
      },
    ],
  };
}

describe('allocated product demand', () => {
  it.each([10, 20, 30])(
    'solves product demands 100/%s without a joint-production constraint',
    (qDemand) => {
      const response = runMatrixCalculation({
        type: 'calculate',
        runId: 'demand',
        payload: payload(qDemand),
      });
      expect(response.ok).toBe(true);
      if (!response.ok) throw new Error(response.error.code);
      const result = response.result;
      // Standard process instances reproduce the same inventory without source allocations.
      const projected: MatrixCalculationPayload = {
        refInstanceIndex: result.productSystem.refInstanceIndex,
        targetAmount: 1,
        instances: result.productSystem.instances.map((instance) => ({
          instanceIndex: instance.instanceIndex,
          processId: instance.instanceIndex,
          processVersion: '1',
          process: {
            id: instance.instanceIndex,
            version: '1',
            refExchangeInternalId: instance.refExchangeInternalId,
            exchanges: instance.exchanges,
          },
          connections: instance.connections,
        })),
      };
      const roundTrip = runMatrixCalculation({
        type: 'calculate',
        runId: 'projected',
        payload: JSON.parse(JSON.stringify(projected)),
      });
      expect(roundTrip.ok).toBe(true);
      if (!roundTrip.ok) throw new Error(roundTrip.error.code);
      expect(
        roundTrip.result.groups[0].exchanges.find((e) => e.flowId === 'co2')?.amount,
      ).toBeCloseTo(80 + qDemand);
      expect(result.edgeAmounts['A->B:p']).toBeCloseTo(100);
      expect(result.edgeAmounts['A->C:q']).toBeCloseTo(qDemand);
      expect(
        result.views.find((v) => v.instanceIndex === 'A' && v.pivotExchangeId === 'q')?.multiplier,
      ).toBeCloseTo(qDemand / 20);
      const primary = result.groups.find((g) => g.type === 'primary')!;
      expect(primary.exchanges.find((e) => e.flowId === 'co2')?.amount).toBeCloseTo(80 + qDemand);
      expect(primary.exchanges.find((e) => e.flowId === 'raw')?.amount).toBeCloseTo(
        -(80 + qDemand),
      );
      expect(primary.exchanges.some((e) => e.flowId === 'p' || e.flowId === 'q')).toBe(false);
      expect(result.instanceMultipliers.A).toEqual(qDemand === 20 ? 1 : undefined);
    },
  );

  it('solves a terminal product as an independent source-unit scenario, not leftover consumption', () => {
    const response = runMatrixCalculation({
      type: 'calculate',
      runId: 'terminal',
      payload: payload(10, true),
    });
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error.code);
    expect(response.result.edgeAmounts['A->C:q']).toBe(0);
    const main = response.result.groups.find((g) => g.type === 'primary')!;
    const secondary = response.result.groups.find((g) => g.root.instanceIndex === 'C')!;
    expect(main.exchanges.find((e) => e.flowId === 'co2')?.amount).toBeCloseTo(80);
    expect(secondary.exchanges.find((e) => e.flowId === 'c')?.amount).toBeCloseTo(1);
    expect(secondary.exchanges.find((e) => e.flowId === 'co2')?.amount).toBeCloseTo(10);
  });

  it('scales a reference output of 100 to a downstream demand of 10000', () => {
    const model = payload(20);
    model.targetAmount = 100;
    const response = runMatrixCalculation({ type: 'calculate', runId: 'scale', payload: model });
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error.code);
    expect(response.result.edgeAmounts['A->B:p']).toBeCloseTo(10000);
    expect(
      response.result.views.find((v) => v.instanceIndex === 'A' && v.pivotExchangeId === 'p')
        ?.multiplier,
    ).toBeCloseTo(100);
  });

  it('locates a used coproduct without an explicit allocation', () => {
    const model = payload(10);
    model.instances
      .find((instance) => instance.instanceIndex === 'A')!
      .process.exchanges.forEach((exchange) => delete exchange.allocations);
    const response = runMatrixCalculation({ type: 'calculate', runId: 'missing', payload: model });
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('Expected an allocation diagnostic');
    expect(response.error.code).toBe('INVALID_ALLOCATION');
    expect(response.error.issues).toContainEqual(
      expect.objectContaining({ instanceIndex: 'A', exchangeInternalId: 'q' }),
    );
  });
});

describe('authored activity in a result-group save', () => {
  const firstShare = 0.4298339234950875;
  const secondShare = 0.5701660765049125;
  const source = (
    index: string,
    output: string,
    factor: number,
    destination?: string,
    input?: string,
  ): MatrixCalculationPayload['instances'][number] => ({
    instanceIndex: index,
    nodeId: `node-${index}`,
    processId: index,
    processVersion: '1',
    authoredMultiplicationFactor: factor,
    process: {
      id: index,
      version: '1',
      refExchangeInternalId: 'out',
      exchanges: [
        {
          ...ex('out', 'OUTPUT', output, 1),
          raw: { referenceToFlowDataSet: { '@version': '01.00.000' } },
        },
        ...(input ? [ex('in', 'INPUT', input, 1)] : []),
      ],
    },
    connections: destination ? [edge(index, destination, output)] : [],
  });

  const detachedPayload = (): MatrixCalculationPayload => ({
    preserveAuthoredBranches: true,
    refInstanceIndex: '1',
    targetAmount: firstShare,
    instances: [
      source('0', 'feed-a', firstShare, '1'),
      source('1', 'product', firstShare, undefined, 'feed-a'),
      source('2', 'feed-b', secondShare, '3'),
      source('3', 'product', secondShare, undefined, 'feed-b'),
    ],
  });

  it.each([
    'reference direction',
    'primary amount',
    'missing version',
    'different version',
    'overflow',
  ])('diagnoses excluded activity when proof fails for %s', (problem) => {
    const payload = detachedPayload();
    if (problem === 'reference direction')
      payload.instances[1].process.exchanges[0].direction = 'INPUT';
    if (problem === 'primary amount') payload.targetAmount = 1;
    if (problem === 'missing version') delete payload.instances[1].process.exchanges[0].raw;
    if (problem === 'different version') {
      payload.instances[3].process.exchanges[0].raw = {
        referenceToFlowDataSet: { '@version': '02.00.000' },
      };
    }
    if (problem === 'overflow') payload.instances[2].authoredMultiplicationFactor = Infinity;
    const response = runMatrixCalculation({ type: 'calculate', runId: problem, payload });
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: 'NUMERIC_RESULT_INVALID',
        issues: expect.arrayContaining([
          expect.objectContaining({ reason: 'AUTHORED_BRANCH_EXCLUDED', instanceIndex: '3' }),
        ]),
      },
    });
  });

  it('refuses to reconstruct a partial activity vector across a supply edge', () => {
    const payload = detachedPayload();
    delete payload.instances[2].authoredMultiplicationFactor;
    const compiled = compileModel(payload);
    expect(() => compileAuthoredDemand(compiled, solveCompiledSystem(compiled).x, payload)).toThrow(
      'NUMERIC_RESULT_INVALID',
    );
  });

  it('reports the excluded nodes when a second solve differs from the declared activities', () => {
    const payload = detachedPayload();
    const compiled = compileModel(payload);
    const initial = solveCompiledSystem(compiled).x;
    const authored = compileAuthoredDemand(compiled, initial, payload)!;
    expect(() => verifyAuthoredDemand(compiled, initial, authored)).toThrow(
      'NUMERIC_RESULT_INVALID',
    );
  });

  it('recomputes matching detached output demand without overwriting authored activity', () => {
    const payload = detachedPayload();
    delete payload.preserveAuthoredBranches;
    payload.instances[1].process.exchanges.push(ex('power-a', 'INPUT', 'electricity', 1.548));
    payload.instances[3].process.exchanges.push(ex('power-b', 'INPUT', 'electricity', 1.224));
    const request = { type: 'calculate' as const, runId: 'two-branch-save', payload };
    const projection = runMatrixCalculation({
      ...request,
      payload: {
        ...request.payload,
        instances: request.payload.instances.map((instance) => ({
          ...instance,
          authoredMultiplicationFactor: undefined,
        })),
      },
    });
    if (!projection.ok) throw new Error(projection.error.code);
    expect(
      projection.result.productSystem.instances.map((instance) => instance.multiplier),
    ).toEqual([firstShare, firstShare, 0, 0]);
    const retained = runMatrixCalculation({
      ...request,
      payload: { ...request.payload, preserveAuthoredBranches: true },
    });
    if (!retained.ok) throw new Error(JSON.stringify(retained.error));
    expect(retained.result.productSystem.instances.map((instance) => instance.multiplier)).toEqual([
      firstShare,
      firstShare,
      secondShare,
      secondShare,
    ]);
    expect(retained.result.groups).toHaveLength(4);
    expect(retained.result.groups[0].exchanges).toContainEqual(
      expect.objectContaining({ flowId: 'product', quantitativeReference: true, amount: 1 }),
    );
    expect(
      retained.result.groups[0].exchanges.find((entry) => entry.flowId === 'electricity')?.amount,
    ).toBeCloseTo(-1.3632661912124084, 12);
    const stale = structuredClone(request);
    stale.payload.instances[2].authoredMultiplicationFactor = 0.2;
    for (const payload of [request.payload, { ...stale.payload, preserveAuthoredBranches: true }]) {
      expect(runMatrixCalculation({ ...request, payload })).toMatchObject({
        ok: false,
        error: {
          code: 'NUMERIC_RESULT_INVALID',
          issues: [
            { reason: 'AUTHORED_BRANCH_EXCLUDED', instanceIndex: '2', nodeId: 'node-2' },
            { reason: 'AUTHORED_BRANCH_EXCLUDED', instanceIndex: '3', nodeId: 'node-3' },
          ],
        },
      });
    }
  });

  it('accepts a single chain with the same active stored factors', () => {
    const reply = runMatrixCalculation({
      type: 'calculate',
      runId: 'single-branch-save',
      payload: {
        refInstanceIndex: '1',
        targetAmount: 1,
        instances: [source('0', 'feed', 1, '1'), source('1', 'product', 1, undefined, 'feed')],
      },
    });
    if (!reply.ok) throw new Error(reply.error.code);
    expect(reply.result.productSystem.instances.map((instance) => instance.multiplier)).toEqual([
      1, 1,
    ]);
  });
});
