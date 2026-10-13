"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { SESSION_COOKIE } from "@/lib/server/auth/current";
import { recordAudit } from "@/lib/server/audit";
import {
  authenticate,
  createSession,
  deleteSession,
  validateSession,
} from "@/lib/server/auth/service";

export interface LoginState {
  error?: "invalid" | "locked";
}

const credentials = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  const result = await authenticate(db, parsed.data);
  if (!result.ok) return { error: result.reason };

  const { token, expiresAt } = await createSession(db, result.user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await validateSession(db, token);
    await deleteSession(db, token);
    if (user)
      await recordAudit(db, {
        actorId: user.id,
        action: "auth.logout",
        entityType: "user",
        entityId: user.id,
      });
  }
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
