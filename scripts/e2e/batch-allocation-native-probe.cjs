// Separate bounded accounting process: a cold filesystem walk cannot block RSS supervision.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  os = require('node:os');
const { performance } = require('node:perf_hooks');
const { check, deduplicateRoots } = require('./batch-allocation-native-policy.cjs');
const { Ownership, readSnapshot, runtimeRemovable } = require('./portal-native-resources.cjs');
async function disk(roots, writeRoot, remainingMs) {
  const started = performance.now(),
    admitted = deduplicateRoots(roots, (p) => fs.realpathSync(p));
  let entries = 0,
    total = 0;
  for (const root of admitted) {
    const rootStart = performance.now();
    const queue = [root];
    while (queue.length) {
      check(
        performance.now() - started < Math.min(15000, remainingMs) &&
          performance.now() - rootStart < 5000,
        'disk_probe_timeout',
      );
      const dir = queue.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        check(++entries <= 500000, 'disk_entry_limit');
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          const target = fs.realpathSync(file);
          check(
            admitted.some((p) => target === p || target.startsWith(p + path.sep)),
            'unadmitted_disk_symlink',
          );
        } else if (entry.isDirectory()) queue.push(file);
        else check(entry.isFile(), 'nonregular_disk_input');
      }
    }
    const bytes = await new Promise((resolve, reject) => {
      // Gate the same PID before exec so even a tiny output-root probe is bound
      // before its command can finish. The path is an argument, never shell code.
      const child = cp.spawn('/bin/sh', ['-c', 'read gate; exec du -sk "$1"', 'batch-disk', root], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const owners = new Ownership();
      owners.capture(child.pid, child);
      if (!owners.bind(child.pid, readSnapshot({ remainingMs: 1000 }))) {
        child.once('close', () => reject(Error('disk_owner_unknown')));
        return;
      }
      let data = '',
        failed = false;
      const timer = setTimeout(
        () => {
          failed = true;
          const plan = owners.signalPlan(readSnapshot({ remainingMs: 1000 }), 1000);
          if (plan.status === 'ok') for (const pid of plan.pids) process.kill(pid, 'SIGKILL');
          reject(Error('disk_root_timeout'));
        },
        Math.min(
          Math.max(1, 5000 - (performance.now() - rootStart)),
          Math.max(1, remainingMs - (performance.now() - started)),
        ),
      );
      child.stdout.on('data', (value) => {
        data += value;
        if (data.length > 4096) {
          failed = true;
          reject(Error('disk_output_limit'));
        }
      });
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timer);
        if (failed) return;
        const match = /^([0-9]+)\s/u.exec(data.trim());
        const value = match && Number(match[1]) * 1024;
        if (
          code !== 0 ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          !owners.closure(readSnapshot({ remainingMs: 1000 })).verified
        )
          reject(Error('disk_accounting_unknown'));
        else resolve(value);
      });
      child.stdin.end('run\n');
    });
    total += bytes;
    check(Number.isSafeInteger(total), 'disk_total_invalid');
  }
  const info = fs.statfsSync(writeRoot);
  const free = info.bavail * info.bsize;
  check(Number.isSafeInteger(free) && free >= 0, 'free_disk_unknown');
  return {
    roots: admitted,
    bytes: total,
    freeBytes: free,
    availableMemory: os.freemem(),
    status: 'ok',
  };
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
    disk(input.roots, input.writeRoot, input.remainingMs)
      .then((value) => process.stdout.write(JSON.stringify(value)))
      .catch(() => {
        process.stdout.write(JSON.stringify({ status: 'unknown' }));
        process.exitCode = 1;
      });
  }
}
module.exports = { disk };
