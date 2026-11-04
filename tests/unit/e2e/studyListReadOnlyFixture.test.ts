import {
  readOnlyStudyListFixture,
  STUDY_LIST_PATH,
} from '../../e2e/i18n/study-list-readonly-fixture';
import { classifyProductionRequest } from '../../e2e/i18n/production-request-guard';

const expectedOrigin = 'https://semantic-backend.invalid';
const expectedPublishableKey = 'synthetic-publishable-key';
const body = {
  schemaVersion: 'lca.study-api.v2',
  requestId: 'first-page-request',
  operation: 'study.list',
  cursor: null,
  limit: 25,
};
const makeRequest = (
  overrides: {
    method?: string;
    url?: string;
    body?: unknown;
    raw?: string | null;
    headers?: Record<string, string>;
  } = {},
) => ({
  method: () => overrides.method ?? 'POST',
  url: () => overrides.url ?? expectedOrigin + STUDY_LIST_PATH,
  postData: () =>
    'raw' in overrides ? (overrides.raw ?? null) : JSON.stringify(overrides.body ?? body),
  headers: () =>
    overrides.headers ?? { apikey: expectedPublishableKey, Authorization: 'Bearer synthetic' },
});

describe('closed synthetic Study-list fixture', () => {
  it('returns an owner-codec-validated empty first page without widening the production guard', () => {
    const request = makeRequest();
    expect(
      readOnlyStudyListFixture({
        expectedOrigin,
        expectedPublishableKey,
        persona: 'standard_user',
        request,
      }),
    ).toEqual({
      schemaVersion: body.schemaVersion,
      requestId: body.requestId,
      ok: true,
      data: { type: 'studyPage', items: [], nextCursor: null },
    });
    expect(
      classifyProductionRequest(
        'POST',
        request.url(),
        expectedOrigin,
        request.postData(),
        request.headers(),
        expectedPublishableKey,
      ),
    ).toBe('block');
  });

  it('does not give an anonymous persona or a missing bearer an authenticated response', () => {
    for (const input of [
      { persona: 'anonymous' as const, request: makeRequest() },
      {
        persona: 'standard_user' as const,
        request: makeRequest({ headers: { apikey: expectedPublishableKey } }),
      },
    ]) {
      expect(
        readOnlyStudyListFixture({ expectedOrigin, expectedPublishableKey, ...input }),
      ).toMatchObject({ ok: false, code: 'AUTH_REQUIRED', retryable: false });
    }
  });

  it.each([
    { method: 'GET' },
    { url: 'https://other.invalid' + STUDY_LIST_PATH },
    { url: expectedOrigin + '/functions/v1/app_other' },
    { url: expectedOrigin + STUDY_LIST_PATH + '?expanded=true' },
    { headers: { apikey: 'wrong', authorization: 'Bearer synthetic' } },
    { raw: null },
    { raw: '{invalid' },
    { raw: 'x'.repeat(1025) },
    { body: { ...body, schemaVersion: 'lca.study-api.v4' } },
    { body: { ...body, operation: 'study.create' } },
    { body: { ...body, idempotencyKey: 'not-authorized' } },
    { body: { ...body, cursor: 'another-page' } },
    { body: { ...body, limit: 100 } },
  ])('rejects every request outside its exact bounded read shape: %j', (overrides) => {
    expect(() =>
      readOnlyStudyListFixture({
        expectedOrigin,
        expectedPublishableKey,
        persona: 'standard_user',
        request: makeRequest(overrides),
      }),
    ).toThrow();
  });
});
