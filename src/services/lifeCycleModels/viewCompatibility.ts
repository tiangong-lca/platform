import { jsonToList } from '@/services/general/util';
import type {
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelJsonTg,
  LifeCycleModelPortItem,
} from '@/services/lifeCycleModels/data';
import { toReferenceProcessKey } from '@/services/lifeCycleModels/referenceProcess';
import type { ProcessExchangeData } from '@/services/processes/data';

type GraphProcessReference = {
  id: string;
  version: string;
};

type ProcessDisplayDetail = {
  id: string;
  version: string;
  json?: {
    processDataSet?: unknown;
  };
};

type FlowRequirements = {
  input: Set<string>;
  output: Set<string>;
};

type ProcessDataSetLike = {
  processInformation?: {
    dataSetInformation?: {
      name?: unknown;
    };
    quantitativeReference?: { referenceToReferenceFlow?: unknown };
  };
  exchanges?: {
    exchange?: ProcessExchangeData | ProcessExchangeData[];
  };
};

const normalizeToken = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const processKey = (id: unknown, version: unknown): string | undefined => {
  const normalizedId = normalizeToken(id);
  const normalizedVersion = normalizeToken(version);
  return normalizedId && normalizedVersion ? `${normalizedId}@${normalizedVersion}` : undefined;
};

const getNodeInternalId = (node: LifeCycleModelGraphNode): string | undefined =>
  toReferenceProcessKey(node.data?.index) ?? toReferenceProcessKey(node.id);

const getFlowReference = (exchange: ProcessExchangeData) => {
  const reference = Array.isArray(exchange.referenceToFlowDataSet)
    ? exchange.referenceToFlowDataSet[0]
    : exchange.referenceToFlowDataSet;
  return reference && typeof reference === 'object' ? reference : undefined;
};

const normalizeDirection = (value: unknown): 'INPUT' | 'OUTPUT' | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized === 'INPUT' || normalized === 'OUTPUT' ? normalized : undefined;
};

const isQuantitativeReference = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

const getProcessDataSet = (
  detail: ProcessDisplayDetail | undefined,
): ProcessDataSetLike | undefined => detail?.json?.processDataSet as ProcessDataSetLike | undefined;

type CanonicalInstance = {
  '@dataSetInternalID'?: unknown;
  '@multiplicationFactor'?: unknown;
  referenceToProcess?: { '@refObjectId'?: unknown; '@version'?: unknown };
};

const positiveQuantity = (value: unknown): number | undefined => {
  const token = normalizeToken(value);
  if (!token || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) {
    return undefined;
  }
  const quantity = Number(token);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
};

// Canonical multipliers scale the whole referenced inventory, including its
// reference exchange. Hydration never substitutes another Process revision.
const referenceQuantities = (
  instance: CanonicalInstance | undefined,
  detail: ProcessDisplayDetail | undefined,
) => {
  const source = getProcessDataSet(detail);
  const referenceId = normalizeToken(
    source?.processInformation?.quantitativeReference?.referenceToReferenceFlow,
  );
  const exchanges = jsonToList(source?.exchanges?.exchange).filter(
    (exchange: ProcessExchangeData) =>
      referenceId !== undefined && normalizeToken(exchange?.['@dataSetInternalID']) === referenceId,
  );
  const originalAmount =
    exchanges.length === 1 ? positiveQuantity(exchanges[0].meanAmount) : undefined;
  const scalingFactor = positiveQuantity(instance?.['@multiplicationFactor']);
  if (originalAmount === undefined || scalingFactor === undefined) return {};
  const targetAmount = originalAmount * scalingFactor;
  return Number.isFinite(targetAmount) && targetAmount > 0
    ? { originalAmount, scalingFactor, targetAmount }
    : {};
};

const buildFlowRequirements = (edges: LifeCycleModelGraphEdge[]): Map<string, FlowRequirements> => {
  const requirements = new Map<string, FlowRequirements>();
  const ensure = (nodeId: string) => {
    const existing = requirements.get(nodeId);
    if (existing) {
      return existing;
    }
    const created = { input: new Set<string>(), output: new Set<string>() };
    requirements.set(nodeId, created);
    return created;
  };

  edges.forEach((edge) => {
    const sourceCell = normalizeToken(edge.source?.cell);
    const targetCell = normalizeToken(edge.target?.cell);
    const outputExchange = edge.data?.connection?.outputExchange;
    const sourceFlowId = normalizeToken(outputExchange?.['@flowUUID']);
    const targetFlowId =
      normalizeToken(outputExchange?.downstreamProcess?.['@flowUUID']) ?? sourceFlowId;

    if (sourceCell && sourceFlowId) {
      ensure(sourceCell).output.add(sourceFlowId);
    }
    if (targetCell && targetFlowId) {
      ensure(targetCell).input.add(targetFlowId);
    }
  });

  return requirements;
};

const buildHydratedPorts = (
  detail: ProcessDisplayDetail | undefined,
  requirements: FlowRequirements | undefined,
): LifeCycleModelPortItem[] => {
  const processDataSet = getProcessDataSet(detail);
  const exchanges = jsonToList(processDataSet?.exchanges?.exchange).filter(
    (exchange): exchange is ProcessExchangeData =>
      typeof exchange === 'object' && exchange !== null,
  );
  const candidates = new Map<string, ProcessExchangeData[]>();

  exchanges.forEach((exchange) => {
    const direction = normalizeDirection(exchange.exchangeDirection);
    const flowId = normalizeToken(getFlowReference(exchange)?.['@refObjectId']);
    if (!direction || !flowId) {
      return;
    }

    const requiredByConnection =
      direction === 'INPUT'
        ? requirements?.input.has(flowId) === true
        : requirements?.output.has(flowId) === true;
    if (!requiredByConnection && !isQuantitativeReference(exchange.quantitativeReference)) {
      return;
    }

    const key = `${direction}:${flowId}`;
    const existing = candidates.get(key) ?? [];
    existing.push(exchange);
    candidates.set(key, existing);
  });

  const uniqueExchanges = Array.from(candidates.entries())
    .filter(([, matchingExchanges]) => matchingExchanges.length === 1)
    .map(([key, matchingExchanges]) => ({ key, exchange: matchingExchanges[0] }))
    .sort(({ key: left }, { key: right }) => left.localeCompare(right));

  return uniqueExchanges.map(({ key, exchange }, index) => {
    const [direction] = key.split(':');
    const isInput = direction === 'INPUT';
    const flowReference = getFlowReference(exchange);

    return {
      id: key,
      args: {
        x: isInput ? 0 : '100%',
        y: 65 + index * 20,
      },
      attrs: {
        text: {},
      },
      group: isInput ? 'groupInput' : 'groupOutput',
      data: {
        textLang: flowReference?.['common:shortDescription'],
        flowId: flowReference?.['@refObjectId'],
        flowVersion: flowReference?.['@version'],
        quantitativeReference: isQuantitativeReference(exchange.quantitativeReference),
        allocations: exchange.allocations,
      },
    };
  });
};

const findUniquePortId = (
  node: LifeCycleModelGraphNode | undefined,
  direction: 'INPUT' | 'OUTPUT',
  flowId: string | undefined,
): string | undefined => {
  if (!node || !flowId) {
    return undefined;
  }

  const expectedGroup = direction === 'INPUT' ? 'groupInput' : 'groupOutput';
  const matches = node.ports!.items!.filter(
    (item) =>
      item.group === expectedGroup &&
      normalizeToken(item.data?.flowId) === flowId &&
      normalizeToken(item.id),
  );
  return matches.length === 1 ? matches[0].id : undefined;
};

export const getLifeCycleModelGraphProcessReferences = (
  jsonTg: LifeCycleModelJsonTg | undefined,
): GraphProcessReference[] => {
  const references = new Map<string, GraphProcessReference>();

  (jsonTg?.xflow?.nodes ?? []).forEach((node) => {
    const id = normalizeToken(node.data?.id);
    const version = normalizeToken(node.data?.version);
    const key = processKey(id, version);
    if (key && id && version) {
      references.set(key, { id, version });
    }
  });

  return Array.from(references.values());
};

export const normalizeLifeCycleModelGraphForDisplay = ({
  jsonTg,
  lifeCycleModelDataSet,
  processDetails,
}: {
  jsonTg: LifeCycleModelJsonTg | undefined;
  lifeCycleModelDataSet?: unknown;
  processDetails?: ProcessDisplayDetail[];
}): LifeCycleModelJsonTg => {
  const originalNodes = jsonTg?.xflow?.nodes ?? [];
  const originalEdges = jsonTg?.xflow?.edges ?? [];
  const requirements = buildFlowRequirements(originalEdges);
  const detailsByProcess = new Map<string, ProcessDisplayDetail>();
  (processDetails ?? []).forEach((detail) => {
    const key = processKey(detail.id, detail.version);
    if (key) {
      detailsByProcess.set(key, detail);
    }
  });
  const referenceProcessId = toReferenceProcessKey(
    (
      lifeCycleModelDataSet as
        | {
            lifeCycleModelInformation?: {
              quantitativeReference?: {
                referenceToReferenceProcess?: unknown;
              };
            };
          }
        | undefined
    )?.lifeCycleModelInformation?.quantitativeReference?.referenceToReferenceProcess,
  );

  const instances = jsonToList(
    (
      lifeCycleModelDataSet as
        | {
            lifeCycleModelInformation?: {
              technology?: {
                processes?: { processInstance?: CanonicalInstance | CanonicalInstance[] };
              };
            };
          }
        | undefined
    )?.lifeCycleModelInformation?.technology?.processes?.processInstance,
  ) as CanonicalInstance[];

  const nodes = originalNodes.map((node) => {
    const nodeId = normalizeToken(node.id);
    const internalId = getNodeInternalId(node);
    const detailKey = processKey(node.data?.id, node.data?.version);
    const detail = detailKey ? detailsByProcess.get(detailKey) : undefined;
    const existingItems = node.ports?.items ?? [];
    const hydratedItems =
      existingItems.length === 0
        ? buildHydratedPorts(detail, nodeId ? requirements.get(nodeId) : undefined)
        : existingItems;
    const processName = getProcessDataSet(detail)?.processInformation?.dataSetInformation?.name;
    const hasReferenceProcess = referenceProcessId !== undefined;
    const isReference = hasReferenceProcess && internalId === referenceProcessId;
    const nextHeight = hydratedItems.length > 0 ? 60 + hydratedItems.length * 20 : undefined;
    const matchingInstances = instances.filter(
      (instance) =>
        toReferenceProcessKey(instance?.['@dataSetInternalID']) === internalId &&
        detailKey !== undefined &&
        processKey(
          instance.referenceToProcess?.['@refObjectId'],
          instance.referenceToProcess?.['@version'],
        ) === detailKey,
    );
    const quantities =
      isReference && node.data?.targetAmount === undefined && matchingInstances.length === 1
        ? referenceQuantities(matchingInstances[0], detail)
        : {};
    const nextData = {
      ...node.data,
      ...quantities,
      ...(node.data?.index === undefined && internalId !== undefined ? { index: internalId } : {}),
      ...(node.data?.label === undefined && processName !== undefined
        ? { label: processName }
        : {}),
      ...(hasReferenceProcess
        ? { quantitativeReference: isReference ? ('1' as const) : ('0' as const) }
        : {}),
    };

    return {
      ...node,
      ...(node.size && nextHeight
        ? {
            size: {
              ...node.size,
              height: Math.max(node.size.height ?? 0, nextHeight),
            },
          }
        : {}),
      ...(!node.size && nextHeight ? { height: Math.max(node.height ?? 0, nextHeight) } : {}),
      data: nextData,
      ports: {
        ...node.ports,
        items: hydratedItems,
      },
    };
  });
  const nodesById = new Map<string, LifeCycleModelGraphNode>();
  nodes.forEach((node) => {
    const nodeId = normalizeToken(node.id);
    if (nodeId) {
      nodesById.set(nodeId, node);
    }
  });
  const edges = originalEdges.map((edge) => {
    const outputExchange = edge.data?.connection?.outputExchange;
    const sourceFlowId = normalizeToken(outputExchange?.['@flowUUID']);
    const targetFlowId =
      normalizeToken(outputExchange?.downstreamProcess?.['@flowUUID']) ?? sourceFlowId;
    const sourceCell = normalizeToken(edge.source?.cell);
    const targetCell = normalizeToken(edge.target?.cell);
    const sourcePort =
      edge.source?.port ??
      findUniquePortId(sourceCell ? nodesById.get(sourceCell) : undefined, 'OUTPUT', sourceFlowId);
    const targetPort =
      edge.target?.port ??
      findUniquePortId(targetCell ? nodesById.get(targetCell) : undefined, 'INPUT', targetFlowId);

    return {
      ...edge,
      source: {
        ...edge.source,
        ...(sourcePort ? { port: sourcePort } : {}),
      },
      target: {
        ...edge.target,
        ...(targetPort ? { port: targetPort } : {}),
      },
    };
  });

  return {
    ...jsonTg,
    xflow: {
      ...jsonTg?.xflow,
      nodes,
      edges,
    },
  };
};
