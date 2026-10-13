import type { Price } from "./catalog/schema";
import { INTL_LOCALE, type Locale } from "./i18n/locales";

/** Formats a whole, non-negative euro amount for display. */
export function formatEur(amount: number, locale: Locale): string {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`Invalid euro amount: ${amount}`);
  }
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPrice(
  price: Price,
  locale: Locale,
  onRequestLabel: string,
): string {
  return price.kind === "fixed" ? formatEur(price.amountEur, locale) : onRequestLabel;
}
