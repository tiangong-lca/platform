// These paths are the Process schema's structural groups, not editor values.
const PROCESS_FORM_CONTAINER_PATHS = new Set([
  'processInformation',
  'processInformation.dataSetInformation',
  'processInformation.dataSetInformation.name',
  'processInformation.dataSetInformation.classificationInformation',
  'processInformation.quantitativeReference',
  'processInformation.time',
  'processInformation.geography',
  'processInformation.geography.locationOfOperationSupplyOrProduction',
  'processInformation.technology',
  'processInformation.mathematicalRelations',
  'modellingAndValidation',
  'modellingAndValidation.LCIMethodAndAllocation',
  'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness',
  'modellingAndValidation.completeness',
  'modellingAndValidation.validation',
  'modellingAndValidation.complianceDeclarations',
  'administrativeInformation',
  'administrativeInformation.common:commissionerAndGoal',
  'administrativeInformation.dataGenerator',
  'administrativeInformation.dataEntryBy',
  'administrativeInformation.publicationAndOwnership',
  'exchanges',
  'LCIAResults',
]);

const isFormObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const mergeFieldValue = (previous: unknown, current: unknown, path: string): unknown => {
  if (!PROCESS_FORM_CONTAINER_PATHS.has(path) || !isFormObject(current)) {
    // References/selectors, repeated fields and scalar editor values replace
    // atomically, including {}, [], undefined, null and empty strings.
    return current;
  }

  const merged: Record<string, unknown> = isFormObject(previous) ? { ...previous } : {};
  Object.entries(current).forEach(([key, value]) => {
    Object.defineProperty(merged, key, {
      value: mergeFieldValue(merged[key], value, `${path}.${key}`),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });
  return merged;
};

/** Overlay Process fields while retaining absent siblings in schema containers. */
export const mergeProcessFormValues = <T extends object>(
  previous: T | undefined,
  current?: object,
): T => {
  const merged = { ...previous } as Record<string, unknown>;
  Object.entries(current ?? {}).forEach(([key, value]) => {
    Object.defineProperty(merged, key, {
      value: mergeFieldValue(merged[key], value, key),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });
  return merged as T;
};
