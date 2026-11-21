import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import {
  type DatasetSdkValidationIssueLike,
  normalizeSimpleDatasetSdkValidationDetails,
  toPathArray,
} from '@/pages/Utils/validation/sdkDetails';

const FLOW_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'flowInformation.dataSetInformation.name.baseName',
  'flowInformation.dataSetInformation.name.treatmentStandardsRoutes',
  'flowInformation.dataSetInformation.name.mixAndLocationTypes',
]);

const FLOW_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:dataSetVersion': 'Data set version',
  'common:generalComment': 'General comment on data set',
  'common:name': 'Flow name',
  'common:permanentDataSetURI': 'Permanent data set URI',
  'common:referenceToComplianceSystem': 'Compliance system name',
  'common:referenceToDataSetFormat': 'Data set format(s)',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:timeStamp': 'Time stamp (last saved)',
  '@refObjectId': 'Reference identifier',
  approvalOfOverallCompliance: 'Approval of overall compliance',
  baseName: 'Base name',
  CASNumber: 'CAS Number',
  locationOfSupply: 'Location of supply',
  meanValue: 'Mean value (of flow property)',
  mixAndLocationTypes: 'Mix and location types',
  referenceToFlowPropertyDataSet: 'Flow property',
  showValue: 'Classification',
  technologicalApplicability: 'Technical purpose of product or waste',
  treatmentStandardsRoutes: 'Treatment, standards, routes',
  typeOfDataSet: 'Type of flow',
};

const FLOW_PROPERTIES_FIELD_LABEL = 'Flow properties';
const FLOW_PROPERTIES_REQUIRED_FIELD_PATH = 'flowProperties.requiredSummary';
const FLOW_PROPERTIES_QUANTITATIVE_REFERENCE_FIELD_PATH =
  'flowProperties.quantitativeReferenceSummary';
const FLOW_PROPERTY_FIELD_PATH_PREFIX = 'flowProperty';
const FLOW_PROPERTIES_REQUIRED_VALIDATION_CODE = 'flow_properties_required';
const FLOW_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE = 'quantitative_reference_count_invalid';
const FLOW_UI_SUPPRESSED_SDK_FIELD_PATHS = new Set<string>([
  // This SDK field is derived from flowProperties selection in the UI, so showing it under
  // flowInformation creates a misleading duplicate prompt.
  'flowInformation.quantitativeReference.referenceToReferenceFlowProperty',
]);

const normalizeString = (value?: string | null) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const getFlowSdkIssueRootPath = (issue: DatasetSdkValidationIssueLike) => {
  const path = toPathArray(issue?.path);
  const pathWithoutRoot = path[0] === 'root' ? path.slice(1) : path;
  const normalizedPath =
    pathWithoutRoot[0] === 'flowDataSet'
      ? pathWithoutRoot.slice(1)
      : pathWithoutRoot[0] && String(pathWithoutRoot[0]).endsWith('DataSet')
        ? pathWithoutRoot.slice(1)
        : pathWithoutRoot;

  return normalizedPath
    .filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    )
    .map(String)
    .join('.');
};

export const filterFlowSdkIssuesForUi = (issues: DatasetSdkValidationIssueLike[] = []) => {
  return issues.filter(
    (issue) => !FLOW_UI_SUPPRESSED_SDK_FIELD_PATHS.has(getFlowSdkIssueRootPath(issue)),
  );
};

const toFlowPropertyList = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
};

const isFlowPropertyFieldDetail = (detail: ValidationIssueSdkDetail) => {
  return (
    Array.isArray(detail.formName) &&
    detail.formName[0] === 'flowProperties' &&
    detail.formName[1] === 'flowProperty' &&
    detail.formName.length > 2
  );
};

const toFlowPropertyFieldDetail = (
  detail: ValidationIssueSdkDetail,
  orderedJson: any,
): ValidationIssueSdkDetail => {
  if (!isFlowPropertyFieldDetail(detail)) {
    return detail;
  }

  const formName = detail.formName!;
  const flowPropertySource = orderedJson?.flowDataSet?.flowProperties?.flowProperty;
  const hasItemIndex = typeof formName[2] === 'number';
  if (!hasItemIndex && Array.isArray(flowPropertySource)) {
    return detail;
  }
  const flowPropertyIndex = hasItemIndex ? Number(formName[2]) : 0;
  const flowProperty = toFlowPropertyList(flowPropertySource)[flowPropertyIndex];
  const flowPropertyInternalId = normalizeString(flowProperty?.['@dataSetInternalID']);
  const fieldOffset = hasItemIndex ? 3 : 2;
  const strippedFormName = formName.slice(fieldOffset);
  const fallbackFieldPath = detail.fieldPath.split('.').slice(fieldOffset).join('.');
  const serializedFieldPath =
    strippedFormName.length > 0 ? strippedFormName.map(String).join('.') : fallbackFieldPath;
  const fieldPathPrefix = flowPropertyInternalId
    ? `${FLOW_PROPERTY_FIELD_PATH_PREFIX}[#${flowPropertyInternalId}]`
    : `${FLOW_PROPERTY_FIELD_PATH_PREFIX}[${flowPropertyIndex + 1}]`;
  const fieldPath = serializedFieldPath
    ? `${fieldPathPrefix}.${serializedFieldPath}`
    : fieldPathPrefix;
  const detailTabName = detail.tabName && detail.tabName.trim() ? detail.tabName : 'unknown';
  const detailValidationCode =
    detail.validationCode && detail.validationCode.trim()
      ? detail.validationCode
      : detail.rawCode && detail.rawCode.trim()
        ? detail.rawCode
        : 'unknown';
  const flowPropertyKey = flowPropertyInternalId ?? String(flowPropertyIndex);

  return {
    ...detail,
    fieldPath,
    formName: strippedFormName,
    key: [
      detailTabName,
      flowPropertyKey,
      fieldPath,
      detailValidationCode,
      JSON.stringify(detail.validationParams ?? {}),
    ].join(':'),
  };
};

export const normalizeFlowSdkValidationDetails = (issues: any[], orderedJson: any) => {
  const uiIssues = filterFlowSdkIssuesForUi(issues);

  return normalizeSimpleDatasetSdkValidationDetails(uiIssues, orderedJson, {
    datasetKey: 'flowDataSet',
    fieldLabelsByKey: FLOW_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: FLOW_REQUIRED_LANG_TEXT_FIELDS,
    specialTabNames: [
      {
        match: 'modellingAndValidation.LCIMethod.typeOfDataSet',
        tabName: 'flowInformation',
      },
    ],
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'flowDataSet',
        dataType: 'Flow',
      }),
    ],
  }).map((detail) => toFlowPropertyFieldDetail(detail, orderedJson));
};

export const buildFlowPropertiesValidationDetails = (
  flowProperties: any,
): ValidationIssueSdkDetail[] => {
  const flowPropertyList = toFlowPropertyList(flowProperties?.flowProperty);

  if (flowPropertyList.length === 0) {
    const message = 'Please select flow properties';

    return [
      {
        fieldKey: 'flowProperties',
        fieldLabel: FLOW_PROPERTIES_FIELD_LABEL,
        fieldPath: FLOW_PROPERTIES_REQUIRED_FIELD_PATH,
        key: 'flowProperties:required:section',
        presentation: 'section',
        reasonMessage: message,
        suggestedFix: message,
        tabName: 'flowProperties',
        validationCode: FLOW_PROPERTIES_REQUIRED_VALIDATION_CODE,
      },
    ];
  }

  if (flowPropertyList.filter((item) => item?.quantitativeReference).length === 1) {
    return [];
  }

  const message = 'Exactly one flow property must be designated as the quantitative reference.';
  const details: ValidationIssueSdkDetail[] = [
    {
      fieldKey: 'flowProperties',
      fieldLabel: FLOW_PROPERTIES_FIELD_LABEL,
      fieldPath: FLOW_PROPERTIES_QUANTITATIVE_REFERENCE_FIELD_PATH,
      key: 'flowProperties:quantitative-reference:section',
      presentation: 'section',
      reasonMessage: message,
      suggestedFix: message,
      tabName: 'flowProperties',
      validationCode: FLOW_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    },
  ];
  const selectedFlowProperties = flowPropertyList.filter((item) => item?.quantitativeReference);

  if (selectedFlowProperties.length <= 1) {
    return details;
  }

  selectedFlowProperties.forEach((flowProperty, index) => {
    const flowPropertyInternalId =
      normalizeString(flowProperty?.['@dataSetInternalID']) ?? `quantitative-reference-${index}`;

    details.push({
      fieldKey: 'quantitativeReference',
      fieldLabel: FLOW_PROPERTIES_FIELD_LABEL,
      fieldPath: `${FLOW_PROPERTY_FIELD_PATH_PREFIX}[#${flowPropertyInternalId}].quantitativeReference`,
      key: `flowProperties:quantitative-reference:highlight:${flowPropertyInternalId}`,
      presentation: 'highlight-only',
      reasonMessage: message,
      suggestedFix: message,
      tabName: 'flowProperties',
      validationCode: FLOW_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    });
  });

  return details;
};

export const flowSdkValidationTestUtils = {
  getFlowSdkIssueRootPath,
  toFlowPropertyFieldDetail,
  toFlowPropertyList,
};
