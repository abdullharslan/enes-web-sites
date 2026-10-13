import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connection";
import { altInput, translationsFromForm } from "@/lib/admin/schemas";
import { fieldErrors, formValues, type FormState } from "@/lib/admin/form-state";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import type { Permission } from "@/lib/server/auth/permissions";
import {
  MediaRejectedError,
  prepareImage,
  type PreparedImage,
} from "@/lib/server/media/store";
import {
  DuplicateSlugError,
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
 * known failures to form errors. Anything unexpected propagates.
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
    if (error instanceof MediaRejectedError)
      return { state: { status: "error", error: "upload", values } };
    throw error;
  }
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
    throw error;
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
    throw error;
  }
}

export const isFormState = (value: PreparedUpload | FormState): value is FormState =>
  "status" in value;
