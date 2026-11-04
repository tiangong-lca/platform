export { escapeHtml } from './content.js';
import { type RenderContext, type ReportViewModel } from './viewModel.js';
/** Same body renderer is reusable in a restricted Platform report view. */
export declare function renderReportBody(input: unknown, exportContext: unknown): string;
/** Portable Web standards only: identical input and resource bytes produce identical HTML. */
export declare function renderReport(input: unknown, context: unknown): Promise<string>;
export type { ReportViewModel, RenderContext };
