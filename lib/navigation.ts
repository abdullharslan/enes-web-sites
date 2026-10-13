import type { NavLink } from "@/components/layout/site-header";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

const NAV_ITEMS = [
  ["home", "/"],
  ["collection", "/collection"],
  ["about", "/about"],
  ["sell", "/sell"],
  ["journal", "/journal"],
  ["contact", "/contact"],
] as const satisfies ReadonlyArray<readonly [keyof Dictionary["nav"], string]>;

export function buildNavLinks(locale: Locale, nav: Dictionary["nav"]): NavLink[] {
  return NAV_ITEMS.map(([key, path]) => ({
    href: localePath(locale, path),
    label: nav[key],
  }));
}
