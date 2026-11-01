import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const runner = fs.readFileSync(path.join(root, 'scripts/e2e/container-runner.ts'), 'utf8');
const start = runner.indexOf(
  "    if (process.env.E2E_QUALIFICATION === 'true')",
  runner.indexOf("await check('candidate.identity'"),
);
const endMarker = "await check('environment.browser-launch', launchEveryBrowser);";
const end = runner.indexOf(endMarker, start);

it.each(['true', 'false'])(
  'admits each diagnostic source before any browser only in qualification mode %s',
  async (qualification) => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const events: unknown[] = [];
    const env = { E2E_QUALIFICATION: qualification };
    await vm.runInNewContext(
      `(async () => { ${runner.slice(start, end + endMarker.length)} })()`,
      {
        process: { env, cwd: () => root },
        PLAYWRIGHT_BROWSER_PROJECTS: ['chromium', 'firefox', 'webkit'],
        validateRuntimeAdmission: (actualEnv: unknown, actualRoot: string, identity: unknown) => {
          expect(actualEnv).toBe(env);
          expect(actualRoot).toBe(root);
          events.push(identity);
        },
        check: async (_id: string, operation: () => Promise<unknown>) => operation(),
        launchEveryBrowser: () => events.push('first-browser-launch'),
      },
      { timeout: 1000 },
    );
    expect(events).toEqual([
      ...(qualification === 'true'
        ? ['chromium', 'firefox', 'webkit'].map((browser) => ({
            browser,
            project: browser,
            scope: 'qualification-diagnostic-only',
            control: null,
          }))
        : []),
      'first-browser-launch',
    ]);
  },
);

it('fails before the first browser when diagnostic source admission rejects', async () => {
  const failure = new Error('invalid source binding');
  const launch = jest.fn();
  const visited: string[] = [];
  await expect(
    vm.runInNewContext(
      `(async () => { ${runner.slice(start, end + endMarker.length)} })()`,
      {
        process: { env: { E2E_QUALIFICATION: 'true' }, cwd: () => root },
        PLAYWRIGHT_BROWSER_PROJECTS: ['chromium', 'firefox', 'webkit'],
        validateRuntimeAdmission: (_env: unknown, _root: string, identity: { browser: string }) => {
          visited.push(identity.browser);
          if (identity.browser === 'firefox') throw failure;
        },
        check: async (_id: string, operation: () => Promise<unknown>) => operation(),
        launchEveryBrowser: launch,
      },
      { timeout: 1000 },
    ),
  ).rejects.toBe(failure);
  expect(visited).toEqual(['chromium', 'firefox']);
  expect(launch).not.toHaveBeenCalled();
});

it.each(['dependency-pr.yml', 'i18n-semantic-e2e.yml'])(
  'uploads exactly the three private browser JSON names in %s',
  (workflow) => {
    const text = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    expect(text.match(/\.local\/e2e-release\/runs\/\*\*\/batch-allocation[^\s]*/gu)).toEqual([
      '.local/e2e-release/runs/**/batch-allocation-diagnostic-chromium.json',
      '.local/e2e-release/runs/**/batch-allocation-diagnostic-firefox.json',
      '.local/e2e-release/runs/**/batch-allocation-diagnostic-webkit.json',
    ]);
    expect(text).not.toMatch(
      /runs\/\*\*\/\*\.json|test-results|error-context|\.png|\.webm|trace\.zip/u,
    );
  },
);
