import { createLegacyMutationRemovedError, invokeDatasetCommand } from '@/services/general/api';
import { supabase } from '@/services/supabase';
import { getUserId } from '@/services/users/api';
import type { SortOrder } from 'antd/es/table/interface';
import { resolveTableSort } from '../general/tableSort';
import {
  normalizeReviewCommentPayload,
  prepareReviewCommentApproval,
  type ReviewDatasetKind,
} from './reviewPayload';

type ReviewCommentCommandFunctionName =
  'app_review_save_comment_draft' | 'app_review_submit_comment';

type ReviewCommentRpcRow = {
  review_id: string;
  reviewer_id: string;
  state_code: number;
  json: any;
  created_at?: string;
  modified_at?: string;
};

type ReviewMemberQueueRpcRow = {
  id: string;
  review_state_code?: number;
  reviewer_id?: string[] | null;
  json: any;
  deadline?: string | null;
  created_at?: string;
  modified_at?: string;
  comment_state_code?: number;
  comment_json?: any;
  comment_created_at?: string;
  comment_modified_at?: string;
  total_count?: number | string | null;
};

async function invokeReviewCommentCommand<Row extends Record<string, unknown>>(
  functionName: ReviewCommentCommandFunctionName,
  body: Record<string, unknown>,
) {
  return invokeDatasetCommand<Row>(functionName as never, body);
}

function normalizeQueueResult(row: ReviewMemberQueueRpcRow, reviewerId: string) {
  return {
    review_id: row.id,
    reviewer_id: reviewerId,
    state_code: row.comment_state_code,
    json: row.comment_json,
    created_at: row.comment_created_at,
    modified_at: row.comment_modified_at,
    reviews: {
      id: row.id,
      state_code: row.review_state_code,
      reviewer_id: row.reviewer_id,
      json: row.json,
      deadline: row.deadline,
      created_at: row.created_at,
      modified_at: row.modified_at,
    },
  };
}

async function getReviewMemberQueueComments(
  status: 'reviewed' | 'pending' | 'reviewer-rejected',
  params?: {
    current?: number;
    pageSize?: number;
  },
  sort?: Record<string, SortOrder>,
  user_id?: string,
) {
  const { field: sortBy, order: orderBy } = resolveTableSort(sort, 'modified_at');
  const userId = user_id ?? (await getUserId());

  if (!userId) {
    return { error: true, data: [] };
  }

  const { data, error } = await supabase.rpc('qry_review_get_member_queue_items', {
    p_status: status,
    p_page: params?.current ?? 1,
    p_page_size: params?.pageSize ?? 10,
    p_sort_by: sortBy,
    p_sort_order: orderBy,
  });

  const rows = (Array.isArray(data) ? data : []) as ReviewMemberQueueRpcRow[];

  return {
    data: rows.map((row) => normalizeQueueResult(row, userId)),
    error,
    count: Number(rows?.[0]?.total_count ?? 0) || 0,
  };
}

export async function addCommentApi(data: any) {
  void data;
  return { error: createLegacyMutationRemovedError('addCommentApi') };
}

export async function updateCommentByreviewerApi(reviewId: string, reviewerId: string, data: any) {
  void reviewId;
  void reviewerId;
  void data;
  return { error: createLegacyMutationRemovedError('updateCommentByreviewerApi') };
}

export async function updateCommentApi(
  reviewId: string,
  data: any,
  tabType: 'assigned' | 'review' | 'reviewer-rejected' | 'admin-rejected',
) {
  void reviewId;
  void data;
  void tabType;
  return {
    error: createLegacyMutationRemovedError('updateCommentApi'),
  };
}

export async function saveReviewCommentDraftApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(reviewId: string, json: unknown) {
  return invokeReviewCommentCommand<Row>('app_review_save_comment_draft', {
    reviewId,
    json: normalizeReviewCommentPayload(json),
  });
}

export async function submitReviewCommentApi<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(
  reviewId: string,
  json: unknown,
  commentState: 1 | -3 = 1,
  datasetKind: ReviewDatasetKind = 'process',
) {
  return invokeReviewCommentCommand<Row>('app_review_submit_comment', {
    reviewId,
    json:
      commentState === 1
        ? prepareReviewCommentApproval(json, datasetKind)
        : normalizeReviewCommentPayload(json),
    ...(commentState === 1 ? {} : { commentState }),
  });
}

export async function getCommentApi(
  reviewId: string,
  actionType: 'assigned' | 'review' | 'reviewer-rejected' | 'admin-rejected',
) {
  if (['assigned', 'review', 'reviewer-rejected', 'admin-rejected'].includes(actionType)) {
    if (actionType === 'review' || actionType === 'reviewer-rejected') {
      const userId = await getUserId();

      if (!userId) {
        return { error: true, data: [] };
      }
    }

    const scope = actionType === 'assigned' || actionType === 'admin-rejected' ? 'all' : 'mine';
    const { data, error } = await supabase.rpc('qry_review_get_comment_items', {
      p_review_id: reviewId,
      p_scope: scope,
    });
    const rows = (Array.isArray(data) ? data : []) as ReviewCommentRpcRow[];

    return {
      data: rows.map((row) => ({
        ...row,
        json: row?.json ?? {},
      })),
      error,
    };
  }
  return { data: [], error: true };
}

export async function getReviewedComment(
  params: {
    current?: number;
    pageSize?: number;
  } = {},
  sort: Record<string, SortOrder> = {},
  user_id?: string,
) {
  return getReviewMemberQueueComments('reviewed', params, sort, user_id);
}

export async function getPendingComment(
  params: {
    current?: number;
    pageSize?: number;
  } = {},
  sort: Record<string, SortOrder> = {},
  user_id?: string,
) {
  return getReviewMemberQueueComments('pending', params, sort, user_id);
}

export async function getRejectedComment(
  params: {
    current?: number;
    pageSize?: number;
  } = {},
  sort: Record<string, SortOrder> = {},
  user_id?: string,
) {
  return getReviewMemberQueueComments('reviewer-rejected', params, sort, user_id);
}

export async function getUserManageComments() {
  const reviewerId = await getUserId();
  if (!reviewerId) {
    return { data: [], error: true };
  }

  const results = await Promise.all(
    (['pending', 'reviewed', 'reviewer-rejected'] as const).map((status) =>
      supabase.rpc('qry_review_get_member_queue_items', {
        p_status: status,
        p_page: 1,
        p_page_size: 100,
        p_sort_by: 'modified_at',
        p_sort_order: 'desc',
      }),
    ),
  );
  const error = results.find((result) => result.error)?.error ?? null;
  const data = results.flatMap((result) =>
    ((result.data ?? []) as ReviewMemberQueueRpcRow[])
      .filter((row) => Number(row.review_state_code ?? 0) > 0)
      .map((row) => ({
        review_id: row.id,
        state_code: row.comment_state_code,
        reviewer_id: reviewerId,
        reviews: { state_code: row.review_state_code },
      })),
  );
  return { data, error };
}

export async function getReviewerIdsByReviewId(reviewId: string) {
  const { data, error } = await getCommentApi(reviewId, 'assigned');

  if (error) {
    return [];
  }

  return data.map((comment) => ({
    state_code: comment.state_code,
    reviewer_id: comment.reviewer_id,
  }));
}

export async function getRejectedCommentsByReviewIds(reviewIds: string[]) {
  const results = await Promise.all(
    reviewIds.map((reviewId) => getCommentApi(reviewId, 'admin-rejected')),
  );
  const firstError = results.find((result) => result.error)?.error ?? null;
  const data = results.flatMap((result) =>
    result.data
      .filter((comment) => comment.state_code === -1)
      .map((comment) => ({ json: comment.json })),
  );

  return {
    data,
    error: firstError,
  };
}
