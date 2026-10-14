import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  preparePhotos,
  readInquiryPhoto,
  removeInquiryFiles,
  writeInquiryPhotos,
} from "@/lib/server/inquiries/photos";
import { MediaRejectedError } from "@/lib/server/media/store";
import { sampleJpeg, tempMediaRoot } from "./helpers";

let storage: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  storage = tempMediaRoot();
});
afterEach(() => storage.cleanup());

const asFile = (buffer: Buffer, type = "image/jpeg") =>
  new File([new Uint8Array(buffer)], "photo.jpg", { type });

describe("inquiry photos", () => {
  it("re-encodes to EXIF-free webp, private files under the inquiry's folder", async () => {
    const id = randomUUID();
    const prepared = await preparePhotos([
      asFile(await sampleJpeg("#111111")),
      asFile(await sampleJpeg("#eeeeee")),
    ]);
    const stored = await writeInquiryPhotos(storage.root, id, prepared);
    expect(stored.map((p) => p.position)).toEqual([0, 1]);
    for (const photo of stored) {
      expect(photo.key).toMatch(new RegExp(`^inquiries/${id}/\\d_[a-f0-9]{8}\\.webp$`));
      const file = join(storage.root, photo.key);
      // Owner read/write only: personal photos are not world-readable on the server.
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const meta = await sharp(readFileSync(file)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(await readInquiryPhoto(storage.root, photo.key)).toEqual(readFileSync(file));
    }
  });

  it("rejects files that are not really images", async () => {
    await expect(
      preparePhotos([asFile(Buffer.from("<svg onload=alert(1)></svg>"))]),
    ).rejects.toThrow(MediaRejectedError);
  });

  it("removes all files of deleted inquiries and ignores missing folders", async () => {
    const id = randomUUID();
    const [photo] = await writeInquiryPhotos(
      storage.root,
      id,
      await preparePhotos([asFile(await sampleJpeg())]),
    );
    await removeInquiryFiles(storage.root, [id, randomUUID()]);
    expect(existsSync(join(storage.root, photo!.key))).toBe(false);
    expect(existsSync(join(storage.root, "inquiries", id))).toBe(false);
  });

  it("refuses keys or ids that escape the storage root", async () => {
    await expect(readInquiryPhoto(storage.root, "../../etc/passwd")).rejects.toThrow(
      MediaRejectedError,
    );
    await expect(removeInquiryFiles(storage.root, ["../.."])).rejects.toThrow();
    await expect(writeInquiryPhotos(storage.root, "../x", [])).rejects.toThrow();
  });
});
