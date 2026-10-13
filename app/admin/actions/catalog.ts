"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import type { Executor } from "@/db/connection";
import {
  brandInput,
  categoryInput,
  productInput,
  translationsFromForm,
} from "@/lib/admin/schemas";
import { fieldErrors, formValues, type FormState } from "@/lib/admin/form-state";
import { CATALOG_TAG } from "@/lib/server/catalog";
import {
  DuplicateSlugError,
  RecordNotFoundError,
  VersionConflictError,
  addProductImage,
  removeProductImage,
  saveBrand,
  saveCategory,
  saveProduct,
  setBrandHero,
  setCategoryTile,
  type SaveResult,
} from "@/lib/server/catalog/admin";
import { ForbiddenError, requirePermission } from "@/lib/server/auth/current";
import { MediaRejectedError, storeImage } from "@/lib/server/media/store";
import type { MediaKind } from "@/lib/server/media/naming";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "storage/media";

// ── Form parsing ─────────────────────────────────────────────────────────────

const text = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : "";
};
/** Digits only; anything else becomes NaN so validation fails instead of guessing. */
const int = (fd: FormData, key: string) => {
  const value = text(fd, key).trim();
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
};
const optionalInt = (fd: FormData, key: string) =>
  text(fd, key).trim() === "" ? null : int(fd, key);
const optionalText = (fd: FormData, key: string) => text(fd, key).trim() || null;
const checked = (fd: FormData, key: string) => fd.get(key) === "on";
const recordId = (fd: FormData) => z.uuid().safeParse(text(fd, "id")).data ?? null;
const idempotencyKey = (fd: FormData) =>
  z.uuid().safeParse(text(fd, "idempotencyKey")).data;

// ── Shared execution ─────────────────────────────────────────────────────────

/**
 * Authorises, runs the change in one transaction and refreshes the public
 * cache. Known failures become form errors; anything else propagates.
 */
async function execute(
  fd: FormData,
  change: (tx: Executor, actorId: string) => Promise<SaveResult>,
): Promise<{ result: SaveResult } | { state: FormState }> {
  const values = formValues(fd);
  try {
    const actor = await requirePermission("catalog:write");
    // One transaction: entity row, revision and audit event commit or roll back together.
    const result = await db.transaction((tx) => change(tx, actor.id));
    updateTag(CATALOG_TAG);
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

async function saveAndRespond(
  fd: FormData,
  basePath: string,
  change: (tx: Executor, actorId: string, id: string | null) => Promise<SaveResult>,
): Promise<FormState> {
  const id = recordId(fd);
  const outcome = await execute(fd, (tx, actorId) => change(tx, actorId, id));
  if ("state" in outcome) return outcome.state;
  // New records continue on their edit page; edits re-render with a fresh version.
  redirect(`${basePath}/${outcome.result.id}?saved=${outcome.result.version}`);
}

// ── Brands & categories ──────────────────────────────────────────────────────

export async function saveBrandAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  return saveAndRespond(fd, "/admin/brands", (tx, actorId, id) =>
    saveBrand(
      tx,
      actorId,
      id,
      brandInput.parse({
        slug: text(fd, "slug"),
        name: text(fd, "name"),
        description: translationsFromForm(fd, "description"),
        sortOrder: int(fd, "sortOrder"),
        isVisible: checked(fd, "isVisible"),
        expectedVersion: int(fd, "expectedVersion"),
      }),
      { idempotencyKey: idempotencyKey(fd) },
    ),
  );
}

export async function saveCategoryAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  return saveAndRespond(fd, "/admin/categories", (tx, actorId, id) =>
    saveCategory(
      tx,
      actorId,
      id,
      categoryInput.parse({
        slug: text(fd, "slug"),
        name: translationsFromForm(fd, "name"),
        sortOrder: int(fd, "sortOrder"),
        isVisible: checked(fd, "isVisible"),
        expectedVersion: int(fd, "expectedVersion"),
      }),
      { idempotencyKey: idempotencyKey(fd) },
    ),
  );
}

// ── Products ─────────────────────────────────────────────────────────────────

export async function saveProductAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  return saveAndRespond(fd, "/admin/products", (tx, actorId, id) =>
    saveProduct(
      tx,
      actorId,
      id,
      productInput.parse({
        slug: text(fd, "slug"),
        brandId: text(fd, "brandId"),
        categoryId: text(fd, "categoryId"),
        model: text(fd, "model"),
        reference: optionalText(fd, "reference"),
        year: optionalInt(fd, "year"),
        condition: text(fd, "condition"),
        setItems: fd.getAll("setItems").filter((v): v is string => typeof v === "string"),
        material: translationsFromForm(fd, "material"),
        dimensions: optionalText(fd, "dimensions"),
        description: translationsFromForm(fd, "description"),
        priceEur: optionalInt(fd, "priceEur"),
        status: text(fd, "status"),
        sortOrder: int(fd, "sortOrder"),
        isVisible: checked(fd, "isVisible"),
        addedAt: text(fd, "addedAt"),
        expectedVersion: int(fd, "expectedVersion"),
      }),
      { idempotencyKey: idempotencyKey(fd) },
    ),
  );
}

// ── Images ───────────────────────────────────────────────────────────────────

const imageTarget = z.object({
  target: z.enum(["brand", "category", "product"]),
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const KIND: Record<"brand" | "category" | "product", MediaKind> = {
  brand: "brand",
  category: "category",
  product: "product",
};
const EDIT_PATH = {
  brand: "/admin/brands",
  category: "/admin/categories",
  product: "/admin/products",
} as const;

/** Uploads a new image version and attaches it; the previous file stays in storage. */
export async function uploadImageAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const file = fd.get("image");
  const parsed = imageTarget.safeParse({
    target: text(fd, "target"),
    id: text(fd, "id"),
    slug: text(fd, "slug"),
  });
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    return { status: "error", error: "upload", values: formValues(fd) };
  }
  const { target, id, slug } = parsed.data;
  const alt = translationsFromForm(fd, "alt");
  const outcome = await execute(fd, async (tx, actorId) => {
    const media = await storeImage(tx, MEDIA_ROOT, {
      input: Buffer.from(await file.arrayBuffer()),
      kind: KIND[target],
      entitySlug: slug,
      alt: alt.de ? alt : { de: slug },
      createdBy: actorId,
    });
    if (target === "brand") return setBrandHero(tx, actorId, id, media.id);
    if (target === "category") return setCategoryTile(tx, actorId, id, media.id);
    return addProductImage(tx, actorId, id, media.id);
  });
  if ("state" in outcome) return outcome.state;
  redirect(`${EDIT_PATH[target]}/${id}?saved=${outcome.result.version}`);
}

export async function removeProductImageAction(fd: FormData): Promise<void> {
  const productId = z.uuid().parse(text(fd, "productId"));
  const mediaId = z.uuid().parse(text(fd, "mediaId"));
  const outcome = await execute(fd, (tx, actorId) =>
    removeProductImage(tx, actorId, productId, mediaId),
  );
  if ("result" in outcome)
    redirect(`/admin/products/${productId}?saved=${outcome.result.version}`);
}
