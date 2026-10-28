import { getFlowpropertyDetail } from '../flowproperties/api';
import { getFlowDetail } from '../flows/api';
import { getUnitGroupDetail } from '../unitgroups/api';
import { buildAnnualSupplyVolumeUnitLookupRows } from './annualSupplyOrProductionVolume';
import type { AnnualSupplyVolumeUnitLookupRow } from './annualSupplyOrProductionVolume';
import type { ProcessExchangeData } from './data';

const normalizeText = (value: unknown) =>
  typeof value === 'string' && value.trim() && value.trim() !== '-' ? value.trim() : '';

const toList = <T>(value: T | T[] | undefined): T[] =>
  Array.isArray(value) ? value : value ? [value] : [];

const isExactDetail = <T extends { id?: unknown; version?: unknown }>(
  result: { success?: boolean; data?: T | null },
  id: string,
  version: string,
): result is { success: true; data: T } =>
  result?.success === true && result.data?.id === id && result.data?.version === version;

/** Follow the three existing detail APIs without any latest-version fallback. */
export const getAnnualSupplyVolumeUnitRows = async (
  exchangeDataSource: ProcessExchangeData[],
): Promise<AnnualSupplyVolumeUnitLookupRow[]> => {
  const references = buildAnnualSupplyVolumeUnitLookupRows(
    exchangeDataSource.filter((exchange) => exchange.quantitativeReference === true),
  );
  return Promise.all(
    references.map(async (row) => {
      const id = normalizeText(row.referenceToFlowDataSetId);
      const version = normalizeText(row.referenceToFlowDataSetVersion);
      if (!id || !version) return row;
      try {
        const flow = await getFlowDetail(id, version);
        if (!isExactDetail(flow, id, version)) return row;
        const flowData = flow.data.json?.flowDataSet;
        const propertyInternalId =
          flowData?.flowInformation?.quantitativeReference?.referenceToReferenceFlowProperty;
        if (propertyInternalId === undefined) return row;
        const property = toList<any>(flowData?.flowProperties?.flowProperty).find(
          (item) => String(item?.['@dataSetInternalID']) === String(propertyInternalId),
        )?.referenceToFlowPropertyDataSet;
        const propertyId = normalizeText(property?.['@refObjectId']);
        const propertyVersion = normalizeText(property?.['@version']);
        if (!propertyId || !propertyVersion) return row;
        const flowProperty = await getFlowpropertyDetail(propertyId, propertyVersion);
        if (!isExactDetail(flowProperty, propertyId, propertyVersion)) return row;
        const groupReference =
          flowProperty.data.json?.flowPropertyDataSet?.flowPropertiesInformation
            ?.quantitativeReference?.referenceToReferenceUnitGroup;
        const groupId = normalizeText(groupReference?.['@refObjectId']);
        const groupVersion = normalizeText(groupReference?.['@version']);
        if (!groupId || !groupVersion) return row;
        const unitGroup = await getUnitGroupDetail(groupId, groupVersion);
        if (!isExactDetail(unitGroup, groupId, groupVersion)) return row;
        const groupData = unitGroup.data.json?.unitGroupDataSet;
        const unitInternalId =
          groupData?.unitGroupInformation?.quantitativeReference?.referenceToReferenceUnit;
        if (unitInternalId === undefined) return row;
        const unit = toList<any>(groupData?.units?.unit).find(
          (item) => String(item?.['@dataSetInternalID']) === String(unitInternalId),
        );
        const unitName = normalizeText(unit?.name);
        return unitName ? { ...row, refUnitRes: { refUnitName: unitName } } : row;
      } catch {
        return row;
      }
    }),
  );
};
