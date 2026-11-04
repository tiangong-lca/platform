/** Platform-owned view protocol. It is not a numerical or authorization protocol. */
import { parseMethodView } from './methodProtocol.mjs';
import type { MethodReportSummary } from './methodProtocol.mjs';
export type { MethodReportSummary } from './methodProtocol.mjs';

export const VIEW_SCHEMA = 'lca.study-report-view.v3' as const;
export const RENDERER_VERSION = '3.0.0' as const;

export type MethodRef = { id: string; version: string };
export type CalculationContractRef = {
  kind: 'calculation_contract';
  schema: 'lca.calculation-contract.v1';
  sha256: string;
};
export type ReportFact = {
  factId: string;
  label: string;
  runIds: string[];
  methodRef: MethodRef | null;
  canonicalValue: string | null;
  unit: string;
  coverage: 'complete' | 'partial' | 'unknown';
  reasonCodes: string[];
  provenance:
    | { type: 'runResult' | 'analysisFacts'; id: string; contentHash: string }
    | { type: 'methodAssessmentFacts'; id: string; contentHash: string; sourceFactId: string };
};
export type ReportViewModel = {
  report: {
    studyId: string;
    reportRevisionId: string;
    contentHash: string;
    title: string;
    generatedAt: string;
  };
  definition: {
    goal: string;
    functionalUnit: { amount: string; unit: string; referenceFlowId: string };
    boundary: string;
    methodRefs: (MethodRef & { name: string; unit: string })[];
  };
  runs: {
    runId: string;
    scenarioRevisionId: string;
    label: string;
    inputHash: string;
    profileId: string;
    calculationContractRef: CalculationContractRef;
  }[];
  sections: {
    sectionId: string;
    title: string;
    paragraphs: string[];
    factIds: string[];
    citationIds: string[];
  }[];
  tables: { tableId: string; title: string; factIds: string[] }[];
  charts: { chartId: string; title: string; factIds: string[] }[];
  citations: {
    citationId: string;
    label: string;
    sourceType: 'datasetRevision' | 'releaseFinalResult' | 'document';
    identity: string;
    version: string;
    contentHash: string | null;
  }[];
  assumptions: string[];
  cutoffs: string[];
  limitations: string[];
  snapshot: {
    validity: 'current' | 'superseded' | 'withdrawn' | 'unknown';
    checkedAt: string;
    review: 'unreviewed' | 'reviewed';
    reviewIds: string[];
    finalization: 'not_finalized' | 'finalized';
  };
} & {
  schemaVersion: typeof VIEW_SCHEMA;
  rendererVersion: typeof RENDERER_VERSION;
  facts: ReportFact[];
  methodAssessment: MethodReportSummary;
};

/** Separate from projection bytes; no embedded key, signature or trust assertion is accepted. */
export type RenderContext = {
  exportId: string;
  projectionHash: string;
  verificationAtGeneration: 'unverified' | 'verified_by_trusted_exporter';
};

export class ReportViewError extends Error {
  constructor(public readonly path: string) {
    super(`Invalid report view at ${path}`);
    this.name = 'ReportViewError';
  }
}

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new ReportViewError(path);
}

function record(value: unknown, keys: string[], path: string): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path);
  const result = value as Record<string, unknown>;
  requireValue(
    Object.keys(result).length === keys.length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(result, key)),
    path,
  );
  return result;
}

function text(value: unknown, path: string, max = 2048): asserts value is string {
  requireValue(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= max &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    path,
  );
}

function id(value: unknown, path: string): asserts value is string {
  requireValue(
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value),
    path,
  );
}

function hash(value: unknown, path: string): asserts value is string {
  requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), path);
}

function timestamp(value: unknown, path: string) {
  requireValue(typeof value === 'string', path);
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  requireValue(parts, path);
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(
    month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= days[month - 1] &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59 &&
      (!parts[7] || (Number(parts[8]) <= 23 && Number(parts[9]) <= 59)),
    path,
  );
}

function choice(value: unknown, choices: readonly string[], path: string) {
  requireValue(typeof value === 'string' && choices.includes(value), path);
}

function array(value: unknown, path: string, max: number, min = 0): unknown[] {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, path);
  return value;
}

function texts(value: unknown, path: string, max = 64): void {
  array(value, path, max).forEach((item, i) => text(item, `${path}/${i}`));
}

function ids(value: unknown, path: string, max: number, min = 0): string[] {
  const values = array(value, path, max, min);
  values.forEach((item, i) => id(item, `${path}/${i}`));
  requireValue(new Set(values).size === values.length, path);
  return values as string[];
}

function method(value: unknown, path: string, expanded = false): Record<string, unknown> {
  const item = record(
    value,
    expanded ? ['id', 'version', 'name', 'unit'] : ['id', 'version'],
    path,
  );
  id(item.id, `${path}/id`);
  requireValue(
    typeof item.version === 'string' && /^\d{2}\.\d{2}\.\d{3}$/u.test(item.version),
    path,
  );
  if (expanded) {
    text(item.name, `${path}/name`, 256);
    text(item.unit, `${path}/unit`, 128);
  }
  return item;
}

/** A bounded decimal spelling, never converted through Number for validation or display. */
export function isCanonicalDecimal(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?(?:e-?[1-9]\d{0,2})?$/u.test(value) &&
    (!value.includes('e') || Math.abs(Number(value.split('e')[1])) <= 324) &&
    (!/^-?0(?:e.*)?$/u.test(value) || value === '0')
  );
}

export function validateReportView(
  input: unknown,
  expectedRendererVersion: string = RENDERER_VERSION,
): ReportViewModel {
  const v = record(
    input,
    [
      'schemaVersion',
      'rendererVersion',
      'report',
      'definition',
      'runs',
      'facts',
      'sections',
      'tables',
      'charts',
      'citations',
      'assumptions',
      'cutoffs',
      'limitations',
      'snapshot',
      'methodAssessment',
    ],
    '/',
  );
  requireValue(
    expectedRendererVersion === RENDERER_VERSION &&
      v.schemaVersion === VIEW_SCHEMA &&
      v.rendererVersion === RENDERER_VERSION,
    '/version',
  );
  const report = record(
    v.report,
    ['studyId', 'reportRevisionId', 'contentHash', 'title', 'generatedAt'],
    '/report',
  );
  id(report.studyId, '/report/studyId');
  id(report.reportRevisionId, '/report/reportRevisionId');
  hash(report.contentHash, '/report/contentHash');
  text(report.title, '/report/title', 256);
  timestamp(report.generatedAt, '/report/generatedAt');
  const definition = record(
    v.definition,
    ['goal', 'functionalUnit', 'boundary', 'methodRefs'],
    '/definition',
  );
  text(definition.goal, '/definition/goal', 4096);
  text(definition.boundary, '/definition/boundary', 4096);
  const fu = record(
    definition.functionalUnit,
    ['amount', 'unit', 'referenceFlowId'],
    '/definition/functionalUnit',
  );
  requireValue(
    typeof fu.amount === 'string' &&
      fu.amount.length <= 64 &&
      /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/u.test(fu.amount),
    '/definition/functionalUnit/amount',
  );
  text(fu.unit, '/definition/functionalUnit/unit', 128);
  id(fu.referenceFlowId, '/definition/functionalUnit/referenceFlowId');
  const methods = array(definition.methodRefs, '/definition/methodRefs', 32, 1).map((m, i) =>
    method(m, `/definition/methodRefs/${i}`, true),
  );
  requireValue(new Set(methods.map((m) => m.id)).size === methods.length, '/definition/methodRefs');
  const runs = array(v.runs, '/runs', 32, 1).map((item, i) => {
    const p = `/runs/${i}`;
    const run = record(
      item,
      ['runId', 'scenarioRevisionId', 'label', 'inputHash', 'profileId', 'calculationContractRef'],
      p,
    );
    ['runId', 'scenarioRevisionId', 'profileId'].forEach((key) => id(run[key], `${p}/${key}`));
    text(run.label, `${p}/label`, 256);
    hash(run.inputHash, `${p}/inputHash`);
    const calculation = record(
      run.calculationContractRef,
      ['kind', 'schema', 'sha256'],
      `${p}/calculationContractRef`,
    );
    requireValue(
      calculation.kind === 'calculation_contract' &&
        calculation.schema === 'lca.calculation-contract.v1',
      `${p}/calculationContractRef`,
    );
    hash(calculation.sha256, `${p}/calculationContractRef/sha256`);
    return run;
  });
  const runIds = runs.map((r) => r.runId);
  requireValue(new Set(runIds).size === runs.length, '/runs');
  const facts = array(v.facts, '/facts', 2048, 1).map((item, i) => {
    const p = `/facts/${i}`;
    const fact = record(
      item,
      [
        'factId',
        'label',
        'runIds',
        'methodRef',
        'canonicalValue',
        'unit',
        'coverage',
        'reasonCodes',
        'provenance',
      ],
      p,
    );
    id(fact.factId, `${p}/factId`);
    text(fact.label, `${p}/label`, 1024);
    requireValue(
      ids(fact.runIds, `${p}/runIds`, 32, 1).every((r) => runIds.includes(r)),
      `${p}/runIds`,
    );
    text(fact.unit, `${p}/unit`, 128);
    if (fact.methodRef !== null) {
      const selected = method(fact.methodRef, `${p}/methodRef`);
      const defined = methods.find((m) => m.id === selected.id && m.version === selected.version);
      // The reference identifies category provenance. Relative deltas can have unit "1";
      // the producer/claim verifier owns quantity semantics, never this view-only layer.
      requireValue(defined, `${p}/methodRef`);
    }
    requireValue(
      fact.canonicalValue === null || isCanonicalDecimal(fact.canonicalValue),
      `${p}/canonicalValue`,
    );
    choice(fact.coverage, ['complete', 'partial', 'unknown'], `${p}/coverage`);
    requireValue(fact.coverage !== 'unknown' || fact.canonicalValue === null, `${p}/coverage`);
    array(fact.reasonCodes, `${p}/reasonCodes`, 32).forEach((code, index) =>
      text(code, `${p}/reasonCodes/${index}`, 128),
    );
    const methodSource =
      fact.provenance !== null &&
      typeof fact.provenance === 'object' &&
      'type' in fact.provenance &&
      fact.provenance.type === 'methodAssessmentFacts';
    const source = record(
      fact.provenance,
      methodSource ? ['type', 'id', 'contentHash', 'sourceFactId'] : ['type', 'id', 'contentHash'],
      `${p}/provenance`,
    );
    choice(
      source.type,
      methodSource ? ['methodAssessmentFacts'] : ['runResult', 'analysisFacts'],
      `${p}/provenance/type`,
    );
    if (methodSource) id(source.sourceFactId, `${p}/provenance/sourceFactId`);
    id(source.id, `${p}/provenance/id`);
    hash(source.contentHash, `${p}/provenance/contentHash`);
    return fact;
  });
  const factIds = facts.map((f) => f.factId);
  requireValue(new Set(factIds).size === facts.length, '/facts');
  const citations = array(v.citations, '/citations', 2048).map((item, i) => {
    const p = `/citations/${i}`;
    const citation = record(
      item,
      ['citationId', 'label', 'sourceType', 'identity', 'version', 'contentHash'],
      p,
    );
    id(citation.citationId, `${p}/citationId`);
    text(citation.label, `${p}/label`, 256);
    choice(
      citation.sourceType,
      ['datasetRevision', 'releaseFinalResult', 'document'],
      `${p}/sourceType`,
    );
    id(citation.identity, `${p}/identity`);
    text(citation.version, `${p}/version`, 128);
    if (citation.sourceType === 'datasetRevision') {
      requireValue(
        typeof citation.version === 'string' && /^\d{2}\.\d{2}\.\d{3}$/u.test(citation.version),
        `${p}/version`,
      );
    }
    if (citation.contentHash !== null) hash(citation.contentHash, `${p}/contentHash`);
    return citation;
  });
  const citationIds = citations.map((c) => c.citationId);
  requireValue(new Set(citationIds).size === citations.length, '/citations');
  const sections = array(v.sections, '/sections', 32).map((item, i) => {
    const p = `/sections/${i}`;
    const section = record(item, ['sectionId', 'title', 'paragraphs', 'factIds', 'citationIds'], p);
    id(section.sectionId, `${p}/sectionId`);
    text(section.title, `${p}/title`, 256);
    texts(section.paragraphs, `${p}/paragraphs`, 32);
    requireValue(
      ids(section.factIds, `${p}/factIds`, 256).every((f) => factIds.includes(f)),
      `${p}/factIds`,
    );
    requireValue(
      ids(section.citationIds, `${p}/citationIds`, 64).every((c) => citationIds.includes(c)),
      `${p}/citationIds`,
    );
    return section.sectionId;
  });
  requireValue(new Set(sections).size === sections.length, '/sections');
  for (const kind of ['tables', 'charts'] as const) {
    const key = kind === 'tables' ? 'tableId' : 'chartId';
    const entries = array(v[kind], `/${kind}`, 32).map((item, i) => {
      const p = `/${kind}/${i}`;
      const entry = record(item, [key, 'title', 'factIds'], p);
      id(entry[key], `${p}/${key}`);
      text(entry.title, `${p}/title`, 256);
      const selected = ids(entry.factIds, `${p}/factIds`, kind === 'charts' ? 64 : 2048, 1);
      requireValue(
        selected.every((f) => factIds.includes(f)),
        `${p}/factIds`,
      );
      if (kind === 'charts') {
        const chartFacts = selected.map((f) => facts.find((fact) => fact.factId === f)!);
        requireValue(
          chartFacts.every((f) => {
            const ref = f.methodRef as Record<string, unknown> | null;
            const first = chartFacts[0].methodRef as Record<string, unknown> | null;
            return (
              f.unit === chartFacts[0].unit &&
              (ref === null || first === null
                ? ref === first
                : ref.id === first.id && ref.version === first.version)
            );
          }),
          `${p}/methodRef`,
        );
      }
      return entry[key];
    });
    requireValue(new Set(entries).size === entries.length, `/${kind}`);
  }
  array(v.assumptions, '/assumptions', 128).forEach((item, i) =>
    text(item, `/assumptions/${i}`, 8192),
  );
  texts(v.cutoffs, '/cutoffs', 512);
  texts(v.limitations, '/limitations');
  requireValue((v.limitations as unknown[]).length > 0, '/limitations');
  const snapshot = record(
    v.snapshot,
    ['validity', 'checkedAt', 'review', 'reviewIds', 'finalization'],
    '/snapshot',
  );
  choice(
    snapshot.validity,
    ['current', 'superseded', 'withdrawn', 'unknown'],
    '/snapshot/validity',
  );
  timestamp(snapshot.checkedAt, '/snapshot/checkedAt');
  choice(snapshot.review, ['unreviewed', 'reviewed'], '/snapshot/review');
  const reviews = ids(snapshot.reviewIds, '/snapshot/reviewIds', 64);
  requireValue((snapshot.review === 'reviewed') === reviews.length > 0, '/snapshot/reviewIds');
  choice(snapshot.finalization, ['not_finalized', 'finalized'], '/snapshot/finalization');
  try {
    parseMethodView(input);
  } catch {
    throw new ReportViewError('/methodAssessment');
  }
  // Bound total serialized disclosure as well as individual fields.
  requireValue(new TextEncoder().encode(JSON.stringify(input)).length <= 2_000_000, '/size');
  return input as ReportViewModel;
}

export function validateRenderContext(input: unknown): RenderContext {
  const v = record(input, ['exportId', 'projectionHash', 'verificationAtGeneration'], '/context');
  id(v.exportId, '/context/exportId');
  hash(v.projectionHash, '/context/projectionHash');
  choice(
    v.verificationAtGeneration,
    ['unverified', 'verified_by_trusted_exporter'],
    '/context/verificationAtGeneration',
  );
  return input as RenderContext;
}
