import { getClassificationIssueFormName } from '@/pages/Utils/validation/classification';
import type { ValidationIssueMessageValues, ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { toIndexedLangTextLeafFormName } from '@/pages/Utils/validation/sdkDetails';

type ProcessSdkValidationIssueLike = {
  code?: string;
  errors?: unknown;
  exact?: boolean;
  expected?: string;
  format?: string;
  input?: unknown;
  inclusive?: boolean;
  maximum?: number;
  message?: string;
  minimum?: number;
  origin?: string;
  params?: ValidationIssueMessageValues;
  path?: PropertyKey[] | string;
  rawCode?: string;
  severity?: 'error' | 'warning' | 'info';
  values?: unknown[];
};

const PROCESS_EXCHANGE_FIELD_LABELS: Record<string, string> = {
  dataDerivationTypeStatus: 'Data derivation type / status',
  dataSourceType: 'Data source type',
  exchangeDirection: 'Exchange direction',
  functionalUnitOrOther: 'Functional unit or other',
  functionType: 'Function type',
  generalComment: 'Comment',
  location: 'Location',
  maximumAmount: 'Maximum amount',
  meanAmount: 'Mean amount',
  minimumAmount: 'Minimum amount',
  quantitativeReference: 'Quantitative reference',
  referenceToFlowDataSet: 'Flow',
  referenceToVariable: 'Reference to variable',
  referencesToDataSource: 'Data source',
  relativeStandardDeviation95In: 'Relative StdDev in %',
  resultingAmount: 'Resulting amount',
  uncertaintyDistributionType: 'Uncertainty distribution type',
};

const PROCESS_TOP_LEVEL_FIELD_LABELS: Record<string, string> = {
  'common:generalComment': 'General comment on data set',
  'quantitativeReference.functionalUnitOrOther': 'Functional unit or other',
  'quantitativeReference.referenceToReferenceFlow': 'Reference flow(s)',
  'quantitativeReference.@type': 'Quantitative reference',
};

const PROCESS_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'processInformation.dataSetInformation.name.baseName',
  'processInformation.dataSetInformation.name.treatmentStandardsRoutes',
  'processInformation.dataSetInformation.name.mixAndLocationTypes',
  'processInformation.dataSetInformation.common:generalComment',
  'processInformation.technology.technologyDescriptionAndIncludedProcesses',
  'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.dataCutOffAndCompletenessPrinciples',
  'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.annualSupplyOrProductionVolume',
  'administrativeInformation.common:commissionerAndGoal.common:intendedApplications',
]);

const PROCESS_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE = 'quantitative_reference_count_invalid';
const PROCESS_EXCHANGES_REQUIRED_VALIDATION_CODE = 'exchanges_required';
const PROCESS_EXCHANGES_REQUIRED_SUMMARY_FIELD_PATH = 'exchanges.requiredSummary';
const PROCESS_QUANTITATIVE_REFERENCE_SUMMARY_FIELD_PATH = 'exchanges.quantitativeReferenceSummary';
const PROCESS_EXCHANGES_FIELD_LABEL = 'Exchanges';
const PROCESS_QUANTITATIVE_REFERENCE_FIELD_LABEL = 'Reference flow(s)';

const normalizeString = (value?: string | null) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const toPathArray = (path?: PropertyKey[] | string): PropertyKey[] => {
  if (Array.isArray(path)) {
    return path;
  }

  if (typeof path === 'string' && path.trim()) {
    return [path];
  }

  return [];
};

const getValueAtPath = (source: any, path: PropertyKey[]) => {
  return path.reduce((currentValue, segment) => {
    if (currentValue === null || currentValue === undefined) {
      return undefined;
    }

    return currentValue[segment as keyof typeof currentValue];
  }, source);
};

const getArrayValues = (value: unknown): any[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
};

const getProcessExchangeList = (source: any) => {
  const formExchangeList = getArrayValues(getValueAtPath(source, ['exchanges', 'exchange']));

  if (formExchangeList.length > 0) {
    return formExchangeList;
  }

  return getArrayValues(getValueAtPath(source, ['processDataSet', 'exchanges', 'exchange']));
};

const getSelectedQuantitativeReferenceExchanges = (source: any) => {
  return getProcessExchangeList(source).filter(
    (exchange) => exchange?.quantitativeReference === true,
  );
};

const getProcessReferenceToReferenceFlow = (source: any) => {
  return (
    normalizeString(
      getValueAtPath(source, [
        'processInformation',
        'quantitativeReference',
        'referenceToReferenceFlow',
      ]),
    ) ??
    normalizeString(
      getValueAtPath(source, [
        'processDataSet',
        'processInformation',
        'quantitativeReference',
        'referenceToReferenceFlow',
      ]),
    )
  );
};

const hasInvalidProcessQuantitativeReferenceSelection = (source: any) => {
  const selectedExchanges = getSelectedQuantitativeReferenceExchanges(source);

  if (selectedExchanges.length > 0) {
    return selectedExchanges.length !== 1;
  }

  if (getProcessReferenceToReferenceFlow(source)) {
    return false;
  }

  return getProcessExchangeList(source).length > 0;
};

const isProcessQuantitativeReferenceSelectionIssue = (path: PropertyKey[]) => {
  return (
    path[0] === 'processDataSet' &&
    path[1] === 'processInformation' &&
    path[2] === 'quantitativeReference' &&
    path[3] !== 'functionalUnitOrOther'
  );
};

export const buildProcessQuantitativeReferenceValidationDetails = (
  source: any,
): ValidationIssueSdkDetail[] => {
  const exchanges = getProcessExchangeList(source);
  const selectedExchanges = getSelectedQuantitativeReferenceExchanges(source);

  if (exchanges.length === 0 || !hasInvalidProcessQuantitativeReferenceSelection(source)) {
    return [];
  }

  const reasonMessage = 'Select exactly one item as the quantitative reference.';
  const details: ValidationIssueSdkDetail[] = [
    {
      fieldKey: 'quantitativeReference',
      fieldLabel: PROCESS_QUANTITATIVE_REFERENCE_FIELD_LABEL,
      fieldPath: PROCESS_QUANTITATIVE_REFERENCE_SUMMARY_FIELD_PATH,
      key: 'exchanges:quantitative-reference-count:section',
      presentation: 'section',
      reasonMessage,
      tabName: 'exchanges',
      validationCode: PROCESS_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    },
  ];

  if (selectedExchanges.length <= 1) {
    return details;
  }

  selectedExchanges.forEach((exchange, index) => {
    const exchangeInternalId =
      normalizeString(exchange?.['@dataSetInternalID']) ?? `quantitative-reference-${index}`;
    const flowReference = exchange?.referenceToFlowDataSet;
    const flowLabel =
      normalizeString(
        getArrayValues(flowReference?.['common:shortDescription'])
          .map((item) => normalizeString(item?.['#text']))
          .find(Boolean),
      ) ?? normalizeString(flowReference?.['@refObjectId']);

    details.push({
      exchangeDirection: normalizeString(exchange?.exchangeDirection)?.toLowerCase(),
      exchangeFlowId: normalizeString(flowReference?.['@refObjectId']),
      exchangeFlowLabel: flowLabel,
      exchangeInternalId,
      fieldKey: 'quantitativeReference',
      fieldLabel: PROCESS_QUANTITATIVE_REFERENCE_FIELD_LABEL,
      fieldPath: `exchange[#${exchangeInternalId}].quantitativeReference`,
      key: `exchanges:quantitative-reference-count:highlight:${exchangeInternalId}`,
      presentation: 'highlight-only',
      reasonMessage,
      tabName: 'exchanges',
      validationCode: PROCESS_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    });
  });

  return details;
};

export const buildProcessExchangesRequiredValidationDetails = (
  source: any,
): ValidationIssueSdkDetail[] => {
  if (getProcessExchangeList(source).length > 0) {
    return [];
  }

  const reasonMessage = 'Add at least one exchange';

  return [
    {
      fieldKey: 'exchanges',
      fieldLabel: PROCESS_EXCHANGES_FIELD_LABEL,
      fieldPath: PROCESS_EXCHANGES_REQUIRED_SUMMARY_FIELD_PATH,
      key: 'exchanges:required:section',
      presentation: 'section',
      reasonMessage,
      suggestedFix: reasonMessage,
      tabName: 'exchanges',
      validationCode: PROCESS_EXCHANGES_REQUIRED_VALIDATION_CODE,
    },
  ];
};

const toRootFormPath = (path: PropertyKey[]): Array<string | number> => {
  return path
    .slice(1)
    .filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    );
};

const getRootPathString = (path: PropertyKey[]) => {
  return toRootFormPath(path).map(String).join('.');
};

const isLangTextEntry = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && ('#text' in value || '@xml:lang' in value);
};

const isLangTextValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => item === undefined || isLangTextEntry(item));
  }

  return isLangTextEntry(value);
};

const toLangTextFormName = (path: PropertyKey[]): Array<string | number> => {
  const formPath = path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );
  const lastSegment = formPath[formPath.length - 1];

  if (lastSegment === '#text' || lastSegment === '@xml:lang') {
    return formPath;
  }

  if (typeof lastSegment === 'number') {
    return [...formPath, '#text'];
  }

  return [...formPath, 0, '#text'];
};

const getListItemIndex = (path: PropertyKey[], segmentName: string) => {
  const segmentIndex = path.findIndex((segment) => segment === segmentName);
  if (segmentIndex < 0) {
    return 0;
  }

  const listIndex = path[segmentIndex + 1];
  return typeof listIndex === 'number' ? listIndex : 0;
};

const getReferenceFormLeaf = (path: PropertyKey[]) => {
  const leaf = path[path.length - 1];
  return leaf === '@version' ? '@version' : '@refObjectId';
};

const getProcessQuantitativeReferenceExchangeIndex = (orderedJson: any) => {
  const exchanges = getArrayValues(
    getValueAtPath(orderedJson, ['processDataSet', 'exchanges', 'exchange']),
  );

  if (exchanges.length === 0) {
    return undefined;
  }

  const referenceFlowId = normalizeString(
    getValueAtPath(orderedJson, [
      'processDataSet',
      'processInformation',
      'quantitativeReference',
      'referenceToReferenceFlow',
    ]),
  );

  if (referenceFlowId) {
    const matchedIndex = exchanges.findIndex(
      (exchange) => normalizeString(exchange?.['@dataSetInternalID']) === referenceFlowId,
    );

    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  const quantitativeOutputIndex = exchanges.findIndex((exchange) => {
    return (
      exchange?.quantitativeReference === true &&
      normalizeString(exchange?.exchangeDirection)?.toLowerCase() === 'output'
    );
  });

  if (quantitativeOutputIndex >= 0) {
    return quantitativeOutputIndex;
  }

  const firstOutputIndex = exchanges.findIndex(
    (exchange) => normalizeString(exchange?.exchangeDirection)?.toLowerCase() === 'output',
  );

  if (firstOutputIndex >= 0) {
    return firstOutputIndex;
  }

  return 0;
};

const getProcessSdkIssueLanguage = (
  orderedJson: any,
  path: PropertyKey[],
  exchangeIndex?: number,
) => {
  if (typeof exchangeIndex !== 'number') {
    return undefined;
  }

  const generalCommentIndex = path.findIndex((segment) => segment === 'generalComment');
  if (generalCommentIndex < 0) {
    return undefined;
  }

  const localizedValueIndex = path[generalCommentIndex + 1];
  if (typeof localizedValueIndex !== 'number') {
    return undefined;
  }

  return normalizeString(
    getValueAtPath(orderedJson, [
      'processDataSet',
      'exchanges',
      'exchange',
      exchangeIndex,
      'generalComment',
      localizedValueIndex,
      '@xml:lang',
    ]),
  );
};

const collectLeafUnionIssues = (
  issue: ProcessSdkValidationIssueLike,
): ProcessSdkValidationIssueLike[] => {
  if (issue.code !== 'invalid_union' || !Array.isArray(issue.errors)) {
    return [{ ...issue, path: toPathArray(issue.path) }];
  }

  const branchIssues = issue.errors.flatMap((branch) => {
    return Array.isArray(branch) ? branch : [];
  }) as ProcessSdkValidationIssueLike[];

  if (branchIssues.length === 0) {
    return [{ ...issue, path: toPathArray(issue.path) }];
  }

  return branchIssues.flatMap((branchIssue) =>
    collectLeafUnionIssues({
      ...branchIssue,
      path: [...toPathArray(issue.path), ...toPathArray(branchIssue.path)],
    }),
  );
};

const resolveProcessSdkIssue = (
  issue: ProcessSdkValidationIssueLike,
): ProcessSdkValidationIssueLike => {
  if (issue.code !== 'invalid_union') {
    return {
      ...issue,
      path: toPathArray(issue.path),
    };
  }

  const leafIssues = collectLeafUnionIssues(issue);
  const preferredLeafIssue =
    leafIssues.find(
      (candidate) => toPathArray(candidate.path).length > toPathArray(issue.path).length,
    ) ??
    leafIssues.find((candidate) => candidate.code !== 'invalid_type') ??
    leafIssues[0];

  return {
    ...preferredLeafIssue,
    path: toPathArray(preferredLeafIssue?.path),
  };
};

export const getProcessSdkIssueTabName = (issue: ProcessSdkValidationIssueLike) => {
  const issuePath = toPathArray(issue.path);
  const section = typeof issuePath[1] === 'string' ? issuePath[1] : undefined;

  if (section === 'processInformation' && issuePath[2] === 'quantitativeReference') {
    return 'exchanges';
  }

  return section;
};

const getProcessSdkIssueFieldPath = (path: PropertyKey[], exchangeInternalId?: string) => {
  const exchangeIndex = path.findIndex((segment) => segment === 'exchange');
  if (exchangeIndex >= 0 && typeof path[exchangeIndex + 1] === 'number') {
    const exchangeFieldPath = path
      .slice(exchangeIndex + 2)
      .map(String)
      .filter(Boolean);
    const exchangePrefix = exchangeInternalId
      ? `exchange[#${exchangeInternalId}]`
      : `exchange[${Number(path[exchangeIndex + 1]) + 1}]`;

    return exchangeFieldPath.length > 0
      ? `${exchangePrefix}.${exchangeFieldPath.join('.')}`
      : exchangePrefix;
  }

  return path.slice(1).map(String).filter(Boolean).join('.');
};

const getProcessSdkIssueFieldKey = (path: PropertyKey[]) => {
  const exchangeIndex = path.findIndex((segment) => segment === 'exchange');

  if (exchangeIndex >= 0 && typeof path[exchangeIndex + 1] === 'number') {
    const fieldSegment = path[exchangeIndex + 2];
    return typeof fieldSegment === 'string' ? fieldSegment : undefined;
  }

  if (path[1] === 'processInformation' && path[2] === 'quantitativeReference') {
    if (path[3] === 'functionalUnitOrOther') {
      return 'functionalUnitOrOther';
    }

    return 'quantitativeReference';
  }

  const fieldSegment = path[path.length - 1];
  if (fieldSegment === '#text' || fieldSegment === '@xml:lang') {
    const previousSegment = path[path.length - 2];
    return typeof previousSegment === 'string' ? previousSegment : undefined;
  }

  return typeof fieldSegment === 'string' ? fieldSegment : undefined;
};

const getProcessSdkIssueFieldLabel = (
  path: PropertyKey[],
  orderedJson: any,
  exchangeIndex?: number,
) => {
  const fieldKey = getProcessSdkIssueFieldKey(path);
  const language = getProcessSdkIssueLanguage(orderedJson, path, exchangeIndex);

  if (fieldKey && fieldKey in PROCESS_EXCHANGE_FIELD_LABELS) {
    if (fieldKey === 'generalComment' && language) {
      return `${PROCESS_EXCHANGE_FIELD_LABELS[fieldKey]} (${language.toUpperCase()})`;
    }

    return PROCESS_EXCHANGE_FIELD_LABELS[fieldKey];
  }

  if (path[1] === 'processInformation' && typeof path[2] === 'string') {
    const topLevelPath = path.slice(2).map(String).join('.');
    if (topLevelPath in PROCESS_TOP_LEVEL_FIELD_LABELS) {
      return PROCESS_TOP_LEVEL_FIELD_LABELS[topLevelPath];
    }
  }

  if (fieldKey === '#text' && typeof path[path.length - 2] === 'string') {
    return String(path[path.length - 2]);
  }

  return fieldKey ? fieldKey : 'Field';
};

const getProcessSdkIssueExchangeFormName = (
  path: PropertyKey[],
  orderedJson: any,
): Array<string | number> | undefined => {
  const exchangePathIndex = path.findIndex((segment) => segment === 'exchange');
  if (exchangePathIndex < 0) {
    return undefined;
  }
  const exchangeIndex = path[exchangePathIndex + 1];
  if (typeof exchangeIndex !== 'number') {
    return undefined;
  }

  const exchangePath = path
    .slice(exchangePathIndex + 2)
    .filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    );
  const fieldSegment = exchangePath[0];

  if (fieldSegment === 'referenceToFlowDataSet') {
    return ['referenceToFlowDataSet', getReferenceFormLeaf(exchangePath)];
  }

  if (fieldSegment === 'referencesToDataSource') {
    const listIndex = getListItemIndex(exchangePath, 'referenceToDataSource');
    return [
      'referencesToDataSource',
      'referenceToDataSource',
      listIndex,
      getReferenceFormLeaf(exchangePath),
    ];
  }

  if (fieldSegment === 'generalComment' || fieldSegment === 'functionalUnitOrOther') {
    const parentValue = getValueAtPath(orderedJson, [
      'processDataSet',
      'exchanges',
      'exchange',
      exchangeIndex,
      ...exchangePath.slice(0, -1),
    ]);

    return toIndexedLangTextLeafFormName(toLangTextFormName(exchangePath), parentValue);
  }

  if (fieldSegment === 'quantitativeReference') {
    return ['quantitativeReference'];
  }

  return exchangePath;
};

const getProcessSdkIssueRootFormName = (
  path: PropertyKey[],
  orderedJson: any,
): Array<string | number> => {
  const rootPath = toRootFormPath(path);
  const rootPathString = getRootPathString(path);
  const actualValue = getValueAtPath(orderedJson, path);

  const classificationFormName = getClassificationIssueFormName(rootPath, orderedJson, {
    datasetKey: 'processDataSet',
    dataType: 'Process',
  });
  if (classificationFormName) return classificationFormName;

  if (
    rootPathString === 'processInformation.geography.locationOfOperationSupplyOrProduction' ||
    rootPathString.startsWith(
      'processInformation.geography.locationOfOperationSupplyOrProduction.@location',
    )
  ) {
    return [
      'processInformation',
      'geography',
      'locationOfOperationSupplyOrProduction',
      '@location',
    ];
  }

  if (
    rootPathString === 'processInformation.geography.subLocationOfOperationSupplyOrProduction' ||
    rootPathString.startsWith(
      'processInformation.geography.subLocationOfOperationSupplyOrProduction.@subLocation',
    )
  ) {
    return [
      'processInformation',
      'geography',
      'subLocationOfOperationSupplyOrProduction',
      '@subLocation',
    ];
  }

  if (
    rootPathString ===
      'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource' ||
    rootPathString.startsWith(
      'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource.',
    )
  ) {
    const listIndex = getListItemIndex(rootPath, 'referenceToDataSource');
    return [
      'modellingAndValidation',
      'dataSourcesTreatmentAndRepresentativeness',
      'referenceToDataSource',
      listIndex,
      getReferenceFormLeaf(rootPath),
    ];
  }

  if (rootPathString === 'administrativeInformation.common:commissionerAndGoal') {
    return [
      'administrativeInformation',
      'common:commissionerAndGoal',
      'common:referenceToCommissioner',
      '@refObjectId',
    ];
  }

  if (
    typeof rootPath[rootPath.length - 1] === 'string' &&
    (String(rootPath[rootPath.length - 1]).startsWith('referenceTo') ||
      String(rootPath[rootPath.length - 1]).startsWith('common:referenceTo'))
  ) {
    return [...rootPath, '@refObjectId'];
  }

  if (rootPath[rootPath.length - 1] === '#text' || rootPath[rootPath.length - 1] === '@xml:lang') {
    const parentValue = getValueAtPath(orderedJson, path.slice(0, -1));

    return toIndexedLangTextLeafFormName(rootPath, parentValue);
  }

  if (isLangTextValue(actualValue) || PROCESS_REQUIRED_LANG_TEXT_FIELDS.has(rootPathString)) {
    return toLangTextFormName(rootPath);
  }

  return rootPath;
};

const getProcessSdkIssueResolvedExchangeIndex = (path: PropertyKey[], orderedJson: any) => {
  const exchangeIndexPosition = path.findIndex((segment) => segment === 'exchange');
  if (exchangeIndexPosition >= 0 && typeof path[exchangeIndexPosition + 1] === 'number') {
    return Number(path[exchangeIndexPosition + 1]);
  }

  if (path[1] === 'processInformation' && path[2] === 'quantitativeReference') {
    return getProcessQuantitativeReferenceExchangeIndex(orderedJson);
  }

  return undefined;
};

const getProcessSdkIssueFormName = (
  path: PropertyKey[],
  orderedJson: any,
  exchangeIndex?: number,
): Array<string | number> | undefined => {
  if (typeof exchangeIndex === 'number') {
    if (path[1] === 'processInformation' && path[2] === 'quantitativeReference') {
      if (path[3] === 'functionalUnitOrOther') {
        const formName = toLangTextFormName(['functionalUnitOrOther', ...path.slice(4)]);
        const parentValue = getValueAtPath(orderedJson, [
          'processDataSet',
          'exchanges',
          'exchange',
          exchangeIndex,
          ...path.slice(3, -1),
        ]);

        return toIndexedLangTextLeafFormName(formName, parentValue);
      }

      return ['quantitativeReference'];
    }

    return getProcessSdkIssueExchangeFormName(path, orderedJson);
  }

  return getProcessSdkIssueRootFormName(path, orderedJson);
};

const stringifyProcessSdkFormName = (
  formName: Array<string | number> | undefined,
  exchangeInternalId?: string,
  fallbackPath?: string,
) => {
  if (!formName || formName.length === 0) {
    return fallbackPath ?? '';
  }

  const serializedFormName = formName.map(String).join('.');

  if (!exchangeInternalId) {
    return serializedFormName;
  }

  return `exchange[#${exchangeInternalId}].${serializedFormName}`;
};

const getActualValueLength = (value: unknown) => {
  if (typeof value === 'string') {
    return value.length;
  }

  return undefined;
};

const getProcessSdkValidationCode = (
  issue: ProcessSdkValidationIssueLike,
  actualValue: unknown,
) => {
  if (actualValue === undefined) {
    switch (issue.code) {
      case 'required_missing':
      case 'invalid_type':
      case 'invalid_union':
      case 'invalid_value':
      case 'custom':
      case 'unknown':
        return 'required_missing';
      default:
        break;
    }
  }

  return issue.code ?? 'unknown';
};

const getProcessSdkIssueReason = (issue: ProcessSdkValidationIssueLike, actualValue: unknown) => {
  const actualLength = getActualValueLength(actualValue);
  const actualType =
    actualValue === undefined
      ? 'undefined'
      : Array.isArray(actualValue)
        ? 'array'
        : actualValue === null
          ? 'null'
          : typeof actualValue;
  const validationParams: ValidationIssueMessageValues = {
    ...(issue.params ?? {}),
  };
  const validationCode = getProcessSdkValidationCode(issue, actualValue);

  switch (validationCode) {
    case 'string_too_long': {
      const maximum =
        typeof validationParams.maximum === 'number' ? validationParams.maximum : issue.maximum;
      const actual =
        typeof validationParams.actualLength === 'number'
          ? validationParams.actualLength
          : actualLength;

      validationParams.maximum = maximum;
      validationParams.actualLength = actual;

      return {
        actual,
        limit: maximum,
        reasonMessage:
          typeof actual === 'number' && typeof maximum === 'number'
            ? `Text length ${actual} exceeds maximum ${maximum}`
            : (issue.message ?? 'Validation failed'),
        suggestedFix:
          typeof maximum === 'number'
            ? `Shorten this text to ${maximum} characters or fewer.`
            : undefined,
        validationCode,
        validationParams,
      };
    }
    case 'string_too_short': {
      const minimum =
        typeof validationParams.minimum === 'number' ? validationParams.minimum : issue.minimum;
      const actual =
        typeof validationParams.actualLength === 'number'
          ? validationParams.actualLength
          : actualLength;

      validationParams.minimum = minimum;
      validationParams.actualLength = actual;

      return {
        actual,
        limit: minimum,
        reasonMessage:
          typeof actual === 'number' && typeof minimum === 'number'
            ? `Text length ${actual} is below minimum ${minimum}`
            : (issue.message ?? 'Validation failed'),
        suggestedFix:
          typeof minimum === 'number'
            ? `Expand this text to at least ${minimum} characters.`
            : undefined,
        validationCode,
        validationParams,
      };
    }
    case 'required_missing': {
      validationParams.expected =
        typeof validationParams.expected === 'string' ? validationParams.expected : issue.expected;

      return {
        reasonMessage: issue.message ?? 'Required value is missing',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode,
        validationParams,
      };
    }
    case 'invalid_type': {
      validationParams.expected =
        typeof validationParams.expected === 'string' ? validationParams.expected : issue.expected;
      validationParams.received =
        typeof validationParams.received === 'string' ? validationParams.received : actualType;

      return {
        reasonMessage:
          typeof validationParams.expected === 'string' &&
          typeof validationParams.received === 'string'
            ? `Expected ${validationParams.expected} but found ${validationParams.received}`
            : (issue.message ?? 'Validation failed'),
        suggestedFix:
          validationParams.received === 'undefined'
            ? 'Fill in the required value for this field.'
            : undefined,
        validationCode,
        validationParams,
      };
    }
    case 'invalid_format': {
      validationParams.format =
        typeof validationParams.format === 'string' ? validationParams.format : issue.format;

      return {
        reasonMessage:
          issue.message ??
          (typeof validationParams.format === 'string'
            ? `Invalid ${validationParams.format} format`
            : 'Validation failed'),
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode,
        validationParams,
      };
    }
    case 'invalid_value':
    case 'array_too_small':
    case 'array_too_large':
    case 'number_too_small':
    case 'number_too_large':
    case 'unrecognized_keys':
    case 'invalid_union':
    case 'custom':
    case 'unknown':
      return {
        reasonMessage: issue.message ?? 'Validation failed',
        suggestedFix:
          actualValue === undefined ? 'Fill in the required value for this field.' : undefined,
        validationCode,
        validationParams,
      };
    default:
      return {
        reasonMessage: issue.message ?? 'Validation failed',
        suggestedFix:
          actualValue === undefined ? 'Fill in the required value for this field.' : undefined,
        validationCode,
        validationParams,
      };
  }
};

const getExchangeContext = (orderedJson: any, exchangeIndex?: number) => {
  if (typeof exchangeIndex !== 'number') {
    return undefined;
  }

  const exchange = getValueAtPath(orderedJson, [
    'processDataSet',
    'exchanges',
    'exchange',
    exchangeIndex,
  ]);
  if (!exchange || typeof exchange !== 'object') {
    return undefined;
  }

  const flowReference = exchange.referenceToFlowDataSet;
  const flowLabel =
    normalizeString(
      getArrayValues(flowReference?.['common:shortDescription'])
        .map((item) => normalizeString(item?.['#text']))
        .find(Boolean),
    ) ?? normalizeString(flowReference?.['@refObjectId']);

  return {
    exchangeDirection: normalizeString(exchange.exchangeDirection)?.toLowerCase(),
    exchangeFlowId: normalizeString(flowReference?.['@refObjectId']),
    exchangeFlowLabel: flowLabel,
    exchangeInternalId: normalizeString(exchange['@dataSetInternalID']),
  };
};

const toProcessSdkValidationDetail = (
  issue: ProcessSdkValidationIssueLike,
  orderedJson: any,
): ValidationIssueSdkDetail | null => {
  const rawPath = toPathArray(issue.path);

  if (
    rawPath.length > 0 &&
    isProcessQuantitativeReferenceSelectionIssue(rawPath) &&
    hasInvalidProcessQuantitativeReferenceSelection(orderedJson)
  ) {
    return null;
  }

  const resolvedIssue = resolveProcessSdkIssue(issue);
  const path = toPathArray(resolvedIssue.path);
  if (path.length === 0) {
    return null;
  }

  const exchangeIndex = getProcessSdkIssueResolvedExchangeIndex(path, orderedJson);
  const exchangeContext = getExchangeContext(orderedJson, exchangeIndex);
  const formName = getProcessSdkIssueFormName(path, orderedJson, exchangeIndex);
  const actualValue =
    resolvedIssue.input !== undefined ? resolvedIssue.input : getValueAtPath(orderedJson, path);
  const fieldKey = getProcessSdkIssueFieldKey(path);
  const { actual, limit, reasonMessage, suggestedFix, validationCode, validationParams } =
    getProcessSdkIssueReason(resolvedIssue, actualValue);
  const fallbackFieldPath = getProcessSdkIssueFieldPath(path, exchangeContext?.exchangeInternalId);
  const fieldPath = stringifyProcessSdkFormName(
    formName,
    exchangeContext?.exchangeInternalId,
    fallbackFieldPath,
  );

  return {
    actual,
    exchangeDirection: exchangeContext?.exchangeDirection,
    exchangeFlowId: exchangeContext?.exchangeFlowId,
    exchangeFlowLabel: exchangeContext?.exchangeFlowLabel,
    exchangeIndex,
    exchangeInternalId: exchangeContext?.exchangeInternalId,
    fieldKey,
    fieldLabel: getProcessSdkIssueFieldLabel(path, orderedJson, exchangeIndex),
    fieldPath,
    formName,
    key: [
      getProcessSdkIssueTabName(resolvedIssue) ?? 'unknown',
      exchangeContext?.exchangeInternalId ?? exchangeIndex ?? 'root',
      fieldPath,
      validationCode,
      JSON.stringify(validationParams),
    ].join(':'),
    limit,
    presentation: 'field',
    rawCode: resolvedIssue.rawCode ?? resolvedIssue.code,
    reasonMessage,
    suggestedFix,
    tabName: getProcessSdkIssueTabName(resolvedIssue),
    validationCode,
    validationParams,
  };
};

export const normalizeProcessSdkValidationDetails = (
  issues: ProcessSdkValidationIssueLike[],
  orderedJson: any,
) => {
  const detailMap = new Map<string, ValidationIssueSdkDetail>();

  issues.forEach((issue) => {
    const detail = toProcessSdkValidationDetail(issue, orderedJson);
    if (!detail) {
      return;
    }

    if (!detailMap.has(detail.key)) {
      detailMap.set(detail.key, detail);
    }
  });

  return Array.from(detailMap.values());
};

export const processSdkValidationTestUtils = {
  collectLeafUnionIssues,
  getExchangeContext,
  getListItemIndex,
  getProcessSdkIssueExchangeFormName,
  getProcessSdkIssueFieldKey,
  getProcessSdkIssueFieldLabel,
  getProcessSdkIssueFieldPath,
  getProcessSdkIssueReason,
  getProcessSdkIssueRootFormName,
  getProcessSdkValidationCode,
  isLangTextValue,
  stringifyProcessSdkFormName,
};
