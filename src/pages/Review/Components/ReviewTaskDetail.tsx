import type { ReviewsTable } from '@/services/reviews/data';

type ReviewTaskDetailProps = {
  record: ReviewsTable;
  dataView?: React.ReactNode;
};

const ReviewTaskDetail = ({ record, dataView }: ReviewTaskDetailProps) => {
  return (
    <span
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 4,
        maxWidth: '100%',
      }}
    >
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{record.name}</span>
      {dataView}
    </span>
  );
};

export default ReviewTaskDetail;
