import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resolvedCoreEntry = fs.realpathSync(
  require.resolve('@tiangong-lca/tidas-sdk/core', { paths: [repositoryRoot] }),
);
const installedPackageRoot = path.resolve(path.dirname(resolvedCoreEntry), '../..');
const installedManifest = JSON.parse(
  fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'),
);
const installedCore = require(resolvedCoreEntry);

const datasetFactories = [
  ['Contact', 'createContact', 'contactDataSet'],
  ['Source', 'createSource', 'sourceDataSet'],
  ['UnitGroup', 'createUnitGroup', 'unitGroupDataSet'],
  ['FlowProperty', 'createFlowProperty', 'flowPropertyDataSet'],
  ['Flow', 'createFlow', 'flowDataSet'],
  ['Process', 'createProcess', 'processDataSet'],
  ['LifeCycleModel', 'createLifeCycleModel', 'lifeCycleModelDataSet'],
];

function assertStableErrorEnvelope(result, factoryName) {
  assert.equal(result.success, false, `${factoryName} empty data must fail strict validation`);
  assert.equal(result.mode, 'strict');
  assert.equal(typeof result.error, 'object');
  assert.equal(result.error?.name, 'ZodError');
  assert.equal(typeof result.error?.message, 'string');
  assert.ok(Array.isArray(result.error.issues));
  assert.ok(result.error.issues.length > 0);
  assert.ok(Array.isArray(result.validationIssues));
  assert.equal(result.validationIssues.length, result.error.issues.length);
  for (const [index, issue] of result.validationIssues.entries()) {
    const rawIssue = result.error.issues[index];
    assert.equal(typeof issue.code, 'string');
    assert.ok(Array.isArray(issue.path));
    assert.ok(['error', 'warning', 'info'].includes(issue.severity));
    assert.equal(issue.rawCode, rawIssue.code);
    assert.deepEqual(issue.path, rawIssue.path);
    assert.equal(issue.message, rawIssue.message);
  }
}

test('loads the exact released SDK from the installed package graph', () => {
  assert.equal(installedManifest.name, '@tiangong-lca/tidas-sdk');
  assert.equal(installedManifest.version, '0.2.0');
  assert.match(resolvedCoreEntry, /node_modules/u);
});

test('all seven dataset factories expose validateEnhanced and its stable error envelope', () => {
  for (const name of [
    'TIDAS_DEEP_VALIDATION',
    'TIDAS_INCLUDE_WARNINGS',
    'TIDAS_THROW_ON_ERROR',
    'TIDAS_VALIDATION_MODE',
  ]) {
    assert.equal(process.env[name], undefined, `${name} must use the SDK default`);
  }
  for (const [datasetName, factoryName, rootKey] of datasetFactories) {
    const factory = installedCore[factoryName];
    assert.equal(typeof factory, 'function', `${factoryName} must be exported`);

    const entity = factory({ [rootKey]: {} }, { mode: 'strict' });
    assert.equal(typeof entity.validateEnhanced, 'function');
    assert.equal(typeof entity.toJSON, 'function');
    assert.ok(entity.toJSON()[rootKey], `${datasetName} must retain its canonical root`);
    assertStableErrorEnvelope(entity.validateEnhanced(), factoryName);
  }
});

test('Platform form projections defer covered public rules to the installed SDK', () => {
  const flowFormSchema = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'src/pages/Flows/flows_schema.json'), 'utf8'),
  );
  const processFormSchema = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'src/pages/Processes/processes_schema.json'), 'utf8'),
  );
  const flowTypeRules =
    flowFormSchema.flowDataSet.modellingAndValidation.LCIMethod.typeOfDataSet.rules;
  const processVersionRules =
    processFormSchema.processDataSet.administrativeInformation.publicationAndOwnership[
      'common:dataSetVersion'
    ].rules;
  const processExchange = processFormSchema.processDataSet.exchanges.exchange[0];

  assert.deepEqual(flowTypeRules, []);
  assert.equal(processVersionRules.some((rule) => rule.pattern === 'dataSetVersion'), false);
  assert.deepEqual(processExchange.meanAmount.rules, []);
  assert.deepEqual(processExchange.resultingAmount.rules, []);

  const flowIssues = installedCore
    .createFlow({ flowDataSet: {} }, { mode: 'strict' })
    .validateEnhanced().validationIssues;
  assert.ok(
    flowIssues.some(
      (issue) =>
        issue.code === 'required_missing' &&
        issue.path.join('.') === 'flowDataSet.modellingAndValidation.LCIMethod.typeOfDataSet',
    ),
  );
  const invalidFlowTypeIssues = installedCore
    .createFlow(
      {
        flowDataSet: {
          modellingAndValidation: { LCIMethod: { typeOfDataSet: 'Unknown flow' } },
        },
      },
      { mode: 'strict' },
    )
    .validateEnhanced().validationIssues;
  assert.ok(
    invalidFlowTypeIssues.some(
      (issue) =>
        issue.path.join('.') === 'flowDataSet.modellingAndValidation.LCIMethod.typeOfDataSet',
    ),
  );

  const processVersionIssues = (version) =>
    installedCore
      .createProcess(
        {
          processDataSet: {
            administrativeInformation: {
              publicationAndOwnership: { 'common:dataSetVersion': version },
            },
          },
        },
        { mode: 'strict' },
      )
      .validateEnhanced()
      .validationIssues.filter((issue) => issue.path.at(-1) === 'common:dataSetVersion');
  assert.deepEqual(processVersionIssues('01.02'), []);
  assert.deepEqual(processVersionIssues('01.02.003'), []);
  assert.ok(processVersionIssues('01.02.03').some((issue) => issue.code === 'invalid_format'));

  const processIssues = installedCore
    .createProcess(
      {
        processDataSet: {
          exchanges: {
            exchange: [{ '@dataSetInternalID': '1', referenceToFlowDataSet: {} }],
          },
        },
      },
      { mode: 'strict' },
    )
    .validateEnhanced().validationIssues;
  for (const field of ['meanAmount', 'resultingAmount']) {
    assert.ok(
      processIssues.some(
        (issue) =>
          issue.code === 'required_missing' &&
          issue.path.join('.') === `processDataSet.exchanges.exchange.0.${field}`,
      ),
      `${field} must retain a field-addressable SDK failure`,
    );
  }
});

test('Flow property entry retains local field prompts for the SDK union-path gap', () => {
  const flowFormSchema = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'src/pages/Flows/flows_schema.json'), 'utf8'),
  );
  const flowProperty = flowFormSchema.flowDataSet.flowProperties.flowProperty;
  assert.equal(flowProperty.referenceToFlowPropertyDataSet['@refObjectId'].rules[0].required, true);
  assert.equal(flowProperty.meanValue.rules[0].required, true);

  const issues = installedCore
    .createFlow(
      {
        flowDataSet: {
          flowProperties: { flowProperty: { '@dataSetInternalID': '1' } },
        },
      },
      { mode: 'strict' },
    )
    .validateEnhanced().validationIssues;
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === 'invalid_union' &&
        issue.path.join('.') === 'flowDataSet.flowProperties.flowProperty',
    ),
  );
  assert.equal(
    issues.some((issue) =>
      ['meanValue', 'referenceToFlowPropertyDataSet'].includes(issue.path.at(-1)),
    ),
    false,
  );
});
