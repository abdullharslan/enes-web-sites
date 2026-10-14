"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { INQUIRY_STATUSES } from "@/lib/inquiries/policy";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { PRIVATE_ROOT, removeInquiryFiles } from "@/lib/server/inquiries/photos";
import { deleteInquiry, setInquiryStatus } from "@/lib/server/inquiries/service";

export type InquiryActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error: "forbidden" | "invalid" | "notFound" };

async function guard(): Promise<{ id: string } | null> {
  try {
    return await requirePermission("inquiries:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
}

const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(INQUIRY_STATUSES),
});

export async function setInquiryStatusAction(
  _prev: InquiryActionState,
  fd: FormData,
): Promise<InquiryActionState> {
  const actor = await guard();
  if (!actor) return { status: "error", error: "forbidden" };
  const parsed = statusInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { id, status } = parsed.data;
  const found = await db.transaction((tx) => setInquiryStatus(tx, actor.id, id, status));
  if (!found) return { status: "error", error: "notFound" };
  revalidatePath("/admin", "layout");
  return { status: "ok" };
}

const deleteInput = z.object({ id: z.uuid(), confirm: z.literal("on") });

/** Permanent deletion (e.g. an erasure request); requires an explicit confirmation box. */
export async function deleteInquiryAction(fd: FormData): Promise<void> {
  const actor = await guard();
  if (!actor) return;
  const parsed = deleteInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return;
  const { id } = parsed.data;
  const deleted = await db.transaction((tx) => deleteInquiry(tx, actor.id, id));
  // Files go after the commit; a leftover file without a row is never served.
  if (deleted) await removeInquiryFiles(PRIVATE_ROOT, [id]);
  revalidatePath("/admin", "layout");
  redirect("/admin/inquiries?deleted=1");
}
