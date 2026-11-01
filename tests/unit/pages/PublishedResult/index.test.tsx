import PublishedResultPage from '@/pages/PublishedResult';
import { fireEvent, render, screen } from '@testing-library/react';
const mockParse = jest.fn();
let mockSearch = '?exact-result';
jest.mock('@/services/lcaReleases/finalResults', () => ({
  parseFinalResultLink: (search: string) => mockParse(search),
}));
jest.mock('@/pages/Processes/Components/finalResultsPanel', () => ({
  FinalResultDetails: ({ result, publicationId, onRestart }: any) => (
    <div>
      {result.uuid}@{result.version}/{publicationId}
      <button type='button' onClick={onRestart}>
        Reload reader
      </button>
    </div>
  ),
}));
jest.mock('umi', () => ({
  useLocation: () => ({ search: mockSearch }),
  useIntl: () => ({ formatMessage: ({ defaultMessage }: any) => defaultMessage }),
}));
jest.mock('antd', () => ({
  Alert: ({ title }: any) => <div>{title}</div>,
  Card: ({ title, children }: any) => (
    <div>
      {title}
      {children}
    </div>
  ),
}));
it('refuses incomplete exact Result links before rendering a reader', () => {
  mockParse.mockReturnValue(null);
  render(<PublishedResultPage />);
  expect(screen.getByText('This result link is incomplete or invalid.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('opens exact Derived-capable details independently and supports runtime reload and link changes', () => {
  mockParse.mockReturnValue({
    result: { uuid: 'result-C', version: '01.00.000' },
    publicationId: 'publication',
  });
  const { rerender } = render(<PublishedResultPage />);
  expect(mockParse).toHaveBeenCalledWith('?exact-result');
  expect(screen.getByText('result-C@01.00.000/publication')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload reader' }));
  expect(screen.getByText('result-C@01.00.000/publication')).toBeInTheDocument();
  mockSearch = '?next-result';
  mockParse.mockReturnValue({
    result: { uuid: 'result-D', version: '02.00.000' },
    publicationId: 'other',
  });
  rerender(<PublishedResultPage />);
  expect(screen.getByText('result-D@02.00.000/other')).toBeInTheDocument();
  expect(screen.queryByText('result-C@01.00.000/publication')).not.toBeInTheDocument();
});
