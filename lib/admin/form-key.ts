import "server-only";
import { createHash } from "node:crypto";

/**
 * React key for an edit form: it changes only when the stored field values
 * change. An image upload, move or removal then re-renders the page without
 * remounting the form, so unsaved edits stay (the version check on save is
 * per scope, see assertScopeUnchanged).
 */
export function fieldsKey(record: Record<string, unknown>): string {
  const fields = Object.entries(record)
    .filter(([key]) => !NOT_FIELDS.has(key))
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha1").update(JSON.stringify(fields)).digest("hex").slice(0, 16);
}

/** Bookkeeping and image data: changing these must not reset an open edit form. */
const NOT_FIELDS = new Set([
  "currentVersion",
  "createdAt",
  "updatedAt",
  "images",
  "mediaIds",
  "heroMediaId",
  "heroSrc",
  "tileMediaId",
  "tileSrc",
  "imageMediaId",
  "imageSrc",
]);

/**
 * The "saved version N" notice from the URL, only while N is still the current
 * version (an image change afterwards refreshes in place and keeps the URL).
 */
export function savedNotice(
  saved: string | string[] | undefined,
  currentVersion: number,
): string | undefined {
  return saved === String(currentVersion) ? saved : undefined;
}
