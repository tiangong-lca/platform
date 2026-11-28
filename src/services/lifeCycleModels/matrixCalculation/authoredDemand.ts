import type { Compilation, CompiledView } from './compile';
import type { MatrixCalculationPayload, MatrixExchangePayload } from './types';
import { CALCULATION_TOLERANCES, CalculationError } from './types';

const equalActivity = (left: number, right: number) =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <=
    CALCULATION_TOLERANCES.residual * Math.max(Math.abs(left), Math.abs(right));

const flowVersion = (exchange?: MatrixExchangePayload) =>
  (exchange?.raw as { referenceToFlowDataSet?: { '@version'?: string } } | undefined)
    ?.referenceToFlowDataSet?.['@version'];

const pivotVersion = (compiled: Compilation, view: CompiledView) =>
  flowVersion(
    compiled.instanceByIndex.get(view.instanceIndex)?.exchangeById.get(view.pivotExchangeId)
      ?.payload,
  );

const authoredBranchError = (compiled: Compilation, excluded: CompiledView[]) =>
  new CalculationError(
    'NUMERIC_RESULT_INVALID',
    excluded.map((view) => ({
      code: 'NUMERIC_RESULT_INVALID',
      reason: 'AUTHORED_BRANCH_EXCLUDED',
      instanceIndex: view.instanceIndex,
      nodeId: compiled.instanceByIndex.get(view.instanceIndex)!.nodeId,
      flowId: view.pivotFlowId,
    })),
  );

/**
 * Recover explicit final demand from a complete, unchanged canonical activity vector.
 * A detached branch may share the primary output only at the same exact Flow version.
 * Derive its boundary demand from x - A*x and re-solve it as ordinary demand.
 */
export const compileAuthoredDemand = (
  compiled: Compilation,
  primarySolution: number[],
  payload: MatrixCalculationPayload,
): { demand: number[]; expected: number[]; excluded: CompiledView[] } | undefined => {
  const factors = new Map(
    payload.instances.map((instance) => [
      instance.instanceIndex,
      instance.authoredMultiplicationFactor,
    ]),
  );
  const activeSources = new Set(
    compiled.views
      .filter((view) => primarySolution[view.columnIndex] > 0)
      .map((view) => view.instanceIndex),
  );
  const excluded = compiled.views.filter(
    (view) => (factors.get(view.instanceIndex) ?? 0) > 0 && !activeSources.has(view.instanceIndex),
  );
  if (excluded.length === 0) return undefined;

  const fail = () => {
    throw authoredBranchError(compiled, excluded);
  };

  const ref = compiled.viewById.get(compiled.refViewId)!;
  const version = pivotVersion(compiled, ref);
  if (!payload.preserveAuthoredBranches || ref.pivotDirection !== 'OUTPUT' || !version) fail();

  const countBySource = new Map<string, number>();
  for (const view of compiled.views) {
    countBySource.set(view.instanceIndex, (countBySource.get(view.instanceIndex) ?? 0) + 1);
  }
  for (const view of compiled.views) {
    if (primarySolution[view.columnIndex] <= 0) continue;
    const existing = factors.get(view.instanceIndex);
    if (
      countBySource.get(view.instanceIndex) !== 1 ||
      existing === undefined ||
      !equalActivity(existing * view.pivotAmount, primarySolution[view.columnIndex])
    )
      fail();
  }

  const detached = new Set(excluded.map((view) => view.columnIndex));
  if (
    compiled.entries.some(
      ({ row, col, value }) => value !== 0 && detached.has(row) !== detached.has(col),
    )
  ) {
    fail();
  }

  const expected = [...primarySolution];
  for (const view of excluded) {
    const factor = factors.get(view.instanceIndex)!;
    if (countBySource.get(view.instanceIndex) !== 1 || !Number.isFinite(factor)) fail();
    expected[view.columnIndex] = factor * view.pivotAmount;
  }

  const required = new Array<number>(expected.length).fill(0);
  for (const { row, col, value } of compiled.entries) {
    required[row] += value * expected[col];
  }
  const suppliers = new Set(compiled.edges.map((edge) => edge.supplierViewId));
  const demand = [...compiled.demand];
  for (const view of excluded) {
    const activity = expected[view.columnIndex];
    const consumption = required[view.columnIndex];
    if (equalActivity(activity, consumption)) continue;
    if (
      activity < consumption ||
      suppliers.has(view.id) ||
      view.pivotDirection !== ref.pivotDirection ||
      view.pivotFlowId !== ref.pivotFlowId ||
      pivotVersion(compiled, view) !== version
    )
      fail();
    demand[view.columnIndex] = activity - consumption;
  }

  return { demand, expected, excluded };
};

export const verifyAuthoredDemand = (
  compiled: Compilation,
  actual: number[],
  prepared: NonNullable<ReturnType<typeof compileAuthoredDemand>>,
): void => {
  if (actual.every((value, index) => equalActivity(value, prepared.expected[index]))) return;
  throw authoredBranchError(compiled, prepared.excluded);
};
