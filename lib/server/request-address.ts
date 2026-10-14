import "server-only";
import { headers } from "next/headers";
import { addressBucket, clientAddress, requireProxyHops } from "./auth/client-address";

let proxyHops: number | undefined;
/** Checked on first use (not at import), so builds and tooling are unaffected. */
const trustedProxyHops = () =>
  (proxyHops ??= requireProxyHops(
    process.env.TRUSTED_PROXY_HOPS,
    process.env.NODE_ENV === "production",
  ));

/**
 * The rate-limit bucket of the current request's client (IPv4 address or IPv6
 * /64). See clientAddress for the trust model: a reverse proxy is required.
 */
export async function requestAddressBucket(): Promise<string> {
  return addressBucket(
    clientAddress((await headers()).get("x-forwarded-for"), trustedProxyHops()),
  );
}
