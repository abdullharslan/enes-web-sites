import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  INQUIRY_LIMITS,
  INQUIRY_RETENTION,
  photoProblem,
  retentionCutoffs,
} from "./policy";

const MB = 1024 * 1024;
const file = (size: number, type = "image/jpeg") => ({ size, type });

describe("photoProblem", () => {
  it("accepts no photos and up to the limit of reasonable images", () => {
    expect(photoProblem([])).toBeNull();
    expect(
      photoProblem(Array.from({ length: INQUIRY_LIMITS.maxPhotos }, () => file(2 * MB))),
    ).toBeNull();
  });

  it("rejects too many photos", () => {
    expect(
      photoProblem(Array.from({ length: INQUIRY_LIMITS.maxPhotos + 1 }, () => file(1))),
    ).toBe("tooManyPhotos");
  });

  it("rejects a single file above the per-photo limit (boundary)", () => {
    expect(photoProblem([file(INQUIRY_LIMITS.maxPhotoBytes)])).toBeNull();
    expect(photoProblem([file(INQUIRY_LIMITS.maxPhotoBytes + 1)])).toBe("photoTooLarge");
  });

  it("rejects photos that are together too large", () => {
    const each = Math.floor(INQUIRY_LIMITS.maxTotalPhotoBytes / 2) + 1;
    expect(photoProblem([file(each), file(each)])).toBe("photoTooLarge");
  });

  it("rejects empty files and non-image types", () => {
    expect(photoProblem([file(0)])).toBe("photoInvalid");
    expect(photoProblem([file(10, "application/pdf")])).toBe("photoInvalid");
    expect(photoProblem([file(10, "image/svg+xml")])).toBe("photoInvalid");
  });

  it("never accepts more than the total byte budget (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 12 * MB }), { maxLength: 6 }),
        (sizes) => {
          const ok = photoProblem(sizes.map((s) => file(s))) === null;
          const total = sizes.reduce((a, b) => a + b, 0);
          if (ok) {
            expect(sizes.length).toBeLessThanOrEqual(INQUIRY_LIMITS.maxPhotos);
            expect(total).toBeLessThanOrEqual(INQUIRY_LIMITS.maxTotalPhotoBytes);
          }
        },
      ),
    );
  });
});

describe("retentionCutoffs", () => {
  it("derives every cutoff from the same clock", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const cut = retentionCutoffs(now);
    expect(now.getTime() - cut.addressHashBefore.getTime()).toBe(
      INQUIRY_RETENTION.addressHashMs,
    );
    expect(now.getTime() - cut.doneBefore.getTime()).toBe(INQUIRY_RETENTION.doneMs);
    expect(now.getTime() - cut.anyBefore.getTime()).toBe(INQUIRY_RETENTION.anyMs);
  });

  it("keeps finished inquiries for less time than open ones", () => {
    expect(INQUIRY_RETENTION.doneMs).toBeLessThan(INQUIRY_RETENTION.anyMs);
    expect(INQUIRY_RETENTION.addressHashMs).toBeLessThanOrEqual(INQUIRY_RETENTION.doneMs);
  });
});
