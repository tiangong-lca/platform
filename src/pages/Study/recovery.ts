import {
  core,
  expectType,
  StudyRequestError,
  type CoreData,
  type Preparation,
  type Request,
  type Scenario,
} from '@/services/study/api';

export type EditRecovery = { request: Request; result: CoreData };

const mismatch = () => new StudyRequestError('REFERENCE_MISMATCH', false);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Restore presentation state from the exact recovered request, never issue another mutation. */
export async function resumeLightEdit({
  request,
  result,
  studyId,
  preparation,
  path,
  scenarios,
}: {
  request: Request;
  result: CoreData;
  studyId: string;
  preparation: Preparation;
  path: string;
  scenarios: Scenario[];
}) {
  let created: Scenario;
  let prepared: Preparation | undefined;
  if (request.operation === 'scenario.create') {
    created = expectType(result, 'scenarioRevision').value;
    if (
      created.studyRevisionId !== request.studyRevisionId ||
      created.parentScenarioRevisionId !== request.parentScenarioRevisionId ||
      !same(created.overrides, request.overrides)
    )
      throw mismatch();
  } else if (request.operation === 'model.prepare' && request.source.type === 'scenarioRevision') {
    prepared = expectType(result, 'modelPreparation').value;
    if (
      request.studyId !== studyId ||
      !same(prepared.source, request.source) ||
      prepared.profileId !== request.profileId ||
      !same(prepared.calculationContractRef, request.calculationContractRef)
    )
      throw mismatch();
    created = expectType(
      await core({
        operation: 'scenario.read',
        scenarioRevisionId: request.source.scenarioRevisionId,
      }),
      'scenarioRevision',
    ).value;
    if (
      created.scenarioRevisionId !== request.source.scenarioRevisionId ||
      created.revision !== request.source.expectedRevision ||
      created.contentHash !== request.source.contentHash
    )
      throw mismatch();
  } else if (request.operation === 'scenario.freeze') {
    created = expectType(result, 'scenarioRevision').value;
    if (
      created.scenarioRevisionId !== request.target.id ||
      created.status !== 'frozen' ||
      created.modelPreparationId !== request.modelPreparationId ||
      created.contentHash !== request.expectedContentHash
    )
      throw mismatch();
    prepared = expectType(
      await core({ operation: 'model.read', preparationId: request.modelPreparationId }),
      'modelPreparation',
    ).value;
    if (
      prepared.preparationId !== request.modelPreparationId ||
      prepared.source.type !== 'scenarioRevision' ||
      prepared.source.scenarioRevisionId !== created.scenarioRevisionId ||
      prepared.source.expectedRevision !== request.target.expectedRevision ||
      prepared.source.contentHash !== request.expectedContentHash
    )
      throw mismatch();
  } else {
    // Other workflows may share this Study journal; their results are not edit state.
    return undefined;
  }
  const predecessor = scenarios.find(
    (item) => item.scenarioRevisionId === created.parentScenarioRevisionId,
  );
  const override = created.overrides.find((item) => item.path === path);
  if (
    created.studyId !== studyId ||
    preparation.studyId !== studyId ||
    !predecessor ||
    predecessor.studyId !== studyId ||
    predecessor.studyRevisionId !== created.studyRevisionId ||
    predecessor.status !== 'frozen' ||
    predecessor.modelPreparationId !== preparation.preparationId ||
    !override ||
    !Number.isFinite(override.value) ||
    !same(
      created.overrides,
      predecessor.overrides.filter((item) => item.path !== path).concat(override),
    ) ||
    (prepared &&
      (prepared.studyId !== studyId ||
        prepared.profileId !== preparation.profileId ||
        !same(prepared.calculationContractRef, preparation.calculationContractRef)))
  )
    throw mismatch();
  return {
    created,
    prepared,
    predecessorId: predecessor.scenarioRevisionId,
    amount: override.value,
  };
}
