import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/study-report.yml'),
  'utf8',
);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('standalone report PR qualification', () => {
  it('selects only relevant Dev/Main PRs without release authority or another full gate', () => {
    expect(workflow).toContain('branches: [dev, main]');
    for (const selected of [
      'src/standalone/studyReport/**',
      'src/services/general/localeRegistry.ts',
      'scripts/study-report/**',
      'tests/unit/standalone/**',
      'tests/unit/config/studyReportWorkflow.test.ts',
      'tests/fixtures/study-report/**',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.github/workflows/study-report.yml',
    ]) {
      expect(workflow).toContain(`      - ${selected}\n`);
    }
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('timeout-minutes: 15');
    expect(workflow).not.toMatch(
      /pull_request_target|workflow_dispatch|push:|secrets\.|write|deploy|release:|prepush:gate|continue-on-error/u,
    );
  });

  it('runs the pinned frozen portable package and actual Chromium proof in order', () => {
    expect(workflow).toContain(
      'uses: pnpm/setup@a0881977cd8ea73b1ed212236c99ca10dcc80cf4 # v3.1.1',
    );
    expect(workflow).toContain('version: 11.24.0');
    expect(workflow).toContain('runtime: node@24.19.0');
    const commands = [
      'run: pnpm install --frozen-lockfile',
      'run: pnpm study-report:build --release',
      'run: pnpm test:ci --runInBand --runTestsByPath',
      'run: pnpm study-report:test:package',
      'run: pnpm exec playwright install --with-deps chromium',
      'run: pnpm study-report:test:browser',
      'EXPECTED_HEAD: ${{ github.event.pull_request.head.sha }}',
      'uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',
    ].map((command) => workflow.indexOf(command));
    expect(commands.every((index) => index > 0)).toBe(true);
    expect(commands).toEqual([...commands].sort((left, right) => left - right));
    expect(workflow).toContain('.local/study-report/browser-proof.json');
    expect(workflow).toContain('include-hidden-files: true');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).not.toMatch(/^\s+if:|\.png|^\s+\.env|auth-state|trace\.zip/mu);
  });

  it('executes candidate binding and rejects stale, dirty or substituted evidence', () => {
    const script = workflow
      .split("node --input-type=module <<'JS'\n")[1]
      .split('\n          JS')[0]
      .replace(/^          /gmu, '');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'study-report-ci-proof-'));
    try {
      fs.mkdirSync(path.join(temporary, 'dist-study-report/package'), { recursive: true });
      fs.mkdirSync(path.join(temporary, '.local/study-report'), { recursive: true });
      const head = 'a'.repeat(40);
      const manifest = { sourceCommit: head, sourceDirty: false, sourceDigest: 'b'.repeat(64) };
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      const archiveBytes = Buffer.from('synthetic independently verified package bytes');
      const archive = {
        sourceCommit: head,
        sourceDirty: false,
        archiveName: 'study-report-renderer-3.0.0.tgz',
        sha256: sha(archiveBytes),
        manifestSha256: sha(manifestBytes),
      };
      const browser = {
        schemaVersion: 'lca.study-renderer-browser-proof.v1',
        sourceCommit: head,
        sourceDirty: false,
        sourceDigest: manifest.sourceDigest,
        archiveSha256: archive.sha256,
        manifestSha256: archive.manifestSha256,
        records: [{ syntheticControl: true }],
      };
      fs.writeFileSync(
        path.join(temporary, 'dist-study-report/package/manifest.json'),
        manifestBytes,
      );
      fs.writeFileSync(
        path.join(temporary, 'dist-study-report/' + archive.archiveName),
        archiveBytes,
      );
      fs.writeFileSync(
        path.join(temporary, 'dist-study-report/archive.json'),
        JSON.stringify(archive),
      );
      const proof = path.join(temporary, '.local/study-report/browser-proof.json');
      const invoke = (overrides = {}, expectedHead = head) => {
        fs.writeFileSync(proof, JSON.stringify({ ...browser, ...overrides }));
        return spawnSync(process.execPath, ['--input-type=module'], {
          cwd: temporary,
          input: script,
          encoding: 'utf8',
          env: { ...process.env, EXPECTED_HEAD: expectedHead },
        }).status;
      };
      expect(invoke()).toBe(0);
      expect(invoke({}, 'c'.repeat(40))).not.toBe(0);
      expect(invoke({ sourceDirty: true })).not.toBe(0);
      expect(invoke({ archiveSha256: 'd'.repeat(64) })).not.toBe(0);
      expect(invoke({ manifestSha256: 'd'.repeat(64) })).not.toBe(0);
      expect(invoke({ sourceDigest: 'd'.repeat(64) })).not.toBe(0);
      expect(invoke({ records: [] })).not.toBe(0);
      fs.writeFileSync(path.join(temporary, 'dist-study-report/' + archive.archiveName), 'changed');
      expect(invoke()).not.toBe(0);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});
