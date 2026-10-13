import { describe, expect, it } from "vitest";
import { PERMISSIONS, can } from "./permissions";

describe("role permission matrix", () => {
  it("gives owners every permission", () => {
    for (const permission of PERMISSIONS) expect(can("owner", permission)).toBe(true);
  });

  it("lets editors manage catalog, content and media", () => {
    expect(can("editor", "catalog:write")).toBe(true);
    expect(can("editor", "content:write")).toBe(true);
    expect(can("editor", "media:write")).toBe(true);
    expect(can("editor", "history:read")).toBe(true);
  });

  it("keeps user management and the audit log owner-only", () => {
    expect(can("editor", "users:manage")).toBe(false);
    expect(can("editor", "audit:read")).toBe(false);
  });

  it("fails closed for unknown roles", () => {
    expect(can("guest" as never, "catalog:write")).toBe(false);
  });
});
