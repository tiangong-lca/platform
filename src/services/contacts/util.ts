import {
  classificationClassesToForm,
  classificationSystemsToJson,
} from '../classifications/serialization';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { FormContact } from '@/services/contacts/data';
import { createContact as createTidasContact } from '@tiangong-lca/tidas-sdk/core';
import {
  convertToUTCISOString,
  formatDateTime,
  getLangJson,
  getLangList,
  removeEmptyObjects,
} from '../general/util';

export function genContactJsonOrdered(id: string, data: any) {
  return removeEmptyObjects({
    contactDataSet: {
      // '@xmlns': oldData.contactDataSet?.['@xmlns'] ?? {},
      // '@xmlns:common': oldData.contactDataSet?.['@xmlns:common'] ?? {},
      // '@xmlns:xsi': oldData.contactDataSet?.['@xmlns:xsi'] ?? {},
      // '@version': oldData.contactDataSet['@version'] ?? {},
      // '@xsi:schemaLocation': oldData.contactDataSet['@xsi:schemaLocation'] ?? {},
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/Contact',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation': 'http://lca.jrc.it/ILCD/Contact ../../schemas/ILCD_ContactDataSet.xsd',
      contactInformation: {
        dataSetInformation: {
          'common:UUID': id,
          'common:shortName': getLangJson(
            data?.contactInformation?.dataSetInformation?.['common:shortName'],
          ),
          'common:name': getLangJson(data?.contactInformation?.dataSetInformation?.['common:name']),
          classificationInformation: {
            ...data?.contactInformation?.dataSetInformation?.classificationInformation,
            'common:classification': classificationSystemsToJson(
              data?.contactInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
            ),
          },
          contactAddress: getLangJson(data?.contactInformation?.dataSetInformation?.contactAddress),
          telephone: data?.contactInformation?.dataSetInformation?.telephone,
          telefax: data?.contactInformation?.dataSetInformation?.telefax,
          email: data?.contactInformation?.dataSetInformation?.email,
          WWWAddress: data?.contactInformation?.dataSetInformation?.WWWAddress,
          centralContactPoint: getLangJson(
            data?.contactInformation?.dataSetInformation?.centralContactPoint,
          ),
          contactDescriptionOrComment: getLangJson(
            data?.contactInformation?.dataSetInformation?.contactDescriptionOrComment,
          ),
          referenceToContact: {
            '@refObjectId':
              data?.contactInformation?.dataSetInformation?.referenceToContact?.['@refObjectId'],
            '@type': data?.contactInformation?.dataSetInformation?.referenceToContact?.['@type'],
            '@uri': data?.contactInformation?.dataSetInformation?.referenceToContact?.['@uri'],
            'common:shortDescription': getLangJson(
              data?.contactInformation?.dataSetInformation?.referenceToContact?.[
                'common:shortDescription'
              ],
            ),
            '@version':
              data?.contactInformation?.dataSetInformation?.referenceToContact?.['@version'],
          },
          referenceToLogo: {
            '@refObjectId':
              data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@refObjectId'],
            '@type': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@type'],
            '@uri': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@uri'],
            'common:shortDescription': getLangJson(
              data?.contactInformation?.dataSetInformation?.referenceToLogo?.[
                'common:shortDescription'
              ],
            ),
            '@version': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@version'],
          },
        },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': formatDateTime(new Date()),
          'common:referenceToDataSetFormat': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@refObjectId'
              ],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@type'
              ],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@uri'
              ],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@version'
              ],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        publicationAndOwnership: {
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'],
          'common:referenceToPrecedingDataSetVersion': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@version'],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToOwnershipOfDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['common:shortDescription'],
            ),
          },
          'common:permanentDataSetURI': `https://lcdn.tiangong.earth/datasetdetail/contact.xhtml?uuid=${id}&version=${data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion']}`,
        },
      },
    },
  });
}

export function genContactFromData(data: any): FormContact | undefined {
  if (!data) return undefined;
  const contact = createTidasContact({
    contactDataSet: {
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/Contact',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation': 'http://lca.jrc.it/ILCD/Contact ../../schemas/ILCD_ContactDataSet.xsd',
      contactInformation: {
        dataSetInformation: {
          'common:UUID': data?.contactInformation?.dataSetInformation?.['common:UUID'],
          'common:shortName': getLangList(
            data?.contactInformation?.dataSetInformation?.['common:shortName'],
          ),
          'common:name': getLangList(data?.contactInformation?.dataSetInformation?.['common:name']),
          classificationInformation: {
            ...data?.contactInformation?.dataSetInformation?.classificationInformation,
            'common:classification': mapTidasRepeated(
              data?.contactInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
              (item) => ({
                ...item,
                'common:class': classificationClassesToForm(item, 'Contact'),
              }),
            ),
          },
          contactAddress: getLangList(data?.contactInformation?.dataSetInformation?.contactAddress),
          telephone: data?.contactInformation?.dataSetInformation?.telephone,
          telefax: data?.contactInformation?.dataSetInformation?.telefax,
          email: data?.contactInformation?.dataSetInformation?.email,
          WWWAddress: data?.contactInformation?.dataSetInformation?.WWWAddress,
          centralContactPoint: getLangList(
            data?.contactInformation?.dataSetInformation?.['centralContactPoint'],
          ),
          contactDescriptionOrComment: getLangList(
            data?.contactInformation?.dataSetInformation?.['contactDescriptionOrComment'],
          ),
          referenceToContact: {
            '@refObjectId':
              data?.contactInformation?.dataSetInformation?.referenceToContact?.['@refObjectId'],
            '@type': data?.contactInformation?.dataSetInformation?.referenceToContact?.['@type'],
            '@uri': data?.contactInformation?.dataSetInformation?.referenceToContact?.['@uri'],
            'common:shortDescription': getLangList(
              data?.contactInformation?.dataSetInformation?.referenceToContact?.[
                'common:shortDescription'
              ],
            ),
            '@version':
              data?.contactInformation?.dataSetInformation?.referenceToContact?.['@version'],
          },
          referenceToLogo: {
            '@refObjectId':
              data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@refObjectId'],
            '@type': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@type'],
            '@uri': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@uri'],
            'common:shortDescription': getLangList(
              data?.contactInformation?.dataSetInformation?.referenceToLogo?.[
                'common:shortDescription'
              ],
            ),
            '@version': data?.contactInformation?.dataSetInformation?.referenceToLogo?.['@version'],
          },
        },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp':
            convertToUTCISOString(
              data?.administrativeInformation?.dataEntryBy?.['common:timeStamp'],
            ) ?? formatDateTime(new Date()),
          'common:referenceToDataSetFormat': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@refObjectId'
              ],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@type'
              ],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@uri'
              ],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@version'
              ],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        publicationAndOwnership: {
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'],
          'common:referenceToOwnershipOfDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToPrecedingDataSetVersion': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@version'],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['common:shortDescription'],
            ),
          },
          'common:permanentDataSetURI':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:permanentDataSetURI'
            ],
        },
      },
    },
  });
  return removeEmptyObjects({
    contactInformation: contact.contactDataSet.contactInformation,
    administrativeInformation: contact.contactDataSet.administrativeInformation,
  });
}
