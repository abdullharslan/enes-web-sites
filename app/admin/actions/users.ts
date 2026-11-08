"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db/client";
import {
  ForbiddenError,
  SESSION_COOKIE,
  requirePermission,
  requireUser,
} from "@/lib/server/auth/current";
import { ROLES } from "@/lib/server/auth/permissions";
import { passwordProblems } from "@/lib/server/auth/password";
import {
  UserRuleError,
  changeOwnPassword,
  changeUserRole,
  createUserAsOwner,
  resetUserPassword,
  setUserActive,
  type UserRuleCode,
} from "@/lib/server/auth/users";

/** Echoed back on errors so React's post-submit form reset keeps what was typed (never the password). */
export interface UserFormValues {
  name?: string;
  email?: string;
  role?: string;
}

export type UserActionState =
  | { status: "idle" }
  | { status: "ok" }
  | {
      status: "error";
      error: UserRuleCode | "invalid" | "wrongPassword" | "mismatch";
      values?: UserFormValues;
    };

const newUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  role: z.enum(ROLES),
  password: z.string().max(256),
});

async function guard(): Promise<{ id: string } | UserActionState> {
  try {
    return await requirePermission("users:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "error", error: "forbidden" };
    throw error;
  }
}

export async function createUserAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await guard();
  if ("status" in actor) return actor;

  const raw = Object.fromEntries(formData);
  const values: UserFormValues = {
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    role: String(raw.role ?? ""),
  };
  const parsed = newUserSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "invalid", values };
  if (passwordProblems(parsed.data.password).length) {
    return { status: "error", error: "weakPassword", values };
  }

  try {
    await db.transaction((tx) => createUserAsOwner(tx, actor.id, parsed.data));
  } catch (error) {
    const state = asFormError(error);
    return state.status === "error" ? { ...state, values } : state;
  }
  revalidatePath("/admin/users");
  return { status: "ok" };
}

/** Rule violations become form errors; anything else fails loudly. */
function asFormError(error: unknown): UserActionState {
  if (error instanceof UserRuleError) return { status: "error", error: error.code };
  throw error;
}

async function applyRule(change: () => Promise<void>): Promise<UserActionState> {
  try {
    await change();
  } catch (error) {
    return asFormError(error);
  }
  revalidatePath("/admin/users");
  return { status: "ok" };
}

const toggleSchema = z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) });

export async function setUserActiveAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await guard();
  if ("status" in actor) return actor;
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { userId, active } = parsed.data;
  return applyRule(() =>
    db.transaction((tx) => setUserActive(tx, actor.id, userId, active === "true")),
  );
}

const roleSchema = z.object({ userId: z.uuid(), role: z.enum(ROLES) });

export async function changeUserRoleAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await guard();
  if ("status" in actor) return actor;
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { userId, role } = parsed.data;
  return applyRule(() =>
    db.transaction((tx) => changeUserRole(tx, actor.id, userId, role)),
  );
}

const resetSchema = z.object({ userId: z.uuid(), password: z.string().max(256) });

export async function resetUserPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await guard();
  if ("status" in actor) return actor;
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { userId, password } = parsed.data;
  return applyRule(() =>
    db.transaction((tx) => resetUserPassword(tx, actor.id, userId, password)),
  );
}

const ownPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().max(256),
  confirmPassword: z.string().max(256),
});

/** Any signed-in user may change their own password (role-independent). */
export async function changeOwnPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const me = await requireUser();
  const parsed = ownPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) return { status: "error", error: "mismatch" };
  const keepSessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? "";

  try {
    const outcome = await db.transaction((tx) =>
      changeOwnPassword(tx, me.id, { currentPassword, newPassword, keepSessionToken }),
    );
    return outcome === "changed"
      ? { status: "ok" }
      : { status: "error", error: "wrongPassword" };
  } catch (error) {
    return asFormError(error);
  }
}
