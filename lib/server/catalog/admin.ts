import { and, asc, eq, ne, sql } from "drizzle-orm";
import { moveItem, type MoveDirection } from "@/lib/catalog/order";
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
  NoChangeError,
  RecordNotFoundError,
  VersionConflictError,
  assertScopeUnchanged,
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

/** Locks the row for this transaction and returns its current version. */
async function lockVersion(
  tx: Executor,
  table: typeof brands | typeof categories | typeof products,
  id: string,
): Promise<number> {
  const [row] = await tx
    .select({ version: table.currentVersion })
    .from(table)
    .where(eq(table.id, id))
    .for("update");
  if (!row) throw new RecordNotFoundError(`No record ${id}`);
  return row.version;
}

/**
 * The version an edit-form save may write on: the form's own version, or a
 * newer one if only images changed since the form was loaded.
 */
async function fieldsBase(
  tx: Executor,
  table: typeof brands | typeof categories | typeof products,
  type: CatalogEntity,
  id: string,
  expectedVersion: number,
): Promise<number> {
  const current = await lockVersion(tx, table, id);
  await assertScopeUnchanged(tx, { type, id }, expectedVersion, current, "fields");
  return current;
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
  const base = await fieldsBase(tx, brands, "brand", id, expectedVersion);
  const [row] = await tx
    .update(brands)
    .set({
      ...values,
      currentVersion: nextVersion(brands.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(brands.id, id), eq(brands.currentVersion, base)))
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
  // Fixed lock order: the row first, then replayedResult's key lock (which is
  // where copies of a create, with no row yet, queue).
  if (id) await lockVersion(tx, brands, id);
  const replay = await replayedResult(tx, options.idempotencyKey, "brand", id);
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
  expectedVersion: number,
): Promise<SaveResult> {
  const current = await lockVersion(tx, brands, brandId);
  await assertScopeUnchanged(
    tx,
    { type: "brand", id: brandId },
    expectedVersion,
    current,
    "images",
  );
  const [existing] = await tx.select().from(brands).where(eq(brands.id, brandId));
  if (existing!.heroMediaId === mediaId)
    return { id: brandId, version: current, unchanged: true };
  const [row] = await tx
    .update(brands)
    .set({
      heroMediaId: mediaId,
      currentVersion: nextVersion(brands.currentVersion),
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brandId))
    .returning();
  return finish(tx, { entityType: "brand", row: row!, actorId, action: "image-changed" });
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
  const base = await fieldsBase(tx, categories, "category", id, expectedVersion);
  const [row] = await tx
    .update(categories)
    .set({
      ...values,
      currentVersion: nextVersion(categories.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, id), eq(categories.currentVersion, base)))
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
  // Fixed lock order: the row first, then replayedResult's key lock (which is
  // where copies of a create, with no row yet, queue).
  if (id) await lockVersion(tx, categories, id);
  const replay = await replayedResult(tx, options.idempotencyKey, "category", id);
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
  expectedVersion: number,
): Promise<SaveResult> {
  const current = await lockVersion(tx, categories, categoryId);
  await assertScopeUnchanged(
    tx,
    { type: "category", id: categoryId },
    expectedVersion,
    current,
    "images",
  );
  const [existing] = await tx
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (existing!.tileMediaId === mediaId)
    return { id: categoryId, version: current, unchanged: true };
  const [row] = await tx
    .update(categories)
    .set({
      tileMediaId: mediaId,
      currentVersion: nextVersion(categories.currentVersion),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, categoryId))
    .returning();
  return finish(tx, {
    entityType: "category",
    row: row!,
    actorId,
    action: "image-changed",
  });
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
  const base = await fieldsBase(tx, products, "product", id, expectedVersion);
  const [row] = await tx
    .update(products)
    .set({
      ...values,
      currentVersion: nextVersion(products.currentVersion),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.currentVersion, base)))
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
  // Fixed lock order: the row first, then replayedResult's key lock (which is
  // where copies of a create, with no row yet, queue).
  if (id) await lockVersion(tx, products, id);
  const replay = await replayedResult(tx, options.idempotencyKey, "product", id);
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

/**
 * One change to a product's image list, made from a page that showed version
 * `expectedVersion`. Refused if the list changed since (fields may have);
 * a change that leaves the list as it is writes no new version.
 */
async function changeProductImages(
  tx: Executor,
  actorId: string | null,
  productId: string,
  expectedVersion: number,
  action: "image-added" | "image-removed" | "images-reordered",
  next: (mediaIds: string[]) => string[],
): Promise<SaveResult> {
  const current = await lockVersion(tx, products, productId);
  await assertScopeUnchanged(
    tx,
    { type: "product", id: productId },
    expectedVersion,
    current,
    "images",
  );
  const before = await productMediaIds(tx, productId);
  const mediaIds = next(before);
  if (mediaIds.join() === before.join())
    return { id: productId, version: current, unchanged: true };
  const [row] = await tx
    .update(products)
    .set({ currentVersion: nextVersion(products.currentVersion), updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  await replaceProductMedia(tx, productId, mediaIds);
  return finish(tx, {
    entityType: "product",
    row: row!,
    actorId,
    action,
    extra: { mediaIds },
  });
}

export function addProductImage(
  tx: Executor,
  actorId: string | null,
  productId: string,
  mediaId: string,
  expectedVersion: number,
): Promise<SaveResult> {
  return changeProductImages(
    tx,
    actorId,
    productId,
    expectedVersion,
    "image-added",
    (ids) => (ids.includes(mediaId) ? ids : [...ids, mediaId]),
  );
}

export function removeProductImage(
  tx: Executor,
  actorId: string | null,
  productId: string,
  mediaId: string,
  expectedVersion: number,
): Promise<SaveResult> {
  return changeProductImages(
    tx,
    actorId,
    productId,
    expectedVersion,
    "image-removed",
    (ids) => ids.filter((id) => id !== mediaId),
  );
}

// ── Restore ──────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * A restore is made from a history page that showed version `expectedVersion`:
 * it is refused if anything changed since (it replaces every field), and
 * pointless for the version that is already current.
 */
async function restoreBase(
  tx: Executor,
  table: typeof brands | typeof categories | typeof products,
  id: string,
  version: number,
  expectedVersion: number,
): Promise<number> {
  const current = await lockVersion(tx, table, id);
  if (expectedVersion !== current) throw new VersionConflictError();
  if (version === current) throw new NoChangeError();
  return current;
}

/**
 * Re-applies an old snapshot as a new version. The snapshot is re-validated
 * (fail-closed) and the full history stays intact. Publication state — sale
 * status and visibility — is never part of a restore: it stays as it is now
 * and is changed only on purpose in the edit form.
 */
export async function restoreRevision(
  tx: Executor,
  actorId: string | null,
  entityType: CatalogEntity,
  entityId: string,
  version: number,
  expectedVersion: number,
  idempotencyKey?: string,
): Promise<SaveResult> {
  // A repeated click on the same restore replays the first result.
  const table =
    entityType === "brand" ? brands : entityType === "category" ? categories : products;
  const locked = await lockVersion(tx, table, entityId);
  const replay = await replayedResult(tx, idempotencyKey, entityType, entityId);
  // A replay is only an answer while nothing happened since; a page kept in
  // the browser history with the same key is an outdated page.
  if (replay && replay.version !== locked) throw new VersionConflictError();
  if (replay) return replay;
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
  const options = { comment: restoreComment(version), idempotencyKey };

  switch (entityType) {
    case "brand": {
      const base = await restoreBase(tx, brands, entityId, version, expectedVersion);
      const [current] = await tx.select().from(brands).where(eq(brands.id, entityId));
      const values = brandInput.omit({ expectedVersion: true }).parse({
        ...data,
        isVisible: current!.isVisible,
      });
      const row = await writeBrand(
        tx,
        entityId,
        { ...values, heroMediaId: str(data.heroMediaId) },
        base,
      );
      return finish(tx, { entityType, row, actorId, action: "restored", options });
    }
    case "category": {
      const base = await restoreBase(tx, categories, entityId, version, expectedVersion);
      const [current] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, entityId));
      const values = categoryInput.omit({ expectedVersion: true }).parse({
        ...data,
        isVisible: current!.isVisible,
      });
      const row = await writeCategory(
        tx,
        entityId,
        { ...values, tileMediaId: str(data.tileMediaId) },
        base,
      );
      return finish(tx, { entityType, row, actorId, action: "restored", options });
    }
    case "product": {
      const base = await restoreBase(tx, products, entityId, version, expectedVersion);
      const [current] = await tx.select().from(products).where(eq(products.id, entityId));
      const values = productInput.omit({ expectedVersion: true }).parse({
        ...data,
        status: current!.status,
        isVisible: current!.isVisible,
      });
      const mediaIds = Array.isArray(data.mediaIds)
        ? data.mediaIds.filter((m): m is string => typeof m === "string")
        : [];
      const row = await writeProduct(tx, entityId, values, base);
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

/** The stored slug of a catalog record (never trust a slug sent by the client). */
export async function catalogSlug(
  tx: Executor,
  entity: CatalogEntity,
  id: string,
): Promise<string> {
  const table =
    entity === "brand" ? brands : entity === "category" ? categories : products;
  const [row] = await tx.select({ slug: table.slug }).from(table).where(eq(table.id, id));
  if (!row) throw new RecordNotFoundError(`No ${entity} ${id}`);
  return row.slug;
}

/** Reorders a product's images (e.g. choose the cover with "first") as a new version. */
export function moveProductImage(
  tx: Executor,
  actorId: string | null,
  productId: string,
  mediaId: string,
  direction: MoveDirection,
  expectedVersion: number,
): Promise<SaveResult> {
  return changeProductImages(
    tx,
    actorId,
    productId,
    expectedVersion,
    "images-reordered",
    (ids) => moveItem(ids, mediaId, direction),
  );
}
