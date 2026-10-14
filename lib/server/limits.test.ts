import { describe, expect, it } from "vitest";
import { createInflightLimiter, createRateWindow, parseLimitEnv } from "./limits";

describe("createInflightLimiter", () => {
  it("limits concurrent work per key and in total", () => {
    const limiter = createInflightLimiter({ perKey: 1, total: 2 });
    const a = limiter.tryAcquire("a");
    expect(a).not.toBeNull();
    expect(limiter.tryAcquire("a")).toBeNull();
    const b = limiter.tryAcquire("b");
    expect(b).not.toBeNull();
    expect(limiter.tryAcquire("c")).toBeNull();
    a!();
    expect(limiter.tryAcquire("c")).not.toBeNull();
    expect(limiter.tryAcquire("a")).toBeNull();
  });

  it("releasing twice frees only one slot", () => {
    const limiter = createInflightLimiter({ perKey: 2, total: 2 });
    const first = limiter.tryAcquire("a")!;
    limiter.tryAcquire("a");
    first();
    first();
    expect(limiter.tryAcquire("a")).not.toBeNull();
    expect(limiter.tryAcquire("a")).toBeNull();
  });
});

describe("createRateWindow", () => {
  it("allows up to the limit per key and window, then resets", () => {
    const window = createRateWindow({ limit: 2, windowMs: 1000 });
    expect(window.allow("a", 0)).toBe(true);
    expect(window.allow("a", 10)).toBe(true);
    expect(window.allow("a", 20)).toBe(false);
    expect(window.allow("b", 20)).toBe(true);
    expect(window.allow("a", 1000)).toBe(true);
  });

  it("keeps memory bounded: old windows are forgotten", () => {
    const window = createRateWindow({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 10_000; i++) window.allow(`key-${i}`, 0);
    window.allow("x", 5000);
    expect(window.size()).toBe(1);
  });
});

describe("parseLimitEnv", () => {
  it("defaults to the fallback and accepts positive whole numbers", () => {
    expect(parseLimitEnv("X", undefined, 5)).toBe(5);
    expect(parseLimitEnv("X", "", 5)).toBe(5);
    expect(parseLimitEnv("X", "1000", 5)).toBe(1000);
  });

  it("fails fast on values that would weaken or break the limit", () => {
    for (const bad of ["0", "-1", "1e3", " 5", "five", "100000"]) {
      expect(() => parseLimitEnv("INQUIRY_LIMIT_PER_ADDRESS", bad, 5)).toThrow(
        /INQUIRY_LIMIT_PER_ADDRESS/,
      );
    }
  });
});
