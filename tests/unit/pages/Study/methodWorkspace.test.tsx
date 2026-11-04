import * as owner from '../../../../vendor/study-contract/v6/index.mjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MethodWorkspace from '@/pages/Study/MethodWorkspace';
import facts from '../../../fixtures/study-method/facts.json';
import worker from '../../../fixtures/study-method/worker.json';
import storedFixture from '@/standalone/studyReport/methodProtocol.fixture.json';

const mockRecover = jest.fn();
const mockMethod = jest.fn(),
  mockPending = jest.fn(),
  mockFacts = jest.fn(),
  mockEvidence = jest.fn(),
  mockReport = jest.fn(),
  mockConfigHash = jest.fn();
let mockCanCreate = true;
const assessment = worker.record;
const studyId = assessment.studyId;
const reportId = '10000000-0000-4000-8000-000000000300';
const evidenceId = '10000000-0000-4000-8000-000000000703';
const evidence = {
  evidenceId,
  studyId,
  requirementId: 'PEF-01',
  declaredKind: 'sourceRecord',
  status: 'recorded_unverified',
  artifactRef: {
    type: 'methodEvidence',
    id: evidenceId,
    contentHash: 'a'.repeat(64),
    byteSize: 40,
    digestScope: 'artifact_bytes_sha256',
    mediaType: 'application/json',
    schemaVersion: 'lca.study-method-evidence.v1',
  },
};
let report: any;
const actions = ['task.cancel', 'report.save', 'report.freeze'];
const operations = [
  'capability.read',
  'method.evidence.create',
  'method.assessment.request',
  'report.create',
  ...actions,
];
jest.mock('@umijs/max', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  method: (...args: unknown[]) => mockMethod(...args),
  prepareMethodRequest: async (prepare: () => Promise<unknown>, workflow: string) =>
    mockMethod(await prepare(), workflow),
  recoverPendingStudyWrite: (...args: unknown[]) => mockRecover(...args),
  newWriteKey: () => 'fixed-key',
  readPendingStudyWrite: (...args: unknown[]) => mockPending(...args),
  subscribePendingStudyWrites: () => () => {},
  subscribeStudyIdentityChange: () => () => {},
}));
jest.mock('@/services/study/method', () => ({
  methodConfigHash: (...args: unknown[]) => mockConfigHash(...args),
  readMethodFacts: (...args: unknown[]) => mockFacts(...args),
  readMethodEvidence: (...args: unknown[]) => mockEvidence(...args),
  readMethodReport: (...args: unknown[]) => mockReport(...args),
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanCreate = true;
  mockPending.mockResolvedValue({ pending: false, raw: null });
  mockFacts.mockResolvedValue(facts);
  mockEvidence.mockResolvedValue({ statement: 'Recorded without approval', citations: [] });
  mockConfigHash.mockResolvedValue('c'.repeat(64));
  report = {
    ...storedFixture.binding.assessment,
    reportRevisionId: reportId,
    studyId,
    methodAssessmentIds: [assessment.assessmentId],
    revision: 1,
    status: 'draft',
    contentHash: 'b'.repeat(64),
    runIds: [assessment.config.baselineRunId],
  };
  mockReport.mockResolvedValue(storedFixture.stored);
  mockMethod.mockImplementation(async (q: any) => {
    switch (q.operation) {
      case 'capability.read':
        return {
          type: 'capabilities',
          runtimeEnabled: true,
          operations: mockCanCreate ? operations : [],
          methodProfiles: [],
          reportTemplates: [],
        };
      case 'study.resources.list':
        return { type: 'resourcePage', studyId, kind: q.kind, items: [], nextCursor: null };
      case 'method.assessment.read':
        return { type: 'methodAssessment', value: assessment };
      case 'method.assessment.request':
        return { type: 'methodAssessment', value: assessment };
      case 'method.evidence.read':
      case 'method.evidence.create':
        return { type: 'methodEvidence', value: evidence };
      case 'task.read':
      case 'task.cancel':
        return {
          type: 'task',
          value: {
            studyId,
            resource: { type: 'methodAssessment', id: assessment.assessmentId },
            execution: { status: 'completed', jobId: 'owned-job' },
            errorCode: null,
          },
        };
      case 'resource.actions':
        return { type: 'actions', resource: q.resource, actions };
      case 'report.read':
        return { type: 'reportRevision', value: report };
      case 'report.create':
      case 'report.save':
      case 'report.freeze':
        report = {
          ...report,
          revision: report.revision + 1,
          status: q.operation === 'report.freeze' ? 'frozen' : 'draft',
        };
        if (q.content)
          mockReport.mockResolvedValue({ ...storedFixture.stored, content: q.content });
        return { type: 'reportRevision', value: report };
      default:
        throw new Error(q.operation);
    }
  });
});
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

it('records source-bound unverified evidence and requests an owner-hashed declared assessment', async () => {
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change('pages.study.evidenceTitle', 'Declared source');
  change('pages.study.statement', 'No approval is claimed');
  click('pages.study.recordEvidence');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'method.evidence.create',
        content: expect.objectContaining({
          title: 'Declared source',
          statement: 'No approval is claimed',
        }),
      }),
      `study:${studyId}`,
    ),
  );
  await screen.findByRole('button', { name: 'pages.study.selectEvidence' });
  click('pages.study.selectEvidence');
  click('pages.study.selectEvidence');
  change('pages.study.baselineRun', assessment.config.baselineRunId);
  click('pages.study.requestAssessment');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'method.assessment.request',
        configHash: 'c'.repeat(64),
        config: expect.objectContaining({
          evidenceRefs: [
            {
              requirementId: evidence.requirementId,
              declaredKind: evidence.declaredKind,
              artifactRef: evidence.artifactRef,
            },
          ],
        }),
      }),
      `study:${studyId}`,
    ),
  );
  expect(mockConfigHash).toHaveBeenCalledWith(
    expect.objectContaining({ baselineRunId: assessment.config.baselineRunId }),
  );
  expect(screen.getByText('pages.study.methodQualificationNote')).toBeInTheDocument();
});

it('reads all mandatory owner facts independently of selection and creates exact copied claims', async () => {
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.requestAssessment' });
  change('pages.study.assessmentId', assessment.assessmentId);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.readMethodFacts' })).toBeEnabled(),
  );
  click('pages.study.readMethodFacts');
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  expect(mockFacts).toHaveBeenCalledWith(assessment);
  expect(screen.getAllByRole('checkbox', { hidden: true })).toHaveLength(58);
  expect(document.querySelectorAll('tr[data-row-key^="PEF-"]')).toHaveLength(20);
  expect(document.querySelectorAll('tbody')[1].querySelectorAll('tr[data-row-key]')).toHaveLength(
    25,
  );
  change('pages.study.reportTitle', 'Exact method report');
  const fact = facts.factCatalog[0];
  fireEvent.click(screen.getByRole('checkbox', { name: fact.factId }));
  click('pages.study.addSection');
  change('pages.study.sectionTitle 1', 'Declared narrative');
  change('pages.study.narrative 1.1', 'A source-bound account without approval');
  click('pages.study.createMethodReport');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'report.create',
        runIds: [assessment.config.baselineRunId],
        methodAssessmentIds: [assessment.assessmentId],
        content: expect.objectContaining({
          claims: [
            expect.objectContaining({
              factId: fact.factId,
              canonicalValue: fact.canonicalValue,
              unit: fact.unit,
              bundleRef: assessment.factsRef,
            }),
          ],
        }),
      }),
      `study:${studyId}`,
    ),
  );
});

it('reopens the stored draft, preserves its presentation, and freezes only the saved revision', async () => {
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.requestAssessment' });
  change('pages.study.reportId', reportId);
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  expect(mockReport).toHaveBeenCalledWith(report);
  expect(screen.getByRole('textbox', { name: 'pages.study.reportTitle' })).toHaveValue(
    storedFixture.stored.content.title,
  );
  change('pages.study.reportTitle', 'Revised title');
  expect(screen.getByRole('button', { name: 'pages.study.freezeMethodReport' })).toBeDisabled();
  click('pages.study.saveMethodReport');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'report.save',
        target: { type: 'reportRevision', id: reportId, expectedRevision: 1 },
        content: { ...storedFixture.stored.content, title: 'Revised title' },
      }),
      `report6:${reportId}`,
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.freezeMethodReport' })).toBeEnabled(),
  );
  click('pages.study.freezeMethodReport');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'report.freeze',
        target: { type: 'reportRevision', id: reportId, expectedRevision: 2 },
        expectedContentHash: report.contentHash,
      }),
      `report6:${reportId}`,
    ),
  );
});

it('keeps frozen predecessors immutable and explicitly creates a successor', async () => {
  report.status = 'frozen';
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.requestAssessment' });
  change('pages.study.reportId', reportId);
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  expect(screen.getByRole('textbox', { name: 'pages.study.reportTitle' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'pages.study.openReport' })).toHaveAttribute(
    'href',
    `#/study-report?id=${reportId}&hash=${report.contentHash}&api=6`,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'pages.study.createSuccessor' }));
  click('pages.study.createMethodReport');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'report.create',
        parentReportRevisionId: reportId,
        content: storedFixture.stored.content,
      }),
      `report6:${reportId}`,
    ),
  );
  expect(mockMethod.mock.calls.some(([q]) => q.operation === 'report.save')).toBe(false);
});

it('denies authoring without current core write permission', async () => {
  render(<MethodWorkspace studyId={studyId} canWrite={false} />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change('pages.study.evidenceTitle', 'Source');
  change('pages.study.statement', 'Evidence');
  expect(screen.getByRole('button', { name: 'pages.study.recordEvidence' })).toBeDisabled();
  change('pages.study.baselineRun', assessment.config.baselineRunId);
  expect(screen.getByRole('button', { name: 'pages.study.requestAssessment' })).toBeDisabled();
  expect(mockMethod.mock.calls.every(([q]) => !q.idempotencyKey)).toBe(true);
});

async function choose(label: string, option: string) {
  fireEvent.mouseDown(screen.getAllByRole('combobox', { name: label })[0]);
  fireEvent.click(await screen.findByText(option, { selector: '.ant-select-item-option-content' }));
}

it('authors multiple citations and commission-rule declarations without changing their meaning', async () => {
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  click('pages.study.addCitation');
  click('pages.study.addCitation');
  await choose('pages.study.citationKind', 'pages.study.normativeSource');
  for (const n of [1, 2]) {
    change(`pages.study.identity ${n}`, `Source ${n}`);
    change(`pages.study.version ${n}`, '1');
    change(`pages.study.locator ${n}`, 'Section 1');
    change(`pages.study.contentHash ${n}`, 'a'.repeat(64));
  }
  change('pages.study.contentHash 1', '');
  change('pages.study.identity 1', '');
  change('pages.study.identity 1', 'Restored source');
  const remove = screen.getAllByRole('button', { name: 'pages.study.remove' });
  fireEvent.click(remove[0]);
  change('pages.study.evidenceTitle', 'Evidence');
  change('pages.study.statement', 'A recorded declaration');
  click('pages.study.recordEvidence');
  await screen.findByRole('button', { name: 'pages.study.selectEvidence' });
  click('pages.study.selectEvidence');
  await choose('pages.study.studyPhase', 'pages.study.finalStudy');
  await choose('pages.study.categoryRule', 'pages.study.commissionDeveloped');
  change('pages.study.ruleReference', 'Declared rule');
  change('pages.study.version', '1');
  change('pages.study.ruleEvidence', evidenceId);
  // One remove control belongs to the citation, the second to the selected evidence.
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.remove' })[1]);
  change('pages.study.baselineRun', assessment.config.baselineRunId);
  click('pages.study.requestAssessment');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'method.assessment.request',
        config: expect.objectContaining({
          declarations: expect.objectContaining({
            studyPhase: 'finalStudy',
            categoryRule: {
              kind: 'commissionDeveloped',
              referenceId: 'Declared rule',
              version: '1',
              evidenceId,
            },
          }),
          evidenceRefs: [],
        }),
      }),
      `study:${studyId}`,
    ),
  );
  await screen.findByRole('textbox', { name: 'pages.study.cancelReason' });
  change('pages.study.cancelReason', 'User requested cancellation');
  click('pages.study.cancelAssessment');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'task.cancel',
        resource: { type: 'methodAssessment', id: assessment.assessmentId },
        reason: 'User requested cancellation',
      }),
      `study:${studyId}`,
    ),
  );
});

it('uses typed resource pages and independent cursors to reopen exact selected resources', async () => {
  const base = mockMethod.getMockImplementation()!;
  mockMethod.mockImplementation(async (q) =>
    q.operation === 'study.resources.list'
      ? {
          type: 'resourcePage',
          studyId,
          kind: q.kind,
          items: [{ type: q.kind, value: q.kind === 'methodAssessment' ? assessment : report }],
          nextCursor: q.cursor ? null : 'page-next',
        }
      : base(q),
  );
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: assessment.assessmentId });
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.next' })[0]);
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'study.resources.list',
        kind: 'methodAssessment',
        cursor: 'page-next',
      }),
    ),
  );
  await screen.findByRole('button', { name: assessment.assessmentId });
  fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.refresh' })[0]);
  await screen.findByRole('button', { name: assessment.assessmentId });
  click(assessment.assessmentId);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'pages.study.readMethodFacts' })).toBeEnabled(),
  );
  click(reportId);
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  click('pages.study.newMethodReport');
  expect(
    screen.queryByRole('textbox', { name: 'pages.study.reportTitle' }),
  ).not.toBeInTheDocument();
});

it.each([
  ['method.evidence.read', 'pages.study.evidenceId', evidenceId, 'methodEvidence'],
  [
    'method.assessment.read',
    'pages.study.assessmentId',
    assessment.assessmentId,
    'methodAssessment',
  ],
  ['report.read', 'pages.study.reportId', reportId, 'reportRevision'],
])('rejects a foreign Study returned by %s', async (operation, label, id, type) => {
  const base = mockMethod.getMockImplementation()!;
  mockMethod.mockImplementation(async (q) =>
    q.operation === operation
      ? {
          type,
          value: {
            ...(type === 'methodEvidence'
              ? evidence
              : type === 'methodAssessment'
                ? assessment
                : report),
            studyId: 'foreign-study',
          },
        }
      : base(q),
  );
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change(label, id);
  await screen.findByText('REFERENCE_MISMATCH');
  expect(mockFacts).not.toHaveBeenCalled();
  expect(mockEvidence).not.toHaveBeenCalled();
  expect(mockReport).not.toHaveBeenCalled();
});

it('shows unavailable runtime explicitly and prevents authoring even with core permission', async () => {
  const base = mockMethod.getMockImplementation()!;
  mockMethod.mockImplementation(async (q) =>
    q.operation === 'capability.read'
      ? { type: 'capabilities', runtimeEnabled: false, operations: [] }
      : base(q),
  );
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByText('pages.study.actionsUnavailable');
  expect(screen.getByRole('button', { name: 'pages.study.recordEvidence' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'pages.study.requestAssessment' })).toBeDisabled();
});

it('retains unaffected authored content while explicit fact deselection removes only its references', async () => {
  const original = storedFixture.stored.content,
    second = facts.factCatalog[1];
  const c2 = {
    ...original.claims[0],
    claimId: 'second-claim',
    factId: second.factId,
    canonicalValue: second.canonicalValue,
    unit: second.unit,
  };
  const content = {
    ...original,
    claims: [...original.claims, c2],
    sections: [
      {
        sectionId: 'first-section',
        title: 'First',
        claimIds: [original.claims[0].claimId],
        paragraphs: ['One', 'Two'],
      },
      {
        sectionId: 'second-section',
        title: 'Second',
        claimIds: [c2.claimId],
        paragraphs: ['Three', 'Four'],
      },
    ],
    tables: [
      { tableId: 'first-table', title: 'Removed table', claimIds: [original.claims[0].claimId] },
      { tableId: 'second-table', title: 'Retained table', claimIds: [c2.claimId] },
    ],
    charts: [
      {
        chartId: 'first-chart',
        title: 'Removed selection',
        claimIds: [original.claims[0].claimId],
      },
      { chartId: 'second-chart', title: 'Retained chart', claimIds: [c2.claimId] },
    ],
  };
  mockReport.mockResolvedValue({ ...storedFixture.stored, content });
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change('pages.study.reportId', reportId);
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  fireEvent.click(screen.getByRole('checkbox', { name: facts.factCatalog[2].factId }));
  fireEvent.click(screen.getByRole('checkbox', { name: facts.factCatalog[0].factId }));
  change('pages.study.sectionTitle 2', 'Changed second section');
  change('pages.study.narrative 2.2', 'Changed fourth paragraph');
  click('pages.study.saveMethodReport');
  await waitFor(() =>
    expect(mockMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'report.save',
        content: expect.objectContaining({
          tables: [{ tableId: 'second-table', title: 'Retained table', claimIds: [c2.claimId] }],
          charts: [{ chartId: 'second-chart', title: 'Retained chart', claimIds: [c2.claimId] }],
          sections: [
            expect.objectContaining({ paragraphs: ['One', 'Two'] }),
            expect.objectContaining({
              title: 'Changed second section',
              paragraphs: ['Three', 'Changed fourth paragraph'],
            }),
          ],
        }),
      }),
      `report6:${reportId}`,
    ),
  );
});

it.each([
  ['methodEvidence', 0, 'pages.study.evidenceId', evidenceId],
  ['methodAssessment', 1, 'pages.study.assessmentId', assessment.assessmentId],
  ['unrelated', 0, 'pages.study.evidenceId', ''],
  ['unrelated', 1, 'pages.study.assessmentId', ''],
])(
  'adopts only matching %s recovery responses for the mounted method stage',
  async (type, index, label, expected) => {
    mockPending.mockResolvedValue({
      pending: true,
      raw: 'original-schema6-intent',
      request: { schemaVersion: 'lca.study-api.v6', operation: 'method.assessment.request' },
    });
    mockRecover.mockResolvedValue(
      type === 'methodEvidence'
        ? { type, value: evidence }
        : type === 'methodAssessment'
          ? { type, value: assessment }
          : { type: 'task', value: {} },
    );
    render(<MethodWorkspace studyId={studyId} canWrite />);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'pages.study.retry' })).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'pages.study.retry' })[Number(index)]);
    await waitFor(() => expect(mockRecover).toHaveBeenCalledWith(`study:${studyId}`));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: String(label) })).toHaveValue(expected),
    );
  },
);

it.each([true, false])(
  'adopts report recovery only for an exact report result (%s)',
  async (matches) => {
    mockPending.mockImplementation(async (workflow) =>
      workflow.startsWith('report6:')
        ? {
            pending: true,
            raw: 'exact-report-intent',
            request: { schemaVersion: 'lca.study-api.v6', operation: 'report.save' },
          }
        : { pending: false, raw: null },
    );
    mockRecover.mockResolvedValue(
      matches ? { type: 'reportRevision', value: report } : { type: 'task', value: {} },
    );
    render(<MethodWorkspace studyId={studyId} canWrite />);
    await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
    change('pages.study.reportId', reportId);
    await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
    const reads = mockMethod.mock.calls.filter(([q]) => q.operation === 'report.read').length;
    click('pages.study.retry');
    await waitFor(() => expect(mockRecover).toHaveBeenCalledWith(`report6:${reportId}`));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'pages.study.retry' })).not.toHaveClass(
        'ant-btn-loading',
      ),
    );
    await waitFor(() =>
      expect(mockMethod.mock.calls.filter(([q]) => q.operation === 'report.read')).toHaveLength(
        reads + Number(matches),
      ),
    );
  },
);

it('denies task cancellation when the selected assessment has no current cancel action', async () => {
  const base = mockMethod.getMockImplementation()!;
  mockMethod.mockImplementation(async (q) =>
    q.operation === 'resource.actions'
      ? { type: 'actions', resource: q.resource, actions: [] }
      : base(q),
  );
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change('pages.study.assessmentId', assessment.assessmentId);
  await screen.findByRole('textbox', { name: 'pages.study.cancelReason' });
  change('pages.study.cancelReason', 'Reason');
  expect(screen.getByRole('button', { name: 'pages.study.cancelAssessment' })).toBeDisabled();
});

it('preserves distinct legitimate claims for one fact and allocates collision-free IDs for new facts', async () => {
  const original = storedFixture.stored.content;
  const first = { ...original.claims[0], claimId: 'fact-2' };
  const duplicate = { ...first, claimId: 'second-authored-claim' };
  const content = {
    ...original,
    claims: [first, duplicate],
    sections: [
      {
        sectionId: 'authored',
        title: 'Separate authored claims',
        paragraphs: ['Both refer to the same supplied fact.'],
        claimIds: [first.claimId, duplicate.claimId],
      },
    ],
  };
  mockReport.mockResolvedValue({ ...storedFixture.stored, content });
  render(<MethodWorkspace studyId={studyId} canWrite />);
  await screen.findByRole('button', { name: 'pages.study.recordEvidence' });
  change('pages.study.reportId', reportId);
  await screen.findByRole('textbox', { name: 'pages.study.reportTitle' });
  fireEvent.click(screen.getByRole('checkbox', { name: facts.factCatalog[1].factId }));
  click('pages.study.saveMethodReport');
  await waitFor(() =>
    expect(mockMethod.mock.calls.some(([q]) => q.operation === 'report.save')).toBe(true),
  );
  const saved = mockMethod.mock.calls.find(([q]) => q.operation === 'report.save')![0];
  expect(saved.content.claims.slice(0, 2)).toEqual([first, duplicate]);
  expect(saved.content.claims[2].claimId).toBe('fact-2-1');
  expect(saved.content.sections).toEqual(content.sections);
  expect(() =>
    owner.parseRequest({
      ...saved,
      schemaVersion: 'lca.study-api.v6',
      requestId: 'duplicate-fact-regression',
    }),
  ).not.toThrow();
});
