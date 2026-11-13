import { getClassificationSource } from '@/services/classifications/system';
import * as schemas from '@tiangong-lca/tidas-sdk/schemas';
import { genContactFromData, genContactJsonOrdered } from '@/services/contacts/util';
import {
  genFlowpropertyFromData,
  genFlowpropertyJsonOrdered,
} from '@/services/flowproperties/util';
import { genFlowFromData, genFlowJsonOrdered } from '@/services/flows/util';
import {
  genLifeCycleModelInfoFromData,
  genLifeCycleModelJsonOrdered,
} from '@/services/lifeCycleModels/util';
import { genProcessFromData, genProcessJsonOrdered } from '@/services/processes/util';
import { genSourceFromData, genSourceJsonOrdered } from '@/services/sources/util';
import { genUnitGroupFromData, genUnitGroupJsonOrdered } from '@/services/unitgroups/util';

const datasets = [
  ['contact', 'contactInformation', genContactFromData, genContactJsonOrdered],
  [
    'flowProperty',
    'flowPropertiesInformation',
    genFlowpropertyFromData,
    genFlowpropertyJsonOrdered,
  ],
  ['flow', 'flowInformation', genFlowFromData, genFlowJsonOrdered],
  [
    'lifeCycleModel',
    'lifeCycleModelInformation',
    genLifeCycleModelInfoFromData,
    genLifeCycleModelJsonOrdered,
  ],
  ['process', 'processInformation', genProcessFromData, genProcessJsonOrdered],
  ['source', 'sourceInformation', genSourceFromData, genSourceJsonOrdered],
  ['unitGroup', 'unitGroupInformation', genUnitGroupFromData, genUnitGroupJsonOrdered],
] as const;

it.each(datasets)(
  'preserves named classification systems across the %s serializer',
  (kind, information, read, write) => {
    const systems = [
      {
        '@name': 'First',
        '@classes': 'https://example.org/a',
        'common:class': [{ '@level': '0', '@classId': 'a', '#text': 'Alpha' }],
      },
      {
        '@name': 'Second',
        '@classes': 'https://example.org/b',
        'common:class': [{ '@level': '2', '@classId': 'b', '#text': 'Beta' }],
      },
    ];
    const data = {
      [information]: {
        dataSetInformation: { classificationInformation: { 'common:classification': systems } },
      },
    };
    const form = read(data);
    expect(form?.[information as keyof typeof form]).toMatchObject({
      dataSetInformation: { classificationInformation: { 'common:classification': systems } },
    });
    const saved = write('00000000-0000-4000-8000-000000000001', form);
    expect(
      (saved as any)[`${kind}DataSet`][information].dataSetInformation.classificationInformation[
        'common:classification'
      ],
    ).toEqual(systems);
  },
);

it.each(datasets)(
  'round-trips a default-named %s taxonomy selection',
  (kind, information, read, write) => {
    const name =
      kind === 'process' || kind === 'lifeCycleModel'
        ? 'ISIC Rev. 5'
        : kind === 'flow'
          ? 'CPC Ver. 3.0'
          : 'ILCD';
    const system = {
      '@name': name,
      '@classes': getClassificationSource(kind[0].toUpperCase() + kind.slice(1)).uri,
      'common:class': [
        { '@level': '0', '@classId': 'A', '#text': 'Agriculture' },
        { '@level': '1', '@classId': '01', '#text': 'Crop production' },
      ],
    };
    const data = {
      [information]: {
        dataSetInformation: { classificationInformation: { 'common:classification': system } },
      },
    };
    const form = read(data) as any;
    expect(
      form[information].dataSetInformation.classificationInformation['common:classification'][
        'common:class'
      ],
    ).toEqual({
      id: ['A', '01'],
      value: ['Agriculture', 'Crop production'],
    });
    const saved = write('00000000-0000-4000-8000-000000000001', form) as any;
    expect(
      saved[`${kind}DataSet`][information].dataSetInformation.classificationInformation[
        'common:classification'
      ],
    ).toEqual(system);
  },
);

it.each(datasets)(
  'preserves an externally sourced %s system even when its name matches the default',
  (kind, information, read, write) => {
    const name =
      kind === 'process' || kind === 'lifeCycleModel'
        ? 'ISIC Rev. 5'
        : kind === 'flow'
          ? 'CPC Ver. 3.0'
          : 'ILCD';
    const systems = [
      {
        '@name': name,
        '@classes': 'https://example.org/custom.xml',
        'common:class': [{ '@level': '0', '@classId': 'x', '#text': 'External' }],
      },
      {
        '@name': name,
        'common:class': { '@level': '2', '@classId': 'y', '#text': 'Partial hierarchy' },
      },
    ];
    const data = {
      [information]: {
        dataSetInformation: { classificationInformation: { 'common:classification': systems } },
      },
    };
    const form = read(data) as any;
    expect(
      form[information].dataSetInformation.classificationInformation['common:classification'],
    ).toEqual(systems);
    const saved = write('00000000-0000-4000-8000-000000000001', form) as any;
    expect(
      saved[`${kind}DataSet`][information].dataSetInformation.classificationInformation[
        'common:classification'
      ],
    ).toEqual([systems[0], { ...systems[1], 'common:class': [systems[1]['common:class']] }]);
    const schemaName = `${kind[0].toUpperCase()}${kind.slice(1)}Schema`;
    const schema = (schemas as any)[schemaName].shape[`${kind}DataSet`].shape[information].shape
      .dataSetInformation.shape.classificationInformation;
    const persisted =
      saved[`${kind}DataSet`][information].dataSetInformation.classificationInformation;
    expect(schema.parse(persisted)).toEqual(persisted);
  },
);

it.each(datasets)(
  'keeps one-level classes as arrays inside repeated %s systems',
  (kind, information, read, write) => {
    const name =
      kind === 'process' || kind === 'lifeCycleModel'
        ? 'ISIC Rev. 5'
        : kind === 'flow'
          ? 'CPC Ver. 3.0'
          : 'ILCD';
    const systems = [
      {
        '@name': name,
        'common:class': [{ '@level': '0', '@classId': 'A', '#text': 'Agriculture' }],
      },
    ];
    const form = read({
      [information]: {
        dataSetInformation: { classificationInformation: { 'common:classification': systems } },
      },
    });
    const saved = write('00000000-0000-4000-8000-000000000001', form) as any;
    expect(
      saved[`${kind}DataSet`][information].dataSetInformation.classificationInformation[
        'common:classification'
      ],
    ).toEqual(systems);
    const schemaName = `${kind[0].toUpperCase()}${kind.slice(1)}Schema`;
    const datasetSchema = (schemas as any)[schemaName].shape[`${kind}DataSet`];
    const classificationInformation =
      datasetSchema.shape[information].shape.dataSetInformation.shape.classificationInformation;
    const persisted =
      saved[`${kind}DataSet`][information].dataSetInformation.classificationInformation;
    expect(classificationInformation.parse(persisted)).toEqual({
      'common:classification': systems,
    });
  },
);
