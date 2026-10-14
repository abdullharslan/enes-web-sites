import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sql } from "drizzle-orm";
import { connect } from "@/db/connection";
import { runMigrations } from "@/db/migrate";
import { assertLocalDatabase } from "@/db/reset";
import { seedCatalog } from "@/db/seed";
import { seedContent } from "@/db/seed-content";
import { createUser } from "@/lib/server/auth/service";

export const E2E_MEDIA_ROOT = "storage/e2e-media";
const E2E_PRIVATE_ROOT = "storage/e2e-private";
export const CREDENTIALS_FILE = "e2e/.auth/credentials.json";

/**
 * Builds a fresh, isolated database for the E2E run: schema from migrations,
 * demo catalog, and two throw-away accounts with random passwords.
 */
async function prepare(): Promise<void> {
  const url = assertLocalDatabase(process.env.DATABASE_URL_E2E);
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith("_e2e"))
    throw new Error("DATABASE_URL_E2E must point at a *_e2e database");

  // Maintenance connection to the main dev database, used only to create the E2E database.
  const admin = connect(process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL, {
    max: 1,
  });
  try {
    const exists = await admin.db.execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${database}`,
    );
    // Identifiers cannot be bound parameters: allow-list the name, then quote it.
    if (!/^[a-z0-9_]+$/.test(database))
      throw new Error(`Unsafe database name: ${database}`);
    if (exists.length === 0) {
      await admin.db.execute(
        sql.raw(`CREATE DATABASE "${database.replaceAll('"', '""')}"`),
      );
    }
  } finally {
    await admin.close();
  }

  const e2e = connect(url, { max: 1 });
  try {
    await e2e.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await e2e.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await e2e.db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await e2e.close();
  }
  await runMigrations(url);

  rmSync(E2E_MEDIA_ROOT, { recursive: true, force: true });
  rmSync(E2E_PRIVATE_ROOT, { recursive: true, force: true });
  const { db, close } = connect(url, { max: 1 });
  try {
    await seedCatalog(db, { mediaRoot: E2E_MEDIA_ROOT });
    await seedContent(db, { mediaRoot: E2E_MEDIA_ROOT });
    const accounts = {
      owner: {
        email: "owner@e2e.example",
        password: randomBytes(18).toString("base64url"),
      },
      editor: {
        email: "editor@e2e.example",
        password: randomBytes(18).toString("base64url"),
      },
    };
    await createUser(db, { ...accounts.owner, name: "E2E Owner", role: "owner" });
    await createUser(db, { ...accounts.editor, name: "E2E Editor", role: "editor" });
    mkdirSync(dirname(CREDENTIALS_FILE), { recursive: true });
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  } finally {
    await close();
  }
}

prepare().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
