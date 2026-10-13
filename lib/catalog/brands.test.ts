import { describe, expect, it } from "vitest";
import { seedCatalogFixture } from "../../tests/fixtures/catalog";
import { findBrand, summarizeBrands } from "./brands";

const catalog = seedCatalogFixture();

describe("summarizeBrands", () => {
  it("keeps brand order and counts only unsold pieces", () => {
    const summaries = summarizeBrands(catalog);
    expect(summaries.map((s) => s.brand.slug)).toEqual(catalog.brands.map((b) => b.slug));
    const rolex = summaries.find((s) => s.brand.slug === "rolex");
    expect(rolex?.availableCount).toBe(3);
  });

  it("falls back to the newest product photo when the brand has no hero image", () => {
    const rolex = summarizeBrands(catalog).find((s) => s.brand.slug === "rolex");
    expect(rolex?.image?.src).toBe("/images/watch-diver.jpg");
  });

  it("prefers the brand's own hero image", () => {
    const hero = {
      src: "/images/watch-trio.jpg",
      alt: catalog.products[0]!.images[0]!.alt,
    };
    const withHero = {
      ...catalog,
      brands: catalog.brands.map((b) =>
        b.slug === "rolex" ? { ...b, heroImage: hero } : b,
      ),
    };
    expect(
      summarizeBrands(withHero).find((s) => s.brand.slug === "rolex")?.image,
    ).toEqual(hero);
  });

  it("handles a brand without products", () => {
    const empty = {
      ...catalog,
      brands: [...catalog.brands, { slug: "new-house", name: "New House" }],
    };
    expect(summarizeBrands(empty).at(-1)).toEqual({
      brand: { slug: "new-house", name: "New House" },
      image: undefined,
      availableCount: 0,
    });
  });
});

describe("findBrand", () => {
  it("finds known and rejects unknown slugs", () => {
    expect(findBrand(catalog, "miu-miu")?.name).toBe("Miu Miu");
    expect(findBrand(catalog, "gucci")).toBeUndefined();
  });
});
