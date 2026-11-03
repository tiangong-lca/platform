'use strict';
const { spawnSync } = require('node:child_process');

const QUICK_READ_MS = 15_000;
const IMAGE_REMOVE_MS = 120_000;
const CONTAINER_REMOVE_MS = 30_000;
const CLEANUP_TOTAL_MS = 300_000;

function diagnostic(result) {
  return {
    status: Number.isInteger(result.status) ? result.status : null,
    signal: /^SIG[A-Z0-9]+$/u.test(result.signal ?? '') ? result.signal : null,
    errorCode: /^[A-Z0-9_]+$/u.test(result.error?.code ?? '') ? result.error.code : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function commandFailure(error) {
  const value = error.resourceDiagnostic ?? {};
  return {
    status: Number.isInteger(value.status) ? value.status : null,
    signal: /^SIG[A-Z0-9]+$/u.test(value.signal ?? '') ? value.signal : null,
    errorCode: /^[A-Z0-9_]{1,64}$/u.test(value.errorCode ?? '') ? value.errorCode : null,
    timedOut: value.timedOut === true,
  };
}

function resourceCommand(program, args, options = {}) {
  const { execute = spawnSync, ...settings } = options;
  const result = execute(program, args, {
    encoding: 'utf8',
    timeout: QUICK_READ_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 8 * 1024 * 1024,
    ...settings,
  });
  if (result.error || result.status !== 0) {
    const error = new Error('Resource command did not complete successfully.');
    error.code =
      result.error?.code === 'ETIMEDOUT' ? 'RESOURCE_COMMAND_TIMEOUT' : 'RESOURCE_COMMAND_FAILED';
    error.resourceDiagnostic = diagnostic(result);
    throw error;
  }
  return result.stdout;
}

module.exports = {
  QUICK_READ_MS,
  IMAGE_REMOVE_MS,
  CONTAINER_REMOVE_MS,
  CLEANUP_TOTAL_MS,
  resourceCommand,
  commandFailure,
};
