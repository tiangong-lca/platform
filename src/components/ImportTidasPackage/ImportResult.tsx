import {
  getTidasPackageJobApi,
  normalizeBrowserAccessiblePackageUrl,
} from '@/services/general/api';
import { Button, Flex, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';

type ReportKind = 'import_report' | 'import_details';

/** Resolve a fresh signed URL only when the user requests a report. */
export default function TidasImportResult({
  jobId,
  reportAvailable,
  detailsAvailable,
}: {
  jobId: string;
  reportAvailable?: boolean;
  detailsAvailable?: boolean;
}) {
  const intl = useIntl();
  const [loading, setLoading] = useState<ReportKind>();
  const [failed, setFailed] = useState(false);
  const requestGeneration = useRef(0);
  useEffect(() => {
    setLoading(undefined);
    setFailed(false);
    return () => {
      requestGeneration.current += 1;
    };
  }, [jobId]);
  const download = async (kind: ReportKind) => {
    const generation = requestGeneration.current;
    setLoading(kind);
    setFailed(false);
    try {
      const result = await getTidasPackageJobApi(jobId);
      if (generation !== requestGeneration.current) return;
      const artifact = result.data?.artifacts_by_kind[kind];
      if (result.error || !result.data?.ok || !artifact?.signed_download_url)
        throw new Error('report_unavailable');
      // Let the browser stream the download instead of buffering a large details ZIP in JS.
      const link = document.createElement('a');
      link.href = normalizeBrowserAccessiblePackageUrl(artifact.signed_download_url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      if (generation === requestGeneration.current) setFailed(true);
    } finally {
      if (generation === requestGeneration.current) setLoading(undefined);
    }
  };
  return (
    <Flex vertical gap='small'>
      <Flex gap='small' wrap>
        {(['import_report', 'import_details'] as const).map((kind) => (
          <Button
            key={kind}
            size='small'
            loading={loading === kind}
            disabled={
              Boolean(loading) ||
              (kind === 'import_report' ? reportAvailable : detailsAvailable) === false
            }
            onClick={() => {
              void download(kind);
            }}
          >
            {kind === 'import_details'
              ? intl.formatMessage({
                  id: 'component.tidasPackage.import.result.details',
                  defaultMessage: 'Download complete details',
                })
              : intl.formatMessage({
                  id: 'component.tidasPackage.import.result.report',
                  defaultMessage: 'Download report',
                })}
          </Button>
        ))}
      </Flex>
      {failed && (
        <Typography.Text type='warning'>
          {intl.formatMessage({
            id: 'component.tidasPackage.import.result.unavailable',
            defaultMessage:
              'Unable to load the latest result. This does not mean the import failed.',
          })}
        </Typography.Text>
      )}
    </Flex>
  );
}
