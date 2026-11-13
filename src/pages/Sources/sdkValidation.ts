import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import { normalizeSimpleDatasetSdkValidationDetails } from '@/pages/Utils/validation/sdkDetails';

const SOURCE_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'sourceInformation.dataSetInformation.common:shortName',
]);

const SOURCE_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:dataSetVersion': 'Data set version',
  'common:referenceToDataSetFormat': 'Data set format(s)',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:shortName': 'Short name of source',
  'common:timeStamp': 'Time stamp (last saved)',
  '@refObjectId': 'Reference identifier',
  publicationType: 'Publication type',
  referenceToContact: 'Belongs to',
  sourceCitation: 'Source citation',
  sourceDescriptionOrComment: 'Source description or comment',
  showValue: 'Classification',
};

export const normalizeSourceSdkValidationDetails = (issues: any[], orderedJson: any) => {
  return normalizeSimpleDatasetSdkValidationDetails(issues, orderedJson, {
    datasetKey: 'sourceDataSet',
    fieldLabelsByKey: SOURCE_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: SOURCE_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'sourceDataSet',
        dataType: 'Source',
      }),
    ],
  });
};
