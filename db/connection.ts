import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A database handle or an open transaction — services accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface Connection {
  db: Database;
  close: () => Promise<void>;
}

/** Opens a pooled connection. Used by the app (via db/client.ts), scripts and tests. */
export function connect(
  url: string | undefined,
  options: { max?: number; keepAlive?: boolean } = {},
): Connection {
  if (!url) throw new Error("Database URL is not set (see .env.example)");
  const client = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    // A connection that holds a session lock must not be recycled under it.
    ...(options.keepAlive ? { max_lifetime: null, idle_timeout: 0 } : {}),
  });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
