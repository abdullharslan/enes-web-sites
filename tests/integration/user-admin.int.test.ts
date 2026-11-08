import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Executor } from "@/db/connection";
import { auditEvents, trustedDevices, users } from "@/db/schema";
import { createSession, createUser, validateSession } from "@/lib/server/auth/service";
import { hashSessionToken } from "@/lib/server/auth/token";
import {
  PASSWORD_CHANGE_LIMIT,
  UserRuleError,
  changeOwnPassword,
  changeUserRole,
  createUserFromCommandLine,
  resetUserPassword,
  setUserActive,
} from "@/lib/server/auth/users";
import { verifyPassword } from "@/lib/server/auth/password";
import { closeTestDb, credentialOf, withRollback } from "./helpers";

afterAll(closeTestDb);

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "another long passphrase here";

const make = (tx: Executor, name: string, role: "owner" | "editor") =>
  createUser(tx, { email: `${name}@example.com`, name, role, password: PASSWORD });

const rule = (code: string) =>
  expect.objectContaining({ name: "UserRuleError", code }) as unknown as Error;

async function roleOf(tx: Executor, id: string) {
  const [row] = await tx.select().from(users).where(eq(users.id, id));
  return row;
}

async function actions(tx: Executor, entityId: string) {
  const rows = await tx
    .select({ action: auditEvents.action, details: auditEvents.details })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, entityId));
  return rows;
}

async function addDevice(tx: Executor, userId: string) {
  await tx.insert(trustedDevices).values({
    tokenHash: hashSessionToken(`device-${userId}`),
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  });
}

describe("changeUserRole", () => {
  it("promotes and demotes other users and audits the change", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      await changeUserRole(tx, owner.id, editor.id, "owner");
      expect((await roleOf(tx, editor.id))?.role).toBe("owner");
      await changeUserRole(tx, owner.id, editor.id, "editor");
      expect((await roleOf(tx, editor.id))?.role).toBe("editor");
      expect((await actions(tx, editor.id)).slice(1)).toEqual([
        { action: "user.role_changed", details: { from: "editor", to: "owner" } },
        { action: "user.role_changed", details: { from: "owner", to: "editor" } },
      ]);
    }));

  it("is idempotent: setting the current role writes nothing", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      await changeUserRole(tx, owner.id, editor.id, "editor");
      expect(await actions(tx, editor.id)).toHaveLength(1);
    }));

  it("refuses to change the actor's own role", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      await expect(changeUserRole(tx, owner.id, owner.id, "editor")).rejects.toThrow(
        rule("self"),
      );
    }));

  it("refuses actors that are not (or no longer) active owners", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      const other = await make(tx, "other", "editor");
      await expect(changeUserRole(tx, editor.id, other.id, "owner")).rejects.toThrow(
        rule("forbidden"),
      );
      const second = await make(tx, "second", "owner");
      await setUserActive(tx, owner.id, second.id, false);
      await expect(changeUserRole(tx, second.id, other.id, "owner")).rejects.toThrow(
        rule("forbidden"),
      );
    }));

  it("never leaves the site without an active owner", () =>
    withRollback(async (tx) => {
      const a = await make(tx, "a", "owner");
      const b = await make(tx, "b", "owner");
      await changeUserRole(tx, a.id, b.id, "editor");
      // b is now an editor and cannot act; a is the last owner and cannot demote itself.
      await expect(changeUserRole(tx, b.id, a.id, "editor")).rejects.toThrow(
        rule("forbidden"),
      );
      await expect(changeUserRole(tx, a.id, a.id, "editor")).rejects.toThrow(
        rule("self"),
      );
      expect((await roleOf(tx, a.id))?.role).toBe("owner");
    }));

  it("rejects unknown users", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      await expect(
        changeUserRole(tx, owner.id, "00000000-0000-4000-8000-000000000000", "owner"),
      ).rejects.toThrow(rule("notFound"));
    }));
});

describe("setUserActive", () => {
  it("deactivating signs the user out everywhere", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      const { token } = await createSession(
        tx,
        editor.id,
        await credentialOf(tx, editor.id),
      );
      await addDevice(tx, editor.id);
      await setUserActive(tx, owner.id, editor.id, false);
      expect(await validateSession(tx, token)).toBeNull();
      expect(
        await tx
          .select()
          .from(trustedDevices)
          .where(eq(trustedDevices.userId, editor.id)),
      ).toEqual([]);
      await setUserActive(tx, owner.id, editor.id, true);
      expect((await roleOf(tx, editor.id))?.isActive).toBe(true);
      expect((await actions(tx, editor.id)).map((a) => a.action)).toEqual([
        "user.created",
        "user.deactivated",
        "user.activated",
      ]);
    }));

  it("refuses to deactivate the actor itself", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      await expect(setUserActive(tx, owner.id, owner.id, false)).rejects.toThrow(
        rule("self"),
      );
    }));
});

describe("resetUserPassword", () => {
  it("sets a new password and revokes sessions and trusted devices", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      const { token } = await createSession(
        tx,
        editor.id,
        await credentialOf(tx, editor.id),
      );
      await addDevice(tx, editor.id);
      await resetUserPassword(tx, owner.id, editor.id, NEW_PASSWORD);

      const row = await roleOf(tx, editor.id);
      expect(await verifyPassword(row!.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await verifyPassword(row!.passwordHash, PASSWORD)).toBe(false);
      expect(await validateSession(tx, token)).toBeNull();
      expect(
        await tx
          .select()
          .from(trustedDevices)
          .where(eq(trustedDevices.userId, editor.id)),
      ).toEqual([]);
      const audit = await actions(tx, editor.id);
      expect(audit.at(-1)?.action).toBe("user.password_reset");
      expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
    }));

  it("rejects weak passwords, self-resets and non-owners", () =>
    withRollback(async (tx) => {
      const owner = await make(tx, "owner", "owner");
      const editor = await make(tx, "editor", "editor");
      await expect(resetUserPassword(tx, owner.id, editor.id, "short")).rejects.toThrow(
        rule("weakPassword"),
      );
      await expect(
        resetUserPassword(tx, owner.id, owner.id, NEW_PASSWORD),
      ).rejects.toThrow(rule("self"));
      await expect(
        resetUserPassword(tx, editor.id, owner.id, NEW_PASSWORD),
      ).rejects.toThrow(rule("forbidden"));
    }));
});

describe("changeOwnPassword", () => {
  it("requires the current password, keeps this session and ends the others", () =>
    withRollback(async (tx) => {
      const editor = await make(tx, "editor", "editor");
      const current = await createSession(
        tx,
        editor.id,
        await credentialOf(tx, editor.id),
      );
      const other = await createSession(tx, editor.id, await credentialOf(tx, editor.id));
      await addDevice(tx, editor.id);

      expect(
        await changeOwnPassword(tx, editor.id, {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          keepSessionToken: current.token,
        }),
      ).toBe("changed");

      const row = await roleOf(tx, editor.id);
      expect(await verifyPassword(row!.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await validateSession(tx, current.token)).not.toBeNull();
      expect(await validateSession(tx, other.token)).toBeNull();
      expect(
        await tx
          .select()
          .from(trustedDevices)
          .where(eq(trustedDevices.userId, editor.id)),
      ).toEqual([]);
      expect((await actions(tx, editor.id)).at(-1)?.action).toBe("user.password_changed");
    }));

  it("rejects a wrong current password, a weak or unchanged new one", () =>
    withRollback(async (tx) => {
      const editor = await make(tx, "editor", "editor");
      const input = { keepSessionToken: "x" };
      // Returned, not thrown, so the caller commits the recorded failure.
      await expect(
        changeOwnPassword(tx, editor.id, {
          ...input,
          currentPassword: "wrong password!!",
          newPassword: NEW_PASSWORD,
        }),
      ).resolves.toBe("wrongPassword");
      await expect(
        changeOwnPassword(tx, editor.id, {
          ...input,
          currentPassword: PASSWORD,
          newPassword: "short",
        }),
      ).rejects.toThrow(rule("weakPassword"));
      await expect(
        changeOwnPassword(tx, editor.id, {
          ...input,
          currentPassword: PASSWORD,
          newPassword: PASSWORD,
        }),
      ).rejects.toThrow(rule("unchanged"));
      const row = await roleOf(tx, editor.id);
      expect(await verifyPassword(row!.passwordHash, PASSWORD)).toBe(true);
    }));

  it("throttles guessing of the current password with a stolen session", () =>
    withRollback(async (tx) => {
      const editor = await make(tx, "editor", "editor");
      const attempt = (currentPassword: string) =>
        changeOwnPassword(tx, editor.id, {
          currentPassword,
          newPassword: NEW_PASSWORD,
          keepSessionToken: "x",
        });
      for (let i = 0; i < PASSWORD_CHANGE_LIMIT.maxFailures; i++) {
        await expect(attempt(`wrong guess number ${i}`)).resolves.toBe("wrongPassword");
      }
      // Even the right password is refused while the limit holds.
      await expect(attempt(PASSWORD)).rejects.toThrow(rule("tooManyAttempts"));
      const failures = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityId, editor.id),
            eq(auditEvents.action, "user.password_change_failed"),
          ),
        );
      expect(failures).toHaveLength(PASSWORD_CHANGE_LIMIT.maxFailures);
    }));
});

describe("error type", () => {
  it("exposes a stable code", () => {
    const error = new UserRuleError("self");
    expect(error.code).toBe("self");
    expect(error.name).toBe("UserRuleError");
  });
});

describe("createUserFromCommandLine", () => {
  const input = (name: string, role: "owner" | "editor") => ({
    email: `${name}@example.com`,
    name,
    role,
    password: PASSWORD,
  });
  const retireOwners = (tx: Executor) =>
    tx.update(users).set({ isActive: false }).where(eq(users.role, "owner"));

  it("refuses a non-owner while no active owner exists", () =>
    withRollback(async (tx) => {
      await make(tx, "retired", "owner");
      await retireOwners(tx);
      await expect(
        createUserFromCommandLine(tx, input("editor", "editor")),
      ).rejects.toThrow(/aktif sahip/i);
      const [row] = await tx
        .select()
        .from(users)
        .where(eq(users.email, "editor@example.com"));
      expect(row).toBeUndefined();
    }));

  it("allows the first owner, and editors once an active owner exists", () =>
    withRollback(async (tx) => {
      await retireOwners(tx);
      const owner = await createUserFromCommandLine(tx, input("first", "owner"));
      const editor = await createUserFromCommandLine(tx, input("editor", "editor"));
      expect([owner.role, editor.role]).toEqual(["owner", "editor"]);
    }));
});
