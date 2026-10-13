import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localePath,
  resolveLocale,
  switchLocalePath,
} from "./locales";

describe("isLocale", () => {
  it.each(LOCALES)("accepts supported locale %s", (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it.each(["", "DE", "it", "fr-FR", "de-DE", " de", "__proto__", "constructor"])(
    "rejects unsupported value %j",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );
});

describe("resolveLocale", () => {
  it("falls back to the default locale when the header is missing", () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("supports French", () => {
    expect(resolveLocale("fr-FR,fr;q=0.9")).toBe("fr");
  });

  it("matches a region-specific tag to its base language", () => {
    expect(resolveLocale("tr-TR,tr;q=0.9")).toBe("tr");
  });

  it("respects quality weights rather than header order", () => {
    expect(resolveLocale("it;q=0.9,en;q=0.5,tr;q=0.8")).toBe("tr");
  });

  it("ignores unsupported languages and wildcard", () => {
    expect(resolveLocale("it-IT,*;q=0.1")).toBe(DEFAULT_LOCALE);
  });

  it("ignores entries with q=0 or malformed weights", () => {
    expect(resolveLocale("en;q=0,tr;q=abc")).toBe(DEFAULT_LOCALE);
  });

  it("always returns a supported locale for arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), (header) => {
        expect(isLocale(resolveLocale(header))).toBe(true);
      }),
    );
  });
});

describe("switchLocalePath", () => {
  it("replaces the locale segment and keeps the rest of the path", () => {
    expect(switchLocalePath("/de/collection/rolex-datejust", "en")).toBe(
      "/en/collection/rolex-datejust",
    );
  });

  it("handles the locale root", () => {
    expect(switchLocalePath("/tr", "de")).toBe("/de");
  });

  it("prefixes paths that carry no locale", () => {
    expect(switchLocalePath("/", "tr")).toBe("/tr");
    expect(switchLocalePath("/about", "en")).toBe("/en/about");
  });

  it("does not treat a locale-like prefix as a locale segment", () => {
    expect(switchLocalePath("/dex/page", "en")).toBe("/en/dex/page");
  });
});

describe("localePath", () => {
  it("prefixes app paths with the locale", () => {
    expect(localePath("en", "/collection")).toBe("/en/collection");
    expect(localePath("tr", "/collection?brand=rolex")).toBe(
      "/tr/collection?brand=rolex",
    );
  });

  it("maps the root path to the locale root", () => {
    expect(localePath("de", "/")).toBe("/de");
  });

  it("rejects paths that are not absolute app paths", () => {
    expect(() => localePath("de", "collection")).toThrow(TypeError);
    expect(() => localePath("de", "//evil.example")).toThrow(TypeError);
  });
});

describe("switchLocalePath with query", () => {
  it("keeps the query string", () => {
    expect(switchLocalePath("/de/collection", "en", "brand=rolex&sort=price-asc")).toBe(
      "/en/collection?brand=rolex&sort=price-asc",
    );
  });

  it("omits an empty query", () => {
    expect(switchLocalePath("/de/collection", "en", "")).toBe("/en/collection");
  });
});
