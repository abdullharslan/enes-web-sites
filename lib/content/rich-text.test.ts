import { describe, expect, it } from "vitest";
import { parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(parseRichText("Erster Absatz\nzweite Zeile\n\nZweiter Absatz")).toEqual([
      { type: "paragraph", lines: ["Erster Absatz", "zweite Zeile"] },
      { type: "paragraph", lines: ["Zweiter Absatz"] },
    ]);
  });

  it("turns lines starting with '## ' into headings", () => {
    expect(parseRichText("## Angaben gemäß § 5 DDG\nMaison Vault GmbH")).toEqual([
      { type: "heading", text: "Angaben gemäß § 5 DDG" },
      { type: "paragraph", lines: ["Maison Vault GmbH"] },
    ]);
  });

  it("never interprets HTML (text stays text)", () => {
    expect(parseRichText("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", lines: ["<script>alert(1)</script>"] },
    ]);
  });

  it("handles CRLF, surrounding whitespace and empty input", () => {
    expect(parseRichText("  A\r\n\r\n\r\nB  ")).toEqual([
      { type: "paragraph", lines: ["A"] },
      { type: "paragraph", lines: ["B"] },
    ]);
    expect(parseRichText("")).toEqual([]);
  });
});
