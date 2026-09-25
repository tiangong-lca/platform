/**
 * Tests for general service API functions
 * Path: src/services/general/api.ts
 */

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuthGetSession = jest.fn();
const mockFunctionsInvoke = jest.fn();
const mockGetLocale = jest.fn(() => 'en-US');
const mockGetILCDClassification = jest.fn();
const mockGetILCDFlowCategorizationAll = jest.fn();
const mockGetILCDLocationByValues = jest.fn();
const mockAntdMessage = {
  error: jest.fn(),
  success: jest.fn(),
};
const mockGenClassificationZH = jest.fn(() => ['classification-zh']);
const mockClassificationToString = jest.fn(() => 'classification-string');
const mockJsonToList = jest.fn<string[], any[]>(() => []);
const mockGetLangText = jest.fn((value: any, lang: string) => {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const item = value.find((entry: any) => entry?.['@xml:lang'] === lang);
    return item?.['#text'] ?? '-';
  }
  if (typeof value === 'object') {
    return value?.[lang] ?? value?.['#text'] ?? '-';
  }
  return String(value);
});

jest.mock('@/services/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (...args: any[]) => mockFrom.apply(null, args),
    rpc: (...args: any[]) => mockRpc.apply(null, args),
    auth: {
      getSession: (...args: any[]) => mockAuthGetSession.apply(null, args),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke.apply(null, args),
    },
  },
}));

jest.mock('@/contexts/AntdAppContext', () => ({
  __esModule: true,
  dispatchAntdAppAction: (action: any) => action({ message: mockAntdMessage }),
}));

jest.mock('umi', () => ({
  __esModule: true,
  getLocale: (...args: any[]) => mockGetLocale.apply(null, args),
}));

jest.mock('@/services/classifications/api', () => ({
  __esModule: true,
  getILCDClassification: (...args: any[]) => mockGetILCDClassification.apply(null, args),
  getILCDFlowCategorizationAll: (...args: any[]) =>
    mockGetILCDFlowCategorizationAll.apply(null, args),
}));

jest.mock('@/services/locations/api', () => ({
  __esModule: true,
  getILCDLocationByValues: (...args: any[]) => mockGetILCDLocationByValues.apply(null, args),
}));

jest.mock('@/services/general/util', () => {
  const actual: any = jest.requireActual('@/services/general/util');
  return {
    __esModule: true,
    ...actual,
    genLocalizedClassification: (...args: any[]) => mockGenClassificationZH.apply(null, args),
    genClassificationZH: (...args: any[]) => mockGenClassificationZH.apply(null, args),
    classificationToString: (...args: any[]) => mockClassificationToString.apply(null, args),
    getLangText: (...args: any[]) => mockGetLangText.apply(null, args),
    jsonToList: (...args: any[]) => mockJsonToList.apply(null, args),
  };
});

import * as generalApi from '@/services/general/api';
import { FunctionRegion } from '@supabase/supabase-js';

const deTeamMessages = require('@/locales/de-DE/pages_teams').default as Record<string, string>;
const frTeamMessages = require('@/locales/fr-FR/pages_teams').default as Record<string, string>;

const messageMock = mockAntdMessage;

const createQueryBuilder = <T>(resolvedValue: T) => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(resolvedValue),
    then: (resolve: any, reject?: any) => Promise.resolve(resolvedValue).then(resolve, reject),
  };
  return builder;
};

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockRpc.mockImplementation((...args: any[]) => mockFrom.apply(null, args));
  mockAuthGetSession.mockReset();
  mockFunctionsInvoke.mockReset();
  mockGetLocale.mockReset();
  mockGetLocale.mockReturnValue('en-US');
  messageMock.error.mockReset();
  messageMock.success.mockReset();
  mockGetILCDClassification.mockReset();
  mockGetILCDClassification.mockResolvedValue({ data: {} });
  mockGetILCDFlowCategorizationAll.mockReset();
  mockGetILCDFlowCategorizationAll.mockResolvedValue({ data: {} });
  mockGetILCDLocationByValues.mockReset();
  mockGetILCDLocationByValues.mockResolvedValue({ data: [] });
  mockGenClassificationZH.mockReset();
  mockGenClassificationZH.mockReturnValue(['classification-zh']);
  mockClassificationToString.mockReset();
  mockClassificationToString.mockReturnValue('classification-string');
  mockGetLangText.mockReset();
  mockGetLangText.mockImplementation((value: any, lang: string) => {
    if (!value) return '-';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const item = value.find((entry: any) => entry?.['@xml:lang'] === lang);
      return item?.['#text'] ?? '-';
    }
    if (typeof value === 'object') {
      return value?.[lang] ?? value?.['#text'] ?? '-';
    }
    return String(value);
  });
});

describe('createLegacyMutationRemovedResult', () => {
  it('wraps the deprecation error in a 410 mutation result envelope', () => {
    expect(generalApi.createLegacyMutationRemovedResult('legacyBoundary')).toEqual({
      data: null,
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'legacyBoundary',
        hint: '',
      },
      count: null,
      status: 410,
      statusText: 'LEGACY_ENDPOINT_REMOVED',
    });
  });
});

describe('lang normalization metadata helpers', () => {
  it('detects whether validation-time normalization produced draft changes', () => {
    expect(generalApi.hasLangNormalizationDraftChanges(null)).toBe(false);
    expect(
      generalApi.hasLangNormalizationDraftChanges({
        langSupplementedPlaceholderPaths: [],
        langTranslatedPaths: [],
      }),
    ).toBe(false);
    expect(
      generalApi.hasLangNormalizationDraftChanges({
        langSupplementedPlaceholderPaths: ['title'],
        langTranslatedPaths: [],
      }),
    ).toBe(true);
    expect(
      generalApi.hasLangNormalizationDraftChanges({
        langSupplementedPlaceholderPaths: [],
        langTranslatedPaths: ['description'],
      }),
    ).toBe(true);
  });

  it('builds normalization metadata with raw-payload and empty-array fallbacks', () => {
    const rawPayload = { title: 'raw' };

    expect(
      generalApi.buildLangNormalizationMetadata(
        {
          payload: { title: 'normalized' },
          supplementedEnglishPlaceholderPaths: ['title'],
          translatedPaths: ['description'],
        },
        rawPayload,
      ),
    ).toEqual({
      normalizedJsonOrdered: { title: 'normalized' },
      langSupplementedPlaceholderPaths: ['title'],
      langTranslatedPaths: ['description'],
    });

    expect(generalApi.buildLangNormalizationMetadata({}, rawPayload)).toEqual({
      normalizedJsonOrdered: rawPayload,
      langSupplementedPlaceholderPaths: [],
      langTranslatedPaths: [],
    });
  });

  it('attaches normalization metadata only for validation intent', () => {
    const result = { data: 'ok' };
    const metadata = {
      normalizedJsonOrdered: { title: 'normalized' },
      langSupplementedPlaceholderPaths: ['title'],
      langTranslatedPaths: ['description'],
    };

    expect(generalApi.attachLangNormalizationMetadata(result, metadata)).toBe(result);
    expect(
      generalApi.attachLangNormalizationMetadata(result, metadata, {
        intent: 'save',
      }),
    ).toBe(result);
    expect(
      generalApi.attachLangNormalizationMetadata(result, metadata, {
        intent: 'validation',
      }),
    ).toEqual({
      ...result,
      ...metadata,
    });
    expect(
      generalApi.attachLangNormalizationMetadata(undefined as any, metadata, {
        intent: 'validation',
      }),
    ).toEqual(metadata);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const sampleId = '12345678-1234-1234-1234-123456789012';
const sampleVersion = '01.00.000';

const createErrorContext = (body: Record<string, unknown>, status: number) => ({
  status,
  text: jest.fn().mockResolvedValue(JSON.stringify(body)),
});

describe('exportDataApi', () => {
  it('should select lifecycle model fields when table is lifecyclemodels', async () => {
    const resultPayload = { data: [{ json_ordered: { foo: 'bar' }, json_tg: {} }] };
    const builder = createQueryBuilder(resultPayload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.exportDataApi('lifecyclemodels', sampleId, sampleVersion);

    expect(mockFrom).toHaveBeenCalledWith('lifecyclemodels');
    expect(builder.select).toHaveBeenCalledWith('json_ordered,json_tg');
    expect(builder.eq).toHaveBeenCalledWith('version', sampleVersion);
    expect(result).toBe(resultPayload);
  });

  it('should select json_ordered for other tables', async () => {
    const payload = { data: [{ json_ordered: { foo: 'bar' } }] };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.exportDataApi('flows', sampleId, sampleVersion);

    expect(mockFrom).toHaveBeenCalledWith('flows');
    expect(builder.select).toHaveBeenCalledWith('json_ordered');
    expect(builder.eq).toHaveBeenCalledWith('version', sampleVersion);
    expect(result).toBe(payload);
  });
});

describe('getDataDetail', () => {
  it('should return transformed detail when record is found', async () => {
    const payload = {
      data: [
        {
          version: sampleVersion,
          json: { foo: 'bar' },
          modified_at: '2023-01-01T00:00:00Z',
          state_code: 100,
          rule_verification: 'ok',
          user_id: 'user-1',
        },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getDataDetail(sampleId, sampleVersion, 'flows');

    expect(builder.select).toHaveBeenCalledWith(
      'json,version, modified_at,id,state_code,rule_verification,user_id',
    );
    expect(result).toEqual({
      data: {
        id: sampleId,
        version: sampleVersion,
        json: { foo: 'bar' },
        modifiedAt: '2023-01-01T00:00:00Z',
        stateCode: 100,
        ruleVerification: 'ok',
        userId: 'user-1',
      },
      success: true,
    });
  });

  it('should fallback to latest version when version is not provided', async () => {
    const fallbackPayload = {
      data: [
        {
          version: sampleVersion,
          json: { foo: 'bar' },
          modified_at: '2023-01-02T00:00:00Z',
          state_code: 200,
          rule_verification: 'pending',
          user_id: 'user-2',
        },
      ],
    };
    const builder = createQueryBuilder(fallbackPayload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getDataDetail(sampleId, '', 'flows');

    expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(0, 0);
    expect(result.data?.version).toBe(sampleVersion);
  });

  it('should treat a non-string version as an empty version filter', async () => {
    const fallbackPayload = {
      data: [
        {
          version: sampleVersion,
          json: { foo: 'bar' },
          modified_at: '2023-01-02T00:00:00Z',
          state_code: 200,
          rule_verification: 'pending',
          user_id: 'user-2',
        },
      ],
    };
    const builder = createQueryBuilder(fallbackPayload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getDataDetail(sampleId, 123 as any, 'flows');

    expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
    expect(result.data?.version).toBe(sampleVersion);
  });
});

describe('attachStateCodesToRows', () => {
  it('should attach state codes by exact id and version match', async () => {
    const payload = {
      data: [
        {
          id: 'row-1',
          version: '01.00.000',
          state_code: 20,
        },
      ],
      error: null,
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.attachStateCodesToRows('processes', [
      { id: 'row-1', version: '01.00.000' },
      { id: 'row-1', version: '02.00.000' },
    ]);

    expect(mockFrom).toHaveBeenCalledWith('processes');
    expect(builder.select).toHaveBeenCalledWith('id,version,state_code');
    expect(builder.in).toHaveBeenCalledWith('id', ['row-1']);
    expect(result).toEqual([
      { id: 'row-1', version: '01.00.000', stateCode: 20 },
      { id: 'row-1', version: '02.00.000' },
    ]);
  });

  it('should skip querying when rows already include state codes', async () => {
    const rows = [{ id: 'row-1', version: '01.00.000', stateCode: 10 }];

    const result = await generalApi.attachStateCodesToRows('processes', rows);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual(rows);
  });
});

describe('getDataDetailById', () => {
  it('should return query result for valid id', async () => {
    const payload = { data: [{ id: sampleId, version: sampleVersion }] };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getDataDetailById(sampleId, 'flows');

    expect(builder.select).toHaveBeenCalledWith(
      'json,version, modified_at,id,state_code,rule_verification,user_id',
    );
    expect(builder.eq).toHaveBeenCalledWith('id', sampleId);
    expect(result).toEqual(payload);
  });

  it('should return null for invalid id', async () => {
    const result = await generalApi.getDataDetailById('bad-id', 'flows');

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('getRefDataByIds', () => {
  it('should return failure when table is missing', async () => {
    const result = await generalApi.getRefDataByIds([sampleId], '');

    expect(result).toEqual({ data: null, success: false });
  });

  it('should fetch state codes for provided ids', async () => {
    const payload = {
      data: [
        { id: sampleId, version: sampleVersion, state_code: 100 },
        { id: '87654321-1234-1234-1234-123456789012', version: '02.00.000', state_code: 200 },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getRefDataByIds(
      [sampleId, '87654321-1234-1234-1234-123456789012'],
      'flows',
    );

    expect(builder.select).toHaveBeenCalledWith('state_code,id,version');
    expect(builder.in).toHaveBeenCalledWith('id', [
      sampleId,
      '87654321-1234-1234-1234-123456789012',
    ]);
    expect(result).toEqual({ data: payload.data, success: true });
  });
});

describe('getRefData', () => {
  it('should short-circuit when table is not provided', async () => {
    const result = await generalApi.getRefData(sampleId, sampleVersion, '');
    expect(result).toEqual({ data: null, success: false });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('should return reference data when found', async () => {
    const primaryPayload = {
      data: [
        {
          state_code: 100,
          json: { foo: 'bar' },
          rule_verification: 'ok',
          user_id: 'user-1',
        },
      ],
    };
    const builder = createQueryBuilder(primaryPayload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getRefData(sampleId, sampleVersion, 'flows');

    expect(builder.select).toHaveBeenCalledWith(
      'id,version,state_code,json,rule_verification,user_id,team_id',
    );
    expect(builder.eq).toHaveBeenCalledWith('version', sampleVersion);
    expect(result).toEqual({
      data: {
        id: undefined,
        version: undefined,
        stateCode: 100,
        json: { foo: 'bar' },
        ruleVerification: 'ok',
        teamId: undefined,
        userId: 'user-1',
      },
      success: true,
    });
  });

  it('should request team_id when filtering by team', async () => {
    const primaryPayload = {
      data: [
        {
          team_id: 'team-1',
          state_code: 100,
          json: { foo: 'bar' },
          rule_verification: 'ok',
          user_id: 'user-1',
        },
      ],
    };
    const builder = createQueryBuilder(primaryPayload);
    mockFrom.mockReturnValueOnce(builder);

    await generalApi.getRefData(sampleId, sampleVersion, 'flows', 'team-1');

    expect(builder.select).toHaveBeenCalledWith(
      'id,version,state_code,json,rule_verification,user_id,team_id',
    );
  });

  it('should prefer the matching team record when a non-default team id is provided', async () => {
    const payload = {
      data: [
        {
          team_id: 'team-1',
          state_code: 100,
          json: { source: 'team-1' },
          rule_verification: 'ok',
          user_id: 'user-1',
        },
        {
          team_id: 'team-2',
          state_code: 200,
          json: { source: 'team-2' },
          rule_verification: 'pending',
          user_id: 'user-2',
        },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getRefData(sampleId, sampleVersion, 'flows', 'team-2');

    expect(result).toEqual({
      data: expect.objectContaining({
        stateCode: 200,
        teamId: 'team-2',
        json: { source: 'team-2' },
        ruleVerification: 'pending',
        userId: 'user-2',
      }),
      success: true,
    });
  });

  it('should keep the first record when the provided team id is the default placeholder', async () => {
    const payload = {
      data: [
        {
          team_id: 'team-1',
          state_code: 100,
          json: { source: 'first' },
          rule_verification: 'ok',
          user_id: 'user-1',
        },
        {
          team_id: '00000000-0000-0000-0000-000000000000',
          state_code: 300,
          json: { source: 'default-team' },
          rule_verification: 'review',
          user_id: 'user-2',
        },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getRefData(
      sampleId,
      sampleVersion,
      'flows',
      '00000000-0000-0000-0000-000000000000',
    );

    expect(result).toEqual({
      data: expect.objectContaining({
        stateCode: 100,
        teamId: 'team-1',
        json: { source: 'first' },
        ruleVerification: 'ok',
        userId: 'user-1',
      }),
      success: true,
    });
  });

  it('should return failure when no reference rows are found after querying', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getRefData(sampleId, sampleVersion, 'flows');

    expect(result).toEqual({
      data: null,
      success: false,
    });
  });
});

describe('updateStateCodeApi', () => {
  it('should return a structured deprecation error for legacy direct state updates', async () => {
    const result = await generalApi.updateStateCodeApi(sampleId, sampleVersion, 'flows', 300);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'updateStateCodeApi:flows',
        hint: '',
      },
    });
  });

  it('should return a deprecation error even when session is missing', async () => {
    const result = await generalApi.updateStateCodeApi(sampleId, sampleVersion, 'flows', 100);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'updateStateCodeApi:flows',
        hint: '',
      },
    });
  });
});

describe('invokeDatasetCommand', () => {
  it('normalizes command envelopes into legacy mutation results', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_save_draft',
        data: {
          id: sampleId,
          version: sampleVersion,
        },
      },
      error: null,
    });

    const result = await generalApi.invokeDatasetCommand(
      'app_dataset_save_draft',
      {
        id: sampleId,
        version: sampleVersion,
        table: 'flows',
        jsonOrdered: { ordered: true },
      },
      {
        ruleVerification: false,
      },
    );

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('app_dataset_save_draft', {
      headers: { Authorization: 'Bearer token-cmd' },
      body: {
        id: sampleId,
        version: sampleVersion,
        table: 'flows',
        jsonOrdered: { ordered: true },
      },
      region: expect.anything(),
    });
    expect(result).toEqual({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          rule_verification: false,
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('normalizes array payloads without wrapping them again', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
        },
      ],
      error: null,
    });

    const result = await generalApi.invokeDatasetCommand(
      'app_dataset_save_draft',
      {
        id: sampleId,
        version: sampleVersion,
        table: 'flows',
        jsonOrdered: { ordered: true },
      },
      {
        ruleVerification: true,
      },
    );

    expect(result).toEqual({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          rule_verification: true,
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('invokes the create-version command boundary with the supplied body', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_create_version',
        data: {
          id: sampleId,
          version: '01.00.001',
        },
      },
      error: null,
    });

    const body = {
      id: sampleId,
      table: 'flows' as const,
      sourceVersion: sampleVersion,
      jsonOrdered: { ordered: true },
      ruleVerification: true,
    };

    const result = await generalApi.invokeDatasetCreateVersion(body, {
      ruleVerification: true,
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('app_dataset_create_version', {
      headers: { Authorization: 'Bearer token-cmd' },
      body,
      region: expect.anything(),
    });
    expect(result).toEqual({
      data: [
        {
          id: sampleId,
          version: '01.00.001',
          rule_verification: true,
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('uses default create-version command options when omitted', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_create_version',
        data: {
          id: sampleId,
          version: '01.00.001',
        },
      },
      error: null,
    });

    await generalApi.invokeDatasetCreateVersion({
      id: sampleId,
      table: 'flows',
      sourceVersion: sampleVersion,
      jsonOrdered: { ordered: true },
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'app_dataset_create_version',
      expect.objectContaining({
        body: expect.objectContaining({
          id: sampleId,
          sourceVersion: sampleVersion,
        }),
      }),
    );
  });

  it('returns an empty normalized array when the command envelope has null data', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_save_draft',
        data: null,
      },
      error: null,
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('returns an auth-required error when no session is available', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null } });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: null,
      error: {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        details: '',
        hint: '',
      },
      count: null,
      status: 401,
      statusText: 'AUTH_REQUIRED',
    });
  });

  it('flattens command error details back into the legacy error shape', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Forbidden',
        context: createErrorContext(
          {
            code: 'DATA_UNDER_REVIEW',
            message: 'Data is under review and cannot be modified',
            details: {
              state_code: 20,
              review_state_code: 20,
            },
          },
          403,
        ),
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: expect.objectContaining({
        message: 'Data is under review and cannot be modified',
        code: 'DATA_UNDER_REVIEW',
        state_code: 20,
      }),
      count: null,
      status: 403,
      statusText: 'DATA_UNDER_REVIEW',
    });

    consoleLogSpy.mockRestore();
  });

  it('uses review_state_code from object details when state_code is absent', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Review still pending',
        context: createErrorContext(
          {
            code: 'REVIEW_PENDING',
            message: 'Review is still pending',
            details: {
              review_state_code: 55,
            },
          },
          409,
        ),
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: expect.objectContaining({
        message: 'Review is still pending',
        code: 'REVIEW_PENDING',
        state_code: 55,
        review_state_code: 55,
      }),
      count: null,
      status: 409,
      statusText: 'REVIEW_PENDING',
    });

    consoleLogSpy.mockRestore();
  });

  it('ignores non-object error details when normalizing function invoke errors', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Malformed payload',
        context: createErrorContext(
          {
            code: 'MALFORMED_PAYLOAD',
            message: 'Malformed payload',
            details: 'not-an-object',
          },
          400,
        ),
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: expect.objectContaining({
        message: 'Malformed payload',
        code: 'MALFORMED_PAYLOAD',
        details: 'not-an-object',
      }),
      count: null,
      status: 400,
      statusText: 'MALFORMED_PAYLOAD',
    });
    expect(result.error).not.toHaveProperty('state_code');
    expect(result.error).not.toHaveProperty('review_state_code');

    consoleLogSpy.mockRestore();
  });

  it('drops invalid state-code details that are not numeric', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Invalid state details',
        context: createErrorContext(
          {
            code: 'INVALID_STATE_DETAILS',
            message: 'Invalid state details',
            details: {
              state_code: '20',
              review_state_code: '21',
            },
          },
          422,
        ),
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: expect.objectContaining({
        message: 'Invalid state details',
        code: 'INVALID_STATE_DETAILS',
      }),
      count: null,
      status: 422,
      statusText: 'INVALID_STATE_DETAILS',
    });
    expect(result.error).not.toHaveProperty('state_code');
    expect(result.error).not.toHaveProperty('review_state_code');

    consoleLogSpy.mockRestore();
  });

  it('prefers top-level state codes from the parsed edge-function error body', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Conflict',
        context: createErrorContext(
          {
            code: 'STATE_CONFLICT',
            message: 'Conflict',
            state_code: 91,
            review_state_code: 81,
            details: {
              state_code: 20,
              review_state_code: 10,
            },
          },
          409,
        ),
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: expect.objectContaining({
        message: 'Conflict',
        code: 'STATE_CONFLICT',
        state_code: 91,
        review_state_code: 81,
      }),
      count: null,
      status: 409,
      statusText: 'STATE_CONFLICT',
    });

    consoleLogSpy.mockRestore();
  });

  it('falls back to a generic function error when invoke errors have no context', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-cmd' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Network failure',
      },
    });

    const result = await generalApi.invokeDatasetCommand('app_dataset_save_draft', {
      id: sampleId,
      version: sampleVersion,
      table: 'flows',
      jsonOrdered: { ordered: true },
    });

    expect(result).toEqual({
      data: null,
      error: {
        message: 'Network failure',
        code: 'FUNCTION_ERROR',
        details: '',
        hint: '',
      },
      count: null,
      status: 500,
      statusText: 'FUNCTION_ERROR',
    });

    consoleLogSpy.mockRestore();
  });
});

describe('getReviewsOfData', () => {
  it('should return reviews array when present', async () => {
    const payload = { data: [{ reviews: ['review-1'] }] };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getReviewsOfData(sampleId, sampleVersion, 'flows');

    expect(builder.select).toHaveBeenCalledWith('reviews');
    expect(result).toEqual(['review-1']);
  });

  it('should return empty array when no reviews exist', async () => {
    const payload = { data: [{}] };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getReviewsOfData(sampleId, sampleVersion, 'flows');

    expect(result).toEqual([]);
  });
});

describe('updateDateToReviewState', () => {
  it('should return a structured deprecation error for legacy review-state updates', async () => {
    const payload = { foo: 'bar' };

    const result = await generalApi.updateDateToReviewState(
      sampleId,
      sampleVersion,
      'flows',
      payload,
    );

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'updateDateToReviewState:flows',
        hint: '',
      },
    });
  });
});

describe('getTeamIdByUserId', () => {
  it('should return first non-invited team id', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    const payload = {
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'member',
        },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getTeamIdByUserId();

    expect(mockRpc).toHaveBeenCalledWith('qry_membership_get_mine');
    expect(result).toBe('team-123');
  });

  it('should return null when user is invited', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    const payload = {
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'is_invited',
        },
      ],
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getTeamIdByUserId();

    expect(result).toBeNull();
  });
});

describe('contributeSource', () => {
  it('should invoke update when user belongs to a team', async () => {
    const sessionValue = {
      data: {
        session: {
          user: { id: 'user-1' },
          access_token: 'token-3',
        },
      },
    };
    mockAuthGetSession.mockResolvedValue(sessionValue);
    const rolesBuilder = createQueryBuilder({
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'member',
        },
      ],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_assign_team',
        data: { id: sampleId, team_id: 'team-123' },
      },
      error: null,
    });

    const result = await generalApi.contributeSource('flows', sampleId, sampleVersion);

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('app_dataset_assign_team', {
      headers: { Authorization: 'Bearer token-3' },
      body: {
        id: sampleId,
        version: sampleVersion,
        table: 'flows',
        teamId: 'team-123',
      },
      region: expect.anything(),
    });
    expect(result).toEqual({
      data: [{ id: sampleId, team_id: 'team-123' }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('should show error when user is not in a team', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
    });
    const rolesBuilder = createQueryBuilder({
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'is_invited',
        },
      ],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);

    const result = await generalApi.contributeSource('flows', sampleId, sampleVersion);

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith('You are not in any team');
    expect(result).toEqual({ error: true, message: 'Contribute failed' });
  });

  it('should show the reviewed German no-team error when the app locale is de-DE', async () => {
    mockGetLocale.mockReturnValue('de-DE');
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
    });
    const rolesBuilder = createQueryBuilder({
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'is_invited',
        },
      ],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);

    await generalApi.contributeSource('flows', sampleId, sampleVersion);

    expect(messageMock.error).toHaveBeenCalledWith('Sie gehören keinem Team an');
  });

  it('should show the French no-team error when the app locale is fr-FR', async () => {
    mockGetLocale.mockReturnValue('fr-FR');
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
    });
    const rolesBuilder = createQueryBuilder({
      data: [
        {
          user_id: 'user-1',
          team_id: 'team-123',
          role: 'is_invited',
        },
      ],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);

    await generalApi.contributeSource('flows', sampleId, sampleVersion);

    expect(messageMock.error).toHaveBeenCalledWith(frTeamMessages['teams.modal.noTeam.title']);
  });

  it('should recover the German no-team error from the reviewed native snapshot', async () => {
    const messageId = 'teams.modal.noTeam.title';
    const reviewedGermanMessage = deTeamMessages[messageId];
    delete deTeamMessages[messageId];
    mockGetLocale.mockReturnValue('de-DE');
    mockAuthGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
    });
    const rolesBuilder = createQueryBuilder({
      data: [{ user_id: 'user-1', team_id: 'team-123', role: 'is_invited' }],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);

    try {
      await generalApi.contributeSource('flows', sampleId, sampleVersion);
      expect(messageMock.error).toHaveBeenCalledWith(reviewedGermanMessage);
    } finally {
      deTeamMessages[messageId] = reviewedGermanMessage;
    }
  });

  it('should contribute with an empty bearer token when the session lacks access token', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    const rolesBuilder = createQueryBuilder({
      data: [{ user_id: 'user-1', team_id: 'team-empty-token', role: 'member' }],
    });
    mockFrom.mockReturnValueOnce(rolesBuilder);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_assign_team',
        data: { id: sampleId, team_id: 'team-empty-token' },
      },
      error: null,
    });

    await generalApi.contributeSource('sources', sampleId, sampleVersion);

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('app_dataset_assign_team', {
      headers: { Authorization: 'Bearer ' },
      body: {
        id: sampleId,
        version: sampleVersion,
        table: 'sources',
        teamId: 'team-empty-token',
      },
      region: expect.anything(),
    });
  });
});

describe('publishDatasetApi', () => {
  it('publishes a dataset through the dedicated command boundary', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-publish' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'dataset_publish',
        data: { id: sampleId, state_code: 100 },
      },
      error: null,
    });

    const result = await generalApi.publishDatasetApi('contacts', sampleId, sampleVersion);

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('app_dataset_publish', {
      headers: { Authorization: 'Bearer token-publish' },
      body: {
        id: sampleId,
        version: sampleVersion,
        table: 'contacts',
      },
      region: expect.anything(),
    });
    expect(result).toEqual({
      data: [{ id: sampleId, state_code: 100 }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });
});

describe('getAllVersions', () => {
  it('projects a reviewed site in process version rows', async () => {
    const builder = createQueryBuilder({
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2024-01-01T00:00:00Z',
          name: { baseName: [] },
          '@location': 'CN',
          descriptionOfRestrictions: [{ '@xml:lang': 'en', '#text': 'Factory Z17' }],
          referenceToReferenceFlow: '6',
          exchange: [
            {
              '@dataSetInternalID': '6',
              exchangeDirection: 'Output',
              generalComment: [{ '@xml:lang': 'en', '#text': 'Coke Z17' }],
            },
          ],
        },
      ],
      count: 1,
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getAllVersions(
      'name,descriptionOfRestrictions,referenceToReferenceFlow,exchange',
      'processes',
      sampleId,
      { pageSize: 10, current: 1 },
      {},
      'en',
      'tg',
    );

    expect(result.data[0].site).toEqual({ status: 'verified', code: 'Z17' });
  });

  it.each([undefined, -1, 100])(
    'keeps example versions at -1 despite state override %s',
    async (stateCode) => {
      const builder = createQueryBuilder({ data: [], count: 0, error: null });
      mockFrom.mockReturnValueOnce(builder);
      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'ex',
        stateCode,
      );
      expect(builder.eq).toHaveBeenCalledWith('state_code', -1);
      expect(builder.eq).not.toHaveBeenCalledWith('state_code', 100);
      expect(result.success).toBe(true);
    },
  );

  it('should return mapped contact data when query succeeds', async () => {
    const payload = {
      data: [
        {
          id: sampleId,
          version: sampleVersion,
          modified_at: '2023-01-03T00:00:00Z',
          team_id: 'team-9',
          email: 'contact@example.com',
          'common:shortName': [{ '@xml:lang': 'en', '#text': 'Short EN' }],
          'common:name': [{ '@xml:lang': 'en', '#text': 'Name EN' }],
          'common:class': [{ value: 'class-a' }],
        },
      ],
      count: 1,
    };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getAllVersions(
      'common:shortName',
      'contacts',
      sampleId,
      { pageSize: 10, current: 1 },
      {},
      'en',
      'tg',
    );

    expect(mockGetILCDClassification).toHaveBeenCalledWith('Contact', 'en', ['all']);
    expect(mockGetLangText).toHaveBeenCalled();
    expect(mockClassificationToString).toHaveBeenCalled();
    expect(result).toEqual({
      data: [
        {
          key: `${sampleId}:${sampleVersion}`,
          id: sampleId,
          shortName: 'Short EN',
          name: 'Name EN',
          classification: 'classification-string',
          email: 'contact@example.com',
          version: sampleVersion,
          modifiedAt: new Date('2023-01-03T00:00:00Z'),
          teamId: 'team-9',
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('should return failure when my data has no active session', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null } });
    const payload = { data: [], count: 0 };
    const builder = createQueryBuilder(payload);
    mockFrom.mockReturnValueOnce(builder);

    const result = await generalApi.getAllVersions(
      'name',
      'contacts',
      sampleId,
      { pageSize: 10, current: 1 },
      {},
      'en',
      'my',
    );

    expect(result).toEqual({ data: [], success: false, total: 0 });
  });

  it('should filter te data by the current team id', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    const versionsBuilder = createQueryBuilder({ data: [], count: 0, error: null });
    const rolesBuilder = createQueryBuilder({
      data: [{ user_id: 'user-1', team_id: 'team-123', role: 'member' }],
    });
    mockFrom.mockReturnValueOnce(versionsBuilder).mockReturnValueOnce(rolesBuilder);

    const result = await generalApi.getAllVersions(
      'name',
      'contacts',
      sampleId,
      { pageSize: 10, current: 1 },
      {},
      'en',
      'te',
    );

    expect(versionsBuilder.eq).toHaveBeenCalledWith('team_id', 'team-123');
    expect(result).toEqual({
      data: [],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('should return failure when te data has no resolved team id', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    const versionsBuilder = createQueryBuilder({ data: [], count: 0, error: null });
    const rolesBuilder = createQueryBuilder({
      data: [{ user_id: 'user-1', team_id: 'team-123', role: 'is_invited' }],
    });
    mockFrom.mockReturnValueOnce(versionsBuilder).mockReturnValueOnce(rolesBuilder);

    const result = await generalApi.getAllVersions(
      'name',
      'contacts',
      sampleId,
      { pageSize: 10, current: 1 },
      {},
      'en',
      'te',
    );

    expect(result).toEqual({ data: [], success: false, total: 0 });
  });
});

describe('multilingual save normalization', () => {
  it('should normalize payload and auto-fill English translation from AI response', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-6' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: { translatedText: 'Steel manufacturing' },
      error: null,
    });

    const result = await generalApi.normalizeLangPayloadForSave({
      title: [{ '@xml:lang': 'zh', '#text': '钢铁制造' }],
    });

    expect(result.validationError).toBeUndefined();
    expect(result.payload.title).toEqual([
      { '@xml:lang': 'en', '#text': 'Steel manufacturing' },
      { '@xml:lang': 'zh', '#text': '钢铁制造' },
    ]);
  });

  it('should return validation error when English contains non-English scripts', async () => {
    const result = await generalApi.normalizeLangPayloadForSave({
      title: [{ '@xml:lang': 'en', '#text': 'Steel钢铁' }],
    });

    expect(result.validationError).toBe(
      'Save failed, the following fields are missing English: title.',
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('invalid_en');
  });

  it('should localize validation error when locale is zh-CN', async () => {
    mockGetLocale.mockReturnValue('zh-CN');

    const result = await generalApi.normalizeLangPayloadForSave({
      title: [{ '@xml:lang': 'en', '#text': 'Steel钢铁' }],
    });

    expect(result.validationError).toBe('保存失败，以下字段缺少英文：title.');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('invalid_en');
  });
});

describe('translateZhTextToEnglish', () => {
  it('should parse fenced JSON response', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-7' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: '```json\n{"translatedText":"Steel"}\n```',
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('钢铁');

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('translate_text', {
      headers: { Authorization: 'Bearer token-7' },
      body: {
        texts: ['钢铁'],
        sourceLang: 'zh',
        targetLang: 'en',
      },
      region: FunctionRegion.UsEast1,
    });
    expect(result).toBe('Steel');
  });

  it('should return undefined when session is missing', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null } });

    const result = await generalApi.translateZhTextToEnglish('钢铁');

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should return a plain string translation when the function returns raw text', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-8' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: '  Steel manufacturing  ',
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('钢铁制造');

    expect(result).toBe('Steel manufacturing');
  });

  it('should short-circuit blank source text before invoking translation', async () => {
    const result = await generalApi.translateZhTextToEnglish('   ');

    expect(result).toBeUndefined();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('should extract direct translated text from the translation payload', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-9' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [{ translatedText: '  Direct English  ' }],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('直接文本');

    expect(result).toBe('Direct English');
  });

  it('should extract translation text from content arrays and nested keys', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-10' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [
          {
            translatedText: {
              result: {
                content: [{ text: '  Nested content translation  ' }],
              },
            },
          },
        ],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('嵌套内容');

    expect(result).toBe('Nested content translation');
  });

  it('should extract translation text from array payloads with content fields', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-11' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [
          {
            translatedText: [{ translation: '  Array content translation  ' }],
          },
        ],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('数组内容');

    expect(result).toBe('Array content translation');
  });

  it('should extract translation text from content string entries', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-13' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [
          {
            translatedText: {
              content: [{ content: '  Content entry translation  ' }],
            },
          },
        ],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('内容字段');

    expect(result).toBe('Content entry translation');
  });

  it('should return undefined when translation arrays contain no extractable values', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-14' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [
          {
            translatedText: [],
          },
        ],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('空数组');

    expect(result).toBeUndefined();
  });

  it('should return undefined when translation objects have no supported keys', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-15' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        translations: [
          {
            translatedText: { unsupported: { nested: 'value' } },
          },
        ],
      },
      error: null,
    });

    const result = await generalApi.translateZhTextToEnglish('无支持键');

    expect(result).toBeUndefined();
  });

  it('should return undefined and log when translation edge function fails', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-12' } } });
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'translate failed' },
    });
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await generalApi.translateZhTextToEnglish('失败场景');

    expect(result).toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalledWith('error', { message: 'translate failed' });
    consoleLogSpy.mockRestore();
  });
});

describe('translation helpers', () => {
  it('should parse JSON-like text and ignore blank input', () => {
    expect(generalApi.parseJsonLikeText('   ')).toBeUndefined();
    expect(generalApi.parseJsonLikeText('```json\n{"translatedText":"Steel"}\n```')).toEqual({
      translatedText: 'Steel',
    });
    expect(generalApi.parseJsonLikeText('not json')).toBeUndefined();
  });

  it('should extract direct translated text from supported object keys', () => {
    expect(generalApi.getTranslatedTextFromObject({ translatedText: '  Steel  ' })).toBe('Steel');
    expect(generalApi.getTranslatedTextFromObject({ english: '  English text  ' })).toBe(
      'English text',
    );
    expect(
      generalApi.getTranslatedTextFromObject({
        content: [{ text: '  from text  ' }, { content: 'from content' }],
      }),
    ).toBe('from text');
    expect(
      generalApi.getTranslatedTextFromObject({
        content: [{ content: '  from content  ' }],
      }),
    ).toBe('from content');
    expect(generalApi.getTranslatedTextFromObject('not-an-object' as any)).toBeUndefined();
    expect(generalApi.getTranslatedTextFromObject({ unsupported: true })).toBeUndefined();
  });

  it('should extract translated text recursively across strings, arrays, and nested keys', () => {
    expect(generalApi.extractTranslatedText('  Plain text  ')).toBe('Plain text');
    expect(generalApi.extractTranslatedText('   ')).toBeUndefined();
    expect(
      generalApi.extractTranslatedText([
        { messages: [{ output_text: 'Nested array text' }] },
        { data: { translatedText: 'Other' } },
      ]),
    ).toBe('Nested array text');
    expect(
      generalApi.extractTranslatedText({
        response: { values: { englishText: 'Nested english text' } },
      }),
    ).toBe('Nested english text');
    expect(generalApi.extractTranslatedText({ result: { data: {} } })).toBeUndefined();
    expect(generalApi.extractTranslatedText({ translatedText: 'Too deep' }, 9)).toBeUndefined();
  });
});

describe('Edge Cases and Error Handling', () => {
  describe('exportDataApi', () => {
    it('should handle null data response', async () => {
      const payload = { data: null, error: null };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.exportDataApi('flows', sampleId, sampleVersion);

      expect(result.data).toBeNull();
    });

    it('should handle database error', async () => {
      const payload = { data: null, error: { message: 'Database error' } };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.exportDataApi('flows', sampleId, sampleVersion);

      expect(result.error).toBeDefined();
    });
  });

  describe('getDataDetail', () => {
    it('should return failure for invalid ID format', async () => {
      const result = await generalApi.getDataDetail('invalid-id', sampleVersion, 'flows');

      expect(result).toEqual({ data: null, success: false });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should return failure for invalid version format', async () => {
      const result = await generalApi.getDataDetail(sampleId, '1.0.0', 'flows');

      expect(result.success).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should handle empty data array response', async () => {
      const payload = { data: [] };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getDataDetail(sampleId, sampleVersion, 'flows');

      expect(result).toEqual({ data: null, success: false });
    });

    it('should handle null json field', async () => {
      const payload = {
        data: [
          {
            version: sampleVersion,
            json: null,
            modified_at: '2023-01-01T00:00:00Z',
            state_code: 100,
            rule_verification: null,
            user_id: 'user-1',
          },
        ],
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getDataDetail(sampleId, sampleVersion, 'flows');

      expect(result.success).toBe(true);
      expect(result.data?.json).toBeNull();
      expect(result.data?.ruleVerification).toBeNull();
    });
  });

  describe('getRefData', () => {
    it('should return failure for empty table name', async () => {
      const result = await generalApi.getRefData(sampleId, sampleVersion, '');

      expect(result).toEqual({ data: null, success: false });
    });

    it('should return failure for null table name', async () => {
      const result = await generalApi.getRefData(sampleId, sampleVersion, null as any);

      expect(result).toEqual({ data: null, success: false });
    });

    it('should handle empty ID', async () => {
      const result = await generalApi.getRefData('', sampleVersion, 'flows');

      expect(result).toEqual({ data: null, success: false });
    });

    it('should fallback to latest version when not specified', async () => {
      const payload = {
        data: [
          {
            state_code: 200,
            json: { data: 'latest' },
            rule_verification: 'passed',
            user_id: 'user-2',
          },
        ],
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getRefData(sampleId, '', 'flows');

      expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
      expect(result.data?.json).toEqual({ data: 'latest' });
    });

    it('should fallback to latest version when requested version has no data', async () => {
      const firstPayload = { data: [] };
      const fallbackPayload = {
        data: [
          {
            state_code: 300,
            json: { data: 'fallback-by-version' },
            rule_verification: 'passed',
            user_id: 'user-3',
          },
        ],
      };
      let callIndex = 0;
      const builder: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        then: (resolve: any, reject?: any) =>
          Promise.resolve(callIndex++ === 0 ? firstPayload : fallbackPayload).then(resolve, reject),
      };
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getRefData(sampleId, sampleVersion, 'flows');

      expect(builder.eq).toHaveBeenCalledWith('version', sampleVersion);
      expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
      expect(builder.range).toHaveBeenCalledWith(0, 0);
      expect(result).toEqual({
        data: {
          stateCode: 300,
          json: { data: 'fallback-by-version' },
          ruleVerification: 'passed',
          userId: 'user-3',
        },
        success: true,
      });
    });
  });

  describe('updateStateCodeApi', () => {
    it('should handle null table parameter', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });

      const result = await generalApi.updateStateCodeApi(sampleId, sampleVersion, null as any, 100);

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle empty table parameter', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });

      const result = await generalApi.updateStateCodeApi(sampleId, sampleVersion, '', 100);

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return a deprecation error instead of invoking legacy functions', async () => {
      const result = await generalApi.updateStateCodeApi(sampleId, sampleVersion, 'flows', 100);

      expect(result).toEqual({
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'updateStateCodeApi:flows',
          hint: '',
        },
      });
    });
  });

  describe('getReviewsOfData', () => {
    it('should handle null data response', async () => {
      const payload = { data: null };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getReviewsOfData(sampleId, sampleVersion, 'flows');

      expect(result).toEqual([]);
    });

    it('should handle empty data array', async () => {
      const payload = { data: [] };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getReviewsOfData(sampleId, sampleVersion, 'flows');

      expect(result).toEqual([]);
    });

    it('should handle undefined reviews field', async () => {
      const payload = { data: [{ id: sampleId }] };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getReviewsOfData(sampleId, sampleVersion, 'flows');

      expect(result).toEqual([]);
    });
  });

  describe('updateDateToReviewState', () => {
    it('should handle empty table parameter', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { access_token: 'token-2' } } });

      const result = await generalApi.updateDateToReviewState(sampleId, sampleVersion, '', {});

      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return a deprecation error when legacy review-state helpers are called', async () => {
      const result = await generalApi.updateDateToReviewState(sampleId, sampleVersion, 'flows', {
        state_code: 2,
      });

      expect(result).toEqual({
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'updateDateToReviewState:flows',
          hint: '',
        },
      });
    });
  });

  describe('getTeamIdByUserId', () => {
    it('returns null when the membership RPC omits its data payload', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await expect(generalApi.getTeamIdByUserId()).resolves.toBeNull();
    });

    it('should return null when user has no team', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
      const payload = { data: [] };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getTeamIdByUserId();

      expect(result).toBeNull();
    });

    it('should return null when user role is rejected', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
      const payload = {
        data: [
          {
            user_id: 'user-1',
            team_id: 'team-123',
            role: 'rejected',
          },
        ],
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getTeamIdByUserId();

      expect(result).toBeNull();
    });

    it('should filter out default team ID', async () => {
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
      const payload = { data: [] };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      await generalApi.getTeamIdByUserId();

      expect(mockRpc).toHaveBeenCalledWith('qry_membership_get_mine');
    });
  });

  describe('contributeSource', () => {
    it('should handle null tableName', async () => {
      mockAuthGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
      });
      const rolesBuilder = createQueryBuilder({
        data: [{ user_id: 'user-1', team_id: 'team-123', role: 'member' }],
      });
      mockFrom.mockReturnValueOnce(rolesBuilder);

      const result = await generalApi.contributeSource(null as any, sampleId, sampleVersion);

      expect(result).toEqual({ error: true, message: 'Contribute failed' });
    });

    it('should show Chinese error message when locale is zh-CN', async () => {
      mockGetLocale.mockReturnValue('zh-CN');
      mockAuthGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
      });
      const rolesBuilder = createQueryBuilder({
        data: [{ user_id: 'user-1', team_id: 'team-123', role: 'is_invited' }],
      });
      mockFrom.mockReturnValueOnce(rolesBuilder);

      await generalApi.contributeSource('flows', sampleId, sampleVersion);

      expect(messageMock.error).toHaveBeenCalledWith('您当前不属于任何团队');
    });

    it('should handle function invocation error', async () => {
      mockAuthGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1' }, access_token: 'token-3' } },
      });
      const rolesBuilder = createQueryBuilder({
        data: [{ user_id: 'user-1', team_id: 'team-123', role: 'member' }],
      });
      mockFrom.mockReturnValueOnce(rolesBuilder);
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Forbidden',
          context: createErrorContext(
            {
              code: 'TEAM_MEMBERSHIP_REQUIRED',
              message: 'You must belong to the target team before assigning dataset ownership',
              details: {
                state_code: 403,
              },
            },
            403,
          ),
        },
      });
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await generalApi.contributeSource('flows', sampleId, sampleVersion);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Forbidden' }),
      );
      expect(result).toEqual({
        data: null,
        error: expect.objectContaining({
          code: 'TEAM_MEMBERSHIP_REQUIRED',
          state_code: 403,
        }),
        count: null,
        status: 403,
        statusText: 'TEAM_MEMBERSHIP_REQUIRED',
      });

      consoleLogSpy.mockRestore();
    });
  });

  describe('getAllVersions', () => {
    it('should fetch all versions for tg dataSource', async () => {
      const mockData = [
        { id: sampleId, version: '01.00.000', created_at: '2024-01-01', modified_at: '2024-01-01' },
        { id: sampleId, version: '02.00.000', created_at: '2024-02-01', modified_at: '2024-02-01' },
      ];
      const builder = createQueryBuilder({ data: mockData, error: null, count: 2 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDClassification.mockResolvedValue({ data: [] });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        { created_at: 'descend' },
        'en',
        'tg',
      );

      expect(mockFrom).toHaveBeenCalledWith('contacts');
      expect(builder.eq).toHaveBeenCalledWith('id', sampleId);
      expect(builder.eq).toHaveBeenCalledWith('state_code', 100);
      expect(result).toBeDefined();
    });

    it('should default all-version rows to version descending order', async () => {
      const mockData = [
        { id: sampleId, version: '01.00.000', created_at: '2024-01-01', modified_at: '2024-01-01' },
        { id: sampleId, version: '02.00.000', created_at: '2024-02-01', modified_at: '2024-02-01' },
        { id: sampleId, version: '01.00.010', created_at: '2024-01-10', modified_at: '2024-01-10' },
      ];
      const builder = createQueryBuilder({ data: mockData, error: null, count: 3 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDClassification.mockResolvedValue({ data: [] });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(builder.order).toHaveBeenCalledWith('version', { ascending: false });
      expect(result.data.map((row: { version: string }) => row.version)).toEqual([
        '02.00.000',
        '01.00.010',
        '01.00.000',
      ]);
    });

    it('should support ascending all-version sorting', async () => {
      const mockData = [
        { id: sampleId, version: '02.00.000', created_at: '2024-02-01', modified_at: '2024-02-01' },
        { id: sampleId, version: '01.00.000', created_at: '2024-01-01', modified_at: '2024-01-01' },
        { id: sampleId, version: '01.00.010', created_at: '2024-01-10', modified_at: '2024-01-10' },
      ];
      const builder = createQueryBuilder({ data: mockData, error: null, count: 3 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDClassification.mockResolvedValue({ data: [] });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        { version: 'ascend' },
        'en',
        'tg',
      );

      expect(builder.order).toHaveBeenCalledWith('version', { ascending: true });
      expect(result.data.map((row: { version: string }) => row.version)).toEqual([
        '01.00.000',
        '01.00.010',
        '02.00.000',
      ]);
    });

    it('should fetch only exact owner-draft versions for my dataSource with session', async () => {
      const mockData = [
        { id: sampleId, version: '01.00.000', created_at: '2024-01-01', modified_at: '2024-01-01' },
      ];
      const builder = createQueryBuilder({ data: mockData, error: null, count: 1 });
      mockFrom.mockReturnValue(builder);
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
      mockGetILCDClassification.mockResolvedValue({ data: [] });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
        0,
      );

      expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(builder.eq).toHaveBeenCalledWith('state_code', 0);
      expect(builder.eq).not.toHaveBeenCalledWith('state_code', 100);
      expect(builder.eq).not.toHaveBeenCalledWith('state_code', 200);
      expect(result).toBeDefined();
    });

    it('should return empty for my dataSource without session', async () => {
      const builder = createQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValue(builder);
      mockAuthGetSession.mockResolvedValue({ data: { session: null } });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'my',
      );

      expect(result).toEqual({ data: [], success: false, total: 0 });
    });

    it('should handle sources table with Chinese classification', async () => {
      const mockData = [
        {
          id: sampleId,
          version: '01.00.000',
          'common:shortName': { en: 'Source 1' },
          'common:class': { '#text': 'class1' },
          sourceCitation: 'Citation',
          publicationType: 'Journal',
          created_at: '2024-01-01',
          modified_at: '2024-01-01',
        },
      ];
      const builder = createQueryBuilder({ data: mockData, error: null, count: 1 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDClassification.mockResolvedValue({ data: [] });
      mockJsonToList.mockReturnValue(['class1']);
      mockGenClassificationZH.mockReturnValue(['分类']);
      mockClassificationToString.mockReturnValue('分类字符串');
      mockGetLangText.mockReturnValue('来源 1');

      const result = await generalApi.getAllVersions(
        'name',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDClassification).toHaveBeenCalledWith('Source', 'zh', ['all']);
      expect(result).toBeDefined();
    });

    it('should map sources table for English locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-source-en',
            'common:shortName': { en: 'Source EN' },
            'common:class': ['source-class-en'],
            sourceCitation: 'Citation EN',
            publicationType: 'Report',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('Source Class EN');

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        shortName: 'Source EN',
        classification: 'Source Class EN',
        sourceCitation: 'Citation EN',
      });
    });

    it('should use fallback values for sources records with missing optional fields', async () => {
      const zhPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:shortName': { zh: '来源缺省' },
            'common:class': ['source-class-zh'],
          },
        ],
        error: null,
        count: 1,
      };
      const enPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:shortName': { en: 'Source fallback' },
            'common:class': ['source-class-en'],
          },
        ],
        error: null,
        count: 1,
      };
      mockFrom
        .mockReturnValueOnce(createQueryBuilder(zhPayload))
        .mockReturnValueOnce(createQueryBuilder(enPayload));
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['来源分类ZH']);
      mockClassificationToString
        .mockReturnValueOnce('来源分类ZH')
        .mockReturnValueOnce('Source Class Fallback');

      const zhResult = await generalApi.getAllVersions(
        'common:shortName',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );
      const enResult = await generalApi.getAllVersions(
        'common:shortName',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(zhResult.data?.[0]).toMatchObject({
        sourceCitation: '-',
        publicationType: '-',
      });
      expect(enResult.data?.[0]).toMatchObject({
        sourceCitation: '-',
        publicationType: '-',
      });
    });

    it('should handle te dataSource with team ID', async () => {
      const mockData = [
        { id: sampleId, version: '01.00.000', created_at: '2024-01-01', modified_at: '2024-01-01' },
      ];
      const rolesBuilder = createQueryBuilder({
        data: [{ team_id: 'team-123', role: 'member' }],
      });
      const builder = createQueryBuilder({ data: mockData, error: null, count: 1 });
      mockFrom.mockReturnValueOnce(rolesBuilder).mockReturnValueOnce(builder);
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
      mockGetILCDClassification.mockResolvedValue({ data: [] });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'te',
      );

      // Verify calls were made
      expect(mockFrom).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle te dataSource without team ID', async () => {
      const rolesBuilder = createQueryBuilder({ data: [], error: null });
      const builder = createQueryBuilder({ data: [], error: null, count: 0 });
      mockFrom.mockReturnValueOnce(rolesBuilder).mockReturnValueOnce(builder);
      mockAuthGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

      const result = await generalApi.getAllVersions(
        'name',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'te',
      );

      expect(result).toEqual({ data: [], success: false, total: 0 });
    });

    it('should map flow datasets with Chinese locale including classification and location translations', async () => {
      const flowRecord = {
        id: sampleId,
        version: '01.00.000',
        typeOfDataSet: 'Elementary flow',
        name: {
          baseName: [
            { '@xml:lang': 'zh', '#text': '流基础名称' },
            { '@xml:lang': 'en', '#text': 'Flow Base Name' },
          ],
        },
        classificationInformation: {
          'common:elementaryFlowCategorization': {
            'common:category': 'elementary-category',
          },
        },
        CASNumber: '123-45-6',
        referenceToFlowPropertyDataSet: { '@refObjectId': 'flow-prop-1' },
        locationOfSupply: 'CN-EC',
        modified_at: '2024-04-05T08:00:00Z',
        team_id: 'team-flow',
      } as any;

      const builder = createQueryBuilder({ data: [flowRecord], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDFlowCategorizationAll.mockResolvedValue({
        data: {
          categoryElementaryFlow: [{ '@value': 'elementary-category', '#text': '分类ZH' }],
        },
      });
      mockGetILCDLocationByValues.mockResolvedValue({
        data: [{ '@value': 'CN-EC', '#text': '中国华东' }],
      });
      mockGenClassificationZH.mockReturnValue(['分类ZH']);
      mockClassificationToString.mockReturnValue('分类ZH');
      mockJsonToList.mockImplementation((value: any) => {
        if (value === 'elementary-category') {
          return ['elementary-category'];
        }
        return [];
      });

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        flowRecord.id,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDFlowCategorizationAll).toHaveBeenCalledWith('zh');
      expect(mockGetILCDLocationByValues).toHaveBeenCalledWith('zh', ['CN-EC']);
      expect(result.data?.[0]).toMatchObject({
        id: flowRecord.id,
        flowType: 'Elementary flow',
        classification: '分类ZH',
        locationOfSupply: '中国华东',
        version: '01.00.000',
      });

      mockJsonToList.mockImplementation(() => []);
    });

    it('should map process datasets with translated locations', async () => {
      const processRecord = {
        id: 'process-1',
        version: '02.00.000',
        '@location': 'US-NE',
        name: {
          baseName: [
            { '@xml:lang': 'en', '#text': 'Process Base Name' },
            { '@xml:lang': 'zh', '#text': '工艺名称' },
          ],
        },
        'common:class': 'process-category',
        typeOfDataSet: 'LCI result',
        'common:generalComment': [{ '@xml:lang': 'en', '#text': 'General comment' }],
        modified_at: '2024-05-01T10:00:00Z',
        team_id: 'team-process',
        model_id: 'model-process',
        model_version: '01.01.021',
      } as any;

      const builder = createQueryBuilder({ data: [processRecord], error: null, count: 1 });
      mockFrom.mockReturnValue(builder);
      mockGetILCDLocationByValues.mockResolvedValue({
        data: [{ '@value': 'US-NE', '#text': 'North East US' }],
      });
      mockClassificationToString.mockReturnValue('Process Class EN');
      mockJsonToList.mockImplementation((value: any) => {
        if (value === 'process-category') {
          return ['process-category'];
        }
        return [];
      });

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        processRecord.id,
        { pageSize: 5, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(mockGetILCDLocationByValues).toHaveBeenCalledWith('en', ['US-NE']);
      expect(result.data?.[0]).toMatchObject({
        id: processRecord.id,
        classification: 'Process Class EN',
        location: 'North East US',
        version: '02.00.000',
        modelId: 'model-process',
        modelVersion: '01.01.021',
      });

      mockJsonToList.mockImplementation(() => []);
    });

    it('should apply state code filter for co data source', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-co',
            email: 'co@example.com',
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'CO Short' }],
            'common:name': [{ '@xml:lang': 'en', '#text': 'CO Name' }],
            'common:class': [{ value: 'class-co' }],
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'co',
      );

      expect(builder.eq).toHaveBeenCalledWith('state_code', 200);
      expect(result.success).toBe(true);
      expect(result.total).toBe(1);
    });

    it('should map unitgroups table for English locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-unit',
            'common:name': { en: 'Unit Group EN' },
            'common:class': [{ value: 'unit-class' }],
            referenceToReferenceUnit: 'unit-1',
            unit: [
              { '@dataSetInternalID': 'unit-1', name: 'Kilogram', generalComment: { en: 'kg' } },
            ],
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );

      const result = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        name: 'Unit Group EN',
        refUnitId: 'unit-1',
        refUnitName: 'Kilogram',
      });
    });

    it('should map unitgroups table for Chinese locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-unit-zh',
            'common:name': { zh: '单位组ZH' },
            'common:class': [{ value: 'unit-class-zh' }],
            referenceToReferenceUnit: 'unit-zh',
            unit: [
              {
                '@dataSetInternalID': 'unit-zh',
                name: '千克',
                generalComment: { zh: '参考单位备注' },
              },
            ],
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({
        data: [{ id: 'unit-class-zh', value: '单位分类ZH' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['单位分类ZH']);
      mockClassificationToString.mockReturnValueOnce('单位分类ZH');

      const result = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDClassification).toHaveBeenCalledWith('UnitGroup', 'zh', ['all']);
      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: '单位分类ZH',
        refUnitId: 'unit-zh',
        refUnitName: '千克',
      });
    });

    it('should use fallback values for unitgroups without a reference unit match', async () => {
      const zhPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:name': { zh: '单位组缺省' },
            'common:class': ['unit-class-zh'],
            unit: [],
          },
        ],
        error: null,
        count: 1,
      };
      const enPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:name': { en: 'Unitgroup fallback' },
            'common:class': ['unit-class-en'],
            unit: [],
          },
        ],
        error: null,
        count: 1,
      };
      mockFrom
        .mockReturnValueOnce(createQueryBuilder(zhPayload))
        .mockReturnValueOnce(createQueryBuilder(enPayload));
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['单位组分类ZH']);
      mockClassificationToString
        .mockReturnValueOnce('单位组分类ZH')
        .mockReturnValueOnce('Unitgroup Class EN');

      const zhResult = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );
      const enResult = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(zhResult.data?.[0]).toMatchObject({
        refUnitId: '-',
        refUnitName: '-',
      });
      expect(enResult.data?.[0]).toMatchObject({
        refUnitId: '-',
        refUnitName: '-',
      });
    });

    it('should map flowproperties table for Chinese locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-fp',
            'common:name': { zh: '流属性' },
            'common:class': [{ value: 'fp-class' }],
            'common:generalComment': { zh: '通用描述' },
            '@refObjectId': 'unitgroup-1',
            'common:shortDescription': { zh: '单位组' },
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({
        data: [{ id: 'fp-class', value: '流属性分类' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['流属性分类']);
      mockClassificationToString.mockReturnValueOnce('流属性分类');

      const result = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDClassification).toHaveBeenCalledWith('FlowProperty', 'zh', ['all']);
      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: '流属性分类',
        refUnitGroupId: 'unitgroup-1',
      });
    });

    it('should map flowproperties table for English locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-fp-en',
            'common:name': { en: 'Flow Property EN' },
            'common:class': ['fp-class-en'],
            'common:generalComment': { en: 'General EN' },
            '@refObjectId': 'unitgroup-en',
            'common:shortDescription': { en: 'Unit Group EN' },
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('FP Class EN');

      const result = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: 'FP Class EN',
        refUnitGroupId: 'unitgroup-en',
        refUnitGroup: 'Unit Group EN',
      });
    });

    it('should use fallback values for flowproperties without reference targets', async () => {
      const zhPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:name': { zh: '流属性缺省' },
            'common:class': ['fp-class-zh'],
          },
        ],
        error: null,
        count: 1,
      };
      const enPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-01-01T00:00:00Z',
            'common:name': { en: 'Flow property fallback' },
            'common:class': ['fp-class-en'],
          },
        ],
        error: null,
        count: 1,
      };
      mockFrom
        .mockReturnValueOnce(createQueryBuilder(zhPayload))
        .mockReturnValueOnce(createQueryBuilder(enPayload));
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['流属性分类ZH']);
      mockClassificationToString
        .mockReturnValueOnce('流属性分类ZH')
        .mockReturnValueOnce('Flowproperty Class EN');

      const zhResult = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );
      const enResult = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(zhResult.data?.[0]).toMatchObject({
        refUnitGroupId: '-',
      });
      expect(enResult.data?.[0]).toMatchObject({
        refUnitGroupId: '-',
      });
    });

    it('should map lifecyclemodels table for Chinese locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-02-01T00:00:00Z',
            team_id: 'team-lcm',
            name: {
              baseName: { zh: '模型基础名' },
              treatmentStandardsRoutes: { zh: '路线' },
              mixAndLocationTypes: { zh: '类型' },
              functionalUnitFlowProperties: { zh: '功能单位' },
            },
            'common:class': [{ value: 'lcm-class' }],
            'common:generalComment': { zh: '模型描述' },
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({
        data: [{ id: 'lcm-class', value: '模型分类' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['模型分类']);
      mockClassificationToString.mockReturnValueOnce('模型分类');

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDClassification).toHaveBeenCalledWith('LifeCycleModel', 'zh', ['all']);
      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: '模型分类',
      });
    });

    it('should fallback to empty name and classification defaults for Chinese lifecyclemodels', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-02-01T00:00:00Z',
            'common:class': ['lcm-class-empty'],
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(undefined as any);
      mockClassificationToString.mockReturnValueOnce('默认生命周期分类');

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockClassificationToString).toHaveBeenCalledWith({});
      expect(result.data?.[0]).toMatchObject({
        name: '-',
        classification: '默认生命周期分类',
      });
    });

    it('should map flow datasets for English non-elementary records', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: 'Product flow',
            name: { en: 'Product Flow' },
            classificationInformation: {
              'common:classification': {
                'common:class': 'product-category',
              },
            },
            'common:synonyms': { en: 'flow synonym' },
            CASNumber: null,
            referenceToFlowPropertyDataSet: {},
            locationOfSupply: 'US-CA',
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-flow-en',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({
        data: [{ '@value': 'US-CA', '#text': 'California' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('Product Category');

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(mockGetILCDLocationByValues).toHaveBeenCalledWith('en', ['US-CA']);
      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        flowType: 'Product flow',
        classification: 'Product Category',
        locationOfSupply: 'California',
      });
    });

    it('should map flow datasets for Chinese non-elementary records', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: 'Product flow',
            name: { zh: '产品流ZH' },
            classificationInformation: {
              'common:classification': {
                'common:class': ['product-category-zh'],
              },
            },
            'common:synonyms': { zh: '同义词ZH' },
            CASNumber: '222-22-2',
            referenceToFlowPropertyDataSet: { '@refObjectId': 'flow-prop-zh' },
            locationOfSupply: 'CN-SW',
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-flow-zh',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDFlowCategorizationAll.mockResolvedValueOnce({
        data: {
          category: [{ '@value': 'product-category-zh', '#text': '产品流分类ZH' }],
        },
      });
      mockGetILCDLocationByValues.mockResolvedValueOnce({
        data: [{ '@value': 'CN-SW', '#text': '中国西南' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['产品流分类ZH']);
      mockClassificationToString.mockReturnValueOnce('产品流分类ZH');

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: '产品流分类ZH',
        locationOfSupply: '中国西南',
      });
    });

    it('should map flow datasets for English elementary records', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: 'Elementary flow',
            name: { en: 'Elementary Flow EN' },
            classificationInformation: {
              'common:elementaryFlowCategorization': {
                'common:category': ['elementary-en'],
              },
            },
            'common:synonyms': { en: 'Elementary synonym' },
            CASNumber: '333-33-3',
            referenceToFlowPropertyDataSet: { '@refObjectId': 'flow-prop-en' },
            locationOfSupply: 'US-W',
            modified_at: '2024-01-01T00:00:00Z',
            team_id: 'team-flow-elementary-en',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({
        data: [{ '@value': 'US-W', '#text': 'West US' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('Elementary Class EN');

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: 'Elementary Class EN',
        locationOfSupply: 'West US',
      });
    });

    it('should use fallback values for flows when optional fields are missing', async () => {
      const zhPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: undefined,
            name: undefined,
            classificationInformation: {
              'common:classification': {
                'common:class': ['flow-class-zh'],
              },
            },
            locationOfSupply: undefined,
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const enPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: undefined,
            name: undefined,
            classificationInformation: {
              'common:elementaryFlowCategorization': {
                'common:category': ['flow-class-en'],
              },
            },
            locationOfSupply: undefined,
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      mockFrom
        .mockReturnValueOnce(createQueryBuilder(zhPayload))
        .mockReturnValueOnce(createQueryBuilder(enPayload));
      mockGetILCDFlowCategorizationAll.mockResolvedValueOnce({ data: { category: [] } });
      mockGetILCDLocationByValues.mockResolvedValue({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['流分类ZH']);
      mockClassificationToString
        .mockReturnValueOnce('流分类ZH')
        .mockReturnValueOnce('Flow Class EN');

      const zhResult = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );
      const enResult = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(zhResult.data?.[0]).toMatchObject({
        flowType: '-',
        CASNumber: '-',
        refFlowPropertyId: '-',
        locationOfSupply: '-',
      });
      expect(enResult.data?.[0]).toMatchObject({
        flowType: '-',
        CASNumber: '-',
        refFlowPropertyId: '-',
      });
    });

    it('should map process datasets for Chinese locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': 'CN-NE',
            name: {
              baseName: { zh: '流程基础' },
              treatmentStandardsRoutes: { zh: '流程路线' },
              mixAndLocationTypes: { zh: '流程类型' },
              functionalUnitFlowProperties: { zh: '流程单位' },
            },
            'common:class': ['process-class'],
            'common:generalComment': { zh: '流程备注' },
            typeOfDataSet: 'LCI result',
            'common:referenceYear': '2024',
            modified_at: '2024-05-01T10:00:00Z',
            team_id: 'team-process-zh',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({
        data: [{ '@value': 'CN-NE', '#text': '中国东北' }],
      });
      mockGetILCDClassification.mockResolvedValueOnce({
        data: [{ id: 'process-class', value: '流程分类' }],
      });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['流程分类']);
      mockClassificationToString.mockReturnValueOnce('流程分类');

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockGetILCDClassification).toHaveBeenCalledWith('Process', 'zh', ['all']);
      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: '流程分类',
        location: '中国东北',
      });
    });

    it('should fallback to an empty classification payload for Chinese process mappings', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': 'CN-NW',
            name: {
              baseName: { zh: '流程基础' },
            },
            'common:class': ['process-class-empty'],
            modified_at: '2024-05-01T10:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({ data: [] });
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(undefined as any);
      mockClassificationToString.mockReturnValueOnce('流程分类默认值');

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(mockClassificationToString).toHaveBeenCalledWith({});
      expect(result.data?.[0]).toMatchObject({
        classification: '流程分类默认值',
      });
    });

    it('should use fallback values for processes when optional fields are missing', async () => {
      const zhPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': undefined,
            name: undefined,
            'common:class': ['process-class-zh'],
            modified_at: '2024-05-01T10:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const enPayload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': undefined,
            name: undefined,
            'common:class': ['process-class-en'],
            modified_at: '2024-05-01T10:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      mockFrom
        .mockReturnValueOnce(createQueryBuilder(zhPayload))
        .mockReturnValueOnce(createQueryBuilder(enPayload));
      mockGetILCDLocationByValues.mockResolvedValue({ data: [] });
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockGenClassificationZH.mockReturnValueOnce(['流程分类ZH']);
      mockClassificationToString
        .mockReturnValueOnce('流程分类ZH')
        .mockReturnValueOnce('Process Class EN');

      const zhResult = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );
      const enResult = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(zhResult.data?.[0]).toMatchObject({
        typeOfDataSet: '-',
        referenceYear: '-',
        location: '-',
      });
      expect(enResult.data?.[0]).toMatchObject({
        typeOfDataSet: '-',
        referenceYear: '-',
      });
    });

    it('should return fallback item when lifecyclemodels mapping throws in English branch', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-02-01T00:00:00Z',
            name: { en: 'Broken Model' },
            'common:class': ['broken-class'],
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('json parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.data?.[0]).toEqual({ id: sampleId });

      consoleErrorSpy.mockRestore();
    });

    it('should map lifecyclemodels table for English locale', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-02-01T00:00:00Z',
            team_id: 'team-lcm-en',
            name: { en: 'Model EN' },
            'common:class': ['lcm-class-en'],
            'common:generalComment': { en: 'Model EN comment' },
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('LCM Class EN');

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        id: sampleId,
        classification: 'LCM Class EN',
        version: sampleVersion,
      });
    });

    it('should fallback to an empty name object for English lifecyclemodels', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            modified_at: '2024-02-01T00:00:00Z',
            'common:class': ['lcm-class-en'],
            'common:generalComment': { en: 'Model EN comment' },
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementation((value: any) =>
        Array.isArray(value) ? value : value ? [value] : [],
      );
      mockClassificationToString.mockReturnValueOnce('LCM Class EN');

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toMatchObject({
        name: '-',
        classification: 'LCM Class EN',
      });
    });

    it('should use default pagination and totals when query metadata is missing', async () => {
      const builder = createQueryBuilder({ data: [], error: null });
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        {} as any,
        {},
        'en',
        'tg',
      );

      expect(builder.range).toHaveBeenCalledWith(0, 9);
      expect(result).toEqual({
        data: [],
        page: 1,
        success: true,
        total: 0,
      });
    });

    it('should return fallback items when contact mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'Broken contact' }],
            'common:name': [{ '@xml:lang': 'en', '#text': 'Broken contact name' }],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('contact parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when source mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:shortName': { zh: '损坏来源' },
            'common:class': ['broken-source'],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('source parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when English source mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:shortName': { en: 'Broken source EN' },
            'common:class': ['broken-source-en'],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('source en parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'sources',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when unitgroup mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:name': { en: 'Broken unitgroup' },
            unit: [],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('unitgroup parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when Chinese unitgroup mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:name': { zh: '损坏单位组ZH' },
            unit: [],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('unitgroup zh parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:name',
        'unitgroups',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when flowproperty mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:name': { zh: '损坏流属性' },
            'common:class': ['broken-fp'],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('flowproperty parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when English flowproperty mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:name': { en: 'Broken FP EN' },
            'common:class': ['broken-fp-en'],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('flowproperty en parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'common:name',
        'flowproperties',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when flow mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: 'Elementary flow',
            locationOfSupply: 'US-ERR',
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDFlowCategorizationAll.mockResolvedValueOnce({ data: {} });
      mockGetILCDLocationByValues.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('flow parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when English flow mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            typeOfDataSet: 'Product flow',
            locationOfSupply: 'US-ERR-EN',
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('flow en parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'flows',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when process mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': 'CN-ERR',
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({ data: [] });
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('process parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when English process mappings throw', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            '@location': 'US-ERR-EN',
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDLocationByValues.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('process en parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'processes',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return fallback items when lifecyclemodel mappings throw in Chinese branch', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:class': ['broken-lcm-zh'],
            modified_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);
      mockGetILCDClassification.mockResolvedValueOnce({ data: [] });
      mockJsonToList.mockImplementationOnce(() => {
        throw new Error('lcm zh parse failed');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await generalApi.getAllVersions(
        'name',
        'lifecyclemodels',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'zh',
        'tg',
      );

      expect(result.data?.[0]).toEqual({ id: sampleId });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return failure response when query result has error', async () => {
      const payload = {
        data: [
          {
            id: sampleId,
            version: sampleVersion,
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'Short EN' }],
            'common:name': [{ '@xml:lang': 'en', '#text': 'Name EN' }],
            'common:class': [{ value: 'class-a' }],
          },
        ],
        error: { message: 'query failed' },
        count: 1,
      };
      const builder = createQueryBuilder(payload);
      mockFrom.mockReturnValueOnce(builder);

      const result = await generalApi.getAllVersions(
        'common:shortName',
        'contacts',
        sampleId,
        { pageSize: 10, current: 1 },
        {},
        'en',
        'tg',
      );

      expect(result).toEqual({ data: [], success: false, total: 0 });
    });

    it('normalizes a null errored query payload before returning failure', async () => {
      const builder = createQueryBuilder({ data: null, error: { message: 'query failed' } });
      mockFrom.mockReturnValueOnce(builder);

      await expect(
        generalApi.getAllVersions(
          'name',
          'contacts',
          sampleId,
          { pageSize: 10, current: 1 },
          {},
          'en',
          'tg',
        ),
      ).resolves.toEqual({ data: [], success: false, total: 0 });
    });
  });

  describe('legacy mutation boundary', () => {
    it('returns the structured removed-result envelope for legacy mutation boundaries', () => {
      const result = generalApi.createLegacyMutationRemovedResult('legacyBoundary');

      expect(result).toEqual({
        data: null,
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'legacyBoundary',
          hint: '',
        },
        count: null,
        status: 410,
        statusText: 'LEGACY_ENDPOINT_REMOVED',
      });
    });
  });
});
