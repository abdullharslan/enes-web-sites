import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./connection";
import { isMain } from "./is-main";

/** Applies pending migrations from db/migrations (idempotent). */
export async function runMigrations(url: string | undefined): Promise<void> {
  const { db, close } = connect(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "db/migrations" });
  } finally {
    await close();
  }
}

if (isMain(import.meta.url)) {
  runMigrations(process.env.DATABASE_URL)
    .then(() => console.log("migrations applied"))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
