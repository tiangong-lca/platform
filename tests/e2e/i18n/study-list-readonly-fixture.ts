import { parseRequest, parseResponse } from '../../../vendor/study-contract/v2/index.mjs';
import type { HarnessPersona } from './harness-contract';

export const STUDY_LIST_PATH = '/functions/v1/app_lca_study';

type RequestLike = {
  headers: () => Record<string, string>;
  method: () => string;
  postData: () => string | null;
  url: () => string;
};

/** Synthetic first-page fixture only. It grants no production transport or business operation. */
export function readOnlyStudyListFixture(input: {
  expectedOrigin: string;
  expectedPublishableKey: string;
  persona: HarnessPersona;
  request: RequestLike;
}) {
  const { expectedOrigin, expectedPublishableKey, persona, request } = input;
  const target = new URL(request.url());
  const headers = Object.fromEntries(
    Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const raw = request.postData();
  if (
    request.method() !== 'POST' ||
    target.origin !== expectedOrigin ||
    target.pathname !== STUDY_LIST_PATH ||
    target.search !== '' ||
    headers.apikey !== expectedPublishableKey ||
    typeof raw !== 'string' ||
    raw.length > 1024
  )
    throw new Error('Refusing a request outside the synthetic Study-list transport.');
  const body = parseRequest(JSON.parse(raw));
  if (body.operation !== 'study.list' || body.cursor !== null || body.limit !== 25)
    throw new Error('Refusing a request outside the exact synthetic Study first page.');
  const authenticated =
    persona !== 'anonymous' && /^Bearer \S+$/u.test(headers.authorization ?? '');
  return parseResponse(
    authenticated
      ? {
          schemaVersion: body.schemaVersion,
          requestId: body.requestId,
          ok: true,
          data: { type: 'studyPage', items: [], nextCursor: null },
        }
      : {
          schemaVersion: body.schemaVersion,
          requestId: body.requestId,
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Synthetic Study list requires the authenticated persona.',
          retryable: false,
          issues: [],
        },
  );
}
