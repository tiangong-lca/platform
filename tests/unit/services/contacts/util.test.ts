/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@/services/general/util');
jest.mock('@tiangong-lca/tidas-sdk/core');

describe('Contacts Util Service', () => {
  const {
    getLangJson,
    getLangList,
    classificationToJsonList,
    classificationToStringList,
    convertToUTCISOString,
    removeEmptyObjects,
    formatDateTime,
  } = jest.requireMock('@/services/general/util');
  const { createContact: createTidasContact } = jest.requireMock('@tiangong-lca/tidas-sdk/core');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    getLangJson.mockImplementation((value: any) => value || []);
    getLangList.mockImplementation((value: any) => value || []);
    classificationToJsonList.mockImplementation((value: any) => value || []);
    classificationToStringList.mockImplementation((value: any) => value || []);
    convertToUTCISOString.mockImplementation((value: any) => value);
    removeEmptyObjects.mockImplementation((obj: any) => obj);
    formatDateTime.mockReturnValue('2023-01-01T00:00:00Z');
  });

  describe('genContactJsonOrdered', () => {
    it('should generate properly ordered JSON for contact creation', async () => {
      const { genContactJsonOrdered } = require('@/services/contacts/util');

      const testData = {
        contactInformation: {
          dataSetInformation: {
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'Test Contact' }],
            'common:name': [{ '@xml:lang': 'en', '#text': 'Test Full Name' }],
            classificationInformation: {
              'common:classification': {
                'common:class': { id: ['1'], value: ['Category 1'] },
              },
            },
            contactAddress: [{ '@xml:lang': 'en', '#text': '123 Test St' }],
            telephone: '+1234567890',
            telefax: '+0987654321',
            email: 'test@example.com',
            WWWAddress: 'https://example.com',
            centralContactPoint: [{ '@xml:lang': 'en', '#text': 'Main Office' }],
            contactDescriptionOrComment: [{ '@xml:lang': 'en', '#text': 'Test description' }],
            referenceToContact: {
              '@refObjectId': 'ref-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/contact',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Reference' }],
              '@version': '1.0',
            },
            referenceToLogo: {
              '@refObjectId': 'logo-123',
              '@type': 'source data set',
              '@uri': 'http://example.com/logo',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Logo' }],
              '@version': '1.0',
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2023-01-01T00:00:00Z',
            'common:referenceToDataSetFormat': {
              '@refObjectId': 'format-123',
              '@type': 'source data set',
              '@uri': 'http://example.com/format',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Format' }],
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '1.0.0',
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/prev',
              '@version': '0.9',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Previous' }],
            },
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/owner',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Owner' }],
            },
            'common:permanentDataSetURI': 'http://example.com/permanent',
          },
        },
      };

      const result = genContactJsonOrdered('contact-uuid-123', testData);

      expect(result).toBeDefined();
      expect(result.contactDataSet).toBeDefined();
      expect(result.contactDataSet?.['@xmlns:common']).toBe('http://lca.jrc.it/ILCD/Common');
      expect(result.contactDataSet?.['@xmlns']).toBe('http://lca.jrc.it/ILCD/Contact');
      expect(result.contactDataSet?.['@version']).toBe('1.1');
      expect(result.contactDataSet?.contactInformation?.dataSetInformation?.['common:UUID']).toBe(
        'contact-uuid-123',
      );

      expect(getLangJson).toHaveBeenCalledWith(
        testData.contactInformation.dataSetInformation['common:shortName'],
      );
      expect(classificationToJsonList).toHaveBeenCalledWith(
        testData.contactInformation.dataSetInformation.classificationInformation[
          'common:classification'
        ]['common:class'],
      );
      expect(removeEmptyObjects).toHaveBeenCalled();
    });

    it('should handle minimal contact data', async () => {
      const { genContactJsonOrdered } = require('@/services/contacts/util');

      const minimalData = {
        contactInformation: {
          dataSetInformation: {
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'Minimal' }],
          },
        },
      };

      const result = genContactJsonOrdered('contact-minimal', minimalData);

      expect(result).toBeDefined();
      expect(result.contactDataSet?.contactInformation?.dataSetInformation?.['common:UUID']).toBe(
        'contact-minimal',
      );
      expect(removeEmptyObjects).toHaveBeenCalled();
    });

    it('should preserve all namespace attributes', async () => {
      const { genContactJsonOrdered } = require('@/services/contacts/util');

      const result = genContactJsonOrdered('test-id', {
        contactInformation: { dataSetInformation: {} },
      });

      expect(result.contactDataSet?.['@xmlns:common']).toBe('http://lca.jrc.it/ILCD/Common');
      expect(result.contactDataSet?.['@xmlns']).toBe('http://lca.jrc.it/ILCD/Contact');
      expect(result.contactDataSet?.['@xmlns:xsi']).toBe(
        'http://www.w3.org/2001/XMLSchema-instance',
      );
      expect(result.contactDataSet?.['@xsi:schemaLocation']).toBe(
        'http://lca.jrc.it/ILCD/Contact ../../schemas/ILCD_ContactDataSet.xsd',
      );
    });

    it('should stamp current time and derive permanent dataset URI from id and version', async () => {
      const { genContactJsonOrdered } = require('@/services/contacts/util');

      const result = genContactJsonOrdered('contact-777', {
        contactInformation: { dataSetInformation: {} },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:dataSetVersion': '02.03.004',
          },
        },
      });

      expect(formatDateTime).toHaveBeenCalled();
      expect(
        result.contactDataSet?.administrativeInformation?.dataEntryBy?.['common:timeStamp'],
      ).toBe('2023-01-01T00:00:00Z');
      expect(
        result.contactDataSet?.administrativeInformation?.publicationAndOwnership?.[
          'common:permanentDataSetURI'
        ],
      ).toBe(
        'https://lcdn.tiangong.earth/datasetdetail/contact.xhtml?uuid=contact-777&version=02.03.004',
      );
    });
  });

  describe('genContactFromData', () => {
    beforeEach(() => {
      createTidasContact.mockImplementation((data: any) => data);
    });

    it('should convert database JSON to form format', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const dbData = {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-123',
            'common:shortName': [{ '@xml:lang': 'en', '#text': 'Test Contact' }],
            'common:name': [{ '@xml:lang': 'en', '#text': 'Test Full Name' }],
            classificationInformation: {
              'common:classification': {
                'common:class': [{ '@level': '0', '@classId': '1', '#text': 'Category' }],
              },
            },
            contactAddress: [{ '@xml:lang': 'en', '#text': '123 Test St' }],
            telephone: '+1234567890',
            email: 'test@example.com',
            WWWAddress: 'https://example.com',
            centralContactPoint: [{ '@xml:lang': 'en', '#text': 'Office' }],
            contactDescriptionOrComment: [{ '@xml:lang': 'en', '#text': 'Description' }],
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2023-01-01T00:00:00Z',
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '1.0.0',
          },
        },
      };

      const result = genContactFromData(dbData);

      expect(result).toBeDefined();
      expect(createTidasContact).toHaveBeenCalled();
      expect(getLangList).toHaveBeenCalledWith(
        dbData.contactInformation.dataSetInformation['common:shortName'],
      );
      expect(classificationToStringList).toHaveBeenCalledWith(
        dbData.contactInformation.dataSetInformation.classificationInformation[
          'common:classification'
        ]['common:class'],
      );
      expect(removeEmptyObjects).toHaveBeenCalled();
    });

    it('should return undefined for null data', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const result = genContactFromData(null);

      expect(result).toBeUndefined();
      expect(createTidasContact).not.toHaveBeenCalled();
    });

    it('should return undefined for undefined data', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const result = genContactFromData(undefined);

      expect(result).toBeUndefined();
      expect(createTidasContact).not.toHaveBeenCalled();
    });

    it('should add default timestamp if not present', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const dataWithoutTimestamp = {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-123',
          },
        },
        administrativeInformation: {
          dataEntryBy: {},
          publicationAndOwnership: {},
        },
      };

      const result = genContactFromData(dataWithoutTimestamp);

      expect(result).toBeDefined();
      expect(formatDateTime).toHaveBeenCalled();
    });

    it('should fall back to formatDateTime when UTC conversion returns undefined', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      convertToUTCISOString.mockReturnValueOnce(undefined);

      const result = genContactFromData({
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-fallback',
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': 'raw-ts',
          },
          publicationAndOwnership: {},
        },
      });

      expect(result).toBeDefined();
      expect(convertToUTCISOString).toHaveBeenCalledWith('raw-ts');
      expect(formatDateTime).toHaveBeenCalled();
      expect(createTidasContact).toHaveBeenCalledWith(
        expect.objectContaining({
          contactDataSet: expect.objectContaining({
            administrativeInformation: expect.objectContaining({
              dataEntryBy: expect.objectContaining({
                'common:timeStamp': '2023-01-01T00:00:00Z',
              }),
            }),
          }),
        }),
      );
    });

    it('should handle complex reference structures', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const complexData = {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-complex',
            referenceToContact: {
              '@refObjectId': 'ref-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/ref',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Reference' }],
            },
            referenceToLogo: {
              '@refObjectId': 'logo-123',
              '@type': 'source data set',
              '@uri': 'http://example.com/logo',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Logo' }],
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2023-01-01T00:00:00Z',
            'common:referenceToDataSetFormat': {
              '@refObjectId': 'format-123',
              '@type': 'source data set',
              '@uri': 'http://example.com/format',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Format' }],
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '1.0.0',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/owner',
              '@version': '1.0',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Owner' }],
            },
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-123',
              '@type': 'contact data set',
              '@uri': 'http://example.com/prev',
              '@version': '0.9',
              'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'Previous' }],
            },
          },
        },
      };

      const result = genContactFromData(complexData);

      expect(result).toBeDefined();
      expect(getLangList).toHaveBeenCalled();
      expect(createTidasContact).toHaveBeenCalledWith(
        expect.objectContaining({
          contactDataSet: expect.objectContaining({
            '@xmlns:common': 'http://lca.jrc.it/ILCD/Common',
            '@xmlns': 'http://lca.jrc.it/ILCD/Contact',
          }),
        }),
      );
    });

    it('should preserve permanentDataSetURI and normalize owner/reference short descriptions', async () => {
      const { genContactFromData } = require('@/services/contacts/util');

      const result = genContactFromData({
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-permalink',
            referenceToContact: {
              '@refObjectId': 'linked-contact',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Linked contact' },
            },
            referenceToLogo: {
              '@refObjectId': 'linked-logo',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Linked logo' },
            },
          },
        },
        administrativeInformation: {
          dataEntryBy: {
            'common:timeStamp': '2023-01-02T00:00:00Z',
            'common:referenceToDataSetFormat': {
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'ILCD format' },
            },
          },
          publicationAndOwnership: {
            'common:dataSetVersion': '02.00.000',
            'common:permanentDataSetURI': 'https://lcdn.tiangong.earth/contact-permalink',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'owner-1',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Owner 1' },
            },
            'common:referenceToPrecedingDataSetVersion': {
              '@refObjectId': 'prev-1',
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Prev 1' },
            },
          },
        },
      });

      expect(getLangList).toHaveBeenCalledWith({ '@xml:lang': 'en', '#text': 'Linked contact' });
      expect(getLangList).toHaveBeenCalledWith({ '@xml:lang': 'en', '#text': 'Linked logo' });
      expect(getLangList).toHaveBeenCalledWith({ '@xml:lang': 'en', '#text': 'Owner 1' });
      expect(
        result?.administrativeInformation?.publicationAndOwnership?.['common:permanentDataSetURI'],
      ).toBe('https://lcdn.tiangong.earth/contact-permalink');
      expect(
        result?.contactInformation?.dataSetInformation?.referenceToContact?.[
          'common:shortDescription'
        ],
      ).toEqual({ '@xml:lang': 'en', '#text': 'Linked contact' });
    });
  });
});
