import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveRedirect } from "./redirect";

describe("resolveRedirect", () => {
  it("does not redirect paths that already carry a locale", () => {
    expect(resolveRedirect("/de/collection", "", null)).toBeNull();
    expect(resolveRedirect("/tr", "", null)).toBeNull();
  });

  it("prefixes the negotiated locale and keeps the query string", () => {
    expect(resolveRedirect("/collection", "?brand=rolex", "tr-TR,tr;q=0.9")).toBe(
      "/tr/collection?brand=rolex",
    );
    expect(resolveRedirect("/", "", "en")).toBe("/en");
  });

  it("treats upper-case locale segments as not localized (stays same-site)", () => {
    expect(resolveRedirect("/DE/x", "", null)).toBe("/de/DE/x");
  });

  it.each([
    "//evil.example",
    "/%2F%2Fevil.example",
    "/\\evil.example",
    "///evil.example/x",
  ])("never produces a protocol-relative or external target for %j", (path) => {
    const target = resolveRedirect(path, "", null);
    expect(target).not.toBeNull();
    expect(target!.startsWith("/de/")).toBe(true);
    expect(target!.startsWith("//")).toBe(false);
  });

  it("always returns a same-site absolute path (property)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (raw, search) => {
        const path = `/${raw}`;
        const target = resolveRedirect(path, search.startsWith("?") ? search : "", null);
        if (target !== null) {
          expect(target.startsWith("/")).toBe(true);
          expect(target.startsWith("//")).toBe(false);
        }
      }),
    );
  });
});
