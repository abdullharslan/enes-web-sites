import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Product } from "./schema";
import {
  DEFAULT_FILTER,
  filterProducts,
  isDefaultFilter,
  parseCatalogFilter,
  serializeCatalogFilter,
  type CatalogFilter,
} from "./filter";

const BRANDS = ["rolex", "hermes"] as const;

function product(overrides: Partial<Product>): Product {
  return {
    slug: "p",
    brand: "rolex",
    category: "watches",
    model: "Model",
    condition: "excellent",
    setItems: [],
    material: { de: "x", en: "x", tr: "x" },
    description: { de: "x", en: "x", tr: "x" },
    price: { kind: "fixed", amountEur: 1000 },
    status: "available",
    images: [{ src: "/images/x.jpg", alt: { de: "x", en: "x", tr: "x" } }],
    addedAt: "2026-01-01",
    ...overrides,
  };
}

const catalog: Product[] = [
  product({
    slug: "a",
    brand: "rolex",
    price: { kind: "fixed", amountEur: 9000 },
    addedAt: "2026-03-01",
  }),
  product({
    slug: "b",
    brand: "hermes",
    category: "bags",
    price: { kind: "on-request" },
    addedAt: "2026-05-01",
  }),
  product({
    slug: "c",
    brand: "rolex",
    status: "sold",
    price: { kind: "fixed", amountEur: 3000 },
    addedAt: "2026-04-01",
  }),
  product({
    slug: "d",
    brand: "hermes",
    category: "bags",
    status: "reserved",
    price: { kind: "fixed", amountEur: 20000 },
    addedAt: "2026-02-01",
  }),
];

const slugs = (products: readonly Product[]) => products.map((p) => p.slug);

describe("parseCatalogFilter", () => {
  it("returns defaults for empty params", () => {
    expect(parseCatalogFilter(new URLSearchParams(), BRANDS)).toEqual(DEFAULT_FILTER);
  });

  it("reads valid values", () => {
    const params = new URLSearchParams(
      "brand=hermes&category=bags&availability=all&sort=price-desc",
    );
    expect(parseCatalogFilter(params, BRANDS)).toEqual({
      brand: "hermes",
      category: "bags",
      availability: "all",
      sort: "price-desc",
    });
  });

  it("fails closed: unknown values fall back to defaults", () => {
    const params = new URLSearchParams(
      "brand=gucci&category=cars&availability=x&sort=random",
    );
    expect(parseCatalogFilter(params, BRANDS)).toEqual(DEFAULT_FILTER);
  });

  it("round-trips through serializeCatalogFilter", () => {
    const filter: CatalogFilter = {
      brand: "rolex",
      category: "watches",
      availability: "all",
      sort: "price-asc",
    };
    expect(
      parseCatalogFilter(new URLSearchParams(serializeCatalogFilter(filter)), BRANDS),
    ).toEqual(filter);
  });

  it("never throws and always yields a valid filter for arbitrary query strings", () => {
    fc.assert(
      fc.property(fc.string(), (query) => {
        const filter = parseCatalogFilter(new URLSearchParams(query), BRANDS);
        expect(
          filter.brand === null ||
            BRANDS.includes(filter.brand as (typeof BRANDS)[number]),
        ).toBe(true);
      }),
    );
  });
});

describe("serializeCatalogFilter", () => {
  it("omits default values to keep URLs clean", () => {
    expect(serializeCatalogFilter(DEFAULT_FILTER)).toBe("");
    expect(serializeCatalogFilter({ ...DEFAULT_FILTER, brand: "rolex" })).toBe(
      "brand=rolex",
    );
  });
});

describe("filterProducts", () => {
  it("shows purchasable items (available + reserved) newest first by default", () => {
    expect(slugs(filterProducts(catalog, DEFAULT_FILTER))).toEqual(["b", "a", "d"]);
  });

  it("includes sold items when availability is 'all'", () => {
    expect(
      slugs(filterProducts(catalog, { ...DEFAULT_FILTER, availability: "all" })),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("filters by brand and category", () => {
    expect(
      slugs(filterProducts(catalog, { ...DEFAULT_FILTER, brand: "hermes" })),
    ).toEqual(["b", "d"]);
    expect(
      slugs(filterProducts(catalog, { ...DEFAULT_FILTER, category: "watches" })),
    ).toEqual(["a"]);
  });

  it("sorts by price ascending with on-request items last", () => {
    expect(
      slugs(filterProducts(catalog, { ...DEFAULT_FILTER, sort: "price-asc" })),
    ).toEqual(["a", "d", "b"]);
  });

  it("sorts by price descending with on-request items last", () => {
    expect(
      slugs(filterProducts(catalog, { ...DEFAULT_FILTER, sort: "price-desc" })),
    ).toEqual(["d", "a", "b"]);
  });

  it("does not mutate its input", () => {
    const before = slugs(catalog);
    filterProducts(catalog, { ...DEFAULT_FILTER, sort: "price-asc" });
    expect(slugs(catalog)).toEqual(before);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      filterProducts(catalog, { ...DEFAULT_FILTER, brand: "rolex", category: "bags" }),
    ).toEqual([]);
  });

  it("is a subset of the input for any filter (property)", () => {
    fc.assert(
      fc.property(
        fc.record({
          brand: fc.constantFrom(null, "rolex", "hermes"),
          category: fc.constantFrom(null, "bags", "watches", "jewellery"),
          availability: fc.constantFrom("available", "all"),
          sort: fc.constantFrom("newest", "price-asc", "price-desc"),
        }),
        (filter) => {
          const result = filterProducts(catalog, filter as CatalogFilter);
          expect(result.every((p) => catalog.includes(p))).toBe(true);
          expect(new Set(slugs(result)).size).toBe(result.length);
        },
      ),
    );
  });
});

describe("isDefaultFilter", () => {
  it("is true only for the default filter", () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    expect(isDefaultFilter({ ...DEFAULT_FILTER, sort: "price-asc" })).toBe(false);
  });
});
