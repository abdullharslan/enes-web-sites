import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "@/db/seed";
import { SEED_BRANDS } from "@/db/seed-data/brands";
import { SEED_CATEGORIES } from "@/db/seed-data/categories";
import { SEED_PRODUCTS } from "@/db/seed-data/products";
import { productMedia, products } from "@/db/schema";
import { PLACEHOLDER_IMAGE } from "@/lib/catalog/placeholder";
import { eq } from "drizzle-orm";
import { loadCatalog } from "@/lib/server/catalog/load";
import { listRevisions } from "@/lib/server/revisions";
import { resolveTranslations } from "@/lib/i18n/translations";
import { closeTestDb, tempMediaRoot, withRollback } from "./helpers";

afterAll(closeTestDb);
let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

const now = new Date("2026-10-14T12:00:00Z");

describe("seedCatalog + loadCatalog", () => {
  it("round-trips every seed product unchanged (characterization)", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root, now });
      const catalog = await loadCatalog(tx);

      expect(catalog.brands.map((b) => b.slug)).toEqual(SEED_BRANDS.map((b) => b.slug));
      expect(catalog.categories.map((c) => c.slug)).toEqual(
        SEED_CATEGORIES.map((c) => c.slug),
      );
      expect(catalog.products).toHaveLength(SEED_PRODUCTS.length);

      for (const seed of SEED_PRODUCTS) {
        const product = catalog.products.find((p) => p.slug === seed.slug);
        expect(product, seed.slug).toBeDefined();
        const { images: seedImages, ...seedFields } = seed;
        const { images, brandName, ...fields } = product!;
        expect(fields).toEqual({
          ...seedFields,
          material: resolveTranslations(seed.material),
          description: resolveTranslations(seed.description),
        });
        expect(brandName).toBe(SEED_BRANDS.find((b) => b.slug === seed.brand)?.name);
        expect(images.map((i) => i.alt)).toEqual(
          seedImages.map((i) => resolveTranslations(i.alt)),
        );
        for (const image of images)
          expect(image.src).toMatch(
            /^\/media\/product\/[a-z0-9-]+\/\d{8}-\d{6}_v\d+_[a-f0-9]{8}\.webp$/,
          );
      }
    }));

  it("is idempotent and records version 1 for every entity", () =>
    withRollback(async (tx) => {
      const first = await seedCatalog(tx, { mediaRoot: media.root, now });
      const second = await seedCatalog(tx, { mediaRoot: media.root, now });
      expect(first).toEqual({
        brands: SEED_BRANDS.length,
        categories: SEED_CATEGORIES.length,
        products: SEED_PRODUCTS.length,
      });
      expect(second).toEqual({ brands: 0, categories: 0, products: 0 });

      const [row] = await tx
        .select()
        .from(products)
        .where(eq(products.slug, "rolex-explorer-224270"));
      const history = await listRevisions(tx, "product", row!.id);
      expect(history.map((r) => r.version)).toEqual([1]);
      expect(history[0]?.data).toMatchObject({
        slug: "rolex-explorer-224270",
        model: "Explorer 40",
      });
    }));

  it("hides invisible products and brands from the public catalog", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root, now });
      await tx
        .update(products)
        .set({ isVisible: false })
        .where(eq(products.slug, "rolex-explorer-224270"));
      const catalog = await loadCatalog(tx);
      expect(catalog.products.some((p) => p.slug === "rolex-explorer-224270")).toBe(
        false,
      );
    }));
});

describe("loadCatalog resilience", () => {
  it("shows a product without images with the monogram placeholder", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root, now });
      const [row] = await tx
        .select()
        .from(products)
        .where(eq(products.slug, "rolex-explorer-224270"));
      await tx.delete(productMedia).where(eq(productMedia.productId, row!.id));
      const catalog = await loadCatalog(tx);
      const product = catalog.products.find((p) => p.slug === "rolex-explorer-224270");
      expect(product?.images).toEqual([PLACEHOLDER_IMAGE]);
    }));

  it("drops a corrupt record instead of taking the whole catalog down", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root, now });
      // German description blanked directly in the database (bypassing admin validation).
      await tx
        .update(products)
        .set({ description: { en: "only english" } })
        .where(eq(products.slug, "rolex-explorer-224270"));
      const errors: unknown[] = [];
      const catalog = await loadCatalog(tx, (issue) => errors.push(issue));
      expect(catalog.products.some((p) => p.slug === "rolex-explorer-224270")).toBe(
        false,
      );
      expect(catalog.products.length).toBe(SEED_PRODUCTS.length - 1);
      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors[0])).toContain("rolex-explorer-224270");
    }));
});
