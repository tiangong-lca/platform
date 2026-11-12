import {
  queryFinalResult,
  type FinalIdentity,
  type FinalLci,
  type FinalLcia,
  type FinalResult,
} from './finalResults';

/** Reads the entire unfiltered Result before making a downloadable file. */
export async function collectFinalResult(
  overview: FinalResult,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void = () => {},
  query = queryFinalResult,
) {
  if (!('lciaAvailable' in overview.data)) throw new Error('Invalid result overview');
  const pins = { publicationId: overview.publicationId, runtimeRevision: overview.runtimeRevision };
  const read = async (request: Parameters<typeof queryFinalResult>[1]) => {
    signal.throwIfAborted();
    const reply = await query(overview.result, request, signal, pins);
    signal.throwIfAborted();
    if (
      reply.status !== 'ready' ||
      reply.result.publicationId !== pins.publicationId ||
      reply.result.runtimeRevision !== pins.runtimeRevision ||
      reply.result.releaseVersion !== overview.releaseVersion ||
      reply.result.result.uuid !== overview.result.uuid ||
      reply.result.result.version !== overview.result.version ||
      JSON.stringify(reply.result.data.result) !== JSON.stringify(overview.data.result)
    ) {
      throw new Error('Result export interrupted');
    }
    return reply.result.data;
  };
  let lcia: FinalLcia['impacts'] | null = null;
  if (overview.data.lciaAvailable) {
    const data = await read({ kind: 'lcia' });
    if (!('impacts' in data)) throw new Error('Missing LCIA');
    lcia = data.impacts;
  }
  const items: FinalLci['items'] = [];
  let cursor: string | null = null;
  let total: number | undefined;
  const cursors = new Set<string>();
  do {
    const data = await read({ kind: 'lci', limit: 1000, cursor });
    if (!('items' in data)) throw new Error('Missing LCI');
    if (total !== undefined && data.nonzeroCount !== total) throw new Error('LCI changed');
    total = data.nonzeroCount;
    items.push(...data.items);
    cursor = data.nextCursor;
    if (items.length > total || (cursor && (!data.items.length || cursors.has(cursor))))
      throw new Error('Invalid LCI pagination');
    if (cursor) cursors.add(cursor);
    onProgress(items.length, total);
  } while (cursor);
  if (items.length !== total) throw new Error('Incomplete LCI');
  return { lci: { items, nonzeroCount: total, zeroValuesOmitted: true }, lcia };
}

export async function exportFinalResultJson(
  overview: FinalResult,
  signal: AbortSignal,
  source?: FinalIdentity & { name?: unknown },
  onProgress?: (loaded: number, total: number) => void,
) {
  const values = await collectFinalResult(overview, signal, onProgress);
  signal.throwIfAborted();
  const file = {
    schemaVersion: 'tiangong.calculation-result-export.v1',
    exportedAt: new Date().toISOString(),
    publication: { id: overview.publicationId, version: overview.releaseVersion },
    sourceProcess: source ?? null,
    result: overview.data.result,
    ...values,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: 'application/json;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `result-${overview.result.uuid}-${overview.result.version}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
