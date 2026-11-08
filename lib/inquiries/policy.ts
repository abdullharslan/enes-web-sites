/*
 * Rules for visitor inquiries: how much can be sent, how often, and how long
 * personal data is kept (data minimisation — GDPR Art. 5(1)(c, e)).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;

export const INQUIRY_KINDS = ["product", "contact", "sell"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export const INQUIRY_STATUSES = ["new", "in_progress", "done"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_LIMITS = {
  perAddress: 5,
  /** Submissions WITH photos across all visitors (CPU/disk); text inquiries are never capped globally. */
  global: 200,
  windowMs: HOUR,
  maxPhotos: 4,
  maxPhotoBytes: 10 * MB,
  maxTotalPhotoBytes: 20 * MB,
} as const;

export const INQUIRY_RETENTION = {
  /** The hashed client address is only needed for the rate limit window. */
  addressHashMs: DAY,
  /** Completed inquiries are deleted six months after their first completion (see INQUIRY_DONE_QUIET_MS). */
  doneMs: 182 * DAY,
  /** Nothing is kept longer than a year, whatever its status. */
  anyMs: 365 * DAY,
} as const;

/**
 * A completed inquiry is also only deleted once its last status change is this
 * old, so one reopened and finished after the six months is not deleted at the
 * very next retention pass. The one-year cap still wins.
 */
export const INQUIRY_DONE_QUIET_MS = 30 * DAY;

export interface InquiryProgress {
  status: InquiryStatus;
  firstCompletedAt: Date | null;
}

/**
 * The only place that decides what a status change does; `null` means there is
 * nothing to write. Every direction is allowed, because reopening corrects
 * mistaken clicks, but the retention clock is set once: going back and forth
 * must not postpone the deletion. While reopened an inquiry is being worked on
 * and only the one-year cap applies; completed again, its first date counts,
 * plus INQUIRY_DONE_QUIET_MS after that last completion.
 */
export function inquiryStatusChange(
  current: InquiryProgress,
  next: InquiryStatus,
  now: Date,
): InquiryProgress | null {
  if (current.status === next) return null;
  return {
    status: next,
    firstCompletedAt: current.firstCompletedAt ?? (next === "done" ? now : null),
  };
}

export function retentionCutoffs(now: Date) {
  const before = (ms: number) => new Date(now.getTime() - ms);
  return {
    addressHashBefore: before(INQUIRY_RETENTION.addressHashMs),
    doneBefore: before(INQUIRY_RETENTION.doneMs),
    doneQuietBefore: before(INQUIRY_DONE_QUIET_MS),
    anyBefore: before(INQUIRY_RETENTION.anyMs),
  };
}

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PhotoProblem = "tooManyPhotos" | "photoTooLarge" | "photoInvalid";

/**
 * Cheap checks on the declared files before any image is decoded. The server
 * re-validates the real content (magic bytes) when it re-encodes each photo.
 */
export function photoProblem(
  files: ReadonlyArray<{ size: number; type: string }>,
): PhotoProblem | null {
  if (files.length > INQUIRY_LIMITS.maxPhotos) return "tooManyPhotos";
  if (files.some((f) => f.size === 0 || !PHOTO_TYPES.has(f.type))) return "photoInvalid";
  if (files.some((f) => f.size > INQUIRY_LIMITS.maxPhotoBytes)) return "photoTooLarge";
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return total > INQUIRY_LIMITS.maxTotalPhotoBytes ? "photoTooLarge" : null;
}
