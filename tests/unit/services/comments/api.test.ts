/**
 * Tests for comments service API functions
 * Path: src/services/comments/api.ts
 */

import {
  addCommentApi,
  getCommentApi,
  getPendingComment,
  getRejectedComment,
  getRejectedCommentsByReviewIds,
  getReviewedComment,
  getReviewerIdsByReviewId,
  getUserManageComments,
  saveReviewCommentDraftApi,
  submitReviewCommentApi,
  updateCommentApi,
  updateCommentByreviewerApi,
} from '@/services/comments/api';

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn(),
    },
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('@/services/users/api', () => ({
  getUserId: jest.fn(),
}));

jest.mock('@/services/general/api', () => ({
  createLegacyMutationRemovedError: (boundary: string) => ({
    message: 'Use explicit command endpoints instead',
    code: 'LEGACY_ENDPOINT_REMOVED',
    details: boundary,
    hint: '',
  }),
  invokeDatasetCommand: jest.fn(),
}));

const {
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    auth: { getSession: mockAuthGetSession },
    functions: { invoke: mockFunctionsInvoke },
  },
} = jest.requireMock('@/services/supabase');

const { getUserId: mockGetUserId } = jest.requireMock('@/services/users/api');
const { invokeDatasetCommand: mockInvokeDatasetCommand } =
  jest.requireMock('@/services/general/api');

describe('Comments API service (src/services/comments/api.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserId.mockResolvedValue('current-user-id');
  });

  describe('review workflow comment command wrappers', () => {
    it('saves comment drafts through the review command boundary', async () => {
      const commandResult = {
        data: [{ comment: { review_id: 'review-123' } }],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      };
      mockInvokeDatasetCommand.mockResolvedValue(commandResult);

      const result = await saveReviewCommentDraftApi('review-123', { foo: 'bar' });

      expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_review_save_comment_draft', {
        reviewId: 'review-123',
        json: { foo: 'bar' },
      });
      expect(result).toEqual(commandResult);
    });

    it('submits review comments and forwards reviewer reject state when provided', async () => {
      const submitResult = {
        data: [{ comment: { review_id: 'review-123' } }],
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      };
      mockInvokeDatasetCommand
        .mockResolvedValueOnce(submitResult)
        .mockResolvedValueOnce(submitResult);

      const defaultSubmit = await submitReviewCommentApi('review-123', { summary: 'ok' });
      const rejectSubmit = await submitReviewCommentApi(
        'review-123',
        { comment: { message: 'reject' } },
        -3,
      );

      expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(1, 'app_review_submit_comment', {
        reviewId: 'review-123',
        json: { summary: 'ok' },
      });
      expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(2, 'app_review_submit_comment', {
        reviewId: 'review-123',
        json: { comment: { message: 'reject' } },
        commentState: -3,
      });
      expect(defaultSubmit).toEqual(submitResult);
      expect(rejectSubmit).toEqual(submitResult);
    });
  });

  it('normalizes drafts and rejected comments without blocking incomplete metadata', async () => {
    const json = {
      modellingAndValidation: {
        validation: {
          review: [
            {
              '@type': 'Independent external review',
              'common:referenceToCompleteReviewReport': { 'common:shortDescription': [] },
            },
          ],
        },
      },
    };
    const cleaned = {
      modellingAndValidation: {
        validation: { review: [{ '@type': 'Independent external review' }] },
      },
    };
    await saveReviewCommentDraftApi('review-123', json);
    await submitReviewCommentApi('review-123', json, -3);
    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(1, 'app_review_save_comment_draft', {
      reviewId: 'review-123',
      json: cleaned,
    });
    expect(mockInvokeDatasetCommand).toHaveBeenNthCalledWith(2, 'app_review_submit_comment', {
      reviewId: 'review-123',
      json: cleaned,
      commentState: -3,
    });
  });

  it('blocks malformed approval metadata before invoking the command', async () => {
    await expect(
      submitReviewCommentApi('review-123', {
        modellingAndValidation: {
          validation: {
            review: {
              '@type': 'Independent external review',
              'common:scope': { '@name': '单一操作单元过程' },
            },
          },
        },
      }),
    ).rejects.toThrow('REVIEW_METADATA_INVALID');
    expect(mockInvokeDatasetCommand).not.toHaveBeenCalled();
  });

  it('submits cleaned valid approval metadata', async () => {
    await submitReviewCommentApi('review-123', {
      modellingAndValidation: {
        validation: {
          review: {
            '@type': 'Not reviewed',
            'common:referenceToCompleteReviewReport': { 'common:shortDescription': [] },
          },
        },
      },
    });
    expect(mockInvokeDatasetCommand).toHaveBeenCalledWith('app_review_submit_comment', {
      reviewId: 'review-123',
      json: { modellingAndValidation: { validation: { review: { '@type': 'Not reviewed' } } } },
    });
  });

  describe('legacy mutations', () => {
    it('returns a structured deprecation error from addCommentApi', async () => {
      const result = await addCommentApi({
        review_id: 'review-123',
        reviewer_id: 'user-123',
        content: 'Test comment',
      });

      expect(mockFrom).not.toHaveBeenCalled();
      expect(result).toEqual({
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'addCommentApi',
          hint: '',
        },
      });
    });

    it('returns a structured deprecation error from updateCommentByreviewerApi', async () => {
      const result = await updateCommentByreviewerApi('review-123', 'user-123', {
        content: 'Updated',
      });

      expect(mockFrom).not.toHaveBeenCalled();
      expect(result).toEqual({
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'updateCommentByreviewerApi',
          hint: '',
        },
      });
    });

    it('returns a structured deprecation error from updateCommentApi', async () => {
      const result = await updateCommentApi('review-123', { content: 'Updated' }, 'assigned');

      expect(mockAuthGetSession).not.toHaveBeenCalled();
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
      expect(result).toEqual({
        error: {
          message: 'Use explicit command endpoints instead',
          code: 'LEGACY_ENDPOINT_REMOVED',
          details: 'updateCommentApi',
          hint: '',
        },
      });
    });
  });

  describe('getCommentApi', () => {
    it('fetches reviewer-scoped comments for review action type', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ review_id: 'review-123', reviewer_id: 'current-user-id', json: null }],
        error: null,
      });

      const result = await getCommentApi('review-123', 'review');

      expect(mockGetUserId).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_comment_items', {
        p_review_id: 'review-123',
        p_scope: 'mine',
      });
      expect(result).toEqual({
        data: [{ review_id: 'review-123', reviewer_id: 'current-user-id', json: {} }],
        error: null,
      });
    });

    it('returns error when user ID is not available for reviewer-scoped actions', async () => {
      mockGetUserId.mockResolvedValueOnce('');

      const result = await getCommentApi('review-123', 'reviewer-rejected');

      expect(mockRpc).not.toHaveBeenCalled();
      expect(result).toEqual({ error: true, data: [] });
    });

    it('fetches all comments for assigned action type', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ review_id: 'review-123', reviewer_id: 'user-1', json: { note: 1 } }],
        error: null,
      });

      const result = await getCommentApi('review-123', 'assigned');

      expect(mockGetUserId).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_comment_items', {
        p_review_id: 'review-123',
        p_scope: 'all',
      });
      expect(result).toEqual({
        data: [{ review_id: 'review-123', reviewer_id: 'user-1', json: { note: 1 } }],
        error: null,
      });
    });

    it('falls back to an empty comment list when the rpc payload is not an array', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await getCommentApi('review-123', 'assigned');

      expect(result).toEqual({
        data: [],
        error: null,
      });
    });

    it('fetches admin-rejected comments without reviewer narrowing', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ review_id: 'review-123', reviewer_id: 'user-2', json: { reason: 'reject' } }],
        error: null,
      });

      const result = await getCommentApi('review-123', 'admin-rejected');

      expect(mockGetUserId).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_comment_items', {
        p_review_id: 'review-123',
        p_scope: 'all',
      });
      expect(result.error).toBeNull();
    });

    it('returns error for invalid action type', async () => {
      const result = await getCommentApi('review-123', 'invalid' as any);

      expect(mockRpc).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], error: true });
    });
  });

  describe('review member queue queries', () => {
    it('fetches reviewed comments for current user with default paging', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: 'review-1',
            review_state_code: 2,
            reviewer_id: ['current-user-id'],
            json: { data: { id: 'process-1' } },
            comment_state_code: 1,
            comment_json: { summary: 'ok' },
            comment_created_at: '2024-04-01T00:00:00.000Z',
            comment_modified_at: '2024-04-02T00:00:00.000Z',
            total_count: 2,
          },
        ],
        error: null,
      });

      const result = await getReviewedComment();

      expect(mockGetUserId).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'reviewed',
        p_page: 1,
        p_page_size: 10,
        p_sort_by: 'modified_at',
        p_sort_order: 'descend',
      });
      expect(result).toEqual({
        data: [
          {
            review_id: 'review-1',
            reviewer_id: 'current-user-id',
            state_code: 1,
            json: { summary: 'ok' },
            created_at: '2024-04-01T00:00:00.000Z',
            modified_at: '2024-04-02T00:00:00.000Z',
            reviews: {
              id: 'review-1',
              state_code: 2,
              reviewer_id: ['current-user-id'],
              json: { data: { id: 'process-1' } },
              deadline: undefined,
              created_at: undefined,
              modified_at: undefined,
            },
          },
        ],
        error: null,
        count: 2,
      });
    });

    it('supports explicit paging and ascending sorting for reviewed comments', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ id: 'review-2', total_count: '1' }],
        error: null,
      });

      const result = await getReviewedComment(
        { current: 2, pageSize: 5 },
        { created_at: 'ascend' } as any,
        'specific-user-id',
      );

      expect(mockGetUserId).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'reviewed',
        p_page: 2,
        p_page_size: 5,
        p_sort_by: 'created_at',
        p_sort_order: 'ascend',
      });
      expect(result.count).toBe(1);
      expect(result.data[0].reviewer_id).toBe('specific-user-id');
    });

    it('returns error when user ID is not available for reviewed queue', async () => {
      mockGetUserId.mockResolvedValueOnce('');

      const result = await getReviewedComment();

      expect(mockRpc).not.toHaveBeenCalled();
      expect(result).toEqual({ error: true, data: [] });
    });

    it('fetches pending comments with default fallbacks when params are nullish', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ id: 'review-pending-defaults', total_count: null }],
        error: null,
      });

      const result = await getPendingComment(
        { current: null as any, pageSize: null as any },
        null as any,
        'user-1',
      );

      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'pending',
        p_page: 1,
        p_page_size: 10,
        p_sort_by: 'modified_at',
        p_sort_order: 'descend',
      });
      expect(result.count).toBe(0);
    });

    it('uses wrapper defaults and falls back to an empty pending queue when rpc data is missing', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await getPendingComment(undefined, undefined, 'user-1');

      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'pending',
        p_page: 1,
        p_page_size: 10,
        p_sort_by: 'modified_at',
        p_sort_order: 'descend',
      });
      expect(result).toEqual({
        data: [],
        error: null,
        count: 0,
      });
    });

    it('fetches rejected comments with explicit paging and sort', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ id: 'review-rejected', total_count: 1 }],
        error: null,
      });

      const result = await getRejectedComment(
        { current: 2, pageSize: 4 },
        { created_at: 'ascend' } as any,
        'specific-user-id',
      );

      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'reviewer-rejected',
        p_page: 2,
        p_page_size: 4,
        p_sort_by: 'created_at',
        p_sort_order: 'ascend',
      });
      expect(result.count).toBe(1);
      expect(result.data[0].reviewer_id).toBe('specific-user-id');
    });

    it('uses wrapper defaults for rejected comments when params and sort are omitted', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ id: 'review-rejected-defaults', total_count: 0 }],
        error: null,
      });

      const result = await getRejectedComment(undefined, undefined, 'specific-user-id');

      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_member_queue_items', {
        p_status: 'reviewer-rejected',
        p_page: 1,
        p_page_size: 10,
        p_sort_by: 'modified_at',
        p_sort_order: 'descend',
      });
      expect(result.count).toBe(0);
      expect(result.data[0].reviewer_id).toBe('specific-user-id');
    });
  });

  describe('getUserManageComments', () => {
    it('returns an empty failure without querying when the reviewer id is unavailable', async () => {
      mockGetUserId.mockResolvedValueOnce('');

      await expect(getUserManageComments()).resolves.toEqual({ data: [], error: true });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('handles null queue payloads, query errors, and rows without review state codes', async () => {
      const queryError = { message: 'queue unavailable' };
      mockRpc
        .mockResolvedValueOnce({ data: null, error: queryError })
        .mockResolvedValueOnce({ data: [{ id: 'review-without-state' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      await expect(getUserManageComments()).resolves.toEqual({ data: [], error: queryError });
    });

    it('fetches all user management comments with specific state codes', async () => {
      mockRpc
        .mockResolvedValueOnce({
          data: [{ id: 'review-1', review_state_code: 1, comment_state_code: 0 }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'review-2', review_state_code: 2, comment_state_code: 1 }],
          error: null,
        })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await getUserManageComments();

      expect(mockRpc).toHaveBeenCalledTimes(3);
      expect(mockRpc).toHaveBeenNthCalledWith(
        1,
        'qry_review_get_member_queue_items',
        expect.objectContaining({ p_status: 'pending', p_page_size: 100 }),
      );
      expect(result).toEqual({
        data: [
          {
            review_id: 'review-1',
            state_code: 0,
            reviewer_id: 'current-user-id',
            reviews: { state_code: 1 },
          },
          {
            review_id: 'review-2',
            state_code: 1,
            reviewer_id: 'current-user-id',
            reviews: { state_code: 2 },
          },
        ],
        error: null,
      });
    });
  });

  describe('aggregation helpers', () => {
    it('maps reviewer ids and state codes from assigned-scope comments', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          { reviewer_id: 'user-1', state_code: 0, json: {} },
          { reviewer_id: 'user-2', state_code: 1, json: {} },
        ],
        error: null,
      });

      const result = await getReviewerIdsByReviewId('review-123');

      expect(mockRpc).toHaveBeenCalledWith('qry_review_get_comment_items', {
        p_review_id: 'review-123',
        p_scope: 'all',
      });
      expect(result).toEqual([
        { reviewer_id: 'user-1', state_code: 0 },
        { reviewer_id: 'user-2', state_code: 1 },
      ]);
    });

    it('returns empty array when reviewer id lookup fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: { message: 'db failed' } });

      const result = await getReviewerIdsByReviewId('review-123');

      expect(result).toEqual([]);
    });

    it('aggregates admin-rejected comments per review id and filters rejected rows only', async () => {
      mockRpc
        .mockResolvedValueOnce({
          data: [
            { state_code: -1, json: { reason: 'Rejected A' } },
            { state_code: 1, json: { reason: 'Approved' } },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [{ state_code: -1, json: { reason: 'Rejected B' } }],
          error: null,
        });

      const result = await getRejectedCommentsByReviewIds(['review-1', 'review-2']);

      expect(mockRpc).toHaveBeenNthCalledWith(1, 'qry_review_get_comment_items', {
        p_review_id: 'review-1',
        p_scope: 'all',
      });
      expect(mockRpc).toHaveBeenNthCalledWith(2, 'qry_review_get_comment_items', {
        p_review_id: 'review-2',
        p_scope: 'all',
      });
      expect(result).toEqual({
        data: [{ json: { reason: 'Rejected A' } }, { json: { reason: 'Rejected B' } }],
        error: null,
      });
    });

    it('surfaces the first aggregation error while keeping successful rejected rows', async () => {
      mockRpc
        .mockResolvedValueOnce({
          data: [{ state_code: -1, json: { reason: 'Rejected A' } }],
          error: { message: 'partial failure' },
        })
        .mockResolvedValueOnce({
          data: [{ state_code: -1, json: { reason: 'Rejected B' } }],
          error: null,
        });

      const result = await getRejectedCommentsByReviewIds(['review-1', 'review-2']);

      expect(result).toEqual({
        data: [{ json: { reason: 'Rejected A' } }, { json: { reason: 'Rejected B' } }],
        error: { message: 'partial failure' },
      });
    });
  });
});
