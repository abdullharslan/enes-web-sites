import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./token";

describe("session tokens", () => {
  it("are 256-bit, URL-safe and unique", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("are stored only as a SHA-256 hash", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});
