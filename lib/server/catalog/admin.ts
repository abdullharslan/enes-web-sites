import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { brands, categories, productMedia, products, revisions } from "@/db/schema";
import {
  brandInput,
  categoryInput,
  productInput,
  type BrandInput,
  type CategoryInput,
  type ProductInput,
} from "@/lib/admin/schemas";
import {
  DuplicateSlugError,
  RecordNotFoundError,
  VersionConflictError,
  finishChange,
  replayedResult,
  restoreComment,
  type SaveOptions,
  type SaveResult,
} from "@/lib/server/versioning";

/*
 * Write side of the catalog. Every change runs inside the caller's transaction
 * and, together with it, appends exactly one revision and one audit event.
 */

export {
  DuplicateSlugError,
  RecordNotFoundError,
  VersionConflictError,
  type SaveOptions,
  type SaveResult,
} from "@/lib/server/versioning";

export type CatalogEntity = "brand" | "category" | "product";

/** Catalog rows carry their own id; delegate to the shared versioning rules. */
const finish = (
  tx: Executor,
  args: {
    entityType: CatalogEntity;
    row: Record<string, unknown> & { id: string; currentVersion: number };
    actorId: string | null;
    action: string;
    extra?: Record<string, unknown>;
    options?: SaveOptions;
  },
) => finishChange(tx, { ...args, entityId: args.row.id });

const nextVersion = (
  column:
    | typeof brands.currentVersion
    | typeof categories.currentVersion
    | typeof products.currentVersion,
) => sql<number>`${column} + 1`;

async function assertSlugFree(
  tx: Executor,
  table: typeof brands | typeof categories | typeof products,
  slug: string,
  id: string | null,
): Promise<void> {
  const [clash] = await tx
    .select({ id: table.id })
    .from(table)
    .where(id ? and(eq(table.slug, slug), ne(table.id, id)) : eq(table.slug, slug));
  if (clash) throw new DuplicateSlugError(slug);
}

async function conflictOrMissing(
  tx: Executor,
  table: typeof brands | typeof categories | typeof products,
  id: string,
): Promise<never> {
  const [exists] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id));
  throw exists ? new VersionConflictError() : new RecordNotFoundError(`No record ${id}`);
}

// ── Brands ───────────────────────────────────────────────────────────────────

type BrandValues = Omit<BrandInput, "expectedVersion"> & { heroMediaId?: string | null };

async function writeBrand(
  tx: Executor,
  id: string | null,
  values: BrandValues,
  expectedVersion: number,
): Promise<typeof brands.$inferSelect> {
  await assertSlugFree(tx, brands, values.slug, id);
  if (id === null) {
    const [row] = await tx
      .insert(brands)
      .values({ ...values, currentVersion: 1 })
      .returning();
    return row!;
  }
  const [row] = await tx
    .update(brands)
    .set({
      ...values,
      currentVersion: nextVersion(brands.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(brands.id, id), eq(brands.currentVersion, expectedVersion)))
    .returning();
  return row ?? conflictOrMissing(tx, brands, id);
}

export async function saveBrand(
  tx: Executor,
  actorId: string | null,
  id: string | null,
  input: BrandInput,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const replay = await replayedResult(tx, options.idempotencyKey);
  if (replay) return replay;
  const { expectedVersion, ...values } = brandInput.parse(input);
  const row = await writeBrand(tx, id, values, expectedVersion);
  return finish(tx, {
    entityType: "brand",
    row,
    actorId,
    action: id ? "updated" : "created",
    options,
  });
}

export async function setBrandHero(
  tx: Executor,
  actorId: string | null,
  brandId: string,
  mediaId: string | null,
): Promise<SaveResult> {
  const [row] = await tx
    .update(brands)
    .set({
      heroMediaId: mediaId,
      currentVersion: nextVersion(brands.currentVersion),
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brandId))
    .returning();
  if (!row) throw new RecordNotFoundError(`No brand ${brandId}`);
  return finish(tx, { entityType: "brand", row, actorId, action: "image-changed" });
}

// ── Categories ───────────────────────────────────────────────────────────────

type CategoryValues = Omit<CategoryInput, "expectedVersion"> & {
  tileMediaId?: string | null;
};

async function writeCategory(
  tx: Executor,
  id: string | null,
  values: CategoryValues,
  expectedVersion: number,
): Promise<typeof categories.$inferSelect> {
  await assertSlugFree(tx, categories, values.slug, id);
  if (id === null) {
    const [row] = await tx
      .insert(categories)
      .values({ ...values, currentVersion: 1 })
      .returning();
    return row!;
  }
  const [row] = await tx
    .update(categories)
    .set({
      ...values,
      currentVersion: nextVersion(categories.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, id), eq(categories.currentVersion, expectedVersion)))
    .returning();
  return row ?? conflictOrMissing(tx, categories, id);
}

export async function saveCategory(
  tx: Executor,
  actorId: string | null,
  id: string | null,
  input: CategoryInput,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const replay = await replayedResult(tx, options.idempotencyKey);
  if (replay) return replay;
  const { expectedVersion, ...values } = categoryInput.parse(input);
  const row = await writeCategory(tx, id, values, expectedVersion);
  return finish(tx, {
    entityType: "category",
    row,
    actorId,
    action: id ? "updated" : "created",
    options,
  });
}

export async function setCategoryTile(
  tx: Executor,
  actorId: string | null,
  categoryId: string,
  mediaId: string | null,
): Promise<SaveResult> {
  const [row] = await tx
    .update(categories)
    .set({
      tileMediaId: mediaId,
      currentVersion: nextVersion(categories.currentVersion),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, categoryId))
    .returning();
  if (!row) throw new RecordNotFoundError(`No category ${categoryId}`);
  return finish(tx, { entityType: "category", row, actorId, action: "image-changed" });
}

// ── Products ─────────────────────────────────────────────────────────────────

async function productMediaIds(tx: Executor, productId: string): Promise<string[]> {
  const links = await tx
    .select({ mediaId: productMedia.mediaId })
    .from(productMedia)
    .where(eq(productMedia.productId, productId))
    .orderBy(asc(productMedia.position));
  return links.map((l) => l.mediaId);
}

async function replaceProductMedia(
  tx: Executor,
  productId: string,
  mediaIds: readonly string[],
): Promise<void> {
  await tx.delete(productMedia).where(eq(productMedia.productId, productId));
  if (mediaIds.length) {
    await tx
      .insert(productMedia)
      .values(mediaIds.map((mediaId, position) => ({ productId, position, mediaId })));
  }
}

type ProductValues = Omit<ProductInput, "expectedVersion">;

async function writeProduct(
  tx: Executor,
  id: string | null,
  values: ProductValues,
  expectedVersion: number,
): Promise<typeof products.$inferSelect> {
  await assertSlugFree(tx, products, values.slug, id);
  if (id === null) {
    const [row] = await tx
      .insert(products)
      .values({ ...values, currentVersion: 1 })
      .returning();
    return row!;
  }
  const [row] = await tx
    .update(products)
    .set({
      ...values,
      currentVersion: nextVersion(products.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.currentVersion, expectedVersion)))
    .returning();
  return row ?? conflictOrMissing(tx, products, id);
}

export async function saveProduct(
  tx: Executor,
  actorId: string | null,
  id: string | null,
  input: ProductInput,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const replay = await replayedResult(tx, options.idempotencyKey);
  if (replay) return replay;
  const { expectedVersion, ...values } = productInput.parse(input);
  const row = await writeProduct(tx, id, values, expectedVersion);
  return finish(tx, {
    entityType: "product",
    row,
    actorId,
    action: id ? "updated" : "created",
    extra: { mediaIds: await productMediaIds(tx, row.id) },
    options,
  });
}

async function bumpProduct(
  tx: Executor,
  productId: string,
): Promise<typeof products.$inferSelect> {
  const [row] = await tx
    .update(products)
    .set({ currentVersion: nextVersion(products.currentVersion), updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!row) throw new RecordNotFoundError(`No product ${productId}`);
  return row;
}

export async function addProductImage(
  tx: Executor,
  actorId: string | null,
  productId: string,
  mediaId: string,
): Promise<SaveResult> {
  const row = await bumpProduct(tx, productId);
  const mediaIds = [
    ...(await productMediaIds(tx, productId)).filter((m) => m !== mediaId),
    mediaId,
  ];
  await replaceProductMedia(tx, productId, mediaIds);
  return finish(tx, {
    entityType: "product",
    row,
    actorId,
    action: "image-added",
    extra: { mediaIds },
  });
}

export async function removeProductImage(
  tx: Executor,
  actorId: string | null,
  productId: string,
  mediaId: string,
): Promise<SaveResult> {
  const row = await bumpProduct(tx, productId);
  const mediaIds = (await productMediaIds(tx, productId)).filter((m) => m !== mediaId);
  await replaceProductMedia(tx, productId, mediaIds);
  return finish(tx, {
    entityType: "product",
    row,
    actorId,
    action: "image-removed",
    extra: { mediaIds },
  });
}

// ── Restore ──────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Re-applies an old snapshot as a new version. The snapshot is re-validated
 * (fail-closed) and the full history stays intact.
 */
export async function restoreRevision(
  tx: Executor,
  actorId: string | null,
  entityType: CatalogEntity,
  entityId: string,
  version: number,
): Promise<SaveResult> {
  const [revision] = await tx
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.entityType, entityType),
        eq(revisions.entityId, entityId),
        eq(revisions.version, version),
      ),
    );
  if (!revision)
    throw new RecordNotFoundError(
      `Revision ${entityType}/${entityId}@v${version} not found`,
    );
  const data = revision.data;
  const options = { comment: restoreComment(version) };

  switch (entityType) {
    case "brand": {
      const [current] = await tx.select().from(brands).where(eq(brands.id, entityId));
      if (!current) throw new RecordNotFoundError(`No brand ${entityId}`);
      const { expectedVersion, ...values } = brandInput.parse({
        ...data,
        expectedVersion: current.currentVersion,
      });
      const row = await writeBrand(
        tx,
        entityId,
        { ...values, heroMediaId: str(data.heroMediaId) },
        expectedVersion,
      );
      return finish(tx, { entityType, row, actorId, action: "restored", options });
    }
    case "category": {
      const [current] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, entityId));
      if (!current) throw new RecordNotFoundError(`No category ${entityId}`);
      const { expectedVersion, ...values } = categoryInput.parse({
        ...data,
        expectedVersion: current.currentVersion,
      });
      const row = await writeCategory(
        tx,
        entityId,
        { ...values, tileMediaId: str(data.tileMediaId) },
        expectedVersion,
      );
      return finish(tx, { entityType, row, actorId, action: "restored", options });
    }
    case "product": {
      const [current] = await tx.select().from(products).where(eq(products.id, entityId));
      if (!current) throw new RecordNotFoundError(`No product ${entityId}`);
      const { expectedVersion, ...values } = productInput.parse({
        ...data,
        expectedVersion: current.currentVersion,
      });
      const mediaIds = Array.isArray(data.mediaIds)
        ? data.mediaIds.filter((m): m is string => typeof m === "string")
        : [];
      const row = await writeProduct(tx, entityId, values, expectedVersion);
      await replaceProductMedia(tx, entityId, mediaIds);
      return finish(tx, {
        entityType,
        row,
        actorId,
        action: "restored",
        extra: { mediaIds },
        options,
      });
    }
  }
}
