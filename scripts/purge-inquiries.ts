import { connect } from "@/db/connection";
import { applyRetention } from "@/lib/server/inquiries/retention";
import { backupDirectory, rotateBackups } from "./backup-rotation";

/*
 * Applies every retention rule: inquiries (see lib/inquiries/policy.ts), expired
 * sessions and trusted devices, old login attempts. Then deletes backup sets
 * past their period, which the web server's own timer deliberately does not.
 * Safe to run any time, e.g. from a daily cron job: 15 3 * * * npm run inquiries:purge
 */

// The name only: an error message can quote stored personal data.
const report = (label: string, error: unknown) => {
  console.error(label, error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const { db, close } = connect(url, { max: 1 });
  const root = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";
  try {
    const { purged, orphans, authRows } = await applyRetention(db, root);
    console.log(
      `retention applied: ${purged} inquiries deleted, ${orphans} orphan folders removed, ${authRows} login records deleted`,
    );
  } catch (error) {
    report("Retention failed", error);
  } finally {
    await close();
  }
  // One failure must not hold the other deadline back.
  try {
    const database = new URL(url!).pathname.slice(1);
    const { sets, files } = await rotateBackups(backupDirectory(), database);
    console.log(`backups rotated: ${sets} old sets deleted (${files} files)`);
  } catch (error) {
    report("Backup rotation failed", error);
  }
}

void main();
