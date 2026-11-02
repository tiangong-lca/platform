import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../..');
const contract = path.join(repo, 'tests/package-contracts/installedPortalEscape.contract.cjs');
const nativeRequire = createRequire(path.join(repo, 'package.json'));
const antdRequire = createRequire(nativeRequire.resolve('antd/package.json'));
const drawerRequire = createRequire(antdRequire.resolve('@rc-component/drawer/package.json'));
const expectedPortalRoot = fs.realpathSync(
  path.dirname(drawerRequire.resolve('@rc-component/portal/package.json')),
);
const cases = [
  'closing-render-retained',
  'aborted-escape-close',
  'siblings',
  'ordered-fanout',
  'strict-isolated-replay',
  'aborted-reparent',
  'reopen-over-new-sibling',
  'nested',
  'nested-strict',
  'mixed',
  'aborted-open',
  'aborted-error',
  'aborted-close',
  'aborted-callback',
  'callback',
  'callback-epoch-strict',
  'omitted',
  'keyboard-false',
  'composing',
  'composition-window',
  'inactive',
  'reparent',
];

function runContract(mode: string, scenario: string, inject?: string, negativeControl?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-escape-contract-'));
  const receiptPath = path.join(directory, 'receipt.json');
  try {
    const child = spawnSync(
      process.execPath,
      ['--max-old-space-size=1024', contract, scenario, receiptPath],
      {
        cwd: repo,
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 128 * 1024,
        env: {
          ...process.env,
          NODE_ENV: mode,
          PORTAL_ESCAPE_INJECT_CLEANUP_FAILURE: inject ?? '',
          PORTAL_ESCAPE_NEGATIVE_CONTROL: negativeControl ?? '',
        },
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(fs.existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(receipt.schema).toBe('platform.portal-escape-contract.v1');
    expect(receipt.case).toBe(scenario);
    expect(receipt.mode).toBe(mode);
    expect(receipt.source.portalRoot).toBe(expectedPortalRoot);
    expect(receipt.browserBundleExecution).toBe('pending-separate-stage');
    expect(receipt.source.portal).toBe('2.2.1');
    expect(receipt.source.react).toBe('19.3.1');
    for (const [file, digest] of Object.entries(receipt.source.files)) {
      expect(
        createHash('sha256')
          .update(fs.readFileSync(path.join(receipt.source.portalRoot, file)))
          .digest('hex'),
      ).toBe(digest);
    }
    expect(receipt.runtimeWindowDisposed).toBe(true);
    return { child, receipt };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe.each(['development', 'production'])('installed Portal Escape contract (%s)', (mode) => {
  it.each(cases)('%s preserves committed ordering and cleans both listeners', (scenario) => {
    const { child, receipt } = runContract(mode, scenario);
    expect({ status: child.status, errors: receipt.errors }).toEqual({ status: 0, errors: [] });
    expect(receipt.assertions).toBe('passed');
    expect(receipt.cleanup).toBe('passed');
    expect(receipt.remainingListeners).toEqual({ keydown: 0, compositionend: 0 });
    expect(receipt.passed).toBe(true);
  });
});

it.each(['keydown', 'compositionend'])(
  'fails acceptance when %s cleanup fails after green assertions',
  (listener) => {
    const { child, receipt } = runContract('production', 'nested', listener);
    expect(receipt.assertions).toBe('passed');
    expect(receipt.cleanup).toBe('failed');
    expect(receipt.passed).toBe(false);
    expect(child.status).not.toBe(0);
  },
);

it('rejects the naive effect-only priority control', () => {
  const { child, receipt } = runContract('production', 'nested', undefined, 'naive-effect');
  expect(receipt.negativeControl).toBe('naive-effect');
  expect(receipt.negativeControlSha256).toBe(
    createHash('sha256')
      .update(
        fs.readFileSync(
          path.join(repo, 'tests/package-contracts/fixtures/portal-escape-naive-control.cjs'),
        ),
      )
      .digest('hex'),
  );
  expect(receipt.assertions).toBe('failed');
  expect(receipt.errors[0].name).toBe('AssertionError');
  expect(receipt.errors[0].message).toContain('child');
  expect(receipt.cleanup).toBe('passed');
  expect(child.status).not.toBe(0);
});
