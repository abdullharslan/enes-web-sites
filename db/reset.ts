import { rm } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { connect } from "./connection";
import { isMain } from "./is-main";
import { runMigrations } from "./migrate";
import { seedCatalog } from "./seed";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Refuses to run against anything but a local, non-production database (fail-closed). */
export function assertLocalDatabase(
  url: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): string {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (nodeEnv === "production") throw new Error("db:reset is disabled in production");
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host))
    throw new Error(`db:reset only runs against a local database, not ${host}`);
  return url;
}

/** DESTRUCTIVE (local development only): drops all data and media, then migrates and seeds. */
async function reset(): Promise<void> {
  const url = assertLocalDatabase(process.env.DATABASE_URL);
  const mediaRoot = process.env.MEDIA_ROOT ?? "storage/media";
  const { db, close } = connect(url, { max: 1 });
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await close();
  }
  await rm(mediaRoot, { recursive: true, force: true });
  await runMigrations(url);
  const seeded = connect(url, { max: 1 });
  try {
    console.log("seeded", await seedCatalog(seeded.db, { mediaRoot }));
  } finally {
    await seeded.close();
  }
}

if (isMain(import.meta.url)) {
  reset().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
