import OpenDataCatalogFilters from '@/components/OpenDataCatalogFilters';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@ant-design/icons', () => ({
  AppstoreOutlined: () => <span data-testid='source-icon-all' />,
  BankOutlined: () => <span data-testid='source-icon-enterprise' />,
  FileTextOutlined: () => <span data-testid='source-icon-literature' />,
}));

jest.mock('umi', () => ({
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: { defaultMessage?: string; id: string }) =>
      defaultMessage ?? id,
  }),
}));

jest.mock('antd', () => ({
  Button: ({ children, icon, ...props }: any) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Select: ({ options, onChange, ...props }: any) => (
    <select {...props} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: { label: string; value: string }) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Space: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children, title }: any) => <span data-tooltip-title={title}>{children}</span>,
}));

describe('OpenDataCatalogFilters', () => {
  it('cycles all, enterprise, and literature sources without URL state', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <OpenDataCatalogFilters
        value={{ sourceFilter: 'all', publicationFilter: 'all' }}
        onChange={onChange}
      />,
    );
    const allButton = screen.getByRole('button', { name: 'All data' });
    expect(allButton).toHaveAttribute('type', 'text');
    expect(allButton).toHaveClass('tg-pro-toolbar-button--option');
    expect(allButton.closest('.tg-open-data-catalog-source-filter')).toBeInTheDocument();
    expect(screen.getByTestId('source-icon-all')).toBeInTheDocument();
    expect(allButton.parentElement).toHaveAttribute('data-tooltip-title', 'All data');
    fireEvent.click(allButton);
    expect(onChange).toHaveBeenCalledWith({ sourceFilter: 'enterprise', publicationFilter: 'all' });

    rerender(
      <OpenDataCatalogFilters
        value={{ sourceFilter: 'enterprise', publicationFilter: 'all' }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('source-icon-enterprise')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enterprise data' }));
    expect(onChange).toHaveBeenCalledWith({ sourceFilter: 'literature', publicationFilter: 'all' });

    rerender(
      <OpenDataCatalogFilters
        value={{ sourceFilter: 'literature', publicationFilter: 'all' }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('source-icon-literature')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Literature data' }));
    expect(onChange).toHaveBeenCalledWith({ sourceFilter: 'all', publicationFilter: 'all' });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('defaults to all sources and hides publication controls', () => {
    render(<OpenDataCatalogFilters onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'All data' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
