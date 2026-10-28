import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('qualifies Process capture production-build receipts in isolated Git fixtures', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-reporter=tap',
      'scripts/qualification/process-capture-build-contract.test.mjs',
      'scripts/qualification/process-capture-start-contract.test.mjs',
    ],
    {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      timeout: 40_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(`${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  expect(result.stdout).toContain('# fail 0');
}, 45_000);
