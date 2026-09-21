import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');
const pinnedPnpmSetup = 'uses: pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2 # v2.0.2';
const expectedPnpmVersion = '11.24.0';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function trackedRuntimeSources(): Array<{ relativePath: string; source: string }> {
  return ['src', 'tests']
    .flatMap((directory) =>
      (fs.readdirSync(path.join(repositoryRoot, directory), { recursive: true }) as string[])
        .filter((relativePath) => /\.(?:[cm]?[jt]sx?)$/u.test(relativePath))
        .map((relativePath) => path.join(directory, relativePath)),
    )
    .map((relativePath) => ({ relativePath, source: read(relativePath) }));
}

describe('pnpm package-manager contract', () => {
  it('pins the exact Node 24 and pnpm 11 toolchain and keeps one pnpm lockfile', () => {
    const packageJson = JSON.parse(read('package.json'));
    const applicationDockerfile = read('Dockerfile.app');
    const e2eDockerfile = read('docker/e2e/Dockerfile');
    const e2eEnvironment = JSON.parse(read('docker/e2e/environment.json'));
    const workflows = fs
      .readdirSync(path.join(repositoryRoot, '.github/workflows'))
      .map((fileName) => ({ fileName, source: read(`.github/workflows/${fileName}`) }));

    expect(packageJson.packageManager).toBe(`pnpm@${expectedPnpmVersion}`);
    expect(packageJson.engines).toEqual({ node: '24.19.0', pnpm: expectedPnpmVersion });
    expect(read('.nvmrc').trim()).toBe('24.19.0');
    expect(applicationDockerfile).toMatch(/^FROM node:24\.19\.0-alpine@sha256:[a-f0-9]{64}$/mu);
    expect(applicationDockerfile).toContain(`pnpm@${expectedPnpmVersion}`);
    expect(e2eDockerfile).toMatch(
      /^ARG NODE_IMAGE=node:24\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/mu,
    );
    expect(e2eDockerfile).toContain(`pnpm@${expectedPnpmVersion}`);
    expect(e2eEnvironment).toMatchObject({
      nodeImage:
        'node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df',
      nodeMajor: 24,
      nodeVersion: '24.19.0',
    });
    expect(e2eDockerfile).toContain(`ARG NODE_IMAGE=${e2eEnvironment.nodeImage}`);
    for (const workflow of workflows) {
      expect(workflow).toEqual({
        fileName: workflow.fileName,
        source: expect.not.stringMatching(
          /11\.(?:22|23)\.0|node@24(?:\s|$)|node-version:\s*24(?:\s|$)/mu,
        ),
      });
    }
    for (const workflow of workflows.filter(({ source }) => source.includes('uses: pnpm/setup@'))) {
      expect(workflow.source).toContain(pinnedPnpmSetup);
      expect(workflow.source).toContain(`version: ${expectedPnpmVersion}`);
      expect(workflow.source).toContain('runtime: node@24.19.0');
    }
    for (const workflow of workflows.filter(({ source }) =>
      source.includes('uses: actions/setup-node@'),
    )) {
      expect(workflow.source).toContain('node-version: 24.19.0');
    }
    expect(packageJson.devDependencies['@jest/test-sequencer']).toBe('^30.5.0');
    expect(JSON.parse(read('.ncurc.json')).reject).toContain('@types/node');
    expect(fs.existsSync(path.join(repositoryRoot, 'pnpm-lock.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(repositoryRoot, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.join(repositoryRoot, 'yarn.lock'))).toBe(false);
  });

  it('pins the released SDK and removes its retired compiler-generation graph', () => {
    const packageJson = JSON.parse(read('package.json'));
    const lockfile = read('pnpm-lock.yaml');

    expect(packageJson.dependencies['@tiangong-lca/tidas-sdk']).toBe('0.3.1');
    expect(packageJson.devDependencies.typescript).toBe('7.0.2');
    expect(lockfile).toMatch(/^\s{2}'?@tiangong-lca\/tidas-sdk@0\.3\.1'?\s*:/mu);
    expect(lockfile).toMatch(/^\s{2}typescript@7\.0\.2\s*:/mu);
    expect(lockfile).not.toMatch(/^\s{2}typescript@[0-6]\./mu);
    expect(lockfile).not.toMatch(/^\s{2}(?:'@typescript\/vfs|ts-to-zod)@/mu);
  });

  it('uses only the reviewed isolated-linker compatibility and build policy', () => {
    const workspace = read('pnpm-workspace.yaml');

    expect(workspace).not.toContain("  - '@ant-design/*'");
    expect(workspace).toContain("  - '@babel/*'");
    expect(workspace).toContain('  - umi');
    expect(workspace).toMatch(/electron-winstaller:\s+true/u);
    expect(workspace).toMatch(/esbuild:\s+true/u);
    expect(workspace).toMatch(/core-js:\s+false/u);
    expect(workspace).toMatch(/core-js-pure:\s+false/u);
    expect(workspace).toMatch(/es5-ext:\s+false/u);
    expect(workspace).toMatch(/'@parcel\/watcher':\s+false/u);
    expect(workspace).toMatch(/unrs-resolver:\s+false/u);
    expect(workspace).toContain("'@umijs/max>antd': 6.6.2");
    expect(workspace).toContain("'@umijs/plugins>@ant-design/pro-components': 3.1.14-6");
    expect(workspace).toContain("'@umijs/preset-umi>react': 19.2.8");
    expect(workspace).toContain("'@umijs/preset-umi>react-dom': 19.2.8");
    expect(workspace).toContain("'@umijs/server>react': 19.2.8");
    expect(workspace).toContain("'@umijs/server>react-dom': 19.2.8");
    expect(workspace).not.toMatch(
      /set this to true or false|shamefullyHoist|dangerouslyAllowAllBuilds/u,
    );
  });

  it('pins one native React 19 and Ant Design 6 application stack', () => {
    const packageJson = JSON.parse(read('package.json'));
    const config = read('config/config.ts');
    const lockfile = read('pnpm-lock.yaml');

    expect(packageJson.dependencies).toMatchObject({
      '@ant-design/icons': '6.3.4',
      '@ant-design/pro-components': '3.1.14-6',
      antd: '6.6.2',
      react: '19.2.8',
      'react-dom': '19.2.8',
    });
    expect(packageJson.devDependencies).toMatchObject({
      '@types/react': '19.2.18',
      '@types/react-dom': '19.2.5',
      '@umijs/max': '4.7.9',
      '@umijs/max-plugin-openapi': '2.0.3',
      '@umijs/request-record': '1.1.4',
    });
    expect(packageJson.devDependencies).not.toHaveProperty('umi-presets-pro');
    expect(config).toContain("plugins: ['@umijs/max-plugin-openapi', '@umijs/request-record']");
    expect(config).not.toContain('root-entry-name');
    expect(config).not.toContain('umi-presets-pro');
    expect(lockfile).not.toMatch(/(?:^|\W)antd@(?:4|5)\./mu);
    expect(lockfile).not.toMatch(/^\s{2}'?@ant-design\/icons@6\.3\.2'?:/mu);
    expect(lockfile).not.toMatch(/@ant-design\/pro-components@2\./u);
    expect(lockfile).not.toMatch(/(?:^|\W)react(?:-dom)?@18\./mu);
  });

  it('pins the reviewed Jest 30, DOM, Electron 44, and dependency-audit majors', () => {
    const packageJson = JSON.parse(read('package.json'));
    const devDependencies = packageJson.devDependencies as Record<string, string>;
    const lockfile = read('pnpm-lock.yaml');
    const firstPartySources = trackedRuntimeSources();

    expect(devDependencies).toMatchObject({
      '@jest/test-sequencer': '^30.5.0',
      '@testing-library/jest-dom': '^7.0.1',
      '@types/jest': '^30.0.0',
      electron: '^44.1.0',
      jest: '^30.5.0',
      'jest-environment-jsdom': '^30.5.0',
      'npm-check-updates': '^23.1.0',
    });
    expect(packageJson.scripts.ncu).toBe('ncu');
    expect(packageJson.scripts['ncu:update']).toBe('ncu -u');
    expect(lockfile).not.toMatch(
      /^\s{2}(?:'@jest\/test-sequencer|jest|jest-environment-jsdom)@29\./mu,
    );
    expect(lockfile).not.toMatch(/^\s{2}electron@43\./mu);

    const removedJestMatcherAlias =
      /\.(?:toBeCalled|toBeCalledTimes|toBeCalledWith|lastCalledWith|nthCalledWith|toReturn|toReturnTimes|toReturnWith|lastReturnedWith|nthReturnedWith|toThrowError)\s*\(/u;
    const jestInternalDeepImport =
      /(?:from\s+|require\(\s*)['"](?:jest-[^'"]+|@jest\/[^'"]+)\/build\//u;
    for (const { relativePath, source } of firstPartySources) {
      expect({ relativePath, source }).toEqual({
        relativePath,
        source: expect.not.stringMatching(removedJestMatcherAlias),
      });
      expect({ relativePath, source }).toEqual({
        relativePath,
        source: expect.not.stringMatching(jestInternalDeepImport),
      });
      expect({ relativePath, source }).toEqual({
        relativePath,
        source: expect.not.stringMatching(/\bjest\.SpyInstance\b/u),
      });
    }
    expect(read('jest.config.cjs')).not.toMatch(/\btestPathPattern\b/u);
  });

  it('enforces full source-mapped branch coverage under Jest 30', () => {
    const jestConfig = read('jest.config.cjs');
    const coverageReportSource = read('scripts/test-coverage-report.js');
    const packageJson = JSON.parse(read('package.json'));
    const { assertRawBranchSummary, summarizeSourceMappedBranches } = require(
      path.join(repositoryRoot, 'scripts/test-coverage-report.js'),
    ) as {
      assertRawBranchSummary: (
        rawCoverage: { found: number; hit: number },
        normalizedCoverage: { rawFound: number; rawHit: number },
        filePath: string,
      ) => void;
      summarizeSourceMappedBranches: (
        entry: Record<string, unknown>,
        filePath: string,
      ) => {
        found: number;
        hit: number;
        ignoredSyntheticAlternates: number;
        pct: number;
        rawFound: number;
        rawHit: number;
      };
    };
    const sourceLocation = {
      end: { column: 8, line: 2 },
      start: { column: 0, line: 2 },
    };

    expect(jestConfig).toContain('source-less synthetic alternate slots');
    expect(jestConfig).not.toMatch(/coverageThreshold:[\s\S]*?branches:\s*100/u);
    expect(packageJson.scripts['prepush:gate']).toContain('test:coverage:assert-full');
    expect(coverageReportSource).toContain("['Branches', total.branches]");

    expect(
      summarizeSourceMappedBranches(
        {
          b: {
            0: [4, 0],
            1: [2, 3],
          },
          branchMap: {
            0: { locations: [sourceLocation, {}], type: 'if' },
            1: { locations: [sourceLocation, sourceLocation], type: 'cond-expr' },
          },
        },
        'src/example.ts',
      ),
    ).toEqual({
      found: 3,
      hit: 3,
      ignoredSyntheticAlternates: 1,
      pct: 100,
      rawFound: 4,
      rawHit: 3,
    });

    expect(
      summarizeSourceMappedBranches(
        {
          b: { 0: [1, 0] },
          branchMap: {
            0: { locations: [sourceLocation, sourceLocation], type: 'cond-expr' },
          },
        },
        'src/uncovered.ts',
      ),
    ).toMatchObject({
      found: 2,
      hit: 1,
      ignoredSyntheticAlternates: 0,
      pct: 50,
      rawFound: 2,
      rawHit: 1,
    });

    expect(() =>
      summarizeSourceMappedBranches(
        {
          b: { 0: [1, 0] },
          branchMap: {
            0: { locations: [sourceLocation, {}], type: 'cond-expr' },
          },
        },
        'src/malformed.ts',
      ),
    ).toThrow('unsupported unmapped path');

    expect(() =>
      summarizeSourceMappedBranches(
        {
          b: {},
          branchMap: {
            0: { locations: [sourceLocation, sourceLocation], type: 'cond-expr' },
          },
        },
        'src/truncated.ts',
      ),
    ).toThrow('branch map has no hit vector');

    expect(() =>
      summarizeSourceMappedBranches(
        {
          b: { 0: [] },
          branchMap: { 0: { locations: [], type: 'if' } },
        },
        'src/empty-vector.ts',
      ),
    ).toThrow('empty path vector');

    expect(() =>
      assertRawBranchSummary(
        { found: 3, hit: 2 },
        { rawFound: 2, rawHit: 2 },
        'src/truncated-summary.ts',
      ),
    ).toThrow('summary does not match its path vectors');
  });

  it('keeps the Electron 44 publication matrix on supported 64-bit targets', () => {
    const electronSources = ['electron/main.ts', 'electron/preload.ts'].map(read).join('\n');
    const buildWorkflow = read('.github/workflows/build.yml');

    expect(electronSources).not.toMatch(
      /\b(?:clipboard|isUnityRunning|select-client-certificate|openAsHidden|wasOpenedAsHidden|restoreState)\b/u,
    );
    expect(buildWorkflow).toContain('os: macos-latest');
    expect(buildWorkflow).toContain('os: ubuntu-24.04-arm');
    expect(buildWorkflow).not.toMatch(/\b(?:ia32|armv7l)\b/u);
  });

  it('contains no Ant Design 5 patch or split ProComponents import path', () => {
    const forbiddenImport =
      /(?:from\s+|require\(\s*)['"]@ant-design\/(?:v5-patch-for-react-19|pro-(?:card|descriptions|field|form|layout|list|provider|skeleton|table|utils))['"]/u;
    const legacyAntdCommonJsImport = /(?:from\s+|require\(\s*)['"]antd\/lib\//u;
    const legacyRenderOverride = ['unstable', 'SetRender'].join('');
    const legacyComponentMembers = [
      ['Descriptions', 'Item'],
      ['Select', 'Option'],
      ['Tabs', 'TabPane'],
      ['Timeline', 'Item'],
      ['Breadcrumb', 'Item'],
      ['Mentions', 'Option'],
      ['Button', 'Group'],
      ['Input', 'Group'],
      ['Dropdown', 'Button'],
      ['Statistic', 'Countdown'],
    ].map((parts) => parts.join('.'));

    for (const sourceFile of trackedRuntimeSources()) {
      expect(sourceFile).toEqual({
        relativePath: sourceFile.relativePath,
        source: expect.not.stringMatching(forbiddenImport),
      });
      expect(sourceFile.source).not.toMatch(legacyAntdCommonJsImport);
      expect(sourceFile.source).not.toContain(legacyRenderOverride);
      for (const legacyComponentMember of legacyComponentMembers) {
        expect(sourceFile.source).not.toContain(legacyComponentMember);
      }
    }
  });

  it('contains no npm, npx, or yarn executable in active package-manager entrypoints', () => {
    const entrypoints = [
      'package.json',
      '.husky/pre-commit',
      '.husky/pre-push',
      '.dockerignore',
      'Dockerfile.app',
      'docker/e2e/Dockerfile',
      'playwright.config.ts',
      'playwright.closure-download.config.ts',
      'config/docs-capture/profile.v1.json',
      'src/locales/de-DE/pages.ts',
      'src/locales/en-US/pages.ts',
      'src/locales/fr-FR/pages.ts',
      'src/locales/zh-CN/pages.ts',
      ...fs
        .readdirSync(path.join(repositoryRoot, '.github/workflows'))
        .map((fileName) => `.github/workflows/${fileName}`),
    ];
    const legacyCommand = /(^|[\s"'`:])(?:npm|npx|yarn)(?=$|[\s"'])/mu;
    const npmStylePnpmSeparator = /\bpnpm(?: --silent)? [^\s`]+ --(?:\s|$)/u;

    for (const relativePath of entrypoints) {
      expect({ relativePath, source: read(relativePath) }).toEqual({
        relativePath,
        source: expect.not.stringMatching(legacyCommand),
      });
      expect({ relativePath, source: read(relativePath) }).toEqual({
        relativePath,
        source: expect.not.stringMatching(npmStylePnpmSeparator),
      });
    }
  });

  it('documents pnpm script arguments without the npm-only separator', () => {
    const documents = [
      'AGENTS.md',
      'DEV.md',
      ...fs
        .readdirSync(path.join(repositoryRoot, 'docs/agents'))
        .filter((fileName) => fileName.endsWith('.md'))
        .map((fileName) => `docs/agents/${fileName}`),
      'docs/plans/i18n-de-DE/README.md',
      'docs/plans/i18n-fr-FR/README.md',
    ];
    const npmStylePnpmSeparator = /\bpnpm(?: --silent)? [^\s`]+ --(?:\s|$)/u;

    for (const relativePath of documents) {
      expect({ relativePath, source: read(relativePath) }).toEqual({
        relativePath,
        source: expect.not.stringMatching(npmStylePnpmSeparator),
      });
    }
  });

  it('uses frozen installs and binds every pnpm install input in containers', () => {
    const workflows = fs
      .readdirSync(path.join(repositoryRoot, '.github/workflows'))
      .map((fileName) => read(`.github/workflows/${fileName}`))
      .join('\n');
    const appDockerfile = read('Dockerfile.app');
    const e2eDockerfile = read('docker/e2e/Dockerfile');

    expect(workflows).toContain('pnpm install --frozen-lockfile');
    expect(workflows).not.toContain('package-lock.json');
    for (const dockerfile of [appDockerfile, e2eDockerfile]) {
      expect(dockerfile).toContain('pnpm-lock.yaml');
      expect(dockerfile).toContain('pnpm-workspace.yaml');
      expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    }
  });
});
