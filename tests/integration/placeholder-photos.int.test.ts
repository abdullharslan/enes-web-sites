import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { productMedia, products } from "@/db/schema";
import { seedCatalog } from "@/db/seed";
import { addProductImage } from "@/lib/server/catalog/admin";
import { detachPhotosBySha } from "@/lib/server/catalog/maintenance";
import { storeImage } from "@/lib/server/media/store";
import { listRevisions } from "@/lib/server/revisions";
import { closeTestDb, sampleJpeg, tempMediaRoot, withRollback } from "./helpers";

afterAll(closeTestDb);
let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

const SLUG = "rolex-explorer-224270";

describe("detachPhotosBySha (old placeholder copies)", () => {
  it("detaches only the matching photo, as a new audited version, idempotently", () =>
    withRollback(async (tx) => {
      await seedCatalog(tx, { mediaRoot: media.root });
      const [product] = await tx.select().from(products).where(eq(products.slug, SLUG));
      const before = await tx
        .select()
        .from(productMedia)
        .where(eq(productMedia.productId, product!.id));
      expect(before.length).toBeGreaterThan(0);

      const placeholderBytes = await sampleJpeg("#0a0a0a");
      const copy = await storeImage(tx, media.root, {
        input: placeholderBytes,
        kind: "product",
        entitySlug: SLUG,
        alt: { de: "Platzhalter" },
      });
      await addProductImage(tx, null, product!.id, copy.id, product!.currentVersion);
      const sha = createHash("sha256").update(placeholderBytes).digest("hex");

      expect(await detachPhotosBySha(tx, sha)).toBe(1);

      const after = await tx
        .select({ mediaId: productMedia.mediaId })
        .from(productMedia)
        .where(eq(productMedia.productId, product!.id));
      expect(after.map((r) => r.mediaId)).toEqual(before.map((r) => r.mediaId));
      const [latest] = await listRevisions(tx, "product", product!.id);
      expect(latest?.data).toMatchObject({ mediaIds: before.map((r) => r.mediaId) });

      // Running it again changes nothing.
      expect(await detachPhotosBySha(tx, sha)).toBe(0);
    }));
});
