import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildMediaKey, parseMediaKey, MEDIA_KINDS } from "./naming";

const at = new Date("2026-10-14T15:30:05Z");
const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("buildMediaKey", () => {
  it("encodes kind, entity, UTC timestamp, version and short hash", () => {
    expect(
      buildMediaKey({
        kind: "home",
        entitySlug: "hero",
        version: 3,
        sha256: sha,
        createdAt: at,
      }),
    ).toBe("home/hero/20261014-153005_v3_a1b2c3d4.webp");
  });

  it.each([
    ["kind", { kind: "../etc" }],
    ["entity slug with traversal", { entitySlug: ".." }],
    ["entity slug with slash", { entitySlug: "a/b" }],
    ["upper case slug", { entitySlug: "Rolex" }],
    ["version 0", { version: 0 }],
    ["fractional version", { version: 1.5 }],
    ["short hash", { sha256: "abc" }],
    ["non-hex hash", { sha256: "z".repeat(64) }],
  ])("rejects invalid %s", (_, patch) => {
    expect(() =>
      buildMediaKey({
        kind: "brand",
        entitySlug: "rolex",
        version: 1,
        sha256: sha,
        createdAt: at,
        ...patch,
      } as never),
    ).toThrow(TypeError);
  });
});

describe("parseMediaKey", () => {
  it("round-trips a built key", () => {
    const key = buildMediaKey({
      kind: "product",
      entitySlug: "rolex-explorer-224270",
      version: 12,
      sha256: sha,
      createdAt: at,
    });
    expect(parseMediaKey(key)).toEqual({
      kind: "product",
      entitySlug: "rolex-explorer-224270",
      version: 12,
      shortHash: "a1b2c3d4",
    });
  });

  it.each([
    "../../etc/passwd",
    "home/hero/../../secret.webp",
    "home/hero/20261014-153005_v3_a1b2c3d4.webp/extra",
    "/home/hero/20261014-153005_v3_a1b2c3d4.webp",
    "home\\hero\\20261014-153005_v3_a1b2c3d4.webp",
    "unknown/hero/20261014-153005_v3_a1b2c3d4.webp",
    "home/hero/20261014-153005_v3_a1b2c3d4.svg",
    "home/hero/x.webp",
    "",
  ])("rejects %j", (key) => {
    expect(parseMediaKey(key)).toBeNull();
  });

  it("only ever accepts keys made of safe segments (property)", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        const parsed = parseMediaKey(key);
        if (parsed !== null) {
          expect(key.includes("..")).toBe(false);
          expect(key.startsWith("/")).toBe(false);
          expect(MEDIA_KINDS).toContain(parsed.kind);
        }
      }),
    );
  });
});
