import LcaReleaseReadPanel, {
  datasetForRole,
  releaseArtifactFilename,
  releaseProfileLabel,
} from '@/components/LcaReleaseReadPanel';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('antd', () => require('../../mocks/antd').createAntdMock());
jest.mock('@ant-design/icons', () =>
  require('../../mocks/antDesignIcons').createAntDesignIconsMock(),
);
jest.mock('@umijs/max', () => ({
  __esModule: true,
  useIntl: () => ({ formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id }),
}));

const mockGetCurrent = jest.fn();
const mockGetRelease = jest.fn();
const mockGetCurrentForProcess = jest.fn();
const mockCreateDownload = jest.fn();

jest.mock('@/services/lcaReleases', () => ({
  __esModule: true,
  getLcaRelease: (...args: any[]) => mockGetRelease(...args),
  getCurrentLcaRelease: (...args: any[]) => mockGetCurrent(...args),
  getCurrentLcaReleaseForProcess: (...args: any[]) => mockGetCurrentForProcess(...args),
  createLcaReleaseArtifactDownload: (...args: any[]) => mockCreateDownload(...args),
}));

const release = {
  releaseRunId: '11111111-1111-4111-8111-111111111111',
  releaseVersion: '01.02.003',
  status: 'readback_verified',
  scopeMode: 'global_eligible',
  selectionManifestHash: 'a'.repeat(64),
  inputManifestHash: 'b'.repeat(64),
  calculationBundleHash: 'c'.repeat(64),
  publishPlanHash: 'd'.repeat(64),
  releaseManifestHash: 'e'.repeat(64),
  artifactSetHash: 'f'.repeat(64),
  createdAt: '2026-07-16T00:00:00Z',
  readbackVerifiedAt: '2026-07-16T01:00:00Z',
  datasetCounts: { unit_process: 1, lifecycle_model: 1, result_process: 1 },
  validation: {
    tidas: 'passed',
    ilcd: 'passed',
    semanticRoundtrip: 'passed',
    referenceClosure: 'passed',
    numericParity: 'passed',
  },
  artifacts: [
    {
      artifactId: '22222222-2222-4222-8222-222222222222',
      profileId: 'unit-process-full-closure.v1',
      format: 'tidas',
      sha256: '1'.repeat(64),
      byteSize: 1024 * 1024,
      mediaType: 'application/zip',
      pinned: true,
    },
    {
      artifactId: '33333333-3333-4333-8333-333333333333',
      profileId: 'standalone-lifecyclemodel-result-full-closure.v1',
      format: 'ilcd',
      sha256: '2'.repeat(64),
      byteSize: 2 * 1024 * 1024,
      mediaType: 'application/zip',
      pinned: true,
    },
  ],
  blockers: [],
};

const processRelease = {
  ...release,
  datasets: [
    { role: 'unit_process', uuid: 'unit-uuid', version: '01.00.000' },
    { role: 'lifecycle_model', uuid: 'model-uuid', version: '02.00.000' },
    { role: 'result_process', uuid: 'result-uuid', version: '03.00.000' },
  ],
};

describe('LcaReleaseReadPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrent.mockResolvedValue({ data: release, error: null });
    mockGetCurrentForProcess.mockResolvedValue({ data: processRelease, error: null });
    mockCreateDownload.mockResolvedValue({
      data: { signedDownloadUrl: 'https://download.example/release.zip' },
      error: null,
    });
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  it('covers release labels, filenames, and role lookup helpers', () => {
    expect(releaseProfileLabel('unit-process-full-closure.v1')).toBe('Unit Process');
    expect(releaseProfileLabel('standalone-lifecyclemodel-result-full-closure.v1')).toBe(
      'LifecycleModel + Result',
    );
    expect(releaseProfileLabel('custom')).toBe('custom');
    expect(
      releaseArtifactFilename('01.02.003', {
        profileId: 'unit-process-full-closure.v1',
        format: 'tidas',
      }),
    ).toBe('tiangong-lca-01.02.003-unit-process.tidas.zip');
    expect(releaseArtifactFilename('01.02.003', { profileId: 'custom', format: 'ilcd' })).toBe(
      'tiangong-lca-01.02.003-model-result.ilcd.zip',
    );
    expect(datasetForRole(processRelease.datasets as any, 'result_process')?.uuid).toBe(
      'result-uuid',
    );
    expect(datasetForRole(undefined, 'result_process')).toBeUndefined();
  });

  it('renders public release evidence and refreshes signed artifact downloads', async () => {
    render(<LcaReleaseReadPanel />);
    expect(await screen.findByText('Model / Result Release')).toBeInTheDocument();
    expect(screen.getByText('01.02.003')).toBeInTheDocument();
    expect(screen.getByText('readback_verified')).toBeInTheDocument();
    expect(screen.getByText(/unit_process: 1/)).toBeInTheDocument();
    expect(screen.getByText(/semanticRoundtrip: passed/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Download ZIP' })[0]);
    await waitFor(() =>
      expect(mockCreateDownload).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222'),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockGetCurrent).toHaveBeenCalledTimes(2));
  });

  it('shows exact Unit Process, LifecycleModel, and Result Process identities', async () => {
    render(
      <LcaReleaseReadPanel
        compact
        processId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        processVersion='01.00.000'
      />,
    );
    expect(await screen.findByText('Process release')).toBeInTheDocument();
    expect(screen.getByText('unit-uuid')).toBeInTheDocument();
    expect(screen.getByText('model-uuid')).toBeInTheDocument();
    expect(screen.getByText('result-uuid')).toBeInTheDocument();
    expect(screen.queryByText('Release run ID')).not.toBeInTheDocument();
    expect(mockGetCurrentForProcess).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '01.00.000',
    );
  });

  it('renders blockers, pending validation, missing identities, and download failures', async () => {
    mockGetCurrentForProcess.mockResolvedValueOnce({
      data: {
        ...processRelease,
        status: 'published',
        readbackVerifiedAt: null,
        blockers: ['readback_verification_required'],
        validation: { tidas: 'failed', optional: null },
        datasets: [{ role: 'unit_process', uuid: 'unit-only', version: '01.00.000' }],
      },
      error: null,
    });
    mockCreateDownload.mockResolvedValueOnce({ data: null, error: { message: 'link expired' } });
    render(
      <LcaReleaseReadPanel
        processId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        processVersion='01.00.000'
      />,
    );
    expect(await screen.findByText(/readback_verification_required/)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/tidas: failed/)).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Download ZIP' })[0]);
    expect(await screen.findByText('link expired')).toBeInTheDocument();
  });

  it('renders canonical empty states and retryable non-empty failures', async () => {
    mockGetCurrent
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'publication_not_found', message: 'none' },
      })
      .mockResolvedValueOnce({ data: null, error: { code: 'upstream_failed', message: 'offline' } })
      .mockResolvedValueOnce({ data: null, error: null });
    const { rerender } = render(<LcaReleaseReadPanel />);
    expect(await screen.findByText(/No canonical Model/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
    rerender(<LcaReleaseReadPanel processId='id' processVersion={undefined} />);
    expect(await screen.findByText('Release metadata is unavailable.')).toBeInTheDocument();
  });
});

it('keeps downloads tied to the result release rather than a newer current release', async () => {
  mockGetRelease.mockResolvedValue({ data: release, error: null });
  render(
    <LcaReleaseReadPanel
      processId='exact'
      processVersion='01.00.000'
      releaseRunId={release.releaseRunId}
    />,
  );
  await waitFor(() => expect(mockGetRelease).toHaveBeenCalledWith(release.releaseRunId));
  expect(mockGetCurrentForProcess).not.toHaveBeenCalled();
});
