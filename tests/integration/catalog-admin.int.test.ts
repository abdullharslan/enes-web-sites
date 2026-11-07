import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, brands, productMedia, products } from "@/db/schema";
import { seedCatalog } from "@/db/seed";
import type { BrandInput, ProductInput } from "@/lib/admin/schemas";
import {
  addProductImage,
  moveProductImage,
  removeProductImage,
  restoreRevision,
  saveBrand,
  saveCategory,
  saveProduct,
  setBrandHero,
  VersionConflictError,
} from "@/lib/server/catalog/admin";
import { storeImage } from "@/lib/server/media/store";
import { listRevisions } from "@/lib/server/revisions";
import { closeTestDb, sampleJpeg, tempMediaRoot, withRollback } from "./helpers";

afterAll(closeTestDb);
let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

const actor = null;
const brand: BrandInput = {
  slug: "maison-test",
  name: "Maison Test",
  description: { de: "Erste Fassung" },
  sortOrder: 9,
  isVisible: true,
  expectedVersion: 0,
};

describe("saveBrand", () => {
  it("creates version 1 and records revision + audit in the same transaction", () =>
    withRollback(async (tx) => {
      const saved = await saveBrand(tx, actor, null, brand);
      expect(saved.version).toBe(1);
      const history = await listRevisions(tx, "brand", saved.id);
      expect(history.map((r) => [r.version, r.data.name])).toEqual([[1, "Maison Test"]]);
      const audit = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, saved.id));
      expect(audit.map((a) => a.action)).toEqual(["brand.created"]);
    }));

  it("increments the version on update", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      const updated = await saveBrand(tx, actor, created.id, {
        ...brand,
        name: "Maison Test II",
        expectedVersion: 1,
      });
      expect(updated.version).toBe(2);
      const [row] = await tx.select().from(brands).where(eq(brands.id, created.id));
      expect([row?.name, row?.currentVersion]).toEqual(["Maison Test II", 2]);
    }));

  it("rejects a stale edit (optimistic concurrency) without writing anything", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      await saveBrand(tx, actor, created.id, {
        ...brand,
        name: "Edited by A",
        expectedVersion: 1,
      });
      await expect(
        saveBrand(tx, actor, created.id, {
          ...brand,
          name: "Edited by B",
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(VersionConflictError);
      const [row] = await tx.select().from(brands).where(eq(brands.id, created.id));
      expect(row?.name).toBe("Edited by A");
      expect(await listRevisions(tx, "brand", created.id)).toHaveLength(2);
    }));

  it("does not create a second revision when the same request is retried", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      const first = await saveBrand(
        tx,
        actor,
        created.id,
        { ...brand, name: "Once", expectedVersion: 1 },
        { idempotencyKey: "req-42" },
      );
      const retry = await saveBrand(
        tx,
        actor,
        created.id,
        { ...brand, name: "Once", expectedVersion: 1 },
        { idempotencyKey: "req-42" },
      );
      expect(retry).toEqual(first);
      expect(await listRevisions(tx, "brand", created.id)).toHaveLength(2);
    }));
});

describe("restoreRevision", () => {
  it("brings back an old version as a new version; history is never rewritten", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      await saveBrand(tx, actor, created.id, {
        ...brand,
        name: "Renamed",
        description: {},
        expectedVersion: 1,
      });
      const restored = await restoreRevision(tx, actor, "brand", created.id, 1, 2);
      expect(restored.version).toBe(3);

      const [row] = await tx.select().from(brands).where(eq(brands.id, created.id));
      expect([row?.name, row?.description]).toEqual([
        "Maison Test",
        { de: "Erste Fassung" },
      ]);
      const history = await listRevisions(tx, "brand", created.id);
      expect(history.map((r) => r.version)).toEqual([3, 2, 1]);
      expect(history[0]?.comment).toBe("Wiederhergestellt aus v1");
    }));

  it("restores the hero image that was active in that version", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      const imageA = await storeImage(tx, media.root, {
        input: await sampleJpeg("#111111"),
        kind: "brand",
        entitySlug: brand.slug,
        alt: { de: "A" },
      });
      const imageB = await storeImage(tx, media.root, {
        input: await sampleJpeg("#eeeeee"),
        kind: "brand",
        entitySlug: brand.slug,
        alt: { de: "B" },
      });
      await setBrandHero(tx, actor, created.id, imageA.id, 1); // v2
      await setBrandHero(tx, actor, created.id, imageB.id, 2); // v3
      await restoreRevision(tx, actor, "brand", created.id, 2, 3); // v4
      const [row] = await tx.select().from(brands).where(eq(brands.id, created.id));
      expect(row?.heroMediaId).toBe(imageA.id);
    }));

  it("fails for an unknown version", () =>
    withRollback(async (tx) => {
      const created = await saveBrand(tx, actor, null, brand);
      await expect(
        restoreRevision(tx, actor, "brand", created.id, 99, 1),
      ).rejects.toThrow(/not found/i);
    }));
});

describe("products", () => {
  it("creates, attaches images in order, removes and restores them", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root });
      const [rolex] = await tx.select().from(brands).where(eq(brands.slug, "rolex"));
      const [anyProduct] = await tx.select().from(products).limit(1);
      const input: ProductInput = {
        slug: "rolex-gmt-master-ii",
        brandId: rolex!.id,
        categoryId: anyProduct!.categoryId,
        model: "GMT-Master II",
        reference: "126710BLRO",
        year: 2022,
        condition: "excellent",
        setItems: ["box"],
        material: { de: "Stahl" },
        dimensions: null,
        description: { de: "Pepsi-Lünette" },
        priceEur: 21500,
        status: "available",
        sortOrder: 0,
        isVisible: true,
        addedAt: "2026-10-14",
        expectedVersion: 0,
      };
      const created = await saveProduct(tx, actor, null, input);
      const one = await storeImage(tx, media.root, {
        input: await sampleJpeg("#222222"),
        kind: "product",
        entitySlug: input.slug,
        alt: { de: "1" },
      });
      const two = await storeImage(tx, media.root, {
        input: await sampleJpeg("#999999"),
        kind: "product",
        entitySlug: input.slug,
        alt: { de: "2" },
      });
      await addProductImage(tx, actor, created.id, one.id, 1); // v2
      await addProductImage(tx, actor, created.id, two.id, 2); // v3
      await removeProductImage(tx, actor, created.id, one.id, 3); // v4

      const linked = async () =>
        (
          await tx
            .select()
            .from(productMedia)
            .where(eq(productMedia.productId, created.id))
            .orderBy(productMedia.position)
        ).map((l) => l.mediaId);
      expect(await linked()).toEqual([two.id]);

      await restoreRevision(tx, actor, "product", created.id, 3, 4); // v5
      expect(await linked()).toEqual([one.id, two.id]);
      expect(
        (await listRevisions(tx, "product", created.id)).map((r) => r.version),
      ).toEqual([5, 4, 3, 2, 1]);
    }));

  it("refuses a duplicate slug with a clear error", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root });
      const [existing] = await tx.select().from(products).limit(1);
      await expect(
        saveProduct(tx, actor, null, {
          slug: existing!.slug,
          brandId: existing!.brandId,
          categoryId: existing!.categoryId,
          model: "Copy",
          reference: null,
          year: null,
          condition: "good",
          setItems: [],
          material: { de: "x" },
          dimensions: null,
          description: { de: "x" },
          priceEur: null,
          status: "available",
          sortOrder: 0,
          isVisible: true,
          addedAt: "2026-10-14",
          expectedVersion: 0,
        }),
      ).rejects.toThrow(/slug/i);
    }));
});

describe("idempotency key scope", () => {
  it("a key used for one entity type is never replayed for another", () =>
    withRollback(async (tx) => {
      const saved = await saveBrand(tx, null, null, brand, {
        idempotencyKey: "shared-key",
      });
      await expect(
        saveCategory(
          tx,
          null,
          null,
          {
            slug: "scope-test",
            name: { de: "Test" },
            sortOrder: 0,
            isVisible: true,
            expectedVersion: 0,
          },
          { idempotencyKey: "shared-key" },
        ),
      ).rejects.not.toEqual(saved);
    }));
});

describe("idempotency key scope (per record)", () => {
  it("a key used for brand A is never replayed as a save of brand B", () =>
    withRollback(async (tx) => {
      const a = await saveBrand(tx, null, null, { ...brand, slug: "brand-a" });
      const b = await saveBrand(tx, null, null, { ...brand, slug: "brand-b" });
      await saveBrand(
        tx,
        null,
        a.id,
        { ...brand, slug: "brand-a", name: "A2", expectedVersion: 1 },
        { idempotencyKey: "k-1" },
      );
      const result = saveBrand(
        tx,
        null,
        b.id,
        { ...brand, slug: "brand-b", name: "B2", expectedVersion: 1 },
        { idempotencyKey: "k-1" },
      );
      await expect(result).rejects.toThrow();
    }));
});

describe("moveProductImage", () => {
  it("reorders images (incl. choosing a cover) as new versions", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root });
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.slug, "rolex-explorer-224270"));
      const id = product!.id;
      const make = async (color: string) =>
        (
          await storeImage(tx, media.root, {
            input: await sampleJpeg(color),
            kind: "product",
            entitySlug: "rolex-explorer-224270",
            alt: { de: color },
          })
        ).id;
      const b = await make("#101010");
      const c = await make("#202020");
      const v = product!.currentVersion;
      await addProductImage(tx, null, id, b, v);
      await addProductImage(tx, null, id, c, v + 1);
      const linked = async () =>
        (
          await tx
            .select()
            .from(productMedia)
            .where(eq(productMedia.productId, id))
            .orderBy(productMedia.position)
        ).map((l) => l.mediaId);
      const [a] = await linked();

      await moveProductImage(tx, null, id, c, "first", v + 2);
      expect(await linked()).toEqual([c, a, b]);
      await moveProductImage(tx, null, id, a, "down", v + 3);
      expect(await linked()).toEqual([c, b, a]);
      const result = await moveProductImage(tx, null, id, b, "up", v + 4);
      expect(await linked()).toEqual([b, c, a]);
      expect(result.version).toBe(product!.currentVersion + 5);
    }));
});
