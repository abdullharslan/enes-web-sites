import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import {
  CONTENT_BLOCKS,
  blockDefaults,
  blockInputSchema,
  isTranslated,
  type ContentKey,
  type FieldDef,
} from "./blocks";

export interface StoredImage {
  src: string;
  alt: Record<string, string>;
}

export interface ResolvedImage {
  src: string;
  alt: string;
}

export type ResolvedBlock = Record<string, string> & {
  image?: ResolvedImage;
  /** Toggle fields, e.g. `showDemoNotice`. */
  flags?: Record<string, boolean>;
};

const reportInvalid = (key: string) =>
  console.error(`[content] invalid stored block "${key}", using defaults`);

const pickLocale = (value: unknown, locale: Locale): string => {
  const texts = (value ?? {}) as Record<string, string | undefined>;
  return texts[locale]?.trim() || texts[DEFAULT_LOCALE] || "";
};

/**
 * Turns a stored block into the strings a page renders for `locale`.
 * Missing or invalid data falls back to the built-in defaults (and is reported),
 * so a bad edit can never break the page.
 */
export function resolveBlock(
  key: ContentKey,
  stored: unknown,
  locale: Locale,
  images: ReadonlyMap<string, StoredImage>,
  onInvalid: (key: ContentKey) => void = reportInvalid,
): ResolvedBlock {
  const defaults = blockDefaults(key);
  let data: Record<string, unknown> = defaults;
  if (stored !== undefined) {
    const parsed = blockInputSchema(key).safeParse(stored);
    if (parsed.success) data = parsed.data;
    else onInvalid(key);
  }

  const result: ResolvedBlock = {};
  for (const field of CONTENT_BLOCKS[key].fields as readonly FieldDef[]) {
    const value = data[field.key];
    if (field.kind === "image") {
      const image = typeof value === "string" ? images.get(value) : undefined;
      if (image) result.image = { src: image.src, alt: pickLocale(image.alt, locale) };
    } else if (isTranslated(field.kind)) {
      result[field.key] = pickLocale(value, locale);
    } else if (field.kind === "toggle") {
      result.flags = {
        ...result.flags,
        [field.key]: typeof value === "boolean" ? value : Boolean(defaults[field.key]),
      };
    } else {
      result[field.key] =
        typeof value === "string" ? value : String(defaults[field.key] ?? "");
    }
  }
  return result;
}

export function resolveTrust(
  stored: unknown,
  locale: Locale,
  images: ReadonlyMap<string, StoredImage>,
) {
  const block = resolveBlock("home.trust", stored, locale, images);
  return { title: block.title ?? "", items: numberedItems(block, 4) };
}

/** Rebuilds a list section stored as `item1Title`, `item1Text`, … */
export function numberedItems(
  block: ResolvedBlock,
  count: number,
): { title: string; text: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    title: block[`item${i + 1}Title`] ?? "",
    text: block[`item${i + 1}Text`] ?? "",
  }));
}

export interface SiteContact {
  email: string;
  phoneDisplay: string;
  phoneHref: string;
  whatsappNumber: string;
  street: string;
  city: string;
  country: string;
  instagram: string;
}

export function resolveContact(stored: unknown): SiteContact {
  const block = resolveBlock("site.contact", stored, DEFAULT_LOCALE, new Map());
  const phoneDisplay = block.phoneDisplay ?? "";
  const digits = phoneDisplay.replace(/[^\d+]/g, "");
  return {
    email: block.email ?? "",
    phoneDisplay,
    phoneHref: `tel:${digits}`,
    whatsappNumber: block.whatsappNumber ?? "",
    street: block.street ?? "",
    city: block.city ?? "",
    country: block.country ?? "",
    instagram: block.instagram ?? "",
  };
}
