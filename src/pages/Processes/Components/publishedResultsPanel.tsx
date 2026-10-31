import LcaReleaseReadPanel from '@/components/LcaReleaseReadPanel';
import { getLangText } from '@/services/general/util';
import {
  queryPublishedResult,
  type PublishedResult,
  type PublishedQuery,
} from '@/services/lcaReleases/resultQuery';
import { Alert, Button, Collapse, Descriptions, Input, Space, Spin, Table, Tabs } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

function ResultSession({ id, version, lang }: { id: string; version: string; lang: string }) {
  const [kind, setKind] = useState<'lci' | 'lcia'>('lcia');
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const pinnedPublication = useRef<string | undefined>(undefined);
  const intl = useIntl();
  const [overview, setOverview] = useState<PublishedResult>();
  const [result, setResult] = useState<PublishedResult>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'preparing' | 'unavailable' | 'error'>(
    'loading',
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let pinned = pinnedPublication.current;
    setStatus('loading');
    setResult(undefined);
    const query: PublishedQuery = !overview
      ? { kind: 'overview' }
      : kind === 'lcia'
        ? { kind }
        : { kind, limit: 50, cursor, filter };
    const load = async () => {
      try {
        const outcome = await queryPublishedResult(
          { id, version },
          query,
          controller.signal,
          pinned,
        );
        if (controller.signal.aborted) return;
        if (outcome.status === 'preparing') {
          pinned = outcome.publicationId;
          pinnedPublication.current = pinned;
          setStatus('preparing');
          // At most four requests per explicit load. No unbounded background polling.
          if (++attempts < 4) timer = setTimeout(() => void load(), 2000);
          return;
        }
        if (outcome.status !== 'ready') {
          setStatus(outcome.status);
          return;
        }
        pinnedPublication.current = outcome.result.publicationId;
        if (!overview) {
          setOverview(outcome.result);
          if ('lciaAvailable' in outcome.result.data && !outcome.result.data.lciaAvailable)
            setKind('lci');
        } else setResult(outcome.result);
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, version, overview, kind, cursor, filter, retry]);

  const basis = overview?.data.process.quantitativeReference;
  const ready = status === 'ready' ? result?.data : undefined;
  const canRead = overview && 'lciaAvailable' in overview.data ? overview.data : undefined;
  const refresh = (
    <Button onClick={() => setRetry((value) => value + 1)} disabled={status === 'loading'}>
      {<FormattedMessage id='pages.publishedResults.retry' defaultMessage='Retry' />}
    </Button>
  );
  return (
    <Space orientation='vertical' style={{ width: '100%' }}>
      {overview && (
        <Descriptions
          size='small'
          column={1}
          items={[
            {
              key: 'release',
              label: (
                <FormattedMessage
                  id='pages.publishedResults.release'
                  defaultMessage='Published release'
                />
              ),
              children: `${overview.publication.releaseVersion} · ${overview.publication.publishedAt}`,
            },
            {
              key: 'source',
              label: (
                <FormattedMessage
                  id='pages.publishedResults.source'
                  defaultMessage='Source process'
                />
              ),
              children: `${id} · ${version}`,
            },
            {
              key: 'basis',
              label: (
                <FormattedMessage
                  id='pages.publishedResults.basis'
                  defaultMessage='Reference quantity'
                />
              ),
              children:
                basis &&
                `${basis.meanAmount} ${basis.referenceUnit} · ${basis.flow.id} · ${basis.flow.version}`,
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
            label: <FormattedMessage id='pages.publishedResults.lcia' defaultMessage='LCIA' />,
            disabled: canRead?.lciaAvailable === false,
          },
          {
            key: 'lci',
            label: <FormattedMessage id='pages.publishedResults.lci' defaultMessage='LCI' />,
            disabled: canRead?.lciAvailable === false,
          },
        ]}
      />
      {kind === 'lci' && (
        <Input.Search
          allowClear
          maxLength={64}
          aria-label={intl.formatMessage({
            id: 'pages.publishedResults.search',
            defaultMessage: 'Search inventory',
          })}
          enterButton={
            <FormattedMessage
              id='pages.publishedResults.search'
              defaultMessage='Search inventory'
            />
          }
          onSearch={(value) => {
            setFilter(value);
            setCursor(null);
          }}
        />
      )}
      {status === 'loading' && <Spin />}
      {status === 'preparing' && (
        <Alert
          type='info'
          title={
            <FormattedMessage
              id='pages.publishedResults.preparing'
              defaultMessage='Preparing published results. Please retry shortly.'
            />
          }
          action={refresh}
        />
      )}
      {status === 'unavailable' && (
        <Alert
          type='info'
          title={
            <FormattedMessage
              id='pages.publishedResults.unavailable'
              defaultMessage='No published results are available for this exact version.'
            />
          }
          action={refresh}
        />
      )}
      {status === 'error' && (
        <Alert
          type='error'
          title={
            <FormattedMessage
              id='pages.publishedResults.error'
              defaultMessage='Published results could not be loaded. Please retry.'
            />
          }
          action={refresh}
        />
      )}
      {ready && 'impacts' in ready && (
        <Table
          size='small'
          pagination={false}
          scroll={{ x: 640 }}
          rowKey={(row) => `${row.method.id}@${row.method.version}`}
          dataSource={ready.impacts}
          columns={[
            {
              title: (
                <FormattedMessage
                  id='pages.publishedResults.method'
                  defaultMessage='Impact category'
                />
              ),
              render: (_, row) => row.method.name,
            },
            {
              title: (
                <FormattedMessage id='pages.publishedResults.version' defaultMessage='Version' />
              ),
              render: (_, row) => row.method.version,
            },
            {
              title: (
                <FormattedMessage id='pages.publishedResults.amount' defaultMessage='Amount' />
              ),
              render: (_, row) => String(row.amount),
            },
            {
              title: <FormattedMessage id='pages.publishedResults.unit' defaultMessage='Unit' />,
              render: (_, row) => row.method.unit,
            },
          ]}
        />
      )}
      {ready && 'items' in ready && (
        <>
          <Alert
            type='info'
            title={
              <FormattedMessage
                id='pages.publishedResults.nonzero'
                defaultMessage='Zero-valued inventory entries are omitted; search and pagination select from nonzero entries.'
              />
            }
          />
          <Table
            size='small'
            pagination={false}
            scroll={{ x: 800 }}
            dataSource={ready.items}
            rowKey={(row) => JSON.stringify(row.key)}
            columns={[
              {
                title: <FormattedMessage id='pages.publishedResults.flow' defaultMessage='Flow' />,
                render: (_, row) =>
                  typeof row.name === 'string' ? row.name : getLangText(row.name, lang),
              },
              {
                title: (
                  <FormattedMessage id='pages.publishedResults.version' defaultMessage='Version' />
                ),
                render: (_, row) => row.key.flowVersion,
              },
              {
                title: (
                  <FormattedMessage
                    id='pages.publishedResults.direction'
                    defaultMessage='Direction'
                  />
                ),
                render: (_, row) =>
                  row.key.direction === 'Input' ? (
                    <FormattedMessage id='pages.publishedResults.input' defaultMessage='Input' />
                  ) : (
                    <FormattedMessage id='pages.publishedResults.output' defaultMessage='Output' />
                  ),
              },
              {
                title: (
                  <FormattedMessage
                    id='pages.publishedResults.location'
                    defaultMessage='Location'
                  />
                ),
                render: (_, row) => row.key.location ?? '—',
              },
              {
                title: (
                  <FormattedMessage id='pages.publishedResults.amount' defaultMessage='Amount' />
                ),
                render: (_, row) => String(row.amount),
              },
              {
                title: <FormattedMessage id='pages.publishedResults.unit' defaultMessage='Unit' />,
                render: (_, row) => row.key.unit,
              },
            ]}
          />
          <Space>
            <Button disabled={!cursor} onClick={() => setCursor(null)}>
              {<FormattedMessage id='pages.publishedResults.first' defaultMessage='First page' />}
            </Button>
            <Button disabled={!ready.nextCursor} onClick={() => setCursor(ready.nextCursor)}>
              {<FormattedMessage id='pages.publishedResults.next' defaultMessage='Next page' />}
            </Button>
          </Space>
        </>
      )}
      {overview && (
        <Collapse
          items={[
            {
              key: 'downloads',
              label: (
                <FormattedMessage
                  id='pages.publishedResults.downloads'
                  defaultMessage='Release files'
                />
              ),
              children: (
                <LcaReleaseReadPanel
                  processId={id}
                  processVersion={version}
                  releaseRunId={overview?.publication.releaseRunId}
                  compact
                />
              ),
            },
          ]}
        />
      )}
    </Space>
  );
}

/** Remounting at source identity change also clears publication/cursor state synchronously. */
export default function PublishedResultsPanel(props: {
  id: string;
  version: string;
  lang: string;
}) {
  return <ResultSession key={`${props.id}@${props.version}`} {...props} />;
}
