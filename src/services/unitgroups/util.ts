import {
  classificationClassesToForm,
  classificationSystemsToJson,
} from '../classifications/serialization';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { FormUnitGroup } from '@/services/unitgroups/data';
import { createUnitGroup as createTidasUnitGroup } from '@tiangong-lca/tidas-sdk/core';
import {
  convertToUTCISOString,
  formatDateTime,
  getLangJson,
  getLangList,
  getLangText,
  removeEmptyObjects,
} from '../general/util';

export function genUnitGroupJsonOrdered(id: string, data: any) {
  let quantitativeReference = {};
  const unit =
    data?.units?.unit?.map((item: any) => {
      if (item.quantitativeReference) {
        quantitativeReference = {
          referenceToReferenceUnit: item['@dataSetInternalID'],
        };
      }
      return {
        '@dataSetInternalID': item['@dataSetInternalID'],
        name: item.name,
        meanValue: item.meanValue,
        generalComment: getLangJson(item.generalComment),
      };
    }) ?? [];

  return removeEmptyObjects({
    unitGroupDataSet: {
      // '@xmlns': oldData.unitGroupDataSet?.['@xmlns'] ?? {},
      // '@xmlns:common': oldData.unitGroupDataSet?.['@xmlns:common'] ?? {},
      // '@xmlns:xsi': oldData.unitGroupDataSet?.['@xmlns:xsi'] ?? {},
      // '@version': oldData.unitGroupDataSet?.['@version'] ?? {},
      // '@xsi:schemaLocation': oldData.unitGroupDataSet?.['@xsi:schemaLocation'] ?? {},
      '@xmlns': 'http://lca.jrc.it/ILCD/UnitGroup',
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://lca.jrc.it/ILCD/UnitGroup ../../schemas/ILCD_UnitGroupDataSet.xsd',
      unitGroupInformation: {
        dataSetInformation: {
          'common:UUID': id,
          'common:name': getLangJson(
            data?.unitGroupInformation?.dataSetInformation?.['common:name'],
          ),
          classificationInformation: {
            ...data?.unitGroupInformation?.dataSetInformation?.classificationInformation,
            'common:classification': classificationSystemsToJson(
              data?.unitGroupInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
            ),
          },
          'common:generalComment': getLangJson(
            data?.unitGroupInformation?.dataSetInformation?.['common:generalComment'],
          ),
          email: data?.unitGroupInformation?.dataSetInformation?.email ?? {},
        },
        quantitativeReference: quantitativeReference,
      },
      modellingAndValidation: {
        complianceDeclarations: {
          compliance: {
            'common:referenceToComplianceSystem': {
              '@refObjectId':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@refObjectId'] ?? {},
              '@type':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@type'] ?? {},
              '@uri':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@uri'] ?? {},
              '@version':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@version'] ?? {},
              'common:shortDescription': getLangJson(
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['common:shortDescription'],
              ),
            },
            'common:approvalOfOverallCompliance':
              data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                'common:approvalOfOverallCompliance'
              ] ?? {},
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
              ] ?? {},
            '@type':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@type'
              ] ?? {},
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@uri'
              ] ?? {},
            '@version':
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                '@version'
              ] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        publicationAndOwnership: {
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'] ??
            {},
          'common:permanentDataSetURI':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:permanentDataSetURI'
            ],
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
        },
      },
      units: {
        unit: unit,
      },
    },
  });
}

export function genUnitGroupFromData(data: any): FormUnitGroup {
  let unit = data?.units?.unit;
  if (unit && !Array.isArray(unit)) {
    unit = [unit];
  }
  const unitGroup = createTidasUnitGroup({
    unitGroupDataSet: {
      '@xmlns': 'http://lca.jrc.it/ILCD/UnitGroup',
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://lca.jrc.it/ILCD/UnitGroup ../../schemas/ILCD_UnitGroupDataSet.xsd',
      unitGroupInformation: {
        dataSetInformation: {
          'common:UUID': data?.unitGroupInformation?.dataSetInformation?.['common:UUID'] ?? '-',
          'common:name': getLangList(
            data?.unitGroupInformation?.dataSetInformation?.['common:name'],
          ),
          classificationInformation: {
            ...data?.unitGroupInformation?.dataSetInformation?.classificationInformation,
            'common:classification': mapTidasRepeated(
              data?.unitGroupInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
              (item) => ({
                ...item,
                'common:class': classificationClassesToForm(item, 'UnitGroup'),
              }),
            ),
          },
          'common:generalComment': getLangList(
            data?.unitGroupInformation?.dataSetInformation?.['common:generalComment'],
          ),
          // email: data?.unitGroupInformation?.dataSetInformation?.email,
        },
        quantitativeReference: {
          referenceToReferenceUnit:
            data?.unitGroupInformation?.quantitativeReference?.referenceToReferenceUnit,
        },
      },
      modellingAndValidation: {
        complianceDeclarations: {
          compliance: {
            'common:referenceToComplianceSystem': {
              '@refObjectId':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@refObjectId'],
              '@type':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@type'],
              '@uri':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@uri'],
              '@version':
                data?.modellingAndValidation?.complianceDeclarations?.compliance?.[
                  'common:referenceToComplianceSystem'
                ]?.['@version'],
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
          'common:permanentDataSetURI':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:permanentDataSetURI'
            ],
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
        },
      },
      units: {
        unit: unit?.map((item: any) => {
          if (
            item['@dataSetInternalID'] ===
            (data?.unitGroupInformation?.quantitativeReference?.referenceToReferenceUnit ?? '')
          ) {
            return {
              '@dataSetInternalID': item['@dataSetInternalID'],
              name: item['name'],
              meanValue: item['meanValue'],
              generalComment: item['generalComment'],
              quantitativeReference: true,
            };
          } else {
            return {
              '@dataSetInternalID': item['@dataSetInternalID'],
              name: item['name'],
              meanValue: item['meanValue'],
              generalComment: item['generalComment'],
              quantitativeReference: false,
            };
          }
        }),
      },
    },
  });

  return removeEmptyObjects({
    unitGroupInformation: unitGroup.unitGroupDataSet.unitGroupInformation,
    administrativeInformation: unitGroup.unitGroupDataSet.administrativeInformation,
    modellingAndValidation: unitGroup.unitGroupDataSet.modellingAndValidation,
    units: unitGroup.unitGroupDataSet.units,
  });
}

export function genUnitTableData(data: any, lang: string) {
  if (data) {
    return data.map((item: any) => {
      return removeEmptyObjects({
        dataSetInternalID: item['@dataSetInternalID'],
        name: item.name ?? '-',
        generalComment: getLangText(item.generalComment, lang),
        quantitativeReference: item.quantitativeReference ?? false,
        meanValue: item.meanValue ?? '-',
      });
    });
  }
  return {};
}
