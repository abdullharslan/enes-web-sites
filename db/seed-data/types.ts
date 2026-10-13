import type { Product } from "@/lib/catalog/schema";
import type { Locale } from "@/lib/i18n/locales";

/** Seed translations: German is required, other locales fall back to it. */
export type SeedText = { de: string } & Partial<Record<Locale, string>>;

export const t = (de: string, en: string, tr: string, fr?: string): SeedText =>
  fr === undefined ? { de, en, tr } : { de, en, tr, fr };

export interface SeedImage {
  /** Path of a bundled demo image under public/, e.g. `/images/watch-diver.jpg`. */
  src: string;
  alt: SeedText;
}

export interface SeedBrand {
  slug: string;
  name: string;
}

export interface SeedCategory {
  slug: string;
  name: SeedText;
  tileImage: SeedImage;
}

export type SeedProduct = Omit<
  Product,
  "brandName" | "images" | "material" | "description"
> & {
  material: SeedText;
  description: SeedText;
  images: SeedImage[];
};
