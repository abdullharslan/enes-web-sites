import { describe, expect, it } from "vitest";
import {
  addressBucket,
  clientAddress,
  parseProxyHops,
  requireProxyHops,
} from "./client-address";

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

describe("parseProxyHops", () => {
  it("defaults to 0 and accepts a single digit", () => {
    expect(parseProxyHops(undefined)).toBe(0);
    expect(parseProxyHops("")).toBe(0);
    expect(parseProxyHops("2")).toBe(2);
  });

  it("fails fast on anything else (a typo would merge all clients into one bucket)", () => {
    for (const bad of ["-1", "10", "1.5", " 1", "one"]) {
      expect(() => parseProxyHops(bad)).toThrow(/TRUSTED_PROXY_HOPS/);
    }
  });
});

describe("addressBucket", () => {
  it("keeps IPv4 addresses and unwraps IPv4-mapped IPv6", () => {
    expect(addressBucket("203.0.113.9")).toBe("203.0.113.9");
    expect(addressBucket("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(addressBucket("::FFFF:203.0.113.9")).toBe("203.0.113.9");
  });

  it("groups IPv6 by /64, the block one subscriber usually controls", () => {
    expect(addressBucket("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
    expect(addressBucket("2001:db8:aa:bb::ffff")).toBe("2001:db8:aa:bb::/64");
    expect(addressBucket("2001:DB8:AA:BB:0:0:0:1")).toBe("2001:db8:aa:bb::/64");
    expect(addressBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressBucket("::1")).toBe("0:0:0:0::/64");
  });

  it("passes the unknown marker through", () => {
    expect(addressBucket("unknown")).toBe("unknown");
  });
});

describe("requireProxyHops", () => {
  it("fails loudly in production when the proxy setup is not stated", () => {
    expect(() => requireProxyHops(undefined, true)).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => requireProxyHops("", true)).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(requireProxyHops("0", true)).toBe(0);
  });

  it("defaults to 0 outside production", () => {
    expect(requireProxyHops(undefined, false)).toBe(0);
  });
});
