export const LOCALES = ["de", "en", "tr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";

/** BCP 47 tags used for Intl formatting and the `<html lang>` attribute. */
export const INTL_LOCALE: Record<Locale, string> = {
  de: "de-DE",
  en: "en-GB",
  tr: "tr-TR",
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

interface WeightedLanguage {
  language: string;
  quality: number;
}

function parseAcceptLanguage(header: string): WeightedLanguage[] {
  return header
    .split(",")
    .map((entry) => {
      const [tag = "", ...params] = entry.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { language: tag.toLowerCase().split("-")[0] ?? "", quality };
    })
    .filter(({ quality }) => Number.isFinite(quality) && quality > 0);
}

/** Picks the best supported locale from an `Accept-Language` header. */
export function resolveLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const best = parseAcceptLanguage(acceptLanguage)
    .filter(({ language }) => isLocale(language))
    .sort((a, b) => b.quality - a.quality)[0];

  return best && isLocale(best.language) ? best.language : DEFAULT_LOCALE;
}

/** Returns `pathname` (plus optional query) under `locale`, replacing an existing locale segment. */
export function switchLocalePath(pathname: string, locale: Locale, query = ""): string {
  const segments = pathname.split("/").filter(Boolean);
  const rest =
    segments[0] !== undefined && isLocale(segments[0]) ? segments.slice(1) : segments;
  const path = `/${[locale, ...rest].join("/")}`;
  return query ? `${path}?${query}` : path;
}

/** Builds an in-app href under `locale`; `path` must be an absolute app path. */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError(`Expected an absolute app path, got: ${path}`);
  }
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
