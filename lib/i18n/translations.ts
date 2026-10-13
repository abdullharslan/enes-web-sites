import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

export type LocalizedText = Record<Locale, string>;

const present = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim() !== "";

/** Completes stored translations: blank or missing locales show the default locale. */
export function resolveTranslations(
  stored: Readonly<Record<string, string>>,
): LocalizedText {
  const fallback = stored[DEFAULT_LOCALE];
  if (!present(fallback)) {
    throw new Error(`Translations lack the default locale "${DEFAULT_LOCALE}"`);
  }
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const value = stored[locale];
      return [locale, present(value) ? value : fallback];
    }),
  ) as LocalizedText;
}

/** Locales (other than the default) without their own text. */
export function missingLocales(stored: Readonly<Record<string, string>>): Locale[] {
  return LOCALES.filter((l) => l !== DEFAULT_LOCALE && !present(stored[l]));
}
