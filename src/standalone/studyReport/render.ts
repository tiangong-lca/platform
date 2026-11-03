import { BROWSER_SCRIPT } from './browser.js';
import { REPORT_CSS } from './styles.js';
import { REPORT_DOCUMENT_LANGUAGE } from './documentLanguage.js';
import {
  RENDERER_VERSION,
  validateRenderContext,
  validateReportView,
  type RenderContext,
  type ReportFact,
  type ReportViewModel,
} from './viewModel.js';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

const e = escapeHtml;

function factDetails(fact: ReportFact): string {
  return `<details><summary>Evidence</summary><p>Fact ${e(fact.factId)}<br>Runs ${fact.runIds.map(e).join(', ')}<br>${fact.methodRef === null ? 'No LCIA method (activity or inventory fact)' : `Method ${e(fact.methodRef.id)} @ ${e(fact.methodRef.version)}`}<br>Source ${e(fact.provenance.type)} ${e(fact.provenance.id)}<br>SHA-256 ${e(fact.provenance.contentHash)}</p></details>`;
}

function factValue(fact: ReportFact): string {
  return fact.canonicalValue === null ? 'Unknown' : e(fact.canonicalValue);
}

function factTable(
  view: ReportViewModel,
  table: ReportViewModel['tables'][number],
  domKey: string,
): string {
  const facts = table.factIds.map((id) => view.facts.find((fact) => fact.factId === id)!);
  return `<section id="table-${e(domKey)}" data-report-table><h2>${e(table.title)}</h2><div class="controls"><label>Filter facts<input type="search" placeholder="Label, value, unit or source" aria-controls="rows-${e(domKey)}"></label><label>Order<select aria-label="Order" aria-controls="rows-${e(domKey)}"><option value="original">Report order</option><option value="ascending">Label A to Z</option><option value="descending">Label Z to A</option></select></label><span role="status" aria-live="polite">${facts.length} of ${facts.length} facts shown</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="${e(table.title)}"><table><caption>Supplied result facts; values are preserved without rounding</caption><thead><tr><th scope="col">Fact</th><th scope="col">Value and unit</th><th scope="col">Coverage</th><th scope="col">Provenance</th></tr></thead><tbody id="rows-${e(domKey)}">${facts.map((fact) => `<tr data-label="${e(fact.label)}"><th scope="row">${e(fact.label)}</th><td class="value">${factValue(fact)}<br>${e(fact.unit)}</td><td><span class="coverage ${fact.coverage}">${fact.coverage === 'partial' ? 'Characterized subtotal · incomplete coverage' : fact.coverage === 'unknown' ? 'Unknown · no numeric claim' : 'Complete coverage'}</span></td><td>${factDetails(fact)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function chart(view: ReportViewModel, specification: ReportViewModel['charts'][number]): string {
  const facts = specification.factIds.map((id) => view.facts.find((fact) => fact.factId === id)!);
  const drawable = (fact: ReportFact) => {
    if (fact.canonicalValue === null) return null;
    const value = Number(fact.canonicalValue);
    return Number.isFinite(value) && (value !== 0 || fact.canonicalValue === '0') ? value : null;
  };
  const values = facts.map(drawable);
  const maximum = Math.max(...values.map((value) => Math.abs(value ?? 0)));
  return `<section class="chart" id="chart-${e(specification.chartId)}"><h2>${e(specification.title)}</h2><p class="chart-note">Supplied fact selection with a shared method and unit. Bars do not establish scientific comparability or rank alternatives. Exact values remain below each bar.</p>${facts
    .map((fact, i) => {
      const value = values[i];
      const width = value === null || maximum === 0 ? 0 : (Math.abs(value) / maximum) * 144;
      const shape =
        value === null || (value !== 0 && width < 0.5)
          ? '<span>Not plottable at this display range</span>'
          : `<svg viewBox="0 0 300 24" role="img" aria-label="${e(fact.label)}: ${factValue(fact)} ${e(fact.unit)}"><path d="M150 0V24" stroke="#829ba8"/><rect x="${value < 0 ? 150 - width : 150}" y="4" width="${width}" height="16" rx="2" fill="${value < 0 ? '#8b4b06' : '#126c68'}"/></svg>`;
      return `<div class="chart-row"><span>${e(fact.label)}</span>${shape}<span class="chart-value">${factValue(fact)} ${e(fact.unit)} · ${e(fact.coverage)}</span></div>`;
    })
    .join('')}</section>`;
}

function list(title: string, values: string[]): string {
  return `<section><h3>${title}</h3>${values.length ? `<ul>${values.map((value) => `<li>${e(value)}</li>`).join('')}</ul>` : '<p>None declared.</p>'}</section>`;
}

/** Same body renderer is reusable in a restricted Platform report view. */
export function renderReportBody(input: unknown, exportContext: unknown): string {
  const view = validateReportView(input);
  const context = validateRenderContext(exportContext);
  const { report, definition, snapshot } = view;
  const shown = new Set(view.tables.flatMap((table) => table.factIds));
  const remaining = view.facts.filter((fact) => !shown.has(fact.factId)).map((fact) => fact.factId);
  const tables = view.tables
    .map((table) => factTable(view, table, `supplied-${table.tableId}`))
    .join('');
  const remainingTable = remaining.length
    ? factTable(
        view,
        { tableId: 'remaining', title: 'Additional result facts', factIds: remaining },
        'remaining',
      )
    : '';
  return `<main><header><p class="subtitle">LCA study report · frozen reading copy</p><h1>${e(report.title)}</h1><span class="state">${snapshot.review === 'unreviewed' ? 'Unreviewed' : 'Reviewed at generation'}</span><span class="state">${snapshot.finalization === 'finalized' ? 'Finalized report revision' : 'Not finalized'}</span><p class="summary">${e(definition.goal)}</p><p class="identity">Study ${e(report.studyId)}<br>Report revision ${e(report.reportRevisionId)}<br>Generated ${e(report.generatedAt)}</p></header><aside class="trust" aria-label="Snapshot and verification limits"><p>${context.verificationAtGeneration === 'verified_by_trusted_exporter' ? 'The exporter recorded verification at generation.' : 'This export has no recorded verification at generation.'} This file cannot authenticate itself. Use an independently trusted CLI or official viewer to verify its detached receipt and exact bytes.</p><p>Validity was ${e(snapshot.validity)} at ${e(snapshot.checkedAt)}. Later withdrawals, permission changes or review decisions are not available offline. Downloaded copies cannot be recalled.</p></aside><nav aria-label="Report contents"><a href="#scope">Goal and scope</a><a href="#results">Results</a><a href="#evidence">Sources and limitations</a><a href="#identity">Frozen identities</a></nav><section id="scope"><h2>Goal and scope</h2><dl><dt>Functional unit</dt><dd>${e(definition.functionalUnit.amount)} ${e(definition.functionalUnit.unit)}</dd><dt>Reference flow</dt><dd>${e(definition.functionalUnit.referenceFlowId)}</dd><dt>System boundary</dt><dd>${e(definition.boundary)}</dd></dl><ul class="methods">${definition.methodRefs.map((method) => `<li><strong>${e(method.name)}</strong> <span class="reference">${e(method.unit)}</span><br><span class="identity">${e(method.id)} @ ${e(method.version)}</span></li>`).join('')}</ul></section><section id="results"><h2>Results and interpretation</h2>${view.facts.some((fact) => fact.coverage !== 'complete') ? '<p class="warning">Some facts have incomplete or unknown coverage. A characterized subtotal is not a complete LCIA category score. Unknown values are never replaced with zero.</p>' : ''}${view.sections.map((section) => `<section id="section-${e(section.sectionId)}"><h3>${e(section.title)}</h3>${section.paragraphs.map((paragraph) => `<p>${e(paragraph)}</p>`).join('')}${section.factIds.length ? `<p class="reference">Facts: ${section.factIds.map(e).join(', ')}</p>` : ''}${section.citationIds.length ? `<p class="reference">Sources: ${section.citationIds.map(e).join(', ')}</p>` : ''}</section>`).join('')}</section>${tables}${remainingTable}${view.charts.map((specification) => chart(view, specification)).join('')}<section id="evidence"><h2>Sources and limitations</h2><ol class="evidence-list">${view.citations.map((citation) => `<li id="citation-${e(citation.citationId)}"><strong>${e(citation.label)}</strong><br><span class="reference">${e(citation.sourceType)} · ${e(citation.identity)} @ ${e(citation.version)}</span>${citation.contentHash === null ? '' : `<br><span class="identity">SHA-256 ${e(citation.contentHash)}</span>`}</li>`).join('')}</ol><div class="columns">${list('Assumptions', view.assumptions)}${list('Declared cutoffs', view.cutoffs)}</div>${list('Limitations', view.limitations)}</section><section id="identity"><h2>Frozen identities</h2>${view.runs.map((run) => `<details><summary>${e(run.label)} · ${e(run.runId)}</summary><p>Scenario revision ${e(run.scenarioRevisionId)}<br>Input SHA-256 ${e(run.inputHash)}<br>Profile ${e(run.profileId)}<br>Calculation contract ${e(run.calculationContractRef.schema)}<br>SHA-256 ${e(run.calculationContractRef.sha256)}</p></details>`).join('')}<p class="identity">Report content SHA-256 ${e(report.contentHash)}<br>Review decision IDs: ${snapshot.reviewIds.length ? snapshot.reviewIds.map(e).join(', ') : 'None · unreviewed'}</p></section><footer>Export ${e(context.exportId)}<br>Projection SHA-256 ${e(context.projectionHash)}<br>View ${e(view.schemaVersion)} · Renderer ${RENDERER_VERSION}<br>This reading copy does not grant data access, certify a study or publish a dataset.</footer></main>`;
}

async function base64Sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

/** Portable Web standards only: identical input and resource bytes produce identical HTML. */
export async function renderReport(input: unknown, context: unknown): Promise<string> {
  const view = validateReportView(input);
  const body = renderReportBody(view, context);
  const [scriptHash, styleHash] = await Promise.all([
    base64Sha256(BROWSER_SCRIPT),
    base64Sha256(REPORT_CSS),
  ]);
  const policy = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>\n<html lang="${REPORT_DOCUMENT_LANGUAGE.canonicalLocale}" dir="${REPORT_DOCUMENT_LANGUAGE.direction}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="format-detection" content="telephone=no,email=no,address=no"><meta name="robots" content="noindex"><title>${e(view.report.title)}</title><style>${REPORT_CSS}</style></head><body>${body}<script>${BROWSER_SCRIPT}</script></body></html>\n`;
}

export type { ReportViewModel, RenderContext };
