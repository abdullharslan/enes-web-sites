import { connect } from "@/db/connection";
import { applyInquiryRetention } from "@/lib/server/inquiries/retention";

/*
 * Applies the inquiry retention rules (see lib/inquiries/policy.ts). Safe to run
 * any time; schedule it daily, e.g. cron: 15 3 * * * npm run inquiries:purge
 */
const { db, close } = connect(process.env.DATABASE_URL, { max: 1 });
try {
  const root = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";
  const { purged, orphans } = await applyInquiryRetention(db, root);
  console.log(
    `retention applied: ${purged} inquiries deleted, ${orphans} orphan folders removed`,
  );
} finally {
  await close();
}
