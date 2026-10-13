import { and, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { contentBlocks, journalEntries, media } from "@/db/schema";
import type { JournalEntry } from "@/lib/content/journal";
import type { StoredImage } from "@/lib/content/resolve";
import { resolveTranslations } from "@/lib/i18n/translations";
import { mediaUrl } from "@/lib/server/media/store";

export interface ContentSnapshot {
  blocks: Map<string, unknown>;
  images: Map<string, StoredImage>;
  journal: JournalEntry[];
}

/** Raw stored blocks, the images they reference and the visible journal. */
export async function loadContent(db: Executor): Promise<ContentSnapshot> {
  const [blockRows, journalRows] = await Promise.all([
    db.select().from(contentBlocks),
    db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.isVisible, true))
      .orderBy(desc(journalEntries.publishedAt)),
  ]);

  const mediaIds = [
    ...blockRows.flatMap((b) =>
      Object.values(b.data).filter(
        (v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v),
      ),
    ),
    ...journalRows.flatMap((j) => (j.imageMediaId ? [j.imageMediaId] : [])),
  ];
  const mediaRows = mediaIds.length
    ? await db
        .select()
        .from(media)
        .where(and(inArray(media.id, mediaIds)))
    : [];
  const images = new Map(
    mediaRows.map((m) => [m.id, { src: mediaUrl(m.key), alt: m.alt }]),
  );

  const journal = journalRows.flatMap((j) => {
    try {
      return [
        {
          slug: j.slug,
          publishedAt: j.publishedAt,
          image: j.imageMediaId ? (images.get(j.imageMediaId)?.src ?? null) : null,
          title: resolveTranslations(j.title),
          excerpt: resolveTranslations(j.excerpt),
        },
      ];
    } catch (error) {
      console.error(`[content] hidden invalid journal entry "${j.slug}"`, error);
      return [];
    }
  });

  return { blocks: new Map(blockRows.map((b) => [b.key, b.data])), images, journal };
}
