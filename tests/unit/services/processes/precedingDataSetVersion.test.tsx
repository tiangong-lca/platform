import { normalizeLangPayloadBeforeSave } from '@/services/general/util';
import { genProcessFromData, genProcessJsonOrdered } from '@/services/processes/util';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Form, Input } from 'antd';
import { createProcess } from '@tiangong-lca/tidas-sdk/core';
import { productDemandFixture } from '../../../helpers/lifeCycleModelProductDemand';

// Run hydration against the installed core entry selected by this checkout's manifest.
jest.mock('@tiangong-lca/tidas-sdk/core', () =>
  jest.requireActual(process.cwd() + '/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js'),
);

const key = 'common:referenceToPrecedingDataSetVersion';
const id = '11111111-1111-4111-8111-111111111111';
const predecessor = {
  '@refObjectId': id,
  '@type': 'process data set',
  '@version': '01.01.001',
  '@uri': `../processes/${id}_01.01.001.xml`,
  'common:subReference': ['inventory', 'appendix'],
  'common:shortDescription': [
    { '@xml:lang': 'zh', '#text': '原始版本' },
    { '@xml:lang': 'en', '#text': '  Original version  ' },
    { '@xml:lang': 'fr', '#text': '' },
  ],
};
const older = {
  ...predecessor,
  '@version': '01.01.000',
  '@uri': `../processes/${id}_01.01.000.xml`,
  'common:subReference': 'appendix',
  'common:shortDescription': [{ '@xml:lang': 'en', '#text': 'First version' }],
};

function successor(reference?: unknown) {
  const { original } = productDemandFixture();
  original.processInformation.dataSetInformation['common:UUID'] = id;
  original.modellingAndValidation.validation = { review: { '@type': 'Not reviewed' } };
  Object.assign(original.modellingAndValidation.complianceDeclarations.compliance, {
    'common:nomenclatureCompliance': 'Not defined',
    'common:methodologicalCompliance': 'Not defined',
    'common:reviewCompliance': 'Not defined',
    'common:documentationCompliance': 'Not defined',
    'common:qualityCompliance': 'Not defined',
  });
  original.administrativeInformation.publicationAndOwnership = {
    ...original.administrativeInformation.publicationAndOwnership,
    'common:dataSetVersion': '01.01.002',
    ...(reference === undefined ? {} : { [key]: reference }),
  };
  return original;
}

describe('Process predecessor round trip', () => {
  it.each([
    ['singleton', predecessor],
    ['one-element array', [older]],
    ['ordered array', [older, predecessor]],
  ])(
    'preserves the complete %s through hydration, serialization and save normalization',
    async (_, reference) => {
      const stored = successor(reference);
      expect(
        createProcess({ processDataSet: stored }, { mode: 'strict' }).validateEnhanced()
          .validationIssues,
      ).toEqual([]);
      const form = genProcessFromData(stored);
      expect(form.administrativeInformation?.publicationAndOwnership?.[key]).toStrictEqual(
        reference,
      );

      // The editor registers adjacent fields and reads unregistered provenance with getFieldsValue(true).
      const [formStore] = renderHook(() => Form.useForm()).result.current;
      render(
        <Form form={formStore}>
          <Form.Item
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:registrationNumber',
            ]}
          >
            <Input aria-label='Registration number' />
          </Form.Item>
        </Form>,
      );
      act(() => formStore.setFieldsValue(form));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'successor-edit' } });
      const saved = genProcessJsonOrdered(id, formStore.getFieldsValue(true));
      for (const intent of ['save', 'validation'] as const) {
        const { payload } = await normalizeLangPayloadBeforeSave(saved, { intent });
        expect(
          createProcess(payload, { mode: 'strict' }).validateEnhanced().validationIssues,
        ).toEqual([]);
        const publication =
          payload.processDataSet.administrativeInformation.publicationAndOwnership;
        expect(publication['common:registrationNumber']).toBe('successor-edit');
        expect(publication[key]).toStrictEqual(reference);
        expect(publication['common:dataSetVersion']).toBe('01.01.002');
        const reopened = genProcessFromData(payload.processDataSet);
        expect(reopened.administrativeInformation?.publicationAndOwnership?.[key]).toStrictEqual(
          reference,
        );
      }
    },
  );

  it.each([undefined, null, {}, [], [{}]])('omits a missing or empty predecessor (%j)', (empty) => {
    const stored = successor(empty);
    const form = genProcessFromData(stored);
    expect(form.administrativeInformation?.publicationAndOwnership).not.toHaveProperty(key);
    for (const data of [stored, form]) {
      const saved = genProcessJsonOrdered(id, data);
      expect(
        saved.processDataSet.administrativeInformation.publicationAndOwnership,
      ).not.toHaveProperty(key);
    }
  });
});
