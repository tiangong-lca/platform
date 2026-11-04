import { StudyRequestError } from './errors';
export { StudyRequestError } from './errors';
import {
  completeJournal,
  prepareJournal,
  readJournal,
  journalSnapshot,
  recordJournalFailure,
  retireJournal,
  type WriteIdentity,
} from './journal';
export { subscribePendingStudyWrites } from './journal';
import {
  getTaskCenterIdentityGeneration,
  subscribeTaskCenterIdentity,
} from '@/services/auth/taskCenters';
import { supabase } from '@/services/supabase';
import * as v2 from '../../../vendor/study-contract/v2/index.mjs';
import * as v3 from '../../../vendor/study-contract/v3/index.mjs';
import * as v4 from '../../../vendor/study-contract/v4/index.mjs';

export type CoreData = Extract<v2.StudyApiResponse, { ok: true }>['data'];
export type AnalysisData = Extract<v3.StudyApiResponse, { ok: true }>['data'];
export type ReviewData = Extract<v4.StudyApiResponse, { ok: true }>['data'];
export type CoreResource<K extends CoreData['type']> = Extract<CoreData, { type: K }>;
export type ReviewResource<K extends ReviewData['type']> = Extract<ReviewData, { type: K }>;
export type Study = CoreResource<'study'>['value'];
export type Revision = CoreResource<'studyRevision'>['value'];
export type Scenario = CoreResource<'scenarioRevision'>['value'];
export type Preparation = CoreResource<'modelPreparation'>['value'];
export type Run = CoreResource<'run'>['value'];
export type ReportView = ReviewResource<'view'>;
export type Actions = ReviewResource<'actions'>;
export type Request = v2.StudyApiRequest | v3.StudyApiRequest | v4.StudyApiRequest;
export type RequestBody<R> = R extends Request ? Omit<R, 'requestId' | 'schemaVersion'> : never;
export type CoreRequest = RequestBody<v2.StudyApiRequest>;
export type AnalysisRequest = RequestBody<v3.StudyApiRequest>;
export type ReviewRequest = RequestBody<v4.StudyApiRequest>;

/** An ambiguous write must be retried with its original key and exact payload. */
export const newWriteKey = () => crypto.randomUUID();

async function writeIdentity(session: {
  user: { id: string };
  access_token: string;
}): Promise<WriteIdentity> {
  const result = await supabase.auth.getClaims(session.access_token);
  const claims = result.data?.claims;
  if (
    result.error ||
    !claims ||
    claims.sub !== session.user.id ||
    (claims.client_id !== undefined &&
      claims.client_id !== null &&
      typeof claims.client_id !== 'string')
  )
    throw new StudyRequestError('AUTH_REQUIRED', false);
  return {
    actorId: session.user.id,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : null,
    origin: window.location.origin,
  };
}

/** Ephemeral identity fence across asynchronous work and its final synchronous effect. */
export async function withStudyIdentity<T>(
  effect: (guard: {
    session: { user: { id: string }; access_token: string };
    identity: WriteIdentity;
    generation: number;
    assertCurrent: () => Promise<void>;
    assertUnchanged: () => void;
  }) => Promise<T>,
): Promise<T> {
  const generation = getTaskCenterIdentityGeneration();
  const current = (await supabase.auth.getSession()).data.session;
  if (!current) throw new StudyRequestError('AUTH_REQUIRED', false);
  const session = { user: { id: current.user.id }, access_token: current.access_token };
  let changed = false;
  const matches = (value: typeof session | null) =>
    value?.user.id === session.user.id && value?.access_token === session.access_token;
  const { data } = supabase.auth.onAuthStateChange((_event, next) => {
    if (!matches(next)) changed = true;
  });
  const assertUnchanged = () => {
    if (changed || generation !== getTaskCenterIdentityGeneration())
      throw new StudyRequestError('AUTH_REQUIRED', false);
  };
  try {
    const identity = await writeIdentity(session);
    assertUnchanged();
    const assertCurrent = async () => {
      assertUnchanged();
      const fresh = (await supabase.auth.getSession()).data.session;
      if (!matches(fresh)) throw new StudyRequestError('AUTH_REQUIRED', false);
      const verified = await writeIdentity(session);
      if (verified.actorId !== identity.actorId || verified.clientId !== identity.clientId)
        throw new StudyRequestError('AUTH_REQUIRED', false);
      // Claims verification is asynchronous too. Recheck the bearer after it settles.
      if (!matches((await supabase.auth.getSession()).data.session))
        throw new StudyRequestError('AUTH_REQUIRED', false);
      assertUnchanged();
    };
    return await effect({ session, identity, generation, assertCurrent, assertUnchanged });
  } finally {
    data.subscription.unsubscribe();
  }
}
type IdentityGuard = Parameters<Parameters<typeof withStudyIdentity>[0]>[0];

export async function readPendingStudyWrite(workflow: string): Promise<{
  pending: boolean;
  raw: string | null;
  request?: Request;
  error?: unknown;
  canRetire?: boolean;
}> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return { pending: false, raw: null };
  const identity = await writeIdentity(session),
    raw = journalSnapshot(identity, workflow);
  if (raw === null) return { pending: false, raw: null };
  try {
    const intent = (await readJournal(identity, workflow))!;
    return {
      pending: true,
      raw,
      request: intent.request,
      canRetire: !intent.everAmbiguous && !intent.dispatching && intent.lastRejection !== null,
    };
  } catch (error) {
    return { pending: true, raw: raw.slice(0, 262144), error };
  }
}

function defaultWorkflow(request: Request): string {
  if ('reportRevisionId' in request) return `report:${request.reportRevisionId}`;
  if ('studyId' in request) return `study:${request.studyId}`;
  if ('target' in request)
    return `${request.target.type === 'study' ? 'study' : request.target.type === 'reportRevision' ? 'report' : 'resource'}:${request.target.id}`;
  if ('shareId' in request) return `share:${request.shareId}`;
  return `resource:${request.operation}`;
}

/** Capture current session and admission; every mutation is journaled before dispatch. */
async function invoke(
  version: 'v2' | 'v3' | 'v4',
  body: unknown,
  workflow?: string,
  guard?: IdentityGuard,
) {
  const codec = { v2, v3, v4 }[version];
  let request = codec.parseRequest({
    ...(body as object),
    schemaVersion: `lca.study-api.${version}`,
    requestId: crypto.randomUUID(),
  });
  const generation = guard?.generation ?? getTaskCenterIdentityGeneration(),
    session = guard?.session ?? (await supabase.auth.getSession()).data.session;
  if (!session) throw new StudyRequestError('AUTH_REQUIRED', false);
  const identity =
    'idempotencyKey' in request ? (guard?.identity ?? (await writeIdentity(session))) : null;
  const intent = identity
    ? await prepareJournal(identity, request, workflow ?? defaultWorkflow(request))
    : null;
  if (intent) request = intent.request;
  let knownFailure = false;
  try {
    if (generation !== getTaskCenterIdentityGeneration())
      throw new StudyRequestError('AUTH_REQUIRED', false);
    if (guard) {
      await guard.assertCurrent();
      guard.assertUnchanged();
    }
    const { data, error } = await supabase.functions.invoke('app_lca_study', {
      body: request,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const after = await supabase.auth.getSession();
    if (
      generation !== getTaskCenterIdentityGeneration() ||
      after.data.session?.user.id !== session.user.id ||
      after.data.session?.access_token !== session.access_token
    )
      throw new StudyRequestError('AUTH_REQUIRED', false);
    let payload = data;
    if (error) {
      try {
        payload = await error.context?.json();
      } catch {
        throw new StudyRequestError('UPSTREAM_UNAVAILABLE', true);
      }
      if (!payload) throw new StudyRequestError('UPSTREAM_UNAVAILABLE', true);
    }
    const response = codec.parseResponse(payload);
    if (version === 'v2')
      v2.validateResponseForRequest(request as v2.StudyApiRequest, response as v2.StudyApiResponse);
    else if (version === 'v3')
      v3.validateResponseForRequest(request as v3.StudyApiRequest, response as v3.StudyApiResponse);
    else
      v4.validateResponseForRequest(request as v4.StudyApiRequest, response as v4.StudyApiResponse);
    if (!response.ok) {
      if (identity && intent)
        await recordJournalFailure(
          identity,
          intent,
          !response.retryable &&
            !['UPSTREAM_UNAVAILABLE', 'DEADLINE_EXCEEDED'].includes(response.code) &&
            !(error?.context?.status >= 500)
            ? response.code
            : null,
        );
      knownFailure = true;
      throw new StudyRequestError(response.code, response.retryable);
    }
    if (identity && intent) {
      const current = await writeIdentity(after.data.session!);
      if (
        identity.actorId !== current.actorId ||
        identity.clientId !== current.clientId ||
        generation !== getTaskCenterIdentityGeneration()
      )
        throw new StudyRequestError('AUTH_REQUIRED', false);
      await completeJournal(identity, intent);
    }
    guard?.assertUnchanged();
    return response.data;
  } catch (failure) {
    if (identity && intent && !knownFailure) {
      try {
        await recordJournalFailure(identity, intent, null);
      } catch {
        /* The pre-dispatch record remains dispatching and cannot be retired. */
      }
    }
    throw failure;
  }
}

export const core = (body: CoreRequest, workflow?: string) =>
  invoke('v2', body, workflow) as Promise<CoreData>;
export const analysis = (body: AnalysisRequest, workflow?: string) =>
  invoke('v3', body, workflow) as Promise<AnalysisData>;
export const review = (body: ReviewRequest, workflow?: string) =>
  invoke('v4', body, workflow) as Promise<ReviewData>;

export async function recoverPendingStudyWrite(workflow: string) {
  return withStudyIdentity(async (guard) => {
    const intent = await readJournal(guard.identity, workflow);
    guard.assertUnchanged();
    if (!intent) throw new StudyRequestError('RECOVERY_REQUIRED', false);
    const version = {
      'lca.study-api.v2': 'v2',
      'lca.study-api.v3': 'v3',
      'lca.study-api.v4': 'v4',
    }[intent.request.schemaVersion] as 'v2' | 'v3' | 'v4';
    return invoke(version, intent.request, workflow, guard);
  });
}

/** Explicit local retirement after fresh current-target read; no server cancel/undo is implied. */
export async function retirePendingStudyWrite(workflow: string) {
  const generation = getTaskCenterIdentityGeneration();
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new StudyRequestError('AUTH_REQUIRED', false);
  const identity = await writeIdentity(session),
    intent = await readJournal(identity, workflow);
  if (!intent || intent.everAmbiguous || intent.dispatching || !intent.lastRejection)
    throw new StudyRequestError('RECOVERY_REQUIRED', false);
  const separator = workflow.indexOf(':'),
    kind = workflow.slice(0, separator),
    id = workflow.slice(separator + 1);
  if (kind === 'study') await core({ operation: 'study.read', studyId: id });
  else if (kind === 'report' || kind === 'share')
    await review({
      operation: 'resource.actions',
      resource: { type: kind === 'report' ? 'reportRevision' : 'share', id },
    });
  else throw new StudyRequestError('RECOVERY_REQUIRED', false);
  const after = (await supabase.auth.getSession()).data.session;
  if (!after) throw new StudyRequestError('AUTH_REQUIRED', false);
  const current = await writeIdentity(after);
  if (
    generation !== getTaskCenterIdentityGeneration() ||
    current.actorId !== identity.actorId ||
    current.clientId !== identity.clientId
  )
    throw new StudyRequestError('AUTH_REQUIRED', false);
  await retireJournal(identity, intent);
  return {
    type: 'localRetirement' as const,
    workflow,
    auditId: intent.auditId,
    requestId: intent.request.requestId,
    idempotencyKey: intent.request.idempotencyKey,
  };
}

export function expectType<T extends { type: string }, K extends T['type']>(
  data: T,
  type: K,
): Extract<T, { type: K }> {
  if (data.type !== type) throw new StudyRequestError('REFERENCE_MISMATCH', false);
  return data as Extract<T, { type: K }>;
}

export async function readArtifact(
  studyId: string,
  artifactRef: Extract<CoreRequest, { operation: 'artifact.read' }>['artifactRef'],
): Promise<unknown> {
  const artifact = expectType(
    await core({ operation: 'artifact.read', studyId, artifactRef }),
    'artifact',
  );
  const bytes = Uint8Array.from(atob(artifact.bytes), (character) => character.charCodeAt(0));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (bytes.byteLength !== artifactRef.byteSize || hash !== artifactRef.contentHash)
    throw new StudyRequestError('REFERENCE_MISMATCH', false);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function subscribeStudyIdentityChange(listener: () => void) {
  const stopAdmission = subscribeTaskCenterIdentity(listener);
  let token: string | null | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.access_token ?? null;
    if (token !== undefined && next !== token) listener();
    token = next;
  });
  return () => {
    stopAdmission();
    data.subscription.unsubscribe();
  };
}
