/**
 * Tests for reviews service API functions
 * Path: src/services/reviews/api.ts
 */

import { FunctionRegion } from '@supabase/supabase-js';

const mockFrom = jest.fn();
const mockAuthGetSession = jest.fn();
const mockFunctionsInvoke = jest.fn();
const mockInvokeDatasetCommand = jest.fn();
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

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  createLegacyMutationRemovedError: (boundary: string) => ({
    message: 'Use explicit command endpoints instead',
    code: 'LEGACY_ENDPOINT_REMOVED',
    details: boundary,
    hint: '',
  }),
  invokeDatasetCommand: (...args: any[]) => mockInvokeDatasetCommand.apply(null, args),
}));

const mockGetLifeCyclesByIdAndVersion = jest.fn();

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCyclesByIdAndVersion: (...args: any[]) =>
    mockGetLifeCyclesByIdAndVersion.apply(null, args),
}));

const mockGetPendingComment = jest.fn();
const mockGetReviewedComment = jest.fn();
const mockGetRejectedComment = jest.fn();

jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  getPendingComment: (...args: any[]) => mockGetPendingComment.apply(null, args),
  getReviewedComment: (...args: any[]) => mockGetReviewedComment.apply(null, args),
  getRejectedComment: (...args: any[]) => mockGetRejectedComment.apply(null, args),
}));

const mockGetProcessDetailByIdAndVersion = jest.fn();
const mockGenProcessName = jest.fn();

jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetailByIdAndVersion: (...args: any[]) =>
    mockGetProcessDetailByIdAndVersion.apply(null, args),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessName: (...args: any[]) => mockGenProcessName.apply(null, args),
}));

const mockGetLangText = jest.fn();

jest.mock('@/services/general/util', () => {
  return {
    __esModule: true,
    getLangText: (...args: any[]) => mockGetLangText.apply(null, args),
    jsonToList: (json: any) => {
      if (!json) return [];
      return Array.isArray(json) ? json : [json];
    },
  };
});

const mockGetUserId = jest.fn();
const mockGetUsersByIds = jest.fn();
let realGenProcessName: (...args: any[]) => any;
const originalCrypto = globalThis.crypto;

jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUserId: (...args: any[]) => mockGetUserId.apply(null, args),
  getUsersByIds: (...args: any[]) => mockGetUsersByIds.apply(null, args),
}));

import * as reviewsApi from '@/services/reviews/api';

beforeAll(() => {
  realGenProcessName = jest.requireActual('@/services/processes/util').genProcessName;
});

beforeEach(() => {
  mockFrom.mockReset();
  mockAuthGetSession.mockReset();
  mockAuthGetSession.mockResolvedValue({
    data: {
      session: {
        user: { id: 'user-default' },
        access_token: 'access-token',
      },
    },
  });
  mockFunctionsInvoke.mockReset();
  mockInvokeDatasetCommand.mockReset();
  mockRpc.mockReset();
  mockGetLifeCyclesByIdAndVersion.mockReset();
  mockGetLifeCyclesByIdAndVersion.mockResolvedValue({ data: [] });
  mockGetPendingComment.mockReset();
  mockGetPendingComment.mockResolvedValue({ data: [] });
  mockGetReviewedComment.mockReset();
  mockGetReviewedComment.mockResolvedValue({ data: [] });
  mockGetRejectedComment.mockReset();
  mockGetRejectedComment.mockResolvedValue({ data: [] });
  mockGetProcessDetailByIdAndVersion.mockReset();
  mockGetProcessDetailByIdAndVersion.mockResolvedValue({ success: true, data: [] });
  mockGenProcessName.mockReset();
  mockGenProcessName.mockImplementation((...args: any[]) => realGenProcessName(...args));
  mockGetLangText.mockReset();
  mockGetLangText.mockImplementation((value: any, lang: string) => {
    if (!value) return '-';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const match = value.find((item: any) => item?.['@xml:lang'] === lang);
      return match?.['#text'] ?? '-';
    }
    if (typeof value === 'object') {
      if (value?.[lang]) return value[lang];
      if (value?.['#text']) return value['#text'];
    }
    return '-';
  });
  mockGetUserId.mockReset();
  mockGetUsersByIds.mockReset();
  mockGetUsersByIds.mockResolvedValue([]);
  mockGetUserId.mockResolvedValue('user-default');
});

afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
});

describe('addReviewsApi', () => {
  it('returns a structured deprecation error', async () => {
    const payload = { json: { foo: 'bar' } };
    const result = await reviewsApi.addReviewsApi('review-1', payload);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'addReviewsApi',
        hint: '',
      },
    });
  });
});

describe('submitDatasetReviewApi', () => {
  it('delegates review submission to the dataset command boundary', async () => {
    const commandResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    const result = await reviewsApi.submitDatasetReviewApi(
      'processes',
      '11111111-1111-4111-8111-111111111111',
      '01.00.000',
    );

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_dataset_submit_review', {
      id: '11111111-1111-4111-8111-111111111111',
      version: '01.00.000',
      table: 'processes',
    });
    expect(result).toBe(commandResult);
  });

  it('keeps submission independent from Gate assertion metadata', async () => {
    const commandResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    const result = await reviewsApi.submitDatasetReviewApi(
      'processes',
      '11111111-1111-4111-8111-111111111111',
      '01.00.000',
    );

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_dataset_submit_review', {
      id: '11111111-1111-4111-8111-111111111111',
      version: '01.00.000',
      table: 'processes',
    });
    expect(result).toBe(commandResult);
  });

  it('submits Flow reviews through the same command without Gate metadata', async () => {
    mockInvokeDatasetCommand.mockResolvedValue({
      data: [{ reviewKind: 'root' }],
      error: null,
    });

    await reviewsApi.submitDatasetReviewApi(
      'flows',
      '11111111-1111-4111-8111-111111111111',
      '01.00.000',
    );

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_dataset_submit_review', {
      id: '11111111-1111-4111-8111-111111111111',
      version: '01.00.000',
      table: 'flows',
    });
  });
});

describe('requestReviewQualityDiagnosticApi', () => {
  it('starts a Review Admin diagnostic and unwraps the command envelope', async () => {
    const run = {
      runId: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      requestedAt: '2026-08-13T08:00:00.000Z',
    };
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'review_quality_diagnostic',
        action: 'start',
        data: run,
      },
      error: null,
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'start' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('admin_review_quality_diagnostic', {
      headers: { Authorization: 'Bearer access-token' },
      body: { action: 'start' },
      region: FunctionRegion.UsEast1,
    });
    expect(result).toEqual({
      data: [run],
      error: null,
      count: null,
      status: 202,
      statusText: 'Accepted',
    });
  });

  it('reads the latest diagnostic without starting one and normalizes an empty result', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        command: 'review_quality_diagnostic',
        action: 'read',
        data: null,
      },
      error: null,
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('admin_review_quality_diagnostic', {
      headers: { Authorization: 'Bearer access-token' },
      body: { action: 'read' },
      region: FunctionRegion.UsEast1,
    });
    expect(result).toEqual({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('reads a specific diagnostic run when the server-issued run ID is supplied', async () => {
    const runId = '22222222-2222-4222-8222-222222222222';
    mockFunctionsInvoke.mockResolvedValue({
      data: { runId, status: 'completed', outcome: 'clear' },
      error: null,
    });

    await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read', runId });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('admin_review_quality_diagnostic', {
      headers: { Authorization: 'Bearer access-token' },
      body: { action: 'read', runId },
      region: FunctionRegion.UsEast1,
    });
  });

  it.each([null, 'malformed', []])(
    'normalizes malformed successful diagnostic payload %p to an empty result',
    async (data) => {
      mockFunctionsInvoke.mockResolvedValue({ data, error: null });

      const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

      expect(result).toEqual({
        data: [],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      });
    },
  );

  it('uses an empty bearer token when the diagnostic session omits its access token', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: { session: {} },
    });
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: null });

    await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('admin_review_quality_diagnostic', {
      headers: { Authorization: 'Bearer ' },
      body: { action: 'read' },
      region: FunctionRegion.UsEast1,
    });
  });

  it('requires authentication before invoking the Review Admin diagnostic', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: null,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      status: 401,
      statusText: 'AUTH_REQUIRED',
    });
  });

  it('preserves structured authorization errors returned by the Edge boundary', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 403,
          json: jest.fn(async () => ({
            code: 'REVIEW_ADMIN_REQUIRED',
            message: 'Review Admin role required',
          })),
        },
      },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'start' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'REVIEW_ADMIN_REQUIRED',
        message: 'Review Admin role required',
      },
      status: 403,
      statusText: 'REVIEW_ADMIN_REQUIRED',
    });
  });

  it('uses the server-error status fallback when the diagnostic error has no HTTP status', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function failed',
        context: {
          json: jest.fn(async () => ({
            code: 'DIAGNOSTIC_FAILED',
            message: 'Diagnostic unavailable',
          })),
        },
      },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'DIAGNOSTIC_FAILED', message: 'Diagnostic unavailable' },
      status: 500,
      statusText: 'DIAGNOSTIC_FAILED',
    });
  });

  it('falls back to the invocation error when no JSON error context is available', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function failed without a response body' },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'FUNCTION_ERROR',
        message: 'Edge Function failed without a response body',
      },
      status: 500,
      statusText: 'FUNCTION_ERROR',
    });
  });

  it('falls back to the invocation error when the error context has no JSON reader', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned no readable response body',
        context: { status: 503 },
      },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'FUNCTION_ERROR',
        message: 'Edge Function returned no readable response body',
      },
      status: 503,
      statusText: 'FUNCTION_ERROR',
    });
  });

  it('uses the generic request failure when the invocation error has no message', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { context: { status: 500 } },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'read' });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'FUNCTION_ERROR', message: 'Request failed' },
      status: 500,
      statusText: 'FUNCTION_ERROR',
    });
  });

  it('falls back to the invocation error when the JSON error body cannot be parsed', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned an invalid response body',
        context: {
          status: 502,
          json: jest.fn(async () => {
            throw new Error('invalid json');
          }),
        },
      },
    });

    const result = await reviewsApi.requestReviewQualityDiagnosticApi({ action: 'start' });

    expect(result).toMatchObject({
      data: null,
      error: {
        code: 'FUNCTION_ERROR',
        message: 'Edge Function returned an invalid response body',
      },
      status: 502,
      statusText: 'FUNCTION_ERROR',
    });
  });
});

describe('submitSimpleReviewDecision', () => {
  it('omits a reason when the reviewer approves', async () => {
    mockInvokeDatasetCommand.mockResolvedValue({ data: [], error: null });

    await reviewsApi.submitSimpleReviewDecision('11111111-1111-4111-8111-111111111111', 'approve');

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_simple_review_submit_decision', {
      reviewId: '11111111-1111-4111-8111-111111111111',
      decision: 'approve',
    });
  });

  it('trims and submits the rejection reason', async () => {
    mockInvokeDatasetCommand.mockResolvedValue({ data: [], error: null });

    await reviewsApi.submitSimpleReviewDecision(
      '11111111-1111-4111-8111-111111111111',
      'reject',
      '  needs correction  ',
    );

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_simple_review_submit_decision', {
      reviewId: '11111111-1111-4111-8111-111111111111',
      decision: 'reject',
      reason: 'needs correction',
    });
  });
});

describe('getRootReviewReferenceProgress', () => {
  it('returns the root review reference rows from the query boundary', async () => {
    const rows = [
      {
        reference_review_id: '22222222-2222-4222-8222-222222222222',
        target_table: 'flows',
      },
    ];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    await expect(
      reviewsApi.getRootReviewReferenceProgress('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ data: rows, error: null });
    expect(mockRpc).toHaveBeenCalledWith('qry_root_review_reference_progress_v2', {
      p_root_review_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('normalizes a missing query payload to an empty list', async () => {
    const error = { message: 'query failed' };
    mockRpc.mockResolvedValue({ data: null, error });

    await expect(
      reviewsApi.getRootReviewReferenceProgress('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ data: [], error });
  });
});

describe('review workflow command wrappers', () => {
  it('saves reviewer assignment drafts through the admin review command', async () => {
    mockInvokeDatasetCommand
      .mockResolvedValueOnce({
        data: [{ review: { id: 'review-1' } }],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: [{ review: { id: 'review-2' } }],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      });

    const result = await reviewsApi.saveReviewAssignmentDraftApi(
      ['review-1', 'review-2'],
      ['user-1', 'user-2'],
    );

    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(
      1,
      'admin_review_save_assignment_draft',
      {
        reviewId: 'review-1',
        reviewerIds: ['user-1', 'user-2'],
      },
    );
    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(
      2,
      'admin_review_save_assignment_draft',
      {
        reviewId: 'review-2',
        reviewerIds: ['user-1', 'user-2'],
      },
    );
    expect(result).toEqual({
      data: [{ review: { id: 'review-1' } }, { review: { id: 'review-2' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('assigns reviewers with an explicit deadline through the admin review command', async () => {
    const commandResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    const result = await reviewsApi.assignReviewersApi(
      ['review-1'],
      ['user-3'],
      '2026-04-10T12:00:00.000Z',
    );

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('admin_review_assign_reviewers', {
      reviewId: 'review-1',
      reviewerIds: ['user-3'],
      deadline: '2026-04-10T12:00:00.000Z',
    });
    expect(result).toEqual(commandResult);
  });

  it('assigns reviewers with a null deadline when none is provided', async () => {
    const commandResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    await reviewsApi.assignReviewersApi(['review-1'], ['user-3']);

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('admin_review_assign_reviewers', {
      reviewId: 'review-1',
      reviewerIds: ['user-3'],
      deadline: null,
    });
  });

  it('returns the first batch error while flattening null command data', async () => {
    mockInvokeDatasetCommand
      .mockResolvedValueOnce({
        data: null,
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'assignment failed' },
        count: null,
        status: 409,
        statusText: 'CONFLICT',
      });

    const result = await reviewsApi.saveReviewAssignmentDraftApi(
      ['review-1', 'review-2'],
      ['user-1'],
    );

    expect(result).toEqual({
      data: [],
      error: { message: 'assignment failed' },
      count: null,
      status: 409,
      statusText: 'CONFLICT',
    });
  });

  it('assigns reviewers with a null deadline and flattens empty batch payload rows', async () => {
    mockInvokeDatasetCommand
      .mockResolvedValueOnce({
        data: null,
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: [{ review: { id: 'review-2' } }],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      });

    const result = await reviewsApi.assignReviewersApi(['review-1', 'review-2'], ['user-9']);

    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(1, 'admin_review_assign_reviewers', {
      reviewId: 'review-1',
      reviewerIds: ['user-9'],
      deadline: null,
    });
    expect(result).toEqual({
      data: [{ review: { id: 'review-2' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });
  });

  it('revokes reviewers through the admin review command', async () => {
    const commandResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    const result = await reviewsApi.revokeReviewerApi('review-1', 'user-9');

    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('admin_review_revoke_reviewer', {
      reviewId: 'review-1',
      reviewerId: 'user-9',
    });
    expect(result).toEqual(commandResult);
  });

  it('approves and rejects reviews through the admin review commands', async () => {
    const approveResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    const rejectResult = {
      data: [{ review: { id: 'review-1' } }],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    };
    mockInvokeDatasetCommand
      .mockResolvedValueOnce(approveResult)
      .mockResolvedValueOnce(rejectResult);

    const approve = await reviewsApi.approveReviewApi('review-1', 'processes');
    const reject = await reviewsApi.rejectReviewApi('review-1', 'lifecyclemodels', 'Needs fixes');

    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(1, 'admin_review_approve', {
      reviewId: 'review-1',
      table: 'processes',
    });
    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(2, 'admin_review_reject', {
      reviewId: 'review-1',
      table: 'lifecyclemodels',
      reason: 'Needs fixes',
    });
    expect(approve).toEqual(approveResult);
    expect(reject).toEqual(rejectResult);
  });

  it('keeps admin finalization and reviewer opinions on separate batch endpoints', async () => {
    const commandResult = { data: { ok: true }, error: null };
    mockInvokeDatasetCommand.mockResolvedValue(commandResult);

    await reviewsApi.submitAdminReviewBatchDecision(
      ['review-1', 'review-1', 'review-2'],
      'reject',
      '  Needs fixes  ',
    );
    await reviewsApi.submitReviewerBatchDecision(['review-3'], 'approve');

    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(1, 'admin_review_batch_decision', {
      reviewIds: ['review-1', 'review-2'],
      decision: 'reject',
      reason: 'Needs fixes',
    });
    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(2, 'app_review_batch_decision', {
      reviewIds: ['review-3'],
      decision: 'approve',
    });
  });

  it('checks the actor-scoped batch scope with deduplicated review ids', async () => {
    const eligibility = [
      {
        ordinal: 1,
        review_id: 'review-1',
        eligible: true,
        reviewer_count: 2,
        submitted_opinion_count: 2,
        approve_opinion_count: 2,
        reject_opinion_count: 0,
      },
    ];
    mockRpc.mockResolvedValueOnce({ data: eligibility, error: null });

    const result = await reviewsApi.getReviewBatchEligibility(
      ['review-1', 'review-1'],
      'admin-approve',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_batch_eligibility_v1', {
      p_review_ids: ['review-1'],
      p_operation: 'admin-approve',
    });
    expect(result).toEqual({ data: eligibility, error: null });
  });

  it('normalizes an empty batch eligibility response', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await reviewsApi.getReviewBatchEligibility([], 'reviewer-reject');

    expect(mockRpc).toHaveBeenCalledWith('qry_review_batch_eligibility_v1', {
      p_review_ids: [],
      p_operation: 'reviewer-reject',
    });
    expect(result).toEqual({ data: [], error: null });
  });
});

describe('updateReviewApi', () => {
  it('returns a structured deprecation error without calling legacy edge handlers', async () => {
    const result = await reviewsApi.updateReviewApi(['review-1'], { reviewer_id: ['user-1'] });

    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: {
        message: 'Use explicit command endpoints instead',
        code: 'LEGACY_ENDPOINT_REMOVED',
        details: 'updateReviewApi',
        hint: '',
      },
    });
  });
});

describe('getReviewerIdsApi', () => {
  it('returns deduplicated reviewer ids when supabase responds with multiple rows', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ reviewer_id: ['user-1', 'user-2'] }, { reviewer_id: ['user-2', 'user-3'] }],
      error: null,
    });

    const result = await reviewsApi.getReviewerIdsApi(['review-1', 'review-2']);

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_review_ids: ['review-1', 'review-2'],
      p_data_id: null,
      p_data_version: null,
      p_state_codes: null,
    });
    expect(result).toEqual(['user-1', 'user-2', 'user-3']);
  });

  it('returns empty array when supabase payload is missing', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await reviewsApi.getReviewerIdsApi(['review-1']);

    expect(result).toEqual([]);
  });

  it('ignores reviewer rows whose reviewer_id is not an array', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ reviewer_id: ['user-1'] }, { reviewer_id: 'user-2' }, { reviewer_id: null }, {}],
      error: null,
    });

    const result = await reviewsApi.getReviewerIdsApi(['review-1']);

    expect(result).toEqual(['user-1']);
  });
});

describe('getReviewsDetail', () => {
  it('returns review detail for given id', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'review-1' }], error: null });

    const result = await reviewsApi.getReviewsDetail('review-1');

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_review_ids: ['review-1'],
      p_data_id: null,
      p_data_version: null,
      p_state_codes: null,
    });
    expect(result).toEqual({ id: 'review-1' });
  });

  it('returns null when the review id cannot be found', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getReviewsDetail('missing-review');

    expect(result).toBeNull();
  });
});

describe('getReviewsDetailByReviewIds', () => {
  it('returns review list for ids', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'review-1' }, { id: 'review-2' }],
      error: null,
    });

    const result = await reviewsApi.getReviewsDetailByReviewIds(['review-1', 'review-2']);

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_review_ids: ['review-1', 'review-2'],
      p_data_id: null,
      p_data_version: null,
      p_state_codes: null,
    });
    expect(result).toEqual([{ id: 'review-1' }, { id: 'review-2' }]);
  });
});

describe('getReviewsByProcess', () => {
  it('queries reviews by process id and version', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'review-1' }], error: null });

    const result = await reviewsApi.getReviewsByProcess('process-1', '1.0');

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_review_ids: null,
      p_data_id: 'process-1',
      p_data_version: '1.0',
      p_state_codes: null,
    });
    expect(result).toEqual({ data: [{ id: 'review-1' }], error: null });
  });
});

describe('getRejectReviewsByProcess', () => {
  it('queries rejected reviews by process id and version', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'review-1' }], error: null });

    const result = await reviewsApi.getRejectReviewsByProcess('process-1', '1.0');

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_review_ids: null,
      p_data_id: 'process-1',
      p_data_version: '1.0',
      p_state_codes: [-1],
    });
    expect(result).toEqual({ data: [{ id: 'review-1' }], error: null });
  });
});

describe('getReviewsTableDataOfReviewMember', () => {
  it('forwards queue filters and defaults the page size to fifty', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: undefined as any, current: undefined as any },
      {},
      'pending',
      'en',
      { user_id: 'reviewer-1' },
      { displayMode: 'other', targetTable: 'sources' },
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'pending',
      p_page: 1,
      p_page_size: 50,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
      p_display_mode: 'other',
      p_target_table: 'sources',
    });
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it('returns empty table when reviewer user id cannot be resolved', async () => {
    mockGetUserId.mockResolvedValueOnce(undefined);

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'reviewed',
      'en',
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it('preserves pending queue query errors', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'db failed' }, data: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'pending',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'pending',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result).toEqual({ data: [], success: false, total: 0, error: { message: 'db failed' } });
  });

  it('resolves pending comments with getUserId when userData is omitted', async () => {
    mockGetUserId.mockResolvedValueOnce('pending-reviewer');
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'pending',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'pending',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it.each([
    { type: 'pending' as const },
    { type: 'reviewed' as const },
    { type: 'reviewer-rejected' as const },
  ])('enriches $type rows from the current visible identity profile', async ({ type }) => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: `review-member-${type}`,
          target_table: 'contacts',
          json: {
            data: { id: `contact-${type}`, version: '01.00.000' },
            user: { id: 'submitter-1', name: 'Stale Snapshot Name' },
          },
        },
      ],
      error: null,
    });
    mockGetUsersByIds.mockResolvedValueOnce([
      {
        id: 'submitter-1',
        email: 'submitter@example.com',
        display_name: 'Current Submitter',
      },
    ]);

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      type,
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockGetUsersByIds).toHaveBeenCalledTimes(1);
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['submitter-1']);
    expect(result.data[0].userName).toBe('Current Submitter');
  });

  it('keeps the retained review snapshot when identity enrichment fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-member-profile-failure',
          target_table: 'contacts',
          json: {
            data: { id: 'contact-profile-failure', version: '01.00.000' },
            user: {
              id: 'submitter-profile-failure',
              name: 'Snapshot Submitter',
              email: 'snapshot@example.com',
            },
          },
        },
      ],
      error: null,
    });
    mockGetUsersByIds.mockRejectedValueOnce(new Error('identity lookup failed'));

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'pending',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(result.data[0].userName).toBe('Snapshot Submitter');
  });

  it('keeps the retained review snapshot when no visible identity rows are returned', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-member-profile-missing',
          target_table: 'contacts',
          json: {
            data: { id: 'contact-profile-missing', version: '01.00.000' },
            user: {
              id: 'submitter-profile-missing',
              email: 'snapshot-missing@example.com',
            },
          },
        },
      ],
      error: null,
    });
    mockGetUsersByIds.mockResolvedValueOnce(null);

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'pending',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockGetUsersByIds).toHaveBeenCalledWith(['submitter-profile-missing']);
    expect(result.data[0].userName).toBe('snapshot-missing@example.com');
  });

  it('maps reviewer-rejected comments with lifecycle model enrichment', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-1',
          state_code: -1,
          review_kind: 'root',
          target_table: 'lifecyclemodels',
          root_matches_status: true,
          root_can_read: true,
          created_at: '2024-04-01T00:00:00.000Z',
          modified_at: '2024-04-02T00:00:00.000Z',
          deadline: '2024-04-20T00:00:00.000Z',
          review_state_code: -1,
          reviewer_id: ['reviewer-1'],
          comment_state_code: -1,
          comment_modified_at: '2024-04-03T00:00:00.000Z',
          json: {
            data: {
              id: 'process-1',
              version: '01.00.000',
              name: {
                baseName: { en: 'Fallback Base' },
                treatmentStandardsRoutes: { en: 'Fallback Route' },
                mixAndLocationTypes: { en: 'Fallback Mix' },
                functionalUnitFlowProperties: { en: 'Fallback Unit' },
              },
            },
            team: { name: { en: 'Team A' } },
            user: { email: 'reviewer@example.com' },
          },
          comment_json: { comment: { message: 'reject' } },
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'process-1',
          version: '01.00.000',
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Model Base' },
                    treatmentStandardsRoutes: { en: 'Model Route' },
                    mixAndLocationTypes: { en: 'Model Mix' },
                    functionalUnitFlowProperties: { en: 'Model Unit' },
                  },
                },
              },
            },
          },
          json_tg: { version: 'tg' },
        },
      ],
    });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 2 },
      { modified_at: 'descend' },
      'reviewer-rejected',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'completed',
      p_page: 2,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(mockGetLifeCyclesByIdAndVersion).toHaveBeenCalledWith([
      { id: 'process-1', version: '01.00.000' },
    ]);
    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result).toHaveProperty('page', 2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'review-1',
      isFromLifeCycle: true,
      reviewKind: 'root',
      targetTable: 'lifecyclemodels',
      stateCode: -1,
      rootMatchesStatus: true,
      rootCanRead: true,
      actorCommentModifiedAt: '2024-04-03T00:00:00.000Z',
      teamName: 'Team A',
      userName: 'reviewer@example.com',
      deadline: '2024-04-20T00:00:00.000Z',
      modelData: {
        id: 'process-1',
        version: '01.00.000',
      },
    });
    expect(result.data[0].name).toContain('Model Base');
  });

  it('falls back to review payload fields when no lifecycle model matches', async () => {
    mockGetUserId.mockResolvedValueOnce('reviewer-fallback');
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-fallback',
          created_at: '2024-06-01T00:00:00.000Z',
          modified_at: '2024-06-02T00:00:00.000Z',
          reviewer_id: ['reviewer-fallback'],
          comment_state_code: 1,
          json: {
            data: {
              id: 'process-fallback',
              version: '02.00.000',
              name: {
                baseName: { en: 'Fallback Base' },
                treatmentStandardsRoutes: { en: 'Fallback Route' },
                mixAndLocationTypes: { en: 'Fallback Mix' },
                functionalUnitFlowProperties: { en: 'Fallback Unit' },
              },
            },
            user: { email: 'fallback@example.com' },
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      {} as any,
      {},
      'reviewed',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'submitted',
      p_page: 1,
      p_page_size: 50,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result).toMatchObject({
      data: [
        {
          key: 'review-fallback',
          id: 'review-fallback',
          isFromLifeCycle: false,
          name: 'Fallback Base; Fallback Route; Fallback Mix; Fallback Unit',
          teamName: '-',
          userName: 'fallback@example.com',
          createAt: '2024-06-01T00:00:00.000Z',
          modifiedAt: '2024-06-02T00:00:00.000Z',
          deadline: undefined,
          json: {
            data: {
              id: 'process-fallback',
              version: '02.00.000',
              name: {
                baseName: { en: 'Fallback Base' },
                treatmentStandardsRoutes: { en: 'Fallback Route' },
                mixAndLocationTypes: { en: 'Fallback Mix' },
                functionalUnitFlowProperties: { en: 'Fallback Unit' },
              },
            },
            user: { email: 'fallback@example.com' },
          },
          comments: [],
          modelData: null,
        },
      ],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('uses lifecycle fallbacks and missing-user placeholders for reviewer-rejected rows', async () => {
    mockGetUserId.mockResolvedValueOnce('reviewer-fallback');
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-rejected-fallback',
          created_at: '2024-07-01T00:00:00.000Z',
          modified_at: '2024-07-02T00:00:00.000Z',
          reviewer_id: ['reviewer-fallback'],
          comment_state_code: -1,
          json: {
            data: {
              id: 'process-model-fallback',
              version: '01.00.000',
            },
            user: {},
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'process-model-fallback',
          version: '01.00.000',
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {},
              },
            },
          },
          json_tg: { version: 'tg-fallback' },
        },
      ],
    });

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'reviewer-rejected',
      'en',
    );

    expect(result.data[0]).toMatchObject({
      isFromLifeCycle: true,
      name: '-',
      userName: '-',
    });
  });

  it('falls back to "-" when a matched lifecycle model name resolves to an empty process name', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-member-empty-model-name',
          created_at: '2024-07-01T00:00:00.000Z',
          modified_at: '2024-07-02T00:00:00.000Z',
          reviewer_id: ['reviewer-1'],
          comment_state_code: 1,
          json: { data: { id: 'model-process', version: '01.00.000' }, user: { email: 'x@y.z' } },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'model-process',
          version: '01.00.000',
          json: {
            lifeCycleModelDataSet: { lifeCycleModelInformation: { dataSetInformation: {} } },
          },
        },
      ],
    });
    mockGenProcessName.mockReturnValueOnce('');

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'reviewed',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(result.data[0].name).toBe('-');
  });

  it('falls back to "-" when a non-lifecycle review row has no process name payload', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-member-empty-review-name',
          created_at: '2024-07-01T00:00:00.000Z',
          modified_at: '2024-07-02T00:00:00.000Z',
          reviewer_id: ['reviewer-1'],
          comment_state_code: 1,
          json: { data: { id: 'plain-process', version: '01.00.000' }, user: { email: 'x@y.z' } },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });
    mockGenProcessName.mockReturnValueOnce('');

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      {},
      'reviewed',
      'en',
      { user_id: 'reviewer-1' },
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(result.data[0].name).toBe('-');
  });

  it('uses default sorting, lifecycle fallbacks, and undefined timestamps when optional inputs are missing', async () => {
    mockGetUserId.mockResolvedValueOnce('reviewer-default-sort');
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-member-default-sort',
          reviewer_id: ['reviewer-default-sort'],
          json: {
            data: {
              id: 'plain-process-default-sort',
              version: '01.00.000',
            },
            user: {},
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce(undefined);

    const result = await reviewsApi.getReviewsTableDataOfReviewMember(
      { pageSize: 10, current: 1 },
      undefined,
      'reviewed',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items_v5', {
      p_query: null,
      p_status: 'submitted',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result.data[0]).toMatchObject({
      id: 'review-member-default-sort',
      createAt: undefined,
      modifiedAt: undefined,
      deadline: undefined,
      name: '-',
      userName: '-',
    });
  });
});

describe('getReviewsTableDataOfReviewAdmin', () => {
  it('forwards queue filters and defaults the page size to fifty', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: undefined as any, current: undefined as any },
      {},
      'unassigned',
      'en',
      { displayMode: 'model_process', targetTable: 'processes' },
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_admin_queue_items_v5', {
      p_query: null,
      p_status: 'unassigned',
      p_page: 1,
      p_page_size: 50,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
      p_display_mode: 'model_process',
      p_target_table: 'processes',
    });
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it('returns empty table for unassigned type when no rows exist', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      {},
      'unassigned',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_admin_queue_items_v5', {
      p_query: null,
      p_status: 'unassigned',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it.each([
    { type: 'unassigned' as const },
    { type: 'assigned' as const },
    { type: 'admin-rejected' as const },
  ])('batch-enriches and deduplicates submitters for $type rows', async ({ type }) => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: `review-admin-${type}-1`,
          target_table: 'contacts',
          json: {
            data: { id: `contact-${type}-1`, version: '01.00.000' },
            user: { id: 'submitter-1', name: 'Stale Snapshot Name' },
          },
        },
        {
          id: `review-admin-${type}-2`,
          target_table: 'sources',
          json: {
            data: { id: `source-${type}-2`, version: '01.00.000' },
            user: { id: 'submitter-2' },
          },
        },
        {
          id: `review-admin-${type}-3`,
          target_table: 'flows',
          json: {
            data: { id: `flow-${type}-3`, version: '01.00.000' },
            user: { id: 'submitter-1' },
          },
        },
      ],
      error: null,
    });
    mockGetUsersByIds.mockResolvedValueOnce([
      {
        id: 'submitter-1',
        email: 'submitter-1@example.com',
        display_name: 'Current Submitter',
      },
      {
        id: 'submitter-2',
        email: 'submitter-2@example.com',
        display_name: '   ',
      },
    ]);

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      {},
      type,
      'en',
    );

    expect(mockGetUsersByIds).toHaveBeenCalledTimes(1);
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['submitter-1', 'submitter-2']);
    expect(result.data.map((row: any) => row.userName)).toEqual([
      'Current Submitter',
      'submitter-2@example.com',
      'Current Submitter',
    ]);
  });

  it('applies assigned query filters and maps table data', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-10',
          created_at: '2024-04-01T00:00:00.000Z',
          modified_at: '2024-04-03T00:00:00.000Z',
          deadline: null,
          comment_state_codes: [1, -3, -2],
          total_count: 1,
          json: {
            data: {
              id: 'process-2',
              version: '01.00.000',
              name: {
                baseName: { en: 'Review Base' },
                treatmentStandardsRoutes: { en: 'Review Route' },
                mixAndLocationTypes: { en: 'Review Mix' },
                functionalUnitFlowProperties: { en: 'Review Unit' },
              },
            },
            team: { name: { en: 'Ops Team' } },
            user: { name: 'Alice Reviewer' },
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 2 },
      {},
      'assigned',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_admin_queue_items_v5', {
      p_query: null,
      p_status: 'in-progress',
      p_page: 2,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('page', 2);
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 'review-10',
      comments: [{ state_code: 1 }, { state_code: -3 }],
      isFromLifeCycle: false,
      teamName: 'Ops Team',
      userName: 'Alice Reviewer',
      modelData: null,
    });
    expect(result.data[0].name).toContain('Review Base');
  });

  it('falls back to an empty comments array when assigned review comments are not arrays', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-10-no-array-comments',
          created_at: '2024-04-01T00:00:00.000Z',
          modified_at: '2024-04-03T00:00:00.000Z',
          deadline: null,
          comment_state_codes: null,
          total_count: 1,
          json: {
            data: {
              id: 'process-2',
              version: '01.00.000',
              name: {
                baseName: { en: 'Review Base' },
                treatmentStandardsRoutes: { en: 'Review Route' },
                mixAndLocationTypes: { en: 'Review Mix' },
                functionalUnitFlowProperties: { en: 'Review Unit' },
              },
            },
            team: { name: { en: 'Ops Team' } },
            user: { name: 'Alice Reviewer' },
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      {},
      'assigned',
      'en',
    );

    expect(result.data[0]).toMatchObject({
      id: 'review-10-no-array-comments',
      comments: [],
      isFromLifeCycle: false,
    });
  });

  it('returns default empty response when query result has no data field', async () => {
    mockRpc.mockResolvedValueOnce({ count: 0, error: null });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      { modified_at: 'ascend' },
      'admin-rejected',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_admin_queue_items_v5', {
      p_query: null,
      p_status: 'completed',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'ascend',
    });
    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it('maps admin-rejected rows with lifecycle model metadata and fallbacks', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-admin-model',
          target_table: 'lifecyclemodels',
          created_at: '2024-06-01T00:00:00.000Z',
          modified_at: '2024-06-03T00:00:00.000Z',
          deadline: '2024-06-20T00:00:00.000Z',
          comments: [],
          json: {
            data: {
              id: 'model-backed-process',
              version: '03.00.000',
              name: {
                baseName: { en: 'Unused Base' },
                treatmentStandardsRoutes: { en: 'Unused Route' },
                mixAndLocationTypes: { en: 'Unused Mix' },
                functionalUnitFlowProperties: { en: 'Unused Unit' },
              },
            },
            user: { email: 'admin-fallback@example.com' },
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'model-backed-process',
          version: '03.00.000',
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Model Admin Base' },
                    treatmentStandardsRoutes: { en: 'Model Admin Route' },
                    mixAndLocationTypes: { en: 'Model Admin Mix' },
                    functionalUnitFlowProperties: { en: 'Model Admin Unit' },
                  },
                },
              },
            },
          },
          json_tg: { version: 'tg-admin' },
        },
      ],
    });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      {} as any,
      {},
      'admin-rejected',
      'en',
    );

    expect(result).toMatchObject({
      data: [
        {
          key: 'review-admin-model',
          id: 'review-admin-model',
          isFromLifeCycle: true,
          targetTable: 'lifecyclemodels',
          name: 'Model Admin Base; Model Admin Route; Model Admin Mix; Model Admin Unit',
          teamName: '-',
          userName: 'admin-fallback@example.com',
          createAt: '2024-06-01T00:00:00.000Z',
          modifiedAt: '2024-06-03T00:00:00.000Z',
          deadline: '2024-06-20T00:00:00.000Z',
          json: {
            data: {
              id: 'model-backed-process',
              version: '03.00.000',
              name: {
                baseName: { en: 'Unused Base' },
                treatmentStandardsRoutes: { en: 'Unused Route' },
                mixAndLocationTypes: { en: 'Unused Mix' },
                functionalUnitFlowProperties: { en: 'Unused Unit' },
              },
            },
            user: { email: 'admin-fallback@example.com' },
          },
          comments: [],
          modelData: {
            id: 'model-backed-process',
            version: '03.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  dataSetInformation: {
                    name: {
                      baseName: { en: 'Model Admin Base' },
                      treatmentStandardsRoutes: { en: 'Model Admin Route' },
                      mixAndLocationTypes: { en: 'Model Admin Mix' },
                      functionalUnitFlowProperties: { en: 'Model Admin Unit' },
                    },
                  },
                },
              },
            },
            json_tg: { version: 'tg-admin' },
          },
        },
      ],
      page: 1,
      success: true,
      total: 0,
    });
  });

  it('uses lifecycle and user fallbacks for admin rows when names are missing', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-admin-fallback',
          created_at: '2024-08-01T00:00:00.000Z',
          modified_at: '2024-08-02T00:00:00.000Z',
          json: {
            data: {
              id: 'model-admin-fallback',
              version: '09.00.000',
            },
            user: {},
          },
          comments: [],
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'model-admin-fallback',
          version: '09.00.000',
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {},
              },
            },
          },
        },
      ],
    });

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      {},
      'admin-rejected',
      'en',
    );

    expect(result.data[0]).toMatchObject({
      isFromLifeCycle: true,
      name: '-',
      userName: '-',
    });
  });

  it('falls back to "-" when a non-lifecycle admin row has no process name payload', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-admin-empty-review-name',
          created_at: '2024-08-01T00:00:00.000Z',
          modified_at: '2024-08-02T00:00:00.000Z',
          json: {
            data: { id: 'plain-admin-process', version: '01.00.000' },
            user: { email: 'x@y.z' },
          },
          comments: [],
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });
    mockGenProcessName.mockReturnValueOnce('');

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      {},
      'admin-rejected',
      'en',
    );

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(result.data[0].name).toBe('-');
  });

  it('uses default sorting and lifecycle fallbacks when optional admin queue inputs are missing', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-admin-default-sort',
          comment_state_codes: [0],
          json: {
            data: {
              id: 'plain-admin-default-sort',
              version: '01.00.000',
            },
            user: {},
          },
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce(undefined);

    const result = await reviewsApi.getReviewsTableDataOfReviewAdmin(
      { pageSize: 10, current: 1 },
      undefined,
      'assigned',
      'en',
    );

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_admin_queue_items_v5', {
      p_query: null,
      p_status: 'in-progress',
      p_page: 1,
      p_page_size: 10,
      p_sort_by: 'modified_at',
      p_sort_order: 'descend',
    });
    expect(result.data[0]).toMatchObject({
      id: 'review-admin-default-sort',
      createAt: undefined,
      modifiedAt: undefined,
      comments: [{ state_code: 0 }],
      name: '-',
      userName: '-',
    });
  });
});

describe('getNotifyReviews', () => {
  it('returns failure response when session is missing', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    const result = await reviewsApi.getNotifyReviews({ pageSize: 10, current: 1 }, 'en');

    expect(result).toEqual({ data: [], success: false, total: 0 });
  });

  it('loads notifications from qry_notification_get_my_data_items', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-1',
          json: {
            data: {
              id: 'process-1',
              version: '1.0',
              name: {
                baseName: { en: 'Process Base' },
                treatmentStandardsRoutes: { en: 'Process Route' },
                mixAndLocationTypes: { en: 'Process Mix' },
                functionalUnitFlowProperties: { en: 'Process Unit' },
              },
            },
            team: { name: { en: 'Team Name' } },
            user: { name: 'Alice' },
            comment: { message: 'Need changes' },
          },
          modified_at: '2024-04-30T12:00:00.000Z',
          state_code: -1,
          total_count: 1,
        },
      ],
      error: null,
    });

    const result = await reviewsApi.getNotifyReviews({ pageSize: 5, current: 3 }, 'en', 3);

    expect(mockRpc).toHaveBeenCalledWith('qry_notification_get_my_data_items', {
      p_page: 3,
      p_page_size: 5,
      p_days: 3,
    });
    expect(result).toEqual({
      data: [
        {
          key: 'review-1',
          id: 'review-1',
          isFromLifeCycle: false,
          name: 'Process Base; Process Route; Process Mix; Process Unit',
          teamName: 'Team Name',
          userName: 'Alice',
          modifiedAt: '2024-04-30T12:00:00.000Z',
          stateCode: -1,
          json: {
            data: {
              id: 'process-1',
              version: '1.0',
              name: {
                baseName: { en: 'Process Base' },
                treatmentStandardsRoutes: { en: 'Process Route' },
                mixAndLocationTypes: { en: 'Process Mix' },
                functionalUnitFlowProperties: { en: 'Process Unit' },
              },
            },
            team: { name: { en: 'Team Name' } },
            user: { name: 'Alice' },
            comment: { message: 'Need changes' },
          },
        },
      ],
      page: 3,
      success: true,
      total: 1,
    });
  });

  it('returns empty success response when no notifications are found', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await reviewsApi.getNotifyReviews({ pageSize: 10, current: 1 }, 'en', 0);

    expect(result).toEqual({ data: [], success: true, total: 0 });
  });

  it('returns failure response when rpc payload is malformed', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await reviewsApi.getNotifyReviews({ pageSize: 10, current: 1 }, 'en', 0);

    expect(result).toEqual({ data: [], success: false, total: 0 });
  });

  it('maps lifecycle-backed notifications with page and total fallbacks', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-notify-model',
          json: {
            data: {
              id: 'process-notify-model',
              version: '04.00.000',
              name: {
                baseName: { en: 'Unused Notify Base' },
                treatmentStandardsRoutes: { en: 'Unused Notify Route' },
                mixAndLocationTypes: { en: 'Unused Notify Mix' },
                functionalUnitFlowProperties: { en: 'Unused Notify Unit' },
              },
            },
            user: {},
          },
          modified_at: '2024-06-05T12:00:00.000Z',
          state_code: 2,
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'process-notify-model',
          version: '04.00.000',
          json: {
            lifeCycleModelDataSet: {
              lifeCycleModelInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Notify Model Base' },
                    treatmentStandardsRoutes: { en: 'Notify Model Route' },
                    mixAndLocationTypes: { en: 'Notify Model Mix' },
                    functionalUnitFlowProperties: { en: 'Notify Model Unit' },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const result = await reviewsApi.getNotifyReviews({} as any, 'en', 0);

    expect(result).toEqual({
      data: [
        {
          key: 'review-notify-model',
          id: 'review-notify-model',
          isFromLifeCycle: true,
          name: 'Notify Model Base; Notify Model Route; Notify Model Mix; Notify Model Unit',
          teamName: '-',
          userName: '-',
          modifiedAt: '2024-06-05T12:00:00.000Z',
          stateCode: 2,
          json: {
            data: {
              id: 'process-notify-model',
              version: '04.00.000',
              name: {
                baseName: { en: 'Unused Notify Base' },
                treatmentStandardsRoutes: { en: 'Unused Notify Route' },
                mixAndLocationTypes: { en: 'Unused Notify Mix' },
                functionalUnitFlowProperties: { en: 'Unused Notify Unit' },
              },
            },
            user: {},
          },
        },
      ],
      page: 1,
      success: true,
      total: 1,
    });
  });

  it('uses review payload fallbacks and missing-user placeholders when no model matches', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-notify-fallback',
          json: {
            data: {
              id: 'process-notify-fallback',
              version: '05.00.000',
            },
            user: {},
          },
          modified_at: '2024-06-06T12:00:00.000Z',
          state_code: 1,
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });

    const result = await reviewsApi.getNotifyReviews({ pageSize: 10, current: 1 }, 'en', 0);

    expect(result.data[0]).toMatchObject({
      isFromLifeCycle: false,
      name: '-',
      userName: '-',
    });
  });

  it('falls back to "-" when a matched notification lifecycle model name resolves empty', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-notify-empty-model-name',
          json: { data: { id: 'notify-model', version: '01.00.000' }, user: { email: 'x@y.z' } },
          modified_at: '2024-06-06T12:00:00.000Z',
          state_code: 1,
          total_count: 1,
        },
      ],
      error: null,
    });
    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({
      data: [
        {
          id: 'notify-model',
          version: '01.00.000',
          json: {
            lifeCycleModelDataSet: { lifeCycleModelInformation: { dataSetInformation: {} } },
          },
        },
      ],
    });
    mockGenProcessName.mockReturnValueOnce('');

    const result = await reviewsApi.getNotifyReviews({ pageSize: 10, current: 1 }, 'en', 0);

    expect(mockGenProcessName).toHaveBeenCalledWith({}, 'en');
    expect(result.data[0].name).toBe('-');
  });

  it('uses default paging and zero totals when notification rows omit total_count', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-notify-no-total',
          json: {
            data: {
              id: 'process-notify-no-total',
              version: '06.00.000',
            },
            user: {},
          },
          modified_at: '2024-06-07T12:00:00.000Z',
          state_code: 3,
        },
      ],
      error: null,
    });

    mockGetLifeCyclesByIdAndVersion.mockResolvedValueOnce({ data: [] });

    const result = await reviewsApi.getNotifyReviews({} as any, 'en', 0);

    expect(result).toEqual({
      data: [
        {
          key: 'review-notify-no-total',
          id: 'review-notify-no-total',
          isFromLifeCycle: false,
          name: '-',
          teamName: '-',
          userName: '-',
          modifiedAt: '2024-06-07T12:00:00.000Z',
          stateCode: 3,
          json: {
            data: {
              id: 'process-notify-no-total',
              version: '06.00.000',
            },
            user: {},
          },
        },
      ],
      page: 1,
      success: true,
      total: 0,
    });
  });
});

describe('getNotifyReviewsCount', () => {
  it('returns failure response when session is missing', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    const result = await reviewsApi.getNotifyReviewsCount();

    expect(result).toEqual({ success: false, total: 0 });
  });

  it('uses qry_notification_get_my_data_count with the last view time filter', async () => {
    mockRpc.mockResolvedValueOnce({ data: 5, error: null });

    const lastViewTime = new Date('2024-05-01T00:00:00.000Z').getTime();
    const result = await reviewsApi.getNotifyReviewsCount(3, lastViewTime);

    expect(mockRpc).toHaveBeenCalledWith('qry_notification_get_my_data_count', {
      p_days: 3,
      p_last_view_at: new Date(lastViewTime).toISOString(),
    });
    expect(result).toEqual({ success: true, total: 5 });
  });

  it('reports rpc errors as failed notification counts', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db failed' } });

    const result = await reviewsApi.getNotifyReviewsCount(7);

    expect(result).toEqual({ success: false, total: 0 });
  });

  it('returns success without a last view timestamp when filters are disabled', async () => {
    mockRpc.mockResolvedValueOnce({ data: 2, error: null });

    const result = await reviewsApi.getNotifyReviewsCount(0);

    expect(mockRpc).toHaveBeenCalledWith('qry_notification_get_my_data_count', {
      p_days: 0,
      p_last_view_at: null,
    });
    expect(result).toEqual({ success: true, total: 2 });
  });
});

describe('getLatestReviewOfMine', () => {
  it('returns null when no authenticated user', async () => {
    mockGetUserId.mockResolvedValueOnce(null);

    const result = await reviewsApi.getLatestReviewOfMine();

    expect(result).toBeNull();
  });

  it('returns latest review when user exists', async () => {
    mockGetUserId.mockResolvedValueOnce('user-1');
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'review-1',
          modified_at: '2026-08-07T01:00:00Z',
          json: { user: { id: 'user-1' } },
        },
        {
          id: 'review-other',
          modified_at: '2026-08-07T02:00:00Z',
          json: { user: { id: 'user-2' } },
        },
        {
          id: 'review-older',
          modified_at: '2026-08-06T01:00:00Z',
          json: { user: { id: 'user-1' } },
        },
      ],
      error: null,
    });

    const result = await reviewsApi.getLatestReviewOfMine();

    expect(mockRpc).toHaveBeenCalledWith('qry_review_get_items', {
      p_data_id: null,
      p_data_version: null,
      p_review_ids: null,
      p_state_codes: [1, 2, -1],
    });
    expect(result).toEqual([
      expect.objectContaining({ id: 'review-1', json: { user: { id: 'user-1' } } }),
    ]);
  });

  it('returns an empty list when the review query has no data payload', async () => {
    mockGetUserId.mockResolvedValueOnce('user-1');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(reviewsApi.getLatestReviewOfMine()).resolves.toEqual([]);
  });
});

describe('getLifeCycleModelSubTableDataBatch', () => {
  it('returns empty success when input array is empty', async () => {
    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch([], 'en');

    expect(result).toEqual({ data: {}, success: true });
  });

  it('returns empty success when no process references exist in models', async () => {
    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch(
      [
        {
          reviewId: 'review-1',
          modelData: {
            id: 'model-1',
            version: '01.00.000',
            json: {},
            json_tg: {},
          },
        },
      ],
      'en',
    );

    expect(mockGetProcessDetailByIdAndVersion).not.toHaveBeenCalled();
    expect(result).toEqual({ data: {}, success: true });
  });

  it('returns failure when batch process fetch fails', async () => {
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({ success: false, data: null });

    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch(
      [
        {
          reviewId: 'review-1',
          modelData: {
            id: 'model-1',
            version: '01.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  technology: {
                    processes: {
                      processInstance: [
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-1',
                            '@version': '01.00.000',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            json_tg: {},
          },
        },
      ],
      'en',
    );

    expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: {}, success: false });
  });

  it('groups process details by review and removes duplicate process entries', async () => {
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'process-1',
          version: '01.00.000',
          state_code: 20,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Process 1' },
                    treatmentStandardsRoutes: { en: 'Route 1' },
                    mixAndLocationTypes: { en: 'Mix 1' },
                    functionalUnitFlowProperties: { en: 'Unit 1' },
                  },
                },
              },
            },
          },
        },
        {
          id: 'process-2',
          version: '01.00.000',
          state_code: 20,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Process 2' },
                    treatmentStandardsRoutes: { en: 'Route 2' },
                    mixAndLocationTypes: { en: 'Mix 2' },
                    functionalUnitFlowProperties: { en: 'Unit 2' },
                  },
                },
              },
            },
          },
        },
        {
          id: 'process-3',
          version: '02.00.000',
          state_code: 10,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Process 3' },
                    treatmentStandardsRoutes: { en: 'Route 3' },
                    mixAndLocationTypes: { en: 'Mix 3' },
                    functionalUnitFlowProperties: { en: 'Unit 3' },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch(
      [
        {
          reviewId: 'review-a',
          modelData: {
            id: 'model-1',
            version: '01.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  technology: {
                    processes: {
                      processInstance: [
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-1',
                            '@version': '01.00.000',
                          },
                        },
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-1',
                            '@version': '01.00.000',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            json_tg: {
              submodels: [{ id: 'process-2', type: 'secondary' }],
            },
          },
        },
        {
          reviewId: 'review-b',
          modelData: {
            id: 'model-2',
            version: '02.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  technology: {
                    processes: {
                      processInstance: [
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-1',
                            '@version': '01.00.000',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            json_tg: {
              submodels: [{ id: 'process-3', type: 'primary' }],
            },
          },
        },
      ],
      'en',
    );

    const processParams = mockGetProcessDetailByIdAndVersion.mock.calls[0][0];
    expect(processParams).toHaveLength(3);
    expect(processParams).toEqual(
      expect.arrayContaining([
        { id: 'process-1', version: '01.00.000' },
        { id: 'process-2', version: '01.00.000' },
        { id: 'process-3', version: '02.00.000' },
      ]),
    );
    expect(result.success).toBe(true);
    expect(result.data['review-a']).toHaveLength(2);
    expect(result.data['review-b']).toHaveLength(1);
    expect(result.data['review-a'].find((it: any) => it.id === 'process-2')).toMatchObject({
      id: 'process-2',
      sourceType: 'submodel',
      submodelType: 'secondary',
    });
    expect(result.data['review-a'].find((it: any) => it.id === 'process-1')?.sourceType).toBe(
      'processInstance',
    );
    expect(result.data['review-a'][0].name).toContain('Process');
  });

  it('skips empty model entries and keeps valid grouped process rows', async () => {
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'process-valid',
          version: '01.00.000',
          state_code: 20,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {},
              },
            },
          },
        },
      ],
    });

    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch(
      [
        {
          reviewId: 'review-empty',
          modelData: null as any,
        },
        {
          reviewId: 'review-valid',
          modelData: {
            id: 'model-valid',
            version: '01.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  technology: {
                    processes: {
                      processInstance: [
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-valid',
                            '@version': '01.00.000',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            json_tg: {},
          },
        },
      ],
      'en',
    );

    expect(mockGetProcessDetailByIdAndVersion).toHaveBeenCalledWith([
      { id: 'process-valid', version: '01.00.000' },
    ]);
    expect(result).toEqual({
      data: {
        'review-valid': [
          {
            key: 'process-valid',
            id: 'process-valid',
            version: '01.00.000',
            name: '-',
            sourceType: 'processInstance',
            submodelType: undefined,
          },
        ],
      },
      success: true,
    });
  });

  it('ignores returned process rows that do not belong to any requested review key', async () => {
    mockGetProcessDetailByIdAndVersion.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'unexpected-process',
          version: '77.00.000',
          state_code: 20,
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: {
                    baseName: { en: 'Unexpected Base' },
                    treatmentStandardsRoutes: { en: 'Unexpected Route' },
                    mixAndLocationTypes: { en: 'Unexpected Mix' },
                    functionalUnitFlowProperties: { en: 'Unexpected Unit' },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const result = await reviewsApi.getLifeCycleModelSubTableDataBatch(
      [
        {
          reviewId: 'review-1',
          modelData: {
            id: 'model-1',
            version: '01.00.000',
            json: {
              lifeCycleModelDataSet: {
                lifeCycleModelInformation: {
                  technology: {
                    processes: {
                      processInstance: [
                        {
                          referenceToProcess: {
                            '@refObjectId': 'process-1',
                            '@version': '01.00.000',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            json_tg: {},
          },
        },
      ],
      'en',
    );

    expect(result).toEqual({ data: {}, success: true });
  });
});

describe('review queue full-text search', () => {
  it.each(['unassigned', 'assigned', 'admin-rejected'] as const)(
    'forwards the query with filters for admin %s',
    async (status) => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });
      await reviewsApi.getReviewsTableDataOfReviewAdmin(
        { current: 2, pageSize: 10 },
        {},
        status,
        'zh',
        { query: '变压器 wind', displayMode: 'model_process', targetTable: 'processes' },
      );
      expect(mockRpc).toHaveBeenCalledWith(
        'qry_review_get_admin_queue_items_v5',
        expect.objectContaining({
          p_query: '变压器 wind',
          p_status:
            status === 'assigned'
              ? 'in-progress'
              : status === 'admin-rejected'
                ? 'completed'
                : status,
          p_page: 2,
          p_display_mode: 'model_process',
          p_target_table: 'processes',
        }),
      );
    },
  );
  it.each(['pending', 'reviewed', 'reviewer-rejected'] as const)(
    'forwards the query for member %s',
    async (status) => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });
      await reviewsApi.getReviewsTableDataOfReviewMember(
        { current: 1, pageSize: 50 },
        {},
        status,
        'zh',
        { user_id: 'reviewer-1' },
        { query: '49.5MW' },
      );
      expect(mockRpc).toHaveBeenCalledWith(
        'qry_review_get_member_queue_items_v5',
        expect.objectContaining({
          p_query: '49.5MW',
          p_status:
            status === 'reviewed'
              ? 'submitted'
              : status === 'reviewer-rejected'
                ? 'completed'
                : status,
        }),
      );
    },
  );
  it('preserves admin query errors instead of returning an empty success', async () => {
    const error = { code: '22023', message: 'invalid query' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      reviewsApi.getReviewsTableDataOfReviewAdmin(
        { current: 1, pageSize: 50 },
        {},
        'unassigned',
        'en',
        { query: '(' },
      ),
    ).resolves.toEqual({ data: [], total: 0, success: false, error });
  });
});
