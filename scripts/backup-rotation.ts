import { lstat, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/*
 * Deletes backup sets past the retention period, so personal data that was
 * erased or has expired does not live on in old archives, and the partial files
 * an interrupted backup left behind. Scripts only: the web server has no
 * business deleting backups.
 */

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PARTS_OF_A_SET = 3;

export const backupDirectory = (): string => process.env.BACKUP_DIR ?? "backups";

interface BackupSet {
  time: number;
  files: string[];
  /** Parts that are really there and not empty. */
  parts: Set<string>;
}

/** The stamp's time, or null for digits that are not a time backup.ts can write. */
function stampTime(stamp: string): number | null {
  const iso = stamp.replace(
    /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/,
    "$1-$2-$3T$4:$5:$6.000Z",
  );
  const time = Date.parse(iso);
  return !Number.isNaN(time) && new Date(time).toISOString() === iso ? time : null;
}

/** Which part of a set this exact file name is, or null for any other file. */
function parseBackupName(
  name: string,
  database: string,
): { part: string; stamp: string; partial: boolean } | null {
  const match = /^(.+)_(\d{8}-\d{6})(\.dump|\.tar\.gz)(\.partial)?$/.exec(name);
  if (!match) return null;
  const [, prefix, stamp, extension, partial] = match;
  const known =
    extension === ".dump"
      ? prefix === database
      : prefix === "media" || prefix === "private";
  return known
    ? { part: `${prefix}${extension}`, stamp: stamp!, partial: partial !== undefined }
    : null;
}

async function readBackups(
  dir: string,
  database: string,
): Promise<{ sets: BackupSet[]; partials: { time: number; name: string }[] }> {
  const sets = new Map<string, BackupSet>();
  const partials: { time: number; name: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    // isFile() is false for a symlink: it is neither followed nor removed.
    const parsed = entry.isFile() ? parseBackupName(entry.name, database) : null;
    const time = parsed && stampTime(parsed.stamp);
    if (!parsed || time === null) continue;
    if (parsed.partial) {
      partials.push({ time, name: entry.name });
      continue;
    }
    const set = sets.get(parsed.stamp) ?? { time, files: [], parts: new Set() };
    set.files.push(entry.name);
    if ((await lstat(join(dir, entry.name))).size > 0) set.parts.add(parsed.part);
    sets.set(parsed.stamp, set);
  }
  return { sets: [...sets.values()], partials };
}

/**
 * Removes every set older than the retention period, except the newest complete
 * one: recovery must stay possible even when backups have stopped for a while.
 * With no complete set at all, no set is removed. Partial files are never
 * recoverable, so they go by age alone: a younger one may still be being written.
 */
export async function rotateBackups(
  dir: string,
  database: string,
  now = new Date(),
): Promise<{ sets: number; files: number }> {
  const unchanged = { sets: 0, files: 0 };
  try {
    const stat = await lstat(dir);
    if (!stat.isDirectory()) throw new Error("Backup directory is not a plain folder");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return unchanged;
    throw error;
  }

  const { sets, partials } = await readBackups(dir, database);
  const isExpired = ({ time }: { time: number }) => now.getTime() - time > RETENTION_MS;
  const expiredPartials = partials.filter(isExpired).map(({ name }) => name);
  for (const file of expiredPartials) await unlink(join(dir, file));

  const newestComplete = sets
    .filter((set) => set.parts.size === PARTS_OF_A_SET)
    .reduce<BackupSet | null>(
      (newest, set) => (!newest || set.time > newest.time ? set : newest),
      null,
    );
  if (!newestComplete) return { sets: 0, files: expiredPartials.length };

  const expired = sets.filter((set) => set !== newestComplete && isExpired(set));
  const files = expired.flatMap((set) => set.files);
  for (const file of files) await unlink(join(dir, file));
  return { sets: expired.length, files: files.length + expiredPartials.length };
}
