import { escapeHtml, renderReportContent } from './content.js';
export { escapeHtml } from './content.js';
const e = escapeHtml;
import { BROWSER_SCRIPT } from './browser.js';
import { REPORT_CSS } from './styles.js';
import { REPORT_DOCUMENT_LANGUAGE } from './documentLanguage.js';
import { RENDERER_VERSION, validateRenderContext, validateReportView, } from './viewModel.js';
/** Same body renderer is reusable in a restricted Platform report view. */
export function renderReportBody(input, exportContext) {
    const view = validateReportView(input);
    const context = validateRenderContext(exportContext);
    const { report, definition, snapshot } = view;
    return `<main><header><p class="subtitle">LCA study report · frozen reading copy</p><h1>${e(report.title)}</h1><span class="state">${snapshot.review === 'unreviewed' ? 'Unreviewed' : 'Reviewed at generation'}</span><span class="state">${snapshot.finalization === 'finalized' ? 'Finalized report revision' : 'Not finalized'}</span><p class="summary">${e(definition.goal)}</p><p class="identity">Study ${e(report.studyId)}<br>Report revision ${e(report.reportRevisionId)}<br>Generated ${e(report.generatedAt)}</p></header><aside class="trust" aria-label="Snapshot and verification limits"><p>${context.verificationAtGeneration === 'verified_by_trusted_exporter' ? 'The exporter recorded verification at generation.' : 'This export has no recorded verification at generation.'} This file cannot authenticate itself. Use an independently trusted CLI or official viewer to verify its detached receipt and exact bytes.</p><p>Validity was ${e(snapshot.validity)} at ${e(snapshot.checkedAt)}. Later withdrawals, permission changes or review decisions are not available offline. Downloaded copies cannot be recalled.</p></aside>${renderReportContent(view)}<footer>Export ${e(context.exportId)}<br>Projection SHA-256 ${e(context.projectionHash)}<br>View ${e(view.schemaVersion)} · Renderer ${RENDERER_VERSION}<br>This reading copy does not grant data access, certify a study or publish a dataset.</footer></main>`;
}
async function base64Sha256(value) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}
/** Portable Web standards only: identical input and resource bytes produce identical HTML. */
export async function renderReport(input, context) {
    const view = validateReportView(input);
    const body = renderReportBody(view, context);
    const [scriptHash, styleHash] = await Promise.all([
        base64Sha256(BROWSER_SCRIPT),
        base64Sha256(REPORT_CSS),
    ]);
    const policy = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
    return `<!doctype html>\n<html lang="${REPORT_DOCUMENT_LANGUAGE.canonicalLocale}" dir="${REPORT_DOCUMENT_LANGUAGE.direction}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="format-detection" content="telephone=no,email=no,address=no"><meta name="robots" content="noindex"><title>${e(view.report.title)}</title><style>${REPORT_CSS}</style></head><body>${body}<script>${BROWSER_SCRIPT}</script></body></html>\n`;
}
