import { INTL_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { Product } from "./schema";

export const AVAILABILITY = ["available", "all"] as const;
export const SORTS = [
  "newest",
  "name-asc",
  "name-desc",
  "price-asc",
  "price-desc",
] as const;

export type Availability = (typeof AVAILABILITY)[number];
export type Sort = (typeof SORTS)[number];

export interface CatalogFilter {
  brand: string | null;
  category: string | null;
  availability: Availability;
  sort: Sort;
}

export const DEFAULT_FILTER: CatalogFilter = {
  brand: null,
  category: null,
  availability: "available",
  sort: "newest",
};

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export interface AllowedFilterValues {
  brands: readonly string[];
  categories: readonly string[];
}

/** Reads a filter from URL params; unknown values fall back to defaults (fail-closed). */
export function parseCatalogFilter(
  params: URLSearchParams,
  allowed: AllowedFilterValues,
): CatalogFilter {
  return {
    brand: pick(params.get("brand"), allowed.brands),
    category: pick(params.get("category"), allowed.categories),
    availability:
      pick(params.get("availability"), AVAILABILITY) ?? DEFAULT_FILTER.availability,
    sort: pick(params.get("sort"), SORTS) ?? DEFAULT_FILTER.sort,
  };
}

/** Serialises only non-default values so shareable URLs stay short. */
export function serializeCatalogFilter(filter: CatalogFilter): string {
  const params = new URLSearchParams();
  for (const key of ["brand", "category", "availability", "sort"] as const) {
    const value = filter[key];
    if (value !== null && value !== DEFAULT_FILTER[key]) params.set(key, value);
  }
  return params.toString();
}

const byNewest = (a: Product, b: Product) => b.addedAt.localeCompare(a.addedAt);

function priceOf(product: Product): number | null {
  return product.price.kind === "fixed" ? product.price.amountEur : null;
}

function byPrice(direction: 1 | -1) {
  return (a: Product, b: Product): number => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa === null || pb === null) return (pa === null ? 1 : 0) - (pb === null ? 1 : 0);
    return (pa - pb) * direction;
  };
}

type Comparator = (a: Product, b: Product) => number;

function byName(direction: 1 | -1, locale: Locale): Comparator {
  const collator = new Intl.Collator(INTL_LOCALE[locale], {
    sensitivity: "base",
    numeric: true,
  });
  return (a, b) =>
    (collator.compare(a.brandName, b.brandName) || collator.compare(a.model, b.model)) *
    direction;
}

function comparatorFor(sort: Sort, locale: Locale): Comparator {
  switch (sort) {
    case "newest":
      return byNewest;
    case "name-asc":
      return byName(1, locale);
    case "name-desc":
      return byName(-1, locale);
    case "price-asc":
      return byPrice(1);
    case "price-desc":
      return byPrice(-1);
  }
}

export function filterProducts(
  products: readonly Product[],
  filter: CatalogFilter,
  locale: Locale = "de",
): Product[] {
  return products
    .filter((p) => filter.availability === "all" || p.status !== "sold")
    .filter((p) => filter.brand === null || p.brand === filter.brand)
    .filter((p) => filter.category === null || p.category === filter.category)
    .toSorted(comparatorFor(filter.sort, locale));
}

export function isDefaultFilter(filter: CatalogFilter): boolean {
  return serializeCatalogFilter(filter) === "";
}
