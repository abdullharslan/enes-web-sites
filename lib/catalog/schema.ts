import { z } from "zod";
import { LOCALES } from "@/lib/i18n/locales";

/*
 * Read model of the catalog as the public site consumes it. Data comes from
 * PostgreSQL (lib/server/catalog) with translations already resolved.
 */

export const CONDITIONS = ["new", "unworn", "excellent", "very-good", "good"] as const;
export const SET_ITEMS = [
  "box",
  "papers",
  "invoice",
  "dust-bag",
  "certificate",
  "warranty-card",
] as const;
export const STATUSES = ["available", "reserved", "sold"] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG_PATTERN);
const nonEmpty = z.string().trim().min(1);

export const localizedTextSchema = z.object(
  Object.fromEntries(LOCALES.map((locale) => [locale, nonEmpty])) as Record<
    (typeof LOCALES)[number],
    typeof nonEmpty
  >,
);

/** Bundled demo images (`/images/…`) or versioned uploads (`/media/…`). */
export const imageSchema = z.object({
  src: z
    .string()
    .regex(
      /^\/(?:images\/[a-z0-9-]+\.(?:jpg|webp|png)|media\/[a-z]+\/[a-z0-9-]+\/\d{8}-\d{6}_v\d+_[a-f0-9]{8}\.webp)$/,
    ),
  alt: localizedTextSchema,
});

export const brandSchema = z.object({
  slug,
  name: nonEmpty,
  description: localizedTextSchema.optional(),
  heroImage: imageSchema.optional(),
});

export const categorySchema = z.object({
  slug,
  name: localizedTextSchema,
  tileImage: imageSchema.optional(),
});

export const priceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), amountEur: z.number().int().positive() }),
  z.object({ kind: z.literal("on-request") }),
]);

export const productSchema = z.object({
  slug,
  brand: slug,
  brandName: nonEmpty,
  category: slug,
  model: nonEmpty,
  reference: nonEmpty.optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  condition: z.enum(CONDITIONS),
  setItems: z.array(z.enum(SET_ITEMS)),
  material: localizedTextSchema,
  dimensions: nonEmpty.optional(),
  description: localizedTextSchema,
  price: priceSchema,
  status: z.enum(STATUSES),
  images: z.array(imageSchema).min(1),
  addedAt: z.iso.date(),
});

export type Condition = (typeof CONDITIONS)[number];
export type SetItem = (typeof SET_ITEMS)[number];
export type Status = (typeof STATUSES)[number];
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type CatalogImage = z.infer<typeof imageSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Price = z.infer<typeof priceSchema>;
export type Product = z.infer<typeof productSchema>;

export interface Catalog {
  brands: Brand[];
  categories: Category[];
  products: Product[];
}
