import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Executor } from "@/db/connection";
import {
  brands,
  categories,
  contentBlocks,
  journalEntries,
  productMedia,
  products,
} from "@/db/schema";
import { seedCatalog } from "@/db/seed";
import { seedContent } from "@/db/seed-content";
import type { ProductInput } from "@/lib/admin/schemas";
import {
  addProductImage,
  moveProductImage,
  removeProductImage,
  saveBrand,
  saveCategory,
  saveProduct,
  setBrandHero,
  setCategoryTile,
} from "@/lib/server/catalog/admin";
import {
  saveContentBlock,
  saveJournalEntry,
  setContentImage,
  setJournalImage,
} from "@/lib/server/content/admin";
import { blockDefaults } from "@/lib/content/blocks";
import { restoreAny } from "@/lib/server/history";
import { storeImage } from "@/lib/server/media/store";
import { listRevisions } from "@/lib/server/revisions";
import { NoChangeError, VersionConflictError } from "@/lib/server/versioning";
import { closeTestDb, sampleJpeg, tempMediaRoot, withRollback } from "./helpers";

/*
 * Concurrency per scope: an edit form ("fields") and the image controls
 * ("images") of the same record must not invalidate each other, while a
 * change by someone else in the SAME scope is still refused. Restores never
 * overwrite newer work and never change publication state.
 */

afterAll(closeTestDb);
let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

async function newProduct(tx: Executor) {
  await seedCatalog(tx, { mediaRoot: media.root });
  const [brand] = await tx.select().from(brands).where(eq(brands.slug, "rolex"));
  const [any] = await tx.select().from(products).limit(1);
  const input: ProductInput = {
    slug: "rolex-scope-test",
    brandId: brand!.id,
    categoryId: any!.categoryId,
    model: "Scope Test",
    reference: null,
    year: 2022,
    condition: "excellent",
    setItems: [],
    material: { de: "Stahl" },
    dimensions: null,
    description: { de: "Erste Fassung" },
    priceEur: 10000,
    status: "available",
    sortOrder: 0,
    isVisible: true,
    addedAt: "2026-11-08",
    expectedVersion: 0,
  };
  const { id } = await saveProduct(tx, null, null, input);
  const image = async (color: string) =>
    (
      await storeImage(tx, media.root, {
        input: await sampleJpeg(color),
        kind: "product",
        entitySlug: input.slug,
        alt: { de: color },
      })
    ).id;
  return { id, input, image };
}

const version = async (tx: Executor, id: string) =>
  (await tx.select().from(products).where(eq(products.id, id)))[0]!.currentVersion;
const linked = async (tx: Executor, id: string) =>
  (
    await tx
      .select()
      .from(productMedia)
      .where(eq(productMedia.productId, id))
      .orderBy(productMedia.position)
  ).map((l) => l.mediaId);

describe("edit form vs image controls (product)", () => {
  it("saves a form opened before an image upload, keeping the new image", () =>
    withRollback(async (tx) => {
      const { id, input, image } = await newProduct(tx); // v1
      const photo = await image("#111111");
      await addProductImage(tx, null, id, photo, 1); // v2 (images scope)
      // The form was loaded at v1 and only knows the fields.
      const saved = await saveProduct(tx, null, id, {
        ...input,
        priceEur: 12000,
        expectedVersion: 1,
      });
      expect(saved.version).toBe(3);
      expect(await linked(tx, id)).toEqual([photo]);
    }));

  it("still refuses a form when someone else changed the fields meanwhile", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1
      await saveProduct(tx, null, id, { ...input, priceEur: 11000, expectedVersion: 1 }); // v2
      await expect(
        saveProduct(tx, null, id, { ...input, model: "Mine", expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(VersionConflictError);
    }));

  it("applies an image move made on a page loaded before a field edit", () =>
    withRollback(async (tx) => {
      const { id, input, image } = await newProduct(tx);
      const a = await image("#111111");
      const b = await image("#222222");
      await addProductImage(tx, null, id, a, 1); // v2
      await addProductImage(tx, null, id, b, 2); // v3
      await saveProduct(tx, null, id, { ...input, priceEur: 9000, expectedVersion: 3 }); // v4
      await moveProductImage(tx, null, id, b, "first", 3);
      expect(await linked(tx, id)).toEqual([b, a]);
    }));

  it("refuses an image change based on an outdated image list", () =>
    withRollback(async (tx) => {
      const { id, image } = await newProduct(tx);
      const a = await image("#111111");
      const b = await image("#222222");
      const c = await image("#333333");
      await addProductImage(tx, null, id, a, 1); // v2
      await addProductImage(tx, null, id, b, 2); // v3
      await addProductImage(tx, null, id, c, 3); // v4: [a, b, c]
      // Another tab removes b …
      await removeProductImage(tx, null, id, b, 4); // v5
      // … this tab still shows [a, b, c] (v4) and moves a down.
      await expect(moveProductImage(tx, null, id, a, "down", 4)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
      expect(await linked(tx, id)).toEqual([a, c]);
    }));

  it("refuses versions that never existed", () =>
    withRollback(async (tx) => {
      const { id, image } = await newProduct(tx);
      const a = await image("#111111");
      for (const expected of [0, 2, 99]) {
        await expect(addProductImage(tx, null, id, a, expected)).rejects.toBeInstanceOf(
          VersionConflictError,
        );
      }
    }));

  it("writes no version for image operations that change nothing", () =>
    withRollback(async (tx) => {
      const { id, image } = await newProduct(tx);
      const a = await image("#111111");
      const b = await image("#222222");
      await addProductImage(tx, null, id, a, 1); // v2
      await addProductImage(tx, null, id, b, 2); // v3: [a, b]
      const before = (await listRevisions(tx, "product", id)).length;

      expect((await moveProductImage(tx, null, id, a, "up", 3)).version).toBe(3);
      expect((await moveProductImage(tx, null, id, b, "down", 3)).version).toBe(3);
      expect((await moveProductImage(tx, null, id, a, "first", 3)).version).toBe(3);
      expect(
        (await removeProductImage(tx, null, id, await image("#999999"), 3)).version,
      ).toBe(3);
      expect((await addProductImage(tx, null, id, b, 3)).version).toBe(3);

      expect(await version(tx, id)).toBe(3);
      expect(await listRevisions(tx, "product", id)).toHaveLength(before);
      expect(await linked(tx, id)).toEqual([a, b]);
    }));
});

describe("edit form vs image controls (brand hero)", () => {
  it("lets a hero upload and a form edit pass each other, but not two hero changes", () =>
    withRollback(async (tx) => {
      const brand = await saveBrand(tx, null, null, {
        slug: "scope-brand",
        description: { de: "Marke" },
        name: "Scope Brand",
        sortOrder: 0,
        isVisible: true,
        expectedVersion: 0,
      }); // v1
      const hero = async (color: string) =>
        (
          await storeImage(tx, media.root, {
            input: await sampleJpeg(color),
            kind: "brand",
            entitySlug: "scope-brand",
            alt: { de: color },
          })
        ).id;
      await saveBrand(tx, null, brand.id, {
        slug: "scope-brand",
        description: { de: "Marke" },
        name: "Renamed",
        sortOrder: 0,
        isVisible: true,
        expectedVersion: 1,
      }); // v2 (fields)
      await setBrandHero(tx, null, brand.id, await hero("#111111"), 1); // v3: page from v1
      await expect(
        setBrandHero(tx, null, brand.id, await hero("#222222"), 2),
      ).rejects.toBeInstanceOf(VersionConflictError);
    }));
});

describe("content blocks", () => {
  it("a text save never overwrites the image (even from a form opened before the upload)", () =>
    withRollback(async (tx) => {
      await seedContent(tx, { mediaRoot: media.root });
      const [hero] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      const loaded = hero!.currentVersion;
      const replacement = await storeImage(tx, media.root, {
        input: await sampleJpeg("#123456"),
        kind: "home",
        entitySlug: "home-hero",
        alt: { de: "neu" },
      });
      await setContentImage(tx, null, "home.hero", "image", replacement.id, loaded);

      // The text form posts no image field and still holds the old version.
      const { image: _image, ...text } = hero!.data;
      void _image;
      await saveContentBlock(tx, null, "home.hero", { ...text, expectedVersion: loaded });

      const [after] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      expect(after!.data.image).toBe(replacement.id);
      expect(after!.currentVersion).toBe(loaded + 2);
    }));
});

describe("restore", () => {
  it("is refused when the record changed after the history page was loaded", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1
      await saveProduct(tx, null, id, { ...input, priceEur: 11000, expectedVersion: 1 }); // v2
      // History page loaded at v2, then someone saves v3.
      await saveProduct(tx, null, id, { ...input, priceEur: 12000, expectedVersion: 2 });
      await expect(restoreAny(tx, null, "product", id, 1, 2)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    }));

  it("restores content but keeps the current sale status and visibility", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1: available, visible
      await saveProduct(tx, null, id, {
        ...input,
        description: { de: "Tippfehler" },
        status: "sold",
        isVisible: false,
        expectedVersion: 1,
      }); // v2
      await restoreAny(tx, null, "product", id, 1, 2); // v3
      const [row] = await tx.select().from(products).where(eq(products.id, id));
      expect(row!.description).toEqual({ de: "Erste Fassung" });
      expect([row!.status, row!.isVisible]).toEqual(["sold", false]);
    }));

  it("keeps a hidden brand hidden", () =>
    withRollback(async (tx) => {
      const brand = {
        slug: "hide-me",
        name: "A",
        description: { de: "Marke" },
        sortOrder: 0,
        isVisible: true,
      };
      const { id } = await saveBrand(tx, null, null, { ...brand, expectedVersion: 0 });
      await saveBrand(tx, null, id, {
        ...brand,
        name: "B",
        isVisible: false,
        expectedVersion: 1,
      });
      await restoreAny(tx, null, "brand", id, 1, 2);
      const [row] = await tx.select().from(brands).where(eq(brands.id, id));
      expect([row!.name, row!.isVisible]).toEqual(["A", false]);
    }));

  it("refuses to 'restore' the current version", () =>
    withRollback(async (tx) => {
      const { id } = await newProduct(tx);
      await expect(restoreAny(tx, null, "product", id, 1, 1)).rejects.toBeInstanceOf(
        NoChangeError,
      );
    }));
});

// ── Every image slot follows the same scope rules ────────────────────────────

const imageOf =
  (tx: Executor, kind: "category" | "journal" | "home", slug: string) =>
  async (color: string) =>
    (
      await storeImage(tx, media.root, {
        input: await sampleJpeg(color),
        kind,
        entitySlug: slug,
        alt: { de: color },
      })
    ).id;

describe("category tile and journal image", () => {
  it("category: a tile upload passes a field edit, a second stale tile upload does not", () =>
    withRollback(async (tx) => {
      const category = {
        slug: "scope-cat",
        name: { de: "Kategorie" },
        sortOrder: 0,
        isVisible: true,
      };
      const { id } = await saveCategory(tx, null, null, {
        ...category,
        expectedVersion: 0,
      });
      await saveCategory(tx, null, id, {
        ...category,
        name: { de: "Neu" },
        expectedVersion: 1,
      }); // v2 fields
      const tile = imageOf(tx, "category", "scope-cat");
      await setCategoryTile(tx, null, id, await tile("#111111"), 1); // v3
      await expect(
        setCategoryTile(tx, null, id, await tile("#222222"), 2),
      ).rejects.toBeInstanceOf(VersionConflictError);
    }));

  it("journal: same rules for the entry image", () =>
    withRollback(async (tx) => {
      const entry = {
        slug: "scope-journal",
        publishedAt: "2026-11-08",
        title: { de: "Titel" },
        excerpt: { de: "Text" },
        isVisible: true,
      };
      const { id } = await saveJournalEntry(tx, null, null, {
        ...entry,
        expectedVersion: 0,
      });
      await saveJournalEntry(tx, null, id, {
        ...entry,
        excerpt: { de: "Neu" },
        expectedVersion: 1,
      }); // v2 fields
      const image = imageOf(tx, "journal", "scope-journal");
      await setJournalImage(tx, null, id, await image("#111111"), 1); // v3
      await expect(
        setJournalImage(tx, null, id, await image("#222222"), 2),
      ).rejects.toBeInstanceOf(VersionConflictError);
    }));
});

describe("content block images", () => {
  async function hero(tx: Executor) {
    await seedContent(tx, { mediaRoot: media.root });
    const [row] = await tx
      .select()
      .from(contentBlocks)
      .where(eq(contentBlocks.key, "home.hero"));
    return row!;
  }

  it("refuses a second upload from a page that showed the old image", () =>
    withRollback(async (tx) => {
      const { currentVersion: loaded } = await hero(tx);
      const image = imageOf(tx, "home", "home-hero");
      await setContentImage(
        tx,
        null,
        "home.hero",
        "image",
        await image("#111111"),
        loaded,
      );
      await expect(
        setContentImage(tx, null, "home.hero", "image", await image("#222222"), loaded),
      ).rejects.toBeInstanceOf(VersionConflictError);
    }));

  it("writes no version when the same image is set again", () =>
    withRollback(async (tx) => {
      const { currentVersion: loaded, data } = await hero(tx);
      const result = await setContentImage(
        tx,
        null,
        "home.hero",
        "image",
        data.image as string,
        loaded,
      );
      expect(result).toMatchObject({ version: loaded, unchanged: true });
      expect((await listRevisions(tx, "content", "home.hero")).length).toBe(loaded);
    }));
});

describe("restore: content and journal (strict), publication state everywhere", () => {
  it("content: refused when only an image changed after the history page was loaded", () =>
    withRollback(async (tx) => {
      await seedContent(tx, { mediaRoot: media.root });
      const [row] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      const loaded = row!.currentVersion;
      await saveContentBlock(tx, null, "home.hero", {
        ...row!.data,
        title: { de: "Neu" },
        expectedVersion: loaded,
      }); // loaded + 1
      // History page shows loaded + 1; then an image is uploaded elsewhere.
      const image = imageOf(tx, "home", "home-hero");
      await setContentImage(
        tx,
        null,
        "home.hero",
        "image",
        await image("#abcdef"),
        loaded + 1,
      );
      await expect(
        restoreAny(tx, null, "content", "home.hero", loaded, loaded + 1),
      ).rejects.toBeInstanceOf(VersionConflictError);
      await expect(
        restoreAny(tx, null, "content", "home.hero", loaded + 2, loaded + 2),
      ).rejects.toBeInstanceOf(NoChangeError);
    }));

  it("journal: strict version, no-change, and visibility kept", () =>
    withRollback(async (tx) => {
      const entry = {
        slug: "restore-journal",
        publishedAt: "2026-11-08",
        title: { de: "Erst" },
        excerpt: { de: "Text" },
        isVisible: true,
      };
      const { id } = await saveJournalEntry(tx, null, null, {
        ...entry,
        expectedVersion: 0,
      });
      await saveJournalEntry(tx, null, id, {
        ...entry,
        title: { de: "Zweit" },
        isVisible: false,
        expectedVersion: 1,
      }); // v2, hidden
      await expect(restoreAny(tx, null, "journal", id, 1, 1)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
      await expect(restoreAny(tx, null, "journal", id, 2, 2)).rejects.toBeInstanceOf(
        NoChangeError,
      );
      await restoreAny(tx, null, "journal", id, 1, 2);
      const [row] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, id));
      expect([row!.title, row!.isVisible]).toEqual([{ de: "Erst" }, false]);
    }));

  it("category: visibility kept", () =>
    withRollback(async (tx) => {
      const category = {
        slug: "restore-cat",
        name: { de: "A" },
        sortOrder: 0,
        isVisible: true,
      };
      const { id } = await saveCategory(tx, null, null, {
        ...category,
        expectedVersion: 0,
      });
      await saveCategory(tx, null, id, {
        ...category,
        name: { de: "B" },
        isVisible: false,
        expectedVersion: 1,
      });
      await restoreAny(tx, null, "category", id, 1, 2);
      const [row] = await tx.select().from(categories).where(eq(categories.id, id));
      expect([row!.name, row!.isVisible]).toEqual([{ de: "A" }, false]);
    }));

  it("a repeated restore request (same key) restores once", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1
      await saveProduct(tx, null, id, { ...input, priceEur: 11000, expectedVersion: 1 }); // v2
      const key = "8b7c6a5e-1d2f-4a3b-9c8d-7e6f5a4b3c2d";
      const first = await restoreAny(tx, null, "product", id, 1, 2, key);
      const again = await restoreAny(tx, null, "product", id, 1, 2, key);
      expect(again).toEqual(first);
      expect(await listRevisions(tx, "product", id)).toHaveLength(3);
    }));
});

describe("only the end states count", () => {
  it("a change that was undone in between (A → B → A) is not a conflict", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1: price 10000
      await saveProduct(tx, null, id, { ...input, priceEur: 11000, expectedVersion: 1 }); // v2
      await saveProduct(tx, null, id, { ...input, expectedVersion: 2 }); // v3: back to 10000
      // A form still showing v1 saw exactly these fields: nothing it saw was lost.
      const saved = await saveProduct(tx, null, id, {
        ...input,
        model: "From v1",
        expectedVersion: 1,
      });
      expect(saved.version).toBe(4);
    }));
});

describe("re-review: restore edge cases", () => {
  it("a replayed restore from a page kept in the browser history is refused, not 'successful'", () =>
    withRollback(async (tx) => {
      const { id, input } = await newProduct(tx); // v1
      await saveProduct(tx, null, id, { ...input, priceEur: 11000, expectedVersion: 1 }); // v2
      const key = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
      await restoreAny(tx, null, "product", id, 1, 2, key); // v3
      await saveProduct(tx, null, id, { ...input, priceEur: 12000, expectedVersion: 3 }); // v4
      // Back button: the old history page (v2, same key) is used again.
      await expect(restoreAny(tx, null, "product", id, 1, 2, key)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    }));

  it("journal: same for a kept page; and an outdated page beats 'already current'", () =>
    withRollback(async (tx) => {
      const entry = {
        slug: "replay-journal",
        publishedAt: "2026-11-08",
        title: { de: "Eins" },
        excerpt: { de: "Text" },
        isVisible: true,
      };
      const { id } = await saveJournalEntry(tx, null, null, {
        ...entry,
        expectedVersion: 0,
      });
      await saveJournalEntry(tx, null, id, {
        ...entry,
        title: { de: "Zwei" },
        expectedVersion: 1,
      }); // v2
      // Restoring the current version from a page that showed v1: outdated page first.
      await expect(restoreAny(tx, null, "journal", id, 2, 1)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
      const key = "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e";
      await restoreAny(tx, null, "journal", id, 1, 2, key); // v3
      await saveJournalEntry(tx, null, id, {
        ...entry,
        title: { de: "Drei" },
        expectedVersion: 3,
      }); // v4
      await expect(restoreAny(tx, null, "journal", id, 1, 2, key)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    }));

  it("category: outdated page and 'already current' are refused", () =>
    withRollback(async (tx) => {
      const category = {
        slug: "strict-cat",
        name: { de: "A" },
        sortOrder: 0,
        isVisible: true,
      };
      const { id } = await saveCategory(tx, null, null, {
        ...category,
        expectedVersion: 0,
      });
      await saveCategory(tx, null, id, {
        ...category,
        name: { de: "B" },
        expectedVersion: 1,
      });
      await expect(restoreAny(tx, null, "category", id, 1, 1)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
      await expect(restoreAny(tx, null, "category", id, 2, 2)).rejects.toBeInstanceOf(
        NoChangeError,
      );
    }));

  it("restoring a block version from before its first image empties the image again", () =>
    withRollback(async (tx) => {
      const text = Object.fromEntries(
        Object.entries(blockDefaults("page.about")).filter(([key]) => key !== "image"),
      );
      await saveContentBlock(tx, null, "page.about", { ...text, expectedVersion: 0 }); // v1, no image
      const image = imageOf(tx, "home", "page-about");
      await setContentImage(tx, null, "page.about", "image", await image("#777777"), 1); // v2
      await restoreAny(tx, null, "content", "page.about", 1, 2); // v3
      const [row] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "page.about"));
      expect(row!.data.image ?? null).toBeNull();
    }));

  it("catalog no-ops report 'unchanged' (no 'version saved' message)", () =>
    withRollback(async (tx) => {
      const brand = await saveBrand(tx, null, null, {
        slug: "noop-brand",
        name: "Noop",
        description: { de: "x" },
        sortOrder: 0,
        isVisible: true,
        expectedVersion: 0,
      });
      const hero = (
        await storeImage(tx, media.root, {
          input: await sampleJpeg("#010101"),
          kind: "brand",
          entitySlug: "noop-brand",
          alt: { de: "h" },
        })
      ).id;
      await setBrandHero(tx, null, brand.id, hero, 1); // v2
      expect(await setBrandHero(tx, null, brand.id, hero, 2)).toEqual({
        id: brand.id,
        version: 2,
        unchanged: true,
      });
    }));
});
