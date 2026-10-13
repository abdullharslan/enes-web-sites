import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeImage, MediaRejectedError } from "@/lib/server/media/store";
import { parseMediaKey } from "@/lib/server/media/naming";
import { closeTestDb, sampleJpeg, tempMediaRoot, withRollback } from "./helpers";

afterAll(closeTestDb);

let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

const now = new Date("2026-10-14T12:00:00Z");
const alt = { de: "Uhr" };

describe("storeImage", () => {
  it("stores a versioned, EXIF-free webp and records it", () =>
    withRollback(async (tx) => {
      const record = await storeImage(tx, media.root, {
        input: await sampleJpeg(),
        kind: "brand",
        entitySlug: "rolex",
        alt,
        now,
      });
      expect(record.key).toMatch(/^brand\/rolex\/20261014-120000_v1_[a-f0-9]{8}\.webp$/);
      expect(parseMediaKey(record.key)).not.toBeNull();
      const file = join(media.root, record.key);
      expect(existsSync(file)).toBe(true);
      const meta = await sharp(readFileSync(file)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect([record.width, record.height]).toEqual([40, 30]);
    }));

  it("creates a new version for a different image and keeps the old file", () =>
    withRollback(async (tx) => {
      const v1 = await storeImage(tx, media.root, {
        input: await sampleJpeg("#111111"),
        kind: "home",
        entitySlug: "hero",
        alt,
        now,
      });
      const v2 = await storeImage(tx, media.root, {
        input: await sampleJpeg("#eeeeee"),
        kind: "home",
        entitySlug: "hero",
        alt,
        now,
      });
      expect([v1.version, v2.version]).toEqual([1, 2]);
      expect(existsSync(join(media.root, v1.key))).toBe(true);
      expect(existsSync(join(media.root, v2.key))).toBe(true);
    }));

  it("is idempotent for identical bytes on the same entity", () =>
    withRollback(async (tx) => {
      const input = await sampleJpeg();
      const a = await storeImage(tx, media.root, {
        input,
        kind: "brand",
        entitySlug: "chanel",
        alt,
        now,
      });
      const b = await storeImage(tx, media.root, {
        input,
        kind: "brand",
        entitySlug: "chanel",
        alt,
        now,
      });
      expect(b.id).toBe(a.id);
    }));

  it.each([
    ["non-image bytes", Buffer.from("<svg onload=alert(1)>")],
    ["empty input", Buffer.alloc(0)],
  ])("rejects %s", async (_, input) =>
    withRollback(async (tx) => {
      await expect(
        storeImage(tx, media.root, { input, kind: "brand", entitySlug: "x", alt, now }),
      ).rejects.toBeInstanceOf(MediaRejectedError);
    }),
  );

  it("rejects files above the size limit before decoding", () =>
    withRollback(async (tx) => {
      const input = Buffer.alloc(10 * 1024 * 1024 + 1);
      await expect(
        storeImage(tx, media.root, { input, kind: "brand", entitySlug: "x", alt, now }),
      ).rejects.toThrow(/too large/);
    }));

  it("rejects an invalid entity slug (no path traversal)", () =>
    withRollback(async (tx) => {
      await expect(
        storeImage(tx, media.root, {
          input: await sampleJpeg(),
          kind: "brand",
          entitySlug: "../evil",
          alt,
          now,
        }),
      ).rejects.toThrow();
    }));
});

describe("serving only recorded media", () => {
  it("finds a stored key and ignores a file whose transaction was rolled back", async () => {
    const { findServableMedia, prepareImage } = await import("@/lib/server/media/store");
    let key = "";
    await withRollback(async (tx) => {
      const record = await storeImage(tx, media.root, {
        prepared: await prepareImage(await sampleJpeg("#abcdef")),
        kind: "brand",
        entitySlug: "orphan-test",
        alt,
        now,
      });
      key = record.key;
      expect(await findServableMedia(tx, key)).toMatchObject({ key });
    });
    // The transaction rolled back: the file may exist on disk, but it is not served.
    const { testDb } = await import("./helpers");
    expect(await findServableMedia(testDb, key)).toBeNull();
  });

  it("rejects bad input before any database work", async () => {
    const { prepareImage } = await import("@/lib/server/media/store");
    await expect(prepareImage(Buffer.from("GIF89a"))).rejects.toBeInstanceOf(
      MediaRejectedError,
    );
  });
});
