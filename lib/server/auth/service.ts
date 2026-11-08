import { and, count, eq, gt, lt, lte, sql } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { loginAttempts, sessions, trustedDevices, users } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import type { Role } from "./permissions";
import { generateSessionToken, hashSessionToken } from "./token";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/**
 * Failed logins per e-mail *and* address within the window lock that pair only,
 * so an attacker elsewhere cannot lock the owner out. Each address also has a
 * global budget across all e-mails (credential stuffing).
 */
export const LOGIN_LOCKOUT = {
  maxFailures: 5,
  maxFailuresPerIp: 20,
  /** Upper bound across all addresses (forwarded addresses can be spoofed). */
  maxFailuresPerEmail: 50,
  windowMs: 15 * 60 * 1000,
} as const;
/**
 * Attempts hold an e-mail and an address, so they are not kept forever: seven
 * days leaves time to look into an incident and is far above the lockout window.
 */
export const LOGIN_ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

// Verifying against a fixed hash when the user does not exist keeps response
// times similar, so timing does not reveal which e-mails have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () =>
  (dummyHash ??= hashPassword("timing-equaliser-not-a-password"));

export async function createUser(
  db: Executor,
  input: NewUser,
  actorId: string | null = null,
): Promise<SessionUser> {
  const problems = passwordProblems(input.password);
  if (problems.length) throw new Error(`Weak password: ${problems.join(", ")}`);

  const [row] = await db
    .insert(users)
    .values({
      email: normaliseEmail(input.email),
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  if (!row) throw new Error("User insert returned no row");

  await recordAudit(db, {
    actorId,
    action: "user.created",
    entityType: "user",
    entityId: row.id,
    details: { email: row.email, role: row.role },
  });
  return row;
}

export type AuthResult =
  | { ok: true; user: SessionUser; deviceToken: string }
  | { ok: false; reason: "invalid" | "locked" };

export const TRUSTED_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Attempt buckets of trusted devices are prefixed so they never count against address limits. */
const DEVICE_BUCKET = "device:";

async function trustedDeviceOf(
  db: Executor,
  userId: string | undefined,
  token: string | undefined,
  now: Date,
) {
  if (!userId || !token) return null;
  const tokenHash = hashSessionToken(token);
  const [device] = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.tokenHash, tokenHash),
        eq(trustedDevices.userId, userId),
        gt(trustedDevices.expiresAt, now),
      ),
    );
  return device ? tokenHash : null;
}

/**
 * Checks credentials with layered throttling:
 * - per (e-mail, bucket): 5 failures / 15 min — the bucket is the trusted device or the client address;
 * - per address: 20 failures / 15 min (credential stuffing);
 * - per e-mail across addresses: 50 / 15 min (addresses can be spoofed) — not applied to trusted devices,
 *   so nobody can lock the owner out of a browser that has signed in before.
 * The limit check and the attempt record happen in one short transaction under a per-e-mail advisory
 * lock (parallel requests cannot slip through); the slow password hash runs without holding a connection.
 */
export async function authenticate(
  db: Executor,
  {
    email,
    password,
    ip = "unknown",
    deviceToken,
    now = new Date(),
  }: { email: string; password: string; ip?: string; deviceToken?: string; now?: Date },
): Promise<AuthResult> {
  const normalised = normaliseEmail(email);
  const windowStart = new Date(now.getTime() - LOGIN_LOCKOUT.windowMs);
  const recentFailures = and(
    eq(loginAttempts.succeeded, false),
    gt(loginAttempts.createdAt, windowStart),
  );

  const gate = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalised}))`);
    const [user] = await tx.select().from(users).where(eq(users.email, normalised));
    const device = await trustedDeviceOf(tx, user?.id, deviceToken, now);
    const bucket = device
      ? `${DEVICE_BUCKET}${device.slice(0, 32)}`
      : ip.slice(0, 64) || "unknown";

    const [[pair], [perIp], [perEmail]] = await Promise.all([
      tx
        .select({ n: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, normalised),
            eq(loginAttempts.ip, bucket),
            recentFailures,
          ),
        ),
      tx
        .select({ n: count() })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ip, bucket), recentFailures)),
      tx
        .select({ n: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, normalised),
            sql`${loginAttempts.ip} NOT LIKE ${DEVICE_BUCKET + "%"}`,
            recentFailures,
          ),
        ),
    ]);
    const locked =
      (pair?.n ?? 0) >= LOGIN_LOCKOUT.maxFailures ||
      (!device && (perIp?.n ?? 0) >= LOGIN_LOCKOUT.maxFailuresPerIp) ||
      (!device && (perEmail?.n ?? 0) >= LOGIN_LOCKOUT.maxFailuresPerEmail);
    // Attempts made while locked are not recorded, so they cannot extend the lock.
    if (locked) return { locked: true as const };

    // Recorded as a failure up front; flipped to success below if the password matches.
    const [attempt] = await tx
      .insert(loginAttempts)
      .values({ email: normalised, ip: bucket, succeeded: false, createdAt: now })
      .returning({ id: loginAttempts.id });
    return { locked: false as const, user, device, attemptId: attempt!.id };
  });
  if (gate.locked) return { ok: false, reason: "locked" };

  const { user } = gate;
  const valid = await verifyPassword(
    user?.passwordHash ?? (await getDummyHash()),
    password,
  );
  if (!user || !user.isActive || !valid) return { ok: false, reason: "invalid" };

  return db.transaction(async (tx) => {
    await tx
      .update(loginAttempts)
      .set({ succeeded: true })
      .where(eq(loginAttempts.id, gate.attemptId));
    let token = deviceToken ?? "";
    if (!gate.device) {
      token = generateSessionToken();
      await tx.insert(trustedDevices).values({
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS),
        createdAt: now,
      });
    }
    await recordAudit(tx, {
      actorId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
    });
    return {
      ok: true as const,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      deviceToken: token,
    };
  });
}

/** The account was deactivated between checking the password and starting the session. */
export class InactiveAccountError extends Error {
  override readonly name = "InactiveAccountError";
}

export async function createSession(
  db: Executor,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.transaction(async (tx) => {
    // The row lock orders this against a deactivation (see setUserActive): either
    // it has committed and is seen here, or it waits and then deletes this session.
    // It is the only lock taken here, so it cannot be part of a deadlock.
    const [user] = await tx
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user?.isActive) throw new InactiveAccountError();
    await tx
      .insert(sessions)
      .values({ tokenHash: hashSessionToken(token), userId, expiresAt, createdAt: now });
  });
  return { token, expiresAt };
}

/** Returns the session's user, or null for unknown, expired or deactivated sessions (fail-closed). */
export async function validateSession(
  db: Executor,
  token: string,
  now = new Date(),
): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  if (!row.user.isActive) return null;
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
  };
}

export async function deleteSession(db: Executor, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function deleteUserSessions(db: Executor, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Deletes expired sessions and trusted devices and old login attempts; returns the row count. */
export async function purgeExpiredAuthData(
  db: Executor,
  now = new Date(),
): Promise<number> {
  const removedSessions = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, now))
    .returning({ id: sessions.tokenHash });
  const removedDevices = await db
    .delete(trustedDevices)
    .where(lte(trustedDevices.expiresAt, now))
    .returning({ id: trustedDevices.tokenHash });
  const removedAttempts = await db
    .delete(loginAttempts)
    .where(
      lt(loginAttempts.createdAt, new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_MS)),
    )
    .returning({ id: loginAttempts.id });
  return removedSessions.length + removedDevices.length + removedAttempts.length;
}
