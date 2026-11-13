import { usesBuiltInClassification } from '@/services/classifications/system';
import { getValueAtPath } from './sdkDetails';

type ClassificationMappingOptions = {
  datasetKey: string;
  dataType: string;
};

type FormPath = Array<string | number>;

/** Resolve SDK paths to the collection anchors or inputs mounted by ClassificationSystemsForm. */
export const getClassificationIssueFormName = (
  rootPath: FormPath,
  orderedJson: any,
  { datasetKey, dataType }: ClassificationMappingOptions,
): FormPath | undefined => {
  const informationIndex = rootPath.indexOf('classificationInformation');
  if (informationIndex < 0) return undefined;

  const informationPath = rootPath.slice(0, informationIndex + 1);
  const explicitCollection = rootPath[informationIndex + 1];
  const isElementaryFlow =
    dataType === 'Flow' &&
    orderedJson?.[datasetKey]?.modellingAndValidation?.LCIMethod?.typeOfDataSet ===
      'Elementary flow';
  const activeCollection = isElementaryFlow
    ? 'common:elementaryFlowCategorization'
    : 'common:classification';
  const hasExplicitCollection =
    explicitCollection === 'common:classification' ||
    explicitCollection === 'common:elementaryFlowCategorization';
  const collectionKey =
    dataType === 'Flow'
      ? activeCollection
      : hasExplicitCollection
        ? explicitCollection
        : activeCollection;
  const systemPath = [...informationPath, collectionKey];
  // The inactive Flow editor is unmounted; stale/union leaves can only target the active anchor.
  if (dataType === 'Flow' && hasExplicitCollection && explicitCollection !== activeCollection) {
    return systemPath;
  }
  if (explicitCollection !== undefined && !hasExplicitCollection) return systemPath;
  const suffix = rootPath.slice(informationIndex + 2);
  const systems = getValueAtPath(orderedJson, [datasetKey, ...systemPath]);

  // Missing/empty collections are repaired by the UI after SDK validation has read the source.
  if (!suffix.length || !systems || (Array.isArray(systems) && !systems.length)) {
    return systemPath;
  }

  const explicitSystemIndex = typeof suffix[0] === 'number' ? Number(suffix.shift()) : undefined;
  const systemIndex = explicitSystemIndex ?? 0;
  const system = Array.isArray(systems) ? systems[systemIndex] : systems;
  if (!system) return systemPath;
  const itemPath = Array.isArray(systems) ? [...systemPath, systemIndex] : systemPath;
  if (!suffix.length) return systemPath;

  const classKey =
    collectionKey === 'common:elementaryFlowCategorization' ? 'common:category' : 'common:class';
  if (suffix[0] !== classKey) {
    return classKey === 'common:class' &&
      suffix.length === 1 &&
      (suffix[0] === '@name' || suffix[0] === '@classes')
      ? [...itemPath, ...suffix]
      : systemPath;
  }

  const classPath = [...itemPath, classKey];
  if (classKey === 'common:category' || usesBuiltInClassification(system, dataType)) {
    return [...classPath, 'showValue'];
  }

  const classes = system[classKey];
  const classSuffix = suffix.slice(1);
  if (!classSuffix.length || !classes || (Array.isArray(classes) && !classes.length)) {
    return classPath;
  }

  const explicitClassIndex =
    typeof classSuffix[0] === 'number' ? Number(classSuffix.shift()) : undefined;
  const classIndex = explicitClassIndex ?? 0;
  if (
    classSuffix.length !== 1 ||
    !['@level', '@classId', '#text'].includes(String(classSuffix[0])) ||
    (Array.isArray(classes) && !classes[classIndex])
  ) {
    return classPath;
  }
  // Repeated systems mount arrayOnly class editors, including imported singleton classes.
  return Array.isArray(classes) || Array.isArray(systems)
    ? [...classPath, classIndex, ...classSuffix]
    : [...classPath, ...classSuffix];
};

export const classificationFormNameMatcher = (
  orderedJson: any,
  options: ClassificationMappingOptions,
) => ({
  match: /\.classificationInformation(?:\.|$)/,
  formName: ({ rootPath }: { rootPath: FormPath }): FormPath =>
    getClassificationIssueFormName(rootPath, orderedJson, options) ?? rootPath,
});
