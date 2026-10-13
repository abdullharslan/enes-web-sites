import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditEvents, sessions, users } from "@/db/schema";
import {
  LOGIN_LOCKOUT,
  SESSION_TTL_MS,
  authenticate,
  createSession,
  createUser,
  deleteSession,
  validateSession,
} from "@/lib/server/auth/service";
import { hashSessionToken } from "@/lib/server/auth/token";
import { closeTestDb, withRollback } from "./helpers";

afterAll(closeTestDb);

const now = new Date("2026-10-14T12:00:00Z");
const owner = {
  email: "Owner@Example.com",
  name: "Owner",
  role: "owner" as const,
  password: "correct horse battery staple",
};

describe("createUser", () => {
  it("normalises the e-mail, hashes the password and audits the action", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, owner);
      expect(user.email).toBe("owner@example.com");
      const [row] = await tx.select().from(users).where(eq(users.id, user.id));
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row?.passwordHash).not.toContain(owner.password);
      const audit = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, user.id));
      expect(audit.map((a) => a.action)).toEqual(["user.created"]);
      expect(JSON.stringify(audit)).not.toContain(owner.password);
    }));

  it("rejects weak passwords and duplicate e-mails", () =>
    withRollback(async (tx) => {
      await expect(createUser(tx, { ...owner, password: "short" })).rejects.toThrow(
        /tooShort/,
      );
      await createUser(tx, owner);
      await expect(
        createUser(tx, { ...owner, email: "owner@example.com" }),
      ).rejects.toThrow();
    }));
});

describe("authenticate", () => {
  it("accepts valid credentials case-insensitively on the e-mail", () =>
    withRollback(async (tx) => {
      await createUser(tx, owner);
      const result = await authenticate(tx, {
        email: "OWNER@example.com",
        password: owner.password,
        now,
      });
      expect(result).toMatchObject({
        ok: true,
        user: { email: "owner@example.com", role: "owner" },
      });
    }));

  it("gives the same answer for a wrong password and an unknown user (no enumeration)", () =>
    withRollback(async (tx) => {
      await createUser(tx, owner);
      expect(
        await authenticate(tx, { email: owner.email, password: "wrong password!!", now }),
      ).toEqual({ ok: false, reason: "invalid" });
      expect(
        await authenticate(tx, {
          email: "nobody@example.com",
          password: "wrong password!!",
          now,
        }),
      ).toEqual({ ok: false, reason: "invalid" });
    }));

  it("locks the account after repeated failures, even for the right password", () =>
    withRollback(async (tx) => {
      await createUser(tx, owner);
      for (let i = 0; i < LOGIN_LOCKOUT.maxFailures; i += 1) {
        await authenticate(tx, { email: owner.email, password: "wrong password!!", now });
      }
      expect(
        await authenticate(tx, { email: owner.email, password: owner.password, now }),
      ).toEqual({ ok: false, reason: "locked" });
      const later = new Date(now.getTime() + LOGIN_LOCKOUT.windowMs + 1);
      expect(
        await authenticate(tx, {
          email: owner.email,
          password: owner.password,
          now: later,
        }),
      ).toMatchObject({ ok: true });
    }));

  it("rejects deactivated users", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, owner);
      await tx.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      expect(
        await authenticate(tx, { email: owner.email, password: owner.password, now }),
      ).toEqual({ ok: false, reason: "invalid" });
    }));
});

describe("sessions", () => {
  it("stores only the token hash and validates until expiry", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, owner);
      const { token, expiresAt } = await createSession(tx, user.id, now);
      expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);

      const stored = await tx.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(stored.map((s) => s.tokenHash)).toEqual([hashSessionToken(token)]);

      expect(await validateSession(tx, token, now)).toMatchObject({
        id: user.id,
        role: "owner",
      });
      expect(
        await validateSession(tx, token, new Date(expiresAt.getTime() + 1)),
      ).toBeNull();
      expect(
        await tx.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).toEqual([]);
    }));

  it("rejects unknown tokens, logged-out sessions and deactivated users", () =>
    withRollback(async (tx) => {
      const user = await createUser(tx, owner);
      const { token } = await createSession(tx, user.id, now);
      expect(await validateSession(tx, "forged-token", now)).toBeNull();

      const second = await createSession(tx, user.id, now);
      await tx.update(users).set({ isActive: false }).where(eq(users.id, user.id));
      expect(await validateSession(tx, second.token, now)).toBeNull();

      await tx.update(users).set({ isActive: true }).where(eq(users.id, user.id));
      await deleteSession(tx, token);
      expect(await validateSession(tx, token, now)).toBeNull();
    }));
});
