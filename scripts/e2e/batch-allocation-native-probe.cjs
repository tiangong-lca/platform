// Separate bounded accounting process: a cold filesystem walk cannot block RSS supervision.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  os = require('node:os');
const { performance } = require('node:perf_hooks');
const { check, deduplicateRoots } = require('./batch-allocation-native-policy.cjs');
const { Ownership, readSnapshot, runtimeRemovable } = require('./portal-native-resources.cjs');
const {
  inspectTuple,
  assertSummary,
  CONDITIONS,
} = require('./batch-allocation-native-singleton.cjs');
const STAGES = Object.freeze({
  root: ['resolution', 'root-limit'],
  traversal: ['read', 'entry-limit', 'entry-type', 'symlink-target', 'symlink-escape', 'deadline'],
  du: ['spawn', 'timeout', 'output-cap', 'exit', 'count', 'total'],
  ownership: ['missing-pid', 'capture', 'bind', 'closure'],
  capacity: ['read', 'value', 'memory', 'charged-disk', 'free-disk'],
  parse: ['json', 'result'],
  protocol: ['helper-failure', 'helper-result', 'phase-admission'],
  singleton: CONDITIONS,
});
const ROOT_KINDS = Object.freeze(['source', 'browser-cache', 'output', 'unknown']);
const ENTRY_KINDS = Object.freeze(['symlink', 'socket', 'file', 'directory', 'other', 'unknown']);
const ERRNOS = Object.freeze([
  'ENOENT',
  'EACCES',
  'EPERM',
  'ELOOP',
  'ENOTDIR',
  'EIO',
  'ENOSPC',
  'EMFILE',
  'ENFILE',
  'EINVAL',
  'ESRCH',
  'ETIMEDOUT',
  'unknown',
]);
const exact = (v, keys) =>
  v &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v)) &&
  Object.getOwnPropertySymbols(v).length === 0 &&
  Object.getOwnPropertyNames(v).length === keys.length &&
  keys.every((k) => {
    const d = Object.getOwnPropertyDescriptor(v, k);
    return d && d.enumerable && Object.hasOwn(d, 'value');
  });
function assertDiagnostic(value) {
  check(
    exact(value, ['stage', 'rootKind', 'entryKind', 'condition', 'errno', 'observations']) &&
      typeof value.stage === 'string' &&
      Object.hasOwn(STAGES, value.stage) &&
      STAGES[value.stage].includes(value.condition) &&
      ROOT_KINDS.includes(value.rootKind) &&
      ENTRY_KINDS.includes(value.entryKind) &&
      ERRNOS.includes(value.errno) &&
      exact(value.observations, ['availableMemoryBytes', 'freeDiskBytes', 'chargedDiskBytes']) &&
      Object.values(value.observations).every(
        (n) => n === null || (Number.isSafeInteger(n) && n >= 0),
      ),
    'resource_diagnostic_invalid',
  );
  return value;
}
function diagnostic(
  stage,
  condition,
  { rootKind = 'unknown', entryKind = 'unknown', error, observations = {} } = {},
) {
  let errno = 'unknown';
  try {
    const d = error && Object.getOwnPropertyDescriptor(error, 'code');
    if (d && Object.hasOwn(d, 'value') && ERRNOS.includes(d.value)) errno = d.value;
  } catch {}
  return assertDiagnostic({
    stage,
    rootKind,
    entryKind,
    condition,
    errno,
    observations: {
      availableMemoryBytes: null,
      freeDiskBytes: null,
      chargedDiskBytes: null,
      ...observations,
    },
  });
}
function diagnosticError(value) {
  return Object.assign(new Error('native_resource_unknown'), {
    resourceDiagnostic: assertDiagnostic(value),
  });
}
function assertProbeResult(value) {
  if (exact(value, ['status', 'diagnostic']) && value.status === 'unknown') {
    assertDiagnostic(value.diagnostic);
    return value;
  }
  check(
    exact(value, ['status', 'bytes', 'freeBytes', 'availableMemory', 'diagnostic', 'singleton']) &&
      value.status === 'ok' &&
      value.diagnostic === null &&
      ['bytes', 'freeBytes', 'availableMemory'].every(
        (k) => Number.isSafeInteger(value[k]) && value[k] >= 0,
      ),
    'resource_probe_result_invalid',
  );
  if (value.singleton !== null) assertSummary(value.singleton);
  return value;
}
function capacityDiagnostic(value) {
  assertProbeResult(value);
  check(value.status === 'ok', 'capacity_probe_invalid');
  const observations = {
    availableMemoryBytes: value.availableMemory,
    freeDiskBytes: value.freeBytes,
    chargedDiskBytes: value.bytes,
  };
  if (value.availableMemory < 4 * 1024 ** 3)
    return diagnostic('capacity', 'memory', { observations });
  if (value.bytes > 12 * 1024 ** 3) return diagnostic('capacity', 'charged-disk', { observations });
  if (value.freeBytes < 12 * 1024 ** 3 - value.bytes)
    return diagnostic('capacity', 'free-disk', { rootKind: 'output', observations });
  return null;
}
function decodeProbeResult(raw, code) {
  if (typeof raw !== 'string') throw diagnosticError(diagnostic('parse', 'result'));
  if (raw.length > 4096) throw diagnosticError(diagnostic('du', 'output-cap'));
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw diagnosticError(diagnostic('parse', 'json'));
  }
  try {
    assertProbeResult(value);
  } catch {
    throw diagnosticError(diagnostic('parse', 'result'));
  }
  if (value.status === 'unknown') throw diagnosticError(value.diagnostic);
  if (code !== 0) throw diagnosticError(diagnostic('protocol', 'helper-result'));
  const rejected = capacityDiagnostic(value);
  if (rejected) throw diagnosticError(rejected);
  return value;
}
async function disk(roots, writeRoot, remainingMs, injected = {}) {
  const io = injected.fs || fs,
    spawn = injected.spawn || cp.spawn,
    clock = injected.now || (() => performance.now()),
    inspect = injected.snapshot || readSnapshot,
    Owner = injected.Ownership || Ownership,
    freemem = injected.freemem || os.freemem,
    rootKinds = injected.rootKinds || [],
    started = clock();
  let rootKind = 'unknown',
    entryKind = 'unknown',
    total = 0,
    entries = 0,
    charged = null,
    free = null;
  const failure = (stage, condition, error) =>
    diagnosticError(
      diagnostic(stage, condition, {
        rootKind,
        entryKind,
        error,
        observations: {
          availableMemoryBytes: null,
          freeDiskBytes: free,
          chargedDiskBytes: charged,
        },
      }),
    );
  let tuple = null;
  const seenTuple = new Set();
  const singletonFailure = (error) => {
    const condition = CONDITIONS.includes(error?.singletonCondition)
      ? error.singletonCondition
      : 'binding';
    return diagnosticError(
      diagnostic('singleton', condition, {
        rootKind: 'output',
        entryKind: ENTRY_KINDS.includes(error?.entryKind) ? error.entryKind : 'unknown',
        error,
      }),
    );
  };
  if (injected.singletonBinding) {
    try {
      tuple = inspectTuple(injected.singletonBinding, {
        ...injected.singletonPorts,
        fs: io,
        snapshot: inspect,
      });
    } catch (error) {
      throw singletonFailure(error);
    }
  }
  let admitted;
  try {
    admitted = deduplicateRoots(roots, (p) => io.realpathSync(p));
  } catch (error) {
    throw failure('root', error?.code === 'disk_root_limit' ? 'root-limit' : 'resolution', error);
  }
  for (const root of admitted) {
    rootKind = ROOT_KINDS.includes(rootKinds[roots.indexOf(root)])
      ? rootKinds[roots.indexOf(root)]
      : 'unknown';
    entryKind = 'unknown';
    const accountRootKind = rootKind,
      rootStart = clock(),
      queue = [root];
    while (queue.length) {
      if (!(clock() - started < Math.min(15000, remainingMs) && clock() - rootStart < 5000))
        throw failure('traversal', 'deadline');
      const dir = queue.pop();
      rootKind =
        dir === writeRoot || dir.startsWith(writeRoot + path.sep) ? 'output' : accountRootKind;
      let children;
      try {
        children = io.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        entryKind = 'directory';
        throw failure('traversal', 'read', error);
      }
      for (const entry of children) {
        entryKind = entry.isSymbolicLink()
          ? 'symlink'
          : entry.isDirectory()
            ? 'directory'
            : entry.isFile()
              ? 'file'
              : entry.isSocket?.()
                ? 'socket'
                : 'other';
        if (++entries > 500000) throw failure('traversal', 'entry-limit');
        const file = path.join(dir, entry.name);
        rootKind =
          file === writeRoot || file.startsWith(writeRoot + path.sep) ? 'output' : accountRootKind;
        if (tuple?.entries.has(file)) {
          if (seenTuple.has(file))
            throw diagnosticError(
              diagnostic('singleton', 'count', { rootKind: 'output', entryKind }),
            );
          try {
            tuple.assertEntry(file);
          } catch (error) {
            throw singletonFailure(error);
          }
          seenTuple.add(file);
          continue;
        }
        if (tuple && file.startsWith(injected.singletonBinding.runtime.path + path.sep)) {
          if (entry.isSymbolicLink())
            throw diagnosticError(
              diagnostic('singleton', 'unknown-link', { rootKind: 'output', entryKind: 'symlink' }),
            );
          if (entry.isSocket?.())
            throw diagnosticError(
              diagnostic('singleton', 'unknown-socket', {
                rootKind: 'output',
                entryKind: 'socket',
              }),
            );
        }
        if (entry.isSymbolicLink()) {
          let target;
          try {
            target = io.realpathSync(file);
          } catch (error) {
            throw failure('traversal', 'symlink-target', error);
          }
          if (!admitted.some((p) => target === p || target.startsWith(p + path.sep)))
            throw failure('traversal', 'symlink-escape');
        } else if (entry.isDirectory()) queue.push(file);
        else if (!entry.isFile()) throw failure('traversal', 'entry-type');
      }
    }
    entryKind = 'unknown';
    const bytes = await new Promise((resolve, reject) => {
      let child, owners;
      try {
        child = spawn('/bin/sh', ['-c', 'read gate; exec du -sk "$1"', 'batch-disk', root], {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch (error) {
        reject(failure('du', 'spawn', error));
        return;
      }
      if (!Number.isSafeInteger(child.pid) || child.pid < 1) {
        reject(failure('ownership', 'missing-pid'));
        return;
      }
      try {
        owners = new Owner();
        owners.capture(child.pid, child);
      } catch (error) {
        reject(failure('ownership', 'capture', error));
        return;
      }
      if (!owners.bind(child.pid, inspect({ remainingMs: 1000 }))) {
        reject(failure('ownership', 'bind'));
        return;
      }
      let data = '',
        failed = false;
      const timer = setTimeout(
        () => {
          failed = true;
          const plan = owners.signalPlan(inspect({ remainingMs: 1000 }), 1000);
          if (plan.status === 'ok') for (const pid of plan.pids) process.kill(pid, 'SIGKILL');
          reject(failure('du', 'timeout'));
        },
        Math.min(
          Math.max(1, 5000 - (clock() - rootStart)),
          Math.max(1, remainingMs - (clock() - started)),
        ),
      );
      child.stdout.on('data', (value) => {
        data += value;
        if (data.length > 4096) {
          failed = true;
          reject(failure('du', 'output-cap'));
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        failed = true;
        reject(failure('du', 'spawn', error));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (failed) return;
        if (code !== 0) {
          reject(failure('du', 'exit'));
          return;
        }
        const match = /^([0-9]+)\s/u.exec(data.trim()),
          value = match && Number(match[1]) * 1024;
        if (!Number.isSafeInteger(value) || value < 0) {
          reject(failure('du', 'count'));
          return;
        }
        if (!owners.closure(inspect({ remainingMs: 1000 })).verified) {
          reject(failure('ownership', 'closure'));
          return;
        }
        resolve(value);
      });
      child.stdin.end('run\n');
    });
    total += bytes;
    if (!Number.isSafeInteger(total)) throw failure('du', 'total');
  }
  if (tuple) {
    if (seenTuple.size !== 5)
      throw diagnosticError(diagnostic('singleton', 'count', { rootKind: 'output' }));
    let final;
    try {
      final = inspectTuple(injected.singletonBinding, {
        ...injected.singletonPorts,
        fs: io,
        snapshot: inspect,
      });
    } catch (error) {
      throw singletonFailure(error);
    }
    if (final.summary.tupleDigest !== tuple.summary.tupleDigest)
      throw diagnosticError(diagnostic('singleton', 'race', { rootKind: 'output' }));
  }
  charged = total;
  rootKind = 'output';
  entryKind = 'unknown';
  let info;
  try {
    info = io.statfsSync(writeRoot);
  } catch (error) {
    throw failure('capacity', 'read', error);
  }
  free = info.bavail * info.bsize;
  if (!Number.isSafeInteger(free) || free < 0) {
    free = null;
    throw failure('capacity', 'value');
  }
  let available;
  try {
    available = freemem();
  } catch (error) {
    throw failure('capacity', 'read', error);
  }
  if (!Number.isSafeInteger(available) || available < 0) throw failure('capacity', 'value');
  return assertProbeResult({
    status: 'ok',
    bytes: total,
    freeBytes: free,
    availableMemory: available,
    diagnostic: null,
    singleton: tuple?.summary || null,
  });
}
if (require.main === module) {
  if (process.argv[2] === '--remove') {
    process.once('message', (input) => {
      try {
        check(runtimeRemovable(input.runtime, { verified: true }), 'runtime_identity_changed');
        check(
          require('./batch-allocation-native-source.cjs').fileHash(input.helper) ===
            input.helperHash,
          'helper_changed',
        );
        fs.rmSync(input.runtime.path, { recursive: true, force: false });
        check(!fs.existsSync(input.runtime.path), 'runtime_survivor');
        process.disconnect();
      } catch {
        process.exitCode = 1;
        if (process.connected) process.disconnect();
      }
    });
  } else {
    const input = JSON.parse(process.argv[2]);
    disk(input.roots, input.writeRoot, input.remainingMs, {
      rootKinds: input.rootKinds,
      singletonBinding: input.singletonBinding,
    })
      .then((value) => process.stdout.write(JSON.stringify(value)))
      .catch((error) => {
        let value;
        try {
          value = assertDiagnostic(error.resourceDiagnostic);
        } catch {
          value = diagnostic('protocol', 'helper-failure');
        }
        process.stdout.write(JSON.stringify({ status: 'unknown', diagnostic: value }));
        process.exitCode = 1;
      });
  }
}
module.exports = {
  disk,
  diagnostic,
  assertDiagnostic,
  assertProbeResult,
  capacityDiagnostic,
  decodeProbeResult,
};
