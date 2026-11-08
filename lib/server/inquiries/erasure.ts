import { mkdir, open, readFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/connection";
import { inquiries } from "@/db/schema";
import { removeInquiryFiles } from "./photos";
import { deleteInquiry } from "./service";

/*
 * Deleted inquiries must stay deleted across a backup restore. An append-only
 * file outside the database (ids and times only, no personal data) lists every
 * inquiry erased on request or by retention, and scripts/restore.ts re-applies
 * it: a backup can be older than the deletion, or even than the completion that
 * started the retention period.
 */

/** Directly under the private root. The restore never unpacks this file over the live one. */
export const ERASURE_LEDGER_FILE = "erasure-ledger.jsonl";

/** Ids per lookup query: far below PostgreSQL's 65,535 bind-parameter limit. */
export const LOOKUP_CHUNK = 1000;

const entrySchema = z.strictObject({ id: z.uuid(), erasedAt: z.iso.datetime() });
export type ErasureEntry = z.infer<typeof entrySchema>;

export class ErasureNotRecordedError extends Error {
  override name = "ErasureNotRecordedError";
  constructor() {
    super("The erasure ledger could not be written");
  }
}

const NEWLINE = 0x0a;

/**
 * Removes an unterminated last line. Safe: such a line never finished its
 * fsync, so the transaction it belonged to never committed.
 */
async function dropTornTail(ledger: FileHandle): Promise<void> {
  const { size } = await ledger.stat();
  if (size === 0) return;
  const last = Buffer.alloc(1);
  await ledger.read(last, 0, 1, size - 1);
  if (last[0] === NEWLINE) return;
  const content = Buffer.alloc(size);
  await ledger.read(content, 0, size, 0);
  await ledger.truncate(content.lastIndexOf(NEWLINE) + 1);
}

async function writeEntries(root: string, entries: ErasureEntry[]): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const ledger = await open(join(root, ERASURE_LEDGER_FILE), "a+", 0o600);
  try {
    await dropTornTail(ledger);
    const { size } = await ledger.stat();
    try {
      await ledger.appendFile(entries.map((e) => `${JSON.stringify(e)}\n`).join(""));
      await ledger.sync();
    } catch (error) {
      await ledger.truncate(size).catch(() => {});
      throw error;
    }
  } finally {
    await ledger.close();
  }
}

// On globalThis: the server action and the retention timer run in separate
// bundles, each with its own copy of this module.
const shared = globalThis as typeof globalThis & { __erasureLedgerQueue?: Promise<void> };

/** One at a time, or a failed write's rollback could cut off a concurrent entry. */
async function appendEntries(root: string, entries: ErasureEntry[]): Promise<void> {
  const write = (shared.__erasureLedgerQueue ?? Promise.resolve()).then(() =>
    writeEntries(root, entries),
  );
  shared.__erasureLedgerQueue = write.catch(() => {});
  try {
    await write;
  } catch (error) {
    console.error("Erasure ledger write failed", (error as NodeJS.ErrnoException).code);
    throw new ErasureNotRecordedError();
  }
}

/**
 * Lists inquiries as erased, as one durable batch. Call inside the transaction
 * that deletes them, before it commits: no entry, no deletion. Should the commit
 * itself fail, the entries stay and a later restore erases what was to go anyway.
 */
export async function recordErasures(
  root: string,
  ids: readonly string[],
  now: Date,
): Promise<void> {
  if (ids.length === 0) return;
  await appendEntries(
    root,
    ids.map((id) => ({ id, erasedAt: now.toISOString() })),
  );
}

/** Permanently deletes an inquiry on request; see recordErasures for the order. */
export async function eraseInquiry(
  db: Database,
  root: string,
  actorId: string,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const deleted = await db.transaction(async (tx) => {
    const found = await deleteInquiry(tx, actorId, id);
    if (found) await recordErasures(root, [id], now);
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

/**
 * Every entry, oldest first. An unterminated final fragment is a write that
 * never finished: it is ignored and counted. Any other bad line throws.
 */
export async function readErasureLedger(
  root: string,
): Promise<{ entries: ErasureEntry[]; tornLines: number }> {
  let text: string;
  try {
    text = await readFile(join(root, ERASURE_LEDGER_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], tornLines: 0 };
    }
    throw error;
  }
  // Every complete entry ends in a newline, so the last piece should be empty.
  const lines = text.split("\n");
  const tornLines = lines.pop() === "" ? 0 : 1;
  const entries = lines.map((line, index) => {
    const entry = parseEntry(line);
    if (!entry) throw new Error(`Erasure ledger is malformed at line ${index + 1}`);
    return entry;
  });
  return { entries, tornLines };
}

/**
 * Adds to the live ledger what only the archived copy lists. Append-only, so
 * the live ledger cannot lose an entry. Reports what the archived copy held.
 */
export async function mergeErasureLedger(
  root: string,
  archivedRoot: string,
): Promise<{ added: number; tornLines: number }> {
  const archived = await readErasureLedger(archivedRoot);
  const known = new Set((await readErasureLedger(root)).entries.map((entry) => entry.id));
  const missing = [
    ...new Map(
      archived.entries
        .filter((entry) => !known.has(entry.id))
        .map((entry) => [entry.id, entry]),
    ).values(),
  ];
  if (missing.length > 0) await appendEntries(root, missing);
  return { added: missing.length, tornLines: archived.tornLines };
}

/** Erases every listed inquiry again, whether or not the restored data still has it. */
export async function applyErasureLedger(
  db: Database,
  root: string,
): Promise<{ entries: number; inquiries: number }> {
  const ids = [
    ...new Set((await readErasureLedger(root)).entries.map((entry) => entry.id)),
  ];
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
