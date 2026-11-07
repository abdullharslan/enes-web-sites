import { describe, expect, it, vi } from "vitest";
import { fieldsKey, savedNotice } from "./form-key";

vi.mock("server-only", () => ({}));

const product = {
  slug: "rolex-x",
  model: "X",
  priceEur: 1000,
  currentVersion: 5,
  updatedAt: new Date("2026-11-08T10:00:00Z"),
  images: [{ mediaId: "a", src: "/media/a.webp" }],
};

describe("fieldsKey", () => {
  it("stays the same when only images or bookkeeping change", () => {
    expect(
      fieldsKey({
        ...product,
        currentVersion: 6,
        updatedAt: new Date("2026-11-08T11:00:00Z"),
        images: [],
        heroMediaId: "h",
        heroSrc: "/media/h.webp",
        tileMediaId: "t",
        tileSrc: "/media/t.webp",
        imageMediaId: "j",
        imageSrc: "/media/j.webp",
        mediaIds: ["b"],
      }),
    ).toBe(fieldsKey(product));
  });

  it("changes when a field changes, whatever the key order", () => {
    expect(fieldsKey({ ...product, priceEur: 1100 })).not.toBe(fieldsKey(product));
    const { slug, ...rest } = product;
    expect(fieldsKey({ ...rest, slug })).toBe(fieldsKey(product));
  });
});

describe("savedNotice", () => {
  it("shows the saved version only while it is the current one", () => {
    expect(savedNotice("5", 5)).toBe("5");
    expect(savedNotice("5", 6)).toBeUndefined();
    expect(savedNotice(undefined, 5)).toBeUndefined();
    expect(savedNotice(["5"], 5)).toBeUndefined();
  });
});
