import DataTransfer from '@/pages/DataTransfer';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../helpers/testUtils';
const mockCatalog = jest.fn();
const mockHistory = jest.fn();
const mockRole = jest.fn();
const mockDownload = jest.fn();
const mockSubmit = jest.fn();
const mockMessage = { success: jest.fn(), error: jest.fn() };
jest.mock('@/components/ImportTidasPackage', () => () => <div>Importer</div>);
jest.mock('@/contexts/AntdAppContext', () => ({ useAntdAppApi: () => ({ message: mockMessage }) }));
jest.mock('@/services/roles/api', () => ({
  getSystemUserRoleApi: () => mockRole(),
}));
jest.mock('@/services/tidasPackage/taskCenter', () => ({
  submitTidasPackageExportTask: (...args: unknown[]) => mockSubmit(...args),
}));
jest.mock('@/services/lcaReleases/finalResults', () => ({
  currentFinalPublication: (...args: unknown[]) => mockCatalog(...args),
  finalPublicationHistory: (...args: unknown[]) => mockHistory(...args),
  finalResultDownload: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock('umi', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }, values?: { format?: string }) =>
      id === 'component.dataTransfer.archiveLabel' ? `${values?.format} 7z` : id,
  }),
}));
jest.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
const publication = {
  publicationId: '22222222-2222-4222-8222-222222222222',
  releaseVersion: '2026.11.1',
  format: 'final-result-pair.v2',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSubmit.mockReset();
  mockRole.mockResolvedValue({ role: 'member' });
  mockHistory.mockResolvedValue({ status: 'ready', page: { publications: [], nextCursor: null } });
  mockCatalog.mockResolvedValue({ status: 'ready', publication });
  mockDownload.mockResolvedValue({ status: 'unavailable' });
});
it('shows catalog and pins downloads without submitting a bulk export job', async () => {
  renderWithProviders(<DataTransfer />);
  await screen.findByText(/2026.11.1/);
  fireEvent.click(screen.getByRole('button', { name: 'download TIDAS 7z' }));
  await waitFor(() =>
    expect(mockDownload).toHaveBeenCalledWith(
      publication.publicationId,
      'tidas',
      expect.any(AbortSignal),
    ),
  );
  expect(mockSubmit).not.toHaveBeenCalled();
  await waitFor(() => expect(mockMessage.error).toHaveBeenCalled());
});
it('distinguishes an empty catalog from a request error', async () => {
  mockCatalog
    .mockResolvedValueOnce({ status: 'ready', publication: null })
    .mockResolvedValueOnce({ status: 'error' });
  renderWithProviders(<DataTransfer />);
  await screen.findByText('component.dataTransfer.noRelease');
  expect(screen.queryByRole('button', { name: 'download TIDAS 7z' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'component.dataTransfer.refresh' }));
  await screen.findByText('component.dataTransfer.error');
  expect(screen.queryByText('component.dataTransfer.noRelease')).not.toBeInTheDocument();
});
it('aborts stale catalog reads and ignores a late reply after refresh', async () => {
  let resolveOld: (value: unknown) => void = () => {};
  mockCatalog
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce({ status: 'ready', publication: null });
  const view = renderWithProviders(<DataTransfer />);
  fireEvent.click(screen.getByRole('button', { name: 'component.dataTransfer.refresh' }));
  await screen.findByText('component.dataTransfer.noRelease');
  expect(mockCatalog.mock.calls[0][0].aborted).toBe(true);
  await act(async () => resolveOld({ status: 'ready', publication }));
  expect(screen.queryByText(/2026.11.1/)).not.toBeInTheDocument();
  view.unmount();
  expect(mockCatalog.mock.calls[1][0].aborted).toBe(true);
});
it('refresh cancels signing and does not leave download controls stuck', async () => {
  mockDownload.mockImplementationOnce(() => new Promise(() => {}));
  renderWithProviders(<DataTransfer />);
  const button = await screen.findByRole('button', { name: 'download TIDAS 7z' });
  fireEvent.click(button);
  await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'component.dataTransfer.refresh' }));
  await waitFor(() => expect(mockCatalog).toHaveBeenCalledTimes(2));
  expect(mockDownload.mock.calls[0][2].aborted).toBe(true);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'download TIDAS 7z' })).toBeEnabled(),
  );
});

it('hides the public export card for an ordinary member', async () => {
  renderWithProviders(<DataTransfer />);
  await screen.findByText(/2026.11.1/);
  expect(screen.queryByText('component.dataTransfer.publicData')).not.toBeInTheDocument();
  expect(
    screen.getAllByRole('button', { name: 'download component.dataTransfer.exportTidas' }),
  ).toHaveLength(1);
});
it.each(['admin', 'owner'])('retains public export for the %s role', async (role) => {
  mockRole.mockResolvedValue({ role });
  renderWithProviders(<DataTransfer />);
  await screen.findByText('component.dataTransfer.publicData');
  const buttons = screen.getAllByRole('button', {
    name: 'download component.dataTransfer.exportTidas',
  });
  fireEvent.click(buttons[1]);
  expect(mockSubmit).toHaveBeenCalledWith({ scope: 'open_data' });
});

const oldId = '33333333-3333-4333-8333-333333333333';
const oldRelease = {
  publicationId: oldId,
  releaseVersion: '2026.10.0',
  publishedAt: '2026-10-01T00:00:00Z',
  status: 'superseded',
  formats: ['ilcd'],
};
it('loads history only when expanded and pins its download independently of current', async () => {
  mockHistory.mockResolvedValue({
    status: 'ready',
    page: {
      publications: [oldRelease],
      nextCursor: null,
    },
  });
  renderWithProviders(<DataTransfer />);
  await screen.findByText(/2026.11.1/);
  expect(mockHistory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('component.dataTransfer.history'));
  await screen.findByText('2026.10.0');
  expect(screen.queryByText('component.dataTransfer.withdrawn')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'download ILCD 7z' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'download ILCD 7z' })[1]);
  await waitFor(() =>
    expect(mockDownload).toHaveBeenCalledWith(oldId, 'ilcd', expect.any(AbortSignal)),
  );
});
it('retries a failed history continuation without losing the existing page', async () => {
  const next = { publishedAt: oldRelease.publishedAt, publicationId: oldId };
  mockHistory
    .mockResolvedValueOnce({
      status: 'ready',
      page: { publications: [oldRelease], nextCursor: next },
    })
    .mockResolvedValueOnce({ status: 'error' })
    .mockResolvedValueOnce({
      status: 'ready',
      page: {
        publications: [
          {
            ...oldRelease,
            publicationId: '44444444-4444-4444-8444-444444444444',
            releaseVersion: '2026.9.0',
          },
        ],
        nextCursor: null,
      },
    });
  renderWithProviders(<DataTransfer />);
  fireEvent.click(screen.getByText('component.dataTransfer.history'));
  fireEvent.click(await screen.findByText('component.dataTransfer.moreHistory'));
  await screen.findByText('component.dataTransfer.historyError');
  expect(screen.getByText('2026.10.0')).toBeInTheDocument();
  fireEvent.click(screen.getByText('component.dataTransfer.retry'));
  await screen.findByText('2026.9.0');
  expect(mockHistory).toHaveBeenLastCalledWith(expect.any(AbortSignal), next);
});
it('refresh cancels history loading and ignores stale results', async () => {
  let resolveOld: (value: unknown) => void = () => {};
  mockHistory.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  renderWithProviders(<DataTransfer />);
  fireEvent.click(screen.getByText('component.dataTransfer.history'));
  await waitFor(() => expect(mockHistory).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'component.dataTransfer.refresh' }));
  expect(mockHistory.mock.calls[0][0].aborted).toBe(true);
  await act(async () =>
    resolveOld({ status: 'ready', page: { publications: [oldRelease], nextCursor: null } }),
  );
  expect(screen.queryByText('2026.10.0')).not.toBeInTheDocument();
});

it('reports rejected configuration reads and export submission errors', async () => {
  mockCatalog.mockRejectedValueOnce(new Error('offline'));
  mockRole.mockRejectedValueOnce(new Error('offline'));
  mockSubmit.mockImplementationOnce(() => {
    throw new Error('submission failed');
  });
  renderWithProviders(<DataTransfer />);
  await screen.findByText('component.dataTransfer.error');
  expect(screen.queryByText('component.dataTransfer.publicData')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'download component.dataTransfer.exportTidas' }),
  );
  expect(mockSubmit).toHaveBeenCalledWith({ scope: 'current_user' });
  expect(mockMessage.error).toHaveBeenCalledWith('component.dataTransfer.error');
  fireEvent.click(screen.getByRole('tab', { name: 'component.dataTransfer.import' }));
  expect(await screen.findByText('Importer')).toBeInTheDocument();
});
it('downloads the signed exact archive and removes the temporary anchor', async () => {
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.href).toBe('https://download.example/result.7z');
    expect(this.download).toBe('result.tidas.7z');
    expect(document.body.contains(this)).toBe(true);
  });
  mockDownload.mockResolvedValueOnce({
    status: 'ready',
    download: { url: 'https://download.example/result.7z', file: { name: 'result.tidas.7z' } },
  });
  renderWithProviders(<DataTransfer />);
  fireEvent.click(await screen.findByRole('button', { name: 'download TIDAS 7z' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(document.querySelector('a[download]')).toBeNull();
  click.mockRestore();
});
it('does not start a stale download when signing completes after unmount', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockDownload.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const view = renderWithProviders(<DataTransfer />);
  fireEvent.click(await screen.findByRole('button', { name: 'download TIDAS 7z' }));
  view.unmount();
  await act(async () =>
    resolve({
      status: 'ready',
      download: { url: 'https://download.example/result.7z', file: { name: 'result.7z' } },
    }),
  );
  expect(mockDownload.mock.calls[0][2].aborted).toBe(true);
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});
