import type { Executor } from "@/db/connection";
import { restoreRevision } from "@/lib/server/catalog/admin";
import { restoreContentRevision } from "@/lib/server/content/admin";
import type { EditableEntity, SaveResult } from "@/lib/server/versioning";

/** Restores any editable entity to an earlier version (as a new version). */
export function restoreAny(
  tx: Executor,
  actorId: string | null,
  entityType: EditableEntity,
  entityId: string,
  version: number,
): Promise<SaveResult> {
  return entityType === "content" || entityType === "journal"
    ? restoreContentRevision(tx, actorId, entityType, entityId, version)
    : restoreRevision(tx, actorId, entityType, entityId, version);
}
