import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('installed MockJS preserves actual exports, owned merge data and OpenAPI callers', () => {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const result = spawnSync(
    process.execPath,
    ['--test', path.join(repositoryRoot, 'tests/package-contracts/installedMockjs.contract.cjs')],
    { cwd: repositoryRoot, encoding: 'utf8', timeout: 20_000 },
  );
  expect({
    error: result.error?.message,
    signal: result.signal,
    status: result.status,
    diagnostic: result.status === 0 ? '' : result.stderr + result.stdout,
  }).toEqual({ error: undefined, signal: null, status: 0, diagnostic: '' });
  expect(result.stdout).toMatch(/(?:#|ℹ) pass 3(?:\s|$)/u);
});
