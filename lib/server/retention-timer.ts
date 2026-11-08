import { db } from "@/db/client";
import { PRIVATE_ROOT } from "@/lib/server/inquiries/photos";
import { maintainRetention } from "@/lib/server/inquiries/retention";

const RETENTION_TIMER_MS = 60 * 60 * 1000;

/**
 * Keeps the retention deadlines without traffic or a cron job, at start and
 * then hourly. The app runs as a single long-lived Node.js server; a second
 * instance would only repeat deletes that are safe to repeat.
 */
export function startRetentionTimer(): void {
  const run = () => void maintainRetention(db, PRIVATE_ROOT);
  run();
  setInterval(run, RETENTION_TIMER_MS).unref();
}
