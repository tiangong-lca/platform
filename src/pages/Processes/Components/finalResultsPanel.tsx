import {
  finalResultDownload,
  finalResultLink,
  queryFinalResult,
  sourceFinalResults,
  type FinalIdentity,
  type FinalPins,
  type FinalResult,
  type SourceFinalResults,
} from '@/services/lcaReleases/finalResults';
import {
  Alert,
  Button,
  Descriptions,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tooltip,
} from 'antd';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useIntl } from 'umi';

type Status = 'loading' | 'ready' | 'preparing' | 'unavailable' | 'changed' | 'error';

function StatusMessage({ status, retry }: { status: Status; retry: () => void }) {
  const { formatMessage: t } = useIntl();
  if (status === 'loading') return <Spin />;
  if (status === 'ready') return null;
  const title =
    status === 'preparing'
      ? t({
          id: 'pages.publishedResults.preparing',
          defaultMessage: 'Preparing published results. Please retry shortly.',
        })
      : status === 'changed'
        ? t({
            id: 'pages.publishedResults.changed',
            defaultMessage:
              'The publication or result reader changed. Reload the result selection.',
          })
        : status === 'unavailable'
          ? t({
              id: 'pages.publishedResults.unavailable',
              defaultMessage: 'No published results are available for this exact version.',
            })
          : t({
              id: 'pages.publishedResults.error',
              defaultMessage: 'Published results could not be loaded. Please retry.',
            });
  return (
    <Alert
      type={status === 'error' ? 'error' : 'info'}
      title={title}
      action={
        <Button onClick={retry}>
          {t({ id: 'pages.publishedResults.retry', defaultMessage: 'Retry' })}
        </Button>
      }
    />
  );
}

/** Also usable by an exact published Derived Result entry; it never queries ancestors. */
export function FinalResultDetails({
  result,
  publicationId,
  onRestart,
}: {
  result: FinalIdentity;
  publicationId: string;
  onRestart: () => void;
}) {
  const { formatMessage: t } = useIntl();
  const [overview, setOverview] = useState<FinalResult>();
  const [response, setResponse] = useState<FinalResult>();
  const [kind, setKind] = useState<'lci' | 'lcia'>('lcia');
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [retry, setRetry] = useState(0);
  const pins = useRef<FinalPins>({ publicationId });
  const downloading = useRef<AbortController | undefined>(undefined);
  const [downloadStatus, setDownloadStatus] = useState<
    'idle' | 'loading' | 'unavailable' | 'error'
  >('idle');
  useEffect(() => () => downloading.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setStatus('loading');
    setResponse(undefined);
    const query = !overview
      ? { kind: 'overview' as const }
      : kind === 'lcia'
        ? { kind }
        : { kind, limit: 50, cursor, filter };
    const load = async () => {
      try {
        const outcome = await queryFinalResult(
          { uuid: result.uuid, version: result.version },
          query,
          controller.signal,
          pins.current,
        );
        if (controller.signal.aborted) return;
        setStatus(outcome.status);
        if (outcome.status === 'preparing') {
          pins.current = outcome.pins;
          if (++attempts < 4) timer = setTimeout(() => void load(), 2000);
        } else if (outcome.status === 'ready') {
          pins.current = {
            publicationId: outcome.result.publicationId,
            runtimeRevision: outcome.result.runtimeRevision,
          };
          if (!overview) {
            setOverview(outcome.result);
            if ('lciaAvailable' in outcome.result.data && !outcome.result.data.lciaAvailable)
              setKind('lci');
          } else setResponse(outcome.result);
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [result.uuid, result.version, publicationId, overview, kind, cursor, filter, retry]);
  const ready = status === 'ready' ? response?.data : undefined;
  const basis = overview?.data.result.quantitativeReference;
  const canRead = overview && 'lciaAvailable' in overview.data ? overview.data : undefined;
  const download = async (format: 'tidas' | 'ilcd') => {
    downloading.current?.abort();
    const controller = new AbortController();
    downloading.current = controller;
    setDownloadStatus('loading');
    try {
      const outcome = await finalResultDownload(publicationId, format, controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.status !== 'ready') {
        setDownloadStatus(outcome.status === 'unavailable' ? 'unavailable' : 'error');
        return;
      }
      const link = document.createElement('a');
      link.href = outcome.download.url;
      link.download = outcome.download.file.name;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadStatus('idle');
    } catch {
      if (!controller.signal.aborted) setDownloadStatus('error');
    }
  };
  const unitTitle = (unit: NonNullable<typeof basis>['unit']) =>
    `${unit.flowPropertyId}@${unit.flowPropertyVersion} · ${unit.unitGroupId}@${unit.unitGroupVersion} · ${unit.internalId}`;
  return (
    <Space orientation='vertical' style={{ width: '100%' }}>
      {overview && !['unavailable', 'changed', 'error'].includes(status) && (
        <Descriptions
          size='small'
          column={1}
          items={[
            {
              key: 'release',
              label: t({
                id: 'pages.publishedResults.release',
                defaultMessage: 'Published release',
              }),
              children: overview.releaseVersion,
            },
            {
              key: 'result',
              label: t({
                id: 'pages.publishedResults.resultIdentity',
                defaultMessage: 'Result dataset',
              }),
              children: `${result.uuid} · ${result.version}`,
            },
            {
              key: 'relation',
              label: t({
                id: 'pages.publishedResults.relation',
                defaultMessage: 'Result relationship',
              }),
              children:
                overview.data.result.relationKind === 'derived'
                  ? t({ id: 'pages.publishedResults.derived', defaultMessage: 'Derived result' })
                  : t({ id: 'pages.publishedResults.direct', defaultMessage: 'Direct result' }),
            },
            {
              key: 'basis',
              label: t({
                id: 'pages.publishedResults.basis',
                defaultMessage: 'Reference quantity',
              }),
              children: basis && (
                <Tooltip title={unitTitle(basis.unit)}>
                  {`${basis.value} ${basis.unit.name} · ${basis.flowName} · ${basis.flowVersion}`}
                </Tooltip>
              ),
            },
          ]}
        />
      )}
      <Tabs
        activeKey={kind}
        onChange={(key) => {
          setKind(key as 'lci' | 'lcia');
          setCursor(null);
        }}
        items={[
          {
            key: 'lcia',
            label: t({ id: 'pages.publishedResults.lcia', defaultMessage: 'LCIA' }),
            disabled: canRead?.lciaAvailable === false,
          },
          { key: 'lci', label: t({ id: 'pages.publishedResults.lci', defaultMessage: 'LCI' }) },
        ]}
      />
      {canRead?.lciaAvailable === false && (
        <Alert
          type='info'
          title={t({
            id: 'pages.publishedResults.noLcia',
            defaultMessage: 'This result has no LCIA data.',
          })}
        />
      )}
      {kind === 'lci' && (
        <Input.Search
          allowClear
          maxLength={64}
          aria-label={t({
            id: 'pages.publishedResults.search',
            defaultMessage: 'Search inventory',
          })}
          enterButton={t({
            id: 'pages.publishedResults.search',
            defaultMessage: 'Search inventory',
          })}
          onSearch={(value) => {
            setFilter(value);
            setCursor(null);
          }}
        />
      )}
      <StatusMessage
        status={status}
        retry={
          status === 'changed' || status === 'unavailable'
            ? onRestart
            : () => setRetry((v) => v + 1)
        }
      />
      {ready && 'impacts' in ready && (
        <Table
          size='small'
          pagination={false}
          scroll={{ x: 640 }}
          rowKey={(r) => `${r.method.id}@${r.method.version}`}
          dataSource={ready.impacts}
          columns={[
            {
              title: t({ id: 'pages.publishedResults.method', defaultMessage: 'Impact category' }),
              render: (_, r) => r.method.name,
            },
            {
              title: t({ id: 'pages.publishedResults.version', defaultMessage: 'Version' }),
              render: (_, r) => r.method.version,
            },
            {
              title: t({ id: 'pages.publishedResults.amount', defaultMessage: 'Amount' }),
              render: (_, r) => String(r.amount),
            },
            {
              title: t({ id: 'pages.publishedResults.unit', defaultMessage: 'Unit' }),
              render: (_, r) => r.method.unit,
            },
          ]}
        />
      )}
      {ready && 'items' in ready && (
        <>
          <Alert
            type='info'
            title={t({
              id: 'pages.publishedResults.nonzero',
              defaultMessage:
                'Zero-valued inventory entries are omitted; search and pagination select from nonzero entries.',
            })}
          />
          <Table
            size='small'
            pagination={false}
            scroll={{ x: 900 }}
            rowKey={(r) => JSON.stringify(r.key)}
            dataSource={ready.items}
            columns={[
              {
                title: t({ id: 'pages.publishedResults.flow', defaultMessage: 'Flow' }),
                render: (_, r) => r.name,
              },
              {
                title: t({ id: 'pages.publishedResults.version', defaultMessage: 'Version' }),
                render: (_, r) => r.key.flowVersion,
              },
              {
                title: t({ id: 'pages.publishedResults.direction', defaultMessage: 'Direction' }),
                render: (_, r) =>
                  r.key.direction === 'Input'
                    ? t({ id: 'pages.publishedResults.input', defaultMessage: 'Input' })
                    : t({ id: 'pages.publishedResults.output', defaultMessage: 'Output' }),
              },
              {
                title: t({ id: 'pages.publishedResults.location', defaultMessage: 'Location' }),
                render: (_, r) => r.key.location ?? '—',
              },
              {
                title: t({
                  id: 'pages.publishedResults.functionType',
                  defaultMessage: 'Function type',
                }),
                render: (_, r) => r.key.functionType ?? '—',
              },
              {
                title: t({ id: 'pages.publishedResults.amount', defaultMessage: 'Amount' }),
                render: (_, r) => String(r.amount),
              },
              {
                title: t({ id: 'pages.publishedResults.unit', defaultMessage: 'Unit' }),
                render: (_, r) => (
                  <Tooltip title={unitTitle(r.key.unit)}>{r.key.unit.name}</Tooltip>
                ),
              },
            ]}
          />
          <Space>
            <Button disabled={!cursor} onClick={() => setCursor(null)}>
              {t({ id: 'pages.publishedResults.first', defaultMessage: 'First page' })}
            </Button>
            <Button disabled={!ready.nextCursor} onClick={() => setCursor(ready.nextCursor)}>
              {t({ id: 'pages.publishedResults.next', defaultMessage: 'Next page' })}
            </Button>
          </Space>
        </>
      )}
      {ready && (
        <Space wrap>
          <Button
            href={finalResultLink(result, publicationId)}
            target='_blank'
            rel='noopener noreferrer'
          >
            {t({ id: 'pages.publishedResults.openResult', defaultMessage: 'Open result link' })}
          </Button>
          <Button
            aria-label={t({
              id: 'pages.publishedResults.downloadTidas',
              defaultMessage: 'Download TIDAS ZIP',
            })}
            loading={downloadStatus === 'loading'}
            disabled={downloadStatus === 'loading'}
            onClick={() => void download('tidas')}
          >
            {t({
              id: 'pages.publishedResults.downloadTidas',
              defaultMessage: 'Download TIDAS ZIP',
            })}
          </Button>
          <Button disabled={downloadStatus === 'loading'} onClick={() => void download('ilcd')}>
            {t({ id: 'pages.publishedResults.downloadIlcd', defaultMessage: 'Download ILCD ZIP' })}
          </Button>
        </Space>
      )}
      {downloadStatus === 'unavailable' && (
        <Alert
          type='info'
          title={t({
            id: 'pages.publishedResults.packageUnavailable',
            defaultMessage:
              'A complete ZIP is not available for this publication and your access permissions.',
          })}
        />
      )}
      {downloadStatus === 'error' && (
        <Alert
          type='error'
          title={t({
            id: 'pages.publishedResults.downloadError',
            defaultMessage: 'The download link could not be refreshed. Please retry.',
          })}
        />
      )}
    </Space>
  );
}

export default function FinalSourceResults({
  id,
  version,
  legacy,
}: {
  id: string;
  version: string;
  legacy: (publicationId: string) => ReactNode;
}) {
  const { formatMessage: t } = useIntl();
  const [page, setPage] = useState<SourceFinalResults>();
  const [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState<Status>('loading');
  const [retry, setRetry] = useState(0);
  const [continuation, setContinuation] = useState<{ publicationId: string; afterKey: string }>();
  const restart = () => {
    setPage(undefined);
    setSelected(undefined);
    setContinuation(undefined);
    setStatus('loading');
    setRetry((v) => v + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void sourceFinalResults({ id, version }, controller.signal, continuation)
      .then((outcome) => {
        if (controller.signal.aborted) return;
        setStatus(outcome.status);
        if (outcome.status === 'ready') {
          setPage((old) =>
            continuation &&
            old &&
            old?.publication?.publicationId === outcome.page.publication?.publicationId
              ? { ...outcome.page, results: [...old.results, ...outcome.page.results] }
              : outcome.page,
          );
          if (!continuation)
            setSelected(
              outcome.page.results[0]
                ? `${outcome.page.results[0].uuid}@${outcome.page.results[0].version}`
                : undefined,
            );
        } else {
          setPage(undefined);
          setSelected(undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('error');
          setPage(undefined);
        }
      });
    return () => controller.abort();
  }, [id, version, continuation, retry]);
  if (status !== 'ready') return <StatusMessage status={status} retry={restart} />;
  if (page?.publication?.format === 'legacy-four-zip.v1')
    return <>{legacy(page.publication.publicationId)}</>;
  if (!page?.publication || !page.results.length)
    return <StatusMessage status='unavailable' retry={restart} />;
  const chosen = page.results.find((r) => `${r.uuid}@${r.version}` === selected);
  return (
    <Space orientation='vertical' style={{ width: '100%' }}>
      <Space wrap style={{ width: '100%' }}>
        <Select
          aria-label={t({
            id: 'pages.publishedResults.selectResult',
            defaultMessage: 'Select a published result',
          })}
          value={selected}
          style={{ minWidth: 300, maxWidth: '100%' }}
          onChange={setSelected}
          options={page.results.map((r) => ({
            value: `${r.uuid}@${r.version}`,
            label: `${r.uuid} · ${r.version}`,
          }))}
        />
        {page.nextResultKey && (
          <Button
            onClick={() =>
              setContinuation({
                publicationId: page.publication!.publicationId,
                afterKey: page.nextResultKey!,
              })
            }
          >
            {t({ id: 'pages.publishedResults.moreResults', defaultMessage: 'Load more results' })}
          </Button>
        )}
        <Button onClick={restart}>
          {t({ id: 'pages.publishedResults.refreshSelection', defaultMessage: 'Refresh results' })}
        </Button>
      </Space>
      {chosen && (
        <FinalResultDetails
          key={`${page.publication.publicationId}/${chosen.uuid}@${chosen.version}`}
          result={chosen}
          publicationId={page.publication.publicationId}
          onRestart={restart}
        />
      )}
    </Space>
  );
}
