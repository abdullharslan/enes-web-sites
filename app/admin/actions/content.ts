"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connection";
import { fieldErrors, formValues, type FormState } from "@/lib/admin/form-state";
import { journalInput, translationsFromForm } from "@/lib/admin/schemas";
import {
  CONTENT_BLOCKS,
  blockImageSlug,
  isContentKey,
  isTranslated,
  type ContentKey,
  type FieldDef,
} from "@/lib/content/blocks";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { CATALOG_TAG } from "@/lib/server/catalog";
import { CONTENT_TAG } from "@/lib/server/content";
import {
  saveContentBlock,
  saveJournalEntry,
  setContentImage,
  setJournalImage,
} from "@/lib/server/content/admin";
import { restoreAny } from "@/lib/server/history";
import { MediaRejectedError, storeImage } from "@/lib/server/media/store";
import {
  DuplicateSlugError,
  RecordNotFoundError,
  VersionConflictError,
  type EditableEntity,
  type SaveResult,
} from "@/lib/server/versioning";
import type { Permission } from "@/lib/server/auth/permissions";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "storage/media";

const text = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};
const int = (fd: FormData, key: string) =>
  /^\d+$/.test(text(fd, key)) ? Number(text(fd, key)) : Number.NaN;
const uuidOrNull = (value: string) => z.uuid().safeParse(value).data ?? null;

/** Same contract as the catalog actions: authorise → validate → one transaction → refresh cache. */
async function execute(
  fd: FormData,
  permission: Permission,
  change: (tx: Executor, actorId: string) => Promise<SaveResult>,
): Promise<{ result: SaveResult } | { state: FormState }> {
  const values = formValues(fd);
  try {
    const actor = await requirePermission(permission);
    const result = await db.transaction((tx) => change(tx, actor.id));
    updateTag(CONTENT_TAG);
    return { result };
  } catch (error) {
    if (error instanceof ForbiddenError)
      return { state: { status: "error", error: "forbidden" } };
    if (error instanceof z.ZodError)
      return {
        state: {
          status: "error",
          error: "invalid",
          fieldErrors: fieldErrors(error),
          values,
        },
      };
    if (error instanceof VersionConflictError)
      return { state: { status: "error", error: "conflict", values } };
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

// ── Content blocks ───────────────────────────────────────────────────────────

/** Reads a block's fields from the form exactly as its definition describes them. */
function blockFromForm(key: ContentKey, fd: FormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of CONTENT_BLOCKS[key].fields as readonly FieldDef[]) {
    if (isTranslated(field.kind)) data[field.key] = translationsFromForm(fd, field.key);
    else if (field.kind === "image") data[field.key] = uuidOrNull(text(fd, field.key));
    else data[field.key] = text(fd, field.key).trim();
  }
  return data;
}

export async function saveBlockAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const key = text(fd, "key");
  if (!isContentKey(key)) return { status: "error", error: "notFound" };
  const outcome = await execute(fd, "content:write", (tx, actorId) =>
    saveContentBlock(
      tx,
      actorId,
      key,
      { ...blockFromForm(key, fd), expectedVersion: int(fd, "expectedVersion") },
      { idempotencyKey: uuidOrNull(text(fd, "idempotencyKey")) ?? undefined },
    ),
  );
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/home/${key}?saved=${outcome.result.version}`);
}

export async function uploadBlockImageAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const key = text(fd, "key");
  const field = text(fd, "field");
  const file = fd.get("image");
  if (!isContentKey(key) || !(file instanceof File) || file.size === 0) {
    return { status: "error", error: "upload", values: formValues(fd) };
  }
  const alt = translationsFromForm(fd, "alt");
  const outcome = await execute(fd, "content:write", async (tx, actorId) => {
    const media = await storeImage(tx, MEDIA_ROOT, {
      input: Buffer.from(await file.arrayBuffer()),
      kind: "home",
      entitySlug: blockImageSlug(key),
      alt: alt.de ? alt : { de: CONTENT_BLOCKS[key].label },
      createdBy: actorId,
    });
    return setContentImage(tx, actorId, key, field, media.id);
  });
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/home/${key}?saved=${outcome.result.version}`);
}

// ── Journal ──────────────────────────────────────────────────────────────────

export async function saveJournalAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = uuidOrNull(text(fd, "id"));
  const outcome = await execute(fd, "content:write", (tx, actorId) =>
    saveJournalEntry(
      tx,
      actorId,
      id,
      journalInput.parse({
        slug: text(fd, "slug"),
        publishedAt: text(fd, "publishedAt"),
        title: translationsFromForm(fd, "title"),
        excerpt: translationsFromForm(fd, "excerpt"),
        isVisible: fd.get("isVisible") === "on",
        expectedVersion: int(fd, "expectedVersion"),
      }),
      { idempotencyKey: uuidOrNull(text(fd, "idempotencyKey")) ?? undefined },
    ),
  );
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/journal/${outcome.result.id}?saved=${outcome.result.version}`);
}

export async function uploadJournalImageAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = uuidOrNull(text(fd, "id"));
  const slug = text(fd, "slug");
  const file = fd.get("image");
  if (
    !id ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !(file instanceof File) ||
    file.size === 0
  ) {
    return { status: "error", error: "upload", values: formValues(fd) };
  }
  const alt = translationsFromForm(fd, "alt");
  const outcome = await execute(fd, "content:write", async (tx, actorId) => {
    const media = await storeImage(tx, MEDIA_ROOT, {
      input: Buffer.from(await file.arrayBuffer()),
      kind: "journal",
      entitySlug: slug,
      alt: alt.de ? alt : { de: slug },
      createdBy: actorId,
    });
    return setJournalImage(tx, actorId, id, media.id);
  });
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/journal/${id}?saved=${outcome.result.version}`);
}

// ── History (all entities) ───────────────────────────────────────────────────

const RESTORE_PERMISSION: Record<EditableEntity, Permission> = {
  brand: "catalog:write",
  category: "catalog:write",
  product: "catalog:write",
  content: "content:write",
  journal: "content:write",
};

const restoreTarget = z.object({
  entityType: z.enum(["brand", "category", "product", "content", "journal"]),
  entityId: z.string().min(1).max(100),
  version: z.coerce.number().int().positive(),
});

export async function restoreAction(fd: FormData): Promise<void> {
  const { entityType, entityId, version } = restoreTarget.parse({
    entityType: text(fd, "entityType"),
    entityId: text(fd, "entityId"),
    version: text(fd, "version"),
  });
  const outcome = await execute(fd, RESTORE_PERMISSION[entityType], (tx, actorId) =>
    restoreAny(tx, actorId, entityType, entityId, version),
  );
  if ("result" in outcome) {
    if (RESTORE_PERMISSION[entityType] === "catalog:write") updateTag(CATALOG_TAG);
    redirect(
      `/admin/history/${entityType}/${encodeURIComponent(entityId)}?restored=${version}`,
    );
  }
}
