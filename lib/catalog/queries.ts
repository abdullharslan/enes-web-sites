import type { Product } from "./schema";

const newestFirst = (a: Product, b: Product) => b.addedAt.localeCompare(a.addedAt);

export function getNewArrivals(products: readonly Product[], limit: number): Product[] {
  return products
    .filter((p) => p.status !== "sold")
    .toSorted(newestFirst)
    .slice(0, limit);
}

export function getSoldHighlights(
  products: readonly Product[],
  limit: number,
): Product[] {
  return products
    .filter((p) => p.status === "sold")
    .toSorted(newestFirst)
    .slice(0, limit);
}

/** Unsold products ranked by affinity: same brand, then same category, then newest. */
export function getRelatedProducts(
  target: Product,
  products: readonly Product[],
  limit: number,
): Product[] {
  const affinity = (p: Product) =>
    (p.brand === target.brand ? 2 : 0) + (p.category === target.category ? 1 : 0);

  return products
    .filter((p) => p.slug !== target.slug && p.status !== "sold")
    .toSorted((a, b) => affinity(b) - affinity(a) || newestFirst(a, b))
    .slice(0, limit);
}

export function findProduct(
  products: readonly Product[],
  slug: string,
): Product | undefined {
  return products.find((p) => p.slug === slug);
}
