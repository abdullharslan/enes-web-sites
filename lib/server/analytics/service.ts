import { and, asc, desc, gte, like, lt, sql, sum } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { inquiries, pageViewsDaily } from "@/db/schema";
import { isoDay, type ViewTarget } from "@/lib/analytics/track";

/** Aggregates are not personal data; they are kept a little over a year for comparisons. */
export const ANALYTICS_RETENTION_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds one view to today's counter (one row per day, locale and page). */
export async function recordView(
  db: Executor,
  target: ViewTarget,
  now = new Date(),
): Promise<void> {
  await db
    .insert(pageViewsDaily)
    .values({ day: isoDay(now), locale: target.locale, page: target.page, views: 1 })
    .onConflictDoUpdate({
      target: [pageViewsDaily.day, pageViewsDaily.locale, pageViewsDaily.page],
      set: { views: sql`${pageViewsDaily.views} + 1` },
    });
  // Old counters only need removing once a day, not on every view.
  const today = isoDay(now);
  if (lastPurgeDay === today) return;
  lastPurgeDay = today;
  const cutoff = isoDay(new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * DAY_MS));
  await db.delete(pageViewsDaily).where(lt(pageViewsDaily.day, cutoff));
}

let lastPurgeDay: string | null = null;

const viewCount = sql<number>`cast(${sum(pageViewsDaily.views)} as integer)`;

export function viewsPerDay(db: Executor, from: Date) {
  return db
    .select({ day: pageViewsDaily.day, count: viewCount })
    .from(pageViewsDaily)
    .where(gte(pageViewsDaily.day, isoDay(from)))
    .groupBy(pageViewsDaily.day)
    .orderBy(asc(pageViewsDaily.day));
}

export async function totalViews(db: Executor, from: Date): Promise<number> {
  const [row] = await db
    .select({ count: viewCount })
    .from(pageViewsDaily)
    .where(gte(pageViewsDaily.day, isoDay(from)));
  return row?.count ?? 0;
}

/** Most viewed pages since `from`, all locales together; `prefix` limits to a section. */
export function topPages(db: Executor, from: Date, limit: number, prefix?: string) {
  return db
    .select({ page: pageViewsDaily.page, count: viewCount })
    .from(pageViewsDaily)
    .where(
      and(
        gte(pageViewsDaily.day, isoDay(from)),
        prefix ? like(pageViewsDaily.page, `${prefix}%`) : undefined,
      ),
    )
    .groupBy(pageViewsDaily.page)
    .orderBy(desc(viewCount), asc(pageViewsDaily.page))
    .limit(limit);
}

const inquiryDay = sql<string>`to_char(${inquiries.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

export function inquiriesPerDay(db: Executor, from: Date) {
  return db
    .select({
      day: inquiryDay,
      kind: inquiries.kind,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(inquiries)
    .where(gte(inquiries.createdAt, new Date(`${isoDay(from)}T00:00:00Z`)))
    .groupBy(inquiryDay, inquiries.kind)
    .orderBy(asc(inquiryDay), asc(inquiries.kind));
}
