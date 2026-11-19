#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const DATA_WORKFLOW_SUITES = [
  {
    command: 'test:contacts:all',
    scriptPath: 'tests/data-workflows/workflows/contacts/contacts-all-workflow.ts',
  },
  {
    command: 'test:sources:all',
    scriptPath: 'tests/data-workflows/workflows/sources/sources-all-workflow.ts',
  },
  {
    command: 'test:unitgroups:all',
    scriptPath: 'tests/data-workflows/workflows/unitgroups/unitgroups-all-workflow.ts',
  },
  {
    command: 'test:flowproperties:all',
    scriptPath: 'tests/data-workflows/workflows/flowproperties/flowproperties-all-workflow.ts',
  },
  {
    command: 'test:flows:all',
    scriptPath: 'tests/data-workflows/workflows/flows/flows-all-workflow.ts',
  },
  {
    command: 'test:lifecyclemodels:all',
    scriptPath: 'tests/data-workflows/workflows/lifecyclemodels/lifecyclemodels-all-workflow.ts',
  },
  {
    command: 'test:processes:all',
    scriptPath: 'tests/data-workflows/workflows/processes/processes-all-workflow.ts',
  },
];

const TEAM_WORKFLOWS = [
  {
    command: 'test:teams:create',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-create-workflow.ts',
  },
  {
    command: 'test:teams:edit',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-edit-workflow.ts',
  },
  {
    command: 'test:teams:member-role',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-member-role-workflow.ts',
  },
  {
    command: 'test:teams:reject-reinvite',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-reject-reinvite-workflow.ts',
  },
  {
    command: 'test:teams:invite-accept',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-invite-accept-workflow.ts',
  },
  {
    command: 'test:teams:homepage-rank',
    scriptPath: 'tests/data-workflows/workflows/teams/teams-homepage-rank-workflow.ts',
  },
];

const API_SMOKE_WORKFLOWS = [
  ...TEAM_WORKFLOWS.map((workflow) => ({
    ...workflow,
    kind: 'team',
  })),
  ...DATA_WORKFLOW_SUITES.map((workflow) => ({
    ...workflow,
    kind: 'data',
  })),
];

const TEAM_OMITTED_FLAGS = new Set(['keep-data', 'no-keep-data', 'no-keep-created']);
const MAX_CAPTURED_FAILURE_OUTPUT_CHARS = 4000;
const FAILURE_TAIL_LINE_COUNT = 5;

const HELP_TEXT = `API smoke workflow suite

Usage:
  pnpm test:api:smoke --frontend-url http://127.0.0.1:8000 --supabase-url https://submidrhbtknjxfympna.supabase.co --supabase-publishable-key <key>
  pnpm test:api:smoke --detail-result --no-keep-data
  pnpm test:api:smoke --list

Behavior:
  - Runs supported live API smoke workflows sequentially, with team workflows first
  - Forwards shared CLI arguments to every workflow
  - Prints the covered API smoke workflows before running
  - Records failures, continues through remaining workflows, and reports CLI failure after the summary
  - Prints per-command results with failure reasons at the end

Workflows:
${API_SMOKE_WORKFLOWS.map((workflow, index) => `  ${index + 1}. ${workflow.command}`).join('\n')}

Notes:
  - Requires SUPABASE_URL / --supabase-url and SUPABASE_PUBLISHABLE_KEY / --supabase-publishable-key.
  - Test users come from .env.users.local, TEST_USERS_JSON, TEST_<ROLE>_* variables, or --users-file.
  - Data cleanup flags such as --no-keep-data are forwarded only to data workflow suites.
  - Workflow-specific flags may not be supported by every command in this suite.
`;

function splitFlag(arg) {
  const withoutPrefix = arg.slice(2);
  const equalsIndex = withoutPrefix.indexOf('=');

  if (equalsIndex === -1) {
    return [withoutPrefix, undefined];
  }

  return [withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1)];
}

function removeFlags(argv, omittedFlags) {
  return argv.filter((arg) => {
    if (!arg.startsWith('--')) {
      return true;
    }

    const [flag] = splitFlag(arg);
    return !omittedFlags.has(flag);
  });
}

function buildWorkflowArgv(workflow, argv) {
  if (workflow.kind === 'team') {
    return removeFlags(argv, TEAM_OMITTED_FLAGS);
  }

  return argv;
}

function formatDuration(durationMs) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  }

  return `${durationMs}ms`;
}

function formatWorkflowResult(result) {
  const summaryParts = [
    `${result.command}: ${result.passed ? 'success' : 'failure'}`,
    `duration ${formatDuration(result.durationMs)}`,
  ];

  if (result.exitCode !== null) {
    summaryParts.push(`exit code ${result.exitCode}`);
  }

  if (result.signal) {
    summaryParts.push(`signal ${result.signal}`);
  }

  if (result.failureReason) {
    summaryParts.push(`reason: ${result.failureReason}`);
  }

  return summaryParts.join(' | ');
}

function captureOutputTail(currentOutput, chunk) {
  const nextOutput = currentOutput + chunk.toString();

  if (nextOutput.length <= MAX_CAPTURED_FAILURE_OUTPUT_CHARS) {
    return nextOutput;
  }

  return nextOutput.slice(nextOutput.length - MAX_CAPTURED_FAILURE_OUTPUT_CHARS);
}

function normalizeOutputTail(output) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-FAILURE_TAIL_LINE_COUNT)
    .join(' / ');
}

function buildFailureReason(result) {
  if (result.errorMessage) {
    return result.errorMessage;
  }

  const reasons = [];

  if (result.exitCode !== null && result.exitCode !== 0) {
    reasons.push(`exit code ${result.exitCode}`);
  }

  if (result.signal) {
    reasons.push(`signal ${result.signal}`);
  }

  const outputTail = normalizeOutputTail(result.output ?? '');
  if (outputTail) {
    reasons.push(outputTail);
  }

  return reasons.length > 0 ? reasons.join('; ') : 'child workflow did not report a reason';
}

function ensureFailureReason(result) {
  if (result.passed || result.failureReason) {
    return result;
  }

  return {
    ...result,
    failureReason: buildFailureReason(result),
  };
}

function runWorkflow(workflow, argv) {
  const startedAt = Date.now();
  const scriptPath = path.resolve(process.cwd(), workflow.scriptPath);
  const childArgs = ['--import', 'tsx', scriptPath, ...argv];

  return new Promise((resolve) => {
    let settled = false;
    let output = '';

    const finalize = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      const passed = result.exitCode === 0 && result.signal === null && !result.errorMessage;
      resolve({
        command: workflow.command,
        durationMs: Date.now() - startedAt,
        passed,
        failureReason: passed ? undefined : buildFailureReason({ ...result, output }),
        ...result,
      });
    };

    const childProcess = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    childProcess.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
      output = captureOutputTail(output, chunk);
    });

    childProcess.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      output = captureOutputTail(output, chunk);
    });

    childProcess.once('error', (error) => {
      finalize({
        errorMessage: error.message,
        exitCode: null,
        signal: null,
      });
    });

    childProcess.once('exit', (code, signal) => {
      finalize({
        exitCode: code,
        signal,
      });
    });
  });
}

function printWorkflowList(log = console.log, heading = 'Covered API smoke workflows:') {
  log(heading);
  API_SMOKE_WORKFLOWS.forEach((workflow) => {
    log(`- ${workflow.command}: ${workflow.scriptPath}`);
  });
}

async function runApiSmokeSuite(argv = process.argv.slice(2), dependencies = {}) {
  const log = dependencies.log ?? console.log;
  const workflowRunner = dependencies.runWorkflow ?? runWorkflow;

  if (argv.includes('--help')) {
    log(HELP_TEXT);
    return {
      helpShown: true,
      passed: true,
      results: [],
    };
  }

  if (argv.includes('--list')) {
    printWorkflowList(log);
    return {
      helpShown: false,
      passed: true,
      results: [],
    };
  }

  const results = [];

  log('API smoke workflow suite');
  printWorkflowList(log);
  log('');
  log('Run results:');

  for (let index = 0; index < API_SMOKE_WORKFLOWS.length; index += 1) {
    const workflow = API_SMOKE_WORKFLOWS[index];

    if (index > 0) {
      log('');
    }

    log(`[${index + 1}/${API_SMOKE_WORKFLOWS.length}] ${workflow.command}`);

    try {
      const result = ensureFailureReason(
        await workflowRunner(workflow, buildWorkflowArgv(workflow, argv)),
      );
      results.push(result);
      log(`Command result: ${formatWorkflowResult(result)}`);
    } catch (error) {
      const failureResult = {
        command: workflow.command,
        durationMs: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
        failureReason: error instanceof Error ? error.message : String(error),
        exitCode: null,
        passed: false,
        signal: null,
      };

      results.push(failureResult);
      log(`Command result: ${formatWorkflowResult(failureResult)}`);
    }
  }

  const passed = results.every((result) => result.passed);

  log('');
  log('Summary:');
  results.forEach((result) => {
    log(`- ${formatWorkflowResult(result)}`);
  });
  log(`Overall success: ${passed ? 'yes' : 'no'}`);
  log(
    'Exit behavior: child workflow failures are reported after all workflows run, then this command exits non-zero.',
  );

  return {
    helpShown: false,
    passed,
    results,
  };
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const result = await runApiSmokeSuite(argv, dependencies);

  if (!result.helpShown && !result.passed) {
    throw new Error('API smoke workflow suite failed.');
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  API_SMOKE_WORKFLOWS,
  HELP_TEXT,
  buildWorkflowArgv,
  formatWorkflowResult,
  main,
  runApiSmokeSuite,
};
