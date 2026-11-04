import type { ReportViewModel } from './viewModel.js';
export declare function escapeHtml(value: string): string;
/** Internal presentation shared by the frozen exporter and Platform online preview. */
export declare function renderReportContent(view: ReportViewModel): string;
