import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  blockDefaults,
  blockImageSlug,
  CONTENT_KEYS,
  type ContentKey,
} from "@/lib/content/blocks";
import { storeImage } from "@/lib/server/media/store";
import { recordRevision } from "@/lib/server/revisions";
import { toSnapshot } from "@/lib/server/snapshot";
import type { Database, Executor } from "./connection";
import { contentBlocks, journalEntries } from "./schema";
import { JOURNAL } from "./seed-data/journal";

const SEED_COMMENT = "Initial import from demo data";

/** The photos the home page used before content became editable. */
const DEFAULT_IMAGES: Partial<Record<ContentKey, { src: string; alt: string }>> = {
  "home.hero": {
    src: "/images/watch-black-dial.jpg",
    alt: "Armbanduhr auf schwarzem Grund",
  },
  "home.about": { src: "/images/jewel-portrait.jpg", alt: "Porträt mit Schmuck" },
  "home.story": { src: "/images/jewel-earrings-sapphire.jpg", alt: "Saphir-Ohrringe" },
  "home.sellCta": { src: "/images/watch-trio.jpg", alt: "Sportuhren auf dunklem Grund" },
};

export interface ContentSeedOptions {
  mediaRoot: string;
  publicDir?: string;
}

/** Imports today's home-page content and journal as version 1. Idempotent. */
export async function seedContent(
  db: Database | Executor,
  { mediaRoot, publicDir = "public" }: ContentSeedOptions,
): Promise<{ blocks: number; journal: number }> {
  const report = { blocks: 0, journal: 0 };
  await db.transaction(async (tx) => {
    for (const key of CONTENT_KEYS) {
      if (
        (
          await tx
            .select({ key: contentBlocks.key })
            .from(contentBlocks)
            .where(eq(contentBlocks.key, key))
        ).length
      )
        continue;
      const data: Record<string, unknown> = blockDefaults(key);
      const image = DEFAULT_IMAGES[key];
      if (image) {
        const stored = await storeImage(tx, mediaRoot, {
          input: await readFile(join(publicDir, image.src)),
          kind: "home",
          entitySlug: blockImageSlug(key),
          alt: { de: image.alt },
        });
        data.image = stored.id;
      }
      await tx.insert(contentBlocks).values({ key, data, currentVersion: 1 });
      await recordRevision(tx, {
        entityType: "content",
        entityId: key,
        data,
        comment: SEED_COMMENT,
      });
      report.blocks += 1;
    }

    for (const entry of JOURNAL) {
      if (
        (
          await tx
            .select({ id: journalEntries.id })
            .from(journalEntries)
            .where(eq(journalEntries.slug, entry.slug))
        ).length
      )
        continue;
      const stored = await storeImage(tx, mediaRoot, {
        input: await readFile(join(publicDir, entry.image)),
        kind: "journal",
        entitySlug: entry.slug,
        alt: { de: entry.title.de },
      });
      const [row] = await tx
        .insert(journalEntries)
        .values({
          slug: entry.slug,
          publishedAt: entry.publishedAt,
          imageMediaId: stored.id,
          title: entry.title,
          excerpt: entry.excerpt,
        })
        .returning();
      await recordRevision(tx, {
        entityType: "journal",
        entityId: row!.id,
        data: toSnapshot(row!),
        comment: SEED_COMMENT,
      });
      report.journal += 1;
    }
  });
  return report;
}
