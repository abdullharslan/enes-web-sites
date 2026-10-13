import type { Brand, Catalog, CatalogImage } from "./schema";

export interface BrandSummary {
  brand: Brand;
  /** The brand's own hero image, else its newest product photo. */
  image: CatalogImage | undefined;
  /** Pieces currently offered (not sold). */
  availableCount: number;
}

export function summarizeBrands(catalog: Catalog): BrandSummary[] {
  return catalog.brands.map((brand) => {
    const own = catalog.products.filter((p) => p.brand === brand.slug);
    const newest = own.toSorted((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
    return {
      brand,
      image: brand.heroImage ?? newest?.images[0],
      availableCount: own.filter((p) => p.status !== "sold").length,
    };
  });
}

export function findBrand(catalog: Catalog, slug: string): Brand | undefined {
  return catalog.brands.find((b) => b.slug === slug);
}
