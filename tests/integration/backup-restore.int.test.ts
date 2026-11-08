import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inquiries, users } from "@/db/schema";
import { ERASURE_LEDGER_FILE, eraseInquiry } from "@/lib/server/inquiries/erasure";
import { closeTestDb, testDb } from "./helpers";

afterAll(closeTestDb);

const YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * The real scripts against the local test database, with every file in a
 * temporary folder. They drive the local docker-compose database, so this
 * needs .env.local (CI has a bare Postgres service and skips it).
 */
describe.skipIf(!existsSync(".env.local"))("backup, erase, restore round trip", () => {
  let base: string;
  let privateRoot: string;
  let backupDir: string;
  let ledger: string;

  const run = (script: string, ...args: string[]) =>
    spawnSync("node_modules/.bin/tsx", [`scripts/${script}.ts`, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL_TEST,
        MEDIA_ROOT: join(base, "media"),
        PRIVATE_STORAGE_ROOT: privateRoot,
        BACKUP_DIR: backupDir,
      },
    });

  const backup = () => {
    const result = run("backup");
    expect(result.status, result.stderr).toBe(0);
    const dump = readdirSync(backupDir).find((name) => name.endsWith(".dump"));
    return join(backupDir, dump!);
  };

  const folder = (id: string) => join(privateRoot, "inquiries", id);

  async function stored(createdAt = new Date()): Promise<string> {
    const id = randomUUID();
    await testDb.insert(inquiries).values({
      id,
      kind: "sell",
      locale: "de",
      createdAt,
      data: { name: "Anna Erased", email: "anna@example.com" },
    });
    mkdirSync(folder(id), { recursive: true, mode: 0o700 });
    writeFileSync(join(folder(id), "0_aaaa.webp"), "photo");
    return id;
  }
  const isStored = async (id: string) =>
    (await testDb.select().from(inquiries).where(eq(inquiries.id, id))).length === 1;

  let actorId: string;
  beforeAll(async () => {
    const [user] = await testDb
      .insert(users)
      .values({
        email: `restore-${randomUUID()}@example.com`,
        name: "Owner",
        role: "owner",
        passwordHash: "not-a-hash",
      })
      .returning({ id: users.id });
    actorId = user!.id;
  });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "mv-restore-"));
    privateRoot = join(base, "private");
    backupDir = join(base, "backups");
    ledger = join(privateRoot, ERASURE_LEDGER_FILE);
    mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  });
  afterEach(async () => {
    rmSync(base, { recursive: true, force: true });
    await testDb.delete(inquiries);
  });
  afterAll(async () => {
    await testDb.delete(users).where(eq(users.id, actorId));
  });

  it("never brings back what was erased or has expired, and keeps the rest", async () => {
    const [erasedEarlier, kept, erased] = [
      await stored(),
      await stored(),
      await stored(),
    ];
    await eraseInquiry(testDb, privateRoot, actorId, erasedEarlier!);
    const expired = await stored(new Date(Date.now() - 2 * YEAR));

    const dump = backup();
    await eraseInquiry(testDb, privateRoot, actorId, erased!);
    const ledgerAfterErasure = readFileSync(ledger, "utf8");

    const result = run("restore", dump);

    expect(result.status, result.stderr).toBe(0);
    expect(await isStored(erased!)).toBe(false);
    expect(existsSync(folder(erased!))).toBe(false);
    expect(await isStored(expired)).toBe(false);
    expect(existsSync(folder(expired))).toBe(false);
    expect(await isStored(kept!)).toBe(true);
    expect(existsSync(folder(kept!))).toBe(true);
    // The archive holds an older ledger; unpacking it must not roll this one back.
    expect(readFileSync(ledger, "utf8")).toBe(ledgerAfterErasure);
    // Counts only.
    expect(result.stdout).toMatch(/2 ledger entries, 1 inquiries erased again/);
    expect(result.stdout).toMatch(/1 expired inquiries deleted/);
    for (const id of [erasedEarlier, kept, erased, expired]) {
      expect(result.stdout).not.toContain(id);
    }
    expect(result.stdout).not.toContain("Anna");
  }, 120_000);

  it("stops before touching the database when the ledger is malformed", async () => {
    await stored();
    const dump = backup();
    const addedAfterBackup = await stored();
    appendFileSync(ledger, "garbage\n");

    const result = run("restore", dump);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("malformed at line 1");
    expect(await isStored(addedAfterBackup)).toBe(true);
  }, 120_000);
});
