import { supabase } from '@/services/supabase';
import { FunctionRegion } from '@supabase/supabase-js';
import { z } from 'zod';

const identity = z.object({ id: z.uuid(), version: z.string() });
const reference = z.object({
  flow: identity,
  direction: z.string(),
  meanAmount: z.number(),
  referenceUnit: z.string(),
});
const process = identity.extend({ quantitativeReference: reference });
const publication = z.object({
  releaseRunId: z.uuid(),
  releaseVersion: z.string(),
  publishedAt: z.string(),
});
const common = z.object({
  schemaVersion: z.literal('result.query.response.v1'),
  artifactId: z.uuid(),
  publicationId: z.uuid(),
  source: identity,
});
const overview = z.object({ process, lciAvailable: z.boolean(), lciaAvailable: z.boolean() });
const lcia = z.object({
  process,
  impacts: z
    .array(
      z.object({
        method: identity.extend({ key: z.string(), name: z.string(), unit: z.string() }),
        amount: z.number(),
      }),
    )
    .max(4096),
});
const lci = z.object({
  process,
  items: z
    .array(
      z.object({
        key: z.object({
          flowId: z.uuid(),
          flowVersion: z.string(),
          direction: z.enum(['Input', 'Output']),
          unit: z.string(),
          location: z.string().nullable(),
        }),
        name: z.unknown(),
        classification: z.unknown(),
        amount: z.number(),
      }),
    )
    .max(1000),
  nextCursor: z.string().nullable(),
  nonzeroCount: z.number().int().nonnegative(),
});
export type PublishedOverview = z.infer<typeof overview>;
export type PublishedLcia = z.infer<typeof lcia>;
export type PublishedLci = z.infer<typeof lci>;
export type PublishedData = PublishedOverview | PublishedLcia | PublishedLci;
export type PublishedQuery =
  | { kind: 'overview' | 'lcia' }
  | {
      kind: 'lci';
      limit: number;
      cursor?: string | null;
      filter?: string;
    };
export type PublishedResult = z.infer<typeof common> & {
  publication: z.infer<typeof publication>;
  data: PublishedData;
};
export type QueryOutcome =
  | { status: 'ready'; result: PublishedResult }
  | { status: 'preparing'; publicationId: string }
  | { status: 'unavailable' | 'error' };

/** Exact source and publication identity; no client-side artifact or legacy fallback. */
export async function queryPublishedResult(
  source: { id: string; version: string },
  query: PublishedQuery,
  signal: AbortSignal,
  publicationId?: string,
): Promise<QueryOutcome> {
  const session = await supabase.auth.getSession();
  signal.throwIfAborted();
  const token = session.data.session?.access_token;
  if (!token) return { status: 'unavailable' };
  const response = await supabase.functions.invoke('lca_release_results', {
    body: {
      mode: 'query',
      processId: source.id,
      processVersion: source.version,
      query,
      ...(publicationId ? { publicationId } : {}),
    },
    headers: { Authorization: `Bearer ${token}` },
    region: FunctionRegion.UsEast1,
    signal,
    timeout: 12_000,
  });
  signal.throwIfAborted();
  if (response.error) {
    return {
      status: [401, 403, 404].includes(response.error.context?.status) ? 'unavailable' : 'error',
    };
  }
  if (response.data?.ok !== true) return { status: 'error' };
  const base = common.safeParse(response.data.data);
  if (
    !base.success ||
    base.data.source.id !== source.id ||
    base.data.source.version !== source.version ||
    (publicationId && base.data.publicationId !== publicationId)
  )
    return { status: 'error' };
  if (response.data.data.status === 'preparing') {
    return { status: 'preparing', publicationId: base.data.publicationId };
  }
  const schema = common.extend({
    publication,
    data: query.kind === 'overview' ? overview : query.kind === 'lcia' ? lcia : lci,
  });
  const parsed = schema.safeParse(response.data.data);
  if (
    !parsed.success ||
    parsed.data.data.process.id !== source.id ||
    parsed.data.data.process.version !== source.version
  )
    return { status: 'error' };
  return { status: 'ready', result: parsed.data };
}
