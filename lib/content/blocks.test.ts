import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import {
  CONTENT_BLOCKS,
  blockDefaults,
  blockInputSchema,
  isContentKey,
  type ContentKey,
} from "./blocks";

describe("content block definitions", () => {
  it("cover every editable section of the home page and the contact details", () => {
    expect(Object.keys(CONTENT_BLOCKS).sort()).toEqual(
      [
        "home.about",
        "home.brands",
        "home.categories",
        "home.hero",
        "home.journal",
        "home.newArrivals",
        "home.sellCta",
        "home.sold",
        "home.story",
        "home.trust",
        "site.contact",
      ].sort(),
    );
  });

  it("recognises only known keys", () => {
    expect(isContentKey("home.hero")).toBe(true);
    expect(isContentKey("home.__proto__")).toBe(false);
    expect(isContentKey("constructor")).toBe(false);
  });
});

describe("blockDefaults", () => {
  it("starts from today's dictionary texts in every locale", () => {
    const hero = blockDefaults("home.hero");
    expect(hero.title).toMatchObject({ de: de.hero.title });
    expect(Object.keys(hero.title as object).sort()).toEqual(["de", "en", "fr", "tr"]);
  });

  it("flattens list sections (trust promises) into numbered fields", () => {
    expect(blockDefaults("home.trust").item1Title).toMatchObject({
      de: de.trust.items[0]!.title,
    });
  });

  it("uses the configured contact details", () => {
    expect(blockDefaults("site.contact")).toMatchObject({
      email: "concierge@example.com",
      whatsappNumber: "447700900123",
    });
  });
});

describe("blockInputSchema", () => {
  const valid = blockDefaults("home.hero");

  it("accepts the defaults and an image reference", () => {
    expect(
      blockInputSchema("home.hero").safeParse({
        ...valid,
        image: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("requires German for translated fields", () => {
    expect(
      blockInputSchema("home.hero").safeParse({ ...valid, title: { en: "x" } }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (fail-closed)", () => {
    expect(
      blockInputSchema("home.hero").safeParse({ ...valid, script: "<script>" }).success,
    ).toBe(false);
  });

  it.each([
    ["email", { email: "not-an-email" }],
    ["WhatsApp number", { whatsappNumber: "+49 151" }],
    ["Instagram URL", { instagram: "javascript:alert(1)" }],
    ["http URL", { instagram: "http://instagram.com/x" }],
  ])("validates contact %s", (_, patch) => {
    const contact = blockDefaults("site.contact");
    expect(
      blockInputSchema("site.contact" as ContentKey).safeParse({ ...contact, ...patch })
        .success,
    ).toBe(false);
  });
});
