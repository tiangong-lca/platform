import { Button } from 'antd';
import { FormattedMessage } from 'umi';

export type DetailReadProblem = 'unavailable' | 'failed';

export default function DatasetDetailFeedback({
  problem,
  id,
  version,
  onRetry,
}: {
  problem: DetailReadProblem;
  id: string;
  version: string;
  onRetry: () => void;
}) {
  return (
    <div role='alert' style={{ padding: 24 }}>
      <p>
        {problem === 'unavailable' ? (
          <FormattedMessage
            id='pages.datasetDetail.unavailable'
            defaultMessage='This version is unavailable.'
          />
        ) : (
          <FormattedMessage
            id='pages.datasetDetail.failed'
            defaultMessage='Failed to load this version.'
          />
        )}
      </p>
      <p>
        UUID <code>{id}</code>
      </p>
      <p>
        <FormattedMessage id='pages.version' defaultMessage='Version' /> <code>{version}</code>
      </p>
      {problem === 'failed' && (
        <Button onClick={onRetry}>
          <FormattedMessage id='pages.datasetDetail.retry' defaultMessage='Retry' />
        </Button>
      )}
    </div>
  );
}
