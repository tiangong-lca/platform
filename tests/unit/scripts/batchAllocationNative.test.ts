import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const {
  Budget,
  LIMITS,
  BROWSERS,
  CONTROLS,
  capacity,
  deduplicateRoots,
  independentCleanup,
} = require('../../../scripts/e2e/batch-allocation-native-policy.cjs');
const { parse, assertReceipt } = require('../../../scripts/e2e/batch-allocation-native.cjs');
const { PRODUCT } = require('../../../scripts/e2e/batch-allocation-native-source.cjs');
const { Ownership } = require('../../../scripts/e2e/portal-native-resources.cjs');
const {
  runControl,
} = require('../../../tests/package-contracts/native-batch-allocation/control.spec.cjs');
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
function clock() {
  let time = 1000;
  const budget = new Budget(() => time);
  const fresh = () => {
    budget.sample('process', 100);
    budget.sample('disk', 100);
  };
  fresh();
  return {
    budget,
    fresh,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('bounded native batch allocation policy without runtime allocation', () => {
  it('abort cleanup uses the admitted observer export and owner token without importing retained output', async () => {
    const worker = source('scripts/e2e/batch-allocation-native-worker.cjs');
    const begin = worker.indexOf('async function closure()');
    const end = worker.indexOf('async function work()', begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const finish = jest.fn();
    const evaluate = jest.fn(async () => undefined);
    const close = jest.fn(async () => undefined);
    const token = 'a'.repeat(32);
    const result = await vm.runInNewContext(
      `${worker.slice(begin, end)}; closure()`,
      {
        actualObserver: { finishBatchAllocationObserver: finish },
        observerOwner: token,
        activePage: { evaluate, close },
        context: { close },
        browser: { close },
        browserServer: { close },
        server: undefined,
        sockets: new Set(),
        independentCleanup,
        remaining: () => 10000,
        timeout: (operation: () => Promise<unknown>) => operation(),
      },
      { timeout: 1000 },
    );
    expect(evaluate.mock.calls[0]).toEqual([finish, token]);
    expect(close).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ failures: [], portClosed: true, socketsClosed: true });
  });

  it('requires an exact source and keeps execution explicit', () => {
    expect(parse(['--expected-head', 'a'.repeat(40)]).execute).toBe(false);
    expect(() => parse(['--execute', '--expected-head', 'a'.repeat(40)])).toThrow();
    expect(() => parse(['--expected-head', 'HEAD'])).toThrow();
    expect(() => parse(['--expected-head', 'a'.repeat(40), '--retry', '1'])).toThrow();
    expect(() => parse(['--expected-head', 'a'.repeat(40), '--execute', '--execute'])).toThrow();
  });

  it('admits precisely twelve serial controls with no duplicate, reorder or overlap', () => {
    const { budget } = clock();
    expect(budget.cases).toHaveLength(12);
    expect(() => budget.begin('webkit', 'valid')).toThrow('serial_order');
    for (const browser of BROWSERS)
      for (const control of CONTROLS) {
        budget.begin(browser, control);
        expect(() => budget.begin(browser, control)).toThrow('serial_order');
        budget.complete(browser, control, 'passed');
      }
    expect(budget.pass(true)).toBe(true);
    expect(budget.pass(false)).toBe(false);
    expect(budget.pass(true, false)).toBe(false);
    expect(() => budget.begin('chromium', 'valid')).toThrow();
  });

  it('latches cancellation and preserves active versus unstarted outcomes', () => {
    const { budget } = clock();
    budget.begin('chromium', 'valid');
    budget.stop('cancelled');
    budget.stop('different');
    expect(budget.reason).toBe('cancelled');
    expect(budget.cases[0]).toMatchObject({ outcome: 'incomplete', reason: 'cancelled' });
    expect(budget.cases.slice(1).every((item: any) => item.outcome === 'not-run')).toBe(true);
    expect(() => budget.begin('chromium', 'missing-share')).toThrow('cancelled');
    expect(budget.pass(true)).toBe(false);
  });

  it('refuses a new case below its complete work allowance without shortening it', () => {
    const { budget, advance, fresh } = clock();
    advance(LIMITS.workMs - LIMITS.caseMs - 999);
    fresh();
    expect(() => budget.begin('chromium', 'valid')).toThrow('case_budget');
    expect(budget.cases.every((item: any) => item.outcome === 'not-run')).toBe(true);
    expect(LIMITS).toMatchObject({
      wallMs: 900000,
      workMs: 780000,
      cleanupMs: 120000,
      caseMs: 120000,
      actionMs: 20000,
      navigationMs: 45000,
      expectMs: 45000,
    });
  });

  it.each([
    ['process', LIMITS.rssBytes + 1, 'ok', 'rss_limit'],
    ['disk', LIMITS.diskBytes + 1, 'ok', 'disk_limit'],
    ['process', NaN, 'ok', 'process_unknown'],
    ['disk', 0, 'unknown', 'disk_unknown'],
    ['process', 0, 'unreadable', 'process_unknown'],
  ])('fails closed for %s accounting', (kind, bytes, status, reason) => {
    const { budget } = clock();
    budget.sample(kind, bytes, status);
    expect(budget.reason).toBe(reason);
    expect(budget.pass(true)).toBe(false);
  });

  it('rejects late samples, the work deadline and the overall deadline', () => {
    let value = clock();
    value.advance(2001);
    expect(() => value.budget.freshness()).toThrow('process_stale');
    value = clock();
    value.advance(30001);
    value.budget.sample('process', 10);
    expect(() => value.budget.freshness()).toThrow('disk_stale');
    value = clock();
    value.advance(LIMITS.workMs);
    value.fresh();
    expect(() => value.budget.freshness()).toThrow('work_deadline');
    value.advance(LIMITS.cleanupMs);
    expect(value.budget.remaining(true)).toBe(0);
    expect(value.budget.pass(true)).toBe(false);
  });

  it('requires observable host capacity without assuming free space on another filesystem', () => {
    expect(() => capacity(LIMITS.rssBytes, 100, [LIMITS.diskBytes])).not.toThrow();
    for (const memory of [NaN, -1, LIMITS.rssBytes - 1])
      expect(() => capacity(memory, 100, [LIMITS.diskBytes])).toThrow();
    expect(() => capacity(LIMITS.rssBytes, 100, [LIMITS.diskBytes, 1])).toThrow();
    expect(() => capacity(LIMITS.rssBytes, 100, [])).toThrow();
    expect(() => capacity(LIMITS.rssBytes, LIMITS.diskBytes + 1, [LIMITS.diskBytes])).toThrow();
  });

  it('deduplicates admitted nested real paths and rejects a fourth accounting root', () => {
    expect(
      deduplicateRoots(['/source', '/source/modules', '/cache', '/output'], (p: string) => p),
    ).toEqual(['/cache', '/source', '/output']);
    expect(() => deduplicateRoots(['/a', '/b', '/c', '/d'], (p: string) => p)).toThrow(
      'disk_root_limit',
    );
    expect(() =>
      deduplicateRoots(['/bad'], () => {
        throw Error('unreadable');
      }),
    ).toThrow();
  });

  it('attempts independent cleanup after each fault with each bound capped at ten seconds', async () => {
    const calls: string[] = [],
      failures: string[] = [],
      bounds: number[] = [];
    await independentCleanup(
      ['observer', 'page', 'context', 'browser', 'http', 'compiler'].map((name) => [
        name,
        async () => {
          calls.push(name);
          if (name === 'observer' || name === 'browser') throw Error('fault');
        },
      ]),
      () => 5000,
      async (fn: () => Promise<void>, ms: number) => {
        bounds.push(ms);
        await fn();
      },
      (name: string) => failures.push(name),
    );
    expect(calls).toEqual(['observer', 'page', 'context', 'browser', 'http', 'compiler']);
    expect(failures).toEqual(['observer', 'browser']);
    expect(bounds.every((ms) => ms === 5000)).toBe(true);
  });

  it('keeps only the reviewed actual application imports and three explicit adapters', () => {
    expect(PRODUCT).toEqual([
      'src/pages/Processes/Components/Exchange/allocationBatch.tsx',
      'src/pages/Processes/Components/Exchange/allocationEditor.tsx',
      'src/services/processes/allocation.ts',
      'src/services/general/tidasScalarStorage.ts',
    ]);
    const build = source('scripts/e2e/batch-allocation-native-source.cjs');
    expect(build).toContain('unexpected_application_module');
    expect(build).toContain('product_import_closure');
    expect(build).toContain('serializedObserverSha256');
    const worker = source('scripts/e2e/batch-allocation-native-worker.cjs');
    expect(worker).toContain('actual_served_bytes');
    expect(worker).toContain('previous_browser_tree_not_closed');
    expect(worker).not.toContain('waitForTimeout');
    expect(worker).not.toContain('screenshot');
  });

  it('rejects raw-data extensions and a synthesized passing resource receipt', () => {
    expect(() => assertReceipt({ nativePass: true, rawDom: 'forbidden' })).toThrow();
    const { budget } = clock();
    const value = {
      schema: 'platform.batch-allocation-native.v1',
      limits: LIMITS,
      startMono: budget.start,
      workDeadlineMono: budget.workDeadline,
      hardDeadlineMono: budget.deadline,
      elapsedMs: 10,
      withinDeadline: true,
      sourceMode: 'worktree-hashes-only',
      expectedHead: 'a'.repeat(40),
      helperSha256: 'b'.repeat(64),
      diskRoots: [{ path: '/controlled', disposition: 'borrowed-retained' }],
      capacity: 'verified',
      samples: {
        process: 2,
        disk: 1,
        peakRssBytes: 100,
        peakDiskBytes: 100,
        lastProcessMono: budget.start,
        lastDiskMono: budget.start,
        maxProcessAgeMs: 10,
        maxDiskAgeMs: 10,
      },
      cases: budget.cases,
      failures: [],
      ownership: [],
      cleanup: {
        verified: true,
        status: 'ok',
        remainingOwnedPids: [],
        unknownGroups: [],
        reason: null,
        workerExited: true,
        portClosed: true,
        runtimeRetained: false,
      },
      nativePass: false,
    };
    expect(assertReceipt(value)).toBe(value);
    expect(() => assertReceipt({ ...value, nativePass: true })).toThrow('false_native_pass');
    expect(() =>
      assertReceipt({ ...value, cleanup: { ...value.cleanup, rawDom: 'forbidden' } }),
    ).toThrow('cleanup_receipt_invalid');
    expect(() =>
      assertReceipt({ ...value, limits: { ...LIMITS, wallMs: LIMITS.wallMs + 1 } }),
    ).toThrow();
  });

  it('never adopts a missing or reused PID and refuses stale signaling proof', () => {
    const row = { pid: 12, ppid: 10, pgid: 12, rss: 10, start: 'same-start' };
    const snapshot = (rows: any[], observedAt = performance.now()) => ({
      status: 'ok',
      rows: new Map(rows.map((r) => [r.pid, r])),
      observedAt,
    });
    const registry = new Ownership(10);
    registry.capture(12, { pid: 12, exitCode: null, signalCode: null });
    expect(registry.bind(12, snapshot([row]))).toBe(true);
    expect(registry.signalPlan(snapshot([row], performance.now() - 251), 1000)).toEqual({
      status: 'unknown',
      pids: [],
    });
    expect(registry.signalPlan(snapshot([{ ...row, start: 'replacement' }]), 1000).pids).toEqual(
      [],
    );
    const missing = new Ownership(10);
    missing.capture(12, { pid: 12, exitCode: null, signalCode: null });
    expect(missing.bind(12, snapshot([]))).toBe(false);
    expect(missing.closure(snapshot([])).verified).toBe(false);
  });

  it.each([undefined, null, 0, 'fixed-original', Object.freeze({ sentinel: true })])(
    'preserves exact original rejection despite install/write/each cleanup fault (%p)',
    async (original) => {
      let attempts = 0;
      const removed: string[] = [];
      const finish = () => {};
      const locator: any = {
        getByRole: () => locator,
        filter: () => locator,
        click: async () => {},
        elementHandle: async () => {
          throw Error('installation');
        },
        check: async () => {
          attempts++;
          throw original;
        },
      };
      const page = {
        getByRole: () => locator,
        on: () => {
          throw Error('listener-install');
        },
        off: (name: string) => {
          removed.push(name);
          throw Error('remove');
        },
        evaluate: async () => {
          throw Error('capture');
        },
      };
      const expectControl: any = () => ({
        toBeVisible: async () => {},
        toBeEnabled: async () => {},
      });
      expectControl.poll = () => ({ toBe: async () => {} });
      let caught = false,
        value: unknown;
      try {
        await runControl({
          page,
          control: 'valid',
          expect: expectControl,
          observer: { finishBatchAllocationObserver: finish },
          binding: {},
          contract: {
            assertCapture: () => {
              throw Error('schema');
            },
            buildReport: () => {
              throw Error('write');
            },
          },
        });
      } catch (error) {
        caught = true;
        value = error;
      }
      expect(caught).toBe(true);
      expect(value).toBe(original);
      expect(attempts).toBe(1);
      expect(removed).toEqual(['pageerror', 'console']);
    },
  );
});
