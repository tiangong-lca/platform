import { expectType, review } from '@/services/study/api';
import { downloadStudyExport } from '@/services/study/download';
import { Alert, Button, Card, Descriptions, Space } from 'antd';
import { FormattedMessage, useLocation } from '@umijs/max';
import { renderStudyPreview } from './preview';
import {
  QueryState,
  useStudyIdentity,
  useStudyQuery,
  useStudyText,
  useStudyWrite,
  WriteState,
} from './shared';

function NamedShare({ id }: { id: string }) {
  const t = useStudyText();
  const query = useStudyQuery(id, async () => {
    const actions = expectType(
      await review({ operation: 'resource.actions', resource: { type: 'share', id } }),
      'actions',
    );
    const projection = expectType(await review({ operation: 'share.view', shareId: id }), 'view');
    return { actions, projection, preview: renderStudyPreview(projection.view) };
  });
  const write = useStudyWrite(query.refresh, `share:${id}`);
  const share = query.data?.projection.share;
  return (
    <QueryState {...query} retry={query.refresh}>
      {share && query.data && (
        <Space orientation='vertical' size='large' style={{ width: '100%' }}>
          <Alert type='info' showIcon title={t('projectionOnly')} />
          <Card
            title={t('current')}
            extra={<Button onClick={query.refresh}>{t('refresh')}</Button>}
          >
            <Descriptions
              column={1}
              items={[
                { key: 'share', label: t('shares'), children: share.shareId },
                { key: 'recipient', label: t('recipient'), children: share.recipientId },
                { key: 'expiry', label: t('expires'), children: share.expiresAt },
                {
                  key: 'state',
                  label: t('status'),
                  children: `${share.status} / ${query.data.projection.state.validity.status} / ${query.data.projection.state.acceptance}`,
                },
                { key: 'report', label: t('reportId'), children: share.reportRevisionId },
                { key: 'hash', label: t('hash'), children: share.reportContentHash },
              ]}
            />
            <WriteState write={write} />
            <Button
              disabled={
                !query.data.actions.actions.includes('share.download') ||
                share.status !== 'active' ||
                write.busy ||
                !!write.pending
              }
              loading={write.busy}
              onClick={() => write.run(() => downloadStudyExport('share', id))}
            >
              {t('download')}
            </Button>
          </Card>
          <Card title={t('preview')}>
            <iframe
              title={t('preview')}
              sandbox='allow-scripts'
              srcDoc={query.data.preview}
              style={{ width: '100%', height: '80vh', border: 0 }}
            />
          </Card>
        </Space>
      )}
    </QueryState>
  );
}

export default function StudySharePage() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get('id') ?? '';
  const identity = useStudyIdentity();
  return (
    <div style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
      {/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) ? (
        <NamedShare key={`${identity}:${id}`} id={id} />
      ) : (
        <Alert type='error' title={<FormattedMessage id='pages.study.invalidLink' />} />
      )}
    </div>
  );
}
