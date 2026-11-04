import * as codecV2 from '../../../../vendor/study-contract/v2/index.mjs';
import * as codecV3 from '../../../../vendor/study-contract/v3/index.mjs';
import * as codecV4 from '../../../../vendor/study-contract/v4/index.mjs';
import * as codecV5 from '../../../../vendor/study-contract/v5/index.mjs';
type Request = import('@/services/study/api').Request;
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import {
  analysis,
  core,
  readPendingStudyWrite,
  recoverPendingStudyWrite,
  retirePendingStudyWrite,
  review,
} from '@/services/study/api';
import {
  journalSnapshot,
  prepareJournal,
  readJournal,
  recordJournalFailure,
} from '@/services/study/journal';

const mockGetSession = jest.fn(),
  mockGetClaims = jest.fn(),
  mockInvoke = jest.fn(),
  mockOnAuthStateChange = jest.fn();
let mockGeneration = 0;
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => mockGeneration,
  subscribeTaskCenterIdentity: () => () => {},
}));
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      getClaims: (...args: unknown[]) => mockGetClaims(...args),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));
const ACTOR = '11111111-1111-4111-8111-111111111111';
const session = (actor = ACTOR) => ({
  data: { session: { access_token: 'synthetic-session-token', user: { id: actor } } },
});
const claims = (client?: unknown, actor = ACTOR) => ({
  data: { claims: { sub: actor, ...(client === undefined ? {} : { client_id: client }) } },
  error: null,
});
const identity = (clientId: string | null = null) => ({
  actorId: ACTOR,
  clientId,
  origin: window.location.origin,
});
const body = {
  operation: 'comment.append' as const,
  reportRevisionId: 'report-a',
  expectedContentHash: 'a'.repeat(64),
  text: 'Exact recovery comment',
  idempotencyKey: 'original-key',
};
const envelope = (request: any, data: unknown) => ({
  schemaVersion: request.schemaVersion,
  requestId: request.requestId,
  ok: true,
  data,
});
const failure = (request: any, code = 'FORBIDDEN', retryable = false) => ({
  schemaVersion: request.schemaVersion,
  requestId: request.requestId,
  ok: false,
  code,
  message: 'Current operation denied',
  retryable,
  issues: [],
});
const successfulComment = (request: any) =>
  envelope(request, {
    type: 'comment',
    value: {
      studyId: 'study-a',
      reportRevisionId: request.reportRevisionId,
      reportContentHash: request.expectedContentHash,
      commentId: 'comment-a',
      actorId: ACTOR,
      clientId: null,
      text: request.text,
      createdAt: '2026-11-04T01:00:00Z',
    },
  });
const storedRequest = (patch: Record<string, unknown> = {}): Request =>
  ({
    schemaVersion: 'lca.study-api.v4',
    requestId: 'original-request',
    ...body,
    ...patch,
  }) as Request;
const storeRejected = async (workflow: string, request = storedRequest()) => {
  const parsed = {
    'lca.study-api.v2': codecV2,
    'lca.study-api.v3': codecV3,
    'lca.study-api.v4': codecV4,
    'lca.study-api.v5': codecV5,
  }[request.schemaVersion].parseRequest(request);
  const prepared = await prepareJournal(identity(), parsed, workflow);
  return recordJournalFailure(identity(), prepared, 'REVISION_CONFLICT');
};
const currentReadResponse = (request: any) =>
  request.operation === 'study.read'
    ? envelope(request, {
        type: 'study',
        value: {
          studyId: request.studyId,
          revision: 4,
          scope: { kind: 'user', id: ACTOR },
          title: 'Fresh target Study',
          status: 'active',
          currentRevisionId: null,
        },
      })
    : envelope(request, {
        type: 'actions',
        resource: request.resource,
        actions: [],
        corePermissions: { read: false, write: false },
        allowedMemberRoles: [],
      });

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  mockGeneration = 0;
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  mockGetSession.mockResolvedValue(session());
  mockGetClaims.mockResolvedValue(claims());
  mockInvoke.mockImplementation(async (_name, { body: request }) => ({
    data: failure(request),
    error: null,
  }));
});
afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  ['claims error', { data: { claims: { sub: ACTOR } }, error: { message: 'unverified' } }],
  ['missing claims', { data: {}, error: null }],
  ['absent claims data', { data: null, error: null }],
  ['foreign actor', claims(undefined, '22222222-2222-4222-8222-222222222222')],
  ['numeric OAuth client', claims(42)],
  ['object OAuth client', claims({ id: 'client' })],
])(
  'requires verified matching actor/client claims before journaling or dispatch: %s',
  async (_label, result) => {
    mockGetClaims.mockResolvedValue(result);
    await expect(review(body)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    await expect(readPendingStudyWrite('report:report-a')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  },
);

it.each([null, 'explicit-oauth-client'])(
  'binds the unresolved intent to verified client identity %s',
  async (client) => {
    mockGetClaims.mockResolvedValue(claims(client));
    await expect(review(body)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const stored = await readJournal(identity(client), 'report:report-a');
    expect(stored?.clientId).toBe(client);
    expect(stored?.request).toHaveProperty('idempotencyKey', 'original-key');
    expect(JSON.stringify(stored)).not.toContain('synthetic-session-token');
  },
);

it('does not expose or recover journal state without a session', async () => {
  await prepareJournal(identity(), storedRequest(), 'report:report-a');
  const raw = journalSnapshot(identity(), 'report:report-a');
  mockGetSession.mockResolvedValue({ data: { session: null } });
  expect(await readPendingStudyWrite('report:report-a')).toEqual({ pending: false, raw: null });
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  await expect(retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  expect(mockGetClaims).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(journalSnapshot(identity(), 'report:report-a')).toBe(raw);
});

it('requires an actual unresolved intent before recovery or local retirement', async () => {
  expect(await readPendingStudyWrite('report:report-a')).toEqual({ pending: false, raw: null });
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  await expect(retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
});

it('returns a bounded inspectable invalid record without dispatching it', async () => {
  const key = `tiangong.study.pending.v1:${encodeURIComponent(ACTOR)}:first-party:report%3Areport-a`,
    raw = 'x'.repeat(300000);
  sessionStorage.setItem(key, raw);
  const pending = await readPendingStudyWrite('report:report-a');
  expect(pending).toMatchObject({
    pending: true,
    error: expect.objectContaining({ code: 'RECOVERY_INVALID' }),
  });
  expect(pending.raw).toHaveLength(262144);
  expect(sessionStorage.getItem(key)).toBe(raw);
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'RECOVERY_INVALID',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
});

it.each([
  ['report ID', 'report:report-a', 'review', body],
  [
    'Study ID',
    'study:study-a',
    'core',
    {
      operation: 'model.source.resolve',
      idempotencyKey: 'source-key',
      studyId: 'study-a',
      originRef: {
        type: 'datasetRevision',
        datasetType: 'lifecyclemodel',
        id: 'model-a',
        version: '01.00.000',
      },
    },
  ],
  [
    'Study target',
    'study:study-a',
    'core',
    {
      operation: 'study.archive',
      idempotencyKey: 'archive-key',
      target: { type: 'study', id: 'study-a', expectedRevision: 4 },
    },
  ],
  [
    'report target',
    'report:report-a',
    'analysis',
    {
      operation: 'report.freeze',
      idempotencyKey: 'freeze-key',
      target: { type: 'reportRevision', id: 'report-a', expectedRevision: 2 },
      expectedContentHash: 'a'.repeat(64),
    },
  ],
  [
    'scenario target',
    'resource:scenario-a',
    'core',
    {
      operation: 'scenario.save',
      idempotencyKey: 'scenario-key',
      target: { type: 'scenarioRevision', id: 'scenario-a', expectedRevision: 2 },
      overrides: [],
    },
  ],
  [
    'share ID',
    'share:share-a',
    'review',
    {
      operation: 'share.revoke',
      idempotencyKey: 'share-key',
      shareId: 'share-a',
      reason: 'Exact revocation',
    },
  ],
  [
    'new resource without IDs',
    'resource:study.create',
    'core',
    {
      operation: 'study.create',
      idempotencyKey: 'create-key',
      scope: { kind: 'personal' },
      title: 'Explicit new Study',
    },
  ],
])(
  'persists a supported %s mutation under its default exact workflow',
  async (_label, workflow, version, selected) => {
    const call = { core, analysis, review }[version as 'core' | 'analysis' | 'review'];
    await expect(call(selected as never)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await readJournal(identity(), workflow as string))?.request.operation).toBe(
      (selected as any).operation,
    );
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ['retryable response', 'FORBIDDEN', true, 200],
  ['upstream error', 'UPSTREAM_UNAVAILABLE', false, 400],
  ['deadline error', 'DEADLINE_EXCEEDED', false, 400],
  ['server error status', 'FORBIDDEN', false, 503],
] as const)(
  'retains sticky ambiguity for %s and refuses local retirement',
  async (_label, code, retryable, status) => {
    mockInvoke.mockImplementation(async (_name, { body: request }) => ({
      data: null,
      error: { context: { status, json: async () => failure(request, code, retryable) } },
    }));
    await expect(review(body)).rejects.toMatchObject({ code });
    const stored = await readJournal(identity(), 'report:report-a');
    expect(stored?.everAmbiguous).toBe(true);
    expect(stored?.dispatching).toBe(false);
    expect(stored?.lastRejection).toBeNull();
    expect(await readPendingStudyWrite('report:report-a')).toMatchObject({
      pending: true,
      canRetire: false,
    });
    await expect(retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
      code: 'RECOVERY_REQUIRED',
    });
  },
);

it.each(['invalid-response', 'foreign-response'] as const)(
  'retains the exact unresolved request after an %s',
  async (kind) => {
    mockInvoke.mockImplementation(async (_name, { body: request }) => ({
      data:
        kind === 'invalid-response'
          ? { ok: true }
          : { ...successfulComment(request), requestId: 'foreign-request' },
      error: null,
    }));
    await expect(review(body)).rejects.toThrow();
    const stored = await readJournal(identity(), 'report:report-a');
    expect(stored?.everAmbiguous).toBe(true);
    expect(stored?.request).toMatchObject(body);
    expect(stored?.lastRejection).toBeNull();
  },
);

it('retains the pre-dispatch record if recording a failed response encounters storage failure', async () => {
  let raw = '';
  mockInvoke.mockImplementation(async (_name, { body: request }) => {
    raw = journalSnapshot(identity(), 'report:report-a')!;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage failed after dispatch');
    });
    return { data: failure(request), error: null };
  });
  await expect(review(body)).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' });
  expect(journalSnapshot(identity(), 'report:report-a')).toBe(raw);
  expect((await readJournal(identity(), 'report:report-a'))?.dispatching).toBe(true);
});

it('keeps a possibly accepted response unresolved when verified OAuth client changes after the reply', async () => {
  mockGetClaims.mockResolvedValueOnce(claims()).mockResolvedValueOnce(claims('foreign-client'));
  mockInvoke.mockImplementation(async (_name, { body: request }) => ({
    data: successfulComment(request),
    error: null,
  }));
  await expect(review(body)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect((await readJournal(identity(), 'report:report-a'))?.everAmbiguous).toBe(true);
  expect(sessionStorage.length).toBe(1);
});

it('rejects a generation change during final claim verification and preserves the unresolved original key', async () => {
  mockGetClaims.mockResolvedValueOnce(claims()).mockImplementationOnce(async () => {
    mockGeneration = 1;
    return claims();
  });
  mockInvoke.mockImplementation(async (_name, { body: request }) => ({
    data: successfulComment(request),
    error: null,
  }));
  await expect(review(body)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect((await readJournal(identity(), 'report:report-a'))?.request).toHaveProperty(
    'idempotencyKey',
    'original-key',
  );
});

it('does not dispatch after admission changes while preparing a mutation', async () => {
  mockGetClaims.mockImplementation(async () => {
    mockGeneration = 1;
    return claims();
  });
  await expect(review(body)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(mockInvoke).not.toHaveBeenCalled();
  expect((await readJournal(identity(), 'report:report-a'))?.everAmbiguous).toBe(true);
});

it.each([
  [
    'v2',
    'study:study-a',
    {
      schemaVersion: 'lca.study-api.v2',
      requestId: 'original-core-request',
      idempotencyKey: 'core-key',
      operation: 'study.archive',
      target: { type: 'study', id: 'study-a', expectedRevision: 4 },
    },
  ],
  [
    'v3',
    'report:report-a',
    {
      schemaVersion: 'lca.study-api.v3',
      requestId: 'original-report-request',
      idempotencyKey: 'report-key',
      operation: 'report.freeze',
      target: { type: 'reportRevision', id: 'report-a', expectedRevision: 2 },
      expectedContentHash: 'a'.repeat(64),
    },
  ],
] as const)(
  'recovers supported %s mutations with their original exact request envelope',
  async (_label, workflow, request) => {
    await prepareJournal(identity(), request, workflow);
    await expect(recoverPendingStudyWrite(workflow)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockInvoke.mock.calls[0][1].body).toEqual(request);
    expect((await readJournal(identity(), workflow))?.everAmbiguous).toBe(true);
  },
);

it.each([
  [
    'study:study-a',
    {
      schemaVersion: 'lca.study-api.v2',
      requestId: 'archive-request',
      idempotencyKey: 'archive-key',
      operation: 'study.archive',
      target: { type: 'study', id: 'study-a', expectedRevision: 4 },
    },
  ],
  [
    'share:share-a',
    {
      schemaVersion: 'lca.study-api.v4',
      requestId: 'share-request',
      idempotencyKey: 'share-key',
      operation: 'share.revoke',
      shareId: 'share-a',
      reason: 'Named access withdrawn',
    },
  ],
] as const)(
  'retires an unambiguous rejected %s intent only after its fresh authorized target read',
  async (workflow, request) => {
    const original = await storeRejected(workflow, request);
    mockInvoke.mockImplementation(async (_name, { body: query }) => ({
      data: currentReadResponse(query),
      error: null,
    }));
    const receipt = await retirePendingStudyWrite(workflow);
    expect(receipt).toMatchObject({
      type: 'localRetirement',
      workflow,
      auditId: original.auditId,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
    });
    expect(journalSnapshot(identity(), workflow)).toBeNull();
    const sent = mockInvoke.mock.calls[0][1].body;
    expect(sent.operation).toBe(workflow.startsWith('study:') ? 'study.read' : 'resource.actions');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(sessionStorage.key(0)!)).toContain(request.idempotencyKey);
  },
);

it('refuses local retirement when the workflow has no supported fresh-target read', async () => {
  const request: Request = {
    schemaVersion: 'lca.study-api.v2',
    requestId: 'scenario-request',
    idempotencyKey: 'scenario-key',
    operation: 'scenario.save',
    target: { type: 'scenarioRevision', id: 'scenario-a', expectedRevision: 1 },
    overrides: [],
  };
  await storeRejected('resource:scenario-a', request);
  await expect(retirePendingStudyWrite('resource:scenario-a')).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(journalSnapshot(identity(), 'resource:scenario-a')).not.toBeNull();
});

it('retains a rejected journal if the fresh target read is denied', async () => {
  const expected = await storeRejected('report:report-a');
  const raw = journalSnapshot(identity(), expected.workflow);
  await expect(retirePendingStudyWrite(expected.workflow)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(journalSnapshot(identity(), expected.workflow)).toBe(raw);
  expect(sessionStorage.length).toBe(1);
});

it('retains the journal if authentication disappears after the fresh target read', async () => {
  await storeRejected('report:report-a');
  mockInvoke.mockImplementation(async (_name, { body: query }) => ({
    data: currentReadResponse(query),
    error: null,
  }));
  mockGetSession
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce({ data: { session: null } });
  await expect(retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  expect(journalSnapshot(identity(), 'report:report-a')).not.toBeNull();
  expect(sessionStorage.length).toBe(1);
});

it.each(['actor', 'client', 'generation'] as const)(
  'retains a rejected journal after a %s change during fresh-read verification',
  async (change) => {
    await storeRejected('report:report-a');
    mockInvoke.mockImplementation(async (_name, { body: query }) => ({
      data: currentReadResponse(query),
      error: null,
    }));
    if (change === 'actor') {
      mockGetSession
        .mockResolvedValueOnce(session())
        .mockResolvedValueOnce(session())
        .mockResolvedValueOnce(session())
        .mockResolvedValueOnce(session('22222222-2222-4222-8222-222222222222'));
      mockGetClaims
        .mockResolvedValueOnce(claims())
        .mockResolvedValueOnce(claims(undefined, '22222222-2222-4222-8222-222222222222'));
    } else if (change === 'client')
      mockGetClaims.mockResolvedValueOnce(claims()).mockResolvedValueOnce(claims('foreign-client'));
    else
      mockGetClaims.mockResolvedValueOnce(claims()).mockImplementationOnce(async () => {
        mockGeneration = 1;
        return claims();
      });
    await expect(retirePendingStudyWrite('report:report-a')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(journalSnapshot(identity(), 'report:report-a')).not.toBeNull();
    expect(sessionStorage.length).toBe(1);
  },
);

it.each(['actor', 'client', 'bearer', 'admission', 'away-and-back'] as const)(
  'never moves the original recovery request to a changed %s while reading its journal',
  async (change) => {
    await prepareJournal(identity(), storedRequest(), 'report:report-a');
    let notify!: (event: string, value: any) => void;
    const unsubscribe = jest.fn();
    mockOnAuthStateChange.mockImplementation((listener) => {
      notify = listener;
      return { data: { subscription: { unsubscribe } } };
    });
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    jest.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      if (change === 'actor') mockGetSession.mockResolvedValue(session('actor-b'));
      if (change === 'client') mockGetClaims.mockResolvedValue(claims('client-b'));
      if (change === 'bearer')
        mockGetSession.mockResolvedValue({
          data: { session: { ...session().data.session, access_token: 'different-bearer' } },
        });
      if (change === 'admission') mockGeneration += 1;
      if (change === 'away-and-back') {
        notify('SIGNED_IN', session('actor-b').data.session);
        notify('SIGNED_IN', session().data.session);
      }
      return nativeDigest(...args);
    });
    await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
    expect((await readJournal(identity(), 'report:report-a'))?.request).toEqual(storedRequest());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  },
);

it('rejects a bearer switch while the recovery claims check is pending, including the final dispatch check', async () => {
  await prepareJournal(identity(), storedRequest(), 'report:report-a');
  mockGetClaims.mockResolvedValueOnce(claims()).mockImplementationOnce(async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { ...session().data.session, access_token: 'changed-during-claims' } },
    });
    return claims();
  });
  await expect(recoverPendingStudyWrite('report:report-a')).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(1);
});
