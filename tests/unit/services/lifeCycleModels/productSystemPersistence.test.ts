import { createRequire } from 'node:module';
import {
  productDemandFixture,
  ref,
  uuid,
  version,
} from '../../../helpers/lifeCycleModelProductDemand';
import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import { materializeProductSystem } from '@/services/lifeCycleModels/productSystemPersistence';
import { buildSaveLifeCycleModelPersistencePlan } from '@/services/lifeCycleModels/persistencePlan';
import { genReferenceToResultingProcess } from '@/services/lifeCycleModels/util';
import { jsonToList } from '@/services/general/util';
import { getFlowDetail } from '@/services/flows/api';
import { getFlowpropertyDetail } from '@/services/flowproperties/api';
import { getUnitGroupDetail } from '@/services/unitgroups/api';

jest.mock('@/services/flows/api', () => ({ getFlowDetail: jest.fn() }));
jest.mock('@/services/flowproperties/api', () => ({ getFlowpropertyDetail: jest.fn() }));
jest.mock('@/services/unitgroups/api', () => ({ getUnitGroupDetail: jest.fn() }));
jest.mock('@/services/general/api', () => ({
  normalizeLangPayloadForSave: async (payload: unknown) => ({ payload }),
}));

const exactDetail = (id: string, detailVersion: string, json: any) => ({
  success: true,
  data: {
    id,
    version: detailVersion,
    json,
    modifiedAt: '2026-10-14T00:00:00Z',
    stateCode: 100,
    ruleVerification: true,
    userId: 'synthetic-user',
  },
});

beforeEach(() => {
  jest.mocked(getFlowDetail).mockImplementation(async (id, flowVersion) =>
    exactDetail(id, flowVersion, {
      flowDataSet: {
        flowInformation: { quantitativeReference: { referenceToReferenceFlowProperty: '0' } },
        flowProperties: {
          flowProperty: {
            '@dataSetInternalID': '0',
            referenceToFlowPropertyDataSet: {
              '@refObjectId': uuid(id === uuid(11) ? 31 : 32),
              '@version': '02.00.000',
            },
          },
        },
      },
    }),
  );
  jest.mocked(getFlowpropertyDetail).mockImplementation(async (id, propertyVersion) =>
    exactDetail(id, propertyVersion, {
      flowPropertyDataSet: {
        flowPropertiesInformation: {
          quantitativeReference: {
            referenceToReferenceUnitGroup: {
              '@refObjectId': uuid(id === uuid(31) ? 41 : 42),
              '@version': '03.00.000',
            },
          },
        },
      },
    }),
  );
  jest.mocked(getUnitGroupDetail).mockImplementation(async (id, groupVersion) =>
    exactDetail(id, groupVersion, {
      unitGroupDataSet: {
        unitGroupInformation: { quantitativeReference: { referenceToReferenceUnit: '0' } },
        units: { unit: { '@dataSetInternalID': '0', name: id === uuid(41) ? 'kg' : 'MJ' } },
      },
    }),
  );
});

const buildProviderPlan = async (
  providers: any[],
  model: any,
  overrides: {
    mode?: 'create' | 'update';
    version?: string;
    oldProcesses?: { id: string; version: string; json: any }[];
  } = {},
): Promise<any[]> => {
  const result = await buildSaveLifeCycleModelPersistencePlan({
    mode: 'create',
    modelId: uuid(50),
    lifeCycleModelJsonOrdered: model,
    nodes: [],
    edges: [],
    up2DownEdges: [],
    lifeCycleModelProcesses: providers,
    ...overrides,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.plan.processMutations.map((mutation) => {
    if (mutation.op === 'delete') throw new Error('Unexpected delete');
    return mutation.jsonOrdered;
  });
};

// Bypass Jest SDK shims: this contract uses the installed release in the lockfile.
const installedRequire = createRequire(`${process.cwd()}/package.json`);
const { createProcess } = installedRequire(
  `${process.cwd()}/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js`,
);
const { ProcessSchema, LifeCycleModelSchema } = installedRequire('@tiangong-lca/tidas-sdk/schemas');
it('persists independent providers, reuses identities and recalculates the standard graph without double allocation', async () => {
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
  // Use the actual lifecycle save consumer, including the shared Process preparation.
  // The legacy source annual text remains unchanged; no fabricated test suffix repairs it.
  const persisted = await buildProviderPlan(providers, model);
  expect(getFlowDetail).toHaveBeenCalledWith(uuid(11), version);
  expect(getFlowDetail).toHaveBeenCalledWith(uuid(12), version);
  expect(getFlowpropertyDetail).toHaveBeenCalledWith(uuid(31), '02.00.000');
  expect(getFlowpropertyDetail).toHaveBeenCalledWith(uuid(32), '02.00.000');
  expect(getUnitGroupDetail).toHaveBeenCalledWith(uuid(41), '03.00.000');
  expect(getUnitGroupDetail).toHaveBeenCalledWith(uuid(42), '03.00.000');
  const exchangeSchema = ProcessSchema.shape.processDataSet.shape.exchanges;
  for (const provider of persisted) {
    const referenceFlow = jsonToList(provider.processDataSet.exchanges.exchange).find(
      (entry) =>
        String(entry['@dataSetInternalID']) ===
        String(
          provider.processDataSet.processInformation.quantitativeReference.referenceToReferenceFlow,
        ),
    )?.referenceToFlowDataSet['@refObjectId'];
    expect(
      provider.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    ).toEqual({
      '@xml:lang': 'en',
      '#text': referenceFlow === uuid(11) ? '1 kg/year' : '1 MJ/year',
    });
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
    providers.map((p) => p.modelInfo),
  );
  expect(again.map((p) => p.modelInfo.id)).toEqual(providers.map((p) => p.modelInfo.id));
  expect(again.every((p) => p.option === 'update')).toBe(true);
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

it('resolves the generated reference unit after restoring saved metadata for a result Process', async () => {
  const { original, model, payload } = productDemandFixture();
  const outcome = runMatrixCalculation({ type: 'calculate', runId: 'annual-override', payload });
  if (!outcome.ok) throw new Error(outcome.error.code);
  const providers = materializeProductSystem(
    outcome.result.productSystem,
    model,
    [],
    new Map([[`${uuid(2)}@${version}`, original]]),
  );
  const provider = providers.find((item) =>
    item.data.processDataSet.exchanges.exchange.some(
      (entry: any) =>
        entry.quantitativeReference && entry.referenceToFlowDataSet['@refObjectId'] === uuid(12),
    ),
  );
  expect(provider).toBeDefined();
  provider.option = 'update';
  provider.modelInfo.type = 'secondary';
  const reference = provider.data.processDataSet.exchanges.exchange.find(
    (entry: any) => entry.quantitativeReference,
  );
  reference.refUnitRes = { refUnitName: 'stale-cache-unit' };
  reference.functionalUnitOrOther = [
    { '@xml:lang': 'en', '#text': '1 MJ complete reference product at the factory gate.' },
    { '@xml:lang': 'zh', '#text': '工厂大门处的1 MJ完整参考产品。' },
  ];
  const saved = JSON.parse(JSON.stringify(provider.data.processDataSet));
  saved.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness = {
    ...saved.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness,
    annualSupplyOrProductionVolume: [
      { '@xml:lang': 'en', '#text': '12.5 kg/year' },
      { '@xml:lang': 'zh', '#text': '12.5 kg/年' },
    ],
    useAdviceForDataSet: [
      { '@xml:lang': 'en', '#text': 'Use only within the documented boundary.' },
      { '@xml:lang': 'zh', '#text': '仅在记录的边界内使用。' },
    ],
  };
  const [persisted] = await buildProviderPlan([provider], model, {
    mode: 'update',
    version,
    oldProcesses: [{ id: provider.modelInfo.id, version, json: { processDataSet: saved } }],
  });
  const treatment =
    persisted.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness;
  expect(treatment.annualSupplyOrProductionVolume).toEqual([
    { '@xml:lang': 'en', '#text': '12.5 MJ/year' },
    { '@xml:lang': 'zh', '#text': '12.5 MJ/年' },
  ]);
  expect(treatment.useAdviceForDataSet).toEqual(
    saved.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.useAdviceForDataSet,
  );
  expect(
    persisted.processDataSet.processInformation.quantitativeReference.functionalUnitOrOther,
  ).toEqual(reference.functionalUnitOrOther);
  expect(getFlowDetail).toHaveBeenCalledWith(uuid(12), version);
  expect(createProcess(persisted, { mode: 'strict' }).validateEnhanced().validationIssues).toEqual(
    [],
  );
});

it.each(['1 kg', '1 kg/year'])(
  'keeps unavailable exact provider units visible to strict validation for %s',
  async (annual) => {
    const { original, model, payload } = productDemandFixture();
    original.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.annualSupplyOrProductionVolume[
      '#text'
    ] = annual;
    const outcome = runMatrixCalculation({
      type: 'calculate',
      runId: 'annual-unavailable',
      payload,
    });
    if (!outcome.ok) throw new Error(outcome.error.code);
    const providers = materializeProductSystem(
      outcome.result.productSystem,
      model,
      [],
      new Map([[`${uuid(2)}@${version}`, original]]),
    );
    jest.mocked(getFlowDetail).mockImplementation(async (id) => exactDetail(id, '99.00.000', {}));
    const persisted = await buildProviderPlan(providers, model);
    expect(getFlowpropertyDetail).not.toHaveBeenCalled();
    expect(getUnitGroupDetail).not.toHaveBeenCalled();
    for (const provider of persisted) {
      expect(
        provider.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .annualSupplyOrProductionVolume['#text'],
      ).toBe(annual.endsWith('/year') ? annual : '1');
      const validation = createProcess(provider, { mode: 'strict' }).validateEnhanced();
      const annualIssue = expect.objectContaining({
        path: [
          'processDataSet',
          'modellingAndValidation',
          'dataSourcesTreatmentAndRepresentativeness',
          'annualSupplyOrProductionVolume',
          '#text',
        ],
      });
      expect(validation.success).toBe(annual.endsWith('/year'));
      expect(validation.validationIssues).toEqual(annual.endsWith('/year') ? [] : [annualIssue]);
    }
  },
);
