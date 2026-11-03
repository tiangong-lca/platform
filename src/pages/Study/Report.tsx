import {
  StudyRequestError,
  expectType,
  newWriteKey,
  review,
  type ReviewRequest,
} from '@/services/study/api';
import { downloadStudyExport } from '@/services/study/download';
import { Button, Card, Descriptions, Divider, Input, Select, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { FormattedMessage, useLocation, useModel } from '@umijs/max';
import { renderStudyPreview } from './preview';
import {
  ExactRecord,
  QueryState,
  useStudyIdentity,
  useStudyQuery,
  useStudyText,
  useStudyWrite,
  WriteState,
} from './shared';

type HistoryKind = 'comment' | 'review' | 'delegation' | 'share';
function ReportHistory({
  id,
  hash,
  kind,
  generation,
}: {
  id: string;
  hash: string;
  kind: HistoryKind;
  generation: string;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const t = useStudyText();
  const query = useStudyQuery(`${id}:${hash}:${kind}:${cursor}:${generation}`, async () =>
    expectType(
      await review({
        operation: kind === 'delegation' ? 'review.delegation.list' : `${kind}.list`,
        reportRevisionId: id,
        expectedContentHash: hash,
        cursor,
        limit: 25,
      }),
      'history',
    ),
  );
  return (
    <section>
      <QueryState {...query} retry={query.refresh}>
        {query.data && (
          <>
            <ExactRecord value={query.data.items} />
            <Space>
              <Button disabled={cursor === null} onClick={() => setCursor(null)}>
                {t('refresh')}
              </Button>
              <Button
                disabled={!query.data.nextCursor}
                onClick={() => setCursor(query.data!.nextCursor)}
              >
                {t('next')}
              </Button>
            </Space>
          </>
        )}
      </QueryState>
    </section>
  );
}

export function ExactReport({ id, hash }: { id: string; hash: string }) {
  const t = useStudyText();
  const { initialState } = useModel('@@initialState');
  const [text, setText] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | 'withdraw'>('approve');
  const [predecessor, setPredecessor] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [exportId, setExportId] = useState('');
  const [lastResult, setLastResult] = useState<unknown>();
  const [revokeId, setRevokeId] = useState('');
  const [reason, setReason] = useState('');
  const [profile, setProfile] = useState<
    'lca.study-report-unreviewed.v1' | 'lca.study-report-internal-review.v1'
  >('lca.study-report-unreviewed.v1');
  const query = useStudyQuery(`${id}:${hash}`, async () => {
    const [actions, capabilities] = await Promise.all([
      review({ operation: 'resource.actions', resource: { type: 'reportRevision', id } }).then(
        (data) => expectType(data, 'actions'),
      ),
      review({ operation: 'capability.read' }).then((data) => expectType(data, 'capabilities')),
    ]);
    const projection = expectType(
      await review({ operation: 'report.view', reportRevisionId: id, expectedContentHash: hash }),
      'view',
    );
    return { actions, capabilities, projection, preview: renderStudyPreview(projection.view) };
  });
  const exportActions = useStudyQuery(exportId, async () => {
    if (!exportId) return undefined;
    const actions = expectType(
      await review({ operation: 'resource.actions', resource: { type: 'export', id: exportId } }),
      'actions',
    );
    const item = expectType(await review({ operation: 'export.read', exportId }), 'export').value;
    if (item.reportRevisionId !== id || item.reportContentHash !== hash)
      throw new StudyRequestError('REFERENCE_MISMATCH', false);
    return actions;
  });
  const write = useStudyWrite(query.refresh, `report:${id}`);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const allowed = (operation: ReviewRequest['operation']) =>
    Boolean(
      query.data?.capabilities.runtimeEnabled &&
      query.data.actions.actions.includes(operation) &&
      !write.pending &&
      !write.busy,
    );
  const command = (
    body:
      Omit<Extract<ReviewRequest, { idempotencyKey: string }>, 'idempotencyKey'> | ReviewRequest,
  ) => {
    const exact = { ...body, idempotencyKey: newWriteKey() };
    write.run(async () => {
      const result = await review(exact as ReviewRequest, `report:${id}`);
      setLastResult(result);
      if (result.type === 'export') setExportId(result.value.exportId);
      setHistoryGeneration((value) => value + 1);
      return result;
    });
  };
  const projection = query.data?.projection;
  const state = projection?.state;
  const target = state && {
    type: 'reportRevision' as const,
    id,
    expectedRevision: state.reportRevision,
  };
  const bound = { reportRevisionId: id, expectedContentHash: hash };
  return (
    <QueryState {...query} retry={query.refresh}>
      {projection && state && target && (
        <Space orientation='vertical' size='large' style={{ width: '100%' }}>
          <Card
            title={t('current')}
            extra={
              <Button
                onClick={() => {
                  query.refresh();
                  setHistoryGeneration((value) => value + 1);
                }}
              >
                {t('refresh')}
              </Button>
            }
          >
            <Descriptions
              column={1}
              items={[
                { key: 'id', label: t('reportId'), children: id },
                { key: 'hash', label: t('hash'), children: hash },
                {
                  key: 'validity',
                  label: t('status'),
                  children: (
                    <Space wrap>
                      <Tag>{state.validity.status}</Tag>
                      <Tag>{state.acceptance}</Tag>
                      <span>{state.checkedAt}</span>
                    </Space>
                  ),
                },
                {
                  key: 'final',
                  label: t('finalize'),
                  children: state.finalization ? (
                    <ExactRecord value={state.finalization} />
                  ) : (
                    t('empty')
                  ),
                },
              ]}
            />
            <WriteState write={write} />
            {lastResult !== undefined && <ExactRecord value={lastResult} />}
          </Card>
          <Card title={t('preview')}>
            <iframe
              title={t('preview')}
              sandbox='allow-scripts'
              srcDoc={query.data!.preview}
              style={{ width: '100%', height: '75vh', border: 0 }}
            />
          </Card>
          <Card title={t('comments')}>
            <ReportHistory
              id={id}
              hash={hash}
              kind='comment'
              generation={String(historyGeneration)}
            />
            {allowed('comment.append') && (
              <Space orientation='vertical' style={{ width: '100%' }}>
                <Input.TextArea
                  aria-label={t('comment')}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={4096}
                />
                <Button
                  disabled={!text.trim()}
                  onClick={() => command({ operation: 'comment.append', ...bound, text })}
                >
                  {t('append')}
                </Button>
              </Space>
            )}
          </Card>
          <Card title={t('reviews')}>
            <Typography.Paragraph>{t('reviewerNote')}</Typography.Paragraph>
            <ReportHistory
              id={id}
              hash={hash}
              kind='review'
              generation={String(historyGeneration)}
            />
            <Space wrap>
              <Select
                aria-label={t('decision')}
                value={decision}
                onChange={setDecision}
                options={(['approve', 'reject', 'withdraw'] as const).map((value) => ({
                  value,
                  label: t(value),
                  disabled:
                    value === 'approve' && state.authorId === initialState?.currentUser?.userid,
                }))}
              />
              <Select
                aria-label={t('predecessorReview')}
                style={{ minWidth: 260 }}
                allowClear
                value={predecessor}
                onChange={(value) => setPredecessor(value ?? null)}
                options={state.currentReviewIds.map((value) => ({ value, label: value }))}
              />
              <Button
                disabled={
                  !allowed('review.record') ||
                  !text.trim() ||
                  (decision === 'approve' && state.authorId === initialState?.currentUser?.userid)
                }
                onClick={() =>
                  command({
                    operation: 'review.record',
                    ...bound,
                    reviewClass: 'internal',
                    decision,
                    comment: text,
                    predecessorReviewId: predecessor,
                    delegationId: null,
                  })
                }
              >
                {t('record')}
              </Button>
            </Space>
            <Divider />
            <Space wrap>
              <Select
                aria-label={t('profile')}
                value={profile}
                onChange={setProfile}
                style={{ minWidth: 260 }}
                options={query.data!.capabilities.finalizationProfiles.map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <Button
                disabled={!allowed('report.finalize')}
                onClick={() =>
                  command({
                    operation: 'report.finalize',
                    target,
                    expectedContentHash: hash,
                    expectedReviewStateHash: state.reviewStateHash,
                    profileId: profile,
                    acceptedReviewIds:
                      profile === 'lca.study-report-internal-review.v1'
                        ? state.acceptedReviewIds
                        : [],
                  })
                }
              >
                {t('finalize')}
              </Button>
            </Space>
            <Divider />
            <Space wrap>
              <Input
                aria-label={t('client')}
                placeholder={t('client')}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
              <Input
                type='datetime-local'
                aria-label={t('expires')}
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <Button
                disabled={!allowed('review.delegation.issue') || !clientId || !expiresAt}
                onClick={() =>
                  command({
                    operation: 'review.delegation.issue',
                    ...bound,
                    clientId,
                    reviewClass: 'internal',
                    decision,
                    predecessorReviewId: predecessor,
                    expiresAt: new Date(expiresAt).toISOString(),
                  })
                }
              >
                {t('delegate')}
              </Button>
            </Space>
            {query.data!.actions.actions.includes('review.delegation.list') && (
              <ReportHistory
                id={id}
                hash={hash}
                kind='delegation'
                generation={String(historyGeneration)}
              />
            )}
            <Space wrap>
              <Input
                aria-label={t('delegations')}
                value={revokeId}
                onChange={(event) => setRevokeId(event.target.value)}
              />
              <Button
                disabled={!allowed('review.delegation.revoke') || !revokeId}
                onClick={() =>
                  command({ operation: 'review.delegation.revoke', delegationId: revokeId })
                }
              >
                {t('revoke')}
              </Button>
            </Space>
          </Card>
          <Card title={t('export')}>
            <Space wrap>
              <Button
                disabled={
                  !allowed('export.request') ||
                  !state.finalization ||
                  state.acceptance !== 'current'
                }
                onClick={() =>
                  command({
                    operation: 'export.request',
                    ...bound,
                    finalizationId: state.finalization!.finalizationId,
                    expectedReviewStateHash: state.reviewStateHash,
                    rendererVersion: '1.0.0',
                    viewModelVersion: 'lca.study-report-view.v1',
                  })
                }
              >
                {t('export')}
              </Button>
              <Input
                aria-label={t('exportId')}
                placeholder={t('exportId')}
                value={exportId}
                onChange={(event) => setExportId(event.target.value)}
              />
              <Button
                disabled={
                  !exportActions.data?.actions.includes('export.download') ||
                  write.busy ||
                  !!write.pending
                }
                onClick={() => write.run(() => downloadStudyExport('export', exportId))}
              >
                {t('download')}
              </Button>
            </Space>
          </Card>
          <Card title={t('shares')}>
            {query.data!.actions.actions.includes('share.list') && (
              <ReportHistory
                id={id}
                hash={hash}
                kind='share'
                generation={String(historyGeneration)}
              />
            )}
            <Space wrap>
              <Input
                aria-label={t('recipient')}
                placeholder={t('recipient')}
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
              />
              <Button
                disabled={!allowed('share.create') || !recipientId || !expiresAt || !exportId}
                onClick={() =>
                  command({
                    operation: 'share.create',
                    ...bound,
                    exportId,
                    recipientId,
                    disclosurePolicyId: 'lca.study-report-summary-share.v1',
                    expiresAt: new Date(expiresAt).toISOString(),
                  })
                }
              >
                {t('share')}
              </Button>
            </Space>
            <Divider />
            <Space wrap>
              <Input
                aria-label={t('shares')}
                value={revokeId}
                onChange={(event) => setRevokeId(event.target.value)}
              />
              <Input
                aria-label={t('reason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button
                disabled={!allowed('share.revoke') || !revokeId || !reason.trim()}
                onClick={() => command({ operation: 'share.revoke', shareId: revokeId, reason })}
              >
                {t('revoke')}
              </Button>
            </Space>
          </Card>
        </Space>
      )}
    </QueryState>
  );
}

export default function StudyReportPage() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const identity = useStudyIdentity();
  const id = params.get('id') ?? '',
    hash = params.get('hash') ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) || !/^[a-f0-9]{64}$/u.test(hash))
    return (
      <Card>
        <FormattedMessage id='pages.study.invalidLink' />
      </Card>
    );
  return (
    <div style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
      <ExactReport key={`${identity}:${id}:${hash}`} id={id} hash={hash} />
    </div>
  );
}
