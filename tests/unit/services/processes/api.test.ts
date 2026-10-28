/**
 * Tests for processes service API functions
 * Path: src/services/processes/api.ts
 */

import * as processesApi from '@/services/processes/api';
import { FunctionRegion } from '@supabase/supabase-js';

jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  __esModule: true,
  createProcess: jest.fn().mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  }),
}));
const { createProcess: mockCreateTidasProcess } = jest.requireMock('@tiangong-lca/tidas-sdk/core');

const mockFrom = jest.fn();
const mockAuthGetSession = jest.fn();
const mockFunctionsInvoke = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/services/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (...args: any[]) => mockFrom.apply(null, args),
    auth: {
      getSession: (...args: any[]) => mockAuthGetSession.apply(null, args),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke.apply(null, args),
    },
    rpc: (...args: any[]) => mockRpc.apply(null, args),
  },
}));

const mockGetTeamIdByUserId = jest.fn();
const mockGetRefData = jest.fn();
const mockContributeSource = jest.fn();
const mockInvokeDatasetCommand = jest.fn();
const mockInvokeDatasetCreateVersion = jest.fn();
const mockNormalizeLangPayloadForSave = jest.fn();
const mockResolveFunctionInvokeError = jest.fn();
const mockBuildLangNormalizationMetadata = jest.fn();
const mockAttachLangNormalizationMetadata = jest.fn();

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  attachLangNormalizationMetadata: (...args: any[]) =>
    mockAttachLangNormalizationMetadata.apply(null, args),
  buildLangNormalizationMetadata: (...args: any[]) =>
    mockBuildLangNormalizationMetadata.apply(null, args),
  createLegacyMutationRemovedError: (boundary: string) => ({
    message: 'Use explicit command endpoints instead',
    code: 'LEGACY_ENDPOINT_REMOVED',
    details: boundary,
    hint: '',
  }),
  getTeamIdByUserId: (...args: any[]) => mockGetTeamIdByUserId.apply(null, args),
  getRefData: (...args: any[]) => mockGetRefData.apply(null, args),
  contributeSource: (...args: any[]) => mockContributeSource.apply(null, args),
  invokeDatasetCommand: (...args: any[]) => mockInvokeDatasetCommand.apply(null, args),
  invokeDatasetCreateVersion: (...args: any[]) => mockInvokeDatasetCreateVersion.apply(null, args),
  normalizeLangPayloadForSave: (...args: any[]) =>
    mockNormalizeLangPayloadForSave.apply(null, args),
  resolveFunctionInvokeError: (...args: any[]) => mockResolveFunctionInvokeError.apply(null, args),
}));

const mockGetCachedLocationData = jest.fn();
const mockGetCachedClassificationData = jest.fn();

jest.mock('@/services/locations/cache', () => ({
  __esModule: true,
  getCachedLocationData: (...args: any[]) => mockGetCachedLocationData.apply(null, args),
}));

jest.mock('@/services/classifications/cache', () => ({
  __esModule: true,
  getCachedClassificationData: (...args: any[]) =>
    mockGetCachedClassificationData.apply(null, args),
}));

const mockGetLifeCyclesByIdAndVersion = jest.fn();

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCyclesByIdAndVersion: (...args: any[]) =>
    mockGetLifeCyclesByIdAndVersion.apply(null, args),
}));

const mockGenProcessJsonOrdered = jest.fn();
const mockGenProcessName = jest.fn();
const mockGetAnnualSupplyVolumeUnitRows = jest.fn();

jest.mock('@/services/processes/annualSupplyVolumeUnit', () => ({
  getAnnualSupplyVolumeUnitRows: (...args: any[]) => mockGetAnnualSupplyVolumeUnitRows(...args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessJsonOrdered: (...args: any[]) => mockGenProcessJsonOrdered.apply(null, args),
  genProcessName: (...args: any[]) => mockGenProcessName.apply(null, args),
}));

const mockClassificationToString = jest.fn();
const mockGenClassificationZH = jest.fn();
const mockGetLangText = jest.fn();
const mockJsonToList = jest.fn();

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  classificationToString: (...args: any[]) => mockClassificationToString.apply(null, args),
  genClassificationZH: (...args: any[]) => mockGenClassificationZH.apply(null, args),
  genLocalizedClassification: (...args: any[]) => mockGenClassificationZH.apply(null, args),
  getLangText: (...args: any[]) => mockGetLangText.apply(null, args),
  jsonToList: (...args: any[]) => mockJsonToList.apply(null, args),
}));

const mockGetCurrentUser = jest.fn();

jest.mock('@/services/auth', () => ({
  __esModule: true,
  getCurrentUser: (...args: any[]) => mockGetCurrentUser.apply(null, args),
}));

const mockGetAllRefObj = jest.fn();
const mockGetRefTableName = jest.fn();
const mockValidateDatasetRuleVerification = jest.fn();

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  getAllRefObj: (...args: any[]) => mockGetAllRefObj.apply(null, args),
  getRefTableName: (...args: any[]) => mockGetRefTableName.apply(null, args),
  validateDatasetRuleVerification: (...args: any[]) =>
    mockValidateDatasetRuleVerification.apply(null, args),
}));

const createQueryBuilder = <T>(resolvedValue: T) => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: (resolve: any, reject?: any) => Promise.resolve(resolvedValue).then(resolve, reject),
  };
  mockRpc.mockImplementation((functionName: string, args: any = {}) => {
    if (functionName !== 'get_latest_process_versions') {
      return Promise.resolve({ data: [] });
    }

    mockFrom('processes');
    builder.select();
    builder.order(args.sort_by ?? 'modified_at', {
      ascending: args.sort_direction === 'asc',
    });
    builder.range(
      ((args.page_current ?? 1) - 1) * (args.page_size ?? 10),
      (args.page_current ?? 1) * (args.page_size ?? 10) - 1,
    );
    if (args.type_of_data_set_filter && args.type_of_data_set_filter !== 'all') {
      builder.eq(
        'json_ordered->processDataSet->modellingAndValidation->LCIMethodAndAllocation->>typeOfDataSet',
        args.type_of_data_set_filter,
      );
    }
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

const sampleId = '12345678-1234-1234-1234-123456789012';
const sampleVersion = '01.00.000';

beforeEach(() => {
  mockFrom.mockReset();
  mockAuthGetSession.mockReset();
  mockFunctionsInvoke.mockReset();
  mockRpc.mockReset();
  mockGetTeamIdByUserId.mockReset();
  mockInvokeDatasetCommand.mockReset();
  mockInvokeDatasetCreateVersion.mockReset();
  mockNormalizeLangPayloadForSave.mockReset();
  mockResolveFunctionInvokeError.mockReset();
  mockBuildLangNormalizationMetadata.mockReset();
  mockAttachLangNormalizationMetadata.mockReset();
  mockGetCachedLocationData.mockReset();
  mockGetCachedClassificationData.mockReset();
  mockGetLifeCyclesByIdAndVersion.mockReset();
  mockGenProcessJsonOrdered.mockReset();
  mockGenProcessName.mockReset();
  mockGetAnnualSupplyVolumeUnitRows.mockReset().mockResolvedValue([]);
  mockClassificationToString.mockReset();
  mockGenClassificationZH.mockReset();
  mockGetLangText.mockReset();
  mockJsonToList.mockReset();
  mockGetAllRefObj.mockReset();
  mockGetRefTableName.mockReset();
  mockValidateDatasetRuleVerification.mockReset();

  mockGenProcessJsonOrdered.mockReturnValue({ ordered: true });
  mockGenProcessName.mockReturnValue('Process Name');
  mockClassificationToString.mockReturnValue('classification-string');
  mockGenClassificationZH.mockReturnValue(['classification-zh']);
  mockGetLangText.mockReturnValue('General comment');
  mockJsonToList.mockImplementation((value: any) =>
    Array.isArray(value) ? value : value ? [value] : [],
  );
  mockGetCachedLocationData.mockResolvedValue([]);
  mockGetCachedClassificationData.mockResolvedValue({});
  mockGetLifeCyclesByIdAndVersion.mockResolvedValue({ data: [] });
  mockInvokeDatasetCommand.mockResolvedValue({
    data: [],
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
  });
  mockInvokeDatasetCreateVersion.mockResolvedValue({
    data: [],
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
  });
  mockNormalizeLangPayloadForSave.mockResolvedValue(undefined);
  mockBuildLangNormalizationMetadata.mockImplementation(
    (normalizedResult: any, rawPayload: any) => ({
      normalizedJsonOrdered: normalizedResult?.payload ?? rawPayload,
      langSupplementedPlaceholderPaths: normalizedResult?.supplementedEnglishPlaceholderPaths ?? [],
      langTranslatedPaths: normalizedResult?.translatedPaths ?? [],
    }),
  );
  mockAttachLangNormalizationMetadata.mockImplementation((result: any) => result);
  mockResolveFunctionInvokeError.mockImplementation(async (error: any) => error);
  mockValidateDatasetRuleVerification.mockResolvedValue({ ruleVerification: true });
  (mockCreateTidasProcess as jest.Mock).mockReturnValue({
    validateEnhanced: jest.fn().mockReturnValue({ success: true }),
  });
});

describe('listMyProcessesForLca', () => {
  it('returns unauthorized when the current session has no user id', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await processesApi.listMyProcessesForLca('en');

    expect(result).toEqual({ data: [], success: false, error: 'unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propagates query errors from the processes table', async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: 'list failed' },
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-1' } } },
    });

    const result = await processesApi.listMyProcessesForLca('en');

    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.limit).toHaveBeenCalledWith(200);
    expect(result).toEqual({
      data: [],
      success: false,
      error: { message: 'list failed' },
    });
  });

  it('clamps limit values, filters invalid rows, and falls back to id@version names', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: '  process-1  ',
          version: ' 01.00.000 ',
          name: {},
        },
        {
          id: 'process-2',
          version: '',
          name: { en: 'ignored' },
        },
        {
          id: 'process-3',
          version: '02.00.000',
          name: { en: 'provided-name' },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-2' } } },
    });
    mockGenProcessName.mockReturnValueOnce('').mockReturnValueOnce('Resolved Name');

    const result = await processesApi.listMyProcessesForLca('en', { limit: 999 });

    expect(builder.limit).toHaveBeenCalledWith(500);
    expect(result).toEqual({
      data: [
        {
          id: 'process-1',
          version: '01.00.000',
          name: 'process-1@01.00.000',
        },
        {
          id: 'process-3',
          version: '02.00.000',
          name: 'Resolved Name',
        },
      ],
      success: true,
    });
  });

  it('handles missing row fields by filtering invalid ids and falling back to id@version names', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: undefined,
          version: '01.00.000',
        },
        {
          id: 'process-missing-version',
          version: undefined,
        },
        {
          id: 'process-fallback',
          version: '03.00.000',
          name: undefined,
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-3' } } },
    });
    mockGenProcessName.mockReturnValueOnce('');

    const result = await processesApi.listMyProcessesForLca('en');

    expect(result).toEqual({
      data: [
        {
          id: 'process-fallback',
          version: '03.00.000',
          name: 'process-fallback@03.00.000',
        },
      ],
      success: true,
    });
  });

  it('returns an empty success list when the query payload is undefined', async () => {
    const builder = createQueryBuilder({
      data: undefined,
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'user-4' } } },
    });

    const result = await processesApi.listMyProcessesForLca('en');

    expect(result).toEqual({
      data: [],
      success: true,
    });
  });
});

describe('createProcess', () => {
  it('inserts ordered payload with rule verification flag', async () => {
    const createResult = {
      data: [{ id: sampleId, version: sampleVersion }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValueOnce(createResult);

    const result = await processesApi.createProcess(sampleId, { raw: true });

    expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, { raw: true });
    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith(
      'app_dataset_create',
      {
        id: sampleId,
        table: 'processes',
        jsonOrdered: { ordered: true },
        modelId: null,
        ruleVerification: true,
      },
      {
        ruleVerification: true,
      },
    );
    expect(result).toBe(createResult);
  });

  it('sets rule verification to false when non-validation issues exist', async () => {
    mockValidateDatasetRuleVerification.mockResolvedValueOnce({ ruleVerification: false });
    mockInvokeDatasetCommand.mockResolvedValueOnce({
      data: [{ id: sampleId, version: sampleVersion }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    await processesApi.createProcess(sampleId, { raw: true }, 'model-1');

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith(
      'app_dataset_create',
      {
        id: sampleId,
        table: 'processes',
        jsonOrdered: { ordered: true },
        modelId: 'model-1',
        ruleVerification: false,
      },
      {
        ruleVerification: false,
      },
    );
  });

  it('returns a structured validation error when language normalization fails', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { normalized: true },
      validationError: 'invalid_language_payload',
    });

    const result = await processesApi.createProcess(sampleId, { raw: true });

    expect(result).toEqual({
      data: null,
      error: {
        message: 'invalid_language_payload',
        code: 'LANG_VALIDATION_ERROR',
        details: '',
        hint: '',
        name: 'LangValidationError',
      },
      status: 400,
      statusText: 'LANG_VALIDATION_ERROR',
      count: null,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('annual unit at the process save boundary', () => {
  const save = (action: string, data: any) => {
    if (action === 'create') return processesApi.createProcess(sampleId, data);
    if (action === 'createVersion')
      return processesApi.createProcessVersion(sampleId, sampleVersion, data);
    return processesApi.updateProcess(sampleId, sampleVersion, data);
  };
  const reference = {
    '@dataSetInternalID': '0',
    quantitativeReference: true,
    referenceToFlowDataSet: { '@refObjectId': 'flow-current', '@version': '02.00.000' },
    functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': 'One complete functional unit.' }],
    refUnitRes: { refUnitName: 'stale-unit' },
  };
  const processData = {
    exchanges: { exchange: [reference] },
    modellingAndValidation: {
      dataSourcesTreatmentAndRepresentativeness: {
        annualSupplyOrProductionVolume: [{ '@xml:lang': 'en', '#text': '12.5 kg/year' }],
      },
    },
  };

  it.each(['create', 'createVersion', 'update'])(
    'resolves the current reference unit before %s even when the annual tab was not visited',
    async (action) => {
      mockGetAnnualSupplyVolumeUnitRows.mockResolvedValue([
        {
          referenceToFlowDataSetId: 'flow-current',
          referenceToFlowDataSetVersion: '01.00.000',
          refUnitRes: { refUnitName: 'wrong-version-unit' },
        },
        {
          referenceToFlowDataSetId: 'flow-current',
          referenceToFlowDataSetVersion: '02.00.000',
          refUnitRes: { refUnitName: 'MJ' },
        },
      ]);
      const unchanged = JSON.stringify(processData);
      await save(action, processData);
      expect(mockGetAnnualSupplyVolumeUnitRows).toHaveBeenCalledWith([reference]);
      expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, processData, {
        annualSupplyVolumeUnit: 'MJ',
      });
      expect(JSON.stringify(processData)).toBe(unchanged);
    },
  );

  it('does not use a mismatched or missing exact unit as serializer evidence', async () => {
    mockGetAnnualSupplyVolumeUnitRows.mockResolvedValue([
      {
        referenceToFlowDataSetId: 'flow-current',
        referenceToFlowDataSetVersion: '01.00.000',
        refUnitRes: { refUnitName: 'wrong-version-unit' },
      },
    ]);
    await save('createVersion', processData);
    expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, processData);
  });

  it.each(['create', 'createVersion', 'update'])(
    'passes the complete prepared payload through normalization, validation and the %s command unchanged',
    async (action) => {
      const prepared = {
        processDataSet: {
          processInformation: {
            dataSetInformation: { 'common:UUID': sampleId },
            quantitativeReference: { functionalUnitOrOther: reference.functionalUnitOrOther },
          },
          modellingAndValidation: {
            LCIMethodAndAllocation: {
              modellingConstants: [{ '@xml:lang': 'en', '#text': 'Cut-off.' }],
            },
            dataSourcesTreatmentAndRepresentativeness: {
              annualSupplyOrProductionVolume: [{ '@xml:lang': 'en', '#text': '12.5 MJ/year' }],
              useAdviceForDataSet: [{ '@xml:lang': 'en', '#text': 'Use within the boundary.' }],
            },
            validation: { review: { '@type': 'Not reviewed' } },
            complianceDeclarations: {
              compliance: { 'common:approvalOfOverallCompliance': 'Not defined' },
            },
          },
          administrativeInformation: {
            dataEntryBy: { 'common:timeStamp': '2026-10-14T00:00:00Z' },
          },
          exchanges: {
            exchange: {
              '@dataSetInternalID': '0',
              meanAmount: 1,
              referenceToFlowDataSet: reference.referenceToFlowDataSet,
            },
          },
        },
      };
      const before = JSON.stringify(prepared);
      mockGetAnnualSupplyVolumeUnitRows.mockResolvedValue([
        {
          referenceToFlowDataSetId: 'flow-current',
          referenceToFlowDataSetVersion: '02.00.000',
          refUnitRes: { refUnitName: 'MJ' },
        },
      ]);
      mockGenProcessJsonOrdered.mockReturnValue(prepared);
      mockNormalizeLangPayloadForSave.mockResolvedValue({ payload: prepared });
      await save(action, processData);
      expect(mockNormalizeLangPayloadForSave).toHaveBeenCalledWith(prepared, undefined);
      expect(mockValidateDatasetRuleVerification).toHaveBeenCalledWith(
        'process data set',
        prepared,
        '',
      );
      const command =
        action === 'createVersion'
          ? mockInvokeDatasetCreateVersion.mock.calls[0][0]
          : mockInvokeDatasetCommand.mock.calls[0][1];
      expect(command).toEqual({
        id: sampleId,
        table: 'processes',
        ...(action === 'createVersion' ? { sourceVersion: sampleVersion } : {}),
        ...(action === 'update' ? { version: sampleVersion } : {}),
        jsonOrdered: prepared,
        modelId: action === 'update' ? undefined : null,
        ruleVerification: true,
      });
      expect(JSON.stringify(command.jsonOrdered)).toBe(before);
      expect(mockGetAnnualSupplyVolumeUnitRows.mock.invocationCallOrder[0]).toBeLessThan(
        mockGenProcessJsonOrdered.mock.invocationCallOrder[0],
      );
      expect(mockGenProcessJsonOrdered.mock.invocationCallOrder[0]).toBeLessThan(
        mockNormalizeLangPayloadForSave.mock.invocationCallOrder[0],
      );
      expect(mockNormalizeLangPayloadForSave.mock.invocationCallOrder[0]).toBeLessThan(
        mockValidateDatasetRuleVerification.mock.invocationCallOrder[0],
      );
    },
  );

  it('does not add a unit lookup when no annual value is supplied', async () => {
    await save('create', { exchanges: { exchange: [reference] } });
    expect(mockGetAnnualSupplyVolumeUnitRows).not.toHaveBeenCalled();
  });

  it('leaves malformed or absent references to existing validation without trusting their cache', async () => {
    const data = {
      ...processData,
      exchanges: { exchange: [{ ...reference, referenceToFlowDataSet: { '@version': 1 } }] },
    };
    await save('update', data);
    expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, data);
    await save('create', { ...processData, exchanges: {} });
    expect(mockGenProcessJsonOrdered).toHaveBeenLastCalledWith(sampleId, {
      ...processData,
      exchanges: {},
    });
  });
});

describe('createProcessVersion', () => {
  it('creates a new process version with server-owned version allocation', async () => {
    const createResult = {
      data: [{ id: sampleId, version: '01.00.001' }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCreateVersion.mockResolvedValue(createResult);

    const withModelResult = await processesApi.createProcessVersion(
      sampleId,
      sampleVersion,
      { raw: true },
      'model-1',
    );

    expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, { raw: true });
    expect(mockInvokeDatasetCreateVersion).toHaveBeenCalledWith(
      {
        id: sampleId,
        table: 'processes',
        sourceVersion: sampleVersion,
        jsonOrdered: { ordered: true },
        modelId: 'model-1',
        ruleVerification: true,
      },
      {
        ruleVerification: true,
      },
    );
    expect(withModelResult).toBe(createResult);

    mockInvokeDatasetCreateVersion.mockClear();

    await processesApi.createProcessVersion(sampleId, sampleVersion, { raw: true });

    expect(mockInvokeDatasetCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: null,
      }),
      {
        ruleVerification: true,
      },
    );
  });

  it('returns a structured validation error before invoking create-version', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { normalized: true },
      validationError: 'invalid_language_payload',
    });

    const result = await processesApi.createProcessVersion(sampleId, sampleVersion, { raw: true });

    expect(mockInvokeDatasetCreateVersion).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: null,
      error: {
        message: 'invalid_language_payload',
        code: 'LANG_VALIDATION_ERROR',
        details: '',
        hint: '',
        name: 'LangValidationError',
      },
      status: 400,
      statusText: 'LANG_VALIDATION_ERROR',
      count: null,
    });
  });
});

describe('updateProcess', () => {
  it('invokes update function with ordered payload when session exists', async () => {
    const invokeResult = {
      data: [{ id: sampleId, rule_verification: true }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValueOnce(invokeResult);

    const result = await processesApi.updateProcess(sampleId, sampleVersion, { some: 'data' });

    expect(mockGenProcessJsonOrdered).toHaveBeenCalledWith(sampleId, { some: 'data' });
    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith(
      'app_dataset_save_draft',
      {
        id: sampleId,
        version: sampleVersion,
        table: 'processes',
        jsonOrdered: { ordered: true },
        modelId: undefined,
        ruleVerification: true,
      },
      {
        ruleVerification: true,
      },
    );
    expect(result).toEqual(invokeResult);
  });

  it('returns undefined when no active session is available', async () => {
    mockInvokeDatasetCommand.mockResolvedValueOnce(undefined);

    const result = await processesApi.updateProcess(sampleId, sampleVersion, { some: 'data' });

    expect(mockInvokeDatasetCommand).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('returns structured error when invocation fails', async () => {
    const failure = {
      data: null,
      error: { message: 'update failed', code: 'FUNCTION_ERROR', details: '', hint: '' },
      count: null,
      status: 500,
      statusText: 'FUNCTION_ERROR',
    };
    mockInvokeDatasetCommand.mockResolvedValueOnce(failure);

    const result = await processesApi.updateProcess(sampleId, sampleVersion, { some: 'data' });

    expect(result).toEqual(failure);
  });

  it('uses fallback bearer token and keeps rule verification false when validation fails', async () => {
    mockValidateDatasetRuleVerification.mockResolvedValueOnce({ ruleVerification: false });
    mockInvokeDatasetCommand.mockResolvedValueOnce({
      data: [{ ok: true, rule_verification: false }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    await processesApi.updateProcess(sampleId, sampleVersion, { some: 'data' }, 'model-x');

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith(
      'app_dataset_save_draft',
      {
        id: sampleId,
        version: sampleVersion,
        table: 'processes',
        jsonOrdered: { ordered: true },
        modelId: 'model-x',
        ruleVerification: false,
      },
      {
        ruleVerification: false,
      },
    );
  });

  it('returns a structured validation error when language normalization fails', async () => {
    mockNormalizeLangPayloadForSave.mockResolvedValueOnce({
      payload: { normalized: true },
      validationError: 'invalid_language_payload',
    });

    const result = await processesApi.updateProcess(sampleId, sampleVersion, { some: 'data' });

    expect(result).toEqual({
      data: null,
      error: {
        message: 'invalid_language_payload',
        code: 'LANG_VALIDATION_ERROR',
        details: '',
        hint: '',
        name: 'LangValidationError',
      },
      status: 400,
      statusText: 'LANG_VALIDATION_ERROR',
      count: null,
    });
    expect(mockInvokeDatasetCommand).not.toHaveBeenCalled();
  });
});

describe.each([
  ['createProcess', () => processesApi.createProcess(sampleId, { raw: true })],
  [
    'createProcessVersion',
    () => processesApi.createProcessVersion(sampleId, sampleVersion, { raw: true }),
  ],
  ['updateProcess', () => processesApi.updateProcess(sampleId, sampleVersion, { raw: true })],
])('%s TIDAS scalar save gate', (_name, save) => {
  it('rejects a non-canonical process year before persistence', async () => {
    mockGenProcessJsonOrdered.mockReturnValue({
      processDataSet: {
        processInformation: {
          time: { 'common:dataSetValidUntil': '2030' },
        },
      },
    });

    const result = await save();

    expect(result).toEqual(
      expect.objectContaining({
        data: null,
        status: 400,
        statusText: 'TIDAS_SCALAR_VALIDATION_ERROR',
        error: expect.objectContaining({ code: 'TIDAS_SCALAR_VALIDATION_ERROR' }),
      }),
    );
    expect(mockValidateDatasetRuleVerification).not.toHaveBeenCalled();
    expect(mockInvokeDatasetCommand).not.toHaveBeenCalled();
    expect(mockInvokeDatasetCreateVersion).not.toHaveBeenCalled();
  });
});

describe('updateProcessApi', () => {
  it('returns a structured deprecation error', async () => {
    const payload = { json_ordered: { foo: 'bar' } };
    const result = await processesApi.updateProcessApi(sampleId, sampleVersion, payload);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'updateProcessApi',
        hint: '',
      },
    });
  });
});

describe('deleteProcess', () => {
  it('deletes process by id and version', async () => {
    const deleteResult = {
      data: [{ id: sampleId }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValueOnce(deleteResult);

    const result = await processesApi.deleteProcess(sampleId, sampleVersion);

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_dataset_delete', {
      id: sampleId,
      version: sampleVersion,
      table: 'processes',
    });
    expect(result).toEqual({
      data: null,
      error: null,
      count: null,
      status: 204,
      statusText: 'No Content',
    });
  });
});

describe('getProcessDetail', () => {
  it('returns process detail for explicit version', async () => {
    const selectResult = {
      data: [
        {
          json: { foo: 'bar' },
          version: sampleVersion,
          modified_at: '2024-01-01T00:00:00Z',
          state_code: 100,
          rule_verification: 'ok',
          team_id: 'team-1',
          reviews: [{ id: 'review-1' }],
        },
      ],
    };
    const builder = createQueryBuilder(selectResult);
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.getProcessDetail(sampleId, sampleVersion);

    expect(builder.select).toHaveBeenCalledWith(
      'json,version, modified_at,state_code,rule_verification,team_id,reviews',
    );
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', sampleId);
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'version', sampleVersion);
    expect(result).toEqual({
      data: {
        id: sampleId,
        version: sampleVersion,
        json: { foo: 'bar' },
        modifiedAt: '2024-01-01T00:00:00Z',
        stateCode: 100,
        ruleVerification: 'ok',
        teamId: 'team-1',
        reviews: [{ id: 'review-1' }],
      },
      success: true,
    });
  });

  it('falls back to latest version when version format is invalid', async () => {
    const selectResult = {
      data: [
        {
          json: { foo: 'baz' },
          version: '02.00.000',
          modified_at: '2024-02-01T00:00:00Z',
          state_code: 200,
          rule_verification: 'pending',
          team_id: 'team-2',
          reviews: [],
        },
      ],
    };
    const builder = createQueryBuilder(selectResult);
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.getProcessDetail(sampleId, 'latest');

    expect(builder.eq).toHaveBeenCalledWith('id', sampleId);
    expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(0, 0);
    expect(result).toEqual({
      data: {
        id: sampleId,
        version: '02.00.000',
        json: { foo: 'baz' },
        modifiedAt: '2024-02-01T00:00:00Z',
        stateCode: 200,
        ruleVerification: 'pending',
        teamId: 'team-2',
        reviews: [],
      },
      success: true,
    });
  });

  it('returns null data when the process id is invalid or no row is found', async () => {
    const result = await processesApi.getProcessDetail('short-id', sampleVersion);

    expect(result).toEqual({
      data: null,
      success: true,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('getProcessTableAll', () => {
  it('transforms records with location and classification mapping', async () => {
    const queryResult = {
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-03-01T12:00:00Z',
          team_id: 'team-123',
          model_id: 'model-123',
          model_version: '01.01.021',
          name: { en: 'Raw name' },
          'common:class': { '#text': 'class-1' },
          'common:generalComment': { en: 'comment' },
          typeOfDataSet: 'type-1',
          'common:referenceYear': '2023',
          '@location': 'CN',
        },
      ],
      count: 1,
    };
    const builder = createQueryBuilder(queryResult);
    mockFrom.mockReturnValueOnce(builder);

    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': 'China' }]);

    const result = await processesApi.getProcessTableAll(
      { current: 2, pageSize: 5 },
      { modified_at: 'ascend' },
      'en',
      'tg',
      'team-filter',
      'all',
      'all',
    );

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(builder.select).toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith('modified_at', { ascending: true });
    expect(builder.range).toHaveBeenCalledWith(5, 9);
    expect(builder.eq).toHaveBeenCalledWith('state_code', 100);
    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-filter');
    expect(mockGetCachedLocationData).toHaveBeenCalledWith('en', ['CN']);
    expect(mockJsonToList).toHaveBeenCalledWith({ '#text': 'class-1' });
    expect(mockClassificationToString).toHaveBeenCalled();
    expect(mockGenProcessName).toHaveBeenCalledWith({ en: 'Raw name' }, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith({ en: 'comment' }, 'en');
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          version: sampleVersion,
          lang: 'en',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          typeOfDataSet: 'type-1',
          referenceYear: '2023',
          location: 'China',
          modifiedAt: new Date('2024-03-01T12:00:00Z'),
          teamId: 'team-123',
          modelId: 'model-123',
          modelVersion: '01.01.021',
        },
      ],
      page: 2,
      success: true,
      total: 1,
    });
  });

  it('normalizes latest-version sort aliases, default dataset type, and blank session users', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-without-user',
        },
      },
    });
    createQueryBuilder({ data: [], count: 0 });

    await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      { modifiedAt: 'ascend' },
      'en',
      'tg',
      [],
      undefined,
      undefined,
    );

    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_latest_process_versions',
      expect.objectContaining({
        sort_by: 'modified_at',
        sort_direction: 'asc',
        this_user_id: '',
        type_of_data_set_filter: 'all',
      }),
    );

    createQueryBuilder({ data: [], count: 0 });

    await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      { createdAt: 'descend' },
      'en',
      'tg',
      [],
      undefined,
      undefined,
    );

    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_latest_process_versions',
      expect.objectContaining({
        sort_by: 'created_at',
        sort_direction: 'desc',
      }),
    );

    createQueryBuilder({ data: [], count: 0 });

    await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      { name: undefined } as any,
      'en',
      'tg',
      [],
      undefined,
      undefined,
    );

    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_latest_process_versions',
      expect.objectContaining({
        sort_by: 'modified_at',
        sort_direction: 'desc',
      }),
    );
  });

  it('returns failure when personal data has no active session', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'my',
      [],
      100,
      'all',
    );

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], success: false });
  });

  it('applies co-source and type filters and returns empty success when no rows', async () => {
    const builder = createQueryBuilder({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'co',
      'team-a',
      undefined,
      'Unit process, black box',
    );

    expect(builder.eq).toHaveBeenCalledWith(
      'json_ordered->processDataSet->modellingAndValidation->LCIMethodAndAllocation->>typeOfDataSet',
      'Unit process, black box',
    );
    expect(builder.eq).toHaveBeenCalledWith('state_code', 200);
    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-a');
    expect(result).toEqual({ data: [], success: true });
  });

  it('returns success with empty data when team source has no team id', async () => {
    const builder = createQueryBuilder({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockGetTeamIdByUserId.mockResolvedValueOnce(null);

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'te',
      [],
      undefined,
      'all',
    );

    expect(mockGetTeamIdByUserId).toHaveBeenCalled();
    expect(result).toEqual({ data: [], success: true });
  });

  it('filters my-source queries by state code and current user id', async () => {
    const builder = createQueryBuilder({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-my',
          },
        },
      },
    });

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'my',
      [],
      300,
      'all',
    );

    expect(builder.eq).toHaveBeenCalledWith('state_code', 300);
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-my');
    expect(result).toEqual({ data: [], success: true });
  });

  it('applies the resolved team id for team-source table queries', async () => {
    const builder = createQueryBuilder({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockGetTeamIdByUserId.mockResolvedValueOnce('team-resolved');

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'te',
      [],
      undefined,
      'all',
    );

    expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-resolved');
    expect(result).toEqual({ data: [], success: true });
  });

  it('returns query error response for failed database request', async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: 'query failed' },
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [],
      success: false,
      error: { message: 'query failed' },
    });
  });

  it('maps zh rows with fallback values and default paging fields', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-03-10T00:00:00Z',
          team_id: 'team-zh',
          model_id: 'model-zh',
          name: { zh: '流程' },
          'common:class': [{ '#text': 'class-zh' }],
          'common:generalComment': { zh: '注释' },
          '@location': 'CN',
        },
      ],
    });
    mockFrom.mockReturnValueOnce(builder);
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': '中国' }]);
    mockGetCachedClassificationData.mockResolvedValueOnce([
      { '@value': 'class-zh', '#text': '分类' },
    ]);

    const result = await processesApi.getProcessTableAll(
      {} as any,
      {},
      'zh',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(mockGetCachedClassificationData).toHaveBeenCalledWith('Process', 'zh', ['all']);
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          version: sampleVersion,
          lang: 'zh',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          typeOfDataSet: '-',
          referenceYear: '-',
          location: '中国',
          modifiedAt: new Date('2024-03-10T00:00:00Z'),
          teamId: 'team-zh',
          modelId: 'model-zh',
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('maps sparse rows when cache and classification helpers return empty fallbacks', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-03-11T00:00:00Z',
          'common:class': undefined,
          'common:generalComment': undefined,
          '@location': undefined,
        },
      ],
      count: 1,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockGetCachedLocationData.mockResolvedValueOnce([]);
    mockGetCachedClassificationData.mockResolvedValueOnce(undefined as any);
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);
    mockGenProcessName.mockReturnValueOnce('');

    const result = await processesApi.getProcessTableAll(
      {} as any,
      {},
      'zh',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          version: sampleVersion,
          lang: 'zh',
          name: sampleId,
          generalComment: 'General comment',
          classification: 'classification-string',
          typeOfDataSet: '-',
          referenceYear: '-',
          location: '-',
          modifiedAt: new Date('2024-03-11T00:00:00Z'),
          teamId: undefined,
          modelId: undefined,
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('falls back to the trimmed id when name formatting returns an empty string', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: ` ${sampleId} `,
          version: sampleVersion,
          modified_at: '2024-03-12T00:00:00Z',
          name: undefined,
          'common:generalComment': undefined,
          '@location': undefined,
        },
      ],
      count: 1,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockGenProcessName.mockReturnValueOnce('');

    const result = await processesApi.getProcessTableAll(
      {} as any,
      {},
      'en',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(result.data[0].name).toBe(sampleId);
  });

  it('uses an empty-string fallback when both name formatting and id are missing', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: undefined,
          version: sampleVersion,
          modified_at: '2024-03-12T00:00:00Z',
          name: undefined,
          'common:generalComment': undefined,
          '@location': undefined,
        },
      ],
      count: 1,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockGenProcessName.mockReturnValueOnce('');

    const result = await processesApi.getProcessTableAll(
      {} as any,
      {},
      'en',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(result.data[0]).toMatchObject({
      id: undefined,
      name: '',
    });
  });

  it('falls back to id-only row when row transform throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-03-10T00:00:00Z',
          '@location': 'CN',
        },
      ],
      count: 1,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad class');
    });

    const result = await processesApi.getProcessTableAll(
      { current: 1, pageSize: 10 },
      {},
      'en',
      'tg',
      [],
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [{ id: sampleId, lang: 'en' }],
      page: 1,
      success: true,
      total: 1,
    });
    errorSpy.mockRestore();
  });
});

describe('listProcessesForLcaAnalysis', () => {
  it('lists public rows plus every actor-owned state-zero draft', async () => {
    const builder = createQueryBuilder({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'owner-1' } } },
    });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 20 },
      'en',
      'public_plus_owner_draft',
    );

    expect(builder.or).toHaveBeenCalledWith(
      'state_code.eq.100,and(user_id.eq.owner-1,state_code.eq.0)',
    );
    expect(builder.ilike).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, total: 0 });
  });

  it('uses indexed formal search with actor-owned draft scope for keyword filtering', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-2' } } },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'owner-head', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'public-head', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'owner-draft', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'public-process', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      });

    await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 10 },
      'en',
      'public_plus_owner_draft',
      'battery',
    );

    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        query_terms: ['battery'],
        data_source: 'my',
        state_code_filter: 0,
        owner_draft_only: true,
      }),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        query_terms: ['battery'],
        data_source: 'tg',
        state_code_filter: null,
        owner_draft_only: false,
      }),
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('loads only the requested page for a single-source analysis list', async () => {
    const buildProcessRow = (index: number) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      version: '01.00.000',
      modified_at: `2024-03-${String((index % 28) + 1).padStart(2, '0')}T12:00:00Z`,
      team_id: 'team-open',
      model_id: `model-${index}`,
      name: { en: `Open process ${index}` },
      'common:class': { '#text': `class-${index}` },
      'common:generalComment': { en: `comment-${index}` },
      typeOfDataSet: 'background',
      'common:referenceYear': '2024',
      '@location': 'CN',
    });

    const requestedPageRows = Array.from({ length: 50 }, (_, index) => buildProcessRow(index + 51));
    const builder = createQueryBuilder({
      data: requestedPageRows,
      count: 250,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 50 },
      'en',
      'open_data',
    );

    expect(builder.range).toHaveBeenCalledWith(50, 99);
    expect(result.success).toBe(true);
    expect(result.total).toBe(250);
    expect(result.data).toHaveLength(50);
  });

  it('queries all_data in one paginated request for non-search loading', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          version: '01.00.000',
          modified_at: '2024-03-01T12:00:00Z',
          team_id: 'team-my',
          model_id: 'model-my',
          name: { en: 'My process' },
          'common:class': { '#text': 'class-my' },
          'common:generalComment': { en: 'mine' },
          typeOfDataSet: 'foreground',
          'common:referenceYear': '2024',
          '@location': 'CN',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          version: '02.00.000',
          modified_at: '2024-03-02T12:00:00Z',
          team_id: 'team-open',
          model_id: 'model-open-2',
          name: { en: 'Open process' },
          'common:class': { '#text': 'class-open' },
          'common:generalComment': { en: 'open' },
          typeOfDataSet: 'background',
          'common:referenceYear': '2023',
          '@location': 'US',
        },
      ],
      count: 42,
    });

    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-1',
          },
        },
      },
    });
    mockGetCachedLocationData.mockResolvedValue([
      { '@value': 'CN', '#text': 'China' },
      { '@value': 'US', '#text': 'United States' },
    ]);

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 20 },
      'en',
      'all_data',
    );

    expect(builder.or).toHaveBeenCalledWith('state_code.eq.100,user_id.eq.user-1');
    expect(builder.range).toHaveBeenCalledWith(20, 39);
    expect(result.success).toBe(true);
    expect(result.page).toBe(2);
    expect(result.total).toBe(42);
    expect(result.data).toHaveLength(2);
  });

  it('uses default page and total fallbacks for successful all_data table rows', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-03-03T12:00:00Z',
          name: {},
          'common:class': undefined,
          'common:generalComment': undefined,
          '@location': undefined,
        },
      ],
      count: undefined,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-3',
          },
        },
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis({} as any, 'en', 'all_data');

    expect(result.page).toBe(1);
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(1);
  });

  it('searches current-user and open-data sources for all_data keyword lookups', async () => {
    const myProcessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const openProcessId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [
          {
            id: myProcessId,
            version: '01.00.000',
            modified_at: '2024-06-03T00:00:00Z',
            team_id: 'team-my',
            model_id: 'model-my',
            total_count: 1,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: { en: 'My search result' },
                    classificationInformation: {
                      'common:classification': {
                        'common:class': { '#text': 'class-my' },
                      },
                    },
                    'common:generalComment': { en: 'mine' },
                  },
                  time: {
                    'common:referenceYear': '2024',
                  },
                  geography: {
                    locationOfOperationSupplyOrProduction: {
                      '@location': 'CN',
                    },
                  },
                },
                modellingAndValidation: {
                  LCIMethodAndAllocation: {
                    typeOfDataSet: 'foreground',
                  },
                },
              },
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: openProcessId,
            version: '02.00.000',
            modified_at: '2024-06-04T00:00:00Z',
            team_id: 'team-open',
            model_id: 'model-open',
            total_count: 1,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: { en: 'Open search result' },
                    classificationInformation: {
                      'common:classification': {
                        'common:class': { '#text': 'class-open' },
                      },
                    },
                    'common:generalComment': { en: 'open' },
                  },
                  time: {
                    'common:referenceYear': '2023',
                  },
                  geography: {
                    locationOfOperationSupplyOrProduction: {
                      '@location': 'US',
                    },
                  },
                },
                modellingAndValidation: {
                  LCIMethodAndAllocation: {
                    typeOfDataSet: 'background',
                  },
                },
              },
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: myProcessId,
            version: '01.00.000',
            modified_at: '2024-06-03T00:00:00Z',
            team_id: 'team-my',
            model_id: 'model-my',
            total_count: 1,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: { en: 'My search result' },
                    classificationInformation: {
                      'common:classification': {
                        'common:class': { '#text': 'class-my' },
                      },
                    },
                    'common:generalComment': { en: 'mine' },
                  },
                  time: {
                    'common:referenceYear': '2024',
                  },
                  geography: {
                    locationOfOperationSupplyOrProduction: {
                      '@location': 'CN',
                    },
                  },
                },
                modellingAndValidation: {
                  LCIMethodAndAllocation: {
                    typeOfDataSet: 'foreground',
                  },
                },
              },
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: openProcessId,
            version: '02.00.000',
            modified_at: '2024-06-04T00:00:00Z',
            team_id: 'team-open',
            model_id: 'model-open',
            total_count: 1,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: { en: 'Open search result' },
                    classificationInformation: {
                      'common:classification': {
                        'common:class': { '#text': 'class-open' },
                      },
                    },
                    'common:generalComment': { en: 'open' },
                  },
                  time: {
                    'common:referenceYear': '2023',
                  },
                  geography: {
                    locationOfOperationSupplyOrProduction: {
                      '@location': 'US',
                    },
                  },
                },
                modellingAndValidation: {
                  LCIMethodAndAllocation: {
                    typeOfDataSet: 'background',
                  },
                },
              },
            },
          },
        ],
        error: null,
      });
    mockGetCachedLocationData.mockResolvedValue([
      { '@value': 'CN', '#text': 'China' },
      { '@value': 'US', '#text': 'United States' },
    ]);

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 10 },
      'en',
      'all_data',
      'battery',
    );

    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        data_source: 'my',
        owner_draft_only: false,
        page_size: 1,
        page_current: 1,
      }),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        data_source: 'tg',
        owner_draft_only: false,
        page_size: 1,
        page_current: 1,
      }),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      3,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        data_source: 'my',
        owner_draft_only: false,
        page_size: 10,
        page_current: 1,
      }),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      4,
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        data_source: 'tg',
        owner_draft_only: false,
        page_size: 9,
        page_current: 1,
      }),
    );
    expect(result).toEqual({
      data: [
        expect.objectContaining({ id: myProcessId }),
        expect.objectContaining({ id: openProcessId }),
      ],
      page: 1,
      success: true,
      total: 2,
    });
  });

  it('returns unauthorized for all_data list loading when there is no session user id', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 10 },
      'en',
      'all_data',
    );

    expect(result).toEqual({
      data: [],
      success: false,
      error: 'unauthorized',
    });
  });

  it('returns an error when the all_data base query fails', async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: 'all-data query failed' },
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-1',
          },
        },
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 3, pageSize: 5 },
      'en',
      'all_data',
      '',
      {},
      {},
      'all',
      'foreground',
    );

    expect(builder.eq).toHaveBeenCalledWith(
      'json_ordered->processDataSet->modellingAndValidation->LCIMethodAndAllocation->>typeOfDataSet',
      'foreground',
    );
    expect(result).toEqual({
      data: [],
      success: false,
      error: { message: 'all-data query failed' },
    });
  });

  it('returns an empty success page when the all_data base query has no rows', async () => {
    const builder = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-2',
          },
        },
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 4, pageSize: 5 },
      'en',
      'all_data',
    );

    expect(result).toEqual({
      data: [],
      page: 4,
      success: true,
      total: 0,
    });
  });

  it('uses default paging values for open_data keyword searches with empty results', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-empty-open',
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await processesApi.listProcessesForLcaAnalysis(
      {} as any,
      'en',
      'open_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 1,
      success: true,
      total: 0,
      error: undefined,
    });
  });

  it('normalizes open_data non-search table failures through the shared response helper', async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: 'open table failed' },
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 5 },
      'en',
      'open_data',
    );

    expect(result).toEqual({
      data: [],
      page: 2,
      success: false,
      total: 0,
      error: { message: 'open table failed' },
    });
  });

  it('uses default paging and total fallbacks for empty all_data table results', async () => {
    const builder = createQueryBuilder({
      data: [],
      error: null,
      count: undefined,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-fallback',
          },
        },
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis({} as any, 'en', 'all_data');

    expect(result).toEqual({
      data: [],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('uses default paging values for current_user non-search scopes', async () => {
    const builder = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });
    mockFrom.mockReturnValueOnce(builder);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-current',
          },
        },
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis({} as any, 'en', 'current_user');

    expect(result).toEqual({
      data: [],
      page: 1,
      success: true,
      total: 0,
      error: undefined,
    });
  });

  it('normalizes open_data keyword searches with no session into an empty response object', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    const result = await processesApi.listProcessesForLcaAnalysis(
      {} as any,
      'en',
      'open_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 1,
      success: false,
      total: 0,
      error: 'unauthorized',
    });
  });

  it('uses normalized data-length totals and merge fallbacks for all_data keyword searches', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-normalized',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [
          {
            id: 'current-user-row',
            version: undefined,
            json: {},
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: undefined,
            version: sampleVersion,
            json: {},
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'current-user-row',
            version: undefined,
            json: {},
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: undefined,
            version: sampleVersion,
            json: {},
          },
        ],
        error: null,
      });

    const result = await processesApi.listProcessesForLcaAnalysis(
      {} as any,
      'en',
      'all_data',
      'battery',
    );

    expect(result.page).toBe(1);
    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      key: 'current-user-row:undefined',
      id: 'current-user-row',
      version: undefined,
      name: 'Process Name',
      generalComment: 'General comment',
      classification: 'classification-string',
      typeOfDataSet: '-',
      referenceYear: '-',
      location: '-',
      teamId: undefined,
      modelId: undefined,
    });
    expect(result.data[0].modifiedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(result.data[0].modifiedAt.getTime())).toBe(true);
  });

  it('returns the first search-head error for all_data keyword requests', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'my search failed' } });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 5 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 2,
      success: false,
      total: 0,
    });
  });

  it('returns the open-data head error for all_data keyword requests', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            total_count: 1,
            json: {},
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'open search failed' } });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 5 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 2,
      success: false,
      total: 1,
    });
  });

  it('returns only the current-user page when it already fills the requested page size', async () => {
    const rows = Array.from({ length: 2 }, (_, index) => ({
      id: `my-only-${index + 1}`,
      version: sampleVersion,
      total_count: 2,
      json: {},
    }));
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({ data: rows.slice(0, 1), error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: rows, error: null });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [
        expect.objectContaining({ id: 'my-only-1' }),
        expect.objectContaining({ id: 'my-only-2' }),
      ],
      page: 1,
      success: true,
      total: 2,
    });
  });

  it('returns the open-data follow-up error when the open-data tail page fails', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'my-1', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'open-1', version: sampleVersion, total_count: 3, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'my-1', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'open tail failed' } });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 1,
      success: false,
      total: 4,
    });
  });

  it('returns the offset open-data slice for later all_data keyword pages', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'my-head', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'open-head', version: sampleVersion, total_count: 6, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: 'open-1', version: sampleVersion, total_count: 6, json: {} },
          { id: 'open-2', version: sampleVersion, total_count: 6, json: {} },
          { id: 'open-3', version: sampleVersion, total_count: 6, json: {} },
          { id: 'open-4', version: sampleVersion, total_count: 6, json: {} },
        ],
        error: null,
      });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [expect.objectContaining({ id: 'open-2' }), expect.objectContaining({ id: 'open-3' })],
      page: 2,
      success: true,
      total: 7,
    });
  });

  it('returns the current-user page error when the requested all_data keyword page starts in current-user rows', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'my-head', version: sampleVersion, total_count: 3, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'open-head', version: sampleVersion, total_count: 4, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'my page failed' } });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 1,
      success: false,
      total: 7,
      error: undefined,
    });
  });

  it('returns the open-data page error when a later all_data keyword page depends on open-data rows', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'my-head', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'open-head', version: sampleVersion, total_count: 6, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'open later page failed' } });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 2, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result).toEqual({
      data: [],
      page: 2,
      success: false,
      total: 7,
      error: undefined,
    });
  });

  it('uses the keyword search branch for open_data scopes', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 10 },
      'en',
      'open_data',
      ' battery ',
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_processes',
      expect.objectContaining({
        query_text: 'battery',
        data_source: 'tg',
        owner_draft_only: false,
      }),
    );
    expect(result).toEqual({
      data: [],
      page: 1,
      success: true,
      total: 0,
      error: undefined,
    });
  });

  it('deduplicates overlapping current-user and open-data rows in all_data keyword results', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: 'dup', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'dup', version: sampleVersion, total_count: 2, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'dup', version: sampleVersion, total_count: 1, json: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'dup', version: sampleVersion, total_count: 2, json: {} }],
        error: null,
      });

    const result = await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 2 },
      'en',
      'all_data',
      'battery',
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'dup' });
    expect(result.total).toBe(3);
  });
});

describe('getProcessExchange', () => {
  it('filters exchanges by direction and paginates result', async () => {
    const exchanges = [
      { id: 1, exchangeDirection: 'INPUT' },
      { id: 2, exchangeDirection: 'OUTPUT' },
      { id: 3, exchangeDirection: 'input' },
    ];

    const result = await processesApi.getProcessExchange(exchanges, 'input', {
      current: 1,
      pageSize: 1,
    });

    expect(result).toEqual({
      data: [{ id: 1, exchangeDirection: 'INPUT' }],
      page: 1,
      success: true,
      total: 2,
    });
  });

  it('uses default paging values when params are omitted', async () => {
    const exchanges = [{ id: 1, exchangeDirection: 'OUTPUT' }];
    const result = await processesApi.getProcessExchange(exchanges, 'output', {} as any);

    expect(result).toEqual({
      data: [{ id: 1, exchangeDirection: 'OUTPUT' }],
      page: 1,
      success: true,
      total: 1,
    });
  });
});

describe('process_hybrid_search', () => {
  it.each([undefined, 2])(
    'accepts an acknowledged empty matched page %s and clears any previous result total',
    async (current) => {
      mockAuthGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'version-test-token' } },
      });
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { versionScope: 'matched', data: [] },
        error: null,
      });

      const result = await processesApi.process_hybrid_search(
        { current, pageSize: 10 },
        'en',
        'tg',
        'no matching process',
        {},
        'all',
      );

      expect(result).toEqual({ data: [], success: true, page: current ?? 1, total: 0 });
    },
  );

  it('retains two exact matched versions instead of collapsing their shared id', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'version-test-token' } },
    });
    const rows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        version: '01.00.000',
        json: {},
        modified_at: '2026-09-02T00:00:00Z',
        total_count: 2,
      },
      {
        id: '11111111-1111-4111-8111-111111111111',
        version: '01.00.001',
        json: {},
        modified_at: '2026-09-02T00:00:00Z',
        total_count: 2,
      },
    ];
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: rows },
      error: null,
    });
    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'copper',
      {},
    );
    expect(result.success).toBe(true);
    expect(result.data.map((row: any) => row.key)).toEqual(
      rows.map((row) => row.id + ':' + row.version),
    );
    expect(result.total).toBe(2);
  });

  it('refuses an old server response that did not acknowledge matched-version search', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'version-test-token' } },
    });
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        data: [{ id: '11111111-1111-4111-8111-111111111111', version: '01.00.001', json: {} }],
      },
      error: null,
    });
    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'copper',
      {},
    );
    expect(result.data).toEqual([]);
    expect(result.success).toBe(false);
  });

  it('maps hybrid search responses to table rows', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-xyz',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-04-01T00:00:00Z',
        team_id: 'team-456',
        model_id: 'model-hybrid',
        model_version: '01.01.021',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: { en: 'Hybrid name' },
                'common:generalComment': { en: 'hybrid comment' },
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'class-h' },
                  },
                },
              },
              time: {
                'common:referenceYear': '2022',
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': 'US',
                },
              },
            },
            modellingAndValidation: {
              LCIMethodAndAllocation: {
                typeOfDataSet: 'type-h',
              },
            },
          },
        },
      },
    ];
    (hybridData as any).total_count = 42;
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'US', '#text': 'United States' }]);

    const result = await processesApi.process_hybrid_search(
      { current: 3, pageSize: 5 },
      'en',
      'tg',
      'steel',
      {},
      undefined,
      'all',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('process_hybrid_search', {
      headers: { Authorization: 'Bearer token-xyz' },
      body: {
        version_scope: 'matched',
        match_count: 200,
        query: 'steel',
        filter_condition: {},
        data_source: 'tg',
        page_size: 5,
        page_current: 3,
        team_id: '22222222-2222-4222-8222-222222222222',
      },
      region: FunctionRegion.UsEast1,
    });
    expect(mockJsonToList).toHaveBeenCalledWith({ '#text': 'class-h' });
    expect(mockGenProcessName).toHaveBeenCalledWith({ en: 'Hybrid name' }, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith({ en: 'hybrid comment' }, 'en');
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'en',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '2022',
          location: 'United States',
          version: sampleVersion,
          typeOfDataSet: 'type-h',
          modifiedAt: new Date('2024-04-01T00:00:00Z'),
          teamId: 'team-456',
          modelId: 'model-hybrid',
          modelVersion: '01.01.021',
        },
      ],
      page: 3,
      success: true,
      total: 42,
    });
  });

  it('preserves optional filters and rejects an invocation error, even with empty data', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: undefined,
        },
      },
    });
    mockFunctionsInvoke.mockResolvedValueOnce({
      error: { message: 'hybrid failed' },
      data: { versionScope: 'matched', data: [] },
    });
    mockGetTeamIdByUserId.mockResolvedValueOnce('22222222-2222-4222-8222-222222222222');

    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'te',
      'steel',
      { status: 'active' },
      300,
      'LCI result',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('process_hybrid_search', {
      headers: { Authorization: 'Bearer ' },
      body: {
        version_scope: 'matched',
        match_count: 200,
        query: 'steel',
        filter_condition: { status: 'active' },
        data_source: 'te',
        page_size: 10,
        page_current: 1,
        state_code: 300,
        type_of_data_set: 'LCI result',
        team_id: '22222222-2222-4222-8222-222222222222',
      },
      region: FunctionRegion.UsEast1,
    });
    expect(logSpy).toHaveBeenCalledWith('error', { message: 'hybrid failed' });
    expect(result).toEqual({ error: { message: 'hybrid failed' }, data: [], success: false });
    logSpy.mockRestore();
  });

  it('does not broaden team Hybrid search when no selected team is available', async () => {
    const result = await processesApi.process_hybrid_search(
      { current: 2, pageSize: 10 },
      'en',
      'te',
      'steel',
      {},
    );
    const defaultPageResult = await processesApi.process_hybrid_search({}, 'en', 'te', 'steel', {});

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], page: 2, success: true, total: 0 });
    expect(defaultPageResult).toEqual({ data: [], page: 1, success: true, total: 0 });
  });

  it('maps zh hybrid rows with location translation and fallback fields', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-zh',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-05-01T00:00:00Z',
        team_id: 'team-zh',
        model_id: 'model-zh',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: { zh: '流程中文名' },
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'class-zh' },
                  },
                },
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': 'CN',
                },
              },
            },
          },
        },
      },
    ];
    (hybridData as any).total_count = 7;
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': '中国' }]);
    mockGetCachedClassificationData.mockResolvedValueOnce([
      { '@value': 'class-zh', '#text': '分类' },
    ]);

    const result = await processesApi.process_hybrid_search(
      {} as any,
      'zh',
      'tg',
      '关键词',
      {},
      undefined,
      'all',
    );

    expect(mockGetCachedClassificationData).toHaveBeenCalledWith('Process', 'zh', ['all']);
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'zh',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '中国',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-05-01T00:00:00Z'),
          teamId: 'team-zh',
          modelId: 'model-zh',
        },
      ],
      page: 1,
      success: true,
      total: 7,
    });
  });

  it('maps sparse zh hybrid rows with default fallbacks when optional fields are missing', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-zh-sparse',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-05-03T00:00:00Z',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: undefined,
                classificationInformation: {
                  'common:classification': {
                    'common:class': undefined,
                  },
                },
                'common:generalComment': undefined,
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': undefined,
                },
              },
            },
          },
        },
      },
    ];
    (hybridData as any).total_count = 4;
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([]);
    mockGetCachedClassificationData.mockResolvedValueOnce(undefined as any);
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);

    const result = await processesApi.process_hybrid_search(
      {} as any,
      'zh',
      'tg',
      '关键词',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'zh',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '-',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-05-03T00:00:00Z'),
          teamId: undefined,
          modelId: undefined,
        },
      ],
      page: 1,
      success: true,
      total: 4,
    });
  });

  it('maps sparse en hybrid rows with default fallbacks when optional fields are missing', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-en-sparse',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-05-02T00:00:00Z',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: undefined,
                'common:generalComment': undefined,
                classificationInformation: {
                  'common:classification': {
                    'common:class': undefined,
                  },
                },
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': undefined,
                },
              },
            },
          },
        },
      },
    ];
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData, total_count: 5 },
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([]);

    const result = await processesApi.process_hybrid_search(
      {} as any,
      'en',
      'tg',
      'keyword',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'en',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '-',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-05-02T00:00:00Z'),
          teamId: undefined,
          modelId: undefined,
        },
      ],
      page: 1,
      success: true,
      total: 5,
    });
  });

  it('falls back to zero total when hybrid response omits total counts', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-no-total',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-05-04T00:00:00Z',
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: { en: 'No total name' },
                'common:generalComment': { en: 'No total comment' },
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'no-total-class' },
                  },
                },
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': undefined,
                },
              },
            },
          },
        },
      },
    ];
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([]);

    const result = await processesApi.process_hybrid_search(
      {} as any,
      'en',
      'tg',
      'keyword',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'en',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '-',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-05-04T00:00:00Z'),
          teamId: undefined,
          modelId: undefined,
        },
      ],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('retains exact identity when zh hybrid mapping throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-zh',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        total_count: 1,
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'zh-class' },
                  },
                },
              },
            },
          },
        },
      },
    ];
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad zh hybrid class');
    });

    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'zh',
      'tg',
      '关键词',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        { id: sampleId, version: sampleVersion, key: sampleId + ':' + sampleVersion, lang: 'zh' },
      ],
      page: 1,
      success: true,
      total: 1,
    });
    errorSpy.mockRestore();
  });

  it('retains exact identity when en hybrid mapping throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token-en',
        },
      },
    });
    const hybridData: any = [
      {
        id: sampleId,
        version: sampleVersion,
        total_count: 1,
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'en-class' },
                  },
                },
              },
            },
          },
        },
      },
    ];
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { versionScope: 'matched', data: hybridData },
      error: null,
    });
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad en hybrid class');
    });

    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'keyword',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        { id: sampleId, version: sampleVersion, key: sampleId + ':' + sampleVersion, lang: 'en' },
      ],
      page: 1,
      success: true,
      total: 1,
    });
    errorSpy.mockRestore();
  });

  it('returns a failure when no session is available for hybrid search', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await processesApi.process_hybrid_search(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'keyword',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({ data: [], success: false });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});

describe('getProcessDetailByIdAndVersion', () => {
  it('should fetch process detail by id and version successfully', async () => {
    const mockData = [
      {
        id: sampleId,
        version: sampleVersion,
        json: {
          processInformation: { dataSetInformation: { name: { baseName: { '#text': 'Test' } } } },
        },
      },
    ];
    const builder = createQueryBuilder({ data: mockData, error: null });
    mockFrom.mockReturnValue(builder);
    mockGetLangText.mockReturnValue('Test Process');

    const result = await processesApi.getProcessDetailByIdAndVersion([
      { id: sampleId, version: sampleVersion },
    ]);

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(builder.select).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should return error when process not found', async () => {
    const builder = createQueryBuilder({ data: null, error: { message: 'Not found' } });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessDetailByIdAndVersion([
      { id: sampleId, version: sampleVersion },
    ]);

    expect(result).toBeDefined();
  });

  it('should return error when data is empty array', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessDetailByIdAndVersion([
      { id: sampleId, version: sampleVersion },
    ]);

    expect(result).toBeDefined();
  });

  it('should return an empty success result when no id/version pairs are provided', async () => {
    const result = await processesApi.getProcessDetailByIdAndVersion([]);

    expect(result).toEqual({
      data: [],
      success: true,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('getProcessesByIdAndVersion', () => {
  it('should fetch processes by id/version pairs with language formatting', async () => {
    const mockRawData = [
      {
        id: sampleId,
        version: sampleVersion,
        name: [{ '@xml:lang': 'en', '#text': 'Process 1 EN' }],
        'common:generalComment': [{ '@xml:lang': 'en', '#text': 'Comment EN' }],
        typeOfDataSet: 'Unit process, black box',
        'common:referenceYear': '2024',
        modified_at: '2024-01-01T00:00:00Z',
        team_id: 'team-123',
      },
    ];
    const builder = createQueryBuilder({ data: mockRawData, error: null });
    mockFrom.mockReturnValue(builder);
    mockGenProcessName.mockReturnValueOnce('Process 1 EN');
    mockGetLangText.mockReturnValueOnce('Comment EN');

    const result = await processesApi.getProcessesByIdAndVersion(
      [{ id: sampleId, version: sampleVersion }],
      'en',
    );

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(builder.select).toHaveBeenCalled();
    expect(builder.or).toHaveBeenCalled();
    expect(mockGenProcessName).toHaveBeenCalledWith(mockRawData[0].name, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith(mockRawData[0]['common:generalComment'], 'en');
    expect(result.success).toBe(true);
    expect(result.page).toBe(1);
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe(sampleId);
    expect(result.data[0].version).toBe(sampleVersion);
    expect(result.data[0].name).toBe('Process 1 EN');
  });

  it('should return empty result when params are empty', async () => {
    const result = await processesApi.getProcessesByIdAndVersion([], 'en');

    expect(result).toEqual({ data: [], success: true, page: 1, total: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reports database errors instead of a successful incomplete list', async () => {
    const builder = createQueryBuilder({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessesByIdAndVersion(
      [{ id: sampleId, version: sampleVersion }],
      'en',
    );

    expect(result.success).toBe(false);
    expect(result.page).toBe(1);
    expect(result.total).toBe(0);
    expect(result.error).toEqual({ message: 'DB error' });
    expect(result.data).toEqual([]);
  });

  it('maps with fallback values when lang is provided but optional fields are missing', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-06-01T00:00:00Z',
          name: { en: 'Name' },
          'common:generalComment': {},
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessesByIdAndVersion(
      [{ id: sampleId, version: sampleVersion }],
      'en',
    );

    expect(result.data[0]).toMatchObject({
      id: sampleId,
      version: sampleVersion,
      typeOfDataSet: '-',
      referenceYear: '-',
    });
  });

  it('uses empty name and general-comment payloads when lang formatting fields are undefined', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-06-03T00:00:00Z',
          model_id: 'model-lang',
          model_version: '01.01.021',
          name: undefined,
          'common:generalComment': undefined,
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    mockGenProcessName.mockReturnValueOnce('Formatted Name');
    mockGetLangText.mockReturnValueOnce('Formatted Comment');

    const result = await processesApi.getProcessesByIdAndVersion(
      [{ id: sampleId, version: sampleVersion }],
      'en',
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(mockGetLangText).toHaveBeenCalledWith({}, 'en');
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          version: sampleVersion,
          lang: 'en',
          name: 'Formatted Name',
          generalComment: 'Formatted Comment',
          typeOfDataSet: '-',
          referenceYear: '-',
          location: '-',
          modifiedAt: new Date('2024-06-03T00:00:00Z'),
          teamId: undefined,
          modelId: 'model-lang',
          modelVersion: '01.01.021',
        },
      ],
      success: true,
      page: 1,
      total: 1,
    });
  });

  it('returns raw name branch when lang is omitted', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-06-02T00:00:00Z',
          name: { en: 'Raw Name' },
          team_id: 'team-raw',
          user_id: 'user-raw',
          model_id: 'model-raw',
          model_version: null,
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessesByIdAndVersion([
      { id: sampleId, version: sampleVersion },
    ]);

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          version: sampleVersion,
          lang: undefined,
          name: { en: 'Raw Name' },
          typeOfDataSet: '-',
          referenceYear: '-',
          location: '-',
          modifiedAt: new Date('2024-06-02T00:00:00Z'),
          teamId: 'team-raw',
          modelId: 'model-raw',
          modelVersion: null,
          userId: 'user-raw',
        },
      ],
      success: true,
      page: 1,
      total: 1,
    });
  });

  it('returns empty raw rows when lang is omitted and the query payload is missing', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessesByIdAndVersion([
      { id: sampleId, version: sampleVersion },
    ]);

    expect(result).toEqual({
      data: [],
      success: true,
      page: 1,
      total: 0,
    });
  });
});

describe('getProcessDetailByIdsAndVersion', () => {
  it('should fetch processes by multiple ids and single version successfully', async () => {
    const mockData = [
      {
        id: sampleId,
        version: sampleVersion,
        json: { name: 'Process 1' },
        modified_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'id2',
        version: sampleVersion,
        json: { name: 'Process 2' },
        modified_at: '2024-01-02T00:00:00Z',
      },
    ];
    const builder = createQueryBuilder({ data: mockData, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessDetailByIdsAndVersion(
      [sampleId, 'id2'],
      sampleVersion,
    );

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(builder.select).toHaveBeenCalledWith('id,json,version, modified_at');
    expect(builder.eq).toHaveBeenCalledWith('version', sampleVersion);
    expect(builder.in).toHaveBeenCalledWith('id', [sampleId, 'id2']);
    expect(result).toEqual({
      data: mockData,
      success: true,
    });
  });

  it('should return empty array when no ids provided', async () => {
    const result = await processesApi.getProcessDetailByIdsAndVersion([], sampleVersion);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [],
      success: true,
    });
  });

  it('should handle database errors gracefully', async () => {
    const builder = createQueryBuilder({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessDetailByIdsAndVersion([sampleId], sampleVersion);

    expect(result).toEqual({
      data: [],
      success: true,
    });
  });

  it('should return an empty array when the query payload is undefined', async () => {
    const builder = createQueryBuilder({ data: undefined, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.getProcessDetailByIdsAndVersion([sampleId], sampleVersion);

    expect(result).toEqual({
      data: [],
      success: true,
    });
  });
});

describe('validateProcessesByIdAndVersion', () => {
  it('should return true when process exists', async () => {
    const mockData = [{ id: sampleId, version: sampleVersion }];
    const builder = createQueryBuilder({ data: mockData, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.validateProcessesByIdAndVersion(sampleId, sampleVersion);

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(result).toBe(true);
  });

  it('should return false when process is missing', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    const builder2 = createQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValueOnce(builder).mockReturnValueOnce(builder2);

    const result = await processesApi.validateProcessesByIdAndVersion(sampleId, sampleVersion);

    expect(result).toBeDefined();
  });

  it('should handle database error', async () => {
    const builder = createQueryBuilder({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(builder);

    const result = await processesApi.validateProcessesByIdAndVersion(sampleId, sampleVersion);

    expect(result).toBeDefined();
  });
});

describe('getConnectableProcessesTable', () => {
  beforeEach(() => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });
  const classification = [{ scope: 'classification' as const, code: 'C' }];
  const row = {
    id: sampleId,
    version: sampleVersion,
    modified_at: '2024-01-01T00:00:00Z',
    total_count: 120,
    json: {
      processDataSet: {
        processInformation: {
          dataSetInformation: { name: {}, 'common:generalComment': {} },
          geography: { locationOfOperationSupplyOrProduction: { '@location': 'CN' } },
        },
      },
    },
  };

  it('filters opposite-direction exact flow references before server count and pagination', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [{ id: sampleId, version: sampleVersion }],
    });
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': 'China' }]);
    const result = await processesApi.getConnectableProcessesTable(
      {
        current: 3,
        pageSize: 50,
        classification,
        datasetFilters: { flowReference: { id: 'wrong-flow' } },
      },
      { modifiedAt: 'ascend' },
      'en',
      'tg',
      'team-1',
      'input:flow-1',
      '01.00.002',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'query_dataset_catalog',
      expect.objectContaining({
        p_dataset_kind: 'process',
        p_data_source: 'tg',
        p_team_id: 'team-1',
        p_filter_condition: {
          classification,
          flowReference: { id: 'flow-1', version: '01.00.002', direction: 'Output' },
        },
        p_page_current: 3,
        p_page_size: 50,
        p_version_scope: 'all',
        p_sort_by: 'modified_at',
        p_sort_direction: 'asc',
      }),
    );
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      page: 3,
      total: 120,
      success: true,
      data: [{ id: sampleId, isFromLifeCycle: true, location: 'China' }],
    });
  });

  it('uses Input references for output ports and allows server matching any flow version when omitted', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: undefined });
    const result = await processesApi.getConnectableProcessesTable(
      {},
      { name: 'ascend' },
      'en',
      'my',
      [],
      'output:flow-2',
      '',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'query_dataset_catalog',
      expect.objectContaining({
        p_filter_condition: { flowReference: { id: 'flow-2', version: '', direction: 'Input' } },
        p_sort_by: 'modified_at',
        p_sort_direction: 'asc',
        p_page_size: 50,
        p_page_current: 1,
      }),
    );
    expect(result.data[0]).not.toHaveProperty('isFromLifeCycle');
  });

  it('uses the resolved current team instead of a caller-supplied team', async () => {
    mockGetTeamIdByUserId.mockResolvedValueOnce('resolved-team');
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    const result = await processesApi.getConnectableProcessesTable(
      {},
      {},
      'en',
      'te',
      'caller-team',
      'input:flow-1',
      '',
    );
    expect(mockRpc).toHaveBeenCalledWith(
      'query_dataset_catalog',
      expect.objectContaining({ p_team_id: 'resolved-team' }),
    );
    expect(result).toEqual({ data: [], success: true, total: 0, page: 1 });
  });

  it('returns an explicit query failure without falling back to an unfiltered public table', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    const result = await processesApi.getConnectableProcessesTable(
      {},
      {},
      'en',
      'tg',
      [],
      'input:flow-1',
      '',
    );
    expect(result).toEqual({
      data: [],
      success: false,
      total: 0,
      page: 1,
      error: { message: 'DB error' },
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips absent flow identities, missing personal sessions and teams', async () => {
    expect(
      await processesApi.getConnectableProcessesTable({}, {}, 'en', 'tg', [], '', ''),
    ).toMatchObject({ data: [], success: true });
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });
    expect(
      await processesApi.getConnectableProcessesTable({}, {}, 'en', 'my', [], 'input:flow-1', ''),
    ).toMatchObject({ data: [], success: false });
    mockGetTeamIdByUserId.mockResolvedValueOnce(null);
    expect(
      await processesApi.getConnectableProcessesTable({}, {}, 'en', 'te', [], 'input:flow-1', ''),
    ).toMatchObject({ data: [], success: true });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('getProcessTablePgroongaSearch', () => {
  it('should search processes using pgroonga successfully', async () => {
    const mockResponse = {
      data: [{ id: sampleId, name: 'Search Result', version: sampleVersion }],
      error: null,
      count: 1,
    };
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValue(mockResponse);
    mockGetCachedLocationData.mockResolvedValue([]);
    mockGetCachedClassificationData.mockResolvedValue([]);
    mockJsonToList.mockReturnValue([]);

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'search term',
      [],
      100,
      undefined,
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_processes',
      expect.objectContaining({
        query_text: 'search term',
        query_terms: ['search term'],
        owner_draft_only: false,
        type_of_data_set_filter: 'all',
      }),
    );
    expect(result).toBeDefined();
  });

  it('does not send the unsupported process sort payload to the formal RPC', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-xyz', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({ data: [], error: null });

    await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'search term',
      {},
      undefined,
      'all',
      { key: 'baseName', order: 'desc' },
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_processes',
      expect.not.objectContaining({ order_by: expect.anything() }),
    );
  });

  it('should handle empty search results', async () => {
    const mockResponse = {
      data: [],
      error: null,
      count: 0,
    };
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValue(mockResponse);
    mockGetCachedLocationData.mockResolvedValue([]);
    mockGetCachedClassificationData.mockResolvedValue([]);

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'nonexistent',
      [],
      100,
      'all',
    );

    expect(result).toBeDefined();
  });

  it('uses default paging params and optional filter payload in rpc call', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await processesApi.getProcessTablePgroongaSearch(
      {} as any,
      'en',
      'my',
      'keyword',
      { processType: 'target' },
      400,
      'foreground',
    );

    expect(mockRpc).toHaveBeenCalledWith('search_processes', {
      query_text: 'keyword',
      query_terms: ['keyword'],
      owner_draft_only: false,
      filter_condition: { processType: 'target' },
      page_size: 10,
      page_current: 1,
      data_source: 'my',
      state_code_filter: 400,
      team_id_filter: null,
      this_user_id: undefined,
      type_of_data_set_filter: 'foreground',
    });
  });

  it.each(['de', 'fr'] as const)(
    'loads %s process classifications without sending an RPC sort payload',
    async (lang) => {
      mockAuthGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'token-xyz', user: { id: 'user-1' } } },
      });
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            total_count: 1,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    classificationInformation: {
                      'common:classification': {
                        'common:class': [{ '#text': 'Manufacturing' }],
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

      await processesApi.getProcessTablePgroongaSearch(
        { current: 1, pageSize: 10 },
        lang,
        'tg',
        'manufacturing',
        {},
        undefined,
        'all',
        { key: 'baseName', lang, order: 'asc' },
      );

      expect(mockGetCachedClassificationData).toHaveBeenCalledWith('Process', lang, ['all']);
      expect(mockGetLangText).toHaveBeenCalledWith({}, lang);
      expect(mockRpc).toHaveBeenCalledWith(
        'search_processes',
        expect.not.objectContaining({ order_by: expect.anything() }),
      );
    },
  );

  it('logs pgroonga rpc error and returns undefined when no data payload', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 2, pageSize: 5 },
      'en',
      'tg',
      'broken',
      {},
      undefined,
      'all',
    );

    expect(logSpy).toHaveBeenCalledWith('error', { message: 'rpc failed' });
    expect(result).toBeUndefined();
    logSpy.mockRestore();
  });

  it('returns empty success when pgroonga team-data search has no resolved team id', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    mockGetTeamIdByUserId.mockResolvedValueOnce(null);

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'te',
      'keyword',
      {},
      undefined,
      undefined,
    );

    expect(result).toEqual({ data: [], success: true });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps zh pgroonga result rows with location translation and fallback values', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    const rpcRows: any[] = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-06-03T00:00:00Z',
        team_id: 'team-zh',
        model_id: 'model-zh',
        total_count: 3,
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: { zh: '名称' },
                classificationInformation: {
                  'common:classification': {
                    'common:class': { '#text': 'zh-class' },
                  },
                },
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': 'CN',
                },
              },
            },
          },
        },
      },
    ];
    mockRpc.mockResolvedValueOnce({ data: rpcRows, error: null });
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': '中国' }]);
    mockGetCachedClassificationData.mockResolvedValueOnce([
      { '@value': 'zh-class', '#text': '分类' },
    ]);

    const result = await processesApi.getProcessTablePgroongaSearch(
      {} as any,
      'zh',
      'tg',
      '中文',
      {},
      undefined,
      'all',
    );

    expect(mockGetCachedClassificationData).toHaveBeenCalledWith('Process', 'zh', ['all']);
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'zh',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '中国',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-06-03T00:00:00Z'),
          teamId: 'team-zh',
          modelId: 'model-zh',
        },
      ],
      page: 1,
      success: true,
      total: 3,
    });
  });

  it('maps sparse zh pgroonga rows with cache and field fallbacks', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-zh' } } });
    const rpcRows: any[] = [
      {
        id: sampleId,
        version: sampleVersion,
        modified_at: '2024-06-04T00:00:00Z',
        total_count: 2,
        json: {
          processDataSet: {
            processInformation: {
              dataSetInformation: {
                name: undefined,
                classificationInformation: {
                  'common:classification': {
                    'common:class': undefined,
                  },
                },
                'common:generalComment': undefined,
              },
              geography: {
                locationOfOperationSupplyOrProduction: {
                  '@location': undefined,
                },
              },
            },
          },
        },
      },
    ];
    mockRpc.mockResolvedValueOnce({ data: rpcRows, error: null });
    mockGetCachedLocationData.mockResolvedValueOnce([]);
    mockGetCachedClassificationData.mockResolvedValueOnce(undefined as any);
    mockGenClassificationZH.mockReturnValueOnce(undefined as any);

    const result = await processesApi.getProcessTablePgroongaSearch(
      {} as any,
      'zh',
      'tg',
      '中文',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          lang: 'zh',
          name: 'Process Name',
          generalComment: 'General comment',
          classification: 'classification-string',
          referenceYear: '-',
          location: '-',
          version: sampleVersion,
          typeOfDataSet: '-',
          modifiedAt: new Date('2024-06-04T00:00:00Z'),
          teamId: undefined,
          modelId: undefined,
        },
      ],
      page: 1,
      success: true,
      total: 2,
    });
  });

  it('retains exact identity when zh pgroonga mapping throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          total_count: 1,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  classificationInformation: {
                    'common:classification': {
                      'common:class': { '#text': 'zh-class' },
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
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad zh pgroonga class');
    });

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'zh',
      'tg',
      '中文',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        { id: sampleId, version: sampleVersion, key: sampleId + ':' + sampleVersion, lang: 'zh' },
      ],
      page: 1,
      success: true,
      total: 1,
    });
    errorSpy.mockRestore();
  });

  it('retains exact identity when en pgroonga mapping throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-xyz' } } });
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          total_count: 1,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  classificationInformation: {
                    'common:classification': {
                      'common:class': { '#text': 'en-class' },
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
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad en pgroonga class');
    });

    const result = await processesApi.getProcessTablePgroongaSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'english',
      {},
      undefined,
      'all',
    );

    expect(result).toEqual({
      data: [
        { id: sampleId, version: sampleVersion, key: sampleId + ':' + sampleVersion, lang: 'en' },
      ],
      page: 1,
      success: true,
      total: 1,
    });
    errorSpy.mockRestore();
  });
});

describe('getProcessTableUuidMentionSearch', () => {
  beforeEach(() => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-id' },
        },
      },
    });
  });

  const mentionRow = (overrides: any = {}) => ({
    matched_by: 'json',
    matched_entity_table: 'processes',
    rank: 1,
    total_count: 1,
    source_entity_kind: 'process',
    source_id: 'process-ref',
    source_json: {
      processDataSet: {
        processInformation: {
          dataSetInformation: {
            name: {},
            'common:generalComment': {},
            classificationInformation: {
              'common:classification': {
                'common:class': [{ '@value': 'process-class', '#text': 'Process Class' }],
              },
            },
          },
          geography: {
            locationOfOperationSupplyOrProduction: {
              '@location': 'CN',
            },
          },
          time: {
            'common:referenceYear': '2024',
          },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: {
            typeOfDataSet: 'LCI result',
          },
        },
      },
    },
    source_modified_at: '2024-01-01T00:00:00Z',
    source_model_id: 'model-ref',
    source_team_id: 'team-ref',
    source_version: sampleVersion,
    ...overrides,
  });

  it('passes the dataset type to SQL before mapping a complete reference lookup page', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [mentionRow()],
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': 'China' }]);

    const result = await processesApi.getProcessTableUuidMentionSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'd1380000-0000-4000-8000-000000000001',
      '100',
      'LCI result',
      'team-1',
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_dataset_uuid_mentions_page',
      expect.objectContaining({
        p_data_source: 'tg',
        p_filter_condition: { typeOfDataSet: 'LCI result' },
        p_page_size: 10,
        p_dataset_kind: 'process',
        p_state_code: 100,
        p_team_id: 'team-1',

        p_uuid: 'd1380000-0000-4000-8000-000000000001',
      }),
    );
    expect(result.data).toEqual([
      {
        key: `process-ref:${sampleVersion}`,
        id: 'process-ref',
        lang: 'en',
        name: 'Process Name',
        generalComment: 'General comment',
        classification: 'classification-string',
        referenceYear: '2024',
        location: 'China',
        version: sampleVersion,
        typeOfDataSet: 'LCI result',
        modifiedAt: new Date('2024-01-01T00:00:00Z'),
        teamId: 'team-ref',
        modelId: '',
      },
    ]);
  });

  it('maps Chinese reference lookup rows and all dataset types with fallbacks', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        mentionRow({
          source_id: 'process-zh',
          source_json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
                geography: {
                  locationOfOperationSupplyOrProduction: {
                    '@location': 'US',
                  },
                },
              },
            },
          },
          source_modified_at: undefined,
          source_model_id: undefined,
          source_team_id: undefined,
        }),
        mentionRow({
          source_id: 'process-no-location',
          source_json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
            },
          },
        }),
      ],
      error: null,
    });
    mockGetCachedLocationData.mockResolvedValueOnce([]);

    const result = await processesApi.getProcessTableUuidMentionSearch(
      { current: 1, pageSize: 10 },
      'zh',
      'tg',
      'd1380000-0000-4000-8000-000000000001',
      undefined,
      'all',
    );

    expect(mockGetCachedClassificationData).toHaveBeenCalledWith('Process', 'zh', ['all']);
    expect(result.data[0]).toEqual({
      key: `process-zh:${sampleVersion}`,
      id: 'process-zh',
      lang: 'zh',
      name: 'Process Name',
      generalComment: 'General comment',
      classification: 'classification-string',
      referenceYear: '-',
      location: 'US',
      version: sampleVersion,
      typeOfDataSet: '-',
      modifiedAt: new Date(0),
      teamId: '',
      modelId: '',
    });
    expect(result.data[1]).toMatchObject({
      id: 'process-no-location',
      location: '-',
    });
  });

  it('returns fallback rows when reference lookup process mapping throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({
      data: [mentionRow({ source_id: 'process-bad' })],
      error: null,
    });
    mockJsonToList.mockImplementationOnce(() => {
      throw new Error('bad process mention');
    });

    const result = await processesApi.getProcessTableUuidMentionSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'd1380000-0000-4000-8000-000000000001',
    );

    expect(result.data).toEqual([{ id: 'process-bad' }]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns empty table data when reference lookup fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'lookup failed' },
    });

    const result = await processesApi.getProcessTableUuidMentionSearch(
      { current: 1, pageSize: 10 },
      'en',
      'tg',
      'd1380000-0000-4000-8000-000000000001',
      undefined,
      undefined,
      [],
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'search_dataset_uuid_mentions_page',
      expect.objectContaining({
        p_dataset_kind: 'process',
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

describe('contributeProcess', () => {
  const testId = 'process-123';
  const testVersion = '01.00.000';
  const testUserId = 'user-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully contribute process with all reference data', async () => {
    // Arrange - Mock current user
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    // Mock process detail with references
    const mockProcessDetail = {
      processInformation: {
        dataSetInformation: {
          referenceToContact: [
            {
              '@refObjectId': 'contact-1',
              '@version': '01.00.000',
              '@type': 'contact data set',
            },
          ],
        },
      },
    };

    // Mock getProcessDetailByIdAndVersion response (returns {data: [...], success: true})
    const mockBuilder = createQueryBuilder({
      data: [{ json: mockProcessDetail }],
      error: null,
    });
    mockFrom.mockReturnValue(mockBuilder);

    // Mock getAllRefObj to return references
    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
      {
        '@refObjectId': 'source-1',
        '@version': '01.00.000',
        '@type': 'source data set',
      },
    ]);

    // Mock getRefTableName
    // Called during ref processing phase (2 times) and contribution phase (3 times)
    mockGetRefTableName
      .mockReturnValueOnce('contacts') // For contact ref processing
      .mockReturnValueOnce('sources') // For source ref processing
      .mockReturnValueOnce('contacts') // For contact contribution
      .mockReturnValueOnce('sources') // For source contribution
      .mockReturnValueOnce('processes'); // For process contribution

    // Mock getRefData for references
    mockGetRefData
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'contact-1',
          version: '01.00.000',
          stateCode: 10,
          userId: testUserId,
          json: {}, // Empty json means no nested refs
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'source-1',
          version: '01.00.000',
          stateCode: 20,
          userId: testUserId,
          json: {}, // Empty json means no nested refs
        },
      });

    // Mock getAllRefObj for nested calls (should return empty for no nested refs)
    mockGetAllRefObj
      .mockReturnValueOnce([
        {
          '@refObjectId': 'contact-1',
          '@version': '01.00.000',
          '@type': 'contact data set',
        },
        {
          '@refObjectId': 'source-1',
          '@version': '01.00.000',
          '@type': 'source data set',
        },
      ])
      .mockReturnValue([]); // No nested refs in subsequent calls

    // Mock contributeSource
    mockContributeSource
      .mockResolvedValueOnce({ success: true, message: 'Contact contributed' })
      .mockResolvedValueOnce({ success: true, message: 'Source contributed' })
      .mockResolvedValueOnce({ success: true, message: 'Process contributed' });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(mockGetRefData).toHaveBeenCalledTimes(2);
    expect(mockGetRefData).toHaveBeenCalledWith('contact-1', '01.00.000', 'contacts');
    expect(mockGetRefData).toHaveBeenCalledWith('source-1', '01.00.000', 'sources');
    expect(mockContributeSource).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
    expect(result.needContribute).toHaveLength(3);
    expect(result.contributeResults).toHaveLength(3);
  });

  it('should handle missing current user', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue(null);

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.error).toBe(true);
    expect(result.message).toBe('Failed to get current user');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('should handle user without userid', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: undefined });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.error).toBe(true);
    expect(result.message).toBe('Failed to get current user');
  });

  it('should skip references that are already public (stateCode 100)', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {
      processInformation: {
        dataSetInformation: {
          referenceToContact: [
            {
              '@refObjectId': 'contact-1',
              '@version': '01.00.000',
              '@type': 'contact data set',
            },
          ],
        },
      },
    };

    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    // Mock reference with stateCode 100 (public)
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-1',
        version: '01.00.000',
        stateCode: 100,
        userId: testUserId,
        json: {},
      },
    });

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.success).toBe(true);
    // Only the process itself should be contributed, not the already-public reference
    expect(result.needContribute).toBeDefined();
    expect(result.needContribute).toHaveLength(1);
    expect(result.needContribute![0].type).toBe('process data set');
  });

  it('should skip references that are team data (stateCode 200)', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    // Mock reference with stateCode 200 (team data)
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-1',
        version: '01.00.000',
        stateCode: 200,
        userId: testUserId,
        json: {},
      },
    });

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.needContribute).toBeDefined();
    expect(result.needContribute).toHaveLength(1);
    expect(result.needContribute![0].type).toBe('process data set');
  });

  it('should skip references owned by other users', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    // Mock reference owned by different user
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-1',
        version: '01.00.000',
        stateCode: 10,
        userId: 'other-user',
        json: {},
      },
    });

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.needContribute).toBeDefined();
    expect(result.needContribute).toHaveLength(1);
    expect(result.needContribute![0].type).toBe('process data set');
  });

  it('should recursively process nested references', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    // First level reference
    mockGetAllRefObj
      .mockReturnValueOnce([
        {
          '@refObjectId': 'contact-1',
          '@version': '01.00.000',
          '@type': 'contact data set',
        },
      ])
      .mockReturnValueOnce([
        // Second level reference (nested in contact)
        {
          '@refObjectId': 'source-1',
          '@version': '01.00.000',
          '@type': 'source data set',
        },
      ])
      .mockReturnValueOnce([]); // No more nested refs

    mockGetRefTableName
      .mockReturnValueOnce('contacts')
      .mockReturnValueOnce('sources')
      .mockReturnValueOnce('processes');

    // Contact with nested source reference
    mockGetRefData
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'contact-1',
          version: '01.00.000',
          stateCode: 10,
          userId: testUserId,
          json: {
            referenceToSource: {
              '@refObjectId': 'source-1',
              '@version': '01.00.000',
              '@type': 'source data set',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'source-1',
          version: '01.00.000',
          stateCode: 20,
          userId: testUserId,
          json: {},
        },
      });

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(mockGetRefData).toHaveBeenCalledTimes(2);
    expect(result.needContribute).toBeDefined();
    expect(result.needContribute).toHaveLength(3); // contact + source + process
    expect(result.needContribute!.some((item: any) => item.id === 'contact-1')).toBe(true);
    expect(result.needContribute!.some((item: any) => item.id === 'source-1')).toBe(true);
  });

  it('should handle duplicate references (deduplication)', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    // Return same reference twice
    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-1',
        version: '01.00.000',
        stateCode: 10,
        userId: testUserId,
        json: {},
      },
    });

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    // Should only fetch reference data once (deduplicated)
    expect(mockGetRefData).toHaveBeenCalledTimes(1);
    expect(result.needContribute).toHaveLength(2); // contact + process (no duplicates)
  });

  it('should handle invalid table name', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [{ json: mockProcessDetail }], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'unknown-1',
        '@version': '01.00.000',
        '@type': 'unknown type',
      },
    ]);

    // Return null for unknown type (skips getRefData)
    // Then return 'processes' for the process contribution
    mockGetRefTableName.mockReturnValueOnce(null);
    mockGetRefTableName.mockReturnValueOnce('processes');

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    // getRefData should not be called because tableName is null for unknown type
    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.needContribute).toHaveLength(1); // Only process (unknown type was skipped)
  });

  it('should handle getRefData error gracefully', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    // Mock getRefData to throw error
    mockGetRefData.mockRejectedValue(new Error('Network error'));

    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.success).toBe(true);
    // Should continue and only contribute the process itself
    expect(result.needContribute).toHaveLength(1);
  });

  it('should handle contributeSource error', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([
      {
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
        '@type': 'contact data set',
      },
    ]);

    mockGetRefTableName.mockReturnValue('contacts').mockReturnValue('processes');

    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-1',
        version: '01.00.000',
        stateCode: 10,
        userId: testUserId,
        json: {},
      },
    });

    // Mock contributeSource to fail for one item
    mockContributeSource
      .mockRejectedValueOnce(new Error('Contribution failed'))
      .mockResolvedValueOnce({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.success).toBe(true);
    expect(result.contributeResults).toBeDefined();
    expect(result.contributeResults).toHaveLength(2);
    expect(result.contributeResults![0].success).toBe(false);
    expect(result.contributeResults![0].error).toBeDefined();
    expect(result.contributeResults![1].success).toBe(true);
  });

  it('should handle invalid table name during contribution', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([]);

    // Return null for process type (edge case)
    mockGetRefTableName.mockReturnValue(null);

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(result.success).toBe(true);
    expect(result.contributeResults).toBeDefined();
    expect(result.contributeResults).toHaveLength(1);
    expect(result.contributeResults![0].success).toBe(false);
    expect(result.contributeResults![0].error).toBe('Invalid table name');
  });

  it('should handle empty reference list', async () => {
    // Arrange
    mockGetCurrentUser.mockResolvedValue({ userid: testUserId });

    const mockProcessDetail = {};
    const mockBuilder = createQueryBuilder({ data: [mockProcessDetail], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    mockGetAllRefObj.mockReturnValue([]);
    mockGetRefTableName.mockReturnValue('processes');
    mockContributeSource.mockResolvedValue({ success: true });

    // Act
    const result = await processesApi.contributeProcess(testId, testVersion);

    // Assert
    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.needContribute).toBeDefined();
    expect(result.needContribute).toHaveLength(1); // Only the process itself
    expect(result.needContribute![0].id).toBe(testId);
    expect(result.needContribute![0].version).toBe(testVersion);
    expect(result.needContribute![0].type).toBe('process data set');
  });
});

it.each(['create', 'version', 'update'])(
  'keeps an inherited allocation draft unverified through %s',
  async (operation) => {
    const options = { allocationDraft: true };
    if (operation === 'create') await processesApi.createProcess(sampleId, {}, undefined, options);
    if (operation === 'version')
      await processesApi.createProcessVersion(sampleId, sampleVersion, {}, undefined, options);
    if (operation === 'update')
      await processesApi.updateProcess(sampleId, sampleVersion, {}, undefined, options);
    const expected = expect.objectContaining({ ruleVerification: false });
    const call =
      operation === 'version'
        ? mockInvokeDatasetCreateVersion.mock.calls[
            mockInvokeDatasetCreateVersion.mock.calls.length - 1
          ]
        : mockInvokeDatasetCommand.mock.calls[
            mockInvokeDatasetCommand.mock.calls.length - 1
          ]?.slice(1);
    expect(call).toEqual([expected, expected]);
  },
);

describe('process server classification query contract', () => {
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
    const api = require('@/services/processes/api');
    const result = await api.getProcessTableAll(
      params,
      { modifiedAt: 'ascend' },
      'en',
      'my',
      '',
      'all',
      'all',
    );
    expect(rpc).toHaveBeenCalledWith(
      'query_dataset_catalog',
      expect.objectContaining({
        p_dataset_kind: 'process',
        p_data_source: 'my',
        p_filter_condition: { ...{ typeOfDataSet: 'all' }, ...filters },
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
    const api = require('@/services/processes/api');
    await api.getProcessTablePgroongaSearch(
      params,
      'en',
      'my',
      'query',
      { datasetId: 'old' },
      'all',
      'all',
      undefined,
      '',
    );
    expect(rpc).toHaveBeenCalledWith(
      'search_processes',
      expect.objectContaining({
        filter_condition: filters,
        page_size: 100,
        page_current: 4,
      }),
    );
  });

  it('passes complete filters to UUID server pagination', async () => {
    const api = require('@/services/processes/api');
    await api.getProcessTableUuidMentionSearch(
      params,
      'en',
      'my',
      'd1380000-0000-4000-8000-000000000001',
      'all',
      'all',
      '',
    );
    expect(rpc).toHaveBeenCalledWith(
      'search_dataset_uuid_mentions_page',
      expect.objectContaining({
        p_dataset_kind: 'process',
        p_filter_condition: { ...{ typeOfDataSet: 'all' }, ...filters },
        p_page_size: 100,
        p_page_current: 4,
      }),
    );
  });

  it('passes complete filters to hybrid search without filtering one returned page locally', async () => {
    const api = require('@/services/processes/api');
    const { supabase } = jest.requireMock('@/services/supabase');
    const invoke = jest
      .spyOn(supabase.functions, 'invoke')
      .mockResolvedValue({ data: [], error: null });
    await api.process_hybrid_search(
      params,
      'en',
      'my',
      'query',
      { datasetId: 'old' },
      'all',
      'all',
      '',
    );
    expect(invoke).toHaveBeenCalledWith(
      'process_hybrid_search',
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
    const api = require('@/services/processes/api');
    await api.getProcessTableAll(params, {}, 'en', 'tg', '', 'all', 'all', true);
    expect(rpc).toHaveBeenCalledWith(
      'search_open_data_catalog',
      expect.objectContaining({
        p_filter_condition: { ...{ typeOfDataSet: 'all' }, ...filters },
        p_source_filter: 'all',
        p_publication_filter: 'all',
        p_page_size: 100,
        p_page_current: 4,
      }),
    );
  });
});

describe('LCA Analysis classification scope', () => {
  const classification = [{ scope: 'classification' as const, code: 'C' }];
  beforeEach(() => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'actor' } } } });
    mockRpc.mockResolvedValue({
      data: [{ id: 'catalog-id', version: '01.00.001', json: {}, total_count: 7 }],
      error: null,
    });
  });
  it.each(['all_data', 'public_plus_owner_draft'] as const)(
    'normalizes a nullable external dataset-type selection for the complete %s scope',
    async (scope) => {
      // JavaScript callers can supply null for an unselected control even though the typed API
      // declares a string. Undefined is already normalized by the public default parameter.
      const nullableSelection = null as unknown as string;
      const result = await processesApi.listProcessesForLcaAnalysis(
        { current: 2, pageSize: 50, classification },
        'en',
        scope,
        '',
        { modifiedAt: 'ascend' },
        {},
        'all',
        nullableSelection,
      );

      expect(mockAuthGetSession).toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith(
        'query_dataset_catalog',
        expect.objectContaining({
          p_dataset_kind: 'process',
          p_data_source: 'all_data',
          p_filter_condition: { typeOfDataSet: 'all', classification },
          p_version_scope: 'all',
          p_owner_draft_only: scope === 'public_plus_owner_draft',
          p_page_current: 2,
          p_page_size: 50,
          p_sort_by: 'modified_at',
          p_sort_direction: 'asc',
        }),
      );
      expect(result).toMatchObject({
        data: [expect.objectContaining({ id: 'catalog-id', version: '01.00.001' })],
        success: true,
        total: 7,
        page: 2,
      });
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );
  it.each(['all_data', 'public_plus_owner_draft'] as const)(
    'filters the entire %s version scope before count and pagination',
    async (scope) => {
      const result = await processesApi.listProcessesForLcaAnalysis(
        { current: 3, pageSize: 50, classification },
        'en',
        scope,
      );
      expect(mockRpc).toHaveBeenCalledWith(
        'query_dataset_catalog',
        expect.objectContaining({
          p_data_source: 'all_data',
          p_filter_condition: { typeOfDataSet: 'all', classification },
          p_version_scope: 'all',
          p_owner_draft_only: scope === 'public_plus_owner_draft',
          p_page_current: 3,
          p_page_size: 50,
        }),
      );
      expect(result).toMatchObject({
        data: [expect.objectContaining({ id: 'catalog-id' })],
        success: true,
        total: 7,
        page: 3,
      });
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );
  it('retains classification on every rebuilt private/public keyword page', async () => {
    await processesApi.listProcessesForLcaAnalysis(
      { current: 1, pageSize: 50, classification },
      'en',
      'all_data',
      'query',
    );
    expect(mockRpc).toHaveBeenCalled();
    for (const [rpcName, args] of mockRpc.mock.calls) {
      expect(rpcName).toBe('search_processes');
      expect(args.filter_condition.classification).toEqual(classification);
    }
  });
});

describe('Model Result complete exact-process collection', () => {
  const version = '01.00.001';
  const canonicalClass = (path: string[], system = 'ISIC') => ({
    'common:classification': {
      '@name': system,
      'common:class': path.map((code, level) => ({
        '@classId': code,
        '@level': String(level),
        '#text': 'Same translated classification',
      })),
    },
  });
  const exactRow = (index: number, overrides: any = {}) => ({
    id: `process-${String(index).padStart(5, '0')}`,
    version,
    name: { baseName: [{ '@xml:lang': 'en', '#text': `Original process ${index}` }] },
    'common:generalComment': [{ '@xml:lang': 'en', '#text': 'original comment' }],
    'common:referenceYear': 2025,
    '@location': 'CN',
    typeOfDataSet: 'LCI result',
    modified_at: '2026-10-14T00:00:00Z',
    classificationInformation: canonicalClass(['A', 'B']),
    ...overrides,
  });
  const reference = (row: any) => ({ id: row.id, version: row.version });

  function installExactBackend(rows: any[], serverCap = 1000, withCount = true) {
    const builders: any[] = [];
    mockFrom.mockImplementation(() => {
      let keys = new Set<string>();
      let from = 0;
      let through = 49;
      const builder = createQueryBuilder({ data: [], error: null, count: 0 });
      builder.or.mockImplementation((conditions: string) => {
        keys = new Set(
          Array.from(
            conditions.matchAll(/and\(id\.eq\."([^"]+)",version\.eq\."([^"]+)"\)/g),
            (match) => `${match[1]}:${match[2]}`,
          ),
        );
        return builder;
      });
      builder.range.mockImplementation((start: number, end: number) => {
        from = start;
        through = end;
        return builder;
      });
      builder.then = (resolve: any, reject: any) => {
        const visible = rows
          .filter((row) => keys.has(`${row.id}:${row.version}`))
          .sort((left, right) =>
            `${left.id}:${left.version}`.localeCompare(`${right.id}:${right.version}`),
          );
        return Promise.resolve({
          data: visible.slice(from, Math.min(through + 1, from + serverCap)),
          error: null,
          count: withCount ? visible.length : null,
        }).then(resolve, reject);
      };
      builders.push(builder);
      return builder;
    });
    return builders;
  }

  it('loads more than 1000 exact versions without the PostgREST cap and only then filters the complete collection', async () => {
    const rows = Array.from({ length: 1203 }, (_, index) =>
      exactRow(index, {
        classificationInformation: canonicalClass(['A', index === 1202 ? 'TARGET' : 'B']),
      }),
    );
    const builders = installExactBackend(rows, 1000);
    mockGetCachedLocationData.mockResolvedValueOnce([{ '@value': 'CN', '#text': 'China' }]);
    const result = await processesApi.getProcessesByIdAndVersion(rows.map(reference), 'en', {
      classification: [
        { scope: 'classification', code: 'TARGET', system: 'ISIC', path: ['A', 'TARGET'] },
      ],
      keyword: 'original 1202',
    });
    expect(builders).toHaveLength(25);
    expect(result).toMatchObject({
      success: true,
      total: 1,
      page: 1,
      data: [
        {
          id: rows[1202].id,
          version,
          location: 'China',
          referenceYear: 2025,
          typeOfDataSet: 'LCI result',
        },
      ],
    });
    for (const builder of builders) {
      expect(builder.select).toHaveBeenCalledWith(
        expect.stringContaining('classificationInformation'),
        { count: 'exact' },
      );
      expect(builder.order).toHaveBeenCalledWith('id', { ascending: true });
      expect(builder.order).toHaveBeenCalledWith('version', { ascending: true });
      expect(builder.or.mock.calls[0][0].match(/and\(/g).length).toBeLessThanOrEqual(50);
    }
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGetCachedLocationData).toHaveBeenCalledWith('en', ['CN']);
  });

  it('continues smaller capped responses using exact count rather than treating the first short page as complete', async () => {
    const rows = Array.from({ length: 70 }, (_, index) => exactRow(index));
    const builders = installExactBackend(rows, 17);
    const result = await processesApi.getProcessesByIdAndVersion(rows.map(reference));
    expect(result).toMatchObject({ success: true, total: 70 });
    expect(result.data.map((row: any) => row.key)).toEqual(
      rows.map((row) => `${row.id}:${row.version}`),
    );
    expect(builders.length).toBeGreaterThan(2);
    expect(builders[1].range).toHaveBeenCalledWith(17, 66);
    expect(mockGetCachedLocationData).not.toHaveBeenCalled();
    expect(result.data[0].location).toBe('CN');
  });

  it('probes to an empty page when a response count is absent instead of assuming a short server-capped page is complete', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => exactRow(index));
    const refs = [...rows.map(reference), { id: 'inaccessible', version }];
    const builders = installExactBackend(rows, 7, false);
    const result = await processesApi.getProcessesByIdAndVersion(refs);
    expect(result).toMatchObject({ success: true, total: 20 });
    expect(builders).toHaveLength(4);
    expect(builders[3].range).toHaveBeenCalledWith(20, 40);
  });

  it('deduplicates identical references, retains distinct exact versions, and preserves inaccessible-row RLS behavior', async () => {
    const first = exactRow(1, { version: '01.00.000' });
    const second = exactRow(1, { version: '01.00.002', '@location': undefined });
    installExactBackend([first, second, exactRow(99)]);
    const result = await processesApi.getProcessesByIdAndVersion(
      [reference(first), reference(second), reference(first), { id: 'inaccessible', version }],
      'en',
    );
    expect(result).toMatchObject({ success: true, total: 2 });
    expect(result.data.map((row: any) => row.key)).toEqual([
      `${first.id}:01.00.000`,
      `${first.id}:01.00.002`,
    ]);
    expect(result.data[1].location).toBe('-');
    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('uses canonical systems and full paths independently of localized display names or labels', async () => {
    const rows = [
      exactRow(1, { classificationInformation: canonicalClass(['A', 'B'], 'ISIC') }),
      exactRow(2, { classificationInformation: canonicalClass(['A', 'B'], 'Other') }),
      exactRow(3, { classificationInformation: canonicalClass(['X', 'B'], 'ISIC') }),
      exactRow(4, {
        classificationInformation: {
          'common:classification': [
            { '@name': 'ISIC', 'common:class': { '@classId': 'A', '@level': '0' } },
            { '@name': 'Other', 'common:class': { '@classId': 'B', '@level': '1' } },
          ],
        },
      }),
    ];
    installExactBackend(rows);
    const result = await processesApi.getProcessesByIdAndVersion(rows.map(reference), 'en', {
      classification: [{ scope: 'classification', code: 'B', path: ['A', 'B'], system: 'ISIC' }],
    });
    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe(rows[0].id);
  });

  it('reports a failed later batch without presenting the first batch as the complete result', async () => {
    const rows = Array.from({ length: 70 }, (_, index) => exactRow(index));
    installExactBackend(rows);
    const backend = mockFrom.getMockImplementation()!;
    let calls = 0;
    mockFrom.mockImplementation((...args: any[]) =>
      calls++ === 0
        ? backend(...args)
        : createQueryBuilder({
            data: null,
            error: { message: 'second batch failed' },
            count: null,
          }),
    );
    const result = await processesApi.getProcessesByIdAndVersion(rows.map(reference), 'en');
    expect(result).toEqual({
      data: [],
      success: false,
      page: 1,
      total: 0,
      error: { message: 'second batch failed' },
    });
  });

  it.each([
    { data: [], error: null, count: 1, errorText: 'Incomplete exact-process response' },
    { data: [exactRow(2)], error: null, count: 1, errorText: 'Unexpected exact-process identity' },
    { data: [exactRow(1)], error: null, count: 2, errorText: 'Invalid exact-process count' },
  ])(
    'rejects incomplete or inconsistent exact-version responses: $errorText',
    async ({ errorText, ...response }) => {
      mockFrom.mockReturnValue(createQueryBuilder(response));
      const result = await processesApi.getProcessesByIdAndVersion([reference(exactRow(1))], 'en');
      expect(result).toMatchObject({
        success: false,
        total: 0,
        data: [],
        error: new Error(errorText),
      });
    },
  );

  it('fails when a backend repeats one page without advancing unique exact references', async () => {
    const rows = [exactRow(1), exactRow(2)];
    mockFrom.mockReturnValue(createQueryBuilder({ data: [rows[0]], error: null, count: 2 }));
    const result = await processesApi.getProcessesByIdAndVersion(rows.map(reference), 'en');
    expect(result).toMatchObject({
      success: false,
      total: 0,
      error: new Error('Incomplete exact-process response'),
    });
  });

  it('validates classification before issuing raw reads and quotes exact identity values', async () => {
    const result = await processesApi.getProcessesByIdAndVersion([reference(exactRow(1))], 'en', {
      classification: [{ scope: 'classification', code: 'B', path: ['A', 'C'] }],
    });
    expect(result).toMatchObject({ success: false, total: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
    const row = exactRow(1, { id: 'quoted"identity', version: 'slash\\version' });
    const builder = createQueryBuilder({ data: [row], error: null, count: 1 });
    mockFrom.mockReturnValueOnce(builder);
    await processesApi.getProcessesByIdAndVersion([reference(row)]);
    expect(builder.or).toHaveBeenCalledWith(
      'and(id.eq."quoted\\"identity",version.eq."slash\\\\version")',
    );
  });
});
