import * as v2 from '../../../vendor/study-contract/v2/index.mjs';
import * as v3 from '../../../vendor/study-contract/v3/index.mjs';
import * as v4 from '../../../vendor/study-contract/v4/index.mjs';
import * as v5 from '../../../vendor/study-contract/v5/index.mjs';
import * as v6 from '../../../vendor/study-contract/v6/index.mjs';
import { StudyRequestError } from './errors';

export type StudyRequest =
  | v2.StudyApiRequest
  | v3.StudyApiRequest
  | v4.StudyApiRequest
  | v5.StudyApiRequest
  | v6.StudyApiRequest;
type MutationRequest = Extract<StudyRequest, { idempotencyKey: string }>;
export type WriteIdentity = { actorId: string; clientId: string | null; origin: string };
type Rejection = { code: string; requestId: string; receivedAt: number };
type Intent = WriteIdentity & {
  schemaVersion: 'lca.study-write-intent.v1';
  auditId: string;
  workflow: string;
  createdAt: number;
  request: MutationRequest;
  everAmbiguous: boolean;
  dispatching: boolean;
  lastRejection: Rejection | null;
};
export type StoredIntent = Intent & { checksum: string };
const PREFIX = 'tiangong.study.pending.v1:';
const MAX_BYTES = 262144;
const MAX_RECORDS = 8;
const listeners = new Set<() => void>();
export const subscribePendingStudyWrites = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const notify = () => listeners.forEach((listener) => listener());
const invalid = () => new StudyRequestError('RECOVERY_INVALID', false);
const key = (identity: WriteIdentity, workflow: string) =>
  PREFIX +
  encodeURIComponent(identity.actorId) +
  ':' +
  encodeURIComponent(identity.clientId ?? 'first-party') +
  ':' +
  encodeURIComponent(workflow);
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
function storage(): Storage {
  try {
    return window.sessionStorage;
  } catch {
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  }
}
function validWorkflow(workflow: string) {
  if (
    !/^(?:study|report|share|report5|share5|report6|share6|resource|directory):[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(
      workflow,
    )
  )
    throw invalid();
}
function codec(request: { schemaVersion?: unknown }) {
  switch (request.schemaVersion) {
    case 'lca.study-api.v2':
      return v2;
    case 'lca.study-api.v3':
      return v3;
    case 'lca.study-api.v4':
      return v4;
    case 'lca.study-api.v5':
      return v5;
    case 'lca.study-api.v6':
      return v6;
    default:
      throw invalid();
  }
}
function assertBinding(workflow: string, request: StudyRequest) {
  const separator = workflow.indexOf(':'),
    kind = workflow.slice(0, separator),
    id = workflow.slice(separator + 1);
  if (
    ['report', 'share', 'report5', 'share5', 'report6', 'share6'].includes(kind) &&
    (kind.endsWith('6') !== (request.schemaVersion === 'lca.study-api.v6') ||
      kind.endsWith('5') !== (request.schemaVersion === 'lca.study-api.v5'))
  )
    throw invalid();
  if (
    kind === 'study' &&
    (('studyId' in request && request.studyId !== id) ||
      ('target' in request && request.target.type === 'study' && request.target.id !== id))
  )
    throw invalid();
  if (
    (kind === 'report' || kind === 'report5' || kind === 'report6') &&
    (('reportRevisionId' in request && request.reportRevisionId !== id) ||
      ('target' in request && request.target.type === 'reportRevision' && request.target.id !== id))
  )
    throw invalid();
  if (
    (kind === 'share' || kind === 'share5' || kind === 'share6') &&
    'shareId' in request &&
    request.shareId !== id
  )
    throw invalid();
}
export function journalSnapshot(identity: WriteIdentity, workflow: string): string | null {
  validWorkflow(workflow);
  try {
    return storage().getItem(key(identity, workflow));
  } catch {
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  }
}
function timestamp(value: unknown) {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Date.now() + 300000
  );
}

/** A journal is browser-owner state; it never authenticates an actor or proves server effects. */
export async function readJournal(
  identity: WriteIdentity,
  workflow: string,
): Promise<StoredIntent | null> {
  const raw = journalSnapshot(identity, workflow);
  if (raw === null) return null;
  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw invalid();
    const value = JSON.parse(raw) as StoredIntent;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'actorId,auditId,checksum,clientId,createdAt,dispatching,everAmbiguous,lastRejection,origin,request,schemaVersion,workflow'
    )
      throw invalid();
    const { checksum, ...content } = value;
    if (
      value.schemaVersion !== 'lca.study-write-intent.v1' ||
      value.actorId !== identity.actorId ||
      value.clientId !== identity.clientId ||
      value.origin !== identity.origin ||
      value.workflow !== workflow ||
      !timestamp(value.createdAt) ||
      typeof value.auditId !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(value.auditId) ||
      typeof value.everAmbiguous !== 'boolean' ||
      typeof value.dispatching !== 'boolean' ||
      typeof checksum !== 'string' ||
      (await digest(JSON.stringify(content))) !== checksum
    )
      throw invalid();
    if (
      value.lastRejection !== null &&
      (typeof value.lastRejection !== 'object' ||
        Object.keys(value.lastRejection).sort().join(',') !== 'code,receivedAt,requestId' ||
        !timestamp(value.lastRejection.receivedAt) ||
        typeof value.lastRejection.code !== 'string' ||
        !/^[A-Z_]{1,64}$/u.test(value.lastRejection.code) ||
        value.lastRejection.requestId !== value.request.requestId)
    )
      throw invalid();
    const selected = codec(value.request),
      request = selected.parseRequest(value.request);
    if (
      !('idempotencyKey' in request) ||
      selected.operationMetadata[request.operation as keyof typeof selected.operationMetadata]
        ?.kind !== 'mutation'
    )
      throw invalid();
    assertBinding(workflow, request);
    return { ...value, request };
  } catch {
    throw invalid();
  }
}
function contentOf(value: StoredIntent): Intent {
  const content = { ...value };
  Reflect.deleteProperty(content, 'checksum');
  return content;
}
async function write(identity: WriteIdentity, content: Intent): Promise<StoredIntent> {
  const value = { ...content, checksum: await digest(JSON.stringify(content)) },
    raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  try {
    const store = storage();
    if (store.getItem(key(identity, content.workflow)) === null) {
      let count = 0;
      for (let index = 0; index < store.length; index += 1)
        if (store.key(index)?.startsWith(PREFIX)) count += 1;
      if (count >= MAX_RECORDS) throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
    }
    store.setItem(key(identity, content.workflow), raw);
    if (store.getItem(key(identity, content.workflow)) !== raw) throw invalid();
  } catch {
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  }
  notify();
  return value;
}
function comparable(request: StudyRequest) {
  const body: Record<string, unknown> = { ...request };
  delete body.requestId;
  return JSON.stringify(body);
}
const preparing = new Set<string>();

/** One unresolved intent per workflow. Persist dispatching before network so crashes remain ambiguous. */
export async function prepareJournal(
  identity: WriteIdentity,
  request: StudyRequest,
  workflow: string,
): Promise<StoredIntent> {
  const lockKey = identity.origin + ':' + key(identity, workflow);
  if (preparing.has(lockKey)) throw new StudyRequestError('RECOVERY_REQUIRED', false);
  preparing.add(lockKey);
  try {
    validWorkflow(workflow);
    if (!('idempotencyKey' in request)) throw invalid();
    assertBinding(workflow, request);
    const pending = await readJournal(identity, workflow);
    if (pending) {
      if (comparable(pending.request) !== comparable(request))
        throw new StudyRequestError('RECOVERY_REQUIRED', false);
      const content = contentOf(pending);
      return await write(identity, {
        ...content,
        everAmbiguous: pending.everAmbiguous || pending.dispatching,
        dispatching: true,
      });
    }
    const store = storage();
    let count = 0;
    try {
      for (let index = 0; index < store.length; index += 1)
        if (store.key(index)?.startsWith(PREFIX)) count += 1;
    } catch {
      throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
    }
    if (count >= MAX_RECORDS) throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
    return await write(identity, {
      schemaVersion: 'lca.study-write-intent.v1',
      ...identity,
      auditId: crypto.randomUUID(),
      workflow,
      createdAt: Date.now(),
      request,
      everAmbiguous: false,
      dispatching: true,
      lastRejection: null,
    });
  } finally {
    preparing.delete(lockKey);
  }
}

export async function recordJournalFailure(
  identity: WriteIdentity,
  expected: StoredIntent,
  code: string | null,
) {
  const current = await readJournal(identity, expected.workflow);
  if (
    !current ||
    current.auditId !== expected.auditId ||
    JSON.stringify(current.request) !== JSON.stringify(expected.request)
  )
    throw new StudyRequestError('RECOVERY_REQUIRED', false);
  const content = contentOf(current);
  const ambiguous = code === null;
  return write(identity, {
    ...content,
    everAmbiguous: current.everAmbiguous || expected.everAmbiguous || ambiguous,
    dispatching: false,
    lastRejection: ambiguous
      ? current.lastRejection
      : { code, requestId: expected.request.requestId, receivedAt: Date.now() },
  });
}

/** Only the exact validated success clears unresolved state. */
export async function completeJournal(identity: WriteIdentity, expected: StoredIntent) {
  const current = await readJournal(identity, expected.workflow);
  if (
    !current ||
    current.auditId !== expected.auditId ||
    JSON.stringify(current.request) !== JSON.stringify(expected.request)
  )
    throw new StudyRequestError('RECOVERY_REQUIRED', false);
  try {
    storage().removeItem(key(identity, expected.workflow));
  } catch {
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  }
  notify();
}

/** Local retirement retains the original request/key/audit; it is not cancellation or undo. */
export async function retireJournal(identity: WriteIdentity, expected: StoredIntent) {
  const current = await readJournal(identity, expected.workflow);
  if (
    !current ||
    current.checksum !== expected.checksum ||
    current.everAmbiguous ||
    current.dispatching ||
    !current.lastRejection
  )
    throw new StudyRequestError('RECOVERY_REQUIRED', false);
  const raw = JSON.stringify({
    schemaVersion: 'lca.study-write-retirement.v1',
    retiredAt: Date.now(),
    intent: current,
  });
  try {
    const store = storage();
    const retiredKey = key(identity, expected.workflow) + ':retired:' + current.auditId;
    store.setItem(retiredKey, raw);
    if (store.getItem(retiredKey) !== raw) throw invalid();
    store.removeItem(key(identity, expected.workflow));
  } catch {
    throw new StudyRequestError('RECOVERY_UNAVAILABLE', false);
  }
  notify();
}
