import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');

// Native resolution exercises the installed router/decoder outside Jest's module mappers.
it('installed URI decoder preserves its actual callers and disposes synthetic DOM/build resources', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      path.join(repositoryRoot, 'tests/package-contracts/installedUriDecode.contract.cjs'),
    ],
    { cwd: repositoryRoot, encoding: 'utf8', timeout: 20_000 },
  );
  expect({
    error: result.error?.message,
    signal: result.signal,
    status: result.status,
    diagnostic: result.status === 0 ? '' : result.stderr + result.stdout,
  }).toEqual({ error: undefined, signal: null, status: 0, diagnostic: '' });
  expect(result.stdout).toMatch(/(?:#|ℹ) pass 12(?:\s|$)/u);
});
