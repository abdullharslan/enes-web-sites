import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { and, eq, max } from "drizzle-orm";
import sharp from "sharp";
import type { Executor } from "@/db/connection";
import { media, type Translations } from "@/db/schema";
import { buildMediaKey, type MediaKind } from "./naming";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2400;
const MAX_INPUT_PIXELS = 60_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class MediaRejectedError extends Error {}

export interface StoreImageInput {
  input: Buffer;
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

async function normalise(
  input: Buffer,
): Promise<{ output: Buffer; width: number; height: number }> {
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
  return { output: data, width: info.width, height: info.height };
}

/**
 * Stores an uploaded image as a new immutable version for `kind/entitySlug`.
 * Identical bytes for the same entity return the existing record (idempotent).
 * Files are written atomically and never overwritten.
 */
export async function storeImage(
  tx: Executor,
  root: string,
  { input, kind, entitySlug, alt, createdBy = null, now = new Date() }: StoreImageInput,
): Promise<MediaRecord> {
  const sha256 = createHash("sha256").update(input).digest("hex");

  const [existing] = await tx
    .select()
    .from(media)
    .where(
      and(
        eq(media.kind, kind),
        eq(media.entitySlug, entitySlug),
        eq(media.sha256, sha256),
      ),
    );
  if (existing) return existing;

  const { output, width, height } = await normalise(input);

  const [latest] = await tx
    .select({ version: max(media.version) })
    .from(media)
    .where(and(eq(media.kind, kind), eq(media.entitySlug, entitySlug)));
  const version = (latest?.version ?? 0) + 1;
  const key = buildMediaKey({ kind, entitySlug, version, sha256, createdAt: now });

  const target = resolveInside(root, key);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, output, { flag: "wx", mode: 0o644 });
  await rename(temporary, target);

  const [record] = await tx
    .insert(media)
    .values({
      key,
      kind,
      entitySlug,
      version,
      sha256,
      mimeType: "image/webp",
      width,
      height,
      bytes: output.length,
      alt,
      createdBy,
    })
    .returning();
  if (!record) throw new Error("Media insert returned no row");
  return record;
}

export const mediaUrl = (key: string) => `/media/${key}`;
