import type { Metadata } from "next";
import { SITE } from "@/config/site";
import {
  DEFAULT_LOCALE,
  INTL_LOCALE,
  LOCALES,
  localePath,
  type Locale,
} from "@/lib/i18n/locales";

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

/** Canonical + hreflang alternates for one page (`path` is the locale-less app path). */
export function buildAlternates(locale: Locale, path: string): Alternates {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [INTL_LOCALE[l], localePath(l, path)])),
      "x-default": localePath(DEFAULT_LOCALE, path),
    },
  };
}

interface PageMetadataInput {
  title?: string;
  description?: string;
  images?: readonly string[];
  noIndex?: boolean;
}

/** Per-page metadata: own canonical/hreflang and the site's Open Graph defaults. */
export function pageMetadata(
  locale: Locale,
  path: string,
  { title, description, images, noIndex = false }: PageMetadataInput = {},
): Metadata {
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: buildAlternates(locale, path),
    openGraph: {
      siteName: SITE.name,
      locale: INTL_LOCALE[locale],
      type: "website",
      url: localePath(locale, path),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(images ? { images: [...images] } : {}),
    },
    ...(noIndex ? { robots: { index: false } } : {}),
  };
}
