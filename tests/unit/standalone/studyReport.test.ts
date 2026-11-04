import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import fixture from '../../fixtures/study-report/view-v1.json';
import context from '../../fixtures/study-report/context-v1.json';
import {
  BROWSER_SCRIPT,
  REPORT_CSS,
  escapeHtml,
  renderReport,
  renderReportBody,
} from '../../../src/standalone/studyReport';
import {
  isCanonicalDecimal,
  ReportViewError,
  validateRenderContext,
  validateReportView,
} from '../../../src/standalone/studyReport/viewModel';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
});

const copy = () => JSON.parse(JSON.stringify(fixture));

describe('Study report view v1', () => {
  it('preserves supplied decimal spellings, exact identities and unknown values', () => {
    expect(validateReportView(fixture)).toBe(fixture);
    expect(validateRenderContext(context)).toBe(context);
    for (const value of ['0', '-2.5', '1092.8', '5e-324', '9e308', '0.0000001', '-1e-99']) {
      expect(isCanonicalDecimal(value)).toBe(true);
    }
    for (const value of [
      null,
      0,
      '',
      '-0',
      '0e1',
      '1.0',
      '+1',
      '01',
      '1e+3',
      '1e01',
      'NaN',
      'Infinity',
      '1e100000',
      '1'.repeat(129),
    ]) {
      expect(isCanonicalDecimal(value)).toBe(false);
    }
  });

  it.each([
    [
      'schema',
      (v: ReturnType<typeof copy>) => {
        v.schemaVersion = 'v99';
      },
    ],
    [
      'renderer',
      (v: ReturnType<typeof copy>) => {
        v.rendererVersion = '99';
      },
    ],
    [
      'extra field',
      (v: ReturnType<typeof copy>) => {
        v.token = 'secret';
      },
    ],
    [
      'missing disclosure',
      (v: ReturnType<typeof copy>) => {
        delete v.limitations;
      },
    ],
    [
      'empty limitations',
      (v: ReturnType<typeof copy>) => {
        v.limitations = [];
      },
    ],
    [
      'control',
      (v: ReturnType<typeof copy>) => {
        v.report.title = '\u0000';
      },
    ],
    [
      'text bound',
      (v: ReturnType<typeof copy>) => {
        v.report.title = 'x'.repeat(257);
      },
    ],
    [
      'ID',
      (v: ReturnType<typeof copy>) => {
        v.runs[0].runId = '../escape';
      },
    ],
    [
      'hash',
      (v: ReturnType<typeof copy>) => {
        v.report.contentHash = 'f'.repeat(63);
      },
    ],
    [
      'time',
      (v: ReturnType<typeof copy>) => {
        v.report.generatedAt = 'not-a-time';
      },
    ],
    [
      'time range',
      (v: ReturnType<typeof copy>) => {
        v.snapshot.checkedAt = '2026-99-99T00:00:00Z';
      },
    ],
    [
      'calendar date',
      (v: ReturnType<typeof copy>) => {
        v.snapshot.checkedAt = '2026-02-30T00:00:00Z';
      },
    ],
    [
      'empty runs',
      (v: ReturnType<typeof copy>) => {
        v.runs = [];
      },
    ],
    [
      'large runs',
      (v: ReturnType<typeof copy>) => {
        v.runs = Array(33).fill(v.runs[0]);
      },
    ],
    [
      'nonarray',
      (v: ReturnType<typeof copy>) => {
        v.facts = {};
      },
    ],
    [
      'nonrecord',
      (v: ReturnType<typeof copy>) => {
        v.report = null;
      },
    ],
    [
      'bad amount',
      (v: ReturnType<typeof copy>) => {
        v.definition.functionalUnit.amount = '0';
      },
    ],
    [
      'negative amount',
      (v: ReturnType<typeof copy>) => {
        v.definition.functionalUnit.amount = '-1';
      },
    ],
    [
      'method version',
      (v: ReturnType<typeof copy>) => {
        v.definition.methodRefs[0].version = 'latest';
      },
    ],
    [
      'duplicate methods',
      (v: ReturnType<typeof copy>) => {
        v.definition.methodRefs.push(v.definition.methodRefs[0]);
      },
    ],
    [
      'duplicate runs',
      (v: ReturnType<typeof copy>) => {
        v.runs.push(v.runs[0]);
      },
    ],
    [
      'calculation type',
      (v: ReturnType<typeof copy>) => {
        v.runs[0].calculationContractRef.kind = 'artifact';
      },
    ],
    [
      'calculation schema',
      (v: ReturnType<typeof copy>) => {
        v.runs[0].calculationContractRef.schema = 'v99';
      },
    ],
    [
      'unknown Run',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].runIds = ['missing'];
      },
    ],
    [
      'duplicate Run references',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].runIds = ['baseline', 'baseline'];
      },
    ],
    [
      'method mismatch',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].methodRef.id = 'missing';
      },
    ],
    [
      'nonfinite number',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].canonicalValue = Infinity;
      },
    ],
    [
      'unknown cannot claim zero',
      (v: ReturnType<typeof copy>) => {
        v.facts[5].canonicalValue = '0';
      },
    ],
    [
      'missing known value',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].canonicalValue = null;
      },
    ],
    [
      'coverage',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].coverage = 'not-a-state';
      },
    ],
    [
      'source kind',
      (v: ReturnType<typeof copy>) => {
        v.facts[0].provenance.type = 'releaseFinalResult';
      },
    ],
    [
      'duplicate facts',
      (v: ReturnType<typeof copy>) => {
        v.facts.push(v.facts[0]);
      },
    ],
    [
      'unknown fact',
      (v: ReturnType<typeof copy>) => {
        v.tables[0].factIds = ['missing'];
      },
    ],
    [
      'duplicate fact selection',
      (v: ReturnType<typeof copy>) => {
        v.tables[0].factIds.push(v.tables[0].factIds[0]);
      },
    ],
    [
      'unknown section fact',
      (v: ReturnType<typeof copy>) => {
        v.sections[0].factIds = ['missing'];
      },
    ],
    [
      'unknown citation',
      (v: ReturnType<typeof copy>) => {
        v.sections[0].citationIds = ['missing'];
      },
    ],
    [
      'duplicate sections',
      (v: ReturnType<typeof copy>) => {
        v.sections.push(v.sections[0]);
      },
    ],
    [
      'duplicate citations',
      (v: ReturnType<typeof copy>) => {
        v.citations.push(v.citations[0]);
      },
    ],
    [
      'latest citation',
      (v: ReturnType<typeof copy>) => {
        v.citations[0].version = 'latest';
      },
    ],
    [
      'duplicate tables',
      (v: ReturnType<typeof copy>) => {
        v.tables.push(v.tables[0]);
      },
    ],
    [
      'unreviewed approval',
      (v: ReturnType<typeof copy>) => {
        v.snapshot.reviewIds = ['review'];
      },
    ],
    [
      'review without IDs',
      (v: ReturnType<typeof copy>) => {
        v.snapshot.review = 'reviewed';
      },
    ],
    [
      'embedded key',
      (v: ReturnType<typeof copy>) => {
        v.snapshot.publicKey = 'fake';
      },
    ],
  ])('rejects %s without exposing submitted values', (_label, change) => {
    const view = copy();
    change(view);
    expect(() => validateReportView(view)).toThrow(ReportViewError);
    expect(() => validateReportView(view)).not.toThrow(/secret|alert\(1\)/);
  });

  it('checks one exact method per chart and the complete byte budget', () => {
    const view = copy();
    view.definition.methodRefs.push({
      id: 'other',
      version: '01.00.000',
      name: 'Other',
      unit: 'kg CO2 eq',
    });
    view.facts[0].methodRef.id = 'other';
    expect(() => validateReportView(view)).toThrow('/charts/0/methodRef');
    const oversized = copy();
    oversized.sections = Array.from({ length: 32 }, (_, i) => ({
      sectionId: `s${i}`,
      title: 'Large',
      paragraphs: Array(32).fill('字'.repeat(2048)),
      factIds: [],
      citationIds: [],
    }));
    expect(() => validateReportView(oversized)).toThrow('/size');
  });

  it('accepts explicit reviewed snapshots, references without hashes and empty optional presentations', () => {
    const view = copy();
    view.citations[0].contentHash = null;
    view.snapshot.review = 'reviewed';
    view.snapshot.reviewIds = ['real-review-id'];
    view.snapshot.finalization = 'finalized';
    view.sections = [];
    view.tables = [];
    view.charts = [];
    expect(validateReportView(view)).toBe(view);
    expect(renderReportBody(view, context)).toContain('Reviewed at generation');
    expect(renderReportBody(view, context)).toContain('Finalized report revision');
  });

  it('rejects context keys, recursion fields and unknown historical status', () => {
    for (const bad of [
      { ...context, publicKey: 'forged' },
      { ...context, reportHtmlHash: 'a'.repeat(64) },
      { ...context, verificationAtGeneration: 'trusted' },
    ]) {
      expect(() => validateRenderContext(bad)).toThrow(ReportViewError);
    }
  });

  it('preserves inventory/activity units without inventing an LCIA method or comparability', async () => {
    const view = copy();
    view.facts[0].methodRef = null;
    view.facts[0].unit = 'kg';
    view.facts[0].canonicalValue = '-2.5';
    view.charts[0].factIds = [view.facts[0].factId];
    view.citations[0].sourceType = 'document';
    view.citations[0].version = 'reviewed-source';
    expect(validateReportView(view)).toBe(view);
    const html = await renderReport(view, context);
    expect(html).toContain('No LCIA method (activity or inventory fact)');
    expect(html).toContain('fill="#8b4b06"');
    view.charts[0].factIds.push(view.facts[1].factId);
    expect(() => validateReportView(view)).toThrow('/charts/0/methodRef');
    view.facts[1].unit = 'kg';
    view.facts[1].methodRef = null;
    expect(validateReportView(view)).toBe(view);
    view.facts[1].methodRef = fixture.facts[1].methodRef;
    view.facts[1].unit = fixture.facts[1].unit;
    view.facts[0].unit = view.facts[1].unit;
    expect(() => validateReportView(view)).toThrow('/charts/0/methodRef');
  });

  it('retains category provenance for dimensionless relative deltas without mixing chart units', async () => {
    const view = copy();
    view.facts[0].label = 'Relative change in characterized climate subtotal';
    view.facts[0].canonicalValue = '-0.5';
    view.facts[0].unit = '1';
    view.charts[0].factIds = [view.facts[0].factId];
    expect(validateReportView(view)).toBe(view);
    const html = await renderReport(view, context);
    expect(html).toContain('Relative change in characterized climate subtotal');
    expect(html).toContain('-0.5');
    view.charts[0].factIds.push(view.facts[1].factId);
    expect(() => validateReportView(view)).toThrow('/charts/0/methodRef');
  });

  it('preserves actual PostgreSQL timestamp precision and offset without reformatting signed input', async () => {
    for (const stamp of [
      '2026-11-03T05:10:51.610188+00:00',
      '2026-11-03T00:10:51.610188+08:00',
      '2026-11-03T23:10:51.610188-05:00',
      '2000-02-29T12:34:56.123456789Z',
      '2024-02-29T00:00:00+23:59',
      '2026-11-03T12:34:56-23:59',
    ]) {
      const view = copy();
      view.report.generatedAt = stamp;
      view.snapshot.checkedAt = stamp;
      expect(validateReportView(view)).toBe(view);
      expect(await renderReport(view, context)).toContain(stamp);
      expect(view.report.generatedAt).toBe(stamp);
    }
  });

  it.each([
    null,
    '2026-11-03T05:10:51.1234567890Z',
    '1900-02-29T05:10:51+08:00',
    '2026-02-29T05:10:51-05:00',
    '2026-04-31T05:10:51+08:00',
    '2026-00-01T05:10:51Z',
    '2026-13-01T05:10:51Z',
    '2026-11-00T05:10:51Z',
    '2026-11-03T24:10:51Z',
    '2026-11-03T05:60:51Z',
    '2026-11-03T05:10:60Z',
    '2026-11-03T05:10:51+24:00',
    '2026-11-03T05:10:51-05:60',
  ])('rejects invalid local calendar/time/offset: %s', (stamp) => {
    const view = copy();
    view.report.generatedAt = stamp;
    expect(() => validateReportView(view)).toThrow('/report/generatedAt');
  });

  it('accepts two-Run source/cutoff bounds without removing the total disclosure byte limit', () => {
    const view = copy();
    view.citations = Array.from({ length: 2048 }, (_, i) => ({
      ...view.citations[0],
      citationId: `source-${i}`,
    }));
    view.sections[0].citationIds = ['source-0', 'source-2047'];
    view.cutoffs = Array.from({ length: 512 }, (_, i) => `Declared cutoff ${i}`);
    expect(validateReportView(view)).toBe(view);
    view.citations.push({ ...view.citations[0], citationId: 'source-overflow' });
    expect(() => validateReportView(view)).toThrow('/citations');
    view.citations.pop();
    view.cutoffs.push('One too many');
    expect(() => validateReportView(view)).toThrow('/cutoffs');
  });

  it('treats angle brackets and URL-like strings as escaped plain data, never markup or links', async () => {
    const view = copy();
    const literal =
      '</script><img src="https://example.invalid/pixel" onerror="alert(1)"> javascript:alert(1) data:text/html,test';
    view.report.title = literal;
    view.definition.goal = literal;
    view.assumptions = [literal];
    view.facts[0].label = literal;
    view.citations[0].label = 'https://example.invalid/paper';
    expect(validateReportView(view)).toBe(view);
    const html = await renderReport(view, context);
    expect(html).toContain(escapeHtml(literal));
    expect(html).not.toContain(literal);
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('img,iframe,object,a[href^="https:"]')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe(literal);
  });

  it('renders remaining facts after all 32 supplied tables without mutation or duplicate DOM IDs', () => {
    const view = copy();
    view.tables = Array.from({ length: 32 }, (_, i) => ({
      tableId: i === 0 ? 'remaining' : `table-${i}`,
      title: `Specified table ${i}`,
      factIds: ['baseline-climate'],
    }));
    const before = JSON.stringify(view);
    const html = renderReportBody(view, context);
    expect(JSON.stringify(view)).toBe(before);
    expect(view.tables).toHaveLength(32);
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('[data-report-table]')).toHaveLength(33);
    expect(document.querySelector('#table-supplied-remaining')).not.toBeNull();
    const remaining = document.querySelector('#table-remaining');
    expect(remaining?.querySelector('h2')?.textContent).toBe('Additional result facts');
    expect(remaining?.querySelectorAll('tbody tr')).toHaveLength(view.facts.length - 1);
    for (const fact of view.facts.slice(1)) expect(remaining?.textContent).toContain(fact.label);
    const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves declared P1 functional-unit precision and bounded full scope text', async () => {
    const view = copy();
    view.definition.functionalUnit.amount = '1.000';
    view.definition.goal = 'g'.repeat(4096);
    view.definition.boundary = 'b'.repeat(4096);
    view.facts[0].label = 'Producer identity '.repeat(50);
    view.assumptions = Array.from(
      { length: 128 },
      (_, i) => `Assumption ${i}: ${'a'.repeat(4096)}`,
    );
    expect(validateReportView(view)).toBe(view);
    expect(await renderReport(view, context)).toContain('1.000 kg');
    view.definition.functionalUnit.amount = '0.000';
    expect(() => validateReportView(view)).toThrow('/definition/functionalUnit/amount');
  });
});

describe('portable deterministic report rendering', () => {
  it('escapes all HTML metacharacters and preserves unknown/partial/tiny values', async () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
    const view = copy();
    view.report.title = `Cement & steel "draft" 'copy'`;
    const html = await renderReport(view, context);
    expect(html).toBe(await renderReport(view, context));
    expect(html).toContain('Cement &amp; steel &quot;draft&quot; &#39;copy&#39;');
    for (const text of [
      '1092.8',
      '546.4',
      '5e-324',
      'Unknown',
      'Unreviewed',
      'incomplete coverage',
      'Not plottable',
      'cannot authenticate itself',
      'cannot be recalled',
      context.projectionHash,
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'sha256-");
    expect(html).not.toMatch(/<script\s+src|<link|<img|<iframe/u);
    expect(html).toContain(BROWSER_SCRIPT);
    expect(html).toContain(REPORT_CSS);
    // W10's fixed English copy keeps registry-derived English document metadata.
    expect(html).toContain('<html lang="en-US" dir="ltr">');
  });

  it('renders all supplied zero/negative/large, complete, empty and historical branches', async () => {
    const view = copy();
    view.sections[0].factIds = [];
    view.sections[0].citationIds = [];
    view.assumptions = [];
    view.cutoffs = [];
    view.citations[0].contentHash = null;
    view.facts = [view.facts[2]];
    view.tables[0].factIds = ['known-zero'];
    view.charts[0].factIds = ['known-zero'];
    let html = await renderReport(view, {
      ...context,
      verificationAtGeneration: 'verified_by_trusted_exporter',
    });
    expect(html).not.toContain('Some facts have');
    expect(html).toContain('recorded verification at generation');
    expect(html).toContain('None declared.');
    view.facts[0].canonicalValue = '9e308';
    html = await renderReport(view, context);
    expect(html).toContain('9e308');
    expect(html).toContain('Not plottable');
  });
});
