import {
  createLcaReleaseArtifactDownload,
  getCurrentLcaRelease,
  getLcaRelease,
  getCurrentLcaReleaseForProcess,
  type LcaReleaseArtifact,
  type LcaReleaseDataset,
  type LcaReleaseProjection,
} from '@/services/lcaReleases';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Alert, Button, Card, Descriptions, Space, Spin } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './index.less';
import { brandProfile } from '../../../config/brandProfile';

type Props = {
  processId?: string;
  processVersion?: string;
  compact?: boolean;
  releaseRunId?: string;
};

type ReleaseIssue = { code: string; message: string };

export function releaseProfileLabel(profileId: string): string {
  if (profileId === 'unit-process-full-closure.v1') return 'Unit Process';
  if (profileId === 'standalone-lifecyclemodel-result-full-closure.v1') {
    return 'LifecycleModel + Result';
  }
  return profileId;
}

export function releaseArtifactFilename(
  releaseVersion: string,
  artifact: Pick<LcaReleaseArtifact, 'profileId' | 'format'>,
): string {
  const profile =
    artifact.profileId === 'unit-process-full-closure.v1' ? 'unit-process' : 'model-result';
  return `${brandProfile.desktop.downloadPrefix}-${releaseVersion}-${profile}.${artifact.format}.zip`;
}

export function datasetForRole(
  datasets: LcaReleaseDataset[] | undefined,
  role: string,
): LcaReleaseDataset | undefined {
  return datasets?.find((dataset) => dataset.role === role);
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const LcaReleaseReadPanel = ({
  processId,
  processVersion,
  releaseRunId,
  compact = false,
}: Props) => {
  const intl = useIntl();
  const t = useCallback(
    (id: string, defaultMessage: string) => intl.formatMessage({ id, defaultMessage }),
    [intl],
  );
  const [release, setRelease] = useState<LcaReleaseProjection | null>(null);
  const [issue, setIssue] = useState<ReleaseIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setIssue(null);
      setRelease(null);
      const result = releaseRunId
        ? await getLcaRelease(releaseRunId)
        : processId && processVersion
          ? await getCurrentLcaReleaseForProcess(processId, processVersion)
          : await getCurrentLcaRelease();
      if (!cancelled) {
        if (result.error || !result.data) {
          setIssue({
            code: result.error?.code ?? 'release_unavailable',
            message: result.error?.message ?? 'Release metadata is unavailable.',
          });
        } else {
          setRelease(result.data);
        }
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [processId, processVersion, releaseRunId, reloadToken]);

  const datasets = release?.datasets;
  const unitProcess = datasetForRole(datasets, 'unit_process');
  const lifecycleModel = datasetForRole(datasets, 'lifecycle_model');
  const resultProcess = datasetForRole(datasets, 'result_process');
  const validations = useMemo(
    () =>
      Object.entries(release?.validation ?? {}).map(([key, status]) => ({
        key,
        status: status ?? 'unknown',
      })),
    [release?.validation],
  );

  const downloadArtifact = async (artifact: LcaReleaseArtifact) => {
    setDownloadId(artifact.artifactId);
    setDownloadError(null);
    const result = await createLcaReleaseArtifactDownload(artifact.artifactId);
    if (result.error || !result.data?.signedDownloadUrl) {
      setDownloadError(
        result.error?.message ??
          t(
            'pages.dataProcessing.release.downloadExpired',
            'The secure download link could not be refreshed. Please retry.',
          ),
      );
    } else {
      triggerDownload(
        result.data.signedDownloadUrl,
        releaseArtifactFilename(release?.releaseVersion ?? 'release', artifact),
      );
    }
    setDownloadId(null);
  };

  const title = processId
    ? t('pages.dataProcessing.release.processTitle', 'Process release')
    : t('pages.dataProcessing.release.title', 'Model / Result Release');
  if (loading) return <Spin spinning={true} />;
  if (issue) {
    const isEmpty =
      issue.code === 'publication_not_found' || issue.code === 'release_process_not_found';
    return (
      <Space orientation='vertical' className={styles.fullWidth}>
        <Alert
          type={isEmpty ? 'info' : 'error'}
          title={
            isEmpty
              ? t(
                  'pages.dataProcessing.release.empty',
                  'No canonical Model / Result Release is available for this Process. Legacy LCIA results remain separate.',
                )
              : issue.message
          }
        />
        <Button size='small' icon={<ReloadOutlined />} onClick={() => setReloadToken((v) => v + 1)}>
          {t('pages.dataProcessing.release.retry', 'Retry')}
        </Button>
      </Space>
    );
  }
  if (!release) return null;

  return (
    <Card
      className={styles.releaseCard}
      title={title}
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => setReloadToken((value) => value + 1)}>
          {t('pages.dataProcessing.release.refresh', 'Refresh')}
        </Button>
      }
    >
      <Space orientation='vertical' size='middle' className={styles.fullWidth}>
        <div className={styles.releaseHero}>
          <div>
            <span>{t('pages.dataProcessing.release.version', 'Release version')}</span>
            <strong>{release.releaseVersion}</strong>
          </div>
          <div>
            <span>{t('pages.dataProcessing.release.status', 'Status')}</span>
            <strong>{release.status}</strong>
          </div>
          <div>
            <span>{t('pages.dataProcessing.release.readback', 'Readback')}</span>
            <strong>
              {release.readbackVerifiedAt
                ? t('pages.dataProcessing.release.verified', 'Verified')
                : t('pages.dataProcessing.release.pending', 'Pending')}
            </strong>
          </div>
        </div>
        {release.blockers?.length ? (
          <Alert
            type='warning'
            title={`${t('pages.dataProcessing.release.blockers', 'Blockers')}: ${release.blockers.join(', ')}`}
          />
        ) : null}
        {!compact ? (
          <Descriptions
            bordered
            size='small'
            column={1}
            items={[
              {
                key: 'release-run-id',
                label: t('pages.dataProcessing.release.runId', 'Release run ID'),
                children: <code>{release.releaseRunId}</code>,
              },
              {
                key: 'release-manifest-hash',
                label: t('pages.dataProcessing.release.manifestHash', 'Release manifest hash'),
                children: <code>{release.releaseManifestHash ?? '-'}</code>,
              },
              {
                key: 'artifact-set-hash',
                label: t('pages.dataProcessing.release.artifactSetHash', 'Artifact set hash'),
                children: <code>{release.artifactSetHash}</code>,
              },
            ]}
          />
        ) : null}
        {processId ? (
          <div className={styles.identityGrid}>
            {[
              ['Unit Process', unitProcess],
              ['LifecycleModel', lifecycleModel],
              ['Result Process', resultProcess],
            ].map(([label, dataset]) => (
              <section key={String(label)} className={styles.identityItem}>
                <span>{String(label)}</span>
                {dataset ? (
                  <>
                    <strong>{(dataset as LcaReleaseDataset).uuid}</strong>
                    <code>{(dataset as LcaReleaseDataset).version}</code>
                  </>
                ) : (
                  <strong>-</strong>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className={styles.countStrip}>
            {Object.entries(release.datasetCounts ?? {}).map(([role, count]) => (
              <span key={role}>
                {role}: {count}
              </span>
            ))}
          </div>
        )}
        <div className={styles.validationStrip}>
          {validations.map((validation) => (
            <span key={validation.key}>
              {validation.status === 'passed' ? <CheckCircleOutlined /> : <WarningOutlined />}
              {validation.key}: {validation.status}
            </span>
          ))}
        </div>
        {downloadError ? <Alert type='error' title={downloadError} /> : null}
        <div className={styles.artifactGrid}>
          {release.artifacts.map((artifact) => (
            <section key={artifact.artifactId} className={styles.artifactItem}>
              <div>
                <strong>{releaseProfileLabel(artifact.profileId)}</strong>
                <span>
                  {artifact.format.toUpperCase()} · {(artifact.byteSize / 1024 / 1024).toFixed(2)}{' '}
                  MB
                </span>
              </div>
              <code>{artifact.sha256}</code>
              <Button
                icon={<DownloadOutlined />}
                loading={downloadId === artifact.artifactId}
                onClick={() => void downloadArtifact(artifact)}
              >
                {t('pages.dataProcessing.release.download', 'Download ZIP')}
              </Button>
            </section>
          ))}
        </div>
      </Space>
    </Card>
  );
};

export default LcaReleaseReadPanel;
