import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { and, eq, isNull, max } from "drizzle-orm";
import sharp from "sharp";
import type { Executor } from "@/db/connection";
import { media, type Translations } from "@/db/schema";
import { buildMediaKey, type MediaKind } from "./naming";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2400;
const MAX_INPUT_PIXELS = 60_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class MediaRejectedError extends Error {}

/** A validated, re-encoded image that is ready to be stored. */
export interface PreparedImage {
  /** SHA-256 of the original upload (identical uploads are idempotent). */
  sha256: string;
  output: Buffer;
  width: number;
  height: number;
}

export interface StoreImageInput {
  /** Raw upload (prepared on the fly) or an image prepared before the transaction. */
  input?: Buffer;
  prepared?: PreparedImage;
  kind: MediaKind;
  entitySlug: string;
  alt: Translations;
  createdBy?: string | null;
  now?: Date;
}

export type MediaRecord = typeof media.$inferSelect;

/** Resolves `key` under `root` and refuses anything that would escape it. */
export function resolveInside(root: string, key: string): string {
  const base = resolve(root);
  const target = resolve(base, key);
  if (!target.startsWith(base + sep))
    throw new MediaRejectedError("Path escapes media root");
  return target;
}

/**
 * Validates and re-encodes an upload (CPU/memory heavy). Call it before opening
 * a database transaction so image work never holds a pooled connection.
 */
export async function prepareImage(input: Buffer): Promise<PreparedImage> {
  if (input.length === 0) throw new MediaRejectedError("Empty file");
  if (input.length > MAX_UPLOAD_BYTES) throw new MediaRejectedError("File too large");

  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
  } catch {
    throw new MediaRejectedError("Not a readable image");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new MediaRejectedError(`Unsupported image format: ${format ?? "unknown"}`);
  }

  // rotate() applies EXIF orientation; sharp drops all metadata (EXIF/GPS) unless asked to keep it.
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return {
    sha256: createHash("sha256").update(input).digest("hex"),
    output: data,
    width: info.width,
    height: info.height,
  };
}

/**
 * Stores an image as a new immutable version for `kind/entitySlug`. The row is
 * inserted first and the file written afterwards (atomically, never
 * overwritten); only recorded files are ever served (see findServableMedia).
 */
export async function storeImage(
  tx: Executor,
  root: string,
  {
    input,
    prepared,
    kind,
    entitySlug,
    alt,
    createdBy = null,
    now = new Date(),
  }: StoreImageInput,
): Promise<MediaRecord> {
  if (!prepared && !input) throw new MediaRejectedError("No image given");
  const image = prepared ?? (await prepareImage(input!));

  const [existing] = await tx
    .select()
    .from(media)
    .where(
      and(
        eq(media.kind, kind),
        eq(media.entitySlug, entitySlug),
        eq(media.sha256, image.sha256),
      ),
    );
  if (existing) return existing;

  const [latest] = await tx
    .select({ version: max(media.version) })
    .from(media)
    .where(and(eq(media.kind, kind), eq(media.entitySlug, entitySlug)));
  const version = (latest?.version ?? 0) + 1;
  const key = buildMediaKey({
    kind,
    entitySlug,
    version,
    sha256: image.sha256,
    createdAt: now,
  });
  const target = resolveInside(root, key);

  const [record] = await tx
    .insert(media)
    .values({
      key,
      kind,
      entitySlug,
      version,
      sha256: image.sha256,
      mimeType: "image/webp",
      width: image.width,
      height: image.height,
      bytes: image.output.length,
      alt,
      createdBy,
    })
    .returning();
  if (!record) throw new Error("Media insert returned no row");

  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, image.output, { flag: "wx", mode: 0o644 });
  await rename(temporary, target);
  return record;
}

/** The media row for a key, if it was committed and not archived; files without a row are never served. */
export async function findServableMedia(
  db: Executor,
  key: string,
): Promise<MediaRecord | null> {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.key, key), isNull(media.archivedAt)));
  return row ?? null;
}

export const mediaUrl = (key: string) => `/media/${key}`;
