import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');

// Real installed transports/compiler run outside Jest's dependency mappers.
describe('maintained Hono static middleware and actual Utoo consumers', () => {
  it.each([
    ['installedHonoStatic.contract.cjs', 13],
    ['installedHonoConsumers.contract.cjs', 10],
  ])('%s verifies its native callers and owned resource closure', (file, count) => {
    const result = spawnSync(
      process.execPath,
      ['--test', path.join(repositoryRoot, 'tests/package-contracts', file)],
      { cwd: repositoryRoot, encoding: 'utf8', timeout: 240_000 },
    );
    expect({
      error: result.error?.message,
      signal: result.signal,
      status: result.status,
      diagnostic: result.status === 0 ? '' : result.stderr + result.stdout,
    }).toEqual({ error: undefined, signal: null, status: 0, diagnostic: '' });
    expect(result.stdout).toMatch(new RegExp('(?:#|ℹ) pass ' + count + '(?:\\s|$)', 'u'));
  });
});
