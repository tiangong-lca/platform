import { v4 } from 'uuid';
import { jsonToList, listToJson, removeEmptyObjects } from '../general/util';
import type { ProductSystem } from './matrixCalculation/productSystem';
import { buildLifeCycleModelSubmodelRecord } from './submodelRecord';

/** Materialize allocated providers using the existing Process and Model structures. */
export const materializeProductSystem = (
  system: ProductSystem,
  model: any,
  oldSubmodels: any[],
  sourceDataSets: Map<string, any> = new Map(),
) => {
  const modelData = model.lifeCycleModelDataSet;
  const info = modelData.lifeCycleModelInformation;
  const sourceInstances = new Map<string, any>(
    jsonToList(info.technology.processes.processInstance).map((instance: any) => [
      String(instance['@dataSetInternalID'] ?? ''),
      instance,
    ]),
  );
  const modelVersion =
    modelData.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'];
  const allocatedProcesses: any[] = [];
  const instances = system.instances.map((instance) => {
    const source = sourceInstances.get(instance.sourceInstanceIndex);
    let referenceToProcess = source.referenceToProcess;
    if (instance.materialize) {
      const pivot = instance.exchanges.find(
        (exchange) => exchange.internalId === instance.refExchangeInternalId,
      )!;
      const finalId = {
        nodeId: instance.sourceInstanceIndex,
        processId: instance.processId,
        sourceVersion: instance.processVersion,
        exchangeId: instance.sourceExchangeId,
        allocatedExchangeFlowId: pivot.flowId,
        allocatedExchangeDirection: pivot.direction,
      };
      const old = oldSubmodels.find(
        (item) =>
          item.type === 'allocated' &&
          Object.entries(finalId).every(([key, value]) => item.finalId?.[key] === value),
      );
      const id = old?.id ?? v4();
      const baseName =
        (pivot.raw as any)?.referenceToFlowDataSet?.['common:shortDescription'] ??
        source.referenceToProcess?.['common:shortDescription'];
      const exchanges = instance.exchanges.map((exchange, index) => ({
        ...(exchange.raw as any),
        '@dataSetInternalID': String(index + 1),
        exchangeDirection: exchange.direction === 'INPUT' ? 'Input' : 'Output',
        meanAmount: exchange.amount,
        resultingAmount: exchange.amount,
        dataDerivationTypeStatus: 'Calculated',
        quantitativeReference: exchange.internalId === instance.refExchangeInternalId,
        allocations: undefined,
        allocatedFraction: undefined,
        referenceToVariable: undefined,
        minimumAmount: undefined,
        maximumAmount: undefined,
        uncertaintyDistributionType: undefined,
        relativeStandardDeviation95In: undefined,
      }));
      const record = buildLifeCycleModelSubmodelRecord({
        option: old ? 'update' : 'create',
        modelId: id,
        type: 'allocated',
        finalId,
        baseName,
        newExchanges: exchanges,
        lciaResults: [],
        lciaReport: undefined,
        lifeCycleModelJsonOrdered: model,
        refProcesses: [
          {
            id: instance.processId,
            version: instance.processVersion,
            'common:shortDescription': source.referenceToProcess?.['common:shortDescription'],
          },
        ],
      });
      const original = sourceDataSets.get(`${instance.processId}@${instance.processVersion}`);
      if (original) {
        const sourceData = JSON.parse(JSON.stringify(original));
        record.data.processDataSet = {
          ...sourceData,
          processInformation: {
            ...sourceData.processInformation,
            dataSetInformation: {
              ...sourceData.processInformation?.dataSetInformation,
              'common:UUID': id,
              name: { ...sourceData.processInformation?.dataSetInformation?.name, baseName },
            },
          },
          administrativeInformation: record.data.processDataSet.administrativeInformation,
          exchanges: { exchange: exchanges },
          LCIAResults: undefined,
        };
      }
      // Exchanges are evaluated and allocated; source formulae and review claims
      // do not describe this generated inventory.
      const dataset = record.data.processDataSet;
      dataset.processInformation.mathematicalRelations = undefined;
      const compliance = jsonToList(
        dataset.modellingAndValidation?.complianceDeclarations?.compliance,
      ).map((declaration) => ({
        ...declaration,
        'common:approvalOfOverallCompliance': 'Not defined',
        'common:nomenclatureCompliance': 'Not defined',
        'common:methodologicalCompliance': 'Not defined',
        'common:reviewCompliance': 'Not defined',
        'common:documentationCompliance': 'Not defined',
        'common:qualityCompliance': 'Not defined',
      }));
      dataset.modellingAndValidation = {
        ...dataset.modellingAndValidation,
        validation: { review: { '@type': 'Not reviewed' } },
        complianceDeclarations: compliance.length ? { compliance } : undefined,
      };
      if (old?.version) record.modelInfo.version = old.version;
      allocatedProcesses.push(record);
      referenceToProcess = {
        '@type': 'process data set',
        '@refObjectId': id,
        '@version': old?.version ?? modelVersion,
        '@uri': `../processes/${id}.xml`,
        'common:shortDescription': baseName,
      };
    }
    const outputs = new Map<string, any>();
    for (const connection of instance.connections) {
      const key = `${connection.outputFlowId}@${connection.outputFlowVersion ?? ''}`;
      let output = outputs.get(key);
      if (!output) {
        output = {
          '@flowUUID': connection.outputFlowId,
          '@version': connection.outputFlowVersion,
          downstreamProcess: [],
        };
        outputs.set(key, output);
      }
      output.downstreamProcess.push({
        '@id': connection.downstreamIndex,
        '@flowUUID': connection.inputFlowId,
        '@version': connection.inputFlowVersion,
      });
    }
    return removeEmptyObjects({
      '@dataSetInternalID': instance.instanceIndex,
      '@multiplicationFactor': String(instance.multiplier),
      referenceToProcess,
      groups: source.groups,
      parameters: instance.materialize ? undefined : source.parameters,
      connections: {
        outputExchange: listToJson(
          [...outputs.values()].map((output) => ({
            ...output,
            downstreamProcess: listToJson(output.downstreamProcess),
          })),
        ),
      },
    });
  });
  info.technology.processes.processInstance = listToJson(instances);
  info.quantitativeReference.referenceToReferenceProcess = Number.isFinite(
    Number(system.refInstanceIndex),
  )
    ? Number(system.refInstanceIndex)
    : system.refInstanceIndex;
  return allocatedProcesses;
};
