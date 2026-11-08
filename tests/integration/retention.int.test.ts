import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Executor } from "@/db/connection";
import { inquiries, loginAttempts, sessions, trustedDevices, users } from "@/db/schema";
import {
  LOGIN_ATTEMPT_RETENTION_MS,
  LOGIN_LOCKOUT,
  authenticate,
  purgeExpiredAuthData,
} from "@/lib/server/auth/service";
import {
  applyInquiryRetention,
  applyRetention,
  maintainRetention,
} from "@/lib/server/inquiries/retention";
import { closeTestDb, tempMediaRoot, testDb, withRollback } from "./helpers";

afterAll(closeTestDb);

let storage: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  storage = tempMediaRoot();
});
afterEach(() => storage.cleanup());

const HOUR = 60 * 60 * 1000;

function folder(id: string, ageMs: number) {
  const path = join(storage.root, "inquiries", id);
  mkdirSync(path, { recursive: true });
  const time = new Date(Date.now() - ageMs);
  utimesSync(path, time, time);
  return path;
}

describe("applyInquiryRetention (orphan photo folders)", () => {
  it("removes only old folders without a row, in chunks, however many there are", async () => {
    const kept = randomUUID();
    await testDb
      .insert(inquiries)
      .values({ id: kept, kind: "sell", locale: "de", data: {} });
    try {
      const keptPath = folder(kept, 2 * HOUR);
      const young = folder(randomUUID(), 60_000);
      // More than PostgreSQL's 65,535 bind parameters: one giant IN (...) list would fail.
      const orphans = Array.from({ length: 66_000 }, () =>
        folder(randomUUID(), 2 * HOUR),
      );

      const result = await applyInquiryRetention(testDb, storage.root);

      expect(result.orphans).toBe(66_000);
      expect(orphans.some(existsSync)).toBe(false);
      expect(existsSync(keptPath)).toBe(true);
      // A submission still being stored (fresh folder, no row yet) is left alone.
      expect(existsSync(young)).toBe(true);
    } finally {
      await testDb.delete(inquiries).where(inArray(inquiries.id, [kept]));
    }
  }, 180_000);

  it("copes with a missing storage folder", async () => {
    storage.cleanup();
    await expect(applyInquiryRetention(testDb, storage.root)).resolves.toMatchObject({
      orphans: 0,
    });
  });
});

describe("cleaning up expired login data", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const email = "retention-owner@example.com";
  const ago = (ms: number, from = now) => new Date(from.getTime() - ms);
  const after = (ms: number, from = now) => new Date(from.getTime() + ms);

  async function owner(db: Executor): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ email, name: "Owner", role: "owner", passwordHash: "not-a-hash" })
      .returning({ id: users.id });
    return user!.id;
  }

  const attempt = (db: Executor, createdAt: Date, succeeded = false) =>
    db.insert(loginAttempts).values({ email, ip: "203.0.113.7", succeeded, createdAt });

  async function seedExpiredAndLive(db: Executor, at: Date) {
    const userId = await owner(db);
    await db.insert(sessions).values([
      { tokenHash: "session-expired", userId, expiresAt: ago(HOUR, at) },
      { tokenHash: "session-just-expired", userId, expiresAt: at },
      { tokenHash: "session-live", userId, expiresAt: after(HOUR, at) },
    ]);
    await db.insert(trustedDevices).values([
      { tokenHash: "device-expired", userId, expiresAt: ago(HOUR, at) },
      { tokenHash: "device-live", userId, expiresAt: after(HOUR, at) },
    ]);
    await attempt(db, ago(LOGIN_ATTEMPT_RETENTION_MS + HOUR, at));
    await attempt(db, ago(LOGIN_ATTEMPT_RETENTION_MS + HOUR, at), true);
    await attempt(db, ago(LOGIN_ATTEMPT_RETENTION_MS - HOUR, at));
  }

  async function remaining(db: Executor) {
    const [sessionRows, deviceRows, attemptRows] = await Promise.all([
      db.select({ key: sessions.tokenHash }).from(sessions),
      db.select({ key: trustedDevices.tokenHash }).from(trustedDevices),
      db
        .select({ at: loginAttempts.createdAt })
        .from(loginAttempts)
        .where(eq(loginAttempts.email, email)),
    ]);
    return {
      sessions: sessionRows.map((row) => row.key),
      devices: deviceRows.map((row) => row.key),
      attempts: attemptRows.length,
    };
  }

  afterEach(async () => {
    await testDb.delete(loginAttempts).where(eq(loginAttempts.email, email));
    await testDb.delete(users).where(eq(users.email, email));
  });

  it("keeps login attempts far longer than any lockout looks back", () => {
    expect(LOGIN_ATTEMPT_RETENTION_MS).toBeGreaterThanOrEqual(
      100 * LOGIN_LOCKOUT.windowMs,
    );
  });

  it("removes expired rows and leaves live ones", () =>
    withRollback(async (tx) => {
      await seedExpiredAndLive(tx, now);

      await expect(purgeExpiredAuthData(tx, now)).resolves.toBe(5);

      expect(await remaining(tx)).toEqual({
        sessions: ["session-live"],
        devices: ["device-live"],
        attempts: 1,
      });
    }));

  it("never removes an attempt inside the lockout window, so a lock survives it", () =>
    withRollback(async (tx) => {
      await owner(tx);
      for (let i = 0; i < LOGIN_LOCKOUT.maxFailures; i += 1) {
        await attempt(tx, ago(LOGIN_LOCKOUT.windowMs - 1000));
      }

      await purgeExpiredAuthData(tx, now);

      expect((await remaining(tx)).attempts).toBe(LOGIN_LOCKOUT.maxFailures);
      await expect(
        authenticate(tx, { email, password: "anything", ip: "203.0.113.7", now }),
      ).resolves.toEqual({ ok: false, reason: "locked" });
    }));

  it("is part of the periodic retention run", async () => {
    await seedExpiredAndLive(testDb, new Date());

    const result = await applyRetention(testDb, storage.root);

    expect(result.authRows).toBeGreaterThanOrEqual(5);
    expect(await remaining(testDb)).toMatchObject({ attempts: 1 });
  });

  it("is covered by the script behind the cron job", async () => {
    await seedExpiredAndLive(testDb, new Date());

    execFileSync("npx", ["tsx", "scripts/purge-inquiries.ts"], {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL_TEST,
        PRIVATE_STORAGE_ROOT: storage.root,
      },
      stdio: "pipe",
    });

    expect(await remaining(testDb)).toMatchObject({
      sessions: ["session-live"],
      devices: ["device-live"],
      attempts: 1,
    });
  }, 60_000);

  it("logs a failed run without the error's text, which could hold personal data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      delete() {
        throw new Error(`could not delete ${email}`);
      },
    } as unknown as Database;

    await expect(maintainRetention(broken, storage.root)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(inspect(log.mock.calls)).not.toContain(email);
  });
});
