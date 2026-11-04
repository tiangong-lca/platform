import { parseExportBundle } from '../../../../vendor/study-contract/v4/index.mjs';
import { parseExportBundle as parseV5ExportBundle } from '../../../../vendor/study-contract/v5/index.mjs';
import { createHash, webcrypto } from 'node:crypto';
import { downloadStudyExport } from '@/services/study/download';
import { StudyRequestError } from '@/services/study/api';

const mockReview = jest.fn(),
  mockGetSession = jest.fn(),
  mockGetClaims = jest.fn(),
  mockAuth = jest.fn();
let mockGeneration = 0;
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      getClaims: (...args: unknown[]) => mockGetClaims(...args),
      onAuthStateChange: (...args: unknown[]) => mockAuth(...args),
    },
  },
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => mockGeneration,
  subscribeTaskCenterIdentity: () => () => {},
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  review: (...args: unknown[]) => mockReview(...args),
}));

const bundle = {
  schemaVersion: 'lca.study-export-bundle.v2',
  manifestBase64: Buffer.from('{}').toString('base64'),
  receipt: {
    schemaVersion: 'lca.study-export-receipt.v2',
    manifestHash: 'a'.repeat(64),
    keyId: 'synthetic-key',
    algorithm: 'Ed25519',
    signature: 'A'.repeat(86),
  },
  files: [
    {
      path: 'report.html',
      encoding: 'base64',
      bytes: Buffer.from('<!doctype html><p>Synthetic report</p>').toString('base64'),
    },
    { path: 'projection.json', encoding: 'base64', bytes: Buffer.from('{}').toString('base64') },
  ],
};
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const payload = Buffer.from(JSON.stringify(canonical(bundle)), 'utf8');
const digest = createHash('sha256').update(payload).digest('hex');
const bundleRef = { byteSize: payload.length, contentHash: digest, mediaType: 'application/json' };
const response = (
  kind: 'export' | 'share',
  reference: { byteSize: number; contentHash: string; mediaType?: string } = bundleRef,
) => ({
  type: kind === 'share' ? 'download' : 'exportDownload',
  ...(kind === 'share'
    ? { share: { bundleRef: reference } }
    : { export: { bundleRef: reference } }),
  bytes: Buffer.from(payload).toString('base64'),
});
const readBlob = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  URL.revokeObjectURL = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockGeneration = 0;
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'actor-a' }, access_token: 'token-a' } },
  });
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'actor-a' } } });
  mockAuth.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  (URL.createObjectURL as jest.Mock).mockReturnValue('blob:exact-frozen-export');
});

it.each(['export', 'share'] as const)(
  'downloads exact authorized %s bytes and releases the object URL',
  async (kind) => {
    mockReview.mockResolvedValue(response(kind));
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadStudyExport(kind, 'selected-id');
    expect(mockReview).toHaveBeenCalledWith(
      kind === 'share'
        ? { operation: 'share.download', shareId: 'selected-id' }
        : { operation: 'export.download', exportId: 'selected-id' },
    );
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(Array.from(new Uint8Array(await readBlob(blob)))).toEqual(Array.from(payload));
    expect(JSON.parse(Buffer.from(await readBlob(blob)).toString('utf8'))).toEqual(bundle);
    expect(
      parseExportBundle(new Uint8Array(await readBlob(blob))).files.map((file) => file.path),
    ).toEqual(['report.html', 'projection.json']);
    // Parsing the persisted container makes no signature or receipt authenticity claim.
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe(`study-${kind}-selected-id.json`);
    expect(anchor.href).toBe('blob:exact-frozen-export');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-frozen-export');
    click.mockRestore();
  },
);

it.each(['export', 'share'] as const)(
  'downloads exact V5 %s bundle.v3 bytes through the selected family',
  async (kind) => {
    const current = { ...bundle, schemaVersion: 'lca.study-export-bundle.v3' };
    const bytes = Buffer.from(JSON.stringify(canonical(current)), 'utf8');
    const reference = {
      byteSize: bytes.length,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      mediaType: 'application/json',
    };
    mockReview.mockResolvedValue({ ...response(kind, reference), bytes: bytes.toString('base64') });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await downloadStudyExport(kind, 'v5-id', 'v5');
      expect(mockReview).toHaveBeenCalledTimes(1);
      expect(mockReview).toHaveBeenCalledWith(
        kind === 'share'
          ? { operation: 'share.download', shareId: 'v5-id' }
          : { operation: 'export.download', exportId: 'v5-id' },
        undefined,
        'v5',
      );
      const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
      const actual = new Uint8Array(await readBlob(blob));
      expect(Array.from(actual)).toEqual(Array.from(bytes));
      expect(JSON.parse(Buffer.from(actual).toString('utf8')).schemaVersion).toBe(
        'lca.study-export-bundle.v3',
      );
      expect(parseV5ExportBundle(actual).files.map((file) => file.path)).toEqual([
        'report.html',
        'projection.json',
      ]);
      expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe(
        `study-${kind}-v5-id.json`,
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-frozen-export');
    } finally {
      click.mockRestore();
    }
  },
);

it.each([
  { byteSize: payload.length + 1, contentHash: digest },
  { byteSize: payload.length, contentHash: 'f'.repeat(64) },
])('rejects altered byte metadata before creating a downloadable URL: %j', async (reference) => {
  mockReview.mockResolvedValue(response('export', reference));
  await expect(downloadStudyExport('export', 'selected-id')).rejects.toMatchObject({
    code: 'REFERENCE_MISMATCH',
    retryable: false,
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

it('rejects response kinds that would cross the named-share/export boundary', async () => {
  mockReview.mockResolvedValue(response('export'));
  await expect(downloadStudyExport('share', 'named-id')).rejects.toMatchObject({
    code: 'REFERENCE_MISMATCH',
  });
  mockReview.mockResolvedValue(response('share'));
  await expect(downloadStudyExport('export', 'export-id')).rejects.toMatchObject({
    code: 'REFERENCE_MISMATCH',
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('propagates current authorization denial without creating downloadable bytes', async () => {
  mockReview.mockRejectedValue(new StudyRequestError('FORBIDDEN', false));
  await expect(downloadStudyExport('share', 'revoked-id')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('releases the object URL even when the browser download action throws', async () => {
  mockReview.mockResolvedValue(response('export'));
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    throw new Error('download unavailable');
  });
  await expect(downloadStudyExport('export', 'selected-id')).rejects.toThrow(
    'download unavailable',
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-frozen-export');
  click.mockRestore();
});

it.each(['actor', 'client', 'bearer', 'admission', 'away-and-back'] as const)(
  'blocks the final download effect if %s changes while SHA-256 is pending',
  async (change) => {
    mockReview.mockResolvedValue(response('export'));
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let notify!: (event: string, value: any) => void;
    const unsubscribe = jest.fn();
    mockAuth.mockImplementation((listener) => {
      notify = listener;
      return { data: { subscription: { unsubscribe } } };
    });
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    const digestSpy = jest
      .spyOn(crypto.subtle, 'digest')
      .mockImplementationOnce(async (...args) => {
        if (change === 'admission') mockGeneration += 1;
        else if (change === 'client')
          mockGetClaims.mockResolvedValue({
            data: { claims: { sub: 'actor-a', client_id: 'client-b' } },
          });
        else if (change === 'away-and-back') {
          notify('SIGNED_IN', { user: { id: 'actor-b' }, access_token: 'token-b' });
          notify('SIGNED_IN', { user: { id: 'actor-a' }, access_token: 'token-a' });
        } else
          mockGetSession.mockResolvedValue({
            data: {
              session: {
                user: { id: change === 'actor' ? 'actor-b' : 'actor-a' },
                access_token: 'token-b',
              },
            },
          });
        return nativeDigest(...args);
      });
    await expect(downloadStudyExport('export', 'selected-id')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    click.mockRestore();
    digestSpy.mockRestore();
  },
);

it('checks synchronous identity invalidation immediately before clicking and still releases its URL', async () => {
  mockReview.mockResolvedValue(response('export'));
  (URL.createObjectURL as jest.Mock).mockImplementationOnce(() => {
    mockGeneration += 1;
    return 'blob:exact-frozen-export';
  });
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await expect(downloadStudyExport('export', 'selected-id')).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  });
  expect(click).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-frozen-export');
  click.mockRestore();
});

it('refuses non-JSON media metadata rather than labeling it as a bundle', async () => {
  mockReview.mockResolvedValue(response('export', { ...bundleRef, mediaType: 'application/zip' }));
  await expect(downloadStudyExport('export', 'selected-id')).rejects.toMatchObject({
    code: 'REFERENCE_MISMATCH',
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
