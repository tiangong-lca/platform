import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import {
  normalizeSimpleDatasetSdkValidationDetails,
  toPathArray,
} from '@/pages/Utils/validation/sdkDetails';
import { resolveContentLanguage } from '@/services/general/contentLanguageRegistry';
import { getLangText } from '@/services/general/util';

const LIFECYCLEMODEL_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'lifeCycleModelInformation.dataSetInformation.name.baseName',
  'lifeCycleModelInformation.dataSetInformation.name.treatmentStandardsRoutes',
  'lifeCycleModelInformation.dataSetInformation.name.mixAndLocationTypes',
  'lifeCycleModelInformation.dataSetInformation.common:generalComment',
  'administrativeInformation.common:commissionerAndGoal.common:intendedApplications',
]);

const LIFECYCLEMODEL_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:accessRestrictions': 'Access and use restrictions',
  'common:copyright': 'Copyright?',
  'common:dataSetVersion': 'Data set version',
  'common:generalComment': 'General comment',
  'common:intendedApplications': 'Intended applications',
  'common:licenseType': 'License type',
  'common:name': 'Life cycle model name',
  'common:permanentDataSetURI': 'Permanent data set URI',
  'common:project': 'Project',
  'common:referenceToDataSetFormat': 'Data set format(s)',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:referenceToPersonOrEntityEnteringTheData': 'Data entry by',
  'common:timeStamp': 'Time stamp (last saved)',
  '@classId': 'Classification',
  '@refObjectId': 'Reference identifier',
  baseName: 'Base name',
  functionalUnitFlowProperties: 'Quantitative product or process properties',
  mixAndLocationTypes: 'Mix and location types',
  referenceToDiagram: 'Life cycle model diagram(s) or screenshot(s)',
  referenceToExternalDocumentation: 'Data set report, background info',
  showValue: 'Classification',
  treatmentStandardsRoutes: 'Treatment, standards, routes',
};

const LIFECYCLEMODEL_METADATA_TABS = new Set([
  'administrativeInformation',
  'lifeCycleModelInformation',
  'modellingAndValidation',
]);

const LIFECYCLEMODEL_PROCESS_INSTANCE_PATH_PREFIX = [
  'lifeCycleModelInformation',
  'technology',
  'processes',
  'processInstance',
] as const;

const normalizeString = (value?: string | null) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const toLocaleLang = (locale?: string) => resolveContentLanguage(locale);

const toProcessInstanceList = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
};

const isProcessInstanceFieldDetail = (detail: ValidationIssueSdkDetail) => {
  return (
    Array.isArray(detail.formName) &&
    detail.formName[0] === LIFECYCLEMODEL_PROCESS_INSTANCE_PATH_PREFIX[0] &&
    detail.formName[1] === LIFECYCLEMODEL_PROCESS_INSTANCE_PATH_PREFIX[1] &&
    detail.formName[2] === LIFECYCLEMODEL_PROCESS_INSTANCE_PATH_PREFIX[2] &&
    detail.formName[3] === LIFECYCLEMODEL_PROCESS_INSTANCE_PATH_PREFIX[3] &&
    typeof detail.formName[4] === 'number'
  );
};

const getProcessInstanceDisplayLabel = (processInstance: any, locale?: string) => {
  const localizedShortDescription = normalizeString(
    getLangText(
      processInstance?.referenceToProcess?.['common:shortDescription'],
      toLocaleLang(locale),
    ),
  );

  if (localizedShortDescription && localizedShortDescription !== '-') {
    return localizedShortDescription;
  }

  return (
    normalizeString(processInstance?.referenceToProcess?.['@refObjectId']) ??
    normalizeString(processInstance?.['@dataSetInternalID'])
  );
};

const toProcessInstanceFieldDetail = (
  detail: ValidationIssueSdkDetail,
  orderedJson: any,
  locale?: string,
): ValidationIssueSdkDetail | null => {
  if (!isProcessInstanceFieldDetail(detail)) {
    return null;
  }

  const formName = detail.formName!;
  const processInstanceIndex = Number(formName[4]);
  const processInstance = toProcessInstanceList(
    orderedJson?.lifeCycleModelDataSet?.lifeCycleModelInformation?.technology?.processes
      ?.processInstance,
  )[processInstanceIndex];
  const processInstanceInternalId = normalizeString(processInstance?.['@dataSetInternalID']);

  if (!processInstanceInternalId) {
    return null;
  }

  const strippedFormName = formName.slice(5);
  const fallbackFieldPath = detail.fieldPath.split('.').slice(5).join('.');
  const serializedFieldPath =
    strippedFormName.length > 0 ? strippedFormName.map(String).join('.') : fallbackFieldPath;
  const fieldPathPrefix = `processInstance[#${processInstanceInternalId}]`;
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

  return {
    ...detail,
    fieldPath,
    formName: strippedFormName,
    key: [
      detailTabName,
      processInstanceInternalId,
      fieldPath,
      detailValidationCode,
      JSON.stringify(detail.validationParams ?? {}),
    ].join(':'),
    presentation: 'highlight-only',
    processInstanceInternalId,
    processInstanceLabel: getProcessInstanceDisplayLabel(processInstance, locale),
    tabName: 'lifeCycleModelInformation',
  };
};

export const normalizeLifeCycleModelSdkValidationDetails = (issues: any[], orderedJson: any) => {
  const metadataIssues = issues.filter((issue) => {
    const path = toPathArray(issue?.path);
    const rootSegment = path[0] === 'lifeCycleModelDataSet' ? path[1] : path[0];

    return (
      typeof rootSegment === 'string' &&
      LIFECYCLEMODEL_METADATA_TABS.has(rootSegment) &&
      !path.includes('processInstance')
    );
  });

  return normalizeSimpleDatasetSdkValidationDetails(metadataIssues, orderedJson, {
    datasetKey: 'lifeCycleModelDataSet',
    fieldLabelsByKey: LIFECYCLEMODEL_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: LIFECYCLEMODEL_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'lifeCycleModelDataSet',
        dataType: 'LifeCycleModel',
      }),
    ],
  });
};

export const normalizeLifeCycleModelProcessInstanceSdkValidationDetails = (
  issues: any[],
  orderedJson: any,
  locale?: string,
) => {
  const processInstanceIssues = issues.filter((issue) =>
    toPathArray(issue?.path).includes('processInstance'),
  );

  return normalizeSimpleDatasetSdkValidationDetails(processInstanceIssues, orderedJson, {
    datasetKey: 'lifeCycleModelDataSet',
    fieldLabelsByKey: LIFECYCLEMODEL_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: LIFECYCLEMODEL_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'lifeCycleModelDataSet',
        dataType: 'LifeCycleModel',
      }),
    ],
  }).flatMap((detail) => {
    const normalizedDetail = toProcessInstanceFieldDetail(detail, orderedJson, locale);

    return normalizedDetail ? [normalizedDetail] : [];
  });
};

export const lifeCycleModelSdkValidationTestUtils = {
  getProcessInstanceDisplayLabel,
  toProcessInstanceFieldDetail,
  toProcessInstanceList,
  toLocaleLang,
};
