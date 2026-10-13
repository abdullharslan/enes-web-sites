"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { ROLES } from "@/lib/server/auth/permissions";
import { createUser, deleteUserSessions } from "@/lib/server/auth/service";
import { passwordProblems } from "@/lib/server/auth/password";

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
      error: "forbidden" | "invalid" | "weakPassword" | "duplicate" | "self";
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

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()));
  if (existing) return { status: "error", error: "duplicate", values };

  await db.transaction((tx) => createUser(tx, parsed.data, actor.id));
  revalidatePath("/admin/users");
  return { status: "ok" };
}

const toggleSchema = z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) });

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const actor = await guard();
  if ("status" in actor) return;
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.userId === actor.id) return;

  const active = parsed.data.active === "true";
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));
    if (!active) await deleteUserSessions(tx, parsed.data.userId);
    await recordAudit(tx, {
      actorId: actor.id,
      action: active ? "user.activated" : "user.deactivated",
      entityType: "user",
      entityId: parsed.data.userId,
    });
  });
  revalidatePath("/admin/users");
}
