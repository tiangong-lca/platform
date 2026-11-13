/**
 * Compile product/service activities and their attributed supply requirements.
 * Every process reference, connected output and declared allocation target has
 * a view. Only the model's primary reference receives final demand here; other
 * product results are solved independently during assembly.
 */

import { ALLOCATION_PERCENT_TOLERANCE } from '@/services/processes/allocation';
import type {
  CalculationIssue,
  ExchangeDirection,
  MatrixConnectionPayload,
  MatrixExchangePayload,
  MatrixInstancePayload,
  MatrixProcessPayload,
} from './types';
import { CalculationError } from './types';

/** zh-CN: 分配形态。en-US: Allocation shape. */
export type AllocationShape = 'single' | 'legacy' | 'standard';

interface ParsedAllocation {
  kind: 'none' | 'legacyShare' | 'targeted' | 'invalid';
  /** zh-CN: legacyShare 的份额。en-US: Fraction for legacyShare. */
  fraction?: number;
  /** zh-CN: targeted 的目标份额表。en-US: Target fraction table for targeted. */
  fractions?: Map<string, number>;
}

const PERC_DENOMINATOR = 100;

/**
 * zh-CN: 解析 TIDAS Perc 份额（百分数 ÷ 100）。Next 旧式数据的字符串形态带
 * 百分号后缀（如 '60%'），为保持旧模型可读取而兼容；数值形态不带百分号。
 * en-US: Parse a TIDAS Perc fraction (percentage ÷ 100). Next's legacy string
 * form carries a trailing percent sign (e.g. '60%'), tolerated for backward
 * compatibility; numeric forms carry no percent sign.
 */
const parsePercFraction = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value / PERC_DENOMINATOR;
  }
  if (typeof value === 'string') {
    let trimmed = value.trim();
    if (trimmed === '') return undefined;
    if (trimmed.endsWith('%')) {
      trimmed = trimmed.slice(0, -1).trim();
    }
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed / PERC_DENOMINATOR;
  }
  return undefined;
};

const fractionSum = (fractions: Iterable<number>): number => {
  let sum = 0;
  for (const fraction of fractions) sum += fraction;
  return sum;
};

/**
 * zh-CN: 解析单个交换的 allocations 声明。形态规则：
 *  - 缺失字段或空对象 → none（未声明）；
 *  - 对象或单条目、无 @internalReferenceToCoProduct → legacyShare（旧式份额）；
 *  - 条目带 @internalReferenceToCoProduct → targeted（标准目标分配）；
 *  - 混合带/无目标的多条目、缺失或越界份额、未知目标 → invalid。
 *
 * en-US: Parse one exchange's allocations declaration. Shape rules listed above.
 */
export const parseExchangeAllocation = (
  exchange: MatrixExchangePayload,
  validExchangeIds: ReadonlySet<string>,
): ParsedAllocation => {
  const allocations = exchange.allocations as { allocation?: unknown } | undefined;
  if (!allocations || typeof allocations !== 'object') {
    return { kind: 'none' };
  }
  const allocation = allocations.allocation;
  if (allocation === undefined || allocation === null) {
    return { kind: 'none' };
  }

  const asObject = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

  if (Array.isArray(allocation)) {
    if (allocation.length === 0) return { kind: 'invalid' };
    const entries = allocation
      .map(asObject)
      .filter((entry): entry is Record<string, unknown> => !!entry);
    if (entries.length !== allocation.length) return { kind: 'invalid' };

    const hasTarget = entries.some((entry) => {
      const target = entry['@internalReferenceToCoProduct'];
      return typeof target === 'string' && target.trim() !== '';
    });
    const missingTarget = entries.some((entry) => {
      const target = entry['@internalReferenceToCoProduct'];
      return !(typeof target === 'string' && target.trim() !== '');
    });

    if (entries.length === 1 && !hasTarget) {
      const fraction = parsePercFraction(entries[0]['@allocatedFraction']);
      if (fraction === undefined) return { kind: 'invalid' };
      return { kind: 'legacyShare', fraction };
    }

    if (missingTarget) return { kind: 'invalid' };

    const fractions = new Map<string, number>();
    for (const entry of entries) {
      const target = String(entry['@internalReferenceToCoProduct']).trim();
      if (!validExchangeIds.has(target) || fractions.has(target)) return { kind: 'invalid' };
      const fraction = parsePercFraction(entry['@allocatedFraction']);
      if (fraction === undefined || fraction < 0 || fraction > 1) return { kind: 'invalid' };
      fractions.set(target, fraction);
    }
    return { kind: 'targeted', fractions };
  }

  const objectEntry = asObject(allocation);
  if (!objectEntry) return { kind: 'invalid' };
  if (Object.keys(objectEntry).length === 0) return { kind: 'none' };

  const target = objectEntry['@internalReferenceToCoProduct'];
  if (typeof target === 'string' && target.trim() !== '') {
    const trimmed = target.trim();
    if (!validExchangeIds.has(trimmed)) return { kind: 'invalid' };
    const fraction = parsePercFraction(objectEntry['@allocatedFraction']);
    if (fraction === undefined || fraction < 0 || fraction > 1) return { kind: 'invalid' };
    return { kind: 'targeted', fractions: new Map([[trimmed, fraction]]) };
  }

  const fraction = parsePercFraction(objectEntry['@allocatedFraction']);
  if (fraction === undefined) return { kind: 'invalid' };
  return { kind: 'legacyShare', fraction };
};

interface CompiledExchange {
  payload: MatrixExchangePayload;
  allocation: ParsedAllocation;
}

/**
 * zh-CN: 编译后的实例（含分配形态与交换解析结果）。
 * en-US: Compiled instance (with allocation shape and parsed exchanges).
 */
export interface CompiledInstance {
  instanceIndex: string;
  nodeId?: string;
  processId: string;
  processVersion: string;
  process: MatrixProcessPayload;
  exchanges: CompiledExchange[];
  exchangeById: Map<string, CompiledExchange>;
  outputExchangeIds: string[];
  refExchangeId?: string;
  allocationShape: AllocationShape;
  /** zh-CN: 声明为分配目标的输出交换（联产品）；未声明者为普通产出交换。en-US: Output exchanges declared as allocation targets (co-products); undeclared ones are ordinary output exchanges. */
  allocationTargetIds: Set<string>;
  /** zh-CN: 已连接输出的流 UUID 集合。en-US: Flow UUIDs of connected output exchanges. */
  connectedOutputFlowIds: Set<string>;
  /** zh-CN: 本实例相关的全部连接（入边+出边）。en-US: All connections touching this instance. */
  connections: MatrixConnectionPayload[];
  /** zh-CN: 出边（本实例的输出连接）。en-US: Outgoing connections. */
  outgoing: MatrixConnectionPayload[];
  /** zh-CN: 入边按输入流分组。en-US: Incoming connections grouped by input flow. */
  incomingByInputFlow: Map<string, MatrixConnectionPayload[]>;
}

/**
 * zh-CN: 活动视图（矩阵变量）。
 * en-US: Active view (matrix variable).
 */
export interface CompiledView {
  id: string;
  instanceIndex: string;
  pivotExchangeId: string;
  pivotDirection: ExchangeDirection;
  pivotFlowId: string;
  pivotAmount: number;
  isReference: boolean;
  isDeadEnd: boolean;
  rowKind: 'anchor' | 'production';
  columnIndex: number;
}

export interface CompiledEdge {
  connection: MatrixConnectionPayload;
  /** zh-CN: 供应视图 ID。en-US: Supplier view id. */
  supplierViewId: string;
  /** zh-CN: 消费侧归属系数，按消费实例的每个活动视图列出。en-US: Consumer-side attribution per active view of the consumer instance. */
  consumptions: Array<{ viewId: string; amount: number }>;
  /** zh-CN: 是否进入系统矩阵（供应行）。en-US: Whether the balance enters the system matrix (supplier row). */
  inSystem: boolean;
}

export interface Compilation {
  instances: CompiledInstance[];
  instanceByIndex: Map<string, CompiledInstance>;
  views: CompiledView[];
  viewById: Map<string, CompiledView>;
  /** zh-CN: 每个实例的主视图 ID。en-US: Primary view id per instance. */
  primaryViewIdByInstance: Map<string, string>;
  edges: CompiledEdge[];
  /** zh-CN: 稀疏 A 条目（行/列/值），M = I - A。en-US: Sparse A entries (row/col/value), M = I - A. */
  entries: Array<{ row: number; col: number; value: number }>;
  /** zh-CN: 需求向量 y。en-US: Demand vector y. */
  demand: number[];
  /** zh-CN: 各视图归属系数（不含枢轴；枢轴恒为 1）。en-US: Attribution fractions per view (pivot excluded; pivot is always 1). */
  fractionsByView: Map<string, Map<string, number>>;
  refViewId: string;
}

const viewId = (instanceIndex: string, exchangeInternalId: string): string =>
  `${instanceIndex}::${exchangeInternalId}`;

/**
 * zh-CN: 解析视图 v 对交换 e 的归属系数（不含枢轴；枢轴恒为 1）。
 * en-US: Resolve view v's attribution fraction for exchange e (pivot excluded; pivot is 1).
 */
export const resolveFraction = (
  instance: CompiledInstance,
  view: CompiledView,
  exchange: CompiledExchange,
): number => {
  if (instance.allocationShape === 'single') {
    return 1;
  }
  if (instance.allocationShape === 'legacy') {
    const pivotExchange = instance.exchangeById.get(view.pivotExchangeId);
    if (pivotExchange?.allocation.kind === 'legacyShare') return pivotExchange.allocation.fraction!;
    // Closed legacy shares give an undeclared non-reference product zero burden.
    // Input quantitative references represent the treatment service itself.
    return view.pivotExchangeId === instance.refExchangeId ? 1 : 0;
  }
  // standard：按目标产品选择该交换的分配项；未声明分配的交换整体归属于
  // 实例自己的定量参考视图（与 Worker 合同一致），其余视图为稀疏零。
  if (exchange.allocation.kind === 'targeted') {
    return exchange.allocation.fractions?.get(view.pivotExchangeId) ?? 0;
  }
  return view.pivotExchangeId === instance.refExchangeId ? 1 : 0;
};

/**
 * zh-CN: 视图 v 每单位活动对流 f 的归属消费量（用于矩阵与边流量）。
 * en-US: View v's attributed consumption of flow f per unit activity (matrix and edge flows).
 */
export const resolveConsumption = (
  instance: CompiledInstance,
  view: CompiledView,
  inputFlowId: string,
): number => {
  const exchange = instance.exchanges.find(
    (candidate) =>
      candidate.payload.direction === 'INPUT' && candidate.payload.flowId === inputFlowId,
  );
  if (!exchange) return 0;
  if (exchange.payload.internalId === view.pivotExchangeId) return 1;
  const amount = exchange.payload.amount ?? 0;
  const fraction = resolveFraction(instance, view, exchange);
  return (amount * fraction) / view.pivotAmount;
};

/**
 * zh-CN: 编译模型。结构校验已由 validation 完成；这里发现分配或数量问题时抛出
 * CalculationError（携带定位）。
 * en-US: Compile the model. Structural validation has already run; allocation or
 * amount problems discovered here throw CalculationError with locations.
 */
export const compileModel = (payload: {
  refInstanceIndex: string;
  targetAmount: number;
  instances: Array<
    Pick<
      MatrixInstancePayload,
      'instanceIndex' | 'nodeId' | 'processId' | 'processVersion' | 'process' | 'connections'
    >
  >;
}): Compilation => {
  const issues: CalculationIssue[] = [];
  const fail = (): never => {
    throw new CalculationError(issues[0]!.code, issues);
  };

  // 1) 解析实例、分配形态
  const instances: CompiledInstance[] = payload.instances.map((instance) => {
    const validExchangeIds = new Set(
      instance.process.exchanges.map((exchange) => exchange.internalId),
    );
    const exchanges: CompiledExchange[] = instance.process.exchanges.map((exchange) => ({
      payload: exchange,
      allocation: parseExchangeAllocation(exchange, validExchangeIds),
    }));
    const exchangeById = new Map(
      exchanges.map((exchange) => [exchange.payload.internalId, exchange]),
    );
    const outputExchangeIds = instance.process.exchanges
      .filter((exchange) => exchange.direction === 'OUTPUT')
      .map((exchange) => exchange.internalId);

    let hasTargeted = false;
    let hasLegacy = false;
    let hasInvalidAllocation = false;
    for (const exchange of exchanges) {
      if (exchange.allocation.kind === 'targeted') hasTargeted = true;
      if (exchange.allocation.kind === 'legacyShare') hasLegacy = true;
      if (exchange.allocation.kind === 'invalid') hasInvalidAllocation = true;
    }

    let allocationShape: AllocationShape;
    if (hasInvalidAllocation || (hasTargeted && hasLegacy)) {
      allocationShape = 'standard';
      hasInvalidAllocation = true;
    } else if (hasTargeted) {
      allocationShape = 'standard';
    } else if (hasLegacy) {
      allocationShape = 'legacy';
    } else {
      // 未声明任何分配时采用参考默认语义：全部负荷归属参考视图，
      // 其余输出为普通产出交换（如排放），不要求分配份额。
      allocationShape = 'single';
    }

    if (hasInvalidAllocation) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        instanceIndex: instance.instanceIndex,
        nodeId: instance.nodeId,
        exchangeInternalId: exchanges.find((exchange) => exchange.allocation.kind === 'invalid')
          ?.payload.internalId,
      });
    }

    const allocationTargetIds = new Set<string>();
    if (allocationShape === 'legacy') {
      for (const exchangeId of outputExchangeIds) {
        const exchange = exchangeById.get(exchangeId);
        // 无流引用的退化交换不构成可链接产品
        if (exchange?.allocation.kind === 'legacyShare' && exchange.payload.flowId) {
          allocationTargetIds.add(exchangeId);
        }
      }
    } else if (allocationShape === 'standard') {
      for (const exchange of exchanges) {
        if (exchange.allocation.kind !== 'targeted' || !exchange.payload.flowId) continue;
        for (const target of exchange.allocation.fractions!.keys()) {
          const targetExchange = exchangeById.get(target);
          if (targetExchange?.payload.direction === 'OUTPUT') allocationTargetIds.add(target);
        }
      }
    }

    return {
      instanceIndex: instance.instanceIndex,
      nodeId: instance.nodeId,
      processId: instance.processId,
      processVersion: instance.processVersion,
      process: instance.process,
      exchanges,
      exchangeById,
      outputExchangeIds,
      refExchangeId: instance.process.refExchangeInternalId,
      allocationShape,
      allocationTargetIds,
      connectedOutputFlowIds: new Set<string>(),
      connections: instance.connections,
      outgoing: [],
      incomingByInputFlow: new Map<string, MatrixConnectionPayload[]>(),
    };
  });

  // 连接负载挂在两侧实例上（负载构建只挂在上游），这里以边 ID 全局去重汇总
  const allConnections: MatrixConnectionPayload[] = [];
  const seenConnectionIds = new Set<string>();
  for (const instance of instances) {
    for (const connection of instance.connections) {
      if (seenConnectionIds.has(connection.edgeId)) continue;
      seenConnectionIds.add(connection.edgeId);
      allConnections.push(connection);
    }
  }

  for (const instance of instances) {
    for (const connection of allConnections) {
      if (connection.upstreamIndex === instance.instanceIndex) {
        instance.outgoing.push(connection);
        instance.connectedOutputFlowIds.add(connection.outputFlowId);
      }
      if (connection.downstreamIndex === instance.instanceIndex) {
        const list = instance.incomingByInputFlow.get(connection.inputFlowId) ?? [];
        list.push(connection);
        instance.incomingByInputFlow.set(connection.inputFlowId, list);
      }
    }
  }

  if (issues.length > 0) fail();

  const instanceByIndex = new Map(instances.map((instance) => [instance.instanceIndex, instance]));

  // 2) legacy 形态校验：已声明产品份额闭合；输入不得带份额
  for (const instance of instances) {
    if (instance.allocationShape !== 'legacy') continue;
    if (instance.outputExchangeIds.length <= 1) continue;

    // 仅声明为分配目标的输出构成分配向量；未声明输出（如排放）是普通交换，
    // 按各视图份额归属，不要求份额。
    let shareSum = 0;
    for (const exchangeId of instance.outputExchangeIds) {
      const exchange = instance.exchangeById.get(exchangeId);
      if (exchange?.allocation.kind === 'legacyShare') {
        shareSum += exchange.allocation.fraction!;
      }
    }
    if (Math.abs(shareSum - 1) > ALLOCATION_PERCENT_TOLERANCE / PERC_DENOMINATOR) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        instanceIndex: instance.instanceIndex,
        nodeId: instance.nodeId,
      });
    }
    for (const exchange of instance.exchanges) {
      if (
        exchange.payload.direction === 'INPUT' &&
        (exchange.allocation.kind === 'legacyShare' || exchange.allocation.kind === 'targeted')
      ) {
        issues.push({
          code: 'INVALID_ALLOCATION',
          instanceIndex: instance.instanceIndex,
          nodeId: instance.nodeId,
          exchangeInternalId: exchange.payload.internalId,
        });
      }
    }
  }

  // 3) standard 形态校验：每个目标向量闭合为 100%
  for (const instance of instances) {
    if (instance.allocationShape !== 'standard') continue;
    for (const exchange of instance.exchanges) {
      if (exchange.allocation.kind !== 'targeted') continue;
      const sum = fractionSum(exchange.allocation.fractions!.values());
      if (Math.abs(sum - 1) > ALLOCATION_PERCENT_TOLERANCE / PERC_DENOMINATOR) {
        issues.push({
          code: 'INVALID_ALLOCATION',
          instanceIndex: instance.instanceIndex,
          nodeId: instance.nodeId,
          exchangeInternalId: exchange.payload.internalId,
        });
      }
    }
  }

  if (issues.length > 0) fail();

  // 4) 建立活动视图
  const views: CompiledView[] = [];
  const viewById = new Map<string, CompiledView>();
  const supplierViewIdByEdgeId = new Map<string, string>();
  const addView = (
    instance: CompiledInstance,
    pivotExchangeId: string,
    options: { isReference: boolean; isDeadEnd: boolean },
  ): CompiledView => {
    const pivot = instance.exchangeById.get(pivotExchangeId);
    if (!pivot) {
      issues.push({
        code: 'INVALID_CONNECTION',
        instanceIndex: instance.instanceIndex,
        nodeId: instance.nodeId,
        exchangeInternalId: pivotExchangeId,
      });
      return undefined as unknown as CompiledView;
    }
    const pivotAmount = Math.abs(pivot.payload.amount ?? 0);
    if (!pivotAmount || pivot.payload.amount === null) {
      issues.push({
        code: 'INVALID_EXCHANGE_AMOUNT',
        instanceIndex: instance.instanceIndex,
        nodeId: instance.nodeId,
        flowId: pivot.payload.flowId,
        exchangeInternalId: pivot.payload.internalId,
      });
    }
    const existing = viewById.get(viewId(instance.instanceIndex, pivotExchangeId));
    if (existing) return existing;
    const view: CompiledView = {
      id: viewId(instance.instanceIndex, pivotExchangeId),
      instanceIndex: instance.instanceIndex,
      pivotExchangeId,
      pivotDirection: pivot.payload.direction,
      pivotFlowId: pivot.payload.flowId,
      pivotAmount,
      isReference: options.isReference,
      isDeadEnd: options.isDeadEnd,
      rowKind: options.isReference ? 'anchor' : 'production',
      columnIndex: views.length,
    };
    views.push(view);
    viewById.set(view.id, view);
    return view;
  };

  const refInstance = instanceByIndex.get(payload.refInstanceIndex);
  if (!refInstance || !refInstance.refExchangeId) {
    issues.push({
      code: 'INVALID_REFERENCE',
      instanceIndex: payload.refInstanceIndex,
      nodeId: refInstance?.nodeId,
    });
    throw new CalculationError(issues[0]!.code, issues);
  }
  const refExchangeId: string = refInstance.refExchangeId;
  const refView = addView(refInstance, refExchangeId, {
    isReference: true,
    isDeadEnd: false,
  });

  for (const instance of instances) {
    for (const connection of instance.outgoing) {
      const outputExchange = instance.exchanges.find(
        (exchange) =>
          exchange.payload.direction === 'OUTPUT' &&
          exchange.payload.flowId === connection.outputFlowId,
      );
      if (!outputExchange) {
        issues.push({
          code: 'INVALID_CONNECTION',
          instanceIndex: instance.instanceIndex,
          nodeId: instance.nodeId,
          flowId: connection.outputFlowId,
          edgeId: connection.edgeId,
        });
        continue;
      }
      const createdView = addView(instance, outputExchange.payload.internalId, {
        isReference: false,
        isDeadEnd: false,
      });
      supplierViewIdByEdgeId.set(connection.edgeId, createdView.id);
    }
    // Declared coproducts remain independently calculable with or without a consumer.
    for (const exchangeId of instance.allocationTargetIds) {
      if (viewById.has(viewId(instance.instanceIndex, exchangeId))) continue;
      addView(instance, exchangeId, {
        isReference: false,
        isDeadEnd: false,
      });
    }
  }

  // Every source reference is a result target, including intermediate products,
  // standalone processes and input-reference treatment services.
  for (const instance of instances) {
    if (instance.instanceIndex === payload.refInstanceIndex) continue;
    const hasIncoming = allConnections.some(
      (connection) => connection.downstreamIndex === instance.instanceIndex,
    );
    const hasOutgoing = instance.outgoing.length > 0;
    if (instance.refExchangeId) {
      addView(instance, instance.refExchangeId, {
        isReference: false,
        isDeadEnd: hasIncoming && !hasOutgoing,
      });
    }
  }

  if (issues.length > 0) fail();

  // Retain a source-instance identity for its reference product; every product
  // has its own demand equation.
  const primaryViewIdByInstance = new Map<string, string>();
  for (const instance of instances) {
    const instanceViews = views.filter((view) => view.instanceIndex === instance.instanceIndex);
    const primary =
      instanceViews.find((view) => view.pivotExchangeId === instance.refExchangeId) ??
      instanceViews[0];
    if (primary) primaryViewIdByInstance.set(instance.instanceIndex, primary.id);
    for (const view of instanceViews) {
      // Standard vectors are exchange-local: a product omitted from a closed
      // vector receives zero, even when omitted from every declared vector.
      if (
        (instance.allocationShape === 'single' &&
          view.pivotExchangeId !== instance.refExchangeId) ||
        (instance.allocationShape === 'legacy' &&
          view.pivotDirection === 'OUTPUT' &&
          view.pivotExchangeId === instance.refExchangeId &&
          !instance.allocationTargetIds.has(view.pivotExchangeId))
      ) {
        issues.push({
          code: 'INVALID_ALLOCATION',
          allocationReason:
            instance.allocationShape === 'single'
              ? 'MISSING_PRODUCT_ALLOCATION'
              : 'MISSING_REFERENCE_ALLOCATION',
          instanceIndex: instance.instanceIndex,
          nodeId: instance.nodeId,
          flowId: view.pivotFlowId,
          exchangeInternalId: view.pivotExchangeId,
        });
      }
    }
  }
  if (issues.length > 0) fail();

  // 6) 归属系数表
  const fractionsByView = new Map<string, Map<string, number>>();
  for (const view of views) {
    const instance = instanceByIndex.get(view.instanceIndex)!;
    const fractions = new Map<string, number>();
    for (const exchange of instance.exchanges) {
      if (exchange.payload.internalId === view.pivotExchangeId) continue;
      fractions.set(exchange.payload.internalId, resolveFraction(instance, view, exchange));
    }
    fractionsByView.set(view.id, fractions);
  }

  // 7) 边与矩阵条目
  const edges: CompiledEdge[] = [];
  const entryMap = new Map<string, number>();
  const addEntry = (row: number, col: number, value: number) => {
    const key = `${row}\u0000${col}`;
    entryMap.set(key, (entryMap.get(key) ?? 0) + value);
  };

  for (const connection of allConnections) {
    {
      const instance = instanceByIndex.get(connection.downstreamIndex)!;
      const upstreamInstance = instanceByIndex.get(connection.upstreamIndex);
      if (!upstreamInstance) {
        issues.push({
          code: 'INVALID_CONNECTION',
          instanceIndex: instance.instanceIndex,
          nodeId: instance.nodeId,
          flowId: connection.inputFlowId,
          edgeId: connection.edgeId,
        });
        continue;
      }
      // 输出交换与供应视图已在视图构建阶段校验并创建；无效连接已在上方记录并
      // 于失败检查处中断，能到达此处的连接必有供应视图。未声明分配的输出不是
      // 可链接产品，其边不构成技术圈链接，消费端输入保留为边界交换。
      const supplierViewId = supplierViewIdByEdgeId.get(connection.edgeId)!;
      const supplierView = viewById.get(supplierViewId)!;

      const consumptions: Array<{ viewId: string; amount: number }> = [];
      let balanceInSystem = false;
      for (const view of views) {
        if (view.instanceIndex !== instance.instanceIndex) continue;
        const attr = resolveConsumption(instance, view, connection.inputFlowId);
        consumptions.push({ viewId: view.id, amount: attr });
        addEntry(supplierView.columnIndex, view.columnIndex, attr);
        balanceInSystem = true;
      }
      edges.push({ connection, supplierViewId, consumptions, inSystem: balanceInSystem });
    }
  }

  if (issues.length > 0) fail();

  const entries = Array.from(entryMap.entries()).map(([key, value]) => {
    const [row, col] = key.split('\u0000');
    return { row: Number(row), col: Number(col), value };
  });

  const demand = views.map((view) => (view.isReference ? payload.targetAmount : 0));

  return {
    instances,
    instanceByIndex,
    views,
    viewById,
    primaryViewIdByInstance,
    edges,
    entries,
    demand,
    fractionsByView,
    refViewId: refView.id,
  };
};
