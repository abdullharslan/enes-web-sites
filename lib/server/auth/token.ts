import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness, base64url-encoded; only ever stored in the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores: a leaked DB row cannot be replayed as a cookie. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
