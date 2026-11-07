/**
 * Focused tests for the lifecycle model service bundle persistence flow.
 */

jest.mock('@/pages/LifeCycleModels/lifecyclemodels.json', () => ({}), { virtual: true });

jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  __esModule: true,
  createLifeCycleModel: jest.fn().mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  }),
  createProcess: jest.fn().mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  }),
}));

const {
  createLifeCycleModel: mockCreateTidasLifeCycleModel,
  createProcess: mockCreateTidasProcess,
} = jest.requireMock('@tiangong-lca/tidas-sdk/core');

const mockFrom = jest.fn();
const mockAuthGetSession = jest.fn();
const mockFunctionsInvoke = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/services/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: (...args: any[]) => mockAuthGetSession(...args),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

const mockGetTeamIdByUserId = jest.fn();
const mockContributeSource = jest.fn();
const mockGetRefData = jest.fn();
const mockNormalizeLangPayloadForSave = jest.fn();
const mockBuildLangNormalizationMetadata = jest.fn();
const mockAttachLangNormalizationMetadata = jest.fn();

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  attachLangNormalizationMetadata: (...args: any[]) => mockAttachLangNormalizationMetadata(...args),
  buildLangNormalizationMetadata: (...args: any[]) => mockBuildLangNormalizationMetadata(...args),
  contributeSource: (...args: any[]) => mockContributeSource(...args),
  getRefData: (...args: any[]) => mockGetRefData(...args),
  getTeamIdByUserId: (...args: any[]) => mockGetTeamIdByUserId(...args),
  normalizeLangPayloadForSave: (...args: any[]) => mockNormalizeLangPayloadForSave(...args),
}));

const mockClassificationToString = jest.fn();
const mockGenClassificationZH = jest.fn();
const mockGetLangText = jest.fn();
const mockJsonToList = jest.fn();

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  classificationToString: (...args: any[]) => mockClassificationToString(...args),
  genClassificationZH: (...args: any[]) => mockGenClassificationZH(...args),
  genLocalizedClassification: (...args: any[]) => mockGenClassificationZH(...args),
  getLangText: (...args: any[]) => mockGetLangText(...args),
  jsonToList: (...args: any[]) => mockJsonToList(...args),
}));

const mockGetCachedClassificationData = jest.fn();

jest.mock('@/services/classifications/cache', () => ({
  __esModule: true,
  getCachedClassificationData: (...args: any[]) => mockGetCachedClassificationData(...args),
}));

const mockGetProcessDetailByIdsAndVersion = jest.fn();

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetailByIdsAndVersion: (...args: any[]) => mockGetProcessDetailByIdsAndVersion(...args),
}));

const mockGenProcessName = jest.fn();
const mockGenProcessJsonOrdered = jest.fn();

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessJsonOrdered: (...args: any[]) => mockGenProcessJsonOrdered(...args),
  genProcessName: (...args: any[]) => mockGenProcessName(...args),
}));

const mockGetCurrentUser = jest.fn();

jest.mock('@/services/auth', () => ({
  __esModule: true,
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}));

const mockGenLifeCycleModelJsonOrdered = jest.fn();
const mockGenReferenceToResultingProcess = jest.fn();
class MockMissingLifeCycleModelFlowVersionError extends Error {
  readonly code = 'MISSING_FLOW_VERSION';
  readonly details: Record<string, unknown>;

  constructor(details: Record<string, unknown>) {
    super('Missing Flow dataset version for outputExchange.@version');
    this.details = details;
  }
}

jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genLifeCycleModelJsonOrdered: (...args: any[]) => mockGenLifeCycleModelJsonOrdered(...args),
  genReferenceToResultingProcess: (...args: any[]) => mockGenReferenceToResultingProcess(...args),
  MISSING_LIFECYCLE_MODEL_FLOW_VERSION_ERROR_CODE: 'MISSING_FLOW_VERSION',
}));

const mockGenLifeCycleModelProcesses = jest.fn();
const { CalculationCancelledError, CalculationError } = jest.requireActual(
  '@/services/lifeCycleModels/matrixCalculation/types',
) as typeof import('@/services/lifeCycleModels/matrixCalculation/types');

jest.mock('@/services/lifeCycleModels/util_calculate', () => ({
  __esModule: true,
  genLifeCycleModelProcesses: (...args: any[]) => mockGenLifeCycleModelProcesses(...args),
}));

const mockGetAllRefObj = jest.fn();
const mockGetRefTableName = jest.fn();
const mockValidateDatasetRuleVerification = jest.fn();

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  ConcurrencyController: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    waitForAll: jest.fn().mockResolvedValue(undefined),
  })),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  getRefTableName: (...args: any[]) => mockGetRefTableName(...args),
  validateDatasetRuleVerification: (...args: any[]) => mockValidateDatasetRuleVerification(...args),
}));

import * as lifeCycleModelsApi from '@/services/lifeCycleModels/api';

import {
  createQueryBuilder as baseCreateQueryBuilder,
  createMockEdgeFunctionResponse,
  createMockNoSession,
  createMockSession,
} from '../../../helpers/mockBuilders';

const sampleModelId = '11111111-1111-1111-1111-111111111111';
const sampleProcessId = '22222222-2222-2222-2222-222222222222';
const sampleVersion = '01.00.000';
const sampleUserId = 'user-0001';
const sampleAccessToken = 'access-token-0001';

const createQueryBuilder = <T>(resolvedValue: T) => {
  const builder = baseCreateQueryBuilder(resolvedValue);
  mockRpc.mockImplementation((functionName: string, args: any = {}) => {
    if (functionName !== 'get_latest_lifecyclemodel_versions') {
      return Promise.resolve({ data: [] });
    }

    mockFrom('lifecyclemodels');
    builder.select();
    builder.order(args.sort_by ?? 'modified_at', {
      ascending: args.sort_direction === 'asc',
    });
    builder.range(
      ((args.page_current ?? 1) - 1) * (args.page_size ?? 10),
      (args.page_current ?? 1) * (args.page_size ?? 10) - 1,
    );
    if (args.data_source === 'tg') {
      builder.eq('state_code', 100);
    }
    if (args.data_source === 'co') {
      builder.eq('state_code', 200);
    }
    if (args.state_code_filter !== null && args.state_code_filter !== undefined) {
      builder.eq('state_code', args.state_code_filter);
    }
    if (args.this_user_id) {
      builder.eq('user_id', args.this_user_id);
    }
    if (args.team_id_filter) {
      builder.eq('team_id', args.team_id_filter);
    }
    return Promise.resolve(resolvedValue);
  });
  return builder;
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

const buildLifecycleModelJsonOrdered = (includedProcessIds: string[] = []) => ({
  lifeCycleModelDataSet: {
    administrativeInformation: {
      publicationAndOwnership: {
        'common:dataSetVersion': sampleVersion,
      },
    },
    lifeCycleModelInformation: {
      dataSetInformation: {
        name: {},
      },
      technology: {
        processes: {
          processInstance: includedProcessIds.map((id) => ({
            referenceToProcess: { '@refObjectId': id },
          })),
        },
      },
    },
    modellingAndValidation: {
      complianceDeclarations: {},
      validation: {},
    },
  },
});

const buildSaveResult = (overrides: Record<string, unknown> = {}) => ({
  ok: true as const,
  modelId: sampleModelId,
  version: sampleVersion,
  lifecycleModel: {
    id: sampleModelId,
    version: sampleVersion,
    json: {},
    json_tg: { submodels: [] },
    ruleVerification: true,
  },
  ...overrides,
});

const createInvokeError = ({
  status = 500,
  jsonPayload,
  text = '',
  jsonError,
  textError,
  message = 'Function error',
}: {
  status?: number;
  jsonPayload?: unknown;
  text?: string;
  jsonError?: Error;
  textError?: Error;
  message?: string;
} = {}) => ({
  message,
  context: {
    status,
    clone: jest.fn(() => ({
      json: jsonError
        ? jest.fn().mockRejectedValue(jsonError)
        : jest.fn().mockResolvedValue(jsonPayload),
      text: textError ? jest.fn().mockRejectedValue(textError) : jest.fn().mockResolvedValue(text),
    })),
  },
});

beforeEach(() => {
  jest.clearAllMocks();

  mockFrom.mockReset();
  mockAuthGetSession.mockReset();
  mockFunctionsInvoke.mockReset();
  mockRpc.mockReset();
  mockGetTeamIdByUserId.mockReset();
  mockContributeSource.mockReset();
  mockGetRefData.mockReset();
  mockNormalizeLangPayloadForSave.mockReset();
  mockBuildLangNormalizationMetadata.mockReset();
  mockAttachLangNormalizationMetadata.mockReset();
  mockClassificationToString.mockReset();
  mockGenClassificationZH.mockReset();
  mockGetLangText.mockReset();
  mockJsonToList.mockReset();
  mockGetCachedClassificationData.mockReset();
  mockGetProcessDetailByIdsAndVersion.mockReset();
  mockGenProcessName.mockReset();
  mockGenProcessJsonOrdered.mockReset();
  mockGetCurrentUser.mockReset();
  mockGenLifeCycleModelJsonOrdered.mockReset();
  mockGenReferenceToResultingProcess.mockReset();
  mockGenLifeCycleModelProcesses.mockReset();
  mockGetAllRefObj.mockReset();
  mockGetRefTableName.mockReset();
  mockValidateDatasetRuleVerification.mockReset();
  mockCreateTidasLifeCycleModel.mockReset();
  mockCreateTidasProcess.mockReset();

  mockAuthGetSession.mockResolvedValue(createMockSession(sampleUserId, sampleAccessToken));
  mockGetTeamIdByUserId.mockResolvedValue('team-default');
  mockContributeSource.mockResolvedValue({ success: true });
  mockGetRefData.mockResolvedValue({ success: true, data: null });
  mockNormalizeLangPayloadForSave.mockImplementation(async (payload: any) => ({
    payload,
    validationError: undefined,
  }));
  mockBuildLangNormalizationMetadata.mockImplementation(
    (normalizedResult: any, rawPayload: any) => ({
      normalizedJsonOrdered: normalizedResult?.payload ?? rawPayload,
      langSupplementedPlaceholderPaths: normalizedResult?.supplementedEnglishPlaceholderPaths ?? [],
      langTranslatedPaths: normalizedResult?.translatedPaths ?? [],
    }),
  );
  mockAttachLangNormalizationMetadata.mockImplementation((result: any) => result);
  mockClassificationToString.mockReturnValue('classification-string');
  mockGenClassificationZH.mockReturnValue(['classification-zh']);
  mockGetLangText.mockReturnValue('localized-text');
  mockJsonToList.mockImplementation((value: any) =>
    Array.isArray(value) ? value : value ? [value] : [],
  );
  mockGetCachedClassificationData.mockResolvedValue([
    { id: 'classification-root', value: 'Classification', label: 'Classification', children: [] },
  ]);
  mockGetProcessDetailByIdsAndVersion.mockResolvedValue({ data: [] });
  mockGenProcessName.mockReturnValue('Life Cycle Model Name');
  mockGenProcessJsonOrdered.mockImplementation((_id: string, data: any) => ({
    processDataSet: data,
  }));
  mockGetCurrentUser.mockResolvedValue({ userid: sampleUserId });
  mockGenLifeCycleModelJsonOrdered.mockReturnValue(buildLifecycleModelJsonOrdered());
  mockGenReferenceToResultingProcess.mockImplementation(
    (processes: any[], version: string, data: any) => ({
      ...data,
      lifeCycleModelDataSet: {
        ...(data?.lifeCycleModelDataSet ?? {}),
        lifeCycleModelInformation: {
          ...(data?.lifeCycleModelDataSet?.lifeCycleModelInformation ?? {}),
          dataSetInformation: {
            ...(data?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation ?? {}),
            referenceToResultingProcess: (processes ?? []).map((process: any) => ({
              '@refObjectId': process?.modelInfo?.id,
              '@type': 'process data set',
              '@uri': `../processes/${process?.modelInfo?.id}.xml`,
              '@version': version,
              'common:shortDescription':
                process?.data?.processDataSet?.processInformation?.dataSetInformation?.name ?? {},
            })),
          },
        },
      },
    }),
  );
  mockGenLifeCycleModelProcesses.mockResolvedValue({
    lifeCycleModelProcesses: [],
    up2DownEdges: [],
  });
  mockGetAllRefObj.mockReturnValue([]);
  mockGetRefTableName.mockImplementation((type: string) => {
    if (type === 'process data set') return 'processes';
    if (type === 'lifeCycleModel data set') return 'lifecyclemodels';
    if (type === 'source data set') return 'sources';
    return '';
  });
  mockValidateDatasetRuleVerification.mockResolvedValue({
    ruleVerification: true,
  });
  mockCreateTidasLifeCycleModel.mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  });
  mockCreateTidasProcess.mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  });
});

describe('getLifeCycleModelTableAll', () => {
  it('maps lifecycle model rows for the english table view', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: sampleModelId,
            name: {},
            'common:class': [{ id: 'class-1' }],
            'common:generalComment': {},
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
        error: null,
        count: 1,
      }),
    );

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      { modified_at: 'descend' } as any,
      'en',
      'tg',
      '',
    );

    expect(result).toMatchObject({
      success: true,
      total: 1,
      data: [
        {
          id: sampleModelId,
          name: 'Life Cycle Model Name',
          classification: 'classification-string',
          generalComment: 'localized-text',
          version: sampleVersion,
          teamId: 'team-1',
        },
      ],
    });
  });

  it('normalizes latest-version sort aliases and handles sessions without a user id', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-without-user',
        },
      },
    });
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [],
        error: null,
        count: 0,
      }),
    );

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      { modifiedAt: 'ascend' } as any,
      'en',
      'tg',
      '',
    );

    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_latest_lifecyclemodel_versions',
      expect.objectContaining({
        sort_by: 'modified_at',
        sort_direction: 'asc',
        this_user_id: '',
      }),
    );

    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [],
        error: null,
        count: 0,
      }),
    );

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      { createdAt: 'descend' } as any,
      'en',
      'tg',
      '',
    );

    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_latest_lifecyclemodel_versions',
      expect.objectContaining({
        sort_by: 'created_at',
        sort_direction: 'desc',
      }),
    );
  });
});

describe('getLifeCycleModelDetail', () => {
  it('returns the lifecycle model detail payload', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            json: { foo: 'bar' },
            json_tg: { submodels: [] },
            state_code: 0,
            rule_verification: true,
            team_id: 'team-1',
          },
        ],
        error: null,
      }),
    );

    const result = await lifeCycleModelsApi.getLifeCycleModelDetail(sampleModelId, sampleVersion);

    expect(result).toEqual({
      data: {
        id: sampleModelId,
        version: sampleVersion,
        json: { foo: 'bar' },
        json_tg: { submodels: [] },
        stateCode: 0,
        ruleVerification: true,
        teamId: 'team-1',
      },
      success: true,
    });
  });
});

describe('deleteLifeCycleModel', () => {
  it('returns auth error when deleting without a session', async () => {
    mockAuthGetSession.mockResolvedValueOnce(createMockNoSession());

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    });
  });

  it('normalizes session lookup failures into a mutation error', async () => {
    mockAuthGetSession.mockRejectedValueOnce(new Error('session lookup failed'));

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'session lookup failed',
    });
  });

  it('invokes the delete bundle endpoint', async () => {
    const edgePayload = {
      ok: true,
      modelId: sampleModelId,
      version: sampleVersion,
    };
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('delete_lifecycle_model_bundle', {
      headers: { Authorization: `Bearer ${sampleAccessToken}` },
      body: {
        modelId: sampleModelId,
        version: sampleVersion,
      },
      region: expect.any(String),
    });
    expect(result).toEqual(edgePayload);
  });

  it('normalizes bundle invocation rejects into a mutation error', async () => {
    mockFunctionsInvoke.mockRejectedValueOnce(new Error('network down'));

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'network down',
    });
  });

  it('returns a mutation result payload from the edge-function JSON error body', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 409,
        jsonPayload: {
          ok: false,
          code: 'VERSION_CONFLICT',
          message: 'Version conflict',
          details: { latest: '02.00.000' },
        },
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'Version conflict',
      details: { latest: '02.00.000' },
    });
  });

  it('normalizes coded JSON error bodies from the bundle endpoint', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 400,
        jsonPayload: {
          code: 'INVALID_PLAN',
          message: 'Plan payload is invalid',
          details: { field: 'processMutations' },
        },
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PLAN',
      message: 'Plan payload is invalid',
      details: { field: 'processMutations' },
    });
  });

  it('falls past JSON bodies without a string code to status-based handling', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({ status: 500, jsonPayload: { foo: 'bar' } }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_REJECTED' });
  });

  it('falls past JSON bodies without a string message to status-based handling', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({ status: 500, jsonPayload: { code: 'ONLY_CODE' } }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_REJECTED' });
  });

  it('uses the default rejection message when the invoke error carries none', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 500,
        jsonError: new Error('bad json'),
        message: null as any,
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({
      ok: false,
      code: 'SAVE_REJECTED',
      message: 'Lifecycle model bundle request failed',
    });
  });

  it('reports unknown save status when the invoke error has no name at all', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({ status: 0, message: 'mystery' }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_STATUS_UNKNOWN', message: 'mystery' });
  });

  it('falls back to text-based status handling when JSON parsing fails', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 403,
        jsonError: new Error('json parse failed'),
        text: 'Forbidden by policy',
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Forbidden by policy',
      details: undefined,
    });
  });

  it('maps 401 text responses to AUTH_REQUIRED', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 401,
        jsonError: new Error('json parse failed'),
        text: 'Login again',
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Login again',
      details: undefined,
    });
  });

  it('maps 404 text responses to MODEL_NOT_FOUND', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 404,
        jsonError: new Error('json parse failed'),
        text: 'Lifecycle model is gone',
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'MODEL_NOT_FOUND',
      message: 'Lifecycle model is gone',
      details: undefined,
    });
  });

  it.each([
    [401, 'AUTH_REQUIRED', 'Authentication required'],
    [403, 'FORBIDDEN', 'Forbidden'],
    [404, 'MODEL_NOT_FOUND', 'Lifecycle model not found'],
  ])(
    'uses the default status message for %s responses when the text body is empty',
    async (status, code, message) => {
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: null,
        error: createInvokeError({
          status,
          jsonError: new Error('json parse failed'),
          text: '',
        }),
      });

      const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

      expect(result).toEqual({
        ok: false,
        code,
        message,
        details: undefined,
      });
    },
  );

  it('falls back to a generic function error when only plain text is available', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 500,
        jsonError: new Error('json parse failed'),
        text: 'Plain text failure',
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_REJECTED',
      message: 'Plain text failure',
      details: { status: 500 },
    });
  });

  it('falls back to the generic function error when the edge-function error has no context or message', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'Lifecycle model bundle request failed',
      details: {},
    });
  });

  it('falls back to status defaults when response parsing fails entirely', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: createInvokeError({
        status: 404,
        jsonError: new Error('json parse failed'),
        textError: new Error('text parse failed'),
      }),
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'MODEL_NOT_FOUND',
      message: 'Lifecycle model not found',
      details: undefined,
    });
  });

  it('falls back to status defaults when there is no cloneable response payload', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'missing response body',
        context: { status: 401 },
      },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
      details: undefined,
    });
  });

  it('maps 403 status defaults when there is no cloneable response payload', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'forbidden',
        context: { status: 403 },
      },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Forbidden',
      details: undefined,
    });
  });

  it('falls back to the original error message when there is no status mapping', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Unexpected lifecycle bundle failure',
        context: { status: 500 },
      },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_REJECTED',
      message: 'Unexpected lifecycle bundle failure',
      details: {
        message: 'Unexpected lifecycle bundle failure',
        context: { status: 500 },
      },
    });
  });

  it('reports unknown save status for transport failures without a server response', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'fetch failed' },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'fetch failed',
      details: { name: 'FunctionsFetchError', message: 'fetch failed' },
    });
  });

  it('uses an empty message for transport failures that carry none', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsRelayError', message: undefined as any },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_STATUS_UNKNOWN', message: '' });
  });

  it('reports unknown save status for relay errors carrying a real 504 response body', async () => {
    // 真实 Supabase FunctionsRelayError 携带 HTTP Response（如网关 504），
    // 文本分支不得把它误判为确定的保存拒绝
    class FakeHttpResponse {
      status: number;
      private bodyText: string;
      constructor(bodyText: string, init: { status: number }) {
        this.bodyText = bodyText;
        this.status = init.status;
      }
      clone() {
        return new FakeHttpResponse(this.bodyText, { status: this.status });
      }
      json() {
        return Promise.reject(new SyntaxError('Unexpected token'));
      }
      text() {
        return Promise.resolve(this.bodyText);
      }
    }

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'FunctionsRelayError',
        message: 'Relay Error',
        context: new FakeHttpResponse('upstream timeout', { status: 504 }),
      },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_STATUS_UNKNOWN' });
  });

  it('reports unknown save status for relay errors with an empty 504 response body', async () => {
    // 空体的 504 同样无法证明事务未提交：不得落入 status>0 的确定拒绝分支
    class FakeHttpResponse {
      status: number;
      private bodyText: string;
      constructor(bodyText: string, init: { status: number }) {
        this.bodyText = bodyText;
        this.status = init.status;
      }
      clone() {
        return new FakeHttpResponse(this.bodyText, { status: this.status });
      }
      json() {
        return Promise.reject(new SyntaxError('Unexpected end of JSON input'));
      }
      text() {
        return Promise.resolve(this.bodyText);
      }
    }

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'FunctionsRelayError',
        message: 'Relay Error',
        context: new FakeHttpResponse('', { status: 504 }),
      },
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({ ok: false, code: 'SAVE_STATUS_UNKNOWN' });
  });

  it('reports unknown save status when the bundle endpoint response is missing', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(undefined);

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'Lifecycle model bundle request failed',
      details: undefined,
    });
  });

  it('reports unknown save status when the bundle endpoint returns malformed data', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { unexpected: true },
      error: null,
    });

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'Lifecycle model bundle endpoint returned an invalid response',
      details: { unexpected: true },
    });
  });

  it('reports unknown save status when an invoke rejection has no message', async () => {
    mockFunctionsInvoke.mockRejectedValueOnce({});

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'Lifecycle model bundle request failed',
      details: {},
    });
  });

  it('reports unknown save status when session lookup rejects without a message', async () => {
    mockAuthGetSession.mockRejectedValueOnce({});

    const result = await lifeCycleModelsApi.deleteLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      ok: false,
      code: 'SAVE_STATUS_UNKNOWN',
      message: 'Lifecycle model bundle request failed',
      details: {},
    });
  });
});

describe('createLifeCycleModel', () => {
  it('returns a targeted error before persistence when a connection Flow version is missing', async () => {
    const details = {
      edgeId: 'edge-1',
      fieldPath: 'outputExchange.@version',
      flowUUID: 'flow-1',
      role: 'outputExchange',
    };
    mockGenLifeCycleModelJsonOrdered.mockImplementationOnce(() => {
      throw new MockMissingLifeCycleModelFlowVersionError(details);
    });

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(mockNormalizeLangPayloadForSave).not.toHaveBeenCalled();
    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: 'MISSING_FLOW_VERSION',
      message: 'Missing Flow dataset version for outputExchange.@version',
      details,
    });
  });

  it('does not mask unexpected serialization errors', async () => {
    mockGenLifeCycleModelJsonOrdered.mockImplementationOnce(() => {
      throw new Error('unexpected serialization failure');
    });

    await expect(
      lifeCycleModelsApi.createLifeCycleModel({
        id: sampleModelId,
        model: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow('unexpected serialization failure');
  });

  it('returns a targeted Flow version error when structured details are unavailable', async () => {
    mockGenLifeCycleModelJsonOrdered.mockImplementationOnce(() => {
      throw {
        code: 'MISSING_FLOW_VERSION',
        message: 'Missing Flow dataset version',
      };
    });

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'MISSING_FLOW_VERSION',
      message: 'Missing Flow dataset version',
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected lifecycle model creation to fail');
    }
    expect(result.details).toBeUndefined();
  });

  it('returns a language validation error when normalization fails', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { ignored: true },
      validationError: 'Invalid multilingual payload',
    });

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Invalid multilingual payload',
    });
  });

  it('builds a create bundle plan and invokes the save endpoint', async () => {
    const secondaryProcessId = '33333333-3333-3333-3333-333333333333';
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(
      buildLifecycleModelJsonOrdered(['included-primary']),
    );
    mockCreateTidasLifeCycleModel.mockReturnValueOnce({
      validateEnhanced: jest.fn().mockReturnValue({
        success: false,
        error: {
          issues: [{ path: ['lifeCycleModelDataSet', 'name'] }, { path: ['validation'] }],
        },
      }),
    });
    mockGenLifeCycleModelProcesses.mockImplementationOnce(
      async (_id: string, _nodes: any[], json) => {
        json.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes.processInstance[0].connections =
          [];
        return {
          lifeCycleModelProcesses: [
            {
              option: 'create',
              modelInfo: { id: sampleProcessId, type: 'primary', finalId: {} },
              data: { processDataSet: buildProcessDataSet() },
            },
            {
              modelInfo: { id: secondaryProcessId, type: 'secondary', finalId: {} },
              refProcesses: {
                id: '44444444-4444-4444-4444-444444444444',
                version: sampleVersion,
                'common:shortDescription': [
                  { '@xml:lang': 'en', '#text': 'Secondary Ref Process' },
                ],
              },
              data: { processDataSet: buildProcessDataSet() },
            },
          ],
          up2DownEdges: [
            {
              upstreamNodeId: 'node-a',
              downstreamNodeId: 'node-b',
              flowUUID: 'flow-1',
              isBalanced: false,
              unbalancedAmount: 2,
              exchangeAmount: 5,
            },
          ],
        };
      },
    );
    const edgePayload = buildSaveResult({
      lifecycleModel: {
        id: sampleModelId,
        version: sampleVersion,
        json: {},
        json_tg: {
          submodels: [
            { id: sampleProcessId, version: sampleVersion },
            { id: secondaryProcessId, version: sampleVersion },
          ],
        },
        ruleVerification: false,
      },
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));
    mockValidateDatasetRuleVerification
      .mockResolvedValueOnce({ ruleVerification: false })
      .mockResolvedValue({ ruleVerification: true });

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: {
        nodes: [],
        edges: [
          {
            source: { cell: 'node-a' },
            target: { cell: 'node-b' },
            data: { connection: { outputExchange: { '@flowUUID': 'flow-1' } } },
          },
        ],
      },
    });

    const [, request] = mockFunctionsInvoke.mock.calls[0];
    const body = request.body;
    const primaryMutation = body.processMutations.find((item: any) => item.id === sampleProcessId);
    const secondaryMutation = body.processMutations.find(
      (item: any) => item.id === secondaryProcessId,
    );

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'save_lifecycle_model_bundle',
      expect.objectContaining({
        headers: { Authorization: `Bearer ${sampleAccessToken}` },
        region: expect.any(String),
      }),
    );
    expect(body.mode).toBe('create');
    expect(body.modelId).toBe(sampleModelId);
    expect(body.parent.ruleVerification).toBe(false);
    expect(body.parent.jsonTg.submodels).toEqual([
      { id: sampleProcessId, type: 'primary', finalId: {}, version: sampleVersion },
      { id: secondaryProcessId, type: 'secondary', finalId: {}, version: sampleVersion },
    ]);
    expect(
      body.parent.jsonOrdered.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
        .processInstance[0].connections,
    ).toEqual([]);
    expect(body.parent.jsonTg.xflow.edges).toEqual([
      expect.objectContaining({
        labels: [],
        data: expect.objectContaining({
          connection: expect.objectContaining({
            isBalanced: false,
            unbalancedAmount: 2,
            exchangeAmount: 5,
          }),
        }),
      }),
    ]);
    expect(primaryMutation).toMatchObject({
      op: 'create',
      id: sampleProcessId,
      modelId: sampleModelId,
    });
    expect(
      primaryMutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([{ '@refObjectId': 'included-primary' }]);
    expect(secondaryMutation).toMatchObject({
      op: 'create',
      id: secondaryProcessId,
      modelId: sampleModelId,
    });
    expect(
      secondaryMutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([
      expect.objectContaining({
        '@refObjectId': '44444444-4444-4444-4444-444444444444',
        '@version': sampleVersion,
      }),
    ]);
    expect(result).toEqual(edgePayload);
  });

  it('surfaces plan-building errors when a generated process payload is invalid', async () => {
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [
        {
          modelInfo: { id: sampleProcessId, type: 'primary', finalId: {} },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
      up2DownEdges: [],
    });
    mockNormalizeLangPayloadForSave
      .mockResolvedValueOnce({
        payload: buildLifecycleModelJsonOrdered(),
        validationError: undefined,
      })
      .mockResolvedValueOnce({
        payload: { ignored: true },
        validationError: 'Generated process payload is invalid',
      });

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Generated process payload is invalid',
    });
  });

  it('uses raw normalized fallbacks and default empty model arrays during create', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
    });

    expect(mockGenLifeCycleModelProcesses).toHaveBeenCalledWith(sampleModelId, [], rawJson, []);
    expect(mockGenReferenceToResultingProcess).toHaveBeenCalledWith([], sampleVersion, rawJson);
    expect(mockValidateDatasetRuleVerification.mock.calls[0]?.[0]).toBe('lifeCycleModel data set');
    expect(mockValidateDatasetRuleVerification.mock.calls[0]?.[2]).toBe('');
    expect(mockFunctionsInvoke.mock.calls[0][1].body).toMatchObject({
      mode: 'create',
      modelId: sampleModelId,
      parent: {
        jsonOrdered: rawJson,
      },
      processMutations: [],
    });
    expect(result).toEqual(edgePayload);
  });

  it('uses the hydrated graph for calculation and the reconciled graph for create persistence', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    const runtimeGraph = {
      nodes: [
        {
          id: 'node-a',
          data: { id: sampleProcessId, version: sampleVersion, quantitativeReference: '1' },
          ports: { items: [{ id: 'OUTPUT:flow-a' }] },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a', port: 'OUTPUT:flow-a' },
          target: { cell: 'node-b', port: 'INPUT:flow-a' },
        },
      ],
    };
    const persistenceGraph = {
      nodes: [{ id: 'node-a', data: { id: sampleProcessId, version: sampleVersion } }],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
        },
      ],
    };
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.createLifeCycleModel(
      { id: sampleModelId, model: runtimeGraph },
      { persistenceGraph },
    );

    expect(mockGenLifeCycleModelProcesses).toHaveBeenCalledWith(
      sampleModelId,
      runtimeGraph.nodes,
      rawJson,
      [],
    );
    expect(mockFunctionsInvoke.mock.calls[0][1].body.parent.jsonTg.xflow).toEqual({
      nodes: persistenceGraph.nodes,
      edges: [
        expect.objectContaining({
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
        }),
      ],
    });
    expect(result).toEqual(edgePayload);
  });

  it('passes allocateVersion metadata when creating a lifecycle model version', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult({
      version: '01.00.001',
      lifecycleModel: {
        id: sampleModelId,
        version: '01.00.001',
        json: {},
        json_tg: { submodels: [] },
        ruleVerification: true,
      },
    });
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: rawJson,
      validationError: undefined,
    });
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.createLifeCycleModel(
      {
        id: sampleModelId,
        model: { nodes: [], edges: [] },
      },
      undefined,
      { sourceVersion: '01.00.000' },
    );

    expect(mockFunctionsInvoke.mock.calls[0][1].body).toMatchObject({
      mode: 'create',
      modelId: sampleModelId,
      allocateVersion: true,
      sourceVersion: '01.00.000',
    });
    expect(result).toEqual(edgePayload);
  });

  it('reports CALCULATION_CANCELLED and skips persistence when the create operation is cancelled', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });

    // 持久化前复核取消：整条操作已取消则不发起保存
    const result = await lifeCycleModelsApi.createLifeCycleModel(
      { id: sampleModelId, model: { nodes: [], edges: [] } },
      { operation: { isCancelled: () => true, beginStage: jest.fn() } as any },
    );

    expect(result).toMatchObject({ ok: false, code: 'CALCULATION_CANCELLED' });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('advances the create operation to the persisting stage before saving', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));
    const operation = { isCancelled: () => false, beginStage: jest.fn() };

    const result = await lifeCycleModelsApi.createLifeCycleModel(
      { id: sampleModelId, model: { nodes: [], edges: [] } },
      { operation: operation as any },
    );

    expect(operation.beginStage).toHaveBeenCalledWith('persisting');
    expect(result).toEqual(edgePayload);
  });

  it('rethrows unexpected calculation errors that are not calculation failures', async () => {
    // 非计算错误（如编程错误）不折算成 mutation result，直接向上抛出
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockRejectedValueOnce(new TypeError('boom'));

    await expect(
      lifeCycleModelsApi.createLifeCycleModel(
        { id: sampleModelId, model: { nodes: [], edges: [] } },
        undefined,
      ),
    ).rejects.toThrow('boom');
  });
});

describe('updateLifeCycleModel', () => {
  it.each([true, false])(
    'recovers legacy primary membership using its exact standard reference (explicit version: %s)',
    async (explicitVersion) => {
      const storedJson: any = buildLifecycleModelJsonOrdered();
      storedJson.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.referenceToResultingProcess =
        { '@refObjectId': 'result', '@version': sampleVersion };
      mockFrom.mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              json: storedJson,
              submodels: [{ id: 'result', ...(explicitVersion ? { version: sampleVersion } : {}) }],
            },
          ],
          error: null,
        }),
      );
      mockFrom.mockReturnValueOnce(
        createQueryBuilder({
          data: [
            { id: 'result', version: sampleVersion, model_id: sampleModelId, model_version: null },
          ],
          error: null,
        }),
      );
      mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(buildSaveResult()));
      await lifeCycleModelsApi.updateLifeCycleModel({
        id: sampleModelId,
        version: sampleVersion,
        model: { nodes: [], edges: [] },
      });
      expect(mockGenLifeCycleModelProcesses.mock.calls[0][3][0]).toMatchObject({
        id: 'result',
        type: 'primary',
      });
      expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects conflicting result roles without calculating or writing', async () => {
    const storedJson: any = buildLifecycleModelJsonOrdered();
    storedJson.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.referenceToResultingProcess =
      { '@refObjectId': 'result', '@version': sampleVersion };
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            json: storedJson,
            submodels: [{ id: 'result', version: sampleVersion, type: 'secondary' }],
          },
        ],
        error: null,
      }),
    );
    expect(
      await lifeCycleModelsApi.updateLifeCycleModel({ id: sampleModelId, version: sampleVersion }),
    ).toMatchObject({ ok: false, code: 'RESULT_IDENTITY_AMBIGUOUS' });
    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('rejects null current result readback without sending a mutation', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: [{ id: 'result', version: sampleVersion, type: 'primary' }] }],
        error: null,
      }),
    );
    mockFrom.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));
    expect(
      await lifeCycleModelsApi.updateLifeCycleModel({ id: sampleModelId, version: sampleVersion }),
    ).toMatchObject({ ok: false, code: 'PROCESS_NOT_FOUND' });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it.each(['independent-result', sampleModelId])(
    'preserves the declared result %s at its own version when UI membership is absent',
    async (resultId) => {
      const resultVersion = '08.00.000';
      const storedJson: any = buildLifecycleModelJsonOrdered();
      storedJson.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.referenceToResultingProcess =
        {
          '@refObjectId': resultId,
          '@version': resultVersion,
          '@type': 'process data set',
        };
      mockFrom.mockReturnValueOnce(
        createQueryBuilder({ data: [{ json: storedJson, submodels: [] }], error: null }),
      );
      const processQuery = createQueryBuilder({
        data: [
          {
            id: resultId,
            version: resultVersion,
            model_id: sampleModelId,
            model_version: sampleVersion,
            json: { processDataSet: buildProcessDataSet() },
          },
        ],
        error: null,
      });
      mockFrom.mockReturnValueOnce(processQuery);
      mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
        lifeCycleModelProcesses: [
          {
            option: 'update',
            modelInfo: { id: resultId, version: resultVersion, type: 'primary' },
            data: { processDataSet: buildProcessDataSet() },
          },
        ],
        up2DownEdges: [],
      });
      mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(buildSaveResult()));
      await lifeCycleModelsApi.updateLifeCycleModel({
        id: sampleModelId,
        version: sampleVersion,
        model: { nodes: [], edges: [] },
      });
      expect(mockGenLifeCycleModelProcesses.mock.calls[0][3]).toEqual([
        { id: resultId, version: resultVersion, type: 'primary' },
      ]);
      expect(processQuery.or).toHaveBeenCalledWith(
        `and(id.eq.${resultId},version.eq.${resultVersion})`,
      );
      expect(mockFunctionsInvoke.mock.calls[0][1].body.processMutations).toEqual([
        expect.objectContaining({ op: 'update', id: resultId, version: resultVersion }),
      ]);
    },
  );

  it.each(['missing', 'external', 'other-model-version', 'lookup-error'])(
    'refuses %s result membership without sending a bundle mutation',
    async (scenario) => {
      mockFrom.mockReturnValueOnce(
        createQueryBuilder({
          data: [{ submodels: [{ id: 'old-result', version: '08.00.000', type: 'primary' }] }],
          error: null,
        }),
      );
      mockFrom.mockReturnValueOnce(
        createQueryBuilder({
          data:
            scenario === 'missing'
              ? []
              : [
                  {
                    id: 'old-result',
                    version: '08.00.000',
                    model_id: scenario === 'external' ? null : sampleModelId,
                    model_version: scenario === 'other-model-version' ? '09.00.000' : sampleVersion,
                  },
                ],
          error: scenario === 'lookup-error' ? { message: 'unavailable' } : null,
        }),
      );
      const result = await lifeCycleModelsApi.updateLifeCycleModel({
        id: sampleModelId,
        version: sampleVersion,
        model: { nodes: [], edges: [] },
      });
      expect(result).toMatchObject({
        ok: false,
        code: scenario === 'lookup-error' ? 'PROCESS_LOOKUP_FAILED' : 'PROCESS_NOT_FOUND',
      });
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    },
  );

  it('refuses ambiguous standard result references before calculation or writes', async () => {
    const storedJson: any = buildLifecycleModelJsonOrdered();
    storedJson.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.referenceToResultingProcess =
      [
        { '@refObjectId': 'one', '@version': sampleVersion },
        { '@refObjectId': 'two', '@version': sampleVersion },
      ];
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({ data: [{ json: storedJson, submodels: [] }], error: null }),
    );
    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });
    expect(result).toMatchObject({ ok: false, code: 'RESULT_IDENTITY_AMBIGUOUS' });
    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('returns a targeted Flow version error before querying the current model', async () => {
    const details = {
      edgeId: 'edge-2',
      fieldPath: 'outputExchange.downstreamProcess.@version',
      flowUUID: 'flow-2',
      role: 'downstreamProcess',
    };
    mockGenLifeCycleModelJsonOrdered.mockImplementationOnce(() => {
      throw new MockMissingLifeCycleModelFlowVersionError(details);
    });

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'MISSING_FLOW_VERSION',
      details,
    });
  });

  it('returns MODEL_LOOKUP_FAILED when the current lifecycle model query errors', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: null,
        error: { message: 'lookup failed' },
      }),
    );

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'MODEL_LOOKUP_FAILED',
      message: 'Failed to load lifecycle model before saving',
      details: { message: 'lookup failed' },
    });
  });

  it('returns a language validation error before invoking the save endpoint', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: [] }],
        error: null,
      }),
    );
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { ignored: true },
      validationError: 'Update payload is invalid',
    });

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Update payload is invalid',
    });
  });

  it('returns model-not-found when the current lifecycle model snapshot is missing', async () => {
    mockFrom.mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'MODEL_NOT_FOUND',
      message: 'Lifecycle model not found',
    });
  });

  it('builds delete, update, and create mutations for the bundle save endpoint', async () => {
    const oldSubmodels = [
      {
        id: 'old-secondary-keep',
        type: 'secondary',
        finalId: {
          nodeId: 'node-keep',
          processId: 'proc-keep',
          allocatedExchangeDirection: 'input',
          allocatedExchangeFlowId: 'flow-keep',
        },
      },
      {
        id: 'old-secondary-delete',
        type: 'secondary',
        finalId: {
          nodeId: 'node-delete',
          processId: 'proc-delete',
          allocatedExchangeDirection: 'output',
          allocatedExchangeFlowId: 'flow-delete',
        },
      },
    ];
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: oldSubmodels }],
        error: null,
      }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(
      buildLifecycleModelJsonOrdered(['included-primary']),
    );
    mockGenLifeCycleModelProcesses.mockImplementationOnce(
      async (_id: string, _nodes: any[], json) => {
        json.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes.processInstance[0].connections =
          [];
        return {
          lifeCycleModelProcesses: [
            {
              option: 'update',
              modelInfo: {
                id: 'old-secondary-keep',
                type: 'primary',
                finalId: oldSubmodels[0].finalId,
              },
              data: { processDataSet: buildProcessDataSet() },
            },
            {
              option: 'create',
              modelInfo: {
                id: 'new-secondary-id',
                type: 'secondary',
                finalId: {
                  nodeId: 'node-new',
                  processId: 'proc-new',
                  allocatedExchangeDirection: 'output',
                  allocatedExchangeFlowId: 'flow-new',
                },
              },
              refProcesses: [
                {
                  id: '55555555-5555-5555-5555-555555555555',
                  version: sampleVersion,
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Secondary Ref 2' }],
                },
              ],
              data: { processDataSet: buildProcessDataSet() },
            },
          ],
          up2DownEdges: [],
        };
      },
    );
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: 'old-secondary-keep',
            model_id: sampleModelId,
            model_version: sampleVersion,
            version: sampleVersion,
            json: {
              processDataSet: {
                ...buildProcessDataSet(),
                processInformation: {
                  dataSetInformation: {
                    identifierOfSubDataSet: 'legacy-id',
                  },
                  technology: {},
                },
              },
            },
          },
          {
            id: 'old-secondary-delete',
            version: sampleVersion,
            model_id: sampleModelId,
            model_version: sampleVersion,
          },
        ],
        error: null,
      }),
    );
    const edgePayload = buildSaveResult();
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    const [, request] = mockFunctionsInvoke.mock.calls[0];
    const body = request.body;
    const deleteMutation = body.processMutations.find(
      (item: any) => item.id === 'old-secondary-delete',
    );
    const updateMutation = body.processMutations.find(
      (item: any) => item.id === 'old-secondary-keep',
    );
    const createMutation = body.processMutations.find(
      (item: any) => item.id === 'new-secondary-id',
    );

    expect(body.mode).toBe('update');
    expect(body.version).toBe(sampleVersion);
    expect(
      body.parent.jsonOrdered.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
        .processInstance[0].connections,
    ).toEqual([]);
    expect(deleteMutation).toEqual({
      op: 'delete',
      id: 'old-secondary-delete',
      version: sampleVersion,
    });
    expect(updateMutation).toMatchObject({
      op: 'update',
      id: 'old-secondary-keep',
      version: sampleVersion,
      modelId: sampleModelId,
    });
    expect(
      updateMutation.jsonOrdered.processDataSet.processInformation.dataSetInformation
        .identifierOfSubDataSet,
    ).toBe('legacy-id');
    expect(
      updateMutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([{ '@refObjectId': 'included-primary' }]);
    expect(createMutation).toMatchObject({
      op: 'create',
      id: 'new-secondary-id',
      modelId: sampleModelId,
    });
    expect(
      createMutation.jsonOrdered.processDataSet.processInformation.technology
        .referenceToIncludedProcesses,
    ).toEqual([
      expect.objectContaining({
        '@refObjectId': '55555555-5555-5555-5555-555555555555',
        '@version': sampleVersion,
      }),
    ]);
    expect(result).toEqual(edgePayload);
  });

  it('returns plan errors from save-plan generation during updates', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: [] }],
        error: null,
      }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [
        {
          option: 'create',
          modelInfo: { id: sampleProcessId, type: 'primary', finalId: {} },
          data: { processDataSet: buildProcessDataSet() },
        },
      ],
      up2DownEdges: [],
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce({
      data: [],
    });
    mockNormalizeLangPayloadForSave
      .mockResolvedValueOnce({
        payload: buildLifecycleModelJsonOrdered(),
        validationError: undefined,
      })
      .mockResolvedValueOnce({
        payload: { ignored: true },
        validationError: 'Updated process payload is invalid',
      });

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'Updated process payload is invalid',
    });
  });

  it('uses raw normalized fallbacks and empty legacy collections during update', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: undefined }],
        error: null,
      }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce(undefined as any);
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
    });

    expect(mockGenLifeCycleModelProcesses).toHaveBeenCalledWith(sampleModelId, [], rawJson, []);
    expect(mockGetProcessDetailByIdsAndVersion).not.toHaveBeenCalled();
    expect(mockValidateDatasetRuleVerification.mock.calls[0]?.[0]).toBe('lifeCycleModel data set');
    expect(mockValidateDatasetRuleVerification.mock.calls[0]?.[2]).toBe('');
    expect(mockFunctionsInvoke.mock.calls[0][1].body).toMatchObject({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      parent: {
        jsonOrdered: rawJson,
      },
      processMutations: [],
    });
    expect(result).toEqual(edgePayload);
  });

  it('uses the hydrated graph for calculation and the reconciled graph for update persistence', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    const runtimeGraph = {
      nodes: [
        {
          id: 'node-a',
          data: { id: sampleProcessId, version: sampleVersion, quantitativeReference: '1' },
          ports: { items: [{ id: 'OUTPUT:flow-a' }] },
        },
      ],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a', port: 'OUTPUT:flow-a' },
          target: { cell: 'node-b', port: 'INPUT:flow-a' },
        },
      ],
    };
    const persistenceGraph = {
      nodes: [{ id: 'node-a', data: { id: sampleProcessId, version: sampleVersion } }],
      edges: [
        {
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
        },
      ],
    };
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: [] }],
        error: null,
      }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce({ data: [] });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModel(
      { id: sampleModelId, version: sampleVersion, model: runtimeGraph },
      { persistenceGraph },
    );

    expect(mockGenLifeCycleModelProcesses).toHaveBeenCalledWith(
      sampleModelId,
      runtimeGraph.nodes,
      rawJson,
      [],
    );
    expect(mockFunctionsInvoke.mock.calls[0][1].body.parent.jsonTg.xflow).toEqual({
      nodes: persistenceGraph.nodes,
      edges: [
        expect.objectContaining({
          id: 'edge-a',
          source: { cell: 'node-a' },
          target: { cell: 'node-b' },
        }),
      ],
    });
    expect(result).toEqual(edgePayload);
  });

  it('reports CALCULATION_CANCELLED and skips persistence when the update operation is cancelled', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({ data: [{ submodels: undefined }], error: null }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce(undefined as any);

    // 持久化前复核取消：整条操作已取消则不发起保存
    const result = await lifeCycleModelsApi.updateLifeCycleModel(
      { id: sampleModelId, version: sampleVersion },
      { operation: { isCancelled: () => true, beginStage: jest.fn() } as any },
    );

    expect(result).toMatchObject({ ok: false, code: 'CALCULATION_CANCELLED' });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('advances the update operation to the persisting stage before saving', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({ data: [{ submodels: undefined }], error: null }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce(undefined as any);
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));
    const operation = { isCancelled: () => false, beginStage: jest.fn() };

    const result = await lifeCycleModelsApi.updateLifeCycleModel(
      { id: sampleModelId, version: sampleVersion },
      { operation: operation as any },
    );

    expect(operation.beginStage).toHaveBeenCalledWith('persisting');
    expect(result).toEqual(edgePayload);
  });
});

describe('updateLifeCycleModelJsonApi', () => {
  it('returns MODEL_LOOKUP_FAILED when the current lifecycle model query errors', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: null,
        error: { message: 'model lookup failed' },
      }),
    );

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      {},
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'MODEL_LOOKUP_FAILED',
      message: 'Failed to load lifecycle model before review update',
      details: { message: 'model lookup failed' },
    });
  });

  it('returns a language validation error before loading current process snapshots', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { ignored: true },
      validationError: 'JSON payload is invalid',
    });

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      { raw: true },
    );

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'LANG_VALIDATION_ERROR',
      message: 'JSON payload is invalid',
    });
  });

  it('returns model-not-found when the current lifecycle model cannot be loaded', async () => {
    mockFrom.mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      {},
    );

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'MODEL_NOT_FOUND',
      message: 'Lifecycle model not found',
    });
  });

  it('returns PROCESS_LOOKUP_FAILED when the current submodel process query errors', async () => {
    mockFrom
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              json_tg: {
                submodels: [{ id: sampleProcessId, version: sampleVersion }],
              },
              rule_verification: true,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          data: null,
          error: { message: 'process lookup failed' },
        }),
      );

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      {
        lifeCycleModelDataSet: {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [] },
            validation: { review: [] },
          },
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'PROCESS_LOOKUP_FAILED',
      message: 'Failed to load current submodel processes before review update',
      details: { message: 'process lookup failed' },
    });
  });

  it('returns INVALID_PAYLOAD when a referenced submodel snapshot is missing', async () => {
    mockFrom
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              json_tg: {
                submodels: [{ id: sampleProcessId, version: sampleVersion }],
              },
              rule_verification: true,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [],
          error: null,
        }),
      );

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      {
        lifeCycleModelDataSet: {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [] },
            validation: { review: [] },
          },
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: `Missing current process snapshot for submodel ${sampleProcessId}`,
    });
  });

  it('saves successfully when the current lifecycle model has no submodels', async () => {
    const edgePayload = buildSaveResult();
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            json_tg: {},
            rule_verification: true,
          },
        ],
        error: null,
      }),
    );
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      {
        lifeCycleModelDataSet: {
          modellingAndValidation: {
            complianceDeclarations: { compliance: [] },
            validation: { review: [] },
          },
        },
      },
    );

    const [, request] = mockFunctionsInvoke.mock.calls[0];
    expect(request.body.processMutations).toEqual([]);
    expect(result).toEqual(edgePayload);
  });

  it('builds a review update bundle plan and merges comment data into submodels', async () => {
    mockFrom
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              json_tg: {
                submodels: [{ id: sampleProcessId, version: sampleVersion }],
              },
              rule_verification: false,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              id: sampleProcessId,
              version: sampleVersion,
              json_ordered: {
                processDataSet: {
                  ...buildProcessDataSet(),
                  modellingAndValidation: {
                    complianceDeclarations: { compliance: [{ id: 'legacy-compliance' }] },
                    validation: { review: [{ id: 'legacy-review' }] },
                  },
                },
              },
              rule_verification: true,
            },
          ],
          error: null,
        }),
      );
    const edgePayload = buildSaveResult({
      lifecycleModel: {
        id: sampleModelId,
        version: sampleVersion,
        json: {},
        json_tg: {
          submodels: [{ id: sampleProcessId, version: sampleVersion }],
        },
        ruleVerification: false,
      },
    });
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const payload = {
      lifeCycleModelDataSet: {
        modellingAndValidation: {
          complianceDeclarations: { compliance: [{ id: 'model-compliance' }] },
          validation: { review: [{ id: 'model-review' }] },
        },
      },
    };

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      payload,
      {
        commentReview: [{ id: 'assigned-review' }],
        commentCompliance: [{ id: 'assigned-compliance' }],
      },
    );

    const [, request] = mockFunctionsInvoke.mock.calls[0];
    const body = request.body;
    const processMutation = body.processMutations[0];

    expect(body.mode).toBe('update');
    expect(body.modelId).toBe(sampleModelId);
    expect(body.version).toBe(sampleVersion);
    expect(body.parent).toEqual({
      jsonOrdered: payload,
      jsonTg: {
        submodels: [{ id: sampleProcessId, version: sampleVersion }],
      },
      ruleVerification: false,
    });
    expect(processMutation).toMatchObject({
      op: 'update',
      id: sampleProcessId,
      version: sampleVersion,
      modelId: sampleModelId,
      ruleVerification: true,
    });
    expect(
      processMutation.jsonOrdered.processDataSet.modellingAndValidation.validation.review,
    ).toEqual([{ id: 'model-review' }, { id: 'assigned-review' }]);
    expect(
      processMutation.jsonOrdered.processDataSet.modellingAndValidation.complianceDeclarations
        .compliance,
    ).toEqual([{ id: 'model-compliance' }, { id: 'assigned-compliance' }]);
    expect(result).toEqual(edgePayload);
  });

  it('uses raw review payloads and treats missing current rule verification as passed', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    const edgePayload = buildSaveResult();
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce(undefined as any);
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ json_tg: undefined, rule_verification: undefined }],
        error: null,
      }),
    );
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      rawJson,
    );

    expect(mockFunctionsInvoke.mock.calls[0][1].body).toEqual({
      mode: 'update',
      modelId: sampleModelId,
      version: sampleVersion,
      parent: {
        jsonOrdered: rawJson,
        jsonTg: {},
        ruleVerification: true,
      },
      processMutations: [],
    });
    expect(result).toEqual(edgePayload);
  });

  it('treats missing current process query data as an empty array before building the review plan', async () => {
    mockFrom
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [
            {
              json_tg: { submodels: [{ id: 'missing-process' }] },
              rule_verification: true,
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          data: undefined,
          error: null,
        }),
      );

    const result = await lifeCycleModelsApi.updateLifeCycleModelJsonApi(
      sampleModelId,
      sampleVersion,
      buildLifecycleModelJsonOrdered(),
    );

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: 'Missing current process snapshot for submodel missing-process',
    });
  });
});

describe('getLifeCyclesByIdAndVersion', () => {
  it('returns an empty data array when no id/version pairs are provided', async () => {
    const result = await lifeCycleModelsApi.getLifeCyclesByIdAndVersion([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [] });
  });

  it('builds OR conditions for lifecycle model id/version pairs', async () => {
    const builder = createQueryBuilder({
      data: [{ id: sampleModelId, version: sampleVersion }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await lifeCycleModelsApi.getLifeCyclesByIdAndVersion([
      { id: sampleModelId, version: sampleVersion },
      { id: '33333333-3333-3333-3333-333333333333', version: '02.00.000' },
    ]);

    expect(mockFrom).toHaveBeenCalledWith('lifecyclemodels');
    expect(builder.or).toHaveBeenCalledWith(
      `and(id.eq.${sampleModelId},version.eq.${sampleVersion}),and(id.eq.33333333-3333-3333-3333-333333333333,version.eq.02.00.000)`,
    );
    expect(result).toEqual({
      data: [{ id: sampleModelId, version: sampleVersion }],
      error: null,
    });
  });
});

describe('table/search helpers', () => {
  it('applies co filters with a concrete team id', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      { modified_at: 'descend' } as any,
      'en',
      'co',
      'team-234',
    );

    expect(builder.eq).toHaveBeenCalledWith('state_code', 200);
    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-234');
  });

  it('applies the current user filter for my-data table queries with an active session', async () => {
    const builder = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'my',
      '',
      30,
    );

    expect(builder.eq).toHaveBeenCalledWith('state_code', 30);
    expect(builder.eq).toHaveBeenCalledWith('user_id', sampleUserId);
  });

  it('applies tg filters with a concrete team id', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      { modified_at: 'ascend' } as any,
      'en',
      'tg',
      'team-123',
    );

    expect(builder.eq).toHaveBeenCalledWith('state_code', 100);
    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-123');
  });

  it('returns a failed empty result for my-data queries without a session', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce(createMockNoSession());

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'my',
      '',
      20,
    );

    expect(result).toEqual({
      data: [],
      success: false,
    });
  });

  it('returns an empty success result for team-data queries without a team id', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockGetTeamIdByUserId.mockResolvedValueOnce(undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'te',
      '',
    );

    expect(result).toEqual({
      data: [],
      success: true,
    });
  });

  it('applies the resolved team id for team-data queries', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockGetTeamIdByUserId.mockResolvedValueOnce('team-te');

    await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'te',
      '',
    );

    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-te');
  });

  it('returns a failed empty result when the lifecycle model table query returns no data', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: undefined,
        error: { message: 'query failed' },
        count: null,
      }),
    );
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'tg',
      '',
    );

    expect(consoleSpy).toHaveBeenCalledWith('error', { message: 'query failed' });
    expect(result).toEqual({
      data: [],
      success: false,
    });
    consoleSpy.mockRestore();
  });

  it('falls back to a bare id row when zh classification mapping throws', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: sampleModelId,
            name: {},
            'common:class': [{ id: 'class-1' }],
            'common:generalComment': {},
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
        error: null,
        count: 1,
      }),
    );
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('classification parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'zh',
      'tg',
      '',
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('maps zh lifecycle model table search rows when classification resolution succeeds', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: sampleModelId,
            name: {},
            'common:class': [{ id: 'class-1' }],
            'common:generalComment': {},
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
        error: null,
        count: 1,
      }),
    );
    mockGenClassificationZH.mockReturnValueOnce(['zh-classification']);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'zh',
      'tg',
      '',
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        id: sampleModelId,
        classification: 'classification-string',
      }),
    ]);
  });

  it('uses zh table fallbacks for missing row fields and undefined classification output', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: sampleModelId,
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
        error: null,
        count: 1,
      }),
    );
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'zh',
      'tg',
      '',
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'zh');
    expect(mockGetLangText).toHaveBeenCalledWith(undefined, 'zh');
    expect(mockClassificationToString).toHaveBeenCalledWith({});
    expect(result.data).toEqual([
      expect.objectContaining({
        id: sampleModelId,
        classification: 'classification-string',
      }),
    ]);
  });

  it('uses table fallbacks for missing english row fields and count metadata', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleModelId,
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
        },
      ],
      error: null,
      count: undefined,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      {},
      {} as any,
      'en',
      'tg',
      '',
    );

    expect(builder.order).toHaveBeenCalledWith('modified_at', { ascending: false });
    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith(undefined, 'en');
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('falls back to a bare id row when english classification parsing throws', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: sampleModelId,
            name: {},
            'common:class': [{ id: 'class-1' }],
            'common:generalComment': {},
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
        error: null,
        count: 1,
      }),
    );
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('english classification parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTableAll(
      { current: 1, pageSize: 10 },
      {} as any,
      'en',
      'tg',
      '',
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('calls the pgroonga lifecycle model search with state_code and handles empty results', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 2, pageSize: 5 },
      'en',
      'my',
      'keyword',
      { filter: true },
      20,
      { key: 'baseName', lang: 'en', order: 'desc' },
    );

    expect(mockRpc).toHaveBeenCalledWith('search_lifecyclemodels', {
      query_text: 'keyword',
      filter_condition: { filter: true },
      page_size: 5,
      page_current: 2,
      data_source: 'my',
      state_code_filter: 20,
      team_id_filter: null,
      this_user_id: 'user-0001',
    });
    expect(result).toEqual({
      data: [],
      success: true,
    });
  });

  it('ignores unsupported sorting and maps missing cache and version fallbacks', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          total_count: 1,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {},
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGetCachedClassificationData.mockResolvedValueOnce(undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'systems',
      {},
      undefined,
      { key: 'baseName', order: 'desc' },
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_lifecyclemodels',
      expect.not.objectContaining({ order_by: expect.anything() }),
    );
    expect(mockGenClassificationZH).toHaveBeenCalledWith([], []);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: sampleModelId,
        version: '',
      }),
    ]);
  });

  it.each(['de', 'fr'] as const)(
    'loads %s lifecycle-model classifications without sending an RPC sort payload',
    async (lang) => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: sampleModelId,
            version: sampleVersion,
            total_count: 1,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ '#text': 'Systems' }],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
        error: null,
      });

      await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
        { current: 1, pageSize: 10 },
        lang,
        'tg',
        'systems',
        {},
        undefined,
        { key: 'baseName', lang, order: 'asc' },
      );

      expect(mockGetCachedClassificationData).toHaveBeenCalledWith('LifeCycleModel', lang, ['all']);
      expect(mockGetLangText).toHaveBeenCalledWith({}, lang);
      expect(mockRpc).toHaveBeenCalledWith(
        'search_lifecyclemodels',
        expect.not.objectContaining({ order_by: expect.anything() }),
      );
    },
  );

  it('uses default pagination values in the numeric state-code pgroonga RPC branch', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      {},
      'en',
      'my',
      'keyword',
      {},
      20,
    );

    expect(mockRpc).toHaveBeenCalledWith('search_lifecyclemodels', {
      query_text: 'keyword',
      filter_condition: {},
      page_size: 10,
      page_current: 1,
      data_source: 'my',
      state_code_filter: 20,
      team_id_filter: null,
      this_user_id: 'user-0001',
    });
  });

  it('logs pgroonga errors and returns the raw response when no data payload is present', async () => {
    mockRpc.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'rpc failed' },
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith('error', { message: 'rpc failed' });
    expect(result).toEqual({
      data: undefined,
      error: { message: 'rpc failed' },
    });
    consoleSpy.mockRestore();
  });

  it('returns empty success when pgroonga team-data search has no resolved team id', async () => {
    mockGetTeamIdByUserId.mockResolvedValueOnce(null);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'te',
      'keyword',
      {},
    );

    expect(result).toEqual({ data: [], success: true });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps zh pgroonga search rows when classification lookup succeeds', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {},
                  'common:generalComment': {},
                  classificationInformation: {
                    'common:classification': {
                      'common:class': [{ id: 'class-1' }],
                    },
                  },
                },
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGenClassificationZH.mockReturnValueOnce(['zh-classification']);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('uses zh pgroonga fallbacks for missing row fields and undefined classification output', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {},
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'zh');
    expect(mockGetLangText).toHaveBeenCalledWith({}, 'zh');
    expect(mockClassificationToString).toHaveBeenCalledWith(undefined);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: sampleModelId,
        classification: 'classification-string',
      }),
    ]);
  });

  it('falls back to a bare id row when zh pgroonga classification mapping throws', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {},
                  'common:generalComment': {},
                  classificationInformation: {
                    'common:classification': {
                      'common:class': [{ id: 'class-1' }],
                    },
                  },
                },
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGenClassificationZH.mockImplementationOnce(() => {
      throw new Error('pgroonga zh parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('maps english pgroonga search rows when classification parsing succeeds', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {},
                  'common:generalComment': {},
                  classificationInformation: {
                    'common:classification': {
                      'common:class': [{ id: 'class-1' }],
                    },
                  },
                },
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
          total_count: 1,
        },
      ],
      error: null,
    });

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('uses pgroonga fallbacks for missing english row fields and total count metadata', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {},
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
        },
      ],
      error: null,
    });

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      {},
      'en',
      'my',
      'keyword',
      {},
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith({}, 'en');
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('falls back to a bare id row when english pgroonga search row parsing throws', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleModelId,
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {},
                  'common:generalComment': {},
                  classificationInformation: {
                    'common:classification': {
                      'common:class': [{ id: 'class-1' }],
                    },
                  },
                },
              },
            },
          },
          version: sampleVersion,
          modified_at: '2026-03-17T10:00:00.000Z',
          team_id: 'team-1',
          total_count: 1,
        },
      ],
      error: null,
    });
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('pgroonga english parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns the raw pgroonga result when there is no session', async () => {
    mockAuthGetSession.mockResolvedValueOnce(createMockNoSession());

    const result = await lifeCycleModelsApi.getLifeCycleModelTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  describe('getLifeCycleModelTableUuidMentionSearch', () => {
    const mentionRow = (overrides: any = {}) => ({
      matched_by: 'json',
      matched_entity_table: 'lifecyclemodels',
      rank: 1,
      total_count: 1,
      source_entity_kind: 'lifecyclemodel',
      source_id: sampleModelId,
      source_json: {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            dataSetInformation: {
              name: {},
              'common:generalComment': {},
              classificationInformation: {
                'common:classification': {
                  'common:class': [{ id: 'class-1' }],
                },
              },
            },
          },
        },
      },
      source_modified_at: '2026-03-17T10:00:00.000Z',
      source_team_id: 'team-1',
      source_version: sampleVersion,
      ...overrides,
    });

    it('maps English reference lookup rows and sparse fallbacks into lifecycle model table rows', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          mentionRow(),
          mentionRow({
            source_id: 'model-sparse',
            source_json: {},
            source_modified_at: undefined,
            source_team_id: undefined,
            source_version: undefined,
          }),
        ],
        error: null,
      });

      const result = await lifeCycleModelsApi.getLifeCycleModelTableUuidMentionSearch(
        { current: 1, pageSize: 10 },
        'en',
        'tg',
        'd1380000-0000-4000-8000-000000000001',
        '100',
        'team-1',
      );

      expect(mockRpc).toHaveBeenCalledWith(
        'search_dataset_uuid_mentions_page',
        expect.objectContaining({
          p_data_source: 'tg',
          p_page_size: 10,
          p_dataset_kind: 'lifecyclemodel',
          p_state_code: 100,
          p_team_id: 'team-1',

          p_uuid: 'd1380000-0000-4000-8000-000000000001',
        }),
      );
      expect(result.data).toEqual([
        {
          key: sampleModelId,
          id: sampleModelId,
          name: 'Life Cycle Model Name',
          generalComment: 'localized-text',
          classification: 'classification-string',
          version: sampleVersion,
          modifiedAt: new Date('2026-03-17T10:00:00.000Z'),
          teamId: 'team-1',
        },
        {
          key: 'model-sparse',
          id: 'model-sparse',
          name: 'Life Cycle Model Name',
          generalComment: 'localized-text',
          classification: 'classification-string',
          version: '',
          modifiedAt: new Date(0),
          teamId: '',
        },
      ]);
    });

    it('maps Chinese reference lookup rows with classification localization', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          mentionRow({ source_id: 'model-zh' }),
          mentionRow({
            source_id: 'model-zh-sparse',
            source_json: {},
            source_modified_at: undefined,
            source_team_id: undefined,
            source_version: undefined,
          }),
        ],
        error: null,
      });
      mockGenClassificationZH.mockReturnValueOnce(['zh-classification']);

      const result = await lifeCycleModelsApi.getLifeCycleModelTableUuidMentionSearch(
        { current: 1, pageSize: 10 },
        'zh',
        'tg',
        'd1380000-0000-4000-8000-000000000001',
      );

      expect(mockGetCachedClassificationData).toHaveBeenCalledWith('LifeCycleModel', 'zh', ['all']);
      expect(result.data[0]).toEqual({
        key: 'model-zh',
        id: 'model-zh',
        name: 'Life Cycle Model Name',
        generalComment: 'localized-text',
        classification: 'classification-string',
        version: sampleVersion,
        modifiedAt: new Date('2026-03-17T10:00:00.000Z'),
        teamId: 'team-1',
      });
      expect(result.data[1]).toEqual({
        key: 'model-zh-sparse',
        id: 'model-zh-sparse',
        name: 'Life Cycle Model Name',
        generalComment: 'localized-text',
        classification: 'classification-string',
        version: '',
        modifiedAt: new Date(0),
        teamId: '',
      });
    });

    it('returns fallback rows when Chinese reference lookup mapping throws', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRpc.mockResolvedValueOnce({
        data: [
          mentionRow({
            source_id: 'model-bad-zh',
            source_modified_at: undefined,
            source_team_id: undefined,
            source_version: undefined,
          }),
        ],
        error: null,
      });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('bad zh lifecycle mention');
      });

      const result = await lifeCycleModelsApi.getLifeCycleModelTableUuidMentionSearch(
        { current: 1, pageSize: 10 },
        'zh',
        'tg',
        'd1380000-0000-4000-8000-000000000001',
      );

      expect(result.data[0]).toEqual({
        id: 'model-bad-zh',
        version: '',
        modifiedAt: new Date(0),
        teamId: '',
        name: '-',
        generalComment: '',
        classification: '',
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns fallback rows when English reference lookup mapping throws', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRpc.mockResolvedValueOnce({
        data: [
          mentionRow({
            source_id: 'model-bad-en',
            source_modified_at: undefined,
            source_team_id: undefined,
            source_version: undefined,
          }),
        ],
        error: null,
      });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('bad en lifecycle mention');
      });

      const result = await lifeCycleModelsApi.getLifeCycleModelTableUuidMentionSearch(
        { current: 1, pageSize: 10 },
        'en',
        'tg',
        'd1380000-0000-4000-8000-000000000001',
      );

      expect(result.data[0]).toEqual({
        id: 'model-bad-en',
        version: '',
        modifiedAt: new Date(0),
        teamId: '',
        name: '-',
        generalComment: '',
        classification: '',
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns empty table data when reference lookup fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'lookup failed' },
      });

      const result = await lifeCycleModelsApi.getLifeCycleModelTableUuidMentionSearch(
        { current: 1, pageSize: 10 },
        'en',
        'tg',
        'd1380000-0000-4000-8000-000000000001',
      );

      expect(mockRpc).toHaveBeenCalledWith(
        'search_dataset_uuid_mentions_page',
        expect.objectContaining({
          p_dataset_kind: 'lifecyclemodel',
          p_team_id: null,
        }),
      );
      expect(result).toEqual({
        capped: false,
        data: [],
        error: 'lookup failed',
        page: 1,
        success: false,
        total: 0,
      });
    });
  });

  it('returns the raw hybrid-search result when there is no session', async () => {
    mockAuthGetSession.mockResolvedValueOnce(createMockNoSession());

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('uses an empty bearer token when the hybrid-search session exists without an access token', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: sampleUserId } } },
    });
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [],
      }),
    );

    await lifeCycleModelsApi.lifeCycleModel_hybrid_search({}, 'en', 'my', 'keyword', {});

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('lifecyclemodel_hybrid_search', {
      headers: {
        Authorization: 'Bearer ',
      },
      body: {
        query: 'keyword',
        filter_condition: {},
        data_source: 'my',
        page_size: 10,
        page_current: 1,
      },
      region: expect.any(String),
    });
  });

  it('calls the lifecycle model hybrid-search function and handles empty data', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [],
      }),
    );

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'keyword',
      { filter: true },
      100,
    );

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('lifecyclemodel_hybrid_search', {
      headers: {
        Authorization: `Bearer ${sampleAccessToken}`,
      },
      body: {
        query: 'keyword',
        filter_condition: { filter: true },
        data_source: 'tg',
        page_size: 10,
        page_current: 1,
        state_code: 100,
      },
      region: expect.any(String),
    });
    expect(result).toEqual({
      data: [],
      success: true,
    });
  });

  it('logs hybrid-search errors and returns the raw response when no data payload is present', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'hybrid failed' },
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith('error', { message: 'hybrid failed' });
    expect(result).toEqual({
      data: undefined,
      error: { message: 'hybrid failed' },
    });
    consoleSpy.mockRestore();
  });

  it('maps zh hybrid-search rows when classification lookup succeeds', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    name: {},
                    'common:generalComment': {},
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ id: 'class-1' }],
                      },
                    },
                  },
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
            total_count: 1,
          },
        ],
      }),
    );
    mockGenClassificationZH.mockReturnValueOnce(['zh-classification']);

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('uses zh hybrid-search fallbacks for missing row fields and undefined classification output', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {},
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
      }),
    );
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'zh');
    expect(mockGetLangText).toHaveBeenCalledWith({}, 'zh');
    expect(mockClassificationToString).toHaveBeenCalledWith(undefined);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: sampleModelId,
        classification: 'classification-string',
      }),
    ]);
  });

  it('falls back to a bare id row when zh hybrid-search classification mapping throws', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    name: {},
                    'common:generalComment': {},
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ id: 'class-1' }],
                      },
                    },
                  },
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
            total_count: 1,
          },
        ],
      }),
    );
    mockGenClassificationZH.mockImplementationOnce(() => {
      throw new Error('hybrid zh parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'zh',
      'my',
      'keyword',
      {},
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('maps english hybrid-search rows when classification parsing succeeds', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    name: {},
                    'common:generalComment': {},
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ id: 'class-1' }],
                      },
                    },
                  },
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
            total_count: 1,
          },
        ],
      }),
    );

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('uses hybrid-search fallbacks for missing english row fields and page metadata', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {},
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
          },
        ],
      }),
    );

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      {},
      'en',
      'my',
      'keyword',
      {},
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith({}, 'en');
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: sampleModelId,
          classification: 'classification-string',
        }),
      ],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('falls back to a bare id row when english hybrid-search row parsing throws', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({
        data: [
          {
            id: sampleModelId,
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    name: {},
                    'common:generalComment': {},
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ id: 'class-1' }],
                      },
                    },
                  },
                },
              },
            },
            version: sampleVersion,
            modified_at: '2026-03-17T10:00:00.000Z',
            team_id: 'team-1',
            total_count: 1,
          },
        ],
      }),
    );
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('hybrid english parsing failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'my',
      'keyword',
      {},
    );

    expect(result.data).toEqual([{ id: sampleModelId }]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('getLifeCycleModelDetail fallbacks', () => {
  it('returns a failed empty payload when no lifecycle model detail row exists', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [],
        error: null,
      }),
    );

    const result = await lifeCycleModelsApi.getLifeCycleModelDetail(sampleModelId, sampleVersion);

    expect(result).toEqual({
      data: {},
      success: false,
    });
  });
});

describe('contributeLifeCycleModel', () => {
  it('returns an error when the current user cannot be resolved', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(undefined);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.contributeLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      error: true,
      message: 'Failed to get current user',
    });
    expect(consoleSpy).toHaveBeenCalledWith('Failed to get current user');
    consoleSpy.mockRestore();
  });

  it('contributes only the lifecycle model itself when there are no local refs to recurse', async () => {
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            json: { id: 'detail-json' },
            json_tg: { submodels: [] },
            state_code: 0,
            rule_verification: true,
            team_id: 'team-1',
          },
        ],
        error: null,
      }),
    );
    mockGetAllRefObj.mockReturnValueOnce([]);

    const result = await lifeCycleModelsApi.contributeLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toEqual({
      success: true,
      needContribute: [
        {
          id: sampleModelId,
          version: sampleVersion,
          type: 'lifeCycleModel data set',
        },
      ],
      contributeResults: [
        {
          success: true,
          data: { success: true },
          id: sampleModelId,
          version: sampleVersion,
          type: 'lifeCycleModel data set',
        },
      ],
    });
    expect(mockContributeSource).toHaveBeenCalledTimes(1);
    expect(mockContributeSource).toHaveBeenCalledWith(
      'lifecyclemodels',
      sampleModelId,
      sampleVersion,
    );
  });

  it('recursively collects local refs, skips duplicates, and preserves contribute failures', async () => {
    const nestedJson = { marker: 'nested-json' };
    mockGetRefTableName.mockImplementation((type: string) => {
      if (type === 'process data set') return 'processes';
      if (type === 'source data set') return 'sources';
      if (type === 'lifeCycleModel data set') return '';
      return '';
    });
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            json: { id: 'detail-json' },
            json_tg: { submodels: [] },
            state_code: 0,
            rule_verification: true,
            team_id: 'team-1',
          },
        ],
        error: null,
      }),
    );
    mockGetAllRefObj.mockImplementation((value: any) => {
      if (value?.success) {
        return [
          {
            '@refObjectId': 'process-ref-a',
            '@version': sampleVersion,
            '@type': 'process data set',
          },
          {
            '@refObjectId': 'process-ref-a',
            '@version': sampleVersion,
            '@type': 'process data set',
          },
          {
            '@refObjectId': 'source-ref-b',
            '@version': sampleVersion,
            '@type': 'source data set',
          },
          {
            '@refObjectId': 'invalid-ref',
            '@version': sampleVersion,
            '@type': 'unknown data set',
          },
          {
            '@refObjectId': 'error-ref',
            '@version': sampleVersion,
            '@type': 'process data set',
          },
        ];
      }
      if (value === nestedJson) {
        return [
          {
            '@refObjectId': 'source-ref-c',
            '@version': sampleVersion,
            '@type': 'source data set',
          },
        ];
      }
      return [];
    });
    mockGetRefData.mockImplementation(async (id: string) => {
      if (id === 'process-ref-a') {
        return {
          success: true,
          data: {
            stateCode: 10,
            userId: sampleUserId,
            json: { orphan: 'no-nested-refs' },
          },
        };
      }
      if (id === 'source-ref-b') {
        return {
          success: true,
          data: {
            stateCode: 100,
            userId: sampleUserId,
            json: nestedJson,
          },
        };
      }
      if (id === 'source-ref-c') {
        return {
          success: true,
          data: {
            stateCode: 10,
            userId: sampleUserId,
            json: null,
          },
        };
      }
      if (id === 'error-ref') {
        throw new Error('ref fetch failed');
      }
      return {
        success: false,
        data: null,
      };
    });
    mockContributeSource.mockImplementation(async (tableName: string, id: string) => {
      if (tableName === 'sources' && id === 'source-ref-c') {
        throw new Error('contribute source failed');
      }
      return { success: true, tableName, id };
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await lifeCycleModelsApi.contributeLifeCycleModel(sampleModelId, sampleVersion);

    expect(result).toMatchObject({
      success: true,
      needContribute: [
        expect.objectContaining({ id: 'process-ref-a', type: 'process data set' }),
        expect.objectContaining({ id: 'source-ref-c', type: 'source data set' }),
        expect.objectContaining({ id: sampleModelId, type: 'lifeCycleModel data set' }),
      ],
      contributeResults: [
        expect.objectContaining({
          success: true,
          id: 'process-ref-a',
          type: 'process data set',
        }),
        expect.objectContaining({
          success: false,
          id: 'source-ref-c',
        }),
        expect.objectContaining({
          success: false,
          id: sampleModelId,
          error: 'Invalid table name',
        }),
      ],
    });
    expect(mockContributeSource).toHaveBeenCalledWith('processes', 'process-ref-a', sampleVersion);
    expect(mockContributeSource).toHaveBeenCalledWith('sources', 'source-ref-c', sampleVersion);
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching ref data:', expect.any(Error));
    expect(consoleSpy).toHaveBeenCalledWith('Error contributing data:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe('calculation mutation mapping', () => {
  it('maps calculation failures with located issues and skips persistence', async () => {
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: buildLifecycleModelJsonOrdered(),
      validationError: undefined,
    });
    mockGenLifeCycleModelProcesses.mockRejectedValueOnce(
      new CalculationError('MULTIPLE_PROVIDERS', [
        { code: 'MULTIPLE_PROVIDERS', instanceIndex: 'nodeA', flowId: 'flow-1' },
      ]),
    );

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: 'MULTIPLE_PROVIDERS',
      calculationIssues: [{ code: 'MULTIPLE_PROVIDERS', instanceIndex: 'nodeA', flowId: 'flow-1' }],
    });
  });

  it('maps cancelled calculations to the cancellation status without error styling', async () => {
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGenLifeCycleModelProcesses.mockRejectedValueOnce(new CalculationCancelledError());

    const result = await lifeCycleModelsApi.createLifeCycleModel({
      id: sampleModelId,
      model: { nodes: [], edges: [] },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: 'CALCULATION_CANCELLED' });
  });

  it('rethrows unexpected calculation errors instead of masking them', async () => {
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGenLifeCycleModelProcesses.mockRejectedValueOnce(new Error('boom'));

    await expect(
      lifeCycleModelsApi.createLifeCycleModel({
        id: sampleModelId,
        model: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow('boom');
  });

  it('discards the run as RESULT_DISCARDED when the edit state changed before saving', async () => {
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
      lciaIncomplete: false,
    });

    const result = await lifeCycleModelsApi.createLifeCycleModel(
      { id: sampleModelId, model: { nodes: [], edges: [] } },
      { hasModelChanged: () => true },
    );

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: 'RESULT_DISCARDED' });
  });

  it.each(['MISSING_PRODUCT_ALLOCATION', 'MISSING_REFERENCE_ALLOCATION'] as const)(
    'keeps saved results when recalculation needs repair: %s',
    async (allocationReason) => {
      const saved = {
        submodels: [{ id: 'saved-primary', type: 'primary', version: sampleVersion }],
      };
      const before = JSON.stringify(saved);
      mockFrom.mockReturnValueOnce(createQueryBuilder({ data: [saved], error: null }));
      mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(buildLifecycleModelJsonOrdered());
      const issue = {
        code: 'INVALID_ALLOCATION' as const,
        allocationReason,
        instanceIndex: 'nodeB',
        flowId: 'product-B',
        exchangeInternalId: '2',
      };
      mockGenLifeCycleModelProcesses.mockRejectedValueOnce(
        new CalculationError('INVALID_ALLOCATION', [issue]),
      );

      const result = await lifeCycleModelsApi.updateLifeCycleModel({
        id: sampleModelId,
        version: sampleVersion,
        model: { nodes: [], edges: [] },
      });

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(JSON.stringify(saved)).toBe(before);
      expect(result).toMatchObject({
        ok: false,
        code: 'INVALID_ALLOCATION',
        calculationIssues: [issue],
      });
    },
  );

  it('attaches the LCIA_INCOMPLETE notice only to successful saves with incomplete coverage', async () => {
    const rawJson = buildLifecycleModelJsonOrdered();
    mockFrom.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ submodels: [] }],
        error: null,
      }),
    );
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce(rawJson);
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
      lciaIncomplete: true,
    });
    mockGetProcessDetailByIdsAndVersion.mockResolvedValueOnce({ data: [] });
    const edgePayload = buildSaveResult();
    mockFunctionsInvoke.mockResolvedValueOnce(createMockEdgeFunctionResponse(edgePayload));

    const result = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });

    expect(result).toMatchObject({
      ok: true,
      calculationNotice: 'LCIA_INCOMPLETE',
    });

    // 失败结果不附加通知
    mockFrom.mockReturnValueOnce(createQueryBuilder({ data: [{ submodels: [] }], error: null }));
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
      lciaIncomplete: true,
    });
    mockFunctionsInvoke.mockResolvedValueOnce(
      createMockEdgeFunctionResponse({ ok: false, code: 'SAVE_REJECTED', message: 'no' }),
    );

    const failedResult = await lifeCycleModelsApi.updateLifeCycleModel({
      id: sampleModelId,
      version: sampleVersion,
      model: { nodes: [], edges: [] },
    });
    expect(failedResult).toMatchObject({ ok: false, code: 'SAVE_REJECTED' });
    expect(failedResult.calculationNotice).toBeUndefined();

    // update 的 RESULT_DISCARDED 分支
    mockFrom.mockReturnValueOnce(createQueryBuilder({ data: [{ submodels: [] }], error: null }));
    mockGenLifeCycleModelProcesses.mockResolvedValueOnce({
      lifeCycleModelProcesses: [],
      up2DownEdges: [],
      lciaIncomplete: false,
    });
    const discarded = await lifeCycleModelsApi.updateLifeCycleModel(
      { id: sampleModelId, version: sampleVersion, model: { nodes: [], edges: [] } },
      { hasModelChanged: () => true },
    );
    expect(discarded).toMatchObject({ ok: false, code: 'RESULT_DISCARDED' });
  });
});

describe('lifecyclemodel server classification query contract', () => {
  const params = {
    current: 4,
    pageSize: 100,
    classification: [{ scope: 'classification' as const, code: 'C', path: ['A', 'C'] }],
    datasetFilters: { datasetId: 'id-filter' },
  };
  const filters = { ...params.datasetFilters, classification: params.classification };
  let rpc: jest.SpiedFunction<(...args: any[]) => any>;
  let session: jest.SpiedFunction<(...args: any[]) => any>;
  beforeEach(() => {
    const { supabase } = jest.requireMock('@/services/supabase');
    rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null });
    session = jest
      .spyOn(supabase.auth, 'getSession')
      .mockResolvedValue({ data: { session: { user: { id: 'actor' }, access_token: 'token' } } });
  });
  afterEach(() => {
    rpc.mockRestore();
    session.mockRestore();
  });

  it('filters ordinary pages before count through the dataset catalog facade', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'catalog-id',
          version: '01.00.001',
          modified_at: '2026-10-13T00:00:00Z',
          json: {},
          total_count: 150,
        },
      ],
      error: null,
    });
    const api = require('@/services/lifeCycleModels/api');
    const result = await api.getLifeCycleModelTableAll(
      params,
      { modifiedAt: 'ascend' },
      'en',
      'my',
      '',
      'all',
    );
    expect(rpc).toHaveBeenCalledWith(
      'query_dataset_catalog',
      expect.objectContaining({
        p_dataset_kind: 'lifecyclemodel',
        p_data_source: 'my',
        p_filter_condition: { ...{}, ...filters },
        p_page_size: 100,
        p_page_current: 4,
        p_sort_by: 'modified_at',
        p_sort_direction: 'asc',
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: [expect.objectContaining({ id: 'catalog-id' })],
      total: 150,
      page: 4,
    });
  });

  it('passes complete filters to lexical search and keeps page inputs', async () => {
    const api = require('@/services/lifeCycleModels/api');
    await api.getLifeCycleModelTablePgroongaSearch(
      params,
      'en',
      'my',
      'query',
      { datasetId: 'old' },
      'all',
      undefined,
      '',
    );
    expect(rpc).toHaveBeenCalledWith(
      'search_lifecyclemodels',
      expect.objectContaining({
        filter_condition: filters,
        page_size: 100,
        page_current: 4,
      }),
    );
  });

  it('passes complete filters to UUID server pagination', async () => {
    const api = require('@/services/lifeCycleModels/api');
    await api.getLifeCycleModelTableUuidMentionSearch(
      params,
      'en',
      'my',
      'd1380000-0000-4000-8000-000000000001',
      'all',
      '',
    );
    expect(rpc).toHaveBeenCalledWith(
      'search_dataset_uuid_mentions_page',
      expect.objectContaining({
        p_dataset_kind: 'lifecyclemodel',
        p_filter_condition: { ...{}, ...filters },
        p_page_size: 100,
        p_page_current: 4,
      }),
    );
  });

  it('passes complete filters to hybrid search without filtering one returned page locally', async () => {
    const api = require('@/services/lifeCycleModels/api');
    const { supabase } = jest.requireMock('@/services/supabase');
    const invoke = jest
      .spyOn(supabase.functions, 'invoke')
      .mockResolvedValue({ data: [], error: null });
    await api.lifeCycleModel_hybrid_search(
      params,
      'en',
      'my',
      'query',
      { datasetId: 'old' },
      'all',
      undefined,
      '',
    );
    expect(invoke).toHaveBeenCalledWith(
      'lifecyclemodel_hybrid_search',
      expect.objectContaining({
        body: expect.objectContaining({
          filter_condition: filters,
          page_size: 100,
          page_current: 4,
        }),
      }),
    );
    invoke.mockRestore();
  });

  it('preserves open-data publication/source scope together with classification', async () => {
    const api = require('@/services/lifeCycleModels/api');
    await api.getLifeCycleModelTableAll(params, {}, 'en', 'tg', '', 'all', true);
    expect(rpc).toHaveBeenCalledWith(
      'search_open_data_catalog',
      expect.objectContaining({
        p_filter_condition: { ...{}, ...filters },
        p_source_filter: 'all',
        p_publication_filter: 'all',
        p_page_size: 100,
        p_page_current: 4,
      }),
    );
  });
});

describe('Lifecycle Model hybrid visibility context', () => {
  it('uses the current team and forwards its exact state filter', async () => {
    mockGetTeamIdByUserId.mockResolvedValueOnce('actual-team');
    mockFunctionsInvoke.mockResolvedValueOnce({ data: [], error: null });
    await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      { current: 2, pageSize: 50 },
      'en',
      'te',
      'query',
      {},
      0,
      undefined,
      'caller-team',
    );
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'lifecyclemodel_hybrid_search',
      expect.objectContaining({
        body: expect.objectContaining({
          team_id: 'actual-team',
          state_code: 0,
          page_current: 2,
          page_size: 50,
        }),
      }),
    );
  });
  it('returns an empty team page when current membership is absent', async () => {
    mockGetTeamIdByUserId.mockResolvedValueOnce(null);
    const result = await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      {},
      'en',
      'te',
      'query',
      {},
      undefined,
      undefined,
      'caller-team',
    );
    expect(result).toEqual({ data: [], success: true, page: 1, total: 0 });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
  it.each(['tg', 'co'])('retains an explicit %s catalog team filter', async (source) => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: [], error: null });
    await lifeCycleModelsApi.lifeCycleModel_hybrid_search(
      {},
      'en',
      source,
      'query',
      {},
      undefined,
      undefined,
      'selected-team',
    );
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'lifecyclemodel_hybrid_search',
      expect.objectContaining({
        body: expect.objectContaining({ team_id: 'selected-team' }),
      }),
    );
  });
});
