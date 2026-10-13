import { z } from "zod";
import { CONDITIONS, SET_ITEMS, SLUG_PATTERN, STATUSES } from "@/lib/catalog/schema";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/locales";

/*
 * Validation for admin input. Everything an admin submits passes through these
 * schemas on the server before it reaches the database (fail-closed).
 */

const slug = z.string().trim().regex(SLUG_PATTERN).max(120);
const shortText = z.string().trim().min(1).max(200);
const optionalShort = z.string().trim().max(200).nullable();

/** Translations with the default locale required; other locales optional. */
const requiredTranslations = (max: number) =>
  z
    .object(
      Object.fromEntries(
        LOCALES.map((l) => [l, z.string().trim().min(1).max(max).optional()]),
      ),
    )
    .strict()
    .refine((t) => Boolean(t[DEFAULT_LOCALE]), { error: `${DEFAULT_LOCALE} is required` })
    .transform((t) => t as Record<string, string>);

/** Optional block of translations: empty is fine, but if anything is set the default locale must be. */
const optionalTranslations = (max: number) =>
  z
    .object(
      Object.fromEntries(
        LOCALES.map((l) => [l, z.string().trim().min(1).max(max).optional()]),
      ),
    )
    .strict()
    .refine((t) => Object.keys(t).length === 0 || Boolean(t[DEFAULT_LOCALE]), {
      error: `${DEFAULT_LOCALE} is required when translating`,
    })
    .transform((t) => t as Record<string, string>);

/** Optimistic concurrency: the version the editor started from (0 for new records). */
const expectedVersion = z.number().int().min(0);

export const brandInput = z.object({
  slug,
  name: shortText,
  description: optionalTranslations(2000),
  sortOrder: z.number().int().min(0).max(10_000),
  isVisible: z.boolean(),
  expectedVersion,
});

export const categoryInput = z.object({
  slug,
  name: requiredTranslations(120),
  sortOrder: z.number().int().min(0).max(10_000),
  isVisible: z.boolean(),
  expectedVersion,
});

export const productInput = z.object({
  slug,
  brandId: z.uuid(),
  categoryId: z.uuid(),
  model: shortText,
  reference: optionalShort,
  year: z.number().int().min(1900).max(2100).nullable(),
  condition: z.enum(CONDITIONS),
  setItems: z.array(z.enum(SET_ITEMS)),
  material: requiredTranslations(200),
  dimensions: optionalShort,
  description: requiredTranslations(4000),
  priceEur: z.number().int().positive().max(100_000_000).nullable(),
  status: z.enum(STATUSES),
  sortOrder: z.number().int().min(0).max(10_000),
  isVisible: z.boolean(),
  addedAt: z.iso.date(),
  expectedVersion,
});

export type BrandInput = z.infer<typeof brandInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type ProductInput = z.infer<typeof productInput>;

/** Reads `<prefix>.<locale>` fields; blank optional locales are dropped. */
export function translationsFromForm(
  form: FormData,
  prefix: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const locale of LOCALES) {
    const value = form.get(`${prefix}.${locale}`);
    if (typeof value === "string" && value.trim() !== "") result[locale] = value.trim();
  }
  return result;
}

export const journalInput = z.object({
  slug,
  publishedAt: z.iso.date(),
  title: requiredTranslations(200),
  excerpt: requiredTranslations(1000),
  isVisible: z.boolean(),
  expectedVersion,
});

export type JournalInput = z.infer<typeof journalInput>;

/** Alt text for an uploaded image (optional; German required if any language is given). */
export const altInput = optionalTranslations(300);
