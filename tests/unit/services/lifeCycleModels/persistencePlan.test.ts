jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  __esModule: true,
  createLifeCycleModel: jest.fn(),
  createProcess: jest.fn(),
}));

const {
  createLifeCycleModel: mockCreateTidasLifeCycleModel,
  createProcess: mockCreateTidasProcess,
} = jest.requireMock('@tiangong-lca/tidas-sdk/core');

const mockNormalizeLangPayloadForSave = jest.fn();
const mockJsonToList = jest.fn();
const mockGetProcessJsonOrderedForSave = jest.fn();
const mockGenReferenceToResultingProcess = jest.fn();

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  normalizeLangPayloadForSave: (...args: any[]) => mockNormalizeLangPayloadForSave(...args),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  jsonToList: (...args: any[]) => mockJsonToList(...args),
}));

jest.mock('@/services/processes/saveSerialization', () => ({
  __esModule: true,
  getProcessJsonOrderedForSave: (...args: any[]) => mockGetProcessJsonOrderedForSave(...args),
}));

jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genReferenceToResultingProcess: (...args: any[]) => mockGenReferenceToResultingProcess(...args),
}));

import {
  applyLifecycleModelValidationToProcessJsonOrdered,
  buildDeleteLifeCycleModelBundlePayload,
  buildReviewUpdateLifeCycleModelPersistencePlan,
  buildSaveLifeCycleModelPersistencePlan,
  mergeCommentDataIntoProcessJson,
} from '@/services/lifeCycleModels/persistencePlan';

const sampleModelId = '11111111-1111-1111-1111-111111111111';
const sampleVersion = '01.00.000';

const asUpsertMutation = (
  mutation: any,
): {
  op: 'create' | 'update';
  id: string;
  version?: string;
  modelId: string;
  jsonOrdered: any;
  ruleVerification?: boolean;
} => {
  if (!mutation || !('jsonOrdered' in mutation)) {
    throw new Error(`Expected an upsert mutation but received ${mutation?.op ?? 'undefined'}`);
  }
  return mutation;
};

const buildProcessDataSet = () => ({
  processInformation: {
    dataSetInformation: {},
    technology: {},
  },
  modellingAndValidation: {
    complianceDeclarations: {},
    validation: {},
  },
  administrativeInformation: {
    dataEntryBy: {},
    publicationAndOwnership: {},
  },
});

const buildLifecycleModelJsonOrdered = () => ({
  lifeCycleModelDataSet: {
    administrativeInformation: {
      publicationAndOwnership: {
        'common:dataSetVersion': sampleVersion,
      },
    },
    lifeCycleModelInformation: {
      technology: {
        processes: {
          processInstance: [
            {
              referenceToProcess: { '@refObjectId': 'included-primary', '@version': sampleVersion },
            },
          ],
        },
      },
    },
    modellingAndValidation: {
      complianceDeclarations: {
        compliance: [{ id: 'model-compliance' }],
      },
      validation: {
        review: [{ id: 'model-review' }],
      },
    },
  },
});

beforeEach(() => {
  jest.clearAllMocks();

  mockNormalizeLangPayloadForSave.mockImplementation(async (payload: any) => ({
    payload,
    validationError: undefined,
  }));
  mockJsonToList.mockImplementation((value: any) =>
    Array.isArray(value) ? value : value ? [value] : [],
  );
  mockGetProcessJsonOrderedForSave.mockImplementation((_id: string, data: any) => ({
    processDataSet: data,
  }));
  mockGenReferenceToResultingProcess.mockImplementation(
    (_processes: any[], _version: string, data: any) => data,
  );
  mockCreateTidasLifeCycleModel.mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  });
  mockCreateTidasProcess.mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  });
});

describe('simple exported helpers', () => {
  it('builds the delete bundle payload', () => {
    expect(buildDeleteLifeCycleModelBundlePayload(sampleModelId, sampleVersion)).toEqual({
      modelId: sampleModelId,
      version: sampleVersion,
    });
  });

  it('merges comment arrays into existing array-valued review/compliance data', () => {
    const processJson = {
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'existing-review' }] },
          complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
        },
      },
    };

    expect(
      mergeCommentDataIntoProcessJson(
        processJson,
        [{ id: 'new-review' }],
        [{ id: 'new-compliance' }],
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'existing-review' }, { id: 'new-review' }] },
          complianceDeclarations: {
            compliance: [{ id: 'existing-compliance' }, { id: 'new-compliance' }],
          },
        },
      },
    });
  });

  it('uses pure comment arrays when no review or compliance data exists yet', () => {
    const processJson = {
      processDataSet: {
        modellingAndValidation: {
          validation: {},
          complianceDeclarations: {},
        },
      },
    };

    expect(
      mergeCommentDataIntoProcessJson(
        processJson,
        [{ id: 'new-review' }],
        [{ id: 'new-compliance' }],
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'new-review' }] },
          complianceDeclarations: { compliance: [{ id: 'new-compliance' }] },
        },
      },
    });
  });

  it('wraps scalar review/compliance nodes before appending new comments', () => {
    const processJson = {
      processDataSet: {
        modellingAndValidation: {
          validation: { review: { id: 'existing-review' } },
          complianceDeclarations: { compliance: { id: 'existing-compliance' } },
        },
      },
    };

    expect(
      mergeCommentDataIntoProcessJson(
        processJson,
        [{ id: 'new-review' }],
        [{ id: 'new-compliance' }],
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'existing-review' }, { id: 'new-review' }] },
          complianceDeclarations: {
            compliance: [{ id: 'existing-compliance' }, { id: 'new-compliance' }],
          },
        },
      },
    });
  });

  it('wraps a scalar review value even when compliance is already array-shaped', () => {
    const processJson = {
      processDataSet: {
        modellingAndValidation: {
          validation: { review: 'existing-review-scalar' },
          complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
        },
      },
    };

    expect(
      mergeCommentDataIntoProcessJson(
        processJson,
        [{ id: 'new-review' }],
        [{ id: 'new-compliance' }],
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: ['existing-review-scalar', { id: 'new-review' }] },
          complianceDeclarations: {
            compliance: [{ id: 'existing-compliance' }, { id: 'new-compliance' }],
          },
        },
      },
    });
  });

  it('wraps a scalar compliance value even when review is already array-shaped', () => {
    const processJson = {
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'existing-review' }] },
          complianceDeclarations: { compliance: 'existing-compliance-scalar' },
        },
      },
    };

    expect(
      mergeCommentDataIntoProcessJson(
        processJson,
        [{ id: 'new-review' }],
        [{ id: 'new-compliance' }],
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'existing-review' }, { id: 'new-review' }] },
          complianceDeclarations: {
            compliance: ['existing-compliance-scalar', { id: 'new-compliance' }],
          },
        },
      },
    });
  });

  it('copies lifecycle model validation and compliance data into a process snapshot', () => {
    const currentJsonOrdered = {
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'legacy-review' }] },
          complianceDeclarations: { compliance: [{ id: 'legacy-compliance' }] },
        },
      },
    };

    expect(
      applyLifecycleModelValidationToProcessJsonOrdered(
        currentJsonOrdered,
        buildLifecycleModelJsonOrdered(),
      ),
    ).toEqual({
      processDataSet: {
        modellingAndValidation: {
          validation: { review: [{ id: 'model-review' }] },
          complianceDeclarations: { compliance: [{ id: 'model-compliance' }] },
        },
      },
    });
  });

  it('falls back to JSON cloning when structuredClone is unavailable', () => {
    const originalStructuredClone = global.structuredClone;
    // @ts-expect-error testing fallback branch
    delete global.structuredClone;

    try {
      const result = mergeCommentDataIntoProcessJson(
        {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: [] },
              complianceDeclarations: { compliance: [] },
            },
          },
        },
        [{ id: 'review' }],
        [{ id: 'compliance' }],
      );

      expect(result.processDataSet.modellingAndValidation.validation.review).toEqual([
        { id: 'review' },
      ]);
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });

  it('throws when mergeCommentDataIntoProcessJson receives undefined input', () => {
    const originalStructuredClone = global.structuredClone;
    // @ts-expect-error testing undefined clone branch
    delete global.structuredClone;

    try {
      expect(() => mergeCommentDataIntoProcessJson(undefined as any, [], [])).toThrow();
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });

  it('uses structuredClone when it is available', () => {
    const originalStructuredClone = global.structuredClone;
    const structuredCloneSpy = jest.fn((value) => JSON.parse(JSON.stringify(value)));
    global.structuredClone = structuredCloneSpy as typeof structuredClone;

    try {
      const result = applyLifecycleModelValidationToProcessJsonOrdered(
        {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: [] },
              complianceDeclarations: { compliance: [] },
            },
          },
        },
        buildLifecycleModelJsonOrdered(),
      );

      expect(structuredCloneSpy).toHaveBeenCalled();
      expect(result.processDataSet.modellingAndValidation.validation.review).toEqual([
        { id: 'model-review' },
      ]);
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });
});

describe('buildReviewUpdateLifeCycleModelPersistencePlan', () => {
  it('returns INVALID_PAYLOAD when a current submodel snapshot is missing', async () => {
    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: { submodels: [{ id: 'missing-process' }] },
      currentRuleVerification: true,
      submodels: [{ id: 'missing-process' }],
      currentProcesses: [],
    });

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: 'Missing current process snapshot for submodel missing-process',
    });
  });

  it('returns LANG_VALIDATION_ERROR when a submodel normalization fails', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { ignored: true },
      validationError: 'Process json is invalid',
    });

    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: { submodels: [{ id: 'submodel-1' }] },
      currentRuleVerification: false,
      submodels: [{ id: 'submodel-1' }],
      currentProcesses: [
        {
          id: 'submodel-1',
          version: sampleVersion,
          json_ordered: {
            processDataSet: {
              ...buildProcessDataSet(),
              modellingAndValidation: {
                validation: { review: [] },
                complianceDeclarations: { compliance: [] },
              },
            },
          },
          rule_verification: true,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Process json is invalid',
    });
  });

  it('merges assigned comments into each current process snapshot', async () => {
    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: { submodels: [{ id: 'submodel-1', version: sampleVersion }] },
      currentRuleVerification: false,
      submodels: [{ id: 'submodel-1', version: sampleVersion }],
      currentProcesses: [
        {
          id: 'submodel-1',
          version: sampleVersion,
          json_ordered: {
            processDataSet: {
              ...buildProcessDataSet(),
              modellingAndValidation: {
                validation: { review: [{ id: 'legacy-review' }] },
                complianceDeclarations: { compliance: [{ id: 'legacy-compliance' }] },
              },
            },
          },
          rule_verification: null,
        },
      ],
      commentReview: [{ id: 'assigned-review' }],
      commentCompliance: [{ id: 'assigned-compliance' }],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        mode: 'update',
        modelId: sampleModelId,
        version: sampleVersion,
        parent: {
          jsonOrdered: buildLifecycleModelJsonOrdered(),
          jsonTg: { submodels: [{ id: 'submodel-1', version: sampleVersion }] },
          ruleVerification: false,
        },
        processMutations: [
          {
            op: 'update',
            id: 'submodel-1',
            version: sampleVersion,
            modelId: sampleModelId,
            jsonOrdered: {
              processDataSet: {
                ...buildProcessDataSet(),
                modellingAndValidation: {
                  validation: { review: [{ id: 'model-review' }, { id: 'assigned-review' }] },
                  complianceDeclarations: {
                    compliance: [{ id: 'model-compliance' }, { id: 'assigned-compliance' }],
                  },
                },
              },
            },
            ruleVerification: true,
          },
        ],
      },
    });
  });

  it('builds a review update plan without merging comments when no comment arrays are provided', async () => {
    const currentProcess = {
      id: 'process-1',
      version: sampleVersion,
      json_ordered: {
        processDataSet: {
          modellingAndValidation: {
            validation: { review: [{ id: 'existing-review' }] },
            complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
          },
        },
      },
      rule_verification: undefined,
    };
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);

    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: {},
      currentRuleVerification: false,
      submodels: [{ id: 'process-1' }],
      currentProcesses: [currentProcess],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        mode: 'update',
        modelId: sampleModelId,
        version: sampleVersion,
        parent: {
          jsonOrdered: buildLifecycleModelJsonOrdered(),
          jsonTg: {},
          ruleVerification: false,
        },
        processMutations: [
          {
            op: 'update',
            id: 'process-1',
            version: sampleVersion,
            modelId: sampleModelId,
            jsonOrdered: {
              processDataSet: {
                modellingAndValidation: {
                  validation: { review: [{ id: 'model-review' }] },
                  complianceDeclarations: { compliance: [{ id: 'model-compliance' }] },
                },
              },
            },
            ruleVerification: true,
          },
        ],
      },
    });
  });

  it('defaults missing review comments to an empty array when only compliance comments are provided', async () => {
    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: {},
      currentRuleVerification: true,
      submodels: [{ id: 'process-1' }],
      currentProcesses: [
        {
          id: 'process-1',
          version: sampleVersion,
          json_ordered: {
            processDataSet: {
              modellingAndValidation: {
                validation: { review: [{ id: 'existing-review' }] },
                complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
              },
            },
          },
          rule_verification: true,
        },
      ],
      commentCompliance: [{ id: 'new-compliance' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful review update plan with compliance-only comments');
    }

    const updateMutation = asUpsertMutation(result.plan.processMutations[0]);
    expect(
      updateMutation.jsonOrdered.processDataSet.modellingAndValidation.validation.review,
    ).toEqual([{ id: 'model-review' }]);
    expect(
      updateMutation.jsonOrdered.processDataSet.modellingAndValidation.complianceDeclarations
        .compliance,
    ).toEqual([{ id: 'model-compliance' }, { id: 'new-compliance' }]);
  });

  it('defaults missing compliance comments to an empty array when only review comments are provided', async () => {
    const result = await buildReviewUpdateLifeCycleModelPersistencePlan({
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      currentJsonTg: {},
      currentRuleVerification: true,
      submodels: [{ id: 'process-1' }],
      currentProcesses: [
        {
          id: 'process-1',
          version: sampleVersion,
          json_ordered: {
            processDataSet: {
              modellingAndValidation: {
                validation: { review: [{ id: 'existing-review' }] },
                complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
              },
            },
          },
          rule_verification: true,
        },
      ],
      commentReview: [{ id: 'new-review' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful review update plan with review-only comments');
    }

    const updateMutation = asUpsertMutation(result.plan.processMutations[0]);
    expect(
      updateMutation.jsonOrdered.processDataSet.modellingAndValidation.validation.review,
    ).toEqual([{ id: 'model-review' }, { id: 'new-review' }]);
    expect(
      updateMutation.jsonOrdered.processDataSet.modellingAndValidation.complianceDeclarations
        .compliance,
    ).toEqual([{ id: 'model-compliance' }]);
  });
});

describe('buildSaveLifeCycleModelPersistencePlan', () => {
  it('builds delete, update, and fallback-create process mutations plus decorated edges', async () => {
    const oldSubmodels = [
      { id: 'primary-legacy', type: 'primary', finalId: { nodeId: 'primary-node' } },
      {
        id: 'secondary-keep',
        type: 'secondary',
        finalId: {
          nodeId: 'node-keep',
          processId: 'process-keep',
          allocatedExchangeDirection: 'input',
          allocatedExchangeFlowId: 'flow-keep',
        },
      },
      {
        id: 'secondary-delete',
        type: 'secondary',
        finalId: {
          nodeId: 'node-delete',
          processId: 'process-delete',
          allocatedExchangeDirection: 'output',
          allocatedExchangeFlowId: 'flow-delete',
        },
      },
    ];
    const oldProcessJson = {
      processDataSet: {
        ...buildProcessDataSet(),
        processInformation: {
          dataSetInformation: {
            identifierOfSubDataSet: 'legacy-sub-id',
            'common:synonyms': [{ '#text': 'legacy-synonym' }],
          },
          technology: {
            technologyDescriptionAndIncludedProcesses: 'legacy-description',
            technologicalApplicability: 'legacy-applicability',
            referenceToTechnologyPictogramme: 'legacy-pictogram',
            referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
          },
          time: { ref: 'legacy-time' },
          geography: { ref: 'legacy-geography' },
          mathematicalRelations: { ref: 'legacy-relations' },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: { ref: 'legacy-lci' },
          dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
          completeness: { ref: 'legacy-completeness' },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:referenceToConvertedOriginalDataSetFrom': { id: 'legacy-converted' },
            'common:referenceToDataSetUseApproval': { id: 'legacy-approval' },
          },
          publicationAndOwnership: {
            'common:dateOfLastRevision': '2026-03-01',
            'common:workflowAndPublicationStatus': 'published',
            'common:referenceToUnchangedRepublication': { id: 'legacy-republication' },
            'common:referenceToRegistrationAuthority': { id: 'legacy-authority' },
            'common:registrationNumber': 'legacy-registration',
          },
        },
      },
    };

    mockCreateTidasLifeCycleModel.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {
          issues: [
            { path: [0, 'lifeCycleModelDataSet.modellingAndValidation.validation.review'] },
            {
              path: [
                { ignored: true },
                'lifeCycleModelDataSet.modellingAndValidation.complianceDeclarations.compliance',
              ],
            },
          ],
        },
      }),
    });
    mockCreateTidasProcess
      .mockReturnValueOnce({
        validateEnhanced: jest.fn().mockReturnValue({
          success: false,
          error: {
            issues: [
              { path: [0, 'processDataSet.modellingAndValidation.validation.review'] },
              {
                path: [
                  { ignored: true },
                  'processDataSet.modellingAndValidation.complianceDeclarations.compliance',
                ],
              },
            ],
          },
        }),
      })
      .mockReturnValueOnce({
        validateEnhanced: jest.fn().mockReturnValue({
          success: false,
          error: {
            issues: [{ path: ['processInformation', 'name'] }],
          },
        }),
      });

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [{ id: 'node-a' } as any],
      edges: [
        {
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
          data: { connection: { outputExchange: { '@flowUUID': 'flow-1' } } },
        } as any,
      ],
      up2DownEdges: [
        {
          upstreamNodeId: 'node-a',
          downstreamNodeId: 'node-b',
          flowUUID: 'flow-1',
          isBalanced: false,
          unbalancedAmount: 3,
          exchangeAmount: 8,
        } as any,
      ],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: {
            id: 'existing-primary',
            type: 'primary',
            finalId: { nodeId: 'primary-node' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
        {
          option: 'update',
          modelInfo: {
            id: 'new-secondary',
            type: 'secondary',
            finalId: {
              nodeId: 'node-keep',
              processId: 'process-keep',
              allocatedExchangeDirection: 'input',
              allocatedExchangeFlowId: 'flow-keep',
            },
          },
          refProcesses: [
            {
              id: 'ref-process-a',
              version: sampleVersion,
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Ref A' }],
            },
            {
              id: '',
              version: sampleVersion,
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Invalid Ref' }],
            },
          ],
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
      oldSubmodels,
      oldProcesses: [
        {
          id: 'existing-primary',
          version: sampleVersion,
          json: oldProcessJson,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        mode: 'update',
        modelId: sampleModelId,
        version: sampleVersion,
        parent: {
          jsonOrdered: buildLifecycleModelJsonOrdered(),
          jsonTg: {
            xflow: {
              nodes: [{ id: 'node-a' }],
              edges: [
                {
                  source: { cell: 'node-a' },
                  target: { cell: 'node-b' },
                  labels: [],
                  data: {
                    connection: {
                      outputExchange: { '@flowUUID': 'flow-1' },
                      isBalanced: false,
                      unbalancedAmount: 3,
                      exchangeAmount: 8,
                    },
                  },
                },
              ],
            },
            submodels: [
              {
                id: 'existing-primary',
                type: 'primary',
                finalId: { nodeId: 'primary-node' },
                version: sampleVersion,
              },
              {
                id: 'new-secondary',
                type: 'secondary',
                finalId: {
                  nodeId: 'node-keep',
                  processId: 'process-keep',
                  allocatedExchangeDirection: 'input',
                  allocatedExchangeFlowId: 'flow-keep',
                },
                version: sampleVersion,
              },
            ],
          },
          ruleVerification: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful persistence plan');
    }

    const deleteMutation = result.plan.processMutations.find((item) => item.op === 'delete');
    const updateMutation = result.plan.processMutations.find(
      (item) => item.id === 'existing-primary',
    );
    const createMutation = result.plan.processMutations.find((item) => item.id === 'new-secondary');

    expect(deleteMutation).toEqual({
      op: 'delete',
      id: 'secondary-delete',
      version: sampleVersion,
    });
    expect(updateMutation).toMatchObject({
      op: 'update',
      id: 'existing-primary',
      version: sampleVersion,
      modelId: sampleModelId,
      ruleVerification: true,
    });
    expect(createMutation).toMatchObject({
      op: 'create',
      id: 'new-secondary',
      modelId: sampleModelId,
      ruleVerification: false,
    });

    const typedUpdateMutation = asUpsertMutation(updateMutation);
    const typedCreateMutation = asUpsertMutation(createMutation);

    expect(
      typedUpdateMutation.jsonOrdered.processDataSet.processInformation.dataSetInformation,
    ).toMatchObject({
      identifierOfSubDataSet: 'legacy-sub-id',
      'common:synonyms': [{ '#text': 'legacy-synonym' }],
    });
    expect(
      typedUpdateMutation.jsonOrdered.processDataSet.processInformation.technology,
    ).toMatchObject({
      referenceToIncludedProcesses: [
        { '@refObjectId': 'included-primary', '@version': sampleVersion },
      ],
      technologyDescriptionAndIncludedProcesses: 'legacy-description',
      technologicalApplicability: 'legacy-applicability',
      referenceToTechnologyPictogramme: 'legacy-pictogram',
      referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
    });
    expect(typedUpdateMutation.jsonOrdered.processDataSet.processInformation.time).toEqual({
      ref: 'legacy-time',
    });
    expect(typedUpdateMutation.jsonOrdered.processDataSet.processInformation.geography).toEqual({
      ref: 'legacy-geography',
    });
    expect(
      typedUpdateMutation.jsonOrdered.processDataSet.processInformation.mathematicalRelations,
    ).toEqual({ ref: 'legacy-relations' });
    expect(typedUpdateMutation.jsonOrdered.processDataSet.modellingAndValidation).toMatchObject({
      LCIMethodAndAllocation: { ref: 'legacy-lci' },
      dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
      completeness: { ref: 'legacy-completeness' },
    });
    expect(typedUpdateMutation.jsonOrdered.processDataSet.administrativeInformation).toMatchObject({
      dataEntryBy: {
        'common:referenceToConvertedOriginalDataSetFrom': {
          id: 'legacy-converted',
        },
        'common:referenceToDataSetUseApproval': { id: 'legacy-approval' },
      },
      publicationAndOwnership: {
        'common:dateOfLastRevision': '2026-03-01',
        'common:workflowAndPublicationStatus': 'published',
        'common:referenceToUnchangedRepublication': {
          id: 'legacy-republication',
        },
        'common:referenceToRegistrationAuthority': { id: 'legacy-authority' },
        'common:registrationNumber': 'legacy-registration',
      },
    });
    expect(typedCreateMutation.jsonOrdered).toEqual({
      processDataSet: {
        ...buildProcessDataSet(),
        processInformation: {
          ...buildProcessDataSet().processInformation,
          technology: {
            referenceToIncludedProcesses: [
              {
                '@refObjectId': 'ref-process-a',
                '@type': 'process data set',
                '@uri': '../processes/ref-process-a.xml',
                '@version': sampleVersion,
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Ref A' }],
              },
            ],
          },
        },
      },
    });
  });

  it('returns LANG_VALIDATION_ERROR when a generated process payload cannot be normalized', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { ignored: true },
      validationError: 'Process payload is invalid',
    });

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: { id: 'process-1', type: 'primary' },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Process payload is invalid',
    });
  });

  it('uses normalized sdk validation issues when computing rule verification flags', async () => {
    mockCreateTidasLifeCycleModel.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {
          issues: [
            {
              code: 'custom',
              path: ['lifeCycleModelDataSet', 'modellingAndValidation', 'validation', 'review'],
            },
          ],
        },
        validationIssues: [
          {
            code: 'localized_text_zh_must_include_chinese_character',
            path: ['lifeCycleModelDataSet', 'lifeCycleModelInformation', 'name', '#text'],
            rawCode: 'custom',
            severity: 'error',
          },
        ],
      }),
    });
    mockCreateTidasProcess.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {
          issues: [
            {
              code: 'custom',
              path: ['processDataSet', 'modellingAndValidation', 'validation', 'review'],
            },
          ],
        },
        validationIssues: [
          {
            code: 'localized_text_en_must_not_contain_chinese_character',
            path: ['processDataSet', 'processInformation', 'time', '#text'],
            rawCode: 'custom',
            severity: 'error',
          },
        ],
      }),
    });

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: { id: 'process-1', type: 'primary' },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        parent: {
          ruleVerification: false,
        },
        processMutations: [
          expect.objectContaining({
            id: 'process-1',
            ruleVerification: false,
          }),
        ],
      },
    });
  });

  it('preserves persisted payloads when sdk validation mutates its input objects', async () => {
    const lifeCycleModelJsonOrdered = buildLifecycleModelJsonOrdered();
    (
      lifeCycleModelJsonOrdered.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
        .processInstance as any[]
    )[0].connections = [];

    mockCreateTidasLifeCycleModel.mockImplementation((input: any) => ({
      validateEnhanced: jest.fn().mockImplementation(() => {
        delete input.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
          .processInstance[0].connections;
        return { success: true };
      }),
    }));
    mockCreateTidasProcess.mockImplementation((input: any) => ({
      validateEnhanced: jest.fn().mockImplementation(() => {
        delete input.processDataSet.processInformation.technology.referenceToIncludedProcesses;
        return { success: true };
      }),
    }));

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered,
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: {
            id: 'primary-process',
            type: 'primary',
            finalId: { nodeId: 'primary-node' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected sdk-mutation preservation plan to succeed');
    }
    const parentJsonOrdered = result.plan.parent.jsonOrdered as any;

    expect(
      (
        parentJsonOrdered.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
          .processInstance as any[]
      )[0].connections,
    ).toEqual([]);

    const processMutation = asUpsertMutation(result.plan.processMutations[0]);
    expect(
      processMutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([
      {
        '@refObjectId': 'included-primary',
        '@version': sampleVersion,
      },
    ]);
  });

  it('uses the dataset version when args.version is omitted and falls back to an empty version string when none exists', async () => {
    const versionlessJson = {
      lifeCycleModelDataSet: {
        administrativeInformation: {
          publicationAndOwnership: {},
        },
        lifeCycleModelInformation: {
          technology: {
            processes: {
              processInstance: [],
            },
          },
        },
        modellingAndValidation: {
          complianceDeclarations: {},
          validation: {},
        },
      },
    };

    await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [],
    });

    await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: versionlessJson,
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [],
    });

    expect(mockGenReferenceToResultingProcess).toHaveBeenNthCalledWith(
      1,
      [],
      sampleVersion,
      buildLifecycleModelJsonOrdered(),
    );
    expect(mockGenReferenceToResultingProcess).toHaveBeenNthCalledWith(2, [], '', versionlessJson);
  });

  it('falls back to a create mutation when an update process has no matching old process snapshot', async () => {
    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: {
            id: 'orphan-update',
            type: 'custom',
            finalId: { nodeId: 'node-orphan' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
      oldSubmodels: [],
      oldProcesses: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan for orphan update fallback');
    }

    expect(result.plan.processMutations).toEqual([
      expect.objectContaining({
        op: 'create',
        id: 'orphan-update',
        modelId: sampleModelId,
      }),
    ]);
  });

  it('uses empty edge and ref-process defaults plus raw normalized process payloads', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: undefined as any,
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: {
            id: 'secondary-no-refs',
            type: 'secondary',
            finalId: { nodeId: 'node-secondary-no-refs' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when using empty edge/ref defaults');
    }

    expect(result.plan.parent.jsonTg?.xflow?.edges).toEqual([]);
    expect(result.plan.processMutations).toEqual([
      expect.objectContaining({
        op: 'create',
        id: 'secondary-no-refs',
        modelId: sampleModelId,
        jsonOrdered: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {},
              technology: {
                referenceToIncludedProcesses: [],
              },
            },
            modellingAndValidation: {
              complianceDeclarations: {},
              validation: {},
            },
            administrativeInformation: {
              dataEntryBy: {},
              publicationAndOwnership: {},
            },
          },
        },
      }),
    ]);
  });

  it('treats missing process issue arrays and string-only validation paths as passing', async () => {
    mockCreateTidasProcess
      .mockReturnValueOnce({
        validateEnhanced: jest.fn().mockReturnValue({
          success: false,
          error: {},
        }),
      })
      .mockReturnValueOnce({
        validateEnhanced: jest.fn().mockReturnValue({
          success: false,
          error: {
            issues: [
              {
                path: 'processDataSet.modellingAndValidation.validation.review',
              },
              {
                path: 'processDataSet.modellingAndValidation.complianceDeclarations.compliance',
              },
            ],
          },
        }),
      });

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: {
            id: 'secondary-missing-process-issues',
            type: 'secondary',
            finalId: { nodeId: 'node-secondary-missing-process-issues' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
        {
          modelInfo: {
            id: 'secondary-string-validation-paths',
            type: 'secondary',
            finalId: { nodeId: 'node-secondary-string-validation-paths' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when process issues are filtered or absent');
    }

    const mutationsById = new Map(
      result.plan.processMutations
        .filter((mutation) => mutation && 'jsonOrdered' in mutation)
        .map((mutation: any) => [mutation.id, mutation]),
    );

    expect(
      asUpsertMutation(mutationsById.get('secondary-missing-process-issues')).ruleVerification,
    ).toBe(true);
    expect(
      asUpsertMutation(mutationsById.get('secondary-string-validation-paths')).ruleVerification,
    ).toBe(true);
  });

  it('keeps undefined-path sdk issues on processes while treating missing sdk issue arrays as valid', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockCreateTidasLifeCycleModel.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {},
      }),
    });
    mockCreateTidasProcess.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {
          issues: [{ path: undefined }],
        },
      }),
    });

    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'create',
      modelId: sampleModelId,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          modelInfo: {
            id: 'secondary-undefined-sdk-path',
            type: 'secondary',
            finalId: { nodeId: 'node-secondary-undefined-sdk-path' },
          },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when sdk issue arrays are sparse');
    }

    expect(result.plan.parent.ruleVerification).toBe(true);
    expect(asUpsertMutation(result.plan.processMutations[0]).ruleVerification).toBe(false);
  });

  it('creates missing technology and modelling containers before copying legacy process fields', async () => {
    const originalStructuredClone = global.structuredClone;
    const structuredCloneSpy = jest.fn((value) => JSON.parse(JSON.stringify(value)));
    global.structuredClone = structuredCloneSpy as typeof structuredClone;

    try {
      const result = await buildSaveLifeCycleModelPersistencePlan({
        mode: 'update',
        modelId: sampleModelId,
        version: sampleVersion,
        lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
        nodes: [],
        edges: [],
        up2DownEdges: [],
        lifeCycleModelProcesses: [
          {
            option: 'update',
            modelInfo: {
              id: 'existing-secondary',
              type: 'custom',
              finalId: { nodeId: 'node-1' },
            },
            data: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {},
                },
                administrativeInformation: {
                  dataEntryBy: {},
                  publicationAndOwnership: {},
                },
              },
            },
          },
        ],
        oldSubmodels: [],
        oldProcesses: [
          {
            id: 'existing-secondary',
            version: sampleVersion,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {},
                  technology: {
                    technologyDescriptionAndIncludedProcesses: 'legacy-description',
                    technologicalApplicability: 'legacy-applicability',
                    referenceToTechnologyPictogramme: 'legacy-pictogram',
                    referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
                  },
                },
                modellingAndValidation: {
                  LCIMethodAndAllocation: { ref: 'legacy-lci' },
                  dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
                  completeness: { ref: 'legacy-completeness' },
                },
                administrativeInformation: {
                  dataEntryBy: {},
                  publicationAndOwnership: {},
                },
              },
            },
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('Expected a successful plan when legacy process fields are present');
      }

      const updateMutation = asUpsertMutation(result.plan.processMutations[0]);
      expect(updateMutation).toMatchObject({
        op: 'update',
        id: 'existing-secondary',
        version: sampleVersion,
        modelId: sampleModelId,
      });
      expect(updateMutation.jsonOrdered.processDataSet.processInformation.technology).toMatchObject(
        {
          technologyDescriptionAndIncludedProcesses: 'legacy-description',
          technologicalApplicability: 'legacy-applicability',
          referenceToTechnologyPictogramme: 'legacy-pictogram',
          referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
        },
      );
      expect(updateMutation.jsonOrdered.processDataSet.modellingAndValidation).toMatchObject({
        LCIMethodAndAllocation: { ref: 'legacy-lci' },
        dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
        completeness: { ref: 'legacy-completeness' },
      });
      expect(structuredCloneSpy).toHaveBeenCalled();
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });

  it('creates later technology and modelling containers when the first legacy fields are absent', async () => {
    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: {
            id: 'existing-secondary',
            type: 'custom',
            finalId: { nodeId: 'node-1' },
          },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
      ],
      oldSubmodels: [],
      oldProcesses: [
        {
          id: 'existing-secondary',
          version: sampleVersion,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
                technology: {
                  technologicalApplicability: 'legacy-applicability',
                  referenceToTechnologyPictogramme: 'legacy-pictogram',
                  referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
                },
              },
              modellingAndValidation: {
                dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
                completeness: { ref: 'legacy-completeness' },
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when sparse legacy process fields are present');
    }

    const updateMutation = asUpsertMutation(result.plan.processMutations[0]);
    expect(updateMutation.jsonOrdered.processDataSet.processInformation.technology).toMatchObject({
      technologicalApplicability: 'legacy-applicability',
      referenceToTechnologyPictogramme: 'legacy-pictogram',
      referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
    });
    expect(updateMutation.jsonOrdered.processDataSet.modellingAndValidation).toMatchObject({
      dataSourcesTreatmentAndRepresentativeness: { ref: 'legacy-dstr' },
      completeness: { ref: 'legacy-completeness' },
    });
  });

  it('creates each sparse legacy container path independently across multiple process updates', async () => {
    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: {
            id: 'process-pictogram',
            type: 'custom',
            finalId: { nodeId: 'node-pictogram' },
          },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
        {
          option: 'update',
          modelInfo: {
            id: 'process-diagram',
            type: 'custom',
            finalId: { nodeId: 'node-diagram' },
          },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
        {
          option: 'update',
          modelInfo: {
            id: 'process-completeness',
            type: 'custom',
            finalId: { nodeId: 'node-completeness' },
          },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
      ],
      oldSubmodels: [],
      oldProcesses: [
        {
          id: 'process-pictogram',
          version: sampleVersion,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
                technology: {
                  referenceToTechnologyPictogramme: 'legacy-pictogram',
                },
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
        {
          id: 'process-diagram',
          version: sampleVersion,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
                technology: {
                  referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
                },
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
        {
          id: 'process-completeness',
          version: sampleVersion,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
              modellingAndValidation: {
                completeness: { ref: 'legacy-completeness' },
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when sparse legacy branches are present');
    }

    const byId = new Map<string, any>(
      result.plan.processMutations
        .filter((mutation) => mutation && 'jsonOrdered' in mutation)
        .map((mutation: any) => [mutation.id, mutation.jsonOrdered]),
    );
    expect(
      byId.get('process-pictogram')?.processDataSet?.processInformation?.technology,
    ).toMatchObject({
      referenceToTechnologyPictogramme: 'legacy-pictogram',
    });
    expect(
      byId.get('process-diagram')?.processDataSet?.processInformation?.technology,
    ).toMatchObject({
      referenceToTechnologyFlowDiagrammOrPicture: 'legacy-diagram',
    });
    expect(byId.get('process-completeness')?.processDataSet?.modellingAndValidation).toMatchObject({
      completeness: { ref: 'legacy-completeness' },
    });
  });

  it('copies legacy administrative and process metadata fields when they exist', async () => {
    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: [],
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: {
            id: 'legacy-rich-process',
            type: 'custom',
            finalId: { nodeId: 'node-legacy-rich' },
          },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
                technology: {},
              },
              modellingAndValidation: {
                complianceDeclarations: {},
                validation: {},
              },
              administrativeInformation: {
                dataEntryBy: {},
                publicationAndOwnership: {},
              },
            },
          },
        },
      ],
      oldSubmodels: [],
      oldProcesses: [
        {
          id: 'legacy-rich-process',
          version: sampleVersion,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  'common:synonyms': ['legacy-synonym'],
                },
                technology: {},
                time: { year: 2025 },
                geography: { shortname: 'CN' },
                mathematicalRelations: { formula: 'x+y' },
              },
              modellingAndValidation: {
                complianceDeclarations: {},
                validation: {},
              },
              administrativeInformation: {
                dataEntryBy: {
                  'common:referenceToConvertedOriginalDataSetFrom': { '@refObjectId': 'converted' },
                  'common:referenceToDataSetUseApproval': { '@refObjectId': 'approval' },
                },
                publicationAndOwnership: {
                  'common:dateOfLastRevision': '2026-03-18',
                  'common:workflowAndPublicationStatus': 'published',
                  'common:referenceToUnchangedRepublication': { '@refObjectId': 'repub' },
                  'common:referenceToRegistrationAuthority': { '@refObjectId': 'authority' },
                  'common:registrationNumber': 'REG-001',
                },
              },
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful plan when legacy administrative fields are present');
    }

    const updateMutation = asUpsertMutation(result.plan.processMutations[0]);
    expect(updateMutation.jsonOrdered.processDataSet).toMatchObject({
      processInformation: {
        dataSetInformation: {
          'common:synonyms': ['legacy-synonym'],
        },
        time: { year: 2025 },
        geography: { shortname: 'CN' },
        mathematicalRelations: { formula: 'x+y' },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:referenceToConvertedOriginalDataSetFrom': { '@refObjectId': 'converted' },
          'common:referenceToDataSetUseApproval': { '@refObjectId': 'approval' },
        },
        publicationAndOwnership: {
          'common:dateOfLastRevision': '2026-03-18',
          'common:workflowAndPublicationStatus': 'published',
          'common:referenceToUnchangedRepublication': { '@refObjectId': 'repub' },
          'common:referenceToRegistrationAuthority': { '@refObjectId': 'authority' },
          'common:registrationNumber': 'REG-001',
        },
      },
    });
  });
});

describe('allocated provider persistence', () => {
  it('updates a provider from its current source inventory and retires obsolete providers independently of result identities', async () => {
    const finalId = {
      nodeId: 'node-a',
      processId: 'source-a',
      allocatedExchangeDirection: 'OUTPUT',
      allocatedExchangeFlowId: 'flow-a',
    };
    const provider = buildProcessDataSet() as any;
    provider.processInformation.time = { 'common:referenceYear': 2025 };
    provider.modellingAndValidation.LCIMethodAndAllocation = {
      typeOfDataSet: 'Unit process, single operation',
    };
    const prior = buildProcessDataSet() as any;
    prior.processInformation.time = { 'common:referenceYear': 2020 };
    prior.modellingAndValidation.LCIMethodAndAllocation = { typeOfDataSet: 'LCI result' };
    const nodes = [{ id: 'node-a', data: { id: 'source-a', version: '01.00.000' } }];
    const result = await buildSaveLifeCycleModelPersistencePlan({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      lifeCycleModelJsonOrdered: buildLifecycleModelJsonOrdered(),
      nodes: nodes as any,
      edges: [],
      up2DownEdges: [],
      lifeCycleModelProcesses: [
        {
          option: 'update',
          modelInfo: { id: 'provider-a', type: 'allocated', finalId },
          data: { processDataSet: provider },
          refProcesses: [{ id: 'source-a', version: '01.00.000', 'common:shortDescription': [] }],
        },
      ],
      oldSubmodels: [
        { id: 'provider-a', version: sampleVersion, type: 'allocated', finalId },
        { id: 'retired-provider', version: sampleVersion, type: 'allocated', finalId },
        { id: 'retired-result', version: sampleVersion, type: 'secondary', finalId },
      ],
      oldProcesses: [{ id: 'provider-a', version: sampleVersion, json: { processDataSet: prior } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.plan.parent.jsonTg.xflow?.nodes).toEqual(nodes);
    expect(result.plan.processMutations.filter((m) => m.op === 'delete').map((m) => m.id)).toEqual([
      'retired-provider',
      'retired-result',
    ]);
    const mutation = asUpsertMutation(result.plan.processMutations.find((m) => m.op === 'update'));
    expect(mutation.id).toBe('provider-a');
    expect(
      mutation.jsonOrdered.processDataSet.processInformation.time['common:referenceYear'],
    ).toBe(2025);
    expect(
      mutation.jsonOrdered.processDataSet.modellingAndValidation.LCIMethodAndAllocation
        .typeOfDataSet,
    ).toBe('Unit process, single operation');
    expect(
      mutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([expect.objectContaining({ '@refObjectId': 'source-a', '@version': '01.00.000' })]);
  });
});
