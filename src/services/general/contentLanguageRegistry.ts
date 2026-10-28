import type { Languages } from '@tiangong-lca/tidas-sdk';

import {
  DEFAULT_SERVICE_APP_LOCALE,
  getLocaleContentCapability,
  getLocaleDefinition,
  normalizeSupportedAppLocale,
} from './localeRegistry';

export type ContentCapabilityStatus = 'native' | 'declared-fallback' | 'unsupported';

export type ContentLanguageDefinition = {
  languageCode: Languages;
  englishName: string;
  nativeLabel: string;
  authoring: {
    enabled: boolean;
    requiredForSave: boolean;
  };
  reading: {
    enabled: boolean;
    priority: readonly Languages[];
  };
  formatting: {
    graphTextWidthDivisor: number;
  };
  generatedContent: {
    subproductPrefix: string;
    annualSupplyTimeUnit: string;
  };
  serviceQuery: {
    status: ContentCapabilityStatus;
    resolvedLanguage?: Languages;
    disclosure: 'diagnostic' | 'user-visible' | 'none';
  };
};

/**
 * TIDAS/ILCD content-language source of truth.
 *
 * This registry is deliberately separate from the UI locale registry: a UI
 * can read and author one content language while a backend query or reference
 * resource still has an explicitly declared fallback. Adding a language must
 * therefore extend this contract instead of adding branches in consumers.
 */
export const CONTENT_LANGUAGE_REGISTRY = [
  {
    languageCode: 'en',
    englishName: 'English',
    nativeLabel: 'English',
    authoring: {
      enabled: true,
      requiredForSave: true,
    },
    reading: {
      enabled: true,
      priority: ['en'],
    },
    formatting: {
      graphTextWidthDivisor: 7,
    },
    generatedContent: {
      subproductPrefix: 'Subproduct: ',
      annualSupplyTimeUnit: 'year',
    },
    serviceQuery: {
      status: 'native',
      resolvedLanguage: 'en',
      disclosure: 'none',
    },
  },
  {
    languageCode: 'zh',
    englishName: 'Chinese',
    nativeLabel: '简体中文',
    authoring: {
      enabled: true,
      requiredForSave: false,
    },
    reading: {
      enabled: true,
      priority: ['zh', 'en'],
    },
    formatting: {
      graphTextWidthDivisor: 12,
    },
    generatedContent: {
      subproductPrefix: '子产品: ',
      annualSupplyTimeUnit: '年',
    },
    serviceQuery: {
      status: 'native',
      resolvedLanguage: 'zh',
      disclosure: 'none',
    },
  },
  {
    languageCode: 'de',
    englishName: 'German',
    nativeLabel: 'Deutsch',
    authoring: {
      enabled: true,
      requiredForSave: false,
    },
    reading: {
      enabled: true,
      priority: ['de', 'en'],
    },
    formatting: {
      graphTextWidthDivisor: 7,
    },
    generatedContent: {
      subproductPrefix: 'Nebenprodukt: ',
      annualSupplyTimeUnit: 'Jahr',
    },
    serviceQuery: {
      status: 'declared-fallback',
      resolvedLanguage: 'en',
      disclosure: 'diagnostic',
    },
  },
  {
    languageCode: 'fr',
    englishName: 'French',
    nativeLabel: 'Français',
    authoring: {
      enabled: true,
      requiredForSave: false,
    },
    reading: {
      enabled: true,
      priority: ['fr', 'en'],
    },
    formatting: {
      graphTextWidthDivisor: 7,
    },
    generatedContent: {
      subproductPrefix: 'Sous-produit : ',
      annualSupplyTimeUnit: 'an',
    },
    serviceQuery: {
      status: 'declared-fallback',
      resolvedLanguage: 'en',
      disclosure: 'diagnostic',
    },
  },
] as const satisfies readonly ContentLanguageDefinition[];

export type SupportedContentLanguage = (typeof CONTENT_LANGUAGE_REGISTRY)[number]['languageCode'];
export type ContentLanguageRegistryEntry = (typeof CONTENT_LANGUAGE_REGISTRY)[number];
export type SupportedServiceQueryLanguage = NonNullable<
  ContentLanguageRegistryEntry['serviceQuery']['resolvedLanguage']
>;

export const CANONICAL_CONTENT_LANGUAGE: SupportedContentLanguage = 'en';
export const TRANSLATION_SOURCE_CONTENT_LANGUAGE: SupportedContentLanguage = 'zh';

export const SUPPORTED_CONTENT_LANGUAGES: readonly SupportedContentLanguage[] =
  CONTENT_LANGUAGE_REGISTRY.map(({ languageCode }) => languageCode);

export const AUTHORING_CONTENT_LANGUAGES: readonly SupportedContentLanguage[] =
  CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.enabled).map(
    ({ languageCode }) => languageCode,
  );

export const REQUIRED_CONTENT_LANGUAGES: readonly SupportedContentLanguage[] =
  CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.requiredForSave).map(
    ({ languageCode }) => languageCode,
  );

export const PRIMARY_REQUIRED_CONTENT_LANGUAGE: SupportedContentLanguage =
  REQUIRED_CONTENT_LANGUAGES[0] ?? CANONICAL_CONTENT_LANGUAGE;

export type ContentLanguageOption = {
  value: SupportedContentLanguage;
  label: string;
};

export const CONTENT_LANGUAGE_OPTIONS: readonly ContentLanguageOption[] =
  CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.enabled).map(
    ({ languageCode, nativeLabel }) => ({
      value: languageCode,
      label: nativeLabel,
    }),
  );

export function getContentLanguageDefinition(
  languageCode: SupportedContentLanguage,
): ContentLanguageRegistryEntry;
export function getContentLanguageDefinition(
  languageCode?: string | null,
): ContentLanguageRegistryEntry | undefined;
export function getContentLanguageDefinition(
  languageCode?: string | null,
): ContentLanguageRegistryEntry | undefined {
  const normalizedLanguage = languageCode?.trim().toLowerCase();
  return CONTENT_LANGUAGE_REGISTRY.find(({ languageCode: code }) => code === normalizedLanguage);
}

export function normalizeSupportedContentLanguage(
  value?: string | null,
): SupportedContentLanguage | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const directDefinition = getContentLanguageDefinition(value);
  if (directDefinition) {
    return directDefinition.languageCode;
  }

  const appLocale = normalizeSupportedAppLocale(value);
  if (!appLocale) {
    return undefined;
  }

  const capability = getLocaleContentCapability(appLocale);
  if (capability.status === 'unsupported') {
    return undefined;
  }

  return getContentLanguageDefinition(capability.contentLanguage)?.languageCode;
}

export function resolveContentLanguage(value?: string | null): SupportedContentLanguage {
  const appLocale = normalizeSupportedAppLocale(value);
  if (appLocale) {
    const capability = getLocaleContentCapability(appLocale);
    if (capability.status === 'unsupported') {
      throw new Error(`UI locale ${appLocale} declares typed content unsupported.`);
    }
    const definition = getContentLanguageDefinition(capability.contentLanguage);
    if (!definition) {
      throw new Error(
        `UI locale ${appLocale} references unknown content language ${capability.contentLanguage}.`,
      );
    }
    return definition.languageCode;
  }

  return normalizeSupportedContentLanguage(value) ?? CANONICAL_CONTENT_LANGUAGE;
}

export function getContentGraphTextWidthDivisor(value?: string | null): number {
  return getContentLanguageDefinition(resolveContentLanguage(value)).formatting
    .graphTextWidthDivisor;
}

export function isTranslationSourceContentLanguage(value?: string | null): boolean {
  return resolveContentLanguage(value) === TRANSLATION_SOURCE_CONTENT_LANGUAGE;
}

export function resolveContentLanguages(
  value?: string | null,
): readonly SupportedContentLanguage[] {
  const language = resolveContentLanguage(value);
  const definition = getContentLanguageDefinition(language);
  return definition.reading.priority.filter(
    (candidate): candidate is SupportedContentLanguage =>
      getContentLanguageDefinition(candidate)?.reading.enabled === true,
  );
}

export type ServiceQueryLanguageResolution = {
  requestedLanguage: SupportedContentLanguage;
  resolvedLanguage?: SupportedServiceQueryLanguage;
  status: ContentCapabilityStatus;
  disclosure: ContentLanguageDefinition['serviceQuery']['disclosure'];
  usedFallback: boolean;
};

export function resolveServiceQueryLanguage(value?: string | null): ServiceQueryLanguageResolution {
  const requestedLanguage = resolveContentLanguage(value);
  const serviceQuery = getContentLanguageDefinition(requestedLanguage).serviceQuery;
  const resolvedDefinition = serviceQuery.resolvedLanguage
    ? getContentLanguageDefinition(serviceQuery.resolvedLanguage)
    : undefined;

  return {
    requestedLanguage,
    resolvedLanguage: resolvedDefinition?.languageCode as SupportedServiceQueryLanguage | undefined,
    status: serviceQuery.status,
    disclosure: serviceQuery.disclosure,
    usedFallback:
      serviceQuery.status === 'declared-fallback' &&
      resolvedDefinition?.languageCode !== requestedLanguage,
  };
}

const emittedServiceQueryDiagnostics = new Set<string>();

export function reportServiceQueryLanguageResolution(
  resolution: ServiceQueryLanguageResolution,
): void {
  if (!resolution.usedFallback || resolution.disclosure === 'none') {
    return;
  }

  const key = `${resolution.requestedLanguage}:${resolution.resolvedLanguage}:${resolution.status}`;
  if (emittedServiceQueryDiagnostics.has(key)) {
    return;
  }
  emittedServiceQueryDiagnostics.add(key);
  console.warn(
    `[i18n-service-query] ${resolution.requestedLanguage} uses ${resolution.resolvedLanguage} for the current service query boundary (${resolution.status}).`,
  );
}

export function requireServiceQueryLanguage(
  resolution: ServiceQueryLanguageResolution,
): SupportedServiceQueryLanguage {
  if (!resolution.resolvedLanguage || resolution.status === 'unsupported') {
    throw new Error(
      `Content language ${resolution.requestedLanguage} has no supported service-query language.`,
    );
  }
  reportServiceQueryLanguageResolution(resolution);
  return resolution.resolvedLanguage;
}

export function getServiceQueryLanguage(value?: string | null): SupportedServiceQueryLanguage {
  return requireServiceQueryLanguage(resolveServiceQueryLanguage(value));
}

export function getAuthoringLanguageOptions(): readonly ContentLanguageOption[] {
  return CONTENT_LANGUAGE_OPTIONS;
}

export function getLanguageDisplayName(
  languageCode?: string | null,
  displayLocale?: string | null,
): string {
  const definition = getContentLanguageDefinition(languageCode);
  if (definition) {
    return definition.nativeLabel;
  }

  const normalizedCode = languageCode?.trim();
  if (!normalizedCode) {
    return '-';
  }

  try {
    const locale = normalizeSupportedAppLocale(displayLocale) ?? DEFAULT_SERVICE_APP_LOCALE;
    const displayName = new Intl.DisplayNames([getLocaleDefinition(locale).adapters.intl], {
      type: 'language',
    }).of(normalizedCode);
    return displayName && displayName !== normalizedCode ? displayName : normalizedCode;
  } catch {
    return normalizedCode;
  }
}
