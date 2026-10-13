import type de from "@/messages/de.json";
import type { Locale } from "@/lib/i18n/locales";
import {
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
