import { and, eq } from "drizzle-orm";
import { connect } from "@/db/connection";
import { pageViewsDaily } from "@/db/schema";
import { isoDay } from "@/lib/analytics/track";

/*
 * Read-only access to the isolated E2E database, for asserting server-side
 * effects. Connected lazily: a worker may run several files (and repeats)
 * after an earlier one closed the connection.
 */
let connection: ReturnType<typeof connect> | null = null;
const db = () => (connection ??= connect(process.env.DATABASE_URL_E2E, { max: 1 })).db;

export async function viewsToday(locale: string, page: string): Promise<number> {
  const [row] = await db()
    .select({ views: pageViewsDaily.views })
    .from(pageViewsDaily)
    .where(
      and(
        eq(pageViewsDaily.day, isoDay(new Date())),
        eq(pageViewsDaily.locale, locale),
        eq(pageViewsDaily.page, page),
      ),
    );
  return row?.views ?? 0;
}

export async function closeE2eDb(): Promise<void> {
  const current = connection;
  connection = null;
  await current?.close();
}
