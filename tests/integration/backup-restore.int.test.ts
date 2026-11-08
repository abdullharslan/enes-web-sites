import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { inquiries, users } from "@/db/schema";
import { ERASURE_LEDGER_FILE, eraseInquiry } from "@/lib/server/inquiries/erasure";
import { applyInquiryRetention } from "@/lib/server/inquiries/retention";
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
    expect(readFileSync(ledger, "utf8").startsWith(ledgerAfterErasure)).toBe(true);
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

  const stampOf = (dump: string) => dump.match(/_(\d{8}-\d{6})\.dump$/)![1]!;
  const mediaRoot = () => join(base, "media");
  const database = () => new URL(process.env.DATABASE_URL_TEST!).pathname.slice(1);
  const entry = (id: string) =>
    `${JSON.stringify({ id, erasedAt: "2026-11-08T10:00:00.000Z" })}\n`;
  const withMedia = () => {
    mkdirSync(mediaRoot(), { recursive: true });
    writeFileSync(join(mediaRoot(), "photo.webp"), "media");
  };

  it("writes a complete owner-only set even when a storage folder does not exist yet", () => {
    const dump = backup();
    const stamp = stampOf(dump);

    const files = readdirSync(backupDir).sort();

    expect(files).toEqual(
      [
        `${database()}_${stamp}.dump`,
        `media_${stamp}.tar.gz`,
        `private_${stamp}.tar.gz`,
      ].sort(),
    );
    for (const file of files) {
      expect(statSync(join(backupDir, file)).mode & 0o777).toBe(0o600);
    }
  }, 120_000);

  it("leaves nothing with a finished backup's name when the backup fails", () => {
    withMedia();
    const unreadable = join(mediaRoot(), "unreadable");
    mkdirSync(unreadable);
    chmodSync(unreadable, 0o000);
    try {
      const result = run("backup");

      expect(result.status).not.toBe(0);
      expect(readdirSync(backupDir)).toEqual([]);
    } finally {
      chmodSync(unreadable, 0o700);
    }
  }, 120_000);

  it("rotates old sets after a successful backup, in BACKUP_DIR only", () => {
    mkdirSync(backupDir, { recursive: true });
    const old = "20200101-000000";
    const oldSet = [
      `${database()}_${old}.dump`,
      `media_${old}.tar.gz`,
      `private_${old}.tar.gz`,
    ];
    for (const name of [...oldSet, "notes.txt"]) {
      writeFileSync(join(backupDir, name), "x");
    }

    const result = run("backup");

    expect(result.status, result.stderr).toBe(0);
    const files = readdirSync(backupDir);
    for (const name of oldSet) expect(files).not.toContain(name);
    expect(files).toContain("notes.txt");
    expect(files).toHaveLength(4);
  }, 120_000);

  it("does not bring back what retention deleted after the backup was taken", async () => {
    const id = await stored();
    const dump = backup();
    // Expired only from a far-future clock: the restore's own retention would keep it.
    await applyInquiryRetention(testDb, privateRoot, new Date(Date.now() + 2 * YEAR));
    expect(await isStored(id)).toBe(false);

    const result = run("restore", dump);

    expect(result.status, result.stderr).toBe(0);
    expect(await isStored(id)).toBe(false);
    expect(existsSync(folder(id))).toBe(false);
    expect(result.stdout).toMatch(/1 ledger entries, 1 inquiries erased again/);
  }, 120_000);

  it("stops before touching the database when an archive is truncated", async () => {
    withMedia();
    const dump = backup();
    const addedAfterBackup = await stored();
    const archive = join(backupDir, `private_${stampOf(dump)}.tar.gz`);
    truncateSync(archive, Math.floor(statSync(archive).size / 2));

    const result = run("restore", dump);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`private_${stampOf(dump)}.tar.gz`);
    expect(await isStored(addedAfterBackup)).toBe(true);
  }, 120_000);

  it("stops before touching the database when the dump is not a dump", async () => {
    const dump = backup();
    const addedAfterBackup = await stored();
    writeFileSync(dump, "not a dump");

    const result = run("restore", dump);

    expect(result.status).not.toBe(0);
    expect(await isStored(addedAfterBackup)).toBe(true);
  }, 120_000);

  it("still re-applies the ledger when unpacking fails after the database was replaced", async () => {
    withMedia();
    const erased = await stored();
    const dump = backup();
    await eraseInquiry(testDb, privateRoot, actorId, erased);
    rmSync(mediaRoot(), { recursive: true });
    writeFileSync(mediaRoot(), "a file where the folder should be");

    const result = run("restore", dump);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/EEXIST|ENOTDIR|File exists/);
    expect(result.stdout).toMatch(/1 ledger entries, 1 inquiries erased again/);
    expect(await isStored(erased)).toBe(false);
  }, 120_000);

  it("still re-applies the ledger when pg_restore fails after partly applying", async () => {
    const erased = await stored();
    const dump = backup();
    await eraseInquiry(testDb, privateRoot, actorId, erased);
    const intact = join(base, "intact.dump");
    copyFileSync(dump, intact);
    truncateSync(dump, statSync(dump).size - 64);

    try {
      const result = run("restore", dump);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("pg_restore failed");
      expect(await isStored(erased)).toBe(false);
    } finally {
      // Other test files need the constraints that a broken restore never created.
      const repaired = run("restore", intact);
      expect(repaired.status, repaired.stderr).toBe(0);
    }
  }, 120_000);

  it("says so loudly and exits non-zero when the re-apply itself fails", async () => {
    withMedia();
    const id = randomUUID();
    writeFileSync(ledger, entry(id));
    // Restored under another name, the table the re-apply needs is missing.
    await testDb.execute(sql`ALTER TABLE inquiries RENAME TO inquiries_gone`);
    try {
      const dump = backup();
      rmSync(mediaRoot(), { recursive: true });
      writeFileSync(mediaRoot(), "a file where the folder should be");

      const result = run("restore", dump);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("could NOT be re-applied");
      // The original failure is still reported.
      expect(result.stderr).toMatch(/EEXIST|ENOTDIR|File exists/);
      expect(result.stderr).not.toContain(id);
    } finally {
      await testDb.execute(sql`ALTER TABLE inquiries_gone RENAME TO inquiries`);
    }
  }, 120_000);

  it("restores a backup taken before migration 0005", async () => {
    const kept = await stored();
    const expired = await stored(new Date(Date.now() - 2 * YEAR));
    const journal = JSON.parse(
      readFileSync("db/migrations/meta/_journal.json", "utf8"),
    ) as { entries: { tag: string; when: number }[] };
    const when = journal.entries.find((e) => e.tag.startsWith("0005_"))!.when;
    await testDb.execute(sql`ALTER TABLE inquiries DROP COLUMN first_completed_at`);
    await testDb.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= ${when}`,
    );
    try {
      const dump = backup();

      const result = run("restore", dump);

      expect(result.status, result.stderr).toBe(0);
      expect(await isStored(kept)).toBe(true);
      expect(await isStored(expired)).toBe(false);
    } finally {
      await runMigrations(process.env.DATABASE_URL_TEST);
    }
  }, 120_000);

  it("reports a torn final ledger line by count and restores anyway", async () => {
    const id = await stored();
    const dump = backup();
    writeFileSync(ledger, `${entry(randomUUID())}{"id":"torn-secret`);

    const result = run("restore", dump);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/incomplete final lines ignored: 1/);
    expect(result.stdout).not.toContain("torn-secret");
    expect(await isStored(id)).toBe(true);
  }, 120_000);

  it("uses the archive's ledger on a host that lost the live one", async () => {
    const erased = await stored();
    writeFileSync(ledger, entry(erased));
    const dump = backup();
    rmSync(ledger);

    const result = run("restore", dump);

    expect(result.status, result.stderr).toBe(0);
    expect(await isStored(erased)).toBe(false);
    expect(readFileSync(ledger, "utf8")).toBe(entry(erased));
    expect(statSync(ledger).mode & 0o777).toBe(0o600);
  }, 120_000);

  it("re-applies the union of the live and the archived ledger, losing neither", async () => {
    const [onlyArchived, onlyLive] = [await stored(), await stored()];
    writeFileSync(ledger, entry(onlyArchived));
    const dump = backup();
    writeFileSync(ledger, entry(onlyLive));

    const result = run("restore", dump);

    expect(result.status, result.stderr).toBe(0);
    expect(await isStored(onlyArchived)).toBe(false);
    expect(await isStored(onlyLive)).toBe(false);
    expect(readFileSync(ledger, "utf8")).toBe(entry(onlyLive) + entry(onlyArchived));
  }, 120_000);
});
