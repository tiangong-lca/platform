import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');
const contractPath = path.join(
  repositoryRoot,
  'tests/package-contracts/installedTidasSdk.contract.test.mjs',
);

describe('installed TIDAS SDK package contract', () => {
  it('runs against Node package resolution outside the Jest module mapper', () => {
    const defaultRuntimeEnvironment = { ...process.env };
    for (const name of [
      'TIDAS_DEEP_VALIDATION',
      'TIDAS_INCLUDE_WARNINGS',
      'TIDAS_THROW_ON_ERROR',
      'TIDAS_VALIDATION_MODE',
    ]) {
      delete defaultRuntimeEnvironment[name];
    }
    const result = spawnSync(process.execPath, ['--test', contractPath], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: defaultRuntimeEnvironment,
    });

    expect({
      error: result.error?.message,
      signal: result.signal,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual({
      error: undefined,
      signal: null,
      status: 0,
      stderr: '',
      stdout: expect.stringMatching(/(?:#|ℹ) pass 5/u),
    });
  });
});
