import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Executor } from "@/db/connection";
import { auditEvents, loginAttempts, sessions, trustedDevices, users } from "@/db/schema";
import {
  InactiveAccountError,
  authenticate,
  createSession,
  createUser,
} from "@/lib/server/auth/service";
import {
  changeOwnPassword,
  changeUserRole,
  resetUserPassword,
  setUserActive,
} from "@/lib/server/auth/users";
import { closeTestDb, credentialOf, testDb, withRollback } from "./helpers";

/** Runs once, right after the password check: the gap a racing change lands in. */
const gap = vi.hoisted(() => ({
  run: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock("@/lib/server/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/auth/password")>();
  return {
    ...actual,
    verifyPassword: async (hash: string, password: string) => {
      const valid = await actual.verifyPassword(hash, password);
      const { run } = gap;
      gap.run = undefined;
      await run?.();
      return valid;
    },
  };
});

afterEach(() => {
  gap.run = undefined;
});
afterAll(closeTestDb);

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "an entirely different passphrase";

const make = (db: Executor, role: "owner" | "editor", email: string) =>
  createUser(db, { email, name: role, role, password: PASSWORD });

const staff = async (db: Executor) => ({
  owner: await make(db, "owner", "race-owner@example.com"),
  editor: await make(db, "editor", "race-editor@example.com"),
});

const login = (db: Executor, email: string) =>
  authenticate(db, { email, password: PASSWORD });

const devicesOf = (db: Executor, userId: string) =>
  db.select().from(trustedDevices).where(eq(trustedDevices.userId, userId));
const sessionsOf = (db: Executor, userId: string) =>
  db.select().from(sessions).where(eq(sessions.userId, userId));
const loginAudits = (db: Executor, userId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, userId), eq(auditEvents.action, "auth.login")));

describe("a credential change after the password check", () => {
  it("an owner's reset: authenticate refuses and leaves no trusted device", () =>
    withRollback(async (tx) => {
      const { owner, editor } = await staff(tx);
      gap.run = () => resetUserPassword(tx, owner.id, editor.id, NEW_PASSWORD);
      expect(await login(tx, editor.email)).toEqual({ ok: false, reason: "invalid" });
      expect(await devicesOf(tx, editor.id)).toEqual([]);
      expect(await loginAudits(tx, editor.id)).toEqual([]);
    }));

  it("the user's own change: authenticate refuses and leaves no trusted device", () =>
    withRollback(async (tx) => {
      const editor = await make(tx, "editor", "race-editor@example.com");
      gap.run = () =>
        changeOwnPassword(tx, editor.id, {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          keepSessionToken: "another-browser",
        });
      expect(await login(tx, editor.email)).toEqual({ ok: false, reason: "invalid" });
      expect(await devicesOf(tx, editor.id)).toEqual([]);
    }));

  it("a deactivation: authenticate refuses and leaves no trusted device", () =>
    withRollback(async (tx) => {
      const { owner, editor } = await staff(tx);
      gap.run = () => setUserActive(tx, owner.id, editor.id, false);
      expect(await login(tx, editor.email)).toEqual({ ok: false, reason: "invalid" });
      expect(await devicesOf(tx, editor.id)).toEqual([]);
    }));

  it("verify, then reset: createSession refuses and no device survives", () =>
    withRollback(async (tx) => {
      const { owner, editor } = await staff(tx);
      const verified = await login(tx, editor.email);
      if (!verified.ok) throw new Error("login should have succeeded");
      await resetUserPassword(tx, owner.id, editor.id, NEW_PASSWORD);

      await expect(
        createSession(tx, editor.id, verified.credential),
      ).rejects.toBeInstanceOf(InactiveAccountError);
      expect(await sessionsOf(tx, editor.id)).toEqual([]);
      expect(await devicesOf(tx, editor.id)).toEqual([]);
    }));

  it("keeps the hash itself inside the auth service", () =>
    withRollback(async (tx) => {
      const editor = await make(tx, "editor", "race-editor@example.com");
      const verified = await login(tx, editor.email);
      expect(JSON.stringify(verified)).not.toContain("$argon2");
    }));

  it("an unrelated change to the user does not refuse the login", () =>
    withRollback(async (tx) => {
      const { owner, editor } = await staff(tx);
      gap.run = () => changeUserRole(tx, owner.id, editor.id, "owner");
      const verified = await login(tx, editor.email);
      if (!verified.ok) throw new Error("login should have succeeded");
      await createSession(tx, editor.id, verified.credential);
      expect(await sessionsOf(tx, editor.id)).toHaveLength(1);
      expect(await devicesOf(tx, editor.id)).toHaveLength(1);
    }));
});

/*
 * These two COMMIT real, parallel transactions to prove the row lock; everything
 * they write is removed again because other test files read the same tables.
 */
describe("a login racing a reset on separate connections", () => {
  // Long enough for the other side to reach its lock (or, without one, to finish).
  const letOtherSideRun = () => new Promise((resolve) => setTimeout(resolve, 150));

  async function withCommittedStaff(
    run: (ownerId: string, editorId: string, email: string) => Promise<void>,
  ) {
    const { owner, editor } = await staff(testDb);
    const ids = [owner.id, editor.id];
    try {
      await run(owner.id, editor.id, editor.email);
      expect(await sessionsOf(testDb, editor.id)).toEqual([]);
      expect(await devicesOf(testDb, editor.id)).toEqual([]);
    } finally {
      await testDb
        .delete(auditEvents)
        .where(or(inArray(auditEvents.entityId, ids), inArray(auditEvents.actorId, ids)));
      await testDb
        .delete(loginAttempts)
        .where(inArray(loginAttempts.email, [owner.email, editor.email]));
      await testDb.delete(users).where(inArray(users.id, ids));
    }
  }

  it("a session arriving during a reset waits for it and is refused", () =>
    withCommittedStaff(async (ownerId, editorId) => {
      const credential = await credentialOf(testDb, editorId);
      let session: Promise<unknown> = Promise.resolve();
      await testDb.transaction(async (tx) => {
        await resetUserPassword(tx, ownerId, editorId, NEW_PASSWORD);
        session = createSession(testDb, editorId, credential).then(
          () => "created",
          (error: unknown) => error,
        );
        await letOtherSideRun();
      });
      expect(await session).toBeInstanceOf(InactiveAccountError);
    }));

  it("a reset arriving during a login removes its session and device", () =>
    withCommittedStaff(async (ownerId, editorId, email) => {
      let reset: Promise<unknown> = Promise.resolve();
      await testDb.transaction(async (tx) => {
        const verified = await login(tx, email);
        if (!verified.ok) throw new Error("login should have succeeded");
        await createSession(tx, editorId, verified.credential);
        reset = testDb.transaction((other) =>
          resetUserPassword(other, ownerId, editorId, NEW_PASSWORD),
        );
        await letOtherSideRun();
      });
      await reset;
    }));
});
