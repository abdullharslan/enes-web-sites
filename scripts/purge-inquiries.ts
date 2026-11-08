import { connect } from "@/db/connection";
import { applyRetention } from "@/lib/server/inquiries/retention";

/*
 * Applies every retention rule: inquiries (see lib/inquiries/policy.ts), expired
 * sessions and trusted devices, old login attempts. Safe to run any time, e.g.
 * from a daily cron job: 15 3 * * * npm run inquiries:purge
 */
const { db, close } = connect(process.env.DATABASE_URL, { max: 1 });
const root = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";
applyRetention(db, root)
  .then(({ purged, orphans, authRows }) =>
    console.log(
      `retention applied: ${purged} inquiries deleted, ${orphans} orphan folders removed, ${authRows} login records deleted`,
    ),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
