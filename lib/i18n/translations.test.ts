import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";
import { missingLocales, resolveTranslations } from "./translations";

describe("resolveTranslations", () => {
  it("keeps provided translations", () => {
    expect(resolveTranslations({ de: "Uhr", en: "Watch", tr: "Saat" })).toMatchObject({
      de: "Uhr",
      en: "Watch",
      tr: "Saat",
    });
  });

  it("falls back to the default locale for missing or blank entries", () => {
    const resolved = resolveTranslations({ de: "Uhr", en: "  " });
    for (const locale of LOCALES)
      expect(resolved[locale]).toBe(locale === "de" ? "Uhr" : "Uhr");
  });

  it("fails fast when the default locale is missing", () => {
    expect(() => resolveTranslations({ en: "Watch" })).toThrow(/default locale/);
  });

  it("ignores unknown locale keys", () => {
    expect(Object.keys(resolveTranslations({ de: "x", xx: "y" })).sort()).toEqual(
      [...LOCALES].sort(),
    );
  });
});

describe("missingLocales", () => {
  it("lists locales that would fall back", () => {
    expect(missingLocales({ de: "Uhr", en: "Watch", tr: "" })).toEqual(
      LOCALES.filter((l) => l !== "de" && l !== "en"),
    );
  });
});
