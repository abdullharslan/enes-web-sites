import { describe, expect, it } from "vitest";
import { CONTENT_BLOCKS, type FieldDef } from "@/lib/content/blocks";
import { resolveHome } from "@/lib/content/home";
import de from "@/messages/de.json";

/** Every home section must render exactly the texts it rendered from the dictionary before. */
describe("content blocks ↔ dictionary contract", () => {
  const home = resolveHome({ blocks: new Map(), images: new Map() }, "de");

  it.each([
    ["hero", "hero"],
    ["brands", "brands"],
    ["categories", "categories"],
    ["sold", "sold"],
    ["sellCta", "sellCta"],
    ["story", "story"],
    ["trust", "trust"],
  ] as const)("%s defaults equal the dictionary", (section, dictKey) => {
    expect(home[section]).toEqual(de[dictKey]);
  });

  it.each([
    ["about", "about", ["eyebrow", "title", "teaser", "cta"]],
    ["newArrivals", "newArrivals", ["eyebrow", "title", "viewAll"]],
    ["journal", "journal", ["eyebrow", "title", "overview"]],
  ] as const)(
    "%s defaults equal the dictionary for its editable keys",
    (section, dictKey, keys) => {
      const expected = Object.fromEntries(
        keys.map((k) => [k, (de[dictKey] as Record<string, unknown>)[k]]),
      );
      expect(home[section]).toEqual(expected);
    },
  );

  it("every translated field has a dictionary source", () => {
    for (const block of Object.values(CONTENT_BLOCKS)) {
      for (const field of block.fields as readonly FieldDef[]) {
        if (field.kind === "text" || field.kind === "multiline")
          expect(field.source, field.key).toBeDefined();
      }
    }
  });
});
