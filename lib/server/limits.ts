/*
 * In-memory guards for anonymous traffic, applied before any expensive work.
 * They are per process: the app is deployed as ONE instance (README). Several
 * instances would multiply these limits (and use different address-hash keys);
 * the database limits remain the source of truth.
 */

/** Caps simultaneous operations per key and overall; callers that do not get a slot answer "busy". */
export function createInflightLimiter({
  perKey,
  total,
}: {
  perKey: number;
  total: number;
}) {
  const active = new Map<string, number>();
  let all = 0;
  return {
    /** A release function, or null when the key or the whole process is at its limit. */
    tryAcquire(key: string): (() => void) | null {
      const current = active.get(key) ?? 0;
      if (current >= perKey || all >= total) return null;
      active.set(key, current + 1);
      all += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        all -= 1;
        const left = (active.get(key) ?? 1) - 1;
        if (left > 0) active.set(key, left);
        else active.delete(key);
      };
    },
  };
}

/** Fixed-window counter per key; the whole map is dropped when the window rolls over. */
export function createRateWindow({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}) {
  let windowStart = 0;
  let counts = new Map<string, number>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const start = now - (now % windowMs);
      if (start !== windowStart) {
        windowStart = start;
        counts = new Map();
      }
      const used = counts.get(key) ?? 0;
      if (used >= limit) return false;
      counts.set(key, used + 1);
      return true;
    },
    size: () => counts.size,
  };
}

/**
 * Optional numeric override from the environment (e.g. for automated tests that
 * all come from one address). Fails fast on typos rather than silently
 * disabling a limit.
 */
export function parseLimitEnv(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d{0,4}$/.test(value)) {
    throw new Error(`${name} must be 1–99999, got "${value}"`);
  }
  return Number(value);
}
