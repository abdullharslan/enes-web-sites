"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/admin/form-state";
import { isFormState, prepareUpload, runAdminChange } from "@/lib/admin/run-change";
import { journalInput, translationsFromForm } from "@/lib/admin/schemas";
import {
  CONTENT_BLOCKS,
  blockImageSlug,
  isContentKey,
  isTranslated,
  type ContentKey,
  type FieldDef,
} from "@/lib/content/blocks";
import type { Permission } from "@/lib/server/auth/permissions";
import { CATALOG_TAG } from "@/lib/server/catalog";
import { CONTENT_TAG } from "@/lib/server/content";
import {
  journalSlug,
  saveContentBlock,
  saveJournalEntry,
  setContentImage,
  setJournalImage,
} from "@/lib/server/content/admin";
import { restoreAny } from "@/lib/server/history";
import { storeImage } from "@/lib/server/media/store";
import type { EditableEntity } from "@/lib/server/versioning";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "storage/media";
const TAGS = [CONTENT_TAG] as const;
const UPLOAD_PERMISSIONS = ["content:write", "media:write"] as const;

const text = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};
const int = (fd: FormData, key: string) =>
  /^\d+$/.test(text(fd, key)) ? Number(text(fd, key)) : Number.NaN;
const uuid = (value: string) => z.uuid().safeParse(value).data ?? null;
const idempotencyKey = (fd: FormData) => uuid(text(fd, "idempotencyKey")) ?? undefined;

// ── Content blocks ───────────────────────────────────────────────────────────

/** Reads a block's fields from the form exactly as its definition describes them. */
function blockFromForm(key: ContentKey, fd: FormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of CONTENT_BLOCKS[key].fields as readonly FieldDef[]) {
    if (isTranslated(field.kind)) data[field.key] = translationsFromForm(fd, field.key);
    else if (field.kind === "image") data[field.key] = uuid(text(fd, field.key));
    else if (field.kind === "toggle") data[field.key] = fd.get(field.key) === "on";
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
  const outcome = await runAdminChange(fd, ["content:write"], TAGS, (tx, actorId) =>
    saveContentBlock(
      tx,
      actorId,
      key,
      { ...blockFromForm(key, fd), expectedVersion: int(fd, "expectedVersion") },
      { idempotencyKey: idempotencyKey(fd) },
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
  if (!isContentKey(key)) return { status: "error", error: "upload" };
  const upload = await prepareUpload(fd, UPLOAD_PERMISSIONS);
  if (isFormState(upload)) return upload;

  const outcome = await runAdminChange(
    fd,
    ["content:write", "media:write"],
    TAGS,
    async (tx, actorId) => {
      const media = await storeImage(tx, MEDIA_ROOT, {
        prepared: upload.prepared,
        kind: "home",
        entitySlug: blockImageSlug(key),
        alt: upload.alt.de ? upload.alt : { de: CONTENT_BLOCKS[key].label },
        createdBy: actorId,
      });
      return setContentImage(tx, actorId, key, text(fd, "field"), media.id);
    },
  );
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/home/${key}?saved=${outcome.result.version}`);
}

// ── Journal ──────────────────────────────────────────────────────────────────

export async function saveJournalAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = uuid(text(fd, "id"));
  const outcome = await runAdminChange(fd, ["content:write"], TAGS, (tx, actorId) =>
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
      { idempotencyKey: idempotencyKey(fd) },
    ),
  );
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/journal/${outcome.result.id}?saved=${outcome.result.version}`);
}

export async function uploadJournalImageAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = uuid(text(fd, "id"));
  if (!id) return { status: "error", error: "upload" };
  const upload = await prepareUpload(fd, UPLOAD_PERMISSIONS);
  if (isFormState(upload)) return upload;

  const outcome = await runAdminChange(
    fd,
    ["content:write", "media:write"],
    TAGS,
    async (tx, actorId) => {
      const slug = await journalSlug(tx, id);
      const media = await storeImage(tx, MEDIA_ROOT, {
        prepared: upload.prepared,
        kind: "journal",
        entitySlug: slug,
        alt: upload.alt.de ? upload.alt : { de: slug },
        createdBy: actorId,
      });
      return setJournalImage(tx, actorId, id, media.id);
    },
  );
  if ("state" in outcome) return outcome.state;
  redirect(`/admin/journal/${id}?saved=${outcome.result.version}`);
}

// ── History (all entities) ───────────────────────────────────────────────────

const RESTORE: Record<EditableEntity, { permission: Permission; tag: string }> = {
  brand: { permission: "catalog:write", tag: CATALOG_TAG },
  category: { permission: "catalog:write", tag: CATALOG_TAG },
  product: { permission: "catalog:write", tag: CATALOG_TAG },
  content: { permission: "content:write", tag: CONTENT_TAG },
  journal: { permission: "content:write", tag: CONTENT_TAG },
};

const restoreTarget = z.object({
  entityType: z.enum(["brand", "category", "product", "content", "journal"]),
  entityId: z.string().min(1).max(100),
  version: z.coerce.number().int().positive(),
});

export async function restoreAction(fd: FormData): Promise<void> {
  const parsed = restoreTarget.safeParse({
    entityType: text(fd, "entityType"),
    entityId: text(fd, "entityId"),
    version: text(fd, "version"),
  });
  if (!parsed.success) return;
  const { entityType, entityId, version } = parsed.data;
  const { permission, tag } = RESTORE[entityType];
  const outcome = await runAdminChange(fd, [permission], [tag], (tx, actorId) =>
    restoreAny(tx, actorId, entityType, entityId, version),
  );
  if ("result" in outcome) {
    redirect(
      `/admin/history/${entityType}/${encodeURIComponent(entityId)}?restored=${version}`,
    );
  }
}
