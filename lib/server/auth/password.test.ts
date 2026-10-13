import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblems, verifyPassword } from "./password";

describe("password policy", () => {
  it("accepts a long passphrase", () => {
    expect(passwordProblems("correct horse battery staple")).toEqual([]);
  });

  it.each([
    ["too short", "Short1!", ["tooShort"]],
    ["too long", "x".repeat(257), ["tooLong"]],
    ["blank", "            ", ["blank"]],
  ])("rejects %s", (_, password, problems) => {
    expect(passwordProblems(password)).toEqual(problems);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stapler")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same passphrase here")).not.toBe(
      await hashPassword("same passphrase here"),
    );
  });

  it("returns false (never throws) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});
