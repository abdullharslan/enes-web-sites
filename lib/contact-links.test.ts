import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "./contact-links";

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link with an encoded message", () => {
    expect(buildWhatsAppUrl("447700900123", "Rolex Datejust & Box?")).toBe(
      "https://wa.me/447700900123?text=Rolex%20Datejust%20%26%20Box%3F",
    );
  });

  it("omits the text parameter for an empty message", () => {
    expect(buildWhatsAppUrl("447700900123", "")).toBe("https://wa.me/447700900123");
  });

  it.each(["", "+447700900123", "0049 151", "abc", "1234567", "1".repeat(16)])(
    "rejects invalid international number %j",
    (phone) => {
      expect(() => buildWhatsAppUrl(phone, "hi")).toThrow(TypeError);
    },
  );
});
