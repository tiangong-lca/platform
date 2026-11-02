import PublishedResultsPanel from '@/pages/Processes/Components/publishedResultsPanel';
import { FinalResultDetails } from '@/pages/Processes/Components/finalResultsPanel';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mockSource = jest.fn(),
  mockQuery = jest.fn(),
  mockDownload = jest.fn(),
  mockLegacy = jest.fn();
jest.mock('@/services/lcaReleases/finalResults', () => ({
  finalResultLink: () => '#/published-results?synthetic=1',
  sourceFinalResults: (...args: unknown[]) => mockSource(...args),
  queryFinalResult: (...args: unknown[]) => mockQuery(...args),
  finalResultDownload: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock('@/services/lcaReleases/resultQuery', () => ({
  queryPublishedResult: (...args: unknown[]) => mockLegacy(...args),
}));
jest.mock('@/components/LcaReleaseReadPanel', () => ({
  __esModule: true,
  default: () => <div>Legacy downloads</div>,
}));
jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
}));
jest.mock('antd', () => ({
  Tooltip: ({ children }: any) => <span>{children}</span>,
  Select: ({ options, value, onChange, ...props }: any) => (
    <select
      aria-label={props['aria-label']}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Space: ({ children }: any) => <div>{children}</div>,
  Spin: () => <div>loading</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Alert: ({ title, action }: any) => (
    <div>
      {title}
      {action}
    </div>
  ),
  Descriptions: ({ items }: any) => (
    <div>
      {items.map((x: any) => (
        <div key={x.key}>
          {x.label}:{x.children}
        </div>
      ))}
    </div>
  ),
  Tabs: ({ items, onChange }: any) => (
    <div>
      {items.map((x: any) => (
        <button type='button' key={x.key} disabled={x.disabled} onClick={() => onChange(x.key)}>
          {x.label}
        </button>
      ))}
    </div>
  ),
  Input: {
    Search: ({ onSearch }: any) => (
      <input aria-label='search' onChange={(event) => onSearch(event.target.value)} />
    ),
  },
  Collapse: ({ items }: any) => (
    <div>
      {items.map((x: any) => (
        <div key={x.key}>{x.children}</div>
      ))}
    </div>
  ),
  Table: ({ dataSource, columns, rowKey }: any) => (
    <div>
      {dataSource.map((row: any) => (
        <div key={rowKey(row)}>
          {columns.map((column: any, i: number) => (
            <span key={i}>
              {column.title}:{column.render(undefined, row)}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}));
const id = '11111111-1111-4111-8111-111111111111';
const publicationId = '22222222-2222-4222-8222-222222222222';
const runtimeRevision = '33333333-3333-4333-8333-333333333333';
const secondId = '44444444-4444-4444-8444-444444444444';
const props = { id, version: '01.00.000', lang: 'en' };
const result = { uuid: id, version: props.version };
const unit = {
  flowPropertyId: id,
  flowPropertyVersion: props.version,
  unitGroupId: id,
  unitGroupVersion: '02.00.000',
  internalId: '0',
  name: 'frozen kg',
};
const key = {
  flowId: id,
  flowVersion: props.version,
  direction: 'Output',
  location: 'GLO',
  functionType: 'General reminder flow',
  unit,
};
const row = {
  ...result,
  relationKind: 'direct',
  quantitativeReference: {
    ...key,
    flowName: 'Product',
    flowClassification: [],
    value: -2,
    amountField: 'resultingAmount',
  },
};
const page = {
  publication: { publicationId, releaseVersion: '2026.11.1', format: 'final-result-pair.v2' },
  results: [{ ...result, relationKind: 'direct', lciAvailable: true, lciaAvailable: true }],
  nextResultKey: null,
};
function reply(data: unknown) {
  return {
    status: 'ready',
    result: {
      schemaVersion: 'result.query.response.v2',
      publicationId,
      releaseVersion: '2026.11.1',
      runtimeRevision,
      result,
      data,
    },
  };
}
function normalQuery(identity: typeof result, query: { kind: string; cursor?: string | null }) {
  const selected = { ...row, ...identity };
  return Promise.resolve(
    reply(
      query.kind === 'overview'
        ? { result: selected, lciAvailable: true, lciaAvailable: true }
        : query.kind === 'lcia'
          ? {
              result: selected,
              impacts: [
                {
                  method: {
                    id,
                    version: '03.00.001',
                    key: 'climate',
                    name: `Frozen climate ${identity.uuid}`,
                    unit: 'historical kg',
                  },
                  amount: 0,
                },
              ],
            }
          : {
              result: selected,
              items: [
                {
                  key,
                  name: query.cursor ? 'Second flow' : 'Frozen water',
                  classification: [],
                  amount: -1e-20,
                },
              ],
              nextCursor: query.cursor ? null : 'bound-cursor',
              nonzeroCount: 2,
            },
    ),
  );
}
beforeEach(() => {
  mockSource.mockReset().mockResolvedValue({ status: 'ready', page });
  mockQuery.mockReset().mockImplementation(normalQuery);
  mockDownload.mockReset();
  mockLegacy.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it('selects exact direct Results and renders frozen units, zero LCIA, signed LCI and pinned pages', async () => {
  mockSource.mockResolvedValue({
    status: 'ready',
    page: { ...page, results: [...page.results, { ...page.results[0], uuid: secondId }] },
  });
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  expect(screen.getByText('Amount:0', { exact: false })).toBeInTheDocument();
  expect(
    screen.getByText('-2 frozen kg · Product · 01.00.000', { exact: false }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'LCI' }));
  await screen.findByText('Flow:Frozen water');
  expect(screen.getByText('Amount:-1e-20')).toBeInTheDocument();
  expect(screen.getByText('Function type:General reminder flow')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('Flow:Second flow');
  expect(mockQuery.mock.calls.slice(-1)[0][3]).toEqual({ publicationId, runtimeRevision });
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'First page' }));
  await screen.findByText('Flow:Frozen water');
  fireEvent.change(screen.getByRole('textbox', { name: 'search' }), { target: { value: 'water' } });
  await waitFor(() =>
    expect(mockQuery.mock.calls.slice(-1)[0][1]).toEqual({
      kind: 'lci',
      limit: 50,
      cursor: null,
      filter: 'water',
    }),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Select a published result' }), {
    target: { value: `${secondId}@${props.version}` },
  });
  await screen.findByText(`Frozen climate ${secondId}`, { exact: false });
  expect(mockQuery.mock.calls.slice(-1)[0][0]).toEqual({ uuid: secondId, version: props.version });
  expect(mockLegacy).not.toHaveBeenCalled();
});
it('explicitly selects legacy format and pins that publication before any legacy query', async () => {
  mockSource.mockResolvedValue({
    status: 'ready',
    page: {
      ...page,
      publication: { ...page.publication, format: 'legacy-four-zip.v1' },
      results: [],
    },
  });
  mockLegacy.mockResolvedValue({ status: 'unavailable' });
  render(<PublishedResultsPanel {...props} />);
  await waitFor(() => expect(mockLegacy).toHaveBeenCalled());
  expect(mockLegacy.mock.calls[0][3]).toBe(publicationId);
  expect(mockQuery).not.toHaveBeenCalled();
});
it('does not fall back on denied/failed/no-result v2 selection and supports refresh', async () => {
  mockSource
    .mockResolvedValueOnce({ status: 'error' })
    .mockResolvedValueOnce({
      status: 'ready',
      page: { publication: null, results: [], nextResultKey: null },
    })
    .mockResolvedValueOnce({ status: 'unavailable' })
    .mockRejectedValueOnce(new Error('offline'));
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText('Published results could not be loaded. Please retry.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('No published results are available for this exact version.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(mockSource).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Published results could not be loaded. Please retry.');
  expect(mockLegacy).not.toHaveBeenCalled();
  expect(mockQuery).not.toHaveBeenCalled();
});
it('loads later source pages bound to publication and restarts on a changed selection', async () => {
  const afterKey = `${id}@${props.version}`;
  mockSource
    .mockResolvedValueOnce({ status: 'ready', page: { ...page, nextResultKey: afterKey } })
    .mockResolvedValueOnce({
      status: 'ready',
      page: { ...page, results: [{ ...page.results[0], uuid: secondId }] },
    });
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  fireEvent.click(screen.getByRole('button', { name: 'Load more results' }));
  await screen.findByRole('option', { name: `${secondId} · ${props.version}` });
  expect(mockSource.mock.calls[1][2]).toEqual({ publicationId, afterKey });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  mockSource.mockResolvedValueOnce({ status: 'changed' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  await screen.findByText('The publication or result reader changed. Reload the result selection.');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
});
it('missing LCIA selects LCI and displays absence; Derived display never loads sources', async () => {
  mockQuery.mockImplementation(async (identity, query) =>
    query.kind === 'overview'
      ? reply({
          result: { ...row, relationKind: 'derived' },
          lciAvailable: true,
          lciaAvailable: false,
        })
      : reply({
          result: { ...row, relationKind: 'derived' },
          items: [
            {
              key: { ...key, direction: 'Input', location: null, functionType: null },
              name: 'Input flow',
              classification: [],
              amount: -3,
            },
          ],
          nextCursor: null,
          nonzeroCount: 1,
        }),
  );
  render(
    <FinalResultDetails result={result} publicationId={publicationId} onRestart={jest.fn()} />,
  );
  await screen.findByText('Flow:Input flow');
  expect(screen.getByText('Derived result', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('This result has no LCIA data.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'LCIA' })).toBeDisabled();
  expect(mockSource).not.toHaveBeenCalled();
});
it('cold cache retries are bounded and pin runtime across manual retry; unmount cancels timers', async () => {
  jest.useFakeTimers();
  mockQuery.mockResolvedValue({ status: 'preparing', pins: { publicationId, runtimeRevision } });
  const { unmount } = render(
    <FinalResultDetails result={result} publicationId={publicationId} onRestart={jest.fn()} />,
  );
  await act(async () => {});
  for (let n = 0; n < 5; n++)
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
  expect(mockQuery).toHaveBeenCalledTimes(4);
  expect(mockQuery.mock.calls[1][3]).toEqual({ publicationId, runtimeRevision });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async () => {});
  expect(mockQuery).toHaveBeenCalledTimes(5);
  unmount();
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(mockQuery).toHaveBeenCalledTimes(5);
});
it('reader changes or withdrawal hide old values and reselect rather than mixing releases', async () => {
  const restart = jest.fn();
  const { rerender } = render(
    <FinalResultDetails result={result} publicationId={publicationId} onRestart={restart} />,
  );
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  mockQuery.mockResolvedValueOnce({ status: 'changed' });
  fireEvent.click(screen.getByRole('button', { name: 'LCI' }));
  await screen.findByText('The publication or result reader changed. Reload the result selection.');
  expect(screen.queryByText('historical kg')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(restart).toHaveBeenCalledTimes(1);
  mockQuery.mockResolvedValueOnce({ status: 'unavailable' });
  rerender(
    <FinalResultDetails
      key='new'
      result={result}
      publicationId={publicationId}
      onRestart={restart}
    />,
  );
  await screen.findByText('No published results are available for this exact version.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(restart).toHaveBeenCalledTimes(2);
});
it('transport failure permits manual retry without relaxing exact pins', async () => {
  mockQuery.mockRejectedValueOnce(new Error('offline'));
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText('Published results could not be loaded. Please retry.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
});
it('signed ZIP links are refreshed per click, withheld on denied permissions, and never retained', async () => {
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mockDownload
    .mockResolvedValueOnce({
      status: 'ready',
      download: {
        url: 'https://storage.invalid/result.tidas.zip?ephemeral',
        file: { name: 'result.tidas.zip' },
      },
    })
    .mockResolvedValueOnce({ status: 'unavailable' })
    .mockResolvedValueOnce({ status: 'changed' })
    .mockRejectedValueOnce(new Error('offline'));
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  fireEvent.click(screen.getByRole('button', { name: 'Download TIDAS ZIP' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(document.querySelector('a[href*="ephemeral"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Download ILCD ZIP' }));
  await screen.findByText(
    'A complete ZIP is not available for this publication and your access permissions.',
  );
  expect(mockDownload.mock.calls[1].slice(0, 2)).toEqual([publicationId, 'ilcd']);
  fireEvent.click(screen.getByRole('button', { name: 'Download TIDAS ZIP' }));
  await screen.findByText('The download link could not be refreshed. Please retry.');
  fireEvent.click(screen.getByRole('button', { name: 'Download TIDAS ZIP' }));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(4));
  expect(click).toHaveBeenCalledTimes(1);
});
it('source change aborts pending selection and ignores late resolution/rejection', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockSource.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { rerender } = render(<PublishedResultsPanel {...props} />);
  const oldSignal = mockSource.mock.calls[0][1];
  rerender(<PublishedResultsPanel {...props} id={secondId} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolve({ status: 'unavailable' }));
  expect(
    screen.queryByText('No published results are available for this exact version.'),
  ).not.toBeInTheDocument();
});
it('unmount cancels result reads and download links before late completion', async () => {
  let done: (value: unknown) => void = () => {};
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mockDownload.mockImplementation(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  const { unmount } = render(<PublishedResultsPanel {...props} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  fireEvent.click(screen.getByRole('button', { name: 'Download TIDAS ZIP' }));
  const s = mockDownload.mock.calls[0][2];
  unmount();
  expect(s.aborted).toBe(true);
  await act(async () =>
    done({
      status: 'ready',
      download: { url: 'https://storage.invalid/x', file: { name: 'result.tidas.zip' } },
    }),
  );
  expect(click).not.toHaveBeenCalled();
});
it('late reader completion or rejection after result replacement cannot overwrite the new Result', async () => {
  for (const reject of [false, true]) {
    let settle: (value: unknown) => void = () => {};
    mockQuery.mockImplementationOnce(
      () =>
        new Promise((resolve, fail) => {
          settle = reject ? fail : resolve;
        }),
    );
    const { rerender, unmount } = render(
      <FinalResultDetails
        key='old'
        result={result}
        publicationId={publicationId}
        onRestart={jest.fn()}
      />,
    );
    const oldSignal = mockQuery.mock.calls.slice(-1)[0][2];
    rerender(
      <FinalResultDetails
        key='new'
        result={{ ...result, uuid: secondId }}
        publicationId={publicationId}
        onRestart={jest.fn()}
      />,
    );
    await screen.findByText(`Frozen climate ${secondId}`, { exact: false });
    expect(oldSignal.aborted).toBe(true);
    await act(async () =>
      settle(
        reject
          ? new Error('late failure')
          : reply({ result: row, lciAvailable: true, lciaAvailable: true }),
      ),
    );
    expect(screen.getByText(`Frozen climate ${secondId}`, { exact: false })).toBeInTheDocument();
    expect(
      screen.queryByText('Published results could not be loaded. Please retry.'),
    ).not.toBeInTheDocument();
    unmount();
  }
});
it('late source and download failures after closing are ignored', async () => {
  let rejectSource: (error: unknown) => void = () => {};
  mockSource.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSource = reject;
      }),
  );
  const first = render(<PublishedResultsPanel {...props} />);
  const sourceSignal = mockSource.mock.calls.slice(-1)[0][1];
  first.unmount();
  expect(sourceSignal.aborted).toBe(true);
  await act(async () => rejectSource(new Error('late source failure')));
  let rejectDownload: (error: unknown) => void = () => {};
  mockDownload.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectDownload = reject;
      }),
  );
  const second = render(<PublishedResultsPanel {...props} />);
  await screen.findByText(`Frozen climate ${id}`, { exact: false });
  fireEvent.click(screen.getByRole('button', { name: 'Download ILCD ZIP' }));
  second.unmount();
  await act(async () => rejectDownload(new Error('late download failure')));
  expect(
    screen.queryByText('The download link could not be refreshed. Please retry.'),
  ).not.toBeInTheDocument();
});
