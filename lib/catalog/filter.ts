import { CATEGORIES, type Category, type Product } from "./schema";

export const AVAILABILITY = ["available", "all"] as const;
export const SORTS = ["newest", "price-asc", "price-desc"] as const;

export type Availability = (typeof AVAILABILITY)[number];
export type Sort = (typeof SORTS)[number];

export interface CatalogFilter {
  brand: string | null;
  category: Category | null;
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

/** Reads a filter from URL params; unknown values fall back to defaults (fail-closed). */
export function parseCatalogFilter(
  params: URLSearchParams,
  brandSlugs: readonly string[],
): CatalogFilter {
  return {
    brand: pick(params.get("brand"), brandSlugs),
    category: pick(params.get("category"), CATEGORIES),
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

const COMPARATORS: Record<Sort, (a: Product, b: Product) => number> = {
  newest: byNewest,
  "price-asc": byPrice(1),
  "price-desc": byPrice(-1),
};

export function filterProducts(
  products: readonly Product[],
  filter: CatalogFilter,
): Product[] {
  return products
    .filter((p) => filter.availability === "all" || p.status !== "sold")
    .filter((p) => filter.brand === null || p.brand === filter.brand)
    .filter((p) => filter.category === null || p.category === filter.category)
    .toSorted(COMPARATORS[filter.sort]);
}

export function isDefaultFilter(filter: CatalogFilter): boolean {
  return serializeCatalogFilter(filter) === "";
}
