import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { connect, type Executor } from "@/db/connection";
import { users } from "@/db/schema";
import { credentialVersion } from "@/lib/server/auth/service";

const connection = connect(process.env.DATABASE_URL_TEST, { max: 2 });
export const testDb = connection.db;
export const closeTestDb = connection.close;

class Rollback extends Error {}

/** Runs `fn` inside a transaction that is always rolled back, keeping tests isolated. */
export async function withRollback(fn: (tx: Executor) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** What a login that verified the user's current password would hand to createSession. */
export async function credentialOf(db: Executor, userId: string): Promise<string> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  return credentialVersion(user!.passwordHash);
}

export function tempMediaRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mv-media-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** A small real JPEG (with EXIF) generated on the fly — no binary fixtures in the repo. */
export function sampleJpeg(color = "#c9a96e", width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-gps-like-metadata" } })
    .toBuffer();
}
