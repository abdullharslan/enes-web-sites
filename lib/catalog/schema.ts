import { z } from "zod";
import { LOCALES } from "@/lib/i18n/locales";

export const CATEGORIES = ["bags", "watches", "jewellery"] as const;
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

const nonEmpty = z.string().trim().min(1);

export const localizedTextSchema = z.object(
  Object.fromEntries(LOCALES.map((locale) => [locale, nonEmpty])) as Record<
    (typeof LOCALES)[number],
    typeof nonEmpty
  >,
);

export const brandSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: nonEmpty,
  categories: z.array(z.enum(CATEGORIES)).min(1),
});

export const priceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), amountEur: z.number().int().positive() }),
  z.object({ kind: z.literal("on-request") }),
]);

export const productImageSchema = z.object({
  src: z.string().regex(/^\/images\/[a-z0-9-]+\.(?:jpg|webp|png)$/),
  alt: localizedTextSchema,
});

export const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  brand: z.string(),
  category: z.enum(CATEGORIES),
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
  images: z.array(productImageSchema).min(1),
  addedAt: z.iso.date(),
});

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type SetItem = (typeof SET_ITEMS)[number];
export type Status = (typeof STATUSES)[number];
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type Brand = z.infer<typeof brandSchema>;
export type Price = z.infer<typeof priceSchema>;
export type Product = z.infer<typeof productSchema>;
