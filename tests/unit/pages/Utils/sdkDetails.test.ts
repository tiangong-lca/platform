import { normalizeContactSdkValidationDetails } from '@/pages/Contacts/sdkValidation';
import { normalizeFlowpropertySdkValidationDetails } from '@/pages/Flowproperties/sdkValidation';
import { normalizeSourceSdkValidationDetails } from '@/pages/Sources/sdkValidation';
import {
  getValueAtPath,
  normalizeSimpleDatasetSdkValidationDetails,
  simpleSdkValidationTestUtils,
  toIndexedLangTextLeafFormName,
  toLangTextFormName,
  toPathArray,
} from '@/pages/Utils/validation/sdkDetails';

const {
  getDatasetSdkIssueReason,
  getSimpleSdkIssueFieldKey,
  getSimpleSdkIssueFormName,
  getSimpleSdkIssueTabName,
  isLangTextValue,
  resolveDatasetSdkIssue,
  toRootFormPath,
} = simpleSdkValidationTestUtils;

const simpleConfig = {
  datasetKey: 'demoDataSet',
  fieldLabels: {
    'meta.localized.#text': 'Localized text',
  },
  fieldLabelsByKey: {
    '@refObjectId': 'Reference identifier',
    dynamic: 'Dynamic field',
    field: 'Field',
    localized: 'Localized field',
    missingLocalized: 'Missing localized field',
    specialTab: 'Special tab field',
    value: 'Value',
  },
  requiredLangTextFields: new Set(['meta.missingLocalized']),
  specialFormNames: [
    {
      formName: ['meta', 'classification', 'showValue'],
      match: /^meta\.classification\.common:classification/,
    },
    {
      formName: ({ rootPathString }: { rootPathString: string }) => ['custom', rootPathString],
      match: 'meta.dynamic',
    },
  ],
  specialTabNames: [
    {
      match: 'meta.specialTab',
      tabName: 'specialTabSection',
    },
    {
      match: /^items\.item\.\d+\.value$/,
      tabName: ({ rootPath }: { rootPath: Array<string | number> }) =>
        typeof rootPath[2] === 'number' ? 'itemList' : undefined,
    },
  ],
  tabNameAliases: {
    aliasTab: 'metadata',
  },
};

const orderedJson = {
  demoDataSet: {
    aliasTab: {
      field: undefined,
    },
    items: {
      item: [
        {
          value: undefined,
        },
      ],
    },
    meta: {
      localized: {
        '@xml:lang': 'zh',
        '#text': '中文内容',
      },
      missingLocalized: undefined,
      referenceToThing: undefined,
      specialTab: undefined,
    },
  },
};

describe('simple dataset sdk validation detail mapping', () => {
  it('covers direct helper fallbacks for paths and localized-text form names', () => {
    expect(toPathArray(['field', 0, '#text'])).toEqual(['field', 0, '#text']);
    expect(toPathArray('field.path')).toEqual(['field.path']);
    expect(toPathArray('  ')).toEqual([]);
    expect(getValueAtPath({ root: { nested: 1 } }, ['root', 'nested'])).toBe(1);
    expect(getValueAtPath({ root: null }, ['root', 'nested'])).toBeUndefined();
    expect(isLangTextValue([])).toBe(false);
    expect(isLangTextValue([undefined, { '@xml:lang': 'en', '#text': 'Hello' }])).toBe(true);
    expect(isLangTextValue([{ value: 'not-lang-text' }])).toBe(false);

    expect(
      toIndexedLangTextLeafFormName(['meta', 'localized', '#text'], {
        '@xml:lang': 'en',
        '#text': 'Hello',
      }),
    ).toEqual(['meta', 'localized', 0, '#text']);
    expect(
      toIndexedLangTextLeafFormName(['meta', 'localized', 0, '#text'], {
        '@xml:lang': 'en',
        '#text': 'Hello',
      }),
    ).toEqual(['meta', 'localized', 0, '#text']);
    expect(
      toIndexedLangTextLeafFormName(['meta', 'localized', 'value'], { '#text': 'Hello' }),
    ).toEqual(['meta', 'localized', 'value']);
    expect(
      toIndexedLangTextLeafFormName(['meta', 'localized', '#text'], ['not-a-lang-text']),
    ).toEqual(['meta', 'localized', '#text']);

    expect(toLangTextFormName(['meta', 'localized'])).toEqual(['meta', 'localized', 0, '#text']);
    expect(toLangTextFormName(['meta', 'localized', 0])).toEqual(['meta', 'localized', 0, '#text']);
    expect(toLangTextFormName(['meta', 'localized', '#text'])).toEqual([
      'meta',
      'localized',
      '#text',
    ]);
  });

  it('covers root-path, special-form, and tab-name helper branches', () => {
    expect(toRootFormPath(['root', 'demoDataSet', 'meta', 'field'], 'demoDataSet')).toEqual([
      'meta',
      'field',
    ]);
    expect(toRootFormPath(['demoDataSet', 'meta', 'field'], 'demoDataSet')).toEqual([
      'meta',
      'field',
    ]);
    expect(toRootFormPath(['otherDataSet', 'meta', 'field'], 'demoDataSet')).toEqual([
      'meta',
      'field',
    ]);

    expect(getSimpleSdkIssueFieldKey(['meta', 'localized', '#text'])).toBe('localized');
    expect(getSimpleSdkIssueFieldKey(['meta', 'localized', 0, '#text'])).toBe('localized');
    expect(getSimpleSdkIssueFieldKey(['meta', 0])).toBeUndefined();

    expect(
      getSimpleSdkIssueFormName(['meta', 'referenceToThing'], orderedJson, simpleConfig),
    ).toEqual(['meta', 'referenceToThing', '@refObjectId']);
    expect(getSimpleSdkIssueFormName(['meta', 'localized'], orderedJson, simpleConfig)).toEqual([
      'meta',
      'localized',
      0,
      '#text',
    ]);
    expect(
      getSimpleSdkIssueFormName(['meta', 'localized', '#text'], orderedJson, simpleConfig),
    ).toEqual(['meta', 'localized', 0, '#text']);
    expect(
      getSimpleSdkIssueFormName(['meta', 'missingLocalized'], orderedJson, simpleConfig),
    ).toEqual(['meta', 'missingLocalized', 0, '#text']);
    expect(getSimpleSdkIssueFormName(['meta', 'dynamic'], orderedJson, simpleConfig)).toEqual([
      'custom',
      'meta.dynamic',
    ]);
    expect(
      getSimpleSdkIssueFormName(
        ['meta', 'classification', 'common:classification', 'common:class', 0, '@classId'],
        orderedJson,
        simpleConfig,
      ),
    ).toEqual(['meta', 'classification', 'showValue']);

    expect(getSimpleSdkIssueTabName(['aliasTab', 'field'], simpleConfig)).toBe('metadata');
    expect(getSimpleSdkIssueTabName(['meta', 'specialTab'], simpleConfig)).toBe(
      'specialTabSection',
    );
    expect(getSimpleSdkIssueTabName(['items', 'item', 0, 'value'], simpleConfig)).toBe('itemList');
    expect(getSimpleSdkIssueTabName([0, 'value'], simpleConfig)).toBeUndefined();
  });

  it('covers union resolution and dataset issue-reason branches', () => {
    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_type',
        expected: 'string',
        path: 'meta.field',
      }),
    ).toEqual({
      code: 'invalid_type',
      expected: 'string',
      path: ['meta.field'],
    });

    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_union',
        errors: [],
        path: ['demoDataSet', 'meta'],
      }),
    ).toEqual({
      code: 'invalid_union',
      errors: [],
      path: ['demoDataSet', 'meta'],
    });

    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_union',
        errors: [
          [{ code: 'invalid_type', expected: 'string', path: ['field'] }],
          [{ code: 'invalid_format', format: 'uri', path: ['referenceToThing'] }],
        ],
        path: ['demoDataSet', 'meta'],
      }),
    ).toEqual({
      code: 'invalid_type',
      expected: 'string',
      path: ['demoDataSet', 'meta', 'field'],
    });

    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_union',
        errors: [
          [{ code: 'invalid_type', expected: 'string', path: [] }],
          [{ code: 'invalid_format', format: 'uri', path: [] }],
        ],
        path: ['demoDataSet', 'meta'],
      }),
    ).toEqual({
      code: 'invalid_format',
      format: 'uri',
      path: ['demoDataSet', 'meta'],
    });

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_long',
          maximum: 10,
          params: { actualLength: 12 },
        },
        'hello world!',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 12,
        limit: 10,
        suggestedFix: 'Shorten this text to 10 characters or fewer.',
        validationCode: 'string_too_long',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_short',
          minimum: 3,
          message: 'Too short',
        },
        '',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 0,
        limit: 3,
        suggestedFix: 'Expand this text to at least 3 characters.',
        validationCode: 'string_too_short',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'required_missing',
          expected: 'string',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'required_missing',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_type',
          expected: 'number',
        },
        'not-a-number',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Expected number but found string',
        suggestedFix: undefined,
        validationCode: 'invalid_type',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_format',
          format: 'uri',
        },
        'not-a-uri',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Invalid uri format',
        suggestedFix: 'Replace this value with one that matches the expected format.',
        validationCode: 'invalid_format',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_value',
          message: 'Value is invalid',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Value is invalid',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'required_missing',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'future_validation_rule',
          message: 'Future validation failed',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Future validation failed',
        suggestedFix: undefined,
        validationCode: 'future_validation_rule',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_long',
          maximum: 12,
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        suggestedFix: 'Shorten this text to 12 characters or fewer.',
        validationCode: 'string_too_long',
      }),
    );
  });

  it.each([
    ['array_too_small', undefined, 'array_too_small', 'Fill in the required value for this field.'],
    ['array_too_large', undefined, 'array_too_large', 'Fill in the required value for this field.'],
    [
      'number_too_small',
      undefined,
      'number_too_small',
      'Fill in the required value for this field.',
    ],
    [
      'number_too_large',
      undefined,
      'number_too_large',
      'Fill in the required value for this field.',
    ],
    [
      'unrecognized_keys',
      undefined,
      'unrecognized_keys',
      'Fill in the required value for this field.',
    ],
    ['invalid_union', undefined, 'required_missing', 'Fill in the required value for this field.'],
    ['custom', undefined, 'required_missing', 'Fill in the required value for this field.'],
    ['unknown', undefined, 'required_missing', 'Fill in the required value for this field.'],
    ['invalid_type', undefined, 'required_missing', 'Fill in the required value for this field.'],
    ['invalid_type', null, 'invalid_type', undefined],
  ])(
    'covers additional dataset issue-reason fallback branches for %s',
    (code, actualValue, expectedValidationCode, expectedSuggestedFix) => {
      expect(
        getDatasetSdkIssueReason(
          {
            code,
            expected: 'string',
            message: `Handled ${code}`,
          },
          actualValue,
        ),
      ).toEqual(
        expect.objectContaining({
          reasonMessage:
            code === 'invalid_type' && actualValue === null
              ? 'Expected string but found null'
              : `Handled ${code}`,
          suggestedFix: expectedSuggestedFix,
          validationCode: expectedValidationCode,
        }),
      );
    },
  );

  it('covers remaining dataset-reason, label, and unknown-key fallback branches', () => {
    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_union',
        errors: [{ code: 'invalid_type', expected: 'string', path: [] } as any],
        path: ['demoDataSet', 'meta'],
      }),
    ).toEqual({
      code: 'invalid_union',
      errors: [{ code: 'invalid_type', expected: 'string', path: [] }],
      path: ['demoDataSet', 'meta'],
    });

    expect(
      resolveDatasetSdkIssue({
        code: 'invalid_union',
        errors: [[{ code: 'invalid_type', expected: 'string', path: [] }]],
        path: ['demoDataSet', 'meta'],
      }),
    ).toEqual({
      code: 'invalid_type',
      expected: 'string',
      path: ['demoDataSet', 'meta'],
    });

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_long',
          message: 'Too long via params',
          params: { actualLength: 7, maximum: 5 },
        },
        '1234567',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 7,
        limit: 5,
        suggestedFix: 'Shorten this text to 5 characters or fewer.',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_long',
          message: 'Too long without limit',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Too long without limit',
        suggestedFix: undefined,
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_long',
          maximum: 10,
        },
        '12345678901',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 11,
        limit: 10,
        suggestedFix: 'Shorten this text to 10 characters or fewer.',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_short',
          message: 'Too short via params',
          params: { actualLength: 1, minimum: 4 },
        },
        '1',
      ),
    ).toEqual(
      expect.objectContaining({
        actual: 1,
        limit: 4,
        suggestedFix: 'Expand this text to at least 4 characters.',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_short',
          message: 'Too short without limit',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Too short without limit',
        suggestedFix: undefined,
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_type',
          expected: 'string',
        },
        [],
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Expected string but found array',
        suggestedFix: undefined,
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_type',
          message: 'Type mismatch with explicit undefined',
          params: { expected: 'uuid', received: 'undefined' },
        },
        'still-present',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Expected uuid but found undefined',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'invalid_type',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_type',
          message: 'Type mismatch fallback',
          params: { expected: 1 as any, received: null as any },
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Type mismatch fallback',
        suggestedFix: undefined,
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_format',
          params: { format: 'email' },
        },
        'foo',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Invalid email format',
        suggestedFix: 'Replace this value with one that matches the expected format.',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_format',
        },
        'foo',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: 'Replace this value with one that matches the expected format.',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          message: 'Unknown issue',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Unknown issue',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'unknown',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'required_missing',
          params: { expected: 'uuid' },
        },
        'filled',
      ),
    ).toEqual(
      expect.objectContaining({
        validationCode: 'required_missing',
        validationParams: expect.objectContaining({
          expected: 'uuid',
        }),
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_type',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'invalid_type',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'unknown',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'unknown',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'invalid_value',
        },
        'value',
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'invalid_value',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'future_validation_rule',
        },
        undefined,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: 'Fill in the required value for this field.',
        validationCode: 'future_validation_rule',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_short',
          message: 'Too short fallback message',
        },
        null,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Too short fallback message',
        suggestedFix: undefined,
        validationCode: 'string_too_short',
      }),
    );

    expect(
      getDatasetSdkIssueReason(
        {
          code: 'string_too_short',
        },
        null,
      ),
    ).toEqual(
      expect.objectContaining({
        reasonMessage: 'Validation failed',
        suggestedFix: undefined,
        validationCode: 'string_too_short',
      }),
    );

    expect(getSimpleSdkIssueFieldKey([0, 1, '#text'])).toBeUndefined();
    expect(getSimpleSdkIssueFieldKey(['meta', 'localized', '@xml:lang'])).toBe('localized');

    expect(
      getSimpleSdkIssueFormName(['meta', 'plainValue'], orderedJson, { datasetKey: 'demoDataSet' }),
    ).toEqual(['meta', 'plainValue']);
    expect(getSimpleSdkIssueTabName(['meta', 'plainValue'], { datasetKey: 'demoDataSet' })).toBe(
      'meta',
    );

    const fallbackDetails = normalizeSimpleDatasetSdkValidationDetails(
      [
        {
          code: undefined,
          path: ['demoDataSet', 0],
        },
        {
          code: 'invalid_format',
          path: ['demoDataSet', 'meta', 'localized', '@xml:lang'],
        },
      ],
      orderedJson,
      {
        datasetKey: 'demoDataSet',
      },
    );

    expect(fallbackDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: undefined,
          fieldLabel: 'Field',
          fieldPath: '0',
          key: expect.stringContaining('unknown:0:unknown'),
          tabName: undefined,
          validationCode: 'unknown',
        }),
        expect.objectContaining({
          fieldLabel: 'localized (ZH)',
          fieldPath: 'meta.localized.0.@xml:lang',
          formName: ['meta', 'localized', 0, '@xml:lang'],
          tabName: 'meta',
          validationCode: 'invalid_format',
        }),
      ]),
    );
  });

  it('normalizes details with dedupe, language labels, input overrides, and skip paths', () => {
    const details = normalizeSimpleDatasetSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          path: [],
        },
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['demoDataSet'],
        },
        {
          code: 'invalid_format',
          format: 'uri',
          input: 'not-a-uri',
          path: ['root', 'demoDataSet', 'meta', 'referenceToThing'],
        },
        {
          code: 'invalid_type',
          expected: 'string',
          input: 42,
          path: ['demoDataSet', 'aliasTab', 'field'],
        },
        {
          code: 'custom',
          message: 'Localized text contains the wrong language content',
          rawCode: 'localized_text_zh_must_include_chinese_character',
          path: ['demoDataSet', 'meta', 'localized', '#text'],
        },
        {
          code: 'required_missing',
          message: 'Dynamic field is required',
          path: ['demoDataSet', 'meta', 'dynamic'],
        },
        {
          code: 'required_missing',
          message: 'Dynamic field is required',
          path: ['demoDataSet', 'meta', 'dynamic'],
        },
      ],
      orderedJson,
      simpleConfig,
    );

    expect(details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'meta.referenceToThing.@refObjectId',
          formName: ['meta', 'referenceToThing', '@refObjectId'],
          tabName: 'meta',
          validationCode: 'invalid_format',
        }),
        expect.objectContaining({
          fieldPath: 'aliasTab.field',
          fieldLabel: 'Field',
          reasonMessage: 'Expected string but found number',
          tabName: 'metadata',
          validationCode: 'invalid_type',
        }),
        expect.objectContaining({
          fieldPath: 'meta.localized.0.#text',
          fieldLabel: 'Localized text (ZH)',
          rawCode: 'localized_text_zh_must_include_chinese_character',
          tabName: 'meta',
          validationCode: 'localized_text_zh_must_include_chinese_character',
        }),
        expect.objectContaining({
          fieldPath: 'custom.meta.dynamic',
          formName: ['custom', 'meta.dynamic'],
          fieldLabel: 'Dynamic field',
          suggestedFix: 'Fill in the required value for this field.',
          tabName: 'meta',
          validationCode: 'required_missing',
        }),
      ]),
    );
    expect(details).toHaveLength(4);
  });

  it('promotes custom sdk params validationCode into the detail validation code', () => {
    const details = normalizeSimpleDatasetSdkValidationDetails(
      [
        {
          code: 'custom',
          message:
            "@xml:lang values starting with 'zh' must include at least one Chinese character",
          params: {
            validationCode: 'localized_text_zh_must_include_chinese_character',
          },
          path: ['demoDataSet', 'meta', 'localized', 0, '#text'],
        },
      ],
      {
        demoDataSet: {
          meta: {
            localized: [
              {
                '@xml:lang': 'zh',
                '#text': 'English content',
              },
            ],
          },
        },
      },
      simpleConfig,
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'meta.localized.0.#text',
        formName: ['meta', 'localized', 0, '#text'],
        reasonMessage:
          "@xml:lang values starting with 'zh' must include at least one Chinese character",
        tabName: 'meta',
        validationCode: 'localized_text_zh_must_include_chinese_character',
        validationParams: expect.objectContaining({
          validationCode: 'localized_text_zh_must_include_chinese_character',
        }),
      }),
    ]);
  });

  it('covers fallback field-label, tab-name, and language-helper branches for sparse paths', () => {
    const sparseOrderedJson = {
      demoDataSet: {
        meta: {
          plain: null,
          untranslated: {
            '#text': 'Hello',
          },
        },
      },
    };

    const details = normalizeSimpleDatasetSdkValidationDetails(
      [
        {
          code: 'required_missing',
          message: 'Missing plain field',
          path: ['demoDataSet', 'meta', 'plain'],
        },
        {
          code: 'invalid_format',
          format: 'uuid',
          path: ['demoDataSet', 'meta', 'untranslated', '#text'],
        },
      ],
      sparseOrderedJson,
      simpleConfig,
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldLabel: 'plain',
        fieldPath: 'meta.plain',
        formName: ['meta', 'plain'],
        tabName: 'meta',
      }),
      expect.objectContaining({
        fieldLabel: 'untranslated',
        fieldPath: 'meta.untranslated.0.#text',
        formName: ['meta', 'untranslated', 0, '#text'],
        tabName: 'meta',
        validationCode: 'invalid_format',
      }),
    ]);
  });

  it('ignores the synthetic root segment when deriving contact tab and form name', () => {
    const details = normalizeContactSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Invalid input: expected string, received undefined',
          path: [
            'root',
            'contactDataSet',
            'contactInformation',
            'dataSetInformation',
            'common:name',
          ],
        },
      ],
      {
        contactDataSet: {
          contactInformation: {
            dataSetInformation: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'contactInformation.dataSetInformation.common:name.0.#text',
        formName: ['contactInformation', 'dataSetInformation', 'common:name', 0, '#text'],
        tabName: 'contactInformation',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('maps missing contact shortName to the lang-text form leaf', () => {
    const details = normalizeContactSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Invalid input: expected string, received undefined',
          path: ['contactDataSet', 'contactInformation', 'dataSetInformation', 'common:shortName'],
        },
      ],
      {
        contactDataSet: {
          contactInformation: {
            dataSetInformation: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'contactInformation.dataSetInformation.common:shortName.0.#text',
        formName: ['contactInformation', 'dataSetInformation', 'common:shortName', 0, '#text'],
        tabName: 'contactInformation',
        validationCode: 'required_missing',
      }),
    ]);
  });

  it('maps single-entry contact shortName localized-text leaf issues to the indexed form leaf', () => {
    const details = normalizeContactSdkValidationDetails(
      [
        {
          code: 'localized_text_en_must_not_contain_chinese_character',
          message: "@xml:lang values starting with 'en' must not contain Chinese characters",
          path: [
            'contactDataSet',
            'contactInformation',
            'dataSetInformation',
            'common:shortName',
            '#text',
          ],
          rawCode: 'custom',
          severity: 'error',
        },
      ],
      {
        contactDataSet: {
          contactInformation: {
            dataSetInformation: {
              'common:shortName': {
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
        fieldPath: 'contactInformation.dataSetInformation.common:shortName.0.#text',
        formName: ['contactInformation', 'dataSetInformation', 'common:shortName', 0, '#text'],
        tabName: 'contactInformation',
        validationCode: 'localized_text_en_must_not_contain_chinese_character',
      }),
    ]);
  });

  it('maps single-entry source shortName localized-text leaf issues to the indexed form leaf', () => {
    const details = normalizeSourceSdkValidationDetails(
      [
        {
          code: 'localized_text_en_must_not_contain_chinese_character',
          message: "@xml:lang values starting with 'en' must not contain Chinese characters",
          path: [
            'sourceDataSet',
            'sourceInformation',
            'dataSetInformation',
            'common:shortName',
            '#text',
          ],
          rawCode: 'custom',
          severity: 'error',
        },
      ],
      {
        sourceDataSet: {
          sourceInformation: {
            dataSetInformation: {
              'common:shortName': {
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
        fieldPath: 'sourceInformation.dataSetInformation.common:shortName.0.#text',
        formName: ['sourceInformation', 'dataSetInformation', 'common:shortName', 0, '#text'],
        tabName: 'sourceInformation',
        validationCode: 'localized_text_en_must_not_contain_chinese_character',
      }),
    ]);
  });

  it('maps missing source classifications to the persistent collection anchor', () => {
    const details = normalizeSourceSdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Invalid input: expected string, received undefined',
          path: [
            'sourceDataSet',
            'sourceInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
            0,
            '@classId',
          ],
        },
      ],
      {
        sourceDataSet: {
          sourceInformation: {
            dataSetInformation: {
              classificationInformation: {},
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'sourceInformation.dataSetInformation.classificationInformation.common:classification',
        formName: [
          'sourceInformation',
          'dataSetInformation',
          'classificationInformation',
          'common:classification',
        ],
        tabName: 'sourceInformation',
      }),
    ]);
  });

  it('maps flowproperty reference selectors to the @refObjectId field', () => {
    const details = normalizeFlowpropertySdkValidationDetails(
      [
        {
          code: 'invalid_type',
          expected: 'string',
          message: 'Invalid input: expected string, received undefined',
          path: [
            'flowPropertyDataSet',
            'flowPropertiesInformation',
            'quantitativeReference',
            'referenceToReferenceUnitGroup',
          ],
        },
      ],
      {
        flowPropertyDataSet: {
          flowPropertiesInformation: {
            quantitativeReference: {},
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath:
          'flowPropertiesInformation.quantitativeReference.referenceToReferenceUnitGroup.@refObjectId',
        formName: [
          'flowPropertiesInformation',
          'quantitativeReference',
          'referenceToReferenceUnitGroup',
          '@refObjectId',
        ],
        tabName: 'flowPropertiesInformation',
      }),
    ]);
  });
});
