"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db/client";
import type { Catalog } from "@/lib/catalog/schema";
import { boundRecord, formDataToRecord, type FormRecord } from "@/lib/forms/compose";
import {
  FIELD_LIMITS,
  createSellSchema,
  inquirySchema,
  validateForm,
} from "@/lib/forms/schemas";
import { HONEYPOT_FIELD, type PublicFormState } from "@/lib/forms/state";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";
import { INQUIRY_KINDS, photoProblem, type InquiryKind } from "@/lib/inquiries/policy";
import { getCatalog } from "@/lib/server/catalog";
import {
  PRIVATE_ROOT,
  hasRoomFor,
  preparePhotos,
  removeInquiryFiles,
  writeInquiryPhotos,
} from "@/lib/server/inquiries/photos";
import { maintainRetention } from "@/lib/server/inquiries/retention";
import {
  hashAddress,
  admitSubmission,
  deriveSubmissionKey,
  recordInquiry,
  type NewInquiry,
  type StoredPhoto,
} from "@/lib/server/inquiries/service";
import { createInflightLimiter } from "@/lib/server/limits";
import { MediaRejectedError, type PreparedImage } from "@/lib/server/media/store";
import { requestAddressBucket } from "@/lib/server/request-address";

const ARRAY_FIELDS = ["setItems"] as const;
/** The visible fields of the public forms: the only ones ever echoed back. */
const ECHO_FIELDS = [
  "name",
  "email",
  "phone",
  "message",
  "brand",
  "category",
  "model",
  "condition",
  "year",
  "askingPrice",
  "setItems",
] as const;

const meta = z.object({
  kind: z.enum(INQUIRY_KINDS),
  submissionKey: z.uuid().optional(),
  productSlug: z.string().max(200).optional(),
});

const field = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
};

const photosOf = (fd: FormData) =>
  fd.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);

const validatePayload = (
  kind: InquiryKind,
  values: Record<string, unknown>,
  catalog: Catalog,
) =>
  kind === "sell"
    ? validateForm(createSellSchema(catalog.categories.map((c) => c.slug)), values)
    : validateForm(inquirySchema, values);

/** The item line stored with a product inquiry; null when the product is sold or not public. */
function inquirableItem(catalog: Catalog, productSlug: string | undefined) {
  const product = catalog.products.find((p) => p.slug === productSlug);
  if (!product || product.status === "sold") return null;
  const brand = catalog.brands.find((b) => b.slug === product.brand)?.name;
  return [brand, product.model, product.reference].filter(Boolean).join(" ");
}

/**
 * Receives every public form (product, contact, consignment). Works with and
 * without JavaScript: the browser posts the form to this action; nothing
 * personal ever goes into a URL.
 */
export async function submitInquiryAction(
  _prev: PublicFormState,
  fd: FormData,
): Promise<PublicFormState> {
  // Validation sees the full input; only a bounded copy of the form's own fields is echoed.
  const input = formDataToRecord(fd, ARRAY_FIELDS);
  const values = boundRecord(input, ECHO_FIELDS, FIELD_LIMITS.message + 1);
  try {
    return await receive(fd, input, values);
  } catch (error) {
    // Visitors get a calm message and the phone number; the cause goes to the server log.
    console.error("Inquiry submission failed", error);
    return { status: "failed", values };
  }
}

async function receive(
  fd: FormData,
  input: FormRecord,
  values: FormRecord,
): Promise<PublicFormState> {
  // Bots get the same answer as people, so they cannot learn to avoid the trap.
  if (field(fd, HONEYPOT_FIELD)) return { status: "sent" };

  const parsedMeta = meta.safeParse({
    kind: field(fd, "kind"),
    submissionKey: field(fd, "submissionKey"),
    productSlug: field(fd, "productSlug"),
  });
  if (!parsedMeta.success) return { status: "failed", values };
  const { kind, submissionKey, productSlug } = parsedMeta.data;
  const localeValue = field(fd, "locale") ?? "";
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const catalog = await getCatalog();
  const validated = validatePayload(kind, input, catalog);
  const photos = kind === "sell" ? photosOf(fd) : [];
  const photoError = photoProblem(photos);
  if (!validated.ok || photoError) {
    const errors = validated.ok ? {} : validated.errors;
    return {
      status: "invalid",
      errors: photoError ? { ...errors, photos: photoError } : errors,
      values,
    };
  }

  const bucket = await requestAddressBucket();
  const addressHash = hashAddress(bucket);
  const withPhotos = photos.length > 0;
  const storedSlug = kind === "product" ? (productSlug ?? null) : null;
  // Without a client key (no JavaScript) the same inquiry still maps to one key.
  const key =
    submissionKey ?? deriveSubmissionKey(addressHash, kind, storedSlug, validated.data);
  // Before any image is decoded: a retry of a stored inquiry is "sent", not "rate limited".
  const admission = await admitSubmission(db, {
    submissionKey: key,
    addressHash,
    withPhotos,
  });
  if (admission === "duplicate") return { status: "sent" };
  if (admission === "rateLimited") return { status: "rateLimited", values };
  // After the duplicate check: a stored inquiry stays "sent" even if the product sold meanwhile.
  const item = kind === "product" ? inquirableItem(catalog, productSlug) : undefined;
  if (item === null) return { status: "unavailable", values };
  const id = randomUUID();
  const inquiry = {
    id,
    kind,
    locale,
    productSlug: storedSlug,
    data: item === undefined ? validated.data : { ...validated.data, item },
    submissionKey: key,
    addressHash,
  };
  if (!withPhotos) return store({ ...inquiry, photos: [] }, values);

  // Parallel uploads would all pass the check above: at most one upload per
  // address and a few overall are processed; the rest are turned away at once.
  const release = photoUploads.tryAcquire(bucket);
  if (!release) return { status: "rateLimited", values };
  try {
    let prepared: PreparedImage[];
    try {
      prepared = await preparePhotos(photos);
    } catch (error) {
      if (!(error instanceof MediaRejectedError)) throw error;
      return { status: "invalid", errors: { photos: "photoInvalid" }, values };
    }
    const bytes = prepared.reduce((sum, image) => sum + image.output.length, 0);
    if (!(await hasRoomFor(PRIVATE_ROOT, bytes))) {
      console.error("Inquiry photos refused: storage almost full");
      return { status: "failed", values };
    }
    let stored: StoredPhoto[];
    try {
      stored = await writeInquiryPhotos(PRIVATE_ROOT, id, prepared);
    } catch (error) {
      await removeQuietly([id]);
      throw error;
    }
    return await store({ ...inquiry, photos: stored }, values);
  } finally {
    release();
  }
}

const photoUploads = createInflightLimiter({ perKey: 1, total: 4 });

/** File cleanup must never turn a stored inquiry into a "failed" answer (the retry would duplicate it). */
const removeQuietly = (ids: string[]) =>
  removeInquiryFiles(PRIVATE_ROOT, ids).catch((error) =>
    console.error("Removing inquiry files failed", error),
  );

async function store(input: NewInquiry, values: FormRecord): Promise<PublicFormState> {
  let outcome: "stored" | "duplicate" | "rateLimited";
  try {
    ({ outcome } = await db.transaction((tx) => recordInquiry(tx, input)));
  } catch (error) {
    await removeQuietly([input.id]);
    throw error;
  }
  if (outcome !== "stored") await removeQuietly([input.id]);
  await maintainRetention(db, PRIVATE_ROOT);
  return outcome === "rateLimited"
    ? { status: "rateLimited", values }
    : { status: "sent" };
}
