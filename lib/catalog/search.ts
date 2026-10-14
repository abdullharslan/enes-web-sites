import type { Locale } from "@/lib/i18n/locales";
import type { Catalog, Product } from "./schema";

export const MAX_QUERY_LENGTH = 200;

/** Lower-case, accent-free, Turkish-safe form used on both sides of a comparison. */
export function normalizeForSearch(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple, predictable product search: every word must appear somewhere;
 * hits in brand, model and reference rank above hits in descriptions.
 */
export function searchProducts(
  catalog: Catalog,
  query: string,
  locale: Locale,
): Product[] {
  if (query.length > MAX_QUERY_LENGTH) return [];
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const categoryName = new Map(catalog.categories.map((c) => [c.slug, c.name[locale]]));

  return catalog.products
    .map((product) => {
      const primary = normalizeForSearch(
        [product.brandName, product.model, product.reference ?? ""].join(" "),
      );
      const secondary = normalizeForSearch(
        [
          categoryName.get(product.category) ?? "",
          product.material[locale],
          product.description[locale],
        ].join(" "),
      );
      const matches = words.every((w) => primary.includes(w) || secondary.includes(w));
      const score = words.filter((w) => primary.includes(w)).length;
      return { product, matches, score };
    })
    .filter((r) => r.matches)
    .sort(
      (a, b) => b.score - a.score || b.product.addedAt.localeCompare(a.product.addedAt),
    )
    .map((r) => r.product);
}
