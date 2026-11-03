import { createHash, webcrypto } from 'node:crypto';
import { downloadStudyExport } from '@/services/study/download';
import { StudyRequestError } from '@/services/study/api';

const mockReview = jest.fn();
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  review: (...args: unknown[]) => mockReview(...args),
}));

const payload = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x80, 0x41]);
const digest = createHash('sha256').update(payload).digest('hex');
const bundleRef = { byteSize: payload.length, contentHash: digest };
const response = (kind: 'export' | 'share', reference = bundleRef) => ({
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
    expect(blob.type).toBe('application/zip');
    expect(new Uint8Array(await readBlob(blob))).toEqual(payload);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe(`study-${kind}-selected-id.zip`);
    expect(anchor.href).toBe('blob:exact-frozen-export');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:exact-frozen-export');
    click.mockRestore();
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
