import { z } from "zod";
import { SITE } from "@/config/site";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/locales";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import tr from "@/messages/tr.json";

/*
 * Editable page content. Each block lists its fields once; the admin editor,
 * validation, defaults and the public read model are all derived from this.
 */

type Dictionary = typeof de;
const DICTIONARIES: Record<Locale, Dictionary> = { de, en, fr, tr };

export type FieldKind =
  "text" | "multiline" | "image" | "email" | "phone" | "whatsapp" | "url" | "plain";

export interface FieldDef {
  key: string;
  kind: FieldKind;
  /** Admin label (Turkish). */
  label: string;
  /** Where today's text lives in the UI dictionaries (translated kinds only). */
  source?: (dict: Dictionary) => string;
}

export interface BlockDef {
  /** Admin label (Turkish). */
  label: string;
  fields: readonly FieldDef[];
}

const text = (key: string, label: string, source: FieldDef["source"]): FieldDef => ({
  key,
  kind: "text",
  label,
  source,
});
const multiline = (key: string, label: string, source: FieldDef["source"]): FieldDef => ({
  key,
  kind: "multiline",
  label,
  source,
});
const image = (label = "Görsel"): FieldDef => ({ key: "image", kind: "image", label });

const trustItems = [0, 1, 2, 3].flatMap((i) => [
  text(`item${i + 1}Title`, `Söz ${i + 1} – başlık`, (d) => d.trust.items[i]!.title),
  multiline(`item${i + 1}Text`, `Söz ${i + 1} – metin`, (d) => d.trust.items[i]!.text),
]);

export const CONTENT_BLOCKS = {
  "home.hero": {
    label: "Giriş (hero)",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.hero.eyebrow),
      text("title", "Başlık", (d) => d.hero.title),
      multiline("subtitle", "Alt metin", (d) => d.hero.subtitle),
      text("ctaCollection", "Koleksiyon butonu", (d) => d.hero.ctaCollection),
      text("ctaSell", "Satış butonu", (d) => d.hero.ctaSell),
      image("Hero görseli"),
    ],
  },
  "home.brands": {
    label: "Marka seçici",
    fields: [
      text("title", "Başlık", (d) => d.brands.title),
      text("all", "Tüm markalar linki", (d) => d.brands.all),
    ],
  },
  "home.about": {
    label: "Hakkımızda (özet)",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.about.eyebrow),
      text("title", "Başlık", (d) => d.about.title),
      multiline("teaser", "Metin", (d) => d.about.teaser),
      text("cta", "Buton", (d) => d.about.cta),
      image(),
    ],
  },
  "home.newArrivals": {
    label: "Yeni gelenler",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.newArrivals.eyebrow),
      text("title", "Başlık", (d) => d.newArrivals.title),
      text("viewAll", "Tüm koleksiyon butonu", (d) => d.newArrivals.viewAll),
    ],
  },
  "home.categories": {
    label: "Kategoriler",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.categories.eyebrow),
      text("title", "Başlık", (d) => d.categories.title),
      text("explore", "Keşfet etiketi", (d) => d.categories.explore),
    ],
  },
  "home.trust": {
    label: "Sözümüz (güven bandı)",
    fields: [
      text("title", "Başlık (ekran okuyucu)", (d) => d.trust.title),
      ...trustItems,
    ],
  },
  "home.sold": {
    label: "Satılanlar",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.sold.eyebrow),
      text("title", "Başlık", (d) => d.sold.title),
    ],
  },
  "home.sellCta": {
    label: "Konsinye satış bandı",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.sellCta.eyebrow),
      text("title", "Başlık", (d) => d.sellCta.title),
      multiline("text", "Metin", (d) => d.sellCta.text),
      text("cta", "Buton", (d) => d.sellCta.cta),
      image("Arka plan görseli"),
    ],
  },
  "home.story": {
    label: "Hikâye bölümü",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.story.eyebrow),
      text("title", "Başlık", (d) => d.story.title),
      multiline("text", "Metin", (d) => d.story.text),
      text("cta", "Buton", (d) => d.story.cta),
      multiline("social", "Sosyal medya notu", (d) => d.story.social),
      image(),
    ],
  },
  "home.journal": {
    label: "Journal bölümü",
    fields: [
      text("eyebrow", "Üst etiket", (d) => d.journal.eyebrow),
      text("title", "Başlık", (d) => d.journal.title),
      text("overview", "Tümü butonu", (d) => d.journal.overview),
    ],
  },
  "site.contact": {
    label: "İletişim bilgileri",
    fields: [
      { key: "email", kind: "email", label: "E-posta" },
      { key: "phoneDisplay", kind: "phone", label: "Telefon (görünen)" },
      {
        key: "whatsappNumber",
        kind: "whatsapp",
        label: "WhatsApp numarası (ülke kodu ile, sadece rakam)",
      },
      { key: "street", kind: "plain", label: "Adres – sokak" },
      { key: "city", kind: "plain", label: "Adres – şehir" },
      { key: "country", kind: "plain", label: "Adres – ülke" },
      { key: "instagram", kind: "url", label: "Instagram adresi (https)" },
    ],
  },
} as const satisfies Record<string, BlockDef>;

export type ContentKey = keyof typeof CONTENT_BLOCKS;
export const CONTENT_KEYS = Object.keys(CONTENT_BLOCKS) as ContentKey[];

export function isContentKey(value: string): value is ContentKey {
  return Object.hasOwn(CONTENT_BLOCKS, value);
}

export const isTranslated = (kind: FieldKind) => kind === "text" || kind === "multiline";

/** Storage slug for a block's images, e.g. `home.hero` → `home-hero`. */
export const blockImageSlug = (key: ContentKey) =>
  key.replace(".", "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const CONTACT_DEFAULTS: Record<string, string> = {
  email: SITE.email,
  phoneDisplay: SITE.phoneDisplay,
  whatsappNumber: SITE.whatsappNumber,
  street: SITE.address.street,
  city: SITE.address.city,
  country: SITE.address.country,
  instagram: SITE.social.instagram,
};

/** Initial content: today's dictionary texts in every locale (and the configured contact details). */
export function blockDefaults(key: ContentKey): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of CONTENT_BLOCKS[key].fields as readonly FieldDef[]) {
    if (isTranslated(field.kind) && field.source) {
      result[field.key] = Object.fromEntries(
        LOCALES.map((l) => [l, field.source!(DICTIONARIES[l])]),
      );
    } else if (field.kind !== "image") {
      result[field.key] = CONTACT_DEFAULTS[field.key] ?? "";
    }
  }
  return result;
}

const translations = (max: number) =>
  z
    .object(
      Object.fromEntries(
        LOCALES.map((l) => [l, z.string().trim().min(1).max(max).optional()]),
      ),
    )
    .strict()
    .refine((t) => Boolean(t[DEFAULT_LOCALE]), {
      error: `${DEFAULT_LOCALE} is required`,
    });

const FIELD_SCHEMAS: Record<FieldKind, z.ZodType> = {
  text: translations(200),
  multiline: translations(2000),
  image: z.uuid().nullable().optional(),
  email: z.email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()/-]{5,24}$/),
  whatsapp: z.string().regex(/^[1-9]\d{7,14}$/),
  url: z.url({ protocol: /^https$/ }).max(500),
  plain: z.string().trim().min(1).max(200),
};

/** Strict schema for a block's stored data; unknown fields are rejected. */
export function blockInputSchema(key: ContentKey) {
  const fields = CONTENT_BLOCKS[key].fields as readonly FieldDef[];
  return z
    .object(Object.fromEntries(fields.map((f) => [f.key, FIELD_SCHEMAS[f.kind]])))
    .strict();
}
