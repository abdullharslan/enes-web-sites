import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("replaces named placeholders", () => {
    expect(interpolate("{count} Objekte von {brand}", { count: 3, brand: "Rolex" })).toBe(
      "3 Objekte von Rolex",
    );
  });

  it("replaces repeated placeholders", () => {
    expect(interpolate("{a}-{a}", { a: "x" })).toBe("x-x");
  });

  it("fails fast on a missing variable", () => {
    expect(() => interpolate("Hallo {name}", {})).toThrow(/name/);
  });

  it("does not interpret special replacement patterns in values", () => {
    expect(interpolate("{v}", { v: "$& $1" })).toBe("$& $1");
  });
});
