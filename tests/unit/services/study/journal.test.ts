import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import {
  completeJournal,
  journalSnapshot as rawJournalSnapshot,
  prepareJournal as rawPrepareJournal,
  readJournal as rawReadJournal,
  recordJournalFailure,
  retireJournal,
  subscribePendingStudyWrites,
  type StudyRequest,
  type WriteIdentity,
} from '@/services/study/journal';
import { parseRequest as parseV3 } from '../../../../vendor/study-contract/v3/index.mjs';

const workflow = 'report:report-exact';
const journalSnapshot = (actor: WriteIdentity, scope = workflow) =>
  rawJournalSnapshot(actor, scope);
const prepareJournal = (actor: WriteIdentity, selected: StudyRequest, scope = workflow) =>
  rawPrepareJournal(actor, selected, scope);
const readJournal = (actor: WriteIdentity, scope = workflow) => rawReadJournal(actor, scope);

const identity: WriteIdentity = {
  actorId: 'actor-a',
  clientId: null,
  origin: 'http://localhost:8000',
};
const request = (overrides: Record<string, unknown> = {}): StudyRequest =>
  ({
    schemaVersion: 'lca.study-api.v4',
    requestId: 'original-request-id',
    idempotencyKey: 'original-idempotency-key',
    operation: 'comment.append',
    reportRevisionId: 'report-exact',
    expectedContentHash: 'a'.repeat(64),
    text: 'Exact unresolved revision comment',
    ...overrides,
  }) as StudyRequest;
const storageKey = (actor: WriteIdentity = identity, scope = workflow) =>
  `tiangong.study.pending.v1:${encodeURIComponent(actor.actorId)}:${encodeURIComponent(actor.clientId ?? 'first-party')}:${encodeURIComponent(scope)}`;
const checksum = (content: unknown) =>
  createHash('sha256').update(JSON.stringify(content)).digest('hex');
const writeStored = (value: Record<string, unknown>, actor = identity, scope = workflow) => {
  const content = { ...value };
  delete content.checksum;
  const stored = { ...content, checksum: checksum(content) };
  const raw = JSON.stringify(stored);
  sessionStorage.setItem(storageKey(actor, scope), raw);
  return raw;
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('persists a parsed unresolved intent through module reload without replaying or changing original identities', async () => {
  const prepared = await prepareJournal(identity, request());
  const saved = journalSnapshot(identity)!;
  expect(saved).not.toContain('access_token');
  expect(saved).not.toContain('refresh_token');
  expect(saved).not.toContain('Authorization');
  let reloaded!: typeof import('@/services/study/journal');
  jest.isolateModules(() => {
    reloaded = require('@/services/study/journal');
  });
  const restored = await reloaded.readJournal(identity, workflow);
  expect(restored?.request).toEqual(prepared.request);
  expect(restored?.request.requestId).toBe('original-request-id');
  expect(restored?.request).toHaveProperty('idempotencyKey', 'original-idempotency-key');
  expect(restored?.createdAt).toBe(prepared.createdAt);
  expect(reloaded.journalSnapshot(identity, workflow)).toBe(saved);
  // A fresh wrapper request ID cannot replace the request already committed to the journal.
  const retry = await reloaded.prepareJournal(
    identity,
    request({ requestId: 'fresh-wrapper-request' }),
    workflow,
  );
  expect(retry.request.requestId).toBe('original-request-id');
  expect(retry.auditId).toBe(prepared.auditId);
  expect(retry.everAmbiguous).toBe(true);
  expect(retry.dispatching).toBe(true);
  expect(reloaded.journalSnapshot(identity, workflow)).not.toBe(saved);
});

it('blocks a different key or changed payload until the original intent is resolved', async () => {
  await prepareJournal(identity, request());
  const saved = journalSnapshot(identity);
  await expect(
    prepareJournal(identity, request({ idempotencyKey: 'new-key' })),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  await expect(
    prepareJournal(identity, request({ text: 'changed user text' })),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  await expect(
    prepareJournal(identity, request({ expectedContentHash: 'b'.repeat(64) })),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  expect(journalSnapshot(identity)).toBe(saved);
});

it('hides other actors and OAuth clients and rejects copied identity or origin metadata without discarding it', async () => {
  await prepareJournal(identity, request());
  const original = journalSnapshot(identity)!;
  const otherActor = { ...identity, actorId: 'actor-b' },
    oauth = { ...identity, clientId: 'oauth-client' };
  expect(await readJournal(otherActor)).toBeNull();
  expect(await readJournal(oauth)).toBeNull();
  expect(journalSnapshot(otherActor)).toBeNull();
  expect(journalSnapshot(oauth)).toBeNull();
  sessionStorage.setItem(storageKey(otherActor), original);
  await expect(readJournal(otherActor)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(otherActor)).toBe(original);
  sessionStorage.setItem(storageKey(oauth), original);
  await expect(readJournal(oauth)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(oauth)).toBe(original);
  await expect(
    readJournal({ ...identity, origin: 'https://foreign.invalid' }),
  ).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(identity)).toBe(original);
});

it('keeps first-party and explicitly named OAuth intents separately recoverable', async () => {
  const oauth = { ...identity, clientId: 'client-a' };
  const first = await prepareJournal(identity, request());
  const delegated = await prepareJournal(oauth, request({ idempotencyKey: 'delegated-key' }));
  expect((await readJournal(identity))?.checksum).toBe(first.checksum);
  expect((await readJournal(oauth))?.checksum).toBe(delegated.checksum);
  await completeJournal(oauth, delegated);
  expect(await readJournal(oauth)).toBeNull();
  expect((await readJournal(identity))?.checksum).toBe(first.checksum);
});

it.each([
  ['malformed JSON', '{unparseable'],
  ['null', 'null'],
  ['array', '[]'],
  ['empty metadata', '{}'],
  ['oversized raw input', 'x'.repeat(262145)],
])('retains %s as inspectable unresolved state', async (_description, raw) => {
  sessionStorage.setItem(storageKey(), raw);
  await expect(readJournal(identity)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(identity)).toBe(raw);
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_INVALID',
  });
  expect(journalSnapshot(identity)).toBe(raw);
});

it.each([
  [
    'future journal schema',
    (value: Record<string, any>) => {
      value.schemaVersion = 'lca.study-write-intent.v99';
    },
  ],
  [
    'unsupported API schema',
    (value: Record<string, any>) => {
      value.request.schemaVersion = 'lca.study-api.v99';
    },
  ],
  [
    'unexpected stored key',
    (value: Record<string, any>) => {
      value.untrustedExtra = true;
    },
  ],
  [
    'future timestamp',
    (value: Record<string, any>) => {
      value.createdAt = Date.now() + 600000;
    },
  ],
  [
    'negative timestamp',
    (value: Record<string, any>) => {
      value.createdAt = -1;
    },
  ],
  [
    'noninteger timestamp',
    (value: Record<string, any>) => {
      value.createdAt = 1.5;
    },
  ],
  [
    'malformed request',
    (value: Record<string, any>) => {
      value.request = null;
    },
  ],
  [
    'query stored as mutation',
    (value: Record<string, any>) => {
      value.request = {
        schemaVersion: 'lca.study-api.v4',
        requestId: 'query-id',
        operation: 'capability.read',
      };
    },
  ],
  [
    'invalid mutation shape',
    (value: Record<string, any>) => {
      delete value.request.expectedContentHash;
    },
  ],
  [
    'foreign actor',
    (value: Record<string, any>) => {
      value.actorId = 'foreign-actor';
    },
  ],
  [
    'foreign client',
    (value: Record<string, any>) => {
      value.clientId = 'foreign-client';
    },
  ],
  [
    'foreign origin',
    (value: Record<string, any>) => {
      value.origin = 'https://foreign.invalid';
    },
  ],
])('rejects and retains %s even with a matching stored checksum', async (_description, change) => {
  await prepareJournal(identity, request());
  const value = JSON.parse(journalSnapshot(identity)!);
  change(value);
  const raw = writeStored(value);
  await expect(readJournal(identity)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(identity)).toBe(raw);
});

it('detects checksum changes, missing/non-string checksums and edited payloads while retaining original bytes', async () => {
  await prepareJournal(identity, request());
  const initial = JSON.parse(journalSnapshot(identity)!);
  for (const change of [
    (value: Record<string, any>) => {
      value.checksum = 'f'.repeat(64);
    },
    (value: Record<string, any>) => {
      value.checksum = 42;
    },
    (value: Record<string, any>) => {
      delete value.checksum;
    },
    (value: Record<string, any>) => {
      value.request.text = 'edited after dispatch';
    },
  ]) {
    const value = JSON.parse(JSON.stringify(initial));
    change(value);
    const raw = JSON.stringify(value);
    sessionStorage.setItem(storageKey(), raw);
    await expect(readJournal(identity)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
    expect(journalSnapshot(identity)).toBe(raw);
  }
});

it('retains an old unresolved intent without silently expiring its original idempotency key', async () => {
  await prepareJournal(identity, request());
  const value = JSON.parse(journalSnapshot(identity)!);
  value.createdAt = 0;
  const raw = writeStored(value);
  expect((await readJournal(identity))?.request).toHaveProperty(
    'idempotencyKey',
    'original-idempotency-key',
  );
  expect(journalSnapshot(identity)).toBe(raw);
});

it('bounds actor entries without evicting unrelated or unresolved owners', async () => {
  sessionStorage.setItem('unrelated-ui-preference', 'retained');
  for (let index = 0; index < 8; index += 1)
    await prepareJournal(
      { ...identity, actorId: `actor-${index}` },
      request({ idempotencyKey: `key-${index}` }),
    );
  const original = sessionStorage.getItem(storageKey({ ...identity, actorId: 'actor-0' }));
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(sessionStorage.length).toBe(9);
  expect(sessionStorage.getItem('unrelated-ui-preference')).toBe('retained');
  expect(sessionStorage.getItem(storageKey({ ...identity, actorId: 'actor-0' }))).toBe(original);
});

it('refuses an oversized parsed report intent before dispatch or partial persistence', async () => {
  const oversized = parseV3({
    schemaVersion: 'lca.study-api.v3',
    requestId: 'large-request',
    idempotencyKey: 'large-key',
    operation: 'report.create',
    studyId: 'study-a',
    parentReportRevisionId: null,
    runIds: ['run-a'],
    analysisIds: ['analysis-a'],
    templateId: 'lca.study-report.v1',
    content: {
      schemaVersion: 'lca.study-report-draft.v1',
      title: 'Bounded report',
      claims: [
        {
          claimId: 'claim-a',
          bundleRef: {
            type: 'analysisFacts',
            id: 'facts-a',
            contentHash: 'a'.repeat(64),
            digestScope: 'artifact_bytes_sha256',
            byteSize: 10,
            mediaType: 'application/json',
            schemaVersion: 'lca.study-analysis-facts.v1',
          },
          factId: 'fact-a',
          canonicalValue: '1',
          unit: 'kg',
          display: { style: 'exact' },
        },
      ],
      sections: Array.from({ length: 32 }, (_, index) => ({
        sectionId: `section-${index}`,
        title: 'Declared section',
        paragraphs: ['界'.repeat(2048), '界'.repeat(2048), '界'.repeat(2048), '界'.repeat(2048)],
        claimIds: ['claim-a'],
      })),
      tables: [],
      charts: [],
      additionalLimitations: [],
    },
  });
  await expect(prepareJournal(identity, oversized)).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(journalSnapshot(identity)).toBeNull();
});

it('serializes simultaneous preparation so a second new intent cannot race the first stored key', async () => {
  const first = prepareJournal(identity, request());
  const second = prepareJournal(identity, request({ idempotencyKey: 'racing-key' }));
  const result = await Promise.allSettled([first, second]);
  expect(result[0].status).toBe('fulfilled');
  expect(result[1]).toMatchObject({ status: 'rejected', reason: { code: 'RECOVERY_REQUIRED' } });
  expect((await readJournal(identity))?.request).toHaveProperty(
    'idempotencyKey',
    'original-idempotency-key',
  );
});

it('clears only the exact resolved request and audit identity, retaining changed or foreign intents', async () => {
  const expected = await prepareJournal(identity, request());
  await expect(
    completeJournal({ ...identity, actorId: 'foreign' }, expected),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  const replacement = { ...expected, request: request({ idempotencyKey: 'replacement-key' }) };
  const raw = writeStored(replacement);
  await expect(completeJournal(identity, expected)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(journalSnapshot(identity)).toBe(raw);
  const current = (await readJournal(identity))!;
  await completeJournal(identity, current);
  expect(journalSnapshot(identity)).toBeNull();
  await expect(completeJournal(identity, current)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
});

it('notifies mounted consumers after persistence and completion, then releases the subscription', async () => {
  const changed = jest.fn(),
    stop = subscribePendingStudyWrites(changed);
  const expected = await prepareJournal(identity, request());
  expect(changed).toHaveBeenCalledTimes(1);
  await prepareJournal(identity, request({ requestId: 'wrapper-request' }));
  expect(changed).toHaveBeenCalledTimes(2);
  await completeJournal(identity, expected);
  expect(changed).toHaveBeenCalledTimes(3);
  stop();
  await prepareJournal(identity, request());
  expect(changed).toHaveBeenCalledTimes(3);
});

it('fails closed when session storage cannot be accessed or read', async () => {
  const getter = jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new Error('storage disabled');
  });
  expect(() => journalSnapshot(identity)).toThrow('RECOVERY_UNAVAILABLE');
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  getter.mockRestore();
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('read denied');
  });
  await expect(readJournal(identity)).rejects.toMatchObject({ code: 'RECOVERY_UNAVAILABLE' });
});

it('fails closed on enumeration, quota, silent write loss and removal errors without deleting an unresolved intent', async () => {
  const enumeration = jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
    throw new Error('enumeration disabled');
  });
  sessionStorage.setItem('unrelated', 'value');
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  enumeration.mockRestore();
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  set.mockRestore();
  const silent = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  await expect(prepareJournal(identity, request())).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  silent.mockRestore();
  const expected = await prepareJournal(identity, request());
  const raw = journalSnapshot(identity);
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('removal disabled');
  });
  await expect(completeJournal(identity, expected)).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(journalSnapshot(identity)).toBe(raw);
});

it.each<StudyRequest>([
  {
    schemaVersion: 'lca.study-api.v2',
    requestId: 'core-original',
    idempotencyKey: 'core-key',
    operation: 'study.create',
    scope: { kind: 'personal' },
    title: 'Exact saved Study intent',
  },
  {
    schemaVersion: 'lca.study-api.v3',
    requestId: 'report-original',
    idempotencyKey: 'report-key',
    operation: 'report.freeze',
    target: { type: 'reportRevision', id: 'report-a', expectedRevision: 4 },
    expectedContentHash: 'a'.repeat(64),
  },
])(
  'retains supported owner schema $schemaVersion for exact explicit recovery',
  async (selected) => {
    const scope =
      selected.schemaVersion === 'lca.study-api.v2' ? 'directory:studies' : 'report:report-a';
    const expected = await prepareJournal(identity, selected, scope);
    expect((await readJournal(identity, scope))?.request).toEqual(selected);
    await completeJournal(identity, expected);
    expect(journalSnapshot(identity, scope)).toBeNull();
  },
);

it('allows unrelated Study workflows to prepare concurrently while retaining each exact request', async () => {
  const first = request({ reportRevisionId: 'report-exact', idempotencyKey: 'first-study-key' });
  const second = request({ reportRevisionId: 'other-report', idempotencyKey: 'second-study-key' });
  const prepared = await Promise.all([
    prepareJournal(identity, first, 'study:study-a'),
    prepareJournal(identity, second, 'study:study-b'),
  ]);
  expect(prepared.map((value) => value.workflow)).toEqual(['study:study-a', 'study:study-b']);
  expect((await readJournal(identity, 'study:study-a'))?.request).toEqual(first);
  expect((await readJournal(identity, 'study:study-b'))?.request).toEqual(second);
  expect(await readJournal(identity, 'study:study-c')).toBeNull();
});

it('persists known rejection evidence and allows explicit retirement only when no ambiguity ever occurred', async () => {
  const prepared = await prepareJournal(identity, request());
  await expect(retireJournal(identity, prepared)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  const rejected = await recordJournalFailure(identity, prepared, 'FORBIDDEN');
  expect(rejected.everAmbiguous).toBe(false);
  expect(rejected.dispatching).toBe(false);
  expect(rejected.lastRejection).toMatchObject({
    code: 'FORBIDDEN',
    requestId: 'original-request-id',
  });
  await expect(retireJournal(identity, prepared)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(journalSnapshot(identity)).not.toBeNull();
  await retireJournal(identity, rejected);
  expect(journalSnapshot(identity)).toBeNull();
  const retiredKey = `${storageKey()}:retired:${prepared.auditId}`;
  const receipt = JSON.parse(sessionStorage.getItem(retiredKey)!);
  expect(receipt.schemaVersion).toBe('lca.study-write-retirement.v1');
  expect(receipt.intent.request).toEqual(prepared.request);
  expect(receipt.intent.auditId).toBe(prepared.auditId);
  expect(receipt.intent.lastRejection.code).toBe('FORBIDDEN');
  const next = await prepareJournal(identity, request({ idempotencyKey: 'fresh-explicit-key' }));
  expect(next.auditId).not.toBe(prepared.auditId);
  expect(sessionStorage.getItem(retiredKey)).not.toBeNull();
});

it('never retires a later determinate rejection after an unknown response has made the intent ambiguous', async () => {
  const prepared = await prepareJournal(identity, request());
  const lost = await recordJournalFailure(identity, prepared, null);
  expect(lost.everAmbiguous).toBe(true);
  expect(lost.lastRejection).toBeNull();
  expect(lost.dispatching).toBe(false);
  const forbidden = await recordJournalFailure(identity, lost, 'FORBIDDEN');
  expect(forbidden.everAmbiguous).toBe(true);
  expect(forbidden.lastRejection?.code).toBe('FORBIDDEN');
  const conflict = await recordJournalFailure(identity, forbidden, 'REVISION_CONFLICT');
  await expect(retireJournal(identity, conflict)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect((await readJournal(identity))?.request).toHaveProperty(
    'idempotencyKey',
    'original-idempotency-key',
  );
  expect(sessionStorage.length).toBe(1);
});

it('treats an interrupted dispatch as sticky ambiguity when explicitly recovered after reload', async () => {
  const initial = await prepareJournal(identity, request());
  const resumed = await prepareJournal(identity, request({ requestId: 'new-wrapper-id' }));
  expect(resumed.request.requestId).toBe(initial.request.requestId);
  expect(resumed.everAmbiguous).toBe(true);
  expect(resumed.auditId).toBe(initial.auditId);
  const denied = await recordJournalFailure(identity, resumed, 'REVISION_CONFLICT');
  await expect(retireJournal(identity, denied)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  await completeJournal(identity, denied);
  expect(journalSnapshot(identity)).toBeNull();
});

it('preserves earlier validated rejection evidence when a later transport result is unknown', async () => {
  const prepared = await prepareJournal(identity, request());
  const denied = await recordJournalFailure(identity, prepared, 'FORBIDDEN');
  const lost = await recordJournalFailure(identity, denied, null);
  expect(lost.lastRejection).toEqual(denied.lastRejection);
  expect(lost.everAmbiguous).toBe(true);
  await expect(retireJournal(identity, lost)).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
});

it.each([
  [
    'bad audit ID',
    (value: Record<string, any>) => {
      value.auditId = 'unbound-audit';
    },
  ],
  [
    'foreign workflow',
    (value: Record<string, any>) => {
      value.workflow = 'report:foreign';
    },
  ],
  [
    'nonboolean ambiguity',
    (value: Record<string, any>) => {
      value.everAmbiguous = 'false';
    },
  ],
  [
    'nonboolean dispatch status',
    (value: Record<string, any>) => {
      value.dispatching = 'false';
    },
  ],
  [
    'nonobject rejection',
    (value: Record<string, any>) => {
      value.lastRejection = 'FORBIDDEN';
    },
  ],
  [
    'unexpected rejection key',
    (value: Record<string, any>) => {
      value.lastRejection = {
        code: 'FORBIDDEN',
        requestId: value.request.requestId,
        receivedAt: Date.now(),
        extra: true,
      };
    },
  ],
  [
    'future rejection time',
    (value: Record<string, any>) => {
      value.lastRejection = {
        code: 'FORBIDDEN',
        requestId: value.request.requestId,
        receivedAt: Date.now() + 600000,
      };
    },
  ],
  [
    'nonstring rejection code',
    (value: Record<string, any>) => {
      value.lastRejection = {
        code: 42,
        requestId: value.request.requestId,
        receivedAt: Date.now(),
      };
    },
  ],
  [
    'malformed rejection code',
    (value: Record<string, any>) => {
      value.lastRejection = {
        code: 'not a code',
        requestId: value.request.requestId,
        receivedAt: Date.now(),
      };
    },
  ],
  [
    'foreign rejection request',
    (value: Record<string, any>) => {
      value.lastRejection = {
        code: 'FORBIDDEN',
        requestId: 'foreign-request',
        receivedAt: Date.now(),
      };
    },
  ],
])('retains malformed recovery metadata: %s', async (_description, change) => {
  await prepareJournal(identity, request());
  const value = JSON.parse(journalSnapshot(identity)!);
  change(value);
  const raw = writeStored(value);
  await expect(readJournal(identity)).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(journalSnapshot(identity)).toBe(raw);
});

it.each([
  ['unbounded workflow', 'foreign:report-exact', request()],
  ['foreign report ID', 'report:foreign', request()],
  [
    'foreign report target',
    'report:foreign',
    {
      schemaVersion: 'lca.study-api.v3',
      requestId: 'freeze-request',
      idempotencyKey: 'freeze-key',
      operation: 'report.freeze',
      target: { type: 'reportRevision', id: 'report-exact', expectedRevision: 1 },
      expectedContentHash: 'a'.repeat(64),
    },
  ],
  [
    'foreign Study ID',
    'study:foreign',
    {
      schemaVersion: 'lca.study-api.v2',
      requestId: 'prepare-request',
      idempotencyKey: 'prepare-key',
      operation: 'model.prepare',
      studyId: 'study-a',
      source: {
        type: 'scenarioRevision',
        scenarioRevisionId: 'scenario-a',
        expectedRevision: 1,
        contentHash: 'a'.repeat(64),
      },
      profileId: 'lca.study-explicit-v1',
      calculationContractRef: {
        kind: 'calculation_contract',
        schema: 'lca.calculation-contract.v1',
        sha256: 'b'.repeat(64),
      },
    },
  ],
  [
    'foreign Study target',
    'study:foreign',
    {
      schemaVersion: 'lca.study-api.v4',
      requestId: 'member-request',
      idempotencyKey: 'member-key',
      operation: 'member.set',
      target: { type: 'study', id: 'study-a', expectedRevision: 1 },
      memberId: 'member-a',
      role: 'viewer',
    },
  ],
  [
    'foreign share ID',
    'share:foreign',
    {
      schemaVersion: 'lca.study-api.v4',
      requestId: 'share-request',
      idempotencyKey: 'share-key',
      operation: 'share.revoke',
      shareId: 'share-a',
      reason: 'Exact revocation',
    },
  ],
] as const)(
  'rejects a mismatched or unsupported workflow before persistence: %s',
  async (_description, scope, selected) => {
    await expect(prepareJournal(identity, selected as StudyRequest, scope)).rejects.toMatchObject({
      code: 'RECOVERY_INVALID',
    });
    expect(sessionStorage.length).toBe(0);
  },
);

it('cannot record failure against a missing or replaced audit/request identity', async () => {
  const prepared = await prepareJournal(identity, request());
  await expect(
    recordJournalFailure({ ...identity, actorId: 'foreign' }, prepared, null),
  ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  const changed = { ...prepared, auditId: crypto.randomUUID() };
  writeStored(changed);
  await expect(recordJournalFailure(identity, prepared, 'FORBIDDEN')).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  await expect(completeJournal(identity, prepared)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(journalSnapshot(identity)).not.toBeNull();
});

it('retains an unresolved rejected intent when audit-receipt persistence or removal fails', async () => {
  const prepared = await prepareJournal(identity, request());
  const rejected = await recordJournalFailure(identity, prepared, 'FORBIDDEN');
  const raw = journalSnapshot(identity);
  const quota = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('audit quota');
  });
  await expect(retireJournal(identity, rejected)).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(journalSnapshot(identity)).toBe(raw);
  quota.mockRestore();
  const silent = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  await expect(retireJournal(identity, rejected)).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(journalSnapshot(identity)).toBe(raw);
  silent.mockRestore();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('cannot clear current');
  });
  await expect(retireJournal(identity, rejected)).rejects.toMatchObject({
    code: 'RECOVERY_UNAVAILABLE',
  });
  expect(journalSnapshot(identity)).toBe(raw);
});

it('atomically preserves the last available journal slot under unrelated concurrent preparations', async () => {
  for (let index = 0; index < 7; index += 1)
    await prepareJournal(
      { ...identity, actorId: `existing-${index}` },
      request({ idempotencyKey: `existing-key-${index}` }),
    );
  const results = await Promise.allSettled([
    prepareJournal(identity, request({ idempotencyKey: 'last-slot-a' }), 'study:last-slot-a'),
    prepareJournal(identity, request({ idempotencyKey: 'last-slot-b' }), 'study:last-slot-b'),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: { code: 'RECOVERY_UNAVAILABLE' } },
  ]);
  expect(sessionStorage.length).toBe(8);
  for (let index = 0; index < 7; index += 1)
    expect(
      (await readJournal({ ...identity, actorId: `existing-${index}` }))?.request,
    ).toHaveProperty('idempotencyKey', `existing-key-${index}`);
});

it('rejects a query request before creating any mutation recovery record', async () => {
  await expect(
    prepareJournal(
      identity,
      {
        schemaVersion: 'lca.study-api.v4',
        requestId: 'read-only-request',
        operation: 'capability.read',
      },
      'resource:capability.read',
    ),
  ).rejects.toMatchObject({ code: 'RECOVERY_INVALID' });
  expect(sessionStorage.length).toBe(0);
});
