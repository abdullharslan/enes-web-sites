"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { INQUIRY_STATUSES } from "@/lib/inquiries/policy";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { ErasureNotRecordedError, eraseInquiry } from "@/lib/server/inquiries/erasure";
import { PRIVATE_ROOT } from "@/lib/server/inquiries/photos";
import { setInquiryStatus } from "@/lib/server/inquiries/service";

export type InquiryActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error: "forbidden" | "invalid" | "notFound" | "notRecorded" };

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
export async function deleteInquiryAction(
  _prev: InquiryActionState,
  fd: FormData,
): Promise<InquiryActionState> {
  const actor = await guard();
  if (!actor) return { status: "error", error: "forbidden" };
  const parsed = deleteInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { id } = parsed.data;
  let deleted: boolean;
  try {
    deleted = await eraseInquiry(db, PRIVATE_ROOT, actor.id, id);
  } catch (error) {
    if (error instanceof ErasureNotRecordedError)
      return { status: "error", error: "notRecorded" };
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/inquiries?deleted=${deleted ? "1" : "gone"}`);
}
