import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(__dirname, '../../..');

// The release admission guard lives inline in the actual build.yml "Resolve release
// target" step. These tests extract that exact `run:` block from the workflow file and
// execute it with fixture git remotes, so the real workflow bytes are proven — not a
// mirrored reimplementation. GitHub's canonical repository is rewritten to a local
// bare remote through git's insteadOf mapping, exactly like a single-origin clone
// pointing at the verified canonical remote.
const CANONICAL_URL = 'https://github.com/tiangong-lca/platform.git';
const CANONICAL_REPOSITORY = 'tiangong-lca/platform';
const CANONICAL_REPOSITORY_ID = '805297890';
const CANONICAL_REPOSITORY_OWNER_ID = '327771381';
const LEGACY_REPOSITORY = 'linancn/tiangong-lca-next';

function extractReleaseTargetBlock(): string {
  const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/build.yml'), 'utf8');
  const stepMarker = '      - name: Resolve release target\n';
  const stepStart = workflow.indexOf(stepMarker);
  expect(stepStart).toBeGreaterThanOrEqual(0);
  const runMarker = '        run: |\n';
  const runStart = workflow.indexOf(runMarker, stepStart);
  expect(runStart).toBeGreaterThan(stepStart);
  const blockStart = runStart + runMarker.length;
  const nextStep = workflow.indexOf('\n      - name: ', blockStart);
  expect(nextStep).toBeGreaterThan(blockStart);
  return workflow.slice(blockStart, nextStep);
}

describe('build.yml release-context canonical admission (executed workflow guard)', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'next-release-guard-'));
  const bareRemote = path.join(folder, 'origin.git');
  const work = path.join(folder, 'work');
  let baseSha = '';
  let headSha = '';
  let workflowHotfixSha = '';
  let nextVersionSha = '';
  let branchOnlySha = '';
  let nonancestorSha = '';
  let blockFile: string;
  let outputFile: string;
  let summaryFile: string;

  function gitEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('GIT_')) env[key] = value as string;
    }
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_CONFIG_GLOBAL = path.join(folder, 'empty.gitconfig');
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = `url.${pathToFileURL(bareRemote).href}.insteadOf`;
    env.GIT_CONFIG_VALUE_0 = CANONICAL_URL;
    return env;
  }

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: work, env: gitEnv(), encoding: 'utf8' }).trim();

  function writeCommit(version: string, message: string): string {
    writeFileSync(
      path.join(work, 'package.json'),
      `${JSON.stringify({ name: 'tiangong-lca-next', version }, null, 2)}\n`,
    );
    git('add', 'package.json');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  }

  function readIfExists(target: string): string {
    try {
      return readFileSync(target, 'utf8');
    } catch {
      return '';
    }
  }

  function runGuard(overrides: Record<string, string>): {
    status: number | null;
    stdout: string;
    stderr: string;
    outputs: Record<string, string>;
  } {
    rmSync(outputFile, { force: true });
    rmSync(summaryFile, { force: true });
    const result = spawnSync('bash', [blockFile], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...gitEnv(),
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REF_NAME: 'main',
        GITHUB_SHA: headSha,
        PUSH_BEFORE_SHA: baseSha,
        REQUESTED_TAG_NAME: '',
        REQUESTED_PUBLICATION_SCOPE: '',
        EXPECTED_RELEASE_SHA: '',
        GITHUB_REPOSITORY: CANONICAL_REPOSITORY,
        GITHUB_REPOSITORY_ID: CANONICAL_REPOSITORY_ID,
        GITHUB_REPOSITORY_OWNER_ID: CANONICAL_REPOSITORY_OWNER_ID,
        GITHUB_OUTPUT: outputFile,
        GITHUB_STEP_SUMMARY: summaryFile,
        ...overrides,
      },
    });
    const outputs: Record<string, string> = {};
    for (const line of readIfExists(outputFile).split('\n')) {
      const match = /^([^=]+)=(.*)$/u.exec(line);
      if (match) outputs[match[1]] = match[2];
    }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, outputs };
  }

  beforeAll(() => {
    const gitconfig = path.join(folder, 'empty.gitconfig');
    writeFileSync(gitconfig, '');
    execFileSync('git', ['init', '--bare', '-q', '--initial-branch=main', bareRemote], {
      env: gitEnv(),
    });
    execFileSync('git', ['init', '-q', '-b', 'main', work], { env: gitEnv() });
    git('config', 'user.name', 'Release guard fixture');
    git('config', 'user.email', 'release-guard@example.invalid');
    git('remote', 'add', 'origin', CANONICAL_URL);
    writeCommit('0.0.101', 'initial release history');
    baseSha = writeCommit('0.0.102', 'base 0.0.102');
    git('push', '-q', 'origin', 'main');
    headSha = writeCommit('0.0.103', 'release 0.0.103');
    // The workflow runs after GitHub accepted this main push, so origin/main already
    // contains the release head; the guard's ancestry check depends on it.
    git('push', '-q', 'origin', 'main');
    git('tag', 'v0.0.102', baseSha);
    git('tag', 'v0.0.103', headSha);
    git('tag', 'v9.9.999', headSha);
    writeFileSync(path.join(work, 'workflow.txt'), 'Atlas deployment wiring\n');
    git('add', 'workflow.txt');
    git('commit', '-qm', 'unchanged-version workflow hotfix');
    workflowHotfixSha = git('rev-parse', 'HEAD');
    nextVersionSha = writeCommit('0.0.104', 'next release candidate');
    branchOnlySha = writeCommit('0.0.105', 'branch-only release candidate');
    git('branch', 'v0.0.105', branchOnlySha);
    git('checkout', '-q', '--orphan', 'unmerged-release');
    nonancestorSha = writeCommit('0.0.104', 'unmerged same-version release');
    git('tag', 'v0.0.104', nonancestorSha);
    git('checkout', '-q', 'main');
    git('push', '-q', 'origin', '--tags');
    blockFile = path.join(folder, 'release-target.sh');
    writeFileSync(blockFile, extractReleaseTargetBlock());
    outputFile = path.join(folder, 'github-output.txt');
    summaryFile = path.join(folder, 'github-step-summary.txt');
  });

  beforeEach(() => {
    // A previous case may advance main to the workflow hotfix or next product
    // version. Restore the authoritative fixture ref without changing its tags.
    git('push', '-q', '--force', 'origin', `${headSha}:refs/heads/main`);
  });

  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('admits the canonical repository with matching numeric ids and a changed version', () => {
    const { status, outputs } = runGuard({});
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('true');
    expect(outputs.tag_name).toBe('v0.0.103');
    expect(outputs.release_head).toBe(headSha);
    expect(outputs.release_base).toBe(baseSha);
    expect(outputs.publication_scope).toBe('full');
  });

  function dispatch(overrides: Record<string, string> = {}) {
    return runGuard({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_SHA: workflowHotfixSha,
      REQUESTED_TAG_NAME: 'v0.0.103',
      REQUESTED_PUBLICATION_SCOPE: 'atlas-web',
      EXPECTED_RELEASE_SHA: headSha,
      ...overrides,
    });
  }

  it('backfills Atlas from the exact existing tag using a newer unchanged-version main workflow', () => {
    git('push', '-q', '--force', 'origin', `${workflowHotfixSha}:refs/heads/main`);
    const { status, outputs } = dispatch();
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('true');
    expect(outputs.publication_scope).toBe('atlas-web');
    expect(outputs.tag_name).toBe('v0.0.103');
    expect(outputs.release_head).toBe(headSha);
    expect(outputs.release_head).not.toBe(workflowHotfixSha);
    expect(outputs.release_base).toBe(baseSha);
    expect(git('rev-parse', 'v0.0.103')).toBe(headSha);
  });

  it.each(['', 'full'])('retains full existing-tag recovery for scope %j', (scope) => {
    const { status, outputs } = dispatch({
      REQUESTED_TAG_NAME: 'v0.0.102',
      REQUESTED_PUBLICATION_SCOPE: scope,
      EXPECTED_RELEASE_SHA: '',
    });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('true');
    expect(outputs.publication_scope).toBe('full');
    expect(outputs.release_head).toBe(baseSha);
    expect(outputs.tag_name).toBe('v0.0.102');
  });

  it('skips a main workflow hotfix whose unchanged version is already tagged at the older commit', () => {
    git('push', '-q', '--force', 'origin', `${workflowHotfixSha}:refs/heads/main`);
    const { status, outputs } = runGuard({
      GITHUB_SHA: workflowHotfixSha,
      PUSH_BEFORE_SHA: headSha,
    });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.tag_name).toBe('v0.0.103');
    expect(outputs.publication_scope).toBe('full');
    expect(git('rev-parse', 'v0.0.103')).toBe(headSha);
  });

  it.each(['unknown', 'Atlas-web', 'atlas-web full'])('rejects invalid scope %j', (scope) => {
    const { status, outputs } = dispatch({ REQUESTED_PUBLICATION_SCOPE: scope });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it.each(['', '1234', 'A'.repeat(40), 'g'.repeat(40), 'a'.repeat(39), 'a'.repeat(41)])(
    'rejects Atlas recovery without an exact lowercase commit identity: %j',
    (sha) => {
      const { status, outputs } = dispatch({ EXPECTED_RELEASE_SHA: sha });
      expect(status).not.toBe(0);
      expect(outputs.should_release).not.toBe('true');
    },
  );

  it('rejects Atlas recovery when the expected commit differs from the tag', () => {
    const { status, outputs } = dispatch({ EXPECTED_RELEASE_SHA: workflowHotfixSha });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it('rejects a stale Atlas version after main advances to a new product version', () => {
    git('push', '-q', '--force', 'origin', `${nextVersionSha}:refs/heads/main`);
    const { status, outputs } = dispatch();
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it.each(['', 'v8.8.888', 'main'])('rejects missing or non-tag recovery target %j', (tag) => {
    const { status, outputs } = dispatch({ REQUESTED_TAG_NAME: tag });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it('rejects an existing tag whose spelling does not match its package version', () => {
    const { status, outputs } = dispatch({ REQUESTED_TAG_NAME: 'v9.9.999' });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it('rejects a version-shaped branch when no corresponding tag exists', () => {
    git('push', '-q', '--force', 'origin', `${branchOnlySha}:refs/heads/main`);
    const { status, outputs } = dispatch({
      REQUESTED_TAG_NAME: 'v0.0.105',
      EXPECTED_RELEASE_SHA: branchOnlySha,
    });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
    expect(git('rev-parse', 'refs/heads/v0.0.105')).toBe(branchOnlySha);
  });

  it.each([
    ['atlas-web', 'refs/heads/dev', 'dev'],
    ['full', 'refs/heads/dev', 'dev'],
    ['atlas-web', 'refs/tags/v0.0.103', 'v0.0.103'],
    ['full', 'refs/tags/v0.0.103', 'v0.0.103'],
  ])('rejects %s dispatch from %s', (scope, ref, refName) => {
    const { status, outputs } = dispatch({
      GITHUB_REF: ref,
      GITHUB_REF_NAME: refName,
      REQUESTED_PUBLICATION_SCOPE: scope,
    });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it('rejects Atlas-only scope on a push event', () => {
    const { status, outputs } = runGuard({ REQUESTED_PUBLICATION_SCOPE: 'atlas-web' });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
  });

  it('does not admit a same-version exact tag that is outside main history', () => {
    git('push', '-q', '--force', 'origin', `${nextVersionSha}:refs/heads/main`);
    const { status, outputs } = dispatch({
      REQUESTED_TAG_NAME: 'v0.0.104',
      EXPECTED_RELEASE_SHA: nonancestorSha,
    });
    expect(status).not.toBe(0);
    expect(outputs.should_release).not.toBe('true');
    expect(git('rev-parse', 'v0.0.104')).toBe(nonancestorSha);
  });

  it('retains a nonancestor skip for full existing-tag recovery', () => {
    const { status, outputs } = dispatch({
      REQUESTED_TAG_NAME: 'v0.0.104',
      REQUESTED_PUBLICATION_SCOPE: 'full',
      EXPECTED_RELEASE_SHA: '',
    });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.publication_scope).toBe('full');
  });

  it('denies the legacy repository name', () => {
    const { status, outputs } = runGuard({ GITHUB_REPOSITORY: LEGACY_REPOSITORY });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.release_head).toBeUndefined();
  });

  it('denies an unrelated fork repository name', () => {
    const { status, outputs } = runGuard({ GITHUB_REPOSITORY: 'some-fork/tiangong-lca-next' });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.release_head).toBeUndefined();
  });

  it('denies a name-matching repository with a wrong repository id', () => {
    const { status, outputs } = runGuard({ GITHUB_REPOSITORY_ID: '8052978900' });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.release_head).toBeUndefined();
  });

  it('denies a name-matching repository with a wrong owner id', () => {
    const { status, outputs } = runGuard({ GITHUB_REPOSITORY_OWNER_ID: '199785309' });
    expect(status).toBe(0);
    expect(outputs.should_release).toBe('false');
    expect(outputs.release_head).toBeUndefined();
  });
});

describe('official backend selection in actual release jobs', () => {
  it.each(['web-deploy', 'atlas-web-deploy', 'release'])(
    'requires canonical repository identity before %s selects Main',
    (jobName) => {
      const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/build.yml'), 'utf8');
      const start = workflow.indexOf(`\n  ${jobName}:\n`);
      expect(start).toBeGreaterThan(0);
      const tail = workflow.slice(start + 1);
      const next = tail.slice(1).search(/\n  [a-z][a-z-]*:\n/u);
      const job = next < 0 ? tail : tail.slice(0, next + 1);
      expect(job).toContain(
        "REACT_APP_ENV: ${{ github.repository == 'tiangong-lca/platform' && 'main' || 'local' }}",
      );
      expect(job.match(/REACT_APP_ENV:/gu)).toHaveLength(1);
    },
  );
});
