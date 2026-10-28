import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('qualifies Process capture against isolated real Node HTTP servers', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-reporter=tap',
      'scripts/qualification/process-capture-contract.test.mjs',
    ],
    {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(`${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  expect(result.stdout).toContain('# fail 0');
}, 35_000);
