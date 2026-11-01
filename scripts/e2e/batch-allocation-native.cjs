#!/usr/bin/env node
// Default is a read-only plan. Only --execute owns the single serial native set.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  cp = require('node:child_process'),
  net = require('node:net');
const { performance } = require('node:perf_hooks');
const {
  VERSION: CHROMIUM_VERSION,
  COUNTS: SINGLETON_COUNTS,
  assertBinding: assertSingletonBinding,
  assertSummary: assertSingletonSummary,
} = require('./batch-allocation-native-singleton.cjs');
const {
  diagnostic,
  assertDiagnostic,
  assertProbeResult,
  decodeProbeResult,
} = require('./batch-allocation-native-probe.cjs');
const {
  Budget,
  LIMITS,
  BROWSERS,
  CONTROLS,
  check,
  deduplicateRoots,
} = require('./batch-allocation-native-policy.cjs');
const {
  Ownership,
  readSnapshot,
  createRuntime,
  runtimeRemovable,
} = require('./portal-native-resources.cjs');
const { bindSources, fileHash } = require('./batch-allocation-native-source.cjs');
const root = path.resolve(__dirname, '../..');
function parse(args) {
  const result = { execute: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--execute') {
      check(!result.execute, 'duplicate_execute');
      result.execute = true;
    } else {
      check(
        ['--expected-head', '--output'].includes(key) &&
          !result[key] &&
          args[i + 1] &&
          !args[i + 1].startsWith('--'),
        'invalid_argument',
      );
      result[key] = args[++i];
    }
  }
  check(/^[a-f0-9]{40}$/u.test(result['--expected-head'] || ''), 'exact_head_required');
  check(!result.execute || path.isAbsolute(result['--output'] || ''), 'absolute_output_required');
  return result;
}
const browserCache = () =>
  fs.realpathSync(
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
      path.join(
        process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Caches')
          : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
        'ms-playwright',
      ),
  );
function plan(options) {
  const git = (ref) =>
    cp
      .execFileSync('git', ['-C', root, 'rev-parse', ref], { encoding: 'utf8', timeout: 5000 })
      .trim();
  check(git('HEAD') === options['--expected-head'], 'head_mismatch');
  return {
    mode: 'plan-only',
    source: bindSources(root, git('HEAD'), git('HEAD^{tree}')),
    limits: LIMITS,
    singletonPolicy: {
      browser: 'chromium',
      version: CHROMIUM_VERSION,
      counts: SINGLETON_COUNTS,
      linkBytes: { lock: 512, cookie: 20, socket: 4096 },
      scope: 'verified-disposable-runtime-only',
    },
    schedule: BROWSERS.flatMap((browser) => CONTROLS.map((control) => ({ browser, control }))),
    borrowedRetainedRoots: [root, browserCache()],
    output: options['--output'] || null,
    evidence:
      'controlled-native-worktree-hashes-only; no canonical qualification or historical cause claim',
  };
}
const FAILURE_CODES = Object.freeze([
  'cancelled',
  'case-deadline',
  'case-protocol-invalid',
  'child-spawn-failed',
  'disk-or-capacity-unknown',
  'disk-output-cap',
  'disk-probe-deadline',
  'disk-stale',
  'hard-deadline',
  'native-admission-or-runtime-failed',
  'native-control-failed',
  'phase-admission-failed',
  'port-identity-invalid',
  'process-monitor-unknown',
  'process-stale',
  'work-deadline',
  'worker-failed',
  'worker-incomplete',
  'worker-ownership-unknown',
  'worker-protocol-invalid',
  'closure-unverified',
  'receipt-publication-failed',
  'runtime-retained',
  'signal-failed',
  'signal-identity-unknown',
  'signal-plan-stale',
  'rss-limit',
  'disk-limit',
  'process-unknown',
  'disk-unknown',
  'monitor-unknown',
]);
const exact = (value, keys) =>
  value &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.getOwnPropertyNames(value).length === keys.length &&
  keys.every((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d && d.enumerable && Object.hasOwn(d, 'value');
  });
const list = (value, max) =>
  Array.isArray(value) &&
  Object.getPrototypeOf(value) === Array.prototype &&
  value.length <= max &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.getOwnPropertyNames(value).length === value.length + 1 &&
  Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, i);
    return d && d.enumerable && Object.hasOwn(d, 'value');
  }).every(Boolean);
const uint = (value) => Number.isSafeInteger(value) && value >= 0;
const PHASES = Object.freeze([
  'preparation',
  'singleton-register',
  'build',
  'server',
  'browser',
  'browser-closed',
  'begin',
  'publication',
  'published',
  'monitor',
  'cleanup',
  'unknown',
]);
function recordObservedFailure(receipt, phase, value) {
  assertDiagnostic(value);
  check(PHASES.includes(phase), 'diagnostic_phase_invalid');
  if (receipt.observedFailure === null) receipt.observedFailure = { phase, diagnostic: value };
  return receipt.observedFailure;
}
function assertReceipt(value) {
  const keys = [
    'schema',
    'limits',
    'startMono',
    'workDeadlineMono',
    'hardDeadlineMono',
    'elapsedMs',
    'withinDeadline',
    'sourceMode',
    'expectedHead',
    'helperSha256',
    'diskRoots',
    'capacity',
    'samples',
    'cases',
    'failures',
    'ownership',
    'cleanup',
    'nativePass',
    'observedFailure',
    'singleton',
  ];
  check(exact(value, keys), 'resource_receipt_invalid');
  check(
    value.schema === 'platform.batch-allocation-native.v3' &&
      exact(value.limits, Object.keys(LIMITS)) &&
      Object.keys(LIMITS).every((k) => value.limits[k] === LIMITS[k]) &&
      [value.startMono, value.workDeadlineMono, value.hardDeadlineMono, value.elapsedMs].every(
        uint,
      ) &&
      value.workDeadlineMono - value.startMono === LIMITS.workMs &&
      value.hardDeadlineMono - value.startMono === LIMITS.wallMs &&
      value.withinDeadline === value.elapsedMs <= LIMITS.wallMs &&
      value.sourceMode === 'worktree-hashes-only' &&
      typeof value.expectedHead === 'string' &&
      /^[a-f0-9]{40}$/u.test(value.expectedHead) &&
      typeof value.helperSha256 === 'string' &&
      /^[a-f0-9]{64}$/u.test(value.helperSha256) &&
      ['unknown', 'verified'].includes(value.capacity) &&
      typeof value.nativePass === 'boolean',
    'resource_receipt_invalid',
  );
  check(
    list(value.diskRoots, 3) &&
      value.diskRoots.every(
        (item) =>
          exact(item, ['path', 'disposition']) &&
          typeof item.path === 'string' &&
          item.path === path.resolve(item.path) &&
          item.path !== path.parse(item.path).root &&
          item.path.length <= 4096 &&
          ['borrowed-retained', 'owned-retained-including-disposable-runtime'].includes(
            item.disposition,
          ),
      ) &&
      new Set(value.diskRoots.map((item) => item.path)).size === value.diskRoots.length,
    'disk_receipt_invalid',
  );
  check(
    exact(value.samples, [
      'process',
      'disk',
      'peakRssBytes',
      'peakDiskBytes',
      'lastProcessMono',
      'lastDiskMono',
      'maxProcessAgeMs',
      'maxDiskAgeMs',
    ]) &&
      ['process', 'disk', 'peakRssBytes', 'peakDiskBytes', 'maxProcessAgeMs', 'maxDiskAgeMs'].every(
        (k) => uint(value.samples[k]),
      ) &&
      value.samples.process <= 2048 &&
      value.samples.disk <= 512 &&
      ['lastProcessMono', 'lastDiskMono'].every(
        (k) =>
          value.samples[k] === null ||
          (uint(value.samples[k]) &&
            value.samples[k] >= value.startMono &&
            value.samples[k] <= value.startMono + value.elapsedMs),
      ),
    'sample_receipt_invalid',
  );
  check(
    list(value.cases, 12) &&
      value.cases.length === 12 &&
      value.cases.every(
        (item, i) =>
          exact(item, ['browser', 'control', 'outcome', 'reason']) &&
          item.browser === BROWSERS[Math.floor(i / 4)] &&
          item.control === CONTROLS[i % 4] &&
          ['passed', 'failed', 'incomplete', 'not-run'].includes(item.outcome) &&
          (item.reason === null ||
            (typeof item.reason === 'string' &&
              FAILURE_CODES.includes(item.reason.replaceAll('_', '-')))) &&
          (item.outcome === 'incomplete' ? item.reason !== null : item.reason === null),
      ),
    'case_receipt_invalid',
  );
  check(
    list(value.failures, 128) &&
      value.failures.every((code) => FAILURE_CODES.includes(code)) &&
      new Set(value.failures).size === value.failures.length,
    'failure_receipt_invalid',
  );
  check(
    list(value.ownership, 256) &&
      value.ownership.every(
        (item) =>
          exact(item, ['pid', 'start', 'pgid', 'state', 'captureUnknown']) &&
          uint(item.pid) &&
          item.pid > 0 &&
          typeof item.captureUnknown === 'boolean' &&
          ['pending', 'live', 'closed', 'unknown', 'reused'].includes(item.state) &&
          (item.start === null ||
            (typeof item.start === 'string' &&
              /^[A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(item.start))) &&
          (item.pgid === null || (uint(item.pgid) && item.pgid > 0)),
      ) &&
      new Set(value.ownership.map((item) => item.pid)).size === value.ownership.length,
    'ownership_receipt_invalid',
  );
  const c = value.cleanup;
  check(
    exact(c, [
      'verified',
      'status',
      'remainingOwnedPids',
      'unknownGroups',
      'reason',
      'workerExited',
      'portClosed',
      'runtimeRetained',
    ]) &&
      ['ok', 'unknown'].includes(c.status) &&
      ['verified', 'workerExited', 'portClosed', 'runtimeRetained'].every(
        (k) => typeof c[k] === 'boolean',
      ) &&
      ['remainingOwnedPids', 'unknownGroups'].every(
        (k) =>
          list(c[k], 256) &&
          c[k].every((n) => uint(n) && n > 0) &&
          new Set(c[k]).size === c[k].length,
      ) &&
      (c.status === 'ok'
        ? c.reason === null
        : [
            'inspection_budget',
            'inspection_failed',
            'inspection_incomplete',
            'inspection_malformed',
            'inspection_missing_self',
            'owner_limit',
            'unbound_identity',
            'unowned_group_survivor',
          ].includes(c.reason)) &&
      (!c.verified ||
        (c.status === 'ok' &&
          c.remainingOwnedPids.length === 0 &&
          c.unknownGroups.length === 0 &&
          c.workerExited &&
          c.portClosed &&
          !c.runtimeRetained)),
    'cleanup_receipt_invalid',
  );
  if (value.observedFailure !== null) {
    check(
      exact(value.observedFailure, ['phase', 'diagnostic']) &&
        PHASES.includes(value.observedFailure.phase),
      'observed_failure_invalid',
    );
    assertDiagnostic(value.observedFailure.diagnostic);
  }
  check(
    exact(value.singleton, ['status', 'inspections', 'summary']) &&
      ['not-registered', 'registered', 'verified', 'closed', 'invalid'].includes(
        value.singleton.status,
      ) &&
      uint(value.singleton.inspections) &&
      value.singleton.inspections <= 512,
    'singleton_receipt_invalid',
  );
  if (value.singleton.summary !== null) assertSingletonSummary(value.singleton.summary);
  check(
    value.singleton.summary === null
      ? value.singleton.inspections === 0 &&
          !['verified', 'closed'].includes(value.singleton.status)
      : value.singleton.inspections > 0 &&
          !['not-registered', 'registered'].includes(value.singleton.status),
    'singleton_receipt_invalid',
  );
  check(
    !value.nativePass ||
      (c.verified &&
        value.singleton.status === 'closed' &&
        value.singleton.summary !== null &&
        value.observedFailure === null &&
        value.withinDeadline &&
        value.capacity === 'verified' &&
        value.diskRoots.length > 0 &&
        !value.failures.length &&
        value.cases.every((item) => item.outcome === 'passed') &&
        value.ownership.every((item) => item.state === 'closed' && !item.captureUnknown) &&
        value.samples.process > 0 &&
        value.samples.disk > 0 &&
        value.samples.peakRssBytes <= LIMITS.rssBytes &&
        value.samples.peakDiskBytes <= LIMITS.diskBytes &&
        value.samples.lastProcessMono !== null &&
        value.samples.lastDiskMono !== null &&
        value.startMono + value.elapsedMs - value.samples.lastProcessMono <= LIMITS.processAgeMs &&
        value.startMono + value.elapsedMs - value.samples.lastDiskMono <= LIMITS.diskAgeMs &&
        value.samples.maxProcessAgeMs <= LIMITS.processAgeMs &&
        value.samples.maxDiskAgeMs <= LIMITS.diskAgeMs),
    'false_native_pass',
  );
  check(Buffer.byteLength(JSON.stringify(value)) <= 262144, 'resource_receipt_byte_cap');
  return value;
}
async function execute(options) {
  // The supervisor/watchdog starts before source hashing, capacity probes or worker preparation.
  const budget = new Budget(),
    registry = new Ownership();
  const helperFile = path.join(root, 'scripts/e2e/portal-native-resources.cjs');
  const helperHash = fileHash(helperFile);
  let output,
    runtime,
    worker,
    monitor,
    workTimer,
    hardTimer,
    exitTimer,
    diskPromise,
    lastDiskStart = -Infinity,
    port = null;
  let workerExit = false,
    workerResult = null,
    stopping = false,
    publication = true;
  let activePhase = 'preparation';
  let singletonBinding = null;
  let browserIndex = 0,
    browserOpen = false;
  const failures = [],
    fail = (value) => {
      const code = value.replaceAll('_', '-');
      if (failures.length < 128 && !failures.includes(code)) failures.push(code);
    };
  const receipt = {
    schema: 'platform.batch-allocation-native.v3',
    limits: LIMITS,
    startMono: budget.start,
    workDeadlineMono: budget.workDeadline,
    hardDeadlineMono: budget.deadline,
    elapsedMs: 0,
    withinDeadline: false,
    sourceMode: 'worktree-hashes-only',
    expectedHead: options['--expected-head'],
    helperSha256: helperHash,
    diskRoots: [],
    capacity: 'unknown',
    samples: {
      process: 0,
      disk: 0,
      peakRssBytes: 0,
      peakDiskBytes: 0,
      lastProcessMono: null,
      lastDiskMono: null,
      maxProcessAgeMs: 0,
      maxDiskAgeMs: 0,
    },
    cases: budget.cases,
    failures,
    ownership: [],
    cleanup: { verified: false, runtimeRetained: true, workerExited: false, portClosed: false },
    nativePass: false,
    observedFailure: null,
    singleton: { status: 'not-registered', inspections: 0, summary: null },
  };
  const remaining = () => budget.remaining(true);
  const snapshot = () => readSnapshot({ remainingMs: Math.min(1000, remaining()) });
  const write = (name, value, exclusive = false) => {
    check(output && budget.remaining(true) > 0, 'publication_deadline');
    fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
      flag: exclusive ? 'wx' : 'w',
    });
  };
  const stop = (code) => {
    budget.stop(code);
    stopping = true;
    fail(code);
    if (worker?.connected) worker.send({ type: 'stop' });
  };
  const launch = (file, args = [], ipc = false, cleanup = false) => {
    check(
      !stopping ||
        (cleanup &&
          file === path.join(__dirname, 'batch-allocation-native-probe.cjs') &&
          args[0] === '--remove'),
      'launch_after_stop',
    );
    const child = cp.spawn(process.execPath, [file, ...args], {
      cwd: root,
      detached: true,
      env: runtime
        ? {
            ...process.env,
            ...runtime.env,
            PLAYWRIGHT_BROWSERS_PATH: browserCache(),
            GOMAXPROCS: '2',
            UV_THREADPOOL_SIZE: '2',
            OMP_NUM_THREADS: '2',
          }
        : { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
    });
    check(child.pid, 'child_pid_missing');
    registry.capture(child.pid, child);
    write('ownership.json', registry.evidence());
    check(registry.bind(child.pid, snapshot()), 'child_identity_unknown');
    child.stderr.on('data', () => {});
    child.once('error', () => stop('child-spawn-failed'));
    return child;
  };
  const sampleProcess = () => {
    const observedMono = budget.now();
    receipt.samples.maxProcessAgeMs = Math.max(
      receipt.samples.maxProcessAgeMs,
      budget.processAt === null ? 0 : observedMono - budget.processAt,
    );
    check(
      budget.processAt === null || budget.now() - budget.processAt <= LIMITS.processAgeMs,
      'process_sample_late',
    );
    const state = snapshot(),
      owned = registry.refresh(state);
    check(
      state.status === 'ok' &&
        owned.status === 'ok' &&
        !registry.evidence().some((item) => item.state === 'reused'),
      'process_unknown',
    );
    const self = state.rows.get(process.pid);
    check(self, 'self_unknown');
    budget.sample(
      'process',
      owned.live.reduce((n, item) => n + state.rows.get(item.pid).rss, self.rss),
      'ok',
      observedMono,
    );
    receipt.samples.process++;
    receipt.samples.peakRssBytes = budget.peakRss;
    receipt.samples.lastProcessMono = budget.processAt;
    if (budget.stopping) stop(budget.reason);
  };
  const signalOwned = (signal) => {
    const state = snapshot(),
      signalPlan = registry.signalPlan(state, remaining());
    if (signalPlan.status !== 'ok') {
      fail('signal-identity-unknown');
      return false;
    }
    for (const pid of signalPlan.pids) {
      if (performance.now() - state.observedAt > 250 || remaining() < 100) {
        fail('signal-plan-stale');
        return false;
      }
      try {
        process.kill(pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') fail('signal-failed');
      }
    }
    return true;
  };
  const disk = () => {
    const failingPhase = activePhase;
    if (diskPromise) return diskPromise;
    check(!stopping && budget.remaining() > 100, 'disk_after_stop');
    lastDiskStart = budget.now();
    diskPromise = new Promise((resolve, reject) => {
      const child = launch(path.join(__dirname, 'batch-allocation-native-probe.cjs'), [
        JSON.stringify({
          roots: receipt.diskRoots.map((item) => item.path),
          rootKinds: receipt.diskRoots.map((item) =>
            item.path === fs.realpathSync(root)
              ? 'source'
              : item.path === browserCache()
                ? 'browser-cache'
                : item.path === output
                  ? 'output'
                  : 'unknown',
          ),
          singletonBinding,
          writeRoot: output,
          remainingMs: Math.min(LIMITS.diskProbeMs, budget.remaining()),
        }),
      ]);
      let data = '';
      const timer = setTimeout(
        () => {
          recordObservedFailure(receipt, failingPhase, diagnostic('du', 'timeout'));
          stop('disk-probe-deadline');
          signalOwned('SIGTERM');
          reject(Error('disk_deadline'));
        },
        Math.min(LIMITS.diskProbeMs, budget.remaining()),
      );
      child.stdout.on('data', (bytes) => {
        data += bytes;
        if (data.length <= 4096) {
          let candidate;
          try {
            candidate = JSON.parse(data);
          } catch {}
          if (candidate?.status === 'unknown') {
            try {
              assertProbeResult(candidate);
              recordObservedFailure(receipt, failingPhase, candidate.diagnostic);
              if (candidate.diagnostic.stage === 'singleton') receipt.singleton.status = 'invalid';
            } catch {
              recordObservedFailure(receipt, failingPhase, diagnostic('parse', 'result'));
            }
            stop('disk-or-capacity-unknown');
          }
        }
        if (data.length > 4096) {
          recordObservedFailure(receipt, failingPhase, diagnostic('du', 'output-cap'));
          stop('disk-output-cap');
          reject(Error('disk_output_cap'));
        }
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        try {
          const value = decodeProbeResult(data, code);
          if (value.singleton !== null) {
            check(
              singletonBinding &&
                value.singleton.owner.pid === singletonBinding.process.pid &&
                value.singleton.owner.start === singletonBinding.process.start &&
                value.singleton.owner.pgid === singletonBinding.process.pgid &&
                value.singleton.owner.executableSha256 ===
                  singletonBinding.process.executableSha256,
              'singleton_probe_owner',
            );
            receipt.singleton.inspections++;
            receipt.singleton.status = 'verified';
            receipt.singleton.summary = value.singleton;
          } else check(singletonBinding === null, 'singleton_probe_missing');
          receipt.samples.maxDiskAgeMs = Math.max(
            receipt.samples.maxDiskAgeMs,
            budget.diskAt === null ? 0 : budget.now() - budget.diskAt,
          );
          budget.sample('disk', value.bytes);
          receipt.samples.disk++;
          receipt.samples.peakDiskBytes = budget.peakDisk;
          receipt.samples.lastDiskMono = budget.diskAt;
          receipt.capacity = 'verified';
          check(!budget.stopping, 'disk_limit');
          resolve();
        } catch (error) {
          let observed;
          try {
            observed = assertDiagnostic(error.resourceDiagnostic);
          } catch {
            observed = diagnostic('protocol', 'helper-failure');
          }
          recordObservedFailure(receipt, failingPhase, observed);
          if (observed.stage === 'singleton') receipt.singleton.status = 'invalid';
          stop('disk-or-capacity-unknown');
          reject(Error('disk_unknown'));
        }
      });
    }).finally(() => {
      diskPromise = null;
    });
    diskPromise.catch(() => {});
    return diskPromise;
  };
  const checkPort = () =>
    new Promise((resolve) => {
      if (!port) {
        resolve(true);
        return;
      }
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(Math.min(1000, Math.max(1, remaining())));
      socket.once('connect', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED'));
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  const cancel = () => stop('cancelled');
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  // At 898s escalate using fresh ownership and leave a minimal receipt, then exit by 900s.
  hardTimer = setTimeout(() => {
    stop('hard-deadline');
    signalOwned('SIGKILL');
    try {
      receipt.elapsedMs = budget.now() - budget.start;
      receipt.failures = failures;
      write(
        'hard-deadline.json',
        { schema: receipt.schema, elapsedMs: receipt.elapsedMs, nativePass: false, failures },
        true,
      );
    } catch {
      publication = false;
    }
    exitTimer = setTimeout(() => process.exit(124), Math.max(1, remaining() - 25));
  }, LIMITS.wallMs - 2000);
  workTimer = setTimeout(() => stop('work-deadline'), LIMITS.workMs);
  try {
    check(['darwin', 'linux'].includes(process.platform), 'unsupported_platform');
    check(
      path.isAbsolute(options['--output']) && !fs.existsSync(options['--output']),
      'new_output_required',
    );
    output = options['--output'];
    check(fs.realpathSync(path.dirname(output)) === path.dirname(output), 'output_parent_alias');
    fs.mkdirSync(output, { mode: 0o700 });
    const roots = deduplicateRoots([root, browserCache(), output], (p) => fs.realpathSync(p));
    receipt.diskRoots = roots.map((p) => ({
      path: p,
      disposition:
        p === output ? 'owned-retained-including-disposable-runtime' : 'borrowed-retained',
    }));
    write(
      'intent.json',
      {
        schema: receipt.schema,
        startMono: budget.start,
        hardDeadlineMono: budget.deadline,
        expectedHead: options['--expected-head'],
        diskRoots: receipt.diskRoots,
      },
      true,
    );
    sampleProcess();
    monitor = setInterval(() => {
      try {
        sampleProcess();
        if (!stopping && budget.diskAt !== null && budget.now() - budget.diskAt > LIMITS.diskAgeMs)
          stop('disk-stale');
        if (
          !stopping &&
          budget.activeAt !== null &&
          budget.activeAt !== undefined &&
          budget.now() - budget.activeAt >= LIMITS.caseMs
        )
          stop('case-deadline');
        if (!stopping && budget.now() - lastDiskStart >= 10000) disk().catch(() => {});
        if (
          !stopping &&
          budget.processAt !== null &&
          budget.now() - budget.processAt > LIMITS.processAgeMs
        )
          stop('process-stale');
      } catch {
        stop('process-monitor-unknown');
      }
    }, 1000);
    await disk();
    budget.freshness();
    runtime = createRuntime(output, (partial) => {
      runtime = partial;
      write('runtime-intent.json', partial, true);
    });
    const runtimeIdentity = {
      path: runtime.path,
      parent: runtime.parent,
      device: runtime.device,
      inode: runtime.inode,
      nonce: runtime.nonce,
      directories: runtime.directories,
    };
    write('runtime-binding.json', runtimeIdentity, true);
    worker = launch(path.join(__dirname, 'batch-allocation-native-worker.cjs'), [], true);
    worker.stdout.on('data', () => {});
    const done = new Promise((resolve) => {
      worker.on('message', (message) => {
        if (message.type === 'port') {
          if (
            Number.isInteger(message.port) &&
            message.port > 0 &&
            message.port < 65536 &&
            port === null
          )
            port = message.port;
          else stop('port-identity-invalid');
          return;
        }
        if (message.type === 'finished') {
          workerResult = message;
          return;
        }
        if (message.type === 'complete') {
          try {
            budget.complete(message.browser, message.control, message.outcome);
            if (message.outcome !== 'passed') stop('native-control-failed');
          } catch {
            stop('case-protocol-invalid');
          }
          return;
        }
        if (!['phase', 'begin', 'ownership', 'singleton'].includes(message.type)) {
          stop('worker-protocol-invalid');
          return;
        }
        if (message.type === 'ownership') {
          try {
            sampleProcess();
          } catch {
            stop('worker-ownership-unknown');
          }
          return;
        }
        (async () => {
          try {
            check(!stopping, 'stopping');
            activePhase =
              message.type === 'singleton'
                ? 'singleton-register'
                : message.type === 'begin'
                  ? 'begin'
                  : PHASES.includes(message.phase)
                    ? message.phase
                    : 'unknown';
            sampleProcess();
            if (message.type === 'singleton') {
              assertSingletonBinding(message.binding);
              check(
                browserOpen && BROWSERS[browserIndex] === 'chromium' && singletonBinding === null,
                'singleton_registration',
              );
              const candidate = message.binding,
                proof = candidate.process,
                registered = registry.records.get(proof.pid),
                view = snapshot(),
                row = view.status === 'ok' && view.rows.get(proof.pid);
              const expected = JSON.parse(
                fs.readFileSync(path.join(output, 'browser-binding.json'), 'utf8'),
              ).chromium;
              check(
                registered?.state === 'live' &&
                  registered.start === proof.start &&
                  registered.pgid === proof.pgid &&
                  row &&
                  row.start === proof.start &&
                  row.pgid === proof.pgid &&
                  row.ppid === worker.pid &&
                  proof.parentPid === worker.pid &&
                  proof.executable === expected.executable &&
                  proof.executableSha256 === expected.sha256,
                'singleton_process_registration',
              );
              check(
                candidate.runtime.path === runtime.path &&
                  candidate.runtime.parent === runtime.parent &&
                  candidate.runtime.device === runtime.device &&
                  candidate.runtime.inode === runtime.inode &&
                  candidate.runtime.nonce === runtime.nonce &&
                  candidate.runtime.uid === process.getuid() &&
                  candidate.runtime.mode === 0o700,
                'singleton_runtime_registration',
              );
              singletonBinding = candidate;
              receipt.singleton.status = 'registered';
            }
            if (
              message.type === 'phase' &&
              message.phase === 'browser-closed' &&
              message.browser === 'chromium'
            ) {
              const state = registry.refresh(snapshot());
              check(
                singletonBinding &&
                  state.status === 'ok' &&
                  state.live.every((item) => item.pid === worker.pid),
                'singleton_browser_closure',
              );
              singletonBinding = null;
              receipt.singleton.status = 'closed';
            }
            await disk();
            budget.freshness();
            if (message.type === 'begin') budget.begin(message.browser, message.control);
            else if (message.type !== 'singleton') {
              check(
                [
                  'build',
                  'server',
                  'browser',
                  'browser-closed',
                  'publication',
                  'published',
                ].includes(message.phase),
                'phase_invalid',
              );
              if (message.phase === 'browser') {
                check(
                  !browserOpen &&
                    message.browser === BROWSERS[browserIndex] &&
                    budget.remaining() >= LIMITS.caseMs + 1000,
                  'browser_budget_or_order',
                );
                browserOpen = true;
              }
              if (message.phase === 'browser-closed') {
                const state = registry.refresh(snapshot());
                check(
                  browserOpen &&
                    message.browser === BROWSERS[browserIndex] &&
                    state.status === 'ok' &&
                    state.live.every((item) => item.pid === worker.pid),
                  'previous_browser_tree_not_closed',
                );
                browserOpen = false;
                browserIndex++;
              }
            }
            write('checkpoint.json', {
              phase: activePhase,
              singleton: receipt.singleton,
              cases: budget.cases,
              samples: receipt.samples,
              ownership: registry.evidence(),
            });
            worker.send({ type: 'ack', id: message.id, ok: true });
          } catch {
            if (receipt.observedFailure === null)
              recordObservedFailure(
                receipt,
                activePhase,
                diagnostic('protocol', 'phase-admission'),
              );
            stop('phase-admission-failed');
            if (worker.connected) worker.send({ type: 'ack', id: message.id, ok: false });
          }
        })();
      });
      worker.once('close', () => {
        workerExit = true;
        resolve();
      });
    });
    worker.send({
      type: 'start',
      output,
      runtime: runtimeIdentity,
      browserCache: browserCache(),
      expectedHead: options['--expected-head'],
      deadline: budget.deadline,
      workDeadline: budget.workDeadline,
    });
    // Supervision remains independent of the worker; cancellation cannot leave this await unbounded.
    while (!workerExit && remaining() > 2000) {
      await Promise.race([
        done,
        new Promise((resolve) => {
          setTimeout(resolve, 100);
        }),
      ]);
      if (stopping) {
        signalOwned('SIGTERM');
        break;
      }
    }
    if (!workerExit) stop('worker-incomplete');
    if (!workerResult || workerResult.failed) stop('worker-failed');
  } catch {
    stop('native-admission-or-runtime-failed');
  } finally {
    stopping = true;
    if (monitor) clearInterval(monitor);
    clearTimeout(workTimer);
    if (worker?.connected) worker.send({ type: 'stop' });
    // Worker independently attempts observer/component/page/context/browser/HTTP closure.
    const gracefulEnd = Math.min(budget.now() + 10000, budget.deadline - 2000);
    while (worker && !workerExit && budget.now() < gracefulEnd)
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    if (registry.records.size) {
      signalOwned('SIGTERM');
      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(300, remaining()));
      });
      signalOwned('SIGKILL');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(100, remaining()));
    });
    const closed = registry.closure(snapshot()),
      portClosed = await checkPort();
    receipt.cleanup = {
      ...closed,
      workerExited: !worker || workerExit,
      portClosed,
      runtimeRetained: Boolean(runtime),
    };
    if (!closed.verified || !portClosed || !receipt.cleanup.workerExited)
      fail('closure-unverified');
    if (
      runtime &&
      closed.verified &&
      portClosed &&
      fileHash(helperFile) === helperHash &&
      runtimeRemovable(runtime, closed) &&
      remaining() > 2000
    ) {
      try {
        // Deletion is itself a registered helper, admitted only after tree/port closure.
        const remover = launch(
          path.join(__dirname, 'batch-allocation-native-probe.cjs'),
          ['--remove'],
          true,
          true,
        );
        remover.stdout.on('data', () => {});
        const removal = new Promise((resolve, reject) => {
          remover.once('error', reject);
          remover.once('close', (code) =>
            code === 0 ? resolve() : reject(Error('runtime_remove_failed')),
          );
        });
        let timer;
        const timedOut = new Promise((_, reject) => {
          timer = setTimeout(
            () => {
              signalOwned('SIGKILL');
              reject(Error('runtime_remove_timeout'));
            },
            Math.min(10000, Math.max(1, remaining() - 1000)),
          );
        });
        remover.send({
          runtime: {
            path: runtime.path,
            parent: runtime.parent,
            device: runtime.device,
            inode: runtime.inode,
            nonce: runtime.nonce,
          },
          helper: helperFile,
          helperHash,
        });
        try {
          await Promise.race([removal, timedOut]);
        } finally {
          clearTimeout(timer);
        }
        const finalClosure = registry.closure(snapshot());
        check(finalClosure.verified && !fs.existsSync(runtime.path), 'runtime_removal_unverified');
        receipt.cleanup = {
          ...finalClosure,
          workerExited: !worker || workerExit,
          portClosed,
          runtimeRetained: false,
        };
      } catch {
        fail('runtime-retained');
      }
    } else if (runtime) fail('runtime-retained');
    const finalProcessClosure = registry.closure(snapshot());
    receipt.cleanup.verified = receipt.cleanup.verified && finalProcessClosure.verified;
    receipt.cleanup.remainingOwnedPids = finalProcessClosure.remainingOwnedPids;
    receipt.cleanup.verified =
      receipt.cleanup.verified &&
      portClosed &&
      receipt.cleanup.workerExited &&
      !receipt.cleanup.runtimeRetained;
    receipt.ownership = registry.evidence();
    receipt.elapsedMs = budget.now() - budget.start;
    receipt.samples.maxProcessAgeMs = Math.max(
      receipt.samples.maxProcessAgeMs,
      budget.processAt === null ? 0 : budget.now() - budget.processAt,
    );
    receipt.samples.maxDiskAgeMs = Math.max(
      receipt.samples.maxDiskAgeMs,
      budget.diskAt === null ? 0 : budget.now() - budget.diskAt,
    );
    receipt.withinDeadline = receipt.elapsedMs <= LIMITS.wallMs;
    receipt.nativePass =
      budget.pass(receipt.cleanup.verified, publication) && failures.length === 0;
    try {
      assertReceipt(receipt);
      write('receipt.json', receipt, true);
    } catch {
      publication = false;
      receipt.nativePass = false;
      fail('receipt-publication-failed');
    }
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    clearTimeout(hardTimer);
    if (exitTimer) clearTimeout(exitTimer);
    process.stdout.write(
      JSON.stringify({
        nativePass: receipt.nativePass,
        receipt: output ? path.join(output, 'receipt.json') : null,
      }) + '\n',
    );
    process.exitCode = receipt.nativePass ? 0 : 1;
  }
  return receipt;
}
async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log(
      'node scripts/e2e/batch-allocation-native.cjs --expected-head SHA [--execute --output NEW_ABSOLUTE_DIRECTORY]\nDefault: read-only plan. One serial set: chromium/firefox/webkit x valid/missing-share/total-99/cancel. 900s total, 120s cleanup reserve; 4GiB RSS/12GiB admitted disk.',
    );
    return;
  }
  const options = parse(process.argv.slice(2));
  if (!options.execute) {
    console.log(JSON.stringify(plan(options), null, 2));
    return;
  }
  await execute(options);
  // Unknown identities are retained as failures; they cannot keep the supervisor
  // waiting beyond its envelope after its fixed receipt has been published.
  process.exit(process.exitCode || 0);
}
if (require.main === module)
  main().catch(() => {
    console.error('Batch allocation native admission failed.');
    process.exitCode = 1;
  });
module.exports = { parse, plan, assertReceipt, execute, recordObservedFailure };
