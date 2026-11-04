import { getDataDetail } from '@/services/general/api';
import { getLangText } from '@/services/general/util';
import {
  resolveReviewedLciaMethodIdentity,
  STATIC_LCIA_METHOD_LIST,
} from '@/services/lciaMethods/evidence';
import { genProcessName } from '@/services/processes/util';

export type ResultReference = { id: string; version: string };
export type ResultMetadata = { name: string };
export const resultReferenceKey = (reference: ResultReference) =>
  `${reference.id}:${reference.version}`;

// Keep this reader scoped to one mounted result panel. Failures are retryable.
export function createResultMetadataReader(language: string) {
  const cache = new Map<
    string,
    { pending: Promise<ResultMetadata | null>; value?: ResultMetadata }
  >();
  const read = (kind: 'processes' | 'flows', reference: ResultReference) => {
    if (!reference.id || !reference.version) return Promise.resolve(null);
    const key = `${kind}:${resultReferenceKey(reference)}`;
    const existing = cache.get(key);
    if (existing) return existing.pending;
    const pending = getDataDetail(reference.id, reference.version, kind)
      .then((result) => {
        if (
          !result.success ||
          result.data?.id !== reference.id ||
          result.data?.version !== reference.version
        )
          return null;
        const dataset = result.data.json?.[kind === 'flows' ? 'flowDataSet' : 'processDataSet'];
        const info =
          dataset?.[kind === 'flows' ? 'flowInformation' : 'processInformation']
            ?.dataSetInformation;
        const name =
          kind === 'flows'
            ? getLangText(info?.name?.baseName, language)
            : genProcessName(info?.name, language);
        return name && name !== '-' ? { name } : null;
      })
      .catch(() => null)
      .then((result) => {
        const entry = cache.get(key);
        if (entry?.pending === pending) {
          if (result) entry.value = result;
          else cache.delete(key);
        }
        return result;
      });
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { pending });
    return pending;
  };
  const readBatch = async (kind: 'processes' | 'flows', references: ResultReference[]) => {
    const unique = [...new Map(references.map((ref) => [resultReferenceKey(ref), ref])).values()];
    const result: Record<string, ResultMetadata> = {};
    for (let offset = 0; offset < unique.length; offset += 6) {
      await Promise.all(
        unique.slice(offset, offset + 6).map(async (ref) => {
          const metadata = await read(kind, ref);
          if (metadata) result[resultReferenceKey(ref)] = metadata;
        }),
      );
    }
    return result;
  };
  return Object.assign(readBatch, {
    cachedFlowName: (ref: ResultReference) =>
      cache.get(`flows:${resultReferenceKey(ref)}`)?.value?.name,
  });
}

export function resultMethodMetadata(reference: ResultReference, language: string) {
  const identity = resolveReviewedLciaMethodIdentity(reference.id, reference.version);
  const method =
    identity &&
    STATIC_LCIA_METHOD_LIST.files.find(
      (item) => item.id === identity.artifact_locator_id && item.version === reference.version,
    );
  return {
    name: method ? getLangText(method.description, language) : '-',
    unit: method
      ? getLangText(method.referenceQuantity?.['common:shortDescription'], language)
      : '-',
  };
}
