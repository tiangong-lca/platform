import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { core, readPendingStudyWrite, recoverPendingStudyWrite } from '@/services/study/api';
import { journalSnapshot, prepareJournal, recordJournalFailure } from '@/services/study/journal';
import * as owner from '../../../../vendor/study-contract/v2/index.mjs';
const mockInvoke = jest.fn(),
  mockSession = jest.fn(),
  mockClaims = jest.fn(),
  mockSubscribe = jest.fn();
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockSession(...a),
      getClaims: (...a: unknown[]) => mockClaims(...a),
      onAuthStateChange: (...a: unknown[]) => mockSubscribe(...a),
    },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));
const actor = 'archive-actor',
  studyId = 'study-a';
const identity = () => ({ actorId: actor, clientId: null, origin: window.location.origin });
const body = {
  operation: 'study.archive' as const,
  target: { type: 'study' as const, id: studyId, expectedRevision: 4 },
  idempotencyKey: 'original-v2-archive-key',
};
const success = (request: any, status: string, revision: number) => ({
  schemaVersion: request.schemaVersion,
  requestId: request.requestId,
  ok: true,
  data: {
    type: 'study',
    value: {
      studyId,
      revision,
      status,
      scope: { kind: 'user', id: actor },
      title: 'Synthetic archive acknowledgement',
      currentRevisionId: null,
    },
  },
});
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});
beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  mockSession.mockResolvedValue({
    data: { session: { user: { id: actor }, access_token: 'archive-session' } },
  });
  mockClaims.mockResolvedValue({ data: { claims: { sub: actor } }, error: null });
  mockSubscribe.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

it.each([
  ['active', 4],
  ['archived', 4],
  ['active', 5],
  ['archived', 6],
])(
  'rejects core V2 archive success %s/revision%s and retains uncertainty',
  async (status, revision) => {
    mockInvoke.mockImplementation(async (_name, { body: request }) => ({
      data: success(request, String(status), Number(revision)),
      error: null,
    }));
    await expect(core(body)).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
    const pending = await readPendingStudyWrite(`study:${studyId}`);
    expect(pending).toMatchObject({
      pending: true,
      canRetire: false,
      request: { schemaVersion: 'lca.study-api.v2', ...body },
    });
    const retained = JSON.parse(journalSnapshot(identity(), `study:${studyId}`)!);
    expect(retained.everAmbiguous).toBe(true);
    expect(retained.request).toEqual(mockInvoke.mock.calls[0][1].body);
  },
);

it.each([
  ['active', 4],
  ['archived', 4],
  ['active', 5],
  ['archived', 6],
])(
  'rejects recovered V2 archive success %s/revision%s with the exact original envelope retained',
  async (status, revision) => {
    mockInvoke.mockRejectedValue(new Error('Archive reply lost'));
    await expect(core(body)).rejects.toThrow('Archive reply lost');
    const original = mockInvoke.mock.calls[0][1].body;
    mockInvoke.mockImplementation(async (_name, { body: request }) => ({
      data: success(request, String(status), Number(revision)),
      error: null,
    }));
    await expect(recoverPendingStudyWrite(`study:${studyId}`)).rejects.toMatchObject({
      code: 'REFERENCE_MISMATCH',
    });
    expect(mockInvoke.mock.calls[1][1].body).toEqual(original);
    const retained = JSON.parse(journalSnapshot(identity(), `study:${studyId}`)!);
    expect(retained.request).toEqual(original);
    expect(retained.everAmbiguous).toBe(true);
    expect((await readPendingStudyWrite(`study:${studyId}`)).canRetire).toBe(false);
  },
);

it('accepts only archived expectedRevision+1 and recovers a valid historical V2 envelope unchanged', async () => {
  const original = owner.parseRequest({
    ...body,
    schemaVersion: 'lca.study-api.v2',
    requestId: 'historical-v2-request',
  });
  const intent = await prepareJournal(identity(), original, `study:${studyId}`);
  await recordJournalFailure(identity(), intent, null);
  mockInvoke.mockImplementation(async (_name, { body: request }) => ({
    data: success(request, 'archived', 5),
    error: null,
  }));
  await expect(recoverPendingStudyWrite(`study:${studyId}`)).resolves.toMatchObject({
    type: 'study',
    value: { studyId, status: 'archived', revision: 5 },
  });
  expect(mockInvoke.mock.calls[0][1].body).toEqual(original);
  expect(journalSnapshot(identity(), `study:${studyId}`)).toBeNull();
  await expect(
    core({ ...body, idempotencyKey: 'new-qualified-archive-key' }),
  ).resolves.toMatchObject({ type: 'study', value: { status: 'archived', revision: 5 } });
});
