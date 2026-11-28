import {
  normalizeSupportedContentLanguage,
  REQUIRED_CONTENT_LANGUAGES,
  resolveContentLanguage,
  resolveContentLanguages,
} from '../general/contentLanguageRegistry';
import { toBigNumberOrNaN } from '../general/bignumber';
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

type AnnualSupplyVolumeTextParts = {
  numericText: string;
  suffixText: string;
};

type AnnualSupplyVolumeFormatOptions = {
  useDefaultSuffix?: boolean;
};

export type AnnualSupplyVolumeUnitLookupRow = {
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

const yearLabels = { en: 'year', zh: '年', fr: 'an', de: 'Jahr' } as const;
const annualUnit = /^(.+?)\s*\/\s*(?:year|yr|a|年|an|année|Jahr)$/i;

export const annualSupplyVolumeSuffix = (unit: string | undefined, lang: unknown) => {
  const locale = normalizeSupportedContentLanguage(typeof lang === 'string' ? lang : undefined);
  return unit && locale ? `${unit}/${yearLabels[locale]}` : '';
};

const normalizeMassUnit = (unit: string) => {
  if (unit === '吨') return 't';
  if (unit === '千克') return 'kg';
  return unit;
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
  const sourceUnit = suffixText.match(annualUnit)?.[1];
  const targetUnit = normalizeText(suffix).match(annualUnit)?.[1];
  if (sourceUnit && sourceUnit !== targetUnit) {
    const source = normalizeMassUnit(sourceUnit);
    const target = targetUnit && normalizeMassUnit(targetUnit);
    if (source === target) return formatAnnualSupplyVolumeText(numericText, suffix, options);
    if ((source === 't' && target === 'kg') || (source === 'kg' && target === 't')) {
      const converted = toBigNumberOrNaN(numericText).shiftedBy(source === 't' ? 3 : -3);
      if (converted.isFinite())
        return formatAnnualSupplyVolumeText(converted.toString(), suffix, options);
    }
    // The declared quantity can only be relabelled after proving equivalence.
    return formatAnnualSupplyVolumeText(numericText, suffixText, options);
  }
  return formatAnnualSupplyVolumeText(numericText, suffix, options);
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

export const getAnnualSupplyVolumeStoredSuffix = (value: unknown, lang: string) =>
  parseAnnualSupplyVolumeText(getAnnualSupplyVolumeTextForLang(value, lang)).suffixText;

export const localizeAnnualSupplyVolumeSuffix = (suffix: string, lang: string) =>
  annualSupplyVolumeSuffix(suffix.match(annualUnit)?.[1], lang);
