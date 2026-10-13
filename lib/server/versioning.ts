import { and, eq } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { revisions } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";
import { recordRevision } from "@/lib/server/revisions";
import { toSnapshot } from "@/lib/server/snapshot";

/*
 * Shared rules for every editable entity: one change = one revision + one
 * audit event, written in the caller's transaction.
 */

export type EditableEntity = "brand" | "category" | "product" | "content" | "journal";

export class VersionConflictError extends Error {
  constructor() {
    super("The record was changed by someone else. Reload and try again.");
  }
}
export class RecordNotFoundError extends Error {}
export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`The slug "${slug}" is already in use`);
  }
}

export interface SaveOptions {
  idempotencyKey?: string;
  comment?: string;
}

export interface SaveResult {
  id: string;
  version: number;
}

export const restoreComment = (version: number) => `Wiederhergestellt aus v${version}`;

/** A retried request (same idempotency key) returns the first result instead of writing again. */
export async function replayedResult(
  tx: Executor,
  key: string | undefined,
  entityType: EditableEntity,
  entityId: string | null,
): Promise<SaveResult | null> {
  if (!key) return null;
  // Scoped to the record (or, for creates, the entity type): a key never replays another record's result.
  const [previous] = await tx
    .select({ id: revisions.entityId, version: revisions.version })
    .from(revisions)
    .where(
      and(
        eq(revisions.idempotencyKey, key),
        eq(revisions.entityType, entityType),
        entityId === null ? undefined : eq(revisions.entityId, entityId),
      ),
    );
  return previous ?? null;
}

export async function finishChange(
  tx: Executor,
  args: {
    entityType: EditableEntity;
    entityId: string;
    row: Record<string, unknown> & { currentVersion: number };
    actorId: string | null;
    action: string;
    extra?: Record<string, unknown>;
    options?: SaveOptions;
  },
): Promise<SaveResult> {
  const { version } = await recordRevision(tx, {
    entityType: args.entityType,
    entityId: args.entityId,
    data: toSnapshot(args.row, args.extra),
    authorId: args.actorId,
    comment: args.options?.comment ?? null,
    idempotencyKey: args.options?.idempotencyKey ?? null,
  });
  // Entity version and revision number must move together; drift means a write bypassed this module.
  if (version !== args.row.currentVersion) {
    throw new Error(
      `Revision drift on ${args.entityType} ${args.entityId}: ${version} ≠ ${args.row.currentVersion}`,
    );
  }
  await recordAudit(tx, {
    actorId: args.actorId,
    action: `${args.entityType}.${args.action}`,
    entityType: args.entityType,
    entityId: args.entityId,
    details: { version },
  });
  return { id: args.entityId, version };
}
