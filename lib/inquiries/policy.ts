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
  /** Completed inquiries are deleted six months after their last change. */
  doneMs: 182 * DAY,
  /** Nothing is kept longer than a year, whatever its status. */
  anyMs: 365 * DAY,
} as const;

export function retentionCutoffs(now: Date) {
  const before = (ms: number) => new Date(now.getTime() - ms);
  return {
    addressHashBefore: before(INQUIRY_RETENTION.addressHashMs),
    doneBefore: before(INQUIRY_RETENTION.doneMs),
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
