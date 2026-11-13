import {
  buildProcessExchangesRequiredValidationDetails,
  buildProcessQuantitativeReferenceValidationDetails,
  getProcessSdkIssueTabName,
  normalizeProcessSdkValidationDetails,
  processSdkValidationTestUtils,
} from '@/pages/Processes/sdkValidation';

describe('process sdk validation mapping', () => {
  it('maps invalid_union root issues to the concrete root form field', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          errors: [
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Unit process, single operation"',
                path: [],
                values: ['Unit process, single operation'],
              },
            ],
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Unit process, black box"',
                path: [],
                values: ['Unit process, black box'],
              },
            ],
          ],
          message: 'Invalid input',
          path: [
            'processDataSet',
            'modellingAndValidation',
            'LCIMethodAndAllocation',
            'typeOfDataSet',
          ],
          rawCode: 'invalid_union',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          modellingAndValidation: {
            LCIMethodAndAllocation: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'modellingAndValidation.LCIMethodAndAllocation.typeOfDataSet',
        formName: ['modellingAndValidation', 'LCIMethodAndAllocation', 'typeOfDataSet'],
        tabName: 'modellingAndValidation',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('maps annual supply volume required issues to the localized numeric text field', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Invalid input: expected object, received undefined',
          path: [
            'processDataSet',
            'modellingAndValidation',
            'dataSourcesTreatmentAndRepresentativeness',
            'annualSupplyOrProductionVolume',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          modellingAndValidation: {
            dataSourcesTreatmentAndRepresentativeness: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.annualSupplyOrProductionVolume.0.#text',
        formName: [
          'modellingAndValidation',
          'dataSourcesTreatmentAndRepresentativeness',
          'annualSupplyOrProductionVolume',
          0,
          '#text',
        ],
        tabName: 'modellingAndValidation',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('keeps missing review list issues on the validation section anchor', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Invalid input: expected object, received undefined',
          path: ['processDataSet', 'modellingAndValidation', 'validation', 'review'],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          modellingAndValidation: {
            validation: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'modellingAndValidation.validation.review',
        formName: ['modellingAndValidation', 'validation', 'review'],
        tabName: 'modellingAndValidation',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('maps quantitative-reference issues to the quantitative-reference exchange field', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          errors: [
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Reference flow(s)"',
                path: [],
                values: ['Reference flow(s)'],
              },
            ],
          ],
          message: 'Invalid input',
          path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
          rawCode: 'invalid_union',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'ref-output',
                exchangeDirection: 'Output',
                quantitativeReference: true,
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-1',
                },
              },
            ],
          },
          processInformation: {
            quantitativeReference: {
              referenceToReferenceFlow: 'ref-output',
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeInternalId: 'ref-output',
        fieldPath: 'exchange[#ref-output].quantitativeReference',
        formName: ['quantitativeReference'],
        tabName: 'exchanges',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('keeps non-missing enum issues as invalid values', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          errors: [
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Reference flow(s)"',
                path: [],
                values: ['Reference flow(s)'],
              },
            ],
          ],
          message: 'Invalid input',
          path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
          rawCode: 'invalid_union',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'ref-output',
                exchangeDirection: 'Output',
                quantitativeReference: true,
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-1',
                },
              },
            ],
          },
          processInformation: {
            quantitativeReference: {
              '@type': 'Unsupported type',
              referenceToReferenceFlow: 'ref-output',
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeInternalId: 'ref-output',
        fieldPath: 'exchange[#ref-output].quantitativeReference',
        formName: ['quantitativeReference'],
        tabName: 'exchanges',
        validationCode: 'invalid_value',
      }),
    ]);
  });

  it('suppresses quantitative-reference sdk field mapping when the selected reference-flow count is invalid', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          errors: [
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Reference flow(s)"',
                path: [],
                values: ['Reference flow(s)'],
              },
            ],
          ],
          message: 'Invalid input',
          path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
          rawCode: 'invalid_union',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'ref-output-1',
                exchangeDirection: 'Output',
                quantitativeReference: true,
              },
              {
                '@dataSetInternalID': 'ref-output-2',
                exchangeDirection: 'Output',
                quantitativeReference: true,
              },
            ],
          },
          processInformation: {
            quantitativeReference: {},
          },
        },
      },
    );

    expect(details).toEqual([]);
  });

  it('builds one exchanges summary message and highlights every selected reference flow when the count is invalid', () => {
    const details = buildProcessQuantitativeReferenceValidationDetails({
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'ref-input',
            exchangeDirection: 'Input',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-input',
            },
          },
          {
            '@dataSetInternalID': 'ref-output',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-output',
            },
          },
        ],
      },
    });

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'exchanges.quantitativeReferenceSummary',
        key: 'exchanges:quantitative-reference-count:section',
        presentation: 'section',
        tabName: 'exchanges',
        validationCode: 'quantitative_reference_count_invalid',
      }),
      expect.objectContaining({
        exchangeInternalId: 'ref-input',
        fieldPath: 'exchange[#ref-input].quantitativeReference',
        presentation: 'highlight-only',
        tabName: 'exchanges',
        validationCode: 'quantitative_reference_count_invalid',
      }),
      expect.objectContaining({
        exchangeInternalId: 'ref-output',
        fieldPath: 'exchange[#ref-output].quantitativeReference',
        presentation: 'highlight-only',
        tabName: 'exchanges',
        validationCode: 'quantitative_reference_count_invalid',
      }),
    ]);
  });

  it('uses localized flow labels when multiple selected reference flows are highlighted', () => {
    const details = buildProcessQuantitativeReferenceValidationDetails({
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'ref-output-1',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-output-1',
              'common:shortDescription': [{ '#text': 'Electricity' }],
            },
          },
          {
            '@dataSetInternalID': 'ref-output-2',
            exchangeDirection: 'Output',
            quantitativeReference: true,
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-output-2',
            },
          },
        ],
      },
    });

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'exchanges.quantitativeReferenceSummary',
        presentation: 'section',
      }),
      expect.objectContaining({
        exchangeFlowLabel: 'Electricity',
        exchangeInternalId: 'ref-output-1',
        presentation: 'highlight-only',
      }),
      expect.objectContaining({
        exchangeFlowLabel: 'flow-output-2',
        exchangeInternalId: 'ref-output-2',
        presentation: 'highlight-only',
      }),
    ]);
  });

  it('only builds an exchanges summary message when no reference flow is selected', () => {
    const details = buildProcessQuantitativeReferenceValidationDetails({
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'flow-a',
            exchangeDirection: 'Input',
            quantitativeReference: false,
          },
          {
            '@dataSetInternalID': 'flow-b',
            exchangeDirection: 'Output',
            quantitativeReference: false,
          },
        ],
      },
    });

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'exchanges.quantitativeReferenceSummary',
        key: 'exchanges:quantitative-reference-count:section',
        presentation: 'section',
        tabName: 'exchanges',
        validationCode: 'quantitative_reference_count_invalid',
      }),
    ]);
  });

  it('does not build an exchanges summary message when exactly one exchange is selected', () => {
    const details = buildProcessQuantitativeReferenceValidationDetails({
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'flow-a',
            exchangeDirection: 'Input',
            quantitativeReference: false,
          },
          {
            '@dataSetInternalID': 'flow-b',
            exchangeDirection: 'Output',
            quantitativeReference: true,
          },
        ],
      },
    });

    expect(details).toEqual([]);
  });

  it('ignores non-boolean quantitative-reference values when a reference flow is already resolved', () => {
    const details = buildProcessQuantitativeReferenceValidationDetails({
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': 'flow-a',
            exchangeDirection: 'Input',
            quantitativeReference: 'true',
          },
          {
            '@dataSetInternalID': 'flow-b',
            exchangeDirection: 'Output',
            quantitativeReference: false,
          },
        ],
      },
      processInformation: {
        quantitativeReference: {
          referenceToReferenceFlow: 'flow-b',
        },
      },
    });

    expect(details).toEqual([]);
  });

  it('builds an exchanges section message when no exchanges exist', () => {
    const details = buildProcessExchangesRequiredValidationDetails({
      processInformation: { name: 'Existing process' },
      exchanges: {},
    });

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'exchanges.requiredSummary',
        key: 'exchanges:required:section',
        presentation: 'section',
        tabName: 'exchanges',
        validationCode: 'exchanges_required',
      }),
    ]);
  });

  it('falls back to the processDataSet exchange list when the exchange payload is a single object', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          errors: [
            [
              {
                code: 'invalid_value',
                message: 'Invalid input: expected "Reference flow(s)"',
                path: [],
                values: ['Reference flow(s)'],
              },
            ],
          ],
          message: 'Invalid input',
          path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
          rawCode: 'invalid_union',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: {
              '@dataSetInternalID': 'resolved-ref',
              exchangeDirection: 'Output',
              quantitativeReference: false,
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-1',
              },
            },
          },
          processInformation: {
            quantitativeReference: {
              referenceToReferenceFlow: 'resolved-ref',
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeIndex: 0,
        exchangeInternalId: undefined,
        fieldPath: 'quantitativeReference',
        formName: ['quantitativeReference'],
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('maps exchange-level general-comment issues to localized exchange field labels', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'string_too_short',
          input: '',
          message: 'Too short',
          minimum: 3,
          path: ['processDataSet', 'exchanges', 'exchange', 0, 'generalComment', 1, '#text'],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Input',
                generalComment: [
                  { '@xml:lang': 'en', '#text': 'Alpha' },
                  { '@xml:lang': 'zh-CN', '#text': '' },
                ],
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-1',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Water flow' }],
                },
              },
            ],
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeDirection: 'input',
        exchangeFlowId: 'flow-1',
        exchangeFlowLabel: 'Water flow',
        exchangeInternalId: 'exchange-1',
        fieldLabel: 'Comment (ZH-CN)',
        fieldPath: 'exchange[#exchange-1].generalComment.1.#text',
        formName: ['generalComment', 1, '#text'],
        reasonMessage: 'Text length 0 is below minimum 3',
        suggestedFix: 'Expand this text to at least 3 characters.',
        validationCode: 'string_too_short',
      }),
    ]);
  });

  it('maps indexed zh exchange comment localized-text issues to the matching exchange row', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'localized_text_zh_must_include_chinese_character',
          message:
            "@xml:lang values starting with 'zh' must include at least one Chinese character",
          path: ['processDataSet', 'exchanges', 'exchange', 1, 'generalComment', 1, '#text'],
          rawCode: 'custom',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Output',
                generalComment: [{ '@xml:lang': 'en', '#text': 'Output comment' }],
              },
              {
                '@dataSetInternalID': 'exchange-2',
                exchangeDirection: 'Input',
                generalComment: [
                  { '@xml:lang': 'en', '#text': 'Input comment' },
                  { '@xml:lang': 'zh-CN', '#text': 'Input comment without Chinese text' },
                ],
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-2',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Input flow' }],
                },
              },
            ],
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeDirection: 'input',
        exchangeFlowId: 'flow-2',
        exchangeFlowLabel: 'Input flow',
        exchangeIndex: 1,
        exchangeInternalId: 'exchange-2',
        fieldLabel: 'Comment (ZH-CN)',
        fieldPath: 'exchange[#exchange-2].generalComment.1.#text',
        formName: ['generalComment', 1, '#text'],
        reasonMessage:
          "@xml:lang values starting with 'zh' must include at least one Chinese character",
        tabName: 'exchanges',
        validationCode: 'localized_text_zh_must_include_chinese_character',
      }),
    ]);
  });

  it('maps single-entry root localized-text leaf issues to the indexed process form leaf', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'localized_text_en_must_not_contain_chinese_character',
          message: "@xml:lang values starting with 'en' must not contain Chinese characters",
          path: [
            'processDataSet',
            'processInformation',
            'time',
            'common:timeRepresentativenessDescription',
            '#text',
          ],
          rawCode: 'custom',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          processInformation: {
            time: {
              'common:timeRepresentativenessDescription': {
                '@xml:lang': 'en',
                '#text': '中文',
              },
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'processInformation.time.common:timeRepresentativenessDescription.0.#text',
        formName: [
          'processInformation',
          'time',
          'common:timeRepresentativenessDescription',
          0,
          '#text',
        ],
        tabName: 'processInformation',
        validationCode: 'localized_text_en_must_not_contain_chinese_character',
      }),
    ]);
  });

  it('maps single-entry exchange localized-text leaf issues to the indexed exchange form leaf', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'localized_text_en_must_not_contain_chinese_character',
          message: "@xml:lang values starting with 'en' must not contain Chinese characters",
          path: ['processDataSet', 'exchanges', 'exchange', 0, 'generalComment', '#text'],
          rawCode: 'custom',
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Input',
                generalComment: {
                  '@xml:lang': 'en',
                  '#text': '中文',
                },
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-1',
                },
              },
            ],
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeInternalId: 'exchange-1',
        fieldPath: 'exchange[#exchange-1].generalComment.0.#text',
        formName: ['generalComment', 0, '#text'],
        tabName: 'exchanges',
        validationCode: 'localized_text_en_must_not_contain_chinese_character',
      }),
    ]);
  });

  it('maps reference selectors and lang-text roots onto concrete form targets', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing process source reference',
          path: [
            'processDataSet',
            'modellingAndValidation',
            'dataSourcesTreatmentAndRepresentativeness',
            'referenceToDataSource',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing geography location',
          path: [
            'processDataSet',
            'processInformation',
            'geography',
            'locationOfOperationSupplyOrProduction',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing sub location',
          path: [
            'processDataSet',
            'processInformation',
            'geography',
            'subLocationOfOperationSupplyOrProduction',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing commissioner data',
          path: ['processDataSet', 'administrativeInformation', 'common:commissionerAndGoal'],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing ownership reference',
          path: [
            'processDataSet',
            'administrativeInformation',
            'publicationAndOwnership',
            'common:referenceToOwnershipOfDataSet',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Missing intended application text',
          path: [
            'processDataSet',
            'administrativeInformation',
            'common:commissionerAndGoal',
            'common:intendedApplications',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          processInformation: {
            geography: {},
          },
          modellingAndValidation: {
            dataSourcesTreatmentAndRepresentativeness: {
              referenceToDataSource: [{ '@refObjectId': '' }],
            },
          },
          administrativeInformation: {
            'common:commissionerAndGoal': {},
            publicationAndOwnership: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource.0.@refObjectId',
        formName: [
          'modellingAndValidation',
          'dataSourcesTreatmentAndRepresentativeness',
          'referenceToDataSource',
          0,
          '@refObjectId',
        ],
      }),
      expect.objectContaining({
        fieldPath: 'processInformation.geography.locationOfOperationSupplyOrProduction.@location',
        formName: [
          'processInformation',
          'geography',
          'locationOfOperationSupplyOrProduction',
          '@location',
        ],
      }),
      expect.objectContaining({
        fieldPath:
          'processInformation.geography.subLocationOfOperationSupplyOrProduction.@subLocation',
        formName: [
          'processInformation',
          'geography',
          'subLocationOfOperationSupplyOrProduction',
          '@subLocation',
        ],
      }),
      expect.objectContaining({
        fieldPath:
          'administrativeInformation.common:commissionerAndGoal.common:referenceToCommissioner.@refObjectId',
        formName: [
          'administrativeInformation',
          'common:commissionerAndGoal',
          'common:referenceToCommissioner',
          '@refObjectId',
        ],
      }),
      expect.objectContaining({
        fieldPath:
          'administrativeInformation.publicationAndOwnership.common:referenceToOwnershipOfDataSet.@refObjectId',
        formName: [
          'administrativeInformation',
          'publicationAndOwnership',
          'common:referenceToOwnershipOfDataSet',
          '@refObjectId',
        ],
      }),
      expect.objectContaining({
        fieldPath:
          'administrativeInformation.common:commissionerAndGoal.common:intendedApplications.0.#text',
        formName: [
          'administrativeInformation',
          'common:commissionerAndGoal',
          'common:intendedApplications',
          0,
          '#text',
        ],
      }),
    ]);
  });

  it('maps classification, exchange references, and special validation codes onto concrete details', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing class',
          path: [
            'processDataSet',
            'processInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing flow reference',
          path: ['processDataSet', 'exchanges', 'exchange', 0, 'referenceToFlowDataSet'],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          message: 'Missing exchange data source',
          path: [
            'processDataSet',
            'exchanges',
            'exchange',
            0,
            'referencesToDataSource',
            'referenceToDataSource',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_format',
          format: 'uuid',
          message: 'Invalid format',
          path: ['processDataSet', 'processInformation', 'dataSetInformation', '@uuid'],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'number',
          input: 'not-a-number',
          message: 'Invalid type',
          path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
          severity: 'error',
        },
        {
          code: 'unknown_code',
          input: undefined,
          message: 'Unknown validation',
          path: ['processDataSet', 'processInformation', 'time', 'common:dataSetValidUntil'],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Output',
                referenceToFlowDataSet: {},
                referencesToDataSource: {
                  referenceToDataSource: {},
                },
              },
            ],
          },
          processInformation: {
            dataSetInformation: {
              classificationInformation: {},
            },
            time: {
              'common:referenceYear': 'not-a-number',
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'processInformation.dataSetInformation.classificationInformation.common:classification',
        formName: [
          'processInformation',
          'dataSetInformation',
          'classificationInformation',
          'common:classification',
        ],
      }),
      expect.objectContaining({
        exchangeInternalId: 'exchange-1',
        fieldPath: 'exchange[#exchange-1].referenceToFlowDataSet.@refObjectId',
        formName: ['referenceToFlowDataSet', '@refObjectId'],
      }),
      expect.objectContaining({
        exchangeInternalId: 'exchange-1',
        fieldPath:
          'exchange[#exchange-1].referencesToDataSource.referenceToDataSource.0.@refObjectId',
        formName: ['referencesToDataSource', 'referenceToDataSource', 0, '@refObjectId'],
      }),
      expect.objectContaining({
        fieldKey: '@uuid',
        reasonMessage: 'Invalid format',
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode: 'invalid_format',
      }),
      expect.objectContaining({
        reasonMessage: 'Expected number but found string',
        validationCode: 'invalid_type',
        validationParams: expect.objectContaining({
          expected: 'number',
          received: 'string',
        }),
      }),
      expect.objectContaining({
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'unknown_code',
      }),
    ]);
  });

  it('maps reference version issues onto the matching selector version fields', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Missing root data source version',
          path: [
            'processDataSet',
            'modellingAndValidation',
            'dataSourcesTreatmentAndRepresentativeness',
            'referenceToDataSource',
            0,
            '@version',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Missing exchange flow version',
          path: [
            'processDataSet',
            'exchanges',
            'exchange',
            0,
            'referenceToFlowDataSet',
            '@version',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Missing exchange data source version',
          path: [
            'processDataSet',
            'exchanges',
            'exchange',
            0,
            'referencesToDataSource',
            'referenceToDataSource',
            0,
            '@version',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Input',
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-1',
                },
                referencesToDataSource: {
                  referenceToDataSource: [
                    {
                      '@refObjectId': 'exchange-source-1',
                    },
                  ],
                },
              },
            ],
          },
          modellingAndValidation: {
            dataSourcesTreatmentAndRepresentativeness: {
              referenceToDataSource: [
                {
                  '@refObjectId': 'root-source-1',
                },
              ],
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'modellingAndValidation.dataSourcesTreatmentAndRepresentativeness.referenceToDataSource.0.@version',
        formName: [
          'modellingAndValidation',
          'dataSourcesTreatmentAndRepresentativeness',
          'referenceToDataSource',
          0,
          '@version',
        ],
        validationCode: 'required_missing',
      }),
      expect.objectContaining({
        exchangeInternalId: 'exchange-1',
        fieldPath: 'exchange[#exchange-1].referenceToFlowDataSet.@version',
        formName: ['referenceToFlowDataSet', '@version'],
        validationCode: 'required_missing',
      }),
      expect.objectContaining({
        exchangeInternalId: 'exchange-1',
        fieldPath: 'exchange[#exchange-1].referencesToDataSource.referenceToDataSource.0.@version',
        formName: ['referencesToDataSource', 'referenceToDataSource', 0, '@version'],
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('normalizes string and empty issue paths when resolving tab names', () => {
    expect(
      getProcessSdkIssueTabName({
        path: 'processDataSet.processInformation.time.common:referenceYear',
      }),
    ).toBeUndefined();

    expect(
      getProcessSdkIssueTabName({
        path: undefined,
      }),
    ).toBeUndefined();
  });

  it('returns no exchanges-required details once at least one exchange exists', () => {
    expect(
      buildProcessExchangesRequiredValidationDetails({
        exchanges: {
          exchange: [{ '@dataSetInternalID': 'exchange-1' }],
        },
      }),
    ).toEqual([]);
  });

  it('maps quantitative-reference functional-unit fields onto the resolved exchange form target', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          input: undefined,
          message: 'Missing functional unit text',
          path: [
            'processDataSet',
            'processInformation',
            'quantitativeReference',
            'functionalUnitOrOther',
            1,
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'output-1',
                exchangeDirection: 'Output',
                quantitativeReference: true,
              },
            ],
          },
          processInformation: {
            quantitativeReference: {
              functionalUnitOrOther: [{ '#text': 'One unit' }, { '#text': '' }],
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeIndex: 0,
        exchangeInternalId: 'output-1',
        fieldKey: 'functionalUnitOrOther',
        fieldLabel: 'Functional unit or other',
        fieldPath: 'exchange[#output-1].functionalUnitOrOther.1.#text',
        formName: ['functionalUnitOrOther', 1, '#text'],
        validationCode: 'invalid_type',
      }),
    ]);
  });

  it('falls back to quantitative-output, first-output, and first-exchange resolution in order', () => {
    const quantitativeOutputDetails = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          input: undefined,
          message: 'Missing functional unit text',
          path: [
            'processDataSet',
            'processInformation',
            'quantitativeReference',
            'functionalUnitOrOther',
            0,
            '#text',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'input-1',
                exchangeDirection: 'Input',
                quantitativeReference: false,
              },
              {
                '@dataSetInternalID': 'output-2',
                exchangeDirection: 'Output',
                quantitativeReference: true,
              },
            ],
          },
          processInformation: {
            quantitativeReference: {},
          },
        },
      },
    );
    const firstOutputDetails = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          input: undefined,
          message: 'Missing functional unit text',
          path: [
            'processDataSet',
            'processInformation',
            'quantitativeReference',
            'functionalUnitOrOther',
            0,
            '#text',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'input-1',
                exchangeDirection: 'Input',
                quantitativeReference: false,
              },
              {
                '@dataSetInternalID': 'output-2',
                exchangeDirection: 'Output',
                quantitativeReference: false,
              },
            ],
          },
          processInformation: {
            quantitativeReference: {},
          },
        },
      },
    );
    const firstExchangeDetails = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          input: undefined,
          message: 'Missing functional unit text',
          path: [
            'processDataSet',
            'processInformation',
            'quantitativeReference',
            'functionalUnitOrOther',
            0,
            '#text',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'input-1',
                exchangeDirection: 'Input',
                quantitativeReference: false,
              },
              {
                '@dataSetInternalID': 'input-2',
                exchangeDirection: 'Input',
                quantitativeReference: false,
              },
            ],
          },
          processInformation: {
            quantitativeReference: {},
          },
        },
      },
    );

    expect(quantitativeOutputDetails).toEqual([
      expect.objectContaining({
        exchangeIndex: 1,
        exchangeInternalId: 'output-2',
      }),
    ]);
    expect(firstOutputDetails).toEqual([
      expect.objectContaining({
        exchangeIndex: 1,
        exchangeInternalId: 'output-2',
      }),
    ]);
    expect(firstExchangeDetails).toEqual([
      expect.objectContaining({
        exchangeIndex: 0,
        exchangeInternalId: 'input-1',
      }),
    ]);
  });

  it('keeps quantitative-reference issues on root fields when exchanges are still empty', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Reference flow is required',
          path: [
            'processDataSet',
            'processInformation',
            'quantitativeReference',
            'referenceToReferenceFlow',
          ],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [],
          },
          processInformation: {
            quantitativeReference: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        exchangeIndex: undefined,
        fieldKey: 'quantitativeReference',
        fieldLabel: 'Quantitative reference',
        fieldPath: 'processInformation.quantitativeReference.referenceToReferenceFlow.@refObjectId',
        formName: [
          'processInformation',
          'quantitativeReference',
          'referenceToReferenceFlow',
          '@refObjectId',
        ],
      }),
    ]);
  });

  it('keeps generic exchange field paths and omits localized suffixes when the lang index is invalid', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          input: undefined,
          message: 'Missing exchange direction',
          path: ['processDataSet', 'exchanges', 'exchange', 0, 'exchangeDirection'],
          severity: 'error',
        },
        {
          code: 'string_too_short',
          input: '',
          message: 'Too short',
          minimum: 3,
          path: ['processDataSet', 'exchanges', 'exchange', 0, 'generalComment', '#text'],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': 'exchange-1',
                exchangeDirection: 'Output',
                generalComment: [{ '@xml:lang': 'en', '#text': '' }],
              },
            ],
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'exchange[#exchange-1].exchangeDirection',
        formName: ['exchangeDirection'],
      }),
      expect.objectContaining({
        fieldLabel: 'Comment',
        fieldPath: 'exchange[#exchange-1].generalComment.#text',
        formName: ['generalComment', '#text'],
      }),
    ]);
  });

  it('keeps root lang-text leaves, string-length reasons, and empty paths consistent', () => {
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'string_too_long',
          input: 'abcd',
          maximum: 3,
          message: 'Too long',
          path: [
            'processDataSet',
            'processInformation',
            'dataSetInformation',
            'common:generalComment',
            0,
            '#text',
          ],
          severity: 'error',
        },
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Missing path entirely',
          path: [],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          processInformation: {
            dataSetInformation: {
              'common:generalComment': [{ '@xml:lang': 'en', '#text': 'abcd' }],
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'processInformation.dataSetInformation.common:generalComment.0.#text',
        formName: ['processInformation', 'dataSetInformation', 'common:generalComment', 0, '#text'],
        reasonMessage: 'Text length 4 exceeds maximum 3',
        suggestedFix: 'Shorten this text to 3 characters or fewer.',
      }),
    ]);
  });

  it('covers helper fallbacks for lang-text arrays, exchange paths, and top-level labels', () => {
    const {
      getExchangeContext,
      getListItemIndex,
      getProcessSdkIssueExchangeFormName,
      getProcessSdkIssueFieldKey,
      getProcessSdkIssueFieldLabel,
      getProcessSdkIssueFieldPath,
      getProcessSdkIssueRootFormName,
      isLangTextValue,
      stringifyProcessSdkFormName,
    } = processSdkValidationTestUtils;

    expect(isLangTextValue([undefined, { '#text': 'Localized text' }])).toBe(true);

    expect(
      getProcessSdkIssueRootFormName(
        ['processDataSet', 'processInformation', 'customLocalizedField'],
        {
          processDataSet: {
            processInformation: {
              customLocalizedField: [undefined, { '#text': 'Localized text' }],
            },
          },
        },
      ),
    ).toEqual(['processInformation', 'customLocalizedField', 0, '#text']);

    expect(getListItemIndex(['referencesToDataSource'], 'referenceToDataSource')).toBe(0);
    expect(
      getListItemIndex(['referenceToDataSource', 3, '@refObjectId'], 'referenceToDataSource'),
    ).toBe(3);
    expect(
      getProcessSdkIssueExchangeFormName(
        ['processDataSet', 'exchanges', 'exchange', 0, 'referencesToDataSource'],
        {},
      ),
    ).toEqual(['referencesToDataSource', 'referenceToDataSource', 0, '@refObjectId']);
    expect(
      getProcessSdkIssueExchangeFormName(['processDataSet', 'processInformation'], {}),
    ).toBeUndefined();
    expect(
      getProcessSdkIssueExchangeFormName(
        ['processDataSet', 'exchanges', 'exchange', 0, 'quantitativeReference'],
        {},
      ),
    ).toEqual(['quantitativeReference']);
    expect(
      getProcessSdkIssueExchangeFormName(
        ['processDataSet', 'exchanges', 'exchange', '0', 'meanAmount'],
        {},
      ),
    ).toBeUndefined();

    expect(
      getProcessSdkIssueFieldPath(['processDataSet', 'exchanges', 'exchange', 0], undefined),
    ).toBe('exchange[1]');
    expect(
      getProcessSdkIssueFieldKey(['processDataSet', 'exchanges', 'exchange', 0]),
    ).toBeUndefined();
    expect(
      getProcessSdkIssueFieldKey([
        'processDataSet',
        'processInformation',
        'customField',
        '#text',
        '#text',
      ]),
    ).toBe('#text');
    expect(
      getProcessSdkIssueFieldLabel(
        ['processDataSet', 'processInformation', 'common:generalComment'],
        { processDataSet: { processInformation: {} } },
      ),
    ).toBe('General comment on data set');
    expect(
      getProcessSdkIssueFieldLabel(
        ['processDataSet', 'processInformation', 'customField', '#text', '#text'],
        {},
      ),
    ).toBe('#text');

    expect(stringifyProcessSdkFormName(undefined, undefined, 'fallback.path')).toBe(
      'fallback.path',
    );
    expect(stringifyProcessSdkFormName([], 'exchange-1', 'fallback.path')).toBe('fallback.path');
    expect(stringifyProcessSdkFormName(undefined, undefined, undefined)).toBe('');

    expect(
      getExchangeContext(
        {
          processDataSet: {
            exchanges: {
              exchange: [
                {
                  '@dataSetInternalID': 'exchange-1',
                  exchangeDirection: 'Output',
                  referenceToFlowDataSet: {
                    '@refObjectId': 'flow-1',
                    'common:shortDescription': [{ '#text': 'Electricity' }],
                  },
                },
              ],
            },
          },
        },
        0,
      ),
    ).toEqual({
      exchangeDirection: 'output',
      exchangeFlowId: 'flow-1',
      exchangeFlowLabel: 'Electricity',
      exchangeInternalId: 'exchange-1',
    });
    expect(
      getExchangeContext(
        {
          processDataSet: {
            exchanges: {
              exchange: [null],
            },
          },
        },
        0,
      ),
    ).toBeUndefined();
  });

  it('covers union fallback resolution and validation-reason edge cases', () => {
    const { collectLeafUnionIssues, getProcessSdkIssueReason, getProcessSdkValidationCode } =
      processSdkValidationTestUtils;

    expect(
      collectLeafUnionIssues({
        code: 'invalid_union',
        errors: [null],
        message: 'Invalid input',
        path: ['processDataSet', 'processInformation', 'time'],
      }),
    ).toEqual([
      expect.objectContaining({
        path: ['processDataSet', 'processInformation', 'time'],
      }),
    ]);

    expect(
      normalizeProcessSdkValidationDetails(
        [
          {
            code: 'invalid_union',
            errors: [
              [
                {
                  code: 'invalid_type',
                  expected: 'string',
                  message: 'Missing string',
                  path: [],
                },
              ],
              [
                {
                  code: 'invalid_type',
                  expected: 'number',
                  message: 'Missing number',
                  path: [],
                },
              ],
            ],
            message: 'Invalid input',
            path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
            severity: 'error',
          },
        ],
        {
          processDataSet: {
            processInformation: {
              quantitativeReference: {},
            },
          },
        },
      ),
    ).toEqual([
      expect.objectContaining({
        reasonMessage: 'Missing string',
        validationCode: 'required_missing',
      }),
    ]);

    expect(getProcessSdkValidationCode({ code: 'custom' }, undefined)).toBe('required_missing');
    expect(getProcessSdkValidationCode({ code: 'brand_new_code' }, 'value')).toBe('brand_new_code');

    expect(
      getProcessSdkIssueReason(
        {
          code: 'required_missing',
          expected: 'object',
          message: 'Missing object',
          params: { expected: 'array' },
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Missing object',
        validationCode: 'required_missing',
        validationParams: { expected: 'array' },
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'required_missing',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Required value is missing',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'required_missing',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_type',
          message: 'Wrong type',
          params: { expected: 'string', received: 'undefined' },
        },
        null,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Expected string but found undefined',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'invalid_type',
        validationParams: { expected: 'string', received: 'undefined' },
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_type',
          expected: 'number',
          message: 'Wrong type',
          params: { expected: 'array', received: 'null' },
        },
        null,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Expected array but found null',
        suggestedFix: undefined,
        validationCode: 'invalid_type',
        validationParams: { expected: 'array', received: 'null' },
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_type',
        },
        {
          any: 'object',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'invalid_type',
        validationParams: {
          expected: undefined,
          received: 'object',
        },
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_long',
          message: 'Too long',
        },
        42,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Too long',
        suggestedFix: undefined,
        validationCode: 'string_too_long',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_long',
          params: {
            actualLength: 8,
            maximum: 5,
          },
        },
        'ignored',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 8,
        limit: 5,
        reasonMessage: 'Text length 8 exceeds maximum 5',
        suggestedFix: 'Shorten this text to 5 characters or fewer.',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_long',
        },
        42,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'string_too_long',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_short',
          message: 'Too short',
        },
        42,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Too short',
        suggestedFix: undefined,
        validationCode: 'string_too_short',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_short',
          params: {
            actualLength: 1,
            minimum: 3,
          },
        },
        'ignored',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 1,
        limit: 3,
        reasonMessage: 'Text length 1 is below minimum 3',
        suggestedFix: 'Expand this text to at least 3 characters.',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'string_too_short',
        },
        42,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'string_too_short',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_format',
          params: {
            format: 'uuid',
          },
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Invalid uuid format',
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode: 'invalid_format',
        validationParams: { format: 'uuid' },
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_format',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode: 'invalid_format',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'invalid_format',
          format: 'year',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Invalid year format',
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode: 'invalid_format',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'brand_new_code',
          message: undefined,
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'brand_new_code',
      }),
    );

    expect(
      getProcessSdkIssueReason(
        {
          code: 'brand_new_code',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'brand_new_code',
      }),
    );
  });
});

it.each([true, false])(
  'maps custom classification fields to their actual collection shape (%p)',
  (repeated) => {
    const customClass = { '@level': '4', '@classId': 'external', '#text': 'External' };
    const system = { '@name': 'Custom', 'common:class': repeated ? [customClass] : customClass };
    const formName = [
      'processInformation',
      'dataSetInformation',
      'classificationInformation',
      'common:classification',
      ...(repeated ? [0] : []),
      'common:class',
      ...(repeated ? [0] : []),
      '#text',
    ];
    const details = normalizeProcessSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Invalid class label',
          path: ['processDataSet', ...formName],
          severity: 'error',
        },
      ],
      {
        processDataSet: {
          processInformation: {
            dataSetInformation: {
              classificationInformation: { 'common:classification': repeated ? [system] : system },
            },
          },
        },
      },
    );
    expect(details[0].formName).toEqual(formName);
  },
);
