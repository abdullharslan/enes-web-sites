import { and, desc, eq, max } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { revisions } from "@/db/schema";

export interface RevisionInput {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  authorId?: string | null;
  comment?: string | null;
  idempotencyKey?: string | null;
}

export interface RevisionResult {
  version: number;
  /** False when an earlier request with the same idempotency key already wrote it. */
  created: boolean;
}

/**
 * Appends a snapshot as the entity's next version. Must run inside the same
 * transaction as the entity update; the unique (entity, version) constraint
 * turns concurrent writers into a clean failure instead of a lost update.
 */
export async function recordRevision(
  tx: Executor,
  input: RevisionInput,
): Promise<RevisionResult> {
  if (input.idempotencyKey) {
    const [existing] = await tx
      .select({ version: revisions.version })
      .from(revisions)
      .where(
        and(
          eq(revisions.idempotencyKey, input.idempotencyKey),
          eq(revisions.entityType, input.entityType),
          eq(revisions.entityId, input.entityId),
        ),
      );
    // Same entity → replay. Another entity with this key → the insert below hits
    // the unique constraint and the whole change rolls back (fail-closed).
    if (existing) return { version: existing.version, created: false };
  }

  const [latest] = await tx
    .select({ version: max(revisions.version) })
    .from(revisions)
    .where(
      and(
        eq(revisions.entityType, input.entityType),
        eq(revisions.entityId, input.entityId),
      ),
    );
  const version = (latest?.version ?? 0) + 1;

  await tx.insert(revisions).values({
    entityType: input.entityType,
    entityId: input.entityId,
    version,
    data: input.data,
    authorId: input.authorId ?? null,
    comment: input.comment ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  return { version, created: true };
}

export function listRevisions(tx: Executor, entityType: string, entityId: string) {
  return tx
    .select()
    .from(revisions)
    .where(and(eq(revisions.entityType, entityType), eq(revisions.entityId, entityId)))
    .orderBy(desc(revisions.version));
}
