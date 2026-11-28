import { readFileSync } from 'node:fs';
import { getAnnualSupplyVolumeUnit } from '@/services/processes/annualSupplyVolumeUnit';
import { getProcessJsonOrderedForSave } from '@/services/processes/saveSerialization';
import { genProcessFromData } from '@/services/processes/util';

jest.mock('@/services/processes/annualSupplyVolumeUnit', () => ({
  getAnnualSupplyVolumeUnit: jest.fn(),
}));
jest.mock('@/services/flows/api', () => ({}));
jest.mock('@/services/flowproperties/api', () => ({}));
jest.mock('@/services/unitgroups/api', () => ({}));

it.each([
  {
    source: 't',
    zh: '吨',
    target: 'kg',
    amount: '40900',
    enResult: '40900000 kg/year',
    zhResult: '40900000 kg/年',
  },
  {
    source: 'kg',
    zh: 'kg',
    target: 'kg',
    amount: '40900000',
    enResult: '40900000 kg/year',
    zhResult: '40900000 kg/年',
  },
  {
    source: 't',
    zh: '吨',
    target: undefined,
    amount: '40900',
    enResult: '40900 t/year',
    zhResult: '40900 吨/年',
  },
])(
  'prepares $amount $source per year for explicit Save without changing untouched fields',
  async ({ source, zh, target, amount, enResult, zhResult }) => {
    const native = JSON.parse(
      readFileSync(
        'tests/data-workflows/fixtures/data/processes/002_check_data_success.json',
        'utf8',
      ),
    ).jsonOrdered.processDataSet;
    const bilingual = (english: string, chinese: string) => [
      { '@xml:lang': 'en', '#text': english },
      { '@xml:lang': 'zh', '#text': chinese },
    ];
    const treatment = native.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness;
    treatment.annualSupplyOrProductionVolume = bilingual(
      `${amount} ${source}/year`,
      `${amount} ${zh}/年`,
    );
    treatment.useAdviceForDataSet = bilingual('Retain the limitations.', '保留限制说明。');
    const quantitativeReference = native.processInformation.quantitativeReference;
    quantitativeReference.functionalUnitOrOther = bilingual(
      '1 kg of synthetic product',
      '1 kg 合成产品',
    );
    native.modellingAndValidation.LCIMethodAndAllocation.deviationsFromLCIMethodPrinciple =
      bilingual('Retain the method deviation.', '保留方法偏差。');
    const extension = { '@xmlns:example': 'urn:example', 'example:scope': { '#text': 'Scope' } };
    native['common:other'] = extension;
    const data = genProcessFromData(native);
    const before = structuredClone(data);
    jest.mocked(getAnnualSupplyVolumeUnit).mockResolvedValue(target);

    const result = (
      await getProcessJsonOrderedForSave('00000000-0000-4000-8000-000000000050', data)
    ).processDataSet;

    expect(data).toEqual(before);
    expect(getAnnualSupplyVolumeUnit).toHaveBeenLastCalledWith(data.exchanges?.exchange);
    expect(result.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness).toMatchObject({
      annualSupplyOrProductionVolume: bilingual(enResult, zhResult),
      useAdviceForDataSet: treatment.useAdviceForDataSet,
    });
    expect(result.processInformation.quantitativeReference.functionalUnitOrOther).toEqual(
      quantitativeReference.functionalUnitOrOther,
    );
    expect(
      result.modellingAndValidation.LCIMethodAndAllocation.deviationsFromLCIMethodPrinciple,
    ).toEqual(
      native.modellingAndValidation.LCIMethodAndAllocation.deviationsFromLCIMethodPrinciple,
    );
    expect(result['common:other']).toEqual(extension);
  },
);
