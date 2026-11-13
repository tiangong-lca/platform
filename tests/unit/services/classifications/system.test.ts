import {
  getClassificationSource,
  usesBuiltInClassification,
} from '@/services/classifications/system';
import {
  classificationClassesToForm,
  classificationSystemsToJson,
} from '@/services/classifications/serialization';
import referenceManifest from '@/services/referenceResources/reference-resource-manifest.json';

it.each([
  ['Process', 'isic', 'Revision 5', 'ISIC Rev. 5'],
  ['LifeCycleModel', 'isic', 'Revision 5', 'ISIC Rev. 5'],
  ['Flow', 'cpc', 'Version 3.0', 'CPC Ver. 3.0'],
  ['Contact', 'ilcd-classification', 'ILCD Format 1.1', 'ILCD'],
])('binds the %s default name to the reviewed resource edition', (type, id, edition, name) => {
  const source = getClassificationSource(type);
  expect(source.resourceId).toBe(id);
  expect(source.name).toBe(name);
  expect(
    referenceManifest.resources.find((resource) => resource.resourceId === source.resourceId)
      ?.edition.value,
  ).toContain(edition);
});

it.each([
  { '@level': '0', '@classId': 'A', '#text': 'Alpha', 'common:other': { note: 'Retain' } },
  [
    { '@level': '0', '@classId': 'A', '#text': 'Alpha' },
    { '@level': '0', '@classId': 'B', '#text': 'Beta' },
  ],
  [{ '@level': '1', '@classId': 'A', '#text': 'Alpha' }],
  [{ '@level': '0', '@classId': 'A' }],
  [null],
])('preserves named imported classifications that the tree cannot retain: %p', (classes) => {
  const system = { '@name': 'ISIC Rev. 5', 'common:class': classes };
  expect(usesBuiltInClassification(system, 'Process')).toBe(false);
  expect(classificationClassesToForm(system, 'Process')).toBe(classes);
  expect(classificationSystemsToJson(system)).toEqual(system);
});

it.each([undefined, null, {}, []])(
  'opens an empty built-in system (%p) with the taxonomy editor',
  (classes) => {
    expect(
      usesBuiltInClassification({ '@name': 'ISIC Rev. 5', 'common:class': classes }, 'Process'),
    ).toBe(true);
  },
);

it('preserves an unnamed external system instead of relabeling it as the local resource', () => {
  const system = {
    '@classes': 'https://example.org/external.xml',
    'common:class': { '@level': '3', '@classId': 'x', '#text': 'External' },
  };
  expect(usesBuiltInClassification(system, 'Contact')).toBe(false);
  expect(classificationClassesToForm(system, 'Contact')).toBe(system['common:class']);
  expect(classificationSystemsToJson(system)).toEqual(system);
});

it('normalizes a custom singleton class within repeated systems without discarding identity or content', () => {
  const system = {
    '@name': 'Custom',
    '@classes': 'https://example.org/custom.xml',
    'common:class': { '@level': '3', '@classId': 'x', '#text': 'External' },
  };
  expect(classificationSystemsToJson([system])).toEqual([
    { ...system, 'common:class': [system['common:class']] },
  ]);
});

it.each([
  [
    'Process',
    'https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/ISIC_Rev_5_english_structure.csv',
  ],
  [
    'LifeCycleModel',
    'https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/ISIC_Rev_5_english_structure.csv',
  ],
  [
    'Flow',
    'https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/CPC_Ver_3.0_Structure_30Jun2025.csv',
  ],
  [
    'Contact',
    'https://eplca.jrc.ec.europa.eu/permalink/EF3_1/EF-v3.1.zip#stylesheets/ILCDClassification_Reference.xml',
  ],
])('uses the reviewed, portable classification URI for %s', (type, uri) => {
  const source = getClassificationSource(type);
  expect(source.uri).toBe(uri);
  const resource = referenceManifest.resources.find(
    (item) => item.resourceId === source.resourceId,
  )!;
  expect(resource.overlays.en.evidence.sources).toContain(source.uri);
  expect(usesBuiltInClassification({ '@name': source.name, '@classes': uri }, type)).toBe(true);
  expect(usesBuiltInClassification({ '@classes': uri }, type)).toBe(true);
  expect(usesBuiltInClassification({ '@name': 'Custom', '@classes': uri }, type)).toBe(false);
});

it('does not invent a classification URI when the manifest has no source URL', () => {
  const manifest = jest.requireActual('@/services/referenceResources/manifest');
  const provenance = manifest.getReferenceResourceDefinition('ilcd-classification').provenance;
  const original = provenance.officialUrl;
  try {
    provenance.officialUrl = null;
    expect(getClassificationSource('Contact').uri).toBeNull();
  } finally {
    provenance.officialUrl = original;
  }
});

it.each(['common:class', 'common:category'])(
  'clears singleton and repeated %s selections without dropping identities',
  (key) => {
    const { clearClassificationSelection } = require('@/services/classifications/serialization');
    const first = {
      '@name': 'First',
      '@classes': 'https://example.org/a',
      [key]: { id: ['1'], value: ['One'] },
    };
    const second = {
      '@name': 'Second',
      '@classes': 'https://example.org/b',
      [key]: { id: ['2'], value: ['Two'] },
    };
    expect(clearClassificationSelection(first, key)).toEqual({ ...first, [key]: null });
    expect(clearClassificationSelection([first, second], key)).toEqual([
      { ...first, [key]: null },
      { ...second, [key]: null },
    ]);
    expect(first[key]).toEqual({ id: ['1'], value: ['One'] });
    expect(clearClassificationSelection(undefined, key)).toBeUndefined();
    expect(clearClassificationSelection(null, key)).toBeNull();
    expect(clearClassificationSelection([], key)).toEqual([]);
  },
);
