import { describe, expect, it } from "vitest";
import { buildMailtoUrl, buildWhatsAppUrl } from "./contact-links";

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

describe("buildMailtoUrl", () => {
  it("encodes subject and body", () => {
    expect(
      buildMailtoUrl("concierge@example.com", "Anfrage: Kelly 28", "Hallo\nWelt"),
    ).toBe(
      "mailto:concierge@example.com?subject=Anfrage%3A%20Kelly%2028&body=Hallo%0D%0AWelt",
    );
  });

  it.each([
    "",
    "no-at-sign",
    "a@b",
    "a b@example.com",
    "x@example.com?cc=evil@example.com",
  ])("rejects invalid recipient %j", (email) => {
    expect(() => buildMailtoUrl(email, "s", "b")).toThrow(TypeError);
  });
});

describe("buildMailtoUrl line breaks (RFC 6068)", () => {
  it("encodes line breaks as CRLF", () => {
    expect(buildMailtoUrl("a@example.com", "s", "a\nb")).toBe(
      "mailto:a@example.com?subject=s&body=a%0D%0Ab",
    );
  });

  it("does not double CRLF that is already present", () => {
    expect(buildMailtoUrl("a@example.com", "s", "a\r\nb")).toBe(
      "mailto:a@example.com?subject=s&body=a%0D%0Ab",
    );
  });
});
