import { supabase } from '@/services/supabase';
import { FunctionRegion } from '@supabase/supabase-js';
import { z } from 'zod';

const uuid = z.uuid();
const version = z.string().regex(/^\d{2}\.\d{2}\.\d{3}$/);
const releaseVersion = z.string().regex(/^\d{4}\.\d{2}\.\d+$/);
const identity = z.object({ uuid, version }).strict();
const bytes = (limit: number) =>
  z.string().refine((v) => new TextEncoder().encode(v).length <= limit);
const keySchema = z.string().regex(/^[0-9a-f-]{36}@\d{2}\.\d{2}\.\d{3}$/);
const unit = z
  .object({
    flowPropertyId: uuid,
    flowPropertyVersion: version,
    unitGroupId: uuid,
    unitGroupVersion: version,
    internalId: z.string(),
    name: z.string(),
  })
  .strict();
const inventoryKey = z
  .object({
    flowId: uuid,
    flowVersion: version,
    direction: z.enum(['Input', 'Output']),
    location: z.string().nullable(),
    functionType: z.string().nullable(),
    unit,
  })
  .strict();
const row = identity
  .extend({
    relationKind: z.enum(['direct', 'derived']),
    quantitativeReference: inventoryKey
      .extend({
        flowName: z.string(),
        flowClassification: z.unknown(),
        value: z.number(),
        amountField: z.literal('resultingAmount'),
      })
      .strict(),
  })
  .strict();
const overviewSchema = z
  .object({ result: row, lciAvailable: z.literal(true), lciaAvailable: z.boolean() })
  .strict();
const lciSchema = z
  .object({
    result: row,
    items: z
      .array(
        z
          .object({
            key: inventoryKey,
            name: z.string(),
            classification: z.unknown(),
            amount: z.number(),
          })
          .strict(),
      )
      .max(1000),
    nextCursor: bytes(4096).nullable(),
    nonzeroCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const lciaSchema = z
  .object({
    result: row,
    impacts: z
      .array(
        z
          .object({
            method: z
              .object({ id: uuid, version, key: z.string(), name: z.string(), unit: z.string() })
              .strict(),
            amount: z.number(),
          })
          .strict(),
      )
      .max(4096),
  })
  .strict();
const common = z.object({
  schemaVersion: z.literal('result.query.response.v2'),
  publicationId: uuid,
  releaseVersion,
  runtimeRevision: uuid,
  result: identity,
});
const sourceSchema = z
  .object({
    publication: z
      .object({
        publicationId: uuid,
        releaseVersion,
        format: z.enum(['final-result-pair.v2', 'legacy-four-zip.v1']),
      })
      .strict()
      .nullable(),
    results: z
      .array(
        identity
          .extend({
            relationKind: z.literal('direct'),
            lciAvailable: z.literal(true),
            lciaAvailable: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    nextResultKey: keySchema.nullable(),
  })
  .strict();
export type FinalIdentity = z.infer<typeof identity>;
export type FinalOverview = z.infer<typeof overviewSchema>;
export type FinalLci = z.infer<typeof lciSchema>;
export type FinalLcia = z.infer<typeof lciaSchema>;
export type SourceFinalResults = z.infer<typeof sourceSchema>;
export type FinalPins = { publicationId: string; runtimeRevision?: string };
export function parseFinalResultLink(
  search: string,
): { result: FinalIdentity; publicationId: string } | null {
  const params = new URLSearchParams(search);
  const keys = ['resultId', 'resultVersion', 'publicationId'];
  if (
    Array.from(params.keys()).some((key) => !keys.includes(key)) ||
    keys.some((key) => params.getAll(key).length !== 1)
  )
    return null;
  const parsed = identity.safeParse({
    uuid: params.get('resultId'),
    version: params.get('resultVersion'),
  });
  const publication = uuid.safeParse(params.get('publicationId'));
  return parsed.success && publication.success
    ? { result: parsed.data, publicationId: publication.data }
    : null;
}
export function finalResultLink(result: FinalIdentity, publicationId: string): string {
  return `#/published-results?${new URLSearchParams({ resultId: result.uuid, resultVersion: result.version, publicationId })}`;
}
export type FinalQuery =
  | { kind: 'overview' | 'lcia' }
  | { kind: 'lci'; limit: number; cursor?: string | null; filter?: string };
export type FinalResult = z.infer<typeof common> & { data: FinalOverview | FinalLci | FinalLcia };
export type FinalFailure = { status: 'unavailable' | 'changed' | 'error' };
export type FinalQueryOutcome =
  | FinalFailure
  | { status: 'ready'; result: FinalResult }
  | { status: 'preparing'; pins: FinalPins };

async function invoke(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<FinalFailure | { status: 'ready'; data: unknown }> {
  const session = await supabase.auth.getSession();
  signal.throwIfAborted();
  const token = session.data.session?.access_token;
  if (!token) return { status: 'unavailable' };
  const response = await supabase.functions.invoke('lca_release_results', {
    body,
    headers: { Authorization: `Bearer ${token}` },
    region: FunctionRegion.UsEast1,
    signal,
    timeout: 12000,
  });
  signal.throwIfAborted();
  if (response.error) {
    const status = response.error.context?.status;
    return {
      status: [401, 403, 404].includes(status)
        ? 'unavailable'
        : [409, 422].includes(status)
          ? 'changed'
          : 'error',
    };
  }
  if (response.data?.ok !== true || response.data?.mode !== body.mode) return { status: 'error' };
  return { status: 'ready', data: response.data.data };
}
export async function sourceFinalResults(
  source: { id: string; version: string },
  signal: AbortSignal,
  continuation?: { publicationId: string; afterKey: string },
): Promise<FinalFailure | { status: 'ready'; page: SourceFinalResults }> {
  if (
    !identity.safeParse({ uuid: source.id, version: source.version }).success ||
    (continuation &&
      (!uuid.safeParse(continuation.publicationId).success ||
        !keySchema.safeParse(continuation.afterKey).success))
  )
    return { status: 'error' };
  const response = await invoke(
    {
      mode: 'source_results',
      sourceId: source.id,
      sourceVersion: source.version,
      limit: 100,
      ...continuation,
    },
    signal,
  );
  if (response.status !== 'ready') return response;
  const parsed = sourceSchema.safeParse(response.data);
  if (!parsed.success) return { status: 'error' };
  const page = parsed.data;
  if (
    (continuation && page.publication?.publicationId !== continuation.publicationId) ||
    (page.publication?.format !== 'final-result-pair.v2' &&
      (page.results.length || page.nextResultKey))
  )
    return { status: 'error' };
  let previous = continuation?.afterKey ?? '';
  for (const item of page.results) {
    const key = `${item.uuid}@${item.version}`;
    if (key <= previous) return { status: 'error' };
    previous = key;
  }
  if (page.nextResultKey !== null && (!page.results.length || page.nextResultKey !== previous))
    return { status: 'error' };
  return { status: 'ready', page };
}
export async function queryFinalResult(
  result: FinalIdentity,
  query: FinalQuery,
  signal: AbortSignal,
  pins: FinalPins,
): Promise<FinalQueryOutcome> {
  if (
    !identity.safeParse(result).success ||
    !uuid.safeParse(pins.publicationId).success ||
    (pins.runtimeRevision && !uuid.safeParse(pins.runtimeRevision).success) ||
    (query.kind === 'lci' &&
      (!Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 1000 ||
        (query.cursor !== null &&
          query.cursor !== undefined &&
          (!pins.runtimeRevision || !bytes(4096).safeParse(query.cursor).success)) ||
        (query.filter !== undefined && !bytes(256).safeParse(query.filter).success)))
  )
    return { status: 'error' };
  const response = await invoke(
    { mode: 'final_query', resultId: result.uuid, resultVersion: result.version, ...pins, query },
    signal,
  );
  if (response.status !== 'ready') return response;
  const dataSchema =
    query.kind === 'overview' ? overviewSchema : query.kind === 'lcia' ? lciaSchema : lciSchema;
  const schema = common
    .extend({ data: z.union([dataSchema, z.object({ status: z.literal('preparing') }).strict()]) })
    .strict();
  const parsed = schema.safeParse(response.data);
  if (
    !parsed.success ||
    parsed.data.result.uuid !== result.uuid ||
    parsed.data.result.version !== result.version ||
    parsed.data.publicationId !== pins.publicationId ||
    (pins.runtimeRevision && parsed.data.runtimeRevision !== pins.runtimeRevision)
  )
    return { status: 'error' };
  if ('status' in parsed.data.data)
    return {
      status: 'preparing',
      pins: {
        publicationId: parsed.data.publicationId,
        runtimeRevision: parsed.data.runtimeRevision,
      },
    };
  if (
    parsed.data.data.result.uuid !== result.uuid ||
    parsed.data.data.result.version !== result.version ||
    (query.kind === 'lci' &&
      'items' in parsed.data.data &&
      parsed.data.data.items.length > query.limit)
  )
    return { status: 'error' };
  return { status: 'ready', result: { ...parsed.data, data: parsed.data.data } };
}
export async function finalResultDownload(
  publicationId: string,
  format: 'tidas' | 'ilcd',
  signal: AbortSignal,
) {
  if (!uuid.safeParse(publicationId).success) return { status: 'error' } as FinalFailure;
  const response = await invoke({ mode: 'final_download', publicationId, format }, signal);
  if (response.status !== 'ready') return response;
  const parsed = z
    .object({
      publicationId: uuid,
      file: z
        .object({
          name: z.literal(`result.${format}.zip`),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          byteSize: z
            .number()
            .int()
            .min(1)
            .max(32 * 1024 ** 3),
        })
        .strict(),
      url: z.url(),
      expiresAt: z.iso.datetime(),
    })
    .strict()
    .safeParse(response.data);
  if (!parsed.success || parsed.data.publicationId !== publicationId)
    return { status: 'error' } as FinalFailure;
  const url = new URL(parsed.data.url),
    expiresAt = Date.parse(parsed.data.expiresAt);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) ||
    expiresAt <= Date.now() ||
    expiresAt > Date.now() + 65000
  )
    return { status: 'error' } as FinalFailure;
  return { status: 'ready' as const, download: parsed.data };
}
