import { describe, expect, it } from "vitest";
import type { Product } from "./schema";
import {
  findProduct,
  getNewArrivals,
  getRelatedProducts,
  getSoldHighlights,
} from "./queries";

const base = {
  model: "M",
  condition: "excellent",
  setItems: [],
  material: { de: "x", en: "x", fr: "x", tr: "x" },
  description: { de: "x", en: "x", fr: "x", tr: "x" },
  price: { kind: "on-request" },
  images: [{ src: "/images/x.jpg", alt: { de: "x", en: "x", fr: "x", tr: "x" } }],
} as const;

const p = (slug: string, extra: Partial<Product>): Product =>
  ({
    ...base,
    slug,
    brand: "rolex",
    category: "watches",
    status: "available",
    addedAt: "2026-01-01",
    ...extra,
  }) as Product;

const catalog: Product[] = [
  p("w1", { addedAt: "2026-01-01" }),
  p("w2", { addedAt: "2026-03-01" }),
  p("w3", { addedAt: "2026-02-01", status: "sold" }),
  p("b1", { brand: "hermes", category: "bags", addedAt: "2026-04-01" }),
  p("b2", { brand: "hermes", category: "bags", addedAt: "2026-05-01", status: "sold" }),
];

describe("getNewArrivals", () => {
  it("returns unsold items newest first, limited", () => {
    expect(getNewArrivals(catalog, 2).map((x) => x.slug)).toEqual(["b1", "w2"]);
  });
});

describe("getSoldHighlights", () => {
  it("returns sold items newest first", () => {
    expect(getSoldHighlights(catalog, 5).map((x) => x.slug)).toEqual(["b2", "w3"]);
  });
});

describe("getRelatedProducts", () => {
  it("prefers same brand, then same category, excludes itself and sold items", () => {
    const target = catalog[0]!;
    expect(getRelatedProducts(target, catalog, 3).map((x) => x.slug)).toEqual([
      "w2",
      "b1",
    ]);
  });

  it("respects the limit boundary", () => {
    expect(getRelatedProducts(catalog[0]!, catalog, 0)).toEqual([]);
    expect(getRelatedProducts(catalog[0]!, catalog, 1).map((x) => x.slug)).toEqual([
      "w2",
    ]);
  });
});

describe("findProduct", () => {
  it("finds by slug", () => {
    expect(findProduct(catalog, "b1")?.slug).toBe("b1");
  });

  it("returns undefined for unknown or prototype-like slugs", () => {
    expect(findProduct(catalog, "nope")).toBeUndefined();
    expect(findProduct(catalog, "__proto__")).toBeUndefined();
  });
});
