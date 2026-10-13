import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, contentBlocks, journalEntries, media, users } from "@/db/schema";
import { mediaUrl } from "@/lib/server/media/store";

export async function listBlocks() {
  return db.select().from(contentBlocks);
}

export async function getBlock(key: string) {
  const [row] = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key));
  if (!row) return null;
  const ids = Object.values(row.data).filter(
    (v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v),
  );
  const images = ids.length
    ? await db.select().from(media).where(inArray(media.id, ids))
    : [];
  return { ...row, imageSrc: new Map(images.map((m) => [m.id, mediaUrl(m.key)])) };
}

export async function listJournal() {
  return db.select().from(journalEntries).orderBy(desc(journalEntries.publishedAt));
}

export async function getJournal(id: string) {
  const [row] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
  if (!row) return null;
  const [image] = row.imageMediaId
    ? await db.select().from(media).where(eq(media.id, row.imageMediaId))
    : [];
  return { ...row, imageSrc: image ? mediaUrl(image.key) : null };
}

/** Every stored file version, newest first (files are never deleted). */
export async function listMedia(limit = 300) {
  const rows = await db
    .select()
    .from(media)
    .orderBy(desc(media.createdAt), desc(media.version))
    .limit(limit);
  return rows.map((m) => ({ ...m, src: mediaUrl(m.key) }));
}

export async function listAudit(limit = 200) {
  return db
    .select({ event: auditEvents, actor: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit);
}
