import { classificationFormNameMatcher } from '@/pages/Utils/validation/classification';
import { normalizeContactSdkValidationDetails } from '@/pages/Contacts/sdkValidation';
import { normalizeFlowpropertySdkValidationDetails } from '@/pages/Flowproperties/sdkValidation';
import { normalizeFlowSdkValidationDetails } from '@/pages/Flows/sdkValidation';
import { normalizeLifeCycleModelSdkValidationDetails } from '@/pages/LifeCycleModels/sdkValidation';
import { normalizeProcessSdkValidationDetails } from '@/pages/Processes/sdkValidation';
import { normalizeSourceSdkValidationDetails } from '@/pages/Sources/sdkValidation';
import { normalizeUnitgroupSdkValidationDetails } from '@/pages/Unitgroups/sdkValidation';
import { getClassificationSource } from '@/services/classifications/system';

const adapters = [
  ['Process', 'processDataSet', 'processInformation', normalizeProcessSdkValidationDetails],
  ['Flow', 'flowDataSet', 'flowInformation', normalizeFlowSdkValidationDetails],
  ['Contact', 'contactDataSet', 'contactInformation', normalizeContactSdkValidationDetails],
  ['Source', 'sourceDataSet', 'sourceInformation', normalizeSourceSdkValidationDetails],
  [
    'FlowProperty',
    'flowPropertyDataSet',
    'flowPropertiesInformation',
    normalizeFlowpropertySdkValidationDetails,
  ],
  ['UnitGroup', 'unitGroupDataSet', 'unitGroupInformation', normalizeUnitgroupSdkValidationDetails],
  [
    'LifeCycleModel',
    'lifeCycleModelDataSet',
    'lifeCycleModelInformation',
    normalizeLifeCycleModelSdkValidationDetails,
  ],
] as const;

const customClass = { '@level': '4', '@classId': 'external', '#text': 'External class' };
const customSystem = { '@name': 'Custom system', 'common:class': [customClass, customClass] };

describe.each(adapters)(
  '%s classification SDK field mapping',
  (dataType, datasetKey, informationKey, normalize) => {
    const infoPath = [informationKey, 'dataSetInformation', 'classificationInformation'];
    const systemPath = [...infoPath, 'common:classification'];
    const buildJson = (systems: unknown) => ({
      [datasetKey]: {
        [informationKey]: {
          dataSetInformation: { classificationInformation: { 'common:classification': systems } },
        },
      },
    });
    const map = (suffix: Array<string | number>, systems: unknown, path = systemPath) => {
      const details = normalize(
        [{ code: 'required_missing', path: [datasetKey, ...path, ...suffix] }],
        buildJson(systems),
      );
      expect(details).toHaveLength(1);
      expect(details[0].fieldPath).toBe(details[0].formName?.map(String).join('.'));
      return details[0].formName;
    };

    it.each([undefined, [], {}])(
      'maps missing/empty system collections (%p) to the persistent collection anchor',
      (systems) => {
        expect(map([], systems)).toEqual(systemPath);
        expect(map([], systems, infoPath)).toEqual(systemPath);
      },
    );

    it('falls back to the collection anchor for indexed SDK errors on an empty system array', () => {
      expect(map([0, 'common:class', 0, '@classId'], [])).toEqual(systemPath);
    });

    it('locates a system-level or stale system-index error at the surviving collection anchor', () => {
      expect(map([0], [customSystem])).toEqual(systemPath);
      expect(map([1, 'common:class', 0, '#text'], [customSystem])).toEqual(systemPath);
      expect(map([0, 'common:class', 0, '#text'], [null, customSystem])).toEqual(systemPath);
    });

    it.each([0, 1])('retains system %i and raw custom class indices', (index) => {
      expect(map([index, 'common:class', 1, '#text'], [customSystem, customSystem])).toEqual([
        ...systemPath,
        index,
        'common:class',
        1,
        '#text',
      ]);
      expect(map([index, '@name'], [customSystem, customSystem])).toEqual([
        ...systemPath,
        index,
        '@name',
      ]);
      expect(map([index, '@classes'], [customSystem, customSystem])).toEqual([
        ...systemPath,
        index,
        '@classes',
      ]);
    });

    it.each([0, 1])('maps default built-in system %i class fields to its tree', (index) => {
      const source = getClassificationSource(dataType);
      const builtIn = {
        '@name': source.name,
        '@classes': source.uri,
        'common:class': [{ '@level': '0', '@classId': 'A', '#text': 'Alpha' }],
      };
      expect(map([index, 'common:class', 0, '@classId'], [builtIn, builtIn])).toEqual([
        ...systemPath,
        index,
        'common:class',
        'showValue',
      ]);
      expect(map([index, '@name'], [builtIn, builtIn])).toEqual([...systemPath, index, '@name']);
    });

    it('uses imported metadata rather than name truthiness to choose raw custom fields', () => {
      const source = getClassificationSource(dataType);
      const imported = {
        ...customSystem,
        '@name': source.name,
        '@classes': 'https://example.org/external.xml',
      };
      expect(map(['common:class', 1, '@level'], imported)).toEqual([
        ...systemPath,
        'common:class',
        1,
        '@level',
      ]);
    });

    it('falls back to collection anchors for noneditable system and custom-class metadata', () => {
      expect(map(['common:other', 'note'], customSystem)).toEqual(systemPath);
      expect(map([1, 'common:other'], [customSystem, customSystem])).toEqual(systemPath);
      expect(map(['@name', 'nested'], customSystem)).toEqual(systemPath);
      expect(map(['common:other', 'common:class', '#text'], customSystem, infoPath)).toEqual(
        systemPath,
      );
      expect(map(['common:class', 0, 'common:other', 'note'], customSystem)).toEqual([
        ...systemPath,
        'common:class',
      ]);
      expect(
        map([1, 'common:class', 0, '@classId', 'nested'], [customSystem, customSystem]),
      ).toEqual([...systemPath, 1, 'common:class']);
    });

    it('maps absent or empty custom class collections to the class collection anchor', () => {
      expect(map(['common:class'], { '@name': 'Custom' })).toEqual([...systemPath, 'common:class']);
      expect(map(['common:class', 0, '#text'], { '@name': 'Custom', 'common:class': [] })).toEqual([
        ...systemPath,
        'common:class',
      ]);
    });

    it('retains scalar legacy custom class inputs without inserting an index', () => {
      expect(
        map(['common:class', '#text'], { '@name': 'Custom', 'common:class': customClass }),
      ).toEqual([...systemPath, 'common:class', '#text']);
    });

    it('maps custom errors ending at a class item to the class collection anchor', () => {
      expect(map(['common:class', 0], customSystem)).toEqual([...systemPath, 'common:class']);
      expect(map([1, 'common:class', 1], [customSystem, customSystem])).toEqual([
        ...systemPath,
        1,
        'common:class',
      ]);
    });

    it.each(['@level', '@classId', '#text'])(
      'targets the normalized class-array input for a raw singleton %s inside repeated systems',
      (field) => {
        const singletonSystem = { '@name': 'Custom', 'common:class': customClass };
        expect(map([1, 'common:class', field], [customSystem, singletonSystem])).toEqual([
          ...systemPath,
          1,
          'common:class',
          0,
          field,
        ]);
        expect(map(['common:class', field], singletonSystem)).toEqual([
          ...systemPath,
          'common:class',
          field,
        ]);
      },
    );

    it('uses index zero when an SDK union omits the index of a real array', () => {
      expect(map(['common:class', '@classId'], [customSystem])).toEqual([
        ...systemPath,
        0,
        'common:class',
        0,
        '@classId',
      ]);
    });
  },
);

it.each([
  'classificationInformation',
  'common:elementaryFlowCategorization',
  'common:classification',
])('maps Flow %s issues to the corresponding mounted collection', (segment) => {
  const infoPath = ['flowInformation', 'dataSetInformation', 'classificationInformation'];
  const explicitKey = segment === 'classificationInformation' ? undefined : segment;
  const details = normalizeFlowSdkValidationDetails(
    [
      {
        code: 'required_missing',
        path: ['flowDataSet', ...infoPath, ...(explicitKey ? [explicitKey] : [])],
      },
    ],
    {
      flowDataSet: { modellingAndValidation: { LCIMethod: { typeOfDataSet: 'Elementary flow' } } },
    },
  );
  expect(details[0].formName).toEqual([...infoPath, 'common:elementaryFlowCategorization']);
});

it('maps repeated elementary Flow category fields to their tree even with custom system metadata', () => {
  const infoPath = ['flowInformation', 'dataSetInformation', 'classificationInformation'];
  const details = normalizeFlowSdkValidationDetails(
    [
      {
        code: 'invalid_type',
        path: [
          'flowDataSet',
          ...infoPath,
          'common:elementaryFlowCategorization',
          1,
          'common:category',
          0,
          '@catId',
        ],
      },
    ],
    {
      flowDataSet: {
        modellingAndValidation: { LCIMethod: { typeOfDataSet: 'Elementary flow' } },
        flowInformation: {
          dataSetInformation: {
            classificationInformation: {
              'common:elementaryFlowCategorization': [
                {},
                { '@name': 'Imported category', 'common:category': [{ '@catId': 'air' }] },
              ],
            },
          },
        },
      },
    },
  );
  expect(details[0].formName).toEqual([
    ...infoPath,
    'common:elementaryFlowCategorization',
    1,
    'common:category',
    'showValue',
  ]);
});

it.each([
  ['Elementary flow', 'common:classification', 'common:elementaryFlowCategorization'],
  ['Product flow', 'common:elementaryFlowCategorization', 'common:classification'],
  ['Waste flow', 'common:elementaryFlowCategorization', 'common:classification'],
  [undefined, 'common:elementaryFlowCategorization', 'common:classification'],
])(
  'maps stale and union errors from the inactive branch for Flow type %p to the active anchor',
  (typeOfDataSet, inactiveKey, activeKey) => {
    const infoPath = ['flowInformation', 'dataSetInformation', 'classificationInformation'];
    const leafPath = [
      0,
      inactiveKey === 'common:classification' ? 'common:class' : 'common:category',
      0,
      '#text',
    ];
    const issuePath = ['flowDataSet', ...infoPath, inactiveKey!];
    const orderedJson = {
      flowDataSet: {
        modellingAndValidation: { LCIMethod: { typeOfDataSet } },
        flowInformation: {
          dataSetInformation: {
            classificationInformation: {
              'common:classification': [customSystem],
              'common:elementaryFlowCategorization': [{ 'common:category': [{ '@catId': 'air' }] }],
            },
          },
        },
      },
    };
    const direct = normalizeFlowSdkValidationDetails(
      [{ code: 'invalid_type', path: [...issuePath, ...leafPath] }],
      orderedJson,
    );
    const union = normalizeFlowSdkValidationDetails(
      [
        {
          code: 'invalid_union',
          path: issuePath,
          errors: [[{ code: 'invalid_type', path: leafPath }]],
        },
      ],
      orderedJson,
    );
    expect(direct[0].formName).toEqual([...infoPath, activeKey]);
    expect(union[0].formName).toEqual([...infoPath, activeKey]);
  },
);

it.each(['@name', '@classes', 'common:other'])(
  'maps noneditable elementary Flow category metadata %s to its collection anchor',
  (field) => {
    const systemPath = [
      'flowInformation',
      'dataSetInformation',
      'classificationInformation',
      'common:elementaryFlowCategorization',
    ];
    const details = normalizeFlowSdkValidationDetails(
      [{ code: 'invalid_type', path: ['flowDataSet', ...systemPath, 0, field] }],
      {
        flowDataSet: {
          modellingAndValidation: { LCIMethod: { typeOfDataSet: 'Elementary flow' } },
          flowInformation: {
            dataSetInformation: {
              classificationInformation: {
                'common:elementaryFlowCategorization': [
                  { 'common:category': [{ '@catId': 'air' }] },
                ],
              },
            },
          },
        },
      },
    );
    expect(details[0].formName).toEqual(systemPath);
  },
);

it('preserves an unrelated field path when the classification mapper has no classification target', () => {
  const path = ['processInformation', 'dataSetInformation', 'name', 'baseName'];
  const matcher = classificationFormNameMatcher(
    {},
    { dataType: 'Process', datasetKey: 'processDataSet' },
  );
  expect(matcher.formName({ rootPath: path })).toEqual(path);
});
