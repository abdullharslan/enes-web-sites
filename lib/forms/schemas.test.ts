import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FIELD_LIMITS, inquirySchema, sellSchema, validateForm } from "./schemas";

const validInquiry = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  message: "Ist die Uhr noch verfügbar?",
};

describe("validateForm with inquirySchema", () => {
  it("accepts a valid inquiry and trims values", () => {
    const result = validateForm(inquirySchema, { ...validInquiry, name: "  Ada  " });
    expect(result).toEqual({ ok: true, data: { ...validInquiry, name: "Ada" } });
  });

  it("reports required fields", () => {
    const result = validateForm(inquirySchema, {
      name: " ",
      email: "",
      phone: "",
      message: "",
    });
    expect(result).toEqual({
      ok: false,
      errors: { name: "required", email: "required", message: "required" },
    });
  });

  it("rejects malformed e-mail and phone", () => {
    const result = validateForm(inquirySchema, {
      ...validInquiry,
      email: "ada@",
      phone: "call me",
    });
    expect(result).toEqual({
      ok: false,
      errors: { email: "invalidEmail", phone: "invalidPhone" },
    });
  });

  it("enforces the message length boundary", () => {
    const max = FIELD_LIMITS.message;
    expect(
      validateForm(inquirySchema, { ...validInquiry, message: "a".repeat(max) }).ok,
    ).toBe(true);
    expect(
      validateForm(inquirySchema, { ...validInquiry, message: "a".repeat(max + 1) }),
    ).toEqual({
      ok: false,
      errors: { message: "tooLong" },
    });
  });

  it("treats missing keys as required errors instead of throwing", () => {
    expect(validateForm(inquirySchema, {})).toMatchObject({ ok: false });
  });

  it("never throws for arbitrary string records (property)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.string()), (input) => {
        const result = validateForm(inquirySchema, input);
        expect(typeof result.ok).toBe("boolean");
      }),
    );
  });
});

describe("validateForm with sellSchema", () => {
  const validSell = {
    brand: "rolex",
    category: "watches",
    model: "Submariner 126610LN",
    condition: "excellent",
    year: "2021",
    askingPrice: "",
    setItems: ["box", "papers"],
    name: "Ada",
    email: "ada@example.com",
    phone: "+49 151 0000000",
    message: "",
  };

  it("accepts a valid submission and coerces numbers", () => {
    const result = validateForm(sellSchema, validSell);
    expect(result).toMatchObject({
      ok: true,
      data: { year: 2021, askingPrice: undefined },
    });
  });

  it("rejects unknown enum values (fail-closed)", () => {
    const result = validateForm(sellSchema, {
      ...validSell,
      category: "cars",
      setItems: ["yacht"],
    });
    expect(result).toEqual({
      ok: false,
      errors: { category: "required", setItems: "invalid" },
    });
  });

  it("rejects out-of-range year and negative price", () => {
    const result = validateForm(sellSchema, {
      ...validSell,
      year: "1800",
      askingPrice: "-5",
    });
    expect(result).toEqual({
      ok: false,
      errors: { year: "invalidYear", askingPrice: "invalidNumber" },
    });
  });
});
