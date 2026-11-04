import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import fixture from '../../fixtures/study-report/view-v3.json';
import legacy from '../../fixtures/study-report/view-v2.json';
import forgedNw from '../../fixtures/study-report/summary-v1-forged-nw.json';
import context from '../../fixtures/study-report/context-v1.json';
import { renderReport, renderReportBody, escapeHtml } from '../../../src/standalone/studyReport';
import {
  validateReportView,
  validateRenderContext,
  isCanonicalDecimal,
} from '../../../src/standalone/studyReport/viewModel';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});
const copy = () => JSON.parse(JSON.stringify(fixture));

it('renders all supplied method evidence independently of empty author narrative or tables', async () => {
  const view = copy();
  view.sections = [];
  view.tables = [];
  view.charts = [];
  const bytes = JSON.stringify(view);
  expect(validateReportView(view)).toBe(view);
  const html = await renderReport(view, context);
  expect(JSON.stringify(view)).toBe(bytes);
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelectorAll('[data-requirement-id]')).toHaveLength(20);
  expect(document.querySelectorAll('[data-category-id]')).toHaveLength(25);
  expect(document.querySelectorAll('[data-catalog-id]')).toHaveLength(58);
  expect(document.querySelectorAll('[data-catalog-id] details')).toHaveLength(58);
  for (const requirement of view.methodAssessment.requirements) {
    const row = document.querySelector(`[data-requirement-id="${requirement.requirementId}"]`)!;
    expect(row.textContent).toContain(requirement.machine.status);
    expect(row.textContent).toContain(requirement.professional.status);
    expect(row.querySelectorAll('.machine-checks > li')).toHaveLength(
      requirement.machine.checks.length,
    );
    for (const check of requirement.machine.checks)
      expect(row.textContent).toContain(check.predicateId);
  }
  for (const fact of view.methodAssessment.factCatalog) {
    const row = document.querySelector(`[data-catalog-id="${fact.factId}"]`)!;
    expect(row.textContent).toContain(fact.canonicalValue ?? 'No numeric value (null)');
    expect(row.textContent).toContain(fact.unit);
    expect(row.textContent).toContain(fact.coverage);
    expect(row.textContent).toContain(view.methodAssessment.factsRef.contentHash);
    for (const code of fact.reasonCodes) expect(row.textContent).toContain(code);
  }
  expect(html).toContain('PEF conformity qualified</dt><dd>false');
  expect(html).toContain('Scientific ranking qualified</dt><dd>false');
  expect(html).toContain('Business pilot qualified</dt><dd>false');
  expect(html).toContain('Full selected-factor records are not embedded (embedded: false)');
  expect(html).toContain(view.methodAssessment.configHash);
  expect(html).toContain(view.methodAssessment.moduleRef.artifactSha256);
  expect(html).toContain('Renderer 3.0.0');
  expect(renderReportBody(view, context)).toContain('cannot authenticate itself');
  expect(await renderReport(view, context)).toBe(html);
});

it('rejects missing, duplicate or substituted mandatory records at every index', () => {
  for (const field of ['requirements', 'categories', 'factCatalog']) {
    const count = fixture.methodAssessment[field as 'requirements'].length;
    for (let index = 0; index < count; index++) {
      const missing = copy();
      missing.methodAssessment[field].splice(index, 1);
      expect(() => validateReportView(missing)).toThrow('/methodAssessment');
      const duplicate = copy();
      duplicate.methodAssessment[field][index] =
        duplicate.methodAssessment[field][(index + 1) % count];
      expect(() => validateReportView(duplicate)).toThrow('/methodAssessment');
      const substituted = copy();
      if (field === 'requirements')
        substituted.methodAssessment.requirements[index].requirementId = 'PEF-99';
      if (field === 'categories')
        substituted.methodAssessment.categories[index].methodRef.id = 'substitute-method';
      if (field === 'factCatalog')
        substituted.methodAssessment.factCatalog[index].factId = 'substitute-fact';
      expect(() => validateReportView(substituted)).toThrow('/methodAssessment');
    }
  }
});

it('requires exact sourceFactId catalog binding while preserving independent author aliases', () => {
  const view = copy();
  const catalog = view.methodAssessment.factCatalog[0];
  const selected = view.facts[0];
  Object.assign(selected, {
    factId: 'author-alias',
    runIds: [view.methodAssessment.baseline.runId],
    methodRef: catalog.methodRef,
    canonicalValue: catalog.canonicalValue,
    unit: catalog.unit,
    coverage: catalog.coverage,
    reasonCodes: catalog.reasonCodes,
    provenance: {
      type: 'methodAssessmentFacts',
      id: view.methodAssessment.factsRef.id,
      contentHash: view.methodAssessment.factsRef.contentHash,
      sourceFactId: catalog.factId,
    },
  });
  view.sections = [];
  view.tables = [];
  view.charts = [];
  expect(validateReportView(view)).toBe(view);
  for (const mutate of [
    (v: ReturnType<typeof copy>) => {
      v.facts[0].canonicalValue = '123456789';
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].unit = 'changed';
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].methodRef = null;
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].coverage = v.facts[0].coverage === 'complete' ? 'partial' : 'complete';
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].reasonCodes = ['changed'];
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].provenance.sourceFactId = 'author-alias';
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].provenance.id = 'changed';
    },
    (v: ReturnType<typeof copy>) => {
      v.facts[0].provenance.contentHash = '0'.repeat(64);
    },
  ]) {
    const altered = JSON.parse(JSON.stringify(view));
    mutate(altered);
    expect(() => validateReportView(altered)).toThrow();
  }
  for (const type of ['runResult', 'analysisFacts']) {
    const old = JSON.parse(JSON.stringify(view));
    old.facts[0].provenance.type = type;
    expect(() => validateReportView(old)).toThrow();
    delete old.facts[0].provenance.sourceFactId;
    expect(validateReportView(old)).toBe(old);
  }
});

it('keeps mandatory states honest and rejects old versions, suppression, extra data and oversize complete views', async () => {
  for (const modify of [
    (v: ReturnType<typeof copy>) => {
      delete v.methodAssessment;
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment = null;
    },
    (v: ReturnType<typeof copy>) => {
      v.rendererVersion = '2.0.0';
    },
    (v: ReturnType<typeof copy>) => {
      v.schemaVersion = 'lca.study-report-view.v2';
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.pefConformityQualified = true;
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.scientificRankingQualified = true;
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.businessPilotQualified = true;
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.requirements[0].professional.status = 'approved';
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.methodSourceEvidence.selectedFactors = [];
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.methodSourceEvidence.selectedFactorEvidence.embedded = true;
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.methodSourceEvidence.selectedFactorEvidence.factsRef.contentHash =
        '0'.repeat(64);
    },
    (v: ReturnType<typeof copy>) => {
      v.methodAssessment.hidden = true;
    },
    (v: ReturnType<typeof copy>) => {
      v.report.storageObjectPath = 'private/secret';
    },
  ]) {
    const view = copy();
    modify(view);
    expect(() => validateReportView(view)).toThrow();
  }
  expect(() => validateReportView(fixture, '2.0.0')).toThrow('/version');
  await expect(renderReport(legacy, context)).rejects.toThrow();
  const huge = copy();
  huge.assumptions = Array.from({ length: 128 }, () => '<'.repeat(8192));
  huge.sections = Array.from({ length: 32 }, (_, i) => ({
    sectionId: 'section-' + i,
    title: 'Narrative',
    paragraphs: Array.from({ length: 32 }, () => '<'.repeat(2048)),
    factIds: [],
    citationIds: [],
  }));
  expect(() => validateReportView(huge)).toThrow();
});

it('escapes every authored and structured text without executing source-like strings or rounding values', async () => {
  const view = copy();
  view.report.title = '<script>alert("literal")</script>';
  view.methodAssessment.limitations.push('<img src="https://invalid.example/leak">');
  const html = await renderReport(view, context);
  expect(html).toContain('&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt;');
  expect(html).toContain('&lt;img src=&quot;https://invalid.example/leak&quot;&gt;');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('script')).toHaveLength(1);
  expect(doc.querySelectorAll('img,a[href^="http"],iframe,object,base')).toHaveLength(0);
  expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  expect(validateRenderContext(context)).toBe(context);
  for (const value of ['0', '5e-324', '9e308', '-2.5'])
    expect(isCanonicalDecimal(value)).toBe(true);
  for (const value of ['-0', '1.0', '1e+2', 'NaN', '1e9999'])
    expect(isCanonicalDecimal(value)).toBe(false);
});

it('keeps an empty supplied reason list distinct from a fabricated reason', async () => {
  const view = copy();
  const catalog = view.methodAssessment.factCatalog[0];
  catalog.reasonCodes = [];
  view.methodAssessment.categories[0].reasonCodes = [];
  for (const fact of view.facts)
    if (
      fact.provenance.type === 'methodAssessmentFacts' &&
      fact.provenance.sourceFactId === catalog.factId
    )
      fact.reasonCodes = [];
  const doc = new DOMParser().parseFromString(await renderReport(view, context), 'text/html');
  expect(doc.querySelector(`[data-catalog-id="${catalog.factId}"]`)!.textContent).toContain(
    'Reason codes: None supplied',
  );
});

it('rejects a coupled unknown category identity despite internally matching selectors and unchanged module pin', () => {
  const original = copy();
  const methodId = original.methodAssessment.categories[0].methodRef.id;
  const altered = JSON.parse(
    JSON.stringify(original).split(methodId).join('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  );
  expect(() => validateReportView(altered)).toThrow('/methodAssessment');
});

it('rejects the owner counterexample for available N/W without eligible primary evidence', () => {
  const view = copy();
  view.methodAssessment = JSON.parse(JSON.stringify(forgedNw));
  expect(view.methodAssessment.categories).toHaveLength(25);
  expect(view.methodAssessment.factCatalog).toHaveLength(58);
  expect(view.methodAssessment.requirements).toHaveLength(20);
  expect(view.methodAssessment.candidateNormalisationWeighting.status).toBe(
    'candidate_arithmetic_available',
  );
  expect(() => validateReportView(view)).toThrow('/methodAssessment');
});
it('rejects coupled source N/F substitution even when catalog unit identities agree internally', () => {
  const view = copy();
  const method = view.methodAssessment.categories[0].methodRef;
  for (const fact of view.methodAssessment.factCatalog)
    if (
      fact.methodRef?.id === method.id &&
      ['normalised', 'weighted'].includes(fact.unitIdentity.kind)
    )
      fact.unitIdentity.sourceNormalisationFactor =
        fact.unitIdentity.sourceNormalisationFactor === '1' ? '2' : '1';
  expect(() => validateReportView(view)).toThrow('/methodAssessment');
});
