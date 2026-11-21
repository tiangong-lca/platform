import {
  CANONICAL_CONTENT_LANGUAGE,
  getAuthoringLanguageOptions,
  normalizeSupportedContentLanguage,
} from '@/services/general/contentLanguageRegistry';

export function getDefaultLanguagesForLocale(locale?: string): readonly string[] {
  const language = normalizeSupportedContentLanguage(locale);
  const canAuthor = getAuthoringLanguageOptions().some((option) => option.value === language);
  return language && canAuthor && language !== CANONICAL_CONTENT_LANGUAGE
    ? [language, CANONICAL_CONTENT_LANGUAGE]
    : [CANONICAL_CONTENT_LANGUAGE];
}

export function addDefaultLanguageEntries(
  current: Record<string, unknown>[],
  languages: readonly string[],
): Record<string, unknown>[] {
  let next = current;
  for (const language of languages) {
    if (next.some((entry) => entry?.['@xml:lang'] === language)) continue;
    if (next === current) next = [...current];
    const emptyIndex = next.findIndex(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        !entry['@xml:lang'] &&
        !entry['#text'],
    );
    if (emptyIndex >= 0) {
      next[emptyIndex] = { ...next[emptyIndex], '@xml:lang': language };
    } else {
      next.push({ '@xml:lang': language });
    }
  }
  return next;
}
