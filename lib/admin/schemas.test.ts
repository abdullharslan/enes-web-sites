import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brandInput,
  categoryInput,
  journalSaveInput,
  productInput,
  translationsFromForm,
} from "./schemas";

const form = (entries: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries))
    for (const item of [v].flat()) fd.append(k, item);
  return fd;
};

describe("translationsFromForm", () => {
  it("collects name.<locale> fields and drops blank optional locales", () => {
    expect(
      translationsFromForm(
        form({
          "name.de": " Uhren ",
          "name.en": "Watches",
          "name.fr": "",
          "name.tr": "  ",
        }),
        "name",
      ),
    ).toEqual({
      de: "Uhren",
      en: "Watches",
    });
  });
});

describe("brandInput", () => {
  const valid = {
    slug: "miu-miu",
    name: "Miu Miu",
    description: { de: "Text" },
    sortOrder: 3,
    isVisible: true,
    expectedVersion: 2,
  };

  it("accepts a valid brand", () => {
    expect(brandInput.parse(valid)).toEqual(valid);
  });

  it.each([
    ["upper-case slug", { slug: "Miu" }],
    ["slug with traversal", { slug: "../x" }],
    ["empty name", { name: " " }],
    ["negative sort order", { sortOrder: -1 }],
  ])("rejects %s", (_, patch) => {
    expect(brandInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("allows an empty description but not one without German when other locales are given", () => {
    expect(brandInput.safeParse({ ...valid, description: {} }).success).toBe(true);
    expect(
      brandInput.safeParse({ ...valid, description: { en: "only english" } }).success,
    ).toBe(false);
  });
});

describe("categoryInput", () => {
  it("requires a German name", () => {
    const base = { slug: "shoes", sortOrder: 0, isVisible: true, expectedVersion: 0 };
    expect(categoryInput.safeParse({ ...base, name: { de: "Schuhe" } }).success).toBe(
      true,
    );
    expect(categoryInput.safeParse({ ...base, name: { en: "Shoes" } }).success).toBe(
      false,
    );
  });
});

describe("productInput", () => {
  const valid = {
    slug: "rolex-gmt",
    brandId: "11111111-1111-4111-8111-111111111111",
    categoryId: "22222222-2222-4222-8222-222222222222",
    model: "GMT-Master II",
    reference: "126710BLRO",
    year: 2022,
    condition: "excellent",
    setItems: ["box", "papers"],
    material: { de: "Stahl" },
    dimensions: "40 mm",
    description: { de: "Pepsi" },
    priceEur: 21500,
    status: "available",
    sortOrder: 0,
    isVisible: true,
    addedAt: "2026-10-14",
    expectedVersion: 0,
  };

  it("accepts a valid product, including price on request", () => {
    expect(productInput.safeParse(valid).success).toBe(true);
    expect(productInput.safeParse({ ...valid, priceEur: null }).success).toBe(true);
  });

  it.each([
    ["zero price", { priceEur: 0 }],
    ["fractional price", { priceEur: 10.5 }],
    ["year out of range", { year: 1899 }],
    ["unknown condition", { condition: "mint" }],
    ["unknown set item", { setItems: ["yacht"] }],
    ["bad date", { addedAt: "14.10.2026" }],
    ["non-uuid brand", { brandId: "rolex" }],
    ["missing German description", { description: { en: "x" } }],
  ])("rejects %s", (_, patch) => {
    expect(productInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("journalSaveInput", () => {
  afterEach(() => vi.useRealTimers());

  const entry = (publishedAt: string) => ({
    slug: "beitrag",
    publishedAt,
    title: { de: "Titel" },
    excerpt: { de: "Text" },
    isVisible: true,
    expectedVersion: 0,
  });

  it("judges 'today' by the calendar in Berlin, not in UTC", () => {
    // 23:30 UTC on 8 Nov is already 00:30 on 9 Nov in Berlin.
    vi.useFakeTimers({ now: new Date("2026-11-08T23:30:00Z") });
    expect(journalSaveInput.safeParse(entry("2026-11-09")).success).toBe(true);
    const tomorrow = journalSaveInput.safeParse(entry("2026-11-10"));
    expect(tomorrow.error?.issues).toEqual([
      expect.objectContaining({ path: ["publishedAt"], message: "futureDate" }),
    ]);
  });

  it("accepts today and earlier dates", () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T12:00:00Z") });
    expect(journalSaveInput.safeParse(entry("2026-11-08")).success).toBe(true);
    expect(journalSaveInput.safeParse(entry("2020-01-01")).success).toBe(true);
  });
});
