import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatEur, formatPrice } from "./format";

describe("formatEur", () => {
  it("formats whole euros per locale without decimals", () => {
    expect(formatEur(24500, "de")).toBe("24.500 €");
    expect(formatEur(24500, "en")).toBe("€24,500");
    expect(formatEur(24500, "tr")).toBe("€24.500");
  });

  it("formats zero", () => {
    expect(formatEur(0, "en")).toBe("€0");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => formatEur(amount, "de")).toThrow(RangeError);
    },
  );

  it("always contains the euro sign for valid amounts", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000_000 }),
        fc.constantFrom("de", "en", "tr"),
        (n, l) => {
          expect(formatEur(n, l as "de" | "en" | "tr")).toContain("€");
        },
      ),
    );
  });
});

describe("formatPrice", () => {
  it("formats fixed prices", () => {
    expect(
      formatPrice({ kind: "fixed", amountEur: 9800 }, "de", "Preis auf Anfrage"),
    ).toBe("9.800 €");
  });

  it("uses the on-request label", () => {
    expect(formatPrice({ kind: "on-request" }, "en", "Price on request")).toBe(
      "Price on request",
    );
  });
});
