import { z } from "zod";
import { db } from "@/db/client";
import { isCountable, parseViewPath } from "@/lib/analytics/track";
import { recordView } from "@/lib/server/analytics/service";
import { getCatalog } from "@/lib/server/catalog";
import { createRateWindow, parseLimitEnv } from "@/lib/server/limits";
import { readLimitedText } from "@/lib/server/read-limited";
import { requestAddressBucket } from "@/lib/server/request-address";

const MAX_BODY = 512;
const perAddress = createRateWindow({
  limit: parseLimitEnv(
    "ANALYTICS_LIMIT_PER_ADDRESS",
    process.env.ANALYTICS_LIMIT_PER_ADDRESS,
    60,
  ),
  windowMs: 60_000,
});
const body = z.object({ path: z.string().max(300) });
/** Always the same empty answer: callers learn nothing about what was counted. */
const done = () => new Response(null, { status: 204 });

/** Receives the page-view beacon (see components/layout/page-view-beacon.tsx). */
export async function POST(request: Request): Promise<Response> {
  const headers = request.headers;
  const countable = isCountable({
    userAgent: headers.get("user-agent"),
    doNotTrack: headers.get("dnt"),
    globalPrivacyControl: headers.get("sec-gpc"),
    fetchSite: headers.get("sec-fetch-site"),
  });
  if (!countable) return done();

  // Spam cannot grow the counters faster than a person browses (per address, per minute).
  if (!perAddress.allow(await requestAddressBucket())) return done();
  const text = await readLimitedText(request, MAX_BODY);
  if (text === null) return done();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return done();
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return done();

  try {
    const catalog = await getCatalog();
    const target = parseViewPath(parsed.data.path, {
      products: new Set(catalog.products.map((p) => p.slug)),
      brands: new Set(catalog.brands.map((b) => b.slug)),
    });
    if (target) await recordView(db, target);
  } catch (error) {
    // A lost count must never reach the visitor's page; the name alone is safe to log.
    console.error(
      "Page view not recorded",
      error instanceof Error ? error.name : "unknown",
    );
  }
  return done();
}
