// @ts-nocheck
import ProcessLciaResultsPanel from '@/pages/Processes/Components/processLciaResultsPanel';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetDataSource = jest.fn();
const mockGetLangText = jest.fn();
const mockGetReferenceQuantityFromMethod = jest.fn();
const mockGetVerifiedDecompressedMethodEntry = jest.fn();
const mockQueryLcaResults = jest.fn();
const mockIsLcaFunctionInvokeError = jest.fn();
const mockGetPublishedLciaResultPackage = jest.fn();
const mockUseLocation = jest.fn();
const mockLcaCalculationEvidenceNotice = jest.fn();

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, unknown>) => {
      const template = defaultMessage ?? id;
      return Object.entries(values ?? {}).reduce(
        (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
        template,
      );
    },
  }),
  useLocation: () => mockUseLocation(),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  getDataSource: (...args: any[]) => mockGetDataSource(...args),
  getLangJson: (value: any) => value,
  getLangText: (...args: any[]) => mockGetLangText(...args),
}));

jest.mock('@/services/lciaMethods/util', () => ({
  __esModule: true,
  cacheAndDecompressMethod: jest.fn(),
  getDecompressedMethod: jest.fn(),
  getVerifiedDecompressedMethodEntry: (...args: any[]) =>
    mockGetVerifiedDecompressedMethodEntry(...args),
  getReferenceQuantityFromMethod: (...args: any[]) => mockGetReferenceQuantityFromMethod(...args),
}));

jest.mock('@/services/lca', () => ({
  __esModule: true,
  isLcaFunctionInvokeError: (...args: any[]) => mockIsLcaFunctionInvokeError(...args),
  queryLcaResults: (...args: any[]) => mockQueryLcaResults(...args),
}));

jest.mock('@/services/dataProducts', () => ({
  __esModule: true,
  getPublishedLciaResultPackage: (...args: any[]) => mockGetPublishedLciaResultPackage(...args),
}));

jest.mock('@/components/AlignedNumber', () => ({
  __esModule: true,
  default: ({ value }: any) => <span data-testid='aligned-number'>{value}</span>,
}));

jest.mock('@/pages/Processes/Components/lcaProfileSummary', () => ({
  __esModule: true,
  default: ({ headerExtra, loading, notice, rows }: any) => (
    <div data-testid='lca-profile-summary' data-loading={String(loading)}>
      <div data-testid='lca-profile-header-extra'>{headerExtra}</div>
      <div data-testid='lca-profile-notice'>{notice}</div>
      {rows.length}
    </div>
  ),
}));

jest.mock('@/pages/Processes/Components/lcaCalculationEvidenceNotice', () => ({
  __esModule: true,
  default: (props: any) => {
    mockLcaCalculationEvidenceNotice(props);
    return <div data-testid='lcia-evidence-notice' />;
  },
}));

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  ProTable: ({ columns = [], dataSource = [], rowKey }: any) => {
    const resolveRowKey = (row: any, index: number) => {
      if (typeof rowKey === 'function') return rowKey(row);
      if (typeof rowKey === 'string') return row?.[rowKey];
      return row.key ?? index;
    };

    return (
      <div data-testid='pro-table'>
        {dataSource.map((row: any, rowIndex: number) => (
          <div
            key={resolveRowKey(row, rowIndex)}
            data-testid={`pro-row-${resolveRowKey(row, rowIndex)}`}
          >
            {columns.map((column: any, columnIndex: number) => (
              <span key={column.dataIndex ?? columnIndex}>
                {column.render
                  ? column.render(row[column.dataIndex], row, rowIndex)
                  : toText(row[column.dataIndex])}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

jest.mock('antd', () => {
  const Button = ({ children, icon, loading, onClick, ...props }: any) => (
    <button type='button' data-loading={String(loading)} onClick={onClick} {...props}>
      {icon}
      {toText(children)}
    </button>
  );
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children, title }: any) => (
    <span data-testid='tooltip' data-title={toText(title)}>
      {children}
    </span>
  );
  const Typography = {
    Text: ({ children, type }: any) => (
      <span data-testid={`typography-${type ?? 'default'}`}>{children}</span>
    ),
  };

  return {
    __esModule: true,
    Button,
    Space,
    Tooltip,
    Typography,
  };
});

describe('ProcessLciaResultsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDataSource.mockReturnValue('');
    mockGetLangText.mockImplementation((value: any) => {
      if (typeof value === 'string') return value;
      if (typeof value?.['#text'] === 'string') return value['#text'];
      return '';
    });
    mockGetReferenceQuantityFromMethod.mockResolvedValue(undefined);
    mockGetVerifiedDecompressedMethodEntry.mockResolvedValue(undefined);
    mockIsLcaFunctionInvokeError.mockReturnValue(false);
    mockQueryLcaResults.mockResolvedValue({
      snapshot_id: 'snapshot-1',
      result_id: 'result-1',
      source: 'latest_ready',
      meta: { computed_at: '2026-04-28T00:00:00Z' },
      data: { values: [] },
    });
    mockGetPublishedLciaResultPackage.mockResolvedValue({
      data: {
        publication: null,
        package: null,
        rowCount: 0,
        values: [],
      },
      error: null,
    });
    mockUseLocation.mockReturnValue({ pathname: '/mydata/processes', search: '' });
  });

  it('renders an exact-version catalog unit for a new solver result without a returned unit', async () => {
    mockGetVerifiedDecompressedMethodEntry.mockResolvedValue({
      data: {
        files: [
          {
            id: 'impact-1',
            version: '01.00.000',
            description: { '#text': 'Climate change' },
            referenceQuantity: { 'common:shortDescription': { '#text': 'kg CO2-eq' } },
          },
        ],
      },
    });
    mockQueryLcaResults.mockResolvedValue({
      snapshot_id: 'new-snapshot',
      result_id: 'new-result',
      source: 'latest_ready',
      meta: { computed_at: '2026-10-29T00:00:00Z' },
      data: {
        values: [
          {
            impact_id: 'impact-1',
            impact_version: '01.00.000',
            impact_name: 'LCIA Method impact-1',
            unit: 'unknown',
            value: 0,
          },
        ],
      },
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        lang='en'
        processId='process-1'
        processVersion='01.00.000'
      />,
    );

    await screen.findByText('Climate change');
    await screen.findByText('kg CO2-eq');
    expect(screen.getByTestId('aligned-number')).toHaveTextContent('0');
    expect(mockGetPublishedLciaResultPackage).not.toHaveBeenCalled();
  });

  it('loads published LCIA rows for open-data processes without querying solver', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: {
        publication: { id: 'publication-1' },
        package: { id: 'package-1', version: 3 },
        rowCount: 1,
        values: [
          {
            impact_id: 'impact-1',
            impact_index: 1,
            impact_name: 'Climate change',
            unit: 'kg CO2 eq',
            value: 12.5,
          },
        ],
      },
      error: null,
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() =>
      expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledWith({
        processId: 'process-1',
        processVersion: '1.0',
      }),
    );

    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    await screen.findByText('Climate change');
    expect(screen.queryByText(/source=published_package/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Published result details').closest('[data-testid="tooltip"]'),
    ).toHaveAttribute('data-title', expect.stringContaining('source=published_package'));
    expect(
      screen.getByLabelText('Published result details').closest('[data-testid="tooltip"]'),
    ).toHaveAttribute(
      'data-title',
      expect.stringContaining('publication=publication-1, package=package-1, rows=1'),
    );
    expect(await screen.findByText('Climate change')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('kg CO2 eq')).toBeInTheDocument();
  });

  it.each(['published', 'solver'])(
    'preserves frozen revisions in the %s reader',
    async (reader) => {
      const values = [
        {
          impact_id: 'impact-1',
          impact_version: ' 01.00.000 ',
          impact_name: 'Frozen climate',
          unit: 'frozen kg',
          value: 0,
        },
        {
          impact_id: 'impact-1',
          impact_version: '02.00.000',
          impact_name: 'Second revision',
          unit: 'frozen m3',
          value: -2,
        },
      ];
      if (reader === 'published') {
        mockGetDataSource.mockReturnValue('tg');
        mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
        mockGetPublishedLciaResultPackage.mockResolvedValueOnce({ data: { values }, error: null });
      } else {
        mockQueryLcaResults.mockResolvedValueOnce({ data: { values }, meta: {} });
      }
      render(
        <ProcessLciaResultsPanel
          baseRows={[]}
          lang='en'
          processId='process-1'
          processVersion='1.0'
          enablePublishedPackageReader={reader === 'published'}
        />,
      );
      expect(await screen.findByTestId('pro-row-impact-1@01.00.000')).toHaveTextContent(
        'frozen kg',
      );
      expect(await screen.findByTestId('pro-row-impact-1@02.00.000')).toHaveTextContent(
        'frozen m3',
      );
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('-2')).toBeInTheDocument();
    },
  );

  it('deduplicates published package loads while the current request is pending', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    let resolvePublishedPackage: (value: any) => void = () => {};
    mockGetPublishedLciaResultPackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePublishedPackage = resolve;
        }),
    );

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('lca-profile-summary')).toHaveAttribute('data-loading', 'true'),
    );
    expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePublishedPackage({
        data: {
          publication: null,
          package: null,
          rowCount: 0,
          values: [],
        },
        error: null,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('lca-profile-summary')).toHaveAttribute('data-loading', 'false'),
    );
    expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1);
  });

  it('shows an empty published state without falling back to solver when package has no row values', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: {
        publication: { id: 'publication-1' },
        package: { id: 'package-1' },
        rowCount: 0,
        values: [],
      },
      error: null,
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[
          {
            key: 'legacy-row',
            meanAmount: 99,
            referenceToLCIAMethodDataSet: {
              '@refObjectId': 'legacy-impact',
              'common:shortDescription': { '#text': 'Legacy LCIA' },
            },
          },
        ]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() => expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1));

    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    expect(
      screen.getByText('No published LCIA result rows are available for this process.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Legacy LCIA')).not.toBeInTheDocument();
  });

  it('normalizes sparse published rows and metadata fallbacks', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: {
        publication: { publication_id: ' publication-2 ' },
        package: { result_package_id: ' package-2 ' },
        values: [
          {},
          {
            impact_id: 'impact-2',
            impact_index: undefined,
            impact_name: undefined,
            unit: undefined,
            value: undefined,
          },
          {
            impact_id: 'impact-1',
            impact_index: 1,
            impact_name: 'Water use',
            unit: 'm3',
            value: 2,
          },
        ],
      },
      error: null,
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await screen.findByText('Water use');
    expect(
      screen.queryByText(/publication=publication-2, package=package-2, rows=2/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Published result details').closest('[data-testid="tooltip"]'),
    ).toHaveAttribute(
      'data-title',
      expect.stringContaining('publication=publication-2, package=package-2, rows=2'),
    );
    expect(await screen.findByText('Water use')).toBeInTheDocument();
    expect(await screen.findByText('impact-2')).toBeInTheDocument();
    expect(screen.getByText('m3')).toBeInTheDocument();
    expect(screen.getByTestId('pro-row-impact-1@')).toHaveTextContent('2');
  });

  it('shows an empty published state when package payload omits row values and metadata', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: {
        publication: {},
        package: undefined,
      },
      error: null,
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await screen.findByText('No published LCIA result rows are available for this process.');
    expect(screen.queryByText(/publication=-, package=-, rows=0/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Published result details').closest('[data-testid="tooltip"]'),
    ).toHaveAttribute('data-title', expect.stringContaining('publication=-, package=-, rows=0'));
    expect(
      screen.getByText('No published LCIA result rows are available for this process.'),
    ).toBeInTheDocument();
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
  });

  it('shows published package errors without falling back to solver', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: null,
      error: { message: 'not published' },
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[
          {
            key: 'legacy-row',
            meanAmount: 99,
            referenceToLCIAMethodDataSet: {
              '@refObjectId': 'legacy-impact',
              'common:shortDescription': { '#text': 'Legacy LCIA' },
            },
          },
        ]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() => expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1));

    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    expect(screen.getByText('Published LCIA results are unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('Published result query failed: {message}')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Published result error details').closest('[data-testid="tooltip"]'),
    ).toHaveAttribute('data-title', expect.stringContaining('not published'));
    expect(screen.queryByText('Legacy LCIA')).not.toBeInTheDocument();
  });

  it('uses a default published package error when the backend omits a message', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockResolvedValueOnce({
      data: null,
      error: {},
    });

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() => expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1));

    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    expect(screen.getByText('Published LCIA results are unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('Published result query failed: {message}')).not.toBeInTheDocument();
  });

  it('stringifies non-error published query failures', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });
    mockGetPublishedLciaResultPackage.mockRejectedValueOnce('offline');

    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
        processVersion='1.0'
      />,
    );

    await waitFor(() => expect(mockGetPublishedLciaResultPackage).toHaveBeenCalledTimes(1));

    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    expect(screen.getByText('Published LCIA results are unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('Published result query failed: {message}')).not.toBeInTheDocument();
  });

  it('does not fall back to solver when the public reader is enabled without a process version', async () => {
    mockGetDataSource.mockReturnValue('tg');
    mockUseLocation.mockReturnValue({ pathname: '/tgdata/processes', search: '' });

    render(
      <ProcessLciaResultsPanel
        baseRows={[
          {
            key: 'legacy-row',
            meanAmount: 99,
            referenceToLCIAMethodDataSet: {
              '@refObjectId': 'legacy-impact',
              'common:shortDescription': { '#text': 'Legacy LCIA' },
            },
          },
        ]}
        enablePublishedPackageReader={true}
        lang='en'
        processId='process-1'
      />,
    );

    expect(await screen.findByText('Legacy LCIA')).toBeInTheDocument();
    expect(mockGetPublishedLciaResultPackage).not.toHaveBeenCalled();
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
  });

  it('normalizes missing base rows and queries solver without optional version or scope', async () => {
    mockUseLocation.mockReturnValue({ pathname: undefined, search: '' });

    render(<ProcessLciaResultsPanel baseRows={undefined} lang='en' processId='process-1' />);

    await waitFor(() =>
      expect(mockQueryLcaResults).toHaveBeenCalledWith({
        scope: 'full_library',
        mode: 'process_all_impacts',
        process_id: 'process-1',
        allow_fallback: false,
      }),
    );

    expect(mockGetDataSource).toHaveBeenCalledWith('');
    expect(screen.getByTestId('pro-table')).toBeInTheDocument();
  });

  it('waits and retries when all-unit LCIA calculation is queued', async () => {
    jest.useFakeTimers();
    const queuedError = {
      code: 'all_unit_result_queued',
      body: {
        snapshot_id: 'snapshot-pending',
        solve_job_id: 'lca-job-1',
        solve_worker_job_id: 'worker-job-1',
      },
    };
    mockIsLcaFunctionInvokeError.mockImplementation(
      (error: any) => error?.code === 'all_unit_result_queued',
    );
    mockQueryLcaResults.mockRejectedValueOnce(queuedError).mockResolvedValueOnce({
      snapshot_id: 'snapshot-ready',
      result_id: 'result-ready',
      source: 'all_unit',
      meta: { computed_at: '2026-04-29T00:00:00Z' },
      data: { values: [] },
    });

    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'LCIA results are being calculated (job {jobId}). Retrying automatically...',
        ),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    await waitFor(() => expect(mockQueryLcaResults).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Calculated result details').closest('[data-testid="tooltip"]'),
      ).toHaveAttribute(
        'data-title',
        expect.stringContaining('source=all_unit, snapshot=snapshot-ready, result=result-ready'),
      ),
    );
    jest.useRealTimers();
  });

  it('shows a friendly error when queued all-unit LCIA response lacks identifiers', async () => {
    jest.useFakeTimers();
    const queuedError = {
      code: 'all_unit_result_queued',
      body: {},
    };
    mockIsLcaFunctionInvokeError.mockImplementation(
      (error: any) => error?.code === 'all_unit_result_queued',
    );
    mockQueryLcaResults.mockRejectedValueOnce(queuedError);

    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);

    await waitFor(() =>
      expect(screen.getByText('Result query failed: {message}')).toBeInTheDocument(),
    );

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockQueryLcaResults).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it.each([
    'SNAPSHOT_BUILD_FAILED',
    'SNAPSHOT_BUILD_BLOCKED',
    'SNAPSHOT_BUILD_NOT_PENDING',
    'LCA_REQUEST_TERMINAL',
    'WORKER_REQUEST_NON_RETRYABLE_FAILURE',
  ])('stops polling after %s', async (code) => {
    jest.useFakeTimers();
    const error = Object.assign(new Error(code), { code });
    mockIsLcaFunctionInvokeError.mockImplementation((candidate: any) => candidate?.code === code);
    mockQueryLcaResults.mockRejectedValue(error);
    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);
    await waitFor(() =>
      expect(screen.getByText('Result query failed: {message}')).toBeInTheDocument(),
    );
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockQueryLcaResults).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('does not turn a solver query failure into a calculation-evidence mismatch', async () => {
    mockQueryLcaResults.mockRejectedValueOnce(new Error('unsupported_query_artifact_format'));

    render(
      <ProcessLciaResultsPanel
        baseCalculationEvidence={{ schema_version: 'legacy-static-evidence' }}
        baseRows={[]}
        lang='en'
        processId='process-1'
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Result query failed: {message}')).toBeInTheDocument(),
    );

    expect(screen.queryByTestId('lcia-evidence-notice')).not.toBeInTheDocument();
    expect(mockLcaCalculationEvidenceNotice).not.toHaveBeenCalled();
  });

  it('validates evidence only after a solver result was returned successfully', async () => {
    const calculationEvidence = { schema_version: 'lca.calculation_evidence.v2' };
    mockQueryLcaResults.mockResolvedValueOnce({
      snapshot_id: 'snapshot-ready',
      result_id: 'result-ready',
      source: 'all_unit',
      meta: {
        computed_at: '2026-04-29T00:00:00Z',
        calculation_evidence: calculationEvidence,
      },
      data: { values: [] },
    });

    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);

    await screen.findByTestId('lcia-evidence-notice');
    expect(mockLcaCalculationEvidenceNotice).toHaveBeenLastCalledWith({ calculationEvidence });
  });

  it('keeps successful solver responses without evidence fail closed', async () => {
    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);

    await screen.findByTestId('lcia-evidence-notice');
    expect(mockLcaCalculationEvidenceNotice).toHaveBeenLastCalledWith({
      calculationEvidence: undefined,
    });
  });

  it('still validates static evidence when solver querying is disabled', async () => {
    const staticEvidence = { report: true };
    render(
      <ProcessLciaResultsPanel
        baseCalculationEvidence={staticEvidence}
        baseRows={[]}
        enableSolverRefresh={false}
        lang='en'
      />,
    );

    await screen.findByTestId('lcia-evidence-notice');
    expect(mockLcaCalculationEvidenceNotice).toHaveBeenLastCalledWith({ staticEvidence });
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
  });

  it('skips state updates when base-row enrichment resolves after unmount', async () => {
    let resolveReferenceQuantity: () => void = () => {};
    mockGetReferenceQuantityFromMethod.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReferenceQuantity = resolve;
        }),
    );

    const { unmount } = render(
      <ProcessLciaResultsPanel
        baseRows={[
          {
            key: 'base-row',
            meanAmount: 3,
            referenceToLCIAMethodDataSet: { '@refObjectId': 'impact-1' },
          },
        ]}
        enableSolverRefresh={false}
        lang='en'
      />,
    );

    unmount();

    await act(async () => {
      resolveReferenceQuantity();
    });

    expect(mockGetReferenceQuantityFromMethod).toHaveBeenCalledTimes(1);
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
  });
  it('coalesces refresh while loading and keeps base rows when a refreshed solver payload has no values', async () => {
    let resolve;
    mockQueryLcaResults.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(
      <ProcessLciaResultsPanel
        baseRows={[{ key: 'base-only', meanAmount: 9, referenceToLCIAMethodDataSet: {} }]}
        lang='en'
        processId='process-1'
      />,
    );
    await waitFor(() => expect(mockQueryLcaResults).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Refresh latest calculated results'));
    expect(mockQueryLcaResults).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve({
        snapshot_id: 's',
        result_id: 'r',
        source: 'latest_ready',
        meta: {},
        data: { values: [{}, { impact_id: 'new-impact', impact_index: 1 }] },
      }),
    );
    await screen.findByLabelText('Calculated result details');
    mockQueryLcaResults.mockResolvedValueOnce({
      snapshot_id: 's2',
      result_id: 'r2',
      source: 'latest_ready',
      meta: {},
      data: { values: null },
    });
    fireEvent.click(screen.getByText('Refresh latest calculated results'));
    await waitFor(() => expect(mockQueryLcaResults).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('pro-row-base-only@')).toBeInTheDocument());
  });

  it('retries a queued snapshot and retains fallback rows when its identifiers are incomplete', async () => {
    jest.useFakeTimers();
    mockIsLcaFunctionInvokeError.mockImplementation(
      (error) => error?.code === 'snapshot_build_queued',
    );
    mockQueryLcaResults.mockRejectedValueOnce({
      code: 'snapshot_build_queued',
      body: { build_job_id: ' job ', build_snapshot_id: ' snapshot ' },
    });
    render(<ProcessLciaResultsPanel baseRows={[]} lang='en' processId='process-1' />);
    await screen.findByText('Snapshot is rebuilding (job {jobId}). Retrying automatically...');
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await screen.findByLabelText('Calculated result details');
    mockQueryLcaResults.mockRejectedValueOnce({
      code: 'snapshot_build_queued',
      body: { build_job_id: 3, build_snapshot_id: null },
    });
    fireEvent.click(screen.getByText('Refresh latest calculated results'));
    await screen.findByText('Result query failed: {message}');
    jest.useRealTimers();
  });
  it('defers a manual refresh until base-row enrichment is ready and sends the explicit scope', async () => {
    let resolve;
    mockGetReferenceQuantityFromMethod.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(
      <ProcessLciaResultsPanel
        baseRows={[]}
        lang='en'
        processId='process-1'
        lcaDataScope='current_user'
      />,
    );
    fireEvent.click(screen.getByText('Refresh latest calculated results'));
    expect(mockQueryLcaResults).not.toHaveBeenCalled();
    await act(async () => resolve(undefined));
    await waitFor(() =>
      expect(mockQueryLcaResults).toHaveBeenCalledWith(
        expect.objectContaining({ data_scope: 'current_user' }),
      ),
    );
  });
});
