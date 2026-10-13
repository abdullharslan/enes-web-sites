import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import tr from "@/messages/tr.json";
import { blockDefaults } from "./blocks";
import { resolveBlock, resolveContact, resolveTrust } from "./resolve";

const noImages = new Map<string, { src: string; alt: Record<string, string> }>();

describe("resolveBlock", () => {
  it("returns stored texts for the locale", () => {
    const stored = { ...blockDefaults("home.hero"), title: { de: "Neu", tr: "Yeni" } };
    expect(resolveBlock("home.hero", stored, "tr", noImages).title).toBe("Yeni");
  });

  it("falls back to German for a missing translation", () => {
    const stored = { ...blockDefaults("home.hero"), title: { de: "Nur Deutsch" } };
    expect(resolveBlock("home.hero", stored, "fr", noImages).title).toBe("Nur Deutsch");
  });

  it("uses the dictionary defaults when nothing is stored", () => {
    expect(resolveBlock("home.hero", undefined, "tr", noImages).title).toBe(
      tr.hero.title,
    );
  });

  it("falls back to defaults for invalid stored data instead of failing (and reports it)", () => {
    const issues: string[] = [];
    const resolved = resolveBlock("home.hero", { title: 42 }, "de", noImages, (key) =>
      issues.push(key),
    );
    expect(resolved.title).toBe(de.hero.title);
    expect(issues).toEqual(["home.hero"]);
  });

  it("resolves the image reference to a URL with localized alt text", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const images = new Map([
      [id, { src: "/media/home/home-hero/x.webp", alt: { de: "Uhr", tr: "Saat" } }],
    ]);
    const resolved = resolveBlock(
      "home.hero",
      { ...blockDefaults("home.hero"), image: id },
      "tr",
      images,
    );
    expect(resolved.image).toEqual({ src: "/media/home/home-hero/x.webp", alt: "Saat" });
  });
});

describe("resolveTrust", () => {
  it("rebuilds the list of promises", () => {
    const trust = resolveTrust(blockDefaults("home.trust"), "de", noImages);
    expect(trust.items).toHaveLength(4);
    expect(trust.items[0]).toEqual(de.trust.items[0]);
  });
});

describe("resolveContact", () => {
  it("derives the tel: link from the displayed number", () => {
    const contact = resolveContact({
      ...blockDefaults("site.contact"),
      phoneDisplay: "+49 (0) 151 / 234-567",
    });
    expect(contact.phoneHref).toBe("tel:+490151234567");
  });
});
