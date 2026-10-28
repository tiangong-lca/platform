/* eslint-disable @typescript-eslint/no-use-before-define */

import {
  normalizeLangPayloadForSave,
  type NormalizeLangPayloadForSaveOptions,
} from '@/services/general/api';
import type { LangTextValue, ReferenceItem } from '@/services/general/data';
import { jsonToList } from '@/services/general/util';
import { isRuleVerificationPassed } from '@/utils/ruleVerification';
import {
  createLifeCycleModel as createTidasLifeCycleModel,
  createProcess as createTidasProcess,
} from '@tiangong-lca/tidas-sdk/core';
import { getProcessJsonOrderedForSave } from '../processes/saveSerialization';
import type {
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelJsonTg,
  LifeCycleModelPersistencePlan,
  LifeCycleModelProcessMutation,
  LifeCycleModelSubModel,
  Up2DownEdge,
} from './data';
import { genReferenceToResultingProcess } from './util';

type RefProcess = {
  id: string;
  version: string;
  'common:shortDescription': LangTextValue;
};

type ExistingProcessRow = {
  id: string;
  version: string;
  json: any;
};

type CurrentProcessOrderedRow = {
  id: string;
  version: string;
  json_ordered: any;
  rule_verification?: boolean | null;
};

type RawLifeCycleModelProcess = {
  option?: 'create' | 'update';
  modelInfo: {
    id: string;
    type?: 'primary' | 'secondary' | string;
    finalId?: {
      nodeId?: string;
      processId?: string;
      allocatedExchangeDirection?: string;
      allocatedExchangeFlowId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  data: {
    processDataSet: any;
  };
  refProcesses?: RefProcess | RefProcess[];
};

type PlanBuildResult =
  | { ok: true; plan: LifeCycleModelPersistencePlan }
  | { ok: false; code: string; message: string; details?: unknown };

type BuildSavePlanArgs = {
  mode: 'create' | 'update';
  modelId: string;
  version?: string;
  langIntent?: NormalizeLangPayloadForSaveOptions['intent'];
  lifeCycleModelJsonOrdered: any;
  nodes: LifeCycleModelGraphNode[];
  edges: LifeCycleModelGraphEdge[];
  up2DownEdges: Up2DownEdge[];
  lifeCycleModelProcesses: RawLifeCycleModelProcess[];
  oldSubmodels?: LifeCycleModelSubModel[];
  oldProcesses?: ExistingProcessRow[];
};

type BuildReviewUpdatePlanArgs = {
  modelId: string;
  version: string;
  langIntent?: NormalizeLangPayloadForSaveOptions['intent'];
  lifeCycleModelJsonOrdered: any;
  currentJsonTg: LifeCycleModelJsonTg;
  currentRuleVerification: boolean;
  submodels: LifeCycleModelSubModel[];
  currentProcesses: CurrentProcessOrderedRow[];
  commentReview?: any[];
  commentCompliance?: any[];
};

const mapRefProcessesToIncludedProcesses = (
  refProcesses: RefProcess | RefProcess[],
): ReferenceItem[] => {
  return jsonToList(refProcesses)
    .filter(
      (process): process is RefProcess =>
        typeof process?.id === 'string' &&
        process.id.length > 0 &&
        typeof process?.version === 'string' &&
        process.version.length > 0,
    )
    .map((process) => ({
      '@refObjectId': process.id,
      '@type': 'process data set',
      '@uri': `../processes/${process.id}.xml`,
      '@version': process.version,
      'common:shortDescription': process?.['common:shortDescription'],
    }));
};

export async function buildSaveLifeCycleModelPersistencePlan(
  args: BuildSavePlanArgs,
): Promise<PlanBuildResult> {
  const lifecycleModelVersion =
    args.version || getLifecycleModelVersion(args.lifeCycleModelJsonOrdered) || undefined;
  const parentJsonOrdered = genReferenceToResultingProcess(
    args.lifeCycleModelProcesses,
    lifecycleModelVersion ?? '',
    clone(args.lifeCycleModelJsonOrdered),
  );

  const parentRuleVerification = getLifecycleModelRuleVerification(parentJsonOrdered);
  const processMutationsResult = await buildProcessMutations({
    langIntent: args.langIntent,
    modelId: args.modelId,
    version: args.version,
    lifeCycleModelJsonOrdered: parentJsonOrdered,
    lifeCycleModelProcesses: args.lifeCycleModelProcesses,
    oldSubmodels: args.oldSubmodels ?? [],
    oldProcesses: args.oldProcesses ?? [],
  });

  if (!processMutationsResult.ok) {
    return processMutationsResult;
  }

  const plan: LifeCycleModelPersistencePlan = {
    mode: args.mode,
    modelId: args.modelId,
    version: args.version,
    parent: {
      jsonOrdered: parentJsonOrdered,
      jsonTg: {
        xflow: {
          nodes: args.nodes,
          edges: decorateEdges(args.edges, args.up2DownEdges),
        },
        submodels: args.lifeCycleModelProcesses.map((process) => ({
          ...process.modelInfo,
          version: lifecycleModelVersion,
        })),
      },
      ruleVerification: parentRuleVerification,
    },
    processMutations: processMutationsResult.processMutations,
  };

  return {
    ok: true,
    plan,
  };
}

export async function buildReviewUpdateLifeCycleModelPersistencePlan(
  args: BuildReviewUpdatePlanArgs,
): Promise<PlanBuildResult> {
  const processMap = new Map(args.currentProcesses.map((item) => [item.id, item]));
  const processMutations: LifeCycleModelProcessMutation[] = [];

  for (const submodel of args.submodels) {
    const currentProcess = processMap.get(submodel.id);
    if (!currentProcess) {
      return {
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: `Missing current process snapshot for submodel ${submodel.id}`,
      };
    }

    let nextJsonOrdered = applyLifecycleModelValidationToProcessJsonOrdered(
      currentProcess.json_ordered,
      args.lifeCycleModelJsonOrdered,
    );

    if ((args.commentReview?.length ?? 0) > 0 || (args.commentCompliance?.length ?? 0) > 0) {
      nextJsonOrdered = mergeCommentDataIntoProcessJson(
        nextJsonOrdered,
        args.commentReview ?? [],
        args.commentCompliance ?? [],
      );
    }

    const normalizedResult = await normalizeLangPayloadForSave(nextJsonOrdered, {
      intent: args.langIntent,
    });
    const normalizedJson = normalizedResult?.payload ?? nextJsonOrdered;
    const validationError = normalizedResult?.validationError;
    if (validationError) {
      return {
        ok: false,
        code: 'LANG_VALIDATION_ERROR',
        message: validationError,
      };
    }

    processMutations.push({
      op: 'update',
      id: currentProcess.id,
      version: currentProcess.version,
      modelId: args.modelId,
      jsonOrdered: normalizedJson,
      ruleVerification: isRuleVerificationPassed(currentProcess.rule_verification),
    });
  }

  return {
    ok: true,
    plan: {
      mode: 'update',
      modelId: args.modelId,
      version: args.version,
      parent: {
        jsonOrdered: args.lifeCycleModelJsonOrdered,
        jsonTg: args.currentJsonTg,
        ruleVerification: args.currentRuleVerification,
      },
      processMutations,
    },
  };
}

export function mergeCommentDataIntoProcessJson(
  processJson: any,
  commentReview: any[],
  commentCompliance: any[],
) {
  const json = clone(processJson);
  const existingReview = json?.processDataSet?.modellingAndValidation?.validation?.review;
  const existingCompliance =
    json?.processDataSet?.modellingAndValidation?.complianceDeclarations?.compliance;

  json.processDataSet.modellingAndValidation = {
    ...json.processDataSet.modellingAndValidation,
    validation: {
      ...json.processDataSet.modellingAndValidation.validation,
      review: Array.isArray(existingReview)
        ? [...existingReview, ...commentReview]
        : existingReview
          ? [existingReview, ...commentReview]
          : [...commentReview],
    },
    complianceDeclarations: {
      ...json.processDataSet.modellingAndValidation.complianceDeclarations,
      compliance: Array.isArray(existingCompliance)
        ? [...existingCompliance, ...commentCompliance]
        : existingCompliance
          ? [existingCompliance, ...commentCompliance]
          : [...commentCompliance],
    },
  };

  return json;
}

export function buildDeleteLifeCycleModelBundlePayload(modelId: string, version: string) {
  return {
    modelId,
    version,
  };
}

function decorateEdges(edges: LifeCycleModelGraphEdge[], up2DownEdges: Up2DownEdge[]) {
  return (edges ?? []).map((edge) => {
    const up2DownEdge = up2DownEdges.find(
      (candidate) =>
        candidate?.upstreamNodeId === edge?.source?.cell &&
        candidate?.downstreamNodeId === edge?.target?.cell &&
        candidate?.flowUUID === edge?.data?.connection?.outputExchange?.['@flowUUID'],
    );

    return {
      ...edge,
      labels: [],
      data: {
        ...edge?.data,
        connection: {
          ...edge?.data?.connection,
          isBalanced: up2DownEdge?.isBalanced,
          unbalancedAmount: up2DownEdge?.unbalancedAmount,
          exchangeAmount: up2DownEdge?.exchangeAmount,
        },
      },
    };
  });
}

async function buildProcessMutations(args: {
  langIntent?: NormalizeLangPayloadForSaveOptions['intent'];
  modelId: string;
  version?: string;
  lifeCycleModelJsonOrdered: any;
  lifeCycleModelProcesses: RawLifeCycleModelProcess[];
  oldSubmodels: LifeCycleModelSubModel[];
  oldProcesses: ExistingProcessRow[];
}): Promise<
  | { ok: true; processMutations: LifeCycleModelProcessMutation[] }
  | { ok: false; code: string; message: string; details?: unknown }
> {
  const oldProcessesById = new Map(args.oldProcesses.map((item) => [item.id, item]));
  const processMutations: LifeCycleModelProcessMutation[] = [];

  if (args.version) {
    const deleteMutations = args.oldSubmodels
      .filter((oldSubmodel) => shouldDeleteSubmodel(oldSubmodel, args.lifeCycleModelProcesses))
      .map((oldSubmodel): LifeCycleModelProcessMutation => ({
        op: 'delete',
        id: oldSubmodel.id,
        version: args.version!,
      }));
    processMutations.push(...deleteMutations);
  }

  for (const process of args.lifeCycleModelProcesses) {
    const mutation = await buildProcessMutation({
      langIntent: args.langIntent,
      modelId: args.modelId,
      version: args.version,
      lifeCycleModelJsonOrdered: args.lifeCycleModelJsonOrdered,
      process,
      oldProcess: oldProcessesById.get(process.modelInfo.id),
    });

    if (!mutation.ok) {
      return mutation;
    }

    processMutations.push(mutation.processMutation);
  }

  return {
    ok: true,
    processMutations,
  };
}

async function buildProcessMutation(args: {
  langIntent?: NormalizeLangPayloadForSaveOptions['intent'];
  modelId: string;
  version?: string;
  lifeCycleModelJsonOrdered: any;
  process: RawLifeCycleModelProcess;
  oldProcess?: ExistingProcessRow;
}): Promise<
  | { ok: true; processMutation: LifeCycleModelProcessMutation }
  | { ok: false; code: string; message: string }
> {
  const processDataSet = clone(args.process.data.processDataSet);

  if (args.process.modelInfo.type === 'primary') {
    processDataSet.processInformation.technology = {
      ...processDataSet.processInformation.technology,
      referenceToIncludedProcesses: jsonToList(
        args.lifeCycleModelJsonOrdered?.lifeCycleModelDataSet?.lifeCycleModelInformation?.technology
          ?.processes?.processInstance,
      ).map((item) => item.referenceToProcess),
    };
  }

  if (args.process.modelInfo.type === 'secondary' || args.process.modelInfo.type === 'allocated') {
    processDataSet.processInformation.technology = {
      ...processDataSet.processInformation.technology,
      referenceToIncludedProcesses: mapRefProcessesToIncludedProcesses(
        args.process.refProcesses ?? [],
      ),
    };
  }

  let operation = args.process.option === 'update' ? 'update' : 'create';
  if (
    operation === 'update' &&
    args.oldProcess?.json &&
    args.process.modelInfo.type !== 'allocated'
  ) {
    overrideWithOldProcess({ processDataSet }, args.oldProcess.json);
  } else if (operation === 'update' && !args.oldProcess) {
    operation = 'create';
  }

  const rawProcessJsonOrdered = await getProcessJsonOrderedForSave(
    args.process.modelInfo.id,
    processDataSet,
  );
  const normalizedResult = await normalizeLangPayloadForSave(rawProcessJsonOrdered, {
    intent: args.langIntent,
  });
  const normalizedJson = normalizedResult?.payload ?? rawProcessJsonOrdered;
  const validationError = normalizedResult?.validationError;
  if (validationError) {
    return {
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: validationError,
    };
  }

  const processMutationRuleVerification = getProcessRuleVerification(normalizedJson);
  if (operation === 'update' && args.version) {
    return {
      ok: true,
      processMutation: {
        op: 'update',
        id: args.process.modelInfo.id,
        version: args.version,
        modelId: args.modelId,
        jsonOrdered: normalizedJson,
        ruleVerification: processMutationRuleVerification,
      },
    };
  }

  return {
    ok: true,
    processMutation: {
      op: 'create',
      id: args.process.modelInfo.id,
      modelId: args.modelId,
      jsonOrdered: normalizedJson,
      ruleVerification: processMutationRuleVerification,
    },
  };
}

export function applyLifecycleModelValidationToProcessJsonOrdered(
  currentJsonOrdered: any,
  lifecycleModelJsonOrdered: any,
) {
  const newJson = clone(currentJsonOrdered);
  newJson.processDataSet.modellingAndValidation = {
    ...currentJsonOrdered.processDataSet.modellingAndValidation,
    complianceDeclarations: {
      ...currentJsonOrdered.processDataSet.modellingAndValidation.complianceDeclarations,
      compliance:
        lifecycleModelJsonOrdered?.lifeCycleModelDataSet?.modellingAndValidation
          ?.complianceDeclarations?.compliance,
    },
    validation: {
      ...currentJsonOrdered.processDataSet.modellingAndValidation.validation,
      review:
        lifecycleModelJsonOrdered?.lifeCycleModelDataSet?.modellingAndValidation?.validation
          ?.review,
    },
  };

  return newJson;
}

function overrideWithOldProcess(newData: any, oldData: any) {
  if (oldData?.processDataSet?.processInformation?.dataSetInformation?.identifierOfSubDataSet) {
    newData.processDataSet.processInformation.dataSetInformation.identifierOfSubDataSet =
      oldData.processDataSet.processInformation.dataSetInformation.identifierOfSubDataSet;
  }

  if (oldData?.processDataSet?.processInformation?.dataSetInformation?.['common:synonyms']) {
    newData.processDataSet.processInformation.dataSetInformation['common:synonyms'] =
      oldData.processDataSet.processInformation.dataSetInformation['common:synonyms'];
  }

  if (
    oldData?.processDataSet?.processInformation?.technology
      ?.technologyDescriptionAndIncludedProcesses
  ) {
    if (!newData.processDataSet.processInformation.technology) {
      newData.processDataSet.processInformation.technology = {} as any;
    }
    newData.processDataSet.processInformation.technology.technologyDescriptionAndIncludedProcesses =
      oldData.processDataSet.processInformation.technology.technologyDescriptionAndIncludedProcesses;
  }

  if (oldData?.processDataSet?.processInformation?.technology?.technologicalApplicability) {
    if (!newData.processDataSet.processInformation.technology) {
      newData.processDataSet.processInformation.technology = {} as any;
    }
    newData.processDataSet.processInformation.technology.technologicalApplicability =
      oldData.processDataSet.processInformation.technology.technologicalApplicability;
  }

  if (oldData?.processDataSet?.processInformation?.technology?.referenceToTechnologyPictogramme) {
    if (!newData.processDataSet.processInformation.technology) {
      newData.processDataSet.processInformation.technology = {} as any;
    }
    newData.processDataSet.processInformation.technology.referenceToTechnologyPictogramme =
      oldData.processDataSet.processInformation.technology.referenceToTechnologyPictogramme;
  }

  if (
    oldData?.processDataSet?.processInformation?.technology
      ?.referenceToTechnologyFlowDiagrammOrPicture
  ) {
    if (!newData.processDataSet.processInformation.technology) {
      newData.processDataSet.processInformation.technology = {} as any;
    }
    newData.processDataSet.processInformation.technology.referenceToTechnologyFlowDiagrammOrPicture =
      oldData.processDataSet.processInformation.technology.referenceToTechnologyFlowDiagrammOrPicture;
  }

  if (oldData?.processDataSet?.modellingAndValidation?.LCIMethodAndAllocation) {
    if (!newData.processDataSet.modellingAndValidation) {
      newData.processDataSet.modellingAndValidation = {} as any;
    }
    newData.processDataSet.modellingAndValidation.LCIMethodAndAllocation =
      oldData.processDataSet.modellingAndValidation.LCIMethodAndAllocation;
  }

  if (oldData?.processDataSet?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness) {
    if (!newData.processDataSet.modellingAndValidation) {
      newData.processDataSet.modellingAndValidation = {} as any;
    }
    newData.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness =
      oldData.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness;
  }

  if (oldData?.processDataSet?.modellingAndValidation?.completeness) {
    if (!newData.processDataSet.modellingAndValidation) {
      newData.processDataSet.modellingAndValidation = {} as any;
    }
    newData.processDataSet.modellingAndValidation.completeness =
      oldData.processDataSet.modellingAndValidation.completeness;
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.dataEntryBy?.[
      'common:referenceToConvertedOriginalDataSetFrom'
    ]
  ) {
    newData.processDataSet.administrativeInformation.dataEntryBy[
      'common:referenceToConvertedOriginalDataSetFrom'
    ] =
      oldData.processDataSet.administrativeInformation.dataEntryBy[
        'common:referenceToConvertedOriginalDataSetFrom'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.dataEntryBy?.[
      'common:referenceToDataSetUseApproval'
    ]
  ) {
    newData.processDataSet.administrativeInformation.dataEntryBy[
      'common:referenceToDataSetUseApproval'
    ] =
      oldData.processDataSet.administrativeInformation.dataEntryBy[
        'common:referenceToDataSetUseApproval'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.publicationAndOwnership?.[
      'common:dateOfLastRevision'
    ]
  ) {
    newData.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:dateOfLastRevision'
    ] =
      oldData.processDataSet.administrativeInformation.publicationAndOwnership[
        'common:dateOfLastRevision'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.publicationAndOwnership?.[
      'common:workflowAndPublicationStatus'
    ]
  ) {
    newData.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:workflowAndPublicationStatus'
    ] =
      oldData.processDataSet.administrativeInformation.publicationAndOwnership[
        'common:workflowAndPublicationStatus'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.publicationAndOwnership?.[
      'common:referenceToUnchangedRepublication'
    ]
  ) {
    newData.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:referenceToUnchangedRepublication'
    ] =
      oldData.processDataSet.administrativeInformation.publicationAndOwnership[
        'common:referenceToUnchangedRepublication'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.publicationAndOwnership?.[
      'common:referenceToRegistrationAuthority'
    ]
  ) {
    newData.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:referenceToRegistrationAuthority'
    ] =
      oldData.processDataSet.administrativeInformation.publicationAndOwnership[
        'common:referenceToRegistrationAuthority'
      ];
  }

  if (
    oldData?.processDataSet?.administrativeInformation?.publicationAndOwnership?.[
      'common:registrationNumber'
    ]
  ) {
    newData.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:registrationNumber'
    ] =
      oldData.processDataSet.administrativeInformation.publicationAndOwnership[
        'common:registrationNumber'
      ];
  }

  if (oldData?.processDataSet?.processInformation?.time) {
    newData.processDataSet.processInformation.time = oldData.processDataSet.processInformation.time;
  }

  if (oldData?.processDataSet?.processInformation?.geography) {
    newData.processDataSet.processInformation.geography =
      oldData.processDataSet.processInformation.geography;
  }

  if (oldData?.processDataSet?.processInformation?.mathematicalRelations) {
    newData.processDataSet.processInformation.mathematicalRelations =
      oldData.processDataSet.processInformation.mathematicalRelations;
  }
}

function shouldDeleteSubmodel(
  oldSubmodel: LifeCycleModelSubModel,
  lifeCycleModelProcesses: RawLifeCycleModelProcess[],
) {
  if (lifeCycleModelProcesses.some((process) => process.modelInfo.id === oldSubmodel.id)) {
    return false;
  }
  if (oldSubmodel.type === 'allocated') return true;
  if (oldSubmodel.type !== 'secondary') {
    return false;
  }

  return !lifeCycleModelProcesses.some(
    (process) =>
      process.modelInfo.type === 'secondary' && sameFinalId(oldSubmodel.finalId, process),
  );
}

function sameFinalId(oldFinalId: any, process: RawLifeCycleModelProcess) {
  const newFinalId = process?.modelInfo?.finalId;
  return (
    oldFinalId?.nodeId === newFinalId?.nodeId &&
    oldFinalId?.processId === newFinalId?.processId &&
    oldFinalId?.allocatedExchangeDirection === newFinalId?.allocatedExchangeDirection &&
    oldFinalId?.allocatedExchangeFlowId === newFinalId?.allocatedExchangeFlowId
  );
}

type ValidationIssuePathLike = {
  path?: PropertyKey[] | string;
};

function getSdkValidationIssues(
  validateResult:
    | {
        validationIssues?: ValidationIssuePathLike[];
        error?: {
          issues?: ValidationIssuePathLike[];
        };
      }
    | undefined,
): ValidationIssuePathLike[] {
  if (Array.isArray(validateResult?.validationIssues)) {
    return validateResult.validationIssues;
  }

  if (Array.isArray(validateResult?.error?.issues)) {
    return validateResult.error.issues;
  }

  return [];
}

function getLifecycleModelRuleVerification(jsonOrdered: any) {
  const validateResult = createTidasLifeCycleModel(clone(jsonOrdered)).validateEnhanced();
  const issues = !validateResult.success
    ? filterValidationOrComplianceIssues(getSdkValidationIssues(validateResult))
    : [];
  return issues.length === 0;
}

function getProcessRuleVerification(jsonOrdered: any) {
  const validateResult = createTidasProcess(clone(jsonOrdered)).validateEnhanced();
  const issues = !validateResult.success
    ? filterValidationOrComplianceIssues(getSdkValidationIssues(validateResult))
    : [];
  return issues.length === 0;
}

function filterValidationOrComplianceIssues<T extends { path?: PropertyKey[] | string }>(
  issues: T[],
): T[] {
  return issues.filter((issue) => !isValidationOrComplianceIssuePath(issue?.path));
}

function isValidationOrComplianceIssuePath(path: PropertyKey[] | string | undefined): boolean {
  const rawSegments = Array.isArray(path) ? path : typeof path === 'string' ? [path] : [];

  return rawSegments.some((segment) => {
    if (typeof segment !== 'string') {
      return false;
    }

    return segment
      .split(/[.[\]/]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .some((normalizedSegment) => {
        return normalizedSegment === 'validation' || normalizedSegment === 'compliance';
      });
  });
}

function getLifecycleModelVersion(jsonOrdered: any) {
  return jsonOrdered?.lifeCycleModelDataSet?.administrativeInformation?.publicationAndOwnership?.[
    'common:dataSetVersion'
  ];
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
