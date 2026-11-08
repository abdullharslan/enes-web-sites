import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentBlocks, journalEntries, revisions } from "@/db/schema";
import { seedContent } from "@/db/seed-content";
import { CONTENT_KEYS, blockDefaults } from "@/lib/content/blocks";
import { loadContent } from "@/lib/server/content/load";
import {
  saveContentBlock,
  saveJournalEntry,
  setContentImage,
} from "@/lib/server/content/admin";
import { VersionConflictError } from "@/lib/server/catalog/admin";
import { restoreAny } from "@/lib/server/history";
import { storeImage } from "@/lib/server/media/store";
import { listRevisions } from "@/lib/server/revisions";
import { closeTestDb, sampleJpeg, tempMediaRoot, withRollback } from "./helpers";

afterAll(closeTestDb);
let media: ReturnType<typeof tempMediaRoot>;
beforeEach(() => {
  media = tempMediaRoot();
});
afterEach(() => media.cleanup());

describe("seedContent", () => {
  it("creates every block (v1) with today's texts and the hero image, idempotently", () =>
    withRollback(async (tx) => {
      const first = await seedContent(tx, { mediaRoot: media.root });
      const second = await seedContent(tx, { mediaRoot: media.root });
      expect(first.blocks).toBe(CONTENT_KEYS.length);
      expect(second).toEqual({ blocks: 0, journal: 0 });

      const [hero] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      expect(hero?.currentVersion).toBe(1);
      expect(hero?.data.title).toEqual(blockDefaults("home.hero").title);
      expect(typeof hero?.data.image).toBe("string");

      const content = await loadContent(tx);
      expect(content.journal.length).toBe(first.journal);
      expect(content.images.size).toBeGreaterThan(0);
    }));
});

describe("saveContentBlock", () => {
  it("versions every change and restores an old hero image", () =>
    withRollback(async (tx) => {
      await seedContent(tx, { mediaRoot: media.root });
      const [before] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      const originalImage = before!.data.image;

      const updated = await saveContentBlock(tx, null, "home.hero", {
        ...before!.data,
        title: { de: "Neuer Titel", tr: "Yeni başlık" },
        expectedVersion: 1,
      });
      expect(updated.version).toBe(2);

      const replacement = await storeImage(tx, media.root, {
        input: await sampleJpeg("#123456"),
        kind: "home",
        entitySlug: "home-hero",
        alt: { de: "Neu" },
      });
      await setContentImage(tx, null, "home.hero", "image", replacement.id, 2); // v3

      await restoreAny(tx, null, "content", "home.hero", 1, 3); // v4
      const [after] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      expect(after?.data.image).toBe(originalImage);
      expect(after?.data.title).toEqual(blockDefaults("home.hero").title);
      expect(
        (await listRevisions(tx, "content", "home.hero")).map((r) => r.version),
      ).toEqual([4, 3, 2, 1]);
    }));

  it("rejects stale edits and invalid data", () =>
    withRollback(async (tx) => {
      await seedContent(tx, { mediaRoot: media.root });
      const [hero] = await tx
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.key, "home.hero"));
      // Someone else changes a text field …
      await saveContentBlock(tx, null, "home.hero", {
        ...hero!.data,
        title: { de: "Von jemand anderem" },
        expectedVersion: 1,
      });
      // … so a save from a form still showing version 1 is refused.
      await expect(
        saveContentBlock(tx, null, "home.hero", { ...hero!.data, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(VersionConflictError);
      await expect(
        saveContentBlock(tx, null, "site.contact", {
          ...blockDefaults("site.contact"),
          email: "nope",
          expectedVersion: 1,
        }),
      ).rejects.toThrow();
    }));
});

describe("journal", () => {
  it("creates, updates and restores an entry", () =>
    withRollback(async (tx) => {
      const created = await saveJournalEntry(tx, null, null, {
        slug: "neue-saison",
        publishedAt: "2026-10-14",
        title: { de: "Neue Saison" },
        excerpt: { de: "Erste Fassung" },
        isVisible: true,
        expectedVersion: 0,
      });
      await saveJournalEntry(tx, null, created.id, {
        slug: "neue-saison",
        publishedAt: "2026-10-14",
        title: { de: "Neue Saison" },
        excerpt: { de: "Zweite Fassung" },
        isVisible: true,
        expectedVersion: 1,
      });
      await restoreAny(tx, null, "journal", created.id, 1, 2);
      const [row] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, created.id));
      expect([row?.excerpt, row?.currentVersion]).toEqual([{ de: "Erste Fassung" }, 3]);
    }));

  const entry = {
    slug: "zukunft",
    publishedAt: "2026-10-14",
    title: { de: "Zukunft" },
    excerpt: { de: "Fassung" },
    isVisible: true,
  };

  it("refuses to save an entry dated after today", () =>
    withRollback(async (tx) => {
      await expect(
        saveJournalEntry(tx, null, null, {
          ...entry,
          publishedAt: "2999-01-01",
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({
        name: "ZodError",
        issues: [
          expect.objectContaining({ path: ["publishedAt"], message: "futureDate" }),
        ],
      });
      expect(await tx.select().from(journalEntries)).toHaveLength(0);
    }));

  it("still restores a revision whose date lies in the future", () =>
    withRollback(async (tx) => {
      const { id } = await saveJournalEntry(tx, null, null, {
        ...entry,
        expectedVersion: 0,
      });
      await saveJournalEntry(tx, null, id, {
        ...entry,
        excerpt: { de: "Zweite" },
        expectedVersion: 1,
      });
      const first = and(eq(revisions.entityId, id), eq(revisions.version, 1));
      const [revision] = await tx.select().from(revisions).where(first);
      await tx
        .update(revisions)
        .set({ data: { ...revision!.data, publishedAt: "2999-01-01" } })
        .where(first);

      await restoreAny(tx, null, "journal", id, 1, 2);

      const [row] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, id));
      expect(row?.publishedAt).toBe("2999-01-01");
    }));
});
