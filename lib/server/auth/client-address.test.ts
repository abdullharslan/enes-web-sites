import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

describe("clientAddress", () => {
  it("uses the rightmost hop (added by the server or the nearest trusted proxy)", () => {
    expect(clientAddress("203.0.113.9", 0)).toBe("203.0.113.9");
    expect(clientAddress("6.6.6.6, 203.0.113.9", 0)).toBe("203.0.113.9");
  });

  it("skips additional trusted proxy hops", () => {
    expect(clientAddress("6.6.6.6, 203.0.113.9, 10.0.0.2", 1)).toBe("203.0.113.9");
  });

  it("never lets a client pick its bucket by prepending addresses", () => {
    expect(clientAddress("1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.9", 0)).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to 'unknown' for missing, malformed or too-short chains", () => {
    expect(clientAddress(null, 0)).toBe("unknown");
    expect(clientAddress("", 0)).toBe("unknown");
    expect(clientAddress("203.0.113.9", 3)).toBe("unknown");
    expect(clientAddress("not an ip; DROP TABLE", 0)).toBe("unknown");
  });
});
