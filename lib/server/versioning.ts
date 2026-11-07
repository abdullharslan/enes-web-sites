import { and, eq, inArray, sql } from "drizzle-orm";
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
/** A restore of the version that is already current. */
export class NoChangeError extends Error {}
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
  /** True when the request changed nothing (no version was written). */
  unchanged?: boolean;
}

export const restoreComment = (version: number) => `Wiederhergestellt aus v${version}`;

/**
 * What a change touches. An edit form changes "fields", the image controls
 * change "images"; each only conflicts with changes in its own scope.
 */
export type ChangeScope = "fields" | "images";

/** Snapshot keys that hold an entity's images (product list, brand hero, …). */
const IMAGE_KEYS = new Set(["mediaIds", "heroMediaId", "tileMediaId", "imageMediaId"]);

const inScope = (
  snapshot: Record<string, unknown>,
  scope: ChangeScope,
  isImageKey: (key: string) => boolean,
) =>
  JSON.stringify(
    Object.keys(snapshot)
      .filter((key) => isImageKey(key) === (scope === "images"))
      .sort()
      .map((key) => [key, snapshot[key]]),
  );

/**
 * Optimistic concurrency per scope. A change prepared on version `expected`
 * may be applied to version `current` when nothing in its scope changed in
 * between (e.g. an edit form opened before an image upload). Anything else —
 * a same-scope change by someone else, or a version that never existed — is a
 * conflict. Callers lock the row first, so `current` cannot move meanwhile.
 * Only the two end states are compared: a change that was later undone
 * (A → B → A) is not a conflict, because nothing the caller saw was lost.
 */
export async function assertScopeUnchanged(
  tx: Executor,
  entity: { type: EditableEntity; id: string },
  expected: number,
  current: number,
  scope: ChangeScope,
  isImageKey: (key: string) => boolean = (key) => IMAGE_KEYS.has(key),
): Promise<void> {
  if (expected === current) return;
  if (!Number.isInteger(expected) || expected < 1 || expected > current) {
    throw new VersionConflictError();
  }
  const rows = await tx
    .select({ version: revisions.version, data: revisions.data })
    .from(revisions)
    .where(
      and(
        eq(revisions.entityType, entity.type),
        eq(revisions.entityId, entity.id),
        inArray(revisions.version, [expected, current]),
      ),
    );
  const base = rows.find((r) => r.version === expected)?.data;
  const now = rows.find((r) => r.version === current)?.data;
  if (
    !base ||
    !now ||
    inScope(base, scope, isImageKey) !== inScope(now, scope, isImageKey)
  ) {
    throw new VersionConflictError();
  }
}

/** A retried request (same idempotency key) returns the first result instead of writing again. */
export async function replayedResult(
  tx: Executor,
  key: string | undefined,
  entityType: EditableEntity,
  entityId: string | null,
): Promise<SaveResult | null> {
  if (!key) return null;
  // Copies of one request (double click, retry) wait for each other here, so
  // the second sees the first one's committed result — for creates as well.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`idempotency:${entityType}:${key}`}))`,
  );
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
