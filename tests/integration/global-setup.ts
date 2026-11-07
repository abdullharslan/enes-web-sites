import { sql } from "drizzle-orm";
import { connect } from "@/db/connection";
import { runMigrations } from "@/db/migrate";

/** Any fixed number; only these test runs use it. */
const RUN_LOCK = 724_001;

/**
 * Recreates the test database schema from the migrations (proves they apply to
 * an empty DB). The whole run holds a session-level advisory lock on its own
 * connection: a second run (another terminal, CI job or tool) waits here
 * instead of dropping the schema under tests that are still running.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url || !url.includes("_test")) {
    throw new Error("DATABASE_URL_TEST must point at a *_test database");
  }
  const guard = connect(url, { max: 1, keepAlive: true });
  const [free] = await guard.db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${RUN_LOCK}) AS locked`,
  );
  if (!free?.locked) {
    console.log(
      `Waiting for another integration test run to finish (lock ${RUN_LOCK}) …`,
    );
    await guard.db.execute(sql`SELECT pg_advisory_lock(${RUN_LOCK})`);
  }
  const release = async () => {
    try {
      await guard.db.execute(sql`SELECT pg_advisory_unlock(${RUN_LOCK})`);
    } finally {
      // Closing the session also drops the lock if the unlock itself failed.
      await guard.close();
    }
  };

  try {
    const { db, close } = connect(url, { max: 1 });
    try {
      await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
      await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await db.execute(sql`CREATE SCHEMA public`);
    } finally {
      await close();
    }
    await runMigrations(url);
  } catch (error) {
    // Never keep the lock (and the process alive) when setup itself fails;
    // the setup error stays the one reported.
    await release().catch(() => {});
    throw error;
  }
  return release;
}
