import "server-only";
import { headers } from "next/headers";
import { clientAddress, parseProxyHops } from "./auth/client-address";

const TRUSTED_PROXY_HOPS = parseProxyHops(process.env.TRUSTED_PROXY_HOPS);

/** The current request's client address (see clientAddress for the trust model). */
export async function requestAddress(): Promise<string> {
  return clientAddress((await headers()).get("x-forwarded-for"), TRUSTED_PROXY_HOPS);
}
