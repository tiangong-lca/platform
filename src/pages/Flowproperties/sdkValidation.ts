import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import { normalizeSimpleDatasetSdkValidationDetails } from '@/pages/Utils/validation/sdkDetails';

const FLOWPROPERTY_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'flowPropertiesInformation.dataSetInformation.common:name',
]);

const FLOWPROPERTY_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:dataSetVersion': 'Data set version',
  'common:generalComment': 'General comment on data set',
  'common:name': 'Name of flow property',
  'common:referenceToComplianceSystem': 'Compliance system name',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:synonyms': 'Synonyms',
  'common:timeStamp': 'Time stamp (last saved)',
  '@refObjectId': 'Reference identifier',
  meanValue: 'Mean value of reference unit',
  referenceToContact: 'Data set registration and ownership',
  referenceToDataSource: 'Data source',
  referenceToReferenceUnitGroup: 'Reference unit',
  showValue: 'Classification',
};

export const normalizeFlowpropertySdkValidationDetails = (issues: any[], orderedJson: any) => {
  return normalizeSimpleDatasetSdkValidationDetails(issues, orderedJson, {
    datasetKey: 'flowPropertyDataSet',
    fieldLabelsByKey: FLOWPROPERTY_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: FLOWPROPERTY_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'flowPropertyDataSet',
        dataType: 'FlowProperty',
      }),
    ],
  });
};
