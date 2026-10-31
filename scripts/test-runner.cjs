#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const jestBin = require.resolve('jest/bin/jest');
const isCI = process.env.CI === 'true' || process.env.CI === '1';
const isAgentMode =
  process.env.TIANGONG_AGENT_MODE === '1' || process.env.TIANGONG_AGENT_MODE === 'true';
let resolvedAgentLogDirectory;

function parseRunnerArgs(argv) {
  const args = [];
  let stage;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--stage') {
      stage = argv[index + 1];
      if (!stage) throw new Error('--stage requires a value');
      index += 1;
    } else if (argument.startsWith('--stage=')) {
      stage = argument.slice('--stage='.length);
      if (!stage) throw new Error('--stage requires a value');
    } else {
      args.push(argument);
    }
  }
  return { args, stage };
}

function safeStageName(value) {
  return (
    String(value || 'jest')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'jest'
  );
}

function agentLogDirectory() {
  if (resolvedAgentLogDirectory) return resolvedAgentLogDirectory;
  if (process.env.TIANGONG_TEST_LOG_DIR) {
    resolvedAgentLogDirectory = path.resolve(process.env.TIANGONG_TEST_LOG_DIR);
    return resolvedAgentLogDirectory;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  resolvedAgentLogDirectory = path.resolve('.local/test-logs', `${timestamp}-${process.pid}`);
  return resolvedAgentLogDirectory;
}

function readJestSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch {
    return undefined;
  }
}

function failedItems(summary, root = process.cwd()) {
  if (!summary?.testResults) return [];
  return summary.testResults
    .filter((suite) => suite.status === 'failed')
    .map((suite) => ({
      assertions: (suite.assertionResults ?? [])
        .filter((assertion) => assertion.status === 'failed')
        .map((assertion) => assertion.fullName || assertion.title)
        .filter(Boolean),
      suite: path.relative(root, suite.name) || suite.name,
    }));
}

function stageSummary(stage, summary, exitCode, durationMs, logPath) {
  const suites = summary?.numTotalTestSuites ?? 0;
  const failedSuites = summary?.numFailedTestSuites ?? (exitCode === 0 ? 0 : 1);
  const tests = summary?.numTotalTests ?? 0;
  const failedTests = summary?.numFailedTests ?? 0;
  const status = exitCode === 0 ? 'passed' : 'failed';
  return `Summary ${stage}: ${status}; suites=${suites}; failedSuites=${failedSuites}; tests=${tests}; failedTests=${failedTests}; durationMs=${durationMs}; log=${logPath}`;
}

function unitWorkerArgs(platform = process.platform) {
  return platform === 'darwin'
    ? ['--maxWorkers=25%', '--workerIdleMemoryLimit=512MB']
    : ['--maxWorkers=50%'];
}

function jestNodeArgs(platform = process.platform) {
  return platform === 'darwin'
    ? ['--no-concurrent-recompilation', '--no-maglev', '--no-sparkplug']
    : [];
}

function runJest(args, stage = 'jest') {
  if (!isAgentMode) {
    const result = spawnSync(process.execPath, [...jestNodeArgs(), jestBin, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TZ: process.env.TZ || 'UTC',
      },
    });
    if (result.error) {
      // eslint-disable-next-line no-console
      console.error(result.error);
      return 1;
    }
    if (typeof result.status === 'number') return result.status;
    return result.signal ? 1 : 0;
  }

  const safeStage = safeStageName(stage);
  const logDirectory = agentLogDirectory();
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `${safeStage}.log`);
  const summaryPath = path.join(logDirectory, `${safeStage}.json`);
  const logFd = fs.openSync(logPath, 'w', 0o600);
  const startedAt = Date.now();
  process.stdout.write(`Stage ${safeStage}: running\n`);

  let result;
  try {
    result = spawnSync(
      process.execPath,
      [...jestNodeArgs(), jestBin, ...args, '--json', `--outputFile=${summaryPath}`],
      {
        stdio: ['inherit', logFd, logFd],
        env: {
          ...process.env,
          TZ: process.env.TZ || 'UTC',
        },
      },
    );
  } finally {
    fs.closeSync(logFd);
  }
  if (result?.error) {
    fs.appendFileSync(logPath, `\nRunner error:\n${result.error.stack ?? result.error.message}\n`);
  }

  const exitCode =
    result?.error || result?.signal ? 1 : typeof result?.status === 'number' ? result.status : 1;
  const summary = readJestSummary(summaryPath);
  if (exitCode !== 0) {
    const failures = failedItems(summary);
    if (failures.length === 0) {
      process.stdout.write(
        `Failed: Jest exited before structured failure results; inspect ${logPath}\n`,
      );
    } else {
      for (const failure of failures) {
        process.stdout.write(`Failed: ${failure.suite}\n`);
        for (const assertion of failure.assertions) {
          process.stdout.write(`  - ${assertion}\n`);
        }
      }
    }
  }
  process.stdout.write(
    `${stageSummary(safeStage, summary, exitCode, Date.now() - startedAt, logPath)}\n`,
  );
  return exitCode;
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseRunnerArgs(argv);
  if (parsed.args.length > 0) {
    return runJest(parsed.args, parsed.stage || 'jest');
  }

  const ciArgs = isCI ? ['--ci'] : [];
  const stages = [
    {
      args: [...ciArgs, 'tests/unit', 'src', ...unitWorkerArgs(), '--testTimeout=20000'],
      name: 'unit-src',
    },
    {
      args: [...ciArgs, 'tests/integration', '--runInBand', '--testTimeout=20000'],
      name: 'integration',
    },
  ];

  const startedAt = Date.now();
  for (const stage of stages) {
    const exitCode = runJest(stage.args, stage.name);
    if (exitCode !== 0) {
      if (isAgentMode) {
        process.stdout.write(
          `Summary Jest: failed; stage=${stage.name}; durationMs=${Date.now() - startedAt}; logs=${agentLogDirectory()}\n`,
        );
      }
      return exitCode;
    }
  }
  if (isAgentMode) {
    process.stdout.write(
      `Summary Jest: passed; stages=${stages.length}; durationMs=${Date.now() - startedAt}; logs=${agentLogDirectory()}\n`,
    );
  }
  return 0;
}

module.exports = {
  agentLogDirectory,
  failedItems,
  jestNodeArgs,
  main,
  parseRunnerArgs,
  safeStageName,
  stageSummary,
  unitWorkerArgs,
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    if (isAgentMode) {
      process.stdout.write(`Failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.stdout.write(`Summary Jest: failed; logs=${agentLogDirectory()}\n`);
    } else {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    process.exitCode = 1;
  }
}
