import {
  AUTHORING_CONTENT_LANGUAGES,
  CANONICAL_CONTENT_LANGUAGE,
  CONTENT_LANGUAGE_OPTIONS,
  CONTENT_LANGUAGE_REGISTRY,
  getAuthoringLanguageOptions,
  getContentGraphTextWidthDivisor,
  getLanguageDisplayName,
  getServiceQueryLanguage,
  isTranslationSourceContentLanguage,
  normalizeSupportedContentLanguage,
  PRIMARY_REQUIRED_CONTENT_LANGUAGE,
  reportServiceQueryLanguageResolution,
  REQUIRED_CONTENT_LANGUAGES,
  requireServiceQueryLanguage,
  resolveContentLanguage,
  resolveContentLanguages,
  resolveServiceQueryLanguage,
  SUPPORTED_CONTENT_LANGUAGES,
  TRANSLATION_SOURCE_CONTENT_LANGUAGE,
} from '@/services/general/contentLanguageRegistry';
import { getLocaleDefinition } from '@/services/general/localeRegistry';

describe('contentLanguageRegistry', () => {
  it('locks the fail-closed authoring-language release snapshot derived from one registry', () => {
    // Deliberately explicit: adding an authoring language must force label/order review here.
    expect(CANONICAL_CONTENT_LANGUAGE).toBe('en');
    expect(SUPPORTED_CONTENT_LANGUAGES).toEqual(['en', 'zh', 'de', 'fr']);
    expect(AUTHORING_CONTENT_LANGUAGES).toEqual(SUPPORTED_CONTENT_LANGUAGES);
    expect(REQUIRED_CONTENT_LANGUAGES).toEqual(['en']);
    expect(CONTENT_LANGUAGE_OPTIONS).toEqual([
      { value: 'en', label: 'English' },
      { value: 'zh', label: '简体中文' },
      { value: 'de', label: 'Deutsch' },
      { value: 'fr', label: 'Français' },
    ]);
    expect(getAuthoringLanguageOptions()).toBe(CONTENT_LANGUAGE_OPTIONS);
    expect(new Set(SUPPORTED_CONTENT_LANGUAGES).size).toBe(SUPPORTED_CONTENT_LANGUAGES.length);
    expect(
      CONTENT_LANGUAGE_REGISTRY.filter(({ authoring }) => authoring.enabled).every(
        ({ generatedContent }) => generatedContent.subproductPrefix.trim().length > 0,
      ),
    ).toBe(true);
  });

  it('declares annual unit time labels for every supported content language', () => {
    // Fail-closed product snapshot: a new content language must declare its annual unit label.
    expect(
      CONTENT_LANGUAGE_REGISTRY.map(({ languageCode, generatedContent }) => [
        languageCode,
        generatedContent.annualSupplyTimeUnit,
      ]),
    ).toEqual([
      ['en', 'year'],
      ['zh', '年'],
      ['de', 'Jahr'],
      ['fr', 'an'],
    ]);
  });

  it.each([
    ['zh-CN', 'zh'],
    ['en_US', 'en'],
    ['de_DE.UTF-8', 'de'],
    ['fr-FR', 'fr'],
    ['fr', 'fr'],
  ])('normalizes %s through the UI/content boundary', (value, expected) => {
    expect(normalizeSupportedContentLanguage(value)).toBe(expected);
    expect(resolveContentLanguage(value)).toBe(expected);
  });

  it('falls back to canonical English only for unsupported input', () => {
    expect(normalizeSupportedContentLanguage()).toBeUndefined();
    expect(normalizeSupportedContentLanguage(null)).toBeUndefined();
    expect(normalizeSupportedContentLanguage('es-ES')).toBeUndefined();
    expect(resolveContentLanguage('es-ES')).toBe('en');
  });

  it('fails closed for registry-declared unsupported and unknown content capabilities', () => {
    const localeDefinition = getLocaleDefinition('de-DE');
    const mutableDefinition = localeDefinition as unknown as {
      contentCapability: { status: string; contentLanguage?: string };
    };
    const originalCapability = mutableDefinition.contentCapability;

    try {
      mutableDefinition.contentCapability = { status: 'unsupported' };
      expect(normalizeSupportedContentLanguage('de-DE')).toBeUndefined();
      expect(() => resolveContentLanguage('de-DE')).toThrow(
        'UI locale de-DE declares typed content unsupported.',
      );

      mutableDefinition.contentCapability = { status: 'native', contentLanguage: 'es' };
      expect(() => resolveContentLanguage('de-DE')).toThrow(
        'UI locale de-DE references unknown content language es.',
      );
    } finally {
      mutableDefinition.contentCapability = originalCapability;
    }
  });

  it('uses canonical English when no language is marked as required', () => {
    const originalFilter = Array.prototype.filter;
    let registryFilterCalls = 0;
    let isolatedRegistry: typeof import('@/services/general/contentLanguageRegistry') | undefined;

    jest.spyOn(Array.prototype, 'filter').mockImplementation(function (
      this: unknown[],
      callback: (value: unknown, index: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ) {
      const looksLikeContentLanguageRegistry =
        this.length === CONTENT_LANGUAGE_REGISTRY.length &&
        this.every(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'languageCode' in entry &&
            'serviceQuery' in entry,
        );

      if (looksLikeContentLanguageRegistry) {
        registryFilterCalls += 1;
        if (registryFilterCalls === 2) {
          return [];
        }
      }

      return originalFilter.call(this, callback, thisArg);
    });

    try {
      jest.isolateModules(() => {
        isolatedRegistry = require('@/services/general/contentLanguageRegistry');
      });
    } finally {
      jest.restoreAllMocks();
    }

    expect(PRIMARY_REQUIRED_CONTENT_LANGUAGE).toBe('en');
    expect(isolatedRegistry?.REQUIRED_CONTENT_LANGUAGES).toEqual([]);
    expect(isolatedRegistry?.PRIMARY_REQUIRED_CONTENT_LANGUAGE).toBe('en');
  });

  it('keeps requested content separate from its ordered read fallback', () => {
    expect(resolveContentLanguages('de-DE')).toEqual(['de', 'en']);
    expect(resolveContentLanguages('fr')).toEqual(['fr', 'en']);
    expect(resolveContentLanguages('zh-CN')).toEqual(['zh', 'en']);
    expect(resolveContentLanguages('en-US')).toEqual(['en']);
  });

  it.each(CONTENT_LANGUAGE_REGISTRY)(
    'derives graph formatting for $languageCode from the registry',
    (definition) => {
      expect(getContentGraphTextWidthDivisor(definition.languageCode)).toBe(
        definition.formatting.graphTextWidthDivisor,
      );
      expect(definition.formatting.graphTextWidthDivisor).toBeGreaterThan(0);
      expect(isTranslationSourceContentLanguage(definition.languageCode)).toBe(
        definition.languageCode === TRANSLATION_SOURCE_CONTENT_LANGUAGE,
      );
    },
  );

  it('declares backend query fallback independently from content reading', () => {
    expect(resolveServiceQueryLanguage('de-DE')).toEqual({
      requestedLanguage: 'de',
      resolvedLanguage: 'en',
      status: 'declared-fallback',
      disclosure: 'diagnostic',
      usedFallback: true,
    });
    expect(resolveServiceQueryLanguage('zh-CN')).toEqual({
      requestedLanguage: 'zh',
      resolvedLanguage: 'zh',
      status: 'native',
      disclosure: 'none',
      usedFallback: false,
    });
    expect(getServiceQueryLanguage('fr-FR')).toBe('en');
  });

  it('keeps an unresolved service-query fallback explicit', () => {
    const german = CONTENT_LANGUAGE_REGISTRY.find(({ languageCode }) => languageCode === 'de')!;
    const serviceQuery = german.serviceQuery as {
      resolvedLanguage?: 'en';
    };
    const originalResolvedLanguage = serviceQuery.resolvedLanguage;

    try {
      delete serviceQuery.resolvedLanguage;
      expect(resolveServiceQueryLanguage('de-DE')).toEqual({
        requestedLanguage: 'de',
        resolvedLanguage: undefined,
        status: 'declared-fallback',
        disclosure: 'diagnostic',
        usedFallback: true,
      });
    } finally {
      serviceQuery.resolvedLanguage = originalResolvedLanguage;
    }
  });

  it('fails closed when a future content language declares service queries unsupported', () => {
    expect(() =>
      requireServiceQueryLanguage({
        requestedLanguage: 'de',
        status: 'unsupported',
        disclosure: 'diagnostic',
        usedFallback: false,
      }),
    ).toThrow('Content language de has no supported service-query language.');
  });

  it('emits a declared service-query fallback diagnostic only once', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getServiceQueryLanguage('de-DE')).toBe('en');
    expect(getServiceQueryLanguage('de-DE')).toBe('en');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('de uses en for the current service query boundary'),
    );
    consoleWarnSpy.mockRestore();
  });

  it('does not report native service-query resolution as fallback', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    reportServiceQueryLanguageResolution(resolveServiceQueryLanguage('en-US'));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('uses native labels for declared languages and a non-dash label for unknown codes', () => {
    expect(getLanguageDisplayName('de')).toBe('Deutsch');
    expect(getLanguageDisplayName('fr')).toBe('Français');
    expect(getLanguageDisplayName('ja')).toBe('Japanese');
    expect(getLanguageDisplayName('ja', 'en-US')).toBe('Japanese');
    expect(getLanguageDisplayName('ja', 'es-ES')).toBe('Japanese');
    expect(getLanguageDisplayName('not_a_language', 'en-US')).toBe('not_a_language');
    expect(getLanguageDisplayName()).toBe('-');
    expect(getLanguageDisplayName('   ')).toBe('-');
    expect(getLanguageDisplayName('zz', 'en-US')).toBe('zz');
  });
});
