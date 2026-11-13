/**
 * Internal runtime types for the browser-side matrix calculation of life-cycle
 * models. These types are not persisted and do not extend the TIDAS, database,
 * or API schema. Everything crossing the Web Worker boundary must be plain
 * JSON-serializable data.
 *
 * zh-CN: 生命周期模型浏览器端矩阵计算的内部运行时类型。不持久化，不扩展 TIDAS/
 * 数据库/API schema；跨 Web Worker 边界的数据必须是可结构化克隆的纯数据。
 */

/**
 * zh-CN: 前端计算模块内部的错误分类（workspace #1072 第 9 节合同）。
 * en-US: Frontend calculation error categories (workspace #1072 section 9 contract).
 */
export type CalculationErrorCode =
  | 'EMPTY_MODEL'
  | 'INVALID_REFERENCE'
  | 'INVALID_TARGET_AMOUNT'
  | 'INVALID_REFERENCE_EXCHANGE'
  | 'MULTIPLE_PROVIDERS'
  | 'INVALID_CONNECTION'
  | 'INCOMPATIBLE_FLOW'
  | 'INVALID_EXCHANGE_AMOUNT'
  | 'INVALID_ALLOCATION'
  | 'MODEL_NOT_SOLVABLE'
  | 'NUMERIC_RESULT_INVALID'
  | 'NEGATIVE_ACTIVITY'
  | 'SOURCE_UNAVAILABLE'
  | 'LOCAL_LIMIT_EXCEEDED'
  | 'CALCULATION_FAILED';

/**
 * zh-CN: 单条可定位问题。定位信息独立于错误正文展示；名称缺失时由 UI 回退为
 * “节点 {index} / 流 {index}”。
 * en-US: One locatable issue. Location data is rendered separately from the
 * error body; the UI falls back to "Node {index} / Flow {index}" when names are
 * missing.
 */
export interface CalculationIssue {
  code: CalculationErrorCode;
  /** Why the product needs an explicit allocation before recalculation. */
  allocationReason?: 'MISSING_PRODUCT_ALLOCATION' | 'MISSING_REFERENCE_ALLOCATION';
  /** zh-CN: 过程实例内部 ID（@dataSetInternalID）。en-US: Process instance internal ID. */
  instanceIndex?: string;
  /** zh-CN: 画布节点 ID（运行期绑定，用于定位）。en-US: Canvas node id (run-bound, for locating). */
  nodeId?: string;
  /** zh-CN: 流 UUID。en-US: Flow UUID. */
  flowId?: string;
  /** zh-CN: 交换内部 ID。en-US: Exchange internal ID. */
  exchangeInternalId?: string;
  /** zh-CN: 连接边 ID（运行期绑定）。en-US: Connection edge id (run-bound). */
  edgeId?: string;
}

/**
 * zh-CN: 计算失败。code 为前端内部分类；issues 携带可定位信息；不携带库原始
 * 异常文本（避免把未翻译错误暴露给用户）。
 * en-US: Calculation failure. The code is a frontend-internal category; issues
 * carry location data; raw library exception text is never included.
 */
export class CalculationError extends Error {
  readonly code: CalculationErrorCode;
  readonly issues: CalculationIssue[];

  constructor(code: CalculationErrorCode, issues: CalculationIssue[] = []) {
    super(code);
    this.name = 'CalculationError';
    this.code = code;
    this.issues = issues;
  }
}

/**
 * zh-CN: 覆盖整个计算操作（源加载 → Worker 求解 → LCIA 组装）的取消标识。
 * 各阶段边界检查该标识；取消不是错误，UI 以状态文案提示。
 * en-US: A cancellation handle spanning the whole calculation operation
 * (source loading → worker solve → LCIA assembly). Stage boundaries check the
 * flag; cancellation is not an error and is surfaced as status copy.
 */
export class CalculationOperation {
  private cancelled = false;

  private stage: 'preparing' | 'source' | 'solving' | 'assembly' | 'persisting' | 'done' =
    'preparing';

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  /** zh-CN: 推进阶段标记，供 UI 区分取消时所在阶段。en-US: Advance the stage marker. */
  beginStage(stage: 'source' | 'solving' | 'assembly' | 'persisting' | 'done'): void {
    this.stage = stage;
  }

  get currentStage(): string {
    return this.stage;
  }
}

/**
 * zh-CN: 用户取消计算。取消不是错误：UI 以状态文案提示，不按失败处理。
 * en-US: The user cancelled the calculation. Cancellation is not an error: the
 * UI surfaces the status copy and does not treat it as a failure.
 */
export class CalculationCancelledError extends Error {
  constructor() {
    super('CALCULATION_CANCELLED');
    this.name = 'CalculationCancelledError';
  }
}

/** zh-CN: 交换方向。en-US: Exchange direction. */
export type ExchangeDirection = 'INPUT' | 'OUTPUT';

/**
 * zh-CN: 参与计算的交换（主线程从 exact Process 数据规整后传入）。
 * 数量取值优先级与 Worker 合同一致：resultingAmount → meanAmount → meanValue。
 * en-US: Exchange participating in the calculation (normalized on the main
 * thread from exact Process data). Amount precedence matches the Worker
 * contract: resultingAmount → meanAmount → meanValue.
 */
export interface MatrixExchangePayload {
  internalId: string;
  direction: ExchangeDirection;
  flowId: string;
  /** zh-CN: 数量已解析为有限数值（非有限值在主线程标记为 null）。en-US: Amount resolved to a finite number (non-finite marked as null on the main thread). */
  amount: number | null;
  /** zh-CN: 原始 allocations JSON，用于分配形态识别；未声明时为 undefined。en-US: Raw allocations JSON for allocation-shape detection; undefined when undeclared. */
  allocations?: unknown;
  /** zh-CN: 原始交换对象（落库模板）。en-US: Raw exchange object (persistence template). */
  raw?: unknown;
}

/**
 * zh-CN: exact Process 数据（主线程查询后传入）。
 * en-US: Exact Process data (queried on the main thread).
 */
export interface MatrixProcessPayload {
  id: string;
  version: string;
  exchanges: MatrixExchangePayload[];
  /** zh-CN: quantitativeReference.referenceToReferenceFlow。en-US: quantitativeReference.referenceToReferenceFlow. */
  refExchangeInternalId?: string;
}

/**
 * zh-CN: 展平后的输出连接（一条模型边）。
 * en-US: One flattened output connection (a model edge).
 */
export interface MatrixConnectionPayload {
  /** zh-CN: 上游实例内部 ID。en-US: Upstream instance internal ID. */
  upstreamIndex: string;
  /** zh-CN: 下游实例内部 ID。en-US: Downstream instance internal ID. */
  downstreamIndex: string;
  outputFlowId: string;
  inputFlowId: string;
  outputFlowVersion?: string;
  inputFlowVersion?: string;
  /** zh-CN: 运行期边标识，用于定位与边数值回写。en-US: Run-bound edge key for locating and edge amount write-back. */
  edgeId: string;
  /** zh-CN: 画布边 ID（如存在）。en-US: Canvas edge id when present. */
  canvasEdgeId?: string;
}

/**
 * zh-CN: 过程实例负载（画布实例身份 + exact Process 数据）。
 * en-US: Process instance payload (canvas instance identity + exact Process data).
 */
export interface MatrixInstancePayload {
  /** zh-CN: 画布实例内部 ID（@dataSetInternalID）。en-US: Canvas instance internal ID (@dataSetInternalID). */
  instanceIndex: string;
  /** zh-CN: 画布节点 ID。en-US: Canvas node id. */
  nodeId?: string;
  processId: string;
  processVersion: string;
  process: MatrixProcessPayload;
  connections: MatrixConnectionPayload[];
}

/**
 * zh-CN: 计算输入（跨线程负载）。
 * en-US: Calculation input (cross-thread payload).
 */
export interface MatrixCalculationPayload {
  refInstanceIndex: string;
  targetAmount: number;
  instances: MatrixInstancePayload[];
}

/**
 * zh-CN: 求解后的活动视图：一个实例的一个枢轴交换对应一列。
 * en-US: Solved activity view: one matrix column per instance pivot exchange.
 */
export interface SolvedView {
  instanceIndex: string;
  /** zh-CN: 枢轴交换内部 ID。en-US: Pivot exchange internal ID. */
  pivotExchangeId: string;
  /** zh-CN: 枢轴交换方向。en-US: Pivot exchange direction. */
  pivotDirection: ExchangeDirection;
  /** zh-CN: 枢轴流 UUID。en-US: Pivot flow UUID. */
  pivotFlowId: string;
  /** zh-CN: 求解活动量（枢轴流数量单位）。en-US: Solved activity in pivot-flow amount units. */
  activity: number;
  /** Product-specific source-inventory scale; not a common physical run count. */
  multiplier: number;
  /** zh-CN: 是否为参考视图。en-US: Whether this is the reference view. */
  isReference: boolean;
}

/**
 * zh-CN: 聚合后的结果交换（同一子模型内按 方向×流 汇总）。
 * en-US: Aggregated result exchange (summed by direction × flow inside one submodel).
 */
export interface MatrixResultExchange {
  direction: ExchangeDirection;
  flowId: string;
  amount: number;
  quantitativeReference: boolean;
  /** zh-CN: 用于落库的交换模板（首个贡献者的原始交换对象）。en-US: Exchange template for persistence (raw exchange of the first contributor). */
  template: MatrixExchangePayload;
}

/**
 * zh-CN: 一个子模型的聚合结果（主产品或其他产品的独立归因情景）。
 * en-US: One submodel aggregation (an independent attribution scenario for the primary or another product/service).
 */
export interface MatrixResultGroup {
  type: 'primary' | 'secondary';
  /** zh-CN: 组根视图。en-US: Root view of the group. */
  root: { instanceIndex: string; pivotExchangeId: string };
  /** zh-CN: 枢轴产品流。en-US: Pivot product flow. */
  pivotFlowId: string;
  pivotDirection: ExchangeDirection;
  exchanges: MatrixResultExchange[];
  /** zh-CN: 组内引用的过程 (id, version) 集合。en-US: Referenced process (id, version) pairs inside the group. */
  refProcesses: Array<{ id: string; version: string }>;
}

/**
 * zh-CN: 计算结果（主线程据其组装子模型、回写倍率与边数值）。
 * en-US: Calculation result (the main thread builds submodels, writes back multipliers and edge amounts).
 */
export interface MatrixCalculationResult {
  productSystem: import('./productSystem').ProductSystem;
  views: SolvedView[];
  /** zh-CN: 实例倍率（原始过程清单倍率）；仅包含有活动的实例。en-US: Instance multipliers (raw process inventory factors); only active instances. */
  instanceMultipliers: Record<string, number>;
  /** zh-CN: 每条连接的流动量，按 edgeId 索引。en-US: Flow amount per connection, keyed by edgeId. */
  edgeAmounts: Record<string, number>;
  /** zh-CN: 全部连接在成功求解下都是平衡的；保留字段以兼容边标签。en-US: All connections are balanced on a successful solve; kept for edge-label compatibility. */
  balancedEdgeIds: string[];
  groups: MatrixResultGroup[];
}

/** zh-CN: Worker 求成功响应。en-US: Worker success response. */
export interface MatrixWorkerSuccess {
  type: 'result';
  runId: string;
  ok: true;
  result: MatrixCalculationResult;
}

/** zh-CN: Worker 求失败响应。en-US: Worker failure response. */
export interface MatrixWorkerFailure {
  type: 'result';
  runId: string;
  ok: false;
  error: { code: CalculationErrorCode; issues: CalculationIssue[] };
}

export type MatrixWorkerResponse = MatrixWorkerSuccess | MatrixWorkerFailure;

/** zh-CN: Worker 请求。en-US: Worker request. */
export interface MatrixWorkerRequest {
  type: 'calculate';
  runId: string;
  payload: MatrixCalculationPayload;
}

/**
 * zh-CN: 求解配置容差。集中定义便于测试与 Worker/主线程一致。
 * en-US: Solver tolerances. Centralized so tests and the worker/main thread agree.
 */
export const CALCULATION_TOLERANCES = {
  /** zh-CN: 分配向量闭合容差（TIDAS Perc 三位小数）。en-US: Allocation vector closure tolerance (TIDAS Perc, three decimals). */
  allocationSum: 0.000_010_000_001,
  /** zh-CN: 残差与端口平衡的相对容差。en-US: Relative tolerance for residuals and port balances. */
  residual: 1e-6,
  /** zh-CN: 负活动量的判定容差（相对解的尺度）。en-US: Tolerance for flagging negative activity (relative to the solution scale). */
  negativeActivity: 1e-9,
  /** zh-CN: 视为零的活动量下限（相对解的尺度）。en-US: Activity magnitudes below this are zero (relative to the solution scale). */
  zeroActivity: 1e-12,
} as const;
