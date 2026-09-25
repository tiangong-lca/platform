import {
  REQUIRED_CONTENT_LANGUAGES,
  resolveContentLanguage,
  resolveContentLanguages,
} from '../general/contentLanguageRegistry';
import type { ProcessExchangeData, ProcessRefUnitDisplay } from './data';

export const ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX = 'reference flow';
export const ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH = 500;
const ANNUAL_SUPPLY_VOLUME_DEFAULT_LANGS = REQUIRED_CONTENT_LANGUAGES;
const ANNUAL_SUPPLY_VOLUME_TRUNCATION_MARKER = '...';

export const ANNUAL_SUPPLY_VOLUME_TEXT_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?\s+\S.*$/;
export const ANNUAL_SUPPLY_VOLUME_NUMERIC_TEXT_PATTERN =
  /^[+-]?(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?$/;

const ANNUAL_SUPPLY_VOLUME_NUMBER_PREFIX_PATTERN =
  /^\s*([+-]?(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?)(?:\s+(.*))?$/;
const ANNUAL_SUPPLY_VOLUME_NUMERIC_INPUT_PREFIX_PATTERN =
  /^[+-]?(?:$|\d+(?:\.\d*)?(?:[Ee][+-]?\d*)?|\.\d+(?:[Ee][+-]?\d*)?|\.\d*)$/;
const ANNUAL_SUPPLY_VOLUME_NUMERIC_INPUT_ALLOWED_PATTERN = /[\d.+\-Ee]/;

type LangTextResolver = (value: unknown, lang: string) => string;

type AnnualSupplyVolumeTextParts = {
  numericText: string;
  suffixText: string;
};

type AnnualSupplyVolumeFormatOptions = {
  useDefaultSuffix?: boolean;
};

type AnnualSupplyVolumeUnitLookupRow = {
  referenceToFlowDataSetId?: unknown;
  referenceToFlowDataSetVersion?: unknown;
  refUnitRes?: ProcessRefUnitDisplay;
};

const normalizeText = (value: unknown) =>
  typeof value === 'string' && value.trim() && value.trim() !== '-' ? value.trim() : '';

const toReferenceValue = (reference?: ProcessExchangeData['referenceToFlowDataSet']) => {
  return Array.isArray(reference) ? reference[0] : reference;
};

const getReferenceFlowIdentity = (exchange?: ProcessExchangeData) => {
  const referenceFlow = toReferenceValue(exchange?.referenceToFlowDataSet);

  return {
    id: normalizeText(referenceFlow?.['@refObjectId']),
    version: normalizeText(referenceFlow?.['@version']),
  };
};

const getFallbackLangText = (value: unknown, lang: string): string => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeText(value);
  }

  if (Array.isArray(value)) {
    const localizedItem = resolveContentLanguages(lang)
      .map((candidateLanguage) =>
        value.find(
          (item) => item?.['@xml:lang'] === candidateLanguage && normalizeText(item?.['#text']),
        ),
      )
      .find(Boolean);

    return normalizeText(localizedItem?.['#text']);
  }

  if (typeof value === 'object') {
    return normalizeText((value as Record<string, unknown>)['#text']);
  }

  return '';
};

const uniqueNonEmpty = (values: readonly string[]) => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue || seen.has(normalizedValue)) {
      return false;
    }

    seen.add(normalizedValue);
    return true;
  });
};

export const parseAnnualSupplyVolumeText = (value: unknown): AnnualSupplyVolumeTextParts => {
  const text = normalizeText(value);

  if (!text) {
    return {
      numericText: '',
      suffixText: '',
    };
  }

  const matched = text.match(ANNUAL_SUPPLY_VOLUME_NUMBER_PREFIX_PATTERN);

  if (matched) {
    return {
      numericText: matched[1],
      suffixText: normalizeText(matched[5]),
    };
  }

  const [numericText, ...suffixParts] = text.split(/\s+/);

  return {
    numericText,
    suffixText: normalizeText(suffixParts.join(' ')),
  };
};

export const normalizeAnnualSupplyVolumeSuffix = (
  suffix: unknown,
  options: AnnualSupplyVolumeFormatOptions,
) => {
  const normalizedSuffix = normalizeText(suffix);

  if (normalizedSuffix || options.useDefaultSuffix === false) {
    return normalizedSuffix;
  }

  return ANNUAL_SUPPLY_VOLUME_DEFAULT_SUFFIX;
};

const resolveAnnualSupplyVolumeSuffix = (
  existingSuffix: unknown,
  suffix: unknown,
  options: AnnualSupplyVolumeFormatOptions,
) => {
  const normalizedExistingSuffix = normalizeText(existingSuffix);
  const normalizedSuffix = normalizeAnnualSupplyVolumeSuffix(suffix, options);

  if (!normalizedSuffix) {
    return '';
  }

  if (
    normalizedExistingSuffix &&
    normalizedExistingSuffix !== normalizedSuffix &&
    normalizedExistingSuffix.endsWith(` ${normalizedSuffix}`)
  ) {
    return normalizedExistingSuffix;
  }

  return normalizedSuffix;
};

export const sanitizeAnnualSupplyVolumeNumericInput = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';

  return Array.from(text).reduce((sanitizedText, character) => {
    if (!ANNUAL_SUPPLY_VOLUME_NUMERIC_INPUT_ALLOWED_PATTERN.test(character)) {
      return sanitizedText;
    }

    const nextText = `${sanitizedText}${character}`;

    return ANNUAL_SUPPLY_VOLUME_NUMERIC_INPUT_PREFIX_PATTERN.test(nextText)
      ? nextText
      : sanitizedText;
  }, '');
};

const truncateAnnualSupplyVolumeText = (value: string) => {
  if (value.length <= ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH) {
    return value;
  }

  const contentLengthLimit =
    ANNUAL_SUPPLY_VOLUME_TEXT_MAX_LENGTH - ANNUAL_SUPPLY_VOLUME_TRUNCATION_MARKER.length;
  let truncatedText = '';

  for (const character of value) {
    if (truncatedText.length + character.length > contentLengthLimit) {
      break;
    }

    truncatedText += character;
  }

  return `${truncatedText}${ANNUAL_SUPPLY_VOLUME_TRUNCATION_MARKER}`;
};

export const formatAnnualSupplyVolumeText = (
  numericText: unknown,
  suffix: unknown,
  options: AnnualSupplyVolumeFormatOptions = {},
) => {
  const normalizedNumericText = sanitizeAnnualSupplyVolumeNumericInput(numericText);

  if (!normalizedNumericText) {
    return '';
  }

  const normalizedSuffix = normalizeAnnualSupplyVolumeSuffix(suffix, options);

  return truncateAnnualSupplyVolumeText(
    normalizedSuffix ? `${normalizedNumericText} ${normalizedSuffix}` : normalizedNumericText,
  );
};

export const normalizeAnnualSupplyVolumeText = (
  value: unknown,
  suffix: unknown,
  options: AnnualSupplyVolumeFormatOptions = {},
) => {
  const { numericText, suffixText } = parseAnnualSupplyVolumeText(value);
  return formatAnnualSupplyVolumeText(
    numericText,
    resolveAnnualSupplyVolumeSuffix(suffixText, suffix, options),
    options,
  );
};

export const normalizeAnnualSupplyVolumeMultiLang = (
  value: unknown,
  suffixResolver: string | ((item: Record<string, unknown>) => string),
  options: AnnualSupplyVolumeFormatOptions = {},
) => {
  const normalizeItem = (item: unknown) => {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const itemRecord = item as Record<string, unknown>;
    const suffix =
      typeof suffixResolver === 'function' ? suffixResolver(itemRecord) : suffixResolver;

    return {
      ...itemRecord,
      '#text': normalizeAnnualSupplyVolumeText(itemRecord['#text'], suffix, options),
    };
  };

  if (Array.isArray(value)) {
    return value.map(normalizeItem);
  }

  return normalizeItem(value);
};

const getAnnualSupplyVolumeTextForLang = (value: unknown, lang: string) => {
  if (Array.isArray(value)) {
    const valueItems = value.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object',
    );
    const langItem = resolveContentLanguages(lang)
      .map((candidateLanguage) =>
        valueItems.find(
          (item) => item['@xml:lang'] === candidateLanguage && normalizeText(item['#text']),
        ),
      )
      .find(Boolean);

    return langItem ? langItem['#text'] : undefined;
  }

  if (value && typeof value === 'object') {
    return (value as Record<string, unknown>)['#text'];
  }

  return value;
};

export const getAnnualSupplyVolumeLanguages = (
  value: unknown,
  currentLanguage: string,
): string[] => {
  const existingLanguages = (Array.isArray(value) ? value : [value])
    .map((item) =>
      item && typeof item === 'object'
        ? normalizeText((item as Record<string, unknown>)['@xml:lang']).toLowerCase()
        : '',
    )
    .filter(Boolean);

  return uniqueNonEmpty([
    ...REQUIRED_CONTENT_LANGUAGES,
    ...existingLanguages,
    resolveContentLanguage(currentLanguage),
  ]);
};

export const getAnnualSupplyVolumeDisplayNumericText = (value: unknown, lang: string) => {
  const { numericText } = parseAnnualSupplyVolumeText(
    getAnnualSupplyVolumeTextForLang(value, lang),
  );
  return sanitizeAnnualSupplyVolumeNumericInput(numericText);
};

export const buildAnnualSupplyVolumeMultiLang = (
  numericValue: unknown,
  suffixResolver: string | ((lang: string) => string),
  languages: readonly string[] = ANNUAL_SUPPLY_VOLUME_DEFAULT_LANGS,
  options: AnnualSupplyVolumeFormatOptions = { useDefaultSuffix: false },
) => {
  const { numericText } = parseAnnualSupplyVolumeText(numericValue);
  const normalizedNumericText = sanitizeAnnualSupplyVolumeNumericInput(numericText);

  if (!normalizedNumericText) {
    return [];
  }

  return uniqueNonEmpty(languages).map((lang) => {
    const suffix = typeof suffixResolver === 'function' ? suffixResolver(lang) : suffixResolver;

    return {
      '@xml:lang': lang,
      '#text': formatAnnualSupplyVolumeText(normalizedNumericText, suffix, options),
    };
  });
};

export const replaceAnnualSupplyVolumeNumericText = (
  existingValue: unknown,
  numericValue: unknown,
  suffixResolver: string | ((lang: string) => string),
  languages: readonly string[] = ANNUAL_SUPPLY_VOLUME_DEFAULT_LANGS,
) => {
  const existingItems = (Array.isArray(existingValue) ? existingValue : [existingValue]).filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  );

  return buildAnnualSupplyVolumeMultiLang(
    numericValue,
    (lang) => {
      const existingItem = existingItems.find(
        (item) =>
          typeof item['@xml:lang'] === 'string' &&
          resolveContentLanguage(item['@xml:lang']) === resolveContentLanguage(lang),
      );
      const existingSuffix = parseAnnualSupplyVolumeText(existingItem?.['#text']).suffixText;

      return (
        existingSuffix ||
        (typeof suffixResolver === 'function' ? suffixResolver(lang) : suffixResolver)
      );
    },
    languages,
  );
};

export const getQuantitativeReferenceExchange = (exchangeDataSource: ProcessExchangeData[]) => {
  return exchangeDataSource.find((exchange) => exchange?.quantitativeReference === true);
};

export const buildAnnualSupplyVolumeUnitLookupRows = (
  exchangeDataSource: ProcessExchangeData[],
): AnnualSupplyVolumeUnitLookupRow[] => {
  if (!Array.isArray(exchangeDataSource)) {
    return [];
  }

  return exchangeDataSource.map((exchange) => {
    const { id, version } = getReferenceFlowIdentity(exchange);

    return {
      referenceToFlowDataSetId: id,
      referenceToFlowDataSetVersion: version,
    };
  });
};

export const mergeAnnualSupplyVolumeUnitRows = (
  exchangeDataSource: ProcessExchangeData[],
  unitRows: unknown,
) => {
  if (!Array.isArray(exchangeDataSource)) {
    return [];
  }

  const normalizedUnitRows = Array.isArray(unitRows)
    ? (unitRows as AnnualSupplyVolumeUnitLookupRow[])
    : [];

  return exchangeDataSource.map((exchange) => {
    const { id, version } = getReferenceFlowIdentity(exchange);
    const unitRow =
      normalizedUnitRows.find((row) => {
        const rowId = normalizeText(row?.referenceToFlowDataSetId);
        const rowVersion = normalizeText(row?.referenceToFlowDataSetVersion);

        return rowId === id && rowVersion === version;
      }) ??
      normalizedUnitRows.find((row) => {
        return normalizeText(row?.referenceToFlowDataSetId) === id;
      });

    if (!unitRow?.refUnitRes) {
      return exchange;
    }

    return {
      ...exchange,
      refUnitRes: unitRow.refUnitRes,
    };
  });
};

export const deriveAnnualSupplyVolumeSuffix = ({
  exchangeDataSource,
  getLangText = getFallbackLangText,
  lang,
}: {
  exchangeDataSource: ProcessExchangeData[];
  getLangText?: LangTextResolver;
  lang: string;
}) => {
  const quantitativeReferenceExchange = getQuantitativeReferenceExchange(exchangeDataSource);
  const referenceFlow = toReferenceValue(quantitativeReferenceExchange?.referenceToFlowDataSet);
  if (!referenceFlow) {
    return '';
  }

  const refUnitRes = quantitativeReferenceExchange?.refUnitRes as ProcessRefUnitDisplay | undefined;
  const unitName =
    normalizeText(refUnitRes?.refUnitName) || normalizeText(getLangText(refUnitRes?.name, lang));
  const referenceFlowName = normalizeText(
    getLangText(referenceFlow?.['common:shortDescription'], lang),
  );
  const contextText = normalizeText(
    getLangText(quantitativeReferenceExchange?.functionalUnitOrOther, lang),
  );
  const suffixParts = uniqueNonEmpty([unitName, contextText || referenceFlowName]);

  return suffixParts.join(' ');
};
