/**
 * Tests for general utility functions
 * Path: src/services/general/util.ts
 */

// Mock external API dependencies
jest.mock('@/services/flowproperties/api');
jest.mock('@/services/flows/api');
jest.mock('@/services/unitgroups/api');

import deValidatorMessages from '@/locales/de-DE/validator';
import enValidatorMessages from '@/locales/en-US/validator';
import frValidatorMessages from '@/locales/fr-FR/validator';
import zhValidatorMessages from '@/locales/zh-CN/validator';
import { getReferenceUnitGroups } from '@/services/flowproperties/api';
import { getFlowProperties } from '@/services/flows/api';
import { SUPPORTED_APP_LOCALES } from '@/services/general/localeRegistry';
import {
  capitalize,
  classificationToJsonList,
  classificationToString,
  classificationToStringList,
  convertCopyrightToBoolean,
  convertToUTCISOString,
  formatDateTime,
  genClassIdList,
  genClassJsonZH,
  genClassStr,
  genLocalizedClassification,
  getDataSource,
  getExactLangText,
  getImportedId,
  getLang,
  getLangJson,
  getLangList,
  getLangText,
  getLangValidationErrorMessage,
  getUnitData,
  isDataUnderReview,
  isSupabaseDuplicateKeyError,
  isValidURL,
  jsonToList,
  listToJson,
  mergeLangArrays,
  normalizeLangPayloadBeforeSave,
  removeEmptyObjects,
  toAmountNumber,
  validatePasswordStrength,
} from '@/services/general/util';
import { getReferenceUnits } from '@/services/unitgroups/api';

// Mock classification data
const mockClassificationData = [
  {
    id: '1',
    value: 'category1',
    label: 'Category 1',
    children: [
      {
        id: '1-1',
        value: 'subcategory1',
        label: 'Subcategory 1',
        children: [],
      },
      {
        id: '1-2',
        value: 'subcategory2',
        label: 'Subcategory 2',
        children: [],
      },
    ],
  },
  {
    id: '2',
    value: 'category2',
    label: 'Category 2',
    children: [],
  },
];

describe('General Utility Functions', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUnitData', () => {
    it('should fetch and attach unit data for flow type', async () => {
      const mockData = [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '01.00.000',
        },
      ];

      const mockFlowProperties = {
        data: [
          {
            id: 'flow-1',
            version: '01.00.000',
            refFlowPropertytId: 'fp-1',
            typeOfDataSet: 'Elementary flow',
          },
        ],
      };

      const mockUnitGroups = {
        data: [
          {
            id: 'fp-1',
            version: '01.00.000',
            refUnitGroupId: 'ug-1',
          },
        ],
      };

      const mockUnits = {
        data: [
          {
            id: 'ug-1',
            version: '01.00.000',
            name: 'kilogram',
          },
        ],
      };

      (getFlowProperties as jest.Mock).mockResolvedValue(mockFlowProperties);
      (getReferenceUnitGroups as jest.Mock).mockResolvedValue(mockUnitGroups);
      (getReferenceUnits as jest.Mock).mockResolvedValue(mockUnits);

      const result = await getUnitData('flow', mockData);

      expect(getFlowProperties).toHaveBeenCalledWith([{ id: 'flow-1', version: '01.00.000' }]);
      expect(result).toEqual([
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '01.00.000',
          typeOfDataSet: 'Elementary flow',
          refUnitRes: {
            id: 'ug-1',
            version: '01.00.000',
            name: 'kilogram',
          },
        },
      ]);
    });

    it('should fetch and attach unit data for unitgroup type', async () => {
      const mockData = [
        {
          refUnitGroupId: 'ug-1',
          refUnitGroupVersion: '01.00.000',
        },
      ];

      const mockUnits = {
        data: [
          {
            id: 'ug-1',
            version: '01.00.000',
            name: 'meter',
          },
        ],
      };

      (getReferenceUnits as jest.Mock).mockResolvedValue(mockUnits);

      const result = await getUnitData('unitgroup', mockData);

      expect(getReferenceUnits).toHaveBeenCalledWith([{ id: 'ug-1', version: '01.00.000' }]);
      expect(result).toEqual([
        {
          refUnitGroupId: 'ug-1',
          refUnitGroupVersion: '01.00.000',
          refUnitRes: {
            id: 'ug-1',
            version: '01.00.000',
            name: 'meter',
          },
        },
      ]);
    });

    it('should fetch and attach unit data for flowproperty type', async () => {
      const mockData = [
        {
          referenceToFlowPropertyDataSetId: 'fp-1',
          referenceToFlowPropertyDataSetVersion: '01.00.000',
        },
      ];

      const mockUnitGroups = {
        data: [
          {
            id: 'fp-1',
            version: '01.00.000',
            refUnitGroupId: 'ug-1',
          },
        ],
      };

      const mockUnits = {
        data: [
          {
            id: 'ug-1',
            version: '01.00.000',
            name: 'liter',
          },
        ],
      };

      (getReferenceUnitGroups as jest.Mock).mockResolvedValue(mockUnitGroups);
      (getReferenceUnits as jest.Mock).mockResolvedValue(mockUnits);

      const result = await getUnitData('flowproperty', mockData);

      expect(getReferenceUnitGroups).toHaveBeenCalledWith([{ id: 'fp-1', version: '01.00.000' }]);
      expect(result).toEqual([
        {
          referenceToFlowPropertyDataSetId: 'fp-1',
          referenceToFlowPropertyDataSetVersion: '01.00.000',
          refUnitRes: {
            id: 'ug-1',
            version: '01.00.000',
            name: 'liter',
          },
        },
      ]);
    });

    it('should handle version mismatch and fallback to ID only match', async () => {
      const mockData = [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '01.00.000',
        },
      ];

      const mockFlowProperties = {
        data: [
          {
            id: 'flow-1',
            version: '02.00.000', // Different version
            refFlowPropertytId: 'fp-1',
            typeOfDataSet: 'Product flow',
          },
        ],
      };

      const mockUnitGroups = {
        data: [
          {
            id: 'fp-1',
            version: '02.00.000',
            refUnitGroupId: 'ug-1',
          },
        ],
      };

      const mockUnits = {
        data: [
          {
            id: 'ug-1',
            version: '02.00.000',
            name: 'kilogram',
          },
        ],
      };

      (getFlowProperties as jest.Mock).mockResolvedValue(mockFlowProperties);
      (getReferenceUnitGroups as jest.Mock).mockResolvedValue(mockUnitGroups);
      (getReferenceUnits as jest.Mock).mockResolvedValue(mockUnits);

      const result = (await getUnitData('flow', mockData)) as any[];

      expect(result[0].typeOfDataSet).toBe('Product flow');
      expect(result[0].refUnitRes.name).toBe('kilogram');
    });

    it('should handle empty data array', async () => {
      const result = await getUnitData('flow', []);

      expect(result).toEqual([]);
      expect(getFlowProperties).toHaveBeenCalledWith([]);
    });

    it('should handle missing refUnitRes when unit not found', async () => {
      const mockData = [
        {
          refUnitGroupId: 'ug-unknown',
          version: '01.00.000',
        },
      ];

      const mockUnits = {
        data: [],
      };

      (getReferenceUnits as jest.Mock).mockResolvedValue(mockUnits);

      const result = (await getUnitData('unitgroup', mockData)) as any[];

      expect(result[0].refUnitRes).toBeUndefined();
    });

    it('should fallback to unit group ID and unit ID matches for flow type', async () => {
      const mockData = [
        {
          referenceToFlowDataSetId: 'flow-1',
          referenceToFlowDataSetVersion: '01.00.000',
        },
      ];

      (getFlowProperties as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'flow-1',
            version: '01.00.000',
            refFlowPropertytId: 'fp-1',
            typeOfDataSet: 'Product flow',
          },
        ],
      });
      (getReferenceUnitGroups as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'fp-1',
            version: '99.00.000',
            refUnitGroupId: 'ug-1',
          },
        ],
      });
      (getReferenceUnits as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'ug-1',
            version: '88.00.000',
            name: 'fallback-unit',
          },
        ],
      });

      const result = (await getUnitData('flow', mockData)) as any[];

      expect(result[0].refUnitRes).toEqual({
        id: 'ug-1',
        version: '88.00.000',
        name: 'fallback-unit',
      });
    });

    it('should fallback to unit group ID and unit ID matches for flowproperty type', async () => {
      const mockData = [
        {
          referenceToFlowPropertyDataSetId: 'fp-1',
          referenceToFlowPropertyDataSetVersion: '01.00.000',
        },
      ];

      (getReferenceUnitGroups as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'fp-1',
            version: '99.00.000',
            refUnitGroupId: 'ug-1',
            refUnitGroupVersion: '99.00.000',
          },
        ],
      });
      (getReferenceUnits as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'ug-1',
            version: '88.00.000',
            name: 'flowproperty-fallback-unit',
          },
        ],
      });

      const result = (await getUnitData('flowproperty', mockData)) as any[];

      expect(result[0].refUnitRes).toEqual({
        id: 'ug-1',
        version: '88.00.000',
        name: 'flowproperty-fallback-unit',
      });
    });

    it('should use "-" when referenced flow property cannot be found', async () => {
      const mockData = [
        {
          referenceToFlowDataSetId: 'missing-flow',
          referenceToFlowDataSetVersion: '01.00.000',
        },
      ];

      (getFlowProperties as jest.Mock).mockResolvedValue({ data: [] });
      (getReferenceUnitGroups as jest.Mock).mockResolvedValue({ data: [] });
      (getReferenceUnits as jest.Mock).mockResolvedValue({ data: [] });

      const result = (await getUnitData('flow', mockData)) as any[];

      expect(result[0].typeOfDataSet).toBe('-');
      expect(result[0].refUnitRes).toBeUndefined();
    });
  });

  describe('removeEmptyObjects', () => {
    it('should remove empty objects from nested structure', () => {
      const input = {
        a: 1,
        b: {},
        c: {
          d: 2,
          e: {},
        },
      };
      const result = removeEmptyObjects(input);
      expect(result).toEqual({
        a: 1,
        c: {
          d: 2,
        },
      });
    });

    it('should remove null and undefined values', () => {
      const input = {
        a: null,
        b: undefined,
        c: 1,
      };
      const result = removeEmptyObjects(input);
      expect(result).toEqual({
        c: 1,
      });
    });

    it('should handle deeply nested empty objects', () => {
      const input = {
        a: {
          b: {
            c: {},
          },
        },
      };
      const result = removeEmptyObjects(input);
      expect(result).toEqual({});
    });

    it('should preserve non-empty nested objects', () => {
      const input = {
        a: {
          b: {
            c: 'value',
          },
        },
      };
      const result = removeEmptyObjects(input);
      expect(result).toEqual({
        a: {
          b: {
            c: 'value',
          },
        },
      });
    });

    it('should preserve array entries while removing empty nested objects inside them', () => {
      const obj = {
        list: [{ keep: 'value', empty: {} }, {}, { nested: { value: 1, drop: undefined } }],
      };

      const result = removeEmptyObjects(obj);

      expect(result).toEqual({
        list: [{ keep: 'value' }, { nested: { value: 1 } }],
      });
    });

    it('should remove empty arrays and array items that collapse to empty values', () => {
      const input = {
        a: [],
        b: [{}, null, undefined, '', { c: 'value' }],
        c: ['kept'],
      };

      const result = removeEmptyObjects(input);

      expect(result).toEqual({
        b: [{ c: 'value' }],
        c: ['kept'],
      });
    });

    it('should remove empty strings and whitespace-only strings from nested objects', () => {
      const input = {
        a: '',
        b: '   ',
        c: {
          d: '',
          e: 'value',
        },
      };

      const result = removeEmptyObjects(input);

      expect(result).toEqual({
        c: {
          e: 'value',
        },
      });
    });

    it('should preserve boolean false and numeric zero values', () => {
      const input = {
        a: false,
        b: 0,
        c: {
          d: false,
          e: 0,
        },
      };

      const result = removeEmptyObjects(input);

      expect(result).toEqual({
        a: false,
        b: 0,
        c: {
          d: false,
          e: 0,
        },
      });
    });

    it('should preserve empty downstreamProcess placeholders in model connections', () => {
      const input = {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [
                  {
                    connections: {
                      outputExchange: {
                        '@flowUUID': 'flow-1',
                        downstreamProcess: {},
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      };

      const result = removeEmptyObjects(input);

      expect(
        result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
          .processInstance[0].connections.outputExchange.downstreamProcess,
      ).toEqual({});
    });

    it('should preserve empty downstreamProcess entries inside arrays that describe model connections', () => {
      const input = {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [
                  {
                    connections: {
                      outputExchange: {
                        downstreamProcess: [{}, { '@refObjectId': 'proc-2' }],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      };

      const result = removeEmptyObjects(input);

      expect(
        result.lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes
          .processInstance[0].connections.outputExchange.downstreamProcess,
      ).toEqual([{}, { '@refObjectId': 'proc-2' }]);
    });
  });

  describe('isDataUnderReview', () => {
    it('should only treat numeric review states between 20 and 99 as under review', () => {
      expect(isDataUnderReview(null)).toBe(false);
      expect(isDataUnderReview(10)).toBe(false);
      expect(isDataUnderReview(20)).toBe(true);
      expect(isDataUnderReview(100)).toBe(false);
    });
  });

  describe('isSupabaseDuplicateKeyError', () => {
    it('should detect duplicate key errors by postgres code', () => {
      expect(isSupabaseDuplicateKeyError({ code: '23505' })).toBe(true);
    });

    it('should reject non-duplicate and missing error payloads', () => {
      expect(isSupabaseDuplicateKeyError({ code: '22001' })).toBe(false);
      expect(isSupabaseDuplicateKeyError(null)).toBe(false);
      expect(isSupabaseDuplicateKeyError(undefined)).toBe(false);
    });
  });

  describe('genClassStr', () => {
    const classification = mockClassificationData;

    it('should generate classification string for single level', () => {
      const result = genClassStr(['category1'], 0, classification);
      expect(result).toBe('Category 1');
    });

    it('should generate classification string for multiple levels', () => {
      const result = genClassStr(['category1', 'subcategory1'], 0, classification);
      expect(result).toBe('Category 1 > Subcategory 1');
    });

    it('should handle missing classifications', () => {
      const result = genClassStr(['unknown'], 0, classification);
      expect(result).toBe('unknown');
    });

    it('should return empty string for empty data', () => {
      const result = genClassStr([], 0, classification);
      expect(result).toBe('');
    });

    it('should handle partially matched classifications', () => {
      const result = genClassStr(['category1', 'unknown'], 0, classification);
      expect(result).toBe('Category 1 > unknown');
    });

    it('should recurse through multiple unmatched classification levels', () => {
      const result = genClassStr(['unknown-1', 'unknown-2'], 0, classification);
      expect(result).toBe('unknown-1 > unknown-2');
    });
  });

  describe('genClassIdList', () => {
    const classification = mockClassificationData;

    it('should generate ID list for classifications', () => {
      const result = genClassIdList(['category1', 'subcategory1'], 0, classification);
      expect(result).toEqual(['1', '1-1']);
    });

    it('should handle missing classifications with empty strings', () => {
      const result = genClassIdList(['unknown'], 0, classification);
      expect(result).toEqual(['']);
    });

    it('should handle mixed matched/unmatched classifications', () => {
      const result = genClassIdList(['category1', 'unknown'], 0, classification);
      expect(result).toEqual(['1', '']);
    });

    it('should recurse through unmatched classification levels', () => {
      const result = genClassIdList(['unknown-1', 'unknown-2'], 0, classification);
      expect(result).toEqual(['', '']);
    });

    it('should fallback to empty ID when matched classification has no id', () => {
      const result = genClassIdList(['category-no-id'], 0, [
        { value: 'category-no-id', label: 'Category without id', children: [] } as any,
      ]);

      expect(result).toEqual(['']);
    });
  });

  describe('getLang', () => {
    it('should return "zh" for "zh-CN"', () => {
      expect(getLang('zh-CN')).toBe('zh');
    });

    it('should resolve each declared app locale to its own content language', () => {
      expect(getLang('en-US')).toBe('en');
      expect(getLang('fr-FR')).toBe('fr');
      expect(getLang('fr_FR.UTF-8')).toBe('fr');
      expect(getLang('de-DE')).toBe('de');
      expect(getLang('es-ES')).toBe('en');
    });
  });

  describe('getLangText', () => {
    it('should get text for specified language', () => {
      const langTexts = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      expect(getLangText(langTexts, 'zh')).toBe('你好');
      expect(getLangText(langTexts, 'en')).toBe('Hello');
    });

    it('should fallback to English if language not found', () => {
      const langTexts = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      expect(getLangText(langTexts, 'fr')).toBe('Hello');
    });

    it('should prefer German and French content before the declared English fallback', () => {
      const langTexts = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'de', '#text': 'Hallo' },
        { '@xml:lang': 'fr', '#text': 'Bonjour' },
      ];
      expect(getLangText(langTexts, 'de')).toBe('Hallo');
      expect(getLangText(langTexts, 'fr')).toBe('Bonjour');
    });

    it('should not use an undeclared language when the requested fallback chain is unavailable', () => {
      const langTexts = [
        { '@xml:lang': 'zh', '#text': '你好' },
        { '@xml:lang': 'fr', '#text': 'Bonjour' },
      ];
      expect(getLangText(langTexts, 'de')).toBe('-');
    });

    it('should skip empty requested-language values before using the declared fallback', () => {
      const langTexts = [
        { '@xml:lang': 'de', '#text': '  ' },
        { '@xml:lang': 'de', '#text': 'Hallo' },
        { '@xml:lang': 'en', '#text': 'Hello' },
      ];

      expect(getLangText(langTexts, 'de')).toBe('Hallo');
      expect(
        getLangText(
          [
            { '@xml:lang': 'de', '#text': '-' },
            { '@xml:lang': 'en', '#text': 'Hello' },
          ],
          'de',
        ),
      ).toBe('Hello');
    });

    it('should handle single object instead of array', () => {
      const langTexts = { '@xml:lang': 'en', '#text': 'Hello' };
      expect(getLangText(langTexts, 'en')).toBe('Hello');
    });

    it('should return "-" for missing text', () => {
      const langTexts = [{ '@xml:lang': 'en' }];
      expect(getLangText(langTexts, 'en')).toBe('-');
    });

    it('should fallback to "-" when English fallback exists without text', () => {
      expect(getLangText([{ '@xml:lang': 'en' }], 'fr')).toBe('-');
    });

    it('should fallback to "-" when first array item has no text', () => {
      expect(getLangText([{ '@xml:lang': 'zh' }], 'fr')).toBe('-');
    });

    it('should fallback to "-" when single object has no text', () => {
      expect(getLangText({ '@xml:lang': 'en' }, 'en')).toBe('-');
    });

    it('should swallow unexpected lang payload errors and log them', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const badLangTexts = new Proxy(
        {},
        {
          get() {
            throw new Error('boom');
          },
        },
      );

      expect(getLangText(badLangTexts, 'en')).toBe('-');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getExactLangText', () => {
    const langTexts = [
      { '@xml:lang': 'en', '#text': 'Hello' },
      { '@xml:lang': 'de', '#text': '' },
      { '@xml:lang': 'de', '#text': 'Hallo' },
    ];

    it('returns only the requested content language and skips empty duplicate entries', () => {
      expect(getExactLangText(langTexts, 'de-DE')).toBe('Hallo');
      expect(getExactLangText(langTexts, 'fr-FR')).toBe('-');
    });

    it('does not apply the reading fallback chain to a tagged single object', () => {
      expect(getExactLangText({ '@xml:lang': 'en', '#text': 'Hello' }, 'fr')).toBe('-');
      expect(getExactLangText({ '#text': 'Legacy text' }, 'fr')).toBe('Legacy text');
    });

    it('keeps an unregistered language exact instead of normalizing it to English', () => {
      expect(
        getExactLangText(
          [
            { '@xml:lang': 'en', '#text': 'Hello' },
            { '@xml:lang': 'ja', '#text': 'こんにちは' },
          ],
          'ja-JP',
        ),
      ).toBe('こんにちは');
    });

    it('handles non-string locale input, untagged array entries, and primitive text payloads', () => {
      expect(getExactLangText([{ '#text': 'Legacy text' }], undefined as any)).toBe('Legacy text');
      expect(getExactLangText(null, 'en')).toBe('-');
    });
  });

  describe('getLangJson', () => {
    it('should return object for single item array', () => {
      const input = [{ '@xml:lang': 'en', '#text': 'Hello' }];
      const result = getLangJson(input);
      expect(result).toEqual({ '@xml:lang': 'en', '#text': 'Hello' });
    });

    it('should return array for multiple items', () => {
      const input = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      const result = getLangJson(input);
      expect(result).toEqual(input);
    });

    it('should filter out empty items', () => {
      const input = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        null,
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      const result = getLangJson(input);
      expect(result).toHaveLength(2);
    });

    it('should return object for non-array input', () => {
      const input = { '@xml:lang': 'en', '#text': 'Hello' };
      expect(getLangJson(input)).toEqual(input);
    });

    it('should return empty object for null/undefined', () => {
      expect(getLangJson(null)).toEqual({});
      expect(getLangJson(undefined)).toEqual({});
    });
  });

  describe('getLangList', () => {
    it('should convert single object to array', () => {
      const input = { '@xml:lang': 'en', '#text': 'Hello' };
      const result = getLangList(input);
      expect(result).toEqual([input]);
    });

    it('should return array as is', () => {
      const input = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      const result = getLangList(input);
      expect(result).toEqual(input);
    });

    it('should return empty array for null/undefined', () => {
      expect(getLangList(null)).toEqual([]);
      expect(getLangList(undefined)).toEqual([]);
    });
  });

  describe('mergeLangArrays', () => {
    it('should merge arrays with common languages', () => {
      const arr1 = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      const arr2 = [
        { '@xml:lang': 'en', '#text': ' World' },
        { '@xml:lang': 'zh', '#text': '世界' },
      ];
      const result = mergeLangArrays(arr1, arr2);
      expect(result).toEqual([
        { '@xml:lang': 'en', '#text': 'Hello World' },
        { '@xml:lang': 'zh', '#text': '你好世界' },
      ]);
    });

    it('should only include common languages', () => {
      const arr1 = [
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '你好' },
      ];
      const arr2 = [
        { '@xml:lang': 'en', '#text': ' World' },
        { '@xml:lang': 'fr', '#text': ' Monde' },
      ];
      const result = mergeLangArrays(arr1, arr2);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ '@xml:lang': 'en', '#text': 'Hello World' });
    });

    it('should return empty array for no arguments', () => {
      const result = mergeLangArrays();
      expect(result).toEqual([]);
    });

    it('should fallback to empty text when a common language entry is missing text', () => {
      const arr1 = [{ '@xml:lang': 'en' }];
      const arr2 = [{ '@xml:lang': 'en', '#text': 'World' }];

      expect(mergeLangArrays(arr1, arr2)).toEqual([{ '@xml:lang': 'en', '#text': 'World' }]);
    });
  });

  describe('normalizeLangPayloadBeforeSave', () => {
    it('retains every same-language descriptive paragraph in order and is idempotent', async () => {
      const field = 'common:generalComment';
      const entries = [
        { '@xml:lang': 'zh', '#text': '第一段说明。' },
        { '@xml:lang': 'en', '#text': 'First paragraph.' },
        { '@xml:lang': 'zh', '#text': '第二段包括第一段说明。' },
        { '@xml:lang': 'en', '#text': 'Second paragraph includes First paragraph.' },
      ];
      const original = {
        processDataSet: { processInformation: { dataSetInformation: { [field]: entries } } },
      };
      const result = await normalizeLangPayloadBeforeSave(original);
      expect(result.issues).toEqual([]);
      expect(result.payload.processDataSet.processInformation.dataSetInformation[field]).toEqual([
        { '@xml:lang': 'zh', '#text': '第一段说明。\n\n第二段包括第一段说明。' },
        {
          '@xml:lang': 'en',
          '#text': 'First paragraph.\n\nSecond paragraph includes First paragraph.',
        },
      ]);
      expect(await normalizeLangPayloadBeforeSave(result.payload)).toEqual(result);
      expect(original.processDataSet.processInformation.dataSetInformation[field]).toEqual(entries);
    });

    it.each(['baseName', 'annualSupplyOrProductionVolume', 'common:shortDescription'])(
      'rejects duplicate language conflicts in %s without selecting or joining a value',
      async (field) => {
        const entries = [
          { '@xml:lang': 'en', '#text': 'First value' },
          { '@xml:lang': 'en', '#text': 'Second value' },
        ];
        const result = await normalizeLangPayloadBeforeSave({ [field]: entries });
        expect(result.issues).toEqual([
          expect.objectContaining({ path: `${field}[1].@xml:lang`, code: 'duplicate_language' }),
        ]);
        expect(result.payload[field]).toEqual(entries);
      },
    );

    it('keeps independent exchange comments separate and retains language variants', async () => {
      const result = await normalizeLangPayloadBeforeSave({
        exchanges: [
          {
            generalComment: [
              { '@xml:lang': 'en', '#text': 'A' },
              { '@xml:lang': 'en', '#text': 'B' },
              { '@xml:lang': 'en-GB', '#text': 'Variant' },
            ],
          },
          { generalComment: { '@xml:lang': 'en', '#text': 'Other exchange' } },
        ],
      });
      expect(result.issues).toEqual([]);
      expect(result.payload.exchanges).toEqual([
        {
          generalComment: [
            { '@xml:lang': 'en', '#text': 'A\n\nB' },
            { '@xml:lang': 'en-gb', '#text': 'Variant' },
          ],
        },
        { generalComment: { '@xml:lang': 'en', '#text': 'Other exchange' } },
      ]);
    });

    it('rejects extra attributes at the exact path and retains their original values', async () => {
      const entry = { '@xml:lang': 'en', '#text': 'Original', '@source': 'evidence' };
      const result = await normalizeLangPayloadBeforeSave({ 'common:generalComment': entry });
      expect(result.issues).toEqual([
        expect.objectContaining({
          path: 'common:generalComment.@source',
          code: 'unsupported_language_attribute',
        }),
      ]);
      expect(result.payload['common:generalComment']).toEqual(entry);
    });

    it('rejects an oversized joined exchange comment without truncation or repeated language output', async () => {
      const entries = [
        { '@xml:lang': 'en', '#text': 'A'.repeat(250) },
        { '@xml:lang': 'en', '#text': 'B'.repeat(249) },
      ];
      const result = await normalizeLangPayloadBeforeSave({ generalComment: entries });
      expect(result.payload.generalComment).toEqual(entries);
      expect(result.issues).toEqual([
        expect.objectContaining({
          path: 'generalComment[1].#text',
          code: 'localized_text_too_long',
        }),
      ]);
      const boundary = await normalizeLangPayloadBeforeSave({
        generalComment: [entries[0], { ...entries[1], '#text': 'B'.repeat(248) }],
      });
      expect(boundary.issues).toEqual([]);
      expect(boundary.payload.generalComment['#text']).toHaveLength(500);
      const unlimited = await normalizeLangPayloadBeforeSave({ 'common:generalComment': entries });
      expect(unlimited.issues).toEqual([]);
      expect(unlimited.payload['common:generalComment']['#text']).toHaveLength(501);
    });

    it('checks the bounded LCIA use advice without limiting Process free text', async () => {
      const entries = [
        { '@xml:lang': 'en', '#text': 'A'.repeat(500) },
        { '@xml:lang': 'en', '#text': 'B'.repeat(499) },
      ];
      const result = await normalizeLangPayloadBeforeSave({
        LCIAMethodDataSet: { useAdviceForDataSet: entries },
      });
      expect(result.issues).toEqual([expect.objectContaining({ code: 'localized_text_too_long' })]);
      expect(
        (await normalizeLangPayloadBeforeSave({ processDataSet: { useAdviceForDataSet: entries } }))
          .issues,
      ).toEqual([]);
    });

    it('leaves opaque CommonOther extension structures untouched', async () => {
      const extension = {
        extension: [
          { '@xml:lang': 'en', '#text': 'First structured entity', '@id': 'one' },
          { '@xml:lang': 'en', '#text': 'Second structured entity', '@id': 'two' },
        ],
        nested: {
          'common:generalComment': [
            { '@xml:lang': 'zh', '#text': '扩展甲' },
            { '@xml:lang': 'zh', '#text': '扩展乙' },
          ],
        },
      };
      const translateZhToEn = jest.fn();
      const result = await normalizeLangPayloadBeforeSave(
        { processDataSet: { 'common:other': extension } },
        { translateZhToEn },
      );
      expect(result.issues).toEqual([]);
      expect(result.payload.processDataSet['common:other']).toEqual(extension);
      expect(translateZhToEn).not.toHaveBeenCalled();
    });

    it.each([{ '@id': 'structured sibling', '#text': 'Keep me' }, 'Keep this primitive'])(
      'blocks meaningful mixed language-list siblings without dropping them',
      async (sibling) => {
        const value = [{ '@xml:lang': 'en', '#text': 'Paragraph' }, sibling];
        const result = await normalizeLangPayloadBeforeSave({ 'common:generalComment': value });
        expect(result.payload['common:generalComment']).toEqual(value);
        expect(result.issues).toEqual([
          expect.objectContaining({
            path: 'common:generalComment[1]',
            code: 'invalid_language_entry',
          }),
        ]);
      },
    );

    it('retains existing empty-row cleanup when joining descriptive paragraphs', async () => {
      const result = await normalizeLangPayloadBeforeSave({
        'common:generalComment': [
          null,
          {},
          { '@xml:lang': 'en', '#text': 'First' },
          undefined,
          { '@xml:lang': 'en', '#text': 'Second' },
        ],
      });
      expect(result.issues).toEqual([]);
      expect(result.payload['common:generalComment']).toEqual({
        '@xml:lang': 'en',
        '#text': 'First\n\nSecond',
      });
    });

    it.each([
      ['common:classification', 'common:class', '@classId'],
      ['common:elementaryFlowCategorization', 'common:category', '@catId'],
    ])('preserves independent canonical %s hierarchy labels', async (parentField, field, idKey) => {
      const hierarchy = [
        { '@xml:lang': 'en', '@level': '0', [idKey]: 'A', '#text': 'Parent' },
        { '@xml:lang': 'en', '@level': '1', [idKey]: 'A1', '#text': 'Child' },
      ];
      const payload = {
        flowDataSet: {
          flowInformation: {
            dataSetInformation: {
              classificationInformation: { [parentField]: { [field]: hierarchy } },
            },
          },
        },
      };
      const result = await normalizeLangPayloadBeforeSave(payload);
      expect(result.issues).toEqual([]);
      expect(result.payload).toEqual(payload);
    });

    it('does not exempt hierarchy attributes placed on a localized comment', async () => {
      const entry = { '@xml:lang': 'en', '#text': 'Comment', '@level': '0' };
      const result = await normalizeLangPayloadBeforeSave({ 'common:generalComment': entry });
      expect(result.payload['common:generalComment']).toEqual(entry);
      expect(result.issues).toEqual([
        expect.objectContaining({
          path: 'common:generalComment.@level',
          code: 'unsupported_language_attribute',
        }),
      ]);
    });

    it('should add English translation when only Chinese content exists', async () => {
      const payload = {
        title: [{ '@xml:lang': 'zh', '#text': '钢铁制造' }],
      };
      const translateZhToEn = jest.fn().mockResolvedValue('Steel manufacturing');

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(translateZhToEn).toHaveBeenCalledWith('钢铁制造', 'title');
      expect(result.issues).toEqual([]);
      expect(result.payload.title).toEqual([
        { '@xml:lang': 'en', '#text': 'Steel manufacturing' },
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
      ]);
    });

    it('should translate invalid English when English field contains Chinese only', async () => {
      const payload = {
        title: [{ '@xml:lang': 'en', '#text': '钢铁制造' }],
      };
      const translateZhToEn = jest.fn().mockResolvedValue('Steel manufacturing');

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(translateZhToEn).toHaveBeenCalledWith('钢铁制造', 'title');
      expect(result.issues).toEqual([]);
      expect(result.payload.title).toEqual({ '@xml:lang': 'en', '#text': 'Steel manufacturing' });
    });

    it('should translate invalid English when English field contains mixed Chinese and English', async () => {
      const payload = {
        title: [{ '@xml:lang': 'en', '#text': 'Steel钢铁' }],
      };
      const translateZhToEn = jest.fn().mockResolvedValue('Steel');

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(translateZhToEn).toHaveBeenCalledWith('Steel钢铁', 'title');
      expect(result.issues).toEqual([]);
      expect(result.payload.title).toEqual({ '@xml:lang': 'en', '#text': 'Steel' });
    });

    it('should report missing English when translation is unavailable', async () => {
      const payload = {
        title: [{ '@xml:lang': 'zh', '#text': '钢铁制造' }],
      };
      const translateZhToEn = jest.fn().mockResolvedValue(undefined);

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        path: 'title',
        code: 'missing_en',
      });
    });

    it('should report invalid English when mixed with non-English scripts', async () => {
      const payload = {
        title: [
          { '@xml:lang': 'en', '#text': 'Steel钢铁' },
          { '@xml:lang': 'zh', '#text': '钢铁' },
        ],
      };

      const result = await normalizeLangPayloadBeforeSave(payload);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        path: 'title',
        code: 'invalid_en',
      });
    });

    it('should keep non-language arrays untouched', async () => {
      const payload = {
        classes: [{ '@level': '0', '#text': 'Category' }],
      };

      const result = await normalizeLangPayloadBeforeSave(payload);

      expect(result.issues).toEqual([]);
      expect(result.payload.classes).toEqual(payload.classes);
    });

    it('should reuse cached translations for repeated invalid English source text', async () => {
      const payload = {
        title: [
          { '@xml:lang': 'en', '#text': '钢铁制造' },
          { '@xml:lang': 'zh', '#text': '钢铁制造' },
        ],
      };
      const translateZhToEn = jest.fn().mockResolvedValue(undefined);

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(translateZhToEn).toHaveBeenCalledTimes(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        path: 'title',
        code: 'invalid_en',
      });
    });

    it('should skip invalid language entries and normalize primitive text values', async () => {
      const payload = {
        title: [
          {},
          { '@xml:lang': '', '#text': 'ignored' },
          { '@xml:lang': 'en', '#text': 'Hello' },
          { '@xml:lang': 'zh', '#text': 123 },
          { '@xml:lang': 'en', '#text': '' },
        ],
      };

      const result = await normalizeLangPayloadBeforeSave(payload);

      expect(result.issues).toEqual([]);
      expect(result.payload.title).toEqual([
        { '@xml:lang': 'en', '#text': 'Hello' },
        { '@xml:lang': 'zh', '#text': '123' },
      ]);
    });

    it('should normalize a single language object and preserve null sibling values', async () => {
      const payload = {
        title: { '@xml:lang': 'zh', '#text': '钢铁制造' },
        note: null,
      };
      const translateZhToEn = jest.fn().mockResolvedValue('Steel manufacturing');

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(result.payload.note).toBeNull();
      expect(result.payload.title).toEqual([
        { '@xml:lang': 'en', '#text': 'Steel manufacturing' },
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
      ]);
    });

    it('should preserve empty objects when all language entries are filtered out', async () => {
      const payload = {
        title: [{ '@xml:lang': 'en', '#text': '' }],
      };

      const result = await normalizeLangPayloadBeforeSave(payload);

      expect(result.payload.title).toEqual({});
    });

    it('should skip entries with non-string language codes', async () => {
      const payload = {
        title: [
          { '@xml:lang': 42, '#text': 'ignored' },
          { '@xml:lang': 'en', '#text': 'Hello' },
        ],
      };

      const result = await normalizeLangPayloadBeforeSave(payload);

      expect(result.payload.title).toEqual({ '@xml:lang': 'en', '#text': 'Hello' });
    });

    it('should prefer translated Chinese content over retranslating invalid English directly', async () => {
      const payload = {
        title: [
          { '@xml:lang': 'en', '#text': 'Steel钢铁' },
          { '@xml:lang': 'zh', '#text': '钢铁制造' },
        ],
      };
      const translateZhToEn = jest.fn().mockResolvedValue('Steel manufacturing');

      const result = await normalizeLangPayloadBeforeSave(payload, { translateZhToEn });

      expect(translateZhToEn).toHaveBeenCalledTimes(1);
      expect(result.payload.title).toEqual([
        { '@xml:lang': 'en', '#text': 'Steel manufacturing' },
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
      ]);
    });

    it('should supplement an empty English placeholder during validation-only normalization', async () => {
      const payload = {
        title: [{ '@xml:lang': 'zh', '#text': '钢铁制造' }],
      };
      const translateZhToEn = jest.fn().mockResolvedValue(undefined);

      const result = await normalizeLangPayloadBeforeSave(payload, {
        intent: 'validation',
        translateZhToEn,
      });

      expect(result.issues).toEqual([]);
      expect(result.payload.title).toEqual([
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
        { '@xml:lang': 'en', '#text': undefined },
      ]);
      expect(result.supplementedEnglishPlaceholderPaths).toEqual(['title']);
      expect(result.translatedPaths).toEqual([]);
    });

    it('should preserve raw language ordering when validation-only normalization adds a missing English placeholder', async () => {
      const payload = {
        title: [
          { '@xml:lang': 'zh', '#text': '钢铁制造' },
          { '@xml:lang': 'en', '#text': '' },
        ],
      };
      const translateZhToEn = jest.fn().mockResolvedValue(undefined);

      const result = await normalizeLangPayloadBeforeSave(payload, {
        intent: 'validation',
        translateZhToEn,
      });

      expect(result.payload.title).toEqual([
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
        { '@xml:lang': 'en', '#text': undefined },
      ]);
      expect(result.supplementedEnglishPlaceholderPaths).toEqual(['title']);
      expect(result.translatedPaths).toEqual([]);
    });

    it('should avoid recording an empty root path when validation-only normalization supplements a root lang list', async () => {
      const payload = [{ '@xml:lang': 'zh', '#text': '钢铁制造' }];

      const result = await normalizeLangPayloadBeforeSave(payload, {
        intent: 'validation',
        translateZhToEn: jest.fn().mockResolvedValue(undefined),
      });

      expect(result.payload).toEqual([
        { '@xml:lang': 'zh', '#text': '钢铁制造' },
        { '@xml:lang': 'en', '#text': undefined },
      ]);
      expect(result.supplementedEnglishPlaceholderPaths).toEqual([]);
    });
  });

  describe('getLangValidationErrorMessage', () => {
    it.each(SUPPORTED_APP_LOCALES)(
      'reports full conflict paths with localized copy in %s',
      (locale) => {
        const issues = [
          {
            path: 'processDataSet.name.baseName[1].@xml:lang',
            code: 'duplicate_language' as const,
            message: 'conflict',
          },
          {
            path: 'processDataSet.comment.@source',
            code: 'unsupported_language_attribute' as const,
            message: 'attribute',
          },
        ];
        const message = getLangValidationErrorMessage(issues, 1, locale);
        expect(message).toContain(issues[0].path);
        expect(message).toContain('1');
        expect(message).not.toContain('{count');
        expect(getLangValidationErrorMessage(issues, 5, locale)).toContain(issues[1].path);
      },
    );

    it('reports the root for a root-level localized conflict', () => {
      expect(
        getLangValidationErrorMessage([
          { path: '', code: 'duplicate_language', message: 'conflict' },
        ]),
      ).toContain('(root)');
    });

    it('should return compact field-only message for multiple issue paths', () => {
      const message = getLangValidationErrorMessage([
        {
          path: 'processDataSet.processInformation.dataSetInformation.name.treatmentStandardsRoutes',
          code: 'missing_en',
          message: 'x',
        },
        {
          path: 'processDataSet.processInformation.dataSetInformation.name.baseName',
          code: 'invalid_en',
          message: 'y',
        },
      ]);

      expect(message).toBe(
        'Save failed, the following fields are missing English: treatmentStandardsRoutes,baseName.',
      );
    });

    it('should return Chinese localized field-only message when locale is zh-CN', () => {
      const message = getLangValidationErrorMessage(
        [
          {
            path: 'processDataSet.processInformation.dataSetInformation.name.treatmentStandardsRoutes',
            code: 'missing_en',
            message: 'x',
          },
          {
            path: 'processDataSet.processInformation.dataSetInformation.name.baseName',
            code: 'invalid_en',
            message: 'y',
          },
        ],
        5,
        'zh-CN',
      );

      expect(message).toBe('保存失败，以下字段缺少英文：treatmentStandardsRoutes,baseName.');
    });

    it('should return German localized field-only message when locale is de-DE', () => {
      const message = getLangValidationErrorMessage(
        [
          {
            path: 'processDataSet.processInformation.dataSetInformation.name.baseName',
            code: 'missing_en',
            message: 'x',
          },
        ],
        5,
        'de-DE',
      );

      expect(message).toBe(
        'Speichern fehlgeschlagen. In folgenden Feldern fehlt die englische Fassung: baseName.',
      );
    });

    it('should return French localized field-only message when locale is fr-FR', () => {
      const message = getLangValidationErrorMessage(
        [
          {
            path: 'processDataSet.processInformation.dataSetInformation.name.baseName',
            code: 'missing_en',
            message: 'x',
          },
        ],
        5,
        'fr-FR',
      );

      expect(message).toBe(
        "Échec de l'enregistrement : les champs suivants ne sont pas renseignés en anglais : baseName.",
      );
    });

    it('should fall back to English validation copy for an unsupported app locale', () => {
      expect(
        getLangValidationErrorMessage(
          [{ path: 'baseName', code: 'missing_en', message: 'x' }],
          5,
          'es-ES',
        ),
      ).toBe('Save failed, the following fields are missing English: baseName.');
    });

    it('should return empty string when there are no issues', () => {
      expect(getLangValidationErrorMessage([])).toBe('');
      expect(getLangValidationErrorMessage(undefined as any)).toBe('');
    });

    it('should pluralize multiple extra issue paths beyond the display limit', () => {
      const message = getLangValidationErrorMessage(
        [
          { path: 'a', code: 'missing_en', message: 'x' },
          { path: 'b', code: 'missing_en', message: 'x' },
          { path: 'c', code: 'missing_en', message: 'x' },
          { path: 'd', code: 'missing_en', message: 'x' },
        ],
        2,
      );

      expect(message).toBe(
        'Save failed, the following fields are missing English: a,b, plus 2 more fields.',
      );
    });

    it('should use the singular English form for one extra issue path', () => {
      const message = getLangValidationErrorMessage(
        [
          { path: 'a', code: 'missing_en', message: 'x' },
          { path: 'b', code: 'missing_en', message: 'x' },
        ],
        1,
      );

      expect(message).toBe(
        'Save failed, the following fields are missing English: a, plus 1 more field.',
      );
    });

    it('should format the extra field count with the Chinese ICU branch', () => {
      const message = getLangValidationErrorMessage(
        [
          { path: 'a', code: 'missing_en', message: 'x' },
          { path: 'b', code: 'missing_en', message: 'x' },
          { path: 'c', code: 'missing_en', message: 'x' },
        ],
        1,
        'zh-CN',
      );

      expect(message).toBe('保存失败，以下字段缺少英文：a，另有 2 个字段。');
    });

    it.each([
      [
        'en-US',
        'Save failed, the following fields are missing English: field0, plus 1,001 more fields.',
      ],
      ['zh-CN', '保存失败，以下字段缺少英文：field0，另有 1,001 个字段。'],
      [
        'de-DE',
        'Speichern fehlgeschlagen. In folgenden Feldern fehlt die englische Fassung: field0; außerdem 1.001 weitere Felder.',
      ],
      [
        'fr-FR',
        "Échec de l'enregistrement : les champs suivants ne sont pas renseignés en anglais : field0, plus 1 001 autres champs.",
      ],
    ])('formats large counts for %s', (locale, expected) => {
      const issues = Array.from({ length: 1002 }, (_, index) => ({
        path: `field${index}`,
        code: 'missing_en' as const,
        message: 'x',
      }));

      expect(getLangValidationErrorMessage(issues, 1, locale)).toBe(expected);
    });

    it('should treat empty issue paths as root', () => {
      const message = getLangValidationErrorMessage([
        { path: '', code: 'missing_en', message: 'x' },
      ]);
      expect(message).toBe('Save failed, the following fields are missing English: (root).');
    });

    it('should recover from the reviewed English snapshot when live validator messages are missing', () => {
      const mutableEnMessages = enValidatorMessages as Record<string, string | undefined>;
      const originalMessages = {
        missingEnglish: mutableEnMessages['validator.langValidation.missingEnglish'],
        missingEnglishMore: mutableEnMessages['validator.langValidation.missingEnglishMore'],
        root: mutableEnMessages['validator.langValidation.root'],
      };

      mutableEnMessages['validator.langValidation.missingEnglish'] = undefined;
      mutableEnMessages['validator.langValidation.missingEnglishMore'] = undefined;
      mutableEnMessages['validator.langValidation.root'] = undefined;

      try {
        expect(
          getLangValidationErrorMessage([{ path: '', code: 'missing_en', message: 'x' }]),
        ).toBe('Save failed, the following fields are missing English: (root).');

        expect(
          getLangValidationErrorMessage(
            [
              { path: 'a', code: 'missing_en', message: 'x' },
              { path: 'b', code: 'invalid_en', message: 'y' },
            ],
            1,
          ),
        ).toBe('Save failed, the following fields are missing English: a, plus 1 more field.');
      } finally {
        mutableEnMessages['validator.langValidation.missingEnglish'] =
          originalMessages.missingEnglish;
        mutableEnMessages['validator.langValidation.missingEnglishMore'] =
          originalMessages.missingEnglishMore;
        mutableEnMessages['validator.langValidation.root'] = originalMessages.root;
      }
    });

    it('should preserve a plural template when its numeric value is missing', () => {
      const mutableEnMessages = enValidatorMessages as Record<string, string | undefined>;
      const originalMessage = mutableEnMessages['validator.langValidation.missingEnglish'];
      mutableEnMessages['validator.langValidation.missingEnglish'] =
        'Missing {count, plural, one {# field} other {# fields}}: {fields}.';

      try {
        expect(
          getLangValidationErrorMessage([{ path: 'name', code: 'missing_en', message: 'x' }]),
        ).toBe('Missing {count, plural, one {# field} other {# fields}}: name.');
      } finally {
        mutableEnMessages['validator.langValidation.missingEnglish'] = originalMessage;
      }
    });

    it('should recover the Chinese root label from the reviewed native snapshot', () => {
      const mutableZhMessages = zhValidatorMessages as Record<string, string | undefined>;
      const originalRoot = mutableZhMessages['validator.langValidation.root'];

      mutableZhMessages['validator.langValidation.root'] = undefined;

      try {
        expect(
          getLangValidationErrorMessage(
            [{ path: '', code: 'missing_en', message: 'x' }],
            5,
            'zh-CN',
          ),
        ).toBe('保存失败，以下字段缺少英文：根节点.');
      } finally {
        mutableZhMessages['validator.langValidation.root'] = originalRoot;
      }
    });

    it('should recover German copy from the reviewed native snapshot when live messages are missing', () => {
      const mutableDeMessages = deValidatorMessages as Record<string, string | undefined>;
      const originalMessages = {
        missingEnglish: mutableDeMessages['validator.langValidation.missingEnglish'],
        missingEnglishMore: mutableDeMessages['validator.langValidation.missingEnglishMore'],
        root: mutableDeMessages['validator.langValidation.root'],
      };

      mutableDeMessages['validator.langValidation.missingEnglish'] = undefined;
      mutableDeMessages['validator.langValidation.missingEnglishMore'] = undefined;
      mutableDeMessages['validator.langValidation.root'] = undefined;

      try {
        expect(
          getLangValidationErrorMessage(
            [{ path: '', code: 'missing_en', message: 'x' }],
            5,
            'de-DE',
          ),
        ).toBe(
          'Speichern fehlgeschlagen. In folgenden Feldern fehlt die englische Fassung: (Stammebene).',
        );
      } finally {
        mutableDeMessages['validator.langValidation.missingEnglish'] =
          originalMessages.missingEnglish;
        mutableDeMessages['validator.langValidation.missingEnglishMore'] =
          originalMessages.missingEnglishMore;
        mutableDeMessages['validator.langValidation.root'] = originalMessages.root;
      }
    });

    it('should keep the reviewed French catalog copy when validator messages are missing', () => {
      const mutableFrMessages = frValidatorMessages as Record<string, string | undefined>;
      const originalMessages = {
        missingEnglish: mutableFrMessages['validator.langValidation.missingEnglish'],
        missingEnglishMore: mutableFrMessages['validator.langValidation.missingEnglishMore'],
        root: mutableFrMessages['validator.langValidation.root'],
      };

      mutableFrMessages['validator.langValidation.missingEnglish'] = undefined;
      mutableFrMessages['validator.langValidation.missingEnglishMore'] = undefined;
      mutableFrMessages['validator.langValidation.root'] = undefined;

      try {
        expect(
          getLangValidationErrorMessage(
            [{ path: '', code: 'missing_en', message: 'x' }],
            5,
            'fr-FR',
          ),
        ).toBe(originalMessages.missingEnglish?.replace('{fields}', originalMessages.root ?? ''));
      } finally {
        mutableFrMessages['validator.langValidation.missingEnglish'] =
          originalMessages.missingEnglish;
        mutableFrMessages['validator.langValidation.missingEnglishMore'] =
          originalMessages.missingEnglishMore;
        mutableFrMessages['validator.langValidation.root'] = originalMessages.root;
      }
    });

    it('should fall back to the root label when the last path segment becomes empty', () => {
      const message = getLangValidationErrorMessage([
        { path: 'items.[0]', code: 'missing_en', message: 'x' },
      ]);

      expect(message).toBe('Save failed, the following fields are missing English: (root).');
    });

    it('should reuse the normalized path when split().pop() returns undefined', () => {
      const normalizedPath = new String('syntheticField') as any;
      normalizedPath.split = jest.fn(() => ({ pop: () => undefined }));
      const path = { trim: () => normalizedPath } as any;

      const message = getLangValidationErrorMessage([{ path, code: 'missing_en', message: 'x' }]);

      expect(message).toBe(
        'Save failed, the following fields are missing English: syntheticField.',
      );
    });
  });

  describe('classificationToString', () => {
    it('should convert classification array to string', () => {
      const classifications = [
        { '@level': '0', '#text': 'Level 0' },
        { '@level': '1', '#text': 'Level 1' },
        { '@level': '2', '#text': 'Level 2' },
      ];
      const result = classificationToString(classifications);
      expect(result).toBe('Level 0 > Level 1 > Level 2');
    });

    it('should return "-" for empty array', () => {
      const result = classificationToString([]);
      expect(result).toBe('-');
    });

    it('should handle single level classification', () => {
      const classifications = [{ '@level': '0', '#text': 'Level 0' }];
      const result = classificationToString(classifications);
      expect(result).toBe('Level 0');
    });

    it('should return an empty string when classification parsing throws', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const badClassifications = new Proxy(
        {},
        {
          get() {
            throw new Error('boom');
          },
        },
      );

      expect(classificationToString(badClassifications as any)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('classificationToStringList', () => {
    it('should extract id and value lists for regular classification', () => {
      const classifications = [
        { '@level': '0', '@classId': 'id1', '#text': 'Class 1' },
        { '@level': '1', '@classId': 'id2', '#text': 'Class 2' },
      ];
      const result = classificationToStringList(classifications, false);
      expect(result).toEqual({
        id: ['id1', 'id2'],
        value: ['Class 1', 'Class 2'],
      });
    });

    it('should extract id and value lists for elementary flow', () => {
      const classifications = [
        { '@level': '0', '@catId': 'cat1', '#text': 'Category 1' },
        { '@level': '1', '@catId': 'cat2', '#text': 'Category 2' },
      ];
      const result = classificationToStringList(classifications, true);
      expect(result).toEqual({
        id: ['cat1', 'cat2'],
        value: ['Category 1', 'Category 2'],
      });
    });

    it('should handle single classification object', () => {
      const classification = { '@level': '0', '@classId': 'id1', '#text': 'Class 1' };
      const result = classificationToStringList(classification, false);
      expect(result).toEqual({
        id: ['id1'],
        value: ['Class 1'],
      });
    });

    it('should handle a single elementary-flow classification object', () => {
      const classification = { '@level': '0', '@catId': 'cat1', '#text': 'Category 1' };
      const result = classificationToStringList(classification, true);

      expect(result).toEqual({
        id: ['cat1'],
        value: ['Category 1'],
      });
    });

    it('should swallow parsing errors and return empty lists', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const badClassifications = new Proxy(
        {},
        {
          get() {
            throw new Error('boom');
          },
        },
      );

      expect(classificationToStringList(badClassifications as any, false)).toEqual({
        id: [],
        value: [],
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should use the default elementaryFlow flag when omitted', () => {
      const classification = { '@level': '0', '@classId': 'id1', '#text': 'Class 1' };

      expect(classificationToStringList(classification)).toEqual({
        id: ['id1'],
        value: ['Class 1'],
      });
    });
  });

  describe('classificationToJsonList', () => {
    it('should convert value/id pair to JSON for single item', () => {
      const input = {
        id: ['id1'],
        value: ['Class 1'],
      };
      const result = classificationToJsonList(input, false);
      expect(result).toEqual({
        '@level': '0',
        '@classId': 'id1',
        '#text': 'Class 1',
      });
    });

    it('should convert value/id pair to JSON array for multiple items', () => {
      const input = {
        id: ['id1', 'id2'],
        value: ['Class 1', 'Class 2'],
      };
      const result = classificationToJsonList(input, false);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        '@level': '0',
        '@classId': 'id1',
        '#text': 'Class 1',
      });
    });

    it('should handle elementary flow with catId', () => {
      const input = {
        id: ['cat1'],
        value: ['Category 1'],
      };
      const result = classificationToJsonList(input, true);
      expect(result).toEqual({
        '@level': '0',
        '@catId': 'cat1',
        '#text': 'Category 1',
      });
    });

    it('should return existing array structure as is', () => {
      const input = [{ '@level': '0', '@classId': 'id1', '#text': 'Class 1' }];
      const result = classificationToJsonList(input, false);
      expect(result).toEqual(input);
    });

    it('should convert multiple elementary-flow values to a JSON array', () => {
      const input = {
        id: ['cat1', 'cat2'],
        value: ['Category 1', 'Category 2'],
      };

      expect(classificationToJsonList(input, true)).toEqual([
        { '@level': '0', '@catId': 'cat1', '#text': 'Category 1' },
        { '@level': '1', '@catId': 'cat2', '#text': 'Category 2' },
      ]);
    });

    it('should use empty fallback IDs when classification IDs are missing', () => {
      expect(classificationToJsonList({ value: ['Class 1'] }, false)).toEqual({
        '@level': '0',
        '#text': 'Class 1',
      });
      expect(classificationToJsonList({ value: ['Category 1'] }, true)).toEqual({
        '@level': '0',
        '#text': 'Category 1',
      });
      expect(classificationToJsonList({ value: ['Class 1', 'Class 2'] }, false)).toEqual([
        { '@level': '0', '#text': 'Class 1' },
        { '@level': '1', '#text': 'Class 2' },
      ]);
      expect(classificationToJsonList({ value: ['Category 1', 'Category 2'] }, true)).toEqual([
        { '@level': '0', '#text': 'Category 1' },
        { '@level': '1', '#text': 'Category 2' },
      ]);
    });

    it('should use the default elementaryFlow flag when omitted', () => {
      expect(classificationToJsonList({ id: ['id1'], value: ['Class 1'] })).toEqual({
        '@level': '0',
        '@classId': 'id1',
        '#text': 'Class 1',
      });
    });
  });

  describe('isValidURL', () => {
    it('should validate correct URLs', () => {
      expect(isValidURL('https://example.com')).toBe(true);
      expect(isValidURL('http://example.com')).toBe(true);
      expect(isValidURL('https://example.com/path')).toBe(true);
      expect(isValidURL('https://example.com:8080')).toBe(true);
      expect(isValidURL('https://example.com?query=test')).toBe(true);
      expect(isValidURL('https://sub.example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidURL('')).toBe(false);
      expect(isValidURL('not a url')).toBe(false);
      expect(isValidURL('example')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidURL('ftp://example.com')).toBe(false); // Only http/https
    });
  });

  describe('formatDateTime', () => {
    it('should format date with correct pattern', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const result = formatDateTime(date);
      // ISO 8601 format with milliseconds and Z suffix
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include ISO format with Z suffix', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const result = formatDateTime(date);
      expect(result).toContain('Z');
      expect(result).toBe('2024-01-15T10:30:45.000Z');
    });

    it('should pad single digits with zero', () => {
      const date = new Date('2024-01-05T09:08:07Z');
      const result = formatDateTime(date);
      // toISOString() always pads with zeros
      expect(result).toBe('2024-01-05T09:08:07.000Z');
      expect(result).toContain('2024-01-05');
      expect(result).toContain('T09:08:07');
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept strong passwords', async () => {
      await expect(validatePasswordStrength(null, 'Test123!@#')).resolves.toBeUndefined();
      await expect(validatePasswordStrength(null, 'MyP@ssw0rd')).resolves.toBeUndefined();
    });

    it('should reject empty passwords', async () => {
      await expect(validatePasswordStrength(null, '')).rejects.toThrow();
    });

    it('should reject short passwords', async () => {
      await expect(validatePasswordStrength(null, 'Test1!')).rejects.toThrow(
        'Password must be at least 8 characters long!',
      );
    });

    it('should reject passwords without uppercase', async () => {
      await expect(validatePasswordStrength(null, 'test123!@#')).rejects.toThrow(
        'Password must contain at least one uppercase letter!',
      );
    });

    it('should reject passwords without lowercase', async () => {
      await expect(validatePasswordStrength(null, 'TEST123!@#')).rejects.toThrow(
        'Password must contain at least one lowercase letter!',
      );
    });

    it('should reject passwords without numbers', async () => {
      await expect(validatePasswordStrength(null, 'TestTest!@#')).rejects.toThrow(
        'Password must contain at least one number!',
      );
    });

    it('should reject passwords without special characters', async () => {
      await expect(validatePasswordStrength(null, 'TestTest123')).rejects.toThrow(
        'Password must contain at least one special character!',
      );
    });
  });

  describe('jsonToList', () => {
    it('should return array as is', () => {
      const input = [1, 2, 3];
      expect(jsonToList(input)).toEqual([1, 2, 3]);
    });

    it('should convert single object to array', () => {
      const input = { id: 1 };
      expect(jsonToList(input)).toEqual([{ id: 1 }]);
    });

    it('should return empty array for null/undefined', () => {
      expect(jsonToList(null)).toEqual([]);
      expect(jsonToList(undefined)).toEqual([]);
    });

    it('should handle primitive values', () => {
      expect(jsonToList('string')).toEqual(['string']);
      expect(jsonToList(123)).toEqual([123]);
    });
  });

  describe('getImportedId', () => {
    const importedUuid = '123e4567-e89b-42d3-a456-426614174000';

    it('should prioritize top-level id when it is a valid UUID', () => {
      const result = getImportedId({
        id: importedUuid,
        flowDataSet: {
          flowInformation: {
            dataSetInformation: {
              'common:UUID': '123e4567-e89b-42d3-a456-426614174001',
            },
          },
        },
      });

      expect(result).toBe(importedUuid);
    });

    it.each([
      [
        'contact dataset UUID',
        {
          contactDataSet: {
            contactInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
      [
        'flow dataset UUID',
        {
          flowDataSet: { flowInformation: { dataSetInformation: { 'common:UUID': importedUuid } } },
        },
      ],
      [
        'process dataset UUID',
        {
          processDataSet: {
            processInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
      [
        'source dataset UUID',
        {
          sourceDataSet: {
            sourceInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
      [
        'flow property dataset UUID',
        {
          flowPropertyDataSet: {
            flowPropertiesInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
      [
        'unit group dataset UUID',
        {
          unitGroupDataSet: {
            unitGroupInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
      [
        'life cycle model dataset UUID',
        {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { 'common:UUID': importedUuid } },
          },
        },
      ],
    ])('should extract %s', (_label, importItem) => {
      expect(getImportedId(importItem)).toBe(importedUuid);
    });

    it('should ignore invalid top-level id and fallback to dataset UUID', () => {
      const result = getImportedId({
        id: 'not-a-uuid',
        processDataSet: {
          processInformation: {
            dataSetInformation: {
              'common:UUID': importedUuid,
            },
          },
        },
      });

      expect(result).toBe(importedUuid);
    });

    it('should return undefined when no valid UUID exists', () => {
      expect(getImportedId({ id: 'invalid-id' })).toBeUndefined();
      expect(getImportedId(null)).toBeUndefined();
    });
  });

  describe('listToJson', () => {
    it('should convert single item array to object', () => {
      const input = [{ id: 1 }];
      expect(listToJson(input)).toEqual({ id: 1 });
    });

    it('should return array for multiple items', () => {
      const input = [{ id: 1 }, { id: 2 }];
      expect(listToJson(input)).toEqual(input);
    });

    it('should return object for non-array input', () => {
      const input = { id: 1 };
      expect(listToJson(input)).toEqual({ id: 1 });
    });

    it('should return empty object for null/undefined/empty array', () => {
      expect(listToJson(null)).toEqual({});
      expect(listToJson(undefined)).toEqual({});
      expect(listToJson([])).toEqual({});
    });
  });

  describe('toAmountNumber', () => {
    it('should convert valid number strings', () => {
      expect(toAmountNumber('123')).toBe(123);
      expect(toAmountNumber('123.45')).toBe(123.45);
      expect(toAmountNumber('-50')).toBe(-50);
    });

    it('should return 0 for invalid inputs', () => {
      expect(toAmountNumber('abc')).toBe(0);
      expect(toAmountNumber('12abc')).toBe(0);
      expect(toAmountNumber('')).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(toAmountNumber('0')).toBe(0);
      expect(toAmountNumber('0.0')).toBe(0);
    });
  });

  describe('getDataSource', () => {
    it('should identify data source from pathname', () => {
      expect(getDataSource('/mydata/flows')).toBe('my');
      expect(getDataSource('/tgdata/processes')).toBe('tg');
      expect(getDataSource('/exampledata/processes')).toBe('ex');
      expect(getDataSource('/codata/sources')).toBe('co');
      expect(getDataSource('/tedata/units')).toBe('te');
    });

    it('should return empty string for unknown paths', () => {
      expect(getDataSource('/unknown/path')).toBe('');
      expect(getDataSource('/home')).toBe('');
    });

    it('should match partial paths', () => {
      expect(getDataSource('/prefix/mydata/suffix')).toBe('my');
    });
  });

  describe('genClassJsonZH', () => {
    it('should generate Chinese classification from English', () => {
      const classifications = [
        { '@level': '0', '#text': 'Category A' },
        { '@level': '1', '#text': 'Subcategory B' },
      ];
      const categoryData = [
        {
          value: 'Category A',
          label: '分类 A',
          children: [
            {
              value: 'Subcategory B',
              label: '子分类 B',
              children: [],
            },
          ],
        },
      ];

      const result = genClassJsonZH(classifications, 0, categoryData);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ '@level': '0', '#text': '分类 A' });
      expect(result[1]).toEqual({ '@level': '1', '#text': '子分类 B' });
    });

    it('should preserve original text when no translation found', () => {
      const classifications = [{ '@level': '0', '#text': 'Unknown Category' }];
      const categoryData: any[] = [];

      const result = genClassJsonZH(classifications, 0, categoryData);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ '@level': '0', '#text': 'Unknown Category' });
    });

    it('should fallback to source translation text when label is missing', () => {
      const classifications = [{ '@level': '0', '#text': 'Category A' }];
      const categoryData = [
        {
          value: 'Category A',
          '#text': '分类 A',
          children: [],
        },
      ];

      expect(genClassJsonZH(classifications, 0, categoryData as any)).toEqual([
        { '@level': '0', '#text': '分类 A' },
      ]);
    });

    it('should use stable class and category IDs before duplicate source text', () => {
      const classifications = [
        { '@level': '0', '@classId': 'root-b', '#text': 'Duplicate' },
        { '@level': '1', '@catId': 'child-b', '#text': 'Duplicate child' },
      ];
      const categoryData = [
        {
          id: 'root-a',
          value: 'Duplicate',
          label: '错误根分类',
          children: [],
        },
        {
          id: 'root-b',
          value: 'Duplicate',
          label: '正确根分类',
          children: [
            {
              id: 'child-a',
              value: 'Duplicate child',
              label: '错误子分类',
              children: [],
            },
            {
              id: 'child-b',
              value: 'Duplicate child',
              label: '正确子分类',
              children: [],
            },
          ],
        },
      ];

      expect(genClassJsonZH(classifications, 0, categoryData)).toEqual([
        { '@level': '0', '@classId': 'root-b', '#text': '正确根分类' },
        { '@level': '1', '@catId': 'child-b', '#text': '正确子分类' },
      ]);
    });

    it('should return empty array for empty classifications', () => {
      const classifications: any[] = [];
      const categoryData: any[] = [];

      const result = genClassJsonZH(classifications, 0, categoryData);

      expect(result).toEqual([]);
    });
  });

  describe('genLocalizedClassification', () => {
    it('should localize classifications when entries exist', () => {
      const classifications = [
        { '@level': '0', '#text': 'Category A' },
        { '@level': '1', '#text': 'Subcategory B' },
      ];
      const categoryData = [
        {
          value: 'Category A',
          label: '分类 A',
          children: [
            {
              value: 'Subcategory B',
              label: '子分类 B',
              children: [],
            },
          ],
        },
      ];

      const result = genLocalizedClassification(classifications, categoryData);

      expect(result).toEqual([
        { '@level': '0', '#text': '分类 A' },
        { '@level': '1', '#text': '子分类 B' },
      ]);
    });

    it('should return empty array when classifications array is empty', () => {
      const categoryData = [{ value: 'Category A', label: '分类 A', children: [] }];
      expect(genLocalizedClassification([], categoryData as any)).toEqual([]);
    });

    it('keeps the deprecated Chinese wrapper behavior aligned with the localized helper', () => {
      const classifications = [{ '@level': '0', '#text': 'Category A' }];
      const categoryData = [{ value: 'Category A', label: '分类 A', children: [] }];
      const legacyGenClassification = (
        jest.requireActual('@/services/general/util') as Record<string, (...args: any[]) => unknown>
      )['genClassificationZH'];

      expect(legacyGenClassification(classifications, categoryData)).toEqual([
        { '@level': '0', '#text': '分类 A' },
      ]);
    });
  });

  describe('convertToUTCISOString', () => {
    it('should convert valid date string to ISO format', () => {
      const result = convertToUTCISOString('2024-01-15T10:30:45');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should convert date string with timezone to ISO format', () => {
      const result = convertToUTCISOString('2024-01-15T10:30:45+08:00');
      expect(result).toContain('Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle ISO date string', () => {
      const result = convertToUTCISOString('2024-01-15T10:30:45.123Z');
      expect(result).toBe('2024-01-15T10:30:45.123Z');
    });

    it('should return empty string for empty input', () => {
      expect(convertToUTCISOString('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(convertToUTCISOString(null as any)).toBe('');
      expect(convertToUTCISOString(undefined as any)).toBe('');
    });

    it('should throw error for invalid date string', () => {
      expect(() => convertToUTCISOString('invalid-date')).toThrow(RangeError);
    });
  });

  describe('convertCopyrightToBoolean', () => {
    it('should convert "Yes" to "true"', () => {
      expect(convertCopyrightToBoolean('Yes')).toBe('true');
    });

    it('should convert "No" to "false"', () => {
      expect(convertCopyrightToBoolean('No')).toBe('false');
    });

    it('should return original value for other values', () => {
      expect(convertCopyrightToBoolean('Maybe' as any)).toBe('Maybe');
      expect(convertCopyrightToBoolean('' as any)).toBe('');
    });

    it('should handle case-sensitive matching', () => {
      expect(convertCopyrightToBoolean('yes' as any)).toBe('yes');
      expect(convertCopyrightToBoolean('YES' as any)).toBe('YES');
      expect(convertCopyrightToBoolean('no' as any)).toBe('no');
      expect(convertCopyrightToBoolean('NO' as any)).toBe('NO');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter of lowercase string', () => {
      expect(capitalize('input')).toBe('Input');
    });

    it('should keep first letter capital if already capitalized', () => {
      expect(capitalize('Input')).toBe('Input');
    });

    it('should handle all uppercase string', () => {
      expect(capitalize('INPUT')).toBe('INPUT');
    });

    it('should return undefined for empty string', () => {
      expect(capitalize('')).toBeUndefined();
    });

    it('should return undefined for null/undefined input', () => {
      expect(capitalize(null as any)).toBeUndefined();
      expect(capitalize(undefined as any)).toBeUndefined();
    });

    it('should capitalize single character', () => {
      expect(capitalize('output')).toBe('Output');
    });

    it('should handle string with special characters', () => {
      expect(capitalize('1output')).toBe('1output');
    });
  });
});
