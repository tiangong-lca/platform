/**
 * Web Worker entry for the matrix calculation.
 *
 * zh-CN: 在浏览器本地线程执行 编译 → 求解 → 组装。输入输出均为可结构化克隆
 * 的纯数据；不访问 DOM、IndexedDB 或网络。取消通过终止线程实现。
 *
 * en-US: Runs compile → solve → assemble in a local browser thread. Inputs and
 * outputs are structured-cloneable plain data; no DOM, IndexedDB, or network
 * access. Cancellation is implemented by terminating the worker.
 */

import { assembleResult } from './assemble';
import { compileModel } from './compile';
import { solveCompiledSystem } from './solve';
import type {
  CalculationErrorCode,
  CalculationIssue,
  MatrixWorkerRequest,
  MatrixWorkerResponse,
} from './types';
import { CalculationError } from './types';
import { assertCalculationPayloadValid } from './validation';

/**
 * zh-CN: 纯计算入口；Worker 消息处理与主线程同步回退共用。
 * en-US: Pure computation entry shared by the worker message handler and the
 * main-thread synchronous fallback.
 */
export const runMatrixCalculation = (request: MatrixWorkerRequest): MatrixWorkerResponse => {
  try {
    assertCalculationPayloadValid(request.payload);
    const compilation = compileModel(request.payload);
    const { x } = solveCompiledSystem(compilation);
    const result = assembleResult(compilation, x, request.payload.primaryOnly);
    return { type: 'result', runId: request.runId, ok: true, result };
  } catch (error) {
    if (error instanceof CalculationError) {
      return {
        type: 'result',
        runId: request.runId,
        ok: false,
        error: { code: error.code, issues: error.issues as CalculationIssue[] },
      };
    }
    return {
      type: 'result',
      runId: request.runId,
      ok: false,
      error: { code: 'CALCULATION_FAILED' as CalculationErrorCode, issues: [] },
    };
  }
};

// 仅在 Worker 全局上下文中安装消息处理；主线程导入本模块（同步回退）时跳过。
const workerGlobalScopeCtor = (globalThis as { WorkerGlobalScope?: new () => unknown })
  .WorkerGlobalScope;
const isWorkerContext =
  typeof workerGlobalScopeCtor === 'function' &&
  typeof self !== 'undefined' &&
  self instanceof workerGlobalScopeCtor;

if (isWorkerContext) {
  const workerContext = self as unknown as {
    onmessage: ((event: MessageEvent<MatrixWorkerRequest>) => void) | null;
    postMessage: (message: MatrixWorkerResponse) => void;
  };
  workerContext.onmessage = (event: MessageEvent<MatrixWorkerRequest>) => {
    const request = event.data;
    if (!request || request.type !== 'calculate') return;
    workerContext.postMessage(runMatrixCalculation(request));
  };
}
