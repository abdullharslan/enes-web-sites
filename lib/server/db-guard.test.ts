import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "@/db/reset";

describe("assertLocalDatabase (db:reset guard)", () => {
  it.each([
    "postgres://u:p@127.0.0.1:5433/db",
    "postgres://u:p@localhost/db",
    "postgres://u:p@[::1]:5432/db",
  ])("allows local %s", (url) => {
    expect(assertLocalDatabase(url, "development")).toBe(url);
  });

  it.each([
    "postgres://u:p@db.example.com/db",
    "postgres://u:p@10.0.0.5/db",
    "postgres://u:p@localhost.evil.com/db",
  ])("refuses remote %s", (url) => {
    expect(() => assertLocalDatabase(url, "development")).toThrow(/local database/);
  });

  it("refuses production and missing URLs", () => {
    expect(() =>
      assertLocalDatabase("postgres://u:p@localhost/db", "production"),
    ).toThrow(/production/);
    expect(() => assertLocalDatabase(undefined, "development")).toThrow(/not set/);
  });
});
