import { reportClient } from '@/services/study/reportClient';
import {
  shareHref,
  shareLinkSelection,
  reportWorkflow,
  type ReportApi,
} from '@/services/study/links';
import { expectType } from '@/services/study/api';
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

function NamedShare({ id, api }: { id: string; api: ReportApi }) {
  const client = reportClient(api);
  const t = useStudyText();
  const query = useStudyQuery(`${api}:${id}`, async () => {
    const actions = expectType(
      await client({ operation: 'resource.actions', resource: { type: 'share', id } }),
      'actions',
    );
    const projection = expectType(await client({ operation: 'share.view', shareId: id }), 'view');
    return { actions, projection, preview: renderStudyPreview(projection.view) };
  });
  const write = useStudyWrite(query.refresh, reportWorkflow('share', id, api));
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
                {
                  key: 'share',
                  label: t('shares'),
                  children: <a href={`#${shareHref(share.shareId, api)}`}>{share.shareId}</a>,
                },
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
              onClick={() =>
                write.run(() =>
                  api === 'v5'
                    ? downloadStudyExport('share', id, 'v5')
                    : downloadStudyExport('share', id),
                )
              }
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
  const selected = shareLinkSelection(search);
  const identity = useStudyIdentity();
  return (
    <div style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
      {selected ? (
        <NamedShare
          key={`${identity}:${selected.api}:${selected.id}`}
          id={selected.id}
          api={selected.api}
        />
      ) : (
        <Alert type='error' title={<FormattedMessage id='pages.study.invalidLink' />} />
      )}
    </div>
  );
}
