/**
 * Submodel record builder for the life-cycle model calculation.
 *
 * zh-CN: 组装保存到 bundle 的子模型记录（主过程/副过程共用外形）。只负责把
 * 计算结果（聚合交换、LCIA、命名、finalId）装配为既有 schema 形状；不包含
 * 求解逻辑。schema 不变：字段结构与旧计算路径一致。
 *
 * en-US: Assembles the submodel records persisted through the existing bundle
 * API (shared shape for primary/secondary processes). Only assembles computed
 * results (aggregated exchanges, LCIA, names, finalId) into the existing
 * schema shape; contains no solver logic. The schema is unchanged: field
 * structure matches the previous calculation path.
 */

import { removeEmptyObjects } from '../general/util';

export interface LifeCycleModelSubmodelFinalId {
  nodeId: string;
  processId: string;
  allocatedExchangeFlowId: string;
  allocatedExchangeDirection: string;
}

export interface LifeCycleModelSubmodelRecordInput {
  option: 'create' | 'update';
  modelId: string;
  type: 'primary' | 'secondary' | 'allocated';
  finalId: LifeCycleModelSubmodelFinalId;
  baseName: any;
  newExchanges: any[];
  lciaResults: any[];
  lciaReport: unknown;
  lifeCycleModelJsonOrdered: any;
  refProcesses: any[];
}

export const buildLifeCycleModelSubmodelRecord = (
  input: LifeCycleModelSubmodelRecordInput,
): Record<string, any> => {
  const { lifeCycleModelJsonOrdered } = input;
  const modelDataSet = lifeCycleModelJsonOrdered?.lifeCycleModelDataSet ?? {};

  return removeEmptyObjects({
    option: input.option,
    modelInfo: {
      id: input.modelId,
      type: input.type,
      finalId: input.finalId,
    },
    data: {
      processDataSet: {
        processInformation: {
          dataSetInformation: {
            'common:UUID': input.modelId,
            name: {
              baseName: input.baseName,
              treatmentStandardsRoutes:
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name
                  ?.treatmentStandardsRoutes,
              mixAndLocationTypes:
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name
                  ?.mixAndLocationTypes,
              functionalUnitFlowProperties:
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name
                  ?.functionalUnitFlowProperties,
            },
            identifierOfSubDataSet:
              modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.identifierOfSubDataSet,
            'common:synonyms':
              modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.['common:synonyms'],
            classificationInformation: {
              'common:classification': {
                'common:class':
                  modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                    ?.classificationInformation?.['common:classification']?.['common:class'],
              },
            },
            'common:generalComment':
              modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.[
                'common:generalComment'
              ],
            referenceToExternalDocumentation: {
              '@refObjectId':
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                  ?.referenceToExternalDocumentation?.['@refObjectId'] ?? {},
              '@type':
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                  ?.referenceToExternalDocumentation?.['@type'] ?? {},
              '@uri':
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                  ?.referenceToExternalDocumentation?.['@uri'] ?? {},
              '@version':
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                  ?.referenceToExternalDocumentation?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.lifeCycleModelInformation?.dataSetInformation
                  ?.referenceToExternalDocumentation?.['common:shortDescription'],
            },
          },
          time: {
            'common:referenceYear':
              modelDataSet?.lifeCycleModelInformation?.time?.['common:referenceYear'] ?? {},
            'common:dataSetValidUntil':
              modelDataSet?.lifeCycleModelInformation?.time?.['common:dataSetValidUntil'],
            'common:timeRepresentativenessDescription':
              modelDataSet?.lifeCycleModelInformation?.time?.[
                'common:timeRepresentativenessDescription'
              ],
          },
          geography: {
            locationOfOperationSupplyOrProduction: {
              '@location':
                modelDataSet?.lifeCycleModelInformation?.geography
                  ?.locationOfOperationSupplyOrProduction?.['@location'] === 'NULL'
                  ? {}
                  : (modelDataSet?.lifeCycleModelInformation?.geography
                      ?.locationOfOperationSupplyOrProduction?.['@location'] ?? {}),
              descriptionOfRestrictions:
                modelDataSet?.lifeCycleModelInformation?.geography
                  ?.locationOfOperationSupplyOrProduction?.descriptionOfRestrictions,
            },
            subLocationOfOperationSupplyOrProduction: {
              '@subLocation':
                modelDataSet?.lifeCycleModelInformation?.geography
                  ?.subLocationOfOperationSupplyOrProduction?.['@subLocation'] === 'NULL'
                  ? {}
                  : (modelDataSet?.lifeCycleModelInformation?.geography
                      ?.subLocationOfOperationSupplyOrProduction?.['@subLocation'] ?? {}),
              descriptionOfRestrictions:
                modelDataSet?.lifeCycleModelInformation?.geography
                  ?.subLocationOfOperationSupplyOrProduction?.descriptionOfRestrictions,
            },
          },
          technology: {
            technologyDescriptionAndIncludedProcesses:
              modelDataSet?.lifeCycleModelInformation?.technology
                ?.technologyDescriptionAndIncludedProcesses,
            technologicalApplicability:
              modelDataSet?.lifeCycleModelInformation?.technology?.technologicalApplicability,
            referenceToTechnologyPictogramme: {
              '@type':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyPictogramme?.['@type'],
              '@refObjectId':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyPictogramme?.['@refObjectId'],
              '@version':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyPictogramme?.['@version'],
              '@uri':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyPictogramme?.['@uri'],
              'common:shortDescription':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyPictogramme?.['common:shortDescription'],
            },
            referenceToTechnologyFlowDiagrammOrPicture: {
              '@type':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyFlowDiagrammOrPicture?.['@type'],
              '@version':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyFlowDiagrammOrPicture?.['@version'],
              '@refObjectId':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyFlowDiagrammOrPicture?.['@refObjectId'],
              '@uri':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyFlowDiagrammOrPicture?.['@uri'],
              'common:shortDescription':
                modelDataSet?.lifeCycleModelInformation?.technology
                  ?.referenceToTechnologyFlowDiagrammOrPicture?.['common:shortDescription'],
            },
          },
          mathematicalRelations: {
            modelDescription:
              modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.modelDescription,
            variableParameter: {
              '@name':
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter?.[
                  '@name'
                ],
              formula:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.formula,
              meanValue:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.meanValue,
              minimumValue:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.minimumValue,
              maximumValue:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.maximumValue,
              uncertaintyDistributionType:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.uncertaintyDistributionType,
              relativeStandardDeviation95In:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.relativeStandardDeviation95In,
              comment:
                modelDataSet?.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                  ?.comment,
            },
          },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: {
            typeOfDataSet:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ?? {},
            LCIMethodPrinciple:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodPrinciple ??
              {},
            deviationsFromLCIMethodPrinciple:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromLCIMethodPrinciple,
            LCIMethodApproaches:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodApproaches ??
              {},
            deviationsFromLCIMethodApproaches:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromLCIMethodApproaches,
            modellingConstants:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation?.modellingConstants,
            deviationsFromModellingConstants:
              modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromModellingConstants,
            referenceToLCAMethodDetails: {
              '@type':
                modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                  ?.referenceToLCAMethodDetails?.['@type'] ?? {},
              '@refObjectId':
                modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                  ?.referenceToLCAMethodDetails?.['@refObjectId'] ?? {},
              '@uri':
                modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                  ?.referenceToLCAMethodDetails?.['@uri'] ?? {},
              '@version':
                modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                  ?.referenceToLCAMethodDetails?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.modellingAndValidation?.LCIMethodAndAllocation
                  ?.referenceToLCAMethodDetails?.['common:shortDescription'],
            },
          },
          dataSourcesTreatmentAndRepresentativeness: {
            dataCutOffAndCompletenessPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCutOffAndCompletenessPrinciples,
            deviationsFromCutOffAndCompletenessPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromCutOffAndCompletenessPrinciples,
            dataSelectionAndCombinationPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataSelectionAndCombinationPrinciples,
            deviationsFromSelectionAndCombinationPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromSelectionAndCombinationPrinciples,
            dataTreatmentAndExtrapolationsPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataTreatmentAndExtrapolationsPrinciples,
            deviationsFromTreatmentAndExtrapolationPrinciples:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromTreatmentAndExtrapolationPrinciples,
            referenceToDataHandlingPrinciples: {
              '@type':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataHandlingPrinciples?.['@type'] ?? {},
              '@refObjectId':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataHandlingPrinciples?.['@refObjectId'] ?? {},
              '@uri':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataHandlingPrinciples?.['@uri'] ?? {},
              '@version':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataHandlingPrinciples?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataHandlingPrinciples?.['common:shortDescription'],
            },
            referenceToDataSource: {
              '@type':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataSource?.['@type'] ?? {},
              '@version':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataSource?.['@version'] ?? {},
              '@refObjectId':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataSource?.['@refObjectId'] ?? {},
              '@uri':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataSource?.['@uri'] ?? {},
              'common:shortDescription':
                modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                  ?.referenceToDataSource?.['common:shortDescription'],
            },
            percentageSupplyOrProductionCovered:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.percentageSupplyOrProductionCovered ?? {},
            annualSupplyOrProductionVolume:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.annualSupplyOrProductionVolume,
            samplingProcedure:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.samplingProcedure,
            dataCollectionPeriod:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCollectionPeriod,
            uncertaintyAdjustments:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.uncertaintyAdjustments,
            useAdviceForDataSet:
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentEtc?.useAdviceForDataSet ??
              modelDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.useAdviceForDataSet,
          },
          completeness: {
            completenessProductModel:
              modelDataSet?.modellingAndValidation?.completeness?.completenessProductModel,
            completenessElementaryFlows: {
              '@type':
                modelDataSet?.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
                  '@type'
                ],
              '@value':
                modelDataSet?.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
                  '@value'
                ],
            },
            completenessOtherProblemField:
              modelDataSet?.modellingAndValidation?.completeness?.completenessOtherProblemField,
          },
          validation: {
            ...modelDataSet?.modellingAndValidation?.validation,
          },
          complianceDeclarations: {
            ...modelDataSet?.modellingAndValidation?.complianceDeclarations,
          },
        },
        administrativeInformation: {
          ['common:commissionerAndGoal']: {
            'common:referenceToCommissioner': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                  'common:referenceToCommissioner'
                ]?.['@refObjectId'] ?? {},
              '@type':
                modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                  'common:referenceToCommissioner'
                ]?.['@type'] ?? {},
              '@uri':
                modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                  'common:referenceToCommissioner'
                ]?.['@uri'] ?? {},
              '@version':
                modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                  'common:referenceToCommissioner'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                  'common:referenceToCommissioner'
                ]?.['common:shortDescription'],
            },
            'common:project':
              modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:project'
              ],
            'common:intendedApplications':
              modelDataSet?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:intendedApplications'
              ],
          },
          dataGenerator: {
            'common:referenceToPersonOrEntityGeneratingTheDataSet': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.dataGenerator?.[
                  'common:referenceToPersonOrEntityGeneratingTheDataSet'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.dataGenerator?.[
                  'common:referenceToPersonOrEntityGeneratingTheDataSet'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.dataGenerator?.[
                  'common:referenceToPersonOrEntityGeneratingTheDataSet'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.dataGenerator?.[
                  'common:referenceToPersonOrEntityGeneratingTheDataSet'
                ]?.['@version'],
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.dataGenerator?.[
                  'common:referenceToPersonOrEntityGeneratingTheDataSet'
                ]?.['common:shortDescription'],
            },
          },
          dataEntryBy: {
            'common:timeStamp':
              modelDataSet?.administrativeInformation?.dataEntryBy?.['common:timeStamp'],
            'common:referenceToDataSetFormat': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetFormat'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetFormat'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetFormat'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetFormat'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetFormat'
                ]?.['common:shortDescription'],
            },
            'common:referenceToConvertedOriginalDataSetFrom': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToConvertedOriginalDataSetFrom'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToConvertedOriginalDataSetFrom'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToConvertedOriginalDataSetFrom'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToConvertedOriginalDataSetFrom'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToConvertedOriginalDataSetFrom'
                ]?.['common:shortDescription'],
            },
            'common:referenceToPersonOrEntityEnteringTheData': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToPersonOrEntityEnteringTheData'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToPersonOrEntityEnteringTheData'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToPersonOrEntityEnteringTheData'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToPersonOrEntityEnteringTheData'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToPersonOrEntityEnteringTheData'
                ]?.['common:shortDescription'],
            },
            'common:referenceToDataSetUseApproval': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetUseApproval'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetUseApproval'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetUseApproval'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetUseApproval'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.dataEntryBy?.[
                  'common:referenceToDataSetUseApproval'
                ]?.['common:shortDescription'],
            },
          },
          publicationAndOwnership: {
            'common:dateOfLastRevision':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:dateOfLastRevision'
              ] ?? {},
            'common:dataSetVersion':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:dataSetVersion'
              ],
            'common:permanentDataSetURI':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:permanentDataSetURI'
              ] ?? {},
            'common:workflowAndPublicationStatus':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:workflowAndPublicationStatus'
              ] ?? {},
            'common:referenceToUnchangedRepublication': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToUnchangedRepublication'
                ]?.['@refObjectId'] ?? {},
              '@type':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToUnchangedRepublication'
                ]?.['@type'] ?? {},
              '@uri':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToUnchangedRepublication'
                ]?.['@uri'] ?? {},
              '@version':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToUnchangedRepublication'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToUnchangedRepublication'
                ]?.['common:shortDescription'],
            },
            'common:referenceToRegistrationAuthority': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToRegistrationAuthority'
                ]?.['@refObjectId'] ?? {},
              '@type':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToRegistrationAuthority'
                ]?.['@type'] ?? {},
              '@uri':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToRegistrationAuthority'
                ]?.['@uri'] ?? {},
              '@version':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToRegistrationAuthority'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToRegistrationAuthority'
                ]?.['common:shortDescription'],
            },
            'common:registrationNumber':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:registrationNumber'
              ] ?? {},
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToOwnershipOfDataSet'
                ]?.['@refObjectId'],
              '@type':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToOwnershipOfDataSet'
                ]?.['@type'],
              '@uri':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToOwnershipOfDataSet'
                ]?.['@uri'],
              '@version':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToOwnershipOfDataSet'
                ]?.['@version'],
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToOwnershipOfDataSet'
                ]?.['common:shortDescription'],
            },
            'common:copyright':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:copyright'
              ],
            'common:referenceToEntitiesWithExclusiveAccess': {
              '@refObjectId':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToEntitiesWithExclusiveAccess'
                ]?.['@refObjectId'] ?? {},
              '@type':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToEntitiesWithExclusiveAccess'
                ]?.['@type'] ?? {},
              '@uri':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToEntitiesWithExclusiveAccess'
                ]?.['@uri'] ?? {},
              '@version':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToEntitiesWithExclusiveAccess'
                ]?.['@version'] ?? {},
              'common:shortDescription':
                modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                  'common:referenceToEntitiesWithExclusiveAccess'
                ]?.['common:shortDescription'],
            },
            'common:licenseType':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:licenseType'
              ],
            'common:accessRestrictions':
              modelDataSet?.administrativeInformation?.publicationAndOwnership?.[
                'common:accessRestrictions'
              ],
          },
        },
        exchanges: {
          exchange: input.newExchanges,
        },
        LCIAResults: {
          LCIAResult: input.lciaResults,
          'common:other': input.lciaReport,
        },
      },
    },
    refProcesses: input.refProcesses,
  });
};
