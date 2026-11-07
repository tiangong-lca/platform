import { createRequire } from 'node:module';
import {
  productDemandFixture,
  ref,
  uuid,
  version,
} from '../../../helpers/lifeCycleModelProductDemand';
import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import { materializeProductSystem } from '@/services/lifeCycleModels/productSystemPersistence';
import { genProcessJsonOrdered } from '@/services/processes/util';
import { genReferenceToResultingProcess } from '@/services/lifeCycleModels/util';
import { jsonToList } from '@/services/general/util';

// Bypass Jest SDK shims: this contract uses the installed release in the lockfile.
const installedRequire = createRequire(`${process.cwd()}/package.json`);
const { createProcess } = installedRequire(
  `${process.cwd()}/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js`,
);
const { ProcessSchema, LifeCycleModelSchema } = installedRequire('@tiangong-lca/tidas-sdk/schemas');
it('persists independent providers, reuses identities and recalculates the standard graph without double allocation', () => {
  expect(jest.isMockFunction(createProcess)).toBe(false);
  expect(createProcess({}, { mode: 'strict' }).validateEnhanced().success).toBe(false);
  const { original, model, payload } = productDemandFixture();
  const outcome = runMatrixCalculation({ type: 'calculate', runId: 'persist', payload });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error(outcome.error.code);
  const sourceModel = JSON.parse(JSON.stringify(model));
  const providers = materializeProductSystem(
    outcome.result.productSystem,
    model,
    [],
    new Map([[`${uuid(2)}@${version}`, original]]),
  );
  expect(providers).toHaveLength(2);
  expect(new Set(providers.map((p) => p.modelInfo.id)).size).toBe(2);
  const info = model.lifeCycleModelDataSet.lifeCycleModelInformation;
  const instances = jsonToList(info.technology.processes.processInstance);
  const instanceSchema =
    LifeCycleModelSchema.shape.lifeCycleModelDataSet.shape.lifeCycleModelInformation.shape
      .technology.shape.processes.shape.processInstance;
  const parsed = instanceSchema.safeParse(instances);
  expect(parsed.error?.issues).toBeUndefined();
  const persisted = providers.map((provider) =>
    genProcessJsonOrdered(provider.modelInfo.id, provider.data.processDataSet),
  );
  const exchangeSchema = ProcessSchema.shape.processDataSet.shape.exchanges;
  for (const provider of persisted) {
    expect(createProcess(provider, { mode: 'strict' }).validateEnhanced().validationIssues).toEqual(
      [],
    );
    expect(
      exchangeSchema.safeParse(provider.processDataSet.exchanges).error?.issues,
    ).toBeUndefined();
    const entries = jsonToList(provider.processDataSet.exchanges.exchange);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => !e.allocations && !e.referenceToVariable)).toBe(true);
    expect(provider.processDataSet.processInformation.mathematicalRelations).toBeUndefined();
    const validation = provider.processDataSet.modellingAndValidation;
    expect(jsonToList(validation.validation.review)).toEqual([{ '@type': 'Not reviewed' }]);
    expect(jsonToList(validation.complianceDeclarations.compliance)[0]).toEqual(
      expect.objectContaining({
        'common:referenceToComplianceSystem': ref(30, 'source data set'),
        'common:approvalOfOverallCompliance': 'Not defined',
        'common:reviewCompliance': 'Not defined',
      }),
    );
  }
  const serialized = JSON.parse(JSON.stringify({ instances, persisted }));
  const reloaded = serialized.instances.map((instance: any) => {
    const id = instance.referenceToProcess['@refObjectId'];
    const provider = serialized.persisted.find(
      (p: any) => p.processDataSet.processInformation.dataSetInformation['common:UUID'] === id,
    )?.processDataSet;
    const process = provider
      ? {
          id,
          version,
          refExchangeInternalId: String(
            provider.processInformation.quantitativeReference.referenceToReferenceFlow,
          ),
          exchanges: jsonToList(provider.exchanges.exchange).map((e) => ({
            internalId: String(e['@dataSetInternalID']),
            flowId: e.referenceToFlowDataSet['@refObjectId'],
            direction: e.exchangeDirection === 'Input' ? 'INPUT' : 'OUTPUT',
            amount: Number(e.resultingAmount),
            raw: e,
          })),
        }
      : payload.instances[0].process;
    return {
      instanceIndex: instance['@dataSetInternalID'],
      processId: id,
      processVersion: version,
      process,
      connections: jsonToList(instance.connections?.outputExchange).flatMap((output) =>
        jsonToList(output.downstreamProcess).map((downstream) => ({
          upstreamIndex: instance['@dataSetInternalID'],
          downstreamIndex: downstream['@id'],
          inputFlowId: downstream['@flowUUID'],
          outputFlowId: output['@flowUUID'],
          inputFlowVersion: downstream['@version'],
          outputFlowVersion: output['@version'],
          edgeId: `${instance['@dataSetInternalID']}:${output['@flowUUID']}`,
        })),
      ),
    };
  });
  const replay = runMatrixCalculation({
    type: 'calculate',
    runId: 'reload',
    payload: {
      refInstanceIndex: String(info.quantitativeReference.referenceToReferenceProcess),
      targetAmount: 1,
      instances: reloaded,
    },
  });
  expect(replay.ok).toBe(true);
  if (!replay.ok) throw new Error(replay.error.code);
  expect(replay.result.groups[0].exchanges.find((e) => e.flowId === uuid(13))?.amount).toBeCloseTo(
    110,
  );
  expect(replay.result.productSystem.instances.every((i) => !i.materialize)).toBe(true);
  const again = materializeProductSystem(
    outcome.result.productSystem,
    sourceModel,
    providers.map((p) => ({ ...p.modelInfo, version: '08.00.000' })),
  );
  expect(again.map((p) => p.modelInfo.id)).toEqual(providers.map((p) => p.modelInfo.id));
  expect(again.every((p) => p.option === 'update')).toBe(true);
  expect(again.every((p) => p.modelInfo.version === '08.00.000')).toBe(true);
  expect(
    jsonToList(
      sourceModel.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
        .processInstance,
    )
      .filter((instance) =>
        providers.some((p) => p.modelInfo.id === instance.referenceToProcess['@refObjectId']),
      )
      .every((instance) => instance.referenceToProcess['@version'] === '08.00.000'),
  ).toBe(true);
  const refs = genReferenceToResultingProcess(
    [
      ...providers,
      {
        modelInfo: { id: uuid(20), type: 'primary' },
        data: {
          processDataSet: {
            processInformation: { dataSetInformation: { name: { baseName: [] } } },
          },
        },
      },
    ],
    version,
    model,
  );
  expect(
    jsonToList(
      refs.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation
        .referenceToResultingProcess,
    ),
  ).toHaveLength(1);
});
