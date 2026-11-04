import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import * as owner from '../../../../vendor/study-contract/v6/index.mjs';
import { readMethodEvidence } from '@/services/study/method';
const mockInvoke = jest.fn(),
  mockSession = jest.fn(),
  mockClaims = jest.fn(),
  mockSubscribe = jest.fn();
const listeners = new Set<(event: string, session: unknown) => void>();
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
const actor = 'reader-actor',
  studyId = '10000000-0000-4000-8000-000000000001',
  evidenceId = '10000000-0000-4000-8000-000000000703';
const original = { user: { id: actor }, access_token: 'original-reader-session' };
const content = {
  schemaVersion: 'lca.study-method-evidence.v1' as const,
  requirementId: 'PEF-01',
  declaredKind: 'sourceRecord' as const,
  title: 'Reader digest race',
  statement: 'No approval',
  citations: [],
};
let bytes: Uint8Array;
const record = () => ({
  schemaVersion: 'lca.study-method-evidence-record.v1' as const,
  evidenceId,
  studyId,
  requirementId: content.requirementId,
  declaredKind: content.declaredKind,
  artifactRef: {
    type: 'methodEvidence' as const,
    id: evidenceId,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    digestScope: 'artifact_bytes_sha256' as const,
    byteSize: bytes.length,
    mediaType: 'application/json' as const,
    schemaVersion: content.schemaVersion,
  },
  recordedAt: '2026-11-04T01:00:00Z',
  status: 'recorded_unverified' as const,
});
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
  bytes = owner.canonicalBytes(content);
});
beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  mockSession.mockResolvedValue({ data: { session: original } });
  mockClaims.mockResolvedValue({ data: { claims: { sub: actor } }, error: null });
  mockSubscribe.mockImplementation((callback) => {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback);
          },
        },
      },
    };
  });
  mockInvoke.mockImplementation(async (_name, { body }) => ({
    error: null,
    data: {
      schemaVersion: body.schemaVersion,
      requestId: body.requestId,
      ok: true,
      data: {
        type: 'artifact',
        studyId,
        artifactRef: body.artifactRef,
        encoding: 'base64',
        bytes: Buffer.from(bytes).toString('base64'),
      },
    },
  }));
});

it.each(['actor', 'client', 'away-back'])(
  'withholds parsed method evidence if %s identity changes during owner artifact hashing',
  async (change) => {
    let release!: () => void, started!: () => void;
    const paused = new Promise<void>((resolve) => {
        release = resolve;
      }),
      reached = new Promise<void>((resolve) => {
        started = resolve;
      });
    const actual = crypto.subtle.digest.bind(crypto.subtle);
    const spy = jest.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      if (new TextDecoder().decode(data as ArrayBuffer).includes('Reader digest race')) {
        started();
        await paused;
      }
      return actual(algorithm, data);
    });
    try {
      const running = readMethodEvidence(record());
      void running.catch(() => {});
      await Promise.race([
        reached,
        running.then(() => {
          throw new Error('Owner digest did not pause');
        }),
      ]);
      const replacement = {
        user: { id: change === 'actor' ? 'replacement-actor' : actor },
        access_token: 'replacement-reader-client',
      };
      mockSession.mockResolvedValue({ data: { session: replacement } });
      listeners.forEach((listener) => listener('TOKEN_REFRESHED', replacement));
      if (change === 'away-back') {
        mockSession.mockResolvedValue({ data: { session: original } });
        listeners.forEach((listener) => listener('TOKEN_REFRESHED', original));
      }
      release();
      await expect(running).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
      expect(listeners.size).toBe(0);
    } finally {
      spy.mockRestore();
    }
  },
);

it('returns owner-parsed exact evidence while the captured identity stays current', async () => {
  expect(await readMethodEvidence(record())).toEqual(content);
  expect(listeners.size).toBe(0);
});
