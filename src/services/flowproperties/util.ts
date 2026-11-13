import {
  classificationClassesToForm,
  classificationSystemsToJson,
} from '../classifications/serialization';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { FormFlowProperty } from '@/services/flowproperties/data';
import { createFlowProperty as createTidasFlowProperty } from '@tiangong-lca/tidas-sdk/core';
import {
  convertToUTCISOString,
  formatDateTime,
  getLangJson,
  getLangList,
  removeEmptyObjects,
} from '../general/util';

export function genFlowpropertyJsonOrdered(id: string, data: any) {
  return removeEmptyObjects({
    flowPropertyDataSet: {
      // '@xmlns': oldData.flowPropertyDataSet?.['@xmlns'] ?? {},
      // '@xmlns:common': oldData.flowPropertyDataSet?.['@xmlns:common'] ?? {},
      // '@xmlns:xsi': oldData.flowPropertyDataSet?.['@xmlns:xsi'] ?? {},
      // '@version': oldData.flowPropertyDataSet?.['@version'] ?? {},
      // '@xsi:schemaLocation': oldData.flowPropertyDataSet?.['@xsi:schemaLocation'] ?? {},
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/FlowProperty',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://lca.jrc.it/ILCD/FlowProperty ../../schemas/ILCD_FlowPropertyDataSet.xsd',
      flowPropertiesInformation: {
        dataSetInformation: {
          'common:UUID': id,
          'common:name': getLangJson(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:name'],
          ),
          'common:synonyms': getLangJson(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:synonyms'],
          ),
          classificationInformation: {
            ...data?.flowPropertiesInformation?.dataSetInformation?.classificationInformation,
            'common:classification': classificationSystemsToJson(
              data?.flowPropertiesInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
            ),
          },
          'common:generalComment': getLangJson(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:generalComment'],
          ),
        },
        quantitativeReference: {
          referenceToReferenceUnitGroup: {
            '@refObjectId':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@refObjectId'],
            '@type':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@type'],
            '@uri':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@uri'],
            '@version':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@version'],
            'common:shortDescription': getLangJson(
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['common:shortDescription'],
            ),
          },
        },
      },
      modellingAndValidation: {
        dataSourcesTreatmentAndRepresentativeness: {
          referenceToDataSource: {
            '@refObjectId':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@refObjectId'],
            '@version':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@version'],
            '@type':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@type'],
            '@uri':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@uri'],
            'common:shortDescription': getLangJson(
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['common:shortDescription'],
            ),
          },
        },
        complianceDeclarations: {
          compliance: {
            'common:referenceToComplianceSystem': {
              '@refObjectId':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@refObjectId'],
              '@version':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@version'],
              '@type':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@type'],
              '@uri':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@uri'],
              'common:shortDescription': getLangJson(
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['common:shortDescription'],
              ),
            },
            'common:approvalOfOverallCompliance':
              data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                'common:approvalOfOverallCompliance'
              ],
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
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@version'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@uri'],
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
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['common:shortDescription'],
            ),
          },
          'common:permanentDataSetURI': `https://lcdn.tiangong.earth/datasetdetail/flowproperty.xhtml?uuid=${id}&version=${data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion']}`,
        },
      },
    },
  });
}

export function genFlowpropertyFromData(data: any): FormFlowProperty {
  const flowproperty = createTidasFlowProperty({
    flowPropertyDataSet: {
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/FlowProperty',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://lca.jrc.it/ILCD/FlowProperty ../../schemas/ILCD_FlowPropertyDataSet.xsd',
      flowPropertiesInformation: {
        dataSetInformation: {
          'common:UUID': data?.flowPropertiesInformation?.dataSetInformation?.['common:UUID'],
          'common:name': getLangList(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:name'],
          ),
          'common:synonyms': getLangList(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:synonyms'],
          ),
          classificationInformation: {
            ...data?.flowPropertiesInformation?.dataSetInformation?.classificationInformation,
            'common:classification': mapTidasRepeated(
              data?.flowPropertiesInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
              (item) => ({
                ...item,
                'common:class': classificationClassesToForm(item, 'FlowProperty'),
              }),
            ),
          },
          'common:generalComment': getLangList(
            data?.flowPropertiesInformation?.dataSetInformation?.['common:generalComment'],
          ),
        },
        quantitativeReference: {
          referenceToReferenceUnitGroup: {
            '@refObjectId':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@refObjectId'],
            '@type':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@type'],
            '@uri':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@uri'],
            '@version':
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['@version'],
            'common:shortDescription': getLangList(
              data?.flowPropertiesInformation?.quantitativeReference
                ?.referenceToReferenceUnitGroup?.['common:shortDescription'],
            ),
          },
        },
      },
      modellingAndValidation: {
        dataSourcesTreatmentAndRepresentativeness: {
          referenceToDataSource: {
            '@refObjectId':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@refObjectId'],
            '@version':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@version'],
            '@type':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@type'],
            '@uri':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['@uri'],
            'common:shortDescription': getLangList(
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource?.['common:shortDescription'],
            ),
          },
        },
        complianceDeclarations: {
          compliance: {
            'common:referenceToComplianceSystem': {
              '@refObjectId':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@refObjectId'],
              '@version':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@version'],
              '@type':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@type'],
              '@uri':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@uri'],
              'common:shortDescription': getLangList(
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['common:shortDescription'],
              ),
            },
            'common:approvalOfOverallCompliance':
              data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                'common:approvalOfOverallCompliance'
              ],
          },
        },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': convertToUTCISOString(
            data?.administrativeInformation?.dataEntryBy?.['common:timeStamp'],
          ),
          'common:referenceToDataSetFormat': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@refObjectId'
              ],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@version'
              ],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@type'
              ],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@uri'
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
          'common:referenceToPrecedingDataSetVersion': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@refObjectId'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@version'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]?.['@uri'],
            'common:shortDescription': getLangList(
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
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
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
    flowPropertiesInformation: flowproperty.flowPropertyDataSet.flowPropertiesInformation,
    administrativeInformation: flowproperty.flowPropertyDataSet.administrativeInformation,
    modellingAndValidation: flowproperty.flowPropertyDataSet.modellingAndValidation,
  });
}
