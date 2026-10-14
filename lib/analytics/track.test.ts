import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  brandInterest,
  dailySeries,
  isCountable,
  parseRange,
  parseViewPath,
} from "./track";

const known = {
  products: new Set(["rolex-explorer-224270"]),
  brands: new Set(["rolex", "miu-miu"]),
};

describe("parseViewPath", () => {
  it("accepts the public pages and normalises them without the locale", () => {
    expect(parseViewPath("/de", known)).toEqual({ locale: "de", page: "/" });
    expect(parseViewPath("/fr/collection", known)).toEqual({
      locale: "fr",
      page: "/collection",
    });
    expect(parseViewPath("/en/collection/rolex-explorer-224270", known)).toEqual({
      locale: "en",
      page: "/collection/rolex-explorer-224270",
    });
    expect(parseViewPath("/tr/brands/miu-miu", known)).toEqual({
      locale: "tr",
      page: "/brands/miu-miu",
    });
    expect(parseViewPath("/de/legal/impressum", known)).toEqual({
      locale: "de",
      page: "/legal/impressum",
    });
  });

  it("rejects unknown locales, pages, products and brands (bounded storage)", () => {
    for (const path of [
      "/xx",
      "/de/unknown",
      "/de/collection/not-a-product",
      "/de/brands/gucci",
      "/de/legal/secret",
      "/admin",
      "/de/collection/rolex-explorer-224270/extra",
      "de/collection",
      "",
    ]) {
      expect(parseViewPath(path, known)).toBeNull();
    }
  });

  it("never throws and never accepts overly long input (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (path) => {
        const result = parseViewPath(path, known);
        if (result) expect(result.page.length).toBeLessThanOrEqual(200);
      }),
    );
  });
});

describe("isCountable", () => {
  const browser = {
    userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    doNotTrack: null,
    globalPrivacyControl: null,
    fetchSite: "same-origin",
  };

  it("counts ordinary same-origin browser requests", () => {
    expect(isCountable(browser)).toBe(true);
  });

  it("respects Do Not Track and Global Privacy Control", () => {
    expect(isCountable({ ...browser, doNotTrack: "1" })).toBe(false);
    expect(isCountable({ ...browser, globalPrivacyControl: "1" })).toBe(false);
  });

  it("ignores bots, missing user agents and cross-site requests", () => {
    for (const userAgent of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Mozilla/5.0 HeadlessChrome/120",
      "curl/8.4.0",
      "Chrome-Lighthouse",
      null,
    ]) {
      expect(isCountable({ ...browser, userAgent })).toBe(false);
    }
    expect(isCountable({ ...browser, fetchSite: "cross-site" })).toBe(false);
    expect(isCountable({ ...browser, fetchSite: null })).toBe(false);
  });
});

describe("dailySeries", () => {
  it("fills missing days with zero, oldest first, ending today", () => {
    const today = new Date("2026-10-14T15:00:00Z");
    expect(
      dailySeries(
        [
          { day: "2026-10-14", count: 3 },
          { day: "2026-10-12", count: 1 },
        ],
        3,
        today,
      ),
    ).toEqual([
      { day: "2026-10-12", count: 1 },
      { day: "2026-10-13", count: 0 },
      { day: "2026-10-14", count: 3 },
    ]);
  });
});

describe("parseRange", () => {
  it("accepts the offered ranges and falls back to 30 days", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange(["7", "90"])).toBe(30);
  });
});

describe("brandInterest", () => {
  it("adds brand page views and the brand's product views", () => {
    const productBrand = new Map([
      ["rolex-explorer", "rolex"],
      ["miu-miu-pumps", "miu-miu"],
    ]);
    expect(
      brandInterest(
        [
          { page: "/brands/rolex", count: 2 },
          { page: "/collection/rolex-explorer", count: 3 },
          { page: "/collection/miu-miu-pumps", count: 5 },
          { page: "/collection/unknown", count: 9 },
          { page: "/", count: 100 },
        ],
        productBrand,
      ),
    ).toEqual([
      // Equal totals are ordered alphabetically, so the order is deterministic.
      { brand: "miu-miu", count: 5 },
      { brand: "rolex", count: 5 },
    ]);
  });
});
