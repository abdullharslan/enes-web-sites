import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { auditEvents, loginAttempts, users } from "@/db/schema";
import { LOGIN_LOCKOUT, authenticate, createUser } from "@/lib/server/auth/service";
import { closeTestDb, testDb } from "./helpers";

/*
 * These tests need real concurrency, so they commit to the test database
 * (instead of the usual rollback) and clean up after themselves.
 */
afterAll(closeTestDb);

const email = "throttle-owner@example.com";
const password = "correct horse battery staple";

afterEach(async () => {
  const [user] = await testDb.select().from(users).where(eq(users.email, email));
  if (user) await testDb.delete(auditEvents).where(eq(auditEvents.entityId, user.id));
  await testDb.delete(loginAttempts).where(eq(loginAttempts.email, email));
  await testDb.delete(users).where(eq(users.email, email));
});

describe("login throttling", () => {
  it("cannot be bypassed with parallel requests", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const now = new Date("2026-10-14T12:00:00Z");
    await Promise.all(
      Array.from({ length: 12 }, () =>
        authenticate(testDb, {
          email,
          password: "wrong password!!",
          ip: "203.0.113.7",
          now,
        }),
      ),
    );
    const failures = await testDb
      .select()
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false)));
    expect(failures).toHaveLength(LOGIN_LOCKOUT.maxFailures);
    expect(
      await authenticate(testDb, { email, password, ip: "203.0.113.7", now }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  it("an attacker cannot keep the owner locked out from another address", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const start = new Date("2026-10-14T12:00:00Z");
    // Attacker keeps hammering from one IP, long after the window would have expired.
    for (let minute = 0; minute <= 30; minute += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: "198.51.100.1",
        now: new Date(start.getTime() + minute * 60_000),
      });
    }
    const later = new Date(start.getTime() + 31 * 60_000);
    expect(
      await authenticate(testDb, { email, password, ip: "192.0.2.10", now: later }),
    ).toMatchObject({ ok: true });
  });

  it("attempts made while locked do not extend the lock", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const start = new Date("2026-10-14T12:00:00Z");
    for (let i = 0; i < LOGIN_LOCKOUT.maxFailures; i += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: "198.51.100.1",
        now: start,
      });
    }
    for (let minute = 10; minute < 15; minute += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: "198.51.100.1",
        now: new Date(start.getTime() + minute * 60_000),
      });
    }
    const afterWindow = new Date(start.getTime() + LOGIN_LOCKOUT.windowMs + 1);
    expect(
      await authenticate(testDb, {
        email,
        password,
        ip: "198.51.100.1",
        now: afterWindow,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("login throttling against rotating (spoofable) addresses", () => {
  it("caps failures per e-mail across all addresses", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const now = new Date("2026-10-14T12:00:00Z");
    for (let i = 0; i < LOGIN_LOCKOUT.maxFailuresPerEmail; i += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: `198.51.100.${i % 250}x${i}`,
        now,
      });
    }
    expect(
      await authenticate(testDb, { email, password, ip: "192.0.2.99", now }),
    ).toEqual({ ok: false, reason: "locked" });
  });
});

describe("trusted devices", () => {
  it("lets the owner in from a known device even when attackers exhaust the per-e-mail cap", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const now = new Date("2026-10-14T12:00:00Z");
    const first = await authenticate(testDb, { email, password, ip: "192.0.2.10", now });
    expect(first).toMatchObject({ ok: true });
    const deviceToken = first.ok ? first.deviceToken : "";
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    for (let i = 0; i < LOGIN_LOCKOUT.maxFailuresPerEmail; i += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: `spoofed-${i}`,
        now,
      });
    }
    expect(
      await authenticate(testDb, { email, password, ip: "192.0.2.77", now }),
    ).toEqual({ ok: false, reason: "locked" });
    expect(
      await authenticate(testDb, { email, password, ip: "192.0.2.77", deviceToken, now }),
    ).toMatchObject({ ok: true });
  });

  it("a device token of another user grants nothing", async () => {
    await createUser(testDb, { email, name: "Owner", role: "owner", password });
    const now = new Date("2026-10-14T12:00:00Z");
    for (let i = 0; i < LOGIN_LOCKOUT.maxFailuresPerEmail; i += 1) {
      await authenticate(testDb, {
        email,
        password: "wrong password!!",
        ip: `spoofed-${i}`,
        now,
      });
    }
    expect(
      await authenticate(testDb, { email, password, deviceToken: "forged-token", now }),
    ).toEqual({ ok: false, reason: "locked" });
  });
});
