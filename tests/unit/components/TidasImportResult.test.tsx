import TidasImportResult from '@/components/ImportTidasPackage/ImportResult';
import { getTidasPackageJobApi } from '@/services/general/api';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/services/general/api', () => ({
  getTidasPackageJobApi: jest.fn(),
  normalizeBrowserAccessiblePackageUrl: (url: string) => url,
}));
jest.mock('umi', () => ({
  useIntl: () => ({ formatMessage: ({ defaultMessage }: any) => defaultMessage }),
}));
const readJob = jest.mocked(getTidasPackageJobApi);
let downloads: string[];
beforeEach(() => {
  jest.clearAllMocks();
  downloads = [];
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.href);
  });
});
afterEach(() => jest.restoreAllMocks());
const artifactJob = (url = 'https://example.com/report') =>
  ({
    data: {
      ok: true,
      artifacts_by_kind: {
        import_report: {
          artifact_format: 'tidas-package-import-report:v1',
          signed_download_url: url,
        },
        import_details: { signed_download_url: 'https://example.com/details' },
      },
    },
    error: null,
  }) as any;

it('makes no requests on mount and downloads historical reports with a fresh URL per click', async () => {
  readJob
    .mockResolvedValueOnce(artifactJob())
    .mockResolvedValueOnce(artifactJob('https://example.com/fresh'))
    .mockResolvedValueOnce(artifactJob());
  render(<TidasImportResult jobId='legacy' />);
  expect(readJob).not.toHaveBeenCalled();
  for (const label of ['Download report', 'Download report', 'Download complete details']) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }));
    });
  }
  expect(downloads).toEqual([
    'https://example.com/report',
    'https://example.com/fresh',
    'https://example.com/details',
  ]);
  expect(readJob).toHaveBeenCalledTimes(3);
  expect(screen.queryByText(/Imported:/)).not.toBeInTheDocument();
});
it('disables unavailable artifacts without requesting details', () => {
  render(<TidasImportResult jobId='missing' reportAvailable={false} detailsAvailable={false} />);
  expect(screen.getByRole('button', { name: 'Download report' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Download complete details' })).toBeDisabled();
  expect(readJob).not.toHaveBeenCalled();
});
it.each([
  { data: null, error: new Error('offline') },
  { data: null, error: null },
  { data: { ok: false }, error: null },
  { data: { ok: true, artifacts_by_kind: {} }, error: null },
])('shows download failure and retries without changing task status', async (result) => {
  readJob.mockResolvedValueOnce(result as any).mockResolvedValueOnce(artifactJob());
  render(<TidasImportResult jobId='retry' reportAvailable />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  });
  expect(screen.getByText(/Unable to load the latest result/)).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  });
  expect(screen.queryByText(/Unable to load the latest result/)).not.toBeInTheDocument();
  expect(downloads).toHaveLength(1);
});
it.each([false, true])('ignores responses after job changes or unmount (%s)', async (reject) => {
  let resolve!: (v: any) => void;
  let fail!: (v: any) => void;
  readJob.mockReturnValueOnce(
    new Promise((r, j) => {
      resolve = r;
      fail = j;
    }),
  );
  const view = render(<TidasImportResult jobId='old' />);
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  expect(screen.getByRole('button', { name: 'Download complete details' })).toBeDisabled();
  if (reject) view.unmount();
  else view.rerender(<TidasImportResult jobId='new' />);
  await act(async () => {
    if (reject) fail(new Error('offline'));
    else resolve(artifactJob());
  });
  expect(downloads).toEqual([]);
});
