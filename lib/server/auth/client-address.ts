import { isIP } from "node:net";

/**
 * The client address from `X-Forwarded-For`. Only the rightmost entries are
 * trustworthy, and only because a reverse proxy in front of the app appends
 * (or overwrites with) the real peer address. Next.js itself does NOT append:
 * it only fills the header with the socket address when the request carries
 * none, so an app exposed directly lets clients choose this value. Deploying
 * behind such a proxy is therefore required (README → "Yayına alırken").
 * `trustedProxyHops` is the number of *additional* trusted proxies between the
 * client and the outermost one.
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

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Expands "::" and returns the eight 16-bit groups of an IPv6 address (lower-case). */
function ipv6Groups(address: string): string[] {
  const [head = "", tail] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array<string>(Math.max(0, missing)).fill("0"), ...right].map(
    (group) => group.replace(/^0+(?=.)/, ""),
  );
}

/**
 * The unit rate limits count per. One IPv6 subscriber usually controls a whole
 * /64 (2^64 addresses), so IPv6 is grouped by /64; IPv4-mapped addresses
 * count as their IPv4 address.
 */
export function addressBucket(address: string): string {
  if (address === "unknown" || isIP(address) === 4) return address;
  const mapped = IPV4_MAPPED.exec(address);
  if (mapped?.[1]) return mapped[1];
  if (isIP(address) !== 6) return "unknown";
  return `${ipv6Groups(address).slice(0, 4).join(":")}::/64`;
}

/** Proxies in front of the app that append to X-Forwarded-For (0 = clients connect to Next directly). */
export function parseProxyHops(value: string | undefined): number {
  if (value === undefined || value === "") return 0;
  // Fail fast: a typo here would silently put every client into one shared throttle bucket.
  if (!/^\d$/.test(value))
    throw new Error(`TRUSTED_PROXY_HOPS must be a single digit, got "${value}"`);
  return Number(value);
}
