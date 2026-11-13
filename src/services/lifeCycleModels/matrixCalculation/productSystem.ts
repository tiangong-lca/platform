import type { Compilation } from './compile';
import { resolveFraction } from './compile';
import type { MatrixConnectionPayload, MatrixExchangePayload } from './types';

export interface ProductSystemInstance {
  instanceIndex: string;
  sourceInstanceIndex: string;
  sourceExchangeId: string;
  processId: string;
  processVersion: string;
  materialize: boolean;
  multiplier: number;
  refExchangeInternalId: string;
  exchanges: MatrixExchangePayload[];
  connections: MatrixConnectionPayload[];
}

/** A standard process graph: every multiplier scales its entire referenced inventory. */
export interface ProductSystem {
  refInstanceIndex: string;
  instances: ProductSystemInstance[];
}

export const buildProductSystem = (compilation: Compilation, solution: number[]): ProductSystem => {
  const usedIds = new Set(compilation.instances.map((instance) => instance.instanceIndex));
  let nextId = 1;
  const allocateId = () => {
    while (usedIds.has(String(nextId))) nextId += 1;
    const id = String(nextId++);
    usedIds.add(id);
    return id;
  };
  const instanceByView = new Map<string, ProductSystemInstance>();
  for (const source of compilation.instances) {
    const views = compilation.views.filter((view) => view.instanceIndex === source.instanceIndex);
    // Compilation now retains every validated source reference, including
    // intermediate products; its identity never falls back to a coproduct.
    const retainedView = views.find((view) => view.pivotExchangeId === source.refExchangeId);
    for (const view of views) {
      const materialize = source.allocationShape !== 'single';
      const exchanges = materialize
        ? source.exchanges.flatMap((exchange) => {
            const payload = exchange.payload;
            const isPivot = payload.internalId === view.pivotExchangeId;
            if (!isPivot && views.some((other) => other.pivotExchangeId === payload.internalId))
              return [];
            const amount = isPivot
              ? 1
              : (payload.amount! * resolveFraction(source, view, exchange)) / view.pivotAmount;
            if (!isPivot && amount === 0) return [];
            return [{ ...payload, amount, allocations: undefined }];
          })
        : source.exchanges.map((exchange) => exchange.payload);
      instanceByView.set(view.id, {
        instanceIndex: view === retainedView ? source.instanceIndex : allocateId(),
        sourceInstanceIndex: source.instanceIndex,
        sourceExchangeId: view.pivotExchangeId,
        processId: source.processId,
        processVersion: source.processVersion,
        materialize,
        multiplier: solution[view.columnIndex] / (materialize ? 1 : view.pivotAmount),
        refExchangeInternalId: view.pivotExchangeId,
        exchanges,
        connections: [],
      });
    }
  }
  for (const edge of compilation.edges) {
    const supplier = instanceByView.get(edge.supplierViewId)!;
    for (const consumption of edge.consumptions) {
      if (consumption.amount === 0) continue;
      const consumer = instanceByView.get(consumption.viewId)!;
      supplier.connections.push({
        ...edge.connection,
        upstreamIndex: supplier.instanceIndex,
        downstreamIndex: consumer.instanceIndex,
        edgeId: `${supplier.instanceIndex}->${consumer.instanceIndex}:${edge.connection.outputFlowId}`,
      });
    }
  }
  return {
    refInstanceIndex: instanceByView.get(compilation.refViewId)!.instanceIndex,
    instances: [...instanceByView.values()],
  };
};
