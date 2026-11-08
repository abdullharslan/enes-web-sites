import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { auditEvents, sessions, trustedDevices, users } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import type { Role } from "./permissions";
import { createUser, type NewUser, type SessionUser } from "./service";
import { hashSessionToken } from "./token";

/*
 * User management rules. Invariant: there is always at least one active owner.
 * It holds structurally — every change is made by an actor re-checked as an
 * active owner under one lock, and nobody may change their own role or status —
 * so the actor is still an active owner afterwards, even under concurrency.
 */

export type UserRuleCode =
  | "forbidden"
  | "notFound"
  | "self"
  | "weakPassword"
  | "unchanged"
  | "tooManyAttempts"
  | "duplicate";

export class UserRuleError extends Error {
  override readonly name = "UserRuleError";
  constructor(readonly code: UserRuleCode) {
    super(`User rule violated: ${code}`);
  }
}

/** Wrong current passwords per user within the window (a stolen session must not allow guessing). */
export const PASSWORD_CHANGE_LIMIT = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
} as const;

/** Serialises all user-management changes so the owner checks cannot race. */
const lockUserManagement = (tx: Executor) =>
  tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('user-management'))`);

async function requireActiveOwner(tx: Executor, actorId: string): Promise<void> {
  const [actor] = await tx
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, actorId));
  if (actor?.role !== "owner" || !actor.isActive) throw new UserRuleError("forbidden");
}

/** Locks, re-checks the actor and loads the target (never the actor itself). */
async function beginChange(tx: Executor, actorId: string, userId: string) {
  if (actorId === userId) throw new UserRuleError("self");
  await lockUserManagement(tx);
  await requireActiveOwner(tx, actorId);
  const [target] = await tx.select().from(users).where(eq(users.id, userId));
  if (!target) throw new UserRuleError("notFound");
  return target;
}

/** Ends every session and forgets every trusted device of the user. */
async function signOutEverywhere(tx: Executor, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}

function assertStrong(password: string): void {
  if (passwordProblems(password).length) throw new UserRuleError("weakPassword");
}

/** Creates a user on behalf of an owner, under the same lock and re-check as every other change. */
export async function createUserAsOwner(
  tx: Executor,
  actorId: string,
  input: NewUser,
): Promise<SessionUser> {
  assertStrong(input.password);
  await lockUserManagement(tx);
  await requireActiveOwner(tx, actorId);
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email.trim().toLowerCase()));
  if (existing) throw new UserRuleError("duplicate");
  return createUser(tx, input, actorId);
}

/**
 * For `npm run admin:create`, which has no signed-in actor. The first account
 * must be an owner, or nobody could ever manage users.
 */
export async function createUserFromCommandLine(
  tx: Executor,
  input: NewUser,
): Promise<SessionUser> {
  await lockUserManagement(tx);
  if (input.role !== "owner") {
    const [owner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "owner"), eq(users.isActive, true)))
      .limit(1);
    if (!owner)
      throw new Error(
        "Aktif sahip yok: önce --role owner ile bir sahip hesabı oluşturun.",
      );
  }
  return createUser(tx, input);
}

export async function changeUserRole(
  tx: Executor,
  actorId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const target = await beginChange(tx, actorId, userId);
  if (target.role === role) return;
  await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  await recordAudit(tx, {
    actorId,
    action: "user.role_changed",
    entityType: "user",
    entityId: userId,
    details: { from: target.role, to: role },
  });
}

export async function setUserActive(
  tx: Executor,
  actorId: string,
  userId: string,
  active: boolean,
): Promise<void> {
  const target = await beginChange(tx, actorId, userId);
  if (target.isActive === active) return;
  // This update takes the user row: createSession waits for it, or it waits for
  // createSession and the delete below then also removes the session just made.
  await tx
    .update(users)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(users.id, userId));
  if (!active) await signOutEverywhere(tx, userId);
  await recordAudit(tx, {
    actorId,
    action: active ? "user.activated" : "user.deactivated",
    entityType: "user",
    entityId: userId,
  });
}

/** An owner sets a new password for someone who lost theirs; all their sessions end. */
export async function resetUserPassword(
  tx: Executor,
  actorId: string,
  userId: string,
  newPassword: string,
): Promise<void> {
  if (actorId === userId) throw new UserRuleError("self");
  assertStrong(newPassword);
  const passwordHash = await hashPassword(newPassword);
  await beginChange(tx, actorId, userId);
  await tx
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await signOutEverywhere(tx, userId);
  await recordAudit(tx, {
    actorId,
    action: "user.password_reset",
    entityType: "user",
    entityId: userId,
  });
}

export interface OwnPasswordChange {
  currentPassword: string;
  newPassword: string;
  /** The session making the change stays signed in; all others end. */
  keepSessionToken: string;
  now?: Date;
}

async function recentFailures(tx: Executor, userId: string, now: Date) {
  const [row] = await tx
    .select({ n: count() })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityId, userId),
        eq(auditEvents.action, "user.password_change_failed"),
        gt(
          auditEvents.createdAt,
          new Date(now.getTime() - PASSWORD_CHANGE_LIMIT.windowMs),
        ),
      ),
    );
  return row?.n ?? 0;
}

/**
 * A wrong current password is *returned*, not thrown: the caller commits the
 * transaction so the recorded failure counts towards the limit (a throw would
 * roll it back and make guessing free). Every other violation throws.
 */
export async function changeOwnPassword(
  tx: Executor,
  userId: string,
  { currentPassword, newPassword, keepSessionToken, now = new Date() }: OwnPasswordChange,
): Promise<"changed" | "wrongPassword"> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`password:${userId}`}))`);
  const [user] = await tx.select().from(users).where(eq(users.id, userId));
  if (!user?.isActive) throw new UserRuleError("forbidden");
  if ((await recentFailures(tx, userId, now)) >= PASSWORD_CHANGE_LIMIT.maxFailures) {
    throw new UserRuleError("tooManyAttempts");
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    await recordAudit(tx, {
      actorId: userId,
      action: "user.password_change_failed",
      entityType: "user",
      entityId: userId,
    });
    return "wrongPassword";
  }
  assertStrong(newPassword);
  if (newPassword === currentPassword) throw new UserRuleError("unchanged");

  await tx
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: now })
    .where(eq(users.id, userId));
  await tx
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.tokenHash, hashSessionToken(keepSessionToken)),
      ),
    );
  await tx.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
  await recordAudit(tx, {
    actorId: userId,
    action: "user.password_changed",
    entityType: "user",
    entityId: userId,
  });
  return "changed";
}
