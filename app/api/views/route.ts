import { z } from "zod";
import { db } from "@/db/client";
import { isCountable, parseViewPath } from "@/lib/analytics/track";
import { recordView } from "@/lib/server/analytics/service";
import { getCatalog } from "@/lib/server/catalog";

const MAX_BODY = 512;
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

  const text = await request.text();
  if (text.length > MAX_BODY) return done();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return done();
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return done();

  const catalog = await getCatalog();
  const target = parseViewPath(parsed.data.path, {
    products: new Set(catalog.products.map((p) => p.slug)),
    brands: new Set(catalog.brands.map((b) => b.slug)),
  });
  if (target) await recordView(db, target);
  return done();
}
