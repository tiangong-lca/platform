/** Assemble product activities, standard process instances and independent inventories. */

import { solveCompiledSystem } from './solve';
import { buildProductSystem } from './productSystem';
import type { CompiledView, Compilation } from './compile';
import type {
  CalculationIssue,
  MatrixCalculationResult,
  MatrixResultExchange,
  MatrixResultGroup,
  SolvedView,
} from './types';
import { CALCULATION_TOLERANCES, CalculationError } from './types';

/** Solve each result scenario from its own final demand, including feedback. */
const computeGroupActivities = (
  compilation: Compilation,
  edges: Compilation['edges'],
  members: CompiledView[],
  rootView: CompiledView,
  targetAmount: number,
): Map<string, number> => {
  const memberIndex = new Map(members.map((view, index) => [view.id, index]));
  const entries: Compilation['entries'] = [];
  for (const edge of edges) {
    const row = memberIndex.get(edge.supplierViewId);
    if (row === undefined) continue;
    for (const consumption of edge.consumptions) {
      const col = memberIndex.get(consumption.viewId);
      if (col !== undefined) entries.push({ row, col, value: consumption.amount });
    }
  }
  const { x } = solveCompiledSystem({
    ...compilation,
    views: members.map((view, columnIndex) => ({ ...view, columnIndex })),
    entries,
    demand: members.map((view) => (view.id === rootView.id ? targetAmount : 0)),
  });
  return new Map(members.map((view, index) => [view.id, x[index]]));
};

/**
 * zh-CN: 汇总求解结果并执行端口平衡校验，返回完整计算结果。
 * en-US: Summarize the solution, run the port-balance checks, and return the full result.
 */
export const assembleResult = (
  compilation: Compilation,
  solution: number[],
): MatrixCalculationResult => {
  const { views, viewById, instanceByIndex, edges } = compilation;
  const activityOf = (view: CompiledView): number => solution[view.columnIndex];

  const deliveredBySupplierView = new Map<string, number>();
  const edgeAmounts: Record<string, number> = {};
  for (const edge of edges) {
    const delivered = edge.consumptions.reduce(
      (sum, consumption) =>
        sum + consumption.amount * activityOf(viewById.get(consumption.viewId)!),
      0,
    );
    edgeAmounts[edge.connection.edgeId] = delivered;
    deliveredBySupplierView.set(
      edge.supplierViewId,
      (deliveredBySupplierView.get(edge.supplierViewId) ?? 0) + delivered,
    );
  }

  // Verify allocated product balances, including external final demand. This
  // protects calculation integrity without imposing a joint-production ratio.
  const issues: CalculationIssue[] = [];
  for (const view of views) {
    const activity = activityOf(view);
    const required =
      (deliveredBySupplierView.get(view.id) ?? 0) + compilation.demand[view.columnIndex];
    if (
      !Number.isFinite(activity) ||
      Math.abs(activity - required) >
        CALCULATION_TOLERANCES.residual * Math.max(1, Math.abs(activity), Math.abs(required))
    ) {
      issues.push({
        code: 'NUMERIC_RESULT_INVALID',
        instanceIndex: view.instanceIndex,
        nodeId: instanceByIndex.get(view.instanceIndex)?.nodeId,
        flowId: view.pivotFlowId,
        exchangeInternalId: view.pivotExchangeId,
      });
    }
  }
  if (issues.length) throw new CalculationError(issues[0].code, issues);

  // 视图活动量
  const solvedViews: SolvedView[] = views.map((view) => ({
    instanceIndex: view.instanceIndex,
    pivotExchangeId: view.pivotExchangeId,
    pivotDirection: view.pivotDirection,
    pivotFlowId: view.pivotFlowId,
    activity: activityOf(view),
    multiplier: activityOf(view) / view.pivotAmount,
    isReference: view.isReference,
  }));

  // A scalar is meaningful only when every product view has the same scale.
  // Zero-demand products participate: one active coproduct is not evidence of
  // a common physical multiplier for the whole multi-product source inventory.
  const instanceMultipliers: Record<string, number> = {};
  for (const instanceIndex of compilation.primaryViewIdByInstance.keys()) {
    const instanceViews = views.filter((view) => view.instanceIndex === instanceIndex);
    const multipliers = instanceViews.map((view) => activityOf(view) / view.pivotAmount);
    const first = multipliers[0];
    if (
      first > 0 &&
      multipliers.every(
        (value) =>
          Math.abs(value - first) <=
          CALCULATION_TOLERANCES.residual * Math.max(Math.abs(value), Math.abs(first)),
      )
    ) {
      instanceMultipliers[instanceIndex] = first;
    }
  }

  // Result groups: primary target plus every other product/service supply closure.
  const supplierViewByConsumerInput = new Map<string, string>();
  for (const edge of edges) {
    const key = `${edge.connection.downstreamIndex}\u0000${edge.connection.inputFlowId}`;
    supplierViewByConsumerInput.set(key, edge.supplierViewId);
  }

  const buildGroup = (
    rootView: CompiledView,
    type: 'primary' | 'secondary',
    targetAmount: number,
  ): MatrixResultGroup | undefined => {
    const memberIds: string[] = [];
    const visited = new Set<string>([rootView.id]);
    const queue: Array<CompiledView> = [rootView];
    while (queue.length > 0) {
      const view = queue.shift()!;
      memberIds.push(view.id);
      for (const edge of edges) {
        if (!edge.consumptions.some((item) => item.viewId === view.id && item.amount !== 0))
          continue;
        const supplierViewId = edge.supplierViewId;
        if (visited.has(supplierViewId)) continue;
        visited.add(supplierViewId);
        queue.push(viewById.get(supplierViewId)!);
      }
    }

    const members = memberIds
      .map((id) => viewById.get(id))
      .filter((view): view is CompiledView => !!view);
    // 组根视图已被调用方保证活动量为正，成员必然非空

    const memberSet = new Set(memberIds);
    // 每个组是独立归因情景：共享上游的组内活动量按组内归因需求求解
    const groupActivity = computeGroupActivities(
      compilation,
      edges,
      members,
      rootView,
      targetAmount,
    );
    // computeGroupActivities 为全部成员写入活动量，查询对象均为成员
    const scenarioActivityOf = (view: CompiledView): number => groupActivity.get(view.id) as number;
    const aggregated = new Map<string, MatrixResultExchange>();
    const order: string[] = [];
    // 组根定量参考交换的聚合键（含版本），循环中捕获
    let rootRefKey = '';
    const flowVersionOf = (template: MatrixResultExchange['template']): string => {
      const version = (
        template.raw as { referenceToFlowDataSet?: { '@version'?: unknown } } | undefined
      )?.referenceToFlowDataSet?.['@version'];
      return typeof version === 'string' ? version : '';
    };
    const addExchange = (
      direction: 'INPUT' | 'OUTPUT',
      flowId: string,
      amount: number,
      template: MatrixResultExchange['template'],
    ) => {
      // 聚合键包含精确 Flow 版本：不同修订的同一 UUID 是不同交换，
      // 缺乏换算证据时不得合并（保留各自模板与版本引用）
      const key = `${direction}\u0000${flowId}\u0000${flowVersionOf(template)}`;
      const existing = aggregated.get(key);
      if (!existing) {
        order.push(key);
        aggregated.set(key, { direction, flowId, amount, quantitativeReference: false, template });
      } else {
        existing.amount += amount;
      }
    };

    for (const view of members) {
      const instance = instanceByIndex.get(view.instanceIndex)!;
      const activity = scenarioActivityOf(view);

      for (const exchange of instance.exchanges) {
        const payload = exchange.payload;
        const isPivot = payload.internalId === view.pivotExchangeId;

        if (payload.direction === 'OUTPUT' && !isPivot) {
          // 已连接的非枢轴输出有自己的视图，不进入本视图清单
          const hasOwnView = views.some(
            (candidate) =>
              candidate.instanceIndex === view.instanceIndex &&
              candidate.pivotExchangeId === payload.internalId,
          );
          if (hasOwnView) continue;
        }

        let amount: number;
        if (isPivot && payload.direction === 'OUTPUT') {
          // 枢轴输出：减去组内消费；组外消费与最终需求保留为边界流出
          let inGroupConsumption = 0;
          for (const edge of edges) {
            if (edge.supplierViewId !== view.id) continue;
            for (const consumption of edge.consumptions) {
              if (!memberSet.has(consumption.viewId)) continue;
              const consumerView = viewById.get(consumption.viewId)!;
              inGroupConsumption += consumption.amount * scenarioActivityOf(consumerView);
            }
          }
          amount = activity - inGroupConsumption;
        } else {
          const fraction = isPivot
            ? 1
            : compilation.fractionsByView.get(view.id)!.get(payload.internalId)!;
          amount = ((payload.amount ?? 0) * fraction * activity) / view.pivotAmount;
        }

        if (view.id === rootView.id && isPivot) {
          rootRefKey = `${payload.direction}\u0000${payload.flowId}\u0000${flowVersionOf(payload)}`;
        }

        if (payload.direction === 'INPUT') {
          // 已连接且供应视图在组内的输入是内部流，完全抵消不进入清单
          const supplierViewId = supplierViewByConsumerInput.get(
            `${view.instanceIndex}\u0000${payload.flowId}`,
          );
          if (supplierViewId && memberSet.has(supplierViewId)) continue;
          amount = -Math.abs(amount);
        }

        // 仅过滤精确为零的交换；非零计算结果一律保留——数量级小不代表
        // 负荷可忽略，功能单位交换尤其不得被量级阈值删除
        if (amount === 0) {
          continue;
        }
        addExchange(payload.direction, payload.flowId, amount, payload);
      }
    }

    // 标记定量参考
    const refExchange = aggregated.get(rootRefKey);
    if (refExchange) {
      refExchange.quantitativeReference = true;
    }
    if (type === 'primary' && rootView.pivotDirection === 'OUTPUT') {
      // 输出枢轴的主组必须携带功能单位交换：参考交换缺失说明清单不完整
      // （数量为 0 或被错误过滤），明确失败而不是返回成功的不完整结果。
      // 参考交换数量 = 目标 + 组外导出，故只做下界校验。输入枢轴（处置
      // 模型）的参考交换可为内部流并净化为零，不做此校验。
      // 编译阶段保证主根的需求向量分量为目标量
      const target = targetAmount;
      const tolerance = CALCULATION_TOLERANCES.residual * Math.max(1, Math.abs(target));
      if (
        !refExchange ||
        refExchange.direction !== rootView.pivotDirection ||
        refExchange.flowId !== rootView.pivotFlowId ||
        refExchange.amount < target - tolerance
      ) {
        throw new CalculationError('NUMERIC_RESULT_INVALID', [
          {
            code: 'NUMERIC_RESULT_INVALID',
            instanceIndex: rootView.instanceIndex,
            nodeId: instanceByIndex.get(rootView.instanceIndex)?.nodeId,
            flowId: rootView.pivotFlowId,
            exchangeInternalId: rootView.pivotExchangeId,
          },
        ]);
      }
    }

    const refProcesses = Array.from(
      new Set(
        members.map((view) => {
          const instance = instanceByIndex.get(view.instanceIndex)!;
          return `${instance.processId}@${instance.processVersion}`;
        }),
      ),
    ).map((key) => {
      const [id, version] = key.split('@');
      return { id, version };
    });

    return {
      type,
      root: { instanceIndex: rootView.instanceIndex, pivotExchangeId: rootView.pivotExchangeId },
      pivotFlowId: rootView.pivotFlowId,
      pivotDirection: rootView.pivotDirection,
      exchanges: order.map((key) => aggregated.get(key)!),
      refProcesses,
    };
  };

  const groups: MatrixResultGroup[] = [];
  const refView = viewById.get(compilation.refViewId)!;
  groups.push(buildGroup(refView, 'primary', compilation.demand[refView.columnIndex])!);
  for (const view of views) {
    if (view.isReference) continue;
    // A downstream connection does not remove this product's independent result.
    // These scenario solves never change the primary solution or graph quantities.
    groups.push(buildGroup(view, 'secondary', view.pivotAmount)!);
  }

  return {
    productSystem: buildProductSystem(compilation, solution),
    views: solvedViews,
    instanceMultipliers,
    edgeAmounts,
    balancedEdgeIds: Object.keys(edgeAmounts),
    groups,
  };
};
