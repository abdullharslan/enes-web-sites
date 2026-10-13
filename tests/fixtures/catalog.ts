import { SEED_BRANDS } from "@/db/seed-data/brands";
import { SEED_CATEGORIES } from "@/db/seed-data/categories";
import { SEED_PRODUCTS } from "@/db/seed-data/products";
import type { SeedImage } from "@/db/seed-data/types";
import type { Catalog, CatalogImage } from "@/lib/catalog/schema";
import { resolveTranslations } from "@/lib/i18n/translations";

const image = (i: SeedImage): CatalogImage => ({
  src: i.src,
  alt: resolveTranslations(i.alt),
});

/**
 * The demo catalog as the public site sees it, built in memory (no database).
 * Integration tests prove the PostgreSQL loader yields the same data.
 */
export function seedCatalogFixture(): Catalog {
  const brandName = new Map(SEED_BRANDS.map((b) => [b.slug, b.name]));
  return {
    brands: SEED_BRANDS.map((b) => ({ slug: b.slug, name: b.name })),
    categories: SEED_CATEGORIES.map((c) => ({
      slug: c.slug,
      name: resolveTranslations(c.name),
      tileImage: image(c.tileImage),
    })),
    products: SEED_PRODUCTS.map((p) => ({
      ...p,
      brandName: brandName.get(p.brand) ?? p.brand,
      material: resolveTranslations(p.material),
      description: resolveTranslations(p.description),
      images: p.images.map(image),
    })),
  };
}
