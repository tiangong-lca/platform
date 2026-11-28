import { jsonToList } from '../general/util';
import { getAnnualSupplyVolumeUnit } from './annualSupplyVolumeUnit';
import { genProcessJsonOrdered } from './util';

export const getProcessJsonOrderedForSave = async (id: string, data: any) => {
  const annual =
    data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
      ?.annualSupplyOrProductionVolume;
  const annualSupplyVolumeUnit = jsonToList(annual).some(
    (item: any) => typeof item?.['#text'] === 'string' && item['#text'].trim(),
  )
    ? await getAnnualSupplyVolumeUnit(jsonToList(data?.exchanges?.exchange))
    : undefined;
  return annualSupplyVolumeUnit
    ? genProcessJsonOrdered(id, data, { annualSupplyVolumeUnit })
    : genProcessJsonOrdered(id, data);
};
