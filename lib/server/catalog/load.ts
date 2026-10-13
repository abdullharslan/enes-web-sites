import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import {
  brands,
  categories,
  media,
  productMedia,
  products,
  type Translations,
} from "@/db/schema";
import {
  brandSchema,
  categorySchema,
  productSchema,
  type Catalog,
  type CatalogImage,
} from "@/lib/catalog/schema";
import { PLACEHOLDER_IMAGE } from "@/lib/catalog/placeholder";
import { resolveTranslations } from "@/lib/i18n/translations";
import { mediaUrl } from "@/lib/server/media/store";

type MediaRow = typeof media.$inferSelect;

const hasText = (t: Translations | null | undefined): t is Translations =>
  Boolean(t && typeof t.de === "string" && t.de.trim() !== "");

function toImage(row: MediaRow | undefined): CatalogImage | undefined {
  return row ? { src: mediaUrl(row.key), alt: resolveTranslations(row.alt) } : undefined;
}

export interface CatalogIssue {
  entity: "brand" | "category" | "product";
  slug: string;
  error: unknown;
}

const logIssue = (issue: CatalogIssue) =>
  console.error(`[catalog] hidden invalid ${issue.entity} "${issue.slug}"`, issue.error);

/** Maps each row; a row that fails validation is reported and left out (fail-closed per record). */
function mapValid<Row, Out>(
  rows: readonly Row[],
  entity: CatalogIssue["entity"],
  slugOf: (row: Row) => string,
  map: (row: Row) => Out,
  onIssue: (issue: CatalogIssue) => void,
): Out[] {
  return rows.flatMap((row) => {
    try {
      return [map(row)];
    } catch (error) {
      onIssue({ entity, slug: slugOf(row), error });
      return [];
    }
  });
}

/**
 * Loads the visible public catalog and maps it to the read model. Every record
 * is validated; one corrupt record is hidden and reported instead of taking
 * the whole site down.
 */
export async function loadCatalog(
  db: Executor,
  onIssue: (issue: CatalogIssue) => void = logIssue,
): Promise<Catalog> {
  const brandRows = await db
    .select()
    .from(brands)
    .where(eq(brands.isVisible, true))
    .orderBy(asc(brands.sortOrder), asc(brands.name));
  const categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.isVisible, true))
    .orderBy(asc(categories.sortOrder));

  const productRows = await db
    .select({
      product: products,
      brandSlug: brands.slug,
      brandName: brands.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.isVisible, true),
        eq(brands.isVisible, true),
        eq(categories.isVisible, true),
      ),
    )
    .orderBy(asc(products.sortOrder), desc(products.addedAt));

  const productIds = productRows.map((r) => r.product.id);
  const links = productIds.length
    ? await db
        .select()
        .from(productMedia)
        .where(inArray(productMedia.productId, productIds))
        .orderBy(asc(productMedia.position))
    : [];

  const mediaIds = [
    ...links.map((l) => l.mediaId),
    ...brandRows.flatMap((b) => (b.heroMediaId ? [b.heroMediaId] : [])),
    ...categoryRows.flatMap((c) => (c.tileMediaId ? [c.tileMediaId] : [])),
  ];
  const mediaRows = mediaIds.length
    ? await db.select().from(media).where(inArray(media.id, mediaIds))
    : [];
  const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

  const imagesByProduct = new Map<string, CatalogImage[]>();
  for (const link of links) {
    const image = toImage(mediaById.get(link.mediaId));
    if (image)
      imagesByProduct.set(link.productId, [
        ...(imagesByProduct.get(link.productId) ?? []),
        image,
      ]);
  }

  const brandsOut = mapValid(
    brandRows,
    "brand",
    (b) => b.slug,
    (b) =>
      brandSchema.parse({
        slug: b.slug,
        name: b.name,
        description: hasText(b.description)
          ? resolveTranslations(b.description)
          : undefined,
        heroImage: toImage(b.heroMediaId ? mediaById.get(b.heroMediaId) : undefined),
      }),
    onIssue,
  );
  const categoriesOut = mapValid(
    categoryRows,
    "category",
    (c) => c.slug,
    (c) =>
      categorySchema.parse({
        slug: c.slug,
        name: resolveTranslations(c.name),
        tileImage: toImage(c.tileMediaId ? mediaById.get(c.tileMediaId) : undefined),
      }),
    onIssue,
  );
  const productsOut = mapValid(
    productRows,
    "product",
    (r) => r.product.slug,
    ({ product: p, brandSlug, brandName, categorySlug }) => {
      const images = imagesByProduct.get(p.id) ?? [];
      return productSchema.parse({
        slug: p.slug,
        brand: brandSlug,
        brandName,
        category: categorySlug,
        model: p.model,
        reference: p.reference ?? undefined,
        year: p.year ?? undefined,
        condition: p.condition,
        setItems: p.setItems,
        material: resolveTranslations(p.material),
        dimensions: p.dimensions ?? undefined,
        description: resolveTranslations(p.description),
        price:
          p.priceEur === null
            ? { kind: "on-request" }
            : { kind: "fixed", amountEur: p.priceEur },
        status: p.status,
        images: images.length ? images : [PLACEHOLDER_IMAGE],
        addedAt: p.addedAt,
      });
    },
    onIssue,
  );

  return { brands: brandsOut, categories: categoriesOut, products: productsOut };
}
