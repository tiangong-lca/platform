import { FinalResultDetails } from '@/pages/Processes/Components/finalResultsPanel';
import { parseFinalResultLink } from '@/services/lcaReleases/finalResults';
import { Alert, Card } from 'antd';
import { useState } from 'react';
import { useIntl, useLocation } from 'umi';

/** Exact final Result entry, independent of source-process visibility or table membership. */
export default function PublishedResultPage() {
  const { search } = useLocation();
  const intl = useIntl();
  const [revision, setRevision] = useState(0);
  const link = parseFinalResultLink(search);
  if (!link)
    return (
      <Alert
        type='error'
        title={intl.formatMessage({
          id: 'pages.publishedResults.invalidLink',
          defaultMessage: 'This result link is incomplete or invalid.',
        })}
      />
    );
  return (
    <Card
      title={intl.formatMessage({
        id: 'pages.publishedResults.title',
        defaultMessage: 'Published results',
      })}
    >
      <FinalResultDetails
        key={`${search}/${revision}`}
        result={link.result}
        publicationId={link.publicationId}
        onRestart={() => setRevision((v) => v + 1)}
      />
    </Card>
  );
}
