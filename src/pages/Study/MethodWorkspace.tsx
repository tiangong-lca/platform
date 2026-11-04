import { Button, Card, Checkbox, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import {
  expectType,
  method,
  prepareMethodRequest,
  newWriteKey,
  StudyRequestError,
  type MethodRequest,
  type MethodData,
} from '@/services/study/api';
import {
  methodConfigHash,
  readMethodFacts,
  readMethodEvidence,
  readMethodReport,
  type Assessment,
  type Evidence,
  type MethodReport,
  type MethodDraft,
  type MethodConfig,
  type MethodFacts,
} from '@/services/study/method';
import moduleMetadata from '@/standalone/studyReport/methodProtocol.module-metadata.json';
import { reportHref, reportWorkflow } from '@/services/study/links';
import {
  ExactRecord,
  QueryState,
  useStudyQuery,
  useStudyText,
  useStudyWrite,
  WriteState,
} from './shared';

type EvidenceContent = Extract<MethodRequest, { operation: 'method.evidence.create' }>['content'];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, width: '100%' }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function MethodResources({
  studyId,
  kind,
  onSelect,
}: {
  studyId: string;
  kind: 'methodAssessment' | 'reportRevision';
  onSelect: (id: string) => void;
}) {
  const t = useStudyText();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = useStudyQuery(`${studyId}:${kind}:${cursor}`, () =>
    method({ operation: 'study.resources.list', studyId, kind, cursor, limit: 25 }).then((data) =>
      expectType(data, 'resourcePage'),
    ),
  );
  return (
    <QueryState {...query} retry={query.refresh}>
      {query.data && (
        <>
          <Space orientation='vertical' style={{ width: '100%' }}>
            {query.data.items.map((item) => {
              const id =
                item.type === 'methodAssessment'
                  ? item.value.assessmentId
                  : item.value.reportRevisionId;
              return (
                <Button key={id} onClick={() => onSelect(id)}>
                  {id}
                </Button>
              );
            })}
          </Space>
          <Button disabled={!cursor} onClick={() => setCursor(null)}>
            {t('refresh')}
          </Button>
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

function MethodEvidence({
  studyId,
  canWrite,
  onSelect,
}: {
  studyId: string;
  canWrite: boolean;
  onSelect: (value: Evidence) => void;
}) {
  const t = useStudyText();
  const [id, setId] = useState('');
  const [requirementId, setRequirementId] = useState(
    moduleMetadata.projection.requirements[0].requirementId,
  );
  const [declaredKind, setDeclaredKind] = useState<EvidenceContent['declaredKind']>('sourceRecord');
  const [title, setTitle] = useState(''),
    [statement, setStatement] = useState('');
  const [citations, setCitations] = useState<EvidenceContent['citations']>([]);
  const query = useStudyQuery(`${studyId}:${id}`, async () => {
    if (!id) return undefined;
    const evidence = expectType(
      await method({ operation: 'method.evidence.read', evidenceId: id }),
      'methodEvidence',
    ).value;
    if (evidence.studyId !== studyId) throw new StudyRequestError('REFERENCE_MISMATCH', false);
    return { evidence, content: await readMethodEvidence(evidence) };
  });
  const write = useStudyWrite(query.refresh, `study:${studyId}`, (_request, data) => {
    const result = data as MethodData;
    if (result.type === 'methodEvidence') setId(result.value.evidenceId);
  });
  return (
    <Card title={t('methodEvidence')}>
      <Typography.Paragraph>{t('methodEvidenceNote')}</Typography.Paragraph>
      <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
        <Field label={t('evidenceId')}>
          <Input aria-label={t('evidenceId')} value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <QueryState {...query} retry={query.refresh}>
          {query.data && (
            <>
              <Tag>{query.data.evidence.status}</Tag>
              <ExactRecord value={query.data} />
              <Button onClick={() => onSelect(query.data!.evidence)}>{t('selectEvidence')}</Button>
            </>
          )}
        </QueryState>
        <Field label={t('requirement')}>
          <Select
            aria-label={t('requirement')}
            value={requirementId}
            onChange={setRequirementId}
            options={moduleMetadata.projection.requirements.map((item) => ({
              value: item.requirementId,
              label: item.requirementId,
            }))}
          />
        </Field>
        <Field label={t('evidenceKind')}>
          <Select
            aria-label={t('evidenceKind')}
            value={declaredKind}
            onChange={setDeclaredKind}
            options={(['sourceRecord', 'applicabilityRecord', 'professionalRecord'] as const).map(
              (value) => ({ value, label: t(value) }),
            )}
          />
        </Field>
        <Field label={t('evidenceTitle')}>
          <Input
            aria-label={t('evidenceTitle')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={256}
          />
        </Field>
        <Field label={t('statement')}>
          <Input.TextArea
            aria-label={t('statement')}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            maxLength={8192}
          />
        </Field>
        {citations.map((citation, index) => (
          <Space key={index} orientation='vertical' style={{ width: '100%' }}>
            <Select
              aria-label={t('citationKind')}
              value={citation.kind}
              onChange={(kind) =>
                setCitations(citations.map((c, i) => (i === index ? { ...c, kind } : c)))
              }
              options={(
                [
                  'normativeSource',
                  'datasetRevision',
                  'document',
                  'professionalRecord',
                  'otherDeclaredSource',
                ] as const
              ).map((value) => ({ value, label: t(value) }))}
            />
            {(['identity', 'version', 'locator', 'contentHash'] as const).map((key) => (
              <Field key={key} label={t(key)}>
                <Input
                  aria-label={`${t(key)} ${index + 1}`}
                  value={citation[key] ?? ''}
                  onChange={(e) =>
                    setCitations(
                      citations.map((c, i) =>
                        i === index
                          ? { ...c, [key]: e.target.value || (key === 'contentHash' ? null : '') }
                          : c,
                      ),
                    )
                  }
                />
              </Field>
            ))}
            <Button onClick={() => setCitations(citations.filter((_, i) => i !== index))}>
              {t('remove')}
            </Button>
          </Space>
        ))}
        <Button
          disabled={citations.length >= 32}
          onClick={() =>
            setCitations([
              ...citations,
              { kind: 'document', identity: '', version: '', locator: '', contentHash: null },
            ])
          }
        >
          {t('addCitation')}
        </Button>
        <WriteState write={write} />
        <Button
          disabled={
            !canWrite || write.busy || !!write.pending || !title.trim() || !statement.trim()
          }
          onClick={() => {
            const idempotencyKey = newWriteKey();
            write.run(async () => {
              const result = expectType(
                await method(
                  {
                    operation: 'method.evidence.create',
                    studyId,
                    content: {
                      schemaVersion: 'lca.study-method-evidence.v1',
                      requirementId,
                      declaredKind,
                      title,
                      statement,
                      citations,
                    },
                    idempotencyKey,
                  },
                  `study:${studyId}`,
                ),
                'methodEvidence',
              ).value;
              setId(result.evidenceId);
            });
          }}
        >
          {t('recordEvidence')}
        </Button>
      </Space>
    </Card>
  );
}

function MethodAssessment({
  studyId,
  canWrite,
  canRequest,
  canRecordEvidence,
  onFacts,
}: {
  studyId: string;
  canWrite: boolean;
  canRequest: boolean;
  canRecordEvidence: boolean;
  onFacts: (assessment: Assessment, facts: MethodFacts) => void;
}) {
  const t = useStudyText();
  const [id, setId] = useState(''),
    [baselineRunId, setBaselineRunId] = useState('');
  const [studyPhase, setStudyPhase] = useState<'screening' | 'finalStudy'>('screening');
  const [categoryKind, setCategoryKind] = useState<'noneEstablished' | 'commissionDeveloped'>(
    'noneEstablished',
  );
  const [referenceId, setReferenceId] = useState(''),
    [version, setVersion] = useState(''),
    [ruleEvidenceId, setRuleEvidenceId] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>([]),
    [reason, setReason] = useState('');
  const query = useStudyQuery(`${studyId}:${id}`, async () => {
    if (!id) return undefined;
    const assessment = expectType(
      await method({ operation: 'method.assessment.read', assessmentId: id }),
      'methodAssessment',
    ).value;
    if (assessment.studyId !== studyId) throw new StudyRequestError('REFERENCE_MISMATCH', false);
    const [task, actions] = await Promise.all([
      method({ operation: 'task.read', studyId, resource: { type: 'methodAssessment', id } }).then(
        (data) => expectType(data, 'task'),
      ),
      method({ operation: 'resource.actions', resource: { type: 'methodAssessment', id } }).then(
        (data) => expectType(data, 'actions'),
      ),
    ]);
    return { assessment, task, actions };
  });
  const write = useStudyWrite(query.refresh, `study:${studyId}`, (_request, data) => {
    const result = data as MethodData;
    if (result.type === 'methodAssessment') setId(result.value.assessmentId);
  });
  const busy = write.busy || !!write.pending;
  return (
    <Space orientation='vertical' size='large' style={{ width: '100%' }}>
      <MethodEvidence
        studyId={studyId}
        canWrite={canWrite && canRecordEvidence}
        onSelect={(value) =>
          setEvidence((current) =>
            current.some((item) => item.evidenceId === value.evidenceId)
              ? current
              : [...current, value],
          )
        }
      />
      <Card title={t('methodAssessment')}>
        <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
          <Field label={t('assessmentId')}>
            <Input
              aria-label={t('assessmentId')}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </Field>
          <MethodResources studyId={studyId} kind='methodAssessment' onSelect={setId} />
          <QueryState {...query} retry={query.refresh}>
            {query.data && (
              <>
                <ExactRecord value={query.data.assessment} />
                <ExactRecord value={query.data.task} />
                <Button
                  disabled={!query.data.assessment.factsRef || busy}
                  onClick={() =>
                    write.run(async () =>
                      onFacts(
                        query.data!.assessment,
                        await readMethodFacts(query.data!.assessment),
                      ),
                    )
                  }
                >
                  {t('readMethodFacts')}
                </Button>
                <Input
                  aria-label={t('cancelReason')}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={512}
                />
                <Button
                  disabled={
                    busy ||
                    !canWrite ||
                    !reason.trim() ||
                    !query.data.actions.actions.includes('task.cancel')
                  }
                  onClick={() => {
                    const idempotencyKey = newWriteKey();
                    write.run(() =>
                      method(
                        {
                          operation: 'task.cancel',
                          studyId,
                          resource: { type: 'methodAssessment', id },
                          reason,
                          idempotencyKey,
                        },
                        `study:${studyId}`,
                      ),
                    );
                  }}
                >
                  {t('cancelAssessment')}
                </Button>
              </>
            )}
          </QueryState>
          <Field label={t('baselineRun')}>
            <Input
              aria-label={t('baselineRun')}
              value={baselineRunId}
              onChange={(e) => setBaselineRunId(e.target.value)}
            />
          </Field>
          <Field label={t('studyPhase')}>
            <Select
              aria-label={t('studyPhase')}
              value={studyPhase}
              onChange={setStudyPhase}
              options={(['screening', 'finalStudy'] as const).map((value) => ({
                value,
                label: t(value),
              }))}
            />
          </Field>
          <Field label={t('categoryRule')}>
            <Select
              aria-label={t('categoryRule')}
              value={categoryKind}
              onChange={setCategoryKind}
              options={(['noneEstablished', 'commissionDeveloped'] as const).map((value) => ({
                value,
                label: t(value),
              }))}
            />
          </Field>
          {categoryKind === 'commissionDeveloped' && (
            <>
              <Field label={t('ruleReference')}>
                <Input
                  aria-label={t('ruleReference')}
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  maxLength={256}
                />
              </Field>
              <Field label={t('version')}>
                <Input
                  aria-label={t('version')}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  maxLength={128}
                />
              </Field>
              <Field label={t('ruleEvidence')}>
                <Input
                  aria-label={t('ruleEvidence')}
                  value={ruleEvidenceId}
                  onChange={(e) => setRuleEvidenceId(e.target.value)}
                />
              </Field>
            </>
          )}
          <Typography.Paragraph>{t('methodDeclarationNote')}</Typography.Paragraph>
          {evidence.map((item) => (
            <Space key={item.evidenceId} wrap>
              <span>
                {item.requirementId} / {item.evidenceId} / {item.status}
              </span>
              <Button onClick={() => setEvidence(evidence.filter((e) => e !== item))}>
                {t('remove')}
              </Button>
            </Space>
          ))}
          <details>
            <summary>{t('source')}</summary>
            <ExactRecord value={moduleMetadata.projection.moduleRef} />
          </details>
          <WriteState write={write} />
          <Button
            disabled={!canWrite || !canRequest || busy || !baselineRunId}
            onClick={() => {
              const idempotencyKey = newWriteKey();
              write.run(async () => {
                const config: MethodConfig = {
                  schemaVersion: 'lca.study-method-assessment-config.v1',
                  baselineRunId,
                  moduleRef: moduleMetadata.projection.moduleRef as MethodConfig['moduleRef'],
                  declarations: {
                    productRole: 'finishedCementIntermediate',
                    referenceUnitBasis: 'declaredMass',
                    studyPhase,
                    categoryRule:
                      categoryKind === 'noneEstablished'
                        ? { kind: 'noneEstablished' }
                        : {
                            kind: 'commissionDeveloped',
                            referenceId,
                            version,
                            evidenceId: ruleEvidenceId,
                          },
                  },
                  evidenceRefs: evidence.map((item) => ({
                    requirementId: item.requirementId,
                    declaredKind: item.declaredKind,
                    artifactRef: item.artifactRef,
                  })),
                };
                const result = expectType(
                  await prepareMethodRequest(
                    async () => ({
                      operation: 'method.assessment.request',
                      studyId,
                      profileId: 'lca.study-method-pef-2021-ef31-cement-intermediate.v1',
                      config,
                      configHash: await methodConfigHash(config),
                      idempotencyKey,
                    }),
                    `study:${studyId}`,
                  ),
                  'methodAssessment',
                ).value;
                setId(result.assessmentId);
              });
            }}
          >
            {t('requestAssessment')}
          </Button>
        </Space>
      </Card>
    </Space>
  );
}

function MethodDraftEditor({
  studyId,
  assessment,
  facts,
  report,
  initial,
  canWrite,
  allowed,
  onSaved,
}: {
  studyId: string;
  assessment: Assessment;
  facts: MethodFacts;
  report?: MethodReport;
  initial?: MethodDraft;
  canWrite: boolean;
  allowed: MethodRequest['operation'][];
  onSaved: (report: MethodReport) => void;
}) {
  const t = useStudyText();
  const [draft, setDraft] = useState<MethodDraft>(
    initial ?? {
      schemaVersion: 'lca.study-method-report-draft.v1',
      title: '',
      claims: [],
      sections: [],
      tables: [],
      charts: [],
      additionalLimitations: [],
    },
  );
  const [successor, setSuccessor] = useState(false);
  const workflow = report
    ? reportWorkflow('report', report.reportRevisionId, 'v6')
    : `study:${studyId}`;
  const write = useStudyWrite(
    () => {},
    workflow,
    (_request, data) => {
      const value = data as MethodData;
      if (value.type === 'reportRevision') onSaved(value.value);
    },
  );
  const available = (operation: MethodRequest['operation']) =>
    canWrite && allowed.includes(operation) && !write.busy && !write.pending;
  const readonly = report?.status === 'frozen' && !successor;
  const selectedIds = draft.claims.map((claim) => claim.factId);
  const updateClaims = (ids: string[]) => {
    const claims = draft.claims.filter((claim) => ids.includes(claim.factId));
    const reserved = new Set(draft.claims.map((claim) => claim.claimId));
    for (const id of ids) {
      if (claims.some((claim) => claim.factId === id)) continue;
      const fact = facts.factCatalog.find((value) => value.factId === id)!;
      const prefix = `fact-${facts.factCatalog.indexOf(fact) + 1}`;
      let claimId = prefix;
      let suffix = 1;
      while (reserved.has(claimId)) claimId = `${prefix}-${suffix++}`;
      reserved.add(claimId);
      claims.push({
        claimId,
        bundleRef: assessment.factsRef!,
        factId: fact.factId,
        canonicalValue: fact.canonicalValue,
        unit: fact.unit,
        display: { style: 'exact' },
      });
    }
    const keep = (values: string[]) =>
      values.filter((id) => claims.some((claim) => claim.claimId === id));
    setDraft({
      ...draft,
      claims,
      sections: draft.sections.map((section) => ({ ...section, claimIds: keep(section.claimIds) })),
      tables: draft.tables
        .map((table) => ({ ...table, claimIds: keep(table.claimIds) }))
        .filter((table) => table.claimIds.length),
      charts: draft.charts
        .map((chart) => ({ ...chart, claimIds: keep(chart.claimIds) }))
        .filter((chart) => chart.claimIds.length),
    });
  };
  const save = (freeze = false) => {
    const idempotencyKey = newWriteKey();
    return write.run(async () => {
      const result = expectType(
        await method(
          freeze
            ? {
                operation: 'report.freeze',
                target: {
                  type: 'reportRevision',
                  id: report!.reportRevisionId,
                  expectedRevision: report!.revision,
                },
                expectedContentHash: report!.contentHash,
                idempotencyKey,
              }
            : report && !successor
              ? {
                  operation: 'report.save',
                  target: {
                    type: 'reportRevision',
                    id: report.reportRevisionId,
                    expectedRevision: report.revision,
                  },
                  content: draft,
                  idempotencyKey,
                }
              : {
                  operation: 'report.create',
                  studyId,
                  parentReportRevisionId: report?.reportRevisionId ?? null,
                  runIds: [assessment.config.baselineRunId],
                  methodAssessmentIds: [assessment.assessmentId],
                  templateId: 'lca.study-method-report.v1',
                  content: draft,
                  idempotencyKey,
                },
          workflow,
        ),
        'reportRevision',
      ).value;
      onSaved(result);
    });
  };
  return (
    <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
      <Typography.Paragraph>{t('mandatoryMethodNote')}</Typography.Paragraph>
      <details>
        <summary>{t('methodAssessment')}</summary>
        <ExactRecord value={facts} />
      </details>
      <details>
        <summary>{t('source')}</summary>
        <ExactRecord
          value={{
            assessment,
            baseline: facts.baseline,
            moduleRef: facts.moduleRef,
            configHash: facts.configHash,
            outcome: facts.outcome,
            pefConformityQualified: facts.pefConformityQualified,
            scientificRankingQualified: facts.scientificRankingQualified,
            businessPilotQualified: facts.businessPilotQualified,
          }}
        />
      </details>
      <details>
        <summary>{t('requirements')}</summary>
        <Table
          rowKey='requirementId'
          pagination={false}
          scroll={{ x: 800 }}
          dataSource={facts.requirements}
          columns={[
            { title: t('requirement'), dataIndex: 'requirementId' },
            { title: t('machineState'), render: (_, row) => <span>{row.machine.status}</span> },
            {
              title: t('professionalState'),
              render: (_, row) => <span>{row.professional.status}</span>,
            },
            { title: t('source'), render: (_, row) => <ExactRecord value={row} /> },
          ]}
        />
      </details>
      <details>
        <summary>{t('categoryRoles')}</summary>
        <Table
          rowKey={(row) => row.methodRef.id}
          pagination={false}
          scroll={{ x: 800 }}
          dataSource={facts.categories}
          columns={[
            { title: t('methods'), dataIndex: 'name' },
            { title: t('role'), dataIndex: 'role' },
            {
              title: t('value'),
              render: (_, row) => row.canonicalCharacterisedValue ?? t('unknown'),
            },
            { title: t('source'), render: (_, row) => <ExactRecord value={row} /> },
          ]}
        />
      </details>
      <Field label={t('reportTitle')}>
        <Input
          aria-label={t('reportTitle')}
          disabled={readonly}
          value={draft.title}
          maxLength={256}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </Field>
      <Typography.Paragraph>{t('claimSelectionNote')}</Typography.Paragraph>
      <Table
        rowKey='factId'
        pagination={false}
        scroll={{ x: 850 }}
        dataSource={facts.factCatalog}
        columns={[
          {
            title: t('select'),
            render: (_, fact) => (
              <Checkbox
                aria-label={fact.factId}
                disabled={readonly}
                checked={selectedIds.includes(fact.factId)}
                onChange={(e) =>
                  updateClaims(
                    e.target.checked
                      ? [...selectedIds, fact.factId]
                      : selectedIds.filter((id) => id !== fact.factId),
                  )
                }
              />
            ),
          },
          { title: t('fact'), dataIndex: 'factId' },
          { title: t('value'), render: (_, fact) => fact.canonicalValue ?? t('unknown') },
          { title: t('unit'), dataIndex: 'unit' },
          {
            title: t('source'),
            render: (_, fact) => (
              <details>
                <summary>{t('source')}</summary>
                <ExactRecord value={fact} />
              </details>
            ),
          },
        ]}
      />
      {draft.sections.map((section, index) => (
        <Space key={section.sectionId} orientation='vertical' style={{ width: '100%' }}>
          <Field label={t('sectionTitle')}>
            <Input
              aria-label={`${t('sectionTitle')} ${index + 1}`}
              disabled={readonly}
              value={section.title}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sections: draft.sections.map((s, i) =>
                    i === index ? { ...s, title: e.target.value } : s,
                  ),
                })
              }
              maxLength={256}
            />
          </Field>
          {section.paragraphs.map((paragraph, p) => (
            <Field key={p} label={t('narrative')}>
              <Input.TextArea
                aria-label={`${t('narrative')} ${index + 1}.${p + 1}`}
                disabled={readonly}
                value={paragraph}
                maxLength={2048}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    sections: draft.sections.map((s, i) =>
                      i === index
                        ? {
                            ...s,
                            paragraphs: s.paragraphs.map((value, j) =>
                              j === p ? e.target.value : value,
                            ),
                          }
                        : s,
                    ),
                  })
                }
              />
            </Field>
          ))}
        </Space>
      ))}
      <Button
        disabled={readonly || draft.sections.length >= 32}
        onClick={() =>
          setDraft({
            ...draft,
            sections: [
              ...draft.sections,
              { sectionId: `section-${newWriteKey()}`, title: '', paragraphs: [''], claimIds: [] },
            ],
          })
        }
      >
        {t('addSection')}
      </Button>
      {initial && (
        <details>
          <summary>{t('historical')}</summary>
          <ExactRecord value={initial} />
        </details>
      )}
      {report && (
        <>
          <ExactRecord value={report} />
          {report.status === 'frozen' && (
            <>
              <a href={`#${reportHref(report.reportRevisionId, report.contentHash, 'v6')}`}>
                {t('openReport')}
              </a>
              <Checkbox checked={successor} onChange={(e) => setSuccessor(e.target.checked)}>
                {t('createSuccessor')}
              </Checkbox>
            </>
          )}
        </>
      )}
      <WriteState write={write} />
      <Space wrap>
        <Button
          disabled={
            readonly ||
            !draft.title.trim() ||
            !draft.claims.length ||
            !available(report && !successor ? 'report.save' : 'report.create')
          }
          onClick={() => save()}
        >
          {t(report && !successor ? 'saveMethodReport' : 'createMethodReport')}
        </Button>
        {report?.status === 'draft' && (
          <Button
            disabled={
              !available('report.freeze') || JSON.stringify(draft) !== JSON.stringify(initial)
            }
            onClick={() => save(true)}
          >
            {t('freezeMethodReport')}
          </Button>
        )}
      </Space>
    </Space>
  );
}
function MethodReportAuthor({
  studyId,
  selected,
  canWrite,
  operations,
}: {
  studyId: string;
  selected?: { assessment: Assessment; facts: MethodFacts };
  canWrite: boolean;
  operations: MethodRequest['operation'][];
}) {
  const t = useStudyText();
  const [id, setId] = useState('');
  const query = useStudyQuery(`${studyId}:${id}`, async () => {
    if (!id) return undefined;
    const report = expectType(
      await method({ operation: 'report.read', reportRevisionId: id }),
      'reportRevision',
    ).value;
    if (report.studyId !== studyId) throw new StudyRequestError('REFERENCE_MISMATCH', false);
    const assessment = expectType(
      await method({
        operation: 'method.assessment.read',
        assessmentId: report.methodAssessmentIds[0],
      }),
      'methodAssessment',
    ).value;
    const [stored, facts, actions] = await Promise.all([
      readMethodReport(report),
      readMethodFacts(assessment),
      method({ operation: 'resource.actions', resource: { type: 'reportRevision', id } }).then(
        (data) => expectType(data, 'actions'),
      ),
    ]);
    return { report, assessment, facts, stored, actions };
  });
  const source =
    query.data ??
    (!id && selected
      ? { ...selected, report: undefined, stored: undefined, actions: undefined }
      : undefined);
  return (
    <Card title={t('methodReport')}>
      <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
        <Field label={t('reportId')}>
          <Input aria-label={t('reportId')} value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Button onClick={() => setId('')}>{t('newMethodReport')}</Button>
        <MethodResources studyId={studyId} kind='reportRevision' onSelect={setId} />
        <QueryState {...query} retry={query.refresh} />
        {source && (
          <MethodDraftEditor
            key={
              source.report
                ? `${source.report.reportRevisionId}:${source.report.revision}`
                : source.assessment.assessmentId
            }
            studyId={studyId}
            assessment={source.assessment}
            facts={source.facts}
            report={source.report}
            initial={source.stored?.content}
            canWrite={canWrite}
            allowed={
              source.actions
                ? [
                    ...source.actions.actions,
                    ...operations.filter((operation) => operation === 'report.create'),
                  ]
                : operations
            }
            onSaved={(result) => {
              setId(result.reportRevisionId);
              query.refresh();
            }}
          />
        )}
      </Space>
    </Card>
  );
}

export default function MethodWorkspace({
  studyId,
  canWrite,
}: {
  studyId: string;
  canWrite: boolean;
}) {
  const t = useStudyText();
  const capability = useStudyQuery(`method:${studyId}`, () =>
    method({ operation: 'capability.read' }).then((data) => expectType(data, 'capabilities')),
  );
  const [selected, setSelected] = useState<{ assessment: Assessment; facts: MethodFacts }>();
  return (
    <Space orientation='vertical' size='large' style={{ width: '100%' }}>
      <Typography.Paragraph>{t('methodQualificationNote')}</Typography.Paragraph>
      <QueryState {...capability} retry={capability.refresh}>
        {capability.data && (
          <>
            {!capability.data.runtimeEnabled && <Tag>{t('actionsUnavailable')}</Tag>}
            <MethodAssessment
              studyId={studyId}
              canWrite={canWrite && capability.data.runtimeEnabled}
              canRecordEvidence={capability.data.operations.includes('method.evidence.create')}
              canRequest={capability.data.operations.includes('method.assessment.request')}
              onFacts={(assessment, facts) => setSelected({ assessment, facts })}
            />
            <MethodReportAuthor
              studyId={studyId}
              selected={selected}
              canWrite={canWrite && capability.data.runtimeEnabled}
              operations={capability.data.operations}
            />
          </>
        )}
      </QueryState>
    </Space>
  );
}
