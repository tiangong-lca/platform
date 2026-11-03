import { REPORT_DOCUMENT_LANGUAGE } from '@/standalone/studyReport/documentLanguage';
import { renderReportContent, escapeHtml } from '@/standalone/studyReport/content';
import { BROWSER_SCRIPT } from '@/standalone/studyReport/browser';
import { REPORT_CSS } from '@/standalone/studyReport/styles';
import { validateReportView } from '@/standalone/studyReport/viewModel';

/** Online projection preview has no export identity, receipt or exporter verification claim. */
export function renderStudyPreview(input: unknown): string {
  const view = validateReportView(input);
  return `<!doctype html><html lang="${REPORT_DOCUMENT_LANGUAGE.canonicalLocale}" dir="${REPORT_DOCUMENT_LANGUAGE.direction}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><style>${REPORT_CSS}</style></head><body><main><header><h1>${escapeHtml(view.report.title)}</h1><p>${escapeHtml(view.definition.goal)}</p></header><aside class="trust"><p>Online report preview. This is the authorized recorded projection, not an exported or verified reading copy. Current review, finalization and validity appear in the application above.</p><p>Recorded snapshot: ${escapeHtml(view.snapshot.validity)} at ${escapeHtml(view.snapshot.checkedAt)}; ${escapeHtml(view.snapshot.review)}; ${escapeHtml(view.snapshot.finalization)}.</p></aside>${renderReportContent(view)}<footer>Study ${escapeHtml(view.report.studyId)}<br>Report revision ${escapeHtml(view.report.reportRevisionId)}<br>Content SHA-256 ${escapeHtml(view.report.contentHash)}</footer></main><script>${BROWSER_SCRIPT}</script></body></html>`;
}
