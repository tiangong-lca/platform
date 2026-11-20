import { publicEntity } from '../supabase/public';
import { CalculationError, type MatrixResultExchange } from './matrixCalculation/types';

/** Classify the net boundary after internal balances and product allocation. */
export async function classifyResultBoundary(exchanges: MatrixResultExchange[]) {
  const byVersion = new Map<string, Set<string>>();
  for (const exchange of exchanges) {
    if (exchange.quantitativeReference || exchange.amount === 0) continue;
    const version = (exchange.template.raw as any)?.referenceToFlowDataSet?.['@version'];
    if (!version)
      throw new CalculationError('SOURCE_UNAVAILABLE', [
        { code: 'SOURCE_UNAVAILABLE', flowId: exchange.flowId },
      ]);
    const ids = byVersion.get(version) ?? new Set<string>();
    ids.add(exchange.flowId);
    byVersion.set(version, ids);
  }
  let unclassifiedFlow: string | undefined;
  for (const [version, ids] of byVersion) {
    const distinct = [...ids];
    for (let start = 0; start < distinct.length; start += 100) {
      const batch = distinct.slice(start, start + 100);
      const { data, error } = await publicEntity('flows')
        .select('id,json->flowDataSet->modellingAndValidation->LCIMethod->>typeOfDataSet')
        .eq('version', version)
        .in('id', batch);
      if (error) throw new CalculationError('SOURCE_UNAVAILABLE');
      const types = new Map<string, string>(
        (data ?? []).map((row: { id: string; typeOfDataSet: string }) => [
          row.id,
          row.typeOfDataSet,
        ]),
      );
      if (batch.some((id) => types.get(id) === 'Product flow' || types.get(id) === 'Waste flow')) {
        return 'Partly terminated system' as const;
      }
      const missing = batch.find(
        (id) => types.get(id) !== 'Elementary flow' && types.get(id) !== 'Other flow',
      );
      unclassifiedFlow ??= missing;
    }
  }
  if (unclassifiedFlow)
    throw new CalculationError('SOURCE_UNAVAILABLE', [
      { code: 'SOURCE_UNAVAILABLE', flowId: unclassifiedFlow },
    ]);
  return 'LCI result' as const;
}
