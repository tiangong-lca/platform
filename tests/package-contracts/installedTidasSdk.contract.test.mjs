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
  assert.equal(installedManifest.version, '0.6.0');
  assert.match(resolvedCoreEntry, /node_modules/u);
});

test('the installed SDK requires the Process general comment after defaults materialize', () => {
  const commentPath = 'processDataSet.processInformation.dataSetInformation.common:generalComment';
  const commentIssues = (comment) => {
    const dataSetInformation = {};
    if (comment !== undefined) {
      dataSetInformation['common:generalComment'] = comment;
    }
    return installedCore
      .createProcess(
        {
          processDataSet: {
            processInformation: { dataSetInformation },
          },
        },
        { mode: 'strict' },
      )
      .validateEnhanced()
      .validationIssues.filter((issue) => issue.path.join('.') === commentPath);
  };

  for (const missingComment of [undefined, []]) {
    assert.deepEqual(
      commentIssues(missingComment).map(({ code, message, severity }) => ({
        code,
        message,
        severity,
      })),
      [{ code: 'custom', message: 'Required', severity: 'error' }],
    );
  }
  assert.deepEqual(commentIssues([{ '@xml:lang': 'en', '#text': 'General comment' }]), []);
});

test('the installed SDK accepts singleton and ordered Process reviews', () => {
  const localizedText = (text) => ({ '@xml:lang': 'en', '#text': text });
  const reviewer = {
    '@type': 'contact data set',
    '@refObjectId': '11111111-1111-1111-1111-111111111111',
    '@version': '01.00.000',
    '@uri': '../contacts/11111111-1111-1111-1111-111111111111.xml',
    'common:shortDescription': localizedText('Review institution'),
  };
  const review = (type, details) => ({
    '@type': type,
    'common:scope': {
      '@name': 'Documentation',
      'common:method': { '@name': 'Documentation' },
    },
    'common:reviewDetails': localizedText(details),
    'common:referenceToNameOfReviewerAndInstitution': reviewer,
  });
  const first = review('Independent external review', 'Reviewed documentation');
  const second = review('Independent internal review', 'Reviewed calculations');
  const validateReviews = (reviews) => {
    const entity = installedCore.createProcess(
      {
        processDataSet: {
          modellingAndValidation: { validation: { review: reviews } },
        },
      },
      { mode: 'strict' },
    );
    const reviewIssues = entity
      .validateEnhanced()
      .validationIssues.filter((issue) =>
        issue.path.join('.').startsWith('processDataSet.modellingAndValidation.validation.review'),
      );

    assert.deepEqual(reviewIssues, []);
    return entity.toJSON().processDataSet.modellingAndValidation.validation.review;
  };

  assert.equal(validateReviews(first)['@type'], 'Independent external review');
  assert.deepEqual(
    validateReviews([first, second]).map((item) => item['@type']),
    ['Independent external review', 'Independent internal review'],
  );
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
  assert.equal(
    processVersionRules.some((rule) => rule.pattern === 'dataSetVersion'),
    false,
  );
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

test('the installed SDK retains repeated ILCD fields and validates later items', () => {
  const schemas = require(
    require.resolve('@tiangong-lca/tidas-sdk/schemas', { paths: [repositoryRoot] }),
  );
  const parameters =
    schemas.ProcessSchema.shape.processDataSet.shape.processInformation.shape.mathematicalRelations.unwrap()
      .shape.variableParameter;
  const values = [
    { '@name': 'a', meanValue: '0' },
    { '@name': 'b', formula: 'a + 2' },
  ];
  assert.deepEqual(parameters.parse(values), values);
  assert.deepEqual(parameters.parse(values[0]), values[0]);
  assert.equal(parameters.safeParse([]).success, false);
  assert.equal(parameters.safeParse([values[0], { meanValue: '2' }]).success, false);
  const locations =
    schemas.FlowSchema.shape.flowDataSet.shape.flowInformation.shape.geography.unwrap().shape
      .locationOfSupply;
  assert.deepEqual(locations.parse(['DE', 'CN']), ['DE', 'CN']);
  const classifications =
    schemas.ContactSchema.shape.contactDataSet.shape.contactInformation.shape.dataSetInformation
      .shape.classificationInformation.shape['common:classification'];
  const systems = ['A', 'B'].map((name) => ({
    '@name': name,
    '@classes': `https://example.org/${name}`,
    'common:class': [{ '@level': '0', '@classId': name, '#text': name }],
  }));
  assert.deepEqual(classifications.parse(systems), systems);
  assert.equal(classifications.safeParse([]).success, false);
});

test('the installed SDK preserves scaling aliases separately and rejects ambiguous values', () => {
  const schemas = require(
    require.resolve('@tiangong-lca/tidas-sdk/schemas', { paths: [repositoryRoot] }),
  );
  const instances =
    schemas.LifeCycleModelSchema.shape.lifeCycleModelDataSet.shape.lifeCycleModelInformation.shape
      .technology.shape.processes.shape.processInstance;
  const instance = {
    '@dataSetInternalID': '0',
    '@multiplicationFactor': '1',
    referenceToProcess: {
      '@type': 'process data set',
      '@refObjectId': '11111111-1111-1111-1111-111111111111',
      '@version': '01.00.000',
      '@uri': '../processes/process.xml',
      'common:shortDescription': { '@xml:lang': 'en', '#text': 'Example process' },
    },
    parameters: { parameter: { '@name': 'p', '#text': '1.5' } },
  };
  assert.equal(instances.safeParse({ ...instance, scalingFactor: '0' }).success, true);
  assert.equal(instances.safeParse({ ...instance, scalingFactors: '0' }).success, true);
  assert.equal(
    instances.safeParse({ ...instance, scalingFactor: '0', scalingFactors: '0' }).success,
    false,
  );
  assert.equal(
    instances.safeParse({ ...instance, parameters: { parameter: { '#text': '1.5' } } }).success,
    false,
  );
});

test('descriptive paragraph limits match the installed SDK fields', () => {
  const schemas = require(
    require.resolve('@tiangong-lca/tidas-sdk/schemas', { paths: [repositoryRoot] }),
  );
  const lcia = schemas.LCIAMethodSchema.shape.LCIAMethodDataSet;
  const lciaInfo = lcia.shape.LCIAMethodInformation;
  const normalization = lcia.shape.modellingAndValidation.shape.LCIAMethodNormalisationAndWeighting;
  const parameter =
    schemas.ProcessSchema.shape.processDataSet.shape.processInformation.shape.mathematicalRelations
      .unwrap()
      .shape.variableParameter.unwrap().options[0];
  const unit = schemas.UnitGroupSchema.shape.unitGroupDataSet.shape.units.shape.unit.options[0];
  const cases = [
    [
      'Source description',
      schemas.SourceSchema.shape.sourceDataSet.shape.sourceInformation.shape.dataSetInformation
        .shape.sourceDescriptionOrComment,
    ],
    [
      'Contact description',
      schemas.ContactSchema.shape.contactDataSet.shape.contactInformation.shape.dataSetInformation
        .shape.contactDescriptionOrComment,
      1000,
    ],
    ['Process variable comment', parameter.shape.comment, 500],
    ['Unit comment', unit.shape.generalComment, 500],
    ['LCIA time description', lciaInfo.shape.time.shape.timeRepresentativenessDescription],
    ['LCIA principle deviations', normalization.shape.deviationsFromLCIAMethodPrinciple],
    ['LCIA mechanisms', lciaInfo.shape.impactModel.shape.consideredMechanisms, 1000],
    ['LCIA normalization description', normalization.shape.normalisationDescription, 1000],
    ['LCIA weighting description', normalization.shape.weightingDescription, 1000],
    [
      'LCIA recommendation meaning',
      lcia.shape.administrativeInformation.shape.dataEntryBy.shape.recommendationBy.shape.meaning,
    ],
  ];
  // Geography is an intersection that also owns a separate location constraint.
  assert.equal(
    lciaInfo.shape.geography.safeParse({
      geographicalRepresentativenessDescription: { '@xml:lang': 'en', '#text': 'A'.repeat(2001) },
    }).success,
    true,
  );
  for (const [label, schema, limit] of cases) {
    const value = { '@xml:lang': 'en', '#text': 'A'.repeat(limit ?? 2001) };
    assert.equal(schema.safeParse(value).success, true, `${label} accepts its complete text`);
    if (limit !== undefined) {
      const outcome = schema.safeParse({ ...value, '#text': `${value['#text']}A` });
      assert.equal(outcome.success, false, `${label} enforces its installed limit`);
      assert.ok(
        outcome.error.issues.some(
          (issue) => issue.code === 'too_big' && issue.path.at(-1) === '#text',
        ),
      );
    }
  }
});
