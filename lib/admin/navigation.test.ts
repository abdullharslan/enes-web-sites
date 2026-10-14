import { describe, expect, it } from "vitest";
import { adminNavFor } from "./navigation";

describe("adminNavFor", () => {
  it("shows owners everything including users and audit", () => {
    expect(adminNavFor("owner").map((i) => i.href)).toEqual(
      expect.arrayContaining([
        "/admin/users",
        "/admin/audit",
        "/admin/products",
        "/admin/home",
      ]),
    );
  });

  it("hides users and audit from editors", () => {
    const hrefs = adminNavFor("editor").map((i) => i.href);
    expect(hrefs).toContain("/admin/products");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/admin/audit");
  });

  it("lets every role reach its own account page", () => {
    for (const role of ["owner", "editor"] as const) {
      expect(adminNavFor(role).map((i) => i.href)).toContain("/admin/account");
    }
  });
});
