"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/admin/form-state";
import {
  isFormState,
  prepareUpload,
  refreshInPlace,
  runAdminChange,
} from "@/lib/admin/run-change";
import {
  brandInput,
  categoryInput,
  productInput,
  translationsFromForm,
} from "@/lib/admin/schemas";
import { CATALOG_TAG } from "@/lib/server/catalog";
import {
  addProductImage,
  moveProductImage,
  catalogSlug,
  removeProductImage,
  saveBrand,
  saveCategory,
  saveProduct,
  setBrandHero,
  setCategoryTile,
  type SaveResult,
} from "@/lib/server/catalog/admin";
import type { Executor } from "@/db/connection";
import { storeImage } from "@/lib/server/media/store";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "storage/media";
const TAGS = [CATALOG_TAG] as const;
const UPLOAD_PERMISSIONS = ["catalog:write", "media:write"] as const;

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
const uuid = (value: string) => z.uuid().safeParse(value).data ?? null;
const idempotencyKey = (fd: FormData) => uuid(text(fd, "idempotencyKey")) ?? undefined;

async function saveAndRespond(
  fd: FormData,
  basePath: string,
  change: (tx: Executor, actorId: string, id: string | null) => Promise<SaveResult>,
): Promise<FormState> {
  const id = uuid(text(fd, "id"));
  const outcome = await runAdminChange(fd, ["catalog:write"], TAGS, (tx, actorId) =>
    change(tx, actorId, id),
  );
  if ("state" in outcome) return outcome.state;
  // New records continue on their edit page; edits re-render with a fresh version.
  redirect(`${basePath}/${outcome.result.id}?saved=${outcome.result.version}`);
}

// ── Brands, categories, products ─────────────────────────────────────────────

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

const TARGETS = ["brand", "category", "product"] as const;
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
  const target = z.enum(TARGETS).safeParse(text(fd, "target")).data;
  const id = uuid(text(fd, "id"));
  if (!target || !id) return { status: "error", error: "upload" };
  // The version the page showed: an image change based on an outdated list is refused.
  const expected = int(fd, "expectedVersion");

  const upload = await prepareUpload(fd, UPLOAD_PERMISSIONS);
  if (isFormState(upload)) return upload;

  const outcome = await runAdminChange(
    fd,
    ["catalog:write", "media:write"],
    TAGS,
    async (tx, actorId) => {
      const slug = await catalogSlug(tx, target, id);
      const media = await storeImage(tx, MEDIA_ROOT, {
        prepared: upload.prepared,
        kind: target,
        entitySlug: slug,
        alt: upload.alt.de ? upload.alt : { de: slug },
        createdBy: actorId,
      });
      if (target === "brand") return setBrandHero(tx, actorId, id, media.id, expected);
      if (target === "category")
        return setCategoryTile(tx, actorId, id, media.id, expected);
      return addProductImage(tx, actorId, id, media.id, expected);
    },
  );
  return refreshInPlace(`${EDIT_PATH[target]}/${id}`, outcome);
}

const imageOp = z.object({
  productId: z.uuid(),
  mediaId: z.uuid(),
  op: z.enum(["first", "up", "down", "remove"]),
});

/** Cover / up / down / remove for one product image, from the page's version. */
export async function productImageAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const parsed = imageOp.safeParse({
    productId: text(fd, "productId"),
    mediaId: text(fd, "mediaId"),
    op: text(fd, "op"),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { productId, mediaId, op } = parsed.data;
  const expected = int(fd, "expectedVersion");
  const outcome = await runAdminChange(
    fd,
    ["catalog:write", "media:write"],
    TAGS,
    (tx, actorId) =>
      op === "remove"
        ? removeProductImage(tx, actorId, productId, mediaId, expected)
        : moveProductImage(tx, actorId, productId, mediaId, op, expected),
  );
  return refreshInPlace(`/admin/products/${productId}`, outcome);
}
