import { useAntdAppApi } from '@/contexts/AntdAppContext';
import { fetchPackageReport, getTidasPackageJobApi } from '@/services/general/api';
import { buildDownloadableImportReport } from './reportContent';
import { DownloadOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';

/** Resolve a fresh signed URL only when the user requests a report. */
export default function TidasImportResult({
  jobId,
  reportAvailable,
}: {
  jobId: string;
  reportAvailable?: boolean;
}) {
  const intl = useIntl();
  const { message } = useAntdAppApi();
  const [loading, setLoading] = useState(false);
  const requestGeneration = useRef(0);
  const activeDownload = useRef<AbortController | null>(null);
  useEffect(() => {
    setLoading(false);
    return () => {
      requestGeneration.current += 1;
      activeDownload.current?.abort();
    };
  }, [jobId]);
  const download = async () => {
    const generation = requestGeneration.current;
    const controller = new AbortController();
    activeDownload.current = controller;
    setLoading(true);
    try {
      const result = await getTidasPackageJobApi(jobId);
      if (generation !== requestGeneration.current) return;
      const artifact = result.data?.artifacts_by_kind.import_report;
      if (result.error || !result.data?.ok || !artifact?.signed_download_url)
        throw new Error('report_unavailable');
      const report = await fetchPackageReport<unknown>(artifact, controller.signal);
      if (generation !== requestGeneration.current) return;
      const downloadable = buildDownloadableImportReport(report, jobId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(downloadable, null, 2)], {
          type: 'application/json;charset=utf-8',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `tidas-import-report-${jobId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      if (generation === requestGeneration.current) {
        message.warning(
          intl.formatMessage({
            id: 'component.tidasPackage.import.result.unavailable',
            defaultMessage:
              'Unable to load the latest result. This does not mean the import failed.',
          }),
        );
      }
    } finally {
      if (activeDownload.current === controller) activeDownload.current = null;
      if (generation === requestGeneration.current) setLoading(false);
    }
  };
  const label = intl.formatMessage({
    id: 'component.tidasPackage.import.result.report',
    defaultMessage: 'Download report',
  });
  return (
    <Tooltip title={label}>
      <Button
        aria-label={label}
        icon={<DownloadOutlined />}
        loading={loading}
        disabled={loading || reportAvailable === false}
        size='small'
        type='text'
        onClick={() => {
          void download();
        }}
      />
    </Tooltip>
  );
}
