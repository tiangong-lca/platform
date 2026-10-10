import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadQualificationClosureContract,
  qualificationAssertionFailures,
  qualificationCleanupFailures,
  qualificationClosureContract,
  qualificationCoverageFailures,
  qualificationReportFailures,
} from '../../../scripts/e2e/qualification-closure.cjs';

const root = process.cwd();
const contract = loadQualificationClosureContract(root);
const completeReport = () => ({
  assertionIds: [...contract.assertionIds],
  assertionBrowsers: Object.fromEntries(
    contract.assertionIds.map((id) => [id, [...contract.browsers]]),
  ),
  browsers: {
    chromium: { executed: 32, skipped: 0 },
    firefox: { executed: 17, skipped: 15 },
    webkit: { executed: 17, skipped: 15 },
  },
  canonicalBrowsers: JSON.parse(JSON.stringify(contract.canonicalBrowsers)),
  harnessBrowsers: JSON.parse(JSON.stringify(contract.harnessBrowsers)),
  externalRequests: 0,
  productionWrites: 0,
  status: 'passed',
});

describe('semantic qualification closure', () => {
  it('binds the current governed assertion IDs and reviewed complete browser discovery', () => {
    expect(contract.assertionIds).toHaveLength(60);
    expect(contract.coverage).toEqual({
      contractAssertionCount: 60,
      discoveredCases: 84,
      executedCases: 54,
      harnessControlCases: 12,
      liveAssertionCount: 60,
      qualificationDiscoveredCases: 96,
      skippedCases: 30,
    });
    // --list imports declarations only: no global setup, server, browser or backend operation.
    const discoveryEnvironment = { ...process.env };
    // This is a separate declaration-only Playwright CLI, not a Playwright invocation in Jest.
    delete discoveryEnvironment.JEST_WORKER_ID;
    const discovery = spawnSync(
      path.join(root, 'node_modules/.bin/playwright'),
      ['test', '--config=playwright.config.ts', '--list', '--reporter=json'],
      {
        cwd: root,
        env: {
          ...discoveryEnvironment,
          E2E_AUTHENTICATED: 'true',
          E2E_EXTERNAL_SERVER: 'true',
          E2E_QUALIFICATION: 'true',
          E2E_WRITE_VERIFIED_EVIDENCE: 'false',
        },
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    expect({ status: discovery.status, error: discovery.stderr }).toEqual({ status: 0, error: '' });
    const report = JSON.parse(discovery.stdout);
    const entries: { browser: string; file: string }[] = [];
    const collect = (suite: any) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) entries.push({ browser: test.projectName, file: spec.file });
      }
      (suite.suites ?? []).forEach(collect);
    };
    report.suites.forEach(collect);
    expect(entries).toHaveLength(contract.coverage.qualificationDiscoveredCases);
    const chromiumOnlySpecs = new Set([
      'carbon-footprint-guide.spec.ts',
      'process-persisted-authoring.spec.ts',
      'responsive-layout.spec.ts',
      'responsive-surfaces.spec.ts',
      'route-inventory.spec.ts',
      'runtime/lexical-search-workflows.spec.ts',
      'state-semantics.spec.ts',
      'typed-view-variants.spec.ts',
    ]);
    for (const browser of contract.browsers) {
      const canonical = entries.filter(
        (entry) => entry.browser === browser && entry.file !== 'harness-qualification.spec.ts',
      );
      const skipped =
        browser === 'chromium'
          ? 0
          : canonical.filter(({ file }) => chromiumOnlySpecs.has(file)).length;
      expect({ executed: canonical.length - skipped, skipped }).toEqual(
        contract.canonicalBrowsers[browser],
      );
      expect(
        entries.filter(
          (entry) => entry.browser === browser && entry.file === 'harness-qualification.spec.ts',
        ),
      ).toHaveLength(contract.harnessBrowsers[browser].executed);
    }
    expect(qualificationReportFailures(completeReport(), contract)).toEqual([]);
  });

  it('rejects disagreement between the declared assertion count and executable keys', () => {
    const coverage = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/plans/i18n/route-view-coverage.json'), 'utf8'),
    );
    coverage.proofPolicy.evidenceContract.requiredAssertionCount -= 1;
    expect(() => qualificationClosureContract(coverage)).toThrow('contract is inconsistent');
    expect(() => qualificationClosureContract(null)).toThrow('contract is inconsistent');
  });

  it.each(['missing', 'extra', 'substituted', 'duplicate'])(
    'rejects %s assertion identity',
    (kind) => {
      const report = completeReport();
      if (kind === 'missing') report.assertionIds.pop();
      if (kind === 'extra') report.assertionIds.push('rv.unexpected');
      if (kind === 'substituted') report.assertionIds[0] = 'rv.unexpected';
      if (kind === 'duplicate') report.assertionIds[0] = report.assertionIds[1];
      expect(qualificationAssertionFailures(report, contract)).toContain('assertion-id-set');
    },
  );

  it('rejects wrong projects, duplicate applicability, and missing critical coverage', () => {
    const report = completeReport();
    report.assertionBrowsers[contract.criticalAssertionIds[0]] = ['chromium', 'firefox'];
    expect(qualificationReportFailures(report, contract)).toContain(
      'assertion-browser-applicability',
    );
    report.assertionBrowsers[contract.criticalAssertionIds[0]] = ['chromium', 'firefox', 'firefox'];
    expect(qualificationReportFailures(report, contract)).toContain(
      'assertion-browser-applicability',
    );
    const wrongProjects = {
      ...completeReport(),
      canonicalBrowsers: {
        ...contract.canonicalBrowsers,
        safari: contract.canonicalBrowsers.webkit,
      },
    };
    expect(qualificationReportFailures(wrongProjects, contract)).toContain(
      'canonicalBrowsers-projects',
    );
  });

  it('rejects partial execution, displaced execution, changed skips, and harness omissions', () => {
    const report = completeReport();
    report.canonicalBrowsers.chromium.executed -= 1;
    report.canonicalBrowsers.firefox.executed += 1;
    report.canonicalBrowsers.webkit.skipped -= 1;
    report.harnessBrowsers.webkit.executed -= 1;
    expect(qualificationReportFailures(report, contract)).toEqual(
      expect.arrayContaining([
        'canonicalBrowsers-chromium-counts',
        'canonicalBrowsers-firefox-counts',
        'canonicalBrowsers-webkit-counts',
        'harnessBrowsers-webkit-counts',
      ]),
    );
    expect(
      qualificationCoverageFailures({ ...contract.coverage, executedCases: 51 }, contract),
    ).toEqual(['coverage-executedCases']);
  });

  it('rejects malformed reports and every external, write, or cleanup effect', () => {
    expect(qualificationReportFailures(null, contract).length).toBeGreaterThan(0);
    expect(
      qualificationReportFailures(
        { ...completeReport(), status: 'failed', externalRequests: 1, productionWrites: 1 },
        contract,
      ),
    ).toEqual(expect.arrayContaining(['report-status', 'external-requests', 'production-writes']));
    expect(qualificationCleanupFailures({ created: 1, cleaned: 1, leaked: 1 })).toEqual([
      'cleanup-created',
      'cleanup-cleaned',
      'cleanup-leaked',
    ]);
    expect(qualificationCleanupFailures({ created: 0, cleaned: 0, leaked: 0 })).toEqual([]);
  });
});
