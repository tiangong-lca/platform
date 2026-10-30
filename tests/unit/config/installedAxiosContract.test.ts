import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../..');

describe('installed Umi Axios consumer contract', () => {
  it('runs the real generated facade and parent-bound Axios outside Jest mappers', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        path.join(repositoryRoot, 'tests/package-contracts/installedAxios.contract.cjs'),
        path.join(repositoryRoot, 'tests/package-contracts/installedAxiosFollowup.contract.cjs'),
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 60000,
        env: {
          ...process.env,
          AXIOS_GENERATED_MODE: '.umi-test',
          AXIOS_CONTRACT_BASELINE: '0',
          AXIOS_BASELINE_PACKAGE: '',
        },
      },
    );
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
      stdout: expect.stringMatching(/(?:#|ℹ) pass 17/u),
    });
  });
});
