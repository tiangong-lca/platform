import { getDataDetail } from '@/services/general/api';
import { STATIC_LCIA_CACHE_MANIFEST } from '@/services/lciaMethods/evidence';
import CalculationBundlePanel, {
  artifactForProcess,
  artifactInlineByteSize,
  formatBundleNumber,
  processOptionLabel,
  recordsToCsv,
} from '@/pages/DataProcessing/CalculationBundlePanel';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('antd', () => ({
  ...require('../../../mocks/antd').createAntdMock(),
  Dropdown: ({ children, menu, disabled }: any) => (
    <>
      {children}
      {menu.items.map((item: any) => (
        <button type='button' key={item.key} disabled={disabled} onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </>
  ),
}));
jest.mock('@ant-design/icons', () =>
  require('../../../mocks/antDesignIcons').createAntDesignIconsMock(),
);
jest.mock('@umijs/max', () => ({
  __esModule: true,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@/services/general/api', () => ({
  getDataDetail: jest.fn(async () => ({ data: null, success: false })),
}));
const mockGetCalculationBundle = jest.fn();
const mockFetchRecords = jest.fn();
const mockFetchText = jest.fn();
const mockFetchFreshDownloadBlob = jest.fn();

jest.mock('@/services/lcaReleases', () => ({
  __esModule: true,
  getCalculationBundle: (...args: any[]) => mockGetCalculationBundle(...args),
  getCalculationExport: async () => ({
    data: { status: 'not_requested', result: null },
    error: null,
  }),
  fetchCalculationBundleRecords: (...args: any[]) => mockFetchRecords(...args),
  fetchCalculationBundleArtifactText: (...args: any[]) => mockFetchText(...args),
  fetchFreshCalculationBundleDownloadBlob: (...args: any[]) => mockFetchFreshDownloadBlob(...args),
}));

const processRows = [
  {
    processIndex: 0,
    rootProcess: { id: '11111111-1111-4111-8111-111111111111', version: '01.00.000' },
    quantitativeReference: {
      exchangeInternalId: '0',
      flow: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: '01.00.000' },
      direction: 'Output',
      referenceUnit: 'kg',
      meanAmount: 1,
    },
  },
  {
    processIndex: 1,
    rootProcess: { id: '22222222-2222-4222-8222-222222222222', version: '02.00.000' },
    quantitativeReference: {
      exchangeInternalId: '0',
      flow: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: '01.00.000' },
      direction: 'Output',
      referenceUnit: 'MJ',
      meanAmount: 1,
    },
  },
];

const artifact = (kind: string, overrides: Record<string, unknown> = {}) => ({
  kind,
  path: `${kind}.ndjson.gz`,
  schemaVersion: `test.${kind}`,
  mediaType: kind === 'coverage' ? 'application/json' : 'application/x-ndjson',
  compression: kind === 'coverage' ? 'none' : 'gzip',
  sha256: kind.repeat(64).slice(0, 64),
  byteSize: 100,
  recordCount: 2,
  firstProcessIndex: 0,
  lastProcessIndex: 1,
  signedDownloadUrl: `https://download.example/${kind}`,
  signedDownloadExpiresInSeconds: 900,
  ...overrides,
});

const productDownload = (role: string, group: string, fileName: string) => ({
  role,
  group,
  fileName,
  schemaVersion: 'tiangong.calculation-download.v1',
  mediaType: fileName.endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : fileName.endsWith('.parquet')
      ? 'application/vnd.apache.parquet'
      : 'application/zip',
  sha256: '9'.repeat(64),
  byteSize: 200,
  recordCount: 2,
  signedDownloadUrl: `https://download.example/${fileName}`,
  signedDownloadExpiresInSeconds: 900,
});

const bundleProjection = (overrides: Record<string, any> = {}) => ({
  packageId: '33333333-3333-4333-8333-333333333333',
  packageVersion: '01.00.000',
  snapshotId: '44444444-4444-4444-8444-444444444444',
  resultId: '55555555-5555-4555-8555-555555555555',
  calculationBundle: {
    bundleContentHash: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    manifestByteSize: 1000,
    artifactCount: 4,
    manifest: {
      schemaVersion: 'tiangong.calculation-bundle.v1',
      calculationContractVersion: '1.0.0',
      calculationId: '66666666-6666-4666-8666-666666666666',
      bundleContentHash: 'a'.repeat(64),
      scope: {
        coverageMode: 'global_eligible',
        processCount: 2,
        selectionManifestHash: 'c'.repeat(64),
      },
      snapshot: {
        id: '44444444-4444-4444-8444-444444444444',
        sha256: 'd'.repeat(64),
        processCount: 2,
        flowCount: 3,
        impactCount: 25,
      },
      solver: {},
      methodSet: {
        methodIdentityManifestSha256: 'e'.repeat(64),
        factorManifestSha256: 'f'.repeat(64),
      },
      artifacts: [],
      calculationEvidence: {},
      hashes: {},
    },
    manifestDownload: {
      sha256: 'b'.repeat(64),
      byteSize: 1000,
      mediaType: 'application/json',
      signedDownloadUrl: 'https://download.example/manifest',
      signedDownloadExpiresInSeconds: 900,
    },
    artifacts: [artifact('process_axis'), artifact('lci'), artifact('lcia'), artifact('coverage')],
    downloads: [
      productDownload('lcia_results_xlsx', 'results', 'lcia-results.xlsx'),
      productDownload('lcia_results_csv_zip', 'results', 'lcia-results.csv.zip'),
      productDownload('lci_inventory_parquet', 'advanced_data', 'lci-inventory.parquet'),
      productDownload('lci_inventory_csv_zip', 'advanced_data', 'lci-inventory-csv.zip'),
      productDownload(
        'calculation_evidence_bundle',
        'audit_evidence',
        'calculation-evidence-bundle.zip',
      ),
    ],
    ...overrides,
  },
});

describe('CalculationBundlePanel', () => {
  beforeEach(() => {
    (getDataDetail as jest.Mock).mockReset().mockResolvedValue({ success: false, data: null });
    jest.clearAllMocks();
    mockGetCalculationBundle.mockResolvedValue({ data: bundleProjection(), error: null });
    mockFetchText.mockResolvedValue(JSON.stringify({ complete: true }));
    mockFetchFreshDownloadBlob.mockResolvedValue(
      new Blob(['verified artifact'], { type: 'application/octet-stream' }),
    );
    mockFetchRecords.mockImplementation(async (item: any) => {
      if (item.kind === 'process_axis') return processRows;
      if (item.kind === 'lci') {
        return [
          {
            processIndex: 0,
            flow: { id: 'flow-0', version: '01.00.000' },
            direction: 'Output',
            unit: 'kg',
            location: null,
            meanAmount: 0.000001,
          },
          {
            processIndex: 1,
            flow: { id: 'flow-1', version: '01.00.000' },
            direction: 'Input',
            unit: 'm3',
            location: 'CN',
            meanAmount: 12.5,
          },
        ];
      }
      return [
        { processIndex: 0, method: { id: 'method-0', version: '01.00.000' }, meanAmount: 0 },
        { processIndex: 1, method: { id: 'method-1', version: '01.00.000' }, meanAmount: 42 },
      ];
    });
    (URL as any).createObjectURL = jest.fn(() => 'blob:result');
    (URL as any).revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  it('does not substitute the first process for a missing exact version', async () => {
    render(
      <CalculationBundlePanel
        packageId='package-1'
        initialProcessId={processRows[0].rootProcess.id}
        initialProcessVersion='99.00.000'
      />,
    );
    expect(
      await screen.findByText('This process version is not included in this calculation.'),
    ).toBeInTheDocument();
    expect(mockFetchRecords.mock.calls.map(([item]) => item.kind)).toEqual(['process_axis']);
    expect(screen.queryByText('method-0')).not.toBeInTheDocument();
  });

  it('retries unavailable names, resolves exact method units and retains standalone selection', async () => {
    const method = STATIC_LCIA_CACHE_MANIFEST.methods[0];
    const baseRead = mockFetchRecords.getMockImplementation()!;
    mockFetchRecords.mockImplementation(async (artifact) =>
      artifact.kind === 'lcia'
        ? [
            {
              processIndex: 0,
              method: { id: method.method_id, version: method.method_version },
              meanAmount: 3,
            },
          ]
        : baseRead(artifact),
    );
    render(<CalculationBundlePanel packageId='metadata' />);
    expect(
      await screen.findByText(
        'Some names are unavailable. Exact identifiers remain visible; results are unchanged.',
      ),
    ).toBeInTheDocument();
    (getDataDetail as jest.Mock).mockImplementation(async (id, version, kind) => ({
      success: true,
      data: {
        id,
        version,
        json: {
          [kind === 'flows' ? 'flowDataSet' : 'processDataSet']: {
            [kind === 'flows' ? 'flowInformation' : 'processInformation']: {
              dataSetInformation: {
                name: {
                  baseName: [
                    {
                      '@xml:lang': 'en',
                      '#text': kind === 'flows' ? 'Cement flow' : 'Cement process',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Some names are unavailable. Exact identifiers remain visible; results are unchanged.',
        ),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(method.method_id)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('combobox', { name: 'Process' }), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('tab-lci'));
    expect(await screen.findByText('12.500000')).toBeInTheDocument();
    expect(screen.getByText('Input', { selector: 'td' })).toBeInTheDocument();
  });

  it.each(['bundle', 'axis', 'records'] as const)(
    'discards a late %s response after changing packages',
    async (phase) => {
      let settle!: (value: any) => void;
      const pending = new Promise((resolve) => {
        settle = resolve;
      });
      if (phase === 'bundle') mockGetCalculationBundle.mockReturnValueOnce(pending);
      else if (phase === 'axis') mockFetchRecords.mockReturnValueOnce(pending);
      else {
        const original = mockFetchRecords.getMockImplementation()!;
        let deferred = false;
        mockFetchRecords.mockImplementation((artifact) => {
          if (!deferred && artifact.kind === 'lci') {
            deferred = true;
            return pending;
          }
          return original(artifact);
        });
      }
      const view = render(<CalculationBundlePanel packageId='old' />);
      await waitFor(() =>
        expect(phase === 'bundle' ? mockGetCalculationBundle : mockFetchRecords).toHaveBeenCalled(),
      );
      await waitFor(() =>
        expect(
          phase !== 'records' || mockFetchRecords.mock.calls.some(([item]) => item.kind === 'lci'),
        ).toBe(true),
      );
      view.rerender(<CalculationBundlePanel packageId='current' />);
      expect(await screen.findByText('method-0')).toBeInTheDocument();
      await act(async () => {
        settle(
          phase === 'bundle'
            ? { data: bundleProjection(), error: null }
            : phase === 'axis'
              ? processRows
              : [
                  {
                    processIndex: 0,
                    flow: { id: 'stale-flow', version: '01.00.000' },
                    direction: 'Input',
                    unit: 'kg',
                    meanAmount: 99,
                  },
                ],
        );
      });
      fireEvent.click(screen.getByTestId('tab-lci'));
      expect(screen.queryByText('stale-flow')).not.toBeInTheDocument();
      expect(screen.getByText('flow-0', { selector: 'code' })).toBeInTheDocument();
    },
  );

  it('supports an empty process axis and bundles without optional coverage/downloads', async () => {
    mockGetCalculationBundle.mockResolvedValue({
      data: bundleProjection({ artifacts: [artifact('process_axis')], downloads: undefined }),
      error: null,
    });
    mockFetchRecords.mockResolvedValue([]);
    render(<CalculationBundlePanel packageId='empty' />);
    expect(await screen.findByText('Process results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
    expect(mockFetchText).not.toHaveBeenCalled();
    expect(screen.getByText('Incomplete / blocked')).toBeInTheDocument();
  });

  it('shows process results without reading or displaying bundle-wide coverage', async () => {
    mockFetchText.mockResolvedValue(JSON.stringify({ complete: false }));
    render(<CalculationBundlePanel packageId='incomplete-coverage' view='results' />);
    fireEvent.click(await screen.findByTestId('tab-lci'));
    expect(await screen.findByText('flow-0', { selector: 'code' })).toBeInTheDocument();
    expect(mockFetchText).not.toHaveBeenCalled();
    expect(screen.queryByText(/incomplete \/ blocked/i)).not.toBeInTheDocument();
  });

  it('retains unknown flow directions and reports non-Error read/download failures', async () => {
    const baseRead = mockFetchRecords.getMockImplementation()!;
    mockFetchRecords.mockImplementation(async (artifact) =>
      artifact.kind === 'lci'
        ? [
            {
              processIndex: 0,
              flow: { id: 'unknown-direction-flow', version: '01.00.000' },
              direction: 'Other',
              unit: 'kg',
              meanAmount: 1,
            },
          ]
        : baseRead(artifact),
    );
    const view = render(<CalculationBundlePanel packageId='unknown-direction' view='results' />);
    fireEvent.click(await screen.findByTestId('tab-lci'));
    expect(await screen.findByText('Other')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(screen.queryByTestId('tab-downloads')).not.toBeInTheDocument();
    mockFetchRecords.mockImplementation((artifact) =>
      artifact.kind === 'process_axis'
        ? Promise.resolve(processRows)
        : Promise.reject('record failure'),
    );
    view.rerender(<CalculationBundlePanel packageId='read-failure' />);
    expect(await screen.findByText('record failure')).toBeInTheDocument();
    mockFetchFreshDownloadBlob.mockRejectedValueOnce('download failure');
    fireEvent.click(screen.getByTestId('tab-downloads'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]);
    expect(await screen.findByText('download failure')).toBeInTheDocument();
  });

  it('covers deterministic display and export helpers', () => {
    expect(artifactForProcess([artifact('lci') as any], 'lci', 1)?.kind).toBe('lci');
    expect(
      artifactForProcess(
        [artifact('lci', { firstProcessIndex: undefined, lastProcessIndex: undefined }) as any],
        'lci',
        1,
      ),
    ).toBeUndefined();
    expect(artifactForProcess([artifact('lci') as any], 'lcia', 1)).toBeUndefined();
    expect(artifactInlineByteSize(artifact('lci') as any)).toBe(100);
    expect(
      artifactInlineByteSize(artifact('lci', { uncompressedByteSize: 30 * 1024 * 1024 }) as any),
    ).toBe(30 * 1024 * 1024);
    expect(formatBundleNumber(Number.NaN)).toBe('-');
    expect(formatBundleNumber(0)).toBe('0');
    expect(formatBundleNumber(1_000_000)).toBe('1.000000e+6');
    expect(formatBundleNumber(0.5)).toBe('0.50000000');
    expect(processOptionLabel(processRows[0] as any)).toContain('#0');
    expect(
      recordsToCsv(
        ['a', 'b'],
        [
          ['quoted,value', 'a"b'],
          [null, undefined],
        ],
      ),
    ).toBe('a,b\n"quoted,value","a""b"\n,\n');
  });

  it('shows directional LCI, LCIA, evidence, exports, and verified downloads', async () => {
    const { rerender } = render(
      <CalculationBundlePanel
        packageId='33333333-3333-4333-8333-333333333333'
        initialProcessId='22222222-2222-4222-8222-222222222222'
        initialProcessVersion='02.00.000'
      />,
    );

    expect(await screen.findByText('Process results')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-lci'));
    await waitFor(() =>
      expect(screen.getByText('flow-1', { selector: 'code' })).toBeInTheDocument(),
    );
    expect(screen.getByTitle(/Location · CN/)).toBeInTheDocument();
    expect(screen.getByText('12.500000')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-lcia'));
    expect(await screen.findByText('method-1')).toBeInTheDocument();
    expect(screen.getByText('42.000000')).toBeInTheDocument();

    expect(screen.queryByTestId('tab-evidence')).not.toBeInTheDocument();
    expect(screen.getByText('e'.repeat(64))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-downloads'));
    expect(screen.getByText('calculation-bundle.json')).toBeInTheDocument();
    expect(screen.getByText('lcia-results.xlsx')).toBeInTheDocument();
    expect(screen.getByText('lci-inventory.parquet')).toBeInTheDocument();
    expect(screen.getByText('calculation-evidence-bundle.zip')).toBeInTheDocument();
    expect(screen.queryByText('lci.ndjson.gz')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    const downloadButtons = screen.getAllByRole('button', { name: 'Download' });
    expect(downloadButtons).toHaveLength(bundleProjection().calculationBundle.downloads.length + 1);
    for (const [index, button] of downloadButtons.entries()) {
      await waitFor(() => expect(button).not.toBeDisabled());
      fireEvent.click(button);
      await waitFor(() => expect(mockFetchFreshDownloadBlob).toHaveBeenCalledTimes(index + 1));
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(index + 1));
    }
    expect(mockFetchFreshDownloadBlob).toHaveBeenNthCalledWith(
      1,
      '33333333-3333-4333-8333-333333333333',
      'download:lcia_results_xlsx',
      bundleProjection().calculationBundle.downloads[0],
    );
    expect(mockFetchFreshDownloadBlob).toHaveBeenNthCalledWith(
      2,
      '33333333-3333-4333-8333-333333333333',
      'download:lcia_results_csv_zip',
      bundleProjection().calculationBundle.downloads[1],
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-lci'));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export JSON' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    await waitFor(() =>
      expect(URL.createObjectURL).toHaveBeenCalledTimes(downloadButtons.length + 2),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(downloadButtons.length + 2);

    rerender(
      <CalculationBundlePanel
        packageId='33333333-3333-4333-8333-333333333333'
        initialProcessId={processRows[0].rootProcess.id}
        initialProcessVersion={processRows[0].rootProcess.version}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('flow-0', { selector: 'code' })).toBeInTheDocument(),
    );
    expect(screen.queryByTitle(/Location ·/)).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Refresh secure links' })).not.toBeInTheDocument();
  });

  it('shows verified download failures without creating a local download', async () => {
    mockFetchFreshDownloadBlob.mockRejectedValueOnce(
      new Error('Calculation artifact SHA-256 mismatch'),
    );
    render(<CalculationBundlePanel packageId='download-failure' />);

    expect(await screen.findByText('Process results')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-downloads'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]);

    expect(await screen.findByText('Calculation artifact SHA-256 mismatch')).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh secure links' }));
    await waitFor(() => expect(mockGetCalculationBundle).toHaveBeenCalledTimes(2));
  });

  it('renders legacy and generic load failures with a retry path', async () => {
    mockGetCalculationBundle
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'calculation_bundle_not_available', message: 'legacy' },
      })
      .mockResolvedValueOnce({ data: null, error: { code: 'upstream_failed', message: 'offline' } })
      .mockResolvedValueOnce({ data: null, error: null });
    const { rerender } = render(<CalculationBundlePanel packageId='legacy-package' />);
    expect(await screen.findByText(/Legacy LCIA-only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();

    rerender(<CalculationBundlePanel packageId='missing-package' />);
    expect(await screen.findByText('Calculation Bundle is unavailable.')).toBeInTheDocument();
  });

  it('fails closed for corrupt axes, missing chunks, oversized chunks, and record errors', async () => {
    mockGetCalculationBundle.mockResolvedValueOnce({
      data: bundleProjection({
        artifacts: [
          artifact('process_axis', { uncompressedByteSize: 25 * 1024 * 1024 }),
          artifact('lci'),
          artifact('lcia'),
          artifact('coverage'),
        ],
      }),
      error: null,
    });
    const { rerender } = render(<CalculationBundlePanel packageId='large-axis' />);
    expect(await screen.findByText(/too large for inline preview/)).toBeInTheDocument();

    mockFetchRecords.mockRejectedValueOnce('corrupt process axis');
    rerender(<CalculationBundlePanel packageId='corrupt' />);
    expect(await screen.findByText('corrupt process axis')).toBeInTheDocument();

    mockGetCalculationBundle.mockResolvedValueOnce({
      data: bundleProjection({ artifacts: [artifact('process_axis'), artifact('coverage')] }),
      error: null,
    });
    mockFetchRecords.mockResolvedValueOnce(processRows);
    rerender(<CalculationBundlePanel packageId='missing-chunks' />);
    expect(await screen.findByText(/result chunks are incomplete/)).toBeInTheDocument();

    mockGetCalculationBundle.mockResolvedValueOnce({
      data: bundleProjection({
        artifacts: [
          artifact('process_axis'),
          artifact('lci', { uncompressedByteSize: 25 * 1024 * 1024 }),
          artifact('lcia'),
          artifact('coverage'),
        ],
      }),
      error: null,
    });
    mockFetchRecords.mockResolvedValueOnce(processRows);
    rerender(<CalculationBundlePanel packageId='large' />);
    fireEvent.click(await screen.findByTestId('tab-lci'));
    expect(await screen.findByText(/too large for inline preview/)).toBeInTheDocument();

    mockGetCalculationBundle.mockResolvedValueOnce({ data: bundleProjection(), error: null });
    mockFetchRecords
      .mockResolvedValueOnce(processRows)
      .mockRejectedValueOnce(new Error('record download expired'));
    rerender(<CalculationBundlePanel packageId='expired' />);
    expect(await screen.findByText('record download expired')).toBeInTheDocument();
  });
  it('opens exports without loading numerical preview chunks or exposing a process selector', async () => {
    render(<CalculationBundlePanel packageId='package' view='exports' />);
    expect(await screen.findByRole('button', { name: 'Generate export' })).toBeInTheDocument();
    expect(screen.getByText('Exports')).toBeInTheDocument();
    expect(screen.queryByText('Process results')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Process' })).not.toBeInTheDocument();
    expect(
      mockFetchRecords.mock.calls.every(([artifact]) => artifact.kind === 'process_axis'),
    ).toBe(true);
    expect(screen.queryByTestId('tab-lci')).not.toBeInTheDocument();
  });
});
