import styles from './index.less';
import {
  finalPublicationHistory,
  type PublicationHistoryCursor,
  type PublicationHistoryPage,
} from '@/services/lcaReleases/finalResults';
import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';

type Props = { downloading?: string; onDownload: (id: string, format: 'tidas' | 'ilcd') => void };
export default function PublicationHistory({ downloading, onDownload }: Props) {
  const intl = useIntl();
  const [rows, setRows] = useState<PublicationHistoryPage['publications']>([]);
  const [cursor, setCursor] = useState<PublicationHistoryCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const load = useCallback(async (before?: PublicationHistoryCursor) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(false);
    try {
      const reply = await finalPublicationHistory(request.signal, before);
      if (request.signal.aborted) return;
      if (reply.status !== 'ready') throw new Error('History unavailable');
      setRows((old) =>
        before
          ? [
              ...old,
              ...reply.page.publications.filter(
                (row) => !old.some((p) => p.publicationId === row.publicationId),
              ),
            ]
          : reply.page.publications,
      );
      setCursor(reply.page.nextCursor);
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  return (
    <Space orientation='vertical' size={0} style={{ width: '100%' }}>
      {rows.map((row) => (
        <div key={row.publicationId} className={styles.historyRow}>
          <div className={styles.historyIdentity}>
            <Typography.Text strong>{row.releaseVersion}</Typography.Text>
            <Typography.Text type='secondary'>
              {new Intl.DateTimeFormat(intl.locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(new Date(row.publishedAt))}
            </Typography.Text>
          </div>
          {row.formats.length ? (
            <Space size={4} wrap>
              {row.formats.map((format) => (
                <Button
                  key={format}
                  type='text'
                  size='small'
                  className={styles.archiveAction}
                  icon={<DownloadOutlined />}
                  loading={downloading === `${row.publicationId}:${format}`}
                  disabled={!!downloading}
                  onClick={() => onDownload(row.publicationId, format)}
                >
                  {intl.formatMessage(
                    { id: 'component.dataTransfer.archiveLabel' },
                    { format: format.toUpperCase() },
                  )}
                </Button>
              ))}
            </Space>
          ) : (
            <Typography.Text type='secondary'>
              {intl.formatMessage({ id: 'component.dataTransfer.archiveUnavailable' })}
            </Typography.Text>
          )}
        </div>
      ))}
      {loading && <Spin />}
      {error && (
        <Alert
          type='error'
          title={intl.formatMessage({ id: 'component.dataTransfer.historyError' })}
          action={
            <Button size='small' onClick={() => void load(cursor ?? undefined)}>
              {intl.formatMessage({ id: 'component.dataTransfer.retry' })}
            </Button>
          }
        />
      )}
      {!loading && !error && !rows.length && (
        <Typography.Text type='secondary'>
          {intl.formatMessage({ id: 'component.dataTransfer.noHistory' })}
        </Typography.Text>
      )}
      {!loading && !error && cursor && (
        <Button onClick={() => void load(cursor)}>
          {intl.formatMessage({ id: 'component.dataTransfer.moreHistory' })}
        </Button>
      )}
    </Space>
  );
}
