import { isIP } from "node:net";

/**
 * The client address from `X-Forwarded-For`. Only the rightmost entries are
 * trustworthy: Next.js (or the nearest proxy) appends the real peer address,
 * anything to the left may have been sent by the client. `trustedProxyHops`
 * is the number of *additional* trusted proxies between the client and that hop.
 */
export function clientAddress(
  forwardedFor: string | null,
  trustedProxyHops: number,
): string {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const candidate = hops[hops.length - 1 - trustedProxyHops];
  return candidate && isIP(candidate) ? candidate : "unknown";
}
