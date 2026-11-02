import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

const {
  Budget,
  LIMITS,
  BROWSERS,
  CONTROLS,
  capacity,
  deduplicateRoots,
  independentCleanup,
} = require('../../../scripts/e2e/batch-allocation-native-policy.cjs');
const {
  parse,
  assertReceipt,
  recordObservedFailure,
} = require('../../../scripts/e2e/batch-allocation-native.cjs');
const {
  disk,
  diagnostic,
  assertDiagnostic,
  assertProbeResult,
  capacityDiagnostic,
  decodeProbeResult,
} = require('../../../scripts/e2e/batch-allocation-native-probe.cjs');
const { PRODUCT, bindSources } = require('../../../scripts/e2e/batch-allocation-native-source.cjs');
const { emptyRuntimeProof } = require('../../../scripts/e2e/batch-allocation-native-runtime.cjs');
const { Ownership } = require('../../../scripts/e2e/portal-native-resources.cjs');
const {
  runControl,
} = require('../../../tests/package-contracts/native-batch-allocation/control.spec.cjs');
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
function withWin32HostPath(file: string) {
  const filename = path.join(process.cwd(), file),
    loaded = { exports: {} as any };
  vm.runInNewContext(
    source(file),
    {
      module: loaded,
      process,
      Buffer,
      setTimeout,
      clearTimeout,
      require: (name: string) =>
        name === 'node:path'
          ? path.win32
          : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name),
    },
    { timeout: 1000 },
  );
  return loaded.exports;
}
function probePorts({
  entries = [] as any[],
  entryRoot = '/output',
  readError = null as any,
  linkError = null as any,
  duCode = 0,
  duOutput = '1 private-output\n',
  bind = true,
} = {}) {
  class FakeOwner {
    capture() {}
    bind() {
      return bind;
    }
    closure() {
      return { verified: true };
    }
    signalPlan() {
      return { status: 'ok', pids: [] };
    }
  }
  return {
    rootKinds: ['source', 'browser-cache', 'output'],
    now: () => 0,
    fs: {
      realpathSync: (file: string) => {
        if (linkError && file.endsWith('/private-entry')) throw linkError;
        return file;
      },
      readdirSync: (file: string) => {
        if (readError) throw readError;
        return file === entryRoot ? entries : [];
      },
      statfsSync: () => ({ bavail: LIMITS.diskBytes, bsize: 1 }),
    },
    freemem: () => LIMITS.rssBytes,
    snapshot: () => ({ status: 'ok' }),
    Ownership: FakeOwner,
    spawn: () => {
      const child: any = new EventEmitter();
      child.pid = 42;
      child.stdout = new EventEmitter();
      child.stdin = {
        end: () =>
          queueMicrotask(() => {
            child.stdout.emit('data', duOutput);
            child.emit('close', duCode);
          }),
      };
      return child;
    },
  };
}
const entry = (kind: string) => ({
  name: 'private-entry',
  isSymbolicLink: () => kind === 'symlink',
  isDirectory: () => kind === 'directory',
  isFile: () => kind === 'file',
  isSocket: () => kind === 'socket',
});
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

describe('resource failure capsules with injected filesystem/helper ports only', () => {
  it.each(['socket', 'other'])(
    'preserves rejected %s kind without admitting it or retaining its name',
    async (kind) => {
      let error: any;
      try {
        await disk(
          ['/source', '/browser', '/output'],
          '/output',
          15000,
          probePorts({ entries: [entry(kind)] }),
        );
      } catch (value) {
        error = value;
      }
      expect(error.resourceDiagnostic).toMatchObject({
        stage: 'traversal',
        rootKind: 'output',
        entryKind: kind,
        condition: 'entry-type',
        errno: 'unknown',
      });
      expect(JSON.stringify(error.resourceDiagnostic)).not.toContain('private');
    },
  );
  it('distinguishes a dangling symlink from an unreadable directory and retains only allowlisted errno', async () => {
    const cases = [
      {
        ports: probePorts({
          entries: [entry('symlink')],
          linkError: Object.assign(Error('private path text'), { code: 'ENOENT' }),
        }),
        expected: {
          stage: 'traversal',
          rootKind: 'output',
          entryKind: 'symlink',
          condition: 'symlink-target',
          errno: 'ENOENT',
        },
      },
      {
        ports: probePorts({
          readError: Object.assign(Error('private path text'), { code: 'EACCES' }),
        }),
        expected: {
          stage: 'traversal',
          rootKind: 'source',
          entryKind: 'directory',
          condition: 'read',
          errno: 'EACCES',
        },
      },
    ];
    for (const item of cases) {
      let error: any;
      try {
        await disk(['/source', '/browser', '/output'], '/output', 15000, item.ports);
      } catch (value) {
        error = value;
      }
      expect(error.resourceDiagnostic).toMatchObject(item.expected);
      expect(JSON.stringify(error.resourceDiagnostic)).not.toContain('private');
    }
  });
  it.each([
    [{ bind: false }, 'ownership', 'bind'],
    [{ duCode: 1 }, 'du', 'exit'],
    [{ duOutput: 'private nonnumeric output' }, 'du', 'count'],
  ])(
    'separates helper/ownership/count failures without command output',
    async (options, stage, condition) => {
      let error: any;
      try {
        await disk(['/source'], '/output', 15000, probePorts(options as any));
      } catch (value) {
        error = value;
      }
      expect(error.resourceDiagnostic).toMatchObject({ stage, condition, rootKind: 'source' });
      expect(JSON.stringify(error.resourceDiagnostic)).not.toContain('private');
    },
  );
  it('records safe numeric observations only after complete accounting', async () => {
    const value = await disk(['/source', '/browser', '/output'], '/output', 15000, probePorts());
    expect(value).toEqual({
      status: 'ok',
      bytes: 3072,
      freeBytes: LIMITS.diskBytes,
      availableMemory: LIMITS.rssBytes,
      diagnostic: null,
      runtime: null,
    });
    expect(capacityDiagnostic(value)).toBeNull();
    const input = {
      status: 'ok',
      bytes: 100,
      freeBytes: LIMITS.diskBytes,
      availableMemory: LIMITS.rssBytes,
      diagnostic: null,
      runtime: null,
    };
    expect(capacityDiagnostic({ ...input, availableMemory: LIMITS.rssBytes - 1 })).toMatchObject({
      stage: 'capacity',
      condition: 'memory',
      observations: {
        availableMemoryBytes: LIMITS.rssBytes - 1,
        freeDiskBytes: LIMITS.diskBytes,
        chargedDiskBytes: 100,
      },
    });
    expect(capacityDiagnostic({ ...input, bytes: LIMITS.diskBytes + 1 })).toMatchObject({
      stage: 'capacity',
      condition: 'charged-disk',
    });
    expect(capacityDiagnostic({ ...input, freeBytes: 0 })).toMatchObject({
      stage: 'capacity',
      condition: 'free-disk',
      rootKind: 'output',
    });
  });
  it('rejects private/unknown fields, non-enum text, accessors and unsafe observed values', () => {
    const value = diagnostic('protocol', 'helper-failure');
    expect(assertDiagnostic(value)).toBe(value);
    for (const extra of ['path', 'entryName', 'message', 'stdout', 'environment', 'host'])
      expect(() => assertDiagnostic({ ...value, [extra]: 'private' })).toThrow();
    for (const field of ['stage', 'rootKind', 'entryKind', 'condition', 'errno'])
      expect(() => assertDiagnostic({ ...value, [field]: 'private-text' })).toThrow();
    expect(() =>
      assertDiagnostic({
        ...value,
        observations: { ...value.observations, chargedDiskBytes: NaN },
      }),
    ).toThrow();
    const accessor = { ...value };
    Object.defineProperty(accessor, 'errno', {
      enumerable: true,
      get: () => {
        throw Error('must not read');
      },
    });
    expect(() => assertDiagnostic(accessor)).toThrow('resource_diagnostic_invalid');
    expect(() =>
      assertProbeResult({ status: 'unknown', diagnostic: value, path: 'private' }),
    ).toThrow();
    expect(
      diagnostic('traversal', 'read', {
        error: Object.assign(Error('private'), { code: 'SECRET' }),
      }).errno,
    ).toBe('unknown');
  });
  it('retains the first failing phase/capsule across later cascading failure and successful cleanup', () => {
    const state = { observedFailure: null as any, cleanup: { verified: false } };
    const original = diagnostic('traversal', 'symlink-target', {
      rootKind: 'output',
      entryKind: 'symlink',
      error: { code: 'ENOENT' },
    });
    recordObservedFailure(state, 'begin', original);
    recordObservedFailure(state, 'cleanup', diagnostic('protocol', 'phase-admission'));
    state.cleanup.verified = true;
    expect(state.observedFailure).toEqual({ phase: 'begin', diagnostic: original });
    expect(state.cleanup.verified).toBe(true);
  });
  it('preserves capacity-read errors after charged bytes and rejects malformed helper results privately', async () => {
    const ports = probePorts();
    ports.fs.statfsSync = () => {
      throw Object.assign(Error('private mount'), { code: 'EIO' });
    };
    let thrown: any;
    try {
      await disk(['/source'], '/output', 15000, ports);
    } catch (error) {
      thrown = error;
    }
    expect(thrown.resourceDiagnostic).toMatchObject({
      stage: 'capacity',
      condition: 'read',
      errno: 'EIO',
      observations: { chargedDiskBytes: 1024, freeDiskBytes: null, availableMemoryBytes: null },
    });
    for (const [raw, code, stage, condition] of [
      ['private invalid JSON', 0, 'parse', 'json'],
      ['{"status":"unknown","path":"private"}', 1, 'parse', 'result'],
      [
        JSON.stringify({
          status: 'ok',
          bytes: 100,
          freeBytes: LIMITS.diskBytes,
          availableMemory: LIMITS.rssBytes,
          diagnostic: null,
          runtime: null,
        }),
        1,
        'protocol',
        'helper-result',
      ],
      [
        JSON.stringify({
          status: 'ok',
          bytes: 100,
          freeBytes: LIMITS.diskBytes,
          availableMemory: 1,
          diagnostic: null,
          runtime: null,
        }),
        0,
        'capacity',
        'memory',
      ],
    ]) {
      let error: any;
      try {
        decodeProbeResult(raw, code);
      } catch (value) {
        error = value;
      }
      expect(error.resourceDiagnostic).toMatchObject({ stage, condition });
      expect(JSON.stringify(error.resourceDiagnostic)).not.toContain('private');
    }
  });
});

describe('bounded native batch allocation policy without runtime allocation', () => {
  it('keeps actual POSIX root deduplication and probe containment under a win32 host path module', async () => {
    const policy = withWin32HostPath('scripts/e2e/batch-allocation-native-policy.cjs');
    expect(
      policy.deduplicateRoots(
        ['/source', '/source/child', '/source-other', '/output'],
        (p: string) => p,
      ),
    ).toEqual(['/source', '/output', '/source-other']);
    expect(() => policy.deduplicateRoots(['/a', '/b', '/c', '/d'], (p: string) => p)).toThrow(
      'disk_root_limit',
    );
    const probe = withWin32HostPath('scripts/e2e/batch-allocation-native-probe.cjs');
    const ports = probePorts({ entries: [entry('symlink')] });
    const positive = await probe.disk(['/source', '/cache', '/output'], '/output', 15000, ports);
    expect(positive.status).toBe('ok');
    expect(positive.bytes).toBe(3072);
    ports.fs.realpathSync = (file: string) =>
      file.endsWith('/private-entry') ? '/output-foreign/private-entry' : file;
    await expect(
      probe.disk(['/source', '/cache', '/output'], '/output', 15000, ports),
    ).rejects.toMatchObject({
      resourceDiagnostic: {
        stage: 'traversal',
        rootKind: 'output',
        entryKind: 'symlink',
        condition: 'symlink-escape',
      },
    });
  });

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

  it('checks every installed native source input with exact spelling before case-folded filesystem reads', () => {
    const bind = () => bindSources(process.cwd(), 'a'.repeat(40), 'b'.repeat(40));
    // Source hashing only: no compiler, browser cache, server or native control.
    const binding = bind();
    const files = Object.keys(binding.hashes).filter((file) =>
      file.includes(`${path.sep}node_modules${path.sep}`),
    );
    expect(files).toHaveLength(24);
    const button = files.find((file) => file.endsWith(`${path.sep}Button.js`))!;
    const select = files.find((file) => file.endsWith(`${path.sep}SingleContent.js`))!;
    const core = files.find((file) => file.endsWith(`${path.sep}coreBundle.js`))!;
    expect(button).toBeDefined();
    expect(select).toBeDefined();
    expect(core).toBeDefined();
    for (const input of [
      ...files,
      path.dirname(button),
      path.dirname(select),
      path.dirname(core),
    ]) {
      const parent = path.dirname(input);
      const name = path.basename(input);
      const readDirectory = fs.readdirSync;
      let observed = false;
      const listing = jest.spyOn(fs, 'readdirSync').mockImplementation(((directory, options) => {
        const entries = Reflect.apply(readDirectory, fs, [directory, options]);
        if (String(directory) !== parent) return entries;
        observed = true;
        return (entries as string[]).map((entry) => (entry === name ? entry.toUpperCase() : entry));
      }) as typeof fs.readdirSync);
      try {
        expect(bind).toThrow('source_file_invalid');
        expect(observed).toBe(true);
      } finally {
        listing.mockRestore();
      }
    }
    expect(bind().hashes).toEqual(binding.hashes);
  });

  it('rejects raw-data extensions and a synthesized passing resource receipt', () => {
    expect(() => assertReceipt({ nativePass: true, rawDom: 'forbidden' })).toThrow();
    const { budget } = clock();
    const value = {
      schema: 'platform.batch-allocation-native.v4',
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
      observedFailure: null,
      runtimeProof: emptyRuntimeProof(),
    };
    expect(assertReceipt(value)).toBe(value);
    for (const schema of [
      'platform.batch-allocation-native.v1',
      'platform.batch-allocation-native.v2',
    ])
      expect(() => assertReceipt({ ...value, schema })).toThrow('resource_receipt_invalid');
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
