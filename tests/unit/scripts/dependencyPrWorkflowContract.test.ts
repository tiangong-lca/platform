import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/dependency-pr.yml'),
  'utf8',
);

const FORBIDDEN_COMPATIBILITY_OPERATIONS =
  /permissions:|secrets\.|GITHUB_TOKEN|GH_TOKEN|pnpm install|pnpm prepush:gate|deploy|release:to-dev|release:promote/u;

function workflowJob(source: string, name: string): string {
  const header = `\n  ${name}:\n`;
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`Workflow job is missing: ${name}`);
  const bodyStart = start + header.length;
  const next = source.slice(bodyStart).search(/^  [A-Za-z0-9_-]+:[ \t]*$/mu);
  return source.slice(start + 1, next < 0 ? undefined : bodyStart + next).trimEnd();
}

describe('ordinary dependency workflow validation ownership', () => {
  const cases = [
    ['Dev bot dependency', 'dev', 'dependabot/npm_and_yarn/ui', '', true, 'pull_request'],
    [
      'Main security proposal',
      'main',
      'dependabot/npm_and_yarn/security',
      '',
      true,
      'pull_request',
    ],
    ['human Dev maintenance', 'dev', 'codex/dependency-fix', '', true, 'pull_request'],
    [
      'marked Dev Release owner',
      'dev',
      'codex/release-v0.0.137',
      'tiangong-next-release-automation:v2',
      false,
      'pull_request',
    ],
    ['direct Dev promotion owner', 'main', 'dev', '', false, 'pull_request'],
    ['immutable promotion owner', 'main', 'codex/promote-v0.0.137', '', false, 'pull_request'],
    ['Main hotfix owner', 'main', 'codex/hotfix-dependabot-1264', '', false, 'pull_request'],
    [
      'unmarked Dev release-like branch',
      'dev',
      'codex/release-maintenance',
      '',
      true,
      'pull_request',
    ],
    ['manual exact ref', 'main', 'codex/hotfix-dependabot-1264', '', true, 'workflow_dispatch'],
  ] as const;

  it.each(cases)(
    '%s selects the existing validation owner',
    (_name, base, head, body, expected, event) => {
      const expression = workflow.match(/\n    if: >-\n([\s\S]*?)\n    runs-on:/u)?.[1];
      if (!expression) throw new Error('Dependency job selection expression is missing.');
      const actual = vm.runInNewContext(
        expression,
        {
          github: {
            event_name: event ?? 'pull_request',
            event: { pull_request: { base: { ref: base }, head: { ref: head }, body } },
          },
          contains: (value: string, part: string) =>
            value.toLowerCase().includes(part.toLowerCase()),
          startsWith: (value: string, part: string) =>
            value.toLowerCase().startsWith(part.toLowerCase()),
        },
        { timeout: 100 },
      );
      expect(actual).toBe(expected);
    },
  );

  it.each(cases)(
    '%s selects the same owner for the compatibility probe',
    (_name, base, head, body, expected, event) => {
      const probe = workflowJob(workflow, 'action-compatibility');
      const expression = probe.match(/\n    if: >-\n([\s\S]*?)\n    runs-on:/u)?.[1];
      if (!expression) throw new Error('Compatibility job selection expression is missing.');
      expect(
        vm.runInNewContext(
          expression,
          {
            github: {
              event_name: event,
              event: { pull_request: { base: { ref: base }, head: { ref: head }, body } },
            },
            contains: (value: string, part: string) =>
              value.toLowerCase().includes(part.toLowerCase()),
            startsWith: (value: string, part: string) =>
              value.toLowerCase().startsWith(part.toLowerCase()),
          },
          { timeout: 100 },
        ),
      ).toBe(expected);
    },
  );

  it('exercises the selected tools and archive upload without adding release authority', () => {
    const probe = workflowJob(workflow, 'action-compatibility');
    expect(probe).toContain(
      'uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
    );
    expect(probe).toContain('uses: pnpm/setup@731dfb6463bbd11c11fd0ee11fe00ed0e36d48a1 # v3.2.0');
    expect(probe).toContain(
      'uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
    );
    expect(probe.indexOf('--stage setup-node')).toBeLessThan(probe.indexOf('uses: pnpm/setup@'));
    expect(probe).toContain('install: false');
    expect(probe).toContain('cache: false');
    expect(probe).toContain('archive: true');
    expect(probe).toContain('if-no-files-found: error');
    expect(probe).toContain('--stage artifact-upload');
    expect(probe).not.toMatch(FORBIDDEN_COMPATIBILITY_OPERATIONS);
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('does not attribute a separate browser install to the compatibility probe', () => {
    const probe = workflowJob(workflow, 'action-compatibility');
    const browser = workflowJob(workflow, 'semantic-qualification');
    expect(browser).toContain('pnpm install --frozen-lockfile');
    expect(probe).not.toContain('pnpm install');
    expect(probe).not.toContain('semantic-qualification:');
    expect(probe).toContain('--stage artifact-upload');
    expect(() => workflowJob(workflow, 'missing-job')).toThrow('Workflow job is missing');
  });

  it.each(['pnpm install', 'pnpm prepush:gate', 'GH_TOKEN=synthetic', 'release:to-dev'])(
    'still rejects %s when it is actually inside the compatibility job',
    (forbidden) => {
      const controlled = workflow.replace(
        '      - name: Check out exact compatibility candidate\n',
        `      - name: Forbidden compatibility control\n        run: ${forbidden}\n      - name: Check out exact compatibility candidate\n`,
      );
      const probe = workflowJob(controlled, 'action-compatibility');
      expect(probe).toContain(`run: ${forbidden}`);
      expect(() => expect(probe).not.toMatch(FORBIDDEN_COMPATIBILITY_OPERATIONS)).toThrow();
    },
  );

  it('retains a read-only canonical source gate without release or deployment authority', () => {
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('run: pnpm install --frozen-lockfile');
    expect(workflow).toContain('run: pnpm prepush:gate');
    expect(workflow).not.toMatch(
      /pull_request_target|secrets\.|release:static-preflight|pnpm deploy|pages deploy|gh release/u,
    );
    expect(workflow).not.toMatch(/contents:\s*write|id-token:\s*write|pull-requests:\s*write/u);
  });

  it('checks out the exact candidate with the remote refs and frozen history required by locale contracts', () => {
    const checkout = workflow.match(
      /- name: Check out exact candidate\n([\s\S]*?)(?=\n      - name:)/u,
    )?.[1];
    expect(checkout).toBeDefined();
    expect(checkout).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(checkout).toContain('persist-credentials: false');
    const configuredDepth = Number(checkout?.match(/fetch-depth:\s*(\d+)/u)?.[1] ?? 1);
    const container = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-checkout-history-'));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    const emptyConfig = path.join(container, 'empty.gitconfig');
    const hooks = path.join(container, 'hooks');
    fs.writeFileSync(emptyConfig, '');
    fs.mkdirSync(hooks);
    Object.assign(env, {
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_SYSTEM: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ALLOW_PROTOCOL: 'file',
    });
    const git = (root: string, args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          `core.hooksPath=${hooks}`,
          '-c',
          'user.name=Checkout fixture',
          '-c',
          'user.email=checkout-fixture@example.invalid',
          '-c',
          'commit.gpgSign=false',
          ...args,
        ],
        { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim();
    try {
      const source = path.join(container, 'source');
      const remote = path.join(container, 'remote.git');
      fs.mkdirSync(source);
      git(source, ['init', '--initial-branch=main']);
      fs.writeFileSync(path.join(source, 'frozen.json'), '{"approved":true}\n');
      git(source, ['add', '.']);
      git(source, ['commit', '-m', 'Frozen approval']);
      const frozen = git(source, ['rev-parse', 'HEAD']);
      git(source, ['commit', '--allow-empty', '-m', 'Main advances']);
      const main = git(source, ['rev-parse', 'HEAD']);
      git(source, ['checkout', '-b', 'dev']);
      git(source, ['commit', '--allow-empty', '-m', 'Exact dependency candidate']);
      const candidate = git(source, ['rev-parse', 'HEAD']);
      git(source, ['branch', 'candidate']);
      git(source, ['commit', '--allow-empty', '-m', 'Dev advances past candidate']);
      const dev = git(source, ['rev-parse', 'HEAD']);
      git(container, ['init', '--bare', remote]);
      const remoteUrl = pathToFileURL(remote).href;
      git(source, ['push', remoteUrl, 'main', 'dev', 'candidate']);
      const checkoutCandidate = (name: string, depth: number) => {
        const root = path.join(container, name);
        fs.mkdirSync(root);
        git(root, ['init']);
        git(root, ['remote', 'add', 'origin', remoteUrl]);
        // These are checkout v7's SHA-only and all-history refspecs. Use file
        // transport so Git cannot reuse local objects or silently ignore depth.
        git(root, [
          'fetch',
          '--no-tags',
          ...(depth === 0 ? [] : [`--depth=${depth}`]),
          'origin',
          ...(depth === 0 ? ['+refs/heads/*:refs/remotes/origin/*'] : [candidate]),
        ]);
        git(root, ['checkout', '--detach', candidate]);
        expect(fs.existsSync(path.join(root, '.git/objects/info/alternates'))).toBe(false);
        return root;
      };
      const shallow = checkoutCandidate('shallow-control', 1);
      expect(git(shallow, ['rev-parse', '--is-shallow-repository'])).toBe('true');
      for (const ref of ['origin/main', 'origin/dev', frozen]) {
        expect(() => git(shallow, ['rev-parse', '--verify', `${ref}^{commit}`])).toThrow();
      }
      expect(() => git(shallow, ['show', `${frozen}:frozen.json`])).toThrow();

      const configured = checkoutCandidate('configured-workflow', configuredDepth);
      expect(git(configured, ['rev-parse', 'HEAD'])).toBe(candidate);
      expect(git(configured, ['rev-parse', '--is-shallow-repository'])).toBe('false');
      expect(git(configured, ['rev-parse', 'origin/main'])).toBe(main);
      expect(git(configured, ['rev-parse', 'origin/dev'])).toBe(dev);
      expect(git(configured, ['show', `${frozen}:frozen.json`])).toBe('{"approved":true}');
      expect(git(configured, ['merge-base', '--is-ancestor', frozen, 'HEAD'])).toBe('');
    } finally {
      fs.rmSync(container, { recursive: true, force: true });
    }
  });
});
