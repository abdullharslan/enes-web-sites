import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { JOURNAL } from "@/db/seed-data/journal";
import { SEED_CATEGORIES } from "@/db/seed-data/categories";
import { brandSchema, categorySchema, productSchema } from "@/lib/catalog/schema";
import { seedCatalogFixture } from "../fixtures/catalog";

const {
  brands: BRANDS,
  categories: CATEGORIES,
  products: PRODUCTS,
} = seedCatalogFixture();
import { LOCALES } from "@/lib/i18n/locales";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

const publicFile = (src: string) => join(process.cwd(), "public", src);

/** Flattens a JSON value into "path → leaf type" entries (array lengths included). */
function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return [
      `${path}[]#${value.length}`,
      ...value.flatMap((v, i) => shape(v, `${path}[${i}]`)),
    ];
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [`${path}:${typeof value}`];
}

function leaves(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === "object")
    return Object.values(value).flatMap(leaves);
  return [value];
}

describe("dictionaries contract", () => {
  it.each([
    ["en", en],
    ["tr", tr],
  ])("%s has exactly the same keys and structure as de", (_, dict) => {
    expect(shape(dict).sort()).toEqual(shape(de).sort());
  });

  it.each([
    ["de", de],
    ["en", en],
    ["tr", tr],
  ])("%s contains no empty strings", (_, dict) => {
    expect(leaves(dict).filter((v) => typeof v !== "string" || v.trim() === "")).toEqual(
      [],
    );
  });

  it("keeps placeholders identical across locales for every string", () => {
    const placeholders = (value: unknown) =>
      typeof value === "string" ? (value.match(/\{\w+\}/g) ?? []).sort().join() : "";
    const entries = (dict: unknown) => {
      const out = new Map<string, string>();
      const walk = (value: unknown, path: string) => {
        if (value !== null && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
        } else out.set(path, placeholders(value));
      };
      walk(dict, "");
      return out;
    };
    const reference = entries(de);
    expect([...reference.values()].some((p) => p !== "")).toBe(true);
    for (const dict of [en, tr]) {
      expect(Object.fromEntries(entries(dict))).toEqual(Object.fromEntries(reference));
    }
  });
});

describe("catalog data contract", () => {
  it("every brand and category matches the schema and slugs are unique", () => {
    BRANDS.forEach((b) => expect(brandSchema.parse(b)).toEqual(b));
    CATEGORIES.forEach((c) => expect(categorySchema.parse(c)).toEqual(c));
    expect(new Set(BRANDS.map((b) => b.slug)).size).toBe(BRANDS.length);
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(CATEGORIES.length);
  });

  it.each(PRODUCTS.map((p) => [p.slug, p] as const))(
    "%s matches the product schema",
    (_, p) => {
      expect(productSchema.parse(p)).toEqual(p);
    },
  );

  it("product slugs are unique", () => {
    expect(new Set(PRODUCTS.map((p) => p.slug)).size).toBe(PRODUCTS.length);
  });

  it("every product references a known brand and category", () => {
    for (const p of PRODUCTS) {
      expect(
        BRANDS.map((b) => b.slug),
        p.slug,
      ).toContain(p.brand);
      expect(
        CATEGORIES.map((c) => c.slug),
        p.slug,
      ).toContain(p.category);
    }
  });

  it("every referenced image exists on disk", () => {
    const sources = [
      ...PRODUCTS.flatMap((p) => p.images.map((i) => i.src)),
      ...SEED_CATEGORIES.map((c) => c.tileImage.src),
      ...JOURNAL.map((j) => j.image),
    ];
    expect(sources.filter((src) => !existsSync(publicFile(src)))).toEqual([]);
  });

  it("journal entries are localized in every locale", () => {
    for (const entry of JOURNAL) {
      for (const locale of LOCALES) {
        expect(entry.title[locale].trim()).not.toBe("");
        expect(entry.excerpt[locale].trim()).not.toBe("");
      }
    }
  });

  it("there is enough content for every home page section", () => {
    expect(PRODUCTS.filter((p) => p.status !== "sold").length).toBeGreaterThanOrEqual(6);
    expect(PRODUCTS.filter((p) => p.status === "sold").length).toBeGreaterThanOrEqual(3);
    expect(JOURNAL.length).toBeGreaterThanOrEqual(3);
  });
});
