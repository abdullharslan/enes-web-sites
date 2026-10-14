"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { DEVICE_COOKIE, SESSION_COOKIE } from "@/lib/server/auth/current";
import { recordAudit } from "@/lib/server/audit";
import { requestAddress } from "@/lib/server/request-address";
import {
  TRUSTED_DEVICE_TTL_MS,
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

  const store = await cookies();
  const ip = await requestAddress();
  const result = await authenticate(db, {
    ...parsed.data,
    ip,
    deviceToken: store.get(DEVICE_COOKIE)?.value,
  });
  if (!result.ok) return { error: result.reason };

  const { token, expiresAt } = await createSession(db, result.user.id);
  const secure = process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    expires: expiresAt,
  });
  store.set(DEVICE_COOKIE, result.deviceToken, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: TRUSTED_DEVICE_TTL_MS / 1000,
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
