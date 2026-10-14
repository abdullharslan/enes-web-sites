import { LEGAL_PAGES } from "@/lib/legal";
import { isLocale, type Locale } from "@/lib/i18n/locales";

/*
 * Cookieless, aggregate page-view counting. Nothing identifies a visitor: no
 * cookies, no IP address, no user agent is stored — only "page X was viewed on
 * day D". Visitors who send Do Not Track or Global Privacy Control are skipped.
 */

const STATIC_PAGES = new Set([
  "/",
  "/collection",
  "/brands",
  "/sell",
  "/about",
  "/journal",
  "/contact",
  "/search",
]);
const MAX_PATH = 200;

export interface KnownSlugs {
  products: ReadonlySet<string>;
  brands: ReadonlySet<string>;
}

export interface ViewTarget {
  locale: Locale;
  /** Path without the locale, e.g. "/collection/rolex-explorer-224270". */
  page: string;
}

/**
 * Only real pages of this site are counted (unknown slugs are dropped), so a
 * flood of made-up paths cannot grow the table.
 */
export function parseViewPath(path: string, known: KnownSlugs): ViewTarget | null {
  if (path.length > MAX_PATH) return null;
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(path);
  if (!match?.[1] || !isLocale(match[1])) return null;
  const locale = match[1];
  const page = match[2] ?? "/";
  if (STATIC_PAGES.has(page)) return { locale, page };

  const [, section, slug, ...rest] = page.split("/");
  if (!slug || rest.length) return null;
  const allowed =
    (section === "collection" && known.products.has(slug)) ||
    (section === "brands" && known.brands.has(slug)) ||
    (section === "legal" && (LEGAL_PAGES as readonly string[]).includes(slug));
  return allowed ? { locale, page } : null;
}

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python|httpclient|monitor/i;

export interface RequestSignals {
  userAgent: string | null;
  doNotTrack: string | null;
  globalPrivacyControl: string | null;
  /** `Sec-Fetch-Site`: browsers send "same-origin" for the site's own beacon. */
  fetchSite: string | null;
}

export function isCountable(signals: RequestSignals): boolean {
  if (signals.doNotTrack === "1" || signals.globalPrivacyControl === "1") return false;
  if (!signals.userAgent || BOT.test(signals.userAgent)) return false;
  return signals.fetchSite === "same-origin";
}

// ── Dashboard helpers ────────────────────────────────────────────────────────

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseRange(value: string | string[] | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.find((range) => String(range) === value) ?? 30;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** UTC calendar day, the unit the counters are stored in. */
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** One entry per day of the range (oldest first), zero where nothing was counted. */
export function dailySeries(
  rows: ReadonlyArray<{ day: string; count: number }>,
  days: number,
  today: Date,
): Array<{ day: string; count: number }> {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: days }, (_, i) => {
    const day = isoDay(new Date(today.getTime() - (days - 1 - i) * DAY_MS));
    return { day, count: counts.get(day) ?? 0 };
  });
}

/**
 * Interest per brand: views of the brand page plus views of its products
 * (`productBrand` maps product slug → brand slug), highest first.
 */
export function brandInterest(
  pages: ReadonlyArray<{ page: string; count: number }>,
  productBrand: ReadonlyMap<string, string>,
): Array<{ brand: string; count: number }> {
  const totals = new Map<string, number>();
  for (const { page, count } of pages) {
    const [, section, slug] = page.split("/");
    const brand =
      section === "brands"
        ? slug
        : section === "collection"
          ? productBrand.get(slug ?? "")
          : undefined;
    if (brand) totals.set(brand, (totals.get(brand) ?? 0) + count);
  }
  return [...totals]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}
