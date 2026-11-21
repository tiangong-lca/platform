import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import { normalizeSimpleDatasetSdkValidationDetails } from '@/pages/Utils/validation/sdkDetails';

const CONTACT_REQUIRED_LANG_TEXT_FIELDS = new Set<string>([
  'contactInformation.dataSetInformation.common:shortName',
  'contactInformation.dataSetInformation.common:name',
]);

const CONTACT_FIELD_LABELS_BY_KEY: Record<string, string> = {
  'common:dataSetVersion': 'Data set version',
  'common:name': 'Name of contact',
  'common:permanentDataSetURI': 'Permanent data set URI',
  'common:referenceToDataSetFormat': 'Data set format(s)',
  'common:referenceToOwnershipOfDataSet': 'Owner of data set',
  'common:shortName': 'Short name for contact',
  'common:timeStamp': 'Time stamp (last saved)',
  '@refObjectId': 'Reference identifier',
  WWWAddress: 'WWW-Address',
  centralContactPoint: 'Central contact point',
  contactAddress: 'Contact address',
  contactDescriptionOrComment: 'Contact description or comment',
  email: 'E-mail',
  referenceToContact: 'Belongs to',
  referenceToLogo: 'Logo of organisation or source',
  showValue: 'Classification',
  telefax: 'Telefax',
  telephone: 'Telephone',
};

export const normalizeContactSdkValidationDetails = (issues: any[], orderedJson: any) => {
  return normalizeSimpleDatasetSdkValidationDetails(issues, orderedJson, {
    datasetKey: 'contactDataSet',
    fieldLabelsByKey: CONTACT_FIELD_LABELS_BY_KEY,
    requiredLangTextFields: CONTACT_REQUIRED_LANG_TEXT_FIELDS,
    specialFormNames: [
      classificationFormNameMatcher(orderedJson, {
        datasetKey: 'contactDataSet',
        dataType: 'Contact',
      }),
    ],
  });
};
