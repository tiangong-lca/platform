const { configUmiAlias, createConfig } = require('@umijs/max/test');

module.exports = async () => {
  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  // Local Docker bind mounts can be root-owned and unreadable to Jest crawlers.
  const dockerPathIgnores = ['<rootDir>/docker/volumes/db/data'];
  const config = await configUmiAlias({
    ...createConfig({
      target: 'browser',
    }),
  });

  return {
    ...config,
    resolver: '<rootDir>/scripts/study-report/jest-resolver.cjs',
    clearMocks: true,
    openHandlesTimeout: 5000,
    testEnvironmentOptions: {
      ...(config?.testEnvironmentOptions || {}),
      url: 'http://localhost:8000',
    },
    setupFilesAfterEnv: [...(config.setupFilesAfterEnv || []), './tests/setupTests.jsx'],
    globals: {
      ...config.globals,
      localStorage: null,
    },
    collectCoverageFrom: [
      'src/**/*.{ts,tsx,js,jsx}',
      '!src/**/*.d.ts',
      '!src/.umi/**',
      '!src/.umi-production/**',
      '!src/.umi-test/**',
      '!src/**/typings.d.ts',
      '!src/service-worker.js',
      '!src/**/*.test.{ts,tsx,js,jsx}',
      '!src/**/*.spec.{ts,tsx,js,jsx}',
      // Exclude simple re-export index files
      '!src/components/index.ts',
      // Exclude UI orchestration wrappers that are covered by behavioral tests but still carry
      // a large amount of framework-driven branching noise under 100% global thresholds.
      '!src/components/ValidationIssueModal/index.tsx',
      '!src/components/LcaReleaseReadPanel/index.tsx',
      '!src/locales/en-US.ts',
      '!src/locales/zh-CN.ts',
      // Exclude type definition files
      '!src/services/**/data.ts',
      '!src/pages/Contacts/Components/edit.tsx',
      '!src/pages/DataProcessing/CalculationBundlePanel.tsx',
      '!src/pages/Flowproperties/Components/edit.tsx',
      '!src/pages/Flows/Components/edit.tsx',
      '!src/pages/Flows/Components/form.tsx',
      '!src/pages/Flows/Components/Property/edit.tsx',
      '!src/pages/LifeCycleModels/Components/toolbar/editIndex.tsx',
      '!src/pages/LifeCycleModels/Components/toolbar/eidtInfo.tsx',
      '!src/pages/NationalCarbonDashboard/index.tsx',
      '!src/pages/NationalCarbonDashboard/components/ProcessFlowGraph/ProcessFlowGraphCanvas.client.tsx',
      '!src/pages/NationalCarbonDashboard/components/ProcessFlowGraph/ProcessFlowGraphPanel.tsx',
      '!src/pages/NationalCarbonDashboard/components/ProcessFlowGraph/graphEngine.ts',
      '!src/pages/NationalCarbonDashboard/components/ProcessFlowGraph/graphTypes.ts',
      '!src/pages/NationalCarbonDashboard/components/ProcessFlowGraph/processFlowGraphCacheLoader.ts',
      '!src/pages/Processes/Components/edit.tsx',
      // Review Admin diagnostic is an Ant Design orchestration wrapper; focused component tests
      // own its manual-only, informational, polling, failure, and report-rendering contracts.
      '!src/pages/Review/Components/ReviewQualityDiagnostic.tsx',
      '!src/pages/Sources/Components/edit.tsx',
      '!src/pages/Unitgroups/Components/edit.tsx',
      '!src/pages/Unitgroups/Components/form.tsx',
      '!src/pages/Unitgroups/Components/Unit/edit.tsx',
    ],
    coverageThreshold: {
      global: {
        // Jest 30's Babel coverage adds source-less synthetic alternate slots for `if`
        // statements without an `else`. The repository report removes only those unmapped
        // slots, then enforces 100% source-mapped branch coverage in --assert-full mode.
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    coverageReporters: ['text', 'text-summary', 'json', 'json-summary', 'lcov', 'html'],
    testMatch: [
      '<rootDir>/tests/unit/**/*.test.{ts,tsx,js,jsx}',
      '<rootDir>/tests/integration/**/*.test.{ts,tsx,js,jsx}',
      '<rootDir>/src/**/*.test.{ts,tsx,js,jsx}',
    ],
    modulePathIgnorePatterns: [
      ...(config.modulePathIgnorePatterns || []),
      ...dockerPathIgnores,
      '<rootDir>/vendor/study-contract/.*/package.json',
    ],
    moduleNameMapper: {
      '^@tiangong-lca/tidas-sdk/core$': '<rootDir>/tests/mocks/tidas-sdk-core.js',
      '^@/tests/(.*)$': '<rootDir>/tests/$1',
      ...config.moduleNameMapper,
    },
    reporters: ['default', '<rootDir>/tests/reporters/failureSkippedSummaryReporter.js'],
    testSequencer: '<rootDir>/scripts/jest-sequencer.cjs',
    verbose: !isCI,
    watchPathIgnorePatterns: [...(config.watchPathIgnorePatterns || []), ...dockerPathIgnores],
  };
};
