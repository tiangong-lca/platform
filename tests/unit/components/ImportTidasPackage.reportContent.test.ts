import {
  buildDownloadableImportReport,
  buildImportReportHumanSummary,
  buildImportReportReadmeMarkdown,
  getImportReportContentAuditDescriptor,
  IMPORT_REPORT_CONTENT_BY_APP_LOCALE,
  type ImportReportSummaryInput,
} from '@/components/ImportTidasPackage/reportContent';
import { LOCALE_REGISTRY } from '@/services/general/localeRegistry';

const reportResponse: ImportReportSummaryInput = {
  code: 'USER_DATA_CONFLICT',
  summary: {
    total_entries: 20,
    filtered_open_data_count: 12,
    user_conflict_count: 1,
    importable_count: 8,
  },
};

describe('ImportTidasPackage report content', () => {
  it('returns exactly the report adapter keys declared by the locale registry', () => {
    const expectedCanonicalLocales = LOCALE_REGISTRY.map(({ canonicalLocale }) => canonicalLocale);
    const expectedReportAdapterKeys = LOCALE_REGISTRY.map(({ adapters }) => adapters.report);
    const humanSummary = buildImportReportHumanSummary(reportResponse);
    const readmeMarkdown = buildImportReportReadmeMarkdown();
    const auditDescriptor = getImportReportContentAuditDescriptor();

    expect(Object.keys(IMPORT_REPORT_CONTENT_BY_APP_LOCALE)).toEqual(expectedCanonicalLocales);
    expect(Object.keys(humanSummary)).toEqual(expectedReportAdapterKeys);
    expect(Object.keys(readmeMarkdown)).toEqual(expectedReportAdapterKeys);
    expect(auditDescriptor.reportAdapterKeys).toEqual(expectedReportAdapterKeys);
    expect(auditDescriptor.entries.map(({ canonicalLocale }) => canonicalLocale)).toEqual(
      expectedCanonicalLocales,
    );
    expect(auditDescriptor.entries.map(({ reportAdapter }) => reportAdapter)).toEqual(
      expectedReportAdapterKeys,
    );
    expect(new Set(expectedReportAdapterKeys).size).toBe(expectedReportAdapterKeys.length);
  });

  it('preserves the French report adapter content and fallback counts', () => {
    const humanSummary = buildImportReportHumanSummary(reportResponse);
    const readmeMarkdown = buildImportReportReadmeMarkdown();

    expect(humanSummary.fr_FR).toBe(
      "Résultat de l'importation : USER_DATA_CONFLICT. Nombre total d'enregistrements : 20, enregistrements de données ouvertes ignorés : 12, conflits avec les données utilisateur : 1, importés : 8, problèmes de validation : 0.",
    );
    expect(readmeMarkdown.fr_FR).toContain("# Comment lire ce rapport d'importation");
    expect(readmeMarkdown.fr_FR).toContain('report.validation_issues');
    expect(readmeMarkdown.fr_FR).toContain('report.user_conflicts');
    expect(readmeMarkdown.fr_FR).toContain('report.filtered_open_data');
  });

  it('exposes non-empty pure content units for locale-delivery auditing', () => {
    const auditDescriptor = getImportReportContentAuditDescriptor();

    expect(auditDescriptor.sourceId).toBe('tidas-import-report-content');
    expect(auditDescriptor.contentKinds).toEqual([
      'human_summary',
      'readme_markdown',
      'v2_human_summary',
      'v2_reading_guide',
      'v2_readme_markdown',
    ]);
    expect(auditDescriptor.entries).toHaveLength(LOCALE_REGISTRY.length);
    auditDescriptor.entries.forEach((entry) => {
      expect(entry.humanSummaryTemplate.trim()).not.toBe('');
      expect(entry.readmeMarkdown.trim()).not.toBe('');
      expect(entry.v2HumanSummaryTemplate.trim()).not.toBe('');
      expect(entry.v2ReadingGuide.trim()).not.toBe('');
      expect(entry.v2ReadmeMarkdown.trim()).not.toBe('');
    });
  });

  it('preserves v2 counts and groups only the available issue samples', () => {
    const report = {
      report_version: 2,
      outcome: 'partial',
      summary: {
        total_entries: 5,
        imported_count: 2,
        existing_count: 1,
        not_imported_count: 2,
        validation_issue_count: 3,
      },
      validation_issues_truncated: true,
      validation_issues: [
        { file_path: 'data/a.json', message: 'Missing foo', ignored_for_import: true },
        { file_path: 'data/a.json', message: 'Review bar' },
      ],
    };
    const downloaded = buildDownloadableImportReport(report, 'job-1');
    expect(downloaded.report_format_version).toBe(3);
    expect(downloaded.report).toBe(report);
    expect(downloaded.issues_by_file_truncated).toBe(true);
    expect(downloaded.issues_by_file).toEqual([
      {
        file_path: 'data/a.json',
        issues: [
          expect.objectContaining({ explanation: 'Missing foo', ignored_for_import: true }),
          expect.objectContaining({ explanation: 'Review bar' }),
        ],
      },
    ]);
    const humanSummary = downloaded.human_summary as Record<string, string>;
    const readme = downloaded.readme_markdown as Record<string, string>;
    expect(humanSummary.zh_CN).toContain('新增 2 条');
    expect(humanSummary.zh_CN).toContain('跳过 1 条');
    expect(readme.en_US).toContain('not a conflict');
  });

  it('keeps historical v1 terminology and avoids wrapping an existing guide twice', () => {
    const report = {
      code: 'VALIDATION_FAILED',
      summary: {
        total_entries: 9,
        filtered_open_data_count: 0,
        user_conflict_count: 0,
        importable_count: 9,
        imported_count: 0,
        validation_issue_count: 1,
      },
      validation_issues: [{ file_path: 'data/a.json', message: 'bad field' }],
    };
    const downloaded = buildDownloadableImportReport(report, 'old-job');
    expect(downloaded.report_format_version).toBe(2);
    expect((downloaded.human_summary as Record<string, string>).en_US).toContain(
      'skipped open-data records: 0',
    );
    const issuesByFile = downloaded.issues_by_file as Array<{
      issues: Array<{ explanation: string }>;
    }>;
    expect(issuesByFile[0].issues[0].explanation).toBe('bad field');
    expect(buildDownloadableImportReport(downloaded, 'old-job')).toBe(downloaded);
  });

  it('marks a bounded v2 issue list and retains available fields from irregular issue samples', () => {
    const report = {
      report_version: 2,
      outcome: null,
      summary: {
        total_entries: -1,
        imported_count: '2',
        existing_count: Infinity,
        not_imported_count: 0,
        validation_issue_count: 5,
      },
      validation_issues_truncated: false,
      validation_issues: [
        null,
        [],
        {
          location: '$.processDataSet.name',
          severity: 'error',
          message: 'Invalid name',
          issue_code: 'INVALID_NAME',
          ignore_reason: 'result_filter_v2',
        },
        { file_path: 'data/unknown.json' },
      ],
    };
    const downloaded = buildDownloadableImportReport(report, 'bounded');
    expect(downloaded.issues_by_file_truncated).toBe(true);
    expect(downloaded.issues_by_file).toEqual([
      {
        file_path: null,
        issues: [
          {
            location: '$.processDataSet.name',
            severity: 'error',
            explanation: 'Invalid name',
            issue_code: 'INVALID_NAME',
            ignored_for_import: false,
            ignore_reason: 'result_filter_v2',
          },
        ],
      },
      {
        file_path: 'data/unknown.json',
        issues: [
          {
            location: null,
            severity: null,
            explanation: null,
            issue_code: null,
            ignored_for_import: false,
          },
        ],
      },
    ]);
    expect((downloaded.human_summary as Record<string, string>).en_US).toContain(
      'Total records: —; inserted: —; skipped because type, ID and version already exist: —; not imported: 0',
    );
  });

  it('keeps an incomplete v2 report readable without claiming absent counts or issues', () => {
    const downloaded = buildDownloadableImportReport(
      { report_version: 2, outcome: 'interrupted' },
      'incomplete',
    );
    expect(downloaded.issues_by_file).toEqual([]);
    expect(downloaded.issues_by_file_truncated).toBe(false);
    expect((downloaded.human_summary as Record<string, string>).en_US).toContain(
      'Total records: —',
    );
  });

  it.each([null, [], 'invalid', { summary: {} }, { code: 'VALIDATION_FAILED' }])(
    'rejects malformed historical report data (%p)',
    (value) => {
      expect(() => buildDownloadableImportReport(value, 'invalid')).toThrow(
        'Invalid import report',
      );
    },
  );
});
