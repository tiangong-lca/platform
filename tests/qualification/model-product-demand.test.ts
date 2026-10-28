/** Local PostgreSQL contract; run explicitly, outside the credential-free unit gate. */
import { execFileSync } from 'node:child_process';
import { runMatrixCalculation } from '@/services/lifeCycleModels/matrixCalculation/matrixWorker';
import { materializeProductSystem } from '@/services/lifeCycleModels/productSystemPersistence';
import { buildSaveLifeCycleModelPersistencePlan } from '@/services/lifeCycleModels/persistencePlan';
import { getProcessJsonOrderedForSave } from '@/services/processes/saveSerialization';
import { jsonToList } from '@/services/general/util';
import { getDataDetail } from '@/services/general/api';
import { createProcess } from '@tiangong-lca/tidas-sdk/core';
import {
  legacyProductDemandFixture,
  productDemandFixture,
  uuid,
  version,
} from '../helpers/lifeCycleModelProductDemand';

const mockGetDataDetail = jest.fn();

jest.mock('@tiangong-lca/tidas-sdk/core', () => {
  return jest.requireActual(
    `${process.cwd()}/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js`,
  );
});

// Keep the real language normalizer; a qualification fixture never calls translation services.
jest.mock('@/services/general/api', () => ({
  // Keep the production detail wrappers and unit resolver; only their data source is synthetic.
  getDataDetail: (id: string, dataVersion: string, table: string) =>
    mockGetDataDetail(id, dataVersion, table),
  normalizeLangPayloadForSave: async (payload: any) => {
    const { normalizeLangPayloadBeforeSave } = jest.requireActual('@/services/general/util');
    const result = await normalizeLangPayloadBeforeSave(payload, { intent: 'validation' });
    return {
      ...result,
      validationError: result.issues.length ? JSON.stringify(result.issues) : undefined,
    };
  },
}));

const container = 'supabase_db_model1196-qualification';
const actorId = uuid(1196001);
const modelId = uuid(1196002);
const nextVersion = '01.00.001';
const referencePropertyId = uuid(1196004);
const referenceGroupId = uuid(1196005);
const referencePropertyVersion = '02.00.000';
const referenceGroupVersion = '03.00.000';
const referenceKey = (table: string, id: string, dataVersion: string) =>
  `${table}/${id}@${dataVersion}`;
const referenceFixtures = new Map<string, any>();
const addReferenceFixture = (table: string, id: string, dataVersion: string, json: any) =>
  referenceFixtures.set(referenceKey(table, id, dataVersion), {
    id,
    version: dataVersion,
    json,
    modifiedAt: '2026-10-14T00:00:00Z',
    stateCode: 100,
    ruleVerification: true,
    userId: actorId,
  });

// These synthetic products use mass; the legacy implicit-zero product (14) has its own exact Flow.
for (const flowNumber of [10, 11, 12, 14]) {
  addReferenceFixture('flows', uuid(flowNumber), version, {
    flowDataSet: {
      flowInformation: { quantitativeReference: { referenceToReferenceFlowProperty: '0' } },
      flowProperties: {
        flowProperty: {
          '@dataSetInternalID': '0',
          referenceToFlowPropertyDataSet: {
            '@refObjectId': referencePropertyId,
            '@version': referencePropertyVersion,
          },
        },
      },
    },
  });
}
addReferenceFixture('flowproperties', referencePropertyId, referencePropertyVersion, {
  flowPropertyDataSet: {
    flowPropertiesInformation: {
      quantitativeReference: {
        referenceToReferenceUnitGroup: {
          '@refObjectId': referenceGroupId,
          '@version': referenceGroupVersion,
        },
      },
    },
  },
});
addReferenceFixture('unitgroups', referenceGroupId, referenceGroupVersion, {
  unitGroupDataSet: {
    unitGroupInformation: { quantitativeReference: { referenceToReferenceUnit: '0' } },
    units: { unit: { '@dataSetInternalID': '0', name: 'kg' } },
  },
});
mockGetDataDetail.mockImplementation(async (id: string, dataVersion: string, table: string) => {
  const data = referenceFixtures.get(referenceKey(table, id, dataVersion));
  // Missing versions are unavailable, not an opportunity to borrow a latest fixture.
  return data
    ? { success: true, data: JSON.parse(JSON.stringify(data)) }
    : { success: false, data: null };
});

const expectAnnualUnit = (jsonOrdered: any) => {
  expect(
    jsonToList(
      jsonOrdered.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
        .annualSupplyOrProductionVolume,
    ),
  ).toEqual([{ '@xml:lang': 'en', '#text': '1 kg/year' }]);
};
const expectQualifiedAnnualProcess = (jsonOrdered: any) => {
  expect(
    createProcess(jsonOrdered, { mode: 'strict' }).validateEnhanced().validationIssues,
  ).toEqual([]);
  expectAnnualUnit(jsonOrdered);
};
const expectLegacyAnnualSnapshot = (snapshot: any, allocatedProviderIds: Set<string>) => {
  // Historical sources and the primary draft are not promoted to fully qualified data here.
  // Newly materialized allocated providers must still pass the installed strict SDK.
  for (const row of snapshot.processes) {
    expectAnnualUnit(row.json_ordered);
    if (allocatedProviderIds.has(row.id)) expectQualifiedAnnualProcess(row.json_ordered);
  }
};
const sqlJson = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
const sql = (input: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );

async function prepare(
  mode: 'create' | 'update',
  old: any[] = [],
  modelVersion = version,
  load = 100,
  retireQ = false,
) {
  const fixture = productDemandFixture();
  fixture.model.lifeCycleModelDataSet.administrativeInformation.publicationAndOwnership[
    'common:dataSetVersion'
  ] = modelVersion;
  fixture.payload.instances[1].process.exchanges[2].amount = load;
  if (retireQ) {
    fixture.payload.instances[0].process.exchanges.pop();
    fixture.payload.instances[1].process.exchanges.splice(1, 1);
    fixture.payload.instances[1].process.exchanges[0].allocations = {
      allocation: { '@allocatedFraction': '100' },
    };
    fixture.payload.instances[1].connections.pop();
  }
  const outcome = runMatrixCalculation({
    type: 'calculate',
    runId: 'database-qualification',
    payload: fixture.payload,
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  const records = materializeProductSystem(
    outcome.result.productSystem,
    fixture.model,
    old,
    new Map([[`${uuid(2)}@${version}`, fixture.original]]),
  );
  if (mode === 'create')
    records.forEach((record) => {
      record.option = 'create';
    });
  const result = await buildSaveLifeCycleModelPersistencePlan({
    mode,
    modelId,
    version: modelVersion,
    lifeCycleModelJsonOrdered: fixture.model,
    nodes: [],
    edges: [],
    up2DownEdges: [],
    lifeCycleModelProcesses: records,
    oldSubmodels: mode === 'update' ? old : [],
    oldProcesses:
      mode === 'update'
        ? old.map((entry) => ({ id: entry.id, version: modelVersion, json: {} }))
        : [],
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  for (const entry of result.plan.processMutations) {
    if (entry.op !== 'delete') expectQualifiedAnnualProcess(entry.jsonOrdered);
  }
  expect(
    result.plan.processMutations
      .filter((entry) => entry.op !== 'delete')
      .every((entry: any) => entry.ruleVerification),
  ).toBe(true);
  return { ...fixture, records, plan: result.plan };
}

function replay(snapshot: any, downstream?: any) {
  const info = snapshot.model.json_ordered.lifeCycleModelDataSet.lifeCycleModelInformation;
  const instances = jsonToList(info.technology.processes.processInstance).map((instance: any) => {
    const reference = instance.referenceToProcess;
    const stored = snapshot.processes.find(
      (row: any) => row.id === reference['@refObjectId'] && row.version === reference['@version'],
    );
    const data = stored?.json_ordered.processDataSet;
    const process = data
      ? {
          id: stored.id,
          version: stored.version,
          refExchangeInternalId: String(
            data.processInformation.quantitativeReference.referenceToReferenceFlow,
          ),
          exchanges: jsonToList(data.exchanges.exchange).map((entry: any) => ({
            internalId: String(entry['@dataSetInternalID']),
            flowId: entry.referenceToFlowDataSet['@refObjectId'],
            amount: Number(entry.resultingAmount),
            direction: entry.exchangeDirection === 'Input' ? 'INPUT' : 'OUTPUT',
            raw: entry,
          })),
        }
      : downstream;
    expect(
      stored !== undefined || (downstream !== undefined && reference['@refObjectId'] === uuid(1)),
    ).toBe(true);
    return {
      instanceIndex: instance['@dataSetInternalID'],
      processId: reference['@refObjectId'],
      processVersion: reference['@version'],
      process,
      connections: jsonToList(instance.connections?.outputExchange).flatMap((output: any) =>
        jsonToList(output.downstreamProcess).map((target: any) => ({
          upstreamIndex: instance['@dataSetInternalID'],
          downstreamIndex: target['@id'],
          inputFlowId: target['@flowUUID'],
          outputFlowId: output['@flowUUID'],
          inputFlowVersion: target['@version'],
          outputFlowVersion: output['@version'],
          edgeId: `${instance['@dataSetInternalID']}:${output['@flowUUID']}`,
        })),
      ),
    };
  });
  const result = runMatrixCalculation({
    type: 'calculate',
    runId: 'postgres-reload',
    payload: {
      refInstanceIndex: String(info.quantitativeReference.referenceToReferenceProcess),
      targetAmount: 1,
      instances,
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  expect(result.result.productSystem.instances.every((entry) => !entry.materialize)).toBe(true);
  return result.result.groups[0].exchanges.find((entry) => entry.flowId === uuid(13))?.amount;
}

it('saves, updates, versions, retires and reloads real product providers atomically', async () => {
  expect(sql('select max(version) from supabase_migrations.schema_migrations;').trim()).toBe(
    '20261009113000',
  );
  expect(jest.isMockFunction(createProcess)).toBe(false);
  expect(createProcess({}, { mode: 'strict' }).validateEnhanced().success).toBe(false);
  expect(await getDataDetail(uuid(11), '99.00.000', 'flows')).toEqual({
    success: false,
    data: null,
  });
  const created = await prepare('create');
  expect(mockGetDataDetail).toHaveBeenCalledWith(uuid(11), version, 'flows');
  expect(mockGetDataDetail).toHaveBeenCalledWith(uuid(12), version, 'flows');
  expect(mockGetDataDetail).toHaveBeenCalledWith(
    referencePropertyId,
    referencePropertyVersion,
    'flowproperties',
  );
  expect(mockGetDataDetail).toHaveBeenCalledWith(
    referenceGroupId,
    referenceGroupVersion,
    'unitgroups',
  );
  const old = created.plan.parent.jsonTg.submodels!;
  const updated = await prepare('update', old, version, 200);
  const versioned = await prepare('create', old, version, 200);
  const nextOld = versioned.plan.parent.jsonTg.submodels!.map((entry) => ({
    ...entry,
    version: nextVersion,
  }));
  const retired = await prepare('update', nextOld, nextVersion, 200, true);
  expect(updated.records.map((entry) => entry.modelInfo.id)).toEqual(
    created.records.map((entry) => entry.modelInfo.id),
  );
  const retiredId = created.records.find((entry) => entry.modelInfo.finalId.exchangeId === '2')
    .modelInfo.id;
  expect(retired.plan.processMutations).toContainEqual(
    expect.objectContaining({ op: 'delete', id: retiredId, version: nextVersion }),
  );
  const snapshots = [
    ['created', created.plan, version],
    ['updated', updated.plan, version],
    [
      'versioned',
      { ...versioned.plan, allocateVersion: true, sourceVersion: version },
      nextVersion,
    ],
    ['retired', retired.plan, nextVersion],
  ] as const;
  // Disable unrelated asynchronous derivatives exactly as the database-owned bundle pgTAP tests do.
  // JSON sync, bundle authorization/versioning, table constraints and rollback remain real.
  const statements = [
    'begin;',
    'alter table public.processes disable trigger user;',
    'alter table public.processes enable trigger processes_json_sync_trigger;',
    'alter table public.lifecyclemodels disable trigger user;',
    'alter table public.lifecyclemodels enable trigger lifecyclemodels_json_sync_trigger;',
    `insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values ('${actorId}','authenticated','authenticated','model1196-qualification@example.invalid','{}','{}');`,
    'set local role service_role;',
  ];
  for (const [stage, plan, savedVersion] of snapshots) {
    statements.push(
      `select private.save_lifecycle_model_bundle(${sqlJson({ ...plan, actorUserId: actorId })})->>'version';`,
    );
    statements.push(
      `select jsonb_build_object('stage','${stage}','model',(select to_jsonb(m) from public.lifecyclemodels m where id='${modelId}' and version='${savedVersion}'),'processes',(select jsonb_agg(to_jsonb(p)) from public.processes p where model_id='${modelId}'));`,
    );
  }
  statements.push('rollback;');
  const saved = sql(statements.join('\n'))
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
  expect(saved.map((item) => item.stage)).toEqual(['created', 'updated', 'versioned', 'retired']);
  expect(
    saved.map((item, index) =>
      replay(
        item,
        index === 3 ? retired.payload.instances[0].process : created.payload.instances[0].process,
      ),
    ),
  ).toEqual([110, 220, 220, 200]);
  expect(saved[2].processes).toHaveLength(4);
  expect(saved[3].processes).toHaveLength(3);
  expect(
    saved[3].processes.some((row: any) => row.id === retiredId && row.version === version),
  ).toBe(true);
  expect(
    saved[3].processes.some((row: any) => row.id === retiredId && row.version === nextVersion),
  ).toBe(false);
  for (const snapshot of saved) {
    for (const provider of snapshot.processes) {
      expectQualifiedAnnualProcess(provider.json_ordered);
      const references = jsonToList(
        provider.json_ordered.processDataSet.processInformation.technology
          .referenceToIncludedProcesses,
      );
      expect(references).toEqual([
        expect.objectContaining({ '@refObjectId': uuid(2), '@version': version }),
      ]);
      expect(provider.model_version).toBe(provider.version);
    }
  }
  expect(sql(`select count(*) from public.lifecyclemodels where id='${modelId}';`).trim()).toBe(
    '0',
  );
}, 30000);

const isolatedTransaction = (body: string) =>
  sql(`
  begin;
  alter table public.processes disable trigger user;
  alter table public.processes enable trigger processes_json_sync_trigger;
  alter table public.lifecyclemodels disable trigger user;
  alter table public.lifecyclemodels enable trigger lifecyclemodels_json_sync_trigger;
  ${body}
  commit;
`);
const readSaved = (savedVersion: string) =>
  JSON.parse(
    sql(`select jsonb_build_object(
  'model',(select to_jsonb(m) from public.lifecyclemodels m where id='${modelId}' and version='${savedVersion}'),
  'processes',(select jsonb_agg(to_jsonb(p)) from public.processes p where model_id='${modelId}' or id in ('${uuid(1)}','${uuid(2)}')));`).trim(),
  );

it.each([version, null])(
  'upgrades a stored legacy graph with model_version=%s and versions the same providers',
  async (legacyModelVersion) => {
    expect(sql('select max(version) from supabase_migrations.schema_migrations;').trim()).toBe(
      '20261009113000',
    );
    const fixture = legacyProductDemandFixture();
    const primaryId = uuid(1196003);
    const primaryInfo = {
      id: primaryId,
      type: 'primary' as const,
      version,
      finalId: {
        nodeId: '0',
        processId: uuid(1),
        allocatedExchangeFlowId: uuid(10),
        allocatedExchangeDirection: 'OUTPUT',
      },
    };
    const editorGraph = {
      nodes: fixture.payload.instances.map((instance) => ({
        id: instance.instanceIndex,
        shape: 'rect',
        x: Number(instance.instanceIndex) * 400,
        y: 30,
        width: 300,
        height: 180,
        data: {
          id: instance.processId,
          version,
          index: instance.instanceIndex,
          quantitativeReference: instance.instanceIndex === '0' ? ('1' as const) : ('0' as const),
          targetAmount: '1',
        },
      })),
      edges: fixture.payload.instances[1].connections.map((connection) => ({
        id: connection.edgeId,
        labels: [],
        source: { cell: '1', port: connection.outputFlowId },
        target: { cell: '0', port: connection.inputFlowId },
        data: { connection },
      })),
    };
    // Old storage references the two original processes and has no allocated provider records.
    const legacyModel: any = fixture.model;
    const oldInstances =
      legacyModel.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
        .processInstance;
    oldInstances.forEach((instance: any) => {
      instance['@multiplicationFactor'] = '1';
    });
    oldInstances[1].connections = {
      outputExchange: fixture.payload.instances[1].connections.map((connection) => ({
        '@flowUUID': connection.outputFlowId,
        '@version': version,
        downstreamProcess: { '@id': '0', '@flowUUID': connection.inputFlowId, '@version': version },
      })),
    };
    const sourceRows = await Promise.all(
      fixture.payload.instances.map(async (instance) => {
        const data = JSON.parse(JSON.stringify(fixture.original));
        data.processInformation.mathematicalRelations = undefined;
        data.exchanges.exchange = instance.process.exchanges.map((entry) => ({
          ...(entry.raw as any),
          meanAmount: entry.amount,
          resultingAmount: entry.amount,
          referenceToVariable: undefined,
          allocations: entry.allocations,
          quantitativeReference: entry.internalId === instance.process.refExchangeInternalId,
        }));
        const jsonOrdered = await getProcessJsonOrderedForSave(instance.processId, data);
        expectAnnualUnit(jsonOrdered);
        return {
          id: instance.processId,
          jsonOrdered,
        };
      }),
    );
    // Original downstream quantities match one source run; edits later increase Q and R demand.
    const downstreamExchanges = jsonToList(
      sourceRows[0].jsonOrdered.processDataSet.exchanges.exchange,
    );
    downstreamExchanges.find(
      (entry: any) => entry.referenceToFlowDataSet['@refObjectId'] === uuid(12),
    ).resultingAmount = '20';
    downstreamExchanges.find(
      (entry: any) => entry.referenceToFlowDataSet['@refObjectId'] === uuid(12),
    ).meanAmount = '20';
    downstreamExchanges.find(
      (entry: any) => entry.referenceToFlowDataSet['@refObjectId'] === uuid(14),
    ).resultingAmount = '10';
    downstreamExchanges.find(
      (entry: any) => entry.referenceToFlowDataSet['@refObjectId'] === uuid(14),
    ).meanAmount = '10';
    sourceRows[0].jsonOrdered.processDataSet.exchanges.exchange = downstreamExchanges;
    const seedPrimary = JSON.parse(JSON.stringify(sourceRows[0].jsonOrdered));
    seedPrimary.processDataSet.processInformation.dataSetInformation['common:UUID'] = primaryId;
    seedPrimary.processDataSet.exchanges.exchange = [
      downstreamExchanges[0],
      {
        ...jsonToList(sourceRows[1].jsonOrdered.processDataSet.exchanges.exchange)[2],
        '@dataSetInternalID': '2',
      },
    ];
    expect(sql(`select count(*) from auth.users where id='${actorId}';`).trim()).toBe('0');
    expect(
      sql(
        `select count(*) from public.processes where id in ('${uuid(1)}','${uuid(2)}','${primaryId}');`,
      ).trim(),
    ).toBe('0');
    try {
      isolatedTransaction(`
      insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values ('${actorId}','authenticated','authenticated','model1196-legacy@example.invalid','{}','{}');
      ${sourceRows.map((row) => `insert into public.processes(id,json_ordered,user_id,state_code) values ('${row.id}',${sqlJson(row.jsonOrdered)}::json,'${actorId}',0);`).join('\n')}
      insert into public.lifecyclemodels(id,json_ordered,json_tg,user_id,state_code) values ('${modelId}',${sqlJson(legacyModel)}::json,${sqlJson({ xflow: editorGraph, submodels: [primaryInfo] })},'${actorId}',0);
      insert into public.processes(id,json_ordered,user_id,state_code,model_id,model_version) values ('${primaryId}',${sqlJson(seedPrimary)}::json,'${actorId}',0,'${modelId}',${legacyModelVersion === null ? 'null' : `'${legacyModelVersion}'`});
    `);
      const storedLegacy = readSaved(version);
      for (const row of storedLegacy.processes) expectAnnualUnit(row.json_ordered);
      expect(
        jsonToList(
          storedLegacy.model.json_ordered.lifeCycleModelDataSet.lifeCycleModelInformation.technology
            .processes.processInstance,
        ),
      ).toHaveLength(2);
      expect(storedLegacy.model.json_tg.submodels).toEqual([primaryInfo]);
      // Rehydrate source quantities/allocations from the stored rows before calculating.
      for (const instance of fixture.payload.instances) {
        const data = storedLegacy.processes.find((row: any) => row.id === instance.processId)
          .json_ordered.processDataSet;
        instance.process.exchanges = jsonToList(data.exchanges.exchange).map((entry: any) => ({
          internalId: String(entry['@dataSetInternalID']),
          flowId: entry.referenceToFlowDataSet['@refObjectId'],
          direction: entry.exchangeDirection === 'Input' ? 'INPUT' : 'OUTPUT',
          amount: Number(entry.resultingAmount),
          allocations: entry.allocations,
          raw: entry,
        }));
      }
      const baseline = runMatrixCalculation({
        type: 'calculate',
        runId: 'stored-legacy',
        payload: fixture.payload,
      });
      if (!baseline.ok) throw new Error(baseline.error.code);
      expect(
        baseline.result.groups[0].exchanges.find((entry) => entry.flowId === uuid(13))?.amount,
      ).toBeCloseTo(100, 9);
      // Apply the user's independent demand edit after reading the old graph.
      fixture.payload.instances[0].process.exchanges.find(
        (entry) => entry.flowId === uuid(12),
      )!.amount = 30;
      fixture.payload.instances[0].process.exchanges.find(
        (entry) => entry.flowId === uuid(14),
      )!.amount = 40;
      // The changed demand is a source-process draft edit; persist that source too so exact-reference reload sees it.
      const editedDownstream = JSON.parse(
        JSON.stringify(storedLegacy.processes.find((row: any) => row.id === uuid(1)).json_ordered),
      );
      editedDownstream.processDataSet.exchanges.exchange = jsonToList(
        editedDownstream.processDataSet.exchanges.exchange,
      ).map((entry: any) => {
        const amount = fixture.payload.instances[0].process.exchanges.find(
          (exchange) => exchange.flowId === entry.referenceToFlowDataSet['@refObjectId'],
        )!.amount;
        return { ...entry, meanAmount: String(amount), resultingAmount: String(amount) };
      });
      isolatedTransaction(
        `update public.processes set json_ordered=${sqlJson(editedDownstream)}::json where id='${uuid(1)}' and version='${version}' and user_id='${actorId}';`,
      );
      const result = runMatrixCalculation({
        type: 'calculate',
        runId: 'legacy-upgrade',
        payload: fixture.payload,
      });
      if (!result.ok) throw new Error(result.error.code);
      expect(
        result.result.groups[0].exchanges.find((entry) => entry.flowId === uuid(13))?.amount,
      ).toBeCloseTo(125, 9);
      const projected = storedLegacy.model.json_ordered;
      const records = materializeProductSystem(
        result.result.productSystem,
        projected,
        storedLegacy.model.json_tg.submodels,
        new Map([[`${uuid(2)}@${version}`, fixture.original]]),
      );
      const primaryData = JSON.parse(JSON.stringify(fixture.original));
      primaryData.processInformation.mathematicalRelations = undefined;
      primaryData.exchanges.exchange = result.result.groups[0].exchanges.map((entry, index) => ({
        ...(entry.template.raw as any),
        '@dataSetInternalID': String(index + 1),
        meanAmount: Math.abs(entry.amount),
        resultingAmount: Math.abs(entry.amount),
        exchangeDirection: entry.direction === 'INPUT' ? 'Input' : 'Output',
        quantitativeReference: entry.quantitativeReference,
        allocations: undefined,
        referenceToVariable: undefined,
      }));
      records.push({
        option: 'update',
        modelInfo: primaryInfo,
        data: { processDataSet: primaryData },
      });
      const allocatedProviderIds = new Set<string>(
        records
          .filter((record) => record.modelInfo.type === 'allocated')
          .map((record) => record.modelInfo.id),
      );
      expect(allocatedProviderIds.size).toBe(3);
      const upgrade = await buildSaveLifeCycleModelPersistencePlan({
        mode: 'update',
        modelId,
        version,
        lifeCycleModelJsonOrdered: projected,
        nodes: storedLegacy.model.json_tg.xflow.nodes,
        edges: storedLegacy.model.json_tg.xflow.edges,
        up2DownEdges: [],
        lifeCycleModelProcesses: records,
        oldSubmodels: storedLegacy.model.json_tg.submodels,
        oldProcesses: storedLegacy.processes
          .filter((row: any) => row.model_id === modelId)
          .map((row: any) => ({ id: row.id, version: row.version, json: row.json })),
      });
      if (!upgrade.ok) throw new Error(upgrade.message);
      for (const entry of upgrade.plan.processMutations) {
        if (entry.op !== 'delete') {
          expectAnnualUnit(entry.jsonOrdered);
          if (allocatedProviderIds.has(entry.id)) expectQualifiedAnnualProcess(entry.jsonOrdered);
        }
      }
      isolatedTransaction(
        `set local role service_role; select private.save_lifecycle_model_bundle(${sqlJson({ ...upgrade.plan, actorUserId: actorId })});`,
      );
      const upgraded = readSaved(version);
      expectLegacyAnnualSnapshot(upgraded, allocatedProviderIds);
      expect(upgraded.model.json_tg.xflow).toEqual(editorGraph);
      expect(
        upgraded.model.json_tg.submodels.filter((entry: any) => entry.type === 'allocated'),
      ).toHaveLength(3);
      expect(
        upgraded.model.json_tg.submodels.filter((entry: any) => entry.type === 'primary'),
      ).toEqual([primaryInfo]);
      expect(
        jsonToList(
          upgraded.model.json_ordered.lifeCycleModelDataSet.lifeCycleModelInformation
            .dataSetInformation.referenceToResultingProcess,
        ).map((entry: any) => entry['@refObjectId']),
      ).toEqual([primaryId]);
      // Recalculation reads every referenced dataset from PostgreSQL, including the edited source.
      const upgradedAmount = replay(upgraded);
      expect(upgradedAmount).toBeCloseTo(125, 9);
      const createVersion = {
        ...upgrade.plan,
        mode: 'create',
        allocateVersion: true,
        sourceVersion: version,
        processMutations: upgrade.plan.processMutations.map((entry) => ({
          ...entry,
          op: 'create',
        })),
      };
      isolatedTransaction(
        `set local role service_role; select private.save_lifecycle_model_bundle(${sqlJson({ ...createVersion, actorUserId: actorId })});`,
      );
      const versioned = readSaved(nextVersion);
      expectLegacyAnnualSnapshot(versioned, allocatedProviderIds);
      const versionedAmount = replay(versioned);
      expect(versionedAmount).toBeCloseTo(125, 9);
      expect(versioned.model.json_tg.xflow).toEqual(editorGraph);
      const refs = jsonToList(
        versioned.model.json_ordered.lifeCycleModelDataSet.lifeCycleModelInformation.technology
          .processes.processInstance,
      ).map((entry: any) => entry.referenceToProcess);
      expect(
        refs
          .filter((entry: any) => entry['@refObjectId'] !== uuid(1))
          .every((entry: any) => entry['@version'] === nextVersion),
      ).toBe(true);
      expect(
        versioned.processes.filter(
          (row: any) => row.model_id === modelId && row.version === version,
        ),
      ).toHaveLength(4);
      expect(
        versioned.processes.filter(
          (row: any) => row.model_id === modelId && row.version === nextVersion,
        ),
      ).toHaveLength(4);
      const newAllocated = versioned.model.json_tg.submodels.filter(
        (entry: any) => entry.type === 'allocated',
      );
      const oldAllocated = upgraded.model.json_tg.submodels.filter(
        (entry: any) => entry.type === 'allocated',
      );
      expect(newAllocated.map((entry: any) => entry.id)).toEqual(
        oldAllocated.map((entry: any) => entry.id),
      );
      for (const entry of newAllocated) {
        const data = versioned.processes.find(
          (row: any) => row.id === entry.id && row.version === nextVersion,
        );
        expect(data.model_version).toBe(nextVersion);
        expect(
          jsonToList(
            data.json_ordered.processDataSet.processInformation.technology
              .referenceToIncludedProcesses,
          ),
        ).toEqual([expect.objectContaining({ '@refObjectId': uuid(2), '@version': version })]);
      }
      const primary = versioned.processes.find(
        (row: any) => row.id === primaryId && row.version === nextVersion,
      );
      expect(
        jsonToList(
          primary.json_ordered.processDataSet.processInformation.technology
            .referenceToIncludedProcesses,
        ),
      ).toEqual(refs);
      process.stdout.write(
        `${JSON.stringify({ qualification: 'stored-legacy-upgrade', legacyModelVersion, baselineAmount: baseline.result.groups[0].exchanges.find((entry) => entry.flowId === uuid(13))?.amount, upgradedAmount, versionedAmount, allocatedProviderCount: newAllocated.length, historicalOwnedRows: versioned.processes.filter((row: any) => row.model_id === modelId && row.version === version).length })}\n`,
      );
    } finally {
      isolatedTransaction(`
      delete from public.processes where user_id='${actorId}' and (model_id='${modelId}' or id in ('${uuid(1)}','${uuid(2)}'));
      delete from public.lifecyclemodels where id='${modelId}' and user_id='${actorId}';
      delete from auth.users where id='${actorId}';
    `);
    }
    expect(sql(`select count(*) from public.processes where user_id='${actorId}';`).trim()).toBe(
      '0',
    );
  },
  30000,
);
