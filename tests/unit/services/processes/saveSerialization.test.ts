import { readFileSync } from 'node:fs';
import { getProcessJsonOrderedForSave } from '@/services/processes/saveSerialization';
import { getAnnualSupplyVolumeUnitRows } from '@/services/processes/annualSupplyVolumeUnit';
import { genProcessFromData, genProcessJsonOrdered } from '@/services/processes/util';

jest.mock('@/services/processes/annualSupplyVolumeUnit', () => ({
  getAnnualSupplyVolumeUnitRows: jest.fn(),
}));
jest.mock('@/services/flows/api', () => ({}));
jest.mock('@/services/flowproperties/api', () => ({}));
jest.mock('@/services/unitgroups/api', () => ({}));

const processId = '00000000-0000-4000-8000-000000000050';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T00:00:00Z'));
});
afterEach(() => jest.useRealTimers());

it.each(['resolved', 'unavailable', 'absent'])(
  'preserves the complete Process serialization from the original save boundary when the annual unit is %s',
  async (condition) => {
    const source = JSON.parse(
      readFileSync(
        'tests/data-workflows/fixtures/data/processes/002_check_data_success.json',
        'utf8',
      ),
    ).jsonOrdered.processDataSet;
    const data: any = genProcessFromData(source);
    const reference = data.exchanges.exchange.find(
      (exchange: any) => exchange.quantitativeReference,
    )!;
    const flow = Array.isArray(reference.referenceToFlowDataSet)
      ? reference.referenceToFlowDataSet[0]
      : reference.referenceToFlowDataSet;
    reference.refUnitRes = { refUnitName: 'stale-cache-unit' };
    reference.functionalUnitOrOther = [
      { '@xml:lang': 'en', '#text': '1 MJ full reference product at the factory gate.' },
      { '@xml:lang': 'zh', '#text': '工厂大门处的1 MJ完整参考产品。' },
    ];
    const treatment = data.modellingAndValidation!.dataSourcesTreatmentAndRepresentativeness!;
    treatment.annualSupplyOrProductionVolume =
      condition === 'absent'
        ? []
        : [
            { '@xml:lang': 'en', '#text': '12.5 kg/year' },
            { '@xml:lang': 'zh', '#text': '12.5 kg/年' },
          ];
    treatment.useAdviceForDataSet = [
      { '@xml:lang': 'en', '#text': 'Use within the documented boundary.' },
      { '@xml:lang': 'zh', '#text': '在记录的边界内使用。' },
    ];
    const before = JSON.stringify(data);
    jest.mocked(getAnnualSupplyVolumeUnitRows).mockResolvedValue(
      condition === 'resolved'
        ? [
            {
              referenceToFlowDataSetId: flow?.['@refObjectId'],
              referenceToFlowDataSetVersion: flow?.['@version'],
              refUnitRes: { refUnitName: 'MJ' },
            },
          ]
        : [],
    );
    // The c85147a29 boundary called this same serializer with these exact options.
    // Compare every serialized field and its representation, including FU and sibling metadata.
    const expected =
      condition === 'resolved'
        ? genProcessJsonOrdered(processId, data, { annualSupplyVolumeUnit: 'MJ' })
        : genProcessJsonOrdered(processId, data);
    const actual = await getProcessJsonOrderedForSave(processId, data);
    expect(actual).toEqual(expected);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect(JSON.stringify(data)).toBe(before);
    expect(getAnnualSupplyVolumeUnitRows).toHaveBeenCalledTimes(condition === 'absent' ? 0 : 1);
  },
);
