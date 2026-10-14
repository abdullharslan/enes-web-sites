import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { seedCatalogFixture } from "../../tests/fixtures/catalog";
import { normalizeForSearch, searchProducts } from "./search";

const catalog = seedCatalogFixture();
const slugs = (q: string, locale: "de" | "en" | "fr" | "tr" = "de") =>
  searchProducts(catalog, q, locale).map((p) => p.slug);

describe("normalizeForSearch", () => {
  it("folds case, accents and Turkish dotted/dotless i", () => {
    expect(normalizeForSearch("HERMÈS Çanta İstanbul ılık")).toBe(
      "hermes canta istanbul ilik",
    );
  });
});

describe("searchProducts", () => {
  it("finds by brand without accents", () => {
    expect(slugs("hermes")).toEqual(
      expect.arrayContaining(["hermes-kelly-28-sellier", "hermes-constance-24-croco"]),
    );
  });

  it("finds by reference number", () => {
    expect(slugs("126610")).toEqual(["rolex-submariner-date-126610ln"]);
  });

  it("requires every word to match (AND)", () => {
    expect(slugs("rolex submariner")).toEqual(["rolex-submariner-date-126610ln"]);
    expect(slugs("rolex kelly")).toEqual([]);
  });

  it("searches localized category names and descriptions", () => {
    expect(slugs("saat", "tr").length).toBeGreaterThan(0);
    expect(slugs("ayakkabılar", "tr")).toEqual(
      expect.arrayContaining(["miu-miu-satin-pumps", "chanel-slingback-pumps"]),
    );
  });

  it("ranks brand/model matches above description-only matches", () => {
    const results = slugs("chanel");
    expect(results.slice(0, 3).every((s) => s.startsWith("chanel-"))).toBe(true);
  });

  it("returns nothing for blank or too-long queries", () => {
    expect(slugs("   ")).toEqual([]);
    expect(slugs("x".repeat(201))).toEqual([]);
  });

  it("never throws and only returns catalog products (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (q) => {
        const found = searchProducts(catalog, q, "de");
        expect(found.every((p) => catalog.products.includes(p))).toBe(true);
      }),
    );
  });
});
