/**
 * Tests for source utility functions
 * Path: src/services/sources/util.ts
 */

import { genSourceFromData, genSourceJsonOrdered } from '@/services/sources/util';

jest.mock('@/services/general/util', () => ({
  classificationToJsonList: jest.fn(),
  classificationToStringList: jest.fn(),
  convertToUTCISOString: jest.fn(),
  formatDateTime: jest.fn(),
  getLangJson: jest.fn(),
  getLangList: jest.fn(),
  jsonToList: jest.fn(),
  listToJson: jest.fn(),
  removeEmptyObjects: jest.fn(),
}));

const {
  classificationToJsonList: mockClassificationToJsonList,
  classificationToStringList: mockClassificationToStringList,
  convertToUTCISOString: mockConvertToUTCISOString,
  formatDateTime: mockFormatDateTime,
  getLangJson: mockGetLangJson,
  getLangList: mockGetLangList,
  jsonToList: mockJsonToList,
  listToJson: mockListToJson,
  removeEmptyObjects: mockRemoveEmptyObjects,
} = jest.requireMock('@/services/general/util') as {
  classificationToJsonList: jest.Mock;
  classificationToStringList: jest.Mock;
  convertToUTCISOString: jest.Mock;
  formatDateTime: jest.Mock;
  getLangJson: jest.Mock;
  getLangList: jest.Mock;
  jsonToList: jest.Mock;
  listToJson: jest.Mock;
  removeEmptyObjects: jest.Mock;
};

jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  createSource: jest.fn(),
}));

const mockCreateSource = jest.requireMock('@tiangong-lca/tidas-sdk/core').createSource as jest.Mock;

describe('Source Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClassificationToJsonList.mockImplementation(() => ({}));
    mockClassificationToStringList.mockImplementation(() => ({ id: [], value: [] }));
    mockConvertToUTCISOString.mockImplementation((dateStr) => dateStr || '');
    mockFormatDateTime.mockImplementation(() => '2024-05-12T00:00:00Z');
    mockGetLangJson.mockImplementation(() => ({}));
    mockGetLangList.mockImplementation((value) => {
      if (!value) {
        return [];
      }
      return Array.isArray(value) ? value : [value];
    });
    mockJsonToList.mockImplementation((value) => {
      if (!value) {
        return [];
      }
      return Array.isArray(value) ? value : [value];
    });
    mockListToJson.mockImplementation((value) => {
      if (!value) {
        return {};
      }
      if (Array.isArray(value)) {
        if (value.length === 1) {
          return value[0];
        }
        if (value.length === 0) {
          return {};
        }
        return value;
      }
      return value;
    });
    mockRemoveEmptyObjects.mockImplementation((obj) => obj);
    mockCreateSource.mockImplementation((input) => input);
  });

  describe('genSourceJsonOrdered', () => {
    it('should build ordered ILCD source JSON with helper conversions', () => {
      const shortNameInput = [{ '@xml:lang': 'en', '#text': 'Annual report 2024' }];
      const shortNameJson = { '@xml:lang': 'en', '#text': 'Annual report 2024' };
      const descriptionInput = [
        { '@xml:lang': 'en', '#text': 'Detailed commentary' },
        { '@xml:lang': 'zh', '#text': '详细备注' },
      ];
      const contactShortDescInput = [{ '@xml:lang': 'en', '#text': 'Contact short' }];
      const logoShortDescInput = [{ '@xml:lang': 'en', '#text': 'Logo short' }];
      const formatShortDescInput = [{ '@xml:lang': 'en', '#text': 'ILCD format' }];
      const ownershipShortDescInput = [{ '@xml:lang': 'en', '#text': 'Tiangong team' }];
      const precedingShortDescInput = [{ '@xml:lang': 'en', '#text': 'Previous version' }];

      const langJsonMap = new Map<any, any>([
        [shortNameInput, shortNameJson],
        [descriptionInput, descriptionInput],
        [contactShortDescInput, { '@xml:lang': 'en', '#text': 'Contact short' }],
        [logoShortDescInput, { '@xml:lang': 'en', '#text': 'Logo short' }],
        [formatShortDescInput, { '@xml:lang': 'en', '#text': 'ILCD format' }],
        [ownershipShortDescInput, { '@xml:lang': 'en', '#text': 'Tiangong team' }],
        [precedingShortDescInput, { '@xml:lang': 'en', '#text': 'Previous version' }],
      ]);
      mockGetLangJson.mockImplementation((value) => langJsonMap.get(value) ?? {});

      const classificationInput = { id: ['Images', 'Reports'], value: ['Images', 'Reports'] };
      const classificationJson = [
        { '@level': '0', '@classId': 'Images', '#text': 'Images' },
        { '@level': '1', '@classId': 'Reports', '#text': 'Reports' },
      ];
      mockClassificationToJsonList.mockReturnValue(classificationJson);

      const digitalFilesInput = [{ '@uri': '../docs/report.pdf' }];
      const digitalFilesJson = { '@uri': '../docs/report.pdf' };
      mockListToJson.mockImplementation((value) =>
        value === digitalFilesInput ? digitalFilesJson : {},
      );

      const id = 'source-id-123';
      const data = {
        sourceInformation: {
          dataSetInformation: {
            'common:shortName': shortNameInput,
            classificationInformation: {
              'common:classification': {
                'common:class': classificationInput,
              },
            },
            sourceCitation: 'Environmental report 2024',
            publicationType: 'report',
            sourceDescriptionOrComment: descriptionInput,
            referenceToDigitalFile: digitalFilesInput,
            referenceToContact: {
              '@refObjectId': 'contact-id',
              '@type': 'contact data set',
              '@uri': '../contacts/contact-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': contactShortDescInput,
            },
            referenceToLogo: {
              '@refObjectId': 'logo-id',
              '@type': 'image',
              '@uri': '../logos/logo-id.png',
              '@version': '01.00.000',
              'common:shortDescription': logoShortDescInput,
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2024-05-12T00:00:00Z',
            'common:referenceToDataSetFormat': {
              '@type': 'source data set',
              '@refObjectId': 'format-id',
              '@uri': '../sources/format-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': formatShortDescInput,
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-id',
              '@type': 'contact data set',
              '@uri': '../contacts/owner-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': ownershipShortDescInput,
            },
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-id',
              '@type': 'source data set',
              '@uri': '../sources/prev-id.xml',
              '@version': '00.09.000',
              'common:shortDescription': precedingShortDescInput,
            },
            'common:permanentDataSetURI': '../sources/source-id-123.xml',
          },
        },
      };

      const result = genSourceJsonOrdered(id, data);

      expect(mockClassificationToJsonList).toHaveBeenCalledWith(classificationInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(shortNameInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(descriptionInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(contactShortDescInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(logoShortDescInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(formatShortDescInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(ownershipShortDescInput);
      expect(mockGetLangJson).toHaveBeenCalledWith(precedingShortDescInput);
      expect(mockListToJson).toHaveBeenCalledWith(digitalFilesInput);
      expect(mockRemoveEmptyObjects).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        sourceDataSet: {
          '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
          '@xmlns': 'http://lca.jrc.it/ILCD/Source',
          '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          '@version': '1.1',
          '@xsi:schemaLocation':
            'http://lca.jrc.it/ILCD/Source ../../schemas/ILCD_SourceDataSet.xsd',
          sourceInformation: {
            dataSetInformation: {
              'common:UUID': id,
              'common:shortName': shortNameJson,
              classificationInformation: {
                'common:classification': {
                  'common:class': classificationJson,
                },
              },
              sourceCitation: 'Environmental report 2024',
              publicationType: 'report',
              sourceDescriptionOrComment: descriptionInput,
              referenceToDigitalFile: digitalFilesJson,
              referenceToContact: {
                '@refObjectId': 'contact-id',
                '@type': 'contact data set',
                '@uri': '../contacts/contact-id.xml',
                '@version': '01.00.000',
                'common:shortDescription': { '@xml:lang': 'en', '#text': 'Contact short' },
              },
              referenceToLogo: {
                '@refObjectId': 'logo-id',
                '@type': 'image',
                '@uri': '../logos/logo-id.png',
                '@version': '01.00.000',
                'common:shortDescription': { '@xml:lang': 'en', '#text': 'Logo short' },
              },
            },
          },
          administrativeInformation: {
            dataEntryBy: {
              'common:timeStamp': '2024-05-12T00:00:00Z',
              'common:referenceToDataSetFormat': {
                '@type': 'source data set',
                '@refObjectId': 'format-id',
                '@uri': '../sources/format-id.xml',
                '@version': '01.00.000',
                'common:shortDescription': { '@xml:lang': 'en', '#text': 'ILCD format' },
              },
            },
            publicationAndOwnership: {
              'common:dataSetVersion': '01.00.000',
              'common:referenceToOwnershipOfDataSet': {
                '@refObjectId': 'owner-id',
                '@type': 'contact data set',
                '@uri': '../contacts/owner-id.xml',
                '@version': '01.00.000',
                'common:shortDescription': { '@xml:lang': 'en', '#text': 'Tiangong team' },
              },
              'common:referenceToPrecedingDataSetVersion': {
                '@refObjectId': 'prev-id',
                '@type': 'source data set',
                '@uri': '../sources/prev-id.xml',
                '@version': '00.09.000',
                'common:shortDescription': { '@xml:lang': 'en', '#text': 'Previous version' },
              },
              'common:permanentDataSetURI':
                'https://lcdn.tiangong.earth/datasetdetail/source.xhtml?uuid=source-id-123&version=01.00.000',
            },
          },
        },
      });
    });

    it('should delegate sanitization when optional sections are missing', () => {
      const sanitized = { cleaned: true } as any;
      mockRemoveEmptyObjects.mockReturnValue(sanitized);

      const result = genSourceJsonOrdered('new-id', {});

      expect(result).toBe(sanitized);
      expect(mockClassificationToJsonList).not.toHaveBeenCalled();
      expect(mockListToJson).toHaveBeenCalledWith(undefined);
      expect(mockRemoveEmptyObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDataSet: expect.objectContaining({
            sourceInformation: expect.objectContaining({
              dataSetInformation: expect.objectContaining({
                'common:UUID': 'new-id',
              }),
            }),
          }),
        }),
      );
    });

    it('should stamp current time and derive permanent dataset URI from id and version', () => {
      const result = genSourceJsonOrdered('source-time', {
        sourceInformation: { dataSetInformation: {} },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:dataSetVersion': '02.05.008',
          },
        },
      });

      expect(mockFormatDateTime).toHaveBeenCalled();
      expect(result.sourceDataSet.administrativeInformation.dataEntryBy['common:timeStamp']).toBe(
        '2024-05-12T00:00:00Z',
      );
      expect(
        result.sourceDataSet.administrativeInformation.publicationAndOwnership[
          'common:permanentDataSetURI'
        ],
      ).toBe(
        'https://lcdn.tiangong.earth/datasetdetail/source.xhtml?uuid=source-time&version=02.05.008',
      );
    });

    it('should keep multiple digital file references when listToJson returns an array', () => {
      const digitalFilesInput = [{ '@uri': '../docs/a.pdf' }, { '@uri': '../docs/b.pdf' }];
      mockListToJson.mockImplementation((value) => value);

      const result = genSourceJsonOrdered('source-files', {
        sourceInformation: {
          dataSetInformation: {
            referenceToDigitalFile: digitalFilesInput,
          },
        },
      });

      expect(mockListToJson).toHaveBeenCalledWith(digitalFilesInput);
      expect(
        result.sourceDataSet.sourceInformation.dataSetInformation.referenceToDigitalFile,
      ).toEqual(digitalFilesInput);
    });
  });

  describe('genSourceFromData', () => {
    it('should normalize TIDAS source dataset into form-ready structure', () => {
      const shortNameJson = { '@xml:lang': 'en', '#text': 'Annual report 2024' };
      const descriptionJson = [
        { '@xml:lang': 'en', '#text': 'Detailed commentary' },
        { '@xml:lang': 'zh', '#text': '详细备注' },
      ];
      const classificationJson = [{ '@level': '0', '@classId': 'Images', '#text': 'Images' }];
      const classificationStrings = { id: ['Images'], value: ['Images'] };
      mockClassificationToStringList.mockReturnValue(classificationStrings);

      const contactShortDesc = { '@xml:lang': 'en', '#text': 'Contact short' };
      const logoShortDesc = { '@xml:lang': 'en', '#text': 'Logo short' };
      const digitalFileJson = { '@uri': '../docs/report.pdf' };

      const data = {
        sourceInformation: {
          dataSetInformation: {
            'common:UUID': 'source-id-123',
            'common:shortName': shortNameJson,
            classificationInformation: {
              'common:classification': {
                'common:class': classificationJson,
              },
            },
            sourceCitation: 'Environmental report 2024',
            publicationType: 'report',
            sourceDescriptionOrComment: descriptionJson,
            referenceToDigitalFile: digitalFileJson,
            referenceToContact: {
              '@refObjectId': 'contact-id',
              '@type': 'contact data set',
              '@uri': '../contacts/contact-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': contactShortDesc,
            },
            referenceToLogo: {
              '@refObjectId': 'logo-id',
              '@type': 'image',
              '@uri': '../logos/logo-id.png',
              '@version': '01.00.000',
              'common:shortDescription': logoShortDesc,
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2024-05-10T00:00:00Z',
            'common:referenceToDataSetFormat': {
              '@type': 'source data set',
              '@refObjectId': 'format-id',
              '@uri': '../sources/format-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'ILCD format' },
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-id',
              '@type': 'contact data set',
              '@uri': '../contacts/owner-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Owner' },
            },
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-id',
              '@type': 'source data set',
              '@uri': '../sources/prev-id.xml',
              '@version': '00.09.000',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Previous version' },
            },
            'common:permanentDataSetURI': '../sources/source-id-123.xml',
          },
        },
      };

      const result = genSourceFromData(data);

      expect(mockCreateSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDataSet: expect.objectContaining({
            sourceInformation: expect.any(Object),
            administrativeInformation: expect.any(Object),
          }),
        }),
      );
      expect(mockGetLangList).toHaveBeenCalledWith(shortNameJson);
      expect(mockGetLangList).toHaveBeenCalledWith(descriptionJson);
      expect(mockGetLangList).toHaveBeenCalledWith(contactShortDesc);
      expect(mockGetLangList).toHaveBeenCalledWith(logoShortDesc);
      expect(mockJsonToList).toHaveBeenCalledWith(digitalFileJson);
      expect(mockClassificationToStringList).toHaveBeenCalledWith(classificationJson);
      expect(mockRemoveEmptyObjects).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        sourceInformation: {
          dataSetInformation: {
            'common:UUID': 'source-id-123',
            'common:shortName': [shortNameJson],
            classificationInformation: {
              'common:classification': {
                'common:class': classificationStrings,
              },
            },
            sourceCitation: 'Environmental report 2024',
            publicationType: 'report',
            sourceDescriptionOrComment: descriptionJson,
            referenceToDigitalFile: [digitalFileJson],
            referenceToContact: {
              '@refObjectId': 'contact-id',
              '@type': 'contact data set',
              '@uri': '../contacts/contact-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': [contactShortDesc],
            },
            referenceToLogo: {
              '@refObjectId': 'logo-id',
              '@type': 'image',
              '@uri': '../logos/logo-id.png',
              '@version': '01.00.000',
              'common:shortDescription': [logoShortDesc],
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2024-05-10T00:00:00Z',
            'common:referenceToDataSetFormat': {
              '@type': 'source data set',
              '@refObjectId': 'format-id',
              '@uri': '../sources/format-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'ILCD format' }],
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-id',
              '@type': 'contact data set',
              '@uri': '../contacts/owner-id.xml',
              '@version': '01.00.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Owner' }],
            },
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-id',
              '@type': 'source data set',
              '@uri': '../sources/prev-id.xml',
              '@version': '00.09.000',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Previous version' }],
            },
            'common:permanentDataSetURI': '../sources/source-id-123.xml',
          },
        },
      });
    });

    it('should handle missing optional properties without throwing', () => {
      const sanitized = { sanitized: true } as any;
      mockRemoveEmptyObjects.mockReturnValue(sanitized);

      const minimal = {
        sourceInformation: {
          dataSetInformation: {
            'common:UUID': 'minimal-id',
          },
        },
        administrativeInformation: {},
      };

      const result = genSourceFromData(minimal);

      expect(result).toBe(sanitized);
      expect(mockCreateSource).toHaveBeenCalledTimes(1);
      expect(mockGetLangList).toHaveBeenCalledWith(undefined);
      expect(mockJsonToList).toHaveBeenCalledWith(undefined);
      expect(mockClassificationToStringList).not.toHaveBeenCalled();
      expect(mockRemoveEmptyObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceInformation: expect.objectContaining({
            dataSetInformation: expect.objectContaining({
              'common:UUID': 'minimal-id',
              'common:shortName': [],
            }),
          }),
        }),
      );
    });

    it('should forward the converted UTC timestamp into the TIDAS payload', () => {
      mockConvertToUTCISOString.mockReturnValueOnce('2024-05-10T08:00:00Z');

      genSourceFromData({
        sourceInformation: {
          dataSetInformation: {
            'common:UUID': 'source-ts',
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': 'raw-time',
          },
          publicationAndOwnership: {},
        },
      });

      expect(mockConvertToUTCISOString).toHaveBeenCalledWith('raw-time');
      expect(mockCreateSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDataSet: expect.objectContaining({
            administrativeInformation: expect.objectContaining({
              dataEntryBy: expect.objectContaining({
                'common:timeStamp': '2024-05-10T08:00:00Z',
              }),
            }),
          }),
        }),
      );
    });
  });
});
