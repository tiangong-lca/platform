export type ReportApi = 'v4' | 'v5';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;

function selectedApi(params: URLSearchParams): ReportApi | undefined {
  const values = params.getAll('api');
  if (values.length === 0) return 'v4';
  return values.length === 1 && values[0] === '5' ? 'v5' : undefined;
}

export function reportLinkSelection(search: string) {
  const params = new URLSearchParams(search);
  const api = selectedApi(params);
  const id = params.get('id') ?? '';
  const hash = params.get('hash') ?? '';
  return [...params.keys()].every((key) => ['id', 'hash', 'api'].includes(key)) &&
    api &&
    params.getAll('id').length === 1 &&
    params.getAll('hash').length === 1 &&
    idPattern.test(id) &&
    hashPattern.test(hash)
    ? { api, id, hash }
    : undefined;
}

export function shareLinkSelection(search: string) {
  const params = new URLSearchParams(search);
  const api = selectedApi(params);
  const id = params.get('id') ?? '';
  return [...params.keys()].every((key) => ['id', 'api'].includes(key)) &&
    api &&
    params.getAll('id').length === 1 &&
    idPattern.test(id)
    ? { api, id }
    : undefined;
}

function apiSuffix(api: ReportApi) {
  if (api === 'v4') return '';
  if (api === 'v5') return '&api=5';
  throw new Error('Unsupported report family');
}

export const reportHref = (id: string, hash: string, api: ReportApi = 'v4') =>
  `/study-report?id=${encodeURIComponent(id)}&hash=${encodeURIComponent(hash)}${apiSuffix(api)}`;

export const shareHref = (id: string, api: ReportApi = 'v4') =>
  `/study-share?id=${encodeURIComponent(id)}${apiSuffix(api)}`;

/** Existing V4 journal keys stay unchanged; V5 has an independent workflow identity. */
export function reportWorkflow(kind: 'report' | 'share', id: string, api: ReportApi = 'v4') {
  apiSuffix(api);
  return `${kind}${api === 'v5' ? '5' : ''}:${id}`;
}
