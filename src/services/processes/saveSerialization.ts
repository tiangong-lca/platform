import { jsonToList } from '../general/util';
import { getAnnualSupplyVolumeUnitRows } from './annualSupplyVolumeUnit';
import { genProcessJsonOrdered } from './util';

export const getProcessJsonOrderedForSave = async (id: string, data: any) => {
  const annual =
    data?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
      ?.annualSupplyOrProductionVolume;
  if (
    !jsonToList(annual).some(
      (item: any) => typeof item?.['#text'] === 'string' && item['#text'].trim(),
    )
  ) {
    return genProcessJsonOrdered(id, data);
  }

  // A reference can change without visiting the annual field. Resolve its exact unit
  // again at the shared save boundary; display caches may contain a different version.
  const exchanges = jsonToList(data?.exchanges?.exchange);
  const reference = exchanges.find((exchange: any) => exchange?.quantitativeReference === true);
  const flow = jsonToList(reference?.referenceToFlowDataSet)[0];
  const flowId = typeof flow?.['@refObjectId'] === 'string' ? flow['@refObjectId'].trim() : '';
  const flowVersion = typeof flow?.['@version'] === 'string' ? flow['@version'].trim() : '';
  const rows = await getAnnualSupplyVolumeUnitRows(exchanges);
  const unit = rows.find(
    (row) =>
      flowId &&
      flowVersion &&
      row.referenceToFlowDataSetId === flowId &&
      row.referenceToFlowDataSetVersion === flowVersion,
  )?.refUnitRes?.refUnitName;
  return unit
    ? genProcessJsonOrdered(id, data, { annualSupplyVolumeUnit: unit })
    : genProcessJsonOrdered(id, data);
};
