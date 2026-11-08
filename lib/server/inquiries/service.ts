import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { inquiries, inquiryPhotos } from "@/db/schema";
import {
  INQUIRY_LIMITS,
  inquiryStatusChange,
  retentionCutoffs,
  type InquiryKind,
  type InquiryStatus,
} from "@/lib/inquiries/policy";
import { isoDay } from "@/lib/analytics/track";
import { recordAudit } from "@/lib/server/audit";
import { parseLimitEnv } from "@/lib/server/limits";

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

/*
 * The raw client address is never stored. The rate-limit key is an HMAC with a
 * random key that lives only in this process and changes every UTC day, so a
 * stored value cannot be reversed (no dictionary of all IPv4 addresses helps)
 * and values from different days cannot be linked. Side effect, accepted: the
 * per-address window restarts at midnight UTC and after a server restart.
 */
let addressKey: { day: string; key: Buffer } | null = null;

export function hashAddress(addressBucket: string, now = new Date()): string {
  const day = isoDay(now);
  if (addressKey?.day !== day) addressKey = { day, key: randomBytes(32) };
  return createHmac("sha256", addressKey.key).update(addressBucket).digest("hex");
}

async function submissionsSince(tx: Executor, since: Date, addressHash: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(inquiries)
    .where(and(gt(inquiries.createdAt, since), eq(inquiries.addressHash, addressHash)));
  return row?.n ?? 0;
}

/** Recent submissions that carried photos (the expensive kind: CPU and disk). */
async function photoSubmissionsSince(tx: Executor, since: Date) {
  const [row] = await tx
    .select({ n: countDistinct(inquiryPhotos.inquiryId) })
    .from(inquiryPhotos)
    .innerJoin(inquiries, eq(inquiries.id, inquiryPhotos.inquiryId))
    .where(gt(inquiries.createdAt, since));
  return row?.n ?? 0;
}

const PER_ADDRESS = parseLimitEnv(
  "INQUIRY_LIMIT_PER_ADDRESS",
  process.env.INQUIRY_LIMIT_PER_ADDRESS,
  INQUIRY_LIMITS.perAddress,
);

/**
 * Read-only check, cheap enough to run before any upload is decoded. The global
 * cap only applies to submissions with photos: a flood can then at worst delay
 * photo uploads, never stop customers from sending a question.
 */
export async function isRateLimited(
  db: Executor,
  addressHash: string,
  { withPhotos, now = new Date() }: { withPhotos: boolean; now?: Date },
): Promise<boolean> {
  const since = new Date(now.getTime() - INQUIRY_LIMITS.windowMs);
  if ((await submissionsSince(db, since, addressHash)) >= PER_ADDRESS) return true;
  return withPhotos && (await photoSubmissionsSince(db, since)) >= INQUIRY_LIMITS.global;
}

/**
 * The first gate of a submission, before any image work: a retry of an inquiry
 * that is already stored is recognised first (so it is never answered with
 * "rate limited"), then the limits apply. recordInquiry re-checks both under
 * its lock; this read-only pass only avoids wasted work and wrong answers.
 */
export async function admitSubmission(
  db: Executor,
  {
    submissionKey,
    addressHash,
    withPhotos,
    now = new Date(),
  }: { submissionKey: string; addressHash: string; withPhotos: boolean; now?: Date },
): Promise<"ok" | "duplicate" | "rateLimited"> {
  const [stored] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(eq(inquiries.submissionKey, submissionKey));
  if (stored) return "duplicate";
  return (await isRateLimited(db, addressHash, { withPhotos, now }))
    ? "rateLimited"
    : "ok";
}

/**
 * A stable key for a post that brought none (no JavaScript, or an insecure
 * context without crypto.randomUUID): the same inquiry from the same address
 * bucket on the same day maps to the same key, so a re-sent form is stored once.
 * The address hash already changes daily, so identical text on another day is new.
 */
export function deriveSubmissionKey(
  addressHash: string,
  kind: InquiryKind,
  productSlug: string | null,
  data: Record<string, unknown>,
): string {
  const hex = createHash("sha256")
    .update(JSON.stringify([addressHash, kind, productSlug, data]))
    .digest("hex");
  // Formatted as a version-4-shaped UUID so it fits the submission_key column.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
  const withPhotos = input.photos.length > 0;
  if (await isRateLimited(tx, input.addressHash, { withPhotos, now })) {
    return { outcome: "rateLimited" };
  }

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
        and(eq(inquiries.status, "done"), lt(inquiries.firstCompletedAt, cut.doneBefore)),
        lt(inquiries.createdAt, cut.anyBefore),
      ),
    )
    .returning({ id: inquiries.id });
  return deleted.map((row) => row.id);
}

// ── Admin inbox ──────────────────────────────────────────────────────────────

export const LIST_LIMIT = 500;

export async function countInquiries(
  db: Executor,
  status?: InquiryStatus,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(inquiries)
    .where(status ? eq(inquiries.status, status) : undefined);
  return row?.n ?? 0;
}

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
    .select({
      status: inquiries.status,
      firstCompletedAt: inquiries.firstCompletedAt,
    })
    .from(inquiries)
    .where(eq(inquiries.id, id))
    .for("update");
  if (!current) return false;
  const change = inquiryStatusChange(current, status, now);
  if (!change) return true;
  await tx
    .update(inquiries)
    .set({ ...change, handledBy: actorId, updatedAt: now })
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
