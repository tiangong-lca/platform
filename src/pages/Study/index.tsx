import { resolveRouteViewState } from '@/services/general/routeViewState';
import {
  analysis,
  core,
  expectType,
  newWriteKey,
  readArtifact,
  review,
  StudyRequestError,
  type CoreRequest,
  type CoreData,
  type CoreResource,
  type Preparation,
  type Scenario,
  type Study,
} from '@/services/study/api';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { FormattedMessage, history, useLocation } from '@umijs/max';
import {
  ExactRecord,
  QueryState,
  useStudyIdentity,
  useStudyQuery,
  useStudyText,
  useStudyWrite,
  WriteState,
} from './shared';
import styles from './index.less';
import StudyTaskProgress from './TaskProgress';

const reportHref = (id: string, hash: string) =>
  `/study-report?id=${encodeURIComponent(id)}&hash=${encodeURIComponent(hash)}`;
const studyHref = (id: string) => `/studies?id=${encodeURIComponent(id)}`;
type ResourcePage = CoreResource<'resourcePage'>;

function StudyList() {
  const t = useStudyText();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = useStudyQuery(`list:${cursor}`, async () =>
    expectType(await core({ operation: 'study.list', cursor, limit: 25 }), 'studyPage'),
  );
  const write = useStudyWrite(query.refresh);
  const [reportId, setReportId] = useState(''),
    [reportHash, setReportHash] = useState('');
  return (
    <Space orientation='vertical' size='large' style={{ width: '100%' }}>
      <WriteState write={write} />
      <Card
        title={<FormattedMessage id='pages.study.title' />}
        extra={<Button onClick={query.refresh}>{t('refresh')}</Button>}
      >
        <QueryState {...query} retry={query.refresh}>
          {query.data && (
            <>
              <Table<Study>
                rowKey='studyId'
                dataSource={query.data.items}
                scroll={{ x: 600 }}
                pagination={false}
                columns={[
                  {
                    title: t('studyTitle'),
                    dataIndex: 'title',
                    render: (value, row) => <a href={`#${studyHref(row.studyId)}`}>{value}</a>,
                  },
                  { title: t('id'), dataIndex: 'studyId' },
                  { title: t('status'), dataIndex: 'status' },
                  { title: t('revision'), dataIndex: 'currentRevisionId' },
                ]}
              />
              <Space>
                <Button disabled={!cursor} onClick={() => setCursor(null)}>
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
      </Card>
      <Card title={t('openReport')}>
        <Space wrap>
          <Input
            aria-label={t('reportId')}
            placeholder={t('reportId')}
            value={reportId}
            onChange={(event) => setReportId(event.target.value)}
          />
          <Input
            aria-label={t('reportHash')}
            placeholder={t('reportHash')}
            value={reportHash}
            onChange={(event) => setReportHash(event.target.value)}
          />
          <Button
            onClick={() => history.push(reportHref(reportId, reportHash))}
            disabled={!reportId || !/^[a-f0-9]{64}$/u.test(reportHash)}
          >
            {t('openReport')}
          </Button>
        </Space>
      </Card>
    </Space>
  );
}

function ResourceRecords({ studyId, kind }: { studyId: string; kind: ResourcePage['kind'] }) {
  const t = useStudyText();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = useStudyQuery(`${studyId}:${kind}:${cursor}`, async () =>
    expectType(
      await core({ operation: 'study.resources.list', studyId, kind, cursor, limit: 25 }),
      'resourcePage',
    ),
  );
  return (
    <QueryState {...query} retry={query.refresh}>
      {query.data && (
        <>
          <ExactRecord value={query.data.items} />
          <Button
            disabled={!query.data.nextCursor}
            onClick={() => setCursor(query.data!.nextCursor)}
          >
            {t('next')}
          </Button>
        </>
      )}
    </QueryState>
  );
}

/** Only presentation projection guards. Worker remains the schema/numerical authority. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new StudyRequestError('REFERENCE_MISMATCH', false);
  return value as Record<string, unknown>;
}
function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new StudyRequestError('REFERENCE_MISMATCH', false);
  return value.map(record);
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new StudyRequestError('REFERENCE_MISMATCH', false);
  return value;
}

type ExchangeRow = {
  key: string;
  instanceId: string;
  process: string;
  exchangeId: string;
  flow: string;
  amount: number;
  unit: string;
  reference: boolean;
  path: string;
};
function modelRows(value: unknown): {
  rows: ExchangeRow[];
  model: Record<string, unknown>;
  nodes: { id: string; process: string }[];
} {
  const prepared = record(value);
  if (prepared.schemaVersion !== 'lca.study-prepared-input.v1')
    throw new StudyRequestError('UNSUPPORTED_SCHEMA', false);
  const model = record(prepared.model);
  const nodes = records(model.instances).map((instance) => ({
    id: string(instance.id),
    process: `${string(record(instance.process).id)} @ ${string(record(instance.process).version)}`,
  }));
  const rows = records(model.instances).flatMap((instance) =>
    records(instance.exchanges).map((exchange) => {
      const instanceId = string(instance.id),
        exchangeId = string(exchange.id);
      if (typeof exchange.amount !== 'number' || !Number.isFinite(exchange.amount))
        throw new StudyRequestError('REFERENCE_MISMATCH', false);
      return {
        key: `${instanceId}:${exchangeId}`,
        instanceId,
        process: `${string(record(instance.process).id)} @ ${string(record(instance.process).version)}`,
        exchangeId,
        flow: `${string(record(exchange.flow).id)} @ ${string(record(exchange.flow).version)}`,
        amount: exchange.amount,
        unit: string(exchange.unit),
        reference: exchangeId === instance.referenceExchangeId,
        path: `/instances/${instanceId}/exchanges/${exchangeId}/amount`,
      };
    }),
  );
  return { rows, model, nodes };
}

function LightEdit({
  row,
  studyId,
  scenarios,
  preparation,
  canWrite,
}: {
  row: ExchangeRow;
  studyId: string;
  scenarios: Scenario[];
  preparation: Preparation;
  canWrite: boolean;
}) {
  const t = useStudyText();
  const [amount, setAmount] = useState<number | null>(row.amount);
  const [predecessorId, setPredecessorId] = useState<string>();
  const [created, setCreated] = useState<Scenario>();
  const [prepared, setPrepared] = useState<Preparation>();
  const [result, setResult] = useState<CoreData>();
  const query = useStudyQuery(`${prepared?.preparationId ?? ''}`, async () =>
    prepared
      ? expectType(
          await core({ operation: 'model.read', preparationId: prepared.preparationId }),
          'modelPreparation',
        ).value
      : undefined,
  );
  const currentPreparation = query.data ?? prepared;
  const write = useStudyWrite(query.refresh, `study:${studyId}`);
  const frozen = scenarios.filter(
    (scenario) =>
      scenario.status === 'frozen' && scenario.modelPreparationId === preparation.preparationId,
  );
  const predecessor = frozen.find((scenario) => scenario.scenarioRevisionId === predecessorId);
  const available = canWrite && !write.pending && !write.busy;
  const execute = (body: CoreRequest, apply: (value: Awaited<ReturnType<typeof core>>) => void) => {
    const exact = { ...body, idempotencyKey: newWriteKey() };
    write.run(async () => {
      const data = await core(exact as CoreRequest, `study:${studyId}`);
      apply(data);
      setResult(data);
    });
  };
  return (
    <Card title={t('edit')}>
      <Typography.Paragraph>{t('immutable')}</Typography.Paragraph>
      <Space wrap>
        <Select
          aria-label={t('selectScenario')}
          placeholder={t('selectScenario')}
          style={{ minWidth: 280 }}
          value={predecessorId}
          disabled={!!created}
          onChange={setPredecessorId}
          options={frozen.map((scenario) => ({
            value: scenario.scenarioRevisionId,
            label: scenario.scenarioRevisionId,
          }))}
        />
        <InputNumber
          aria-label={t('amount')}
          value={amount}
          onChange={(value) => setAmount(typeof value === 'number' ? value : null)}
          disabled={!!created}
        />
        <Button
          disabled={
            !available ||
            !!created ||
            !predecessor ||
            amount === null ||
            !Number.isFinite(amount) ||
            row.reference
          }
          onClick={() => {
            const overrides = predecessor!.overrides
              .filter((override) => override.path !== row.path)
              .concat({ path: row.path, value: amount! });
            execute(
              {
                operation: 'scenario.create',
                studyRevisionId: predecessor!.studyRevisionId,
                parentScenarioRevisionId: predecessor!.scenarioRevisionId,
                overrides,
                idempotencyKey: '',
              },
              (data) => setCreated(expectType(data, 'scenarioRevision').value),
            );
          }}
        >
          {t('create')}
        </Button>
        <Button
          disabled={!available || !created || !!prepared || created.status !== 'draft'}
          onClick={() =>
            execute(
              {
                operation: 'model.prepare',
                studyId,
                source: {
                  type: 'scenarioRevision',
                  scenarioRevisionId: created!.scenarioRevisionId,
                  expectedRevision: created!.revision,
                  contentHash: created!.contentHash,
                },
                profileId: preparation.profileId,
                calculationContractRef: preparation.calculationContractRef,
                idempotencyKey: '',
              },
              (data) => setPrepared(expectType(data, 'modelPreparation').value),
            )
          }
        >
          {t('prepare')}
        </Button>
        <Button disabled={!prepared || query.loading} onClick={query.refresh}>
          {t('refresh')}
        </Button>
        <Button
          disabled={
            !available ||
            !created ||
            created.status !== 'draft' ||
            currentPreparation?.execution.status !== 'completed' ||
            !currentPreparation.inputHash
          }
          onClick={() =>
            execute(
              {
                operation: 'scenario.freeze',
                target: {
                  type: 'scenarioRevision',
                  id: created!.scenarioRevisionId,
                  expectedRevision: created!.revision,
                },
                expectedContentHash: created!.contentHash,
                modelPreparationId: currentPreparation!.preparationId,
                idempotencyKey: '',
              },
              (data) => setCreated(expectType(data, 'scenarioRevision').value),
            )
          }
        >
          {t('freeze')}
        </Button>
        <Button
          disabled={!available || created?.status !== 'frozen' || !currentPreparation?.inputHash}
          onClick={() =>
            execute(
              {
                operation: 'run.submit',
                studyRevisionId: created!.studyRevisionId,
                scenarioRevisionId: created!.scenarioRevisionId,
                expectedInputHash: currentPreparation!.inputHash!,
                calculationContractRef: currentPreparation!.calculationContractRef,
                profileId: currentPreparation!.profileId,
                idempotencyKey: '',
              },
              () => {},
            )
          }
        >
          {t('run')}
        </Button>
      </Space>
      <WriteState write={write} />
      {currentPreparation && <ExactRecord value={currentPreparation} />}
      {prepared && (
        <StudyTaskProgress
          studyId={studyId}
          resource={{ type: 'modelPreparation', id: prepared.preparationId }}
        />
      )}
      {result !== undefined && <ExactRecord value={result} />}
      {result?.type === 'run' && (
        <StudyTaskProgress studyId={studyId} resource={{ type: 'run', id: result.value.runId }} />
      )}
    </Card>
  );
}

function FrozenModel({
  studyId,
  preparations,
  scenarios,
  canWrite,
}: {
  studyId: string;
  preparations: Preparation[];
  scenarios: Scenario[];
  canWrite: boolean;
}) {
  const t = useStudyText();
  const [preparationId, setPreparationId] = useState('');
  const [edit, setEdit] = useState<ExchangeRow>();
  const query = useStudyQuery(preparationId, async () => {
    if (!preparationId) return undefined;
    const preparation = expectType(
      await core({ operation: 'model.read', preparationId }),
      'modelPreparation',
    ).value;
    if (!preparation.inputArtifactRef) return { preparation };
    const artifact = await readArtifact(studyId, preparation.inputArtifactRef);
    return { preparation, content: modelRows(artifact) };
  });
  const content = query.data?.content;
  return (
    <Space orientation='vertical' size='large' style={{ width: '100%' }}>
      <Select
        aria-label={t('preparation')}
        placeholder={t('preparation')}
        style={{ width: '100%' }}
        value={preparationId || undefined}
        onChange={(value) => {
          setPreparationId(value);
          setEdit(undefined);
        }}
        options={preparations.map((item) => ({
          value: item.preparationId,
          label: `${item.preparationId} / ${item.execution.status}`,
        }))}
      />
      <QueryState {...query} retry={query.refresh}>
        {query.data && (
          <>
            <ExactRecord value={query.data.preparation} />
            {content && (
              <>
                <Typography.Paragraph>{t('bounded')}</Typography.Paragraph>
                <div className={styles.graph} role='region' aria-label={t('model')} tabIndex={0}>
                  {content.nodes.slice(0, 64).map((node) => (
                    <div className={styles.node} key={node.id}>
                      <strong>{node.id}</strong>
                      <span>{node.process}</span>
                    </div>
                  ))}
                </div>
                <Table<ExchangeRow>
                  rowKey='key'
                  dataSource={content.rows}
                  scroll={{ x: 1000 }}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    { title: t('instance'), dataIndex: 'instanceId' },
                    { title: t('exchange'), dataIndex: 'exchangeId' },
                    { title: t('source'), dataIndex: 'flow' },
                    { title: t('amount'), dataIndex: 'amount', render: (value) => String(value) },
                    { title: t('unit'), dataIndex: 'unit' },
                    {
                      title: t('edit'),
                      render: (_, row) => (
                        <Button
                          disabled={
                            !canWrite ||
                            row.reference ||
                            !/^[A-Za-z0-9._:-]+$/u.test(row.instanceId) ||
                            !/^[A-Za-z0-9._:-]+$/u.test(row.exchangeId)
                          }
                          onClick={() => setEdit(row)}
                        >
                          {t('edit')}
                        </Button>
                      ),
                    },
                  ]}
                />
                <Card title={t('source')}>
                  <ExactRecord
                    value={{
                      origin: content.model.origin,
                      connections: content.model.connections,
                      cutoffs: content.model.cutoffs,
                      sourceDocuments: content.model.sourceDocuments,
                      qualityFindings: content.model.qualityFindings,
                    }}
                  />
                </Card>
                {edit && (
                  <LightEdit
                    key={`${preparationId}:${edit.key}`}
                    row={edit}
                    studyId={studyId}
                    scenarios={scenarios}
                    preparation={query.data.preparation}
                    canWrite={canWrite}
                  />
                )}
              </>
            )}
          </>
        )}
      </QueryState>
    </Space>
  );
}

function StudyResults({ studyId }: { studyId: string }) {
  const t = useStudyText();
  const [cursor, setCursor] = useState<string | null>(null),
    [selectedId, setSelectedId] = useState('');
  const list = useStudyQuery(`${studyId}:${cursor}`, async () =>
    expectType(
      await analysis({
        operation: 'study.resources.list',
        studyId,
        kind: 'analysis',
        cursor,
        limit: 25,
      }),
      'resourcePage',
    ),
  );
  const query = useStudyQuery(selectedId, async () => {
    if (!selectedId) return undefined;
    const item = expectType(
      await analysis({ operation: 'analysis.read', analysisId: selectedId }),
      'analysis',
    ).value;
    if (!item.factsRef) return { item };
    const artifact = record(await readArtifact(studyId, item.factsRef));
    if (
      artifact.schemaVersion !== 'lca.study-analysis-facts.v1' ||
      artifact.analysisId !== item.analysisId ||
      artifact.configHash !== item.configHash
    )
      throw new StudyRequestError('REFERENCE_MISMATCH', false);
    return {
      item,
      facts: records(artifact.facts),
      context: {
        comparability: artifact.comparability,
        inputs: artifact.inputs,
        coverage: artifact.coverage,
        scenarioEvidence: artifact.scenarioEvidence,
        hotspots: artifact.hotspots,
        businessPilotQualified: artifact.businessPilotQualified,
        scientificRankingQualified: artifact.scientificRankingQualified,
      },
    };
  });
  const options = list.data?.items
    .filter((item) => item.type === 'analysis')
    .map((item) => ({ value: item.value.analysisId, label: item.value.analysisId }));
  return (
    <Space orientation='vertical' style={{ width: '100%' }}>
      <Alert type='info' title={t('noRanking')} />
      <QueryState {...list} retry={list.refresh}>
        <Space wrap>
          <Select
            aria-label={t('readFacts')}
            placeholder={t('readFacts')}
            style={{ minWidth: 280 }}
            value={selectedId || undefined}
            onChange={setSelectedId}
            options={options}
          />
          <Button
            disabled={!list.data?.nextCursor}
            onClick={() => setCursor(list.data!.nextCursor)}
          >
            {t('next')}
          </Button>
        </Space>
      </QueryState>
      <QueryState {...query} retry={query.refresh}>
        {query.data && (
          <>
            <ExactRecord value={query.data.item} />
            <ExactRecord value={query.data.context} />
            {query.data.facts && (
              <Table
                rowKey={(row) => string(row.factId)}
                dataSource={query.data.facts}
                scroll={{ x: 900 }}
                pagination={{ pageSize: 25 }}
                columns={[
                  { title: t('fact'), render: (_, row) => string(row.label) },
                  {
                    title: t('value'),
                    render: (_, row) =>
                      row.canonicalValue === null ? t('unknown') : string(row.canonicalValue),
                  },
                  { title: t('unit'), render: (_, row) => string(row.unit) },
                  {
                    title: t('coverage'),
                    render: (_, row) =>
                      row.coverage === 'partial' ? t('subtotal') : string(row.coverage),
                  },
                  {
                    title: t('source'),
                    render: (_, row) => (
                      <ExactRecord
                        value={{
                          factId: row.factId,
                          runIds: row.runIds,
                          methodRef: row.methodRef,
                          subject: row.subject,
                          reasonCodes: row.reasonCodes,
                        }}
                      />
                    ),
                  },
                ]}
              />
            )}
          </>
        )}
      </QueryState>
      <Card title={t('results')}>
        <ResourceRecords studyId={studyId} kind='run' />
      </Card>
      <Card title={t('selectScenario')}>
        <ResourceRecords studyId={studyId} kind='scenarioRevision' />
      </Card>
    </Space>
  );
}

function Reports({ studyId }: { studyId: string }) {
  const t = useStudyText();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = useStudyQuery(`${studyId}:${cursor}`, async () =>
    expectType(
      await analysis({
        operation: 'study.resources.list',
        studyId,
        kind: 'reportRevision',
        cursor,
        limit: 25,
      }),
      'resourcePage',
    ),
  );
  return (
    <QueryState {...query} retry={query.refresh}>
      {query.data && (
        <>
          <Space orientation='vertical'>
            {query.data.items
              .filter((item) => item.type === 'reportRevision')
              .map((item) => (
                <Card
                  key={item.value.reportRevisionId}
                  title={
                    <a href={`#${reportHref(item.value.reportRevisionId, item.value.contentHash)}`}>
                      {item.value.reportRevisionId}
                    </a>
                  }
                >
                  <ExactRecord value={item.value} />
                </Card>
              ))}
          </Space>
          <Button
            disabled={!query.data.nextCursor}
            onClick={() => setCursor(query.data!.nextCursor)}
          >
            {t('next')}
          </Button>
        </>
      )}
    </QueryState>
  );
}

function Workbench({ id, tab }: { id: string; tab: string }) {
  const t = useStudyText();
  const [memberId, setMemberId] = useState(''),
    [role, setRole] = useState<'editor' | 'reviewer' | 'viewer' | null>(null);
  const query = useStudyQuery(id, async () => {
    const [actions, capabilities] = await Promise.all([
      review({ operation: 'resource.actions', resource: { type: 'study', id } }).then((data) =>
        expectType(data, 'actions'),
      ),
      core({ operation: 'capability.read' }).then((data) => expectType(data, 'capabilities')),
    ]);
    if (!actions.corePermissions.read) throw new StudyRequestError('FORBIDDEN', false);
    const study = expectType(await core({ operation: 'study.read', studyId: id }), 'study').value;
    const [revision, preparations, scenarios] = await Promise.all([
      study.currentRevisionId
        ? core({ operation: 'revision.read', revisionId: study.currentRevisionId }).then(
            (data) => expectType(data, 'studyRevision').value,
          )
        : undefined,
      core({
        operation: 'study.resources.list',
        studyId: id,
        kind: 'modelPreparation',
        cursor: null,
        limit: 100,
      }).then((data) => expectType(data, 'resourcePage')),
      core({
        operation: 'study.resources.list',
        studyId: id,
        kind: 'scenarioRevision',
        cursor: null,
        limit: 100,
      }).then((data) => expectType(data, 'resourcePage')),
    ]);
    return { actions, capabilities, study, revision, preparations, scenarios };
  });
  const write = useStudyWrite(query.refresh, `study:${id}`);
  const data = query.data;
  const canWrite = Boolean(
    data?.actions.corePermissions.write &&
    data.capabilities.runtimeEnabled &&
    ['scenario.create', 'model.prepare', 'scenario.freeze', 'run.submit'].every((operation) =>
      data.capabilities.operations.includes(operation as CoreRequest['operation']),
    ),
  );
  return (
    <QueryState {...query} retry={query.refresh}>
      {data && (
        <Space orientation='vertical' size='large' style={{ width: '100%' }}>
          <Card
            title={data.study.title}
            extra={
              <Space wrap>
                <Tag>{data.study.status}</Tag>
                {!canWrite && <Tag>{t('readOnly')}</Tag>}
                <Button onClick={query.refresh}>{t('refresh')}</Button>
              </Space>
            }
          >
            <WriteState write={write} />
            <Typography.Text>{data.study.studyId}</Typography.Text>
            <Typography.Paragraph>{data.study.currentRevisionId}</Typography.Paragraph>
          </Card>
          <Tabs
            activeKey={tab}
            onChange={(view) => history.push(`${studyHref(id)}&view=${view}`)}
            destroyOnHidden
            items={[
              {
                key: 'overview',
                label: t('overview'),
                children: (
                  <Space orientation='vertical' size='large' style={{ width: '100%' }}>
                    <Card title={t('overview')}>
                      {data.revision ? (
                        <Descriptions
                          column={1}
                          items={[
                            {
                              key: 'goal',
                              label: t('goal'),
                              children: data.revision.definition.goal,
                            },
                            {
                              key: 'unit',
                              label: t('functionalUnit'),
                              children: `${data.revision.definition.functionalUnit.amount} ${data.revision.definition.functionalUnit.unit} / ${data.revision.definition.functionalUnit.referenceFlowId}`,
                            },
                            {
                              key: 'boundary',
                              label: t('boundary'),
                              children: data.revision.definition.systemBoundary,
                            },
                            {
                              key: 'revision',
                              label: t('revision'),
                              children: data.revision.revisionId,
                            },
                            { key: 'hash', label: t('hash'), children: data.revision.contentHash },
                            {
                              key: 'source',
                              label: t('source'),
                              children: (
                                <ExactRecord
                                  value={{
                                    modelRef: data.revision.modelRef,
                                    methodRefs: data.revision.definition.methodRefs,
                                    assumptions: data.revision.definition.assumptions,
                                  }}
                                />
                              ),
                            },
                          ]}
                        />
                      ) : (
                        t('empty')
                      )}
                    </Card>
                    <Card title={t('setMember')}>
                      <WriteState write={write} />
                      <Space wrap>
                        <Input
                          aria-label={t('member')}
                          placeholder={t('member')}
                          value={memberId}
                          onChange={(event) => setMemberId(event.target.value)}
                        />
                        <Select
                          aria-label={t('role')}
                          value={role ?? 'remove'}
                          onChange={(value) =>
                            setRole(
                              value === 'remove'
                                ? null
                                : (value as 'editor' | 'reviewer' | 'viewer'),
                            )
                          }
                          options={[
                            { value: 'remove', label: t('remove') },
                            ...data.actions.allowedMemberRoles.map((value) => ({
                              value,
                              label: value,
                            })),
                          ]}
                        />
                        <Button
                          disabled={
                            !data.actions.actions.includes('member.set') ||
                            !memberId ||
                            write.busy ||
                            !!write.pending
                          }
                          onClick={() => {
                            const exact = {
                              operation: 'member.set' as const,
                              target: {
                                type: 'study' as const,
                                id,
                                expectedRevision: data.study.revision,
                              },
                              memberId,
                              role,
                              idempotencyKey: newWriteKey(),
                            };
                            write.run(() => review(exact, `study:${id}`));
                          }}
                        >
                          {t('setMember')}
                        </Button>
                      </Space>
                    </Card>
                    <ResourceRecords studyId={id} kind='studyRevision' />
                  </Space>
                ),
              },
              {
                key: 'model',
                label: t('model'),
                children: (
                  <FrozenModel
                    studyId={id}
                    preparations={data.preparations.items
                      .filter((item) => item.type === 'modelPreparation')
                      .map((item) => item.value)}
                    scenarios={data.scenarios.items
                      .filter((item) => item.type === 'scenarioRevision')
                      .map((item) => item.value)}
                    canWrite={canWrite}
                  />
                ),
              },
              { key: 'results', label: t('results'), children: <StudyResults studyId={id} /> },
              { key: 'reports', label: t('reports'), children: <Reports studyId={id} /> },
            ]}
          />
        </Space>
      )}
    </QueryState>
  );
}

export default function StudyPage() {
  const { search } = useLocation();
  const identity = useStudyIdentity();
  const params = new URLSearchParams(search),
    id = params.get('id'),
    view = resolveRouteViewState('study-view', params.get('view'));
  const t = useStudyText();
  return (
    <div className={styles.workbench}>
      {id ? (
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) ? (
          <Workbench key={`${identity}:${id}`} id={id} tab={view} />
        ) : (
          <Alert type='error' title={t('invalidLink')} />
        )
      ) : (
        <StudyList key={identity} />
      )}
    </div>
  );
}
