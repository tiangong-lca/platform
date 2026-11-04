import { resumeLightEdit } from '@/pages/Study/recovery';
type CoreData = import('@/services/study/api').CoreData;
type Preparation = import('@/services/study/api').Preparation;
type Request = import('@/services/study/api').Request;
type Scenario = import('@/services/study/api').Scenario;
const mockCore = jest.fn();
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  core: (...args: unknown[]) => mockCore(...args),
}));
jest.mock('@/services/auth/taskCenters', () => ({
  getTaskCenterIdentityGeneration: () => 0,
  subscribeTaskCenterIdentity: () => () => {},
}));
const path = '/instances/plant/exchanges/emission/amount';
const contract = {
  kind: 'calculation_contract',
  schema: 'lca.calculation-contract.v1',
  sha256: 'a'.repeat(64),
};
const preparation = {
  studyId: 'study-a',
  preparationId: 'base-prep',
  profileId: 'profile-a',
  calculationContractRef: contract,
} as Preparation;
const predecessor = {
  scenarioRevisionId: 'before',
  studyId: 'study-a',
  studyRevisionId: 'revision-a',
  modelPreparationId: 'base-prep',
  status: 'frozen',
  overrides: [
    { path: '/instances/plant/exchanges/fuel/amount', value: 3 },
    { path, value: 1 },
  ],
} as Scenario;
const created = {
  ...predecessor,
  scenarioRevisionId: 'new-scenario',
  parentScenarioRevisionId: 'before',
  status: 'draft',
  revision: 1,
  contentHash: 'b'.repeat(64),
  overrides: [predecessor.overrides[0], { path, value: 2.5 }],
} as Scenario;
const source = {
  type: 'scenarioRevision',
  scenarioRevisionId: 'new-scenario',
  expectedRevision: 1,
  contentHash: created.contentHash,
};
const prepared = { ...preparation, preparationId: 'new-prep', source } as Preparation;
const createRequest = {
  schemaVersion: 'lca.study-api.v2',
  requestId: 'original-request',
  idempotencyKey: 'original-key',
  operation: 'scenario.create',
  studyRevisionId: 'revision-a',
  parentScenarioRevisionId: 'before',
  overrides: created.overrides,
} as Request;
const prepareRequest = {
  ...createRequest,
  operation: 'model.prepare',
  studyId: 'study-a',
  source,
  profileId: 'profile-a',
  calculationContractRef: contract,
} as Request;
const freezeRequest = {
  ...createRequest,
  operation: 'scenario.freeze',
  target: { type: 'scenarioRevision', id: 'new-scenario', expectedRevision: 1 },
  expectedContentHash: created.contentHash,
  modelPreparationId: 'new-prep',
} as Request;
const frozen = {
  ...created,
  status: 'frozen',
  revision: 2,
  modelPreparationId: 'new-prep',
} as Scenario;
const restore = (
  request = createRequest,
  result: CoreData = { type: 'scenarioRevision', value: created },
  overrides: Record<string, unknown> = {},
) =>
  resumeLightEdit({
    request,
    result,
    studyId: 'study-a',
    preparation,
    path,
    scenarios: [predecessor],
    ...overrides,
  });
beforeEach(() => {
  jest.clearAllMocks();
  mockCore.mockImplementation(async (request) =>
    request.operation === 'scenario.read'
      ? { type: 'scenarioRevision', value: created }
      : { type: 'modelPreparation', value: prepared },
  );
});
it('restores the exact recovered scenario, predecessor and amount without issuing a mutation or minting a key', async () => {
  const before = JSON.stringify(predecessor);
  expect(await restore()).toEqual({
    created,
    prepared: undefined,
    predecessorId: 'before',
    amount: 2.5,
  });
  expect(mockCore).not.toHaveBeenCalled();
  expect(JSON.stringify(predecessor)).toBe(before);
});
it('restores a recovered preparation only after reading and matching its exact scenario revision/hash', async () => {
  expect(await restore(prepareRequest, { type: 'modelPreparation', value: prepared })).toEqual({
    created,
    prepared,
    predecessorId: 'before',
    amount: 2.5,
  });
  expect(mockCore).toHaveBeenCalledTimes(1);
  expect(mockCore).toHaveBeenCalledWith({
    operation: 'scenario.read',
    scenarioRevisionId: 'new-scenario',
  });
});
it('restores a recovered freeze with its original preparation so Run can use the exact new input', async () => {
  expect(await restore(freezeRequest, { type: 'scenarioRevision', value: frozen })).toMatchObject({
    created: frozen,
    prepared,
  });
  expect(mockCore).toHaveBeenCalledWith({ operation: 'model.read', preparationId: 'new-prep' });
});
it.each([
  ['foreign Study', { studyId: 'foreign' }],
  ['wrong selected preparation', { preparation: { ...preparation, preparationId: 'other-prep' } }],
  ['wrong selected exchange', { path: '/instances/other/exchanges/emission/amount' }],
  ['missing original predecessor', { scenarios: [] }],
  ['foreign predecessor', { scenarios: [{ ...predecessor, studyId: 'other' }] }],
  ['changed predecessor revision', { scenarios: [{ ...predecessor, studyRevisionId: 'other' }] }],
  ['mutable predecessor', { scenarios: [{ ...predecessor, status: 'draft' }] }],
  [
    'changed predecessor overrides',
    { scenarios: [{ ...predecessor, overrides: [{ path: 'different', value: 3 }] }] },
  ],
])(
  'rejects %s rather than attaching a recovered scenario to another edit',
  async (_label, overrides) => {
    await expect(
      restore(
        createRequest,
        { type: 'scenarioRevision', value: created },
        overrides as Record<string, unknown>,
      ),
    ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
    expect(mockCore).not.toHaveBeenCalled();
  },
);
it.each([
  { studyRevisionId: 'foreign' },
  { parentScenarioRevisionId: 'foreign' },
  { overrides: [] },
])('requires original scenario.create payload bindings: %j', async (patch) => {
  await expect(restore({ ...createRequest, ...patch } as Request)).rejects.toMatchObject({
    code: 'REFERENCE_MISMATCH',
  });
});
it.each([{ scenarioRevisionId: 'foreign' }, { revision: 2 }, { contentHash: 'c'.repeat(64) }])(
  'rejects changed scenario identity after recovering a preparation: %j',
  async (patch) => {
    mockCore.mockResolvedValue({ type: 'scenarioRevision', value: { ...created, ...patch } });
    await expect(
      restore(prepareRequest, { type: 'modelPreparation', value: prepared }),
    ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
  },
);
it.each([
  { studyId: 'foreign' },
  { source: { ...source, scenarioRevisionId: 'foreign' } },
  { profileId: 'other' },
  { calculationContractRef: { ...contract, sha256: 'f'.repeat(64) } },
])('rejects recovered preparation binding drift: %j', async (patch) => {
  await expect(
    restore(prepareRequest, {
      type: 'modelPreparation',
      value: { ...prepared, ...patch } as Preparation,
    }),
  ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
});
it.each([
  { scenarioRevisionId: 'foreign' },
  { status: 'draft' },
  { modelPreparationId: 'foreign' },
  { contentHash: 'f'.repeat(64) },
])('rejects a freeze result with changed identity: %j', async (patch) => {
  await expect(
    restore(freezeRequest, {
      type: 'scenarioRevision',
      value: { ...frozen, ...patch } as Scenario,
    }),
  ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
});
it.each([
  { preparationId: 'foreign' },
  { source: { ...source, type: 'modelSourceSnapshot' } },
  { source: { ...source, scenarioRevisionId: 'foreign' } },
  { source: { ...source, expectedRevision: 2 } },
  { source: { ...source, contentHash: 'f'.repeat(64) } },
])('rejects a fresh preparation that does not match the recovered freeze: %j', async (patch) => {
  mockCore.mockResolvedValue({ type: 'modelPreparation', value: { ...prepared, ...patch } });
  await expect(
    restore(freezeRequest, { type: 'scenarioRevision', value: frozen }),
  ).rejects.toMatchObject({ code: 'REFERENCE_MISMATCH' });
});
it('does not treat unrelated Study writes as light edit state', async () => {
  expect(
    await restore({ ...createRequest, operation: 'study.archive' } as Request),
  ).toBeUndefined();
  expect(mockCore).not.toHaveBeenCalled();
});
