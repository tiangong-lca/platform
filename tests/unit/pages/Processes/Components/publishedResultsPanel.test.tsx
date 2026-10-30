import PublishedResultsPanel from '@/pages/Processes/Components/publishedResultsPanel';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mockQuery = jest.fn();
jest.mock('@/services/lcaReleases/resultQuery', () => ({
  queryPublishedResult: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/services/general/util', () => ({ getLangText: () => 'Localized frozen flow' }));
jest.mock('@/components/LcaReleaseReadPanel', () => ({
  __esModule: true,
  default: (props: { releaseRunId: string }) => <div>download:{props.releaseRunId}</div>,
}));
jest.mock('umi', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) => defaultMessage,
  }),
}));
jest.mock('antd', () => ({
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
const props = { id, version: '01.00.000', lang: 'en' };
const source = { id, version: props.version };
const process = {
  ...source,
  quantitativeReference: { flow: source, meanAmount: 2, referenceUnit: 'frozen kg' },
};
const result = (data: unknown) => ({
  status: 'ready',
  result: {
    source,
    publicationId: 'pub',
    artifactId: 'artifact',
    publication: { releaseRunId: 'release', releaseVersion: props.version, publishedAt: 'today' },
    data,
  },
});
const overview = () => result({ process, lciAvailable: true, lciaAvailable: true });
const lcia = () =>
  result({
    process,
    impacts: [
      { method: { ...source, name: 'Frozen climate', unit: 'frozen impact kg' }, amount: -1e-20 },
    ],
  });
const lci = (nextCursor: string | null = null) =>
  result({
    process,
    items: [
      {
        key: {
          flowId: id,
          flowVersion: props.version,
          direction: 'Input',
          unit: 'g',
          location: null,
        },
        name: 'Frozen flow',
        amount: -3,
      },
      {
        key: {
          flowId: id,
          flowVersion: props.version,
          direction: 'Output',
          unit: 'kg',
          location: 'GLO',
        },
        name: [],
        amount: 1e-20,
      },
    ],
    nextCursor,
    nonzeroCount: 2,
  });
beforeEach(() => {
  mockQuery.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});
it('pins a release, renders frozen signed values, switches to LCI, pages and resets search', async () => {
  mockQuery
    .mockResolvedValueOnce(overview())
    .mockResolvedValueOnce(lcia())
    .mockResolvedValueOnce(lci('next'))
    .mockResolvedValueOnce(lci())
    .mockResolvedValueOnce(lci('next'))
    .mockResolvedValue(lci());
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(/Frozen climate/);
  expect(screen.getByText(/Amount:-1e-20/)).toBeInTheDocument();
  expect(screen.getByText(/2 frozen kg/)).toBeInTheDocument();
  expect(screen.getByText('download:release')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'LCI' }));
  await screen.findByText(/Frozen flow/);
  expect(screen.getByText(/Localized frozen flow/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled());
  expect(mockQuery.mock.calls[mockQuery.mock.calls.length - 1]?.[1]).toMatchObject({
    kind: 'lci',
    cursor: 'next',
  });
  fireEvent.click(screen.getByRole('button', { name: 'First page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled());
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'water' } });
  await waitFor(() =>
    expect(mockQuery.mock.calls[mockQuery.mock.calls.length - 1]?.[1]).toMatchObject({
      filter: 'water',
      cursor: null,
    }),
  );
  expect(mockQuery.mock.calls.slice(1).every((call) => call[3] === 'pub')).toBe(true);
});
it('selects LCI when this completed artifact has no LCIA', async () => {
  mockQuery
    .mockResolvedValueOnce(result({ process, lciAvailable: true, lciaAvailable: false }))
    .mockResolvedValue(lci());
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(/Frozen flow/);
  expect(screen.getByRole('button', { name: 'LCIA' })).toBeDisabled();
});
it('shows denial/error separately and permits an explicit retry', async () => {
  mockQuery
    .mockResolvedValueOnce({ status: 'unavailable' })
    .mockResolvedValueOnce({ status: 'error' })
    .mockRejectedValueOnce(new Error('transport'))
    .mockResolvedValueOnce(overview())
    .mockResolvedValue(lcia());
  render(<PublishedResultsPanel {...props} />);
  await screen.findByText(/No published results/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(/could not be loaded/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(/could not be loaded/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(/Frozen climate/);
});
it('bounds cold preparation and preserves its publication across explicit retry', async () => {
  jest.useFakeTimers();
  mockQuery.mockResolvedValue({ status: 'preparing', publicationId: 'cold-pub' });
  render(<PublishedResultsPanel {...props} />);
  await act(async () => {});
  for (let i = 0; i < 5; i++)
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
  expect(mockQuery).toHaveBeenCalledTimes(4);
  expect(screen.getByText(/Preparing published results/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async () => {});
  expect(mockQuery.mock.calls[4][3]).toBe('cold-pub');
});
it('aborts old identity and rejects both late success and late rejection', async () => {
  let resolve!: (value: unknown) => void;
  let reject!: (value: unknown) => void;
  mockQuery
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((_r, j) => {
          reject = j;
        }),
    )
    .mockResolvedValue({ status: 'unavailable' });
  const view = render(<PublishedResultsPanel {...props} />);
  const oldSignal = mockQuery.mock.calls[0][2];
  view.rerender(<PublishedResultsPanel {...props} version='02.00.000' />);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => {
    resolve(overview());
  });
  expect(screen.queryByText(/Reference quantity/)).not.toBeInTheDocument();
  view.rerender(<PublishedResultsPanel {...props} version='03.00.000' />);
  await act(async () => {
    reject(new Error('old'));
  });
  await screen.findByText(/No published results/);
});
it('clears cold retry timer on close', async () => {
  jest.useFakeTimers();
  mockQuery.mockResolvedValue({ status: 'preparing', publicationId: 'pub' });
  const view = render(<PublishedResultsPanel {...props} />);
  await act(async () => {});
  view.unmount();
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(mockQuery).toHaveBeenCalledTimes(1);
});
