// Inert policy shared by the independent supervisor and its controlled worker.
const LIMITS = Object.freeze({
  wallMs: 900000,
  workMs: 780000,
  cleanupMs: 120000,
  rssBytes: 4 * 1024 ** 3,
  diskBytes: 12 * 1024 ** 3,
  caseMs: 120000,
  actionMs: 20000,
  navigationMs: 45000,
  expectMs: 45000,
  processAgeMs: 2000,
  diskAgeMs: 30000,
  diskProbeMs: 15000,
  cleanupStepMs: 10000,
});
const BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);
const CONTROLS = Object.freeze(['valid', 'missing-share', 'total-99', 'cancel']);
function check(value, code) {
  if (!value) throw Object.assign(new Error(code), { code });
}
class Budget {
  constructor(now = () => Number(process.hrtime.bigint() / 1000000n)) {
    this.now = now;
    this.start = now();
    this.workDeadline = this.start + LIMITS.workMs;
    this.deadline = this.start + LIMITS.wallMs;
    this.stopping = false;
    this.reason = null;
    this.processAt = null;
    this.diskAt = null;
    this.peakRss = 0;
    this.peakDisk = 0;
    this.cases = BROWSERS.flatMap((browser) =>
      CONTROLS.map((control) => ({ browser, control, outcome: 'not-run', reason: null })),
    );
  }
  remaining(cleanup = false) {
    return Math.max(0, (cleanup ? this.deadline : this.workDeadline) - this.now());
  }
  stop(code) {
    if (!this.stopping) {
      this.stopping = true;
      this.reason = code;
      for (const row of this.cases)
        if (row.outcome === 'running') Object.assign(row, { outcome: 'incomplete', reason: code });
    }
  }
  sample(kind, bytes, status = 'ok', observedAt = this.now()) {
    if (status !== 'ok' || !Number.isSafeInteger(bytes) || bytes < 0 || observedAt > this.now()) {
      this.stop(kind + '_unknown');
      return;
    }
    if (kind === 'process') {
      this.processAt = observedAt;
      this.peakRss = Math.max(this.peakRss, bytes);
      if (bytes > LIMITS.rssBytes) this.stop('rss_limit');
    } else if (kind === 'disk') {
      this.diskAt = observedAt;
      this.peakDisk = Math.max(this.peakDisk, bytes);
      if (bytes > LIMITS.diskBytes) this.stop('disk_limit');
    } else this.stop('monitor_unknown');
  }
  freshness() {
    if (this.now() >= this.workDeadline) this.stop('work_deadline');
    if (this.processAt === null || this.now() - this.processAt > LIMITS.processAgeMs)
      this.stop('process_stale');
    if (this.diskAt === null || this.now() - this.diskAt > LIMITS.diskAgeMs)
      this.stop('disk_stale');
    check(!this.stopping, this.reason || 'stopping');
  }
  begin(browser, control) {
    this.freshness();
    check(this.remaining() >= LIMITS.caseMs + 1000, 'case_budget');
    const row = this.cases.find((item) => item.outcome === 'not-run');
    check(
      row &&
        row.browser === browser &&
        row.control === control &&
        !this.cases.some((item) => item.outcome === 'running'),
      'serial_order',
    );
    row.outcome = 'running';
    this.activeAt = this.now();
    return row;
  }
  complete(browser, control, outcome) {
    const row = this.cases.find((item) => item.browser === browser && item.control === control);
    check(row?.outcome === 'running' && ['passed', 'failed'].includes(outcome), 'case_completion');
    row.outcome = outcome;
    this.activeAt = null;
  }
  pass(closure, publication = true) {
    return (
      !this.stopping &&
      publication &&
      closure === true &&
      this.remaining(true) > 0 &&
      this.cases.every((row) => row.outcome === 'passed') &&
      this.processAt !== null &&
      this.diskAt !== null &&
      this.now() - this.processAt <= LIMITS.processAgeMs &&
      this.now() - this.diskAt <= LIMITS.diskAgeMs
    );
  }
}
function deduplicateRoots(roots, realpath) {
  const paths = [...new Set(roots.map(realpath))].sort((a, b) => a.length - b.length);
  const admitted = paths.filter(
    (item, index) =>
      !paths
        .slice(0, index)
        .some((parent) => item === parent || item.startsWith(parent + require('node:path').sep)),
  );
  check(admitted.length <= 3, 'disk_root_limit');
  return admitted;
}
function capacity(availableMemory, totals, freeByRoot) {
  check(
    Number.isSafeInteger(availableMemory) && availableMemory >= LIMITS.rssBytes,
    'memory_capacity',
  );
  check(Number.isSafeInteger(totals) && totals >= 0 && totals <= LIMITS.diskBytes, 'disk_capacity');
  check(
    freeByRoot.length > 0 &&
      freeByRoot.every(
        (value) => Number.isSafeInteger(value) && value >= LIMITS.diskBytes - totals,
      ),
    'free_disk_capacity',
  );
}
async function independentCleanup(steps, remaining, timeout, fail) {
  for (const [name, close] of steps) {
    try {
      check(remaining() > 0, 'cleanup_deadline');
      await timeout(close, Math.min(LIMITS.cleanupStepMs, remaining()));
    } catch {
      fail(name);
    }
  }
}
module.exports = {
  LIMITS,
  BROWSERS,
  CONTROLS,
  Budget,
  check,
  capacity,
  deduplicateRoots,
  independentCleanup,
};
