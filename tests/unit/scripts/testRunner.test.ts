import { spawnSync } from 'node:child_process';
import path from 'node:path';

const {
  agentLogDirectory,
  failedItems,
  jestNodeArgs,
  parseRunnerArgs,
  safeStageName,
  stageSummary,
  unitWorkerArgs,
} = require('../../../scripts/test-runner.cjs') as {
  agentLogDirectory: () => string;
  failedItems: (
    summary: Record<string, any>,
    root?: string,
  ) => Array<{ assertions: string[]; suite: string }>;
  jestNodeArgs: (platform?: NodeJS.Platform) => string[];
  parseRunnerArgs: (args: string[]) => { args: string[]; stage?: string };
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

describe('agent-aware Jest runner', () => {
  it('removes runner-only stage arguments before invoking Jest', () => {
    expect(parseRunnerArgs(['--stage', 'coverage gate', '--runInBand'])).toEqual({
      args: ['--runInBand'],
      stage: 'coverage gate',
    });
    expect(safeStageName('coverage gate / retry')).toBe('coverage-gate-retry');
    expect(agentLogDirectory()).toBe(agentLogDirectory());
  });

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
      expect(receipt.jestWorker).toBe('30.5.0');
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
