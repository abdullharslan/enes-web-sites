import "server-only";
import { headers } from "next/headers";
import { addressBucket, clientAddress, parseProxyHops } from "./auth/client-address";

const TRUSTED_PROXY_HOPS = parseProxyHops(process.env.TRUSTED_PROXY_HOPS);

/**
 * The rate-limit bucket of the current request's client (IPv4 address or IPv6
 * /64). See clientAddress for the trust model: a reverse proxy is required.
 */
export async function requestAddressBucket(): Promise<string> {
  return addressBucket(
    clientAddress((await headers()).get("x-forwarded-for"), TRUSTED_PROXY_HOPS),
  );
}
