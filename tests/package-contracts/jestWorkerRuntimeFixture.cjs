// Native installed fork proof; finite data only, no application imports or network.
const assert = require('node:assert/strict');
const path = require('node:path');
const { rootRequire, packageFromParent } = require('./auditPackageResolution.cjs');

function identity() {
  return {
    pid: process.pid,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    execArgv: process.execArgv,
  };
}

async function main() {
  const required = JSON.parse(process.argv[2]);
  assert(Array.isArray(required) && required.every((flag) => typeof flag === 'string'));
  const jest = packageFromParent({ require: rootRequire }, 'jest');
  const core = packageFromParent(jest, '@jest/core');
  const runner = packageFromParent(core, 'jest-runner');
  const installed = packageFromParent(runner, 'jest-worker');
  assert.equal(runner.manifest.version, '30.5.0');
  assert.equal(installed.manifest.version, '30.5.0');
  const { Worker } = installed.require(path.join(installed.directory, 'build/index.js'));
  const pool = new Worker(__filename, {
    numWorkers: 2,
    enableWorkerThreads: false,
    idleMemoryLimit: 512 * 1024 * 1024,
    forkOptions: { serialization: 'json', stdio: 'pipe' },
    exposedMethods: ['identity'],
  });
  pool.getStdout().resume();
  pool.getStderr().resume();
  let children = [];
  let ended;
  let failure;
  let missingFlags = [];
  try {
    children = await Promise.all([pool.identity(), pool.identity()]);
    assert.equal(new Set(children.map((child) => child.pid)).size, 2);
    missingFlags = required.filter((flag) =>
      children.some((child) => !child.execArgv.includes(flag)),
    );
    assert.equal(
      missingFlags.length,
      0,
      'missing required worker flags: ' + missingFlags.join(','),
    );
  } catch (error) {
    failure = error.message;
  } finally {
    ended = await pool.end();
  }
  let childrenClosed = children.length === 2;
  for (const child of children) {
    try {
      process.kill(child.pid, 0);
      childrenClosed = false;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  if (!childrenClosed || ended.forceExited) failure = 'owned worker pool did not close normally';
  console.log(
    JSON.stringify({
      jestRunner: runner.manifest.version,
      jestWorker: installed.manifest.version,
      parent: identity(),
      children,
      forceExited: ended.forceExited,
      childrenClosed,
      missingFlags,
    }),
  );
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
}

module.exports = { identity };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
