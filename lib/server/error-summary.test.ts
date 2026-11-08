import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { errorSummary, operatorMessage } from "./error-summary";

const PERSONAL = ["Ada Lovelace", "+49 170 1234567", "ada@example.com"];
const failedInsert = () =>
  new DrizzleQueryError(
    "insert into inquiries values ($1, $2, $3)",
    PERSONAL,
    Object.assign(new Error("Key (email)=(ada@example.com) exists"), { code: "23505" }),
  );

describe("errorSummary", () => {
  it("keeps the name and the driver's code, and nothing from the query", () => {
    expect(errorSummary(failedInsert())).toBe("Error 23505");
  });

  it("uses a system error's own code", () => {
    const error = Object.assign(new TypeError("open /private/ada.jpg"), {
      code: "EACCES",
    });
    expect(errorSummary(error)).toBe("TypeError EACCES");
  });

  it("is the bare name without a code, and safe for anything thrown", () => {
    expect(errorSummary(new RangeError("ada@example.com"))).toBe("RangeError");
    expect(errorSummary("ada@example.com")).toBe("unknown");
    expect(errorSummary(null)).toBe("unknown");
  });

  it("ignores a code that is not a string", () => {
    const error = Object.assign(new Error("x"), { code: { email: "ada@example.com" } });
    expect(errorSummary(error)).toBe("Error");
  });
});

describe("operatorMessage", () => {
  it("does not repeat a failed query's parameters", () => {
    expect(operatorMessage(failedInsert())).toBe("Error 23505");
  });

  it("keeps the messages written for the operator", () => {
    expect(operatorMessage(new Error("Parolalar eşleşmiyor"))).toBe(
      "Parolalar eşleşmiyor",
    );
  });

  it("does not print anything else that was thrown", () => {
    expect(operatorMessage("ada@example.com")).toBe("unknown");
  });
});
