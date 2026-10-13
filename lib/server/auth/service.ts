import { and, count, eq, gt } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { loginAttempts, sessions, users } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";
import { hashPassword, passwordProblems, verifyPassword } from "./password";
import type { Role } from "./permissions";
import { generateSessionToken, hashSessionToken } from "./token";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const LOGIN_LOCKOUT = { maxFailures: 5, windowMs: 15 * 60 * 1000 } as const;

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
  { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "locked" };

export async function authenticate(
  db: Executor,
  { email, password, now = new Date() }: { email: string; password: string; now?: Date },
): Promise<AuthResult> {
  const normalised = normaliseEmail(email);
  const windowStart = new Date(now.getTime() - LOGIN_LOCKOUT.windowMs);

  const [failures] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, normalised),
        eq(loginAttempts.succeeded, false),
        gt(loginAttempts.createdAt, windowStart),
      ),
    );
  if ((failures?.n ?? 0) >= LOGIN_LOCKOUT.maxFailures) {
    await db
      .insert(loginAttempts)
      .values({ email: normalised, succeeded: false, createdAt: now });
    return { ok: false, reason: "locked" };
  }

  const [user] = await db.select().from(users).where(eq(users.email, normalised));
  const valid = await verifyPassword(
    user?.passwordHash ?? (await getDummyHash()),
    password,
  );
  const succeeded = Boolean(user && user.isActive && valid);

  await db.insert(loginAttempts).values({ email: normalised, succeeded, createdAt: now });
  if (!succeeded || !user) return { ok: false, reason: "invalid" };

  await recordAudit(db, {
    actorId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function createSession(
  db: Executor,
  userId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db
    .insert(sessions)
    .values({ tokenHash: hashSessionToken(token), userId, expiresAt, createdAt: now });
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
