import { IMPORT_REPORT_CONTENT_BY_APP_LOCALE } from '@/locales/importReportCatalog';
import { LOCALE_REGISTRY, type SupportedAppLocale } from '../../services/general/localeRegistry';

export { IMPORT_REPORT_CONTENT_BY_APP_LOCALE };

export type ImportReportAdapterKey = (typeof LOCALE_REGISTRY)[number]['adapters']['report'];

export type ImportReportSummaryInput = {
  code: string;
  summary: {
    total_entries: number;
    filtered_open_data_count: number;
    user_conflict_count: number;
    importable_count: number;
    imported_count?: number | null;
    validation_issue_count?: number | null;
  };
};

const IMPORT_REPORT_HUMAN_SUMMARY_TOKENS = [
  'code',
  'total_entries',
  'filtered_open_data_count',
  'user_conflict_count',
  'imported_count',
  'validation_issue_count',
] as const;
const V2_REPORT_HUMAN_SUMMARY_TOKENS = [
  'outcome',
  'total_entries',
  'imported_count',
  'existing_count',
  'not_imported_count',
  'validation_issue_count',
] as const;

type ImportReportHumanSummaryToken = (typeof IMPORT_REPORT_HUMAN_SUMMARY_TOKENS)[number];
type ImportReportHumanSummaryValues = Record<ImportReportHumanSummaryToken, string | number>;

const REPORT_ADAPTER_KEYS = LOCALE_REGISTRY.map(({ adapters }) => adapters.report);

const mapContentToReportAdapters = <Value>(
  getValue: (locale: SupportedAppLocale) => Value,
): Record<ImportReportAdapterKey, Value> =>
  Object.fromEntries(
    LOCALE_REGISTRY.map(({ canonicalLocale, adapters }) => [
      adapters.report,
      getValue(canonicalLocale),
    ]),
  ) as Record<ImportReportAdapterKey, Value>;

const renderHumanSummary = (template: string, values: ImportReportHumanSummaryValues): string =>
  IMPORT_REPORT_HUMAN_SUMMARY_TOKENS.reduce(
    (rendered, token) => rendered.split(`{${token}}`).join(String(values[token])),
    template,
  );

type V2HumanSummaryToken = (typeof V2_REPORT_HUMAN_SUMMARY_TOKENS)[number];
type V2HumanSummaryValues = Record<V2HumanSummaryToken, string | number>;

const renderV2HumanSummary = (template: string, values: V2HumanSummaryValues): string =>
  V2_REPORT_HUMAN_SUMMARY_TOKENS.reduce(
    (rendered, token) => rendered.split(`{${token}}`).join(String(values[token])),
    template,
  );

export const buildImportReportHumanSummary = (
  response: ImportReportSummaryInput,
): Record<ImportReportAdapterKey, string> => {
  const values: ImportReportHumanSummaryValues = {
    code: response.code,
    total_entries: response.summary.total_entries,
    filtered_open_data_count: response.summary.filtered_open_data_count,
    user_conflict_count: response.summary.user_conflict_count,
    imported_count: response.summary.imported_count ?? response.summary.importable_count,
    validation_issue_count: response.summary.validation_issue_count ?? 0,
  };

  return mapContentToReportAdapters((locale) =>
    renderHumanSummary(IMPORT_REPORT_CONTENT_BY_APP_LOCALE[locale].humanSummaryTemplate, values),
  );
};

export const buildImportReportReadmeMarkdown = (): Record<ImportReportAdapterKey, string> =>
  mapContentToReportAdapters(
    (locale) => IMPORT_REPORT_CONTENT_BY_APP_LOCALE[locale].readmeMarkdown,
  );

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const countOrUnknown = (value: unknown): number | string =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : '—';

const groupIssuesByFile = (issues: unknown[]) => {
  const groups = new Map<string | null, { file_path: string | null; issues: JsonRecord[] }>();
  for (const value of issues) {
    const issue = asRecord(value);
    if (!issue) continue;
    const filePath = typeof issue.file_path === 'string' ? issue.file_path : null;
    if (!groups.has(filePath)) groups.set(filePath, { file_path: filePath, issues: [] });
    groups.get(filePath)!.issues.push({
      location: issue.location ?? null,
      severity: issue.severity ?? null,
      explanation: issue.message ?? null,
      issue_code: issue.issue_code ?? null,
      ignored_for_import: issue.ignored_for_import === true,
      ...(typeof issue.ignore_reason === 'string' ? { ignore_reason: issue.ignore_reason } : {}),
    });
  }
  return [...groups.values()];
};

/** Keep the backend report untouched while presenting a readable, explicitly bounded download. */
export const buildDownloadableImportReport = (value: unknown, jobId: string) => {
  const report = asRecord(value);
  if (!report) throw new Error('Invalid import report');
  if (report.report_format === 'tidas-import-report-with-guide') return report;

  const summary = asRecord(report.summary);
  const issues = Array.isArray(report.validation_issues) ? report.validation_issues : [];
  const issueTotal = summary?.validation_issue_count;
  const issuesTruncated =
    report.validation_issues_truncated === true ||
    (typeof issueTotal === 'number' && issueTotal > issues.length);
  const common = {
    report_format: 'tidas-import-report-with-guide',
    job_id: jobId,
    issues_by_file: groupIssuesByFile(issues),
    issues_by_file_truncated: issuesTruncated,
    report,
  };

  if (report.report_version === 2) {
    const values: V2HumanSummaryValues = {
      outcome: typeof report.outcome === 'string' ? report.outcome : '—',
      total_entries: countOrUnknown(summary?.total_entries),
      imported_count: countOrUnknown(summary?.imported_count),
      existing_count: countOrUnknown(summary?.existing_count),
      not_imported_count: countOrUnknown(summary?.not_imported_count),
      validation_issue_count: countOrUnknown(issueTotal),
    };
    return {
      ...common,
      report_format_version: 3,
      human_summary: mapContentToReportAdapters((locale) =>
        renderV2HumanSummary(
          IMPORT_REPORT_CONTENT_BY_APP_LOCALE[locale].v2HumanSummaryTemplate,
          values,
        ),
      ),
      reading_guide: mapContentToReportAdapters(
        (locale) => IMPORT_REPORT_CONTENT_BY_APP_LOCALE[locale].v2ReadingGuide,
      ),
      readme_markdown: mapContentToReportAdapters(
        (locale) => IMPORT_REPORT_CONTENT_BY_APP_LOCALE[locale].v2ReadmeMarkdown,
      ),
    };
  }

  if (typeof report.code !== 'string' || !summary) throw new Error('Invalid import report');
  const legacySummary = summary as unknown as ImportReportSummaryInput['summary'];
  const legacyReadme = buildImportReportReadmeMarkdown();
  return {
    ...common,
    report_format_version: 2,
    human_summary: buildImportReportHumanSummary({ code: report.code, summary: legacySummary }),
    reading_guide: legacyReadme,
    readme_markdown: legacyReadme,
  };
};

/**
 * Pure report-content inventory for the locale-delivery audit. It deliberately
 * exposes canonical locale ownership and the external report adapter topology
 * without importing React, Umi, Ant Design, or browser-only helpers.
 */
export const getImportReportContentAuditDescriptor = () => ({
  sourceId: 'tidas-import-report-content',
  contentKinds: [
    'human_summary',
    'readme_markdown',
    'v2_human_summary',
    'v2_reading_guide',
    'v2_readme_markdown',
  ] as const,
  humanSummaryTokens: [...IMPORT_REPORT_HUMAN_SUMMARY_TOKENS],
  v2HumanSummaryTokens: [...V2_REPORT_HUMAN_SUMMARY_TOKENS],
  reportAdapterKeys: [...REPORT_ADAPTER_KEYS],
  entries: LOCALE_REGISTRY.map(({ canonicalLocale, adapters }) => ({
    canonicalLocale,
    reportAdapter: adapters.report,
    humanSummaryTemplate: IMPORT_REPORT_CONTENT_BY_APP_LOCALE[canonicalLocale].humanSummaryTemplate,
    readmeMarkdown: IMPORT_REPORT_CONTENT_BY_APP_LOCALE[canonicalLocale].readmeMarkdown,
    v2HumanSummaryTemplate:
      IMPORT_REPORT_CONTENT_BY_APP_LOCALE[canonicalLocale].v2HumanSummaryTemplate,
    v2ReadingGuide: IMPORT_REPORT_CONTENT_BY_APP_LOCALE[canonicalLocale].v2ReadingGuide,
    v2ReadmeMarkdown: IMPORT_REPORT_CONTENT_BY_APP_LOCALE[canonicalLocale].v2ReadmeMarkdown,
  })),
});
