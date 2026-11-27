import type { ProcessExchangeData } from '@/services/processes/data';

/** An explicit amount edit may synchronize its partner. Opening or saving a row does not. */
export function synchronizedAmountEdit(
  changed: Partial<ProcessExchangeData>,
  values: ProcessExchangeData,
): Partial<ProcessExchangeData> {
  if (values.referenceToVariable?.trim()) return {};
  if ('meanAmount' in changed) return { resultingAmount: changed.meanAmount };
  if ('resultingAmount' in changed) return { meanAmount: changed.resultingAmount };
  return {};
}
