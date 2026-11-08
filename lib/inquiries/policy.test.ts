import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  INQUIRY_LIMITS,
  INQUIRY_RETENTION,
  INQUIRY_STATUSES,
  inquiryStatusChange,
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

describe("inquiryStatusChange", () => {
  const first = new Date("2026-01-10T09:00:00Z");
  const now = new Date("2026-03-01T09:00:00Z");
  const open = { status: "new", firstCompletedAt: null } as const;
  const done = { status: "done", firstCompletedAt: first } as const;

  it("changes nothing when the status stays the same", () => {
    for (const status of INQUIRY_STATUSES) {
      expect(
        inquiryStatusChange({ status, firstCompletedAt: first }, status, now),
      ).toBeNull();
    }
  });

  it("starts the retention clock at the first completion", () => {
    expect(inquiryStatusChange(open, "done", now)).toEqual({
      status: "done",
      firstCompletedAt: now,
    });
  });

  it("leaves the clock unset while an inquiry was never completed", () => {
    expect(inquiryStatusChange(open, "in_progress", now)).toEqual({
      status: "in_progress",
      firstCompletedAt: null,
    });
  });

  it("allows reopening (mistaken clicks) and keeps the first completion time", () => {
    const reopened = inquiryStatusChange(done, "in_progress", now)!;
    expect(reopened).toEqual({ status: "in_progress", firstCompletedAt: first });
    expect(inquiryStatusChange(reopened, "done", now)).toEqual({
      status: "done",
      firstCompletedAt: first,
    });
  });

  it("never moves the clock, whatever the path (property)", () => {
    const status = fc.constantFrom(...INQUIRY_STATUSES);
    fc.assert(
      fc.property(status, fc.array(status), (start, path) => {
        let state = { status: start, firstCompletedAt: first as Date | null };
        for (const next of path) {
          state = inquiryStatusChange(state, next, now) ?? state;
          expect(state.firstCompletedAt).toBe(first);
        }
      }),
    );
  });
});
