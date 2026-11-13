import {
  classificationClassesToForm,
  classificationSystemsToJson,
} from '../classifications/serialization';
import { mapTidasRepeated } from '../general/tidasRepeatedFields';
import { createLifeCycleModel as createTidasLifeCycleModel } from '@tiangong-lca/tidas-sdk/core';
import { v4 } from 'uuid';
import { getContentGraphTextWidthDivisor } from '../general/contentLanguageRegistry';
import {
  convertCopyrightToBoolean,
  convertToUTCISOString,
  formatDateTime,
  getLangJson,
  getLangList,
  getLangText,
  jsonToList,
  listToJson,
  removeEmptyObjects,
} from '../general/util';
import { genProcessName, genProcessNameJson } from '../processes/util';
import type {
  FormLifeCycleModel,
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelNodeData,
  LifeCycleModelPortGroup,
} from './data';
import { toReferenceProcessKey, toReferenceProcessNumber } from './referenceProcess';

export const MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE = 'MISSING_FLOW_VERSION';

type LifeCycleModelConnectionFlowRole = 'outputExchange' | 'downstreamProcess';

export type MissingLifeCycleModelFlowVersionDetails = {
  edgeId?: string;
  fieldPath: 'outputExchange.@version' | 'outputExchange.downstreamProcess.@version';
  flowUUID: string;
  nodeId?: string;
  portId?: string;
  role: LifeCycleModelConnectionFlowRole;
};

export class MissingLifeCycleModelFlowVersionError extends Error {
  readonly code = MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE;
  readonly details: MissingLifeCycleModelFlowVersionDetails;

  constructor(details: MissingLifeCycleModelFlowVersionDetails) {
    super(
      `Missing Flow dataset version for ${details.fieldPath} on edge "${details.edgeId ?? 'unknown'}" ` +
        `(Flow "${details.flowUUID}", node "${details.nodeId ?? 'unknown'}", port "${details.portId ?? 'unknown'}"). ` +
        'Re-select the Flow or restore referenceToFlowDataSet.@version before saving.',
    );
    this.name = 'MissingLifeCycleModelFlowVersionError';
    this.details = details;
  }
}

const normalizeFlowVersion = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const getLifeCycleModelPortFlowVersion = (
  node: LifeCycleModelGraphNode | undefined,
  portId: string | undefined,
  flowUUID: string | undefined,
  group: LifeCycleModelPortGroup,
): string | undefined => {
  const ports = node?.ports?.items ?? [];
  const direction = group === 'groupOutput' ? 'OUTPUT' : 'INPUT';
  const exactPort = portId ? ports.find((port) => port.id === portId) : undefined;
  const flowPort = flowUUID
    ? ports.find(
        (port) =>
          port.group === group &&
          (port.data?.flowId === flowUUID || port.id === `${direction}:${flowUUID}`),
      )
    : undefined;

  return normalizeFlowVersion((exactPort ?? flowPort)?.data?.flowVersion);
};

const resolveConnectionFlowVersion = ({
  edge,
  flowUUID,
  nodes,
  role,
}: {
  edge: LifeCycleModelGraphEdge;
  flowUUID: unknown;
  nodes: LifeCycleModelGraphNode[];
  role: LifeCycleModelConnectionFlowRole;
}): string | undefined => {
  const isOutputExchange = role === 'outputExchange';
  const nodeId = isOutputExchange ? edge?.source?.cell : edge?.target?.cell;
  const portId = isOutputExchange ? edge?.source?.port : edge?.target?.port;
  const edgeVersion = isOutputExchange
    ? edge?.data?.connection?.outputExchange?.['@version']
    : edge?.data?.connection?.outputExchange?.downstreamProcess?.['@version'];
  const version =
    normalizeFlowVersion(edgeVersion) ??
    getLifeCycleModelPortFlowVersion(
      nodes.find((node) => node.id === nodeId),
      portId,
      typeof flowUUID === 'string' ? flowUUID : undefined,
      isOutputExchange ? 'groupOutput' : 'groupInput',
    );

  if (typeof flowUUID !== 'string' || flowUUID.trim().length === 0 || version) {
    return version;
  }

  throw new MissingLifeCycleModelFlowVersionError({
    edgeId: edge?.id,
    fieldPath: isOutputExchange
      ? 'outputExchange.@version'
      : 'outputExchange.downstreamProcess.@version',
    flowUUID,
    nodeId,
    portId,
    role,
  });
};

export function genNodeLabel(label: string, lang: string, nodeWidth: number) {
  const labelSub = label?.substring(0, nodeWidth / getContentGraphTextWidthDivisor(lang) - 4);
  return label !== labelSub ? labelSub + '...' : label;
}

const PROCESS_NAME_FIELDS = [
  'baseName',
  'treatmentStandardsRoutes',
  'mixAndLocationTypes',
  'functionalUnitFlowProperties',
] as const;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveLocalizedNodeText = (value: unknown, lang: string): string | undefined => {
  if (!Array.isArray(value) && !(isObjectRecord(value) && '#text' in value)) {
    return undefined;
  }

  const localizedText = getLangText(value, lang);
  return localizedText === '-' ? undefined : localizedText;
};

const resolveNodeFallbackText = (value: unknown, lang: string): string | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  return resolveLocalizedNodeText(value, lang);
};

export function genLifeCycleModelNodeName(
  nodeData: LifeCycleModelNodeData | undefined,
  lang: string,
): string {
  const label = nodeData?.label;

  if (isObjectRecord(label) && PROCESS_NAME_FIELDS.some((fieldName) => fieldName in label)) {
    const processName = genProcessName(label, lang);
    if (processName !== '-') {
      return processName;
    }
  }

  const localizedLabel = resolveLocalizedNodeText(label, lang);
  if (localizedLabel) {
    return localizedLabel;
  }

  const shortDescription = resolveNodeFallbackText(nodeData?.shortDescription, lang);
  if (shortDescription) {
    return shortDescription;
  }

  if (typeof label === 'string') {
    const normalizedLabel = label.trim();
    if (normalizedLabel.length > 0) {
      return normalizedLabel;
    }
  }

  if (typeof nodeData?.id === 'string') {
    const normalizedId = nodeData.id.trim();
    if (normalizedId.length > 0) {
      return normalizedId;
    }
  }

  return '-';
}

export function genPortLabel(label: string, lang: string, nodeWidth: number) {
  const labelSub = label?.substring(0, nodeWidth / getContentGraphTextWidthDivisor(lang) - 10);
  return label !== labelSub ? labelSub + '...' : label;
}

export const genReferenceToResultingProcess = (
  lifeCycleModelProcesses: any,
  version: string,
  data: any,
) => {
  if (!lifeCycleModelProcesses || lifeCycleModelProcesses.length === 0 || !data) {
    return data;
  }

  const referenceToResultingProcess = lifeCycleModelProcesses
    .filter((process: any) => process?.modelInfo?.type !== 'allocated')
    .map((process: any) => {
      return {
        '@refObjectId': process?.modelInfo?.id,
        '@type': 'process data set',
        '@uri': `../processes/${process?.modelInfo?.id}.xml`,
        '@version': process?.modelInfo?.version ?? version,
        'common:shortDescription': genProcessNameJson(
          process?.data?.processDataSet?.processInformation?.dataSetInformation?.name,
        ),
      };
    });
  data['lifeCycleModelDataSet']['lifeCycleModelInformation']['dataSetInformation'][
    'referenceToResultingProcess'
  ] = referenceToResultingProcess;
  return data;
};
export function genLifeCycleModelJsonOrdered(id: string, data: any) {
  const nodes = data?.model?.nodes as LifeCycleModelGraphNode[] | undefined;

  let referenceToReferenceProcess: number | undefined;
  const storedInstances = jsonToList(
    data?.lifeCycleModelInformation?.technology?.processes?.processInstance,
  );
  const processInstance = nodes?.map((n: any) => {
    const storedInstance = storedInstances.find(
      (item: any) => String(item?.['@dataSetInternalID']) === String(n?.data?.index),
    );
    if (n?.data?.quantitativeReference === '1') {
      referenceToReferenceProcess = toReferenceProcessNumber(n?.data?.index);
    }

    const sourceEdges = ((data?.model?.edges ?? []) as LifeCycleModelGraphEdge[]).filter(
      (edge) => edge?.source?.cell === n?.id,
    );

    const sourceEdgeGroupeds = sourceEdges.reduce((acc: any, edge: any) => {
      const key = edge?.data?.connection?.outputExchange?.['@flowUUID'];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(edge);
      return acc;
    }, {});

    const outputExchange = Object.entries(sourceEdgeGroupeds).map(([key, groupedEdges]) => {
      const edges = groupedEdges as LifeCycleModelGraphEdge[];
      const firstEdge = edges[0];
      const outputFlowUUID = firstEdge?.data?.connection?.outputExchange?.['@flowUUID'];
      const outputFlowVersion = resolveConnectionFlowVersion({
        edge: firstEdge,
        flowUUID: outputFlowUUID,
        nodes,
        role: 'outputExchange',
      });
      const downstreamProcesses = edges.map((edge) => {
        const targetNode = nodes?.find((node) => node?.id === edge?.target?.cell);
        const downstreamFlowUUID =
          edge?.data?.connection?.outputExchange?.downstreamProcess?.['@flowUUID'];
        return {
          '@flowUUID': downstreamFlowUUID,
          '@version': resolveConnectionFlowVersion({
            edge,
            flowUUID: downstreamFlowUUID,
            nodes,
            role: 'downstreamProcess',
          }),
          '@id': targetNode?.data?.index,
        };
      });
      return {
        '@flowUUID': key,
        '@version': outputFlowVersion,
        downstreamProcess: listToJson(downstreamProcesses),
      };
    });

    return removeEmptyObjects({
      ...storedInstance,
      '@dataSetInternalID': n?.data?.index ?? {},
      referenceToProcess: {
        '@refObjectId': n?.data?.id ?? {},
        '@type': 'process data set',
        '@uri': '../processes/' + n?.data?.id + '.xml',
        '@version': n?.data?.version ?? {},
        'common:shortDescription': n?.data?.shortDescription ?? {},
      },
      connections: {
        outputExchange: listToJson(outputExchange),
      },
    });
  });

  return removeEmptyObjects({
    lifeCycleModelDataSet: {
      '@xmlns': 'http://eplca.jrc.ec.europa.eu/ILCD/LifeCycleModel/2017',
      '@xmlns:acme': 'http://acme.com/custom',
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@locations': '../ILCDLocations.xml',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://eplca.jrc.ec.europa.eu/ILCD/LifeCycleModel/2017 ../../schemas/ILCD_LifeCycleModelDataSet.xsd',
      lifeCycleModelInformation: {
        dataSetInformation: {
          'common:UUID': id,
          name: {
            baseName: getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.baseName,
            ),
            treatmentStandardsRoutes: getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.treatmentStandardsRoutes,
            ),
            mixAndLocationTypes: getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.mixAndLocationTypes,
            ),
            functionalUnitFlowProperties: getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.name
                ?.functionalUnitFlowProperties,
            ),
          },
          classificationInformation: {
            ...data?.lifeCycleModelInformation?.dataSetInformation?.classificationInformation,
            'common:classification': classificationSystemsToJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
            ),
          },
          referenceToResultingProcess: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@refObjectId'
              ],
            '@type':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@type'
              ],
            '@uri':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@uri'
              ],
            '@version':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@version'
              ],
            'common:shortDescription': getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@refObjectId'
              ],
            ),
          },
          'common:generalComment': getLangJson(
            data?.lifeCycleModelInformation?.dataSetInformation?.['common:generalComment'],
          ),
          referenceToExternalDocumentation: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@refObjectId'],
            '@type':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@type'],
            '@uri':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@uri'],
            '@version':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@version'],
            'common:shortDescription': getLangJson(
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['common:shortDescription'],
            ),
          },
        },
        quantitativeReference: {
          referenceToReferenceProcess,
        },
        technology: {
          groupDeclarations: data?.lifeCycleModelInformation?.technology?.groupDeclarations,
          processes: {
            processInstance: listToJson(processInstance),
          },
          referenceToDiagram: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@refObjectId'],
            '@type': data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@type'],
            '@uri': data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@uri'],
            '@version':
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@version'],
            'common:shortDescription': getLangJson(
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.[
                'common:shortDescription'
              ],
            ),
          },
        },
      },
      modellingAndValidation: {
        dataSourcesTreatmentEtc: {
          useAdviceForDataSet: getLangJson(
            data?.modellingAndValidation?.dataSourcesTreatmentEtc?.useAdviceForDataSet,
          ),
        },
        validation: {
          review: listToJson(
            jsonToList(data?.modellingAndValidation?.validation?.review)?.map((review: any) => {
              return {
                '@type': review?.['@type'] ?? {},
                'common:scope': listToJson(
                  jsonToList(review?.['common:scope'])?.map((scope: any) => {
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
                    review?.['common:dataQualityIndicators']?.['common:dataQualityIndicator']?.map(
                      (dataQualityIndicator: any) => {
                        return {
                          '@name': dataQualityIndicator?.['@name'] ?? {},
                          '@value': dataQualityIndicator?.['@value'] ?? {},
                        };
                      },
                    ),
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
                'common:referenceToCompleteReviewReport': {
                  '@refObjectId':
                    review?.['common:referenceToCompleteReviewReport']?.['@refObjectId'] ?? {},
                  '@type': review?.['common:referenceToCompleteReviewReport']?.['@type'] ?? {},
                  '@uri': review?.['common:referenceToCompleteReviewReport']?.['@uri'] ?? {},
                  '@version':
                    review?.['common:referenceToCompleteReviewReport']?.['@version'] ?? {},
                  'common:shortDescription': getLangJson(
                    review?.['common:referenceToCompleteReviewReport']?.['common:shortDescription'],
                  ),
                },
              };
            }),
          ),
        },
        complianceDeclarations: mapTidasRepeated(
          data?.modellingAndValidation?.complianceDeclarations,
          (item) => ({
            ...item,
            compliance: listToJson(
              jsonToList(item?.compliance)?.map((compliance: any) => {
                return {
                  'common:referenceToComplianceSystem': {
                    '@refObjectId':
                      compliance?.['common:referenceToComplianceSystem']?.['@refObjectId'] ?? {},
                    '@type': compliance?.['common:referenceToComplianceSystem']?.['@type'] ?? {},
                    '@uri': compliance?.['common:referenceToComplianceSystem']?.['@uri'] ?? {},
                    '@version':
                      compliance?.['common:referenceToComplianceSystem']?.['@version'] ?? {},
                    'common:shortDescription': getLangJson(
                      compliance?.['common:referenceToComplianceSystem']?.[
                        'common:shortDescription'
                      ],
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
          }),
        ),
      },
      administrativeInformation: {
        'common:commissionerAndGoal': {
          'common:referenceToCommissioner': {
            '@refObjectId':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@version'],
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
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@version'],
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
              ],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
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
              ]?.['@version'],
            'common:shortDescription': getLangJson(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['common:shortDescription'],
            ),
          },
        },
        publicationAndOwnership: {
          'common:dataSetVersion':
            data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'],
          'common:permanentDataSetURI': `https://lcdn.tiangong.earth/datasetdetail/lifecyclemodel.xhtml?uuid=${id}&version=${data?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion']}`,
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
          'common:copyright':
            data?.administrativeInformation?.publicationAndOwnership?.['common:copyright'],
          'common:referenceToEntitiesWithExclusiveAccess': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@version'],
            'common:shortDescription': getLangJson(
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
    },
  });
}

export function genLifeCycleModelInfoFromData(data: any): FormLifeCycleModel {
  const referenceToReferenceProcess =
    data?.lifeCycleModelInformation?.quantitativeReference?.referenceToReferenceProcess;
  const model = createTidasLifeCycleModel({
    lifeCycleModelDataSet: {
      '@xmlns': 'http://eplca.jrc.ec.europa.eu/ILCD/LifeCycleModel/2017',
      '@xmlns:acme': 'http://acme.com/custom',
      '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
      '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@locations': '../ILCDLocations.xml',
      '@version': '1.1',
      '@xsi:schemaLocation':
        'http://eplca.jrc.ec.europa.eu/ILCD/LifeCycleModel/2017 ../../schemas/ILCD_LifeCycleModelDataSet.xsd',

      lifeCycleModelInformation: {
        dataSetInformation: {
          'common:UUID':
            data?.lifeCycleModelInformation?.dataSetInformation?.['common:UUID'] ?? '-',
          name: {
            baseName: getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.baseName,
            ),
            treatmentStandardsRoutes: getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.treatmentStandardsRoutes,
            ),
            mixAndLocationTypes: getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation?.name?.mixAndLocationTypes,
            ),
            functionalUnitFlowProperties: getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation?.name
                ?.functionalUnitFlowProperties,
            ),
          },
          classificationInformation: {
            ...data?.lifeCycleModelInformation?.dataSetInformation?.classificationInformation,
            'common:classification': mapTidasRepeated(
              data?.lifeCycleModelInformation?.dataSetInformation?.classificationInformation?.[
                'common:classification'
              ],
              (item) => ({
                ...item,
                'common:class': classificationClassesToForm(item, 'LifeCycleModel'),
              }),
            ),
          },
          referenceToResultingProcess: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@refObjectId'
              ],
            '@type':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@type'
              ],
            '@uri':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@uri'
              ],
            '@version':
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@version'
              ],
            'common:shortDescription': getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation?.referenceToResultingProcess?.[
                '@refObjectId'
              ],
            ),
          },
          'common:generalComment': getLangList(
            data?.lifeCycleModelInformation?.dataSetInformation?.['common:generalComment'],
          ),
          referenceToExternalDocumentation: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@refObjectId'],
            '@type':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@type'],
            '@uri':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@uri'],
            '@version':
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['@version'],
            'common:shortDescription': getLangList(
              data?.lifeCycleModelInformation?.dataSetInformation
                ?.referenceToExternalDocumentation?.['common:shortDescription'],
            ),
          },
        },
        quantitativeReference: {
          '@type': data?.lifeCycleModelInformation?.quantitativeReference?.['@type'] ?? {},
          referenceToReferenceFlow:
            data?.lifeCycleModelInformation?.quantitativeReference?.referenceToReferenceFlow ?? {},
          functionalUnitOrOther: getLangList(
            data?.lifeCycleModelInformation?.quantitativeReference?.functionalUnitOrOther,
          ),
          referenceToReferenceProcess:
            toReferenceProcessNumber(referenceToReferenceProcess) ?? referenceToReferenceProcess,
        } as any,
        technology: {
          groupDeclarations: data?.lifeCycleModelInformation?.technology?.groupDeclarations,
          processes: {
            processInstance: data?.lifeCycleModelInformation?.technology?.processes
              ?.processInstance as any,
          },
          referenceToDiagram: {
            '@refObjectId':
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@refObjectId'],
            '@type': data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@type'],
            '@uri': data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@uri'],
            '@version':
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.['@version'],
            'common:shortDescription': getLangList(
              data?.lifeCycleModelInformation?.technology?.referenceToDiagram?.[
                'common:shortDescription'
              ],
            ),
          },
        },
      },
      modellingAndValidation: {
        dataSourcesTreatmentEtc: {
          useAdviceForDataSet: getLangList(
            data?.modellingAndValidation?.dataSourcesTreatmentEtc?.useAdviceForDataSet,
          ),
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
                'common:referenceToCompleteReviewReport': {
                  '@refObjectId':
                    review?.['common:referenceToCompleteReviewReport']?.['@refObjectId'],
                  '@type': review?.['common:referenceToCompleteReviewReport']?.['@type'],
                  '@uri': review?.['common:referenceToCompleteReviewReport']?.['@uri'],
                  '@version': review?.['common:referenceToCompleteReviewReport']?.['@version'],
                  'common:shortDescription': getLangList(
                    review?.['common:referenceToCompleteReviewReport']?.['common:shortDescription'],
                  ),
                },
              };
            },
          ),
        },
        complianceDeclarations: mapTidasRepeated(
          data?.modellingAndValidation?.complianceDeclarations,
          (item) => ({
            ...item,
            compliance: jsonToList(item?.compliance).map((compliance: any) => {
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
          }),
        ),
      },
      administrativeInformation: {
        'common:commissionerAndGoal': {
          'common:referenceToCommissioner': {
            '@refObjectId':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]?.['@version'],
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
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.dataGenerator?.[
                'common:referenceToPersonOrEntityGeneratingTheDataSet'
              ]?.['@version'],
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
              ],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']?.[
                'common:shortDescription'
              ],
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
              ]?.['@version'],
            'common:shortDescription': getLangList(
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]?.['common:shortDescription'],
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
          'common:copyright': convertCopyrightToBoolean(
            data?.administrativeInformation?.publicationAndOwnership?.['common:copyright'],
          ),
          'common:referenceToEntitiesWithExclusiveAccess': {
            '@refObjectId':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@refObjectId'],
            '@type':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@type'],
            '@uri':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@uri'],
            '@version':
              data?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]?.['@version'],
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
    },
  });
  const lifeCycleModelInformation = model.lifeCycleModelDataSet.lifeCycleModelInformation;
  const referenceToReferenceProcessFormValue = toReferenceProcessKey(
    lifeCycleModelInformation.quantitativeReference?.referenceToReferenceProcess,
  );

  return {
    lifeCycleModelInformation: {
      ...lifeCycleModelInformation,
      quantitativeReference:
        referenceToReferenceProcessFormValue === undefined
          ? lifeCycleModelInformation.quantitativeReference
          : ({
              ...lifeCycleModelInformation.quantitativeReference,
              referenceToReferenceProcess: referenceToReferenceProcessFormValue,
            } as any),
    },
    modellingAndValidation: model.lifeCycleModelDataSet.modellingAndValidation,
    administrativeInformation: model.lifeCycleModelDataSet.administrativeInformation,
  };
}

export function genLifeCycleModelData(data: any, lang: string) {
  return {
    nodes:
      data?.xflow?.nodes?.map((node: any) => {
        const nodeWidth = node?.size?.width ?? node?.width ?? 350;
        const label = genLifeCycleModelNodeName(node?.data, lang);
        return {
          ...node,
          label: genNodeLabel(label, lang, nodeWidth),
          ports: {
            ...node?.ports,
            items: node?.ports?.items?.map((item: any) => {
              const itemText = item?.data?.textLang
                ? getLangText(item?.data?.textLang, lang)
                : item?.attrs?.text?.text;
              return {
                ...item,
                attrs: {
                  ...item?.attrs,
                  text: {
                    text: `${genPortLabel(itemText ?? '', lang, nodeWidth)}`,
                    title: itemText,
                    cursor: 'pointer',
                  },
                },
                data: item?.data,
                tools: [{ id: 'portTool' }],
              };
            }),
          },
        };
      }) ?? [],
    edges: data?.xflow?.edges ?? [],
  };
}

export function genEdgeExchangeTableData(data: any, lang: string) {
  if (data) {
    return data.map((item: any) => {
      return removeEmptyObjects({
        id: item.id ?? v4(),
        sourceProcessId: item.sourceProcessId ?? '-',
        sourceOutputFlowInternalID: item.sourceOutputFlowInternalID ?? '-',
        sourceOutputFlowId: item.sourceOutputFlowId ?? '-',
        sourceOutputFlowName: getLangText(item.sourceOutputFlowName, lang),
        sourceOutputFlowGeneralComment: getLangText(item.sourceOutputFlowGeneralComment, lang),
        targetProcessId: item.targetProcessId ?? '-',
        targetInputFlowInternalID: item.targetInputFlowInternalID ?? '-',
        targetInputFlowId: item.targetInputFlowId ?? '-',
        targetInputFlowName: getLangText(item.targetInputFlowName, lang),
        targetInputFlowGeneralComment: getLangText(item.targetInputFlowGeneralComment, lang),
      });
    });
  }
  return [];
}
