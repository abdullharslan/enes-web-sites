import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { inquiries, inquiryPhotos } from "@/db/schema";
import {
  INQUIRY_LIMITS,
  parseAddressLimit,
  retentionCutoffs,
  type InquiryKind,
  type InquiryStatus,
} from "@/lib/inquiries/policy";
import { recordAudit } from "@/lib/server/audit";

export interface StoredPhoto {
  position: number;
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export interface NewInquiry {
  id: string;
  kind: InquiryKind;
  locale: string;
  productSlug: string | null;
  data: Record<string, unknown>;
  submissionKey: string | null;
  addressHash: string;
  photos: readonly StoredPhoto[];
}

export type InquiryRow = typeof inquiries.$inferSelect;
export type InquiryPhotoRow = typeof inquiryPhotos.$inferSelect;

/** The raw client address is never stored; the hash only serves the rate limit and is cleared after a day. */
export const hashAddress = (address: string) =>
  createHash("sha256").update(`inquiry:${address}`).digest("hex");

async function submissionsSince(tx: Executor, since: Date, addressHash?: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(inquiries)
    .where(
      and(
        gt(inquiries.createdAt, since),
        addressHash ? eq(inquiries.addressHash, addressHash) : undefined,
      ),
    );
  return row?.n ?? 0;
}

const PER_ADDRESS = parseAddressLimit(process.env.INQUIRY_LIMIT_PER_ADDRESS);

/** Read-only check, cheap enough to run before any upload is decoded. */
export async function isRateLimited(
  db: Executor,
  addressHash: string,
  now = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - INQUIRY_LIMITS.windowMs);
  return (
    (await submissionsSince(db, since, addressHash)) >= PER_ADDRESS ||
    (await submissionsSince(db, since)) >= INQUIRY_LIMITS.global
  );
}

/**
 * Stores a visitor inquiry. Runs under one lock so parallel submissions cannot
 * slip past the limits, and a retried submission (same key) is stored once.
 */
export async function recordInquiry(
  tx: Executor,
  input: NewInquiry,
  now = new Date(),
): Promise<{ outcome: "stored" | "duplicate" | "rateLimited" }> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('inquiries'))`);
  if (input.submissionKey) {
    const [previous] = await tx
      .select({ id: inquiries.id })
      .from(inquiries)
      .where(eq(inquiries.submissionKey, input.submissionKey));
    if (previous) return { outcome: "duplicate" };
  }
  if (await isRateLimited(tx, input.addressHash, now)) return { outcome: "rateLimited" };

  await tx.insert(inquiries).values({
    id: input.id,
    kind: input.kind,
    locale: input.locale,
    productSlug: input.productSlug,
    data: input.data,
    submissionKey: input.submissionKey,
    addressHash: input.addressHash,
    createdAt: now,
    updatedAt: now,
  });
  if (input.photos.length) {
    await tx
      .insert(inquiryPhotos)
      .values(input.photos.map((photo) => ({ ...photo, inquiryId: input.id })));
  }
  return { outcome: "stored" };
}

/**
 * Applies the retention rules; returns the deleted inquiry ids so the caller
 * can remove their photo files after the transaction commits.
 */
export async function purgeExpiredInquiries(tx: Executor, now = new Date()) {
  const cut = retentionCutoffs(now);
  await tx
    .update(inquiries)
    .set({ addressHash: null })
    .where(
      and(
        isNotNull(inquiries.addressHash),
        lt(inquiries.createdAt, cut.addressHashBefore),
      ),
    );
  const deleted = await tx
    .delete(inquiries)
    .where(
      or(
        and(eq(inquiries.status, "done"), lt(inquiries.updatedAt, cut.doneBefore)),
        lt(inquiries.createdAt, cut.anyBefore),
      ),
    )
    .returning({ id: inquiries.id });
  return deleted.map((row) => row.id);
}

// ── Admin inbox ──────────────────────────────────────────────────────────────

const LIST_LIMIT = 500;

export function listInquiries(db: Executor, status?: InquiryStatus) {
  return db
    .select()
    .from(inquiries)
    .where(status ? eq(inquiries.status, status) : undefined)
    .orderBy(desc(inquiries.createdAt))
    .limit(LIST_LIMIT);
}

export async function countNewInquiries(db: Executor): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(inquiries)
    .where(eq(inquiries.status, "new"));
  return row?.n ?? 0;
}

export async function getInquiry(
  db: Executor,
  id: string,
): Promise<{ inquiry: InquiryRow; photos: InquiryPhotoRow[] } | null> {
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, id));
  if (!inquiry) return null;
  const photos = await db
    .select()
    .from(inquiryPhotos)
    .where(eq(inquiryPhotos.inquiryId, id))
    .orderBy(asc(inquiryPhotos.position));
  return { inquiry, photos };
}

export async function findInquiryPhoto(
  db: Executor,
  photoId: string,
): Promise<InquiryPhotoRow | null> {
  const [photo] = await db
    .select()
    .from(inquiryPhotos)
    .where(eq(inquiryPhotos.id, photoId));
  return photo ?? null;
}

/** Returns false for unknown inquiries; setting the current status again is a no-op. */
export async function setInquiryStatus(
  tx: Executor,
  actorId: string,
  id: string,
  status: InquiryStatus,
  now = new Date(),
): Promise<boolean> {
  const [current] = await tx
    .select({ status: inquiries.status })
    .from(inquiries)
    .where(eq(inquiries.id, id))
    .for("update");
  if (!current) return false;
  if (current.status === status) return true;
  await tx
    .update(inquiries)
    .set({ status, handledBy: actorId, updatedAt: now })
    .where(eq(inquiries.id, id));
  await recordAudit(tx, {
    actorId,
    action: "inquiry.status_changed",
    entityType: "inquiry",
    entityId: id,
    details: { from: current.status, to: status },
  });
  return true;
}

/** Deletes an inquiry and its photo rows (erasure request); the caller removes the files. */
export async function deleteInquiry(
  tx: Executor,
  actorId: string,
  id: string,
): Promise<boolean> {
  const deleted = await tx
    .delete(inquiries)
    .where(eq(inquiries.id, id))
    .returning({ id: inquiries.id });
  if (!deleted.length) return false;
  await recordAudit(tx, {
    actorId,
    action: "inquiry.deleted",
    entityType: "inquiry",
    entityId: id,
  });
  return true;
}
