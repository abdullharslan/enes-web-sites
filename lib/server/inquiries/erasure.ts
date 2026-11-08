import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/connection";
import { inquiries } from "@/db/schema";
import { removeInquiryFiles } from "./photos";
import { LOOKUP_CHUNK } from "./retention";
import { deleteInquiry } from "./service";

/*
 * Erasure requests must survive a backup restore. An append-only file outside
 * the database (ids and times only, no personal data) lists every manually
 * erased inquiry, and scripts/restore.ts re-applies it. Routine retention needs
 * no entry: the purge simply runs again after a restore.
 */

/** Directly under the private root. The restore never unpacks this file over the live one. */
export const ERASURE_LEDGER_FILE = "erasure-ledger.jsonl";

const entrySchema = z.strictObject({ id: z.uuid(), erasedAt: z.iso.datetime() });
export type ErasureEntry = z.infer<typeof entrySchema>;

export class ErasureNotRecordedError extends Error {}

async function appendErasure(root: string, id: string, now: Date): Promise<void> {
  const entry: ErasureEntry = { id, erasedAt: now.toISOString() };
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const ledger = await open(join(root, ERASURE_LEDGER_FILE), "a", 0o600);
    try {
      await ledger.appendFile(`${JSON.stringify(entry)}\n`);
      await ledger.sync();
    } finally {
      await ledger.close();
    }
  } catch (error) {
    console.error("Erasure ledger write failed", (error as NodeJS.ErrnoException).code);
    throw new ErasureNotRecordedError();
  }
}

/**
 * Permanently deletes an inquiry on request. The ledger entry is on disk before
 * the deletion commits: no entry, no deletion. Should the commit itself fail,
 * the entry stays and a later restore erases what staff already asked to erase.
 */
export async function eraseInquiry(
  db: Database,
  root: string,
  actorId: string,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const deleted = await db.transaction(async (tx) => {
    const found = await deleteInquiry(tx, actorId, id);
    if (found) await appendErasure(root, id, now);
    return found;
  });
  // Files go after the commit; a leftover file without a row is never served.
  if (deleted) await removeInquiryFiles(root, [id]);
  return deleted;
}

function parseEntry(line: string): ErasureEntry | null {
  try {
    return entrySchema.parse(JSON.parse(line));
  } catch {
    return null;
  }
}

/** Every entry, oldest first; throws on the first malformed line (a torn write included). */
export async function readErasureLedger(root: string): Promise<ErasureEntry[]> {
  let text: string;
  try {
    text = await readFile(join(root, ERASURE_LEDGER_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const malformed = (line: number) =>
    new Error(`Erasure ledger is malformed at line ${line}`);
  // Every complete entry ends in a newline; anything after the last one is torn.
  const lines = text.split("\n");
  if (lines.pop() !== "") throw malformed(lines.length + 1);
  return lines.map((line, index) => {
    const entry = parseEntry(line);
    if (!entry) throw malformed(index + 1);
    return entry;
  });
}

/** Erases every listed inquiry again, whether or not the restored data still has it. */
export async function applyErasureLedger(
  db: Database,
  root: string,
): Promise<{ entries: number; inquiries: number }> {
  const ids = [...new Set((await readErasureLedger(root)).map((entry) => entry.id))];
  let removed = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
      const rows = await tx
        .delete(inquiries)
        .where(inArray(inquiries.id, ids.slice(i, i + LOOKUP_CHUNK)))
        .returning({ id: inquiries.id });
      removed += rows.length;
    }
  });
  await removeInquiryFiles(root, ids);
  return { entries: ids.length, inquiries: removed };
}
