import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');

describe('installed glob/minimatch maintained backports', () => {
  it('preserves real matcher, walker and native consumer contracts with owned fixtures', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        path.join(repositoryRoot, 'tests/package-contracts/installedGlobMinimatch.contract.cjs'),
      ],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 20_000 },
    );
    expect({
      error: result.error?.message,
      signal: result.signal,
      status: result.status,
      diagnostic: result.status === 0 ? '' : result.stderr + result.stdout,
    }).toEqual({ error: undefined, signal: null, status: 0, diagnostic: '' });
    expect(result.stdout).toMatch(/(?:#|ℹ) pass 27(?:\s|$)/u);
  });
});
