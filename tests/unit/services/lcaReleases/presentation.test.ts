import { getDataDetail } from '@/services/general/api';
import {
  createResultMetadataReader,
  resultMethodMetadata,
} from '@/services/lcaReleases/presentation';
import { STATIC_LCIA_CACHE_MANIFEST } from '@/services/lciaMethods/evidence';

jest.mock('@/services/general/api', () => ({ getDataDetail: jest.fn() }));
const read = getDataDetail as jest.Mock;
const ref = { id: 'flow-a', version: '01.00.000' };
const row = (id = ref.id, version = ref.version, name = 'Water') => ({
  success: true,
  data: {
    id,
    version,
    json: {
      flowDataSet: {
        flowInformation: {
          dataSetInformation: { name: { baseName: [{ '@xml:lang': 'en', '#text': name }] } },
        },
      },
    },
  },
});
beforeEach(() => read.mockReset());

it('deduplicates exact references and caches successful metadata only within its reader', async () => {
  read.mockResolvedValue(row());
  const metadata = createResultMetadataReader('en');
  expect(await metadata('flows', [ref, ref])).toEqual({ 'flow-a:01.00.000': { name: 'Water' } });
  await metadata('flows', [ref]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(ref.id, ref.version, 'flows');
  await createResultMetadataReader('en')('flows', [ref]);
  expect(read).toHaveBeenCalledTimes(2);
});

it('keeps the replacement name when an evicted in-flight read finishes late', async () => {
  let rejectFirst!: (error: Error) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectFirst = reject;
      }),
  );
  read.mockImplementation(async (id, version) => row(id, version));
  const metadata = createResultMetadataReader('en');
  const first = metadata('flows', [ref]);
  expect(metadata.cachedFlowName(ref)).toBeUndefined();
  await metadata(
    'flows',
    Array.from({ length: 500 }, (_, i) => ({ id: String(i), version: ref.version })),
  );
  await metadata('flows', [ref]);
  rejectFirst(new Error('expired'));
  await first;
  expect(metadata.cachedFlowName(ref)).toBe('Water');
});

it('does not borrow metadata from another version or use latest for an absent version', async () => {
  const metadata = createResultMetadataReader('en');
  read.mockResolvedValueOnce(row(ref.id, '02.00.000')).mockResolvedValueOnce(row());
  expect(await metadata('flows', [ref, { id: ref.id, version: '' }])).toEqual({});
  expect(read).toHaveBeenCalledTimes(1);
  expect(await metadata('flows', [ref])).toEqual({ 'flow-a:01.00.000': { name: 'Water' } });
});

it('allows failed reads to retry and never caches missing dataset names', async () => {
  const metadata = createResultMetadataReader('en');
  read
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ success: true, data: { ...ref, json: {} } })
    .mockResolvedValueOnce(row());
  expect(await metadata('flows', [ref])).toEqual({});
  expect(await metadata('flows', [ref])).toEqual({});
  expect(await metadata('flows', [ref])).toEqual({ 'flow-a:01.00.000': { name: 'Water' } });
});

it('limits concurrent metadata requests to six', async () => {
  let active = 0;
  let peak = 0;
  read.mockImplementation(async (id, version) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return row(id, version);
  });
  await createResultMetadataReader('en')(
    'flows',
    Array.from({ length: 40 }, (_, i) => ({ id: String(i), version: ref.version })),
  );
  expect(read).toHaveBeenCalledTimes(40);
  expect(peak).toBe(6);
});

it('resolves the reviewed method alias and unit only for the pinned version', () => {
  const method = STATIC_LCIA_CACHE_MANIFEST.methods[0];
  const canonical = resultMethodMetadata(
    { id: method.method_id, version: method.method_version },
    'en',
  );
  expect(canonical.name).not.toBe('-');
  expect(canonical.unit).not.toBe('-');
  expect(
    resultMethodMetadata({ id: method.artifact_locator_id, version: method.method_version }, 'en'),
  ).toEqual(canonical);
  expect(resultMethodMetadata({ id: method.method_id, version: '99.00.000' }, 'en')).toEqual({
    name: '-',
    unit: '-',
  });
});

it('reads process names and bounds retained metadata while permitting evicted records to reload', async () => {
  read.mockImplementation(async (id, version, table) =>
    table === 'processes'
      ? {
          success: true,
          data: {
            id,
            version,
            json: {
              processDataSet: {
                processInformation: {
                  dataSetInformation: {
                    name: { baseName: [{ '@xml:lang': 'en', '#text': 'Cement process' }] },
                  },
                },
              },
            },
          },
        }
      : row(id, version),
  );
  const reader = createResultMetadataReader('en');
  expect(await reader('processes', [ref])).toEqual({
    'flow-a:01.00.000': { name: 'Cement process' },
  });
  await reader(
    'flows',
    Array.from({ length: 501 }, (_, i) => ({ id: String(i), version: ref.version })),
  );
  await reader('processes', [ref]);
  expect(read).toHaveBeenCalledTimes(503);
});
