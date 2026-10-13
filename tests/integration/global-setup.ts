import { sql } from "drizzle-orm";
import { connect } from "@/db/connection";
import { runMigrations } from "@/db/migrate";

/** Recreates the test database schema from the migrations (proves they apply to an empty DB). */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url || !url.includes("_test")) {
    throw new Error("DATABASE_URL_TEST must point at a *_test database");
  }
  const { db, close } = connect(url, { max: 1 });
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await close();
  }
  await runMigrations(url);
}
