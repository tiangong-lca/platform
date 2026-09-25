import { FormProcess } from '@/services/processes/data';
import { createProcess as createTidasProcess } from '@tiangong-lca/tidas-sdk/core';
import {
  CANONICAL_CONTENT_LANGUAGE,
  normalizeSupportedContentLanguage,
} from '../general/contentLanguageRegistry';
import {
  normalizeOptionalTidasPercentage,
  normalizeOptionalTidasYear,
} from '../general/tidasScalarStorage';
import {
  capitalize,
  classificationToJsonList,
  classificationToStringList,
  convertCopyrightToBoolean,
  convertToUTCISOString,
  formatDateTime,
  getExactLangText,
  getLangJson,
  getLangList,
  getLangText,
  jsonToList,
  listToJson,
  removeEmptyObjects,
  toAmountNumber,
} from '../general/util';
import {
  ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX,
  deriveAnnualSupplyVolumeSuffix,
  normalizeAnnualSupplyVolumeMultiLang,
} from './annualSupplyOrProductionVolume';
import { normalizeExchangeLocationCode } from './exchangeLocation';

const normalizeExchangeAmountValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === 'undefined') {
    return undefined;
  }

  return value;
};

const toExchangeAmountString = (value: string | number | null | undefined) => {
  const normalizedValue = normalizeExchangeAmountValue(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  return `${normalizedValue}`;
};

const getExchangeLocationField = (value: unknown) => {
  const location = normalizeExchangeLocationCode(value);
  return location ? { location } : {};
};

const normalizeAllocationPercentageValue = (value: unknown) =>
  normalizeOptionalTidasPercentage(typeof value === 'string' ? value.replace('%', '') : value);

const hasReviewReportReference = (value: unknown): boolean => {
  if (value === undefined) return false;
  if (value === null) return true;
  if (Array.isArray(value) || typeof value !== 'object') return true;

  // Ant Design can register untouched nested fields with undefined values. A cleared
  // selector is absence; any actual value, including a partial reference, is not.
  return Object.values(value).some((field) => field !== undefined);
};

export function genProcessJsonOrdered(
  id: string,
  data: any,
  options?: { preserveAnnualSupplyVolumeText?: boolean },
) {
  let quantitativeReference = {};
  const exchangeList = jsonToList(data?.exchanges?.exchange);
  const normalizeAnnualSupplyOrProductionVolume = (value: unknown) =>
    normalizeAnnualSupplyVolumeMultiLang(
      value,
      (item) => {
        const language =
          typeof item?.['@xml:lang'] === 'string' ? item['@xml:lang'] : CANONICAL_CONTENT_LANGUAGE;
        const suffix = deriveAnnualSupplyVolumeSuffix({
          exchangeDataSource: exchangeList,
          getLangText: getExactLangText,
          lang: language,
        });

        return (
          suffix ||
          (normalizeSupportedContentLanguage(language) === CANONICAL_CONTENT_LANGUAGE
            ? ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX
            : '')
        );
      },
      { useDefaultSuffix: false },
    );
  const exchange = exchangeList.map((item: any) => {
    if (item?.quantitativeReference === true) {
      quantitativeReference = {
        '@type': 'Reference flow(s)',
        referenceToReferenceFlow: item?.['@dataSetInternalID'],
        functionalUnitOrOther: getLangJson(item.functionalUnitOrOther),
      };
    }
    const resultingAmount =
      toAmountNumber(item.resultingAmount) === 0 ? item.meanAmount : item.resultingAmount;
    return {
      '@dataSetInternalID': item?.['@dataSetInternalID'],
      referenceToFlowDataSet: {
        '@type': item?.referenceToFlowDataSet?.['@type'],
        '@refObjectId': item?.referenceToFlowDataSet?.['@refObjectId'],
        '@uri': item?.referenceToFlowDataSet?.['@uri'],
        '@version': item?.referenceToFlowDataSet?.['@version'],
        'common:shortDescription': getLangJson(
          item?.referenceToFlowDataSet?.['common:shortDescription'],
        ),
      },
      ...getExchangeLocationField(item.location),
      functionType: item.functionType,
      exchangeDirection: item.exchangeDirection,
      referenceToVariable: item.referenceToVariable,
      meanAmount: toExchangeAmountString(item.meanAmount),
      resultingAmount: toExchangeAmountString(resultingAmount),
      minimumAmount: item.minimumAmount,
      maximumAmount: item.maximumAmount,
      uncertaintyDistributionType: item.uncertaintyDistributionType,
      allocations: {
        allocation: {
          '@internalReferenceToCoProduct':
            item?.allocations?.allocation?.['@internalReferenceToCoProduct'],
          '@allocatedFraction': normalizeAllocationPercentageValue(
            item?.allocations?.allocation?.['@allocatedFraction'],
          ),
        },
      },
      relativeStandardDeviation95In: normalizeOptionalTidasPercentage(
        item.relativeStandardDeviation95In,
      ),
      dataSourceType: item.dataSourceType,
      dataDerivationTypeStatus: item.dataDerivationTypeStatus,
      referencesToDataSource: {
        referenceToDataSource: jsonToList(item?.referencesToDataSource?.referenceToDataSource)?.map(
          (source: any) => ({
            '@type': source?.['@type'],
            '@refObjectId': source?.['@refObjectId'],
            '@uri': source?.['@uri'],
            '@version': source?.['@version'],
            'common:shortDescription': getLangJson(source?.['common:shortDescription']),
          }),
        ),
      },
      generalComment: getLangJson(item.generalComment),
    };
  });

  return removeEmptyObjects({
    processDataSet: {
      // '@xmlns:common': oldData.processDataSet?.['@xmlns:common'] ?? {},
      // '@xmlns': oldData.processDataSet?.['@xmlns'] ?? {},
      // '@xmlns:xsi': oldData.processDataSet?.['@xmlns:xsi'] ?? {},
      // '@version': oldData.processDataSet['@version'] ?? {},
      // '@xsi:schemaLocation': oldData.processDataSet['@xsi:schemaLocation'] ?? {},
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/Process',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@locations': '../ILCDLocations.xml',
      '@xsi:schemaLocation': 'http://lca.jrc.it/ILCD/Process ../../schemas/ILCD_ProcessDataSet.xsd',
      processInformation: {
        dataSetInformation: {
          'common:UUID': id,
          name: {
            baseName: getLangJson(data?.processInformation?.dataSetInformation?.name?.baseName),
            treatmentStandardsRoutes: getLangJson(
              data?.processInformation?.dataSetInformation?.name?.treatmentStandardsRoutes,
            ),
            mixAndLocationTypes: getLangJson(
              data?.processInformation?.dataSetInformation?.name?.mixAndLocationTypes,
            ),
            functionalUnitFlowProperties: getLangJson(
              data?.processInformation?.dataSetInformation?.name?.functionalUnitFlowProperties,
            ),
          },
          identifierOfSubDataSet:
            data?.processInformation?.dataSetInformation?.identifierOfSubDataSet,
          'common:synonyms': getLangJson(
            data?.processInformation?.dataSetInformation?.['common:synonyms'],
          ),
          classificationInformation: {
            'common:classification': {
              'common:class': classificationToJsonList(
                data?.processInformation?.dataSetInformation?.classificationInformation?.[
                  'common:classification'
                ]?.['common:class'],
              ),
            },
          },
          'common:generalComment': getLangJson(
            data?.processInformation?.dataSetInformation?.['common:generalComment'],
          ),
          referenceToExternalDocumentation: {
            '@refObjectId':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@refObjectId'
              ] ?? {},
            '@type':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@type'
              ] ?? {},
            '@uri':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@uri'
              ] ?? {},
            '@version':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@version'
              ] ?? {},
            'common:shortDescription': getLangJson(
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        quantitativeReference: { ...quantitativeReference },
        time: {
          'common:referenceYear': normalizeOptionalTidasYear(
            data?.processInformation?.time?.['common:referenceYear'],
          ),
          'common:dataSetValidUntil': normalizeOptionalTidasYear(
            data?.processInformation?.time?.['common:dataSetValidUntil'],
          ),
          'common:timeRepresentativenessDescription': getLangJson(
            data?.processInformation?.time?.['common:timeRepresentativenessDescription'],
          ),
        },
        geography: {
          locationOfOperationSupplyOrProduction: {
            '@location':
              data?.processInformation?.geography?.locationOfOperationSupplyOrProduction?.[
                '@location'
              ] === 'NULL'
                ? {}
                : (data?.processInformation?.geography?.locationOfOperationSupplyOrProduction?.[
                    '@location'
                  ] ?? {}),
            descriptionOfRestrictions: getLangJson(
              data?.processInformation?.geography?.locationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions,
            ),
          },
          subLocationOfOperationSupplyOrProduction: {
            '@subLocation':
              data?.processInformation?.geography?.subLocationOfOperationSupplyOrProduction?.[
                '@subLocation'
              ] === 'NULL'
                ? {}
                : (data?.processInformation?.geography?.subLocationOfOperationSupplyOrProduction?.[
                    '@subLocation'
                  ] ?? {}),
            descriptionOfRestrictions: getLangJson(
              data?.processInformation?.geography?.subLocationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions,
            ),
          },
        },
        technology: {
          referenceToIncludedProcesses: listToJson(
            data?.processInformation?.technology?.referenceToIncludedProcesses,
          ),
          technologyDescriptionAndIncludedProcesses: getLangJson(
            data?.processInformation?.technology?.technologyDescriptionAndIncludedProcesses,
          ),
          technologicalApplicability: getLangJson(
            data?.processInformation?.technology?.technologicalApplicability,
          ),
          referenceToTechnologyPictogramme: {
            '@type':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.['@type'] ??
              {},
            '@version':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                '@version'
              ] ?? {},
            '@refObjectId':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                '@refObjectId'
              ] ?? {},
            '@uri':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.['@uri'] ??
              {},
            'common:shortDescription': getLangJson(
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                'common:shortDescription'
              ],
            ),
          },
          referenceToTechnologyFlowDiagrammOrPicture: {
            '@type':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@type'
              ] ?? {},
            '@version':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@version'
              ] ?? {},
            '@refObjectId':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@refObjectId'
              ] ?? {},
            '@uri':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@uri'
              ] ?? {},
            'common:shortDescription': getLangJson(
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        mathematicalRelations: {
          modelDescription: getLangJson(
            data?.processInformation?.mathematicalRelations?.modelDescription,
          ),
          variableParameter: {
            '@name': data?.processInformation?.mathematicalRelations?.variableParameter?.['@name'],
            formula: data?.processInformation?.mathematicalRelations?.variableParameter?.formula,
            meanValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.meanValue,
            minimumValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.minimumValue,
            maximumValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.maximumValue,
            uncertaintyDistributionType:
              data?.processInformation?.mathematicalRelations?.variableParameter
                ?.uncertaintyDistributionType,
            relativeStandardDeviation95In: normalizeOptionalTidasPercentage(
              data?.processInformation?.mathematicalRelations?.variableParameter
                ?.relativeStandardDeviation95In,
            ),
            comment: data?.processInformation?.mathematicalRelations?.variableParameter?.comment,
          },
        },
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: data?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ?? {},
          LCIMethodPrinciple:
            data?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodPrinciple ?? {},
          deviationsFromLCIMethodPrinciple: getLangJson(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodPrinciple,
          ),
          LCIMethodApproaches:
            data?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodApproaches ?? {},
          deviationsFromLCIMethodApproaches: getLangJson(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodApproaches,
          ),
          modellingConstants: getLangJson(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.modellingConstants,
          ),
          deviationsFromModellingConstants: getLangJson(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromModellingConstants,
          ),
          referenceToLCAMethodDetails: {
            '@type':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@type'
              ] ?? {},
            '@refObjectId':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@refObjectId'
              ] ?? {},
            '@uri':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@uri'
              ] ?? {},
            '@version':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@version'
              ] ?? {},
            'common:shortDescription': getLangJson(
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        dataSourcesTreatmentAndRepresentativeness: {
          dataCutOffAndCompletenessPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataCutOffAndCompletenessPrinciples,
          ),
          deviationsFromCutOffAndCompletenessPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromCutOffAndCompletenessPrinciples,
          ),
          dataSelectionAndCombinationPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataSelectionAndCombinationPrinciples,
          ),
          deviationsFromSelectionAndCombinationPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromSelectionAndCombinationPrinciples,
          ),
          dataTreatmentAndExtrapolationsPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataTreatmentAndExtrapolationsPrinciples,
          ),
          deviationsFromTreatmentAndExtrapolationPrinciples: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromTreatmentAndExtrapolationPrinciples,
          ),
          referenceToDataHandlingPrinciples: {
            '@type':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@type'] ?? {},
            '@refObjectId':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@refObjectId'] ?? {},
            '@uri':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@uri'] ?? {},
            '@version':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['common:shortDescription'],
            ),
          },
          referenceToDataSource: listToJson(
            jsonToList(
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource,
            ).map((ref: any) => {
              return {
                '@type': ref?.['@type'] ?? {},
                '@refObjectId': ref?.['@refObjectId'] ?? {},
                '@version': ref?.['@version'] ?? {},
                '@uri': ref?.['@uri'] ?? {},
                'common:shortDescription': getLangJson(ref?.['common:shortDescription']),
              };
            }),
          ),
          percentageSupplyOrProductionCovered:
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.percentageSupplyOrProductionCovered ?? {},
          annualSupplyOrProductionVolume: getLangJson(
            options?.preserveAnnualSupplyVolumeText
              ? data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.annualSupplyOrProductionVolume
              : normalizeAnnualSupplyOrProductionVolume(
                  data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                    ?.annualSupplyOrProductionVolume,
                ),
          ),
          samplingProcedure: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.samplingProcedure,
          ),
          dataCollectionPeriod: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataCollectionPeriod,
          ),
          uncertaintyAdjustments: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.uncertaintyAdjustments,
          ),
          useAdviceForDataSet: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.useAdviceForDataSet,
          ),
        },
        completeness: {
          completenessProductModel:
            data?.modellingAndValidation?.completeness?.completenessProductModel,
          completenessElementaryFlows: {
            '@type':
              data?.modellingAndValidation?.completeness?.completenessElementaryFlows?.['@type'],
            '@value':
              data?.modellingAndValidation?.completeness?.completenessElementaryFlows?.['@value'],
          },
          completenessOtherProblemField: getLangJson(
            data?.modellingAndValidation?.completeness?.completenessOtherProblemField,
          ),
          // completenessDescription: getLangJson(
          //   data?.modellingAndValidation?.completeness?.completenessDescription,
          // ),
        },
        validation: {
          review: listToJson(
            (Array.isArray(data?.modellingAndValidation?.validation?.review)
              ? data?.modellingAndValidation?.validation?.review
              : [data?.modellingAndValidation?.validation?.review]
            )?.map((review: any) => {
              return {
                '@type': review?.['@type'] ?? {},
                'common:scope': listToJson(
                  (Array.isArray(review?.['common:scope'])
                    ? review?.['common:scope']
                    : [review?.['common:scope']]
                  )?.map((scope: any) => {
                    return {
                      '@name': scope?.['@name'] ?? {},
                      'common:method': {
                        '@name': scope?.['common:method']?.['@name'] ?? {},
                      },
                    };
                  }),
                ),
                'common:dataQualityIndicators': {
                  'common:dataQualityIndicator': listToJson(
                    (Array.isArray(
                      review?.['common:dataQualityIndicators']?.['common:dataQualityIndicator'],
                    )
                      ? review?.['common:dataQualityIndicators']?.['common:dataQualityIndicator']
                      : [review?.['common:dataQualityIndicators']?.['common:dataQualityIndicator']]
                    )?.map((dataQualityIndicator: any) => {
                      return {
                        '@name': dataQualityIndicator?.['@name'] ?? {},
                        '@value': dataQualityIndicator?.['@value'] ?? {},
                      };
                    }),
                  ),
                },
                'common:reviewDetails': getLangJson(review?.['common:reviewDetails']),
                'common:referenceToNameOfReviewerAndInstitution': {
                  '@refObjectId':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@refObjectId'] ??
                    {},
                  '@type':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@type'] ?? {},
                  '@uri':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@uri'] ?? {},
                  '@version':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@version'] ?? {},
                  'common:shortDescription': getLangJson(
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.[
                      'common:shortDescription'
                    ],
                  ),
                },
                'common:otherReviewDetails': getLangJson(review?.['common:otherReviewDetails']),
                ...(hasReviewReportReference(review?.['common:referenceToCompleteReviewReport'])
                  ? {
                      'common:referenceToCompleteReviewReport': {
                        '@refObjectId':
                          review?.['common:referenceToCompleteReviewReport']?.['@refObjectId'] ??
                          {},
                        '@type':
                          review?.['common:referenceToCompleteReviewReport']?.['@type'] ?? {},
                        '@uri': review?.['common:referenceToCompleteReviewReport']?.['@uri'] ?? {},
                        '@version':
                          review?.['common:referenceToCompleteReviewReport']?.['@version'] ?? {},
                        'common:shortDescription': getLangJson(
                          review?.['common:referenceToCompleteReviewReport']?.[
                            'common:shortDescription'
                          ],
                        ),
                      },
                    }
                  : {}),
              };
            }),
          ),
        },
        complianceDeclarations: {
          compliance: listToJson(
            (Array.isArray(data?.modellingAndValidation?.complianceDeclarations?.compliance)
              ? data?.modellingAndValidation?.complianceDeclarations?.compliance
              : [data?.modellingAndValidation?.complianceDeclarations?.compliance]
            )?.map((compliance: any) => {
              return {
                'common:referenceToComplianceSystem': {
                  '@refObjectId':
                    compliance?.['common:referenceToComplianceSystem']?.['@refObjectId'] ?? {},
                  '@type': compliance?.['common:referenceToComplianceSystem']?.['@type'] ?? {},
                  '@uri': compliance?.['common:referenceToComplianceSystem']?.['@uri'] ?? {},
                  '@version':
                    compliance?.['common:referenceToComplianceSystem']?.['@version'] ?? {},
                  'common:shortDescription': getLangJson(
                    compliance?.['common:referenceToComplianceSystem']?.['common:shortDescription'],
                  ),
                },
                'common:approvalOfOverallCompliance':
                  compliance?.['common:approvalOfOverallCompliance'] ?? {},
                'common:nomenclatureCompliance':
                  compliance?.['common:nomenclatureCompliance'] ?? {},
                'common:methodologicalCompliance':
                  compliance?.['common:methodologicalCompliance'] ?? {},
                'common:reviewCompliance': compliance?.['common:reviewCompliance'] ?? {},
                'common:documentationCompliance':
                  compliance?.['common:documentationCompliance'] ?? {},
                'common:qualityCompliance': compliance?.['common:qualityCompliance'] ?? {},
              };
            }),
          ),
        },
      },
      administrativeInformation: {
        ['common:commissionerAndGoal']: {
          'common:referenceToCommissioner': {
            '@refObjectId':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['common:shortDescription'],
            ),
          },
          'common:project': getLangJson(
            data?.administrativeInformation?.['common:commissionerAndGoal']?.['common:project'],
          ),
          'common:intendedApplications': getLangJson(
            data?.administrativeInformation?.['common:commissionerAndGoal']?.[
              'common:intendedApplications'
            ],
          ),
        },
        dataGenerator: {
          'common:referenceToPersonOrEntityGeneratingTheDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['common:shortDescription'],
            ),
          },
        },
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
              ] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
            ),
          },
          'common:referenceToConvertedOriginalDataSetFrom': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToPersonOrEntityEnteringTheData': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToDataSetUseApproval': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['common:shortDescription'],
            ),
          },
        },

        publicationAndOwnership: {
          'common:dateOfLastRevision':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:dateOfLastRevision'
            ] ?? {},
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'] ??
            {},
          'common:permanentDataSetURI': `https://lcdn.tiangong.earth/datasetdetail/process.xhtml?uuid=${id}&version=${data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion']}`,
          'common:workflowAndPublicationStatus':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:workflowAndPublicationStatus'
            ] ?? {},
          'common:referenceToUnchangedRepublication': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToRegistrationAuthority': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['common:shortDescription'],
            ),
          },
          'common:registrationNumber':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:registrationNumber'
            ] ?? {},
          'common:referenceToOwnershipOfDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['common:shortDescription'],
            ),
          },
          'common:copyright':
            data?.administrativeInformation?.publicationAndOwnership?.['common:copyright'],
          'common:referenceToEntitiesWithExclusiveAccess': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['common:shortDescription'],
            ),
          },
          'common:licenseType':
            data?.administrativeInformation?.publicationAndOwnership?.['common:licenseType'],
          'common:accessRestrictions': getLangJson(
            data?.administrativeInformation?.publicationAndOwnership?.['common:accessRestrictions'],
          ),
        },
      },
      exchanges: {
        exchange: exchange,
      },
      LCIAResults: {
        LCIAResult: data?.LCIAResults?.LCIAResult ?? [],
        'common:other': data?.LCIAResults?.['common:other'],
      },
    },
  });
}

export function genProcessFromData(data: any): FormProcess {
  const exchange = data?.exchanges?.exchange ?? [];
  let exchangeList = [];
  if (!Array.isArray(exchange)) {
    exchangeList = [exchange];
  } else {
    exchangeList = exchange;
  }

  const process = createTidasProcess({
    processDataSet: {
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns': 'http://lca.jrc.it/ILCD/Process',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@version': '1.1',
      '@locations': '../ILCDLocations.xml',
      '@xsi:schemaLocation': 'http://lca.jrc.it/ILCD/Process ../../schemas/ILCD_ProcessDataSet.xsd',
      processInformation: {
        dataSetInformation: {
          'common:UUID': data?.processInformation?.dataSetInformation?.['common:UUID'] ?? '-',
          name: {
            baseName: getLangList(data?.processInformation?.dataSetInformation?.name?.baseName),
            treatmentStandardsRoutes: getLangList(
              data?.processInformation?.dataSetInformation?.name?.treatmentStandardsRoutes,
            ),
            mixAndLocationTypes: getLangList(
              data?.processInformation?.dataSetInformation?.name?.mixAndLocationTypes,
            ),
            functionalUnitFlowProperties: getLangList(
              data?.processInformation?.dataSetInformation?.name?.functionalUnitFlowProperties,
            ),
          },
          identifierOfSubDataSet:
            data?.processInformation?.dataSetInformation?.identifierOfSubDataSet,
          'common:synonyms': getLangList(
            data?.processInformation?.dataSetInformation?.['common:synonyms'],
          ),
          classificationInformation: {
            'common:classification': {
              'common:class': classificationToStringList(
                data?.processInformation?.dataSetInformation?.classificationInformation?.[
                  'common:classification'
                ]?.['common:class'],
              ) as any,
            },
          },
          'common:generalComment': getLangList(
            data?.processInformation?.dataSetInformation?.['common:generalComment'],
          ),
          referenceToExternalDocumentation: {
            '@refObjectId':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@refObjectId'
              ] ?? {},
            '@type':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@type'
              ] ?? {},
            '@uri':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@uri'
              ] ?? {},
            '@version':
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                '@version'
              ] ?? {},
            'common:shortDescription': getLangList(
              data?.processInformation?.dataSetInformation?.['referenceToExternalDocumentation']?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        quantitativeReference: {
          '@type': data?.processInformation?.quantitativeReference?.['@type'] ?? {},
          referenceToReferenceFlow:
            data?.processInformation?.quantitativeReference?.referenceToReferenceFlow ?? {},
          functionalUnitOrOther: getLangList(
            data?.processInformation?.quantitativeReference?.functionalUnitOrOther,
          ),
        },
        time: {
          'common:referenceYear': normalizeOptionalTidasYear(
            data?.processInformation?.time?.['common:referenceYear'],
          ),
          'common:dataSetValidUntil': normalizeOptionalTidasYear(
            data?.processInformation?.time?.['common:dataSetValidUntil'],
          ),
          'common:timeRepresentativenessDescription': getLangList(
            data?.processInformation?.time?.['common:timeRepresentativenessDescription'],
          ),
        },
        geography: {
          locationOfOperationSupplyOrProduction: {
            '@location':
              data?.processInformation?.geography?.locationOfOperationSupplyOrProduction?.[
                '@location'
              ] ?? {},
            descriptionOfRestrictions: getLangList(
              data?.processInformation?.geography?.locationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions,
            ),
          },
          subLocationOfOperationSupplyOrProduction: {
            '@subLocation':
              data?.processInformation?.geography?.subLocationOfOperationSupplyOrProduction?.[
                '@subLocation'
              ] ?? {},
            descriptionOfRestrictions: getLangList(
              data?.processInformation?.geography?.subLocationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions,
            ),
          },
        },
        technology: {
          referenceToIncludedProcesses: jsonToList(
            data?.processInformation?.technology?.referenceToIncludedProcesses,
          ),
          technologyDescriptionAndIncludedProcesses: getLangList(
            data?.processInformation?.technology?.technologyDescriptionAndIncludedProcesses,
          ),
          technologicalApplicability: getLangList(
            data?.processInformation?.technology?.technologicalApplicability,
          ),
          referenceToTechnologyPictogramme: {
            '@type':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.['@type'] ??
              {},
            '@refObjectId':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                '@refObjectId'
              ] ?? {},
            '@version':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                '@version'
              ] ?? {},
            '@uri':
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.['@uri'] ??
              {},
            'common:shortDescription': getLangList(
              data?.processInformation?.technology?.referenceToTechnologyPictogramme?.[
                'common:shortDescription'
              ],
            ),
          },
          referenceToTechnologyFlowDiagrammOrPicture: {
            '@type':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@type'
              ] ?? {},
            '@refObjectId':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@refObjectId'
              ] ?? {},
            '@version':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@version'
              ] ?? {},
            '@uri':
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                '@uri'
              ] ?? {},
            'common:shortDescription': getLangList(
              data?.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        mathematicalRelations: {
          modelDescription: getLangList(
            data?.processInformation?.mathematicalRelations?.modelDescription,
          ),
          variableParameter: {
            '@name': data?.processInformation?.mathematicalRelations?.variableParameter?.['@name'],
            formula: data?.processInformation?.mathematicalRelations?.variableParameter?.formula,
            meanValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.meanValue,
            minimumValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.minimumValue,
            maximumValue:
              data?.processInformation?.mathematicalRelations?.variableParameter?.maximumValue,
            uncertaintyDistributionType:
              data?.processInformation?.mathematicalRelations?.variableParameter
                ?.uncertaintyDistributionType,
            relativeStandardDeviation95In:
              data?.processInformation?.mathematicalRelations?.variableParameter
                ?.relativeStandardDeviation95In,
            comment: data?.processInformation?.mathematicalRelations?.variableParameter?.comment,
          },
        },
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: data?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ?? {},
          LCIMethodPrinciple:
            data?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodPrinciple ?? {},
          deviationsFromLCIMethodPrinciple: getLangList(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodPrinciple,
          ),
          LCIMethodApproaches:
            data?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodApproaches ?? {},
          deviationsFromLCIMethodApproaches: getLangList(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodApproaches,
          ),
          modellingConstants: getLangList(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.modellingConstants,
          ),
          deviationsFromModellingConstants: getLangList(
            data?.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromModellingConstants,
          ),
          referenceToLCAMethodDetails: {
            '@type':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@type'
              ] ?? {},
            '@refObjectId':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@refObjectId'
              ] ?? {},
            '@uri':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@uri'
              ] ?? {},
            '@version':
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                '@version'
              ] ?? {},
            'common:shortDescription': getLangList(
              data?.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails?.[
                'common:shortDescription'
              ],
            ),
          },
        },
        dataSourcesTreatmentAndRepresentativeness: {
          dataCutOffAndCompletenessPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataCutOffAndCompletenessPrinciples,
          ),
          deviationsFromCutOffAndCompletenessPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromCutOffAndCompletenessPrinciples,
          ),
          dataSelectionAndCombinationPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataSelectionAndCombinationPrinciples,
          ),
          deviationsFromSelectionAndCombinationPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromSelectionAndCombinationPrinciples,
          ),
          dataTreatmentAndExtrapolationsPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataTreatmentAndExtrapolationsPrinciples,
          ),
          deviationsFromTreatmentAndExtrapolationPrinciples: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.deviationsFromTreatmentAndExtrapolationPrinciples,
          ),
          referenceToDataHandlingPrinciples: {
            '@type':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@type'] ?? {},
            '@refObjectId':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@refObjectId'] ?? {},
            '@uri':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@uri'] ?? {},
            '@version':
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples?.['common:shortDescription'],
            ),
          },
          referenceToDataSource: jsonToList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.referenceToDataSource,
          ).map((ref: any) => {
            return {
              '@type': ref?.['@type'] ?? {},
              '@refObjectId': ref?.['@refObjectId'] ?? {},
              '@version': ref?.['@version'] ?? {},
              '@uri': ref?.['@uri'] ?? {},
              'common:shortDescription': getLangList(ref?.['common:shortDescription']),
            };
          }),
          percentageSupplyOrProductionCovered:
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.percentageSupplyOrProductionCovered ?? {},
          annualSupplyOrProductionVolume: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.annualSupplyOrProductionVolume,
          ),
          samplingProcedure: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.samplingProcedure,
          ),
          dataCollectionPeriod: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.dataCollectionPeriod,
          ),
          uncertaintyAdjustments: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.uncertaintyAdjustments,
          ),
          useAdviceForDataSet: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.useAdviceForDataSet,
          ),
        },
        completeness: {
          completenessProductModel:
            data?.modellingAndValidation?.completeness?.completenessProductModel,
          completenessElementaryFlows: {
            '@type':
              data?.modellingAndValidation?.completeness?.completenessElementaryFlows?.['@type'],
            '@value':
              data?.modellingAndValidation?.completeness?.completenessElementaryFlows?.['@value'],
          },
          completenessOtherProblemField: getLangList(
            data?.modellingAndValidation?.completeness?.completenessOtherProblemField,
          ),
          // completenessDescription: getLangList(
          //   data?.modellingAndValidation?.completeness?.completenessDescription,
          // ),
        },
        validation: {
          review: jsonToList(data?.modellingAndValidation?.validation?.review).map(
            (review: any) => {
              return {
                '@type': review?.['@type'],
                'common:scope': jsonToList(review?.['common:scope']),
                'common:dataQualityIndicators': {
                  'common:dataQualityIndicator': jsonToList(
                    review?.['common:dataQualityIndicators']?.['common:dataQualityIndicator'],
                  ),
                },
                'common:reviewDetails': getLangList(review?.['common:reviewDetails']),
                'common:referenceToNameOfReviewerAndInstitution': {
                  '@refObjectId':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@refObjectId'],
                  '@type': review?.['common:referenceToNameOfReviewerAndInstitution']?.['@type'],
                  '@uri': review?.['common:referenceToNameOfReviewerAndInstitution']?.['@uri'],
                  '@version':
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.['@version'],
                  'common:shortDescription': getLangList(
                    review?.['common:referenceToNameOfReviewerAndInstitution']?.[
                      'common:shortDescription'
                    ],
                  ),
                },
                'common:otherReviewDetails': getLangList(review?.['common:otherReviewDetails']),
                ...(hasReviewReportReference(review?.['common:referenceToCompleteReviewReport'])
                  ? {
                      'common:referenceToCompleteReviewReport': {
                        '@refObjectId':
                          review?.['common:referenceToCompleteReviewReport']?.['@refObjectId'],
                        '@type': review?.['common:referenceToCompleteReviewReport']?.['@type'],
                        '@uri': review?.['common:referenceToCompleteReviewReport']?.['@uri'],
                        '@version':
                          review?.['common:referenceToCompleteReviewReport']?.['@version'],
                        'common:shortDescription': getLangList(
                          review?.['common:referenceToCompleteReviewReport']?.[
                            'common:shortDescription'
                          ],
                        ),
                      },
                    }
                  : {}),
              };
            },
          ) as any,
        },
        complianceDeclarations: {
          compliance: jsonToList(
            data?.modellingAndValidation?.complianceDeclarations?.compliance,
          ).map((compliance: any) => {
            return {
              'common:referenceToComplianceSystem': {
                '@refObjectId':
                  compliance?.['common:referenceToComplianceSystem']?.['@refObjectId'],
                '@type': compliance?.['common:referenceToComplianceSystem']?.['@type'],
                '@uri': compliance?.['common:referenceToComplianceSystem']?.['@uri'],
                '@version': compliance?.['common:referenceToComplianceSystem']?.['@version'],
                'common:shortDescription': getLangList(
                  compliance?.['common:referenceToComplianceSystem']?.['common:shortDescription'],
                ),
              },
              'common:approvalOfOverallCompliance':
                compliance?.['common:approvalOfOverallCompliance'],
              'common:nomenclatureCompliance': compliance?.['common:nomenclatureCompliance'],
              'common:methodologicalCompliance': compliance?.['common:methodologicalCompliance'],
              'common:reviewCompliance': compliance?.['common:reviewCompliance'],
              'common:documentationCompliance': compliance?.['common:documentationCompliance'],
              'common:qualityCompliance': compliance?.['common:qualityCompliance'],
            };
          }) as any,
        },
      },
      administrativeInformation: {
        ['common:commissionerAndGoal']: {
          'common:referenceToCommissioner': {
            '@refObjectId':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['common:shortDescription'],
            ),
          },
          'common:project': getLangList(
            data?.administrativeInformation?.['common:commissionerAndGoal']?.['common:project'],
          ),
          'common:intendedApplications': getLangList(
            data?.administrativeInformation?.['common:commissionerAndGoal']?.[
              'common:intendedApplications'
            ],
          ),
        },
        dataGenerator: {
          'common:referenceToPersonOrEntityGeneratingTheDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['common:shortDescription'],
            ),
          },
        },

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
              ] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
            ),
          },
          'common:referenceToConvertedOriginalDataSetFrom': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToPersonOrEntityEnteringTheData': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToDataSetUseApproval': {
            '@refObjectId':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]?.['common:shortDescription'],
            ),
          },
        },

        publicationAndOwnership: {
          'common:dateOfLastRevision':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:dateOfLastRevision'
            ] ?? {},
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'] ??
            {},
          'common:permanentDataSetURI':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:permanentDataSetURI'
            ] ?? {},
          'common:workflowAndPublicationStatus':
            data?.administrativeInformation?.publicationAndOwnership?.[
              'common:workflowAndPublicationStatus'
            ] ?? {},
          'common:referenceToUnchangedRepublication': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ]?.['common:shortDescription'],
            ),
          },
          'common:referenceToRegistrationAuthority': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]?.['common:shortDescription'],
            ),
          },
          'common:registrationNumber':
            data?.administrativeInformation?.publicationAndOwnership?.['common:registrationNumber'],
          'common:referenceToOwnershipOfDataSet': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]?.['common:shortDescription'],
            ),
          },
          'common:copyright': convertCopyrightToBoolean(
            data?.administrativeInformation?.publicationAndOwnership?.['common:copyright'],
          ),
          'common:referenceToEntitiesWithExclusiveAccess': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@refObjectId'] ?? {},
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@type'] ?? {},
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@uri'] ?? {},
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@version'] ?? {},
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['common:shortDescription'],
            ),
          },
          'common:licenseType':
            data?.administrativeInformation?.publicationAndOwnership?.['common:licenseType'],
          'common:accessRestrictions': getLangList(
            data?.administrativeInformation?.publicationAndOwnership?.['common:accessRestrictions'],
          ),
        },
      },
      exchanges: {
        exchange: exchangeList?.map((item: any) => {
          if (
            item['@dataSetInternalID'] ===
            (data?.processInformation?.quantitativeReference?.referenceToReferenceFlow ?? '')
          ) {
            return {
              '@dataSetInternalID': item?.['@dataSetInternalID'],
              referenceToFlowDataSet: {
                '@type': item?.referenceToFlowDataSet?.['@type'],
                '@refObjectId': item?.referenceToFlowDataSet?.['@refObjectId'],
                '@uri': item?.referenceToFlowDataSet?.['@uri'],
                '@version': item?.referenceToFlowDataSet?.['@version'],
                'common:shortDescription': getLangList(
                  item?.referenceToFlowDataSet?.['common:shortDescription'],
                ),
              },
              ...getExchangeLocationField(item.location),
              functionType: item.functionType,
              exchangeDirection: capitalize(item.exchangeDirection),
              referenceToVariable: item.referenceToVariable,
              meanAmount: normalizeExchangeAmountValue(item.meanAmount),
              resultingAmount: normalizeExchangeAmountValue(item.resultingAmount),
              minimumAmount: item.minimumAmount,
              maximumAmount: item.maximumAmount,
              uncertaintyDistributionType: item.uncertaintyDistributionType,
              allocations: {
                allocation: {
                  '@internalReferenceToCoProduct':
                    item?.allocations?.allocation?.['@internalReferenceToCoProduct'],
                  '@allocatedFraction': item?.allocations?.allocation?.['@allocatedFraction']
                    ? item?.allocations?.allocation?.['@allocatedFraction']?.replace('%', '')
                    : undefined,
                },
              },
              relativeStandardDeviation95In: item.relativeStandardDeviation95In,
              dataSourceType: item.dataSourceType,
              dataDerivationTypeStatus: item.dataDerivationTypeStatus,
              referencesToDataSource: {
                referenceToDataSource: jsonToList(
                  item?.referencesToDataSource?.referenceToDataSource,
                )?.map((source: any) => ({
                  '@type': source?.['@type'],
                  '@refObjectId': source?.['@refObjectId'],
                  '@uri': source?.['@uri'],
                  '@version': source?.['@version'],
                  'common:shortDescription': getLangList(source?.['common:shortDescription']),
                })),
              },
              generalComment: getLangList(item.generalComment),
              quantitativeReference: true,
              functionalUnitOrOther: getLangList(
                data?.processInformation?.quantitativeReference?.functionalUnitOrOther,
              ),
            };
          } else {
            return {
              '@dataSetInternalID': item?.['@dataSetInternalID'],
              referenceToFlowDataSet: {
                '@type': item?.referenceToFlowDataSet?.['@type'],
                '@refObjectId': item?.referenceToFlowDataSet?.['@refObjectId'],
                '@uri': item?.referenceToFlowDataSet?.['@uri'],
                '@version': item?.referenceToFlowDataSet?.['@version'],
                'common:shortDescription': getLangList(
                  item?.referenceToFlowDataSet?.['common:shortDescription'],
                ),
              },
              ...getExchangeLocationField(item.location),
              functionType: item.functionType,
              exchangeDirection: capitalize(item.exchangeDirection),
              referenceToVariable: item.referenceToVariable,
              meanAmount: normalizeExchangeAmountValue(item.meanAmount),
              resultingAmount: normalizeExchangeAmountValue(item.resultingAmount),
              minimumAmount: item.minimumAmount,
              maximumAmount: item.maximumAmount,
              uncertaintyDistributionType: item.uncertaintyDistributionType,
              allocations: {
                allocation: {
                  '@internalReferenceToCoProduct':
                    item?.allocations?.allocation?.['@internalReferenceToCoProduct'],
                  '@allocatedFraction': item?.allocations?.allocation?.['@allocatedFraction'],
                },
              },
              relativeStandardDeviation95In: item.relativeStandardDeviation95In,
              dataSourceType: item.dataSourceType,
              dataDerivationTypeStatus: item.dataDerivationTypeStatus,
              referencesToDataSource: {
                referenceToDataSource: jsonToList(
                  item?.referencesToDataSource?.referenceToDataSource,
                )?.map((source: any) => ({
                  '@type': source?.['@type'],
                  '@refObjectId': source?.['@refObjectId'],
                  '@uri': source?.['@uri'],
                  '@version': source?.['@version'],
                  'common:shortDescription': getLangList(source?.['common:shortDescription']),
                })),
              },
              generalComment: getLangList(item.generalComment),
              quantitativeReference: false,
            };
          }
        }),
      },
      LCIAResults: {
        LCIAResult: data?.LCIAResults?.LCIAResult ?? [],
        'common:other': data?.LCIAResults?.['common:other'],
      },
    },
  } as any);
  return removeEmptyObjects({
    processInformation: process.processDataSet.processInformation,
    exchanges: process.processDataSet.exchanges,
    LCIAResults: process.processDataSet.LCIAResults,
    modellingAndValidation: process.processDataSet.modellingAndValidation,
    administrativeInformation: process.processDataSet.administrativeInformation,
  });
}

export function genProcessExchangeTableData(data: any, lang: string) {
  if (data) {
    let dataList = [];
    if (!Array.isArray(data)) {
      dataList = [data];
    } else {
      dataList = data;
    }
    return dataList?.map((item: any) => {
      return removeEmptyObjects({
        key:
          (item?.exchangeDirection ?? '-').toUpperCase() +
          ':' +
          (item?.referenceToFlowDataSet?.['@refObjectId'] ?? '-'),
        dataSetInternalID: item?.['@dataSetInternalID'] ?? '-',
        exchangeDirection: item?.exchangeDirection ?? '-',
        allocations: item?.allocations,
        referenceToFlowDataSetId: item?.referenceToFlowDataSet?.['@refObjectId'] ?? '-',
        referenceToFlowDataSetVersion: item?.referenceToFlowDataSet?.['@version'] ?? '-',
        referenceToFlowDataSet: getLangText(
          item?.referenceToFlowDataSet?.['common:shortDescription'],
          lang,
        ),
        referenceToVariable: item?.referenceToVariable ?? '-',
        meanAmount: normalizeExchangeAmountValue(item?.meanAmount) ?? '-',
        resultingAmount: normalizeExchangeAmountValue(item?.resultingAmount) ?? '-',
        dataDerivationTypeStatus: item?.dataDerivationTypeStatus ?? '-',
        referencesToDataSource: {
          referenceToDataSource: {
            '@type': item?.referencesToDataSource?.referenceToDataSource?.['@type'],
            '@refObjectId': item?.referencesToDataSource?.referenceToDataSource?.['@refObjectId'],
            '@uri': item?.referencesToDataSource?.referenceToDataSource?.['@uri'],
            '@version': item?.referencesToDataSource?.referenceToDataSource?.['@version'],
            'common:shortDescription': getLangJson(
              item?.referencesToDataSource?.referenceToDataSource?.['common:shortDescription'],
            ),
          },
        },
        generalComment: getLangText(item?.generalComment, lang),
        quantitativeReference: item?.quantitativeReference ?? false,
        functionalUnitOrOther: getLangText(item?.functionalUnitOrOther, lang),
      });
    });
  }
  return [];
}

export function genProcessName(name: any, lang: string): string {
  const baseName = getLangText(name?.baseName, lang);
  const treatmentStandardsRoutes = getLangText(name?.treatmentStandardsRoutes, lang);
  const mixAndLocationTypes = getLangText(name?.mixAndLocationTypes, lang);
  const functionalUnitFlowProperties = getLangText(name?.functionalUnitFlowProperties, lang);
  const nameStr = (
    baseName +
    '; ' +
    treatmentStandardsRoutes +
    '; ' +
    mixAndLocationTypes +
    '; ' +
    functionalUnitFlowProperties +
    '; '
  ).replace(/-; /g, '');
  if (nameStr.length === 0) {
    return '-';
  }
  return nameStr.slice(0, -2);
}

export function genProcessNameJson(name: any) {
  const nameJson = jsonToList(name?.baseName)?.map((item: any) => {
    return {
      '@xml:lang': item?.['@xml:lang'],
      '#text': genProcessName(name, item?.['@xml:lang']),
    };
  });
  return nameJson;
}
