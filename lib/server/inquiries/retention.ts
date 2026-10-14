import { inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { inquiries } from "@/db/schema";
import { photoFolderIds, removeInquiryFiles, sweepOrphanFolders } from "./photos";
import { purgeExpiredInquiries } from "./service";

/**
 * Applies the retention rules (rows first, then their files) and removes photo
 * folders that never got a row. Runs on every submission, whenever staff open
 * the inbox, and from `npm run inquiries:purge` (for a daily cron job), so the
 * promised deadlines hold even when nobody submits anything.
 */
export async function applyInquiryRetention(
  db: Database,
  root: string,
  now = new Date(),
): Promise<{ purged: number; orphans: number }> {
  const purged = await db.transaction((tx) => purgeExpiredInquiries(tx, now));
  await removeInquiryFiles(root, purged);
  const folders = await photoFolderIds(root);
  const existing = folders.length
    ? await db
        .select({ id: inquiries.id })
        .from(inquiries)
        .where(inArray(inquiries.id, folders))
    : [];
  const orphans = await sweepOrphanFolders(root, new Set(existing.map((r) => r.id)), {
    now: now.getTime(),
  });
  return { purged: purged.length, orphans: orphans.length };
}
