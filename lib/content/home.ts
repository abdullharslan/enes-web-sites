import type de from "@/messages/de.json";
import type { Locale } from "@/lib/i18n/locales";
import { LEGAL_PAGE_KEYS } from "./blocks";
import {
  numberedItems,
  resolveBlock,
  resolveContact,
  resolveTrust,
  type ResolvedImage,
  type SiteContact,
  type StoredImage,
} from "./resolve";

type Dictionary = typeof de;
type WithImage<T> = T & { image?: ResolvedImage };

export interface ContentSource {
  blocks: ReadonlyMap<string, unknown>;
  images: ReadonlyMap<string, StoredImage>;
}

export interface HomeContent {
  hero: WithImage<Dictionary["hero"]>;
  brands: Dictionary["brands"];
  about: WithImage<Pick<Dictionary["about"], "eyebrow" | "title" | "teaser" | "cta">>;
  newArrivals: Pick<Dictionary["newArrivals"], "eyebrow" | "title" | "viewAll">;
  categories: Dictionary["categories"];
  trust: Dictionary["trust"];
  sold: Dictionary["sold"];
  sellCta: WithImage<Dictionary["sellCta"]>;
  story: WithImage<Dictionary["story"]>;
  journal: Pick<Dictionary["journal"], "eyebrow" | "title" | "overview">;
}

/**
 * Home-page texts and images for `locale`. Field names of each block equal the
 * dictionary keys they replace (asserted by tests/contract/content-blocks.test.ts).
 */
export function resolveHome(source: ContentSource, locale: Locale): HomeContent {
  const block = <T>(key: Parameters<typeof resolveBlock>[0]) =>
    resolveBlock(key, source.blocks.get(key), locale, source.images) as unknown as T;
  return {
    hero: block("home.hero"),
    brands: block("home.brands"),
    about: block("home.about"),
    newArrivals: block("home.newArrivals"),
    categories: block("home.categories"),
    trust: resolveTrust(source.blocks.get("home.trust"), locale, source.images),
    sold: block("home.sold"),
    sellCta: block("home.sellCta"),
    story: block("home.story"),
    journal: block("home.journal"),
  };
}

export function resolveSiteContact(source: ContentSource): SiteContact {
  return resolveContact(source.blocks.get("site.contact"));
}

type LegalPage = (typeof LEGAL_PAGE_KEYS)[number];

export interface PagesContent {
  about: WithImage<
    Pick<Dictionary["about"], "eyebrow" | "title" | "teaser" | "body" | "values">
  >;
  sell: Pick<
    Dictionary["sell"],
    "eyebrow" | "title" | "intro" | "stepsTitle" | "steps" | "formTitle"
  >;
  contact: Dictionary["contactPage"];
  legal: Record<LegalPage, { title: string; body: string }>;
  footer: {
    tagline: string;
    trademarkNotice: string;
    demoNotice: string;
    showDemoNotice: boolean;
  };
  seo: Dictionary["meta"];
}

/** Texts of the inner pages, footer and SEO for `locale` (same fallback rules as the home page). */
export function resolvePages(source: ContentSource, locale: Locale): PagesContent {
  const block = (key: Parameters<typeof resolveBlock>[0]) =>
    resolveBlock(key, source.blocks.get(key), locale, source.images);
  const about = block("page.about");
  const sell = block("page.sell");
  const contact = block("page.contact");
  const legal = block("page.legal");
  const footer = block("site.footer");
  const seo = block("site.seo");
  return {
    about: {
      eyebrow: about.eyebrow ?? "",
      title: about.title ?? "",
      teaser: about.teaser ?? "",
      body: about.body ?? "",
      values: numberedItems(about, 3),
      image: about.image,
    },
    sell: {
      eyebrow: sell.eyebrow ?? "",
      title: sell.title ?? "",
      intro: sell.intro ?? "",
      stepsTitle: sell.stepsTitle ?? "",
      steps: numberedItems(sell, 4),
      formTitle: sell.formTitle ?? "",
    },
    contact: {
      eyebrow: contact.eyebrow ?? "",
      title: contact.title ?? "",
      text: contact.text ?? "",
      addressTitle: contact.addressTitle ?? "",
      formTitle: contact.formTitle ?? "",
    },
    legal: Object.fromEntries(
      LEGAL_PAGE_KEYS.map((page) => [
        page,
        { title: legal[`${page}Title`] ?? "", body: legal[page] ?? "" },
      ]),
    ) as PagesContent["legal"],
    footer: {
      tagline: footer.tagline ?? "",
      trademarkNotice: footer.trademarkNotice ?? "",
      demoNotice: footer.demoNotice ?? "",
      showDemoNotice: footer.flags?.showDemoNotice ?? true,
    },
    seo: { title: seo.title ?? "", description: seo.description ?? "" },
  };
}
