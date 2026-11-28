/**
 * Tests for life cycle model utilities
 * Path: src/services/lifeCycleModels/util.ts
 */

import { jsonToList } from '@/services/general/util';
import {
  genEdgeExchangeTableData,
  genLifeCycleModelData,
  genLifeCycleModelInfoFromData,
  genLifeCycleModelJsonOrdered,
  genLifeCycleModelNodeName,
  genNodeLabel,
  genPortLabel,
  genReferenceToResultingProcess,
  getLifeCycleModelPortFlowVersion,
  MissingLifeCycleModelFlowVersionError,
} from '@/services/lifeCycleModels/util';
import { createLifeCycleModel as createTidasLifeCycleModel } from '@tiangong-lca/tidas-sdk/core';

const createLangText = (text: string, lang = 'en') => ({ '@xml:lang': lang, '#text': text });

const createClassification = () => ({
  value: ['Systems', 'Unspecific parts'],
  id: ['class-0', 'class-1'],
});

const baseModelData = {
  lifeCycleModelInformation: {
    dataSetInformation: {
      name: {
        baseName: [createLangText('Model base name')],
        treatmentStandardsRoutes: [createLangText('Route info')],
        mixAndLocationTypes: [createLangText('Mix info')],
        functionalUnitFlowProperties: [createLangText('Unit info')],
      },
      classificationInformation: {
        'common:classification': {
          'common:class': createClassification(),
        },
      },
      referenceToResultingProcess: {
        '@refObjectId': 'proc-final',
        '@type': 'process data set',
        '@uri': '../processes/proc-final.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Final process')],
      },
      'common:generalComment': [createLangText('General remark')],
      referenceToExternalDocumentation: {
        '@refObjectId': 'doc-1',
        '@type': 'source data set',
        '@uri': '../sources/doc-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Documentation')],
      },
    },
    technology: {
      referenceToDiagram: {
        '@refObjectId': 'diagram-1',
        '@type': 'diagram',
        '@uri': '../diagram/diagram-1.svg',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Diagram description')],
      },
    },
  },
  modellingAndValidation: {
    dataSourcesTreatmentEtc: {
      useAdviceForDataSet: [createLangText('Advice')],
    },
    validation: {
      review: [
        {
          '@type': 'internal',
          'common:scope': [
            {
              '@name': 'scope-1',
              'common:method': {
                '@name': 'method-1',
              },
            },
          ],
          'common:dataQualityIndicators': {
            'common:dataQualityIndicator': [{ '@name': 'coverage', '@value': 'high' }],
          },
          'common:reviewDetails': [createLangText('Review details')],
          'common:referenceToNameOfReviewerAndInstitution': {
            '@refObjectId': 'reviewer-1',
            '@type': 'person',
            '@uri': '../contacts/reviewer-1.xml',
            '@version': '01.00.000',
            'common:shortDescription': [createLangText('Reviewer name')],
          },
          'common:otherReviewDetails': [createLangText('Other review')],
          'common:referenceToCompleteReviewReport': {
            '@refObjectId': 'report-1',
            '@type': 'document',
            '@uri': '../documents/report-1.pdf',
            '@version': '01.00.000',
            'common:shortDescription': [createLangText('Report')],
          },
        },
      ],
    },
    complianceDeclarations: {
      compliance: [
        {
          'common:referenceToComplianceSystem': {
            '@refObjectId': 'system-1',
            '@type': 'system',
            '@uri': '../compliance/system-1.xml',
            '@version': '01.00.000',
            'common:shortDescription': [createLangText('Compliance system')],
          },
          'common:approvalOfOverallCompliance': 'approved',
          'common:nomenclatureCompliance': 'compliant',
          'common:methodologicalCompliance': 'compliant',
          'common:reviewCompliance': 'compliant',
          'common:documentationCompliance': 'compliant',
          'common:qualityCompliance': 'high',
        },
      ],
    },
  },
  administrativeInformation: {
    'common:commissionerAndGoal': {
      'common:referenceToCommissioner': {
        '@refObjectId': 'commissioner-1',
        '@type': 'organisation',
        '@uri': '../contacts/commissioner-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Commissioner name')],
      },
      'common:project': [createLangText('Project name')],
      'common:intendedApplications': [createLangText('Intended application')],
    },
    dataGenerator: {
      'common:referenceToPersonOrEntityGeneratingTheDataSet': {
        '@refObjectId': 'generator-1',
        '@type': 'person',
        '@uri': '../contacts/generator-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Generator name')],
      },
    },
    dataEntryBy: {
      'common:timeStamp': '2023-01-01',
      'common:referenceToDataSetFormat': {
        '@refObjectId': 'format-1',
        '@type': 'format',
        '@uri': '../formats/format-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Format name')],
      },
      'common:referenceToPersonOrEntityEnteringTheData': {
        '@refObjectId': 'entry-1',
        '@type': 'person',
        '@uri': '../contacts/entry-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Entry person')],
      },
    },
    publicationAndOwnership: {
      'common:dataSetVersion': '01.00.000',
      'common:permanentDataSetURI': 'https://example.com/dataset',
      'common:referenceToOwnershipOfDataSet': {
        '@refObjectId': 'owner-1',
        '@type': 'organisation',
        '@uri': '../contacts/owner-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Owner name')],
      },
      'common:copyright': '© Example',
      'common:referenceToEntitiesWithExclusiveAccess': {
        '@refObjectId': 'exclusive-1',
        '@type': 'organisation',
        '@uri': '../contacts/exclusive-1.xml',
        '@version': '01.00.000',
        'common:shortDescription': [createLangText('Exclusive access entity')],
      },
      'common:licenseType': 'CC-BY',
      'common:accessRestrictions': [createLangText('None')],
    },
  },
  model: {
    nodes: [
      {
        id: 'node-a',
        data: {
          index: '0',
          id: 'proc-a',
          version: '01.00.000',
          shortDescription: [createLangText('Process A')],
          multiplicationFactor: '2',
          scalingFactor: '1.25',
          quantitativeReference: '1',
        },
      },
      {
        id: 'node-b',
        data: {
          index: '1',
          id: 'proc-b',
          version: '02.00.000',
          shortDescription: [createLangText('Process B')],
        },
      },
    ],
    edges: [
      {
        source: { cell: 'node-a' },
        target: { cell: 'node-b' },
        data: {
          connection: {
            outputExchange: {
              '@flowUUID': 'flow-1',
              '@version': '01.01.000',
              downstreamProcess: {
                '@flowUUID': 'flow-2',
                '@version': '02.02.000',
              },
            },
          },
        },
      },
    ],
  },
};

describe('genNodeLabel', () => {
  it('should truncate long labels for non-Chinese languages based on node width', () => {
    const label = 'Alpha; Beta; Gamma; Delta';

    const result = genNodeLabel(label, 'en', 140);

    expect(result).toBe('Alpha; Beta; Gam...');
  });

  it('should use wider truncation threshold for Chinese language', () => {
    const label = '阿尔法贝塔伽玛德尔塔阿尔法贝塔伽玛德尔塔';

    const result = genNodeLabel(label, 'zh', 240);

    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThan(label.length);
  });

  it('should keep short labels unchanged', () => {
    expect(genNodeLabel('Short label', 'en', 300)).toBe('Short label');
  });
});

describe('genPortLabel', () => {
  it('should truncate port labels and preserve tooltip text', () => {
    const label = 'Long Output Flow Name';

    const result = genPortLabel(label, 'en', 140);

    expect(result).toBe('Long Outpu...');
  });

  it('should shorten Chinese port labels with adjusted width divisor', () => {
    const label = '非常长的端口名称需要截断才行';

    const result = genPortLabel(label, 'zh', 240);

    expect(result.endsWith('...')).toBe(true);
  });

  it('should keep short port labels unchanged', () => {
    expect(genPortLabel('Port', 'en', 300)).toBe('Port');
  });
});

it('retains exact product references and their captions across the Model form round trip', () => {
  const original = structuredClone(baseModelData);
  const main = original.lifeCycleModelInformation.dataSetInformation.referenceToResultingProcess;
  const secondary = {
    ...main,
    '@refObjectId': 'secondary-result',
    '@version': '02.00.000',
    'common:shortDescription': [createLangText('Independent product')],
  };
  const refs = [main, secondary];
  Object.assign(original.lifeCycleModelInformation.dataSetInformation, {
    referenceToResultingProcess: refs,
  });
  const form = genLifeCycleModelInfoFromData(original);
  const serialized = genLifeCycleModelJsonOrdered('model-uuid', form);
  expect(
    serialized.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation
      .referenceToResultingProcess,
  ).toEqual(
    refs.map((reference) => ({
      ...reference,
      'common:shortDescription': reference['common:shortDescription'][0],
    })),
  );
});

describe('genReferenceToResultingProcess', () => {
  it('should return original data when process list is empty or data is missing', () => {
    const data = {
      lifeCycleModelDataSet: { lifeCycleModelInformation: { dataSetInformation: {} } },
    };

    expect(genReferenceToResultingProcess([], '01.00.000', data)).toBe(data);
    expect(genReferenceToResultingProcess(null, '01.00.000', data)).toBe(data);
    expect(
      genReferenceToResultingProcess(
        [{ modelInfo: { id: 'proc-1' }, data: {} }],
        '01.00.000',
        null,
      ),
    ).toBeNull();
  });

  it('should attach resulting process references with generated short descriptions', () => {
    const data = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          dataSetInformation: {},
        },
      },
    };

    const result = genReferenceToResultingProcess(
      [
        {
          modelInfo: { id: 'proc-1' },
          data: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  name: {
                    baseName: [createLangText('Process One')],
                  },
                },
              },
            },
          },
        },
      ],
      '01.00.000',
      data,
    );

    expect(
      result.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation
        .referenceToResultingProcess,
    ).toEqual([
      expect.objectContaining({
        '@refObjectId': 'proc-1',
        '@type': 'process data set',
        '@uri': '../processes/proc-1.xml',
        '@version': '01.00.000',
      }),
    ]);
  });
});

describe('genLifeCycleModelJsonOrdered', () => {
  it('should build ordered ILCD JSON with sequential internal IDs and references', () => {
    const result = genLifeCycleModelJsonOrdered('model-123', baseModelData);

    // After removing oldData parameter, the function uses default xmlns values
    expect(result.lifeCycleModelDataSet['@xmlns']).toBe(
      'http://eplca.jrc.ec.europa.eu/ILCD/LifeCycleModel/2017',
    );
    expect(result.lifeCycleModelDataSet['@xsi:schemaLocation']).toBeDefined();

    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];

    expect(Array.isArray(processes)).toBe(true);
    expect(processes).toHaveLength(2);
    expect(processes[0]['@dataSetInternalID']).toBe('0');
    expect(processes[1]['@dataSetInternalID']).toBe('1');

    expect(
      result.lifeCycleModelDataSet.lifeCycleModelInformation.quantitativeReference
        .referenceToReferenceProcess,
    ).toBe(0);

    expect(processes[0].referenceToProcess['@refObjectId']).toBe('proc-a');
    expect(processes[0].referenceToProcess['@uri']).toBe('../processes/proc-a.xml');

    const firstOutput = processes[0].connections.outputExchange;
    expect(firstOutput['@flowUUID']).toBe('flow-1');
    expect(firstOutput['@version']).toBe('01.01.000');
    expect(firstOutput.downstreamProcess['@id']).toBe('1');
    expect(firstOutput.downstreamProcess['@flowUUID']).toBe('flow-2');
    expect(firstOutput.downstreamProcess['@version']).toBe('02.02.000');
  });

  it('should satisfy the TIDAS SDK connection Flow version contract', () => {
    const result = genLifeCycleModelJsonOrdered('model-sdk-flow-version', baseModelData);
    const validation = createTidasLifeCycleModel(result).validateEnhanced();
    const issues = validation.success ? [] : validation.error.issues;
    const connectionVersionIssues = issues.filter((issue) => {
      const path = issue.path.map(String);
      return path.includes('outputExchange') && path.includes('@version');
    });

    expect(connectionVersionIssues).toEqual([]);
  });

  it('should recover missing edge Flow versions from the matching source and target ports', () => {
    const result = genLifeCycleModelJsonOrdered('model-port-version-fallback', {
      ...baseModelData,
      model: {
        nodes: [
          {
            ...baseModelData.model.nodes[0],
            ports: {
              items: [
                {
                  id: 'OUTPUT:flow-1',
                  group: 'groupOutput',
                  data: { flowId: 'flow-1', flowVersion: '03.01.004' },
                },
              ],
            },
          },
          {
            ...baseModelData.model.nodes[1],
            ports: {
              items: [
                {
                  id: 'INPUT:flow-2',
                  group: 'groupInput',
                  data: { flowId: 'flow-2', flowVersion: '04.02.005' },
                },
              ],
            },
          },
        ],
        edges: [
          {
            id: 'edge-port-version-fallback',
            source: { cell: 'node-a' },
            target: { cell: 'node-b' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-1',
                  downstreamProcess: { '@flowUUID': 'flow-2' },
                },
              },
            },
          },
        ],
      },
    });

    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];
    const outputExchange = processes[0].connections.outputExchange;

    expect(outputExchange['@version']).toBe('03.01.004');
    expect(outputExchange.downstreamProcess['@version']).toBe('04.02.005');
  });

  it('should prefer versions already persisted on the edge over port fallback values', () => {
    const result = genLifeCycleModelJsonOrdered('model-edge-version-precedence', {
      ...baseModelData,
      model: {
        nodes: baseModelData.model.nodes.map((node, index) => ({
          ...node,
          ports: {
            items: [
              {
                id: index === 0 ? 'OUTPUT:flow-1' : 'INPUT:flow-2',
                group: index === 0 ? 'groupOutput' : 'groupInput',
                data: {
                  flowId: index === 0 ? 'flow-1' : 'flow-2',
                  flowVersion: '99.99.999',
                },
              },
            ],
          },
        })),
        edges: [
          {
            ...baseModelData.model.edges[0],
            source: { cell: 'node-a', port: 'OUTPUT:flow-1' },
            target: { cell: 'node-b', port: 'INPUT:flow-2' },
          },
        ],
      },
    });

    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];
    const outputExchange = processes[0].connections.outputExchange;

    expect(outputExchange['@version']).toBe('01.01.000');
    expect(outputExchange.downstreamProcess['@version']).toBe('02.02.000');
  });

  it('should keep process instances connection-free when the graph has no edge collection', () => {
    const result = genLifeCycleModelJsonOrdered('model-without-edges', {
      ...baseModelData,
      model: {
        nodes: baseModelData.model.nodes,
      },
    });
    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];

    expect(processes).toHaveLength(2);
    expect(processes[0].connections).toBeUndefined();
  });

  it('should reject a connection when the source output Flow version cannot be resolved', () => {
    expect(() =>
      genLifeCycleModelJsonOrdered('model-missing-output-version', {
        ...baseModelData,
        model: {
          ...baseModelData.model,
          edges: [
            {
              id: 'edge-missing-output-version',
              source: { cell: 'node-a', port: 'OUTPUT:flow-1' },
              target: { cell: 'node-b', port: 'INPUT:flow-2' },
              data: {
                connection: {
                  outputExchange: {
                    '@flowUUID': 'flow-1',
                    '@version': '   ',
                    downstreamProcess: {
                      '@flowUUID': 'flow-2',
                      '@version': '02.02.000',
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/outputExchange\.@version.*flow-1/i);
  });

  it('should reject a connection when the target input Flow version cannot be resolved', () => {
    expect(() =>
      genLifeCycleModelJsonOrdered('model-missing-downstream-version', {
        ...baseModelData,
        model: {
          ...baseModelData.model,
          edges: [
            {
              id: 'edge-missing-downstream-version',
              source: { cell: 'node-a', port: 'OUTPUT:flow-1' },
              target: { cell: 'node-b', port: 'INPUT:flow-2' },
              data: {
                connection: {
                  outputExchange: {
                    '@flowUUID': 'flow-1',
                    '@version': '01.01.000',
                    downstreamProcess: { '@flowUUID': 'flow-2' },
                  },
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/downstreamProcess\.@version.*flow-2/i);
  });

  it('should preserve empty downstreamProcess placeholders when an edge target node is missing', () => {
    const result = genLifeCycleModelJsonOrdered('model-missing-node', {
      ...baseModelData,
      model: {
        ...baseModelData.model,
        edges: [
          {
            source: { cell: 'node-a' },
            target: { cell: 'missing-node' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-missing',
                  '@version': '01.00.000',
                  downstreamProcess: {},
                },
              },
            },
          },
        ],
      },
    });

    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];

    expect(processes[0].connections.outputExchange['@flowUUID']).toBe('flow-missing');
    expect(processes[0].connections.outputExchange.downstreamProcess).toEqual({});
  });

  it('should group multiple downstream processes under one output flow UUID', () => {
    const data = {
      ...baseModelData,
      model: {
        nodes: [
          ...baseModelData.model.nodes,
          {
            id: 'node-c',
            data: {
              index: '2',
              id: 'proc-c',
              version: '03.00.000',
              shortDescription: [createLangText('Process C')],
            },
          },
        ],
        edges: [
          ...baseModelData.model.edges,
          {
            source: { cell: 'node-a' },
            target: { cell: 'node-c' },
            data: {
              connection: {
                outputExchange: {
                  '@flowUUID': 'flow-1',
                  '@version': '01.01.000',
                  downstreamProcess: {
                    '@flowUUID': 'flow-3',
                    '@version': '03.03.000',
                  },
                },
              },
            },
          },
        ],
      },
    };

    const result = genLifeCycleModelJsonOrdered('model-123', data);
    const processes = result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
      .processInstance as any[];
    const groupedOutput = processes[0].connections.outputExchange;

    expect(groupedOutput['@flowUUID']).toBe('flow-1');
    expect(groupedOutput['@version']).toBe('01.01.000');
    expect(groupedOutput.downstreamProcess).toEqual([
      expect.objectContaining({
        '@id': '1',
        '@flowUUID': 'flow-2',
        '@version': '02.02.000',
      }),
      expect.objectContaining({
        '@id': '2',
        '@flowUUID': 'flow-3',
        '@version': '03.03.000',
      }),
    ]);
  });

  it('should keep sparse process, review, and compliance records structurally valid when optional fields are missing', () => {
    const result = genLifeCycleModelJsonOrdered('model-sparse', {
      lifeCycleModelInformation: {
        dataSetInformation: {},
      },
      modellingAndValidation: {
        validation: {
          review: [
            {
              'common:reviewDetails': [createLangText('Sparse review')],
              'common:scope': [
                {
                  'common:method': { '@name': 'method-sparse' },
                },
              ],
              'common:dataQualityIndicators': {
                'common:dataQualityIndicator': [{ '@name': 'coverage' }],
              },
              'common:referenceToNameOfReviewerAndInstitution': { '@type': 'person' },
              'common:referenceToCompleteReviewReport': { '@type': 'document' },
            },
          ],
        },
        complianceDeclarations: {
          compliance: [
            {
              'common:approvalOfOverallCompliance': 'approved',
              'common:referenceToComplianceSystem': { '@type': 'system' },
            },
          ],
        },
      },
      model: {
        nodes: [
          {
            id: 'node-sparse',
            data: {},
          },
        ],
        edges: [],
      },
    });

    const process = jsonToList(
      result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes.processInstance,
    )[0] as any;
    const review = jsonToList(
      result.lifeCycleModelDataSet.modellingAndValidation.validation.review,
    )[0] as any;
    const compliance = jsonToList(
      result.lifeCycleModelDataSet.modellingAndValidation.complianceDeclarations.compliance,
    )[0] as any;

    expect(process.referenceToProcess).toEqual(
      expect.objectContaining({
        '@type': 'process data set',
        '@uri': '../processes/undefined.xml',
      }),
    );
    expect(review['common:scope']).toEqual(
      expect.objectContaining({
        'common:method': { '@name': 'method-sparse' },
      }),
    );
    expect(review['common:dataQualityIndicators']['common:dataQualityIndicator']).toEqual(
      expect.objectContaining({
        '@name': 'coverage',
      }),
    );
    expect(review['common:referenceToNameOfReviewerAndInstitution']).toEqual(
      expect.objectContaining({
        '@type': 'person',
      }),
    );
    expect(review['common:referenceToCompleteReviewReport']).toEqual(
      expect.objectContaining({
        '@type': 'document',
      }),
    );
    expect(compliance['common:referenceToComplianceSystem']).toEqual(
      expect.objectContaining({
        '@type': 'system',
      }),
    );
    expect(compliance['common:approvalOfOverallCompliance']).toBe('approved');
  });

  it('should keep identifier-only review and compliance references when secondary fields are missing', () => {
    const result = genLifeCycleModelJsonOrdered('model-sparse-refs', {
      lifeCycleModelInformation: {
        dataSetInformation: {},
      },
      modellingAndValidation: {
        validation: {
          review: [
            {
              'common:reviewDetails': [createLangText('Sparse review refs')],
              'common:scope': [
                {
                  '@name': 'scope-sparse',
                  'common:method': {},
                },
              ],
              'common:dataQualityIndicators': {
                'common:dataQualityIndicator': [{ '@value': 'high' }],
              },
              'common:referenceToNameOfReviewerAndInstitution': {
                '@refObjectId': 'reviewer-sparse',
              },
              'common:referenceToCompleteReviewReport': {
                '@refObjectId': 'report-sparse',
              },
            },
          ],
        },
        complianceDeclarations: {
          compliance: [
            {
              'common:referenceToComplianceSystem': {
                '@refObjectId': 'system-sparse',
              },
            },
          ],
        },
      },
      model: {
        nodes: [
          {
            id: 'node-sparse-refs',
            data: {
              index: '5',
            },
          },
        ],
        edges: [],
      },
    });

    const review = jsonToList(
      result.lifeCycleModelDataSet.modellingAndValidation.validation.review,
    )[0] as any;
    const compliance = jsonToList(
      result.lifeCycleModelDataSet.modellingAndValidation.complianceDeclarations.compliance,
    )[0] as any;

    expect(review['common:scope']).toEqual(
      expect.objectContaining({
        '@name': 'scope-sparse',
      }),
    );
    expect(review['common:dataQualityIndicators']['common:dataQualityIndicator']).toEqual(
      expect.objectContaining({
        '@value': 'high',
      }),
    );
    expect(review['common:referenceToNameOfReviewerAndInstitution']).toEqual(
      expect.objectContaining({
        '@refObjectId': 'reviewer-sparse',
      }),
    );
    expect(review['common:referenceToCompleteReviewReport']).toEqual(
      expect.objectContaining({
        '@refObjectId': 'report-sparse',
      }),
    );
    expect(compliance['common:referenceToComplianceSystem']).toEqual(
      expect.objectContaining({
        '@refObjectId': 'system-sparse',
      }),
    );
  });
});

describe('connection Flow version helpers', () => {
  it('resolves Flow versions by exact port, Flow id, and direction-derived port id', () => {
    const node = {
      id: 'node-flow-versions',
      ports: {
        items: [
          {
            id: 'INPUT:flow-output',
            group: 'groupInput',
            data: { flowId: 'flow-output', flowVersion: '90.00.000' },
          },
          {
            id: 'OUTPUT:flow-output',
            group: 'groupOutput',
            data: { flowVersion: '01.02.003' },
          },
          {
            id: 'custom-input-port',
            group: 'groupInput',
            data: { flowId: 'flow-input', flowVersion: '04.05.006' },
          },
          {
            id: 'bad-version-port',
            group: 'groupOutput',
            data: { flowId: 'flow-bad', flowVersion: 123 },
          },
        ],
      },
    } as any;

    expect(
      getLifeCycleModelPortFlowVersion(
        node,
        'custom-input-port',
        'ignored-by-exact-port',
        'groupInput',
      ),
    ).toBe('04.05.006');
    expect(getLifeCycleModelPortFlowVersion(node, undefined, 'flow-output', 'groupOutput')).toBe(
      '01.02.003',
    );
    expect(getLifeCycleModelPortFlowVersion(node, undefined, 'flow-input', 'groupInput')).toBe(
      '04.05.006',
    );
    expect(
      getLifeCycleModelPortFlowVersion(node, 'bad-version-port', 'flow-bad', 'groupOutput'),
    ).toBeUndefined();
    expect(
      getLifeCycleModelPortFlowVersion(undefined, undefined, undefined, 'groupOutput'),
    ).toBeUndefined();
  });

  it('describes unresolved sparse connections without substituting another version', () => {
    const error = new MissingLifeCycleModelFlowVersionError({
      fieldPath: 'outputExchange.@version',
      flowUUID: 'flow-sparse',
      role: 'outputExchange',
    });

    expect(error.message).toContain('edge "unknown"');
    expect(error.message).toContain('node "unknown"');
    expect(error.message).toContain('port "unknown"');
  });
});

describe('genLifeCycleModelInfoFromData', () => {
  it('should convert ordered dataset back to form-friendly data structures', () => {
    const ordered = genLifeCycleModelJsonOrdered('model-456', baseModelData);

    const result = genLifeCycleModelInfoFromData(ordered.lifeCycleModelDataSet);

    const baseName = result.lifeCycleModelInformation.dataSetInformation.name.baseName;
    expect(Array.isArray(baseName)).toBe(true);
    const baseNameList = Array.isArray(baseName) ? baseName : [baseName];
    expect(baseNameList[0]).toEqual(createLangText('Model base name'));

    expect(result.lifeCycleModelInformation.quantitativeReference.referenceToReferenceProcess).toBe(
      '0',
    );

    const rawClassification =
      result.lifeCycleModelInformation.dataSetInformation.classificationInformation[
        'common:classification'
      ];
    const classification = Array.isArray(rawClassification)
      ? rawClassification[0]?.['common:class']
      : rawClassification?.['common:class'];
    const classificationList = classification as { id?: string[]; value?: string[] };
    expect(classificationList.value).toEqual(['Systems', 'Unspecific parts']);
    expect(classificationList.id).toEqual(['class-0', 'class-1']);
  });

  it('should preserve review and compliance collections after round-tripping', () => {
    const ordered = genLifeCycleModelJsonOrdered('model-789', baseModelData);

    const result = genLifeCycleModelInfoFromData(ordered.lifeCycleModelDataSet);
    const reviewList = Array.isArray(result.modellingAndValidation.validation.review)
      ? result.modellingAndValidation.validation.review
      : [result.modellingAndValidation.validation.review];
    const complianceValue = (
      result.modellingAndValidation.complianceDeclarations as { compliance: unknown }
    ).compliance;
    const complianceList = Array.isArray(complianceValue) ? complianceValue : [complianceValue];
    const review = reviewList[0] as any;
    const compliance = complianceList[0] as any;

    expect(review['@type']).toBe('internal');
    expect(review['common:scope']).toEqual([
      expect.objectContaining({
        '@name': 'scope-1',
        'common:method': expect.objectContaining({ '@name': 'method-1' }),
      }),
    ]);
    expect(review['common:referenceToCompleteReviewReport']['@refObjectId']).toBe('report-1');
    expect(compliance['common:referenceToComplianceSystem']['@refObjectId']).toBe('system-1');
    expect(compliance['common:approvalOfOverallCompliance']).toBe('approved');
  });

  it('should fallback common:UUID to "-" when the ordered dataset omits it', () => {
    const ordered = genLifeCycleModelJsonOrdered('model-uuid-fallback', baseModelData);
    delete ordered.lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation[
      'common:UUID'
    ];

    const result = genLifeCycleModelInfoFromData(ordered.lifeCycleModelDataSet);

    expect(result.lifeCycleModelInformation.dataSetInformation['common:UUID']).toBe('-');
  });

  it('should keep the reference process unset when the ordered dataset omits it', () => {
    const ordered = genLifeCycleModelJsonOrdered('model-reference-fallback', baseModelData);
    delete ordered.lifeCycleModelDataSet.lifeCycleModelInformation.quantitativeReference
      .referenceToReferenceProcess;

    const result = genLifeCycleModelInfoFromData(ordered.lifeCycleModelDataSet);

    expect(
      result.lifeCycleModelInformation.quantitativeReference.referenceToReferenceProcess,
    ).toBeUndefined();
  });
});

describe('genLifeCycleModelNodeName', () => {
  it('keeps structured process names unchanged', () => {
    expect(
      genLifeCycleModelNodeName(
        {
          label: {
            baseName: [createLangText('Structured process')],
            treatmentStandardsRoutes: [createLangText('Route')],
          },
        },
        'en',
      ),
    ).toBe('Structured process; Route');
  });

  it('resolves multilingual arrays and single multilingual objects', () => {
    const label = [createLangText('English process'), createLangText('中文过程', 'zh')];

    expect(genLifeCycleModelNodeName({ label }, 'zh')).toBe('中文过程');
    expect(genLifeCycleModelNodeName({ label: createLangText('Single process', 'en') }, 'en')).toBe(
      'Single process',
    );
  });

  it('falls back through shortDescription, string label, process id, and placeholder', () => {
    expect(
      genLifeCycleModelNodeName(
        {
          id: 'process-id',
          label: 'String label',
          shortDescription: [createLangText('Short description')],
        },
        'en',
      ),
    ).toBe('Short description');
    expect(
      genLifeCycleModelNodeName(
        {
          label: { baseName: [] },
          shortDescription: ' String short description ',
        },
        'en',
      ),
    ).toBe('String short description');
    expect(
      genLifeCycleModelNodeName(
        {
          id: 'process-id',
          label: ' String label ',
          shortDescription: ' ',
        },
        'en',
      ),
    ).toBe('String label');
    expect(genLifeCycleModelNodeName({ id: 'process-id', label: ' String label ' }, 'en')).toBe(
      'String label',
    );
    expect(genLifeCycleModelNodeName({ id: ' process-id ', label: {} }, 'en')).toBe('process-id');
    expect(
      genLifeCycleModelNodeName(
        {
          id: 'process-id',
          label: [{ '@xml:lang': 'unsupported', '#text': 'Unsupported language' }],
        },
        'en',
      ),
    ).toBe('process-id');
    expect(genLifeCycleModelNodeName({ id: 'process-id', label: ' ' }, 'en')).toBe('process-id');
    expect(genLifeCycleModelNodeName({ id: ' ', label: null }, 'en')).toBe('-');
    expect(genLifeCycleModelNodeName({ label: {} }, 'en')).toBe('-');
    expect(genLifeCycleModelNodeName(undefined, 'en')).toBe('-');
  });

  it('does not mutate the persisted node label while resolving display text', () => {
    const nodeData = {
      id: 'process-id',
      label: [createLangText('English process'), createLangText('中文过程', 'zh')],
      shortDescription: [createLangText('Fallback')],
    };
    const originalData = JSON.parse(JSON.stringify(nodeData));

    expect(genLifeCycleModelNodeName(nodeData, 'zh')).toBe('中文过程');
    expect(nodeData).toEqual(originalData);
  });
});

describe('genLifeCycleModelData', () => {
  it('should derive node and port labels based on language preferences', () => {
    const sample = {
      xflow: {
        nodes: [
          {
            id: 'node-a',
            width: 140,
            label: 'should be replaced',
            data: {
              label: {
                baseName: [createLangText('Alpha process')],
                treatmentStandardsRoutes: [createLangText('Route info')],
                mixAndLocationTypes: [createLangText('Mix info')],
                functionalUnitFlowProperties: [createLangText('Unit info')],
              },
            },
            ports: {
              items: [
                {
                  id: 'port-1',
                  data: {
                    textLang: [createLangText('Long Output Flow Name')],
                  },
                  attrs: {
                    text: {
                      text: 'original',
                    },
                  },
                },
              ],
            },
          },
        ],
        edges: [{ id: 'edge-1' }],
      },
    };

    const result = genLifeCycleModelData(sample, 'en');

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].label).toBe('Alpha process; R...');
    expect(result.nodes[0].ports.items[0].attrs.text.text).toBe('Long Outpu...');
    expect(result.nodes[0].ports.items[0].attrs.text.title).toBe('Long Output Flow Name');
    expect(result.nodes[0].ports.items[0].tools).toEqual([{ id: 'portTool' }]);
    expect(result.edges).toEqual(sample.xflow.edges);
  });

  it('should use fallback width, labels, and empty edge defaults', () => {
    const sample = {
      xflow: {
        nodes: [
          {
            id: 'node-fallback',
            data: {},
            ports: {
              items: [
                {
                  id: 'port-fallback',
                  data: {},
                  attrs: {
                    text: {},
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const result = genLifeCycleModelData(sample as any, 'en');

    expect(result.nodes[0].label).toBe('-');
    expect(result.nodes[0].ports.items[0].attrs.text.text).toBe('');
    expect(result.nodes[0].ports.items[0].attrs.text.title).toBeUndefined();
    expect(result.edges).toEqual([]);
  });

  it('should render multilingual node labels without rewriting xflow data', () => {
    const label = [createLangText('English process'), createLangText('中文过程', 'zh')];
    const sample = {
      xflow: {
        nodes: [
          {
            id: 'node-multilingual',
            width: 350,
            data: {
              id: 'process-id',
              label,
            },
          },
        ],
      },
    };
    const originalLabel = JSON.parse(JSON.stringify(label));

    const result = genLifeCycleModelData(sample as any, 'zh');

    expect(result.nodes[0].label).toBe('中文过程');
    expect(sample.xflow.nodes[0].data.label).toEqual(originalLabel);
  });

  it('should prefer node.size.width and attrs text when textLang is missing', () => {
    const sample = {
      xflow: {
        nodes: [
          {
            id: 'node-sized',
            width: 400,
            size: { width: 84, height: 40 },
            data: {
              label: {
                baseName: [createLangText('Compact label that should truncate')],
              },
            },
            ports: {
              items: [
                {
                  id: 'port-sized',
                  attrs: {
                    text: {
                      text: 'Fallback port name',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const result = genLifeCycleModelData(sample as any, 'en');

    expect(result.nodes[0].label).toBe('Compact ...');
    expect(result.nodes[0].ports.items[0].attrs.text.text).toBe('Fa...');
    expect(result.nodes[0].ports.items[0].attrs.text.title).toBe('Fallback port name');
  });

  it('should fallback to an empty node list when xflow nodes are missing', () => {
    const result = genLifeCycleModelData({ xflow: { edges: [{ id: 'edge-only' }] } } as any, 'en');

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([{ id: 'edge-only' }]);
  });
});

describe('genEdgeExchangeTableData', () => {
  it('should map exchange entries and fallback to defaults', () => {
    const data = [
      {
        id: 'edge-1',
        sourceProcessId: 'proc-a',
        sourceOutputFlowInternalID: 'in-1',
        sourceOutputFlowId: 'flow-a',
        sourceOutputFlowName: [createLangText('Output Flow')],
        sourceOutputFlowGeneralComment: [createLangText('Output comment')],
        targetProcessId: 'proc-b',
        targetInputFlowInternalID: 'in-2',
        targetInputFlowId: 'flow-b',
        targetInputFlowName: [createLangText('Input Flow')],
        targetInputFlowGeneralComment: null,
      },
    ];

    const result = genEdgeExchangeTableData(data, 'en');

    expect(result).toHaveLength(1);
    expect(result[0].sourceOutputFlowGeneralComment).toBe('Output comment');
    expect(result[0].targetInputFlowGeneralComment).toBe('-');
  });

  it('should keep provided targetInputFlowId instead of defaulting to "-"', () => {
    const data = [
      {
        id: 'edge-1',
        targetInputFlowId: 'flow-b',
      },
    ];

    const result = genEdgeExchangeTableData(data, 'en');

    expect(result[0].targetInputFlowId).toBe('flow-b');
  });

  it('should generate fallback ids and targetInputFlowId defaults', () => {
    const result = genEdgeExchangeTableData(
      [
        {
          sourceOutputFlowName: [createLangText('Only source')],
        },
      ] as any,
      'en',
    );

    expect(result[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result[0].targetInputFlowId).toBe('-');
  });

  it('should return empty array when input is nullish', () => {
    expect(genEdgeExchangeTableData(undefined, 'en')).toEqual([]);
    expect(genEdgeExchangeTableData(null, 'en')).toEqual([]);
  });
});

describe('ILCD model instance metadata preservation', () => {
  it('keeps parameters, scaling and group declarations when saving graph edits', () => {
    const instance = {
      '@dataSetInternalID': '7',
      scalingFactor: '0',
      parameters: { parameter: [{ '@name': 'x', '#text': '1.5' }] },
      groups: { memberOf: { '@groupId': 'g' } },
    };
    const groupDeclarations = { group: { '@id': 'g', name: 'Group' } };
    const data = JSON.parse(JSON.stringify(baseModelData)) as any;
    data.lifeCycleModelInformation.technology = {
      ...data.lifeCycleModelInformation.technology,
      groupDeclarations,
      processes: { processInstance: instance },
    };
    const form = genLifeCycleModelInfoFromData(data) as any;
    form.model = {
      nodes: [
        {
          id: 'node',
          data: { index: '7', id: 'process', version: '01.00.000', quantitativeReference: '1' },
        },
      ],
      edges: [],
    };
    const saved = genLifeCycleModelJsonOrdered('model', form).lifeCycleModelDataSet;
    expect(saved.lifeCycleModelInformation.technology.groupDeclarations).toEqual(groupDeclarations);
    expect(saved.lifeCycleModelInformation.technology.processes.processInstance).toMatchObject(
      instance,
    );
  });
});
