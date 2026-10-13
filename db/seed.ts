import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { recordRevision } from "@/lib/server/revisions";
import { storeImage } from "@/lib/server/media/store";
import { toSnapshot } from "@/lib/server/snapshot";
import { connect, type Database, type Executor } from "./connection";
import { isMain } from "./is-main";
import { brands, categories, productMedia, products } from "./schema";
import { SEED_BRANDS } from "./seed-data/brands";
import { SEED_CATEGORIES } from "./seed-data/categories";
import { SEED_PRODUCTS } from "./seed-data/products";
import type { SeedImage } from "./seed-data/types";

const SEED_COMMENT = "Initial import from demo data";

export interface SeedOptions {
  mediaRoot: string;
  publicDir?: string;
  now?: Date;
}

export interface SeedReport {
  brands: number;
  categories: number;
  products: number;
}

/** Imports demo catalog data. Idempotent: existing slugs are left untouched. */
export async function seedCatalog(
  db: Database | Executor,
  options: SeedOptions,
): Promise<SeedReport> {
  const { mediaRoot, publicDir = "public", now = new Date() } = options;
  const report: SeedReport = { brands: 0, categories: 0, products: 0 };

  const store = async (
    tx: Executor,
    image: SeedImage,
    kind: "category" | "product",
    entitySlug: string,
  ) => {
    const input = await readFile(join(publicDir, image.src));
    return storeImage(tx, mediaRoot, { input, kind, entitySlug, alt: image.alt, now });
  };

  await db.transaction(async (tx) => {
    for (const [index, seed] of SEED_CATEGORIES.entries()) {
      if (
        (
          await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, seed.slug))
        ).length
      )
        continue;
      const tile = await store(tx, seed.tileImage, "category", seed.slug);
      const [row] = await tx
        .insert(categories)
        .values({
          slug: seed.slug,
          name: seed.name,
          tileMediaId: tile.id,
          sortOrder: index,
        })
        .returning();
      await recordRevision(tx, {
        entityType: "category",
        entityId: row!.id,
        data: toSnapshot(row!),
        comment: SEED_COMMENT,
      });
      report.categories += 1;
    }

    for (const [index, seed] of SEED_BRANDS.entries()) {
      if (
        (
          await tx
            .select({ id: brands.id })
            .from(brands)
            .where(eq(brands.slug, seed.slug))
        ).length
      )
        continue;
      const [row] = await tx
        .insert(brands)
        .values({ slug: seed.slug, name: seed.name, sortOrder: index })
        .returning();
      await recordRevision(tx, {
        entityType: "brand",
        entityId: row!.id,
        data: toSnapshot(row!),
        comment: SEED_COMMENT,
      });
      report.brands += 1;
    }

    const brandIds = new Map((await tx.select().from(brands)).map((b) => [b.slug, b.id]));
    const categoryIds = new Map(
      (await tx.select().from(categories)).map((c) => [c.slug, c.id]),
    );

    for (const seed of SEED_PRODUCTS) {
      if (
        (
          await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.slug, seed.slug))
        ).length
      )
        continue;
      const brandId = brandIds.get(seed.brand);
      const categoryId = categoryIds.get(seed.category);
      if (!brandId || !categoryId)
        throw new Error(`Seed product ${seed.slug} references unknown brand/category`);

      const [row] = await tx
        .insert(products)
        .values({
          slug: seed.slug,
          brandId,
          categoryId,
          model: seed.model,
          reference: seed.reference ?? null,
          year: seed.year ?? null,
          condition: seed.condition,
          setItems: [...seed.setItems],
          material: seed.material,
          dimensions: seed.dimensions ?? null,
          description: seed.description,
          priceEur: seed.price.kind === "fixed" ? seed.price.amountEur : null,
          status: seed.status,
          addedAt: seed.addedAt,
        })
        .returning();

      const mediaIds: string[] = [];
      for (const [position, image] of seed.images.entries()) {
        const record = await store(tx, image, "product", seed.slug);
        await tx
          .insert(productMedia)
          .values({ productId: row!.id, position, mediaId: record.id });
        mediaIds.push(record.id);
      }
      await recordRevision(tx, {
        entityType: "product",
        entityId: row!.id,
        data: toSnapshot(row!, { mediaIds }),
        comment: SEED_COMMENT,
      });
      report.products += 1;
    }
  });

  return report;
}

if (isMain(import.meta.url)) {
  const { db, close } = connect(process.env.DATABASE_URL, { max: 1 });
  seedCatalog(db, { mediaRoot: process.env.MEDIA_ROOT ?? "storage/media" })
    .then((report) => console.log("seeded", report))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(close);
}
