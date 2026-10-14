import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createSemaphore } from "@/lib/server/auth/semaphore";
import {
  prepareImage,
  resolveInside,
  type PreparedImage,
} from "@/lib/server/media/store";
import type { StoredPhoto } from "./service";

/*
 * Photos sent by visitors are personal data: they live outside the public,
 * immutable media library, are readable by the server user only, and are
 * deleted together with their inquiry.
 */

export const PRIVATE_ROOT = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";

/** Image decoding is CPU/memory heavy; anonymous uploads get a small share. */
const limitImageWork = createSemaphore(2);

const inquiryId = z.uuid();
const folderOf = (root: string, id: string) =>
  resolveInside(root, `inquiries/${inquiryId.parse(id)}`);

/** Validates and re-encodes every file (magic bytes, EXIF removed); throws MediaRejectedError. */
export async function preparePhotos(files: readonly File[]): Promise<PreparedImage[]> {
  const prepared: PreparedImage[] = [];
  for (const file of files) {
    const input = Buffer.from(await file.arrayBuffer());
    prepared.push(await limitImageWork(() => prepareImage(input)));
  }
  return prepared;
}

export async function writeInquiryPhotos(
  root: string,
  id: string,
  prepared: readonly PreparedImage[],
): Promise<StoredPhoto[]> {
  const folder = folderOf(root, id);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stored: StoredPhoto[] = [];
  for (const [position, image] of prepared.entries()) {
    const name = `${position}_${image.sha256.slice(0, 8)}.webp`;
    const target = join(folder, name);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, image.output, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    stored.push({
      key: `inquiries/${id}/${name}`,
      position,
      width: image.width,
      height: image.height,
      bytes: image.output.length,
    });
  }
  return stored;
}

export async function removeInquiryFiles(
  root: string,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) await rm(folderOf(root, id), { recursive: true, force: true });
}

export async function readInquiryPhoto(
  root: string,
  key: string,
): Promise<Buffer | null> {
  const target = resolveInside(root, key);
  try {
    return await readFile(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
