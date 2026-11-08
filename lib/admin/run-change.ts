import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connection";
import { altInput, translationsFromForm } from "@/lib/admin/schemas";
import { T } from "@/lib/admin/text";
import { fieldErrors, formValues, type FormState } from "@/lib/admin/form-state";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import type { Permission } from "@/lib/server/auth/permissions";
import { concealFailure } from "@/lib/server/conceal-failure";
import {
  MediaRejectedError,
  prepareImage,
  type PreparedImage,
} from "@/lib/server/media/store";
import {
  DuplicateSlugError,
  NoChangeError,
  RecordNotFoundError,
  VersionConflictError,
  type SaveResult,
} from "@/lib/server/versioning";

export type ChangeOutcome = { result: SaveResult } | { state: FormState };

/** Postgres unique violation (e.g. two uploads racing for the same version, a reused idempotency key). */
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "23505";

/**
 * The single path for every admin mutation: authorise (all listed permissions),
 * run the change in one transaction, refresh the public cache tags, and map
 * known failures to form errors. Anything unexpected is concealed.
 */
export async function runAdminChange(
  fd: FormData,
  permissions: readonly Permission[],
  tags: readonly string[],
  change: (tx: Executor, actorId: string) => Promise<SaveResult>,
): Promise<ChangeOutcome> {
  const values = formValues(fd);
  try {
    let actorId = "";
    for (const permission of permissions)
      actorId = (await requirePermission(permission)).id;
    const result = await db.transaction((tx) => change(tx, actorId));
    for (const tag of tags) updateTag(tag);
    return { result };
  } catch (error) {
    if (error instanceof ForbiddenError)
      return { state: { status: "error", error: "forbidden" } };
    if (error instanceof z.ZodError) {
      return {
        state: {
          status: "error",
          error: "invalid",
          fieldErrors: fieldErrors(error),
          values,
        },
      };
    }
    if (error instanceof VersionConflictError || isUniqueViolation(error)) {
      return { state: { status: "error", error: "conflict", values } };
    }
    if (error instanceof DuplicateSlugError) {
      return {
        state: {
          status: "error",
          error: "duplicateSlug",
          fieldErrors: { slug: "duplicate" },
          values,
        },
      };
    }
    if (error instanceof RecordNotFoundError)
      return { state: { status: "error", error: "notFound" } };
    if (error instanceof NoChangeError)
      return { state: { status: "error", error: "noChange" } };
    if (error instanceof MediaRejectedError)
      return { state: { status: "error", error: "upload", values } };
    concealFailure("Admin change failed", error);
  }
}

/**
 * An outdated page is brought up to date in place (open edits are kept), so
 * the next attempt is judged against what is stored now, not against the
 * version that was just refused.
 */
export function refreshOnConflict(path: string, state: FormState): FormState {
  if (state.status === "error" && state.error === "conflict") revalidatePath(path);
  return state;
}

/**
 * For changes made next to an open edit form (image upload, move, remove):
 * no navigation — Next opens a new page instance for a new URL, which would
 * throw away unsaved edits in that form. The page is refreshed in place and
 * the result is reported in the form that made the change.
 *
 * Limit: if another admin changed the fields meanwhile, this refresh delivers
 * their values and an edit form without a save error remounts on them, so its
 * unsaved typing is lost in the browser. No stored data is lost: the next save
 * is still judged against the current version.
 */
export function refreshInPlace(path: string, outcome: ChangeOutcome): FormState {
  if ("state" in outcome) return refreshOnConflict(path, outcome.state);
  if (outcome.result.unchanged) return { status: "ok", message: T.fields.unchanged };
  revalidatePath(path);
  return {
    status: "ok",
    message: T.fields.savedVersion.replace("{version}", String(outcome.result.version)),
  };
}

export interface PreparedUpload {
  prepared: PreparedImage;
  alt: Record<string, string>;
}

/**
 * After authorising, validates and re-encodes the uploaded file *before* any transaction, and
 * validates its alt text. Returns a form error state when either is invalid.
 */
export async function prepareUpload(
  fd: FormData,
  permissions: readonly Permission[],
): Promise<PreparedUpload | FormState> {
  // Authorise first: decoding an image is expensive and must not be reachable anonymously.
  try {
    for (const permission of permissions) await requirePermission(permission);
  } catch (error) {
    if (error instanceof ForbiddenError) return { status: "error", error: "forbidden" };
    concealFailure("Admin upload failed", error);
  }
  const file = fd.get("image");
  const alt = altInput.safeParse(translationsFromForm(fd, "alt"));
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", error: "upload", values: formValues(fd) };
  if (!alt.success) {
    return {
      status: "error",
      error: "invalid",
      fieldErrors: fieldErrors(alt.error),
      values: formValues(fd),
    };
  }
  try {
    return {
      prepared: await prepareImage(Buffer.from(await file.arrayBuffer())),
      alt: alt.data,
    };
  } catch (error) {
    if (error instanceof MediaRejectedError)
      return { status: "error", error: "upload", values: formValues(fd) };
    concealFailure("Admin upload failed", error);
  }
}

export const isFormState = (value: PreparedUpload | FormState): value is FormState =>
  "status" in value;
