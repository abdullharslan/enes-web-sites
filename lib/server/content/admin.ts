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
  RecordNotFoundError,
  VersionConflictError,
  finishChange,
  replayedResult,
  restoreComment,
  type SaveOptions,
  type SaveResult,
} from "@/lib/server/versioning";

// ── Content blocks ───────────────────────────────────────────────────────────

async function writeBlock(
  tx: Executor,
  key: ContentKey,
  data: Record<string, unknown>,
  expectedVersion: number,
): Promise<typeof contentBlocks.$inferSelect> {
  const [existing] = await tx
    .select({ v: contentBlocks.currentVersion })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, key));
  if (!existing) {
    if (expectedVersion !== 0) throw new VersionConflictError();
    const [row] = await tx
      .insert(contentBlocks)
      .values({ key, data, currentVersion: 1 })
      .returning();
    return row!;
  }
  const [row] = await tx
    .update(contentBlocks)
    .set({
      data,
      currentVersion: sql`${contentBlocks.currentVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(contentBlocks.key, key), eq(contentBlocks.currentVersion, expectedVersion)),
    )
    .returning();
  if (!row) throw new VersionConflictError();
  return row;
}

/** Validates (strict, per block definition) and saves a new version of a content block. */
export async function saveContentBlock(
  tx: Executor,
  actorId: string | null,
  key: ContentKey,
  input: Record<string, unknown> & { expectedVersion: number },
  options: SaveOptions = {},
): Promise<SaveResult> {
  const replay = await replayedResult(tx, options.idempotencyKey, "content", key);
  if (replay) return replay;
  const { expectedVersion, ...rest } = input;
  const data = blockInputSchema(key).parse(rest);
  const row = await writeBlock(tx, key, data, expectedVersion);
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
): Promise<SaveResult> {
  const isImageField = (CONTENT_BLOCKS[key].fields as readonly FieldDef[]).some(
    (f) => f.key === field && f.kind === "image",
  );
  if (!isImageField) throw new RecordNotFoundError(`No image field ${key}.${field}`);
  const [current] = await tx
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.key, key));
  if (!current) throw new RecordNotFoundError(`No content block ${key}`);
  return saveContentBlock(tx, actorId, key, {
    ...current.data,
    [field]: mediaId,
    expectedVersion: current.currentVersion,
  });
}

async function restoreContent(
  tx: Executor,
  actorId: string | null,
  key: ContentKey,
  data: Record<string, unknown>,
  version: number,
) {
  const [current] = await tx
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.key, key));
  return saveContentBlock(
    tx,
    actorId,
    key,
    { ...data, expectedVersion: current?.currentVersion ?? 0 },
    { comment: restoreComment(version) },
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
  const [row] = await tx
    .update(journalEntries)
    .set({
      ...values,
      currentVersion: sql`${journalEntries.currentVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(journalEntries.id, id), eq(journalEntries.currentVersion, expectedVersion)),
    )
    .returning();
  if (row) return row;
  const [exists] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.id, id));
  throw exists
    ? new VersionConflictError()
    : new RecordNotFoundError(`No journal entry ${id}`);
}

export async function saveJournalEntry(
  tx: Executor,
  actorId: string | null,
  id: string | null,
  input: JournalInput,
  options: SaveOptions = {},
): Promise<SaveResult> {
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
): Promise<SaveResult> {
  const [current] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id));
  if (!current) throw new RecordNotFoundError(`No journal entry ${id}`);
  const row = await writeJournal(
    tx,
    id,
    { ...pickJournal(current), imageMediaId: mediaId },
    current.currentVersion,
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
) {
  const [current] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id));
  if (!current) throw new RecordNotFoundError(`No journal entry ${id}`);
  const { expectedVersion, ...values } = journalInput.parse({
    ...data,
    expectedVersion: current.currentVersion,
  });
  const imageMediaId = typeof data.imageMediaId === "string" ? data.imageMediaId : null;
  const row = await writeJournal(tx, id, { ...values, imageMediaId }, expectedVersion);
  return finishChange(tx, {
    entityType: "journal",
    entityId: id,
    row,
    actorId,
    action: "restored",
    options: { comment: restoreComment(version) },
  });
}

// ── Restore (content + journal) ──────────────────────────────────────────────

export async function restoreContentRevision(
  tx: Executor,
  actorId: string | null,
  entityType: "content" | "journal",
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
  if (entityType === "journal")
    return restoreJournal(tx, actorId, entityId, revision.data, version);
  if (!(entityId in CONTENT_BLOCKS))
    throw new RecordNotFoundError(`Unknown content block ${entityId}`);
  return restoreContent(tx, actorId, entityId as ContentKey, revision.data, version);
}

export async function journalSlug(tx: Executor, id: string): Promise<string> {
  const [row] = await tx
    .select({ slug: journalEntries.slug })
    .from(journalEntries)
    .where(eq(journalEntries.id, id));
  if (!row) throw new RecordNotFoundError(`No journal entry ${id}`);
  return row.slug;
}
