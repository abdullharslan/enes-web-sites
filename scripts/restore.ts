import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { connect } from "@/db/connection";
import { runMigrations } from "@/db/migrate";
import { assertLocalDatabase, emptyLocalDatabase } from "@/db/reset";
import {
  ERASURE_LEDGER_FILE,
  applyErasureLedger,
  mergeErasureLedger,
  readErasureLedger,
} from "@/lib/server/inquiries/erasure";
import { applyRetention } from "@/lib/server/inquiries/retention";

/*
 * DESTRUCTIVE (local only): replaces the whole database with a backup and
 * unpacks the matching media and private-file archives, brings the schema up to
 * date, then erases again everything the ledger lists and applies retention, so
 * deleted data does not return. The live ledger only ever grows: it takes on
 * what the private archives in the backup folder know, newer sets included, and
 * is never replaced by them.
 * Usage: npm run db:restore -- backups/<file>.dump
 */

const MAX_OUTPUT = 1024 * 1024 * 1024;
const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown");

/** Lists the archive; fails on a truncated or corrupt one. */
function listArchive(file: string): string[] {
  const list = spawnSync("tar", ["-tzf", file], {
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
  });
  if (list.status !== 0) {
    throw new Error(`Archive ${file} is unreadable. Nothing was changed.`);
  }
  return list.stdout.split("\n");
}

function pgRestore(dump: Buffer, args: string[]): number | null {
  return spawnSync(
    "docker-compose",
    ["--env-file", ".env.local", "exec", "-T", "postgres", "pg_restore", ...args],
    { input: dump, maxBuffer: MAX_OUTPUT },
  ).status;
}

/** Copies only the ledger out of the archive; false when it holds none. */
function extractLedger(archive: string, into: string): boolean {
  const member = listArchive(archive).find(
    (name) => name.replace(/^\.\//, "") === ERASURE_LEDGER_FILE,
  );
  if (!member) return false;
  const tar = spawnSync("tar", ["-xzf", archive, "-C", into, member]);
  if (tar.status !== 0) {
    throw new Error(`Archive ${archive} is unreadable. Nothing was changed.`);
  }
  return true;
}

/**
 * Brings what every private archive in the folder knows into the live ledger:
 * after ledger loss, an older set must still honour erasures listed in newer
 * ones. Only `required` (the set being restored) may stop the restore; any other
 * unreadable archive is skipped. A live-side failure always stops it.
 */
async function mergeArchivedLedgers(
  dir: string,
  required: string | undefined,
  url: string,
  privateRoot: string,
): Promise<{ tornLines: number; skipped: number }> {
  const totals = { tornLines: 0, skipped: 0 };
  const { db, close } = connect(url, { max: 1 });
  try {
    for (const name of readdirSync(dir).sort()) {
      if (!/^private_.*\.tar\.gz$/.test(name)) continue;
      const archive = `${dir}/${name}`;
      const temp = mkdtempSync(join(tmpdir(), "mv-archived-ledger-"));
      try {
        let found: boolean;
        try {
          found = extractLedger(archive, temp);
          await readErasureLedger(temp);
        } catch (error) {
          if (archive === required) throw error;
          totals.skipped += 1;
          continue;
        }
        if (found) {
          totals.tornLines += (await mergeErasureLedger(db, privateRoot, temp)).tornLines;
        }
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    }
  } finally {
    await close();
  }
  return totals;
}

function unpack(file: string, root: string): void {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  // The archive's ledger was merged before and must not replace the live one.
  const tar = spawnSync("tar", [
    `--exclude=${ERASURE_LEDGER_FILE}`,
    "-xzf",
    file,
    "-C",
    root,
  ]);
  if (tar.status !== 0) throw new Error(tar.stderr.toString());
}

async function main(): Promise<void> {
  const dumpFile = process.argv[2];
  if (!dumpFile || !dumpFile.endsWith(".dump") || !existsSync(dumpFile)) {
    throw new Error("Usage: npm run db:restore -- backups/<database>_<stamp>.dump");
  }

  const url = new URL(assertLocalDatabase(process.env.DATABASE_URL));
  const database = url.pathname.slice(1);
  const privateRoot = process.env.PRIVATE_STORAGE_ROOT ?? "storage/private";

  // Everything that can be checked is checked before anything is replaced.
  let { tornLines } = await readErasureLedger(privateRoot);

  const stamp = dumpFile.match(/_(\d{8}-\d{6})\.dump$/)?.[1];
  const dir = dirname(dumpFile);
  const archives = (
    stamp
      ? [
          {
            root: process.env.MEDIA_ROOT ?? "storage/media",
            file: `${dir}/media_${stamp}.tar.gz`,
          },
          { root: privateRoot, file: `${dir}/private_${stamp}.tar.gz` },
        ]
      : []
  ).filter(({ file }) => existsSync(file));
  for (const { file } of archives) listArchive(file);

  const dump = readFileSync(dumpFile);
  if (pgRestore(dump, ["--list"]) !== 0) {
    throw new Error(`Backup ${dumpFile} is unreadable. Nothing was changed.`);
  }

  const merged = await mergeArchivedLedgers(
    dir,
    archives.find(({ root }) => root === privateRoot)?.file,
    url.href,
    privateRoot,
  );
  tornLines += merged.tornLines;

  // From here on the database may be replaced: whatever goes wrong, the ledger
  // is applied before this script ends, and the first error is the one reported.
  let replaceError: unknown;
  const restored = [dumpFile];
  try {
    // Not pg_restore --clean: it leaves tables the backup does not know, and the
    // migrations below must start from exactly the dumped state.
    await emptyLocalDatabase(url.href);
    const status = pgRestore(dump, [
      "--no-owner",
      "-U",
      decodeURIComponent(url.username),
      "-d",
      database,
    ]);
    // Exit code only: pg_restore's messages can quote the rows it was loading.
    if (status !== 0) throw new Error(`pg_restore failed with exit code ${status}`);
    for (const { root, file } of archives) {
      unpack(file, root);
      restored.push(file);
    }
    // A backup can predate newer migrations; retention needs the current schema.
    await runMigrations(url.href);
  } catch (error) {
    replaceError = error;
  }

  const { db, close } = connect(url.href, { max: 1 });
  try {
    let erasures: Awaited<ReturnType<typeof applyErasureLedger>>;
    try {
      erasures = await applyErasureLedger(db, privateRoot);
    } catch (error) {
      console.error(
        `CRITICAL: the erasure ledger could NOT be re-applied (${errorName(error)}). Erased inquiries may be live again: keep the site offline and restore again.`,
      );
      throw replaceError ?? new Error("Restore failed");
    }
    console.log(
      `erasures: ${erasures.entries} ledger entries, ${erasures.inquiries} inquiries erased again`,
    );
    if (tornLines > 0) {
      console.log(`ledger: incomplete final lines ignored: ${tornLines}`);
    }
    if (merged.skipped > 0) {
      console.log(`ledger: unreadable private archives skipped: ${merged.skipped}`);
    }
    if (replaceError) throw replaceError;

    const retention = await applyRetention(db, privateRoot);
    console.log(`restored ${database} from ${restored.join(" + ")}`);
    console.log(
      `retention: ${retention.purged} expired inquiries deleted, ${retention.orphans} orphan folders removed, ${retention.authRows} login records deleted`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Restore failed");
  console.error(
    "Restore stopped. If the database was already replaced, expired data may be present: fix the cause and restore again.",
  );
  process.exitCode = 1;
});
