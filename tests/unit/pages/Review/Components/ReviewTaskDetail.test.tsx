// @ts-nocheck
import ReviewTaskDetail from '@/pages/Review/Components/ReviewTaskDetail';
import { render, screen } from '../../../../helpers/testUtils';

const baseRecord = {
  id: 'review-1',
  name: 'Review task',
};

describe('ReviewTaskDetail', () => {
  it('shows a non-clickable name and the adjacent data-view icon', () => {
    render(
      <ReviewTaskDetail
        record={baseRecord as any}
        dataView={<button aria-label='View data' type='button' />}
      />,
    );

    expect(screen.getByText('Review task')).toHaveStyle({
      minWidth: 0,
      overflowWrap: 'anywhere',
    });
    expect(screen.getByText('Review task').parentElement).toHaveStyle({
      display: 'inline-flex',
      maxWidth: '100%',
    });
    expect(screen.getByRole('button', { name: 'View data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows only the name when data is not readable', () => {
    render(<ReviewTaskDetail record={baseRecord as any} />);

    expect(screen.getByText('Review task')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
