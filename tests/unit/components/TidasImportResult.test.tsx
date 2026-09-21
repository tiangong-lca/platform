import TidasImportResult from '@/components/ImportTidasPackage/ImportResult';
import { fetchPackageReport, getTidasPackageJobApi } from '@/services/general/api';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/services/general/api', () => ({
  fetchPackageReport: jest.fn(),
  getTidasPackageJobApi: jest.fn(),
}));
jest.mock('umi', () => ({
  useIntl: () => ({ formatMessage: ({ defaultMessage }: any) => defaultMessage }),
}));

const readJob = jest.mocked(getTidasPackageJobApi);
const readReport = jest.mocked(fetchPackageReport);
const mockWarning = jest.fn();
jest.mock('@/contexts/AntdAppContext', () => ({
  useAntdAppApi: () => ({ message: { warning: mockWarning } }),
}));
let downloads: { href: string; filename: string }[];

beforeEach(() => {
  jest.clearAllMocks();
  downloads = [];
  URL.createObjectURL = jest.fn(() => 'blob:generated-report');
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ href: this.href, filename: this.download });
  });
});
afterEach(() => jest.restoreAllMocks());

const artifactJob = (url = 'https://example.com/report') =>
  ({
    data: {
      ok: true,
      artifacts_by_kind: {
        import_report: {
          artifact_format: 'tidas-package-import-report:v2',
          signed_download_url: url,
        },
        import_details: { signed_download_url: 'https://example.com/details' },
      },
    },
    error: null,
  }) as any;

const partialReport = {
  report_version: 2,
  outcome: 'partial',
  summary: {
    total_entries: 3,
    imported_count: 1,
    existing_count: 1,
    not_imported_count: 1,
    validation_issue_count: 1,
  },
  validation_issues: [{ file_path: 'data/a.json', message: 'Missing field' }],
  validation_issues_truncated: false,
};

it('shows one download icon, fetches a fresh report on each click, and downloads a JSON file', async () => {
  readJob
    .mockResolvedValueOnce(artifactJob())
    .mockResolvedValueOnce(artifactJob('https://example.com/fresh'));
  readReport.mockResolvedValue(partialReport);
  render(<TidasImportResult jobId='job-1' />);
  expect(readJob).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Download complete details' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download report' })).toHaveClass('ant-btn-text');
  expect(
    screen.getByRole('button', { name: 'Download report' }).querySelector('.anticon-download'),
  ).toBeInTheDocument();

  for (let i = 0; i < 2; i++) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
    });
  }
  expect(readJob).toHaveBeenCalledTimes(2);
  expect(readReport).toHaveBeenCalledTimes(2);
  expect(readReport.mock.calls[0][0].signed_download_url).toBe('https://example.com/report');
  expect(readReport.mock.calls[1][0].signed_download_url).toBe('https://example.com/fresh');
  expect(downloads).toEqual([
    { href: 'blob:generated-report', filename: 'tidas-import-report-job-1.json' },
    { href: 'blob:generated-report', filename: 'tidas-import-report-job-1.json' },
  ]);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it('disables a known unavailable report without fetching any artifact', () => {
  render(<TidasImportResult jobId='missing' reportAvailable={false} />);
  expect(screen.getByRole('button', { name: 'Download report' })).toBeDisabled();
  expect(readJob).not.toHaveBeenCalled();
  expect(readReport).not.toHaveBeenCalled();
});

it.each([
  { data: null, error: new Error('offline') },
  { data: null, error: null },
  { data: { ok: false }, error: null },
  { data: { ok: true, artifacts_by_kind: {} }, error: null },
])('shows a retriable download failure without changing task status', async (result) => {
  readJob.mockResolvedValueOnce(result as any).mockResolvedValueOnce(artifactJob());
  readReport.mockResolvedValue(partialReport);
  render(<TidasImportResult jobId='retry' reportAvailable />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  });
  expect(mockWarning).toHaveBeenCalledWith(
    'Unable to load the latest result. This does not mean the import failed.',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  });
  expect(mockWarning).toHaveBeenCalledTimes(1);
  expect(downloads).toHaveLength(1);
});

it('downloads a historical v1 artifact with the same single action', async () => {
  const job = artifactJob();
  job.data.artifacts_by_kind.import_report.artifact_format = 'tidas-package-import-report:v1';
  readJob.mockResolvedValue(job);
  readReport.mockResolvedValue({
    code: 'VALIDATION_FAILED',
    summary: {
      total_entries: 1,
      filtered_open_data_count: 0,
      user_conflict_count: 0,
      importable_count: 1,
      validation_issue_count: 1,
    },
    validation_issues: [],
  });
  render(<TidasImportResult jobId='legacy' />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  });
  expect(downloads).toHaveLength(1);
});

it.each([false, true])(
  'ignores job responses after the job changes or unmounts (%s)',
  async (reject) => {
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
    if (reject) view.unmount();
    else view.rerender(<TidasImportResult jobId='new' />);
    await act(async () => {
      if (reject) fail(new Error('offline'));
      else resolve(artifactJob());
    });
    expect(downloads).toEqual([]);
  },
);

it('discards a report body that arrives after its job changes', async () => {
  let resolveReport!: (value: unknown) => void;
  readJob.mockResolvedValue(artifactJob());
  readReport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveReport = resolve;
    }),
  );
  const view = render(<TidasImportResult jobId='old' />);
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  await waitFor(() => expect(readReport).toHaveBeenCalledTimes(1));
  view.rerender(<TidasImportResult jobId='new' />);
  await act(async () => resolveReport(partialReport));
  expect(downloads).toEqual([]);
  expect(mockWarning).not.toHaveBeenCalled();
});

it('keeps the new job download active while an old request completes', async () => {
  let resolveOld!: (value: any) => void;
  let resolveNew!: (value: any) => void;
  readJob
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNew = resolve;
      }),
    );
  readReport.mockResolvedValue(partialReport);
  const view = render(<TidasImportResult jobId='old' />);
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  view.rerender(<TidasImportResult jobId='new' />);
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  await act(async () => resolveOld(artifactJob()));
  expect(downloads).toEqual([]);
  await act(async () => resolveNew(artifactJob()));
  expect(downloads).toHaveLength(1);
  expect(mockWarning).not.toHaveBeenCalled();
});
