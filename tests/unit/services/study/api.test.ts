const mockIdentityGeneration = jest.fn(() => 0);
const mockSubscribeIdentity = jest.fn();
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => mockIdentityGeneration(),
  subscribeTaskCenterIdentity: (...args: unknown[]) => mockSubscribeIdentity(...args),
}));
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  core,
  analysis,
  review,
  expectType,
  readArtifact,
  newWriteKey,
  subscribeStudyIdentityChange,
  readPendingStudyWrite,
  recoverPendingStudyWrite,
  retirePendingStudyWrite,
} from '@/services/study/api';

const mockGetSession = jest.fn();
const mockGetClaims = jest.fn();
const mockInvoke = jest.fn();
const mockOnAuthStateChange = jest.fn();
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      getClaims: (...args: unknown[]) => mockGetClaims(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));
const session = (id = 'actor-a') => ({
  data: { session: { access_token: 'synthetic-session', user: { id } } },
});
const envelope = (body: any, data: unknown) => ({
  schemaVersion: body.schemaVersion,
  requestId: body.requestId,
  ok: true,
  data,
});
const failure = (body: any, code = 'FORBIDDEN') => ({
  schemaVersion: body.schemaVersion,
  requestId: body.requestId,
  ok: false,
  code,
  message: 'Denied',
  retryable: false,
  issues: [],
});

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
});
beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(session());
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'actor-a' } }, error: null });
  window.sessionStorage.clear();
});

it('sends only the current bearer session and decodes all exact schema versions', async () => {
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(
      body,
      body.schemaVersion.endsWith('v2')
        ? { type: 'studyPage', items: [], nextCursor: null }
        : body.schemaVersion.endsWith('v3')
          ? {
              type: 'resourcePage',
              studyId: 'study-a',
              kind: 'analysis',
              items: [],
              nextCursor: null,
            }
          : {
              type: 'actions',
              resource: { type: 'study', id: 'study-a' },
              actions: [],
              corePermissions: { read: true, write: false },
              allowedMemberRoles: [],
            },
    ),
    error: null,
  }));
  expect(await core({ operation: 'study.list', cursor: null, limit: 25 })).toEqual({
    type: 'studyPage',
    items: [],
    nextCursor: null,
  });
  await analysis({
    operation: 'study.resources.list',
    studyId: 'study-a',
    kind: 'analysis',
    cursor: null,
    limit: 25,
  });
  await review({ operation: 'resource.actions', resource: { type: 'study', id: 'study-a' } });
  expect(mockInvoke).toHaveBeenCalledTimes(3);
  for (const [name, options] of mockInvoke.mock.calls) {
    expect(name).toBe('app_lca_study');
    expect(options.headers.Authorization).toBe('Bearer synthetic-session');
    expect(options.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  }
  expect(newWriteKey()).not.toBe(newWriteKey());
});
it('rejects unauthenticated and switched identities without displaying a stale response', async () => {
  mockGetSession.mockResolvedValueOnce({ data: { session: null } });
  await expect(core({ operation: 'study.list', cursor: null, limit: 25 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
  mockGetSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session('actor-b'));
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, { type: 'studyPage', items: [], nextCursor: null }),
    error: null,
  }));
  await expect(core({ operation: 'study.list', cursor: null, limit: 25 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
});
it('retains original write key across an ambiguous transport result and rejects foreign response bindings', async () => {
  const body = {
    operation: 'comment.append' as const,
    reportRevisionId: 'report-a',
    expectedContentHash: 'a'.repeat(64),
    text: 'Comment',
    idempotencyKey: newWriteKey(),
  };
  mockInvoke.mockResolvedValueOnce({
    data: null,
    error: {
      context: {
        json: () => {
          throw new Error('lost');
        },
      },
    },
  });
  await expect(review(body)).rejects.toMatchObject({
    code: 'UPSTREAM_UNAVAILABLE',
    retryable: true,
  });
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: null,
    error: { context: { json: async () => failure(body) } },
  }));
  await expect(review(body)).rejects.toMatchObject({ code: 'FORBIDDEN', retryable: false });
  expect(mockInvoke.mock.calls.map((call) => call[1].body.idempotencyKey)).toEqual([
    body.idempotencyKey,
    body.idempotencyKey,
  ]);
  mockInvoke.mockResolvedValue({ data: null, error: {} });
  await expect(review(body)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: {
      ...envelope(body, { type: 'studyPage', items: [], nextCursor: null }),
      requestId: 'foreign-request',
    },
    error: null,
  }));
  await expect(core({ operation: 'study.list', cursor: null, limit: 25 })).rejects.toThrow();
  expect(() => expectType({ type: 'other' } as any, 'wanted')).toThrow('REFERENCE_MISMATCH');
});
it('verifies artifact bytes against exact byte size and SHA-256 before JSON parsing', async () => {
  const bytes = new TextEncoder().encode('{"authority":"frozen"}');
  const contentHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const ref = {
    type: 'modelInput' as const,
    id: 'artifact-a',
    contentHash,
    byteSize: bytes.length,
    digestScope: 'artifact_bytes_sha256' as const,
    mediaType: 'application/json' as const,
    schemaVersion: 'lca.study-prepared-input.v1',
  };
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, {
      type: 'artifact',
      studyId: 'study-a',
      artifactRef: body.artifactRef,
      encoding: 'base64',
      bytes: btoa(new TextDecoder().decode(bytes)),
    }),
    error: null,
  }));
  expect(await readArtifact('study-a', ref)).toEqual({ authority: 'frozen' });
  await expect(
    readArtifact('study-a', { ...ref, byteSize: bytes.length + 1 }),
  ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
  await expect(
    readArtifact('study-a', { ...ref, contentHash: 'b'.repeat(64) }),
  ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
});
it('invalidates on admitted identity and same-actor bearer/client changes and releases both subscriptions', async () => {
  const stop = jest.fn(),
    authStop = jest.fn(),
    changed = jest.fn();
  let observe!: (event: string, session: unknown) => void;
  mockSubscribeIdentity.mockReturnValue(stop);
  mockOnAuthStateChange.mockImplementation((listener) => {
    observe = listener;
    return { data: { subscription: { unsubscribe: authStop } } };
  });
  const release = subscribeStudyIdentityChange(changed);
  expect(mockSubscribeIdentity).toHaveBeenCalledWith(changed);
  observe('INITIAL_SESSION', session().data.session);
  observe('TOKEN_REFRESHED', session().data.session);
  observe('SIGNED_IN', { ...session().data.session, access_token: 'same-actor-other-client' });
  observe('SIGNED_OUT', null);
  expect(changed).toHaveBeenCalledTimes(2);
  release();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(authStop).toHaveBeenCalledTimes(1);
  mockIdentityGeneration.mockReturnValueOnce(1).mockReturnValueOnce(2);
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, { type: 'studyPage', items: [], nextCursor: null }),
    error: null,
  }));
  await expect(core({ operation: 'study.list', cursor: null, limit: 25 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
});
it('recovers a response-lost write after fresh module load with exact original request and key, never replaying on inspection', async () => {
  const body = {
    operation: 'comment.append' as const,
    reportRevisionId: 'report-a',
    expectedContentHash: 'a'.repeat(64),
    text: 'Reload recovery',
    idempotencyKey: newWriteKey(),
  };
  mockInvoke.mockImplementationOnce(async () => {
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(window.sessionStorage.key(0)!)).not.toContain(
      'synthetic-session',
    );
    throw new Error('Response lost after possible commit');
  });
  await expect(review(body)).rejects.toThrow('Response lost');
  const original = mockInvoke.mock.calls[0][1].body;
  expect(mockGetClaims).toHaveBeenCalledWith('synthetic-session');
  expect((await readPendingStudyWrite('report:report-a')).request).toEqual(original);
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  await expect(
    review({ ...body, text: 'Different request', idempotencyKey: newWriteKey() }),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  let recovered!: typeof import('@/services/study/api');
  jest.isolateModules(() => {
    recovered = require('@/services/study/api');
  });
  expect((await recovered.readPendingStudyWrite('report:report-a')).request).toEqual(original);
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, {
      type: 'comment',
      value: {
        studyId: 'study-a',
        reportRevisionId: 'report-a',
        reportContentHash: 'a'.repeat(64),
        commentId: 'comment-a',
        actorId: '11111111-1111-1111-1111-111111111111',
        clientId: null,
        text: 'Reload recovery',
        createdAt: '2026-11-04T01:00:00Z',
      },
    }),
    error: null,
  }));
  expect(await recovered.recoverPendingStudyWrite('report:report-a')).toMatchObject({
    type: 'comment',
  });
  expect(mockInvoke.mock.calls[1][1].body).toEqual(original);
  expect(window.sessionStorage.length).toBe(0);
});
it('never dispatches unsupported/corrupted recovery, hides other actor/client journals and retains the original record', async () => {
  const body = {
    operation: 'comment.append' as const,
    reportRevisionId: 'report-a',
    expectedContentHash: 'a'.repeat(64),
    text: 'Private intent',
    idempotencyKey: newWriteKey(),
  };
  mockInvoke.mockRejectedValue(new Error('Lost'));
  await expect(review(body)).rejects.toThrow();
  const storedKey = window.sessionStorage.key(0)!,
    raw = window.sessionStorage.getItem(storedKey)!;
  mockGetSession.mockResolvedValue(session('actor-b'));
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'actor-b' } }, error: null });
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
    pending: false,
    raw: null,
  });
  mockGetSession.mockResolvedValue(session());
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: 'actor-a', client_id: 'client-b' } },
    error: null,
  });
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
    pending: false,
    raw: null,
  });
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'actor-a' } }, error: null });
  window.sessionStorage.setItem(storedKey, raw.replace('Private intent', 'Changed intent'));
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
    pending: true,
    error: expect.objectContaining({ code: 'RECOVERY_INVALID' }),
  });
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'RECOVERY_INVALID',
  });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(window.sessionStorage.getItem(storedKey)).toContain('Changed intent');
});

it('retires a clean stale-CAS rejection only after a fresh same-identity target read and retains its original audit/key', async () => {
  const body = {
    operation: 'comment.append' as const,
    reportRevisionId: 'report-a',
    expectedContentHash: 'a'.repeat(64),
    text: 'Clean rejected request',
    idempotencyKey: newWriteKey(),
  };
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data:
      body.operation === 'resource.actions'
        ? envelope(body, {
            type: 'actions',
            resource: body.resource,
            actions: [],
            corePermissions: { read: false, write: false },
            allowedMemberRoles: [],
          })
        : failure(body, 'REVISION_CONFLICT'),
    error: null,
  }));
  await expect(review(body)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
    pending: true,
    canRetire: true,
  });
  const api = { retirePendingStudyWrite };
  expect(await api.retirePendingStudyWrite('report:report-a')).toMatchObject({
    type: 'localRetirement',
    idempotencyKey: body.idempotencyKey,
  });
  expect(mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1][1].body.operation).toBe(
    'resource.actions',
  );
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({ pending: false });
  expect(window.sessionStorage.length).toBe(1);
  const retained = window.sessionStorage.getItem(window.sessionStorage.key(0)!)!;
  expect(retained).toContain('lca.study-write-retirement.v1');
  expect(retained).toContain(body.idempotencyKey);
  await expect(review({ ...body, idempotencyKey: newWriteKey() })).rejects.toMatchObject({
    code: 'REVISION_CONFLICT',
  });
  expect(mockInvoke).toHaveBeenCalledTimes(3);
});
it('keeps sticky response-loss ambiguity after later403 and blocks retirement or a new key for that workflow', async () => {
  const body = {
    operation: 'comment.append' as const,
    reportRevisionId: 'report-a',
    expectedContentHash: 'a'.repeat(64),
    text: 'Possibly committed',
    idempotencyKey: newWriteKey(),
  };
  mockInvoke.mockRejectedValueOnce(new Error('Lost after possible commit'));
  await expect(review(body)).rejects.toThrow('Lost');
  mockInvoke.mockImplementation(async (_name, { body }) => ({ data: failure(body), error: null }));
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
    pending: true,
    canRetire: false,
  });
  const api = { retirePendingStudyWrite };
  await expect(api.retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  await expect(review({ ...body, idempotencyKey: newWriteKey() })).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(mockInvoke).toHaveBeenCalledTimes(2);
  expect(window.sessionStorage.getItem(window.sessionStorage.key(0)!)).toContain(
    body.idempotencyKey,
  );
});

it('drops a late read after a same-actor bearer/client switch instead of retaining the earlier disclosure', async () => {
  mockGetSession.mockResolvedValueOnce(session()).mockResolvedValueOnce({
    data: { session: { access_token: 'different-client-session', user: { id: 'actor-a' } } },
  });
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, { type: 'studyPage', items: [], nextCursor: null }),
    error: null,
  }));
  await expect(core({ operation: 'study.list', cursor: null, limit: 25 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
});
