import Filter, { datasetKindMessage } from '@/components/DatasetKindFilter';
import { fireEvent, render, screen } from '@testing-library/react';
jest.mock('umi', () => ({
  useIntl: () => ({ formatMessage: ({ defaultMessage }: any) => defaultMessage }),
}));
jest.mock('antd', () => ({
  Select: ({ options, onChange, value, disabled, ...props }: any) => (
    <select
      aria-label={props['aria-label']}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
jest.mock('@/services/datasetDisplay/api', () => ({
  DATASET_KINDS: [
    'lifecyclemodel',
    'process',
    'flow',
    'flowproperty',
    'unitgroup',
    'source',
    'contact',
  ],
}));
describe('seven-kind filter', () => {
  it('provides all plus seven supported kinds, with no LCIA or ILCD and preserves selection', () => {
    const onChange = jest.fn();
    const view = render(<Filter value='all' onChange={onChange} />);
    expect(screen.getAllByRole('option')).toHaveLength(8);
    expect(screen.getByRole('option', { name: 'Life cycle model' })).toHaveValue('lifecyclemodel');
    expect(screen.queryByText('LCIA')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'flowproperty' } });
    expect(onChange).toHaveBeenCalledWith('flowproperty');
    view.rerender(<Filter value='flowproperty' onChange={onChange} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(datasetKindMessage('contact').id).toBe('pages.validationIssues.datasetType.contact');
  });
});
