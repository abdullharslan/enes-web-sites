import type { LocalizedText } from "@/lib/catalog/schema";

/** A journal article as the public site renders it. */
export interface JournalEntry {
  slug: string;
  publishedAt: string;
  /** Image URL (`/media/…` or a bundled `/images/…`), if any. */
  image: string | null;
  title: LocalizedText;
  excerpt: LocalizedText;
}
