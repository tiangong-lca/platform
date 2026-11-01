import { getValidatorMessage } from '@/locales/runtimeCatalogRegistry';
import { getReferenceUnitGroups } from '@/services/flowproperties/api';
import { getFlowProperties } from '@/services/flows/api';
import { getReferenceUnits } from '@/services/unitgroups/api';
import {
  CANONICAL_CONTENT_LANGUAGE,
  normalizeSupportedContentLanguage,
  resolveContentLanguage,
  resolveContentLanguages,
  TRANSLATION_SOURCE_CONTENT_LANGUAGE,
} from './contentLanguageRegistry';
import { Classification } from './data';
import { CANONICAL_SOURCE_APP_LOCALE, normalizeSupportedAppLocale } from './localeRegistry';

export type RefVersionItem = {
  key: string;
  id: string;
  type: string;
  currentVersion: string;
  newVersion: string;
  description?: any[];
  newDescription?: any[];
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toValidUuid = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalizedValue = value.trim();
  if (!UUID_REGEX.test(normalizedValue)) {
    return undefined;
  }
  return normalizedValue;
};

export function getImportedId(importItem: any): string | undefined {
  if (!importItem || typeof importItem !== 'object') {
    return undefined;
  }

  const candidateIds: unknown[] = [
    importItem?.id,
    importItem?.contactDataSet?.contactInformation?.dataSetInformation?.['common:UUID'],
    importItem?.flowDataSet?.flowInformation?.dataSetInformation?.['common:UUID'],
    importItem?.processDataSet?.processInformation?.dataSetInformation?.['common:UUID'],
    importItem?.sourceDataSet?.sourceInformation?.dataSetInformation?.['common:UUID'],
    importItem?.flowPropertyDataSet?.flowPropertiesInformation?.dataSetInformation?.['common:UUID'],
    importItem?.unitGroupDataSet?.unitGroupInformation?.dataSetInformation?.['common:UUID'],
    importItem?.lifeCycleModelDataSet?.lifeCycleModelInformation?.dataSetInformation?.[
      'common:UUID'
    ],
  ];

  for (const candidateId of candidateIds) {
    const validId = toValidUuid(candidateId);
    if (validId) {
      return validId;
    }
  }

  return undefined;
}

export function isSupabaseDuplicateKeyError(error: any): boolean {
  return error?.code === '23505';
}

export function isDataUnderReview(stateCode?: number | null): boolean {
  return typeof stateCode === 'number' && stateCode >= 20 && stateCode < 100;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]';
};

const isRemovableEmptyValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '' || value === 'undefined';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
};

const shouldPreserveEmptyObjectAtPath = (path: Array<string | number>): boolean => {
  const stringSegments = path.filter((segment): segment is string => typeof segment === 'string');

  if (!stringSegments.includes('connections') || !stringSegments.includes('outputExchange')) {
    return false;
  }

  return stringSegments.includes('downstreamProcess');
};

const removeEmptyObjectsInternal = (value: any, path: Array<string | number>): any => {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => removeEmptyObjectsInternal(item, [...path, index]))
      .filter((item, index) => {
        if (
          isPlainObject(item) &&
          Object.keys(item).length === 0 &&
          shouldPreserveEmptyObjectAtPath([...path, index])
        ) {
          return true;
        }

        return !isRemovableEmptyValue(item);
      });
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).reduce(
    (acc, [key, nestedValue]) => {
      const cleanedValue = removeEmptyObjectsInternal(nestedValue, [...path, key]);

      if (
        isPlainObject(cleanedValue) &&
        Object.keys(cleanedValue).length === 0 &&
        shouldPreserveEmptyObjectAtPath([...path, key])
      ) {
        acc[key] = cleanedValue;
        return acc;
      }

      if (!isRemovableEmptyValue(cleanedValue)) {
        acc[key] = cleanedValue;
      }

      return acc;
    },
    {} as Record<string, any>,
  );
};

export function removeEmptyObjects(obj: any): any {
  return removeEmptyObjectsInternal(obj, []);
}

// export function percentStringToNumber(str: string): number | null {
//   if (typeof str !== 'string') return null;
//   const match = str.match(/^(-?\d+(\.\d+)?)%$/);
//   if (!match) return null;
//   return parseFloat(match[1]) / 100;
// }

// export function comparePercentDesc(
//   a: string | number | null | undefined,
//   b: string | number | null | undefined,
// ): number {
//   const toComparable = (value: typeof a): number | null => {
//     if (value === null || value === undefined) {
//       return null;
//     }
//     if (typeof value === 'number') {
//       return Number.isFinite(value) ? value : null;
//     }
//     const trimmed = String(value).trim();
//     if (!trimmed) {
//       return null;
//     }
//     const percent = percentStringToNumber(trimmed);
//     if (percent !== null) {
//       return percent;
//     }
//     const parsed = Number(trimmed);
//     return Number.isFinite(parsed) ? parsed : null;
//   };

//   const numA = toComparable(a);
//   const numB = toComparable(b);

//   if (numA === null && numB === null) {
//     return 0;
//   }
//   if (numA === null) {
//     return 1;
//   }
//   if (numB === null) {
//     return -1;
//   }

//   const absA = Math.abs(numA);
//   const absB = Math.abs(numB);

//   if (absA !== absB) {
//     return absB - absA;
//   }

//   return numB - numA;
// }

export async function getUnitData(idType: string, data: any) {
  return new Promise((resolve) => {
    if (idType === 'flow') {
      const flowPropertiesParams = data?.map((item: any) => {
        return {
          id: item?.referenceToFlowDataSetId,
          version: item?.referenceToFlowDataSetVersion,
        };
      });
      getFlowProperties(flowPropertiesParams).then((flowPropertiesRes: any) => {
        const params = flowPropertiesRes?.data?.map((item: any) => {
          return {
            id: item?.refFlowPropertytId,
            version: item?.version,
          };
        });
        getReferenceUnitGroups(params).then((unitGroupsRes: any) => {
          const unitParams = unitGroupsRes?.data?.map((item: any) => {
            return {
              id: item?.refUnitGroupId,
              version: item?.refUnitGroupVersion,
            };
          });
          getReferenceUnits(unitParams).then((unitsRes: any) => {
            data.forEach((item: any) => {
              let flowProperty = flowPropertiesRes?.data.find(
                (flowProperty: any) =>
                  flowProperty?.id === item?.referenceToFlowDataSetId &&
                  flowProperty?.version === item?.referenceToFlowDataSetVersion,
              );
              if (!flowProperty) {
                flowProperty = flowPropertiesRes?.data.find(
                  (flowProperty: any) => flowProperty?.id === item?.referenceToFlowDataSetId,
                );
              }
              item['typeOfDataSet'] = flowProperty?.typeOfDataSet ?? '-';

              let unitGroup = unitGroupsRes?.data.find(
                (group: any) =>
                  group?.id === flowProperty?.refFlowPropertytId &&
                  group?.version === flowProperty?.version,
              );
              if (!unitGroup) {
                unitGroup = unitGroupsRes?.data.find(
                  (group: any) => group?.id === flowProperty?.refFlowPropertytId,
                );
              }

              if (unitGroup) {
                let unit = unitsRes?.data.find(
                  (unit: any) =>
                    unit?.id === unitGroup?.refUnitGroupId && unit?.version === unitGroup?.version,
                );
                if (!unit) {
                  unit = unitsRes?.data.find((unit: any) => unit?.id === unitGroup?.refUnitGroupId);
                }

                if (unit) {
                  item['refUnitRes'] = unit;
                }
              }
            });
            resolve(data);
          });
        });
      });
    }

    if (idType === 'unitgroup') {
      const unitParams = data?.map((item: any) => {
        return {
          id: item?.refUnitGroupId,
          version: item?.refUnitGroupVersion,
        };
      });
      getReferenceUnits(unitParams).then((unitsRes: any) => {
        data.forEach((item: any) => {
          let unit = unitsRes?.data?.find(
            (e: any) => e?.id === item?.refUnitGroupId && e?.version === item?.version,
          );
          if (!unit) {
            unit = unitsRes?.data?.find((e: any) => e?.id === item?.refUnitGroupId);
          }
          if (unit) {
            item['refUnitRes'] = unit;
          }
        });
        resolve(data);
      });
    }
    if (idType === 'flowproperty') {
      const params = data?.map((item: any) => {
        return {
          id: item?.referenceToFlowPropertyDataSetId,
          version: item?.referenceToFlowPropertyDataSetVersion,
        };
      });
      getReferenceUnitGroups(params).then((unitGroupsRes: any) => {
        const unitParams = unitGroupsRes?.data?.map((item: any) => {
          return {
            id: item?.refUnitGroupId,
            version: item?.refUnitGroupVersion,
          };
        });
        getReferenceUnits(unitParams).then((unitsRes: any) => {
          data.forEach((item: any) => {
            let unitGroup = unitGroupsRes?.data.find(
              (group: any) =>
                group?.id === item?.referenceToFlowPropertyDataSetId &&
                group?.version === item?.referenceToFlowPropertyDataSetVersion,
            );
            if (!unitGroup) {
              unitGroup = unitGroupsRes?.data.find(
                (group: any) => group?.id === item?.referenceToFlowPropertyDataSetId,
              );
            }
            if (unitGroup) {
              let unit = unitsRes?.data.find(
                (unit: any) =>
                  unit?.id === unitGroup?.refUnitGroupId && unit?.version === unitGroup?.version,
              );
              if (!unit) {
                unit = unitsRes?.data.find((unit: any) => unit?.id === unitGroup?.refUnitGroupId);
              }
              if (unit) {
                item['refUnitRes'] = unit;
              }
            }
          });
          resolve(data);
        });
      });
    }
  });
}

export function genClassStr(
  data: string[],
  index: number,
  classification: Classification[],
): string {
  const c = classification?.find((i) => i?.value === data?.[index]);
  if (c) {
    if (data.length > index + 1) {
      return c?.label + ' > ' + genClassStr(data, index + 1, c?.children);
    } else {
      return c?.label;
    }
  } else {
    if (data?.[index]) {
      if (data.length > index + 1) {
        return data?.[index] + ' > ' + genClassStr(data, index + 1, []);
      } else {
        return data?.[index];
      }
    }
  }
  return '';
}

export function genClassIdList(
  data: any[],
  index: number,
  classification: Classification[],
): string[] {
  const c = classification?.find((i) => i?.value === data?.[index]);
  if (c) {
    const newId = c?.id ?? '';
    if (data.length > index + 1) {
      return [newId, ...genClassIdList(data, index + 1, c?.children)];
    }
    return [newId];
  } else {
    const newId = '';
    if (data.length > index + 1) {
      return [newId, ...genClassIdList(data, index + 1, [])];
    }
    return [newId];
  }
}

export function genClassJsonZH(data: any[], index: number, classification: any[]): any {
  const d = data?.find((i) => i?.['@level'] === index.toString());
  const sourceId = d?.['@classId'] ?? d?.['@catId'];
  const c = classification?.find((item) =>
    sourceId ? item?.id === sourceId : item?.value === d?.['#text'],
  );
  if (c) {
    const newC = {
      ...d,
      '@level': index.toString(),
      '#text': c?.label ?? c?.['#text'],
    };
    if (data.length > index + 1) {
      return [newC, ...genClassJsonZH(data, index + 1, c?.children)];
    }
    return [newC];
  } else {
    if (d) {
      const newD = {
        ...d,
        '@level': index.toString(),
        '#text': d?.['#text'],
      };
      return [newD, ...genClassJsonZH(data, index + 1, [])];
    } else {
      return [];
    }
  }
}

export function getLang(locale: string) {
  return resolveContentLanguage(locale);
}

const getUsableLangTextValue = (item: any) => {
  const value = item?.['#text'];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && (!value.trim() || value.trim() === '-')) {
    return undefined;
  }
  return value;
};

const normalizeExactContentLanguage = (lang: unknown) => {
  if (typeof lang !== 'string') {
    return '';
  }

  return (
    normalizeSupportedContentLanguage(lang) ??
    lang.trim().toLowerCase().replace('_', '-').split('-')[0]
  );
};

export function getExactLangText(langTexts: any, lang: string) {
  if (Array.isArray(langTexts)) {
    const normalizedLanguage = normalizeExactContentLanguage(lang);
    const candidate = langTexts.find(
      (item) =>
        String(item?.['@xml:lang'] ?? '')
          .trim()
          .toLowerCase() === normalizedLanguage && getUsableLangTextValue(item) !== undefined,
    );
    return getUsableLangTextValue(candidate) ?? '-';
  }

  if (langTexts && typeof langTexts === 'object') {
    const itemLanguage = String(langTexts['@xml:lang'] ?? '')
      .trim()
      .toLowerCase();
    if (itemLanguage && itemLanguage !== normalizeExactContentLanguage(lang)) {
      return '-';
    }
    return getUsableLangTextValue(langTexts) ?? '-';
  }

  return '-';
}

export function getLangText(langTexts: any, lang: string) {
  let text = '-';
  try {
    for (const language of resolveContentLanguages(lang)) {
      const candidateText = getExactLangText(langTexts, language);
      if (candidateText !== '-') {
        text = candidateText;
        return text;
      }
    }
  } catch (e) {
    console.log(e);
  }
  return text;
}

export function getLangJson(langTexts: any) {
  if (!langTexts) {
    return {};
  }
  if (Array.isArray(langTexts)) {
    const newLangTexts = langTexts.filter((item) => !!item);
    if (newLangTexts.length === 1) {
      return newLangTexts[0];
    } else if (newLangTexts.length > 1) {
      return newLangTexts;
    }
  } else {
    return langTexts;
  }
}

export function getLangList(langTexts: any) {
  if (!langTexts) {
    return [];
  }
  if (Array.isArray(langTexts)) {
    return langTexts;
  } else {
    return [langTexts];
  }
}

export type LangValidationIssueCode = 'missing_en' | 'invalid_en';

export type LangNormalizationIntent = 'save' | 'validation';

export type LangValidationIssue = {
  path: string;
  code: LangValidationIssueCode;
  message: string;
};

type LangValidationOptions = {
  intent?: LangNormalizationIntent;
  translateZhToEn?: (text: string, path: string) => Promise<string | undefined>;
};

export type LangNormalizationResult = {
  payload: any;
  issues: LangValidationIssue[];
  supplementedEnglishPlaceholderPaths: string[];
  translatedPaths: string[];
};

const LANG_KEY = '@xml:lang';
const TEXT_KEY = '#text';
type NormalizedLangEntry = {
  [LANG_KEY]: string;
  [TEXT_KEY]: string | undefined;
};
const NON_ENGLISH_SCRIPT_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Thai}]/u;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isLangTextEntry = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && Object.prototype.hasOwnProperty.call(value, LANG_KEY);

const normalizeLangCode = (lang: unknown): string => {
  if (typeof lang !== 'string') return '';
  return lang.trim().toLowerCase();
};

const isEnglishLangCode = (langCode: string): boolean => langCode === CANONICAL_CONTENT_LANGUAGE;

const isChineseLangCode = (langCode: string): boolean =>
  langCode === TRANSLATION_SOURCE_CONTENT_LANGUAGE ||
  langCode.startsWith(`${TRANSLATION_SOURCE_CONTENT_LANGUAGE}-`);

const normalizeLangTextValue = (text: unknown): string => {
  if (typeof text === 'string') return text.trim();
  if (text === null || text === undefined) return '';
  return String(text).trim();
};

const hasDisallowedScriptsForEnglish = (text: string): boolean =>
  NON_ENGLISH_SCRIPT_REGEX.test(text);

const pushUniquePath = (paths: string[], path: string) => {
  if (!path || paths.includes(path)) {
    return;
  }
  paths.push(path);
};

async function normalizeLangEntries(
  langEntries: any[],
  path: string,
  issues: LangValidationIssue[],
  options: LangValidationOptions,
  translationCache: Map<string, string | undefined>,
  metadata: {
    supplementedEnglishPlaceholderPaths: string[];
    translatedPaths: string[];
  },
) {
  const getValidEnglishTranslation = async (
    sourceText: string | undefined,
  ): Promise<string | undefined> => {
    const normalizedSourceText = normalizeLangTextValue(sourceText);
    if (!normalizedSourceText || !options.translateZhToEn) {
      return undefined;
    }

    let translatedEnglish: string | undefined;
    if (translationCache.has(normalizedSourceText)) {
      translatedEnglish = translationCache.get(normalizedSourceText);
    } else {
      translatedEnglish = await options.translateZhToEn(normalizedSourceText, path);
      translationCache.set(normalizedSourceText, translatedEnglish);
    }

    const normalizedTranslation = normalizeLangTextValue(translatedEnglish);
    if (!normalizedTranslation || hasDisallowedScriptsForEnglish(normalizedTranslation)) {
      return undefined;
    }
    return normalizedTranslation;
  };

  const rawLangCodes: string[] = [];
  const normalizedMap = new Map<string, string>();
  const orderedLangCodes: string[] = [];

  for (const entry of langEntries) {
    if (!isLangTextEntry(entry)) {
      continue;
    }
    const langCode = normalizeLangCode(entry[LANG_KEY]);
    const textValue = normalizeLangTextValue(entry[TEXT_KEY]);
    if (!langCode) {
      continue;
    }
    if (!rawLangCodes.includes(langCode)) {
      rawLangCodes.push(langCode);
    }
    if (!textValue) {
      continue;
    }
    if (!orderedLangCodes.includes(langCode)) {
      orderedLangCodes.push(langCode);
    }
    normalizedMap.set(langCode, textValue);
  }

  let normalizedList: NormalizedLangEntry[] = orderedLangCodes.map((langCode) => ({
    [LANG_KEY]: langCode,
    [TEXT_KEY]: normalizedMap.get(langCode),
  }));

  const englishEntry = normalizedList.find((entry) => isEnglishLangCode(String(entry[LANG_KEY])));
  const chineseSourceLangCode = orderedLangCodes.find((langCode) => isChineseLangCode(langCode));
  const chineseEntry = chineseSourceLangCode
    ? normalizedList.find((entry) => entry[LANG_KEY] === chineseSourceLangCode)
    : undefined;
  const hasOnlyChineseMeaningfulTexts =
    orderedLangCodes.length > 0 &&
    orderedLangCodes.every((langCode) => isChineseLangCode(langCode));
  const rawLanguagesSupportValidationPlaceholder =
    rawLangCodes.length > 0 &&
    rawLangCodes.every((langCode) => isChineseLangCode(langCode) || isEnglishLangCode(langCode));
  const shouldSupplementEnglishPlaceholder =
    (options.intent ?? 'save') === 'validation' &&
    hasOnlyChineseMeaningfulTexts &&
    rawLanguagesSupportValidationPlaceholder &&
    !englishEntry;

  if (!englishEntry) {
    const translatedEnglish = await getValidEnglishTranslation(chineseEntry?.[TEXT_KEY]);
    if (translatedEnglish) {
      normalizedList = [
        { [LANG_KEY]: CANONICAL_CONTENT_LANGUAGE, [TEXT_KEY]: translatedEnglish },
        ...normalizedList,
      ];
      pushUniquePath(metadata.translatedPaths, path);
    } else if (shouldSupplementEnglishPlaceholder) {
      const placeholderEntry: NormalizedLangEntry = {
        [LANG_KEY]: CANONICAL_CONTENT_LANGUAGE,
        [TEXT_KEY]: undefined,
      };
      if (!rawLangCodes.includes(CANONICAL_CONTENT_LANGUAGE)) {
        normalizedList = [...normalizedList, placeholderEntry];
      } else {
        const entriesByLang = new Map<string, NormalizedLangEntry>();
        normalizedList.forEach((entry) => {
          entriesByLang.set(String(entry[LANG_KEY]), entry);
        });
        entriesByLang.set(CANONICAL_CONTENT_LANGUAGE, placeholderEntry);
        const nextList: NormalizedLangEntry[] = [];
        const consumedLangs = new Set<string>();
        rawLangCodes.forEach((langCode) => {
          const entry = entriesByLang.get(langCode);
          if (entry && !consumedLangs.has(langCode)) {
            nextList.push(entry);
            consumedLangs.add(langCode);
          }
        });
        normalizedList = nextList;
      }
      pushUniquePath(metadata.supplementedEnglishPlaceholderPaths, path);
    } else if (normalizedList.length > 0) {
      issues.push({
        path,
        code: 'missing_en',
        message: `Missing English content at "${path}".`,
      });
    }
  } else if (hasDisallowedScriptsForEnglish(normalizeLangTextValue(englishEntry[TEXT_KEY]))) {
    const translatedFromZh = await getValidEnglishTranslation(chineseEntry?.[TEXT_KEY]);
    const translatedFromEn = translatedFromZh
      ? translatedFromZh
      : await getValidEnglishTranslation(englishEntry[TEXT_KEY]);
    if (translatedFromEn) {
      englishEntry[TEXT_KEY] = translatedFromEn;
      pushUniquePath(metadata.translatedPaths, path);
    } else {
      issues.push({
        path,
        code: 'invalid_en',
        message: `English content at "${path}" contains non-English scripts.`,
      });
    }
  }

  return getLangJson(normalizedList) ?? {};
}

function buildPath(parentPath: string, key: string | number) {
  if (typeof key === 'number') {
    return `${parentPath}[${key}]`;
  }
  if (!parentPath) {
    return key;
  }
  return `${parentPath}.${key}`;
}

async function normalizeLangNode(
  value: any,
  path: string,
  issues: LangValidationIssue[],
  options: LangValidationOptions,
  translationCache: Map<string, string | undefined>,
  metadata: {
    supplementedEnglishPlaceholderPaths: string[];
    translatedPaths: string[];
  },
): Promise<any> {
  // The predecessor is a historical reference snapshot, including its supplied languages.
  if (
    path ===
    'processDataSet.administrativeInformation.publicationAndOwnership.common:referenceToPrecedingDataSetVersion'
  ) {
    return value;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const looksLikeLangList = value.some((item) => isLangTextEntry(item));
    if (looksLikeLangList) {
      return normalizeLangEntries(value, path, issues, options, translationCache, metadata);
    }
    const mapped = await Promise.all(
      value.map((item, index) =>
        normalizeLangNode(
          item,
          buildPath(path, index),
          issues,
          options,
          translationCache,
          metadata,
        ),
      ),
    );
    return mapped;
  }

  if (isLangTextEntry(value)) {
    return normalizeLangEntries([value], path, issues, options, translationCache, metadata);
  }

  if (isObject(value)) {
    const entries = Object.entries(value);
    const normalizedEntries = await Promise.all(
      entries.map(async ([key, nodeValue]) => {
        const normalizedValue = await normalizeLangNode(
          nodeValue,
          buildPath(path, key),
          issues,
          options,
          translationCache,
          metadata,
        );
        return [key, normalizedValue] as const;
      }),
    );
    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

export async function normalizeLangPayloadBeforeSave(
  payload: any,
  options: LangValidationOptions = {},
): Promise<LangNormalizationResult> {
  const issues: LangValidationIssue[] = [];
  const translationCache = new Map<string, string | undefined>();
  const metadata = {
    supplementedEnglishPlaceholderPaths: [] as string[],
    translatedPaths: [] as string[],
  };
  const normalizedPayload = await normalizeLangNode(
    payload,
    '',
    issues,
    options,
    translationCache,
    metadata,
  );
  return {
    payload: normalizedPayload,
    issues,
    supplementedEnglishPlaceholderPaths: metadata.supplementedEnglishPlaceholderPaths,
    translatedPaths: metadata.translatedPaths,
  };
}

const getLangValidationLocaleMessages = (locale: string) => {
  const normalizedLocale = normalizeSupportedAppLocale(locale) ?? CANONICAL_SOURCE_APP_LOCALE;

  return {
    locale: normalizedLocale,
    missingEnglish: getValidatorMessage(
      normalizedLocale,
      'validator.langValidation.missingEnglish',
    ),
    missingEnglishMore: getValidatorMessage(
      normalizedLocale,
      'validator.langValidation.missingEnglishMore',
    ),
    root: getValidatorMessage(normalizedLocale, 'validator.langValidation.root'),
  };
};

const formatLangValidationTemplate = (
  template: string,
  values: Record<string, string | number>,
  locale: string,
) => {
  const pluralizedTemplate = template.replace(
    /\{([A-Za-z][A-Za-z0-9_]*),\s*plural,\s*(?:one\s*\{([^{}]*)\}\s*)?other\s*\{([^{}]*)\}\s*\}/gu,
    (match, key: string, oneCase: string | undefined, otherCase: string) => {
      const numericValue = Number(values[key]);
      if (!Number.isFinite(numericValue)) {
        return match;
      }

      const pluralCategory = new Intl.PluralRules(locale).select(numericValue);
      const selectedCase = pluralCategory === 'one' && oneCase ? oneCase : otherCase;
      const formattedNumber = new Intl.NumberFormat(locale).format(numericValue);
      return selectedCase.replace(/#/gu, formattedNumber);
    },
  );

  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    pluralizedTemplate,
  );
};

const getLangValidationFieldName = (path: string, rootLabel: string) => {
  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    return rootLabel;
  }

  const lastPathSegment = normalizedPath.split('.').pop() ?? normalizedPath;
  const fieldName = lastPathSegment.replace(/\[\d+\]$/u, '');
  return fieldName || rootLabel;
};

export function getLangValidationErrorMessage(
  issues: LangValidationIssue[],
  maxPathCount = 5,
  locale: string = CANONICAL_SOURCE_APP_LOCALE,
) {
  if (!issues || issues.length === 0) {
    return '';
  }

  const localeMessages = getLangValidationLocaleMessages(locale);
  const uniqueFields = Array.from(
    new Set(
      issues.map((issue) => getLangValidationFieldName(issue.path || '', localeMessages.root)),
    ),
  );
  const visibleFields = uniqueFields.slice(0, maxPathCount).join(',');
  const extraCount = uniqueFields.length - Math.min(uniqueFields.length, maxPathCount);

  if (extraCount > 0) {
    return formatLangValidationTemplate(
      localeMessages.missingEnglishMore,
      {
        fields: visibleFields,
        count: extraCount,
      },
      localeMessages.locale,
    );
  }

  return formatLangValidationTemplate(
    localeMessages.missingEnglish,
    {
      fields: visibleFields,
    },
    localeMessages.locale,
  );
}

export function mergeLangArrays(...arrays: any[][]): any[] {
  if (arrays.length === 0) return [];

  const langSets = arrays.map((arr) => new Set(arr.map((item) => item['@xml:lang'])));

  const commonLangs = [...langSets[0]].filter((lang) => langSets.every((set) => set.has(lang)));

  return commonLangs.map((lang) => {
    const text = arrays
      .map((arr) => arr.find((item) => item['@xml:lang'] === lang)?.['#text'] ?? '')
      .join('');
    return { '@xml:lang': lang, '#text': text };
  });
}

export function classificationToString(classifications: any[]) {
  let classificationStr = '';
  try {
    if (classifications && classifications.length > 0) {
      for (let i = 0; i < classifications.length; i++) {
        const filterList = classifications.find((c) => c['@level'] === i.toString());
        classificationStr += filterList?.['#text'] + ' > ';
      }
      classificationStr = classificationStr.slice(0, -3);
    } else {
      classificationStr = '-';
    }
  } catch (e) {
    console.log(e);
  }
  return classificationStr;
}

export function classificationToStringList(classifications: any, elementaryFlow: boolean = false) {
  let idStrList = [];
  let valueStrList = [];
  try {
    if (Array.isArray(classifications)) {
      for (let i = 0; i < classifications.length; i++) {
        const filterList = classifications.find((c) => c['@level'] === i.toString());
        if (filterList) {
          if (elementaryFlow) {
            idStrList.push(filterList?.['@catId']);
            valueStrList.push(filterList?.['#text']);
          } else {
            idStrList.push(filterList?.['@classId']);
            valueStrList.push(filterList?.['#text']);
          }
        }
      }
    } else {
      if (elementaryFlow) {
        idStrList = [classifications?.['@catId']];
        valueStrList = [classifications?.['#text']];
      } else {
        idStrList = [classifications?.['@classId']];
        valueStrList = [classifications?.['#text']];
      }
    }
  } catch (e) {
    console.log(e);
  }
  return { id: idStrList, value: valueStrList };
}

export function classificationToJsonList(classifications: any, elementaryFlow: boolean = false) {
  let common_class = {};
  if (
    classifications &&
    classifications?.value &&
    Array.isArray(classifications?.value) &&
    classifications?.value.length > 0
  ) {
    if (classifications.value.length === 1) {
      if (elementaryFlow) {
        common_class = {
          '@level': '0',
          '@catId': classifications?.id?.[0] ?? '',
          '#text': classifications.value[0],
        };
      } else {
        common_class = {
          '@level': '0',
          '@classId': classifications?.id?.[0] ?? '',
          '#text': classifications.value[0],
        };
      }
    } else {
      common_class = classifications?.value.map((value: any, index: number) => {
        if (elementaryFlow) {
          return {
            '@level': index.toString(),
            '@catId': classifications?.id?.[index] ?? '',
            '#text': value,
          };
        } else {
          return {
            '@level': index.toString(),
            '@classId': classifications?.id?.[index] ?? '',
            '#text': value,
          };
        }
      });
    }
  } else if (classifications && Array.isArray(classifications)) {
    return removeEmptyObjects(classifications);
  }
  return removeEmptyObjects(common_class);
}

// export function classificationToJson(classifications: any) {
//   let classificationJson = {};
//   if (Array.isArray(classifications)) {
//     const filterList0 = classifications.filter((i) => i['@level'].toString() === '0');
//     if (filterList0.length > 0) {
//       classificationJson = {
//         '@level_0': filterList0[0]?.['#text'],
//         '@catId_0': filterList0[0]?.['@catId'],
//       };
//       const filterList1 = classifications.filter((i) => i['@level'].toString() === '1');
//       if (filterList1.length > 0) {
//         classificationJson = {
//           ...classificationJson,
//           '@level_1': filterList1[0]?.['#text'],
//           '@catId_1': filterList1[0]?.['@catId'],
//         };
//         const filterList2 = classifications.filter((i) => i['@level'].toString() === '2');
//         if (filterList2.length > 0) {
//           classificationJson = {
//             ...classificationJson,
//             '@level_2': filterList2[0]?.['#text'],
//             '@catId_2': filterList2[0]?.['@catId'],
//           };
//         }
//       }
//     }
//   } else {
//     classificationJson = {
//       '@level_0': classifications?.['#text'],
//       '@catId_0': classifications?.['@catId'],
//     };
//   }
//   return removeEmptyObjects(classificationJson);
// }

// export function classificationToList(classifications: any) {
//   let common_class = {};
//   if ((classifications?.['@level_0'] ?? '').trim() !== '') {
//     common_class = {
//       '@level': '0',
//       '@catId': classifications?.['@catId_0'],
//       '#text': classifications['@level_0'],
//     };
//     if ((classifications?.['@level_1'] ?? '').trim() !== '') {
//       common_class = [
//         {
//           '@level': '0',
//           '@catId': classifications?.['@catId_0'],
//           '#text': classifications['@level_0'],
//         },
//         {
//           '@level': '1',
//           '@catId': classifications?.['@catId_1'],
//           '#text': classifications['@level_1'],
//         },
//       ];
//       if ((classifications?.['@level_2'] ?? '').trim() !== '') {
//         common_class = [
//           {
//             '@level': '0',
//             '@catId': classifications?.['@catId_0'],
//             '#text': classifications['@level_0'],
//           },
//           {
//             '@level': '1',
//             '@catId': classifications?.['@catId_1'],
//             '#text': classifications['@level_1'],
//           },
//           {
//             '@level': '2',
//             '@catId': classifications?.['@catId_2'],
//             '#text': classifications['@level_2'],
//           },
//         ];
//       }
//     }
//   }
//   return removeEmptyObjects(common_class);
// }

export function genLocalizedClassification(classifications: any[], categoryData: any[]) {
  if (classifications.length > 0 && Array.isArray(categoryData)) {
    return genClassJsonZH(classifications, 0, categoryData);
  } else {
    return classifications;
  }
}

/** @deprecated Use genLocalizedClassification. */
export function genClassificationZH(classifications: any[], categoryData: any[]) {
  return genLocalizedClassification(classifications, categoryData);
}

export function isValidURL(url: string): boolean {
  if (typeof url !== 'string' || url.trim() === '') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function formatDateTime(date: any): string {
  return date.toISOString();
}

export function convertToUTCISOString(dateTimeStr: string): string {
  if (!dateTimeStr) return '';
  const date = new Date(dateTimeStr);
  return date.toISOString();
}

export function validatePasswordStrength(_: any, value: string) {
  if (!value) {
    return Promise.reject(new Error(''));
  }
  if (value.length < 8) {
    return Promise.reject(new Error('Password must be at least 8 characters long!'));
  }
  if (!/[A-Z]/.test(value)) {
    return Promise.reject(new Error('Password must contain at least one uppercase letter!'));
  }
  if (!/[a-z]/.test(value)) {
    return Promise.reject(new Error('Password must contain at least one lowercase letter!'));
  }
  if (!/[0-9]/.test(value)) {
    return Promise.reject(new Error('Password must contain at least one number!'));
  }
  if (!/[!@#$%^&*]/.test(value)) {
    return Promise.reject(new Error('Password must contain at least one special character!'));
  }
  return Promise.resolve();
}

export function jsonToList(json: any) {
  if (json) {
    if (Array.isArray(json)) {
      return json;
    } else {
      return [json];
    }
  }
  return [];
}

export function listToJson(list: any) {
  if (list) {
    if (Array.isArray(list)) {
      if (list.length === 1) {
        return list[0];
      } else if (list.length > 1) {
        return list;
      }
    } else {
      return list;
    }
  }
  return {};
}

export function toAmountNumber(amount: string) {
  let thisAmount = Number(amount);
  if (isNaN(thisAmount)) {
    return 0;
  } else {
    return thisAmount;
  }
}

export function getDataSource(pathname: string) {
  if (pathname.includes('/mydata')) {
    return 'my';
  } else if (pathname.includes('/exampledata')) {
    return 'ex';
  } else if (pathname.includes('/tgdata')) {
    return 'tg';
  } else if (pathname.includes('/codata')) {
    return 'co';
  } else if (pathname.includes('/tedata')) {
    return 'te';
  }
  return '';
}

export function convertCopyrightToBoolean(value: 'Yes' | 'No'): 'true' | 'false' {
  if (value === 'Yes') {
    return 'true';
  }
  if (value === 'No') {
    return 'false';
  }
  return value;
}

export function capitalize(str: string): 'Input' | 'Output' {
  if (!str) return undefined as any;
  return (str.charAt(0).toUpperCase() + str.slice(1)) as 'Input' | 'Output';
}
