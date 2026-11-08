import { inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { inquiries } from "@/db/schema";
import { purgeExpiredAuthData } from "@/lib/server/auth/service";
import { LOOKUP_CHUNK, recordErasures } from "./erasure";
import { removeInquiryFiles, staleFolderIds } from "./photos";
import { purgeExpiredInquiries } from "./service";

/**
 * Applies the retention rules (rows first, then their files) and removes old
 * photo folders that never got a row. Deletions go in the erasure ledger before
 * they commit, or do not happen: a restore must not bring these rows back.
 */
export async function applyInquiryRetention(
  db: Database,
  root: string,
  now = new Date(),
): Promise<{ purged: number; orphans: number }> {
  const purged = await db.transaction(async (tx) => {
    const ids = await purgeExpiredInquiries(tx, now);
    await recordErasures(root, ids, now);
    return ids;
  });
  await removeInquiryFiles(root, purged);

  const stale = await staleFolderIds(root, { now: now.getTime() });
  const existing = new Set<string>();
  for (let i = 0; i < stale.length; i += LOOKUP_CHUNK) {
    const rows = await db
      .select({ id: inquiries.id })
      .from(inquiries)
      .where(inArray(inquiries.id, stale.slice(i, i + LOOKUP_CHUNK)));
    for (const row of rows) existing.add(row.id);
  }
  const orphans = stale.filter((id) => !existing.has(id));
  await removeInquiryFiles(root, orphans);
  return { purged: purged.length, orphans: orphans.length };
}

/**
 * Everything with a deadline. Runs after submissions and when staff open the
 * inbox (both throttled, see maintainRetention), from the server's own timer
 * (lib/server/retention-timer.ts) and from `npm run inquiries:purge`, so the
 * promised deadlines hold even when nobody uses the site. Login data goes
 * first: it needs only the database, so a storage problem cannot hold it back.
 */
export async function applyRetention(
  db: Database,
  root: string,
  now = new Date(),
): Promise<{ purged: number; orphans: number; authRows: number }> {
  const authRows = await purgeExpiredAuthData(db, now);
  return { ...(await applyInquiryRetention(db, root, now)), authRows };
}

const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;
let lastMaintenance = 0;

/**
 * For request paths (submissions, inbox page): runs retention at most every
 * ten minutes per process and never throws — housekeeping must not break a
 * page or turn a stored inquiry into an error. Failures are logged.
 */
export async function maintainRetention(db: Database, root: string): Promise<void> {
  const now = Date.now();
  if (now - lastMaintenance < MAINTENANCE_INTERVAL_MS) return;
  lastMaintenance = now;
  try {
    await applyRetention(db, root, new Date(now));
  } catch (error) {
    // The name only: an error message can quote stored personal data.
    console.error("Retention failed", error instanceof Error ? error.name : "unknown");
  }
}
