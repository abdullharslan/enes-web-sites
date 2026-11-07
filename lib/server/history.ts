import type { Executor } from "@/db/connection";
import { restoreRevision } from "@/lib/server/catalog/admin";
import { restoreContentRevision } from "@/lib/server/content/admin";
import type { EditableEntity, SaveResult } from "@/lib/server/versioning";

/** Restores any editable entity to an earlier version (as a new version; see restoreRevision). */
export function restoreAny(
  tx: Executor,
  actorId: string | null,
  entityType: EditableEntity,
  entityId: string,
  version: number,
  /** The current version shown on the history page the restore was made from. */
  expectedVersion: number,
  /** Per rendered button: a double click or a re-sent form restores once. */
  idempotencyKey?: string,
): Promise<SaveResult> {
  return entityType === "content" || entityType === "journal"
    ? restoreContentRevision(
        tx,
        actorId,
        entityType,
        entityId,
        version,
        expectedVersion,
        idempotencyKey,
      )
    : restoreRevision(
        tx,
        actorId,
        entityType,
        entityId,
        version,
        expectedVersion,
        idempotencyKey,
      );
}
