import { interpolate } from "./interpolate";
import { INTL_LOCALE, type Locale } from "./locales";

export interface PluralForms {
  one: string;
  other: string;
}

/** Picks the CLDR plural form for `count` and fills `{count}`. */
export function pluralize(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(INTL_LOCALE[locale]).select(count);
  return interpolate(category === "one" ? forms.one : forms.other, { count });
}
