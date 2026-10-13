import { describe, expect, it } from "vitest";
import { pluralize } from "./plural";

const forms = { one: "{count} Objekt", other: "{count} Objekte" };

describe("pluralize", () => {
  it("uses the singular form for one", () => {
    expect(pluralize("de", 1, forms)).toBe("1 Objekt");
  });

  it.each([0, 2, 17])("uses the plural form for %i", (n) => {
    expect(pluralize("de", n, forms)).toBe(`${n} Objekte`);
  });
});
