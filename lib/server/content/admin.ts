import { and, eq, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { contentBlocks, journalEntries, revisions } from "@/db/schema";
import { journalInput, type JournalInput } from "@/lib/admin/schemas";
import {
  CONTENT_BLOCKS,
  blockInputSchema,
  type ContentKey,
  type FieldDef,
} from "@/lib/content/blocks";
import {
  DuplicateSlugError,
  NoChangeError,
  RecordNotFoundError,
  VersionConflictError,
  assertScopeUnchanged,
  finishChange,
  replayedResult,
  restoreComment,
  type ChangeScope,
  type SaveOptions,
  type SaveResult,
} from "@/lib/server/versioning";

// ── Content blocks ───────────────────────────────────────────────────────────

const imageFieldsOf = (key: ContentKey) =>
  new Set(
    (CONTENT_BLOCKS[key].fields as readonly FieldDef[])
      .filter((f) => f.kind === "image")
      .map((f) => f.key),
  );

async function lockBlock(tx: Executor, key: ContentKey) {
  const [row] = await tx
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.key, key))
    .for("update");
  return row ?? null;
}

/**
 * Validates (strict, per block definition) and saves a new version of a
 * content block. Image fields the input leaves out keep their current value,
 * so a text save never touches an image; `scope` decides which concurrent
 * changes since `expectedVersion` are tolerated (see assertScopeUnchanged).
 */
export async function saveContentBlock(
  tx: Executor,
  actorId: string | null,
  key: ContentKey,
  input: Record<string, unknown> & { expectedVersion: number },
  options: SaveOptions = {},
  scope: ChangeScope | "exact" = "fields",
): Promise<SaveResult> {
  // Fixed lock order: the row first, then replayedResult's key lock (copies of
  // a first save, when no row exists yet, queue on the key lock).
  const current = await lockBlock(tx, key);
  const replay = await replayedResult(tx, options.idempotencyKey, "content", key);
  if (replay) return replay;
  const { expectedVersion, ...rest } = input;
  const images = imageFieldsOf(key);
  // A text save keeps the current images. A restore ("exact") reproduces the
  // old version as it was: an image it did not have stays absent (= empty).
  const kept =
    scope === "exact"
      ? {}
      : Object.fromEntries(
          [...images]
            .filter((field) => !(field in rest) && current && field in current.data)
            .map((field) => [field, current!.data[field]]),
        );
  const data = blockInputSchema(key).parse({ ...kept, ...rest });

  let row: typeof contentBlocks.$inferSelect;
  if (!current) {
    if (expectedVersion !== 0) throw new VersionConflictError();
    [row] = (await tx
      .insert(contentBlocks)
      .values({ key, data, currentVersion: 1 })
      .returning()) as [typeof contentBlocks.$inferSelect];
  } else {
    if (scope === "exact") {
      if (expectedVersion !== current.currentVersion) throw new VersionConflictError();
    } else {
      await assertScopeUnchanged(
        tx,
        { type: "content", id: key },
        expectedVersion,
        current.currentVersion,
        scope,
        (field) => images.has(field),
      );
    }
    [row] = (await tx
      .update(contentBlocks)
      .set({
        data,
        currentVersion: sql`${contentBlocks.currentVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(contentBlocks.key, key))
      .returning()) as [typeof contentBlocks.$inferSelect];
  }
  return finishChange(tx, {
    entityType: "content",
    entityId: key,
    row: { ...row.data, currentVersion: row.currentVersion },
    actorId,
    action: "updated",
    options,
  });
}

/** Points an image field of a block at a newly uploaded media version. */
export async function setContentImage(
  tx: Executor,
  actorId: string | null,
  key: ContentKey,
  field: string,
  mediaId: string,
  expectedVersion: number,
): Promise<SaveResult> {
  if (!imageFieldsOf(key).has(field))
    throw new RecordNotFoundError(`No image field ${key}.${field}`);
  const current = await lockBlock(tx, key);
  if (!current) throw new RecordNotFoundError(`No content block ${key}`);
  // The same file again (uploads are de-duplicated): nothing to save.
  if (current.data[field] === mediaId)
    return { id: key, version: current.currentVersion, unchanged: true };
  return saveContentBlock(
    tx,
    actorId,
    key,
    { ...current.data, [field]: mediaId, expectedVersion },
    {},
    "images",
  );
}

async function restoreContent(
  tx: Executor,
  actorId: string | null,
  key: ContentKey,
  data: Record<string, unknown>,
  version: number,
  expectedVersion: number,
  idempotencyKey?: string,
) {
  const current = await lockBlock(tx, key);
  // Same order as the catalog: an outdated page first, then "already current".
  if ((current?.currentVersion ?? 0) !== expectedVersion)
    throw new VersionConflictError();
  if (current && version === current.currentVersion) throw new NoChangeError();
  return saveContentBlock(
    tx,
    actorId,
    key,
    { ...data, expectedVersion },
    { comment: restoreComment(version), idempotencyKey },
    "exact",
  );
}

// ── Journal ──────────────────────────────────────────────────────────────────

type JournalValues = Omit<JournalInput, "expectedVersion"> & {
  imageMediaId?: string | null;
};

async function writeJournal(
  tx: Executor,
  id: string | null,
  values: JournalValues,
  expectedVersion: number,
  scope: ChangeScope | "exact" = "fields",
) {
  const [clash] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      id
        ? and(eq(journalEntries.slug, values.slug), ne(journalEntries.id, id))
        : eq(journalEntries.slug, values.slug),
    );
  if (clash) throw new DuplicateSlugError(values.slug);
  if (id === null) {
    const [row] = await tx
      .insert(journalEntries)
      .values({ ...values, currentVersion: 1 })
      .returning();
    return row!;
  }
  const current = await lockJournal(tx, id);
  if (scope === "exact") {
    if (expectedVersion !== current.currentVersion) throw new VersionConflictError();
  } else {
    await assertScopeUnchanged(
      tx,
      { type: "journal", id },
      expectedVersion,
      current.currentVersion,
      scope,
    );
  }
  const [row] = await tx
    .update(journalEntries)
    .set({
      ...values,
      currentVersion: sql`${journalEntries.currentVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(journalEntries.id, id))
    .returning();
  return row!;
}

async function lockJournal(tx: Executor, id: string) {
  const [row] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .for("update");
  if (!row) throw new RecordNotFoundError(`No journal entry ${id}`);
  return row;
}

export async function saveJournalEntry(
  tx: Executor,
  actorId: string | null,
  id: string | null,
  input: JournalInput,
  options: SaveOptions = {},
): Promise<SaveResult> {
  // Fixed lock order: the row first, then replayedResult's key lock (which is
  // where copies of a create, with no row yet, queue).
  if (id) await lockJournal(tx, id);
  const replay = await replayedResult(tx, options.idempotencyKey, "journal", id);
  if (replay) return replay;
  const { expectedVersion, ...values } = journalInput.parse(input);
  const row = await writeJournal(tx, id, values, expectedVersion);
  return finishChange(tx, {
    entityType: "journal",
    entityId: row.id,
    row,
    actorId,
    action: id ? "updated" : "created",
    options,
  });
}

export async function setJournalImage(
  tx: Executor,
  actorId: string | null,
  id: string,
  mediaId: string,
  expectedVersion: number,
): Promise<SaveResult> {
  const current = await lockJournal(tx, id);
  if (current.imageMediaId === mediaId)
    return { id, version: current.currentVersion, unchanged: true };
  const row = await writeJournal(
    tx,
    id,
    { ...pickJournal(current), imageMediaId: mediaId },
    expectedVersion,
    "images",
  );
  return finishChange(tx, {
    entityType: "journal",
    entityId: id,
    row,
    actorId,
    action: "image-changed",
  });
}

const pickJournal = (row: typeof journalEntries.$inferSelect): JournalValues => ({
  slug: row.slug,
  publishedAt: row.publishedAt,
  title: row.title,
  excerpt: row.excerpt,
  isVisible: row.isVisible,
  imageMediaId: row.imageMediaId,
});

async function restoreJournal(
  tx: Executor,
  actorId: string | null,
  id: string,
  data: Record<string, unknown>,
  version: number,
  expectedVersion: number,
  idempotencyKey?: string,
) {
  const current = await lockJournal(tx, id);
  // Same order as the catalog: an outdated page first, then "already current".
  if (current.currentVersion !== expectedVersion) throw new VersionConflictError();
  if (version === current.currentVersion) throw new NoChangeError();
  // Visibility is publication state: a restore never changes it.
  const values = journalInput
    .omit({ expectedVersion: true })
    .parse({ ...data, isVisible: current.isVisible });
  const imageMediaId = typeof data.imageMediaId === "string" ? data.imageMediaId : null;
  const row = await writeJournal(
    tx,
    id,
    { ...values, imageMediaId },
    expectedVersion,
    "exact",
  );
  return finishChange(tx, {
    entityType: "journal",
    entityId: id,
    row,
    actorId,
    action: "restored",
    options: { comment: restoreComment(version), idempotencyKey },
  });
}

// ── Restore (content + journal) ──────────────────────────────────────────────

export async function restoreContentRevision(
  tx: Executor,
  actorId: string | null,
  entityType: "content" | "journal",
  entityId: string,
  version: number,
  expectedVersion: number,
  idempotencyKey?: string,
): Promise<SaveResult> {
  // A repeated click on the same restore replays the first result.
  const locked =
    entityType === "journal"
      ? (await lockJournal(tx, entityId)).currentVersion
      : entityId in CONTENT_BLOCKS
        ? ((await lockBlock(tx, entityId as ContentKey))?.currentVersion ?? 0)
        : 0;
  const replay = await replayedResult(tx, idempotencyKey, entityType, entityId);
  // A replay is only an answer while nothing happened since (see restoreRevision).
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
  if (entityType === "journal")
    return restoreJournal(
      tx,
      actorId,
      entityId,
      revision.data,
      version,
      expectedVersion,
      idempotencyKey,
    );
  if (!(entityId in CONTENT_BLOCKS))
    throw new RecordNotFoundError(`Unknown content block ${entityId}`);
  return restoreContent(
    tx,
    actorId,
    entityId as ContentKey,
    revision.data,
    version,
    expectedVersion,
    idempotencyKey,
  );
}

export async function journalSlug(tx: Executor, id: string): Promise<string> {
  const [row] = await tx
    .select({ slug: journalEntries.slug })
    .from(journalEntries)
    .where(eq(journalEntries.id, id));
  if (!row) throw new RecordNotFoundError(`No journal entry ${id}`);
  return row.slug;
}
