import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { can, type Permission } from "./permissions";
import { validateSession, type SessionUser } from "./service";

/** `__Host-` (Secure, host-only, path=/) in production; plain name for http://localhost dev. */
const secureCookies = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = secureCookies ? "__Host-mv_session" : "mv_session";
/** Marks a browser that signed in before (see trusted devices in auth/service.ts). */
export const DEVICE_COOKIE = secureCookies ? "__Host-mv_device" : "mv_device";

/** The signed-in admin user for this request, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? validateSession(db, token) : null;
}

/** For admin pages: redirects to the login page when nobody is signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

/** For Server Actions: every mutation re-checks the session and permission on the server. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}
