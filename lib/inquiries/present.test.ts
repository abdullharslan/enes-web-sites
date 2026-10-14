import { describe, expect, it } from "vitest";
import { inquiryDetails, inquirySubject } from "./present";

const names = {
  conditions: { excellent: "Mükemmel" } as Record<string, string>,
  setItems: { box: "Kutu", papers: "Belgeler" } as Record<string, string>,
};

describe("inquirySubject", () => {
  it("names the product, the consigned item or the start of the message", () => {
    expect(inquirySubject("product", { item: "Rolex Submariner" })).toBe(
      "Rolex Submariner",
    );
    expect(inquirySubject("sell", { brand: "rolex", model: "Daytona" })).toBe(
      "rolex Daytona",
    );
    expect(inquirySubject("contact", { message: "a".repeat(100) })).toBe(
      `${"a".repeat(60)}…`,
    );
    expect(inquirySubject("contact", { message: "Kurz" })).toBe("Kurz");
  });

  it("never throws on unexpected stored data", () => {
    expect(inquirySubject("product", {})).toBe("—");
    expect(inquirySubject("sell", { brand: { evil: true } })).toBe("—");
  });
});

describe("inquiryDetails", () => {
  it("lists known fields in a fixed order, translating codes and skipping empty ones", () => {
    expect(
      inquiryDetails(
        {
          message: "Hallo",
          name: "Ada",
          phone: "",
          condition: "excellent",
          setItems: ["box", "papers"],
          year: 2020,
          unknown: "ignored",
        },
        names,
      ),
    ).toEqual([
      ["name", "Ada"],
      ["condition", "Mükemmel"],
      ["year", "2020"],
      ["setItems", "Kutu, Belgeler"],
      ["message", "Hallo"],
    ]);
  });
});
