import { describe, expect, it } from "vitest";
import { describeChange, diffSnapshots, formatValue } from "./diff";

describe("diffSnapshots", () => {
  it("lists changed, added and removed fields, ignoring ids", () => {
    expect(
      diffSnapshots(
        { id: "1", name: "A", price: 10, description: { de: "x" }, gone: true },
        { id: "1", name: "B", price: 10, description: { de: "y" }, added: "new" },
      ),
    ).toEqual([
      { field: "name", before: "A", after: "B" },
      { field: "description", before: { de: "x" }, after: { de: "y" } },
      { field: "gone", before: true, after: undefined },
      { field: "added", before: undefined, after: "new" },
    ]);
  });

  it("treats the first revision as all fields added", () => {
    expect(diffSnapshots(null, { name: "A" })).toEqual([
      { field: "name", before: undefined, after: "A" },
    ]);
  });

  it("is empty for identical snapshots (key order does not matter)", () => {
    expect(
      diffSnapshots({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }),
    ).toEqual([]);
  });
});

describe("formatValue", () => {
  it.each([
    [undefined, "—"],
    [null, "—"],
    [true, "evet"],
    [false, "hayır"],
    [["box", "papers"], "box, papers"],
    [{ de: "Uhr", en: "Watch" }, "de: Uhr · en: Watch"],
    ["x".repeat(200), `${"x".repeat(117)}…`],
  ])("formats %j", (value, text) => {
    expect(formatValue(value)).toBe(text);
  });
});

describe("describeChange", () => {
  const context = {
    labels: { brandId: "Marka", priceEur: "Fiyat (EUR)", mediaIds: "Görseller" },
    names: new Map([["b1", "Rolex"]]),
    imagesLabel: "{count} görsel",
  };

  it("uses Turkish labels and resolves ids to names", () => {
    expect(
      describeChange({ field: "brandId", before: undefined, after: "b1" }, context),
    ).toEqual({
      label: "Marka",
      before: "—",
      after: "Rolex",
    });
  });

  it("summarises image lists by count", () => {
    expect(
      describeChange({ field: "mediaIds", before: ["a"], after: ["a", "b"] }, context),
    ).toEqual({
      label: "Görseller",
      before: "1 görsel",
      after: "2 görsel",
    });
  });

  it("falls back to the raw field name", () => {
    expect(describeChange({ field: "unknown", before: 1, after: 2 }, context).label).toBe(
      "unknown",
    );
  });
});
