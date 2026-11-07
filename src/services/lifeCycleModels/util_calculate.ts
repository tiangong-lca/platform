import { verifyAllocationProductProblems } from '../processes/allocationTargets';
import { v4 } from 'uuid';
import { CONTENT_LANGUAGE_REGISTRY } from '../general/contentLanguageRegistry';
import { jsonToList, mergeLangArrays, removeEmptyObjects } from '../general/util';
import { serializeStaticLciaReport } from '../lciaMethods/evidence';
import { LCIAResultCalculationWithEvidence } from '../lciaMethods/util';
import { publicEntity } from '../supabase/public';
import type { Up2DownEdge } from './data';
import type {
  MatrixCalculationPayload,
  MatrixConnectionPayload,
  MatrixExchangePayload,
  MatrixInstancePayload,
} from './matrixCalculation/types';
import {
  CalculationCancelledError,
  CalculationError,
  CalculationOperation,
} from './matrixCalculation/types';
import { buildMatrixEdgeId } from './matrixCalculation/validation';
import { getSharedMatrixCalculationClient } from './matrixCalculation/workerClient';
import { toReferenceProcessKey } from './referenceProcess';
import { buildLifeCycleModelSubmodelRecord } from './submodelRecord';
import { materializeProductSystem } from './productSystemPersistence';

/**
 * zh-CN: 解析交换的参与计算数量，优先级与 Worker 合同一致：
 * resultingAmount → meanAmount → meanValue；存在但无法解析为有限数时返回 null。
 * en-US: Resolve the exchange's calculation amount with the Worker-contract
 * precedence resultingAmount → meanAmount → meanValue; returns null when a
 * value exists but cannot be parsed as a finite number.
 */
const resolveCalculationAmount = (exchange: any): number | null => {
  const candidates = [exchange?.resultingAmount, exchange?.meanAmount, exchange?.meanValue];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const value = Number(candidate);
    return Number.isFinite(value) ? value : null;
  }
  return null;
};

const toMatrixExchangePayload = (exchange: any): MatrixExchangePayload => {
  const flowId = exchange?.referenceToFlowDataSet?.['@refObjectId'];
  const direction = String(exchange?.exchangeDirection ?? '')
    .trim()
    .toUpperCase();
  return {
    internalId: String(exchange?.['@dataSetInternalID'] ?? ''),
    direction: direction === 'INPUT' ? 'INPUT' : 'OUTPUT',
    flowId: typeof flowId === 'string' ? flowId : '',
    amount: flowId ? resolveCalculationAmount(exchange) : 0,
    allocations: exchange?.allocations,
    raw: exchange,
  };
};

/**
 * zh-CN: 生成/更新生命周期模型的子模型数据：
 * 校验 → 浏览器本地线程编译/求解 (I-A)x=y → 聚合主副产品 → 组装既有保存外形。
 * 循环完整进入方程；不做断环、伪逆或旧倍率传播兜底。数据不可解时抛出
 * CalculationError（携带定位），不更新结果。
 *
 * en-US: Generate/update submodels for the life-cycle model: validate →
 * compile/solve (I-A)x=y in a local browser thread → aggregate primary and
 * by-product groups → assemble the existing persistence shape. Cycles enter
 * the equations fully; no cycle-breaking, pseudo-inverse, or legacy scaling
 * fallback. Unsolvable data throws CalculationError (with locations) and the
 * results are not updated.
 * Params: id: string; modelNodes: any[] | null | undefined; lifeCycleModelJsonOrdered: any; oldSubmodels: any[]
 * Returns: Promise<{ lifeCycleModelProcesses: any[]; up2DownEdges: Up2DownEdge[] }>
 */
export async function genLifeCycleModelProcesses(
  id: string,
  modelNodes: any[] | null | undefined,
  lifeCycleModelJsonOrdered: any,
  oldSubmodels: any[],
  options?: { operation?: CalculationOperation },
) {
  const operation = options?.operation;
  const assertNotCancelled = (): void => {
    if (operation?.isCancelled()) {
      throw new CalculationCancelledError();
    }
  };

  assertNotCancelled();

  const refProcessNodeId = toReferenceProcessKey(
    lifeCycleModelJsonOrdered?.lifeCycleModelDataSet?.lifeCycleModelInformation
      ?.quantitativeReference?.referenceToReferenceProcess,
  );

  if (refProcessNodeId === undefined) {
    throw new CalculationError('INVALID_REFERENCE');
  }

  const refNode = modelNodes?.find((i: any) => i?.data?.quantitativeReference === '1');
  const targetAmountRaw = refNode?.data?.targetAmount;
  const targetAmount =
    targetAmountRaw === undefined || targetAmountRaw === null || targetAmountRaw === ''
      ? NaN
      : Number(targetAmountRaw);

  const mdProcesses = jsonToList(
    lifeCycleModelJsonOrdered?.lifeCycleModelDataSet?.lifeCycleModelInformation?.technology
      ?.processes?.processInstance,
  ).map((p: any) => {
    const processInternalId = toReferenceProcessKey(p?.['@dataSetInternalID']);
    let node = modelNodes?.find(
      (i: any) => toReferenceProcessKey(i?.data?.index) === processInternalId,
    );
    if (!node)
      node = modelNodes?.find(
        (i: any) => toReferenceProcessKey(i?.['@dataSetInternalID']) === processInternalId,
      );
    return {
      ...p,
      nodeId: node?.id,
    };
  });

  const processShortDescriptionMap = new Map<string, any>();
  for (const p of mdProcesses as any[]) {
    const processId = p?.referenceToProcess?.['@refObjectId'];
    const processVersion = p?.referenceToProcess?.['@version'];
    if (processId && processVersion) {
      processShortDescriptionMap.set(
        `${processId}@${processVersion}`,
        p?.referenceToProcess?.['common:shortDescription'],
      );
    }
  }

  const processKeys = mdProcesses.map((p: any) => ({
    id: p?.referenceToProcess?.['@refObjectId'],
    version: p?.referenceToProcess?.['@version'],
  }));

  const matrixInstances: MatrixInstancePayload[] = mdProcesses.map(
    (mdProcess: any, index: number) => {
      const instanceIndex = String(mdProcess?.['@dataSetInternalID'] ?? '');
      const processKey = processKeys[index];
      const connections: MatrixConnectionPayload[] = [];
      const seenEdgeIds = new Set<string>();
      const outputExchanges = jsonToList(mdProcess?.connections?.outputExchange);
      for (const outputExchange of outputExchanges) {
        const outputFlowId = outputExchange?.['@flowUUID'];
        if (!outputFlowId) continue;
        const downstreamList = jsonToList(outputExchange?.downstreamProcess);
        for (const downstream of downstreamList) {
          const downstreamIndex = String(downstream?.['@id'] ?? '');
          // 旧格式 downstreamProcess 仅带 @id；交换流两端一致（UI 强制），
          // 缺失时回退为输出流 UUID。
          const inputFlowId = downstream?.['@flowUUID'] ?? outputFlowId;
          if (!downstreamIndex || !inputFlowId) continue;
          const edgeId = buildMatrixEdgeId(instanceIndex, downstreamIndex, outputFlowId);
          if (seenEdgeIds.has(edgeId)) continue;
          seenEdgeIds.add(edgeId);
          connections.push({
            upstreamIndex: instanceIndex,
            downstreamIndex,
            outputFlowId,
            inputFlowId,
            outputFlowVersion: outputExchange?.['@version'],
            inputFlowVersion: downstream?.['@version'],
            edgeId,
          });
        }
      }
      return {
        instanceIndex,
        nodeId: mdProcess?.nodeId,
        processId: processKey?.id ?? '',
        processVersion: processKey?.version ?? '',
        process: {
          id: processKey?.id ?? '',
          version: processKey?.version ?? '',
          exchanges: [] as MatrixExchangePayload[],
          refExchangeInternalId: '',
        },
        connections,
      };
    },
  );

  // 查询 exact Process 数据（与既有加载路径一致），随后填充交换负载
  const orConditions = processKeys
    .filter((k) => k.id && k.version)
    .map((k) => `and(id.eq.${k.id},version.eq.${k.version})`)
    .join(',');
  const dbProcesses =
    orConditions.length === 0
      ? []
      : ((
          await publicEntity('processes')
            .select(
              `
      id,
      version,
      json->processDataSet->processInformation->quantitativeReference,
      json->processDataSet->exchanges->exchange,
      json->processDataSet
      `,
            )
            .or(orConditions)
        )?.data ?? []);

  const dbProcessMap = new Map<string, { exchanges: any[]; refExchangeInternalId: string }>();
  for (const p of dbProcesses as any[]) {
    const exchanges = jsonToList(p?.exchange);
    const refExchangeId = p?.quantitativeReference?.referenceToReferenceFlow;
    const allocationProblems = await verifyAllocationProductProblems(
      exchanges.filter((exchange: any) => toMatrixExchangePayload(exchange).flowId),
    );
    if (allocationProblems.length) {
      throw new CalculationError(
        'INVALID_ALLOCATION',
        allocationProblems.flatMap((problem) =>
          matrixInstances
            .filter(
              (instance) => instance.processId === p.id && instance.processVersion === p.version,
            )
            .map((instance) => ({
              code: 'INVALID_ALLOCATION' as const,
              instanceIndex: instance.instanceIndex,
              exchangeInternalId: problem.exchangeId,
            })),
        ),
      );
    }
    dbProcessMap.set(`${p?.id}@${p?.version}`, {
      exchanges,
      refExchangeInternalId: refExchangeId ? String(refExchangeId) : '',
    });
  }

  for (const instance of matrixInstances) {
    const dbProcess = dbProcessMap.get(`${instance.processId}@${instance.processVersion}`);
    instance.process.exchanges = (dbProcess?.exchanges ?? []).map(toMatrixExchangePayload);
    instance.process.refExchangeInternalId = dbProcess?.refExchangeInternalId ?? '';
  }

  const payload: MatrixCalculationPayload = {
    refInstanceIndex: String(refProcessNodeId),
    targetAmount: Number.isFinite(targetAmount) ? (targetAmount as number) : NaN,
    instances: matrixInstances,
  };

  operation?.beginStage('solving');
  assertNotCancelled();

  const outcome = await getSharedMatrixCalculationClient().run(payload, { operation });
  if (operation?.isCancelled()) {
    throw new CalculationCancelledError();
  }
  if (outcome.status === 'cancelled' || outcome.status === 'discarded') {
    throw new CalculationCancelledError();
  }
  if (outcome.status === 'failed' || !outcome.result) {
    throw new CalculationError(outcome.error!.code, outcome.error!.issues);
  }

  operation?.beginStage('assembly');
  assertNotCancelled();

  const { edgeAmounts, groups, productSystem } = outcome.result;

  const allocatedProcesses = materializeProductSystem(
    productSystem,
    lifeCycleModelJsonOrdered,
    oldSubmodels,
    new Map(
      (dbProcesses as any[]).map((process) => [
        `${process.id}@${process.version}`,
        process.processDataSet,
      ]),
    ),
  );

  // 边数值（成功求解下全部平衡）
  const up2DownEdges: Up2DownEdge[] = [];
  for (const instance of matrixInstances) {
    for (const connection of instance.connections) {
      const upstream = matrixInstances.find(
        (item) => item.instanceIndex === connection.upstreamIndex,
      );
      const downstream = matrixInstances.find(
        (item) => item.instanceIndex === connection.downstreamIndex,
      );
      up2DownEdges.push({
        id: connection.edgeId,
        flowUUID: connection.outputFlowId,
        flowIsRef: false,
        upstreamId: connection.upstreamIndex,
        upstreamNodeId: upstream?.nodeId,
        downstreamId: connection.downstreamIndex,
        downstreamNodeId: downstream?.nodeId,
        mainOutputFlowUUID: '',
        mainInputFlowUUID: '',
        exchangeAmount: edgeAmounts[connection.edgeId]!,
        isBalanced: true,
        unbalancedAmount: 0,
      });
    }
  }

  // 组装子模型（主/副），保留既有外形与命名
  const generatedContentLanguages = CONTENT_LANGUAGE_REGISTRY.filter(
    ({ authoring }) => authoring.enabled,
  );
  const subproductPrefix = generatedContentLanguages.map(({ generatedContent, languageCode }) => ({
    '@xml:lang': languageCode,
    '#text': generatedContent.subproductPrefix,
  }));
  const subproductLeftBracket = generatedContentLanguages.map(({ languageCode }) => ({
    '@xml:lang': languageCode,
    '#text': '[',
  }));
  const subproductRightBracket = generatedContentLanguages.map(({ languageCode }) => ({
    '@xml:lang': languageCode,
    '#text': '] ',
  }));
  const modelBaseName =
    lifeCycleModelJsonOrdered?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation
      ?.name?.baseName;

  const findOldSecondaryId = (finalId: {
    nodeId: string;
    processId: string;
    allocatedExchangeFlowId: string;
    allocatedExchangeDirection: string;
  }): string | undefined => {
    const oldProcess = oldSubmodels?.find(
      (o: any) =>
        o.type === 'secondary' &&
        o.finalId?.nodeId === finalId.nodeId &&
        o.finalId?.processId === finalId.processId &&
        o.finalId?.allocatedExchangeDirection === finalId.allocatedExchangeDirection &&
        o.finalId?.allocatedExchangeFlowId === finalId.allocatedExchangeFlowId,
    );
    return oldProcess && typeof oldProcess.id === 'string' && oldProcess.id.length > 0
      ? oldProcess.id
      : undefined;
  };

  const lciaIncompleteFlags: boolean[] = [];

  const lifeCycleModelProcesses = await Promise.all(
    groups.map(async (group) => {
      const isPrimary = group.type === 'primary';
      const type: 'primary' | 'secondary' = isPrimary ? 'primary' : 'secondary';
      const rootInstanceIndex = group.root.instanceIndex;

      const newExchanges = group.exchanges.map((entry, index) => ({
        ...(entry.template.raw as any),
        // Group inventories use signed balances (consumption is negative).
        // TIDAS encodes direction separately; do not apply the Input sign twice.
        exchangeDirection: entry.direction === 'INPUT' ? 'Input' : 'Output',
        meanAmount: entry.direction === 'INPUT' ? -entry.amount : entry.amount,
        resultingAmount: entry.direction === 'INPUT' ? -entry.amount : entry.amount,
        quantitativeReference: entry.quantitativeReference,
        allocatedFraction: undefined,
        allocations: undefined,
        referenceToVariable: undefined,
        dataDerivationTypeStatus: 'Calculated',
        '@dataSetInternalID': (index + 1).toString(),
      }));

      assertNotCancelled();
      const lciaCalculation = await LCIAResultCalculationWithEvidence(newExchanges);
      assertNotCancelled();
      lciaIncompleteFlags.push(
        (lciaCalculation.report as any)?.method_factor_coverage?.coverage_status ===
          'incomplete_coverage',
      );

      const refProcesses = group.refProcesses.map((refProcess) =>
        removeEmptyObjects({
          id: refProcess.id,
          version: refProcess.version,
          'common:shortDescription': processShortDescriptionMap.get(
            `${refProcess.id}@${refProcess.version}`,
          ),
        }),
      );

      const refExchangeEntry = group.exchanges.find((entry) => entry.quantitativeReference);
      const baseName = isPrimary
        ? modelBaseName
        : mergeLangArrays(
            subproductLeftBracket,
            subproductPrefix,
            jsonToList(
              (refExchangeEntry?.template.raw as any)?.referenceToFlowDataSet?.[
                'common:shortDescription'
              ],
            ),
            subproductRightBracket,
            jsonToList(modelBaseName),
          );

      const finalId = {
        nodeId: rootInstanceIndex,
        processId: matrixInstances.find((instance) => instance.instanceIndex === rootInstanceIndex)!
          .processId,
        allocatedExchangeFlowId: group.pivotFlowId,
        allocatedExchangeDirection: group.pivotDirection,
      };

      let option: 'create' | 'update' = 'create';
      let newId = v4();
      if (isPrimary) {
        const primary = oldSubmodels?.find((item: any) => item.type === 'primary');
        option = primary ? 'update' : 'create';
        newId = primary?.id ?? id;
      } else {
        const reusedId = findOldSecondaryId(finalId);
        if (reusedId) {
          option = 'update';
          newId = reusedId;
        }
      }

      const record = buildLifeCycleModelSubmodelRecord({
        option,
        modelId: newId,
        type,
        finalId,
        baseName,
        newExchanges,
        lciaResults: lciaCalculation.results,
        lciaReport: serializeStaticLciaReport(lciaCalculation.report),
        lifeCycleModelJsonOrdered,
        refProcesses,
      });
      const previous = oldSubmodels?.find((item: any) => item.id === newId);
      if (previous?.version) record.modelInfo.version = previous.version;
      return record;
    }),
  );

  return {
    lifeCycleModelProcesses: [...lifeCycleModelProcesses, ...allocatedProcesses],
    up2DownEdges,
    lciaIncomplete: lciaIncompleteFlags.some(Boolean),
  };
}
