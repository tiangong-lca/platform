import PublicationHistory from './PublicationHistory';
import styles from './index.less';
import accountPageStyles from '@/components/AccountPage/index.less';
import { PageContainer } from '@ant-design/pro-components';
import ImportTidasPackage from '@/components/ImportTidasPackage';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import {
  currentFinalPublication,
  type CurrentFinalPublication,
  finalResultDownload,
} from '@/services/lcaReleases/finalResults';
import { getSystemUserRoleApi } from '@/services/roles/api';
import { submitTidasPackageExportTask } from '@/services/tidasPackage/taskCenter';
import { DownOutlined, DownloadOutlined, HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Grid, Space, Spin, Tabs, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';

export default function DataTransfer() {
  const screens = Grid.useBreakpoint();
  const intl = useIntl();
  const { message } = useAntdAppApi();
  const [admin, setAdmin] = useState(false);
  const [release, setRelease] = useState<CurrentFinalPublication>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState<string>();
  const downloadController = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(false);
    setDownloading(undefined);
    setRelease(undefined);
    void currentFinalPublication(controller.signal)
      .then((reply) => {
        if (!active) return;
        setError(reply.status !== 'ready');
        setRelease(reply.status === 'ready' ? reply.publication : null);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setRelease(null);
        }
      });
    void getSystemUserRoleApi()
      .then((role) => {
        if (active) setAdmin(role?.role === 'admin' || role?.role === 'owner');
      })
      .catch(() => {
        if (active) setAdmin(false);
      });
    return () => {
      active = false;
      controller.abort();
      downloadController.current?.abort();
    };
  }, [retry]);
  const submit = (scope: 'current_user' | 'open_data') => {
    try {
      submitTidasPackageExportTask({ scope });
      message.success(intl.formatMessage({ id: 'component.dataTransfer.submitted' }));
    } catch {
      message.error(intl.formatMessage({ id: 'component.dataTransfer.error' }));
    }
  };
  const publication = release;
  const download = async (format: 'tidas' | 'ilcd', publicationId = publication?.publicationId) => {
    if (!publicationId) return;
    downloadController.current?.abort();
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(`${publicationId}:${format}`);
    try {
      const reply = await finalResultDownload(publicationId, format, controller.signal);
      if (controller.signal.aborted) return;
      if (reply.status !== 'ready') throw new Error('Download unavailable');
      const link = document.createElement('a');
      link.href = reply.download.url;
      link.download = reply.download.file.name;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      if (!controller.signal.aborted)
        message.error(intl.formatMessage({ id: 'component.dataTransfer.error' }));
    } finally {
      if (!controller.signal.aborted) setDownloading(undefined);
    }
  };
  return (
    <PageContainer
      className={accountPageStyles.page}
      title={intl.formatMessage({ id: 'component.dataTransfer.title' })}
    >
      <Tabs
        tabPlacement={screens.md ? 'start' : 'top'}
        defaultActiveKey='export'
        items={[
          {
            key: 'import',
            label: intl.formatMessage({ id: 'component.dataTransfer.import' }),
            children: (
              <Card style={{ maxWidth: 1080 }}>
                <ImportTidasPackage embedded />
              </Card>
            ),
          },
          {
            key: 'export',
            label: intl.formatMessage({ id: 'component.dataTransfer.export' }),
            children: (
              <Space orientation='vertical' size={16} style={{ width: '100%', maxWidth: 1080 }}>
                <Typography.Text type='secondary'>
                  {intl.formatMessage({ id: 'component.dataTransfer.taskHint' })}
                </Typography.Text>
                <Card
                  size='small'
                  title={intl.formatMessage({ id: 'component.dataTransfer.myData' })}
                >
                  <Typography.Paragraph type='secondary'>
                    {intl.formatMessage({ id: 'component.dataTransfer.myDescription' })}
                  </Typography.Paragraph>
                  <Button onClick={() => submit('current_user')} icon={<DownloadOutlined />}>
                    {intl.formatMessage({ id: 'component.dataTransfer.exportTidas' })}
                  </Button>
                </Card>
                {admin && (
                  <Card
                    size='small'
                    title={intl.formatMessage({ id: 'component.dataTransfer.publicData' })}
                  >
                    <Typography.Paragraph type='secondary'>
                      {intl.formatMessage({ id: 'component.dataTransfer.publicDescription' })}
                    </Typography.Paragraph>
                    <Button onClick={() => submit('open_data')} icon={<DownloadOutlined />}>
                      {intl.formatMessage({ id: 'component.dataTransfer.exportTidas' })}
                    </Button>
                  </Card>
                )}
                <Card
                  size='small'
                  title={intl.formatMessage({ id: 'component.dataTransfer.resultLibrary' })}
                  extra={
                    <Button
                      type='text'
                      aria-label={intl.formatMessage({ id: 'component.dataTransfer.refresh' })}
                      icon={<ReloadOutlined />}
                      onClick={() => setRetry((v) => v + 1)}
                    />
                  }
                >
                  <Typography.Paragraph type='secondary'>
                    {intl.formatMessage({ id: 'component.dataTransfer.resultDescription' })}
                  </Typography.Paragraph>
                  {release === undefined ? (
                    <Spin />
                  ) : error ? (
                    <Alert
                      type='error'
                      title={intl.formatMessage({ id: 'component.dataTransfer.error' })}
                    />
                  ) : publication ? (
                    <div className={`${styles.historyRow} ${styles.currentRow}`}>
                      <div className={styles.currentIdentity}>
                        <Typography.Text strong>{release?.releaseVersion}</Typography.Text>
                        <span className={styles.currentBadge}>
                          {intl.formatMessage({ id: 'component.dataTransfer.currentVersion' })}
                        </span>
                      </div>
                      <Space size={4} wrap>
                        {(['tidas', 'ilcd'] as const).map((format) => (
                          <Button
                            key={format}
                            type='text'
                            size='small'
                            className={styles.archiveAction}
                            icon={<DownloadOutlined />}
                            loading={downloading === `${publication.publicationId}:${format}`}
                            disabled={!!downloading}
                            onClick={() => void download(format)}
                          >
                            {intl.formatMessage(
                              { id: 'component.dataTransfer.archiveLabel' },
                              { format: format.toUpperCase() },
                            )}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  ) : (
                    <Typography.Text type='secondary'>
                      {intl.formatMessage({ id: 'component.dataTransfer.noRelease' })}
                    </Typography.Text>
                  )}
                  <Collapse
                    key={retry}
                    ghost
                    destroyOnHidden
                    className={styles.history}
                    classNames={{ header: styles.historyHeader, body: styles.historyBody }}
                    expandIconPlacement='end'
                    expandIcon={({ isActive }) => (
                      <DownOutlined
                        aria-hidden
                        className={styles.historyChevron}
                        rotate={isActive ? 180 : 0}
                      />
                    )}
                    items={[
                      {
                        key: 'history',
                        label: (
                          <span className={styles.historyLabel}>
                            <HistoryOutlined aria-hidden />
                            {intl.formatMessage({ id: 'component.dataTransfer.history' })}
                          </span>
                        ),
                        children: (
                          <PublicationHistory
                            downloading={downloading}
                            onDownload={(id, format) => void download(format, id)}
                          />
                        ),
                      },
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
