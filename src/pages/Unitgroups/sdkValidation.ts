import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { normalizeSimpleDatasetSdkValidationDetails } from '@/pages/Utils/validation/sdkDetails';

const UNITGROUP_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'unitGroupInformation.dataSetInformation.common:name',
]);

const UNITGROUP_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:dataSetVersion': 'Data set version',
  'common:generalComment': 'General comment',
  'common:name': 'Name of unit group',
  'common:permanentDataSetURI': 'Permanent data set URI',
  'common:referenceToComplianceSystem': 'Compliance system name',
  'common:referenceToDataSetFormat': 'Data set format(s)',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:timeStamp': 'Time stamp (last saved)',
  '@refObjectId': 'Reference identifier',
  approvalOfOverallCompliance: 'Approval of overall compliance',
  meanValue: 'Mean value (of unit)',
  name: 'Unit name',
  quantitativeReference: 'Quantitative reference',
  referenceToUnitGroup: 'Unit group',
  showValue: 'Classification',
};

const UNITS_FIELD_LABEL = 'Units';
const UNITS_REQUIRED_FIELD_PATH = 'units.requiredSummary';
const UNITS_QUANTITATIVE_REFERENCE_FIELD_PATH = 'units.quantitativeReferenceSummary';
const UNIT_FIELD_PATH_PREFIX = 'unit';
const UNIT_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE = 'quantitative_reference_count_invalid';

const normalizeString = (value?: string | null) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const toUnitList = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
};

const isUnitFieldDetail = (detail: ValidationIssueSdkDetail) => {
  return (
    Array.isArray(detail.formName) &&
    detail.formName[0] === 'units' &&
    detail.formName[1] === 'unit' &&
    typeof detail.formName[2] === 'number'
  );
};

const toUnitFieldDetail = (
  detail: ValidationIssueSdkDetail,
  orderedJson: any,
): ValidationIssueSdkDetail => {
  if (!isUnitFieldDetail(detail)) {
    return detail;
  }

  const formName = detail.formName!;
  const unitIndex = Number(formName[2]);
  const unit = toUnitList(orderedJson?.unitGroupDataSet?.units?.unit)[unitIndex];
  const unitInternalId = normalizeString(unit?.['@dataSetInternalID']);
  const strippedFormName = formName.slice(3);
  const fallbackFieldPath = detail.fieldPath.split('.').slice(3).join('.');
  const serializedFieldPath =
    strippedFormName.length > 0 ? strippedFormName.map(String).join('.') : fallbackFieldPath;
  const fieldPathPrefix = unitInternalId
    ? `${UNIT_FIELD_PATH_PREFIX}[#${unitInternalId}]`
    : `${UNIT_FIELD_PATH_PREFIX}[${unitIndex + 1}]`;
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
  const unitKey = unitInternalId ?? String(unitIndex);

  return {
    ...detail,
    fieldPath,
    formName: strippedFormName,
    key: [
      detailTabName,
      unitKey,
      fieldPath,
      detailValidationCode,
      JSON.stringify(detail.validationParams ?? {}),
    ].join(':'),
  };
};

export const normalizeUnitgroupSdkValidationDetails = (issues: any[], orderedJson: any) => {
  return normalizeSimpleDatasetSdkValidationDetails(issues, orderedJson, {
    datasetKey: 'unitGroupDataSet',
    fieldLabelsByKey: UNITGROUP_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: UNITGROUP_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'unitGroupDataSet',
        dataType: 'UnitGroup',
      }),
    ],
  }).map((detail) => toUnitFieldDetail(detail, orderedJson));
};

export const buildUnitgroupUnitsValidationDetails = (units: any): ValidationIssueSdkDetail[] => {
  const unitList = toUnitList(units?.unit);

  if (unitList.length === 0) {
    const message = 'Please select unit';

    return [
      {
        fieldKey: 'units',
        fieldLabel: UNITS_FIELD_LABEL,
        fieldPath: UNITS_REQUIRED_FIELD_PATH,
        key: 'units:required:section',
        presentation: 'section',
        reasonMessage: message,
        suggestedFix: message,
        tabName: 'units',
      },
    ];
  }

  if (unitList.filter((item) => item?.quantitativeReference).length === 1) {
    return [];
  }

  const message = 'Exactly one unit must be designated as the quantitative reference.';
  const details: ValidationIssueSdkDetail[] = [
    {
      fieldKey: 'units',
      fieldLabel: UNITS_FIELD_LABEL,
      fieldPath: UNITS_QUANTITATIVE_REFERENCE_FIELD_PATH,
      key: 'units:quantitative-reference:section',
      presentation: 'section',
      reasonMessage: message,
      suggestedFix: message,
      tabName: 'units',
      validationCode: UNIT_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    },
  ];
  const selectedUnits = unitList.filter((item) => item?.quantitativeReference);

  if (selectedUnits.length <= 1) {
    return details;
  }

  selectedUnits.forEach((unit, index) => {
    const unitInternalId =
      normalizeString(unit?.['@dataSetInternalID']) ?? `quantitative-reference-${index}`;

    details.push({
      fieldKey: 'quantitativeReference',
      fieldLabel: UNITS_FIELD_LABEL,
      fieldPath: `${UNIT_FIELD_PATH_PREFIX}[#${unitInternalId}].quantitativeReference`,
      key: `units:quantitative-reference:highlight:${unitInternalId}`,
      presentation: 'highlight-only',
      reasonMessage: message,
      suggestedFix: message,
      tabName: 'units',
      validationCode: UNIT_QUANTITATIVE_REFERENCE_COUNT_VALIDATION_CODE,
    });
  });

  return details;
};

export const unitgroupSdkValidationTestUtils = {
  toUnitFieldDetail,
  toUnitList,
};
