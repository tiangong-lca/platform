import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface CoverageHost {
  platform: NodeJS.Platform;
  arch: string;
  logicalCpuCount: number;
  availableCpuCount: number;
  memoryBytes: number;
  runnerEnvironment?: string;
  imageOS?: string;
}

const {
  agentLogDirectory,
  coverageWorkerCount,
  failedItems,
  jestNodeArgs,
  parseRunnerArgs,
  safeStageName,
  stageSummary,
  unitWorkerArgs,
} = require('../../../scripts/test-runner.cjs') as {
  agentLogDirectory: () => string;
  coverageWorkerCount: (host: CoverageHost) => number;
  failedItems: (
    summary: Record<string, any>,
    root?: string,
  ) => Array<{ assertions: string[]; suite: string }>;
  jestNodeArgs: (platform?: NodeJS.Platform) => string[];
  parseRunnerArgs: (args: string[], host?: CoverageHost) => { args: string[]; stage?: string };
  safeStageName: (value: string) => string;
  stageSummary: (
    stage: string,
    summary: Record<string, number>,
    exitCode: number,
    durationMs: number,
    logPath: string,
  ) => string;
  unitWorkerArgs: (platform?: NodeJS.Platform) => string[];
};

const qualifiedMac: CoverageHost = {
  platform: 'darwin',
  arch: 'arm64',
  logicalCpuCount: 18,
  availableCpuCount: 18,
  memoryBytes: 128 * 1024 ** 3,
};

const qualifiedHostedLinux: CoverageHost = {
  platform: 'linux',
  arch: 'x64',
  logicalCpuCount: 4,
  availableCpuCount: 4,
  memoryBytes: 16 * 1024 ** 3 - 256 * 1024 ** 2,
  runnerEnvironment: 'github-hosted',
  imageOS: 'ubuntu26',
};

describe('agent-aware Jest runner', () => {
  it('removes runner-only stage arguments before invoking Jest', () => {
    expect(parseRunnerArgs(['--stage', 'coverage gate', '--runInBand'])).toEqual({
      args: ['--runInBand'],
      stage: 'coverage gate',
    });
    expect(safeStageName('coverage gate / retry')).toBe('coverage-gate-retry');
    expect(agentLogDirectory()).toBe(agentLogDirectory());
  });

  it('expands the coverage marker in place and keeps a positional marker literal', () => {
    expect(
      parseRunnerArgs(
        [
          '--stage=coverage',
          '--coverage',
          '--default-coverage-workers',
          '--workerIdleMemoryLimit=512MB',
          '--',
          '--default-coverage-workers',
        ],
        qualifiedMac,
      ),
    ).toEqual({
      args: [
        '--coverage',
        '--maxWorkers=3',
        '--workerIdleMemoryLimit=512MB',
        '--',
        '--default-coverage-workers',
      ],
      stage: 'coverage',
    });
    expect(parseRunnerArgs(['--', '--default-coverage-workers'])).toEqual({
      args: ['--', '--default-coverage-workers'],
      stage: undefined,
    });
    expect(() => parseRunnerArgs(['--default-coverage-workers', '--stage', 'unit-src'])).toThrow(
      '--default-coverage-workers requires --stage coverage',
    );
  });

  it('uses three coverage workers only for the qualified native Mac profile', () => {
    expect(coverageWorkerCount(qualifiedMac)).toBe(3);
    for (const difference of [
      { platform: 'linux' },
      { platform: 'win32' },
      { arch: 'x64' },
      { logicalCpuCount: 16 },
      { logicalCpuCount: 20 },
      { availableCpuCount: 17 },
      { availableCpuCount: 19 },
      { memoryBytes: 64 * 1024 ** 3 },
      { memoryBytes: 192 * 1024 ** 3 },
    ] satisfies Partial<CoverageHost>[]) {
      expect(coverageWorkerCount({ ...qualifiedMac, ...difference })).toBe(2);
    }
  });

  it('uses three coverage workers for the qualified hosted Ubuntu profile', () => {
    expect(coverageWorkerCount(qualifiedHostedLinux)).toBe(3);
    for (const memoryBytes of [15 * 1024 ** 3, 16 * 1024 ** 3]) {
      expect(coverageWorkerCount({ ...qualifiedHostedLinux, memoryBytes })).toBe(3);
    }
    for (const difference of [
      { platform: 'darwin' },
      { platform: 'win32' },
      { arch: 'arm64' },
      { logicalCpuCount: 3 },
      { logicalCpuCount: 5 },
      { availableCpuCount: 3 },
      { availableCpuCount: 5 },
      { memoryBytes: 15 * 1024 ** 3 - 1 },
      { memoryBytes: 16 * 1024 ** 3 + 1 },
      { runnerEnvironment: undefined },
      { runnerEnvironment: 'self-hosted' },
      { runnerEnvironment: 'GitHub-hosted' },
      { imageOS: undefined },
      { imageOS: 'ubuntu24' },
      { imageOS: 'Ubuntu26' },
    ] satisfies Partial<CoverageHost>[]) {
      expect(coverageWorkerCount({ ...qualifiedHostedLinux, ...difference })).toBe(2);
    }
  });

  it('keeps the canonical worker argument and all caller arguments in their original positions', () => {
    for (const callerArgs of [
      ['--maxWorkers', '9'],
      ['--max-workers=50%'],
      ['-w', '1'],
      ['-w2'],
      ['--runInBand'],
      ['-i'],
      ['--detectOpenHandles'],
      ['--runInBand=false', '--no-detect-open-handles'],
      ['--runInBand', '--no-run-in-band', '-ei', 'false'],
      ['--no-max-workers', '-w='],
      ['--', '-i'],
    ]) {
      const argv = [
        '--stage',
        'coverage',
        '--coverage',
        '--default-coverage-workers',
        ...callerArgs,
      ];
      expect(parseRunnerArgs(argv, qualifiedMac).args).toEqual([
        '--coverage',
        '--maxWorkers=3',
        ...callerArgs,
      ]);
      expect(parseRunnerArgs(argv, qualifiedHostedLinux).args).toEqual([
        '--coverage',
        '--maxWorkers=3',
        ...callerArgs,
      ]);
      expect(parseRunnerArgs(argv, { ...qualifiedMac, platform: 'linux' }).args).toEqual([
        '--coverage',
        '--maxWorkers=2',
        ...callerArgs,
      ]);
    }
  });

  it.each([false, true])(
    'passes coverage arguments to the Jest child in agent mode %s',
    (agentMode) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tiangong-coverage-worker-'));
      const previousMode = process.env.TIANGONG_AGENT_MODE;
      const previousLogDirectory = process.env.TIANGONG_TEST_LOG_DIR;
      const child = jest.fn(() => ({ status: 0, signal: null }));
      const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      const requestedArgs = ['--coverage', '--workerIdleMemoryLimit=512MB', '--testTimeout=20000'];
      const marker = ['--stage', 'coverage', '--default-coverage-workers'];
      const workers = coverageWorkerCount({
        platform: process.platform,
        arch: process.arch,
        logicalCpuCount: os.cpus().length,
        availableCpuCount: os.availableParallelism(),
        memoryBytes: os.totalmem(),
        runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
        imageOS: process.env.ImageOS,
      });
      try {
        process.env.TIANGONG_AGENT_MODE = agentMode ? '1' : '0';
        process.env.TIANGONG_TEST_LOG_DIR = directory;
        jest.doMock('node:child_process', () => ({ spawnSync: child }));
        jest.isolateModules(() => {
          const { main } = require('../../../scripts/test-runner.cjs') as {
            main: (args: string[]) => number;
          };
          expect(main([...marker, ...requestedArgs])).toBe(0);
          expect(main([...marker, ...requestedArgs, '-w', '1'])).toBe(0);
          expect(main(['--stage', 'focused', 'example.test.ts'])).toBe(0);
        });
        const launcher = [...jestNodeArgs(), require.resolve('jest/bin/jest')];
        for (const [index, args, stage] of [
          [1, [`--maxWorkers=${workers}`, ...requestedArgs], 'coverage'],
          [2, [`--maxWorkers=${workers}`, ...requestedArgs, '-w', '1'], 'coverage'],
          [3, ['example.test.ts'], 'focused'],
        ] as const) {
          const reporting = agentMode
            ? ['--json', `--outputFile=${path.join(directory, `${stage}.json`)}`]
            : [];
          expect(child).toHaveBeenNthCalledWith(
            index,
            process.execPath,
            [...launcher, ...args, ...reporting],
            expect.any(Object),
          );
        }
      } finally {
        output.mockRestore();
        jest.dontMock('node:child_process');
        if (previousMode === undefined) delete process.env.TIANGONG_AGENT_MODE;
        else process.env.TIANGONG_AGENT_MODE = previousMode;
        if (previousLogDirectory === undefined) delete process.env.TIANGONG_TEST_LOG_DIR;
        else process.env.TIANGONG_TEST_LOG_DIR = previousLogDirectory;
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('reports only failed suites and assertions from structured Jest output', () => {
    const root = path.join(path.sep, 'repo');
    expect(
      failedItems(
        {
          testResults: [
            {
              assertionResults: [
                { fullName: 'passes', status: 'passed' },
                { fullName: 'explains the exact failure', status: 'failed' },
              ],
              name: path.join(root, 'tests/unit/example.test.ts'),
              status: 'failed',
            },
            {
              assertionResults: [],
              name: path.join(root, 'tests/unit/passing.test.ts'),
              status: 'passed',
            },
          ],
        },
        root,
      ),
    ).toEqual([
      {
        assertions: ['explains the exact failure'],
        suite: 'tests/unit/example.test.ts',
      },
    ]);
  });

  it('prints a bounded final stage summary with the full-log location', () => {
    expect(
      stageSummary(
        'coverage',
        {
          numFailedTestSuites: 1,
          numFailedTests: 2,
          numTotalTestSuites: 10,
          numTotalTests: 100,
        },
        1,
        1234,
        '.local/test-logs/coverage.log',
      ),
    ).toBe(
      'Summary coverage: failed; suites=10; failedSuites=1; tests=100; failedTests=2; durationMs=1234; log=.local/test-logs/coverage.log',
    );
  });

  it('recycles long-lived macOS workers before the known Node 24 V8 failure boundary', () => {
    expect(unitWorkerArgs('darwin')).toEqual(['--maxWorkers=25%', '--workerIdleMemoryLimit=512MB']);
    expect(unitWorkerArgs('linux')).toEqual(['--maxWorkers=50%']);
  });

  it('passes the targeted Darwin V8 mitigation flags to Jest without changing other platforms', () => {
    expect(jestNodeArgs('darwin')).toEqual([
      '--no-concurrent-recompilation',
      '--no-maglev',
      '--no-sparkplug',
    ]);
    expect(jestNodeArgs('linux')).toEqual([]);
    expect(jestNodeArgs('win32')).toEqual([]);
    expect(process.execArgv).toEqual(expect.arrayContaining(jestNodeArgs(process.platform)));
  });

  it('observes real installed Jest-worker runtime flags and closes every owned child', () => {
    const fixture = path.resolve(__dirname, '../../package-contracts/jestWorkerRuntimeFixture.cjs');
    const required = jestNodeArgs(process.platform);
    for (const negative of [false, true]) {
      const launched = negative ? required.filter((flag) => flag !== '--no-sparkplug') : required;
      const expected =
        negative && !required.includes('--no-sparkplug')
          ? [...required, '--no-sparkplug']
          : required;
      const result = spawnSync(process.execPath, [...launched, fixture, JSON.stringify(expected)], {
        cwd: path.resolve(__dirname, '../../..'),
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect({ status: result.status, diagnostic: negative ? '' : result.stderr }).toEqual({
        status: negative ? 1 : 0,
        diagnostic: '',
      });
      const receipt = JSON.parse(result.stdout);
      expect(receipt.jestWorker).toBe('30.5.1');
      expect(receipt.children).toHaveLength(2);
      expect(new Set(receipt.children.map((child: { pid: number }) => child.pid)).size).toBe(2);
      for (const child of receipt.children) {
        expect(child.pid).not.toBe(receipt.parent.pid);
        expect(child.node).toBe(process.versions.node);
        expect(child.v8).toBe(process.versions.v8);
        expect(child.platform).toBe(process.platform);
        expect(child.arch).toBe(process.arch);
        expect(child.execArgv).toEqual(expect.arrayContaining(launched));
        expect(child.execArgv.includes('--no-sparkplug')).toBe(launched.includes('--no-sparkplug'));
      }
      expect(receipt.forceExited).toBe(false);
      expect(receipt.childrenClosed).toBe(true);
      expect(receipt.missingFlags).toEqual(negative ? ['--no-sparkplug'] : []);
      expect(result.stderr.includes('missing required worker flags: --no-sparkplug')).toBe(
        negative,
      );
      // Sanitized source-bound evidence, available in ordinary/compact full Jest logs.
      console.log(
        JSON.stringify({
          workerRuntimeContract: negative ? 'negative-control' : 'positive',
          ...receipt,
        }),
      );
    }
  });
});
