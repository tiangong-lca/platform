import type { Classification } from '../general/data';
import { getClassificationSource } from './system';
import type { IlcdCanonicalDataType, ReferenceResourceId } from '../referenceResources/manifest';
import {
  getReferenceDataTypeName,
  getResolvedReferenceDataTypeName,
  reportReferenceResourceResolution,
  resolveReferenceResource,
} from '../referenceResources/resolver';
import {
  genClass,
  genClassWithLocalizedLabels,
  getCachedOrFetchClassificationFileData,
  type ILCDCategoryNode,
} from './util';

type ILCDFlowCategorizationDocument = {
  CategorySystem?: {
    categories?: {
      category?: ILCDCategoryNode[] | ILCDCategoryNode | null;
    } | null;
  } | null;
};

type ILCDClassificationGroup = {
  '@dataType'?: string;
  category?: ILCDCategoryNode[] | ILCDCategoryNode | null;
};

type ILCDClassificationDocument = {
  CategorySystem?: {
    categories?: ILCDClassificationGroup[] | ILCDClassificationGroup | null;
  } | null;
};

function normalizeFlowCategorizationNodes(
  category?: ILCDCategoryNode[] | ILCDCategoryNode | null,
): ILCDCategoryNode[] {
  if (Array.isArray(category)) {
    return category;
  }
  if (category) {
    return [category];
  }
  return [];
}

function normalizeClassificationGroups(
  categories?: ILCDClassificationGroup[] | ILCDClassificationGroup | null,
): ILCDClassificationGroup[] {
  if (Array.isArray(categories)) {
    return categories;
  }
  if (categories) {
    return [categories];
  }
  return [];
}

function filterClassificationData(nodes: Classification[], getValues: string[]): Classification[] {
  if (getValues.includes('all')) {
    return nodes;
  }

  const filters = new Set(getValues.filter(Boolean));
  if (filters.size === 0) {
    return [];
  }

  const filterNode = (node: Classification): Classification | null => {
    const filteredChildren = node.children
      .map((child) => filterNode(child))
      .filter((child): child is Classification => child !== null);
    const isMatched = filters.has(node.id) || filters.has(node.value) || filters.has(node.label);

    if (isMatched) {
      return node;
    }

    if (filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  };

  return nodes
    .map((node) => filterNode(node))
    .filter((node): node is Classification => node !== null);
}

async function getFlowCategorizationNodes(fileName: string): Promise<ILCDCategoryNode[]> {
  const document =
    await getCachedOrFetchClassificationFileData<ILCDFlowCategorizationDocument>(fileName);

  if (!document) {
    throw new Error(`Failed to load ILCD flow categorization from ${fileName}`);
  }

  return normalizeFlowCategorizationNodes(document.CategorySystem?.categories?.category);
}

async function getClassificationNodesByType(
  fileName: string,
  categoryType: string,
): Promise<ILCDCategoryNode[]> {
  const document =
    await getCachedOrFetchClassificationFileData<ILCDClassificationDocument>(fileName);

  if (!document) {
    throw new Error(`Failed to load ILCD classification data from ${fileName}`);
  }

  const group = normalizeClassificationGroups(document.CategorySystem?.categories).find(
    (item) => item['@dataType'] === categoryType,
  );

  return normalizeFlowCategorizationNodes(group?.category);
}

async function getLocalizedClassificationNodes(
  resourceId: ReferenceResourceId,
  categoryType: IlcdCanonicalDataType,
  language: string,
) {
  const resolution = resolveReferenceResource(resourceId, language);
  reportReferenceResourceResolution(resolution);
  if (resolution.status === 'missing' || !resolution.localizedAsset) {
    throw new Error(resolution.diagnostic);
  }

  const baseDataType = getReferenceDataTypeName(resolution.baseAsset, categoryType);
  const localizedDataType = getResolvedReferenceDataTypeName(resolution, categoryType);
  const baseNodes = await getClassificationNodesByType(resolution.baseAsset.fileName, baseDataType);
  const localizedNodes =
    resolution.localizedAsset.fileName === resolution.baseAsset.fileName &&
    localizedDataType === baseDataType
      ? baseNodes
      : await getClassificationNodesByType(resolution.localizedAsset.fileName, localizedDataType);

  return { baseNodes, localizedNodes };
}

export async function getILCDClassification(
  categoryType: string,
  lang: string,
  getValues: string[],
): Promise<{ data: Classification[]; success: boolean }> {
  try {
    const source = getClassificationSource(categoryType);
    const { baseNodes, localizedNodes } = await getLocalizedClassificationNodes(
      source.resourceId,
      source.dataType,
      lang,
    );
    const localizedData: Classification[] =
      localizedNodes === baseNodes
        ? genClass(baseNodes)
        : genClassWithLocalizedLabels(baseNodes, localizedNodes);
    const newDatas = filterClassificationData(localizedData, getValues);

    return Promise.resolve({
      data: newDatas,
      success: true,
    });
  } catch (e) {
    console.error(e);
    return Promise.resolve({
      data: [],
      success: false,
    });
  }
}

export async function getILCDFlowCategorization(
  lang: string,
  getValues: string[],
): Promise<{ data: Classification[]; success: boolean }> {
  try {
    const resolution = resolveReferenceResource('ilcd-flow-categorization', lang);
    reportReferenceResourceResolution(resolution);
    if (resolution.status === 'missing' || !resolution.localizedAsset) {
      throw new Error(resolution.diagnostic);
    }
    const baseNodes = await getFlowCategorizationNodes(resolution.baseAsset.fileName);
    const localizedNodes =
      resolution.localizedAsset.fileName === resolution.baseAsset.fileName
        ? baseNodes
        : await getFlowCategorizationNodes(resolution.localizedAsset.fileName);
    const localizedData: Classification[] =
      localizedNodes === baseNodes
        ? genClass(baseNodes)
        : genClassWithLocalizedLabels(baseNodes, localizedNodes);
    const newDatas = filterClassificationData(localizedData, getValues);

    return Promise.resolve({
      data: newDatas,
      success: true,
    });
  } catch (e) {
    console.error(e);
    return Promise.resolve({
      data: [],
      success: false,
    });
  }
}

export async function getILCDFlowCategorizationAll(lang: string) {
  const result = await getILCDClassification('Flow', lang, ['all']);
  const resultElementaryFlow = await getILCDFlowCategorization(lang, ['all']);

  return Promise.resolve({
    data: {
      category: result.data,
      categoryElementaryFlow: resultElementaryFlow.data,
    },
    success: result.success && resultElementaryFlow.success,
  });
}
