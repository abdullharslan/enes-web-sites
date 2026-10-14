import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import {
  resolvePages,
  resolveSiteContact,
  type ContentSource,
  type PagesContent,
} from "@/lib/content/home";
import type { Locale } from "@/lib/i18n/locales";
import type { JournalEntry } from "@/lib/content/journal";
import type { SiteContact } from "@/lib/content/resolve";
import { loadContent } from "./load";

/** Cache tag invalidated (via `updateTag`) by every admin content or journal change. */
export const CONTENT_TAG = "content";

/** Editable page content, prerendered and cached until an admin change invalidates it. */
export async function getContent(): Promise<ContentSource & { journal: JournalEntry[] }> {
  "use cache";
  cacheLife("max");
  cacheTag(CONTENT_TAG);
  return loadContent(db);
}

export async function getSiteContact(): Promise<SiteContact> {
  return resolveSiteContact(await getContent());
}

/** Inner-page texts, footer and SEO for `locale`. */
export async function getPages(locale: Locale): Promise<PagesContent> {
  return resolvePages(await getContent(), locale);
}
