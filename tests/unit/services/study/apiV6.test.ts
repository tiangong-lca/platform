import * as owner from '../../../../vendor/study-contract/v6/index.mjs';
import view from '../../../fixtures/study-report/view-v3.json';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import {
  review,
  method,
  readPendingStudyWrite,
  recoverPendingStudyWrite,
  retirePendingStudyWrite,
} from '@/services/study/api';
import { journalSnapshot } from '@/services/study/journal';
import legacyView from '../../../fixtures/study-report/view-v1.json';

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
const actor = '10000000-0000-4000-8000-000000000001';
const reportId = '10000000-0000-4000-8000-000000000002';
const oldId = '10000000-0000-4000-8000-000000000003';
const hash = 'a'.repeat(64);
const identity = () => ({ actorId: actor, clientId: null, origin: window.location.origin });
const comment = (id: string, key: string) => ({
  operation: 'comment.append' as const,
  reportRevisionId: id,
  expectedContentHash: hash,
  text: 'Exact original comment',
  idempotencyKey: key,
});
const envelope = (body: any, data: unknown) => ({
  schemaVersion: body.schemaVersion,
  requestId: body.requestId,
  ok: true,
  data,
});
const actions = (body: any) => ({
  type: 'actions',
  resource: body.resource,
  actions: ['report.view'],
  corePermissions: { read: false, write: false },
  allowedMemberRoles: [],
});
const committed = (body: any) =>
  envelope(body, {
    type: 'comment',
    value: {
      studyId: 'study-a',
      reportRevisionId: body.reportRevisionId,
      reportContentHash: body.expectedContentHash,
      commentId: 'comment-a',
      actorId: actor,
      clientId: null,
      text: body.text,
      createdAt: '2026-11-04T01:00:00Z',
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
    data: { session: { user: { id: actor }, access_token: 'current-session' } },
  });
  mockClaims.mockResolvedValue({ data: { claims: { sub: actor } }, error: null });
  mockSubscribe.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

it('uses exact V6 request and response binding and never retries a V4 envelope', async () => {
  const body = {
    operation: 'resource.actions' as const,
    resource: { type: 'reportRevision' as const, id: reportId },
  };
  mockInvoke.mockImplementation(async (_name, { body: sent }) => ({
    data: envelope(sent, actions(sent)),
    error: null,
  }));
  expect(await review(body, undefined, 'v6')).toMatchObject({
    type: 'actions',
    corePermissions: { read: false, write: false },
  });
  expect(mockInvoke.mock.calls[0][1].body.schemaVersion).toBe('lca.study-api.v6');
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (_name, { body: sent }) => ({
    data: { ...envelope(sent, actions(sent)), schemaVersion: 'lca.study-api.v4' },
    error: null,
  }));
  await expect(review(body, undefined, 'v6')).rejects.toThrow();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke.mock.calls[0][1].body.schemaVersion).toBe('lca.study-api.v6');
});

it('rejects a retained view.v1 inside a V6 envelope instead of using the legacy preview path', async () => {
  const request = {
    operation: 'report.view' as const,
    reportRevisionId: legacyView.report.reportRevisionId,
    expectedContentHash: legacyView.report.contentHash,
  };
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, {
      type: 'view',
      view: legacyView,
      share: null,
      state: {
        studyId: legacyView.report.studyId,
        reportRevisionId: request.reportRevisionId,
        reportContentHash: request.expectedContentHash,
        reportRevision: 1,
        authorId: actor,
        reviewStateHash: 'c'.repeat(64),
        currentReviewIds: [],
        acceptedReviewIds: [],
        finalization: null,
        acceptance: 'not_finalized',
        validity: { status: 'current', checkedAt: '2026-11-04T01:00:00Z', reasonCodes: [] },
        checkedAt: '2026-11-04T01:00:00Z',
      },
    }),
    error: null,
  }));
  await expect(review(request, undefined, 'v6')).rejects.toThrow();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('fences a V6 reply when the admitted session changes during its request', async () => {
  mockSession
    .mockResolvedValueOnce({
      data: { session: { user: { id: actor }, access_token: 'current-session' } },
    })
    .mockResolvedValue({
      data: { session: { user: { id: 'another-actor' }, access_token: 'replacement-session' } },
    });
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, actions(body)),
    error: null,
  }));
  await expect(
    review(
      { operation: 'resource.actions', resource: { type: 'reportRevision', id: reportId } },
      undefined,
      'v6',
    ),
  ).rejects.toThrow('AUTH_REQUIRED');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke.mock.calls[0][1].headers.Authorization).toBe('Bearer current-session');
});

it('recovers the original V6 schema/key/request in its own family while preserving an older V4 journal byte-for-byte', async () => {
  mockInvoke.mockRejectedValue(new Error('Reply lost'));
  await expect(review(comment(oldId, 'old-key'), `report:${oldId}`)).rejects.toThrow('Reply lost');
  const oldRaw = journalSnapshot(identity(), `report:${oldId}`);
  await expect(review(comment(reportId, 'new-key'), undefined, 'v6')).rejects.toThrow('Reply lost');
  const original = mockInvoke.mock.calls[1][1].body;
  expect((await readPendingStudyWrite(`report6:${reportId}`)).request).toEqual(original);
  expect((await readPendingStudyWrite(`report:${reportId}`)).pending).toBe(false);
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: committed(body),
    error: null,
  }));
  await recoverPendingStudyWrite(`report6:${reportId}`);
  expect(mockInvoke.mock.calls[2][1].body).toEqual(original);
  expect(original.schemaVersion).toBe('lca.study-api.v6');
  expect(original.idempotencyKey).toBe('new-key');
  expect((await readPendingStudyWrite(`report6:${reportId}`)).pending).toBe(false);
  expect(journalSnapshot(identity(), `report:${oldId}`)).toBe(oldRaw);
  expect((await readPendingStudyWrite(`report:${oldId}`)).pending).toBe(true);
});

it('refuses cross-family workflow bindings before dispatch and retires a definite V6 rejection using V6 current authority', async () => {
  await expect(
    review(comment(reportId, 'wrong-family'), `report:${reportId}`, 'v6'),
  ).rejects.toThrow('RECOVERY_INVALID');
  await expect(review(comment(reportId, 'wrong-family'), `report6:${reportId}`)).rejects.toThrow(
    'RECOVERY_INVALID',
  );
  expect(mockInvoke).not.toHaveBeenCalled();
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: {
      schemaVersion: body.schemaVersion,
      requestId: body.requestId,
      ok: false,
      code: 'FORBIDDEN',
      message: 'Denied',
      retryable: false,
      issues: [],
    },
    error: null,
  }));
  await expect(review(comment(reportId, 'definite'), `report6:${reportId}`, 'v6')).rejects.toThrow(
    'FORBIDDEN',
  );
  expect((await readPendingStudyWrite(`report6:${reportId}`)).canRetire).toBe(true);
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    data: envelope(body, actions(body)),
    error: null,
  }));
  await retirePendingStudyWrite(`report6:${reportId}`);
  expect(mockInvoke.mock.calls[1][1].body).toMatchObject({
    schemaVersion: 'lca.study-api.v6',
    operation: 'resource.actions',
    resource: { type: 'reportRevision', id: reportId },
  });
  expect((await readPendingStudyWrite(`report6:${reportId}`)).pending).toBe(false);
});

it.each([
  {
    request: {
      operation: 'report.finalize' as const,
      target: { type: 'reportRevision' as const, id: reportId, expectedRevision: 1 },
      expectedContentHash: hash,
      expectedReviewStateHash: 'c'.repeat(64),
      profileId: 'lca.study-report-unreviewed.v1' as const,
      acceptedReviewIds: [],
      idempotencyKey: 'finalize-key',
    },
    workflow: `report6:${reportId}`,
    resource: { type: 'reportRevision', id: reportId },
  },
  {
    request: {
      operation: 'share.revoke' as const,
      shareId: 'share-a',
      reason: 'Explicit revocation',
      idempotencyKey: 'revoke-key',
    },
    workflow: 'share6:share-a',
    resource: { type: 'share', id: 'share-a' },
  },
])(
  'uses family-specific default intents and current retirement authority for $request.operation',
  async ({ request, workflow, resource }) => {
    mockInvoke.mockImplementation(async (_name, { body }) => ({
      data: {
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: false,
        code: 'FORBIDDEN',
        message: 'Denied',
        retryable: false,
        issues: [],
      },
      error: null,
    }));
    await expect(review(request, undefined, 'v6')).rejects.toThrow('FORBIDDEN');
    expect((await readPendingStudyWrite(workflow)).request).toMatchObject({
      schemaVersion: 'lca.study-api.v6',
      idempotencyKey: request.idempotencyKey,
    });
    mockInvoke.mockImplementation(async (_name, { body }) => ({
      data: envelope(body, { ...actions(body), actions: [] }),
      error: null,
    }));
    await retirePendingStudyWrite(workflow);
    expect(mockInvoke.mock.calls[1][1].body).toMatchObject({
      schemaVersion: 'lca.study-api.v6',
      operation: 'resource.actions',
      resource,
    });
  },
);

it('checks exact owner evidence bytes before clearing the V6 journal', async () => {
  const content = {
    schemaVersion: 'lca.study-method-evidence.v1' as const,
    requirementId: 'PEF-01',
    declaredKind: 'sourceRecord' as const,
    title: 'Declared source',
    statement: 'A recorded statement, without professional approval.',
    citations: [],
  };
  const ref = {
    type: 'methodEvidence',
    id: reportId,
    contentHash: await owner.methodEvidenceHash(content),
    digestScope: 'artifact_bytes_sha256',
    byteSize: owner.canonicalBytes(content).length,
    mediaType: 'application/json',
    schemaVersion: content.schemaVersion,
  };
  let forged = true;
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    error: null,
    data: envelope(body, {
      type: 'methodEvidence',
      value: {
        schemaVersion: 'lca.study-method-evidence-record.v1',
        evidenceId: reportId,
        studyId: body.studyId,
        requirementId: content.requirementId,
        declaredKind: content.declaredKind,
        artifactRef: { ...ref, contentHash: forged ? 'f'.repeat(64) : ref.contentHash },
        recordedAt: '2026-11-04T01:00:00Z',
        status: 'recorded_unverified',
      },
    }),
  }));
  const request = {
    operation: 'method.evidence.create' as const,
    studyId: actor,
    content,
    idempotencyKey: 'evidence-key',
  };
  await expect(method(request)).rejects.toThrow();
  expect((await readPendingStudyWrite(`study:${actor}`)).pending).toBe(true);
  const original = mockInvoke.mock.calls[0][1].body;
  forged = false;
  await expect(recoverPendingStudyWrite(`study:${actor}`)).resolves.toMatchObject({
    type: 'methodEvidence',
    value: { status: 'recorded_unverified' },
  });
  expect(mockInvoke.mock.calls[1][1].body).toEqual(original);
  expect((await readPendingStudyWrite(`study:${actor}`)).pending).toBe(false);
});

it('rejects an owner config hash mismatch without disclosing success or retiring uncertainty', async () => {
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    error: null,
    data: envelope(body, {
      type: 'methodAssessment',
      value: {
        assessmentId: reportId,
        studyId: actor,
        profileId: body.profileId,
        config: body.config,
        configHash: body.configHash,
        execution: { jobId: oldId, status: 'queued' },
        factsRef: null,
      },
    }),
  }));
  await expect(
    method({
      operation: 'method.assessment.request',
      studyId: actor,
      profileId: 'lca.study-method-pef-2021-ef31-cement-intermediate.v1',
      config: view.methodAssessment.config as never,
      configHash: 'f'.repeat(64),
      idempotencyKey: 'assessment-key',
    }),
  ).rejects.toThrow();
  expect((await readPendingStudyWrite(`study:${actor}`)).canRetire).toBe(false);
});
