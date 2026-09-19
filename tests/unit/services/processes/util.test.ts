/**
 * Tests for process utility functions
 * Path: src/services/processes/util.ts
 */

import {
  genProcessExchangeTableData,
  genProcessFromData,
  genProcessJsonOrdered,
  genProcessName,
  genProcessNameJson,
} from '@/services/processes/util';

// Mock dependencies
jest.mock('@/services/general/util', () => ({
  capitalize: jest.fn((str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }),
  classificationToJsonList: jest.fn((data) => data),
  classificationToStringList: jest.fn((data) => data),
  convertCopyrightToBoolean: jest.fn((value: 'Yes' | 'No') => {
    if (value === 'Yes') return 'true';
    if (value === 'No') return 'false';
    return value;
  }),
  convertToUTCISOString: jest.fn((dateStr) => dateStr || ''),
  formatDateTime: jest.fn((date) => date.toISOString()),
  getExactLangText: jest.fn((data, lang) => {
    if (!data) return '-';
    if (Array.isArray(data)) {
      const item = data.find(
        (candidate) =>
          candidate?.['@xml:lang'] === lang &&
          typeof candidate?.['#text'] === 'string' &&
          candidate['#text'].trim() &&
          candidate['#text'].trim() !== '-',
      );
      return item?.['#text'] || '-';
    }
    if (data?.['@xml:lang'] && data['@xml:lang'] !== lang) return '-';
    return data?.['#text'] || data || '-';
  }),
  getLangJson: jest.fn((data) => data),
  getLangList: jest.fn((data) => (Array.isArray(data) ? data : data ? [data] : [])),
  getLangText: jest.fn((data, lang) => {
    if (!data) return '-';
    if (Array.isArray(data)) {
      const item = data.find((d) => d?.['@xml:lang'] === lang);
      return item?.['#text'] || data[0]?.['#text'] || '-';
    }
    return data?.['#text'] || data || '-';
  }),
  jsonToList: jest.fn((data) => (Array.isArray(data) ? data : data ? [data] : [])),
  listToJson: jest.fn((data) => {
    if (!data || data.length === 0) return {};
    if (data.length === 1) return data[0];
    return data;
  }),
  removeEmptyObjects: jest.fn((obj) => obj),
  toAmountNumber: jest.fn((val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }),
}));

// Mock tidas-sdk module
jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  createProcess: jest.fn((data) => data),
}));

describe('Process Utility Functions', () => {
  describe('genProcessName', () => {
    it('should generate process name from all name components', () => {
      const name = {
        baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
        treatmentStandardsRoutes: [{ '@xml:lang': 'en', '#text': 'hot rolling' }],
        mixAndLocationTypes: [{ '@xml:lang': 'en', '#text': 'production mix' }],
        functionalUnitFlowProperties: [{ '@xml:lang': 'en', '#text': '1 kg' }],
      };

      const result = genProcessName(name, 'en');
      expect(result).toBe('Steel production; hot rolling; production mix; 1 kg');
    });

    it('should handle missing name components', () => {
      const name = {
        baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
        treatmentStandardsRoutes: null,
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessName(name, 'en');
      expect(result).toBe('Steel production');
    });

    it('should remove trailing semicolons', () => {
      const name = {
        baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
        treatmentStandardsRoutes: [{ '@xml:lang': 'en', '#text': 'hot rolling' }],
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessName(name, 'en');
      expect(result).toBe('Steel production; hot rolling');
    });

    it('should return "-" for empty name', () => {
      const name = {
        baseName: null,
        treatmentStandardsRoutes: null,
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessName(name, 'en');
      expect(result).toBe('-');
    });

    it('should handle multiple language versions', () => {
      const name = {
        baseName: [
          { '@xml:lang': 'en', '#text': 'Steel production' },
          { '@xml:lang': 'zh', '#text': '钢铁生产' },
        ],
        treatmentStandardsRoutes: null,
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const resultEn = genProcessName(name, 'en');
      const resultZh = genProcessName(name, 'zh');

      expect(resultEn).toBe('Steel production');
      expect(resultZh).toBe('钢铁生产');
    });

    it('should skip dashes in name components', () => {
      const name = {
        baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
        treatmentStandardsRoutes: [{ '@xml:lang': 'en', '#text': '-' }],
        mixAndLocationTypes: [{ '@xml:lang': 'en', '#text': 'production mix' }],
        functionalUnitFlowProperties: null,
      };

      const result = genProcessName(name, 'en');
      expect(result).toBe('Steel production; production mix');
    });
  });

  describe('genProcessNameJson', () => {
    it('should generate name JSON for all languages', () => {
      const name = {
        baseName: [
          { '@xml:lang': 'en', '#text': 'Steel production' },
          { '@xml:lang': 'zh', '#text': '钢铁生产' },
        ],
        treatmentStandardsRoutes: [
          { '@xml:lang': 'en', '#text': 'hot rolling' },
          { '@xml:lang': 'zh', '#text': '热轧' },
        ],
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessNameJson(name);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]['@xml:lang']).toBe('en');
      expect(result[0]['#text']).toBe('Steel production; hot rolling');
      expect(result[1]['@xml:lang']).toBe('zh');
      expect(result[1]['#text']).toBe('钢铁生产; 热轧');
    });

    it('should handle single language', () => {
      const name = {
        baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
        treatmentStandardsRoutes: null,
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessNameJson(name);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]['@xml:lang']).toBe('en');
    });

    it('should handle null baseName', () => {
      const name = {
        baseName: null,
        treatmentStandardsRoutes: null,
        mixAndLocationTypes: null,
        functionalUnitFlowProperties: null,
      };

      const result = genProcessNameJson(name);
      expect(result).toEqual([]);
    });
  });

  describe('genProcessExchangeTableData', () => {
    it('should convert exchange array to table data', () => {
      const data = [
        {
          '@dataSetInternalID': '1',
          exchangeDirection: 'input',
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-id-1',
            '@version': '01.00.000',
            'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Iron ore' }],
          },
          meanAmount: '10',
          resultingAmount: '10',
          quantitativeReference: false,
        },
        {
          '@dataSetInternalID': '2',
          exchangeDirection: 'output',
          referenceToFlowDataSet: {
            '@refObjectId': 'flow-id-2',
            '@version': '01.00.000',
            'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
          },
          meanAmount: '1',
          resultingAmount: '1',
          quantitativeReference: true,
          functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': '1 kg steel' }],
        },
      ];

      const result = genProcessExchangeTableData(data, 'en');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('INPUT:flow-id-1');
      expect(result[0].dataSetInternalID).toBe('1');
      expect(result[0].exchangeDirection).toBe('input');
      expect(result[0].quantitativeReference).toBe(false);
      expect(result[1].key).toBe('OUTPUT:flow-id-2');
      expect(result[1].quantitativeReference).toBe(true);
    });

    it('should handle single exchange object', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'input',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
          '@version': '01.00.000',
          'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Iron ore' }],
        },
        meanAmount: '10',
        resultingAmount: '10',
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].dataSetInternalID).toBe('1');
    });

    it('should return empty array for null data', () => {
      const result = genProcessExchangeTableData(null, 'en');
      expect(result).toEqual([]);
    });

    it('should handle missing optional fields', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'input',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].dataSetInternalID).toBe('1');
      expect(result[0].referenceToFlowDataSetVersion).toBe('-');
      expect(result[0].meanAmount).toBe('-');
      expect(result[0].resultingAmount).toBe('-');
      expect(result[0].quantitativeReference).toBe(false);
    });

    it('should handle undefined dataSetInternalID', () => {
      const data = {
        exchangeDirection: 'input',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].dataSetInternalID).toBe('-');
      expect(result[0].key).toBe('INPUT:flow-id-1');
      expect(result[0].referenceToFlowDataSetId).toBe('flow-id-1');
    });

    it('should handle missing exchangeDirection', () => {
      const data = {
        '@dataSetInternalID': '1',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].exchangeDirection).toBe('-');
      expect(result[0].key).toBe('-:flow-id-1');
    });

    it('should handle missing referenceToFlowDataSet', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'input',
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].referenceToFlowDataSetId).toBe('-');
      expect(result[0].key).toBe('INPUT:-');
    });

    it('should convert exchangeDirection to uppercase in key', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'input',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
      };

      const result = genProcessExchangeTableData(data, 'en');
      expect(result[0].key).toBe('INPUT:flow-id-1');
    });

    it('should include referencesToDataSource', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'input',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
        referencesToDataSource: {
          referenceToDataSource: {
            '@type': 'source data set',
            '@refObjectId': 'source-id-1',
            '@uri': 'http://example.com',
            '@version': '01.00.000',
            'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Data source' }],
          },
        },
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].referencesToDataSource).toBeDefined();
      expect(result[0].referencesToDataSource.referenceToDataSource['@refObjectId']).toBe(
        'source-id-1',
      );
    });

    it('should handle allocations', () => {
      const data = {
        '@dataSetInternalID': '1',
        exchangeDirection: 'output',
        referenceToFlowDataSet: {
          '@refObjectId': 'flow-id-1',
        },
        allocations: {
          allocation: {
            '@internalReferenceToCoProduct': 'co-product-1',
            '@allocatedFraction': '0.5',
          },
        },
      };

      const result = genProcessExchangeTableData(data, 'en');

      expect(result[0].allocations).toBeDefined();
      expect(result[0].allocations.allocation?.['@allocatedFraction']).toBe('0.5');
    });
  });

  describe('genProcessJsonOrdered', () => {
    const mockProcessData = {
      processInformation: {
        dataSetInformation: {
          name: {
            baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
            treatmentStandardsRoutes: [{ '@xml:lang': 'en', '#text': 'hot rolling' }],
            mixAndLocationTypes: null,
            functionalUnitFlowProperties: null,
          },
          identifierOfSubDataSet: 'sub-1',
          'common:synonyms': [{ '@xml:lang': 'en', '#text': 'Steel manufacturing' }],
          classificationInformation: {
            'common:classification': {
              'common:class': [{ '@level': '0', '@classId': 'class-1', '#text': 'Materials' }],
            },
          },
          'common:generalComment': [{ '@xml:lang': 'en', '#text': 'General comment' }],
        },
        time: {
          'common:referenceYear': '2024',
          'common:timeRepresentativenessDescription': [
            { '@xml:lang': 'en', '#text': 'Time description' },
          ],
        },
        geography: {
          locationOfOperationSupplyOrProduction: {
            '@location': 'CN',
            descriptionOfRestrictions: [{ '@xml:lang': 'en', '#text': 'Location description' }],
          },
        },
        technology: {
          technologyDescriptionAndIncludedProcesses: [
            { '@xml:lang': 'en', '#text': 'Technology description' },
          ],
        },
      },
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': '1',
            referenceToFlowDataSet: {
              '@type': 'flow data set',
              '@refObjectId': 'flow-id-1',
              '@uri': 'http://example.com/flow',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Iron ore' }],
            },
            exchangeDirection: 'Input',
            meanAmount: '10',
            resultingAmount: '10',
            quantitativeReference: false,
          },
          {
            '@dataSetInternalID': '2',
            referenceToFlowDataSet: {
              '@type': 'flow data set',
              '@refObjectId': 'flow-id-2',
              '@uri': 'http://example.com/flow2',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
            },
            exchangeDirection: 'Output',
            meanAmount: '1',
            resultingAmount: '1',
            quantitativeReference: true,
            functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': '1 kg steel' }],
          },
        ],
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: 'Unit process, single operation',
          LCIMethodPrinciple: 'Attributional',
        },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': '2024-01-01T00:00:00+00:00',
        },
        publicationAndOwnership: {
          'common:dateOfLastRevision': '2024-01-01T00:00:00+00:00',
          'common:copyright': true,
        },
      },
    };

    it('should generate ordered process JSON with all sections', () => {
      const id = 'test-process-id';
      const result = genProcessJsonOrdered(id, mockProcessData);

      expect(result.processDataSet).toBeDefined();
      expect(result.processDataSet.processInformation).toBeDefined();
      expect(result.processDataSet.processInformation.dataSetInformation['common:UUID']).toBe(id);
    });

    it('omits an unselected review report but preserves a supplied reference', () => {
      const review = { '@type': 'Independent external review' };
      const withReview = {
        ...mockProcessData,
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          validation: { review: [review] },
        },
      };
      const omitted = genProcessJsonOrdered('test-id', withReview);
      expect(omitted.processDataSet.modellingAndValidation.validation.review).not.toHaveProperty(
        'common:referenceToCompleteReviewReport',
      );

      const report = {
        '@type': 'source data set',
        '@refObjectId': 'a97a0155-0234-4b87-b4ce-a45da52f2a40',
        '@uri': '../sources/a97a0155-0234-4b87-b4ce-a45da52f2a40.xml',
        '@version': '01.00.000',
        'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Review report' }],
      };
      const supplied = genProcessJsonOrdered('test-id', {
        ...withReview,
        modellingAndValidation: {
          ...withReview.modellingAndValidation,
          validation: { review: [{ ...review, 'common:referenceToCompleteReviewReport': report }] },
        },
      });
      expect(
        supplied.processDataSet.modellingAndValidation.validation.review[
          'common:referenceToCompleteReviewReport'
        ]['@refObjectId'],
      ).toBe(report['@refObjectId']);

      for (const incomplete of [{ '@uri': {} }, { '@refObjectId': null }, null, [], 'invalid']) {
        const result = genProcessJsonOrdered('test-id', {
          ...withReview,
          modellingAndValidation: {
            ...withReview.modellingAndValidation,
            validation: {
              review: [{ ...review, 'common:referenceToCompleteReviewReport': incomplete }],
            },
          },
        });
        expect(result.processDataSet.modellingAndValidation.validation.review).toHaveProperty(
          'common:referenceToCompleteReviewReport',
        );
      }
    });

    it('should extract quantitative reference from exchanges', () => {
      const id = 'test-process-id';
      const result = genProcessJsonOrdered(id, mockProcessData);

      expect(result.processDataSet.processInformation.quantitativeReference).toBeDefined();
      expect(result.processDataSet.processInformation.quantitativeReference['@type']).toBe(
        'Reference flow(s)',
      );
      expect(
        result.processDataSet.processInformation.quantitativeReference.referenceToReferenceFlow,
      ).toBe('2');
    });

    it('should normalize annual supply volume numeric text with the quantitative reference suffix', () => {
      const dataWithAnnualSupplyVolume = {
        ...mockProcessData,
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            annualSupplyOrProductionVolume: [
              { '@xml:lang': 'en', '#text': '100 old suffix' },
              { '#text': '200 stale fallback suffix' },
            ],
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithAnnualSupplyVolume);

      expect(
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .annualSupplyOrProductionVolume,
      ).toEqual([{ '@xml:lang': 'en', '#text': '100 1 kg steel' }, { '#text': '200 1 kg steel' }]);
    });

    it('should cap every localized annual supply volume value while saving', () => {
      const dataWithLongAnnualSupplyContexts = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
                '@version': '01.00.000',
                'common:shortDescription': [
                  { '@xml:lang': 'en', '#text': 'e'.repeat(600) },
                  { '@xml:lang': 'zh', '#text': '中'.repeat(600) },
                ],
              },
              refUnitRes: {
                refUnitName: 'kg',
              },
              exchangeDirection: 'Output',
              meanAmount: '1',
              quantitativeReference: true,
            },
          ],
        },
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            annualSupplyOrProductionVolume: [
              { '@xml:lang': 'en', '#text': '100 old suffix' },
              { '@xml:lang': 'zh', '#text': '100 旧后缀' },
            ],
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithLongAnnualSupplyContexts);
      const annualSupplyValues =
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .annualSupplyOrProductionVolume;

      expect(annualSupplyValues).toHaveLength(2);
      expect(annualSupplyValues.map((item: { '#text': string }) => item['#text'].length)).toEqual([
        500, 500,
      ]);
      expect(
        annualSupplyValues.every((item: { '#text': string }) => item['#text'].endsWith('...')),
      ).toBe(true);
    });

    it('should preserve a previously resolved annual supply volume unit suffix while saving', () => {
      const dataWithAnnualSupplyVolume = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
                '@version': '01.00.000',
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
              },
              exchangeDirection: 'Output',
              meanAmount: '1',
              quantitativeReference: true,
            },
          ],
        },
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            annualSupplyOrProductionVolume: [{ '@xml:lang': 'en', '#text': '100 kg Steel' }],
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithAnnualSupplyVolume);

      expect(
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .annualSupplyOrProductionVolume,
      ).toEqual([{ '@xml:lang': 'en', '#text': '100 kg Steel' }]);
    });

    it.each(['de', 'fr'])(
      'should not persist English fallback context as %s annual supply content',
      (targetLanguage) => {
        const dataWithMissingTargetContext = {
          ...mockProcessData,
          exchanges: {
            exchange: [
              {
                '@dataSetInternalID': '1',
                referenceToFlowDataSet: {
                  '@refObjectId': 'flow-id-1',
                  '@version': '01.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
                },
                refUnitRes: {
                  name: [{ '@xml:lang': 'en', '#text': 'kilogram' }],
                },
                exchangeDirection: 'Output',
                meanAmount: '1',
                quantitativeReference: true,
              },
            ],
          },
          modellingAndValidation: {
            ...mockProcessData.modellingAndValidation,
            dataSourcesTreatmentAndRepresentativeness: {
              annualSupplyOrProductionVolume: [
                { '@xml:lang': 'en', '#text': '100 old suffix' },
                { '@xml:lang': targetLanguage, '#text': '100 stale fallback suffix' },
              ],
            },
          },
        };

        const result = genProcessJsonOrdered('test-id', dataWithMissingTargetContext);

        expect(
          result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
            .annualSupplyOrProductionVolume,
        ).toEqual([
          { '@xml:lang': 'en', '#text': '100 kilogram Steel' },
          { '@xml:lang': targetLanguage, '#text': '100' },
        ]);
      },
    );

    it('should save annual supply volume with a suffix even when no quantitative reference is selected', () => {
      const dataWithoutRef = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
                '@version': '01.00.000',
                'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
              },
              refUnitRes: {
                refUnitName: 'kg',
              },
              exchangeDirection: 'Input',
              meanAmount: '10',
              quantitativeReference: false,
            },
          ],
        },
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            annualSupplyOrProductionVolume: [{ '@xml:lang': 'en', '#text': '100 old suffix' }],
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithoutRef);

      expect(result.processDataSet.processInformation.quantitativeReference).toEqual({});
      expect(
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .annualSupplyOrProductionVolume,
      ).toEqual([{ '@xml:lang': 'en', '#text': '100 reference flow' }]);
    });

    it('should use resultingAmount if not zero, otherwise use meanAmount', () => {
      const dataWithZeroResulting = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              meanAmount: '10',
              resultingAmount: '0',
              exchangeDirection: 'Input',
              referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
            },
            {
              '@dataSetInternalID': '2',
              meanAmount: '5',
              resultingAmount: '8',
              exchangeDirection: 'Input',
              referenceToFlowDataSet: { '@refObjectId': 'flow-2' },
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithZeroResulting);

      // When resultingAmount is 0, should use meanAmount
      expect(result.processDataSet.exchanges.exchange[0].resultingAmount).toBe('10');
      // When resultingAmount is non-zero, should use resultingAmount
      expect(result.processDataSet.exchanges.exchange[1].resultingAmount).toBe('8');
    });

    it('should handle NULL location', () => {
      const dataWithNullLocation = {
        ...mockProcessData,
        processInformation: {
          ...mockProcessData.processInformation,
          geography: {
            locationOfOperationSupplyOrProduction: {
              '@location': 'NULL',
            },
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithNullLocation);

      expect(
        result.processDataSet.processInformation.geography.locationOfOperationSupplyOrProduction[
          '@location'
        ],
      ).toEqual({});
    });

    it('should handle missing reference year and NULL subLocation', () => {
      const dataWithNullSubLocation = {
        ...mockProcessData,
        processInformation: {
          ...mockProcessData.processInformation,
          time: {},
          geography: {
            ...mockProcessData.processInformation.geography,
            subLocationOfOperationSupplyOrProduction: {
              '@subLocation': 'NULL',
            },
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithNullSubLocation);

      expect(result.processDataSet.processInformation.time['common:referenceYear']).toBeUndefined();
      expect(
        result.processDataSet.processInformation.geography.subLocationOfOperationSupplyOrProduction[
          '@subLocation'
        ],
      ).toEqual({});
    });

    it('should include xmlns attributes', () => {
      const result = genProcessJsonOrdered('test-id', mockProcessData);

      expect(result.processDataSet['@xmlns:common']).toBe('http://lca.jrc.it/ILCD/Common');
      expect(result.processDataSet['@xmlns']).toBe('http://lca.jrc.it/ILCD/Process');
      expect(result.processDataSet['@xmlns:xsi']).toBe('http://www.w3.org/2001/XMLSchema-instance');
      expect(result.processDataSet['@version']).toBe('1.1');
    });

    it('should handle single exchange object', () => {
      const dataWithSingleExchange = {
        ...mockProcessData,
        exchanges: {
          exchange: {
            '@dataSetInternalID': '1',
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-id-1',
            },
            exchangeDirection: 'Input',
            meanAmount: '10',
          },
        },
      };

      let result: any;

      expect(() => {
        result = genProcessJsonOrdered('test-id', dataWithSingleExchange);
      }).not.toThrow();

      expect(Array.isArray(result?.processDataSet.exchanges.exchange)).toBe(true);
    });

    it('should derive permanentDataSetURI from id and version', () => {
      const id = 'process-123';
      const dataWithVersion = {
        ...mockProcessData,
        administrativeInformation: {
          ...mockProcessData.administrativeInformation,
          publicationAndOwnership: {
            ...mockProcessData.administrativeInformation?.publicationAndOwnership,
            'common:dataSetVersion': '01.02.003',
          },
        },
      };

      const result = genProcessJsonOrdered(id, dataWithVersion);

      expect(
        result.processDataSet.administrativeInformation.publicationAndOwnership[
          'common:permanentDataSetURI'
        ],
      ).toBe(
        'https://lcdn.tiangong.earth/datasetdetail/process.xhtml?uuid=process-123&version=01.02.003',
      );
    });

    it('should handle missing exchanges', () => {
      const dataWithoutExchanges = {
        ...mockProcessData,
        exchanges: {},
      };

      const result = genProcessJsonOrdered('test-id', dataWithoutExchanges);

      expect(result.processDataSet.exchanges.exchange).toEqual([]);
    });

    it('should keep empty reference year empty instead of NaN', () => {
      const dataWithEmptyReferenceYear = {
        ...mockProcessData,
        processInformation: {
          ...mockProcessData.processInformation,
          time: {
            ...mockProcessData.processInformation.time,
            'common:referenceYear': '',
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithEmptyReferenceYear);

      expect(result.processDataSet.processInformation.time['common:referenceYear']).toBeUndefined();
    });

    it('should preserve invalid reference year strings for the save-boundary validation gate', () => {
      const dataWithInvalidReferenceYear = {
        ...mockProcessData,
        processInformation: {
          ...mockProcessData.processInformation,
          time: {
            ...mockProcessData.processInformation.time,
            'common:referenceYear': 'not-a-number',
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithInvalidReferenceYear);

      expect(result.processDataSet.processInformation.time['common:referenceYear']).toBe(
        'not-a-number',
      );
    });

    it('should normalize process year and percentage scalars to canonical TIDAS types', () => {
      const result = genProcessJsonOrdered('test-id', {
        ...mockProcessData,
        processInformation: {
          ...mockProcessData.processInformation,
          time: {
            ...mockProcessData.processInformation.time,
            'common:dataSetValidUntil': '2030',
          },
          mathematicalRelations: {
            variableParameter: { relativeStandardDeviation95In: 1.25 },
          },
        },
        exchanges: {
          exchange: [
            {
              ...mockProcessData.exchanges.exchange[0],
              relativeStandardDeviation95In: 12.5,
              allocations: { allocation: { '@allocatedFraction': 0 } },
            },
          ],
        },
      });

      const time = result.processDataSet.processInformation.time;
      const exchange = result.processDataSet.exchanges.exchange[0];
      expect(time['common:referenceYear']).toBe(2024);
      expect(time['common:dataSetValidUntil']).toBe(2030);
      expect(exchange.relativeStandardDeviation95In).toBe('12.5');
      expect(exchange.allocations.allocation['@allocatedFraction']).toBe('0');
      expect(
        result.processDataSet.processInformation.mathematicalRelations.variableParameter
          .relativeStandardDeviation95In,
      ).toBe('1.25');
    });

    it('should not stringify missing exchange amounts to undefined', () => {
      const dataWithMissingAmounts = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
              },
              exchangeDirection: 'Input',
              meanAmount: undefined,
              resultingAmount: undefined,
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithMissingAmounts);

      expect(result.processDataSet.exchanges.exchange[0].meanAmount).toBeUndefined();
      expect(result.processDataSet.exchanges.exchange[0].resultingAmount).toBeUndefined();
    });

    it('should save exchange location as a plain string code', () => {
      const dataWithLocation = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
              },
              exchangeDirection: 'Input',
              location: [{ '@xml:lang': 'en', '#text': 'CN' }],
              meanAmount: '10',
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithLocation);

      expect(result.processDataSet.exchanges.exchange[0].location).toBe('CN');
      expect(Array.isArray(result.processDataSet.exchanges.exchange[0].location)).toBe(false);
    });

    it('should omit exchange location when the form value is cleared', () => {
      const dataWithClearedLocation = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
              },
              exchangeDirection: 'Input',
              location: '',
              meanAmount: '10',
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithClearedLocation);

      expect(result.processDataSet.exchanges.exchange[0]).not.toHaveProperty('location');
    });

    it('should include allocations in exchanges', () => {
      const dataWithAllocations = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
              exchangeDirection: 'Output',
              meanAmount: '1',
              allocations: {
                allocation: {
                  '@internalReferenceToCoProduct': 'co-product-1',
                  '@allocatedFraction': '0.5',
                },
              },
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithAllocations);

      expect(result.processDataSet.exchanges.exchange[0].allocations).toBeDefined();
      expect(
        result.processDataSet.exchanges.exchange[0].allocations.allocation[
          '@internalReferenceToCoProduct'
        ],
      ).toBe('co-product-1');
    });

    it('should include exchange data source references', () => {
      const dataWithExchangeSources = {
        ...mockProcessData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
              exchangeDirection: 'Input',
              meanAmount: '1',
              referencesToDataSource: {
                referenceToDataSource: {
                  '@type': 'source data set',
                  '@refObjectId': 'source-id-1',
                  '@uri': 'http://example.com/source-1',
                  '@version': '01.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Exchange source' }],
                },
              },
            },
          ],
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithExchangeSources);

      expect(
        result.processDataSet.exchanges.exchange[0].referencesToDataSource.referenceToDataSource[0][
          '@refObjectId'
        ],
      ).toBe('source-id-1');
    });

    it('should include modelling data source references', () => {
      const dataWithModellingSources = {
        ...mockProcessData,
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          dataSourcesTreatmentAndRepresentativeness: {
            referenceToDataSource: {
              '@type': 'source data set',
              '@refObjectId': 'source-id-2',
              '@uri': 'http://example.com/source-2',
              '@version': '02.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Method source' }],
            },
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithModellingSources);

      expect(
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .referenceToDataSource['@refObjectId'],
      ).toBe('source-id-2');
    });

    it('should normalize array review, scope, data quality indicator and compliance entries', () => {
      const dataWithArrayValidation = {
        ...mockProcessData,
        modellingAndValidation: {
          ...mockProcessData.modellingAndValidation,
          validation: {
            review: [
              {
                '@type': 'internal',
                'common:scope': [
                  {
                    '@name': 'goal',
                    'common:method': {
                      '@name': 'method-a',
                    },
                  },
                ],
                'common:dataQualityIndicators': {
                  'common:dataQualityIndicator': [
                    {
                      '@name': 'representativeness',
                      '@value': 'good',
                    },
                  ],
                },
              },
            ],
          },
          complianceDeclarations: {
            compliance: [
              {
                'common:referenceToComplianceSystem': {
                  '@refObjectId': 'compliance-id-1',
                },
              },
            ],
          },
          dataSourcesTreatmentAndRepresentativeness: {
            referenceToDataSource: {
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Sparse source' }],
            },
          },
        },
      };

      const result = genProcessJsonOrdered('test-id', dataWithArrayValidation);
      const review = result.processDataSet.modellingAndValidation.validation.review;
      const compliance =
        result.processDataSet.modellingAndValidation.complianceDeclarations.compliance;
      const modellingSource =
        result.processDataSet.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness
          .referenceToDataSource;

      expect(review['common:scope']['@name']).toBe('goal');
      expect(review['common:dataQualityIndicators']['common:dataQualityIndicator']['@name']).toBe(
        'representativeness',
      );
      expect(compliance['common:referenceToComplianceSystem']['@refObjectId']).toBe(
        'compliance-id-1',
      );
      expect(modellingSource['@type']).toEqual({});
      expect(modellingSource['@refObjectId']).toEqual({});
      expect(modellingSource['@version']).toEqual({});
      expect(modellingSource['@uri']).toEqual({});
    });
  });

  describe('genProcessFromData', () => {
    const mockRawData = {
      processInformation: {
        dataSetInformation: {
          'common:UUID': 'process-uuid-123',
          name: {
            baseName: [{ '@xml:lang': 'en', '#text': 'Steel production' }],
          },
          classificationInformation: {
            'common:classification': {
              'common:class': [{ '@level': '0', '@classId': 'class-1', '#text': 'Materials' }],
            },
          },
        },
        quantitativeReference: {
          '@type': 'Reference flow(s)',
          referenceToReferenceFlow: '2',
          functionalUnitOrOther: [{ '@xml:lang': 'en', '#text': '1 kg steel' }],
        },
        time: {
          'common:referenceYear': '2024',
        },
        geography: {
          locationOfOperationSupplyOrProduction: {
            '@location': 'CN',
          },
        },
      },
      exchanges: {
        exchange: [
          {
            '@dataSetInternalID': '1',
            referenceToFlowDataSet: {
              '@type': 'flow data set',
              '@refObjectId': 'flow-id-1',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Iron ore' }],
            },
            exchangeDirection: 'Input',
            meanAmount: '10',
            resultingAmount: '10',
          },
          {
            '@dataSetInternalID': '2',
            referenceToFlowDataSet: {
              '@type': 'flow data set',
              '@refObjectId': 'flow-id-2',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Steel' }],
            },
            exchangeDirection: 'Output',
            meanAmount: '1',
            resultingAmount: '1',
          },
        ],
      },
      modellingAndValidation: {
        LCIMethodAndAllocation: {
          typeOfDataSet: 'Unit process, single operation',
        },
      },
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': '2024-01-01T00:00:00+00:00',
        },
      },
    };

    it('should convert raw process data to form structure', () => {
      const result = genProcessFromData(mockRawData);

      expect(result).toBeDefined();
      expect(result.processInformation).toBeDefined();
      expect(result.exchanges).toBeDefined();
    });

    it('keeps an absent review report absent in the editable form', () => {
      const result = genProcessFromData({
        ...mockRawData,
        modellingAndValidation: {
          ...mockRawData.modellingAndValidation,
          validation: { review: { '@type': 'Independent external review' } },
        },
      });
      const review = result.modellingAndValidation?.validation?.review;
      const firstReview = Array.isArray(review) ? review[0] : review;
      expect(firstReview).not.toHaveProperty('common:referenceToCompleteReviewReport');
    });

    it('keeps a supplied review report in the editable form', () => {
      const report = {
        '@type': 'source data set',
        '@refObjectId': 'a97a0155-0234-4b87-b4ce-a45da52f2a40',
        '@uri': '../sources/a97a0155-0234-4b87-b4ce-a45da52f2a40.xml',
        '@version': '01.00.000',
      };
      const result = genProcessFromData({
        ...mockRawData,
        modellingAndValidation: {
          ...mockRawData.modellingAndValidation,
          validation: {
            review: {
              '@type': 'Independent external review',
              'common:referenceToCompleteReviewReport': report,
            },
          },
        },
      });
      const review = result.modellingAndValidation?.validation?.review;
      const firstReview = Array.isArray(review) ? review[0] : review;
      expect(firstReview?.['common:referenceToCompleteReviewReport']?.['@refObjectId']).toBe(
        report['@refObjectId'],
      );
    });

    it('should handle single exchange object', () => {
      const dataWithSingleExchange = {
        ...mockRawData,
        exchanges: {
          exchange: {
            '@dataSetInternalID': '1',
            referenceToFlowDataSet: {
              '@refObjectId': 'flow-id-1',
            },
            exchangeDirection: 'Input',
            meanAmount: '10',
          },
        },
      };

      const result = genProcessFromData(dataWithSingleExchange);

      expect(Array.isArray(result.exchanges.exchange)).toBe(true);
      expect(result.exchanges.exchange).toHaveLength(1);
    });

    it('should normalize legacy undefined amount strings in exchanges', () => {
      const dataWithLegacyUndefinedAmounts = {
        ...mockRawData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
              },
              exchangeDirection: 'Input',
              meanAmount: 'undefined',
              resultingAmount: 'undefined',
            },
          ],
        },
      };

      const result = genProcessFromData(dataWithLegacyUndefinedAmounts);

      expect(result.exchanges.exchange[0].meanAmount).toBeUndefined();
      expect(result.exchanges.exchange[0].resultingAmount).toBeUndefined();
    });

    it('should normalize raw exchange location to a plain string code for forms', () => {
      const dataWithLegacyLocation = {
        ...mockRawData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-id-1',
              },
              exchangeDirection: 'Input',
              location: [{ '@xml:lang': 'en', '#text': 'CN' }],
              meanAmount: '10',
            },
          ],
        },
      };

      const result = genProcessFromData(dataWithLegacyLocation);

      expect(result.exchanges.exchange[0].location).toBe('CN');
    });

    it('should handle missing exchanges', () => {
      const dataWithoutExchanges = {
        ...mockRawData,
        exchanges: {},
      };

      const result = genProcessFromData(dataWithoutExchanges);

      expect(result.exchanges.exchange).toEqual([]);
    });

    it('should keep empty reference year empty instead of NaN when converting from raw data', () => {
      const dataWithEmptyReferenceYear = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          time: {
            'common:referenceYear': undefined,
          },
        },
      };

      const result = genProcessFromData(dataWithEmptyReferenceYear);

      expect(result.processInformation.time['common:referenceYear']).toBeUndefined();
    });

    it('should mark quantitative reference exchange', () => {
      const result = genProcessFromData(mockRawData);

      const exchanges = result.exchanges.exchange;
      const refExchange = exchanges.find((e: any) => e['@dataSetInternalID'] === '2');
      const nonRefExchange = exchanges.find((e: any) => e['@dataSetInternalID'] === '1');

      expect(refExchange).toBeDefined();
      expect(nonRefExchange).toBeDefined();
      expect((refExchange as any).quantitativeReference).toBe(true);
      expect((nonRefExchange as any).quantitativeReference).toBe(false);
    });

    it('should include functionalUnitOrOther in quantitative reference exchange', () => {
      const result = genProcessFromData(mockRawData);

      const refExchange = result.exchanges.exchange.find(
        (e: any) => e['@dataSetInternalID'] === '2',
      );

      expect(refExchange).toBeDefined();
      expect((refExchange as any).functionalUnitOrOther).toBeDefined();
      expect(Array.isArray((refExchange as any).functionalUnitOrOther)).toBe(true);
    });

    it('should handle process without quantitative reference', () => {
      const dataWithoutRef = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          quantitativeReference: {},
        },
      };

      const result = genProcessFromData(dataWithoutRef);

      const exchanges = result.exchanges.exchange;
      exchanges.forEach((e: any) => {
        expect(e.quantitativeReference).toBe(false);
      });
    });

    it('should preserve exchange allocations', () => {
      const dataWithAllocations = {
        ...mockRawData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: { '@refObjectId': 'flow-1' },
              exchangeDirection: 'Output',
              meanAmount: '1',
              allocations: {
                allocation: {
                  '@internalReferenceToCoProduct': 'co-product-1',
                  '@allocatedFraction': '0.5',
                },
              },
            },
          ],
        },
      };

      const result = genProcessFromData(dataWithAllocations);

      expect(result.exchanges.exchange[0].allocations).toBeDefined();
      expect(
        (result.exchanges.exchange[0] as any).allocations?.allocation?.['@allocatedFraction'],
      ).toBe('0.5');
    });

    it('should handle missing UUID with fallback', () => {
      const dataWithoutUUID = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          dataSetInformation: {
            ...mockRawData.processInformation.dataSetInformation,
            'common:UUID': undefined,
          },
        },
      };

      const result = genProcessFromData(dataWithoutUUID);

      expect(result.processInformation.dataSetInformation['common:UUID']).toBe('-');
    });

    it('should handle LCIA results', () => {
      const dataWithLCIA = {
        ...mockRawData,
        LCIAResults: {
          'common:other': {
            'tg:lciaCalculationEvidence': { '#text': '{"status":"complete"}' },
          },
          LCIAResult: [
            {
              referenceToLCIAMethodDataSet: {
                '@refObjectId': 'method-1',
              },
              meanAmount: '100',
            },
          ],
        },
      };

      const result = genProcessFromData(dataWithLCIA);

      expect(result.LCIAResults).toBeDefined();
      expect(result.LCIAResults?.LCIAResult ?? []).toHaveLength(1);
      expect(result.LCIAResults?.['common:other']).toEqual(
        dataWithLCIA.LCIAResults['common:other'],
      );

      const ordered = genProcessJsonOrdered('process-with-evidence', result);
      expect(ordered.processDataSet.LCIAResults['common:other']).toEqual(
        dataWithLCIA.LCIAResults['common:other'],
      );
    });

    it('should include all major sections', () => {
      const result = genProcessFromData(mockRawData);

      expect(result.processInformation).toBeDefined();
      expect(result.exchanges).toBeDefined();
      expect(result.modellingAndValidation).toBeDefined();
      expect(result.administrativeInformation).toBeDefined();
    });

    it('should handle mathematical relations', () => {
      const dataWithMath = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          mathematicalRelations: {
            modelDescription: [{ '@xml:lang': 'en', '#text': 'Mathematical model' }],
            variableParameter: {
              '@name': 'param1',
              formula: 'x + y',
              meanValue: '10',
            },
          },
        },
      };

      const result = genProcessFromData(dataWithMath);

      expect(result.processInformation.mathematicalRelations).toBeDefined();
      expect(
        (result.processInformation.mathematicalRelations as any)?.variableParameter?.['@name'],
      ).toBe('param1');
    });

    it('should handle technology section', () => {
      const dataWithTechnology = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          technology: {
            technologyDescriptionAndIncludedProcesses: [
              { '@xml:lang': 'en', '#text': 'Technology description' },
            ],
            technologicalApplicability: [
              { '@xml:lang': 'en', '#text': 'Applicability description' },
            ],
          },
        },
      };

      const result = genProcessFromData(dataWithTechnology);

      expect(result.processInformation.technology).toBeDefined();
      expect(
        Array.isArray(
          (result.processInformation.technology as any)?.technologyDescriptionAndIncludedProcesses,
        ),
      ).toBe(true);
    });

    it('should fall back for missing location and type of data set', () => {
      const sparseData = {
        ...mockRawData,
        processInformation: {
          ...mockRawData.processInformation,
          geography: {
            locationOfOperationSupplyOrProduction: {},
          },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: {},
        },
      };

      const result = genProcessFromData(sparseData);

      expect(
        (result.processInformation.geography as any)?.locationOfOperationSupplyOrProduction?.[
          '@location'
        ],
      ).toEqual({});
      expect((result.modellingAndValidation as any)?.LCIMethodAndAllocation?.typeOfDataSet).toEqual(
        {},
      );
    });

    it('should preserve exchange data source references for quantitative and non-quantitative flows', () => {
      const dataWithExchangeSources = {
        ...mockRawData,
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@type': 'flow data set',
                '@refObjectId': 'flow-id-1',
                '@version': '01.00.000',
              },
              exchangeDirection: 'Input',
              meanAmount: '10',
              referencesToDataSource: {
                referenceToDataSource: {
                  '@type': 'source data set',
                  '@refObjectId': 'source-id-input',
                  '@uri': 'http://example.com/source-input',
                  '@version': '01.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Input source' }],
                },
              },
            },
            {
              '@dataSetInternalID': '2',
              referenceToFlowDataSet: {
                '@type': 'flow data set',
                '@refObjectId': 'flow-id-2',
                '@version': '01.00.000',
              },
              exchangeDirection: 'Output',
              meanAmount: '1',
              allocations: {
                allocation: {
                  '@allocatedFraction': '50%',
                },
              },
              referencesToDataSource: {
                referenceToDataSource: {
                  '@type': 'source data set',
                  '@refObjectId': 'source-id-output',
                  '@uri': 'http://example.com/source-output',
                  '@version': '02.00.000',
                  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Output source' }],
                },
              },
            },
          ],
        },
      };

      const result = genProcessFromData(dataWithExchangeSources);

      expect(
        (result.exchanges.exchange[0] as any).referencesToDataSource.referenceToDataSource[0][
          '@refObjectId'
        ],
      ).toBe('source-id-input');
      expect(
        (result.exchanges.exchange[1] as any).referencesToDataSource.referenceToDataSource[0][
          '@refObjectId'
        ],
      ).toBe('source-id-output');
      expect(
        (result.exchanges.exchange[1] as any).allocations.allocation['@allocatedFraction'],
      ).toBe('50');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined inputs gracefully', () => {
      expect(genProcessName(undefined as any, 'en')).toBe('-');
      expect(genProcessExchangeTableData(undefined, 'en')).toEqual([]);
    });

    it('should handle null inputs gracefully', () => {
      expect(genProcessName(null as any, 'en')).toBe('-');
      expect(genProcessExchangeTableData(null, 'en')).toEqual([]);
    });

    it('should handle empty objects', () => {
      expect(genProcessName({}, 'en')).toBe('-');
      expect(genProcessExchangeTableData({}, 'en')).toHaveLength(1);
    });

    it('should handle empty arrays', () => {
      expect(genProcessExchangeTableData([], 'en')).toEqual([]);
    });

    it('should handle malformed exchange data', () => {
      const malformedData = {
        '@dataSetInternalID': null,
        exchangeDirection: undefined,
        referenceToFlowDataSet: null,
      };

      const result = genProcessExchangeTableData(malformedData, 'en');

      expect(result[0].dataSetInternalID).toBe('-');
      expect(result[0].exchangeDirection).toBe('-');
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency through genProcessJsonOrdered and genProcessFromData', () => {
      const originalData = {
        processInformation: {
          dataSetInformation: {
            name: {
              baseName: [{ '@xml:lang': 'en', '#text': 'Test Process' }],
            },
          },
          time: {
            'common:referenceYear': '2024',
          },
        },
        exchanges: {
          exchange: [
            {
              '@dataSetInternalID': '1',
              referenceToFlowDataSet: {
                '@refObjectId': 'flow-1',
              },
              exchangeDirection: 'Input',
              meanAmount: '10',
            },
          ],
        },
      };

      // Generate JSON
      const jsonData = genProcessJsonOrdered('test-id', originalData);

      // Convert back to form
      const formData = genProcessFromData(jsonData.processDataSet);

      // Verify key data is preserved
      expect(formData.processInformation).toBeDefined();
      expect(formData.exchanges).toBeDefined();
      expect(formData.exchanges.exchange).toHaveLength(1);
    });
  });
});
